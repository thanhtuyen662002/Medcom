using System.Data;
using System.Data.Common;
using System.Transactions;
using Medcom.Application.Transfers;

namespace Medcom.Infrastructure.Execution.PmReturn;

public enum PmReturnJournalResultKind { Denied, InvalidInput, CancelledBeforeIo, Unavailable, OutcomeUnknown, Conflict, Blocked, Observed, Reserved }

public sealed class PmReturnReservationAcknowledgment
{
    internal PmReturnReservationAcknowledgment(PmReturnSubmittedIntent intent, Guid attempt)
    { Key = intent.Key; DocumentKey = intent.DocumentKey; SubmissionIdentity = intent.SubmissionIdentity; AttemptId = attempt; }
    public PmReturnJournalKey Key { get; }
    public string DocumentKey { get; }
    public string SubmissionIdentity { get; }
    public Guid AttemptId { get; }
    // An acknowledged reservation is not permission to execute ERP or proof of qualified durability.
    public bool PermitsDispatch => false;
}

public sealed record PmReturnJournalResult(PmReturnJournalResultKind Kind,
    PmReturnJournalObservation? Observation = null, PmReturnReservationAcknowledgment? Reservation = null)
{ public bool PermitsDispatch => false; }

// Unregistered SQL Server journal implementation. Factory supplies a NEW dedicated connection.
// DbConnection allows recording doubles in tests; those doubles are never production providers.
// Caller must freshly revalidate authority for this bound database before result disclosure.
// No schema creation, Committed writer, source command, delete, takeover or retry is implemented.
public sealed class SqlPmReturnJournalStore
{
    private readonly Guid binding;
    private readonly Func<DbConnection> factory;
    public SqlPmReturnJournalStore(Guid databaseBindingId, Func<DbConnection> connectionFactory)
    {
        if (databaseBindingId == Guid.Empty) throw new ArgumentException("Configured binding required.", nameof(databaseBindingId));
        binding = databaseBindingId;
        factory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
    }

    public Task<PmReturnJournalResult> ReadAsync(PmReturnSubmittedIntent? intent, PmReturnReplayAuthority? authority,
        CancellationToken cancellationToken = default) => Run(intent, authority, null, false, cancellationToken);

    public Task<PmReturnJournalResult> TryReserveAsync(PmReturnSubmittedIntent? intent, PmReturnReplayAuthority? authority,
        PreparedPmReturn? prepared, CancellationToken cancellationToken = default) => Run(intent, authority, prepared, true, cancellationToken);

