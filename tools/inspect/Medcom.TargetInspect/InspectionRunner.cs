using System.Data;
using System.Data.Common;

namespace Medcom.TargetInspect;

public static class InspectionRunner
{
    public const string ExpectedDatabase = "MedData";
    public const string ExpectedServer = "zmc.bms79.com,17456";
    // Deliberately conservative lexical equality, NOT a SQL equivalence engine.
    // Unknown server-normalized predicates remain BLOCKED; no predicate is inferred from its name.
    public static readonly IReadOnlyDictionary<string, string> ExpectedDefinitions = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        ["CK_MedcomPurchaseRequestCommandSchema"] = "(SingletonId=1 AND SchemaVersion=1)",
        ["CK_MedcomPurchaseRequestCommandJournal"] = "(DATALENGTH(KeyBytes) BETWEEN 1 AND 4096 AND DATALENGTH(IntentBytes) BETWEEN 1 AND 1048576 AND ((State=0 AND DocumentId IS NULL AND ReceiptJson IS NULL AND AggregateBytes IS NULL) OR (State=1 AND DocumentId IS NOT NULL AND ReceiptJson IS NOT NULL AND AggregateBytes IS NOT NULL)))",
        ["CK_WebInboundJournal_Action"] = "(Action IN ('Create','Save','SendToWarehouse'))",
        ["CK_WebInboundJournal_State"] = "((State=0 AND BeforeState IS NULL AND AfterState IS NULL AND StatusAfter IS NULL AND AuditId IS NULL AND CommittedAtUtc IS NULL) OR (State=1 AND BranchId IS NOT NULL AND DocumentId IS NOT NULL AND BeforeState IS NOT NULL AND AfterState IS NOT NULL AND StatusAfter IN (0,1,2) AND AuditId IS NOT NULL AND CommittedAtUtc IS NOT NULL))"
    };

    public static async Task RunAsync(DbConnection connection, Guid? expectedBinding, InspectionReport report, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(report);
        report.PrepareDatabaseChecks();
        var stage = "connection";
        try
        {
            if (expectedBinding == Guid.Empty) throw new InvalidOperationException();
            cancellationToken.ThrowIfCancellationRequested();
            await connection.OpenAsync(cancellationToken);
            report.Add(stage, InspectionStatus.PASS, "OPENED");
            stage = "target.environment";
            var environment = await ReadAsync(connection, InspectionSql.Environment,
                ("@database", DbType.String, ExpectedDatabase), cancellationToken);
            if (environment.Count != 1 || environment[0].Length != 6) throw new InvalidOperationException();
            var values = environment[0].Select(ReadInt).ToArray();
            if (values[0] != 1 || values[1] != 0 || values[2] != 1)
            {
                report.Add(stage, InspectionStatus.FAIL, "TARGET_OR_TRANSACTION_MISMATCH");
                AddCatalogNotRun(report); return;
            }
            report.Add(stage, InspectionStatus.PASS, "EXACT_DATABASE_NO_TRANSACTION");
            report.Add("database.durability_settings", values[3] == 1 ? InspectionStatus.PASS : InspectionStatus.FAIL,
                values[3] == 1 ? "ONLINE_WRITABLE_DELAYED_DURABILITY_OFF" : "DURABILITY_SETTINGS_MISMATCH");
            if (values[4] != 1)
            {
                report.Add("catalog.visibility", InspectionStatus.BLOCKED, "COMPLETE_METADATA_VISIBILITY_UNPROVED");
                AddCatalogNotRun(report); return;
            }
            report.Add("catalog.visibility", InspectionStatus.PASS, "DATABASE_METADATA_VISIBLE");
            stage = "catalog.columns";
            var columns = await ReadTableStatuses(connection, InspectionSql.Columns, stage, report, cancellationToken);
            stage = "catalog.keys";
            await ReadTableStatuses(connection, InspectionSql.Keys, stage, report, cancellationToken);
            stage = "catalog.triggers_security";
            await ReadTableStatuses(connection, InspectionSql.Safety, stage, report, cancellationToken);
            stage = "purchase.foreign_key";
            AddStatus(report, stage, await ScalarStatus(connection, InspectionSql.PurchaseForeignKey, cancellationToken));
            stage = "catalog.check_definitions";
            var definitions = await ReadAsync(connection, InspectionSql.Definitions, null, cancellationToken);
            ValidateNamedRows(definitions, ExpectedDefinitions.Keys, 3);
            foreach (var row in definitions)
            {
                var id = (string)row[0];
                var state = ReadInt(row[2]);
                if (state != 0) { AddStatus(report, "check." + id, state); continue; }
                if (row[1] is not string definition || definition.Length > 16384)
                    report.Add("check." + id, InspectionStatus.BLOCKED, "DEFINITION_UNAVAILABLE");
                else if (NormalizeDefinition(definition) == NormalizeDefinition(ExpectedDefinitions[id]))
                    report.Add("check." + id, InspectionStatus.PASS, "EXACT_RECOGNIZED_PREDICATE");
                else report.Add("check." + id, InspectionStatus.BLOCKED, "PREDICATE_EQUIVALENCE_UNPROVED");
            }
            stage = "catalog.defaults";
            var defaults = await ReadAsync(connection, InspectionSql.Defaults, null, cancellationToken);
            ValidateNamedRows(defaults, ["WebInboundRequestCommandJournalV1.CreatedAtUtc", "IV_InboundRequestLogTbl.UserAutoID", "IV_InboundRequestLogTbl.ThoiGian"], 3);
            foreach (var row in defaults)
            {
                var id = (string)row[0]; var state = ReadInt(row[2]);
                if (state != 0) { AddStatus(report, "default." + id, state); continue; }
                if (id == "WebInboundRequestCommandJournalV1.CreatedAtUtc" && row[1] is string definition
                    && NormalizeDefinition(definition) == "(sysutcdatetime())")
                    report.Add("default." + id, InspectionStatus.PASS, "EXACT_RECOGNIZED_DEFAULT");
                else report.Add("default." + id, InspectionStatus.BLOCKED, "DEFAULT_SEMANTICS_UNPROVED");
            }
            // Source catalogs establish column shapes, not complete native FK/check/default definitions.
            // Do not manufacture acceptance from presence or an incomplete source expectation.
            report.Add("inbound.native_constraint_semantics", InspectionStatus.BLOCKED, "SOURCE_EXPECTATION_UNAVAILABLE");
            report.Add("purchase.additional_constraint_semantics", InspectionStatus.BLOCKED, "SOURCE_EXPECTATION_UNAVAILABLE");
            stage = "database.binding";
            if (expectedBinding is null)
                report.Add(stage, InspectionStatus.BLOCKED, "EXPECTED_BINDING_NOT_SUPPLIED");
            else if (!columns.TryGetValue("MedcomPurchaseRequestCommandSchema", out var controlShape) || controlShape != 0)
                report.Add(stage, InspectionStatus.NOT_RUN, "CONTROL_SHAPE_NOT_ESTABLISHED");
            else
            {
                var binding = await ReadAsync(connection, InspectionSql.Binding, ("@binding", DbType.Guid, expectedBinding.Value), cancellationToken);
                if (binding.Count != 1 || binding[0].Length != 1) throw new InvalidOperationException();
                AddStatus(report, stage, ReadInt(binding[0][0]));
            }
            stage = "server.trigger_events";
            if (values[5] != 1) report.Add(stage, InspectionStatus.BLOCKED, "SERVER_METADATA_VISIBILITY_UNPROVED");
            else AddStatus(report, stage, await ScalarStatus(connection, InspectionSql.ServerTriggers, cancellationToken));
        }
        catch (OperationCanceledException) { report.Add(stage, InspectionStatus.BLOCKED, "CANCELLED_OR_TIMED_OUT"); }
        catch (Exception) { report.Add(stage, InspectionStatus.BLOCKED, "INSPECTION_QUERY_OR_PROVIDER_FAILED"); }
        finally
        {
            try { await connection.DisposeAsync(); report.Add("connection.cleanup", InspectionStatus.PASS, "DISPOSED"); }
            catch (Exception) { report.Add("connection.cleanup", InspectionStatus.FAIL, "DISPOSAL_FAILED"); }
        }
    }

    private static void AddCatalogNotRun(InspectionReport report)
    {
        foreach (var stage in new[] { "catalog.columns", "catalog.keys", "catalog.triggers_security", "purchase.foreign_key",
            "catalog.check_definitions", "catalog.defaults", "database.binding", "server.trigger_events" })
            report.Add(stage, InspectionStatus.NOT_RUN, "PREREQUISITE_NOT_ESTABLISHED");
    }
    public static string NormalizeDefinition(string definition)
    {
        // Preserve punctuation, parentheses, string literal case/content and all operator order.
        // Only whitespace outside literals and identifier brackets are normalized. Escaped literals stay intact.
        var result = new System.Text.StringBuilder(); var literal = false;
        for (var i = 0; i < definition.Length; i++)
        {
            var value = definition[i];
            if (value == '\'')
            {
                result.Append(value);
                if (literal && i + 1 < definition.Length && definition[i + 1] == '\'') { result.Append(definition[++i]); continue; }
                literal = !literal; continue;
            }
            if (literal) result.Append(value);
            else if (value == '[')
            {
                var closing = definition.IndexOf(']', i + 1);
                var identifier = closing > i + 1 ? definition[(i + 1)..closing] : "";
                if (identifier.Length > 0 && char.IsAsciiLetter(identifier[0])
                    && identifier.All(c => char.IsAsciiLetterOrDigit(c) || c == '_'))
                { result.Append(identifier.ToLowerInvariant()); i = closing; }
                else result.Append(value);
            }
            else if (!char.IsWhiteSpace(value)) result.Append(char.ToLowerInvariant(value));
        }
        if (literal) return "INVALID_DEFINITION";
        return result.ToString();
    }
    private static async Task<Dictionary<string, int>> ReadTableStatuses(DbConnection connection, string text, string prefix,
        InspectionReport report, CancellationToken token)
    {
        var rows = await ReadAsync(connection, text, null, token);
        ValidateNamedRows(rows, InspectionSql.Tables, 2);
        var result = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var row in rows) { var name = (string)row[0]; var status = ReadInt(row[1]); result.Add(name, status); AddStatus(report, prefix + "." + name, status); }
        return result;
    }
    private static void ValidateNamedRows(List<object[]> rows, IEnumerable<string> allowed, int width)
    {
        var names = allowed.ToHashSet(StringComparer.Ordinal);
        if (rows.Count != names.Count) throw new InvalidOperationException();
        foreach (var row in rows)
            if (row.Length != width || row[0] is not string name || !names.Remove(name)) throw new InvalidOperationException();
        if (names.Count != 0) throw new InvalidOperationException();
    }
    private static void AddStatus(InspectionReport report, string id, int value)
    {
        report.Add(id, value switch { 0 => InspectionStatus.PASS, 1 => InspectionStatus.FAIL, 2 => InspectionStatus.BLOCKED,
            _ => throw new InvalidOperationException() }, value switch { 0 => "FIXED_CHECK_SATISFIED", 1 => "OBSERVED_METADATA_MISMATCH", _ => "METADATA_OR_SEMANTICS_UNPROVED" });
    }
    private static int ReadInt(object value) => value is int number ? number : throw new InvalidOperationException();
    private static async Task<int> ScalarStatus(DbConnection connection, string text, CancellationToken token)
    {
        var rows = await ReadAsync(connection, text, null, token);
        if (rows.Count != 1 || rows[0].Length != 1) throw new InvalidOperationException();
        return ReadInt(rows[0][0]);
    }
    private static async Task<List<object[]>> ReadAsync(DbConnection connection, string text,
        (string Name, DbType Type, object Value)? parameter, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        await using var command = connection.CreateCommand();
        command.CommandText = text; command.CommandType = CommandType.Text; command.CommandTimeout = 5;
        if (parameter is { } p)
        {
            var item = command.CreateParameter(); item.ParameterName = p.Name; item.DbType = p.Type; item.Value = p.Value;
            if (p.Type == DbType.String) item.Size = 128;
            command.Parameters.Add(item);
        }
        await using var reader = await command.ExecuteReaderAsync(token);
        var rows = new List<object[]>();
        while (await reader.ReadAsync(token))
        {
            if (rows.Count >= 32 || reader.FieldCount > 6) throw new InvalidOperationException();
            var values = new object[reader.FieldCount]; reader.GetValues(values); rows.Add(values);
        }
        if (await reader.NextResultAsync(token)) throw new InvalidOperationException();
        return rows;
    }
}
