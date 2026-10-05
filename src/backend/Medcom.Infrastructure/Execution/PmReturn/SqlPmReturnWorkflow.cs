using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Application.Transfers;
using Medcom.Infrastructure.Transfers;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.Execution.PmReturn;

public enum PmReturnWorkflowKind { Committed, Replayed, Denied, InvalidInput, Conflict, Blocked, Unavailable, OutcomeUnknown, CancelledBeforeIo }
public sealed record PmReturnWorkflowResult(PmReturnWorkflowKind Kind, TransferGatewayReceipt? Receipt = null);

// Trusted server/session + legacy boundary; never supplied by an HTTP request or configuration.
// Recording implementations test the SAME orchestrator, not SQL Server or a production substitute.
public interface IPmReturnWorkflowAuthority
{
    Task<AuthoritativeIdentity?> ResolveSessionAsync(CancellationToken token);
    Task<PmReturnReadResult> ReadAsync(DbTransaction transaction, AuthoritativeIdentity identity, string document, CancellationToken token);
    Task<bool> ExecuteAndVerifyAsync(DbTransaction transaction, PreparedPmReturn prepared, CancellationToken token);
}

// Unregistered. Custody exists only on this invocation's stack after reservation commit ACK.
// No resume/dispatch-ACK parameter, ambient transaction, expiry takeover or retry loop.
public sealed class SqlPmReturnWorkflow
{
    private readonly Guid binding;
    private readonly Func<DbConnection> factory;
    private readonly IPmReturnWorkflowAuthority authority;
    private readonly SqlPmReturnJournalStore journal;
    public SqlPmReturnWorkflow(Guid databaseBindingId, LegacyCompany company, Func<SqlConnection> connectionFactory,
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession)
        : this(databaseBindingId, () => connectionFactory(), new SqlAuthority(company, resolveLiveSession)) { }

