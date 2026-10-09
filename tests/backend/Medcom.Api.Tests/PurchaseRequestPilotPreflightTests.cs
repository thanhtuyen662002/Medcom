using System.Collections;
using System.Data;
using System.Data.Common;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Medcom.Api;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace Medcom.Api.Tests;

// Recording providers only. No connection, credential verification, real business
// data, HTTP startup, command qualification or target-runtime acceptance is tested.
public sealed class PurchaseRequestPilotPreflightTests
{
    private const string SecretMarker = "synthetic-sensitive-error-never-print";
    private const string ConnectionString = "Server=preflight.example.invalid,1433;Database=SyntheticPreflight;User ID=synthetic;Password=synthetic-secret;Encrypt=True;TrustServerCertificate=False";
    private static readonly Guid Binding = Guid.Parse("55b81bfa-f104-4f08-a7fd-6f6a3169d3b8");
    private static string[] Arguments(string actor = "synthetic.actor", string document = "SYNTHETIC-PR-1", string branch = "SYNTHETIC-B1") =>
        [PurchaseRequestPilotPreflight.Switch, "--actor", actor, "--document", document, "--branch", branch];
    private static ConfigurationManager Configuration(string? connection = ConnectionString)
    {
        var configuration = new ConfigurationManager();
        configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Medcom"] = connection });
        return configuration;
    }

    private static async Task<(int Exit, string Text)> Run(Model model, string[]? args = null,
        CancellationToken token = default)
    {
        using var configuration = Configuration();
        using var output = new StringWriter();
        var exit = await PurchaseRequestPilotPreflight.RunCoreAsync(args ?? Arguments(), configuration, output, model.Create, token);
        return (exit, output.ToString());
    }

    private static JsonElement Report(string text)
    {
        Assert.Single(text.Split('\n', StringSplitOptions.RemoveEmptyEntries));
        Assert.DoesNotContain(SecretMarker, text);
        Assert.DoesNotContain("synthetic-secret", text);
        Assert.DoesNotContain("preflight.example.invalid", text);
        Assert.DoesNotContain("SyntheticPreflight", text);
        using var json = JsonDocument.Parse(text);
        var root = json.RootElement.Clone();
        Assert.Equal(["schemaVersion", "purpose", "readOnly", "stage", "code", "observation", "qualification"],
            root.EnumerateObject().Select(property => property.Name).ToArray());
        Assert.True(root.GetProperty("readOnly").GetBoolean());
        Assert.Equal("read_only_preflight_not_write_authorization", root.GetProperty("purpose").GetString());
        Assert.Equal("not_established", root.GetProperty("qualification").GetString());
        return root;
    }

    private static void Failed((int Exit, string Text) result, Model model)
    {
        Assert.NotEqual(0, result.Exit);
        Assert.Equal(JsonValueKind.Null, Report(result.Text).GetProperty("observation").ValueKind);
        Assert.Equal(0, model.ForbiddenCalls);
        Assert.Equal(model.Commands.Count, model.CommandDisposals);
        Assert.Equal(model.ReadersCreated, model.ReaderDisposals);
    }

    [Fact]
    public void Probe_prefix_is_intercepted_to_reject_misspellings_without_starting_the_host()
    {
        Assert.False(PurchaseRequestPilotPreflight.IsRequested([]));
        Assert.False(PurchaseRequestPilotPreflight.IsRequested(["--urls", "http://synthetic.invalid"]));
        Assert.False(PurchaseRequestPilotPreflight.IsRequested([PurchaseRequestPilotStartup.Switch]));
        Assert.True(PurchaseRequestPilotPreflight.IsRequested(Arguments()));
        Assert.True(PurchaseRequestPilotPreflight.IsRequested(["--PROBE-PURCHASE-PILOT"]));
        Assert.True(PurchaseRequestPilotPreflight.IsRequested(["--probe-purchase-pilot=true"]));
        Assert.True(PurchaseRequestPilotPreflight.IsRequested(["--probe-purchase-pilot-typo"]));
    }

    public static IEnumerable<object[]> InvalidArguments()
    {
        yield return [Array.Empty<string>()];
        yield return [new[] { PurchaseRequestPilotPreflight.Switch }];
        yield return [Arguments().Concat(["Password=" + SecretMarker]).ToArray()];
        yield return [Arguments().Concat(["--actor", "another"]).ToArray()];
        yield return [Arguments().Skip(1).ToArray()];
        foreach (var index in new[] { 0, 1, 3, 5 })
        {
            var copy = Arguments(); copy[index] = copy[index].ToUpperInvariant(); yield return [copy];
        }
        foreach (var index in new[] { 2, 4, 6 })
        foreach (var invalid in new[] { "", " ", " padded", "padded ", "*", "a?b", "--secret", "line\nfeed", "a\0b" })
        {
            var copy = Arguments(); copy[index] = invalid; yield return [copy];
        }
        foreach (var (index, length) in new[] { (2, 101), (4, 51), (6, 51) })
        {
            var copy = Arguments(); copy[index] = new string('x', length); yield return [copy];
        }
        var reordered = Arguments(); (reordered[1], reordered[3]) = (reordered[3], reordered[1]); yield return [reordered];
    }

