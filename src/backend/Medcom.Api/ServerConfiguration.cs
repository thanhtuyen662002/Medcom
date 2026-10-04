using Microsoft.Data.SqlClient;

namespace Medcom.Api;

public static class ServerConfiguration
{
    public const string DefaultPrivateConfigPath = @"D:\Config\appsettings.Private.json";
    public const string PrivateConfigPathKey = "Medcom:PrivateConfigPath";
    private const string PrivateConfigurationError = "Private server configuration could not be loaded.";
    private const string ConnectionConfigurationError = "A valid encrypted SQL Server connection is required.";

    public static string DefaultLocationConfigPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        "Medcom", "backend", "config-location.json");

    // Optional injected paths allow isolated configuration checks without touching server files.
    public static void LoadPrivateConfiguration(ConfigurationManager configuration, string contentRootPath,
        string[] args, string? locationConfigPath = null, string? defaultPrivateConfigPath = null)
    {
        try
        {
            var configuredPath = configuration[PrivateConfigPathKey];
            string? selectedPath = null;
            if (configuredPath is null)
            {
                var locationPath = ValidateExternalPath(locationConfigPath ?? DefaultLocationConfigPath, contentRootPath);
                if (File.Exists(locationPath))
                {
                    using var location = ReadJson(locationPath);
                    selectedPath = location[PrivateConfigPathKey];
                    if (string.IsNullOrWhiteSpace(selectedPath)) throw new InvalidOperationException();
                }
            }

            var explicitPath = configuredPath is not null || selectedPath is not null;
            var privatePath = configuredPath ?? selectedPath ?? defaultPrivateConfigPath ?? DefaultPrivateConfigPath;
            // The Windows deployment default is optional on other foundation/test hosts.
            if (!OperatingSystem.IsWindows() && !explicitPath && defaultPrivateConfigPath is null
                && !File.Exists(privatePath)) return;
            privatePath = ValidateExternalPath(privatePath, contentRootPath);
            if (!File.Exists(privatePath))
            {
                if (explicitPath) throw new InvalidOperationException();
                return;
            }

            using var settings = ReadJson(privatePath);
            configuration.AddInMemoryCollection(settings.AsEnumerable());
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                [PrivateConfigPathKey] = privatePath
            });
            // Private settings override public appsettings; process configuration remains authoritative.
            configuration.AddEnvironmentVariables();
            if (args.Length > 0) configuration.AddCommandLine(args);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException
            or FormatException or ArgumentException or InvalidOperationException or NotSupportedException
            or System.Security.SecurityException or System.Text.Json.JsonException)
        {
            // No inner exception: JSON/parser/path diagnostics can contain private values.
            throw new InvalidOperationException(PrivateConfigurationError);
        }
    }

    public static string ResolveConnectionString(IConfiguration configuration)
    {
        try
        {
            var current = configuration.GetConnectionString("Medcom");
            var legacy = configuration["Legacy:ConnectionString"];
            var hasCurrent = !string.IsNullOrWhiteSpace(current);
            var hasLegacy = !string.IsNullOrWhiteSpace(legacy);
            if (!hasCurrent && !hasLegacy) throw new InvalidOperationException();
            var connection = new SqlConnectionStringBuilder(hasCurrent ? current : legacy);
            if (hasCurrent && hasLegacy && !connection.EquivalentTo(new SqlConnectionStringBuilder(legacy)))
                throw new InvalidOperationException();
            if (string.IsNullOrWhiteSpace(connection.DataSource)
                || connection.DataSource.Contains("(localdb)", StringComparison.OrdinalIgnoreCase)
                || connection.ShouldSerialize("User Instance") || connection.ShouldSerialize("AttachDBFilename")
                || string.IsNullOrWhiteSpace(connection.InitialCatalog)
                || connection.InitialCatalog.Equals("master", StringComparison.OrdinalIgnoreCase)
                || connection.Encrypt == SqlConnectionEncryptOption.Optional || connection.TrustServerCertificate)
                throw new InvalidOperationException();
            connection.PersistSecurityInfo = false;
            return connection.ConnectionString;
        }
        catch (Exception exception) when (exception is ArgumentException or InvalidOperationException
            or FormatException or NotSupportedException)
        {
            throw new InvalidOperationException(ConnectionConfigurationError);
        }
    }

    private static ConfigurationRoot ReadJson(string path)
    {
        using var stream = File.OpenRead(path);
        return (ConfigurationRoot)new ConfigurationBuilder().AddJsonStream(stream).Build();
    }

    private static string ValidateExternalPath(string path, string contentRootPath)
    {
        if (!Path.IsPathFullyQualified(path)) throw new InvalidOperationException();
        var fullPath = Path.GetFullPath(path);
        if (OperatingSystem.IsWindows()
            && (fullPath.Length < 3 || !char.IsAsciiLetter(fullPath[0]) || fullPath[1] != ':'
                || fullPath[2] != Path.DirectorySeparatorChar || fullPath.AsSpan(2).Contains(':')
                || fullPath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                    .Any(segment => segment.EndsWith('.') || segment.EndsWith(' '))))
            throw new InvalidOperationException();
        var contentRoot = Path.GetFullPath(contentRootPath);
        if (IsWithin(fullPath, contentRoot)) throw new InvalidOperationException();
        foreach (var anchor in new[] { contentRoot, Environment.CurrentDirectory, AppContext.BaseDirectory })
        {
            for (var directory = new DirectoryInfo(anchor); directory is not null; directory = directory.Parent)
            {
                if ((Directory.Exists(Path.Combine(directory.FullName, ".git"))
                    || File.Exists(Path.Combine(directory.FullName, ".git"))) && IsWithin(fullPath, directory.FullName))
                    throw new InvalidOperationException();
            }
        }
        // Reject junction/symlink traversal that could serve a private file through the content root.
        for (var candidate = fullPath; candidate is not null; candidate = Path.GetDirectoryName(candidate))
        {
            if ((File.Exists(candidate) || Directory.Exists(candidate))
                && (File.GetAttributes(candidate) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException();
        }
        return fullPath;
    }

    private static bool IsWithin(string path, string directory)
    {
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        var root = Path.TrimEndingDirectorySeparator(directory);
        var prefix = Path.EndsInDirectorySeparator(root) ? root : root + Path.DirectorySeparatorChar;
        return path.Equals(root, comparison)
            || path.StartsWith(prefix, comparison);
    }
}