    private async Task<PmReturnJournalResult> Run(PmReturnSubmittedIntent? intent, PmReturnReplayAuthority? authority,
        PreparedPmReturn? prepared, bool reserve, CancellationToken cancellationToken)
    {
        if (intent is null || intent.Key.DatabaseBindingId != binding) return Result(PmReturnJournalResultKind.InvalidInput);
        if (PmReturnReplayPolicy.Evaluate(intent, authority,
            new(TransferSnapshotOrigin.DatabaseAuthority, intent.Key, PmReturnJournalState.Absent)).Disposition
            != PmReturnReplayDisposition.NeedsFreshAdmission) return Result(PmReturnJournalResultKind.Denied);
        if (reserve && !PreparedMatches(intent, prepared)) return Result(PmReturnJournalResultKind.InvalidInput);
        if (cancellationToken.IsCancellationRequested) return Result(PmReturnJournalResultKind.CancelledBeforeIo);
        if (Transaction.Current is not null) return Result(PmReturnJournalResultKind.Unavailable);

        var commitAttempted = false;
        var ownsConnection = false;
        DbConnection? connection = null;
        DbTransaction? transaction = null;
        PmReturnJournalResult answer = Result(PmReturnJournalResultKind.Unavailable);
        try
        {
            connection = factory();
            // Never close or transact a connection already in use by another owner.
            if (connection is null || connection.State != ConnectionState.Closed) return answer;
            ownsConnection = true;
            await connection.OpenAsync(cancellationToken);
            transaction = await connection.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, cancellationToken);
            if (!await Probe(connection, transaction, cancellationToken)) return answer;
            var lookup = await Lookup(connection, transaction, intent, cancellationToken);
            if (!lookup.Valid) return answer;
            if (lookup.Row is { } existing)
            {
                answer = !existing.Matches(intent) ? Result(PmReturnJournalResultKind.Conflict)
                    : existing.Observation.State != PmReturnJournalState.Committed ? Result(PmReturnJournalResultKind.Blocked)
                    : new(PmReturnJournalResultKind.Observed, existing.Observation);
            }
            else if (!reserve)
                answer = new(PmReturnJournalResultKind.Observed,
                    new(TransferSnapshotOrigin.DatabaseAuthority, intent.Key, PmReturnJournalState.Absent));
            else
            {
                var attempt = Guid.NewGuid();
                await using (var command = PmReturnJournalSql.Insert(connection, transaction, intent, attempt))
                    if (await command.ExecuteNonQueryAsync(cancellationToken) != 1) return Result(PmReturnJournalResultKind.Unavailable);
                // Validate actual stored correlation/phase before trying to commit.
                var saved = await Lookup(connection, transaction, intent, cancellationToken);
                if (!saved.Valid || saved.Row is not { } row || !row.Matches(intent) || row.AttemptId != attempt
                    || row.Observation.State != PmReturnJournalState.InProgress) return Result(PmReturnJournalResultKind.Unavailable);
                answer = new(PmReturnJournalResultKind.Reserved, Reservation: new(intent, attempt));
            }
            cancellationToken.ThrowIfCancellationRequested();
            commitAttempted = true;
            await transaction.CommitAsync(cancellationToken);
            // Cancellation concurrent with ACK remains unresolved; no ownership is disclosed.
            cancellationToken.ThrowIfCancellationRequested();
            return answer;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            return Result(commitAttempted ? PmReturnJournalResultKind.OutcomeUnknown : PmReturnJournalResultKind.Unavailable);
        }
        finally
        {
            // Cleanup faults cannot turn an ACK into absence or leak provider/SQL/credential details.
            if (transaction is not null)
                try { await transaction.DisposeAsync(); } catch (Exception error) when (error is not OutOfMemoryException) { }
            if (ownsConnection)
                try { await connection!.DisposeAsync(); } catch (Exception error) when (error is not OutOfMemoryException) { }
        }
    }

    internal async Task<bool> Probe(DbConnection connection, DbTransaction transaction, CancellationToken token)
    {
        await using var command = PmReturnJournalSql.Probe(connection, transaction);
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!PmReturnJournalCodec.Shape(reader, PmReturnJournalSql.ProbeColumns) || !await reader.ReadAsync(token)
            || reader.GetInt32(0) != 1 || reader.GetInt32(1) != 1 || reader.GetGuid(2) != binding
            || reader.GetString(3) != PmReturnJournalSql.ArtifactSha256
            || Enumerable.Range(4, 6).Any(i => reader.GetInt32(i) != 1)
            || !PmReturnJournalCodec.ConstraintMatches("Singleton", reader.GetString(10))
            || !PmReturnJournalCodec.ConstraintMatches("State", reader.GetString(11))
            || !PmReturnJournalCodec.ConstraintMatches("Slot", reader.GetString(12))
            || !PmReturnJournalCodec.ConstraintMatches("Phase", reader.GetString(13))) return false;
        return !await reader.ReadAsync(token) && !await reader.NextResultAsync(token);
    }

    internal static async Task<(bool Valid, PmReturnStoredObservation? Row)> Lookup(DbConnection connection,
        DbTransaction transaction, PmReturnSubmittedIntent intent, CancellationToken token)
    {
        await using var command = PmReturnJournalSql.Lookup(connection, transaction, intent);
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!PmReturnJournalCodec.Shape(reader, PmReturnJournalCodec.Columns)) return (false, null);
        var found = await reader.ReadAsync(token);
        var row = found ? PmReturnJournalCodec.Decode(reader, intent.Key) : null;
        // A malformed first row must never be indistinguishable from no row.
        if (found && row is null) return (false, null);
        if (await reader.ReadAsync(token) || await reader.NextResultAsync(token)) return (false, null);
        return (true, row);
    }

    private static bool PreparedMatches(PmReturnSubmittedIntent intent, PreparedPmReturn? prepared) => prepared is not null
        && prepared.SubmissionIdentity == intent.SubmissionIdentity
        && prepared.State.TenantId == intent.Key.TenantId && prepared.State.CompanyId == intent.Key.CompanyId
        && prepared.Command.Actor.Value == intent.Key.Actor && prepared.Command.Action.Id == intent.Key.ActionId
        && prepared.Command.Action.ProcedureSha256 == intent.SourceProcedureSha256
        && prepared.Command.DocumentKey.Value == intent.DocumentKey && prepared.Command.IdempotencyKey.Value == intent.Key.IdempotencyKey;

    private static PmReturnJournalResult Result(PmReturnJournalResultKind kind) => new(kind);
}
