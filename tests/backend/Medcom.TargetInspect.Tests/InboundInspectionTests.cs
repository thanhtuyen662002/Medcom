using System.Data;
using System.Text.Json;
using System.Text.Json.Serialization;
using Medcom.TargetInspect;
using Xunit;

namespace Medcom.TargetInspect.Tests;

// Synthetic provider observations only. These never open SQL or approve the unapplied marker.
public sealed class InboundInspectionTests
{
    private const string Canary = RecordingDbConnection.Canary;
    private static readonly Guid PurchaseBinding = Guid.Parse("68a42bd1-b5bc-49c0-b194-e9d492ba9a38");
    private static readonly string[] Plans = [InspectionSql.InboundEnvironment, InspectionSql.InboundMarker,
        InspectionSql.InboundMarkerDefinition, InspectionSql.InboundBindingRows];

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Observed_marker_structure_never_proves_identity_or_I46_acceptance(bool purchaseBinding)
    {
        var connection = new RecordingDbConnection();
        var report = await Run(connection, purchaseBinding);
        Assert.Equal(Plans, connection.Commands.TakeLast(4).Select(c => c.Text).ToArray());
        Assert.All(connection.Commands.Where(c => Plans.Contains(c.Text)), c => Assert.Empty(c.Parameters));
        foreach (var name in InspectionSql.InboundEnvironmentChecks)
            Check(report, "inbound.environment." + name, InspectionStatus.PASS, "I46_READONLY_PREREQUISITE_OBSERVED");
        foreach (var name in InspectionSql.InboundMarkerChecks)
            Check(report, "inbound.marker." + name, InspectionStatus.PASS, "I46_READONLY_PREREQUISITE_OBSERVED");
        Check(report, "inbound.marker.definition", InspectionStatus.PASS, "EXACT_RECOGNIZED_PREDICATE");
        Check(report, "inbound.marker.rows", InspectionStatus.PASS, "INBOUND_MARKER_ROW_SHAPE_OBSERVED");
        Check(report, "database.binding", purchaseBinding ? InspectionStatus.PASS : InspectionStatus.BLOCKED,
            purchaseBinding ? "FIXED_CHECK_SATISFIED" : "EXPECTED_BINDING_NOT_SUPPLIED");
        AssertUnqualified(report);
        AssertSafe(connection, report);
    }

