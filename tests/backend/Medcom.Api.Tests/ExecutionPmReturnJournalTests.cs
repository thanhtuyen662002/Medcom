using System.Collections;
using System.Data;
using System.Data.Common;
using System.Data.SqlTypes;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Medcom.Application.Transfers;
using Medcom.Infrastructure.Execution.PmReturn;
using Xunit;

namespace Medcom.Api.Tests;

// Recording doubles only. Never constructs a SqlConnection or executes the schema artifact.
public sealed class ExecutionPmReturnJournalTests
{
    private static PmReturnSubmittedIntent Intent => I07Fixtures.Intent();
    private static PmReturnReplayAuthority Authority => I07Fixtures.Authority();
    private static PreparedPmReturn Prepared => I06Fixtures.Prepare();
    private static SqlPmReturnJournalStore Store(RecordingConnection connection) => new(I07Fixtures.Binding, () => connection);

    [Fact]
    public async Task Reservation_uses_real_store_control_flow_and_only_returns_ownership_after_ack()
    {
        var connection = new RecordingConnection();
        var result = await Store(connection).TryReserveAsync(Intent, Authority, Prepared);
        Assert.Equal(PmReturnJournalResultKind.Reserved, result.Kind);
        Assert.NotNull(result.Reservation);
        Assert.True(connection.Committed);
        Assert.Equal(connection.Rows.Rows[0]["AttemptId"], result.Reservation.AttemptId);
        Assert.Equal(Intent.Key, result.Reservation.Key);
        Assert.False(result.PermitsDispatch);
        Assert.False(result.Reservation.PermitsDispatch);
        Assert.Equal(new[] { "open", "begin", "probe", "lookup", "insert", "lookup", "commit", "transaction-dispose", "connection-dispose" }, connection.Operations);
        Assert.Equal(IsolationLevel.Serializable, connection.Isolation);
        Assert.True(connection.WasDisposed);
        Assert.Single(connection.Commands, c => c.CommandText == PmReturnJournalSql.InsertText);
        Assert.Empty(typeof(PmReturnReservationAcknowledgment).GetConstructors());
    }

    [Fact]
    public async Task Explicit_absence_requires_valid_probe_and_successful_read_commit()
    {
        var connection = new RecordingConnection();
        var result = await Store(connection).ReadAsync(Intent, Authority);
        Assert.Equal(PmReturnJournalResultKind.Observed, result.Kind);
        Assert.Equal(PmReturnJournalState.Absent, result.Observation!.State);
        Assert.Null(result.Reservation);
        Assert.DoesNotContain("insert", connection.Operations);
        Assert.True(connection.Committed);
    }

    [Theory]
    [InlineData(1, false)] [InlineData(1, true)]
    [InlineData(4, false)] [InlineData(4, true)]
    [InlineData(0, false)] [InlineData(0, true)]
    public async Task SQL_equal_zero_extended_slot_reaches_codec_and_never_becomes_absence_or_reservation(int extension, bool reserve)
    {
        var exact = PmReturnJournalCodec.EncodeSlot(Intent.Key);
        var padded = new byte[extension == 0 ? PmReturnJournalCodec.MaximumSlotBytes : exact.Length + extension];
        exact.CopyTo(padded, 0);
        Assert.True((new SqlBinary(exact) == new SqlBinary(padded)).IsTrue);
        Assert.False(exact.AsSpan().SequenceEqual(padded));
        Assert.InRange(padded.Length, 1, PmReturnJournalCodec.MaximumSlotBytes);
        var connection = new RecordingConnection { EvaluateLookupPredicates = true, Rows = Rows(Intent) };
        connection.Rows.Rows[0]["Slot"] = padded;
        using (var reader = connection.Rows.CreateDataReader())
        {
            Assert.True(reader.Read());
            Assert.Null(PmReturnJournalCodec.Decode(reader, Intent.Key));
        }
        var result = reserve
            ? await Store(connection).TryReserveAsync(Intent, Authority, Prepared)
            : await Store(connection).ReadAsync(Intent, Authority);
        Assert.Equal(PmReturnJournalResultKind.Unavailable, result.Kind);
        Assert.Null(result.Observation);
        Assert.Null(result.Reservation);
        Assert.False(result.PermitsDispatch);
        Assert.DoesNotContain("insert", connection.Operations);
        Assert.DoesNotContain("commit", connection.Operations);
    }