    // Dependency boundary for adversarial recording tests. Production constructor above binds SqlClient/I06.
    public SqlPmReturnWorkflow(Guid databaseBindingId, Func<DbConnection> connectionFactory, IPmReturnWorkflowAuthority trustedAuthority)
    {
        if(databaseBindingId==Guid.Empty) throw new ArgumentException("Configured binding required.",nameof(databaseBindingId));
        binding=databaseBindingId;
        factory=connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        authority=trustedAuthority ?? throw new ArgumentNullException(nameof(trustedAuthority));
        journal=new(binding,()=>throw new InvalidOperationException("Borrowed journal seam only."));
    }
    public async Task<PmReturnWorkflowResult> ExecuteAsync(TransferCommandRequest? request, CancellationToken token=default)
    {
        if(request is null) return Result(PmReturnWorkflowKind.InvalidInput);
        if(token.IsCancellationRequested) return Result(PmReturnWorkflowKind.CancelledBeforeIo);
        if(System.Transactions.Transaction.Current is not null) return Result(PmReturnWorkflowKind.Unavailable);
        PmReturnSubmittedIntent? intent=null;
        PreparedPmReturn? reservedPreparation=null;
        PmReturnReservationAcknowledgment? custody=null;
        // Exactly two phases, never a retry. Phase 1 cannot be entered without phase 0's ACK.
        for(var phase=0;phase<2;phase++)
        {
            DbConnection? connection=null; DbTransaction? transaction=null;
            var ownsConnection=false; var commitAttempted=false; var committed=false; var dispatched=false;
            try
            {
                var identity=await authority.ResolveSessionAsync(token);
                if(identity is null) return Result(PmReturnWorkflowKind.Denied);
                if(phase==0)
                {
                    var key=new PmReturnJournalKey(binding,identity.TenantId,identity.CompanyId,identity.PrincipalId,request.ActionId,request.IdempotencyKey);
                    if(!PmReturnSubmittedIntent.TryCreate(key,request,out intent)) return Result(PmReturnWorkflowKind.InvalidInput);
                }
                if(!SameScope(identity,intent!)) return Result(PmReturnWorkflowKind.Denied);
                connection=factory();
                if(connection is null || connection.State!=ConnectionState.Closed) return Result(PmReturnWorkflowKind.Unavailable);
                ownsConnection=true;
                await connection.OpenAsync(token);
                transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
                if(transaction.IsolationLevel!=IsolationLevel.Serializable || !ReferenceEquals(transaction.Connection,connection))
                    return Result(PmReturnWorkflowKind.Unavailable);
                // Consistent order: current authority/head/details, journal marker, audit marker, journal slot, audit slot/log.
                var current=await authority.ReadAsync(transaction,identity,intent!.DocumentKey,token);
                if(!PmReturnReplayAuthority.TryCapture(binding,identity,current.State,current.Authority,out var captured)
                    || PmReturnReplayPolicy.Evaluate(intent,captured,new(TransferSnapshotOrigin.DatabaseAuthority,intent.Key,PmReturnJournalState.Absent))
                       .Disposition!=PmReturnReplayDisposition.NeedsFreshAdmission) return Result(PmReturnWorkflowKind.Denied);
                if(!await journal.Probe(connection,transaction,token) || !await PmReturnWorkflowSql.ProbeAsync(transaction,binding,token))
                    return Result(PmReturnWorkflowKind.Unavailable);
                var found=await SqlPmReturnJournalStore.Lookup(connection,transaction,intent,token);
                if(!found.Valid) return Result(PmReturnWorkflowKind.Unavailable);
                if(found.Row is {} existing)
                {
                    if(!existing.Matches(intent)) return Result(PmReturnWorkflowKind.Conflict);
                    if(existing.Observation.State==PmReturnJournalState.Committed)
                    {
                        var replay=PmReturnReplayPolicy.Evaluate(intent,captured,existing.Observation);
                        if(replay.Disposition!=PmReturnReplayDisposition.ReplayOriginalReceipt
                           || !await PmReturnWorkflowSql.AuditMatchesAsync(transaction,intent,existing,token)) return Result(PmReturnWorkflowKind.Unavailable);
                        if(!await SessionStillGranted(transaction,intent,token)) return Result(PmReturnWorkflowKind.Denied);
                        token.ThrowIfCancellationRequested(); commitAttempted=true;
                        await transaction.CommitAsync(token); committed=true; token.ThrowIfCancellationRequested();
                        return new(PmReturnWorkflowKind.Replayed,replay.OriginalReceipt);
                    }
                    if(phase==0 || custody is null || existing.AttemptId!=custody.AttemptId
                       || existing.Observation.State!=PmReturnJournalState.InProgress) return Result(PmReturnWorkflowKind.Blocked);
                }
                else if(phase!=0) return Result(PmReturnWorkflowKind.Unavailable);
                if(!await PmReturnWorkflowSql.AuditAbsentAsync(transaction,intent,token)) return Result(PmReturnWorkflowKind.Unavailable);
                var prepared=PmReturnPreparation.Prepare(identity,request,current.State,current.Authority).Prepared;
                if(prepared is null) return Result(PmReturnWorkflowKind.Denied);
                if(phase==0)
                {
                    var attempt=Guid.NewGuid();
                    await using(var insert=PmReturnJournalSql.Insert(connection,transaction,intent,attempt))
                        if(await insert.ExecuteNonQueryAsync(token)!=1) return Result(PmReturnWorkflowKind.Unavailable);
                    var saved=await SqlPmReturnJournalStore.Lookup(connection,transaction,intent,token);
                    if(!saved.Valid || saved.Row is not {} reserved || !reserved.Matches(intent)
                       || reserved.AttemptId!=attempt || reserved.Observation.State!=PmReturnJournalState.InProgress) return Result(PmReturnWorkflowKind.Unavailable);
                    if(!await SessionStillGranted(transaction,intent,token)) return Result(PmReturnWorkflowKind.Denied);
                    token.ThrowIfCancellationRequested(); commitAttempted=true;
                    await transaction.CommitAsync(token); committed=true; token.ThrowIfCancellationRequested();
                    // Never manufacture custody on commit ambiguity, or accept it from another invocation.
                    custody=new(intent,attempt); reservedPreparation=prepared;
                }
                else
                {
                    if(custody is null || reservedPreparation is null || reservedPreparation.SubmissionIdentity!=prepared.SubmissionIdentity
                       || reservedPreparation.State.StateEqualityToken!=prepared.State.StateEqualityToken) return Result(PmReturnWorkflowKind.Conflict);
                    if(!await SessionStillGranted(transaction,intent,token)) return Result(PmReturnWorkflowKind.Denied);
                    token.ThrowIfCancellationRequested(); dispatched=true;
                    if(!await authority.ExecuteAndVerifyAsync(transaction,prepared,token)
                       || !ReferenceEquals(transaction.Connection,connection) || !await PmReturnWorkflowSql.TransactionAsync(transaction,token))
                        return Result(PmReturnWorkflowKind.OutcomeUnknown);
                    var audit=Guid.NewGuid(); var execution=prepared.Command.CorrelationFingerprint;
                    await using(var insert=PmReturnWorkflowSql.AuditInsert(transaction,intent,custody.AttemptId,audit,execution))
                        if(await insert.ExecuteNonQueryAsync(token)!=1) throw new InvalidOperationException("Audit append not acknowledged.");
                    await using(var update=PmReturnWorkflowSql.CommitJournal(transaction,intent,custody.AttemptId,audit,execution))
                        if(await update.ExecuteNonQueryAsync(token)!=1) throw new InvalidOperationException("Committed transition not acknowledged.");
                    var saved=await SqlPmReturnJournalStore.Lookup(connection,transaction,intent,token);
                    if(!saved.Valid || saved.Row is not {} row || row.AttemptId!=custody.AttemptId || !row.Matches(intent)
                       || row.Observation.Record?.OriginalExecutionFingerprint!=execution || row.Observation.Record.AuditId!=audit.ToString("D")
                       || PmReturnReplayPolicy.Evaluate(intent,captured,row.Observation).Disposition!=PmReturnReplayDisposition.ReplayOriginalReceipt
                       || !await PmReturnWorkflowSql.AuditMatchesAsync(transaction,intent,row,token)) throw new InvalidOperationException("Receipt readback failed.");
                    if(!await SessionStillGranted(transaction,intent,token)) throw new InvalidOperationException("Current authority revoked.");
                    token.ThrowIfCancellationRequested(); commitAttempted=true;
                    await transaction.CommitAsync(token); committed=true; token.ThrowIfCancellationRequested();
                    return new(PmReturnWorkflowKind.Committed,row.Observation.Record.CommittedReceipt!.OriginalReceipt);
                }
            }
            catch(Exception error) when(error is not OutOfMemoryException)
            {
                if(commitAttempted) return Result(PmReturnWorkflowKind.OutcomeUnknown);
                if(dispatched && transaction is not null)
                {
                    try { await transaction.RollbackAsync(CancellationToken.None); }
                    catch(Exception rollbackError) when(rollbackError is not OutOfMemoryException) { return Result(PmReturnWorkflowKind.OutcomeUnknown); }
                }
                return Result(PmReturnWorkflowKind.Unavailable);
            }
            finally
            {
                if(transaction is not null)
                {
                    if(!committed && !commitAttempted) try { await transaction.RollbackAsync(CancellationToken.None); } catch(Exception e) when(e is not OutOfMemoryException) { }
                    try { await transaction.DisposeAsync(); } catch(Exception e) when(e is not OutOfMemoryException) { }
                }
                if(ownsConnection) try { await connection!.DisposeAsync(); } catch(Exception e) when(e is not OutOfMemoryException) { }
            }
        }
        return Result(PmReturnWorkflowKind.Unavailable);
    }
    private async Task<bool> SessionStillGranted(DbTransaction transaction,PmReturnSubmittedIntent intent,CancellationToken token)
    {
        var identity=await authority.ResolveSessionAsync(token);
        if(identity is null || !SameScope(identity,intent)) return false;
        var current=await authority.ReadAsync(transaction,identity,intent.DocumentKey,token);
        return PmReturnReplayAuthority.TryCapture(binding,identity,current.State,current.Authority,out var fresh)
          && PmReturnReplayPolicy.Evaluate(intent,fresh,new(TransferSnapshotOrigin.DatabaseAuthority,intent.Key,PmReturnJournalState.Absent))
             .Disposition==PmReturnReplayDisposition.NeedsFreshAdmission;
    }
    private static bool SameScope(AuthoritativeIdentity identity,PmReturnSubmittedIntent intent) =>
        identity.TenantId==intent.Key.TenantId && identity.CompanyId==intent.Key.CompanyId && identity.PrincipalId==intent.Key.Actor;
    private static PmReturnWorkflowResult Result(PmReturnWorkflowKind kind)=>new(kind);