    [Fact]
    public async Task Hidden_metadata_is_unknown_never_an_absent_marker()
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.Environment][0].Rows[0][4] = 0;
        var report = await Run(connection);
        Assert.Single(connection.Commands);
        foreach (var name in InspectionSql.InboundMarkerChecks.Concat(["definition", "rows"]))
            Check(report, "inbound.marker." + name, InspectionStatus.BLOCKED, "UNKNOWN_METADATA_VISIBILITY");
        Assert.DoesNotContain(report.Checks, c => c.Code == "INBOUND_MARKER_MISSING");
        Check(report, "inbound.environment.metadata_principal", InspectionStatus.BLOCKED, "UNKNOWN_METADATA_VISIBILITY");
        AssertSafe(connection, report);
    }

    [Fact]
    public async Task Visibility_lost_after_legacy_catalogs_keeps_the_inbound_marker_unknown()
    {
        var connection = new RecordingDbConnection();
        SetStatus(connection, InspectionSql.InboundEnvironment, "metadata_principal", 2);
        SetStatus(connection, InspectionSql.InboundEnvironment, "database_triggers", 2);
        var report = await Run(connection);
        Check(report, "inbound.environment.metadata_principal", InspectionStatus.BLOCKED, "UNKNOWN_METADATA_VISIBILITY");
        Check(report, "inbound.marker.presence", InspectionStatus.BLOCKED, "UNKNOWN_METADATA_VISIBILITY");
        Assert.DoesNotContain(connection.Commands, c => c.Text == InspectionSql.InboundMarker);
        AssertSafe(connection, report);
    }

    [Theory]
    [InlineData("online")] [InlineData("writable")] [InlineData("delayed_durability_off")]
    [InlineData("non_system_database")] [InlineData("implicit_transactions_off")]
    [InlineData("database_triggers")]
    public async Task I46_environment_mismatch_is_reported_individually_without_changing_legacy_results(string name)
    {
        var connection = new RecordingDbConnection();
        SetStatus(connection, InspectionSql.InboundEnvironment, name, 1);
        var report = await Run(connection);
        Check(report, "inbound.environment." + name, InspectionStatus.FAIL, "I46_PREREQUISITE_MISMATCH");
        Check(report, "database.durability_settings", InspectionStatus.PASS, "ONLINE_WRITABLE_DELAYED_DURABILITY_OFF");
        Check(report, "database.binding", InspectionStatus.PASS, "FIXED_CHECK_SATISFIED");
        AssertUnqualified(report);
        AssertSafe(connection, report);
    }

    [Theory]
    [InlineData("presence", 1, "INBOUND_MARKER_MISSING")]
    [InlineData("columns", 1, "I46_PREREQUISITE_MISMATCH")]
    [InlineData("key", 1, "I46_PREREQUISITE_MISMATCH")]
    [InlineData("table_features", 1, "I46_PREREQUISITE_MISMATCH")]
    [InlineData("presence", 2, "UNKNOWN_METADATA_VISIBILITY")]
    [InlineData("columns", 2, "UNKNOWN_METADATA_VISIBILITY")]
    [InlineData("key", 2, "UNKNOWN_METADATA_VISIBILITY")]
    [InlineData("table_features", 2, "UNKNOWN_METADATA_VISIBILITY")]
    public async Task Missing_mismatched_or_hidden_marker_metadata_never_reads_control_rows(string name, int state, string code)
    {
        var connection = new RecordingDbConnection();
        SetStatus(connection, InspectionSql.InboundMarker, name, state);
        var report = await Run(connection);
        Check(report, "inbound.marker." + name, state == 1 ? InspectionStatus.FAIL : InspectionStatus.BLOCKED, code);
        Check(report, "inbound.marker.rows", InspectionStatus.NOT_RUN, "PREREQUISITE_NOT_ESTABLISHED");
        Assert.DoesNotContain(connection.Commands, c => c.Text == InspectionSql.InboundBindingRows);
        AssertSafe(connection, report);
    }

    [Theory]
    [InlineData(1, "I46_PREREQUISITE_MISMATCH")]
    [InlineData(2, "UNKNOWN_METADATA_VISIBILITY")]
    public async Task Missing_untrusted_or_hidden_marker_definition_prevents_row_read(int state, string code)
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.InboundMarkerDefinition][0].Rows[0][1] = state;
        var report = await Run(connection);
        Check(report, "inbound.marker.definition", state == 1 ? InspectionStatus.FAIL : InspectionStatus.BLOCKED, code);
        Assert.DoesNotContain(connection.Commands, c => c.Text == InspectionSql.InboundBindingRows);
        AssertSafe(connection, report);
    }

    [Theory]
    [InlineData("different")] [InlineData("parentheses")] [InlineData("null")] [InlineData("long")]
    public async Task Marker_definition_name_and_trust_are_not_semantic_proof(string fault)
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.InboundMarkerDefinition][0].Rows[0][0] = fault switch
        {
            "different" => Canary,
            "parentheses" => "((SingletonId=1 AND SchemaVersion=1))",
            "null" => DBNull.Value,
            _ => new string('x', 16385)
        };
        var report = await Run(connection);
        Check(report, "inbound.marker.definition", InspectionStatus.BLOCKED,
            fault is "null" or "long" ? "UNKNOWN_MARKER_DEFINITION" : "PREDICATE_EQUIVALENCE_UNPROVED");
        Assert.DoesNotContain(connection.Commands, c => c.Text == InspectionSql.InboundBindingRows);
        AssertSafe(connection, report);
    }

    [Theory]
    [InlineData(0, "INBOUND_MARKER_ROW_MISSING")]
    [InlineData(2, "INBOUND_MARKER_ROWS_AMBIGUOUS")]
    public async Task Zero_or_two_marker_rows_are_distinct_from_a_valid_singleton(int count, string code)
    {
        var connection = new RecordingDbConnection();
        var table = connection.Results[InspectionSql.InboundBindingRows][0];
        if (count == 0) table.Rows.Clear();
        else table.Rows.Add(table.Rows[0].ItemArray);
        var report = await Run(connection);
        Check(report, "inbound.marker.rows", InspectionStatus.FAIL, code);
        AssertSafe(connection, report);
    }

    [Theory]
    [InlineData("singleton")] [InlineData("version")] [InlineData("binding-empty")]
    [InlineData("binding-type")] [InlineData("singleton-type")] [InlineData("version-type")]
    [InlineData("null")] [InlineData("tenant-empty")] [InlineData("tenant-whitespace")]
    [InlineData("tenant-control")] [InlineData("tenant-long")] [InlineData("tenant-surrogate")]
    [InlineData("company-empty")] [InlineData("company-whitespace")] [InlineData("company-control")]
    [InlineData("company-long")] [InlineData("company-surrogate")]
    public async Task Corrupt_marker_rows_fail_without_disclosing_values(string fault)
    {
        var connection = new RecordingDbConnection();
        var row = connection.Results[InspectionSql.InboundBindingRows][0].Rows[0];
        switch (fault)
        {
            case "singleton": row[0] = (byte)2; break;
            case "version": row[1] = 2; break;
            case "binding-empty": row[2] = Guid.Empty; break;
            case "binding-type": row[2] = Canary; break;
            case "singleton-type": row[0] = 1; break;
            case "version-type": row[1] = 1L; break;
            case "null": row[4] = DBNull.Value; break;
            default:
                row[fault.StartsWith("tenant", StringComparison.Ordinal) ? 3 : 4] = fault.Split('-')[1] switch
                {
                    "empty" => "", "whitespace" => " \t", "control" => Canary + "\n",
                    "long" => new string('x', 101), _ => "\ud800"
                };
                break;
        }
        var report = await Run(connection);
        Check(report, "inbound.marker.rows", InspectionStatus.FAIL, "INBOUND_MARKER_ROW_CORRUPT");
        AssertSafe(connection, report);
    }

    [Fact]
    public async Task Valid_surrogate_pairs_and_boundary_length_do_not_invent_new_identity_rules()
    {
        var connection = new RecordingDbConnection();
        var row = connection.Results[InspectionSql.InboundBindingRows][0].Rows[0];
        row[3] = new string('x', 98) + "\ud83d\ude00";
        row[4] = " synthetic-spaced-company "; // Source Text/Identifier does not trim meaningful identity characters.
        var report = await Run(connection);
        Check(report, "inbound.marker.rows", InspectionStatus.PASS, "INBOUND_MARKER_ROW_SHAPE_OBSERVED");
        AssertUnqualified(report);
        AssertSafe(connection, report);
    }

    public static IEnumerable<object[]> MalformedResults()
    {
        foreach (var plan in new[] { "environment", "marker", "definition", "rows" })
        foreach (var fault in new[] { "width", "empty-width", "extra-result", "over-limit" })
            yield return [plan, fault];
        foreach (var plan in new[] { "environment", "marker" })
        foreach (var fault in new[] { "missing", "duplicate", "unexpected", "wrong-case", "status-type", "status-null", "status-range" })
            yield return [plan, fault];
        foreach (var fault in new[] { "missing", "status-type", "status-null", "status-range" })
            yield return ["definition", fault];
    }

    [Theory]
    [MemberData(nameof(MalformedResults))]
    public async Task Malformed_provider_results_fail_closed_without_leaking_payload(string name, string fault)
    {
        var connection = new RecordingDbConnection();
        var (sql, stage) = Plan(name);
        var table = connection.Results[sql][0];
        switch (fault)
        {
            case "width": table.Columns.Add("Extra", typeof(object)); break;
            case "empty-width": table.Rows.Clear(); table.Columns.Add("Extra", typeof(object)); break;
            case "extra-result": connection.Results[sql] = [table, RecordingDbConnection.Table(1, [Canary])]; break;
            case "over-limit": while (table.Rows.Count < (name == "rows" ? 3 : name == "definition" ? 2 : 33)) table.Rows.Add(table.Rows[0].ItemArray); break;
            case "missing": table.Rows.RemoveAt(0); break;
            case "duplicate": table.Rows[0][0] = table.Rows[1][0]; break;
            case "wrong-case": table.Rows[0][0] = ((string)table.Rows[0][0]).ToUpperInvariant(); break;
            case "unexpected": table.Rows[0][0] = Canary; break;
            case "status-type": table.Rows[0][1] = Canary; break;
            case "status-null": table.Rows[0][1] = DBNull.Value; break;
            case "status-range": table.Rows[0][1] = -1; break;
        }
        var report = await Run(connection);
        Check(report, stage, InspectionStatus.BLOCKED, "INSPECTION_QUERY_OR_PROVIDER_FAILED");
        if (name != "rows") Assert.DoesNotContain(connection.Commands, c => c.Text == InspectionSql.InboundBindingRows);
        AssertSafe(connection, report);
    }

    public static IEnumerable<object[]> ProviderFaults()
    {
        foreach (var plan in new[] { "environment", "marker", "definition", "rows" })
        foreach (var fault in new[] { "execute", "execute-cancel", "read", "read-cancel", "next-result", "next-result-cancel", "reader-dispose", "command-dispose" })
            yield return [plan, fault];
    }

    [Theory]
    [MemberData(nameof(ProviderFaults))]
    public async Task Cancellation_query_and_cleanup_errors_stay_sanitized_and_dispose_the_connection(string name, string fault)
    {
        var (sql, stage) = Plan(name);
        var connection = new RecordingDbConnection { Fault = fault, FaultStatement = sql };
        var report = await Run(connection);
        Check(report, stage, InspectionStatus.BLOCKED, fault.EndsWith("-cancel", StringComparison.Ordinal)
            ? "CANCELLED_OR_TIMED_OUT" : "INSPECTION_QUERY_OR_PROVIDER_FAILED");
        Check(report, "database.binding", InspectionStatus.PASS, "FIXED_CHECK_SATISFIED");
        AssertSafe(connection, report);
    }

    private static (string Sql, string Stage) Plan(string name) => name switch
    {
        "environment" => (InspectionSql.InboundEnvironment, "inbound.environment"),
        "marker" => (InspectionSql.InboundMarker, "inbound.marker"),
        "definition" => (InspectionSql.InboundMarkerDefinition, "inbound.marker.definition"),
        _ => (InspectionSql.InboundBindingRows, "inbound.marker.rows")
    };
    private static void SetStatus(RecordingDbConnection connection, string sql, string name, int state)
        => connection.Results[sql][0].Rows.Cast<DataRow>().Single(row => (string)row[0] == name)[1] = state;
    private static async Task<InspectionReport> Run(RecordingDbConnection connection, bool purchaseBinding = true)
    {
        var report = new InspectionReport();
        report.AddUnexercised();
        await InspectionRunner.RunAsync(connection, purchaseBinding ? PurchaseBinding : null, report, CancellationToken.None);
        return report;
    }
    private static void Check(InspectionReport report, string id, InspectionStatus status, string code)
        => Assert.Contains(report.Checks, c => c.Check == id && c.Status == status && c.Code == code);
    private static void AssertUnqualified(InspectionReport report)
    {
        Assert.True(report.ReleaseStillBlocked);
        Check(report, "inbound.identity_equality", InspectionStatus.BLOCKED, "INBOUND_IDENTITY_EQUALITY_UNPROVED");
        Check(report, "inbound.full_target_qualification", InspectionStatus.NOT_RUN, "I46_FULL_QUALIFICATION_NOT_PERFORMED");
        foreach (var name in new[] { "transaction_count", "transaction_state", "serializable_isolation" })
            Check(report, "inbound." + name, InspectionStatus.NOT_RUN, "OUTSIDE_READONLY_INSPECT");
        Assert.All(report.Checks.Where(c => c.Check.StartsWith("runtime.", StringComparison.Ordinal)), c => Assert.Equal(InspectionStatus.NOT_RUN, c.Status));
    }
    private static void AssertSafe(RecordingDbConnection connection, InspectionReport report)
    {
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions { Converters = { new JsonStringEnumConverter() } });
        foreach (var secret in new[] { Canary, PurchaseBinding.ToString("D"), "22222222-2222-2222-2222-222222222222",
            "synthetic-inbound-tenant", "synthetic-inbound-company", " synthetic-spaced-company ", "SingletonId=1", "ConnectionString", "Password=" })
            Assert.DoesNotContain(secret, json, StringComparison.Ordinal);
        Assert.Equal(1, connection.DisposeCalls);
        Assert.Equal(connection.Commands.Count, connection.CommandDisposeCalls);
        Assert.Equal(connection.Commands.Count - (connection.Fault is "execute" or "execute-cancel" ? 1 : 0), connection.ReaderDisposeCalls);
        Assert.Equal(ConnectionState.Closed, connection.State);
        Assert.Equal(0, connection.TransactionCalls);
        Assert.Equal(0, connection.MutationCalls);
        Assert.All(connection.Commands, c => { Assert.False(c.HasTransaction); Assert.Equal(5, c.Timeout); });
        AssertUnqualified(report);
    }
}