    [Theory]
    [InlineData(1, false)] [InlineData(1, true)]
    [InlineData(2, false)] [InlineData(2, true)]
    [InlineData(3, false)] [InlineData(3, true)]
    [InlineData(4, false)] [InlineData(4, true)]
    public async Task WHERE_aware_lookup_preserves_exact_committed_and_retained_rows(int state, bool reserve)
    {
        var connection = new RecordingConnection { EvaluateLookupPredicates = true, Rows = Rows(Intent, state) };
        var result = reserve
            ? await Store(connection).TryReserveAsync(Intent, Authority, Prepared)
            : await Store(connection).ReadAsync(Intent, Authority);
        Assert.Equal(state == 1 ? PmReturnJournalResultKind.Observed : PmReturnJournalResultKind.Blocked, result.Kind);
        Assert.Null(result.Reservation);
        Assert.False(result.PermitsDispatch);
        Assert.True(connection.Committed);
        Assert.DoesNotContain("insert", connection.Operations);
        if (state == 1) Assert.Equal(PmReturnReplayDisposition.ReplayOriginalReceipt,
            PmReturnReplayPolicy.Evaluate(Intent, Authority, result.Observation).Disposition);
        else Assert.Null(result.Observation);
    }

    [Theory]
    [InlineData("empty", false)] [InlineData("empty", true)]
    [InlineData("different-binding", false)] [InlineData("different-binding", true)]
    [InlineData("different-slot", false)] [InlineData("different-slot", true)]
    public async Task WHERE_aware_exact_empty_scope_preserves_absence_and_acknowledged_reservation(string rows, bool reserve)
    {
        var connection = new RecordingConnection { EvaluateLookupPredicates = true };
        if (rows != "empty")
        {
            var otherKey = rows == "different-binding" ? Intent.Key with { DatabaseBindingId = I07Fixtures.OtherBinding }
                : Intent.Key with { Actor = "other.pm" };
            connection.Rows = Rows(I07Fixtures.Intent(otherKey));
        }
        var result = reserve
            ? await Store(connection).TryReserveAsync(Intent, Authority, Prepared)
            : await Store(connection).ReadAsync(Intent, Authority);
        Assert.Equal(reserve ? PmReturnJournalResultKind.Reserved : PmReturnJournalResultKind.Observed, result.Kind);
        Assert.True(connection.Committed);
        Assert.False(result.PermitsDispatch);
        if (reserve)
        {
            Assert.NotNull(result.Reservation);
            Assert.Equal(Intent.Key, result.Reservation.Key);
            Assert.True(connection.Operations.IndexOf("insert") < connection.Operations.IndexOf("commit"));
            Assert.Null(result.Observation);
        }
        else
        {
            Assert.Equal(PmReturnJournalState.Absent, result.Observation!.State);
            Assert.Null(result.Reservation);
            Assert.DoesNotContain("insert", connection.Operations);
        }
    }

    [Theory]
    [InlineData(2)] [InlineData(3)] [InlineData(4)]
    public async Task Retained_matching_states_never_reserve_or_take_over(int state)
    {
        var connection = new RecordingConnection { Rows = Rows(Intent, state) };
        var result = await Store(connection).TryReserveAsync(Intent, Authority, Prepared);
        Assert.Equal(PmReturnJournalResultKind.Blocked, result.Kind);
        Assert.Null(result.Reservation);
        Assert.DoesNotContain("insert", connection.Operations);
    }

    [Theory]
    [InlineData("DocumentKey")] [InlineData("SubmissionIdentity")] [InlineData("SourceProcedureSha256")]
    public async Task Changed_correlation_conflicts_in_same_slot(string field)
    {
        var connection = new RecordingConnection { Rows = Rows(Intent) };
        connection.Rows.Rows[0][field] = field switch { "DocumentKey" => "OTHER", "SubmissionIdentity" => PmReturnJournalCodec.SubmissionPrefix + new string('b', 64), _ => new string('b', 64) };
        var result = await Store(connection).TryReserveAsync(Intent, Authority, Prepared);
        Assert.Equal(PmReturnJournalResultKind.Conflict, result.Kind);
        Assert.DoesNotContain("insert", connection.Operations);
    }

    [Fact]
    public async Task Committed_observation_reuses_original_I07_receipt_after_status_and_version_changes()
    {
        var connection = new RecordingConnection { Rows = Rows(Intent, 1) };
        var result = await Store(connection).ReadAsync(Intent, I07Fixtures.Authority(state: I06Fixtures.State(head: I06Fixtures.Head with { Status = 30, UpdatedAt = new DateTime(2026, 10, 6) })));
        Assert.Equal(PmReturnJournalResultKind.Observed, result.Kind);
        var replay = PmReturnReplayPolicy.Evaluate(Intent, I07Fixtures.Authority(state: I06Fixtures.State(head: I06Fixtures.Head with { Status = 30, UpdatedAt = new DateTime(2026, 10, 6) })), result.Observation);
        Assert.Equal(PmReturnReplayDisposition.ReplayOriginalReceipt, replay.Disposition);
        Assert.Equal(new string('c', 64), replay.OriginalReceipt!.CommandFingerprint);
        Assert.DoesNotContain("insert", connection.Operations);
        Assert.False(replay.PermitsDispatch);
    }

