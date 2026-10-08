using System.Data;
using System.Text.Json;
using Medcom.Infrastructure.Configuration;
using Microsoft.Data.SqlClient;

namespace Medcom.Api;

// One-shot CLI, environment-only connection, fixed metadata SQL, technical-only
// output. This does not load the Web host or grant permission to a business command.
public static class ErpConfigurationProbe
{
    public const string Switch = "--probe-erp-configuration";
    public static bool IsRequested(string[] args) => args.Contains(Switch, StringComparer.Ordinal);
    internal sealed record Target(string Area, string Menu, string Form);
    internal sealed record Fingerprint(long? Bytes, string? Sha256, string State);
    internal sealed record SourceObjectReference(string Schema, string Name, string Type);
    internal sealed record Mapping(IReadOnlyDictionary<string,string?> Identifiers,
        IReadOnlyDictionary<string,bool?> Flags, IReadOnlyDictionary<string,Fingerprint> Fingerprints,
        bool ProjectionValid, string? RecognizedSourceTable, string SourceReferenceState,
        SourceObjectReference? SourceObject);
    internal sealed record ColumnDiagnostic(string Column, string? ObservedType, int? ObservedLength,
        bool? ObservedNullable, bool? ObservedIdentity, bool? ObservedComputed, bool? CustomType);
    internal sealed record Group(string Id, string State, IReadOnlyList<Mapping> Rows,
        IReadOnlyList<ColumnDiagnostic>? ShapeMismatches = null);
    internal sealed class ShapeMismatchException(IReadOnlyList<ColumnDiagnostic> columns) : Exception
    { internal IReadOnlyList<ColumnDiagnostic> Columns { get; } = columns; }
    internal sealed record Report(int SchemaVersion, string Area, string State, bool ReadOnly,
        bool RuntimeAccepted, bool MappingComplete, bool InheritanceResolved, IReadOnlyList<Group> Groups, string Code);
    internal interface ISession : IAsyncDisposable
    {
        Task OpenAsync(string connectionString, CancellationToken token);
        Task<IReadOnlyList<object?[]>> ReadAsync(ErpConfigurationProbeSql.Plan plan,
            string menu, string form, CancellationToken token);
    }

    public static async Task<int> RunAsync(string[] args, TextWriter output)
    {
        if (args.Length != 2 || args[0] != Switch || args[1] is not ("purchase" or "inbound"))
            return await Write(output, Failure("unknown", "invalid_arguments"), 2);
        try
        {
            using var configuration = new ConfigurationManager();
            configuration.AddEnvironmentVariables();
            return await RunCoreAsync(args[1], configuration, output, () => new SqlSession());
        }
        catch (Exception) { return await Write(output, Failure(args[1], "configuration_unavailable"), 3); }
    }

