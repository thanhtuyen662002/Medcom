using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Medcom.TargetInspect;
using Microsoft.Data.SqlClient;
using Xunit;

[assembly: CollectionBehavior(DisableTestParallelization = true)]

namespace Medcom.TargetInspect.Tests;

public sealed class InspectionTests
{
    private static readonly Guid Binding = Guid.Parse("68a42bd1-b5bc-49c0-b194-e9d492ba9a38");
    private const string Canary = RecordingDbConnection.Canary;
    private static readonly string[] CatalogPlan = [InspectionSql.Environment, InspectionSql.Columns, InspectionSql.Keys,
        InspectionSql.Safety, InspectionSql.PurchaseForeignKey, InspectionSql.Definitions, InspectionSql.Defaults];

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Inspection_uses_only_the_fixed_catalog_plan_and_optional_bounded_binding_read(bool supplyBinding)
    {
        var connection = new RecordingDbConnection();
        var report = new InspectionReport();
        report.AddUnexercised();
        await InspectionRunner.RunAsync(connection, supplyBinding ? Binding : null, report, CancellationToken.None);

        var expected = CatalogPlan.Concat(supplyBinding ? [InspectionSql.Binding] : Array.Empty<string>())
            .Append(InspectionSql.ServerTriggers).ToArray();
        Assert.Equal(expected, connection.Commands.Select(c => c.Text).ToArray());
        Assert.All(connection.Commands, command =>
        {
            Assert.Equal(CommandType.Text, command.Type);
            Assert.Equal(5, command.Timeout);
            Assert.False(command.HasTransaction);
            // Strip string literals before rejecting executable verbs; catalog literals may name actions.
            var executable = Regex.Replace(command.Text, "'(?:''|[^'])*'", "''");
            Assert.DoesNotMatch(@"(?i)\b(BEGIN|COMMIT|ROLLBACK|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|EXEC|EXECUTE|SET|GRANT|DENY|REVOKE|DBCC)\b", executable);
            Assert.DoesNotMatch(@"(?i)\b(UPDLOCK|XLOCK|TABLOCK|HOLDLOCK|READPAST)\b", executable);
            if (command.Text != InspectionSql.Binding) Assert.DoesNotMatch(@"(?i)\b(?:FROM|JOIN)\s+dbo\.", executable);
        });
        var database = Assert.Single(connection.Commands[0].Parameters);
        Assert.Equal("@database", database.Name);
        Assert.Equal(DbType.String, database.Type);
        Assert.Equal(128, database.Size);
        Assert.Equal("MedData", database.Value);
        foreach (var command in connection.Commands.Skip(1).Where(c => c.Text != InspectionSql.Binding)) Assert.Empty(command.Parameters);
        if (supplyBinding)
        {
            var command = Assert.Single(connection.Commands, c => c.Text == InspectionSql.Binding);
            var parameter = Assert.Single(command.Parameters);
            Assert.Equal("@binding", parameter.Name);
            Assert.Equal(DbType.Guid, parameter.Type);
            Assert.Equal(Binding, parameter.Value);
            Assert.Contains("TOP(2)", command.Text, StringComparison.Ordinal);
            Assert.Contains("FROM dbo.MedcomPurchaseRequestCommandSchema", command.Text, StringComparison.Ordinal);
            Check(report, "database.binding", InspectionStatus.PASS, "FIXED_CHECK_SATISFIED");
        }
        else Check(report, "database.binding", InspectionStatus.BLOCKED, "EXPECTED_BINDING_NOT_SUPPLIED");
        Assert.Equal(0, connection.TransactionCalls);
        Assert.Equal(0, connection.MutationCalls);
        Assert.Equal(1, connection.OpenCalls);
        Assert.Equal(1, connection.DisposeCalls);
        Assert.Equal(connection.Commands.Count, connection.ReaderDisposeCalls);
        Assert.Equal(connection.Commands.Count, connection.CommandDisposeCalls);
        Assert.Equal(ConnectionState.Closed, connection.State);
        Check(report, "connection.cleanup", InspectionStatus.PASS, "DISPOSED");
        Assert.True(report.ReleaseStillBlocked);
        Assert.All(report.Checks.Where(c => c.Check.StartsWith("runtime.", StringComparison.Ordinal)),
            check => Assert.Equal(InspectionStatus.NOT_RUN, check.Status));
        Assert.Equal(10, report.Checks.Count(c => c.Check.StartsWith("runtime.", StringComparison.Ordinal)));
        AssertSanitized(report);
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 1)]
    [InlineData(2, 0)]
    public async Task Wrong_database_existing_transaction_or_implicit_transactions_stop_before_catalogs(int index, int value)
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.Environment][0].Rows[0][index] = value;
        var report = await Run(connection);
        Check(report, "target.environment", InspectionStatus.FAIL, "TARGET_OR_TRANSACTION_MISMATCH");
        Assert.Single(connection.Commands);
        Check(report, "catalog.columns", InspectionStatus.NOT_RUN, "PREREQUISITE_NOT_ESTABLISHED");
        Assert.Equal(1, connection.DisposeCalls);
        AssertSanitized(report);
    }

    [Fact]
    public async Task Missing_complete_database_metadata_visibility_blocks_all_catalog_checks()
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.Environment][0].Rows[0][4] = 0;
        var report = await Run(connection);
        Check(report, "catalog.visibility", InspectionStatus.BLOCKED, "COMPLETE_METADATA_VISIBILITY_UNPROVED");
        Assert.Single(connection.Commands);
        Check(report, "catalog.keys", InspectionStatus.NOT_RUN, "PREREQUISITE_NOT_ESTABLISHED");
        AssertSanitized(report);
    }

    [Fact]
    public async Task Server_visibility_is_independent_and_does_not_guess_trigger_absence()
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.Environment][0].Rows[0][5] = 0;
        var report = await Run(connection);
        Check(report, "server.trigger_events", InspectionStatus.BLOCKED, "SERVER_METADATA_VISIBILITY_UNPROVED");
        Assert.DoesNotContain(connection.Commands, c => c.Text == InspectionSql.ServerTriggers);
        Check(report, "catalog.columns.MedcomPurchaseRequestCommandSchema", InspectionStatus.PASS, "FIXED_CHECK_SATISFIED");
    }

    [Fact]
    public async Task Writable_online_database_with_delayed_durability_off_is_a_separate_requirement()
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.Environment][0].Rows[0][3] = 0;
        var report = await Run(connection);
        Check(report, "database.durability_settings", InspectionStatus.FAIL, "DURABILITY_SETTINGS_MISMATCH");
        Assert.True(report.ReleaseStillBlocked);
    }

    [Theory]
    [InlineData("columns", 1)] [InlineData("columns", 2)]
    [InlineData("keys", 1)] [InlineData("keys", 2)]
    [InlineData("safety", 1)] [InlineData("safety", 2)]
    public async Task Catalog_mismatch_or_unavailable_metadata_is_never_promoted_to_pass(string stage, int status)
    {
        var connection = new RecordingDbConnection();
        var (sql, prefix) = Stage(stage);
        connection.Results[sql][0].Rows[0][1] = status;
        var report = await Run(connection);
        Check(report, prefix + "." + InspectionSql.Tables[0], status == 1 ? InspectionStatus.FAIL : InspectionStatus.BLOCKED,
            status == 1 ? "OBSERVED_METADATA_MISMATCH" : "METADATA_OR_SEMANTICS_UNPROVED");
    }

    [Theory]
    [InlineData(1)] [InlineData(2)]
    public async Task Binding_read_requires_established_control_table_shape(int status)
    {
        var connection = new RecordingDbConnection();
        var row = connection.Results[InspectionSql.Columns][0].Rows.Cast<DataRow>()
            .Single(r => (string)r[0] == "MedcomPurchaseRequestCommandSchema");
        row[1] = status;
        var report = await Run(connection);
        Check(report, "database.binding", InspectionStatus.NOT_RUN, "CONTROL_SHAPE_NOT_ESTABLISHED");
        Assert.DoesNotContain(connection.Commands, c => c.Text == InspectionSql.Binding);
    }

    [Theory]
    [InlineData(1)] [InlineData(2)]
    public async Task Binding_mismatch_or_unknown_remains_unsatisfied(int status)
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.Binding][0].Rows[0][0] = status;
        var report = await Run(connection);
        Check(report, "database.binding", status == 1 ? InspectionStatus.FAIL : InspectionStatus.BLOCKED,
            status == 1 ? "OBSERVED_METADATA_MISMATCH" : "METADATA_OR_SEMANTICS_UNPROVED");
        AssertSanitized(report);
    }

    [Theory]
    [InlineData("foreign-key", "empty")] [InlineData("foreign-key", "extra-row")]
    [InlineData("foreign-key", "wrong-width")] [InlineData("foreign-key", "wrong-type")]
    [InlineData("binding", "empty")] [InlineData("binding", "extra-row")]
    [InlineData("binding", "wrong-width")] [InlineData("binding", "wrong-type")]
    [InlineData("server-triggers", "empty")] [InlineData("server-triggers", "extra-row")]
    [InlineData("server-triggers", "wrong-width")] [InlineData("server-triggers", "wrong-type")]
    public async Task Scalar_catalog_and_binding_results_require_exact_shape_and_type(string stage, string fault)
    {
        var connection = new RecordingDbConnection();
        var (sql, id) = stage switch
        {
            "foreign-key" => (InspectionSql.PurchaseForeignKey, "purchase.foreign_key"),
            "binding" => (InspectionSql.Binding, "database.binding"),
            _ => (InspectionSql.ServerTriggers, "server.trigger_events")
        };
        connection.Results[sql] = [fault switch
        {
            "empty" => RecordingDbConnection.Table(1),
            "extra-row" => RecordingDbConnection.Table(1, [0], [0]),
            "wrong-width" => RecordingDbConnection.Table(2, [0, Canary]),
            _ => RecordingDbConnection.Table(1, [Canary])
        }];
        var report = await Run(connection);
        Check(report, id, InspectionStatus.BLOCKED, "INSPECTION_QUERY_OR_PROVIDER_FAILED");
        Assert.Equal(1, connection.DisposeCalls);
        AssertSanitized(report);
    }

    [Fact]
    public async Task Empty_expected_binding_is_rejected_before_opening_and_connection_is_disposed()
    {
        var connection = new RecordingDbConnection();
        var report = new InspectionReport();
        await InspectionRunner.RunAsync(connection, Guid.Empty, report, CancellationToken.None);
        Check(report, "connection", InspectionStatus.BLOCKED, "INSPECTION_QUERY_OR_PROVIDER_FAILED");
        Assert.Equal(0, connection.OpenCalls);
        Assert.Empty(connection.Commands);
        Assert.Equal(1, connection.DisposeCalls);
    }

    [Theory]
    [InlineData("columns", "missing")] [InlineData("columns", "duplicate")]
    [InlineData("columns", "unexpected")] [InlineData("columns", "wrong-case")]
    [InlineData("keys", "unexpected")] [InlineData("safety", "unexpected")]
    [InlineData("definitions", "missing")] [InlineData("definitions", "duplicate")]
    [InlineData("definitions", "unexpected")] [InlineData("defaults", "unexpected")]
    public async Task Missing_duplicate_or_unexpected_catalog_identifiers_fail_closed_without_echoing_them(string stage, string fault)
    {
        var connection = new RecordingDbConnection();
        var (sql, prefix) = Stage(stage);
        var table = connection.Results[sql][0];
        switch (fault)
        {
            case "missing": table.Rows.RemoveAt(0); break;
            case "duplicate": table.Rows[0][0] = table.Rows[1][0]; break;
            case "wrong-case": table.Rows[0][0] = ((string)table.Rows[0][0]).ToUpperInvariant(); break;
            default: table.Rows[0][0] = Canary; break;
        }
        var report = await Run(connection);
        Check(report, prefix, InspectionStatus.BLOCKED, "INSPECTION_QUERY_OR_PROVIDER_FAILED");
        Assert.DoesNotContain(connection.Commands, c => c.Text == InspectionSql.Binding);
        AssertSanitized(report);
    }

    [Theory]
    [InlineData("empty")] [InlineData("extra-row")] [InlineData("extra-column")]
    [InlineData("wrong-type")] [InlineData("null")] [InlineData("extra-result")]
    public async Task Malformed_environment_results_fail_closed(string fault)
    {
        var connection = new RecordingDbConnection();
        var table = connection.Results[InspectionSql.Environment][0];
        switch (fault)
        {
            case "empty": table.Rows.Clear(); break;
            case "extra-row": table.Rows.Add(table.Rows[0].ItemArray); break;
            case "extra-column": table.Columns.Add("Unexpected", typeof(object)); break;
            case "wrong-type": table.Rows[0][0] = Canary; break;
            case "null": table.Rows[0][0] = DBNull.Value; break;
            case "extra-result": connection.Results[InspectionSql.Environment] = [table, RecordingDbConnection.Table(1, [0])]; break;
        }
        var report = await Run(connection);
        Check(report, "target.environment", InspectionStatus.BLOCKED, "INSPECTION_QUERY_OR_PROVIDER_FAILED");
        Assert.Single(connection.Commands);
        AssertSanitized(report);
    }

    [Theory]
    [InlineData("negative")] [InlineData("unknown")] [InlineData("long")] [InlineData("string")]
    [InlineData("null")] [InlineData("too-many-rows")] [InlineData("extra-result")]
    public async Task Unexpected_status_values_and_unbounded_results_are_not_accepted(string fault)
    {
        var connection = new RecordingDbConnection();
        var table = connection.Results[InspectionSql.Columns][0];
        switch (fault)
        {
            case "negative": table.Rows[0][1] = -1; break;
            case "unknown": table.Rows[0][1] = 3; break;
            case "long": table.Rows[0][1] = 0L; break;
            case "string": table.Rows[0][1] = Canary; break;
            case "null": table.Rows[0][1] = DBNull.Value; break;
            case "too-many-rows": while (table.Rows.Count < 33) table.Rows.Add(Canary, 0); break;
            case "extra-result": connection.Results[InspectionSql.Columns] = [table, RecordingDbConnection.Table(1, [0])]; break;
        }
        var report = await Run(connection);
        Check(report, "catalog.columns", InspectionStatus.BLOCKED, "INSPECTION_QUERY_OR_PROVIDER_FAILED");
        Assert.Equal(2, connection.Commands.Count);
        AssertSanitized(report);
    }

    [Theory]
    [InlineData("(SingletonId=1 OR SchemaVersion=1)")]
    [InlineData("((SingletonId=1 AND SchemaVersion=1))")]
    [InlineData("(1=1)")]
    [InlineData(Canary)]
    public async Task Same_constraint_name_does_not_prove_equivalent_predicate(string definition)
    {
        var connection = new RecordingDbConnection();
        var row = connection.Results[InspectionSql.Definitions][0].Rows.Cast<DataRow>()
            .Single(r => (string)r[0] == "CK_MedcomPurchaseRequestCommandSchema");
        row[1] = definition;
        var report = await Run(connection);
        Check(report, "check.CK_MedcomPurchaseRequestCommandSchema", InspectionStatus.BLOCKED, "PREDICATE_EQUIVALENCE_UNPROVED");
        AssertSanitized(report);
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Null_or_excessively_long_predicate_is_unavailable(bool tooLong)
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.Definitions][0].Rows[0][1] = tooLong ? new string('x', 16385) : DBNull.Value;
        var name = (string)connection.Results[InspectionSql.Definitions][0].Rows[0][0];
        var report = await Run(connection);
        Check(report, "check." + name, InspectionStatus.BLOCKED, "DEFINITION_UNAVAILABLE");
    }

    [Theory]
    [InlineData(1)] [InlineData(2)]
    public async Task Correct_text_cannot_rescue_disabled_untrusted_or_missing_check_metadata(int status)
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.Definitions][0].Rows[0][2] = status;
        var name = (string)connection.Results[InspectionSql.Definitions][0].Rows[0][0];
        var report = await Run(connection);
        Check(report, "check." + name, status == 1 ? InspectionStatus.FAIL : InspectionStatus.BLOCKED,
            status == 1 ? "OBSERVED_METADATA_MISMATCH" : "METADATA_OR_SEMANTICS_UNPROVED");
    }

    [Fact]
    public void Normalization_preserves_operators_parentheses_and_literal_case_content()
    {
        Assert.Equal("(singletonid=1andschemaversion=1)", InspectionRunner.NormalizeDefinition(" ( [SingletonId] = 1 AND [SchemaVersion] = 1 ) "));
        Assert.Equal("(action='Create')", InspectionRunner.NormalizeDefinition("([Action] = 'Create')"));
        Assert.NotEqual(InspectionRunner.NormalizeDefinition("(Action='Create')"), InspectionRunner.NormalizeDefinition("(Action='create')"));
        Assert.NotEqual(InspectionRunner.NormalizeDefinition("(Action='Create')"), InspectionRunner.NormalizeDefinition("(Action='Create ')"));
        Assert.NotEqual(InspectionRunner.NormalizeDefinition("(A=1 AND B=2)"), InspectionRunner.NormalizeDefinition("(A=1 OR B=2)"));
        Assert.Equal("(x='a'' [B] c')", InspectionRunner.NormalizeDefinition("([X] = 'a'' [B] c')"));
        Assert.Equal("INVALID_DEFINITION", InspectionRunner.NormalizeDefinition("(x='unclosed)"));
    }

    [Theory]
    [InlineData("(getdate())")] [InlineData("((sysutcdatetime()))")] [InlineData(Canary)]
    public async Task Unexpected_default_semantics_remain_blocked(string definition)
    {
        var connection = new RecordingDbConnection();
        connection.Results[InspectionSql.Defaults][0].Rows[0][1] = definition;
        var report = await Run(connection);
        Check(report, "default.WebInboundRequestCommandJournalV1.CreatedAtUtc", InspectionStatus.BLOCKED, "DEFAULT_SEMANTICS_UNPROVED");
        AssertSanitized(report);
    }

    [Fact]
    public async Task Source_without_complete_native_semantics_never_becomes_runtime_acceptance()
    {
        var report = await Run(new RecordingDbConnection());
        Check(report, "default.WebInboundRequestCommandJournalV1.CreatedAtUtc", InspectionStatus.PASS, "EXACT_RECOGNIZED_DEFAULT");
        Check(report, "default.IV_InboundRequestLogTbl.UserAutoID", InspectionStatus.BLOCKED, "DEFAULT_SEMANTICS_UNPROVED");
        Check(report, "default.IV_InboundRequestLogTbl.ThoiGian", InspectionStatus.BLOCKED, "DEFAULT_SEMANTICS_UNPROVED");
        Check(report, "inbound.native_constraint_semantics", InspectionStatus.BLOCKED, "SOURCE_EXPECTATION_UNAVAILABLE");
        Check(report, "purchase.additional_constraint_semantics", InspectionStatus.BLOCKED, "SOURCE_EXPECTATION_UNAVAILABLE");
        Assert.True(report.ReleaseStillBlocked);
    }

    [Fact]
    public async Task Precancelled_inspection_disposes_without_opening()
    {
        var connection = new RecordingDbConnection();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var report = new InspectionReport();
        await InspectionRunner.RunAsync(connection, Binding, report, cancellation.Token);
        Check(report, "connection", InspectionStatus.BLOCKED, "CANCELLED_OR_TIMED_OUT");
        Assert.Equal(0, connection.OpenCalls);
        Assert.Empty(connection.Commands);
        Assert.Equal(1, connection.DisposeCalls);
    }

    [Theory]
    [InlineData("open", "connection")] [InlineData("open-cancel", "connection")]
    [InlineData("execute", "target.environment")] [InlineData("execute-cancel", "target.environment")]
    [InlineData("read", "target.environment")] [InlineData("read-cancel", "target.environment")]
    [InlineData("next-result", "target.environment")] [InlineData("next-result-cancel", "target.environment")]
    [InlineData("reader-dispose", "target.environment")] [InlineData("command-dispose", "target.environment")]
    public async Task Provider_cancellation_and_cleanup_faults_are_sanitized_and_connection_disposed(string fault, string stage)
    {
        var connection = new RecordingDbConnection { Fault = fault };
        var report = await Run(connection);
        Check(report, stage, InspectionStatus.BLOCKED, fault.EndsWith("-cancel", StringComparison.Ordinal)
            ? "CANCELLED_OR_TIMED_OUT" : "INSPECTION_QUERY_OR_PROVIDER_FAILED");
        Assert.Equal(1, connection.DisposeCalls);
        Assert.True(connection.Commands.Count <= 1);
        AssertSanitized(report);
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Connection_disposal_failure_is_reported_separately_without_exception_disclosure(bool earlierFailure)
    {
        var connection = new RecordingDbConnection { DisposalFails = true, Fault = earlierFailure ? "execute" : null };
        var report = await Run(connection);
        Check(report, "connection.cleanup", InspectionStatus.FAIL, "DISPOSAL_FAILED");
        if (earlierFailure) Check(report, "target.environment", InspectionStatus.BLOCKED, "INSPECTION_QUERY_OR_PROVIDER_FAILED");
        Assert.Equal(1, connection.DisposeCalls);
        AssertSanitized(report);
    }

    [Theory]
    [InlineData("ConnectionStrings__Medcom")] [InlineData("connectionstrings:Medcom")]
    [InlineData("Medcom__PrivateConfigPath")] [InlineData("Medcom:SqlDevelopmentTestTls:Enabled")]
    [InlineData("Legacy__ConnectionString")] [InlineData("LEGACY:WRITESENABLED")]
    [InlineData("SQLCONNSTR_Medcom")] [InlineData("SQLAZURECONNSTR_Medcom")]
    [InlineData("CUSTOMCONNSTR_Medcom")] [InlineData("MYSQLCONNSTR_Medcom")]
    public void Inherited_target_policy_and_connection_overrides_are_rejected(string name)
        => Assert.Throws<InvalidOperationException>(() => Program.EnsureSafeEnvironment(["PATH", name]));

    [Fact]
    public void Unrelated_environment_names_are_permitted()
        => Program.EnsureSafeEnvironment(["PATH", "HOME", "DOTNET_ROOT", "CI", "GITHUB_ACTIONS"]);

    [Theory]
    [InlineData("True")] [InlineData("Strict")]
    public void Exact_target_configuration_keeps_encryption_and_disables_pooling_and_enlistment(string encryption)
    {
        using var files = new ConfigurationFiles();
        files.WriteConfig(ConfigurationFiles.Connection + ";Encrypt=" + encryption + ";TrustServerCertificate=False");
        var before = File.ReadAllBytes(files.Config);
        var result = Program.ReadConfiguration(files.Config, null, files.ContentRoot);
        var parsed = new SqlConnectionStringBuilder(result.ConnectionString);
        Assert.Equal(InspectionRunner.ExpectedServer, parsed.DataSource);
        Assert.Equal(InspectionRunner.ExpectedDatabase, parsed.InitialCatalog);
        Assert.Equal(encryption == "Strict" ? SqlConnectionEncryptOption.Strict : SqlConnectionEncryptOption.Mandatory, parsed.Encrypt);
        Assert.False(parsed.TrustServerCertificate);
        Assert.False(parsed.PersistSecurityInfo);
        Assert.False(parsed.Pooling);
        Assert.False(parsed.Enlist);
        Assert.Equal(5, parsed.ConnectTimeout);
        Assert.Equal("Medcom.TargetInspect", parsed.ApplicationName);
        Assert.Null(result.ExpectedBinding);
        Assert.Equal(before, File.ReadAllBytes(files.Config));
    }

    [Fact]
    public void Existing_explicit_exact_target_tls_exception_is_applied_by_the_linked_policy()
    {
        using var files = new ConfigurationFiles();
        files.WriteConfig(ConfigurationFiles.Connection + ";Encrypt=True;TrustServerCertificate=True", true);
        var result = Program.ReadConfiguration(files.Config, null, files.ContentRoot);
        var parsed = new SqlConnectionStringBuilder(result.ConnectionString);
        Assert.Equal(SqlConnectionEncryptOption.Mandatory, parsed.Encrypt);
        Assert.True(parsed.TrustServerCertificate);
        Assert.False(parsed.PersistSecurityInfo);
    }

    [Theory]
    [InlineData("Server=other.example.invalid,17456;Database=MedData;Encrypt=True")]
    [InlineData("Server=ZMC.BMS79.COM,17456;Database=MedData;Encrypt=True")]
    [InlineData("Server=tcp:zmc.bms79.com,17456;Database=MedData;Encrypt=True")]
    [InlineData("Server=zmc.bms79.com,17456;Database=meddata;Encrypt=True")]
    [InlineData("Server=zmc.bms79.com,17456;Database=master;Encrypt=True")]
    [InlineData("Server=zmc.bms79.com,17456;Database=MedData;Encrypt=False")]
    [InlineData("Server=zmc.bms79.com,17456;Database=MedData;Encrypt=True;TrustServerCertificate=True")]
    [InlineData("Server=zmc.bms79.com,17456;Database=MedData;Encrypt=True;Failover Partner=other.example.invalid")]
    [InlineData("Server=zmc.bms79.com,17456;Database=MedData;Encrypt=True;Application Intent=ReadOnly")]
    [InlineData("Server=zmc.bms79.com,17456;Database=MedData;Encrypt=True;User Instance=True")]
    [InlineData("Server=zmc.bms79.com,17456;Database=MedData;Encrypt=True;AttachDBFilename=synthetic.mdf")]
    [InlineData(Canary)]
    public void Unsafe_or_alternate_configuration_never_resolves(string connection)
    {
        using var files = new ConfigurationFiles();
        files.WriteConfig(connection);
        Assert.ThrowsAny<Exception>(() => Program.ReadConfiguration(files.Config, null, files.ContentRoot));
    }

    [Theory]
    [InlineData("server")] [InlineData("database")] [InlineData("enabled")]
    public void Tls_exception_does_not_broaden_to_a_different_or_malformed_target(string fault)
    {
        using var files = new ConfigurationFiles();
        files.WriteConfig(ConfigurationFiles.Connection + ";Encrypt=True;TrustServerCertificate=True", true);
        var config = JsonNode.Parse(File.ReadAllText(files.Config))!.AsObject();
        var policy = config["Medcom"]!["SqlDevelopmentTestTls"]!.AsObject();
        policy[fault == "server" ? "Server" : fault == "database" ? "Database" : "Enabled"] = Canary;
        File.WriteAllText(files.Config, config.ToJsonString());
        Assert.ThrowsAny<Exception>(() => Program.ReadConfiguration(files.Config, null, files.ContentRoot));
    }

    [Fact]
    public void Inherited_override_is_checked_by_configuration_entry_point()
    {
        const string name = "Medcom__InspectionSyntheticOverride";
        var previous = Environment.GetEnvironmentVariable(name);
        try
        {
            Environment.SetEnvironmentVariable(name, Canary);
            using var files = new ConfigurationFiles();
            files.WriteConfig(ConfigurationFiles.Connection + ";Encrypt=True");
            Assert.Throws<InvalidOperationException>(() => Program.ReadConfiguration(files.Config, null, files.ContentRoot));
        }
        finally { Environment.SetEnvironmentVariable(name, previous); }
    }

    [Fact]
    public void Legacy_connection_key_is_supported_but_conflicting_duplicate_is_rejected()
    {
        using var files = new ConfigurationFiles();
        var connection = ConfigurationFiles.Connection + ";Encrypt=True";
        File.WriteAllText(files.Config, JsonSerializer.Serialize(new { Legacy = new { ConnectionString = connection } }));
        Assert.Equal("MedData", new SqlConnectionStringBuilder(Program.ReadConfiguration(files.Config, null, files.ContentRoot).ConnectionString).InitialCatalog);
        File.WriteAllText(files.Config, JsonSerializer.Serialize(new
        {
            ConnectionStrings = new { Medcom = connection },
            Legacy = new { ConnectionString = connection.Replace("MedData", "OtherSynthetic", StringComparison.Ordinal) }
        }));
        Assert.Throws<InvalidOperationException>(() => Program.ReadConfiguration(files.Config, null, files.ContentRoot));
    }

    [Fact]
    public void Optional_binding_must_be_explicit_and_is_not_generated()
    {
        using var files = new ConfigurationFiles();
        files.WriteConfig(ConfigurationFiles.Connection + ";Encrypt=True");
        File.WriteAllText(files.Options, "{}");
        Assert.Null(Program.ReadConfiguration(files.Config, files.Options, files.ContentRoot).ExpectedBinding);
        File.WriteAllText(files.Options, JsonSerializer.Serialize(new { ExpectedBindingId = Binding.ToString("D") }));
        Assert.Equal(Binding, Program.ReadConfiguration(files.Config, files.Options, files.ContentRoot).ExpectedBinding);
    }

    [Theory]
    [InlineData("[]")] [InlineData("null")] [InlineData("{broken")]
    [InlineData("{\"ExpectedBindingId\":null}")] [InlineData("{\"ExpectedBindingId\":123}")]
    [InlineData("{\"ExpectedBindingId\":\"00000000-0000-0000-0000-000000000000\"}")]
    [InlineData("{\"ExpectedBindingId\":\"68a42bd1b5bc49c0b194e9d492ba9a38\"}")]
    [InlineData("{\"ExpectedBindingId\":\"not-a-guid\"}")]
    [InlineData("{\"expectedBindingId\":\"68a42bd1-b5bc-49c0-b194-e9d492ba9a38\"}")]
    [InlineData("{\"ExpectedBindingId\":\"68a42bd1-b5bc-49c0-b194-e9d492ba9a38\",\"sql\":\"ignored\"}")]
    [InlineData("{\"ExpectedBindingId\":\"68a42bd1-b5bc-49c0-b194-e9d492ba9a38\",\"ExpectedBindingId\":\"68a42bd1-b5bc-49c0-b194-e9d492ba9a38\"}")]
    public void Malformed_or_extra_options_fail_closed(string options)
    {
        using var files = new ConfigurationFiles();
        files.WriteConfig(ConfigurationFiles.Connection + ";Encrypt=True");
        File.WriteAllText(files.Options, options);
        Assert.ThrowsAny<Exception>(() => Program.ReadConfiguration(files.Config, files.Options, files.ContentRoot));
    }

    [Theory]
    [InlineData("missing")] [InlineData("relative")] [InlineData("content-root")]
    [InlineData("repository")] [InlineData("malformed")] [InlineData("oversized")]
    public void Invalid_private_configuration_paths_and_contents_are_rejected(string fault)
    {
        using var files = new ConfigurationFiles();
        files.WriteConfig(ConfigurationFiles.Connection + ";Encrypt=True");
        var path = files.Config;
        switch (fault)
        {
            case "missing": File.Delete(path); break;
            case "relative": path = "synthetic-private.json"; break;
            case "content-root": path = Path.Combine(files.ContentRoot, "private.json"); File.Copy(files.Config, path); break;
            case "repository": Directory.CreateDirectory(Path.Combine(files.Root, ".git")); break;
            case "malformed": File.WriteAllText(path, "{" + Canary); break;
            case "oversized": File.WriteAllText(path, new string(' ', 1024 * 1024 + 1)); break;
        }
        Assert.ThrowsAny<Exception>(() => Program.ReadConfiguration(path, null, files.ContentRoot));
    }

    [Theory]
    [InlineData("missing")] [InlineData("relative")] [InlineData("content-root")] [InlineData("oversized")]
    public void Options_must_also_be_bounded_external_private_files(string fault)
    {
        using var files = new ConfigurationFiles();
        files.WriteConfig(ConfigurationFiles.Connection + ";Encrypt=True");
        var path = files.Options;
        switch (fault)
        {
            case "missing": break;
            case "relative": path = "synthetic-options.json"; break;
            case "content-root": path = Path.Combine(files.ContentRoot, "options.json"); File.WriteAllText(path, "{}"); break;
            case "oversized": File.WriteAllText(path, new string(' ', 1024 * 1024 + 1)); break;
        }
        Assert.ThrowsAny<Exception>(() => Program.ReadConfiguration(files.Config, path, files.ContentRoot));
    }

    [Fact]
    public void Package_inventory_verifies_all_bytes_and_reports_only_validated_provenance()
    {
        using var package = new PackageFiles();
        var report = new InspectionReport();
        Program.ValidatePackage(package.Root, report);
        Assert.Equal(new string('a', 40), report.SourceRevision);
        Assert.Equal(new string('b', 40), report.SourceTree);
        Assert.True(report.ReleaseStillBlocked);
    }

    [Theory]
    [InlineData("missing-manifest")] [InlineData("missing-file")] [InlineData("extra-file")]
    [InlineData("modified-file")] [InlineData("unlisted-nested-file")] [InlineData("missing-required")]
    [InlineData("bad-hash")] [InlineData("empty-files")] [InlineData("duplicate-file")]
    [InlineData("case-alias-file")] [InlineData("malformed-json")] [InlineData("oversized-manifest")]
    public void Missing_extra_modified_or_ambiguous_package_bytes_are_rejected(string fault)
    {
        using var package = new PackageFiles();
        switch (fault)
        {
            case "missing-manifest": File.Delete(package.ManifestPath); break;
            case "missing-file": File.Delete(Path.Combine(package.Root, "README.md")); break;
            case "extra-file": File.WriteAllText(Path.Combine(package.Root, "unexpected.txt"), Canary); break;
            case "modified-file": File.AppendAllText(Path.Combine(package.Root, "README.md"), Canary); break;
            case "unlisted-nested-file": Directory.CreateDirectory(Path.Combine(package.Root, "extra")); File.WriteAllText(Path.Combine(package.Root, "extra", "extra.txt"), Canary); break;
            case "missing-required": package.Manifest["files"]!.AsObject().Remove("README.md"); File.Delete(Path.Combine(package.Root, "README.md")); package.Save(); break;
            case "bad-hash": package.Manifest["files"]!["README.md"] = new string('0', 64); package.Save(); break;
            case "empty-files": package.Manifest["files"] = new JsonObject(); package.Save(); break;
            case "case-alias-file": package.Manifest["files"]!["readme.md"] = package.Manifest["files"]!["README.md"]!.GetValue<string>(); package.Save(); break;
            case "duplicate-file":
                var text = File.ReadAllText(package.ManifestPath);
                File.WriteAllText(package.ManifestPath, text.Replace("\"files\":{", "\"files\":{\"README.md\":\"" + package.Manifest["files"]!["README.md"]!.GetValue<string>() + "\",", StringComparison.Ordinal));
                break;
            case "malformed-json": File.WriteAllText(package.ManifestPath, "{" + Canary); break;
            case "oversized-manifest": File.WriteAllText(package.ManifestPath, new string(' ', 1024 * 1024 + 1)); break;
        }
        AssertRejectedPackage(package);
    }

    [Theory]
    [InlineData("schemaVersion")] [InlineData("kind")] [InlineData("releaseStillBlocked")]
    [InlineData("sourceRevision")] [InlineData("sourceTree")] [InlineData("uppercase-revision")]
    [InlineData("linked-name")] [InlineData("linked-hash")] [InlineData("linked-extra")]
    [InlineData("extra-field")] [InlineData("missing-field")] [InlineData("duplicate-field")]
    public void Manifest_schema_and_source_claims_must_be_exact(string fault)
    {
        using var package = new PackageFiles();
        switch (fault)
        {
            case "schemaVersion": package.Manifest["schemaVersion"] = 2; break;
            case "kind": package.Manifest["kind"] = "application"; break;
            case "releaseStillBlocked": package.Manifest["releaseStillBlocked"] = false; break;
            case "sourceRevision": package.Manifest["sourceRevision"] = Canary; break;
            case "sourceTree": package.Manifest["sourceTree"] = new string('b', 39); break;
            case "uppercase-revision": package.Manifest["sourceRevision"] = new string('A', 40); break;
            case "linked-name": package.Manifest["linkedSources"]!.AsObject().Remove(PackageFiles.ConfigurationSource); break;
            case "linked-hash": package.Manifest["linkedSources"]![PackageFiles.ConfigurationSource] = new string('a', 63); break;
            case "linked-extra": package.Manifest["linkedSources"]!["extra.cs"] = new string('a', 64); break;
            case "extra-field": package.Manifest["runtimeQualified"] = true; break;
            case "missing-field": package.Manifest.Remove("sourceTree"); break;
        }
        package.Save();
        if (fault == "duplicate-field")
            File.WriteAllText(package.ManifestPath, File.ReadAllText(package.ManifestPath).Replace("\"schemaVersion\":1", "\"schemaVersion\":1,\"schemaVersion\":1", StringComparison.Ordinal));
        AssertRejectedPackage(package);
    }

    [Theory]
    [InlineData("../outside")]
    [InlineData("/absolute")]
    [InlineData("C:/absolute")]
    [InlineData("directory\\file")]
    [InlineData("directory//file")]
    [InlineData("./file")]
    [InlineData("directory/../file")]
    [InlineData("file.")]
    [InlineData("file ")]
    [InlineData("file:stream")]
    [InlineData("manifest.json")]
    [InlineData("")]
    public void Unsafe_manifest_paths_are_rejected_before_reading_the_target(string path)
    {
        using var package = new PackageFiles();
        package.Manifest["files"]![path] = new string('a', 64);
        package.Save();
        AssertRejectedPackage(package);
    }

    [Fact]
    public void Package_file_and_directory_symlinks_are_rejected_on_linux()
    {
        if (!OperatingSystem.IsLinux()) return;
        using var package = new PackageFiles();
        using var outside = new ConfigurationFiles();
        File.WriteAllText(outside.Options, Canary);
        File.CreateSymbolicLink(Path.Combine(package.Root, "linked.txt"), outside.Options);
        package.Manifest["files"]!["linked.txt"] = PackageFiles.Hash(File.ReadAllBytes(outside.Options));
        package.Save();
        AssertRejectedPackage(package);
        File.Delete(Path.Combine(package.Root, "linked.txt"));
        package.Manifest["files"]!.AsObject().Remove("linked.txt");
        Directory.CreateSymbolicLink(Path.Combine(package.Root, "linked-directory"), outside.Root);
        package.Save();
        AssertRejectedPackage(package);
    }

    [Fact]
    public void Private_configuration_symlink_is_rejected_on_linux()
    {
        if (!OperatingSystem.IsLinux()) return;
        using var files = new ConfigurationFiles();
        files.WriteConfig(ConfigurationFiles.Connection + ";Encrypt=True");
        var link = Path.Combine(files.Root, "linked.json");
        File.CreateSymbolicLink(link, files.Config);
        Assert.Throws<InvalidOperationException>(() => Program.ReadConfiguration(link, null, files.ContentRoot));
    }

    [Theory]
    [InlineData("write")] [InlineData("--sql")]
    [InlineData("--connection-string")] [InlineData("inspect-extra")]
    public async Task Cli_rejects_arbitrary_modes_and_arguments_without_echoing_them(string mode)
    {
        var original = Console.Out;
        using var output = new StringWriter();
        try
        {
            Console.SetOut(output);
            Assert.Equal(2, await Program.Main([mode, "--config", Canary]));
        }
        finally { Console.SetOut(original); }
        Assert.DoesNotContain(Canary, output.ToString(), StringComparison.Ordinal);
        using var document = JsonDocument.Parse(output.ToString());
        Assert.True(document.RootElement.GetProperty("ReleaseStillBlocked").GetBoolean());
        Assert.Contains("INPUT_OR_PACKAGE_REJECTED", output.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Help_does_not_require_or_open_private_configuration()
    {
        var original = Console.Out;
        using var output = new StringWriter();
        try
        {
            Console.SetOut(output);
            Assert.Equal(0, await Program.Main(["--help"]));
        }
        finally { Console.SetOut(original); }
        Assert.Contains("inspect --config", output.ToString(), StringComparison.Ordinal);
    }

    private static async Task<InspectionReport> Run(RecordingDbConnection connection)
    {
        var report = new InspectionReport();
        await InspectionRunner.RunAsync(connection, Binding, report, CancellationToken.None);
        return report;
    }

    private static void Check(InspectionReport report, string id, InspectionStatus status, string code)
        => Assert.Contains(report.Checks, check => check.Check == id && check.Status == status && check.Code == code);

    private static void AssertSanitized(InspectionReport report)
    {
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions { Converters = { new JsonStringEnumConverter() } });
        Assert.DoesNotContain(Canary, json, StringComparison.Ordinal);
        Assert.DoesNotContain(Binding.ToString("D"), json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ConnectionString", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Password=", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("SingletonId=1", json, StringComparison.Ordinal);
        Assert.DoesNotContain("sysutcdatetime()", json, StringComparison.Ordinal);
    }

    private static (string Sql, string Prefix) Stage(string name) => name switch
    {
        "columns" => (InspectionSql.Columns, "catalog.columns"),
        "keys" => (InspectionSql.Keys, "catalog.keys"),
        "safety" => (InspectionSql.Safety, "catalog.triggers_security"),
        "definitions" => (InspectionSql.Definitions, "catalog.check_definitions"),
        "defaults" => (InspectionSql.Defaults, "catalog.defaults"),
        _ => throw new ArgumentOutOfRangeException(nameof(name))
    };

    private static void AssertRejectedPackage(PackageFiles package)
    {
        var report = new InspectionReport();
        Assert.ThrowsAny<Exception>(() => Program.ValidatePackage(package.Root, report));
        Assert.Null(report.SourceRevision);
        Assert.Null(report.SourceTree);
        Assert.True(report.ReleaseStillBlocked);
    }

    private sealed class ConfigurationFiles : IDisposable
    {
        internal const string Connection = "Server=zmc.bms79.com,17456;Database=MedData;User ID=synthetic;Password=" + Canary;
        public string Root { get; } = Path.Combine(Path.GetTempPath(), "MedcomInspectSynthetic-" + Guid.NewGuid().ToString("N"));
        public string ContentRoot => Path.Combine(Root, "public");
        public string Config => Path.Combine(Root, "private.json");
        public string Options => Path.Combine(Root, "options.json");
        public ConfigurationFiles() => Directory.CreateDirectory(ContentRoot);
        public void WriteConfig(string connection, bool developmentTls = false) => File.WriteAllText(Config, JsonSerializer.Serialize(new
        {
            ConnectionStrings = new { Medcom = connection },
            Medcom = new
            {
                SqlDevelopmentTestTls = new
                {
                    Enabled = developmentTls,
                    Server = InspectionRunner.ExpectedServer,
                    Database = InspectionRunner.ExpectedDatabase
                }
            }
        }));
        public void Dispose() => Directory.Delete(Root, true);
    }

    private sealed class PackageFiles : IDisposable
    {
        internal const string ConfigurationSource = "src/backend/Medcom.Api/ServerConfiguration.cs";
        public string Root { get; } = Path.Combine(Path.GetTempPath(), "MedcomInspectPackageSynthetic-" + Guid.NewGuid().ToString("N"));
        public string ManifestPath => Path.Combine(Root, "manifest.json");
        public JsonObject Manifest { get; }
        public PackageFiles()
        {
            Directory.CreateDirectory(Root);
            var files = new JsonObject();
            // Synthetic bytes only. No test loads or executes these deliberately non-assembly files.
            foreach (var name in new[] { "Medcom.TargetInspect.dll", "Medcom.TargetInspect.deps.json", "Medcom.TargetInspect.runtimeconfig.json", "README.md" })
            {
                var bytes = Encoding.UTF8.GetBytes("synthetic fixture: " + name);
                File.WriteAllBytes(Path.Combine(Root, name), bytes);
                files[name] = Hash(bytes);
            }
            Manifest = new JsonObject
            {
                ["schemaVersion"] = 1,
                ["kind"] = "medcom-target-inspector",
                ["sourceRevision"] = new string('a', 40),
                ["sourceTree"] = new string('b', 40),
                ["linkedSources"] = new JsonObject
                {
                    [ConfigurationSource] = new string('c', 64),
                    ["src/backend/Medcom.Infrastructure/SqlDevelopmentTestTlsTarget.cs"] = new string('d', 64)
                },
                ["files"] = files,
                ["releaseStillBlocked"] = true
            };
            Save();
        }
        public static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
        public void Save() => File.WriteAllText(ManifestPath, Manifest.ToJsonString());
        public void Dispose() => Directory.Delete(Root, true);
    }
}