    [Fact]
    public async Task Denied_or_invalid_input_and_pre_cancellation_do_not_touch_factory()
    {
        var calls = 0;
        var store = new SqlPmReturnJournalStore(I07Fixtures.Binding, () => { calls++; throw new InvalidOperationException("synthetic-only"); });
        Assert.Equal(PmReturnJournalResultKind.Denied, (await store.ReadAsync(Intent, null)).Kind);
        Assert.Equal(PmReturnJournalResultKind.InvalidInput, (await store.ReadAsync(null, Authority)).Kind);
        Assert.Equal(PmReturnJournalResultKind.InvalidInput, (await store.TryReserveAsync(Intent, Authority, null)).Kind);
        Assert.Equal(PmReturnJournalResultKind.CancelledBeforeIo, (await store.ReadAsync(Intent, Authority, new(true))).Kind);
        var otherBinding = new SqlPmReturnJournalStore(Guid.NewGuid(), () => { calls++; return new RecordingConnection(); });
        Assert.Equal(PmReturnJournalResultKind.InvalidInput, (await otherBinding.ReadAsync(Intent, Authority)).Kind);
        Assert.Equal(0, calls);
    }

    [Theory]
    [InlineData("MetadataCount")] [InlineData("SchemaVersion")] [InlineData("ShapeOk")] [InlineData("IndexesOk")]
    [InlineData("ConstraintsOk")] [InlineData("Writable")] [InlineData("FullDurability")] [InlineData("TransactionOk")]
    public async Task Schema_and_environment_mismatch_are_not_absence(string column)
    {
        var connection = new RecordingConnection();
        connection.Probe.Rows[0][column] = 0;
        var result = await Store(connection).ReadAsync(Intent, Authority);
        Assert.Equal(PmReturnJournalResultKind.Unavailable, result.Kind);
        Assert.Null(result.Observation);
        Assert.DoesNotContain("lookup", connection.Operations);
    }

    [Theory]
    [InlineData("binding")] [InlineData("artifact")] [InlineData("missing")] [InlineData("duplicate")]
    [InlineData("extra-result")] [InlineData("columns")] [InlineData("constraint")]
    public async Task Probe_marker_shape_or_definition_errors_fail_closed(string defect)
    {
        var connection = new RecordingConnection();
        switch (defect)
        {
            case "binding": connection.Probe.Rows[0]["DatabaseBindingId"] = Guid.NewGuid(); break;
            case "artifact": connection.Probe.Rows[0]["ArtifactSha256"] = new string('a', 64); break;
            case "missing": connection.Probe.Rows.Clear(); break;
            case "duplicate": connection.Probe.ImportRow(connection.Probe.Rows[0]); break;
            case "extra-result": connection.ExtraProbe = true; break;
            case "columns": connection.Probe.Columns[0].ColumnName = "Wrong"; break;
            default: connection.Probe.Rows[0]["StateCheck"] = "State=1 OR State=2 OR State=3 OR State=4 OR State=5"; break;
        }
        Assert.Equal(PmReturnJournalResultKind.Unavailable, (await Store(connection).ReadAsync(Intent, Authority)).Kind);
        Assert.DoesNotContain("lookup", connection.Operations);
    }

    [Theory]
    [InlineData("DatabaseBindingId")] [InlineData("Slot")] [InlineData("TenantId")] [InlineData("Actor")]
    [InlineData("State")] [InlineData("AttemptId")] [InlineData("OriginalExecutionFingerprint")]
    [InlineData("null")] [InlineData("duplicate")] [InlineData("extra-result")] [InlineData("columns")]
    public async Task Malformed_lookup_row_is_never_absence_or_ownership(string defect)
    {
        var connection = new RecordingConnection { Rows = Rows(Intent) };
        var row = connection.Rows.Rows[0];
        switch (defect)
        {
            case "DatabaseBindingId": row[defect] = Guid.NewGuid(); break;
            case "Slot": row[defect] = new byte[] { 1 }; break;
            case "TenantId": row[defect] = "TENANT"; break;
            case "Actor": row[defect] = "PM.ONE"; break;
            case "State": row[defect] = 99; break;
            case "AttemptId": row[defect] = Guid.Empty; break;
            case "OriginalExecutionFingerprint": row[defect] = new string('c', 64); break;
            case "null": row["DocumentKey"] = DBNull.Value; break;
            case "duplicate": connection.Rows.ImportRow(row); break;
            case "extra-result": connection.ExtraLookup = true; break;
            default: connection.Rows.Columns[0].ColumnName = "Wrong"; break;
        }
        var result = await Store(connection).ReadAsync(Intent, Authority);
        Assert.Equal(PmReturnJournalResultKind.Unavailable, result.Kind);
        Assert.Null(result.Observation);
    }