    internal static async Task<int> RunCoreAsync(string area, IConfiguration configuration,
        TextWriter output, Func<ISession> createSession)
    {
        var target = area switch
        {
            "purchase" => new Target(area, "05011", "AP_PurposeRequestListFrm"),
            "inbound" => new Target(area, "07011", "IV_InboundRequestFrm"),
            _ => null
        };
        if (target is null) return await Write(output, Failure("unknown", "invalid_arguments"), 2);
        var groups = new List<Group>();
        var stage = "configuration_unavailable";
        try
        {
            var settings = new SqlConnectionStringBuilder(ServerConfiguration.ResolveConnectionString(configuration));
            if (settings.IntegratedSecurity || settings.Authentication is not
                (SqlAuthenticationMethod.NotSpecified or SqlAuthenticationMethod.SqlPassword)
                || string.IsNullOrWhiteSpace(settings.UserID) || string.IsNullOrWhiteSpace(settings.Password)
                || settings.Password == "REPLACE_PASSWORD_HERE")
                return await Write(output, Failure(area, "sql_password_required"), 2);
            settings.ConnectTimeout = 10; settings.ConnectRetryCount = 0; settings.Pooling = false;
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
            await using (var session = createSession())
            {
                stage = "connection_unavailable";
                await session.OpenAsync(settings.ConnectionString, timeout.Token);
                foreach (var plan in ErpConfigurationProbeSql.Plans)
                {
                    timeout.Token.ThrowIfCancellationRequested();
                    try
                    {
                        var rows = await session.ReadAsync(plan, target.Menu, target.Form, timeout.Token);
                        groups.Add(Project(plan, rows, target));
                    }
                    catch (ShapeMismatchException mismatch) { groups.Add(new(plan.Id, "shape_mismatch", [], mismatch.Columns)); }
                    catch (OperationCanceledException) { throw; }
                    catch (Exception) { groups.Add(new(plan.Id, "unavailable", [])); }
                }
                stage = "cleanup_failed";
            }
        }
        catch (OperationCanceledException) { return await Write(output, Failure(area, "timeout"), 3); }
        catch (Exception) { return await Write(output, Failure(area, stage), 3); }
        // These are separate point-in-time SELECT observations, not a transactionally
        // consistent graph or a proof that inherited form configuration was resolved.
        var partial = groups.Any(group => group.State != "observed" || group.Rows.Any(row => !row.ProjectionValid));
        return await Write(output, new(1, area, partial ? "partial" : "observed_unresolved", true, false, false, false,
            groups, "configuration_only_not_write_acceptance"), partial ? 3 : 0);
    }

