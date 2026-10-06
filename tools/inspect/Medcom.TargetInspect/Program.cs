using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Medcom.Api;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace Medcom.TargetInspect;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--help")
        {
            Console.WriteLine("dotnet Medcom.TargetInspect.dll inspect --config <absolute private JSON path> [--options <absolute options JSON path>] [--allow-development-sql-tls]");
            return 0;
        }
        var report = new InspectionReport();
        report.AddUnexercised();
        report.PrepareDatabaseChecks();
        var stage = "arguments";
        try
        {
            var invocation = ParseArguments(args);
            report.Add(stage, InspectionStatus.PASS, "FIXED_INSPECT_MODE");
            stage = "package";
            ValidatePackage(AppContext.BaseDirectory, report);
            report.Add(stage, InspectionStatus.PASS, "INVENTORY_HASHES_VERIFIED");
            stage = "configuration";
            EnsureSafeEnvironment(System.Environment.GetEnvironmentVariables().Keys.Cast<string>());
            var (connectionString, expectedBinding) = ReadConfiguration(invocation.ConfigPath, invocation.OptionsPath,
                AppContext.BaseDirectory, invocation.AllowDevelopmentSqlTls);
            report.Add(stage, InspectionStatus.PASS, invocation.AllowDevelopmentSqlTls
                ? "EXPLICIT_FIXED_TARGET_DEVELOPMENT_TLS" : "CURRENT_POLICY_EXACT_TARGET");
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(60));
            // Only this executable entry point creates a real provider connection. CI calls the runner with doubles.
            await InspectionRunner.RunAsync(new SqlConnection(connectionString), expectedBinding, report, timeout.Token);
        }
        catch (Exception) { report.Add(stage, InspectionStatus.BLOCKED, "INPUT_OR_PACKAGE_REJECTED"); }
        Console.WriteLine(JsonSerializer.Serialize(report, new JsonSerializerOptions
        {
            WriteIndented = true, Converters = { new JsonStringEnumConverter() }
        }));
        // A metadata PASS never establishes runtime qualification. BLOCKED is intentionally nonzero.
        return report.Checks.Any(c => c.Status == InspectionStatus.FAIL) ? 1
            : report.Checks.Any(c => c.Status == InspectionStatus.BLOCKED) ? 2 : 0;
    }

    public static (string ConfigPath, string? OptionsPath, bool AllowDevelopmentSqlTls) ParseArguments(string[] args)
    {
        ArgumentNullException.ThrowIfNull(args);
        var optIn = args.Length > 0 && args[^1] == "--allow-development-sql-tls";
        var count = args.Length - (optIn ? 1 : 0);
        if ((count != 3 && count != 5) || args[0] != "inspect" || args[1] != "--config"
            || string.IsNullOrWhiteSpace(args[2]) || args[2].StartsWith("--", StringComparison.Ordinal)
            || (count == 5 && (args[3] != "--options" || string.IsNullOrWhiteSpace(args[4])
                || args[4].StartsWith("--", StringComparison.Ordinal)))) throw new InvalidOperationException();
        return (args[2], count == 5 ? args[4] : null, optIn);
    }

    public static void EnsureSafeEnvironment(IEnumerable<string> names)
    {
        foreach (var name in names)
        {
            var normalized = name.Replace("__", ":", StringComparison.Ordinal);
            // LoadPrivateConfiguration intentionally honors environment configuration; reject it here
            // before loading, instead of allowing an inherited process to change this fixed inspection target.
            if (normalized.StartsWith("ConnectionStrings:", StringComparison.OrdinalIgnoreCase)
                || normalized.StartsWith("Medcom:", StringComparison.OrdinalIgnoreCase)
                || normalized.StartsWith("Legacy:", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("SQLCONNSTR_Medcom", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("SQLAZURECONNSTR_Medcom", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("CUSTOMCONNSTR_Medcom", StringComparison.OrdinalIgnoreCase)
                || normalized.Equals("MYSQLCONNSTR_Medcom", StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException();
        }
    }

    public static (string ConnectionString, Guid? ExpectedBinding) ReadConfiguration(string configPath, string? optionsPath, string contentRoot,
        bool allowDevelopmentSqlTls = false)
    {
        EnsureSafeEnvironment(System.Environment.GetEnvironmentVariables().Keys.Cast<string>());
        RequirePrivateInput(configPath, contentRoot);
        using var configuration = new ConfigurationManager();
        configuration.AddInMemoryCollection(new Dictionary<string, string?> { [ServerConfiguration.PrivateConfigPathKey] = configPath });
        ServerConfiguration.LoadPrivateConfiguration(configuration, contentRoot, []);
        if (allowDevelopmentSqlTls)
        {
            // The explicit invocation may fill an absent exception or repeat the identical enabled one.
            // It must not repair malformed settings, override an explicit disable or redirect permission.
            var section = configuration.GetSection("Medcom:SqlDevelopmentTestTls");
            var existing = section.GetChildren().ToArray();
            // GetSection.Value alone cannot distinguish absent from an explicit JSON null/{}.
            var sectionPresent = configuration.GetSection("Medcom").GetChildren()
                .Any(item => item.Key.Equals("SqlDevelopmentTestTls", StringComparison.OrdinalIgnoreCase));
            if (section.Value is not null || (sectionPresent &&
                (existing.Length != 3
                    || existing.Any(item => item.GetChildren().Any())
                    || !existing.Select(item => item.Key).ToHashSet(StringComparer.OrdinalIgnoreCase)
                        .SetEquals(["Enabled", "Server", "Database"])
                    || !bool.TryParse(section["Enabled"], out var enabled) || !enabled
                    || !string.Equals(section["Server"], InspectionRunner.ExpectedServer, StringComparison.Ordinal)
                    || !string.Equals(section["Database"], InspectionRunner.ExpectedDatabase, StringComparison.Ordinal))))
                throw new InvalidOperationException();
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Medcom:SqlDevelopmentTestTls:Enabled"] = "true",
                ["Medcom:SqlDevelopmentTestTls:Server"] = InspectionRunner.ExpectedServer,
                ["Medcom:SqlDevelopmentTestTls:Database"] = InspectionRunner.ExpectedDatabase
            });
        }
        var resolved = ServerConfiguration.ResolveConnectionString(configuration, out _);
        var connection = new SqlConnectionStringBuilder(resolved);
        if (!string.Equals(connection.DataSource, InspectionRunner.ExpectedServer, StringComparison.Ordinal)
            || !string.Equals(connection.InitialCatalog, InspectionRunner.ExpectedDatabase, StringComparison.Ordinal)
            || !string.IsNullOrWhiteSpace(connection.FailoverPartner)
            || connection.ApplicationIntent != ApplicationIntent.ReadWrite
            || !string.IsNullOrWhiteSpace(connection.AttachDBFilename) || connection.UserInstance)
            throw new InvalidOperationException();
        // Only the unchanged shared policy applies the fixed development exception from existing
        // settings or the explicit invocation. No persisted configuration or certificate is changed.
        // Strict remains Strict when neither exception source applies.
        connection.ConnectTimeout = 5; connection.PersistSecurityInfo = false;
        connection.Pooling = false; connection.Enlist = false;
        connection.ApplicationName = "Medcom.TargetInspect";
        Guid? binding = null;
        if (optionsPath is not null)
        {
            RequirePrivateInput(optionsPath, contentRoot);
            using var options = JsonDocument.Parse(File.ReadAllBytes(optionsPath));
            if (options.RootElement.ValueKind != JsonValueKind.Object) throw new InvalidOperationException();
            var properties = options.RootElement.EnumerateObject().ToArray();
            if (properties.Length > 1 || properties.Any(p => p.Name != "ExpectedBindingId")) throw new InvalidOperationException();
            if (properties.Length == 1)
            {
                var text = properties[0].Value.GetString();
                if (text is null || text.Length != 36 || !Guid.TryParseExact(text, "D", out var parsed) || parsed == Guid.Empty) throw new InvalidOperationException();
                binding = parsed;
            }
        }
        return (connection.ConnectionString, binding);
    }

    private static void RequirePrivateInput(string path, string contentRoot)
    {
        if (!Path.IsPathFullyQualified(path)) throw new InvalidOperationException();
        var full = Path.GetFullPath(path);
        var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(contentRoot));
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        if (full.Equals(root, comparison) || full.StartsWith(root + Path.DirectorySeparatorChar, comparison)) throw new InvalidOperationException();
        for (var anchor = new DirectoryInfo(Path.GetDirectoryName(full)!); anchor is not null; anchor = anchor.Parent)
            if (Directory.Exists(Path.Combine(anchor.FullName, ".git")) || File.Exists(Path.Combine(anchor.FullName, ".git"))) throw new InvalidOperationException();
        RequireRegularPath(full);
        if (!File.Exists(full) || new FileInfo(full).Length > 1024 * 1024) throw new InvalidOperationException();
    }

    public static void ValidatePackage(string directory, InspectionReport report)
    {
        var root = Path.GetFullPath(directory);
        RequireRegularPath(root);
        var manifestPath = Path.Combine(root, "manifest.json");
        RequireRegularPath(manifestPath);
        if (new FileInfo(manifestPath).Length > 1024 * 1024) throw new InvalidOperationException();
        using var document = JsonDocument.Parse(File.ReadAllBytes(manifestPath));
        var manifest = document.RootElement;
        var fields = manifest.EnumerateObject().Select(p => p.Name).ToArray();
        var expectedFields = new[] { "schemaVersion", "kind", "sourceRevision", "sourceTree", "linkedSources", "files", "releaseStillBlocked" };
        if (fields.Length != expectedFields.Length || !fields.ToHashSet(StringComparer.Ordinal).SetEquals(expectedFields)
            || manifest.GetProperty("schemaVersion").GetInt32() != 1 || manifest.GetProperty("kind").GetString() != "medcom-target-inspector"
            || !manifest.GetProperty("releaseStillBlocked").GetBoolean()) throw new InvalidOperationException();
        var revision = manifest.GetProperty("sourceRevision").GetString();
        var tree = manifest.GetProperty("sourceTree").GetString();
        if (!IsHex(revision, 40) || !IsHex(tree, 40)) throw new InvalidOperationException();
        var linked = manifest.GetProperty("linkedSources").EnumerateObject().ToArray();
        if (linked.Length != 2 || !linked.Select(p => p.Name).ToHashSet(StringComparer.Ordinal).SetEquals([
            "src/backend/Medcom.Api/ServerConfiguration.cs", "src/backend/Medcom.Infrastructure/SqlDevelopmentTestTlsTarget.cs"])
            || linked.Any(p => !IsHex(p.Value.GetString(), 64))) throw new InvalidOperationException();
        var files = manifest.GetProperty("files").EnumerateObject().ToArray();
        if (files.Length == 0 || files.Length > 1000) throw new InvalidOperationException();
        var expected = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in files)
        {
            var relative = item.Name;
            if (relative.Length == 0 || relative.Contains('\\') || relative.Contains(':') || relative.StartsWith('/')
                || relative.Split('/').Any(p => p is "" or "." or ".." || p.EndsWith('.') || p.EndsWith(' '))
                || relative.Equals("manifest.json", StringComparison.OrdinalIgnoreCase)
                || !expected.Add(relative) || !IsHex(item.Value.GetString(), 64)) throw new InvalidOperationException();
            var file = Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar));
            RequireRegularPath(file);
            if (!File.Exists(file) || new FileInfo(file).Length > 200 * 1024 * 1024) throw new InvalidOperationException();
            using var stream = File.OpenRead(file);
            var actual = Convert.ToHexStringLower(SHA256.HashData(stream));
            if (!string.Equals(actual, item.Value.GetString(), StringComparison.Ordinal)) throw new InvalidOperationException();
        }
        foreach (var required in new[] { "Medcom.TargetInspect.dll", "Medcom.TargetInspect.deps.json", "Medcom.TargetInspect.runtimeconfig.json", "README.md" })
            if (!expected.Contains(required)) throw new InvalidOperationException();
        // Traverse explicitly, checking each directory before descending into it.
        var pending = new Stack<string>(); pending.Push(root);
        var entryCount = 0;
        var observed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        while (pending.Count > 0)
        {
            foreach (var entry in Directory.EnumerateFileSystemEntries(pending.Pop()))
            {
                if (++entryCount > 2000) throw new InvalidOperationException();
                RequireRegularPath(entry);
                if (Directory.Exists(entry)) { pending.Push(entry); continue; }
                var relative = Path.GetRelativePath(root, entry).Replace(Path.DirectorySeparatorChar, '/');
                if (relative.Equals("manifest.json", StringComparison.Ordinal)) continue;
                if (!expected.Contains(relative) || !observed.Add(relative)) throw new InvalidOperationException();
            }
        }
        if (!observed.SetEquals(expected)) throw new InvalidOperationException();
        report.SourceRevision = revision; report.SourceTree = tree;
    }

    private static bool IsHex(string? value, int length) => value is not null && value.Length == length && value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
    private static void RequireRegularPath(string path)
    {
        for (var current = Path.GetFullPath(path); current is not null; current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException();
    }
}