    [Theory]
    [InlineData("version")] [InlineData("bindingId")] [InlineData("tenantId")] [InlineData("companyId")]
    [InlineData("actor")] [InlineData("actionId")] [InlineData("idempotencyKey")] [InlineData("documentKey")]
    [InlineData("submissionIdentity")] [InlineData("sourceProcedureSha256")] [InlineData("originalExecutionFingerprint")]
    [InlineData("auditId")] [InlineData("outcome")] [InlineData("observedPostStatus")] [InlineData("rejectionCode")]
    [InlineData("duplicate")] [InlineData("unknown")] [InlineData("missing")] [InlineData("invalid-json")]
    public async Task Malformed_receipt_never_replays(string field)
    {
        var connection = new RecordingConnection { Rows = Rows(Intent, 1) };
        var text = (string)connection.Rows.Rows[0]["ReceiptJson"];
        var body = JsonSerializer.Deserialize<Dictionary<string, object?>>(text)!;
        text = field switch
        {
            "duplicate" => text[..^1] + ",\"version\":1}",
            "unknown" => text[..^1] + ",\"unexpected\":true}",
            "invalid-json" => "{",
            _ => Mutate()
        };
        string Mutate()
        {
            if (field == "missing") body.Remove("version");
            else body[field] = field == "version" || field == "observedPostStatus" ? 99 : "altered";
            return JsonSerializer.Serialize(body);
        }
        connection.Rows.Rows[0]["ReceiptJson"] = text;
        var result = await Store(connection).ReadAsync(Intent, Authority);
        Assert.Equal(PmReturnJournalResultKind.Unavailable, result.Kind);
        Assert.Null(result.Observation);
    }

    [Theory]
    [InlineData("factory")] [InlineData("open")] [InlineData("begin")] [InlineData("probe")] [InlineData("lookup")]
    [InlineData("duplicate")] [InlineData("deadlock")] [InlineData("affected")] [InlineData("saved-row")]
    public async Task Provider_and_persistence_failures_never_grant_ownership(string defect)
    {
        var connection = new RecordingConnection { Fault = defect };
        var store = defect == "factory" ? new SqlPmReturnJournalStore(I07Fixtures.Binding,
            () => throw new IOException("synthetic-secret-never-log")) : Store(connection);
        var result = await store.TryReserveAsync(Intent, Authority, Prepared);
        Assert.Equal(PmReturnJournalResultKind.Unavailable, result.Kind);
        Assert.Null(result.Reservation);
        Assert.Null(result.Observation);
        Assert.False(result.PermitsDispatch);
        Assert.False(connection.Committed);
    }

    [Theory]
    [InlineData("before-ack")] [InlineData("after-ack")] [InlineData("cancel-ack")]
    public async Task Ambiguous_commit_never_discloses_ownership_or_absence(string fault)
    {
        using var cancel = new CancellationTokenSource();
        var connection = new RecordingConnection { Fault = fault, CommitCancel = cancel };
        var result = await Store(connection).TryReserveAsync(Intent, Authority, Prepared, cancel.Token);
        Assert.Equal(PmReturnJournalResultKind.OutcomeUnknown, result.Kind);
        Assert.Null(result.Reservation);
        Assert.Null(result.Observation);
        Assert.Single(connection.Operations, e => e == "insert");
    }

    [Fact]
    public async Task Cancellation_after_insert_before_commit_is_unavailable_without_ownership()
    {
        using var cancellation = new CancellationTokenSource();
        var connection = new RecordingConnection { InsertCancel = cancellation };
        var result = await Store(connection).TryReserveAsync(Intent, Authority, Prepared, cancellation.Token);
        Assert.Equal(PmReturnJournalResultKind.Unavailable, result.Kind);
        Assert.Null(result.Reservation);
        Assert.DoesNotContain("commit", connection.Operations);
    }

