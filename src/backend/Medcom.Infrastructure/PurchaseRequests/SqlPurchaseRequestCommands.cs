using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.PurchaseRequests;

public sealed record PurchaseRequestAllocationContext(Guid DatabaseBindingId, string TenantId, string CompanyId,
    string BranchId, string ActionId, string IdempotencyKey, string? ExistingDocumentId, IReadOnlyList<string> ClientLineKeys);
public sealed record PurchaseRequestAllocatedIdentifiers(string PurchaseRequestId, IReadOnlyList<PurchaseRequestAllocatedLine> Lines);
// Server-owned, feature-specific dependency. No PO-format guess, client ID or SQL input.
// Qualification must cover this database binding and transaction-coupled allocation/id uniqueness.
public interface IPurchaseRequestIdentifierAllocator
{
    bool IsQualified(PurchaseRequestAllocationContext context);
    Task<PurchaseRequestAllocatedIdentifiers> AllocateAsync(DbTransaction transaction,
        PurchaseRequestAllocationContext context, CancellationToken token);
}

// An explicit inspector promises local session state only: no SQL, full revalidation
// or activity refresh. Single-resolver callers remain source-compatible but fail
// closed without that dependency. Native authorization still runs on the owned tx.
public sealed class SqlPurchaseRequestCommands : IPurchaseRequestCommands
{
    private readonly Guid binding;
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> factory;
    private readonly Func<CancellationToken, Task<AuthoritativeIdentity?>> session;
    private readonly IPurchaseRequestIdentifierAllocator allocator;
    private readonly Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspect;
    private readonly bool runtimeQualified;
    private readonly PurchaseRequestPilotAuthorization? pilot;
    private readonly TimeProvider clock = TimeProvider.System;
    public SqlPurchaseRequestCommands(Guid databaseBindingId, LegacyCompany company, Func<SqlConnection> connectionFactory,
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession,
        IPurchaseRequestIdentifierAllocator identifierAllocator, bool runtimeQualified = false,
        Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspectLocalSession = null)
        : this(databaseBindingId,company,Adapt(connectionFactory),resolveLiveSession,identifierAllocator,runtimeQualified,inspectLocalSession) { }
    private static Func<DbConnection> Adapt(Func<SqlConnection> connectionFactory)
    { ArgumentNullException.ThrowIfNull(connectionFactory); return ()=>connectionFactory(); }
    // Same concrete SQL orchestration for recording tests. Integration uses the SqlConnection constructor.
    public SqlPurchaseRequestCommands(Guid databaseBindingId, LegacyCompany company, Func<DbConnection> connectionFactory,
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession,
        IPurchaseRequestIdentifierAllocator identifierAllocator, bool runtimeQualified = false,
        Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspectLocalSession = null)
    {
        if(databaseBindingId==Guid.Empty) throw new ArgumentException("Database binding required.");
        binding=databaseBindingId; this.company=company ?? throw new ArgumentNullException(nameof(company));
        factory=connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        session=resolveLiveSession ?? throw new ArgumentNullException(nameof(resolveLiveSession));
        inspect=inspectLocalSession;
        allocator=identifierAllocator ?? throw new ArgumentNullException(nameof(identifierAllocator)); this.runtimeQualified=runtimeQualified;
    }
    // This overload admits an owner-authorized bounded experiment. It deliberately
    // leaves runtimeQualified FALSE: no metadata/offline result becomes acceptance.
    internal SqlPurchaseRequestCommands(Guid databaseBindingId, LegacyCompany company,
        Func<DbConnection> connectionFactory, Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession,
        IPurchaseRequestIdentifierAllocator identifierAllocator, PurchaseRequestPilotAuthorization pilot,
        TimeProvider clock, Func<CancellationToken, Task<AuthoritativeIdentity?>> inspectLocalSession)
        : this(databaseBindingId, company, connectionFactory, resolveLiveSession, identifierAllocator,
            runtimeQualified: false, inspectLocalSession: inspectLocalSession)
    {
        ArgumentNullException.ThrowIfNull(pilot);
        ArgumentNullException.ThrowIfNull(clock);
        if (!pilot.Covers(binding, company)) throw new ArgumentException("Purchase pilot composition mismatch.");
        this.pilot = pilot; this.clock = clock;
    }