    private sealed class SqlAuthority(LegacyCompany company,Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve) : IPmReturnWorkflowAuthority
    {
        private readonly SqlPmReturnAuthorityReader reader=new(company);
        public Task<AuthoritativeIdentity?> ResolveSessionAsync(CancellationToken token)=>resolve(token);
        public Task<PmReturnReadResult> ReadAsync(DbTransaction transaction,AuthoritativeIdentity identity,string document,CancellationToken token)
            => reader.ReadAsync(RequireSql(transaction),identity,document,token);
        private static SqlTransaction RequireSql(DbTransaction transaction)=>transaction is SqlTransaction sql
            ? sql : throw new InvalidOperationException("Production requires SqlClient transaction.");
        public async Task<bool> ExecuteAndVerifyAsync(DbTransaction transaction,PreparedPmReturn prepared,CancellationToken token)
        {
            var sql=RequireSql(transaction);
            // Source-derived log correlation. Read actual log delta, not @@ROWCOUNT of the stored procedure.
            var before=await LogCount(sql,prepared,token);
            await using(var command=PmReturnSqlCommandFactory.CreatePlan(prepared).CreateCommand(sql)) await command.ExecuteNonQueryAsync(token);
            if(!await PmReturnWorkflowSql.TransactionAsync(transaction,token)) return false;
            var after=await LogCount(sql,prepared,token);
            await using var post=PmReturnWorkflowSql.Command(transaction,"SELECT TOP (2) DocumentID,StatusID FROM dbo.IV_InternalTransferRequestTbl WITH (UPDLOCK,HOLDLOCK) WHERE DocumentID=@document;");
            var parameter=post.CreateParameter(); parameter.ParameterName="@document";parameter.DbType=DbType.AnsiString;parameter.Size=30;parameter.Value=prepared.Command.DocumentKey.Value;post.Parameters.Add(parameter);
            await using var result=await post.ExecuteReaderAsync(token);
            return after==before+1 && PmReturnJournalCodec.Shape(result,new[]{"DocumentID","StatusID"}) && await result.ReadAsync(token)
              && result.GetString(0)==prepared.Command.DocumentKey.Value && result.GetInt32(1)==30 && !await result.ReadAsync(token) && !await result.NextResultAsync(token);
        }
        private static async Task<long> LogCount(SqlTransaction transaction,PreparedPmReturn prepared,CancellationToken token)
        {
            // Source UserAutoID is a generated log-row GUID, not the actor. Actor is UserName;
            // source Notes receives the submitted reason. Binary + length checks preserve exact values.
            await using var command=PmReturnWorkflowSql.LegacyLogCount(transaction,prepared);
            return (long)(await command.ExecuteScalarAsync(token) ?? throw new InvalidOperationException("Log evidence unavailable."));
        }
    }
}