    [Fact]
    public async Task Already_open_or_wrong_isolation_and_ambient_transactions_are_rejected()
    {
        var connection = new RecordingConnection(); connection.Open();
        Assert.Equal(PmReturnJournalResultKind.Unavailable, (await Store(connection).ReadAsync(Intent, Authority)).Kind);
        Assert.False(connection.WasDisposed);
        connection = new() { WrongIsolation = true };
        Assert.Equal(PmReturnJournalResultKind.Unavailable, (await Store(connection).ReadAsync(Intent, Authority)).Kind);
        Assert.True(connection.WasDisposed);
        var calls = 0;
        using var scope = new System.Transactions.TransactionScope(System.Transactions.TransactionScopeAsyncFlowOption.Enabled);
        var store = new SqlPmReturnJournalStore(I07Fixtures.Binding, () => { calls++; return new RecordingConnection(); });
        Assert.Equal(PmReturnJournalResultKind.Unavailable, (await store.ReadAsync(Intent, Authority)).Kind);
        Assert.Equal(0, calls);
    }

    [Fact]
    public async Task Cleanup_errors_do_not_leak_or_turn_ack_into_absence()
    {
        var connection = new RecordingConnection { Fault = "dispose" };
        var result = await Store(connection).TryReserveAsync(Intent, Authority, Prepared);
        Assert.Equal(PmReturnJournalResultKind.Reserved, result.Kind);
        Assert.True(connection.Committed);
        Assert.False(result.PermitsDispatch);
    }

    [Fact]
    public async Task Command_parameters_keep_user_text_out_of_SQL_and_preserve_explicit_sizes()
    {
        var key = I07Fixtures.Key with { TenantId = "tenant'--", CompanyId = "c\u00f4ng-ty" };
        Assert.True(PmReturnSubmittedIntent.TryCreate(key, I06Fixtures.Request, out var intent));
        var connection = new RecordingConnection(); connection.Open();
        using var transaction = connection.BeginTransaction(IsolationLevel.Serializable);
        using var command = PmReturnJournalSql.Insert(connection, transaction, intent!, Guid.NewGuid());
        Assert.DoesNotContain(key.TenantId, command.CommandText);
        Assert.Equal(key.CompanyId, command.Parameters["@company"].Value);
        Assert.Equal(DbType.String, command.Parameters["@tenant"].DbType);
        Assert.Equal(100, command.Parameters["@tenant"].Size);
        Assert.Equal(DbType.AnsiString, command.Parameters["@actor"].DbType);
        Assert.Equal(50, command.Parameters["@actor"].Size);
        Assert.Equal(30, command.Parameters["@document"].Size);
        Assert.Equal(82, command.Parameters["@submission"].Size);
        Assert.Equal(DbType.Binary, command.Parameters["@slot"].DbType);
        Assert.Equal(871, command.Parameters["@slot"].Size);
        Assert.Equal(PmReturnJournalCodec.EncodeSlot(key), command.Parameters["@slot"].Value);
        Assert.DoesNotContain("@reason", command.Parameters.Cast<DbParameter>().Select(p => p.ParameterName));
        Assert.Same(transaction, command.Transaction);
        Assert.Equal(15, command.CommandTimeout);
        Assert.False(command.CommandText.Contains("UPDATE", StringComparison.OrdinalIgnoreCase));
        await Task.CompletedTask;
    }

    [Fact]
    public void Full_binary_slot_handles_case_unicode_length_framing_and_rejects_SQL_padding_aliases()
    {
        var original = PmReturnJournalCodec.EncodeSlot(I07Fixtures.Key);
        foreach (var different in new[] { I07Fixtures.Key with { TenantId = "TENANT" }, I07Fixtures.Key with { Actor = "PM.ONE" },
            I07Fixtures.Key with { TenantId = "ab", CompanyId = "c" }, I07Fixtures.Key with { TenantId = "a", CompanyId = "bc" },
            I07Fixtures.Key with { TenantId = "\u00e9" }, I07Fixtures.Key with { TenantId = "\U0001f9ea" } })
            Assert.NotEqual(Convert.ToHexString(original), Convert.ToHexString(PmReturnJournalCodec.EncodeSlot(different)));
        foreach (var bad in new[] { I07Fixtures.Key with { TenantId = "tenant " }, I07Fixtures.Key with { Actor = "pm.one " },
            I07Fixtures.Key with { IdempotencyKey = I07Fixtures.Key.IdempotencyKey + " " },
            I07Fixtures.Key with { TenantId = "e\u0301" }, I07Fixtures.Key with { TenantId = "\ud800" },
            I07Fixtures.Key with { TenantId = "a\0b" }, I07Fixtures.Key with { DatabaseBindingId = Guid.Empty } })
            Assert.Throws<ArgumentException>(() => PmReturnJournalCodec.EncodeSlot(bad));
        var maximal = I07Fixtures.Key with { TenantId = new string('\u0800', 100), CompanyId = new string('\u0800', 100),
            Actor = new string('a', 50), IdempotencyKey = new string('k', 100) };
        Assert.InRange(PmReturnJournalCodec.EncodeSlot(maximal).Length, 1, 871);
        Assert.NotEqual(0, original[^1]); // Valid keys cannot end in binary zero-padding aliases.
    }