    public Task<PurchaseRequestCommandResult> CreateAsync(CreatePurchaseRequestDraft request,CancellationToken token=default)
        => Start(request,token);
    public Task<PurchaseRequestCommandResult> SaveAsync(SavePurchaseRequestDraft request,CancellationToken token=default)
        => Start(request,token);
    public Task<PurchaseRequestCommandResult> SubmitAsync(SubmitPurchaseRequest request,CancellationToken token=default)
        => Start(request,token);
    public Task<PurchaseRequestLookupResult> LookupAsync(CreatePurchaseRequestDraft originalIntent,CancellationToken token=default)
        => StartLookup(originalIntent,token);
    public Task<PurchaseRequestLookupResult> LookupAsync(SavePurchaseRequestDraft originalIntent,CancellationToken token=default)
        => StartLookup(originalIntent,token);
    public Task<PurchaseRequestLookupResult> LookupAsync(SubmitPurchaseRequest originalIntent,CancellationToken token=default)
        => StartLookup(originalIntent,token);
    private Task<PurchaseRequestLookupResult> StartLookup(object? input,CancellationToken token)
    {
        try
        {
            // Freeze before the first await, with precisely the dispatch canonicalization.
            var command=input switch
            {
                CreatePurchaseRequestDraft c=>Submitted.Create(PurchaseRequestCommandRules.Freeze(c)),
                SavePurchaseRequestDraft s=>Submitted.Save(PurchaseRequestCommandRules.Freeze(s)),
                SubmitPurchaseRequest s=>Submitted.Submit(PurchaseRequestCommandRules.Freeze(s)),
                _=>throw new ArgumentException("Fixed original intent required.")
            };
            return Observe(command,new PurchaseRequestSessionFence(),token);
        }
        catch(ArgumentException) { return Task.FromResult(new PurchaseRequestLookupResult(PurchaseRequestLookupOutcome.InvalidInput)); }
    }
    private async Task<PurchaseRequestLookupResult> Observe(Submitted command,PurchaseRequestSessionFence sessionFence,CancellationToken token)
    {
        if(!runtimeQualified && pilot is null) return new(PurchaseRequestLookupOutcome.QualificationRequired);
        if(pilot is not null && (!pilot.CoversDocument(command.Document,command.Branch)
            || !pilot.CanObserve(clock.GetUtcNow()))) return new(PurchaseRequestLookupOutcome.Denied);
        if(inspect is null) return new(PurchaseRequestLookupOutcome.Unavailable);
        if(token.IsCancellationRequested) return new(PurchaseRequestLookupOutcome.Cancelled);
        if(System.Transactions.Transaction.Current is not null) return new(PurchaseRequestLookupOutcome.Unavailable);
        DbConnection? connection=null; DbTransaction? transaction=null; var owned=false; var cleanupOk=true;
        AuthoritativeIdentity? identity=null;
        var answer=new PurchaseRequestLookupResult(PurchaseRequestLookupOutcome.Unavailable);
        async Task<PurchaseRequestLookupResult> ExecuteObservation()
        {
            var observed=await Resolve(token).WaitAsync(token);
            if(!sessionFence.TryAccept(observed,out identity)) return new(PurchaseRequestLookupOutcome.Denied);
            var key=Key(identity,command); var slot=SHA256.HashData(key);
            connection=factory();
            if(connection is null || connection.State!=ConnectionState.Closed) return new(PurchaseRequestLookupOutcome.Unavailable);
            owned=true; pilot?.VerifyTarget(connection); await connection.OpenAsync(token); pilot?.VerifyTarget(connection);
            var started=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
            // Never roll back/dispose a transaction reported as belonging to another owner.
            if(!ReferenceEquals(started.Connection,connection)) return new(PurchaseRequestLookupOutcome.Unavailable);
            transaction=started;
            if(transaction.IsolationLevel!=IsolationLevel.Serializable) return new(PurchaseRequestLookupOutcome.Unavailable);
            if(!await Authority(transaction,identity,command,token,strict:true)) return new(PurchaseRequestLookupOutcome.Denied);
            if(!await Probe(transaction,token,strict:true) || !await TransactionValid(transaction,token,strict:true))
                return new(PurchaseRequestLookupOutcome.QualificationRequired);
            var found=await Lookup(transaction,key,slot,command.Intent,token,strict:true);
            if(!found.Valid) return new(PurchaseRequestLookupOutcome.Unavailable);
            answer=new(PurchaseRequestLookupOutcome.Absent);
            if(found.Row is {} row)
            {
                if(!row.Intent.AsSpan().SequenceEqual(command.Intent)) answer=new(PurchaseRequestLookupOutcome.Conflict);
                else if(row.Receipt is {} receipt)
                {
                    if(!LookupReceiptMatches(receipt,command)
                        || !row.Aggregate!.AsSpan().SequenceEqual(PurchaseRequestCommandRules.IntentBytes(receipt.Document)))
                        return new(PurchaseRequestLookupOutcome.Unavailable);
                    // Prove CURRENT scope/physical relations; do not compare current state to an old receipt/token.
                    var current=await Read(transaction,receipt.Document.PurchaseRequestId,command.Branch,token,strict:true);
                    answer=current is null ? new(PurchaseRequestLookupOutcome.Conflict)
                        : new(PurchaseRequestLookupOutcome.Committed,receipt);
                }
                else answer=new(PurchaseRequestLookupOutcome.Pending);
            }
            // Fence negative observations too. No attempt custody, allocator or commit path exists here.
            if(!await TransactionValid(transaction,token,strict:true)) return new(PurchaseRequestLookupOutcome.Unavailable);
            if(!await StillAuthorized(transaction,sessionFence,command,token,strict:true)) return new(PurchaseRequestLookupOutcome.Denied);
            token.ThrowIfCancellationRequested();
            return answer;
        }
        try { answer=await ExecuteObservation(); }
        catch(OperationCanceledException) { answer=new(PurchaseRequestLookupOutcome.Cancelled); }
        catch(PurchaseConflictException) { answer=new(PurchaseRequestLookupOutcome.Conflict); }
        catch(Exception) { answer=new(PurchaseRequestLookupOutcome.Unavailable); }
        finally
        {
            // SELECT-only transaction. A cleanup fault must never release a receipt or a false absence.
            if(transaction is not null)
            {
                try { await transaction.RollbackAsync(CancellationToken.None); } catch(Exception) { cleanupOk=false; }
                try { await transaction.DisposeAsync(); } catch(Exception) { cleanupOk=false; }
            }
            if(owned && connection is not null)
                try { await connection.DisposeAsync(); } catch(Exception) { cleanupOk=false; }
        }
        if(!cleanupOk) return new(PurchaseRequestLookupOutcome.Unavailable);
        if(answer.Outcome is not (PurchaseRequestLookupOutcome.Committed or PurchaseRequestLookupOutcome.Pending
            or PurchaseRequestLookupOutcome.Absent or PurchaseRequestLookupOutcome.Conflict)) return answer;
        // Cleanup awaited above. Do not disclose a pre-cleanup receipt after logout/cancellation during that await.
        // SQL grants are a point-in-time observation at the preceding native-authority fence, not a delivery lease.
        try
        {
            token.ThrowIfCancellationRequested();
            var live=await Resolve(token).WaitAsync(token);
            if(!sessionFence.TryAccept(live,out var accepted)
                || accepted.BranchIds is null || !accepted.BranchIds.Contains(command.Branch,StringComparer.Ordinal))
                return new(PurchaseRequestLookupOutcome.Denied);
            token.ThrowIfCancellationRequested();
            return answer;
        }
        catch(OperationCanceledException) { return new(PurchaseRequestLookupOutcome.Cancelled); }
        catch(Exception) { return new(PurchaseRequestLookupOutcome.Unavailable); }
    }
    private Task<PurchaseRequestCommandResult> Start(object? input,CancellationToken token)
    {
        try
        {
            var command=input switch
            {
                CreatePurchaseRequestDraft c=>Submitted.Create(PurchaseRequestCommandRules.Freeze(c)),
                SavePurchaseRequestDraft s=>Submitted.Save(PurchaseRequestCommandRules.Freeze(s)),
                SubmitPurchaseRequest s=>Submitted.Submit(PurchaseRequestCommandRules.Freeze(s)),
                _=>throw new ArgumentException("Fixed command required.")
            };
            return Run(command,new PurchaseRequestSessionFence(),token);
        }
        catch(ArgumentException) { return Task.FromResult(Result(PurchaseRequestCommandOutcome.InvalidInput)); }
    }
    private async Task<PurchaseRequestCommandResult> Run(Submitted command,PurchaseRequestSessionFence sessionFence,CancellationToken token)
    {
        if(!runtimeQualified && pilot is null) return Result(PurchaseRequestCommandOutcome.QualificationRequired);
        if(pilot is not null && (!pilot.CoversDocument(command.Document,command.Branch)
            || command.Creates || command.Changes.Any(change=>change.Kind!=PurchaseRequestLineChangeKind.Update)
            || !pilot.CanWrite(clock.GetUtcNow()))) return Result(PurchaseRequestCommandOutcome.Denied);
        if(inspect is null) return Result(PurchaseRequestCommandOutcome.Unavailable);
        if(token.IsCancellationRequested) return Result(PurchaseRequestCommandOutcome.Cancelled);
        if(System.Transactions.Transaction.Current is not null) return Result(PurchaseRequestCommandOutcome.Unavailable);
        AuthoritativeIdentity? first=null; byte[]? key=null; byte[]? slot=null; Guid? custody=null;
        // Durable intent reservation then business+receipt transaction. No restart takeover or worker.
        // A lost commit ACK can only reconcile the retained slot; a new invocation never redispatches Pending.
        var possibleWrite=false;
        for(var phase=0;phase<2;phase++)
        {
            DbConnection? connection=null; DbTransaction? transaction=null;
            var owned=false; var commitAttempted=false; var committed=false;
            var cleanupOk=true; var writeAttempted=false; var advance=false;
            var answer=Result(PurchaseRequestCommandOutcome.Unavailable);
            async Task<PurchaseRequestCommandResult> ExecutePhase()
            {
                var observed=await Resolve(token,pilotWrite:true);
                if(!sessionFence.TryAccept(observed,out var identity)) return Result(PurchaseRequestCommandOutcome.Denied);
                if(first is null)
                {
                    first=identity; key=Key(identity,command); slot=SHA256.HashData(key);
                }
                var allocation=AllocationContext(identity,command);
                connection=factory();
                if(connection is null || connection.State!=ConnectionState.Closed) return Result(PurchaseRequestCommandOutcome.Unavailable);
                owned=true; pilot?.VerifyTarget(connection); await connection.OpenAsync(token); pilot?.VerifyTarget(connection);
                var started=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
                if(!ReferenceEquals(started.Connection,connection)) return Result(PurchaseRequestCommandOutcome.Unavailable);
                transaction=started;
                if(transaction.IsolationLevel!=IsolationLevel.Serializable)
                    return Result(PurchaseRequestCommandOutcome.Unavailable);
                if(!await Authority(transaction,identity,command,token)) return Result(PurchaseRequestCommandOutcome.Denied);
                if(!await Probe(transaction,token) || !await TransactionValid(transaction,token))
                    return Result(PurchaseRequestCommandOutcome.QualificationRequired);
                var found=await Lookup(transaction,key!,slot!,command.Intent,token);
                if(!found.Valid) return Result(PurchaseRequestCommandOutcome.Unavailable);
                if(found.Row is {} row)
                {
                    if(!row.Intent.AsSpan().SequenceEqual(command.Intent)) return Result(PurchaseRequestCommandOutcome.Conflict);
                    if(row.Receipt is {} receipt)
                    {
                        if(!ReceiptMatches(receipt,command) || !row.Aggregate!.AsSpan().SequenceEqual(PurchaseRequestCommandRules.IntentBytes(receipt.Document)))
                            return Result(PurchaseRequestCommandOutcome.Unavailable);
                        var current=await Read(transaction,receipt.Document.PurchaseRequestId,command.Branch,token);
                        if(current is null) return Result(PurchaseRequestCommandOutcome.Conflict);
                        if(!await StillAuthorized(transaction,sessionFence,command,token,pilotWrite:true)) return Result(PurchaseRequestCommandOutcome.Denied);
                        token.ThrowIfCancellationRequested(); commitAttempted=true; possibleWrite=true;
                        await transaction.CommitAsync(token); committed=true; token.ThrowIfCancellationRequested();
                        return new(PurchaseRequestCommandOutcome.Replayed,receipt);
                    }
                    if(phase==0 || custody is null || row.Attempt!=custody)
                        return Result(PurchaseRequestCommandOutcome.OutcomeUnknown);
                }
                else if(phase!=0) return Result(PurchaseRequestCommandOutcome.Unavailable);

                PurchaseRequestAggregate? currentDocument=null;
                if(command.Document is not null)
                {
                    currentDocument=await Read(transaction,command.Document,command.Branch,token);
                    if(currentDocument is null || currentDocument.StatusId!=1 || currentDocument.IsLocked is true
                        || PurchaseRequestCommandRules.EqualityToken(currentDocument)!=command.ExpectedToken)
                        return Result(PurchaseRequestCommandOutcome.Conflict);
                    ValidateChanges(currentDocument,command.Changes);
                }
                if(command.NeedsAllocation && !allocator.IsQualified(allocation))
                    return Result(PurchaseRequestCommandOutcome.QualificationRequired);
                if(phase==0)
                {
                    var attempt=Guid.NewGuid();
                    writeAttempted=true;
                    await using(var insert=PurchaseRequestSql.Command(transaction,PurchaseRequestSql.ReserveText))
                    {
                        JournalParameters(insert,key!,slot!,command.Intent); PurchaseRequestSql.Parameter(insert,"@attempt",DbType.Guid,attempt);
                        if(await insert.ExecuteNonQueryAsync(token)!=1) throw new InvalidOperationException("Reservation not acknowledged.");
                    }
                    var stored=await Lookup(transaction,key!,slot!,command.Intent,token);
                    if(!stored.Valid || stored.Row is not {} reserved || reserved.Attempt!=attempt || reserved.Receipt is not null
                        || !reserved.Intent.AsSpan().SequenceEqual(command.Intent)) throw new InvalidOperationException("Reservation readback mismatch.");
                    if(!await StillAuthorized(transaction,sessionFence,command,token,pilotWrite:true)) return Result(PurchaseRequestCommandOutcome.Denied);
                    token.ThrowIfCancellationRequested(); commitAttempted=true; possibleWrite=true;
                    await transaction.CommitAsync(token); committed=true; token.ThrowIfCancellationRequested();
                    custody=attempt; // only this invocation's acknowledged reservation permits phase 1.
                    advance=true;
                    return Result(PurchaseRequestCommandOutcome.OutcomeUnknown);
                }
                if(!await StillAuthorized(transaction,sessionFence,command,token,pilotWrite:true)) return Result(PurchaseRequestCommandOutcome.Denied);
                writeAttempted=true;
                var ids=command.NeedsAllocation ? await allocator.AllocateAsync(transaction,allocation,token)
                    : new PurchaseRequestAllocatedIdentifiers(command.Document!,Array.Empty<PurchaseRequestAllocatedLine>());
                ids=ValidateIdentifiers(ids,allocation);
                if(!await TransactionValid(transaction,token)) throw new InvalidOperationException("Allocator transaction mismatch.");
                var desired=BuildDesired(command,currentDocument,ids);
                if(currentDocument is null)
                {
                    if(await Read(transaction,ids.PurchaseRequestId,command.Branch,token) is not null)
                        return Result(PurchaseRequestCommandOutcome.Conflict);
                    await using(var insert=PurchaseRequestSql.Command(transaction,PurchaseRequestSql.InsertHeadText))
                    {
                        PurchaseRequestSql.Document(insert,ids.PurchaseRequestId); PurchaseRequestSql.Header(insert,command.Header!);
                        PurchaseRequestSql.Parameter(insert,"@branch",DbType.AnsiString,command.Branch,50);
                        await One(insert,token);
                    }
                    foreach(var line in desired.Lines) await WriteLine(transaction,PurchaseRequestSql.InsertLineText,ids.PurchaseRequestId,line,token);
                }
                else if(command.Header is not null)
                {
                    await using(var update=PurchaseRequestSql.Command(transaction,PurchaseRequestSql.UpdateHeadText))
                    {
                        PurchaseRequestSql.Document(update,command.Document!); PurchaseRequestSql.Scope(update,command.Branch);
                        PurchaseRequestSql.Header(update,command.Header); await One(update,token);
                    }
                    foreach(var change in command.Changes)
                    {
                        var lineId=change.Kind==PurchaseRequestLineChangeKind.Add
                            ? ids.Lines.Single(l=>l.ClientLineKey==change.ClientLineKey).LineId : change.LineId!;
                        if(change.Kind==PurchaseRequestLineChangeKind.Remove)
                        {
                            await using var delete=PurchaseRequestSql.Command(transaction,PurchaseRequestSql.DeleteLineText);
                            PurchaseRequestSql.Document(delete,command.Document!); PurchaseRequestSql.Parameter(delete,"@lineScope",DbType.String,lineId,50);
                            await One(delete,token);
                        }
                        else await WriteLine(transaction,change.Kind==PurchaseRequestLineChangeKind.Add ? PurchaseRequestSql.InsertLineText : PurchaseRequestSql.UpdateLineText,
                            command.Document!,new(lineId,change.Values!),token);
                    }
                }
                if(command.Submits)
                {
                    await using var submit=PurchaseRequestSql.Command(transaction,PurchaseRequestSql.SubmitText);
                    PurchaseRequestSql.Document(submit,desired.PurchaseRequestId); PurchaseRequestSql.Scope(submit,command.Branch); await One(submit,token);
                }
                var persisted=await Read(transaction,desired.PurchaseRequestId,command.Branch,token);
                if(persisted is null || !PurchaseRequestCommandRules.IntentBytes(desired).AsSpan().SequenceEqual(PurchaseRequestCommandRules.IntentBytes(persisted)))
                    throw new InvalidOperationException("Persisted aggregate mismatch.");
                var result=new PurchaseRequestCommandReceipt(command.Action,command.Key,persisted,
                    PurchaseRequestCommandRules.EqualityToken(persisted),ids.Lines);
                await using(var complete=PurchaseRequestSql.Command(transaction,PurchaseRequestSql.CompleteText))
                {
                    JournalParameters(complete,key!,slot!,command.Intent); PurchaseRequestSql.Parameter(complete,"@attempt",DbType.Guid,custody!.Value);
                    PurchaseRequestSql.Document(complete,persisted.PurchaseRequestId);
                    PurchaseRequestSql.Parameter(complete,"@receipt",DbType.String,JsonSerializer.Serialize(result,PurchaseRequestCommandRules.Json),-1);
                    PurchaseRequestSql.Parameter(complete,"@aggregate",DbType.Binary,PurchaseRequestCommandRules.IntentBytes(persisted),-1);
                    await One(complete,token);
                }
                var done=await Lookup(transaction,key!,slot!,command.Intent,token);
                if(!done.Valid || done.Row is not {} completed || completed.Attempt!=custody || completed.Receipt is null
                    || !completed.Intent.AsSpan().SequenceEqual(command.Intent)
                    || JsonSerializer.Serialize(completed.Receipt,PurchaseRequestCommandRules.Json)!=JsonSerializer.Serialize(result,PurchaseRequestCommandRules.Json))
                    throw new InvalidOperationException("Receipt readback mismatch.");
                if(!await TransactionValid(transaction,token)) throw new InvalidOperationException("Transaction boundary mismatch.");
                if(!await StillAuthorized(transaction,sessionFence,command,token,pilotWrite:true)) return Result(PurchaseRequestCommandOutcome.Denied);
                token.ThrowIfCancellationRequested(); commitAttempted=true; possibleWrite=true;
                await transaction.CommitAsync(token); committed=true; token.ThrowIfCancellationRequested();
                return new(PurchaseRequestCommandOutcome.Committed,result);
            }
            try { answer=await ExecutePhase(); }
            catch(OperationCanceledException) { answer=Result(commitAttempted ? PurchaseRequestCommandOutcome.OutcomeUnknown : PurchaseRequestCommandOutcome.Cancelled); }
            catch(PurchaseConflictException) { answer=Result(commitAttempted ? PurchaseRequestCommandOutcome.OutcomeUnknown : PurchaseRequestCommandOutcome.Conflict); }
            catch(SessionCheckpointException) { answer=Result(possibleWrite ? PurchaseRequestCommandOutcome.OutcomeUnknown : PurchaseRequestCommandOutcome.Unavailable); }
            catch(Exception) { answer=Result(commitAttempted ? PurchaseRequestCommandOutcome.OutcomeUnknown : PurchaseRequestCommandOutcome.Unavailable); }
            finally
            {
                if(transaction is not null)
                {
                    if(!committed) { try { await transaction.RollbackAsync(CancellationToken.None); } catch(Exception) { cleanupOk=false; } }
                    try { await transaction.DisposeAsync(); } catch(Exception) { cleanupOk=false; }
                }
                if(owned && connection is not null)
                { try { await connection.DisposeAsync(); } catch(Exception) { cleanupOk=false; } }
            }
            // A reservation/commit may have survived. Never turn lost authority or
            // failed cleanup into a claimed rollback or replacement-dispatch signal.
            if(!cleanupOk) return Result(possibleWrite || writeAttempted
                ? PurchaseRequestCommandOutcome.OutcomeUnknown : PurchaseRequestCommandOutcome.Unavailable);
            if(answer.Outcome is PurchaseRequestCommandOutcome.Denied or PurchaseRequestCommandOutcome.Cancelled)
                return possibleWrite ? Result(PurchaseRequestCommandOutcome.OutcomeUnknown) : answer;
            // A known SQL/qualification failure with successful rollback keeps its
            // existing outcome. Session failures have a separate uncertain path.
            if(answer.Outcome is PurchaseRequestCommandOutcome.Unavailable or PurchaseRequestCommandOutcome.QualificationRequired)
                return answer;
            try
            {
                // Both transaction and connection cleanup are awaited before full
                // identity SQL can run, including between reservation and dispatch.
                token.ThrowIfCancellationRequested();
                var live=await Resolve(token);
                if(!sessionFence.TryAccept(live,out var accepted)
                    || accepted.BranchIds is null || !accepted.BranchIds.Contains(command.Branch,StringComparer.Ordinal))
                    return Result(possibleWrite ? PurchaseRequestCommandOutcome.OutcomeUnknown : PurchaseRequestCommandOutcome.Denied);
                token.ThrowIfCancellationRequested();
            }
            catch(OperationCanceledException) { return Result(possibleWrite ? PurchaseRequestCommandOutcome.OutcomeUnknown : PurchaseRequestCommandOutcome.Cancelled); }
            catch(Exception) { return Result(possibleWrite ? PurchaseRequestCommandOutcome.OutcomeUnknown : PurchaseRequestCommandOutcome.Unavailable); }
            if(advance) continue;
            return answer;
        }
        return Result(PurchaseRequestCommandOutcome.Unavailable);
    }
    private async Task<AuthoritativeIdentity?> Resolve(CancellationToken token,bool localOnly=false,bool pilotWrite=false)
    {
        token.ThrowIfCancellationRequested();
        AuthoritativeIdentity? id;
        try { id=await (localOnly ? inspect!(token) : session(token)).WaitAsync(token); }
        catch(OperationCanceledException) { throw; }
        catch(Exception) { throw new SessionCheckpointException(); }
        token.ThrowIfCancellationRequested();
        if(id is null || id.TenantId!=company.TenantId || id.CompanyId!=company.CompanyId
            || !PurchaseRequestCommandRules.Identifier(id.PrincipalId,100) || !PurchaseRequestCommandRules.Identifier(id.TenantId,100)
            || !PurchaseRequestCommandRules.Identifier(id.CompanyId,100) || string.IsNullOrEmpty(id.CredentialStamp)
            || id.Capabilities is null) return null;
        if(pilot is not null && (!pilot.CoversIdentity(id)
            || !(pilotWrite ? pilot.CanWrite(clock.GetUtcNow()) : pilot.CanObserve(clock.GetUtcNow())))) return null;
        return id with { BranchIds=id.BranchIds?.ToArray(),Capabilities=id.Capabilities.ToArray() };
    }
    private async Task<bool> StillAuthorized(DbTransaction tx,PurchaseRequestSessionFence sessionFence,Submitted command,CancellationToken token,bool strict=false,bool pilotWrite=false)
    {
        var live=await Resolve(token,localOnly:true,pilotWrite:pilotWrite);
        return sessionFence.TryAccept(live,out var accepted) && await Authority(tx,accepted,command,token,strict)
            && (pilot is null || (pilotWrite ? pilot.CanWrite(clock.GetUtcNow()) : pilot.CanObserve(clock.GetUtcNow())));
    }
    private static async Task<bool> Authority(DbTransaction tx,AuthoritativeIdentity id,Submitted input,CancellationToken token,bool strict=false)
    {
        if(id.BranchIds is null || !id.BranchIds.Contains(input.Branch,StringComparer.Ordinal)) return false;
        LegacyUser user;
        await using(var cmd=PurchaseRequestSql.Command(tx,PurchaseRequestSql.CredentialText))
        {
            PurchaseRequestSql.Parameter(cmd,"@actor",DbType.String,id.PrincipalId,100);
            await using var r=await cmd.ExecuteReaderAsync(token);
            if(strict && !LookupShape(r,typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool))) return false;
            if(!await r.ReadAsync(token) || Enumerable.Range(0,5).Any(r.IsDBNull)) return false;
            user=new(r.GetString(0),"",r.GetString(1),r.GetBoolean(2),r.GetString(3),!r.GetBoolean(4));
            if(await r.ReadAsync(token) || user.Username!=id.PrincipalId || user.Disabled || !user.GroupEnabled
                || !PurchaseRequestCommandRules.Identifier(user.GroupId,20) || string.IsNullOrEmpty(user.StoredHash)
                || LegacyIdentityAuthority.Stamp(user)!=id.CredentialStamp) return false;
            if(strict && await r.NextResultAsync(token)) return false;
        }
        await using(var cmd=PurchaseRequestSql.Command(tx,PurchaseRequestSql.GrantsText))
        {
            PurchaseRequestSql.Parameter(cmd,"@username",DbType.String,id.PrincipalId,100);
            PurchaseRequestSql.Parameter(cmd,"@group",DbType.String,user.GroupId,20);
            PurchaseRequestSql.Parameter(cmd,"@menu",DbType.String,PurchaseRequestCommandRules.MenuId,50);
            await using var r=await cmd.ExecuteReaderAsync(token);
            if(strict && !LookupShape(r,typeof(string),typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool),typeof(int),typeof(int))) return false;
            if(!await r.ReadAsync(token) || new[]{0,1,3,4,5,6,7}.Any(r.IsDBNull)) return false;
            var valid=r.GetString(0)==PurchaseRequestCommandRules.MenuId && r.GetString(1)==PurchaseRequestCommandRules.FormId
                && (r.IsDBNull(2) || r.GetString(2).Length==0) && !r.GetBoolean(3) && r.GetString(4)=="05" && !r.GetBoolean(5)
                && (!input.Creates || r.GetInt32(6)==1) && (!(input.Submits || !input.Creates) || r.GetInt32(7)==1);
            if(await r.ReadAsync(token) || !valid) return false;
            if(strict && await r.NextResultAsync(token)) return false;
        }
        // Native blank expands only through the reviewed catalog resolver; the live
        // identity's exact branch membership remains an independent fence.
        try
        {
            var branches = await SqlLegacyBranchScope.ReadAsync(tx, user, token);
            return branches.Contains(input.Branch, StringComparer.Ordinal);
        }
        // Preserve strict receipt lookup's denial for invalid authority projections.
        // Timeouts and cancellation retain their existing outer outcomes.
        catch (InvalidOperationException) when (strict) { return false; }
    }
    private async Task<bool> Probe(DbTransaction tx,CancellationToken token,bool strict=false)
    {
        await using var cmd=PurchaseRequestSql.Command(tx,PurchaseRequestSql.ProbeText); await using var r=await cmd.ExecuteReaderAsync(token);
        if(strict && !LookupShape(r,typeof(int),typeof(Guid),typeof(int),typeof(int))) return false;
        return await r.ReadAsync(token) && !Enumerable.Range(0,4).Any(r.IsDBNull) && r.GetInt32(0)==1
            && r.GetGuid(1)==binding && r.GetInt32(2)==1 && r.GetInt32(3)==1 && !await r.ReadAsync(token)
            && (!strict || !await r.NextResultAsync(token));
    }
    private static async Task<bool> TransactionValid(DbTransaction tx,CancellationToken token,bool strict=false)
    {
        await using var cmd=PurchaseRequestSql.Command(tx,PurchaseRequestSql.TransactionText); await using var r=await cmd.ExecuteReaderAsync(token);
        if(strict && !LookupShape(r,typeof(int),typeof(int))) return false;
        return await r.ReadAsync(token) && r.GetInt32(0)==1 && r.GetInt32(1)==1 && !await r.ReadAsync(token)
            && (!strict || !await r.NextResultAsync(token));
    }
    private void JournalParameters(DbCommand cmd,byte[] key,byte[] slot,byte[] intent)
    {
        PurchaseRequestSql.Parameter(cmd,"@binding",DbType.Guid,binding); PurchaseRequestSql.Parameter(cmd,"@slot",DbType.Binary,slot,32);
        PurchaseRequestSql.Parameter(cmd,"@keyBytes",DbType.Binary,key,-1); PurchaseRequestSql.Parameter(cmd,"@intentBytes",DbType.Binary,intent,-1);
        PurchaseRequestSql.Parameter(cmd,"@keyLength",DbType.Int32,key.Length); PurchaseRequestSql.Parameter(cmd,"@intentLength",DbType.Int32,intent.Length);
    }
    private async Task<(bool Valid,JournalRow? Row)> Lookup(DbTransaction tx,byte[] key,byte[] slot,byte[] intent,CancellationToken token,bool strict=false)
    {
        await using var cmd=PurchaseRequestSql.Command(tx,PurchaseRequestSql.LookupText); JournalParameters(cmd,key,slot,intent);
        await using var r=await cmd.ExecuteReaderAsync(token);
        if(strict && !LookupShape(r,typeof(Guid),typeof(byte[]),typeof(byte[]),typeof(byte[]),typeof(Guid),typeof(byte),typeof(string),typeof(string),typeof(byte[])))
            return (false,null);
        if(!await r.ReadAsync(token)) return (!strict || !await r.NextResultAsync(token),null);
        if(Enumerable.Range(0,6).Any(r.IsDBNull) || r.GetGuid(0)!=binding || !((byte[])r.GetValue(1)).AsSpan().SequenceEqual(slot)
            || !((byte[])r.GetValue(2)).AsSpan().SequenceEqual(key)) return (false,null);
        var storedIntent=(byte[])r.GetValue(3); var attempt=r.GetGuid(4); var state=r.GetByte(5);
        if(attempt==Guid.Empty || storedIntent.Length is <1 or >PurchaseRequestCommandRules.MaxIntentBytes) return (false,null);
        PurchaseRequestCommandReceipt? receipt=null; byte[]? aggregate=null;
        if(state==0)
        { if(!r.IsDBNull(6) || !r.IsDBNull(7) || !r.IsDBNull(8)) return (false,null); }
        else if(state==1)
        {
            if(r.IsDBNull(6) || r.IsDBNull(7) || r.IsDBNull(8) || r.GetString(7).Length>PurchaseRequestCommandRules.MaxIntentBytes*2) return (false,null);
            var json=r.GetString(7);
            receipt=JsonSerializer.Deserialize<PurchaseRequestCommandReceipt>(json,PurchaseRequestCommandRules.Json);
            if(strict)
            {
                using var raw=JsonDocument.Parse(json);
                // Reject duplicate, missing, unknown or case-aliased properties at every nesting level.
                if(receipt is null || !LookupJsonShape(raw.RootElement,JsonSerializer.SerializeToElement(receipt,PurchaseRequestCommandRules.Json)))
                    return (false,null);
            }
            aggregate=(byte[])r.GetValue(8);
            if(receipt is null || receipt.Document.PurchaseRequestId!=r.GetString(6)
                || receipt.StateToken!=PurchaseRequestCommandRules.EqualityToken(receipt.Document)) return (false,null);
        }
        else return (false,null);
        return await r.ReadAsync(token) || (strict && await r.NextResultAsync(token))
            ? (false,null) : (true,new(attempt,storedIntent,receipt,aggregate));
    }
    private static bool LookupShape(DbDataReader reader,params Type[] types) => reader.FieldCount==types.Length
        && types.Select((type,index)=>reader.GetFieldType(index)==type).All(value=>value);
    private static bool LookupJsonShape(JsonElement raw,JsonElement typed)
    {
        if(raw.ValueKind!=typed.ValueKind) return false;
        if(raw.ValueKind==JsonValueKind.Object)
        {
            var actual=raw.EnumerateObject().ToArray(); var expected=typed.EnumerateObject().ToArray();
            return actual.Length==expected.Length && actual.Select(p=>p.Name).Distinct(StringComparer.Ordinal).Count()==actual.Length
                && expected.All(p=>raw.TryGetProperty(p.Name,out var child) && LookupJsonShape(child,p.Value));
        }
        if(raw.ValueKind==JsonValueKind.Array)
            return raw.GetArrayLength()==typed.GetArrayLength()
                && raw.EnumerateArray().Zip(typed.EnumerateArray(),LookupJsonShape).All(value=>value);
        return true;
    }
    private static bool LookupReceiptMatches(PurchaseRequestCommandReceipt receipt,Submitted command)
    {
        if(receipt.Document is null || receipt.Document.Header is null || receipt.Document.Lines is null
            || receipt.AllocatedLines is null || !ReceiptMatches(receipt,command)) return false;
        var document=receipt.Document;
        // The persisted writer emits canonical aggregates. Do not silently repair a corrupted receipt.
        if(!PurchaseRequestCommandRules.IntentBytes(document).AsSpan().SequenceEqual(
                PurchaseRequestCommandRules.IntentBytes(PurchaseRequestCommandRules.Normalize(document)))
            || document.StatusId!=(command.Submits ? 2 : 1)
            || (command.Submits ? document.IsLocked is not true : document.IsLocked is true)
            || (command.Creates && !command.Submits && document.IsLocked is not false)) return false;
        if(command.Header is not null && !PurchaseRequestCommandRules.IntentBytes(command.Header).AsSpan()
            .SequenceEqual(PurchaseRequestCommandRules.IntentBytes(document.Header))) return false;
        var additions=command.NewLines.Concat(command.Changes.Where(c=>c.Kind==PurchaseRequestLineChangeKind.Add)
            .Select(c=>new PurchaseRequestNewLine(c.ClientLineKey!,c.Values!))).ToArray();
        var maps=receipt.AllocatedLines;
        if(maps.Count!=additions.Length || maps.Any(m=>m is null || !PurchaseRequestCommandRules.Identifier(m.LineId,50)
                || !additions.Any(a=>a.ClientLineKey==m.ClientLineKey))
            || maps.Select(m=>m.ClientLineKey).Distinct(StringComparer.Ordinal).Count()!=maps.Count
            || maps.Select(m=>m.LineId).Distinct(StringComparer.Ordinal).Count()!=maps.Count) return false;
        // ValidateChanges requires each non-Add ID to exist in the writer's prestate.
        // Track that known occupancy and the final effect in the same order as BuildDesired/Run.
        // A Remove may free an ID for a later Add; allocation uniqueness is not a no-reuse rule.
        var occupied=command.Changes.Where(c=>c.Kind!=PurchaseRequestLineChangeKind.Add)
            .Select(c=>c.LineId!).ToHashSet(StringComparer.Ordinal);
        var effects=new Dictionary<string,PurchaseRequestLineValues?>(StringComparer.Ordinal);
        foreach(var addition in command.NewLines)
        {
            var id=maps.Single(m=>m.ClientLineKey==addition.ClientLineKey).LineId;
            if(!occupied.Add(id)) return false;
            effects[id]=addition.Values;
        }
        foreach(var change in command.Changes)
        {
            var id=change.Kind==PurchaseRequestLineChangeKind.Add
                ? maps.Single(m=>m.ClientLineKey==change.ClientLineKey).LineId : change.LineId!;
            if(change.Kind==PurchaseRequestLineChangeKind.Remove)
            {
                if(!occupied.Remove(id)) return false;
                effects[id]=null;
            }
            else
            {
                if(change.Kind==PurchaseRequestLineChangeKind.Add ? !occupied.Add(id) : !occupied.Contains(id)) return false;
                effects[id]=change.Values!;
            }
        }
        if(command.Creates && document.Lines.Count!=maps.Count) return false;
        // Compare only the last effect for each touched physical ID, not intermediate states.
        // Untouched preimage values are not present in the original Save DTO or journal.
        foreach(var effect in effects)
        {
            var line=document.Lines.SingleOrDefault(l=>l.LineId==effect.Key);
            if(effect.Value is null ? line is not null : line is null || line.Values!=effect.Value) return false;
        }
        if(command.Action==PurchaseRequestCommandRules.SubmitAction
            && PurchaseRequestCommandRules.EqualityToken(document with { StatusId=1,IsLocked=false })!=command.ExpectedToken
            && PurchaseRequestCommandRules.EqualityToken(document with { StatusId=1,IsLocked=null })!=command.ExpectedToken)
            return false;
        return true;
    }
    private static bool ReceiptMatches(PurchaseRequestCommandReceipt receipt,Submitted command) => receipt.ActionId==command.Action
        && receipt.IdempotencyKey==command.Key && receipt.Document.BranchId==command.Branch
        && (command.Document is null || receipt.Document.PurchaseRequestId==command.Document);
    private static async Task<PurchaseRequestAggregate?> Read(DbTransaction tx,string document,string branch,CancellationToken token,bool strict=false)
    {
        PurchaseRequestAggregate head;
        await using(var cmd=PurchaseRequestSql.Command(tx,PurchaseRequestSql.HeadText))
        {
            PurchaseRequestSql.Document(cmd,document); await using var r=await cmd.ExecuteReaderAsync(token);
            if(strict && !LookupShape(r,typeof(string),typeof(DateTime),typeof(int),typeof(string),typeof(string),typeof(string),typeof(decimal),typeof(string),typeof(int),typeof(bool),typeof(string),typeof(string),typeof(double),typeof(string)))
                throw new InvalidOperationException("Invalid observation head shape.");
            if(!await r.ReadAsync(token))
            {
                if(strict && await r.NextResultAsync(token)) throw new InvalidOperationException("Unexpected observation head result.");
                return null;
            }
            if(new[]{0,3,4,8,10,11,12,13}.Any(r.IsDBNull) || r.GetString(0)!=document || r.GetString(13)!=branch) throw new PurchaseConflictException();
            var header=new PurchaseRequestHeaderInput(r.IsDBNull(1) ? null : r.GetDateTime(1).ToString("yyyy-MM-dd'T'HH:mm:ss.fff",CultureInfo.InvariantCulture),
                r.IsDBNull(2) ? null : r.GetInt32(2),r.GetString(3),r.GetString(4),r.IsDBNull(5) ? null : r.GetString(5),
                r.IsDBNull(6) ? null : r.GetDecimal(6).ToString("0.00",CultureInfo.InvariantCulture),r.IsDBNull(7) ? null : r.GetString(7),
                r.GetString(10),r.GetString(11),r.GetDouble(12));
            head=new(document,branch,header,r.GetInt32(8),r.IsDBNull(9) ? null : r.GetBoolean(9),Array.Empty<PurchaseRequestPersistedLine>());
            if(await r.ReadAsync(token)) throw new InvalidOperationException("Duplicate master.");
            if(strict && await r.NextResultAsync(token)) throw new InvalidOperationException("Unexpected observation head result.");
        }
        var lines=new List<PurchaseRequestPersistedLine>();
        await using(var cmd=PurchaseRequestSql.Command(tx,PurchaseRequestSql.DetailsText))
        {
            PurchaseRequestSql.Document(cmd,document); await using var r=await cmd.ExecuteReaderAsync(token);
            if(strict && !LookupShape(r,typeof(string),typeof(string),typeof(decimal),typeof(string),typeof(decimal),typeof(decimal),typeof(decimal),typeof(string),typeof(string)))
                throw new InvalidOperationException("Invalid observation detail shape.");
            while(await r.ReadAsync(token))
            {
                if(lines.Count==PurchaseRequestCommandRules.MaxLines || new[]{0,1,4,5,8}.Any(r.IsDBNull))
                    throw new InvalidOperationException("Detail shape/scope mismatch.");
                // Fetch the complete source SQL FK relation first, then reject physical
                // aliases. Never silently omit collated case/accent/space-owned children.
                if(r.GetString(8)!=document) throw new PurchaseConflictException();
                string? D(int i)=>r.IsDBNull(i) ? null : r.GetDecimal(i).ToString("0",CultureInfo.InvariantCulture);
                lines.Add(new(r.GetString(0),new(r.GetString(1),D(2),r.IsDBNull(3) ? null : r.GetString(3),D(4)!,D(5)!,D(6),r.IsDBNull(7) ? null : r.GetString(7))));
            }
            if(strict && await r.NextResultAsync(token)) throw new InvalidOperationException("Unexpected observation detail result.");
        }
        return PurchaseRequestCommandRules.Normalize(head with { Lines=lines });
    }
    private static async Task WriteLine(DbTransaction tx,string sql,string document,PurchaseRequestPersistedLine line,CancellationToken token)
    {
        await using var cmd=PurchaseRequestSql.Command(tx,sql); PurchaseRequestSql.Document(cmd,document); PurchaseRequestSql.Line(cmd,line.Values);
        PurchaseRequestSql.Parameter(cmd,sql==PurchaseRequestSql.InsertLineText ? "@line" : "@lineScope",
            sql==PurchaseRequestSql.InsertLineText ? DbType.AnsiString : DbType.String,line.LineId,50); await One(cmd,token);
    }
    private static async Task One(DbCommand cmd,CancellationToken token)
    { if(await cmd.ExecuteNonQueryAsync(token)!=1) throw new PurchaseConflictException(); }
    private PurchaseRequestAllocationContext AllocationContext(AuthoritativeIdentity id,Submitted c) => new(binding,id.TenantId,id.CompanyId,c.Branch,c.Action,c.Key,c.Document,
        Array.AsReadOnly(c.NewLines.Select(l=>l.ClientLineKey).Concat(c.Changes.Where(l=>l.Kind==PurchaseRequestLineChangeKind.Add).Select(l=>l.ClientLineKey!)).ToArray()));
    private static PurchaseRequestAllocatedIdentifiers ValidateIdentifiers(PurchaseRequestAllocatedIdentifiers ids,PurchaseRequestAllocationContext context)
    {
        if(ids is null || !PurchaseRequestCommandRules.Identifier(ids.PurchaseRequestId,50) || ids.Lines is null
            || (context.ExistingDocumentId is not null && ids.PurchaseRequestId!=context.ExistingDocumentId)
            || ids.Lines.Count!=context.ClientLineKeys.Count) throw new InvalidOperationException("Qualified allocation required.");
        var lines=ids.Lines.ToArray();
        if(lines.Any(l=>l is null || !context.ClientLineKeys.Contains(l.ClientLineKey,StringComparer.Ordinal) || !PurchaseRequestCommandRules.Identifier(l.LineId,50))
            || lines.Select(l=>l.ClientLineKey).Distinct(StringComparer.Ordinal).Count()!=lines.Length
            || lines.Select(l=>l.LineId).Distinct(StringComparer.Ordinal).Count()!=lines.Length) throw new InvalidOperationException("Allocation mismatch.");
        return ids with { Lines=Array.AsReadOnly(lines) };
    }
    private static void ValidateChanges(PurchaseRequestAggregate current,IReadOnlyList<PurchaseRequestLineChange> changes)
    {
        if(changes.Where(l=>l.Kind!=PurchaseRequestLineChangeKind.Add).Any(l=>!current.Lines.Any(e=>e.LineId==l.LineId))) throw new PurchaseConflictException();
        if(current.Lines.Count+changes.Count(l=>l.Kind==PurchaseRequestLineChangeKind.Add)-changes.Count(l=>l.Kind==PurchaseRequestLineChangeKind.Remove)>PurchaseRequestCommandRules.MaxLines)
            throw new PurchaseConflictException();
    }
    private static PurchaseRequestAggregate BuildDesired(Submitted c,PurchaseRequestAggregate? current,PurchaseRequestAllocatedIdentifiers ids)
    {
        var lines=current?.Lines.ToDictionary(l=>l.LineId,StringComparer.Ordinal) ?? new Dictionary<string,PurchaseRequestPersistedLine>(StringComparer.Ordinal);
        foreach(var line in c.NewLines) { var id=ids.Lines.Single(l=>l.ClientLineKey==line.ClientLineKey).LineId; lines.Add(id,new(id,line.Values)); }
        foreach(var change in c.Changes)
        {
            var id=change.Kind==PurchaseRequestLineChangeKind.Add ? ids.Lines.Single(l=>l.ClientLineKey==change.ClientLineKey).LineId : change.LineId!;
            if(change.Kind==PurchaseRequestLineChangeKind.Remove) lines.Remove(id);
            else { if(change.Kind==PurchaseRequestLineChangeKind.Add && lines.ContainsKey(id)) throw new PurchaseConflictException(); lines[id]=new(id,change.Values!); }
        }
        return PurchaseRequestCommandRules.Normalize(new(ids.PurchaseRequestId,c.Branch,c.Header ?? current!.Header,
            c.Submits ? 2 : 1,c.Submits ? true : current is null ? false : current.IsLocked,lines.Values.ToArray()));
    }
    private byte[] Key(AuthoritativeIdentity id,Submitted command)
    {
        using var stream=new MemoryStream(); using var writer=new BinaryWriter(stream,new UTF8Encoding(false,true));
        foreach(var value in new[]{binding.ToString("D"),id.TenantId,id.CompanyId,id.PrincipalId,command.Branch,command.Action,command.Key}) writer.Write(value);
        writer.Flush(); var bytes=stream.ToArray(); if(bytes.Length>4096) throw new ArgumentException("Key bound."); return bytes;
    }
    private static PurchaseRequestCommandResult Result(PurchaseRequestCommandOutcome kind)=>new(kind);
    private sealed class PurchaseConflictException : Exception { }
    private sealed class SessionCheckpointException : Exception { }
    private sealed record JournalRow(Guid Attempt,byte[] Intent,PurchaseRequestCommandReceipt? Receipt,byte[]? Aggregate);
    private sealed record Submitted(string Action,string Key,string Branch,string? Document,string? ExpectedToken,
        PurchaseRequestHeaderInput? Header,IReadOnlyList<PurchaseRequestNewLine> NewLines,IReadOnlyList<PurchaseRequestLineChange> Changes,bool Submits,byte[] Intent)
    {
        public bool Creates=>Document is null;
        public bool NeedsAllocation=>Creates || Changes.Any(l=>l.Kind==PurchaseRequestLineChangeKind.Add);
        public static Submitted Create(CreatePurchaseRequestDraft c)=>new(c.SubmitAfterCreate ? PurchaseRequestCommandRules.CreateSubmitAction : PurchaseRequestCommandRules.CreateAction,
            c.IdempotencyKey,c.BranchId,null,null,c.Header,c.Lines,Array.Empty<PurchaseRequestLineChange>(),c.SubmitAfterCreate,PurchaseRequestCommandRules.IntentBytes(c));
        public static Submitted Save(SavePurchaseRequestDraft c)=>new(PurchaseRequestCommandRules.SaveAction,c.IdempotencyKey,c.BranchId,c.PurchaseRequestId,c.ExpectedStateToken,
            c.Header,Array.Empty<PurchaseRequestNewLine>(),c.LineChanges,false,PurchaseRequestCommandRules.IntentBytes(c));
        public static Submitted Submit(SubmitPurchaseRequest c)=>new(PurchaseRequestCommandRules.SubmitAction,c.IdempotencyKey,c.BranchId,c.PurchaseRequestId,c.ExpectedStateToken,
            null,Array.Empty<PurchaseRequestNewLine>(),Array.Empty<PurchaseRequestLineChange>(),true,PurchaseRequestCommandRules.IntentBytes(c));
    }
}