    [Theory]
    [MemberData(nameof(InvalidArguments))]
    public async Task Invalid_arguments_are_rejected_before_configuration_or_factory(string[] args)
    {
        var model = new Model();
        using var output = new StringWriter();
        Assert.Equal(2, await PurchaseRequestPilotPreflight.RunCoreAsync(args, null!, output, model.Create));
        Assert.Equal(0, model.FactoryCalls);
        Assert.Equal("invalid_arguments", Report(output.ToString()).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Public_entrypoint_rejects_secret_arguments_without_touching_environment_or_host()
    {
        using var output = new StringWriter();
        Assert.Equal(2, await PurchaseRequestPilotPreflight.RunAsync(
            Arguments().Concat(["--password", SecretMarker]).ToArray(), output));
        Assert.Equal("arguments", Report(output.ToString()).GetProperty("stage").GetString());
    }

    [Fact]
    public async Task Malformed_UTF16_is_rejected_without_theory_serialization_normalization()
    {
        // xUnit's transport can replace lone surrogates in serialized theory data.
        // Construct them here so this checks the actual strict UTF-8 boundary.
        var malformed = new string((char)0xD800, 1);
        foreach (var index in new[] { 2, 4, 6 })
        {
            var args = Arguments(); args[index] = malformed;
            var model = new Model(); var result = await Run(model, args);
            Failed(result, model); Assert.Equal(2, result.Exit); Assert.Equal(0, model.FactoryCalls);
        }
        foreach (var index in new[] { 0, 2 })
        {
            var model = new Model
            {
                Transform = (stage, table) => { if (stage == "principal") table.Rows[0][index] = malformed; return table; }
            };
            Failed(await Run(model), model);
        }
    }

    public static IEnumerable<object?[]> InvalidConfigurations()
    {
        yield return [null]; yield return [""]; yield return [SecretMarker];
        foreach (var replacement in new[] { "Encrypt=False;TrustServerCertificate=False", "Encrypt=True;TrustServerCertificate=True" })
            yield return [ConnectionString.Replace("Encrypt=True;TrustServerCertificate=False", replacement)];
        yield return [ConnectionString.Replace("Database=SyntheticPreflight", "Database=master")];
        yield return [ConnectionString.Replace("Database=SyntheticPreflight", "Database=")];
        yield return [ConnectionString.Replace("Server=preflight.example.invalid,1433", "Server=(localdb)\\Synthetic")];
        yield return [ConnectionString.Replace("Server=preflight.example.invalid,1433", "Server=")];
        yield return [ConnectionString.Replace("User ID=synthetic", "User ID=")];
        yield return [ConnectionString.Replace("Password=synthetic-secret", "Password=")];
        yield return [ConnectionString.Replace("Password=synthetic-secret", "Password=REPLACE_PASSWORD_HERE")];
        yield return [ConnectionString + ";Integrated Security=True"];
        yield return [ConnectionString + ";Authentication=Active Directory Password"];
        yield return [ConnectionString + ";Failover Partner=other.example.invalid"];
        yield return [ConnectionString + ";Application Intent=ReadOnly"];
        yield return [ConnectionString + ";AttachDBFilename=synthetic.mdf"];
        yield return [ConnectionString + ";User Instance=False"];
    }

    [Theory]
    [MemberData(nameof(InvalidConfigurations))]
    public async Task Invalid_configuration_fails_before_factory_and_never_echoes_private_input(string? value)
    {
        using var configuration = Configuration(value); using var output = new StringWriter(); var model = new Model();
        var exit = await PurchaseRequestPilotPreflight.RunCoreAsync(Arguments(), configuration, output, model.Create);
        Failed((exit, output.ToString()), model);
        Assert.Equal(0, model.FactoryCalls);
        Assert.Equal("configuration", Report(output.ToString()).GetProperty("stage").GetString());
    }

    [Fact]
    public async Task Existing_configuration_is_preserved_and_fresh_SQL_session_is_bounded()
    {
        using var configuration = Configuration(ConnectionString + ";Pooling=True;Enlist=True;Connect Timeout=100;ConnectRetryCount=8;Application Name=Synthetic.Operator");
        configuration["Legacy:Enabled"] = "false"; configuration["Legacy:EnableReadOnlyPilots"] = "false";
        configuration["Medcom:PrivateConfigPath"] = SecretMarker;
        configuration["Medcom:PurchaseRequestPilot:ActorId"] = SecretMarker;
        var before = configuration.AsEnumerable().OrderBy(item => item.Key).ToArray();
        using var output = new StringWriter(); var model = new Model();
        Assert.Equal(0, await PurchaseRequestPilotPreflight.RunCoreAsync(Arguments(), configuration, output, model.Create));
        var settings = new SqlConnectionStringBuilder(model.ResolvedConnection);
        Assert.Equal(SqlConnectionEncryptOption.Mandatory, settings.Encrypt);
        Assert.False(settings.TrustServerCertificate); Assert.False(settings.PersistSecurityInfo);
        Assert.False(settings.Pooling); Assert.False(settings.Enlist);
        Assert.Equal(10, settings.ConnectTimeout); Assert.Equal(0, settings.ConnectRetryCount);
        Assert.Equal("Synthetic.Operator", settings.ApplicationName);
        Assert.Equal(before, configuration.AsEnumerable().OrderBy(item => item.Key).ToArray());
        Assert.Equal(1, model.FactoryCalls); Assert.Equal(1, model.Opens); Assert.Equal(1, model.Begins);
        Assert.Equal(1, model.Rollbacks); Assert.Equal(1, model.TransactionDisposals); Assert.Equal(1, model.ConnectionDisposals);
        _ = Report(output.ToString());
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Explicit_existing_TLS_exception_is_preserved_only_for_its_exact_scope(bool wrongTarget)
    {
        using var configuration = Configuration(); using var output = new StringWriter(); var model = new Model();
        configuration["Medcom:SqlDevelopmentTestTls:Enabled"] = "true";
        configuration["Medcom:SqlDevelopmentTestTls:Server"] = "preflight.example.invalid,1433";
        configuration["Medcom:SqlDevelopmentTestTls:Database"] = wrongTarget ? "OtherSynthetic" : "SyntheticPreflight";
        var result = await PurchaseRequestPilotPreflight.RunCoreAsync(Arguments(), configuration, output, model.Create);
        Assert.Equal(wrongTarget ? 3 : 0, result);
        Assert.Equal(wrongTarget ? 0 : 1, model.FactoryCalls);
        if (!wrongTarget) Assert.True(new SqlConnectionStringBuilder(model.ResolvedConnection).TrustServerCertificate);
        _ = Report(output.ToString());
    }

    [Theory]
    [InlineData("legacy-only")] [InlineData("equivalent")] [InlineData("conflicting")]
    public async Task Existing_connection_alias_resolution_is_reused(string mode)
    {
        using var configuration = Configuration(mode == "legacy-only" ? null : ConnectionString);
        configuration["Legacy:ConnectionString"] = mode == "conflicting"
            ? ConnectionString.Replace("SyntheticPreflight", "DifferentSynthetic") : ConnectionString;
        using var output = new StringWriter(); var model = new Model();
        Assert.Equal(mode == "conflicting" ? 3 : 0,
            await PurchaseRequestPilotPreflight.RunCoreAsync(Arguments(), configuration, output, model.Create));
        Assert.Equal(mode == "conflicting" ? 0 : 1, model.FactoryCalls);
    }

    [Theory]
    [InlineData(null, 1)] [InlineData(false, 4)] [InlineData(true, 2)] [InlineData(false, int.MinValue)]
    public async Task Allowed_projection_preserves_canonical_case_status_and_nullable_lock(bool? locked, int status)
    {
        var model = new Model { Canonical = "Synthetic.Actor", Status = status, Locked = locked };
        var result = await Run(model); Assert.Equal(0, result.Exit);
        var observation = Report(result.Text).GetProperty("observation");
        Assert.Equal(["canonicalPrincipalId", "documentId", "branchId", "statusId", "isLocked", "databaseBindingId",
            "singletonId", "schemaVersion", "schemaMatchesWriter", "databaseDurabilityEligible"],
            observation.EnumerateObject().Select(property => property.Name).ToArray());
        Assert.Equal("Synthetic.Actor", observation.GetProperty("canonicalPrincipalId").GetString());
        Assert.Equal("SYNTHETIC-PR-1", observation.GetProperty("documentId").GetString());
        Assert.Equal("SYNTHETIC-B1", observation.GetProperty("branchId").GetString());
        Assert.Equal(status, observation.GetProperty("statusId").GetInt32());
        if (locked is null) Assert.Equal(JsonValueKind.Null, observation.GetProperty("isLocked").ValueKind);
        else Assert.Equal(locked.Value, observation.GetProperty("isLocked").GetBoolean());
        Assert.Equal(Binding, observation.GetProperty("databaseBindingId").GetGuid());
        Assert.DoesNotContain("SYNTHETIC-GROUP", result.Text);
        Assert.DoesNotContain("canEdit", result.Text); Assert.DoesNotContain("runtimeAccepted", result.Text);
    }

    [Theory]
    [InlineData(0, 0)] [InlineData(0, 1)] [InlineData(1, 0)] [InlineData(1, 1)]
    public async Task Negative_shape_or_durability_flags_are_observations_without_qualification(int durable, int shape)
    {
        var model = new Model { Durable = durable, Shape = shape }; var result = await Run(model);
        Assert.Equal(0, result.Exit); var observation = Report(result.Text).GetProperty("observation");
        Assert.Equal(durable == 1, observation.GetProperty("databaseDurabilityEligible").GetBoolean());
        Assert.Equal(shape == 1, observation.GetProperty("schemaMatchesWriter").GetBoolean());
    }

    [Fact]
    public async Task Only_fixed_SELECT_plans_execute_and_all_scope_values_are_typed_parameters()
    {
        var model = new Model();
        var args = Arguments("synthetic';SELECT 9;--", "synthetic';SELECT 8;--", "synthetic';SELECT 7;--");
        var result = await Run(model, args); Assert.Equal(0, result.Exit);
        Assert.Equal([PurchaseRequestSql.TransactionText, PurchaseRequestSql.TransactionText,
            PurchaseRequestPilotPreflight.ControlSql, PurchaseRequestSql.ProbeText,
            PurchaseRequestPilotPreflight.PrincipalSql, PurchaseRequestPilotPreflight.DocumentSql,
            PurchaseRequestSql.TransactionText], model.Commands.Select(command => command.CommandText).ToArray());
        Assert.All(model.Commands, command =>
        {
            Assert.StartsWith("SELECT", command.CommandText, StringComparison.Ordinal);
            Assert.Equal(CommandType.Text, command.CommandType); Assert.Equal(5, command.CommandTimeout);
            Assert.DoesNotContain("synthetic';", command.CommandText);
            Assert.DoesNotContain("Password", command.CommandText, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain("HoTen", command.CommandText, StringComparison.OrdinalIgnoreCase);
            // The unchanged metadata plan names business columns to check their
            // types, but none of the row projections may retrieve their values.
            if (command.CommandText != PurchaseRequestSql.ProbeText)
                Assert.DoesNotContain("PersonSuggest", command.CommandText, StringComparison.OrdinalIgnoreCase);
        });
        var principal = Assert.Single(model.Commands, command => command.CommandText == PurchaseRequestPilotPreflight.PrincipalSql);
        var actor = Assert.Single(principal.Parameters.Cast<DbParameter>());
        Assert.Equal("@username", actor.ParameterName); Assert.Equal(DbType.AnsiString, actor.DbType);
        Assert.Equal(100, actor.Size); Assert.Equal(args[2], actor.Value);
        var document = Assert.Single(model.Commands, command => command.CommandText == PurchaseRequestPilotPreflight.DocumentSql);
        Assert.Equal(2, document.Parameters.Count);
        Assert.Equal(DbType.String, document.Parameters["@document"].DbType);
        Assert.Equal(DbType.String, document.Parameters["@branch"].DbType);
        Assert.Equal(50, document.Parameters["@document"].Size); Assert.Equal(50, document.Parameters["@branch"].Size);
        Assert.Equal(args[4], document.Parameters["@document"].Value); Assert.Equal(args[6], document.Parameters["@branch"].Value);
        Assert.Contains("WHERE U.UserName=@username", principal.CommandText);
        Assert.DoesNotContain("COLLATE", principal.CommandText); Assert.DoesNotContain("DISTINCT", principal.CommandText);
        Assert.Contains("DATALENGTH(PurchaseRequestID)=DATALENGTH(@document)", document.CommandText);
        Assert.Contains("DATALENGTH(CONVERT(nvarchar(max),BranchID))=DATALENGTH(@branch)", document.CommandText);
        Assert.DoesNotContain("WHERE", PurchaseRequestPilotPreflight.ControlSql);
        Assert.Equal(0, model.ForbiddenCalls); Assert.Equal(7, model.CommandDisposals); Assert.Equal(7, model.ReaderDisposals);
        Assert.Equal(["rollback", "transaction-dispose", "connection-dispose"], model.Steps.TakeLast(3).ToArray());
    }

    public static IEnumerable<object[]> MalformedResults()
    {
        foreach (var stage in new[] { "before", "owned", "control", "schema", "principal", "document", "final" })
        foreach (var mutation in new[] { "no-rows", "duplicate", "extra-set", "missing-column", "extra-column", "wrong-type", "null" })
            yield return [stage, mutation];
    }

    [Theory]
    [MemberData(nameof(MalformedResults))]
    public async Task Ambiguous_missing_malformed_or_extra_results_fail_closed(string stage, string mutation)
    {
        var model = new Model { ExtraResultAt = mutation == "extra-set" ? stage : null };
        model.Transform = (current, table) =>
        {
            if (current != stage) return table;
            switch (mutation)
            {
                case "no-rows": table.Rows.Clear(); break;
                case "duplicate": table.Rows.Add(table.Rows[0].ItemArray); break;
                case "missing-column": table.Columns.RemoveAt(table.Columns.Count - 1); break;
                case "extra-column": table.Columns.Add("Unexpected", typeof(string)); break;
                case "wrong-type":
                    var replacement = new DataTable();
                    foreach (DataColumn column in table.Columns) replacement.Columns.Add(column.ColumnName, typeof(string));
                    replacement.Rows.Add(table.Columns.Cast<DataColumn>().Select(_ => (object)SecretMarker).ToArray());
                    return replacement;
                case "null": table.Rows[0][0] = DBNull.Value; break;
            }
            return table;
        };
        Failed(await Run(model), model);
        Assert.Equal(stage == "before" ? 0 : 1, model.Rollbacks);
        Assert.Equal(1, model.ConnectionDisposals);
    }

    public static IEnumerable<object[]> InvalidValues()
    {
        yield return ["control", 0, (byte)2]; yield return ["control", 1, 2]; yield return ["control", 2, Guid.Empty];
        foreach (var index in new[] { 0, 1, 2 }) yield return ["control", index, DBNull.Value];
        yield return ["schema", 0, 2]; yield return ["schema", 1, Guid.Parse("908305a3-5076-405e-a967-145c395a2435")];
        yield return ["schema", 2, -1]; yield return ["schema", 2, 2]; yield return ["schema", 3, -1]; yield return ["schema", 3, 2];
        foreach (var index in new[] { 0, 1, 2, 3 }) yield return ["schema", index, DBNull.Value];
        yield return ["principal", 1, true]; yield return ["principal", 3, true];
        foreach (var index in new[] { 0, 1, 2, 3 }) yield return ["principal", index, DBNull.Value];
        foreach (var invalid in new[] { "", " ", " padded", "padded ", "a\0b", "a\nb", "*", "?" })
        { yield return ["principal", 0, invalid]; yield return ["principal", 2, invalid]; }
        yield return ["principal", 0, new string('x', 101)]; yield return ["principal", 2, new string('x', 51)];
        yield return ["document", 0, "synthetic-pr-1"]; yield return ["document", 0, "SYNTHETIC-PR-1 "];
        yield return ["document", 1, "synthetic-b1"]; yield return ["document", 1, "SYNTHETIC-B1\0"];
        foreach (var index in new[] { 0, 1, 2 }) yield return ["document", index, DBNull.Value];
        foreach (var stage in new[] { "before", "owned", "final" })
        {
            yield return [stage, 0, stage == "before" ? 1 : 2];
            yield return [stage, 1, -1]; yield return [stage, 1, DBNull.Value];
        }
    }

    [Theory]
    [MemberData(nameof(InvalidValues))]
    public async Task Invalid_control_scope_or_inactive_principal_values_are_not_printed(string stage, int index, object value)
    {
        var model = new Model { Transform = (current, table) => { if (current == stage) table.Rows[0][index] = value; return table; } };
        Failed(await Run(model), model);
        Assert.Equal(1, model.ConnectionDisposals);
    }

    [Theory]
    [InlineData("before-server")] [InlineData("before-database")]
    [InlineData("after-server")] [InlineData("after-database")]
    public async Task Target_must_match_before_and_after_open(string mismatch)
    {
        var model = new Model { TargetMismatch = mismatch }; Failed(await Run(model), model);
        Assert.Equal(mismatch.StartsWith("before", StringComparison.Ordinal) ? 0 : 1, model.Opens);
        Assert.Equal(0, model.Begins); Assert.Empty(model.Commands); Assert.Equal(1, model.ConnectionDisposals);
    }

    [Theory]
    [InlineData("null")] [InlineData("preopened")] [InlineData("foreign")]
    [InlineData("isolation")]
    public async Task Connection_and_transaction_ownership_are_required(string fault)
    {
        var model = new Model { NullConnection = fault == "null", Preopened = fault == "preopened",
            ForeignTransaction = fault == "foreign", WrongIsolation = fault == "isolation" };
        Failed(await Run(model), model);
        Assert.Equal(fault == "isolation" ? 1 : 0, model.Rollbacks);
        Assert.Equal(fault == "isolation" ? 1 : 0, model.TransactionDisposals);
        Assert.Equal(fault is "null" or "preopened" ? 0 : 1, model.ConnectionDisposals);
        Assert.Equal(0, model.ForeignDisposals);
    }

    [Fact]
    public async Task Ambient_transaction_is_rejected_without_creating_a_connection()
    {
        using var scope = new System.Transactions.TransactionScope(System.Transactions.TransactionScopeAsyncFlowOption.Enabled);
        var model = new Model(); Failed(await Run(model), model); Assert.Equal(0, model.FactoryCalls);
    }

    [Theory]
    [InlineData("factory")] [InlineData("open")] [InlineData("before")] [InlineData("begin")]
    [InlineData("owned")] [InlineData("control")] [InlineData("schema")] [InlineData("principal")]
    [InlineData("document")] [InlineData("final")]
    [InlineData("rollback")] [InlineData("transaction-dispose")] [InlineData("connection-dispose")]
    [InlineData("reader-dispose")] [InlineData("command-dispose")]
    public async Task Every_operation_failure_is_redacted_nonzero_and_cleanup_is_attempted(string fault)
    {
        var model = new Model { FailAt = fault }; var result = await Run(model); Failed(result, model);
        Assert.Equal(fault == "factory" ? 0 : 1, model.ConnectionDisposals);
        if (fault is "rollback" or "transaction-dispose" or "connection-dispose")
        {
            Assert.Equal("cleanup_failed", Report(result.Text).GetProperty("code").GetString());
            Assert.Equal(1, model.Rollbacks); Assert.Equal(1, model.TransactionDisposals);
        }
    }

    [Theory]
    [InlineData("open")] [InlineData("control")] [InlineData("document")] [InlineData("final")]
    [InlineData("rollback")] [InlineData("transaction-dispose")] [InlineData("connection-dispose")]
    public async Task Cancellation_during_work_or_cleanup_cannot_release_an_observation(string stage)
    {
        using var cancellation = new CancellationTokenSource();
        var model = new Model { OnStep = current => { if (current == stage) cancellation.Cancel(); } };
        var result = await Run(model, token: cancellation.Token); Failed(result, model);
        Assert.Equal("cancelled_or_timed_out", Report(result.Text).GetProperty("code").GetString());
        Assert.Equal(1, model.ConnectionDisposals);
        Assert.False(model.RollbackTokenCanBeCancelled);
    }

    [Fact]
    public async Task Already_cancelled_invocation_never_creates_a_connection()
    {
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        var model = new Model(); Failed(await Run(model, token: cancellation.Token), model); Assert.Equal(0, model.FactoryCalls);
    }

    [Theory]
    [InlineData(false, false)] [InlineData(false, true)] [InlineData(true, false)] [InlineData(true, true)]
    public async Task Broken_output_is_nonthrowing_and_never_retried(bool invalidArguments, bool asynchronous)
    {
        using var configuration = Configuration(); using var output = new ThrowingWriter(asynchronous); var model = new Model();
        Assert.Equal(4, await PurchaseRequestPilotPreflight.RunCoreAsync(invalidArguments ? [] : Arguments(), configuration, output, model.Create));
        Assert.Equal(1, output.Attempts); Assert.Equal(invalidArguments ? 0 : 1, model.ConnectionDisposals);
        Assert.Equal(invalidArguments ? 0 : 1, model.Rollbacks);
    }

    private sealed class ThrowingWriter(bool asynchronous) : StringWriter
    {
        internal int Attempts;
        public override Task WriteLineAsync(string? value)
        {
            Attempts++;
            if (asynchronous) return Task.FromException(new IOException(SecretMarker));
            throw new IOException(SecretMarker);
        }
    }

    private sealed class Model
    {
        internal string Canonical = "Synthetic.Actor";
        internal int Status = 1, Durable = 1, Shape = 1;
        internal bool? Locked;
        internal bool NullConnection, Preopened, ForeignTransaction, WrongIsolation;
        internal bool RollbackTokenCanBeCancelled;
        internal string? TargetMismatch, FailAt, ExtraResultAt;
        internal string ResolvedConnection = "";
        internal int FactoryCalls, Opens, Begins, Rollbacks, TransactionDisposals, ConnectionDisposals,
            ForeignDisposals, CommandDisposals, ReadersCreated, ReaderDisposals, ForbiddenCalls, TransactionReads;
        internal Action<string>? OnStep;
        internal Func<string, DataTable, DataTable>? Transform;
        internal List<string> Steps { get; } = [];
        internal List<Command> Commands { get; } = [];

        internal void Step(string stage)
        {
            Steps.Add(stage); OnStep?.Invoke(stage);
            if (stage == FailAt) throw new InvalidOperationException(SecretMarker);
        }
        internal DbConnection Create(string connectionString)
        {
            FactoryCalls++; Step("factory"); ResolvedConnection = connectionString;
            return NullConnection ? null! : new Connection(this, connectionString, false);
        }
        internal DataTable Result(string stage, Command command)
        {
            Type[] types; object[] values;
            switch (stage)
            {
                case "before": types = [typeof(int), typeof(int)]; values = [0, 0]; break;
                case "owned": case "final": types = [typeof(int), typeof(int)]; values = [1, 1]; break;
                case "control": types = [typeof(byte), typeof(int), typeof(Guid)]; values = [(byte)1, 1, Binding]; break;
                case "schema": types = [typeof(int), typeof(Guid), typeof(int), typeof(int)]; values = [1, Binding, Durable, Shape]; break;
                case "principal": types = [typeof(string), typeof(bool), typeof(string), typeof(bool)]; values = [Canonical, false, "SYNTHETIC-GROUP", false]; break;
                case "document": types = [typeof(string), typeof(string), typeof(int), typeof(bool)];
                    values = [command.Parameters["@document"].Value!, command.Parameters["@branch"].Value!, Status, (object?)Locked ?? DBNull.Value]; break;
                default: ForbiddenCalls++; throw new InvalidOperationException("Forbidden SQL: " + SecretMarker);
            }
            var table = new DataTable();
            for (var index = 0; index < types.Length; index++) table.Columns.Add("Column" + index, types[index]);
            table.Rows.Add(values);
            return Transform?.Invoke(stage, table) ?? table;
        }
    }

    private sealed class Connection(Model model, string connectionString, bool foreign) : DbConnection
    {
        private ConnectionState state = model.Preopened ? ConnectionState.Open : ConnectionState.Closed;
        private readonly SqlConnectionStringBuilder settings = new(connectionString);
        [AllowNull] public override string ConnectionString { get; set; } = connectionString;
        public override string Database => model.TargetMismatch == (state == ConnectionState.Open ? "after-database" : "before-database") ? "OtherSynthetic" : settings.InitialCatalog;
        public override string DataSource => model.TargetMismatch == (state == ConnectionState.Open ? "after-server" : "before-server") ? "other.example.invalid" : settings.DataSource;
        public override string ServerVersion => "synthetic";
        public override ConnectionState State => state;
        public override void Open() { model.Opens++; model.Step("open"); state = ConnectionState.Open; }
        public override Task OpenAsync(CancellationToken token)
        { token.ThrowIfCancellationRequested(); Open(); token.ThrowIfCancellationRequested(); return Task.CompletedTask; }
        public override void Close() => state = ConnectionState.Closed;
        public override void ChangeDatabase(string databaseName) { model.ForbiddenCalls++; throw new NotSupportedException(); }
        protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
        {
            Assert.Equal(IsolationLevel.Serializable, isolationLevel); model.Begins++; model.Step("begin");
            return new Transaction(model.ForeignTransaction ? new Connection(model, ConnectionString, true) : this,
                model, model.WrongIsolation ? IsolationLevel.ReadCommitted : isolationLevel);
        }
        protected override DbCommand CreateDbCommand()
        { var command = new Command(this, model); model.Commands.Add(command); return command; }
        public override ValueTask DisposeAsync()
        {
            if (foreign) model.ForeignDisposals++; else model.ConnectionDisposals++;
            Close(); model.Step("connection-dispose"); return ValueTask.CompletedTask;
        }
    }

    private sealed class Transaction(DbConnection owner, Model model, IsolationLevel isolation) : DbTransaction
    {
        public override IsolationLevel IsolationLevel => isolation;
        protected override DbConnection DbConnection => owner;
        public override void Commit() { model.ForbiddenCalls++; throw new InvalidOperationException(SecretMarker); }
        public override void Rollback() { model.Rollbacks++; model.Step("rollback"); }
        public override Task RollbackAsync(CancellationToken token = default)
        { model.RollbackTokenCanBeCancelled = token.CanBeCanceled; Rollback(); return Task.CompletedTask; }
        public override ValueTask DisposeAsync()
        { model.TransactionDisposals++; model.Step("transaction-dispose"); return ValueTask.CompletedTask; }
    }

    private sealed class Command(Connection owner, Model model) : DbCommand
    {
        [AllowNull] public override string CommandText { get; set; } = "";
        public override int CommandTimeout { get; set; }
        public override CommandType CommandType { get; set; }
        public override bool DesignTimeVisible { get; set; }
        public override UpdateRowSource UpdatedRowSource { get; set; }
        protected override DbConnection? DbConnection { get => owner; set => throw new NotSupportedException(); }
        protected override DbTransaction? DbTransaction { get; set; }
        protected override DbParameterCollection DbParameterCollection { get; } = new RecordingParameters();
        protected override DbParameter CreateDbParameter() => new RecordingParameter();
        public override void Cancel() { }
        public override void Prepare() { model.ForbiddenCalls++; throw new NotSupportedException(); }
        public override object ExecuteScalar() { model.ForbiddenCalls++; throw new InvalidOperationException(SecretMarker); }
        public override int ExecuteNonQuery() { model.ForbiddenCalls++; throw new InvalidOperationException(SecretMarker); }
        protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)
        {
            Assert.Equal(5, CommandTimeout); Assert.Equal(CommandType.Text, CommandType);
            var stage = CommandText == PurchaseRequestSql.TransactionText ? ++model.TransactionReads switch { 1 => "before", 2 => "owned", _ => "final" }
                : CommandText == PurchaseRequestPilotPreflight.ControlSql ? "control"
                : CommandText == PurchaseRequestSql.ProbeText ? "schema"
                : CommandText == PurchaseRequestPilotPreflight.PrincipalSql ? "principal"
                : CommandText == PurchaseRequestPilotPreflight.DocumentSql ? "document" : "forbidden";
            if (stage == "before") Assert.Null(DbTransaction);
            else { Assert.Same(owner, DbTransaction!.Connection); Assert.Equal(IsolationLevel.Serializable, DbTransaction.IsolationLevel); }
            model.Step(stage); var table = model.Result(stage, this); model.ReadersCreated++;
            return new Reader(new DataTableReader(model.ExtraResultAt == stage ? [table, table.Copy()] : [table]), model);
        }
        protected override Task<DbDataReader> ExecuteDbDataReaderAsync(CommandBehavior behavior, CancellationToken token)
        {
            token.ThrowIfCancellationRequested(); var reader = ExecuteDbDataReader(behavior);
            if (token.IsCancellationRequested) { reader.Dispose(); token.ThrowIfCancellationRequested(); }
            return Task.FromResult(reader);
        }
        public override ValueTask DisposeAsync()
        { model.CommandDisposals++; model.Step("command-dispose"); return ValueTask.CompletedTask; }
    }

    private sealed class Reader(DbDataReader inner, Model model) : DbDataReader
    {
        private bool disposed;
        public override object this[int ordinal] => inner[ordinal]; public override object this[string name] => inner[name];
        public override int Depth => inner.Depth; public override int FieldCount => inner.FieldCount;
        public override bool HasRows => inner.HasRows; public override bool IsClosed => inner.IsClosed; public override int RecordsAffected => inner.RecordsAffected;
        public override bool Read() => inner.Read(); public override bool NextResult() => inner.NextResult(); public override void Close() => inner.Close();
        public override string GetName(int ordinal) => inner.GetName(ordinal); public override string GetDataTypeName(int ordinal) => inner.GetDataTypeName(ordinal);
        public override Type GetFieldType(int ordinal) => inner.GetFieldType(ordinal); public override object GetValue(int ordinal) => inner.GetValue(ordinal);
        public override int GetValues(object[] values) => inner.GetValues(values); public override int GetOrdinal(string name) => inner.GetOrdinal(name);
        public override bool GetBoolean(int ordinal) => inner.GetBoolean(ordinal); public override byte GetByte(int ordinal) => inner.GetByte(ordinal);
        public override long GetBytes(int ordinal, long offset, byte[]? buffer, int bufferOffset, int length) => inner.GetBytes(ordinal, offset, buffer, bufferOffset, length);
        public override char GetChar(int ordinal) => inner.GetChar(ordinal);
        public override long GetChars(int ordinal, long offset, char[]? buffer, int bufferOffset, int length) => inner.GetChars(ordinal, offset, buffer, bufferOffset, length);
        public override Guid GetGuid(int ordinal) => inner.GetGuid(ordinal); public override short GetInt16(int ordinal) => inner.GetInt16(ordinal);
        public override int GetInt32(int ordinal) => inner.GetInt32(ordinal); public override long GetInt64(int ordinal) => inner.GetInt64(ordinal);
        public override float GetFloat(int ordinal) => inner.GetFloat(ordinal); public override double GetDouble(int ordinal) => inner.GetDouble(ordinal);
        public override string GetString(int ordinal) => inner.GetString(ordinal); public override decimal GetDecimal(int ordinal) => inner.GetDecimal(ordinal);
        public override DateTime GetDateTime(int ordinal) => inner.GetDateTime(ordinal); public override bool IsDBNull(int ordinal) => inner.IsDBNull(ordinal);
        public override IEnumerator GetEnumerator() => ((IEnumerable)inner).GetEnumerator();
        protected override void Dispose(bool disposing)
        {
            if (disposing && !disposed) { disposed = true; model.ReaderDisposals++; inner.Dispose(); model.Step("reader-dispose"); }
            base.Dispose(disposing);
        }
    }
}