    [Theory]
    [InlineData("State", "([State]=(1) OR [State]=(2) OR [State]=(3) OR [State]=(4))", true)]
    [InlineData("State", "State=1 OR State=2 OR State=3", false)]
    [InlineData("State", "State=1 OR State=2 OR State=3 OR State=4 OR State=5", false)]
    [InlineData("Slot", "(DATALENGTH([Slot])>(0))", true)]
    [InlineData("Slot", "DATALENGTH(Slot)>1", false)]
    [InlineData("Singleton", "([SingletonId]=(1))", true)]
    [InlineData("Singleton", "SingletonId=2", false)]
    [InlineData("Singleton", "SingletonId=1 OR SingletonId=3", false)]
    [InlineData("Singleton", "SingletonId=1 OR SingletonId=4", false)]
    [InlineData("State", "State=1; DROP TABLE anything", false)]
    public void Constraint_names_alone_are_insufficient(string kind, string definition, bool valid) =>
        Assert.Equal(valid, PmReturnJournalCodec.ConstraintMatches(kind, definition));

    [Fact]
    public void Artifact_pin_matches_exact_unapplied_SQL_bytes()
    {
        var file = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../../schemas/backend/pm-return-journal-v1.sql"));
        var bytes = File.ReadAllBytes(file);
        Assert.Equal(PmReturnJournalSql.ArtifactSha256, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant());
        var text = Encoding.UTF8.GetString(bytes);
        Assert.DoesNotContain("INSERT", text);
        Assert.DoesNotContain("IV_InternalTransfer", text);
    }

    internal const string Phase = "(State=1 AND OriginalExecutionFingerprint IS NOT NULL AND AuditId IS NOT NULL AND ReceiptJson IS NOT NULL) OR ((State=2 OR State=3 OR State=4) AND OriginalExecutionFingerprint IS NULL AND AuditId IS NULL AND ReceiptJson IS NULL)";

    internal static DataTable ProbeTable()
    {
        var result = new DataTable();
        foreach (var (name, i) in PmReturnJournalSql.ProbeColumns.Select((n, i) => (n, i)))
            result.Columns.Add(name, i == 2 ? typeof(Guid) : i == 3 || i >= 10 ? typeof(string) : typeof(int));
        result.Rows.Add(1, 1, I07Fixtures.Binding, PmReturnJournalSql.ArtifactSha256, 1, 1, 1, 1, 1, 1,
            "SingletonId=1", "State=1 OR State=2 OR State=3 OR State=4", "DATALENGTH(Slot)>0", Phase);
        return result;
    }

    internal static DataTable Rows(PmReturnSubmittedIntent? intent = null, int state = 2)
    {
        var table = new DataTable();
        foreach (var (name, i) in PmReturnJournalCodec.Columns.Select((n, i) => (n, i)))
            table.Columns.Add(name, i is 0 or 11 ? typeof(Guid) : i == 1 ? typeof(byte[]) : i == 10 ? typeof(int) : typeof(string));
        if (intent is null) return table;
        var key = intent.Key;
        var execution = new string('c', 64); var audit = "synthetic-audit";
        var receipt = JsonSerializer.Serialize(new { version = 1, bindingId = key.DatabaseBindingId.ToString("D"),
            tenantId = key.TenantId, companyId = key.CompanyId, actor = key.Actor, actionId = key.ActionId,
            idempotencyKey = key.IdempotencyKey, documentKey = intent.DocumentKey, submissionIdentity = intent.SubmissionIdentity,
            sourceProcedureSha256 = intent.SourceProcedureSha256, originalExecutionFingerprint = execution,
            auditId = audit, outcome = "Committed", observedPostStatus = 30, rejectionCode = (string?)null });
        table.Rows.Add(key.DatabaseBindingId, PmReturnJournalCodec.EncodeSlot(key), key.TenantId, key.CompanyId,
            key.Actor, key.ActionId, key.IdempotencyKey, intent.DocumentKey, intent.SubmissionIdentity,
            intent.SourceProcedureSha256, state, Guid.NewGuid(), state == 1 ? execution : DBNull.Value,
            state == 1 ? audit : DBNull.Value, state == 1 ? receipt : DBNull.Value);
        return table;
    }
}