    internal static Group Project(ErpConfigurationProbeSql.Plan plan, IReadOnlyList<object?[]> rows, Target target)
    {
        if (rows.Count > ErpConfigurationProbeSql.MaximumRows) return new(plan.Id, "truncated", []);
        if (rows.Count == 0) return new(plan.Id, "missing", []);
        if ((plan.Id is "menu" or "form") && rows.Count != 1) return new(plan.Id, "ambiguous", []);
        var width = plan.Identifiers.Count + plan.Flags.Count + 2 * plan.Fingerprints.Count + (plan.HasSource ? 3 : 0);
        var mapped = new List<Mapping>();
        var bindingMismatch = false;
        foreach (var row in rows)
        {
            if (row.Length != width) return new(plan.Id, "malformed", []);
            var identifiers = new SortedDictionary<string,string?>(StringComparer.Ordinal);
            var flags = new SortedDictionary<string,bool?>(StringComparer.Ordinal);
            var fingerprints = new SortedDictionary<string,Fingerprint>(StringComparer.Ordinal);
            var complete = true; var index = 0;
            foreach (var name in plan.Identifiers)
            {
                var value = row[index++];
                if (value is null or DBNull) { identifiers.Add(name, null); continue; }
                if (value is not string text) return new(plan.Id, "malformed", []);
                if (!Identifier(text)) { identifiers.Add(name, null); complete = false; }
                else identifiers.Add(name, text);
            }
            var selector = plan.Id == "menu" ? "MenuID" : plan.Id == "configuration" ? "FID" : "FormID";
            var expected = plan.Id == "menu" ? target.Menu : target.Form;
            // MenuID is a numeric technical key; other identifiers obey the same closed alphabet.
            if (!identifiers.TryGetValue(selector, out var actual) || actual != expected)
                return new(plan.Id, "scope_mismatch", []);
            if (plan.Id == "menu" && identifiers["FormName"] != target.Form)
                bindingMismatch = true; // Show a safe observed technical name, but never follow it as SQL scope.
            foreach (var name in plan.Flags)
            {
                var value = row[index++];
                if (value is null or DBNull) flags.Add(name, null);
                else if (value is bool flag) flags.Add(name, flag);
                else return new(plan.Id, "malformed", []);
            }
            foreach (var name in plan.Fingerprints)
            {
                var bytes = row[index++]; var hash = row[index++];
                if (bytes is null or DBNull)
                {
                    if (hash is not (null or DBNull)) return new(plan.Id, "malformed", []);
                    fingerprints.Add(name, new(null, null, "null"));
                }
                else if (bytes is long length && length >= 0)
                {
                    if (length > ErpConfigurationProbeSql.MaximumBodyBytes)
                    {
                        if (hash is not (null or DBNull)) return new(plan.Id, "malformed", []);
                        fingerprints.Add(name, new(length, null, "oversized")); complete = false;
                    }
                    else if (hash is string digest && digest.Length == 64 && digest.All(Uri.IsHexDigit))
                        fingerprints.Add(name, new(length, digest.ToUpperInvariant(), "fingerprinted"));
                    else return new(plan.Id, "malformed", []);
                }
                else return new(plan.Id, "malformed", []);
            }
            // Exact historical source fingerprints recognize only these two known
            // dropdown query bodies. An unknown fingerprint has no inferred target.
            string? sourceTable = null;
            if (plan.Id == "dropdowns" && target.Area == "purchase" && fingerprints.TryGetValue("Source", out var source))
                sourceTable = source.Sha256 switch
                {
                    "83B4D2F350A6DC45B9840BC7AC4ED14AAE86106088210A6846FCE8ACE0003125" => "dbo.AP_PurposePurchaseTbl",
                    "9401708F1504420CA7A3F16DFEE1A5E4DE8D80D038519F94B4B9645B6DDAF534" => "dbo.CF_CurrencyTbl",
                    _ => null
                };
            SourceObjectReference? sourceObject = null;
            if (plan.HasSource)
            {
                var schema = row[index++]; var name = row[index++]; var type = row[index++];
                if (schema is null or DBNull && name is null or DBNull && type is null or DBNull) { }
                else if (schema is string schemaName && name is string objectName && type is string objectType
                    && ObjectPart(schemaName) && ObjectPart(objectName)
                    && objectType is "U" or "V" or "P" or "PC" or "FN" or "IF" or "TF" or "FS" or "FT")
                    sourceObject = new(schemaName, objectName, objectType);
                else return new(plan.Id, "malformed", []);
            }
            mapped.Add(new(identifiers, flags, fingerprints, complete, sourceTable,
                !plan.HasSource ? "not_applicable" : sourceObject is null ? "unresolved" : "resolved_identifier", sourceObject));
        }
        // No arbitrary first-row selection. Repeated projected records remain visible,
        // and deterministic sorting stabilizes reports without altering SQL semantics.
        return new(plan.Id, bindingMismatch ? "binding_mismatch" : "observed", mapped.OrderBy(row => JsonSerializer.Serialize(row), StringComparer.Ordinal).ToArray());
    }

    private static bool ObjectPart(string value) => value.Length is > 0 and <= 128
        && (char.IsAsciiLetter(value[0]) || value[0] == '_')
        && value.All(character => char.IsAsciiLetterOrDigit(character) || character == '_');
    private static bool Identifier(string value) => value.Length is > 0 and <= 250
        && value.Split('.').All(part => part.Length > 0
            && part.All(character => char.IsAsciiLetterOrDigit(character) || character is '_' or '$'));
    private static Report Failure(string area, string code) => new(1, area, "unavailable", true, false, false, false, [], code);
    private static async Task<int> Write(TextWriter output, Report report, int exitCode)
    {
        try
        {
            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            var json = JsonSerializer.Serialize(report, options);
            if (System.Text.Encoding.UTF8.GetByteCount(json) > 2_000_000)
            { json = JsonSerializer.Serialize(Failure(report.Area, "output_limit"), options); exitCode = 3; }
            await output.WriteLineAsync(json); return exitCode;
        }
        catch (Exception) { return 4; }
    }