internal sealed class RecordingConnection : DbConnection
{
    private ConnectionState state;
    internal List<string> Operations { get; } = [];
    internal List<RecordingCommand> Commands { get; } = [];
    internal DataTable Probe { get; } = ExecutionPmReturnJournalTests.ProbeTable();
    internal DataTable Rows { get; set; } = ExecutionPmReturnJournalTests.Rows();
    internal string? Fault { get; init; }
    internal CancellationTokenSource? CommitCancel { get; init; }
    internal CancellationTokenSource? InsertCancel { get; init; }
    internal bool ExtraProbe { get; set; }
    internal bool ExtraLookup { get; set; }
    internal bool WrongIsolation { get; init; }
    internal bool Committed { get; set; }
    internal bool WasDisposed { get; private set; }
    // Opt-in relational model; existing response-shape tests intentionally supply raw reader rows.
    internal bool EvaluateLookupPredicates { get; init; }
    internal IsolationLevel Isolation { get; private set; }
    [AllowNull] public override string ConnectionString { get; set; } = "";
    public override string Database => "SyntheticOnly";
    public override string DataSource => "RecordingOnly";
    public override string ServerVersion => "RecordingOnly";
    public override ConnectionState State => state;
    public override void ChangeDatabase(string databaseName) => throw new NotSupportedException();
    public override void Close() => state = ConnectionState.Closed;
    public override void Open() { Operations.Add("open"); Fail("open"); state = ConnectionState.Open; }
    internal void Fail(string point) { if (Fault == point) throw new IOException("synthetic-secret-never-log"); }
    protected override DbTransaction BeginDbTransaction(IsolationLevel isolationLevel)
    {
        Operations.Add("begin"); Fail("begin"); Isolation = isolationLevel;
        return new RecordingTransaction(this, WrongIsolation ? IsolationLevel.ReadCommitted : isolationLevel);
    }
    protected override DbCommand CreateDbCommand() { var command = new RecordingCommand(this); Commands.Add(command); return command; }
    protected override void Dispose(bool disposing)
    {
        if (!disposing) return; // A finalizer must never throw a synthetic disposal fault.
        Operations.Add("connection-dispose"); WasDisposed = true; Close(); Fail("dispose");
        base.Dispose(disposing);
    }
}

internal sealed class RecordingTransaction(RecordingConnection owner, IsolationLevel isolation) : DbTransaction
{
    public override IsolationLevel IsolationLevel => isolation;
    protected override DbConnection DbConnection => owner;
    public override void Commit()
    {
        owner.Operations.Add("commit"); owner.Fail("before-ack"); owner.Committed = true;
        owner.Fail("after-ack");
        if (owner.Fault == "cancel-ack") owner.CommitCancel!.Cancel();
    }
    public override void Rollback() => owner.Operations.Add("rollback");
    protected override void Dispose(bool disposing) { owner.Operations.Add("transaction-dispose"); owner.Fail("dispose"); }
}

internal sealed class RecordingCommand(RecordingConnection owner) : DbCommand
{
    private readonly RecordingParameters parameters = new();
    [AllowNull] public override string CommandText { get; set; } = "";
    public override int CommandTimeout { get; set; }
    public override CommandType CommandType { get; set; }
    public override bool DesignTimeVisible { get; set; }
    public override UpdateRowSource UpdatedRowSource { get; set; }
    protected override DbConnection? DbConnection { get => owner; set { if (!ReferenceEquals(value, owner)) throw new InvalidOperationException(); } }
    protected override DbTransaction? DbTransaction { get; set; }
    protected override DbParameterCollection DbParameterCollection => parameters;
    public override void Cancel() { }
    public override void Prepare() { }
    protected override DbParameter CreateDbParameter() => new RecordingParameter();
    public override object? ExecuteScalar() => throw new NotSupportedException();
    public override int ExecuteNonQuery()
    {
        Assert.Equal(PmReturnJournalSql.InsertText, CommandText);
        owner.Operations.Add("insert"); owner.Fail("duplicate"); owner.Fail("deadlock");
        if (owner.Fault == "affected") return -1;
        var key = new PmReturnJournalKey((Guid)Parameters["@binding"].Value!, (string)Parameters["@tenant"].Value!,
            (string)Parameters["@company"].Value!, (string)Parameters["@actor"].Value!,
            (string)Parameters["@action"].Value!, (string)Parameters["@key"].Value!);
        Assert.True(PmReturnSubmittedIntent.TryCreate(key, I06Fixtures.Request, out var intent));
        var inserted = ExecutionPmReturnJournalTests.Rows(intent);
        inserted.Rows[0]["AttemptId"] = owner.Fault == "saved-row" ? Guid.NewGuid() : Parameters["@attempt"].Value!;
        if (owner.EvaluateLookupPredicates)
        {
            if (owner.Rows.Rows.Cast<DataRow>().Any(row => InSqlSlot(row)))
                throw new IOException("synthetic duplicate slot");
            owner.Rows.ImportRow(inserted.Rows[0]);
        }
        else owner.Rows = inserted;
        owner.InsertCancel?.Cancel();
        return 1;
    }
    protected override DbDataReader ExecuteDbDataReader(CommandBehavior behavior)
    {
        var probe = CommandText == PmReturnJournalSql.ProbeText;
        Assert.True(probe || CommandText == PmReturnJournalSql.LookupText);
        owner.Operations.Add(probe ? "probe" : "lookup"); owner.Fail(probe ? "probe" : "lookup");
        var table = probe ? owner.Probe.Copy() : owner.EvaluateLookupPredicates ? LookupRows() : owner.Rows.Copy();
        return new DataTableReader((probe ? owner.ExtraProbe : owner.ExtraLookup) ? [table, table.Copy()] : [table]);
    }

    private bool InSqlSlot(DataRow row) => (Guid)row["DatabaseBindingId"] == (Guid)Parameters["@binding"].Value!
        && (new SqlBinary((byte[])row["Slot"]) == new SqlBinary((byte[])Parameters["@slot"].Value!)).IsTrue;

    private DataTable LookupRows()
    {
        // Model only this bounded query, including the historical length predicate to expose regressions.
        // SqlBinary behavior is .NET evidence; it does not establish real-engine SQL acceptance.
        var match = Regex.Match(CommandText,
            @"WHERE DatabaseBindingId=@binding AND Slot=@slot(?<length> AND DATALENGTH\(Slot\)=@slotLength)?;\s*\z",
            RegexOptions.CultureInvariant);
        Assert.True(match.Success);
        var lengthFilter = match.Groups["length"].Success;
        var result = owner.Rows.Clone();
        foreach (var row in owner.Rows.Rows.Cast<DataRow>().Where(row => InSqlSlot(row)
            && (!lengthFilter || ((byte[])row["Slot"]).Length == (int)Parameters["@slotLength"].Value!)).Take(2))
            result.ImportRow(row);
        return result;
    }
}

internal sealed class RecordingParameter : DbParameter
{
    public override DbType DbType { get; set; }
    public override ParameterDirection Direction { get; set; }
    public override bool IsNullable { get; set; }
    [AllowNull] public override string ParameterName { get; set; } = "";
    [AllowNull] public override string SourceColumn { get; set; } = "";
    public override object? Value { get; set; }
    public override bool SourceColumnNullMapping { get; set; }
    public override int Size { get; set; }
    public override void ResetDbType() { }
}

internal sealed class RecordingParameters : DbParameterCollection
{
    private readonly List<DbParameter> values = [];
    public override int Count => values.Count;
    public override object SyncRoot => this;
    public override int Add(object value) { values.Add((DbParameter)value); return values.Count - 1; }
    public override void AddRange(Array values) { foreach (var value in values) Add(value!); }
    public override void Clear() => values.Clear();
    public override bool Contains(object value) => values.Contains((DbParameter)value);
    public override bool Contains(string value) => IndexOf(value) >= 0;
    public override void CopyTo(Array array, int index) => ((ICollection)values).CopyTo(array, index);
    public override IEnumerator GetEnumerator() => values.GetEnumerator();
    public override int IndexOf(object value) => values.IndexOf((DbParameter)value);
    public override int IndexOf(string parameterName) => values.FindIndex(p => p.ParameterName == parameterName);
    public override void Insert(int index, object value) => values.Insert(index, (DbParameter)value);
    public override void Remove(object value) => values.Remove((DbParameter)value);
    public override void RemoveAt(int index) => values.RemoveAt(index);
    public override void RemoveAt(string parameterName) => RemoveAt(IndexOf(parameterName));
    protected override DbParameter GetParameter(int index) => values[index];
    protected override DbParameter GetParameter(string parameterName) => values[IndexOf(parameterName)];
    protected override void SetParameter(int index, DbParameter value) => values[index] = value;
    protected override void SetParameter(string parameterName, DbParameter value) => values[IndexOf(parameterName)] = value;
}