    private sealed class SqlSession : ISession
    {
        private SqlConnection? connection;
        public async Task OpenAsync(string connectionString, CancellationToken token)
        { connection = new(connectionString); await connection.OpenAsync(token); }
        public async Task<IReadOnlyList<object?[]>> ReadAsync(ErpConfigurationProbeSql.Plan plan,
            string menu, string form, CancellationToken token)
        {
            await using (var shape = connection!.CreateCommand())
            {
                shape.CommandText = plan.ShapeText; shape.CommandType = CommandType.Text; shape.CommandTimeout = 5;
                await using var metadata = await shape.ExecuteReaderAsync(token);
                if (metadata.FieldCount != 1 || metadata.GetName(0) != "ShapeOk"
                    || !await metadata.ReadAsync(token) || metadata.GetValue(0) is not int accepted || accepted is not (0 or 1)
                    || await metadata.ReadAsync(token) || await metadata.NextResultAsync(token))
                    throw new InvalidOperationException();
                if (accepted == 0)
                {
                    await metadata.DisposeAsync();
                    throw new ShapeMismatchException(await ReadShapeDiagnostics(plan, token));
                }
            }
            await using var command = connection.CreateCommand();
            command.CommandText = plan.Text; command.CommandType = CommandType.Text; command.CommandTimeout = 5;
            command.Parameters.Add("@menu", SqlDbType.NVarChar, 50).Value = menu;
            command.Parameters.Add("@form", SqlDbType.NVarChar, 250).Value = form;
            await using var reader = await command.ExecuteReaderAsync(token);
            var names = plan.Identifiers.Concat(plan.Flags).Concat(plan.Fingerprints.SelectMany(name => new[] { name + "Bytes", name + "Sha256" }))
                .Concat(plan.HasSource ? new[] { "SourceSchema", "SourceObject", "SourceObjectType" } : []).ToArray();
            if (reader.FieldCount != names.Length || names.Where((name, index) => reader.GetName(index) != name).Any())
                throw new InvalidOperationException();
            var rows = new List<object?[]>();
            while (await reader.ReadAsync(token))
            {
                if (rows.Count >= ErpConfigurationProbeSql.MaximumRows + 1) throw new InvalidOperationException();
                var values = new object[reader.FieldCount]; reader.GetValues(values); rows.Add(values);
            }
            if (await reader.NextResultAsync(token)) throw new InvalidOperationException();
            return rows;
        }
        private async Task<IReadOnlyList<ColumnDiagnostic>> ReadShapeDiagnostics(ErpConfigurationProbeSql.Plan plan, CancellationToken token)
        {
            await using var command = connection!.CreateCommand();
            command.CommandText = plan.ShapeDiagnosticsText; command.CommandType = CommandType.Text; command.CommandTimeout = 5;
            await using var reader = await command.ExecuteReaderAsync(token);
            string[] names = ["ColumnName", "ObservedType", "ObservedLength", "ObservedNullable", "ObservedIdentity", "ObservedComputed", "CustomType"];
            if (reader.FieldCount != names.Length || names.Where((name, index) => reader.GetName(index) != name).Any()) throw new InvalidOperationException();
            var allowed = plan.Identifiers.Concat(plan.Flags).Concat(plan.Fingerprints).ToHashSet(StringComparer.Ordinal);
            var result = new List<ColumnDiagnostic>();
            while (await reader.ReadAsync(token))
            {
                if (result.Count >= 64 || reader.GetValue(0) is not string column || !allowed.Remove(column)) throw new InvalidOperationException();
                var type = reader.IsDBNull(1) ? null : reader.GetValue(1) is string value && ObjectPart(value) ? value : throw new InvalidOperationException();
                int? length = reader.IsDBNull(2) ? null : reader.GetValue(2) is int number && number >= -1 && number <= 32767 ? number : throw new InvalidOperationException();
                bool? Flag(int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetValue(ordinal) is bool flag ? flag : throw new InvalidOperationException();
                result.Add(new(column, type, length, Flag(3), Flag(4), Flag(5), Flag(6)));
            }
            if (result.Count == 0 || await reader.NextResultAsync(token)) throw new InvalidOperationException();
            return result;
        }
        public async ValueTask DisposeAsync() { if (connection is not null) await connection.DisposeAsync(); }
    }
}
