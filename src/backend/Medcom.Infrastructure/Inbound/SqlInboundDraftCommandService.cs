using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.Inbound;

public interface IInboundCommandAuthority
{
    Task<AuthoritativeIdentity?> ResolveAsync(CancellationToken token);
    // No fallback to full resolution while an owned transaction is active.
    Task<AuthoritativeIdentity?> InspectAsync(CancellationToken token) => Task.FromResult<AuthoritativeIdentity?>(null);
    Task<IReadOnlyList<string>?> ReadGrantsAsync(DbTransaction transaction, AuthoritativeIdentity identity,
        InboundDraftAction action, CancellationToken token);
}

// Executes fixed SQL. No registration, migration, fixture setup, retry or legacy engine activation.
public sealed class SqlInboundDraftCommandService : IInboundDraftCommandService
{
    private readonly Guid binding;
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> factory;
    private readonly IInboundCommandAuthority authority;
    private readonly IInboundDocumentNumberAllocator allocator;

    public SqlInboundDraftCommandService(Guid databaseBindingId, LegacyCompany company,
        Func<SqlConnection> connectionFactory, Func<CancellationToken,Task<AuthoritativeIdentity?>> resolveLiveSession,
        IInboundDocumentNumberAllocator? allocator = null,
        Func<CancellationToken,Task<AuthoritativeIdentity?>>? inspectLocalSession = null)
        : this(databaseBindingId,company,()=>connectionFactory(),new SqlAuthority(resolveLiveSession, inspectLocalSession),allocator) { }

    // Trusted dependency seam for recording tests and I31's bound factory, which
    // always supplies NativeAuthority. Never register caller-supplied authority.
    public SqlInboundDraftCommandService(Guid databaseBindingId, LegacyCompany company,
        Func<DbConnection> connectionFactory, IInboundCommandAuthority trustedAuthority,
        IInboundDocumentNumberAllocator? allocator = null)
    {
        if(databaseBindingId==Guid.Empty) throw new ArgumentException("Database binding required.",nameof(databaseBindingId));
        binding=databaseBindingId; this.company=company ?? throw new ArgumentNullException(nameof(company));
        factory=connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        authority=trustedAuthority ?? throw new ArgumentNullException(nameof(trustedAuthority));
        this.allocator=allocator ?? new UnqualifiedInboundDocumentNumberAllocator();
    }

    // I31 reuses the actual I15 credential/menu/native-rights reader. This seam
    // does not add permission SQL, a new writer, or runtime qualification.
    internal static IInboundCommandAuthority NativeAuthority(
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolve,
        Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspect = null) => new SqlAuthority(resolve, inspect);

    internal static async Task<string?> ReadAuthorizedDocumentBranchAsync(DbTransaction tx,
        string document, IReadOnlyList<string> grants, CancellationToken token)
    {
        try
        {
            var branch = await Scope(tx, document, grants, token);
            // Read the same physical aggregate as I15, including SQL-equal child aliases.
            // Status is deliberately not an admission condition after a successful Send.
            Require(await Snapshot.Read(tx, document, token) is not null, InboundDraftOutcome.NotFound);
            return branch;
        }
        catch (Stop stop) when (stop.Outcome is InboundDraftOutcome.Denied or InboundDraftOutcome.NotFound)
        { return null; }
    }

    public Task<InboundDraftResult> ExecuteAsync(InboundDraftCommand request,CancellationToken token=default)
        => RunAsync(request,false,token);
    public Task<InboundDraftResult> ReconcileAsync(InboundDraftCommand originalRequest,CancellationToken token=default)
        => RunAsync(originalRequest,true,token);

    private async Task<InboundDraftResult> RunAsync(InboundDraftCommand request,bool reconcile,CancellationToken token)
    {
        if(InboundDraftValidation.Check(request) is {} invalid) return new(invalid);
        try{request=Freeze(request);}catch(Exception e) when(e is ArgumentException or InvalidOperationException or NullReferenceException)
        {return new(InboundDraftOutcome.InvalidInput);}
        if(InboundDraftValidation.Check(request) is {} frozenInvalid) return new(frozenInvalid);
        if(!reconcile && request.Action==InboundDraftAction.Create && !allocator.IsQualified)
            return new(InboundDraftOutcome.NumberingUnavailable,Code:"numbering_not_qualified");
        if(System.Transactions.Transaction.Current is not null) return new(InboundDraftOutcome.Unavailable);
        AuthoritativeIdentity? originalIdentity=null;
        var sessionFence=new InboundDraftSessionFence();
        byte[]? intent=null;
        Guid attempt=Guid.Empty;
        // A committed reservation gives THIS stack the only custody to enter phase 1.
        // Pending rows never authorize restart/takeover. Reconciliation does not dispatch.
        for(var phase=0;phase<2;phase++)
        {
            DbConnection? connection=null; DbTransaction? tx=null;
            var owns=false; var commitAttempted=false; var committed=false; var wrote=false; var cleanupOk=true;
            InboundDraftResult? terminal=null;
            try
            {
                Require(System.Transactions.Transaction.Current is null,InboundDraftOutcome.Unavailable);
                token.ThrowIfCancellationRequested();
                var identity=await authority.ResolveAsync(token);
                Require(Identity(identity) && sessionFence.TryAccept(identity,out _),InboundDraftOutcome.Denied);
                if(originalIdentity is null){originalIdentity=identity; intent=Intent(request,identity!);}
                connection=factory();
                Require(connection is not null && connection.State==ConnectionState.Closed,InboundDraftOutcome.Unavailable);
                owns=true;
                await connection!.OpenAsync(token);
                var started=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
                Require(ReferenceEquals(started.Connection,connection),InboundDraftOutcome.Unavailable);
                tx=started;
                await InboundDraftTargetQualification.VerifyAsync(connection,tx,binding,company,token);
                Require(sessionFence.TryAccept(await authority.InspectAsync(token),out _),InboundDraftOutcome.Denied);
                var grants=await authority.ReadGrantsAsync(tx,identity!,request.Action,token);
                Require(ValidGrants(grants),InboundDraftOutcome.Denied);
                var saved=await Lookup(tx,identity!,request.OperationId,token);
                if(saved is not null)
                {
                    Require(saved.Matches(binding,identity!,request,intent!),InboundDraftOutcome.Conflict);
                    if(saved.Receipt is {} receipt)
                    {
                        var replayBranch=await Scope(tx,receipt.DocumentId,grants!,token);
                        Require(saved.Branch==replayBranch,InboundDraftOutcome.Denied);
                        await Live(tx,sessionFence,request.Action,replayBranch,token);
                        token.ThrowIfCancellationRequested();
                        terminal=new(InboundDraftOutcome.Replayed,receipt);
                    }
                    else if(phase==0 || reconcile || attempt==Guid.Empty || saved.Attempt!=attempt)
                        terminal=new(InboundDraftOutcome.OutcomeUnknown,Code:"operation_pending_reconcile_only");
                }
                else Require(phase==0,InboundDraftOutcome.OutcomeUnknown);
                if(terminal is null && reconcile)
                    terminal=new(InboundDraftOutcome.OutcomeUnknown,Code:"operation_not_observed_no_dispatch");
                if(terminal is null && phase==0)
                {
                    string reservationBranch;
                    if(request.Action==InboundDraftAction.Create)
                    {
                        Require(grants!.Contains(request.Header!.BranchId,StringComparer.Ordinal),InboundDraftOutcome.Denied);
                        reservationBranch=request.Header.BranchId;
                    }
                    else
                    {
                        // Reject observable invalid existing-document intents before the durable
                        // reservation. The snapshot is not carried across transactions.
                        (reservationBranch,_)=await ValidateExistingMutation(tx,request,grants!,token);
                    }
                    attempt=Guid.NewGuid();
                    wrote=true;
                    await One(InboundDraftSql.Reserve(tx,binding,identity!,request,intent!,attempt,reservationBranch),token);
                    var reserved=await Lookup(tx,identity!,request.OperationId,token);
                    Require(reserved is not null && reserved.Receipt is null && reserved.Attempt==attempt
                        && reserved.Matches(binding,identity!,request,intent!),InboundDraftOutcome.Unavailable);
                    await Live(tx,sessionFence,request.Action,reservationBranch,token);
                    token.ThrowIfCancellationRequested(); commitAttempted=true;
                    await tx.CommitAsync(token); committed=true; token.ThrowIfCancellationRequested();
                }
                else if(terminal is null)
                {
                    Require(saved is not null && saved.Attempt==attempt && saved.Receipt is null,InboundDraftOutcome.OutcomeUnknown);
                    string document; string branch; Snapshot? before;
                    if(request.Action==InboundDraftAction.Create)
                    {
                        branch=request.Header!.BranchId;
                        Require(grants!.Contains(branch,StringComparer.Ordinal),InboundDraftOutcome.Denied);
                        document=await allocator.AllocateAsync(tx,request.Header.DocumentDate,token) ?? "";
                        Require(InboundDraftValidation.Ansi(document,50),InboundDraftOutcome.NumberingUnavailable);
                        before=await Snapshot.Read(tx,document,token);
                        Require(before is null,InboundDraftOutcome.Conflict);
                    }
                    else
                    {
                        document=request.DocumentId!;
                        // Phase 0 is only a preflight: repeat every predicate against a new
                        // locked snapshot before effects, retaining genuine pending custody.
                        (branch,before)=await ValidateExistingMutation(tx,request,grants!,token);
                    }
                    if(request.Action==InboundDraftAction.Create) ValidateMutation(before,request);
                    Require(saved!.Branch==branch,InboundDraftOutcome.Denied);
                    await Live(tx,sessionFence,request.Action,branch,token);
                    var inserted=new Dictionary<string,InboundDraftDetailUpsert>(StringComparer.Ordinal);
                    wrote=true;
                    if(request.Action==InboundDraftAction.SendToWarehouse)
                    {
                        await One(InboundDraftSql.Send(tx,document,branch),token);
                        await One(InboundDraftSql.LegacyLog(tx,document,identity!.PrincipalId,request.Note),token);
                    }
                    else
                    {
                        await One(InboundDraftSql.Header(tx,document,request.Header!,request.Action==InboundDraftAction.Create),token);
                        foreach(var row in request.RemovedDetailIds ?? [])
                            await One(InboundDraftSql.RemoveDetail(tx,document,row),token);
                        foreach(var row in request.DetailUpserts ?? [])
                        {
                            var key=row.RowId ?? Guid.NewGuid().ToString("D");
                            if(row.RowId is null) inserted.Add(key,row);
                            await One(InboundDraftSql.Detail(tx,document,key,row,request.Header!.RateExchange,row.RowId is null),token);
                        }
                        if(before is not null && before.View.Header.RateExchange!=request.Header!.RateExchange)
                        {
                            await using var amounts=InboundDraftSql.RecalculateAmounts(tx,document,request.Header.RateExchange);
                            Require(await amounts.ExecuteNonQueryAsync(token)==before.View.Details.Count
                                -(request.RemovedDetailIds?.Count ?? 0)+inserted.Count,InboundDraftOutcome.Unavailable);
                        }
                    }
                    var after=await Snapshot.Read(tx,document,token);
                    Require(after is not null && after.Verify(before,request,inserted,identity!.PrincipalId),InboundDraftOutcome.Unavailable);
                    var audit=Guid.NewGuid();
                    var beforeToken=before?.Token ?? Convert.ToHexString(SHA256.HashData("inbound:absent:v1"u8));
                    await One(InboundDraftSql.CommitRecord(tx,binding,identity!,request,intent!,attempt,branch,document,
                        beforeToken,after!.Token,after.View.StatusId,audit),token);
                    var recorded=await Lookup(tx,identity!,request.OperationId,token);
                    Require(recorded is not null && recorded.Matches(binding,identity!,request,intent!)
                        && recorded.Attempt==attempt && recorded.Before==beforeToken && recorded.Receipt is {} ack
                        && ack.DocumentId==document && ack.StateEqualityToken==after.Token && ack.StatusId==after.View.StatusId
                        && ack.AuditId==audit,InboundDraftOutcome.Unavailable);
                    await Live(tx,sessionFence,request.Action,branch,token);
                    token.ThrowIfCancellationRequested(); commitAttempted=true;
                    await tx.CommitAsync(token); committed=true; token.ThrowIfCancellationRequested();
                    terminal=new(InboundDraftOutcome.Committed,recorded!.Receipt);
                }
            }
            catch(Stop stop){terminal=new(stop.Outcome,Code:stop.Code);}
            catch(Exception e) when(e is not OutOfMemoryException)
            {
                terminal=new(commitAttempted ? InboundDraftOutcome.OutcomeUnknown
                    : e is SqlException sql && sql.Number is 2601 or 2627 ? InboundDraftOutcome.Conflict
                    : e is SqlException rejected && rejected.Number is 547 or 515 or 8115 ? InboundDraftOutcome.Rejected
                    : InboundDraftOutcome.Unavailable,Code:commitAttempted ? "commit_ack_unknown_reconcile_only" : "command_unavailable");
            }
            finally
            {
                if(tx is not null)
                {
                    if(!committed && !commitAttempted)
                        try{await tx.RollbackAsync(CancellationToken.None);}
                        catch(Exception e) when(e is not OutOfMemoryException){cleanupOk=false;if(wrote) terminal=new(InboundDraftOutcome.OutcomeUnknown,Code:"rollback_ack_unknown");}
                    try{await tx.DisposeAsync();}catch(Exception e) when(e is not OutOfMemoryException){cleanupOk=false;}
                }
                if(owns) try{await connection!.DisposeAsync();}catch(Exception e) when(e is not OutOfMemoryException){cleanupOk=false;}
            }
            if(!cleanupOk) return new(wrote || commitAttempted || terminal?.Receipt is not null
                ? InboundDraftOutcome.OutcomeUnknown : InboundDraftOutcome.Unavailable,Code:"cleanup_not_acknowledged_reconcile_only");
            if(terminal?.Receipt is not null)
            {
                try
                {
                    token.ThrowIfCancellationRequested();
                    if(!sessionFence.TryAccept(await authority.ResolveAsync(token),out _))
                        return new(InboundDraftOutcome.OutcomeUnknown,Code:"result_authority_changed_reconcile_only");
                    token.ThrowIfCancellationRequested();
                }
                catch(Exception e) when(e is not OutOfMemoryException)
                {return new(InboundDraftOutcome.OutcomeUnknown,Code:"result_authority_changed_reconcile_only");}
            }
            if(terminal is not null) return terminal;
        }
        return new(InboundDraftOutcome.Unavailable);
    }

    private static async Task<(string Branch,Snapshot Before)> ValidateExistingMutation(DbTransaction tx,
        InboundDraftCommand request,IReadOnlyList<string> grants,CancellationToken token)
    {
        var branch=await Scope(tx,request.DocumentId!,grants,token);
        var before=await Snapshot.Read(tx,request.DocumentId!,token);
        Require(before is not null && before.View.StatusId is 0 or 1,InboundDraftOutcome.Rejected);
        Require(before!.Token==request.ExpectedStateEqualityToken,InboundDraftOutcome.Conflict);
        if(request.Header is {} header)
        {
            Require(header.BranchId==branch,InboundDraftOutcome.Denied);
            // Changing the date can change the masked document number; never guess that rebinding.
            Require(header.DocumentDate==before.View.Header.DocumentDate,InboundDraftOutcome.NumberingUnavailable);
        }
        ValidateMutation(before,request);
        return (branch,before!);
    }

    private static void ValidateMutation(Snapshot? before,InboundDraftCommand request)
    {
        if(request.Action==InboundDraftAction.SendToWarehouse)
            Require(before!.CanSend(),InboundDraftOutcome.Rejected);
        else foreach(var row in request.DetailUpserts ?? [])
            if(row.RowId is not null) Require(before is not null && before.HasDetail(row.RowId),InboundDraftOutcome.Conflict);
        foreach(var row in request.RemovedDetailIds ?? [])
            Require(before is not null && before.HasDetail(row),InboundDraftOutcome.Conflict);
        Require((before?.View.Details.Count ?? 0)-(request.RemovedDetailIds?.Count ?? 0)
            +(request.DetailUpserts?.Count(x=>x.RowId is null) ?? 0)<=InboundDraftValidation.MaximumDetails,InboundDraftOutcome.Rejected);
        if(request.Action!=InboundDraftAction.SendToWarehouse)
            Require(Snapshot.SupportsExactCalculations(before,request),InboundDraftOutcome.Unavailable,"derived_calculation_not_qualified");
    }

    public async Task<InboundDraftReadResult> ReadAsync(string documentId,CancellationToken token=default)
    {
        if(!InboundDraftValidation.Ansi(documentId,50)) return new(InboundDraftOutcome.InvalidInput);
        if(System.Transactions.Transaction.Current is not null) return new(InboundDraftOutcome.Unavailable);
        DbConnection? connection=null; DbTransaction? tx=null; var owned=false; var cleanupOk=true;
        AuthoritativeIdentity? identity=null;
        var sessionFence=new InboundDraftSessionFence();
        var result=new InboundDraftReadResult(InboundDraftOutcome.Unavailable);
        try
        {
            token.ThrowIfCancellationRequested();
            identity=await authority.ResolveAsync(token);
            Require(Identity(identity) && sessionFence.TryAccept(identity,out _),InboundDraftOutcome.Denied);
            connection=factory();
            Require(connection is not null && connection.State==ConnectionState.Closed,InboundDraftOutcome.Unavailable);
            owned=true;
            await connection!.OpenAsync(token);
            var started=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
            Require(ReferenceEquals(started.Connection,connection),InboundDraftOutcome.Unavailable);
            tx=started;
            await InboundDraftTargetQualification.VerifyAsync(connection,tx,binding,company,token);
            Require(sessionFence.TryAccept(await authority.InspectAsync(token),out _),InboundDraftOutcome.Denied);
            var grants=await authority.ReadGrantsAsync(tx,identity!,InboundDraftAction.Save,token);
            Require(ValidGrants(grants),InboundDraftOutcome.Denied);
            var branch=await Scope(tx,documentId,grants!,token);
            var snapshot=await Snapshot.Read(tx,documentId,token);
            Require(snapshot is not null,InboundDraftOutcome.NotFound);
            var view=snapshot!.View;
            var display=await ItemDisplayContextReader.ReadAsync(tx,"inbound-requests",view.DocumentId,
                view.Header.BranchId,view.StateEqualityToken,view.StatusId,null,null,null,
                view.Details.Select(line=>(line.RowId!,line.ItemId)).ToArray(),token);
            await Live(tx,sessionFence,InboundDraftAction.Save,branch,token);
            token.ThrowIfCancellationRequested();
            result=new(InboundDraftOutcome.Observed,view,display);
        }
        catch(Stop stop){result=new(stop.Outcome);}
        catch(Exception e) when(e is not OutOfMemoryException){result=new(InboundDraftOutcome.Unavailable);}
        finally
        {
            if(tx is not null)
            {
                try{await tx.RollbackAsync(CancellationToken.None);}catch(Exception e) when(e is not OutOfMemoryException){cleanupOk=false;}
                try{await tx.DisposeAsync();}catch(Exception e) when(e is not OutOfMemoryException){cleanupOk=false;}
            }
            if(owned)try{await connection!.DisposeAsync();}catch(Exception e) when(e is not OutOfMemoryException){cleanupOk=false;}
        }
        if(!cleanupOk)return new(InboundDraftOutcome.Unavailable);
        if(result.Outcome!=InboundDraftOutcome.Observed)return result;
        try
        {
            token.ThrowIfCancellationRequested();
            var current=await authority.ResolveAsync(token);
            token.ThrowIfCancellationRequested();
            return sessionFence.TryAccept(current,out _) ? result : new(InboundDraftOutcome.Denied);
        }
        catch(Exception e) when(e is not OutOfMemoryException){return new(InboundDraftOutcome.Unavailable);}
    }

    private bool Identity(AuthoritativeIdentity? id) => id is not null && id.TenantId==company.TenantId && id.CompanyId==company.CompanyId
        && InboundDraftValidation.Ansi(id.PrincipalId,50) && !string.IsNullOrWhiteSpace(id.CredentialStamp)
        && InboundDraftValidation.Text(id.TenantId,100,true) && InboundDraftValidation.Text(id.CompanyId,100,true);
    private static bool ValidGrants(IReadOnlyList<string>? grants)=>grants is {Count:>0 and <=200}
        && grants.All(x=>InboundDraftValidation.Ansi(x,50));
    private async Task Live(DbTransaction tx,InboundDraftSessionFence fence,InboundDraftAction action,string branch,CancellationToken token)
    {
        var current=await authority.InspectAsync(token);
        Require(fence.TryAccept(current,out _),InboundDraftOutcome.Denied);
        var grants=await authority.ReadGrantsAsync(tx,current!,action,token);
        Require(ValidGrants(grants) && grants!.Contains(branch,StringComparer.Ordinal),InboundDraftOutcome.Denied);
        Require(fence.TryAccept(await authority.InspectAsync(token),out _),InboundDraftOutcome.Denied);
        token.ThrowIfCancellationRequested();
    }
    private static InboundDraftCommand Freeze(InboundDraftCommand request)=>request with
    {
        Header=request.Header is {} h ? h with{RateExchange=Normalize(h.RateExchange)} : null,
        DetailUpserts=Array.AsReadOnly((request.DetailUpserts ?? []).Select(x=>x with
        {SetQuantityByDocument=Normalize(x.SetQuantityByDocument),BarrelQuantityByDocument=Normalize(x.BarrelQuantityByDocument),UnitPrice=Normalize(x.UnitPrice)}).ToArray()),
        RemovedDetailIds=Array.AsReadOnly((request.RemovedDetailIds ?? []).ToArray()),
        CostChanges=Array.AsReadOnly((request.CostChanges ?? []).ToArray())
    };
    private static decimal? Normalize(decimal? value)=>value is null ? null
        : decimal.Parse(value.Value.ToString("G29",CultureInfo.InvariantCulture),NumberStyles.Float,CultureInfo.InvariantCulture);
    private byte[] Intent(InboundDraftCommand request,AuthoritativeIdentity id)=>SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new
    {
        Binding=binding,id.TenantId,id.CompanyId,id.PrincipalId,request.OperationId,request.Action,request.DocumentId,
        request.ExpectedStateEqualityToken,request.Header,
        Details=request.DetailUpserts!.OrderBy(x=>x.RowId,StringComparer.Ordinal).ThenBy(x=>x.ClientLineId),
        Removed=request.RemovedDetailIds!.Order(StringComparer.Ordinal),request.Note
    }));
    private static async Task One(DbCommand command,CancellationToken token)
    {
        await using(command){Require(await command.ExecuteNonQueryAsync(token)==1,InboundDraftOutcome.Conflict);}
    }
    private static async Task<string> Scope(DbTransaction tx,string document,IReadOnlyList<string> grants,CancellationToken token)
    {
        await using var c=InboundDraftSql.Document(tx,InboundDraftSql.BranchText,document);
        await using var r=await c.ExecuteReaderAsync(token);
        Require(await r.ReadAsync(token),InboundDraftOutcome.NotFound);
        Require(!r.IsDBNull(0) && !r.IsDBNull(1) && r.GetString(0)==document,InboundDraftOutcome.Denied);
        var branch=r.GetString(1);
        Require(grants.Contains(branch,StringComparer.Ordinal) && !await r.ReadAsync(token) && !await r.NextResultAsync(token),InboundDraftOutcome.Denied);
        return branch;
    }
    private static readonly string[] JournalColumns=["DatabaseBindingId","TenantId","CompanyId","Actor","OperationId","IntentHash",
        "Action","AttemptId","State","BranchId","DocumentId","BeforeState","AfterState","StatusAfter","AuditId","CommittedAtUtc"];
    private static void Shape(DbDataReader r,string[] columns)=>Require(r.FieldCount==columns.Length
        && Enumerable.Range(0,columns.Length).All(i=>r.GetName(i)==columns[i]),InboundDraftOutcome.Unavailable);
    private async Task<JournalRow?> Lookup(DbTransaction tx,AuthoritativeIdentity id,Guid operation,CancellationToken token)
    {
        await using var c=InboundDraftSql.Journal(tx,InboundDraftSql.LookupText,binding,id,operation);
        await using var r=await c.ExecuteReaderAsync(token); Shape(r,JournalColumns);
        if(!await r.ReadAsync(token)){Require(!await r.NextResultAsync(token),InboundDraftOutcome.Unavailable);return null;}
        Require(Enumerable.Range(0,9).All(i=>!r.IsDBNull(i)),InboundDraftOutcome.Unavailable);
        var state=Convert.ToInt32(r.GetValue(8),CultureInfo.InvariantCulture);
        var row=new JournalRow(r.GetGuid(0),r.GetString(1),r.GetString(2),r.GetString(3),r.GetGuid(4),
            (byte[])r.GetValue(5),r.GetString(6),r.GetGuid(7),r.IsDBNull(9)?null:r.GetString(9),
            r.IsDBNull(10)?null:r.GetString(10),r.IsDBNull(11)?null:r.GetString(11),null);
        Require(state is 0 or 1 && row.Attempt!=Guid.Empty && row.Intent.Length==32,InboundDraftOutcome.Unavailable);
        Require(InboundDraftValidation.Ansi(row.Branch,50) && (row.Document is null || InboundDraftValidation.Ansi(row.Document,50)),InboundDraftOutcome.Unavailable);
        if(state==1)
        {
            Require(Enumerable.Range(9,7).All(i=>!r.IsDBNull(i)),InboundDraftOutcome.Unavailable);
            var status=r.GetInt32(13); var audit=r.GetGuid(14); var after=r.GetString(12);
            Require(status is 0 or 1 or 2 && audit!=Guid.Empty && InboundDraftValidation.StateToken(row.Before)
                && InboundDraftValidation.StateToken(after) && InboundDraftValidation.Ansi(r.GetString(10),50),InboundDraftOutcome.Unavailable);
            Require(row.Action==nameof(InboundDraftAction.SendToWarehouse) ? status==2 : status is 0 or 1,InboundDraftOutcome.Unavailable);
            row=row with{Receipt=new(operation,r.GetString(10),status,after,audit,DateTime.SpecifyKind(r.GetDateTime(15),DateTimeKind.Utc))};
        }
        else Require(Enumerable.Range(11,5).All(r.IsDBNull),InboundDraftOutcome.Unavailable);
        Require(!await r.ReadAsync(token) && !await r.NextResultAsync(token),InboundDraftOutcome.Unavailable);
        return row;
    }
    private sealed record JournalRow(Guid Binding,string Tenant,string Company,string Actor,Guid Operation,
        byte[] Intent,string Action,Guid Attempt,string? Branch,string? Document,string? Before,InboundDraftReceipt? Receipt)
    {
        public bool Matches(Guid binding,AuthoritativeIdentity identity,InboundDraftCommand request,byte[] intent)=>Binding==binding
            && Tenant==identity.TenantId && Company==identity.CompanyId && Actor==identity.PrincipalId && Operation==request.OperationId
            && Action==request.Action.ToString() && (request.Action==InboundDraftAction.Create || Document==request.DocumentId)
            && CryptographicOperations.FixedTimeEquals(Intent,intent);
    }
    private static void Require(bool condition,InboundDraftOutcome outcome,string? code=null)
    {if(!condition)throw new Stop(outcome,code);}
    private sealed class Stop(InboundDraftOutcome outcome,string? code):Exception
    {public InboundDraftOutcome Outcome{get;}=outcome; public string? Code{get;}=code;}

    private sealed class Snapshot(DataTable[] initialTables,string token,InboundDraftView view)
    {
        private readonly DataTable[] tables=initialTables;
        public string Token{get;}=token;
        public InboundDraftView View{get;}=view;
        public bool HasDetail(string row)=>View.Details.Any(x=>x.RowId==row);
        public bool CanSend()=>tables[4].Rows.Count<500 && View.Details.Count!=0 && View.Details.All(x=>x.LotNumberByDocument is not null
            && x.SetQuantityByDocument is not null && x.BarrelQuantityByDocument is not null && x.ExpireDateByDocument is not null);
        public static bool SupportsExactCalculations(Snapshot? before,InboundDraftCommand request)
        {
            var rate=request.Header!.RateExchange;
            foreach(var added in request.DetailUpserts!.Where(x=>x.RowId is null))
                if(!ExactDerived(added,rate,out _,out _))return false;
            if(before is null)return true;
            var rateChanged=before.View.Header.RateExchange!=rate;
            foreach(var original in before.View.Details)
            {
                if(request.RemovedDetailIds!.Contains(original.RowId!,StringComparer.Ordinal))continue;
                var expected=request.DetailUpserts!.FirstOrDefault(x=>x.RowId==original.RowId) ?? original;
                if((rateChanged || CalculationChanged(original,expected)) && !ExactDerived(expected,rate,out _,out _))return false;
            }
            return true;
        }
        private static bool CalculationChanged(InboundDraftDetailUpsert a,InboundDraftDetailUpsert b)
            =>a.SetQuantityByDocument!=b.SetQuantityByDocument || a.UnitPrice!=b.UnitPrice;
        // Only the two fixed, observed T1 expressions. BigInteger avoids decimal's
        // intermediate rounding. Nonintegral/out-of-range results need native qualification.
        private static bool ExactDerived(InboundDraftDetailUpsert row,decimal? rate,out decimal? source,out decimal? amount)
        {
            source=null;amount=null;
            if(row.SetQuantityByDocument is null || row.UnitPrice is null)return true;
            if(!InboundDraftValidation.Number(row.SetQuantityByDocument,18,0)
                || !InboundDraftValidation.Number(row.UnitPrice,18,0) || !InboundDraftValidation.Number(rate,28,10))return false;
            var limit=BigInteger.Pow(10,18);
            var product=new BigInteger(row.SetQuantityByDocument.Value)*new BigInteger(row.UnitPrice.Value);
            if(BigInteger.Abs(product)>=limit)return false;
            source=(decimal)product;
            if(rate is null)return true;
            var bits=decimal.GetBits(rate.Value);
            var numerator=(BigInteger)(uint)bits[0] | ((BigInteger)(uint)bits[1]<<32) | ((BigInteger)(uint)bits[2]<<64);
            if((bits[3]&int.MinValue)!=0)numerator=-numerator;
            var denominator=BigInteger.Pow(10,(bits[3]>>16)&0xff);
            var quotient=BigInteger.DivRem(product*numerator,denominator,out var remainder);
            if(!remainder.IsZero || BigInteger.Abs(quotient)>=limit)return false;
            amount=(decimal)quotient;return true;
        }
        public static async Task<Snapshot?> Read(DbTransaction tx,string document,CancellationToken ct)
        {
            await using var c=InboundDraftSql.Document(tx,InboundDraftSql.SnapshotText,document);
            await using var r=await c.ExecuteReaderAsync(ct);
            var data=new DataTable[5];
            long retainedBytes=0;
            for(var t=0;t<5;t++)
            {
                Require(r.FieldCount is >0 and <=256,InboundDraftOutcome.Unavailable);
                var table=new DataTable{Locale=CultureInfo.InvariantCulture};
                for(var i=0;i<r.FieldCount;i++)table.Columns.Add(r.GetName(i),r.GetFieldType(i));
                while(await r.ReadAsync(ct))
                {
                    Require(table.Rows.Count<(t==0?2:500),InboundDraftOutcome.Unavailable);
                    var values=new object[r.FieldCount];
                    for(var i=0;i<r.FieldCount;i++)
                    {
                        var value=r.GetValue(i);values[i]=value;
                        if(value is DBNull)continue;
                        var length=value is string text ? checked((long)text.Length*2)
                            : value is byte[] binary ? binary.LongLength : 64;
                        Require(length<=2097152,InboundDraftOutcome.Unavailable);
                        retainedBytes=checked(retainedBytes+length);
                        Require(retainedBytes<=8388608,InboundDraftOutcome.Unavailable);
                    }
                    table.Rows.Add(values);
                }
                data[t]=table;
                Require(await r.NextResultAsync(ct)==(t<4),InboundDraftOutcome.Unavailable);
            }
            if(data[0].Rows.Count==0){Require(data.Skip(1).All(x=>x.Rows.Count==0),InboundDraftOutcome.Unavailable);return null;}
            Require(data[0].Rows.Count==1 && data.All(t=>t.Columns.Contains("DocumentID")
                && t.Rows.Cast<DataRow>().All(x=>x.Field<string>("DocumentID")==document)),InboundDraftOutcome.Unavailable);
            Require(data.Skip(1).All(t=>t.Columns.Contains("UserAutoID")
                && t.Rows.Cast<DataRow>().All(x=>InboundDraftValidation.Text(x.Field<string>("UserAutoID"),50,true))
                && t.Rows.Cast<DataRow>().Select(x=>x.Field<string>("UserAutoID")).Distinct(StringComparer.Ordinal).Count()==t.Rows.Count),InboundDraftOutcome.Unavailable);
            var head=data[0].Rows[0];
            var header=new InboundDraftHeader(head.Field<DateTime>("DocumentDate"),head.Field<string>("OrderNumber")!,
                head.Field<string>("InvoiceNo")!,head.Field<string>("DeparturePoint")!,head.Field<string>("DestinationPoint")!,
                head.Field<string>("OrderTypeID")!,head.Field<string>("BranchID")!,head.Field<string?>("ObjectID"),
                head.Field<string?>("CurrencyID"),head.Field<decimal?>("RateExchange"),head.Field<string?>("Notes"));
            Require(InboundDraftValidation.Header(header),InboundDraftOutcome.Unavailable);
            var details=data[1].Rows.Cast<DataRow>().Select(x=>new InboundDraftDetailUpsert(x.Field<string>("UserAutoID"),null,
                x.Field<string>("ItemID")!,x.Field<string?>("LotNumberByDocument"),x.Field<decimal?>("SetQuantityByDocument"),
                x.Field<decimal?>("BarrelQuantityByDocument"),x.Field<DateTime?>("ExpireDateByDocument"),x.Field<decimal?>("UnitPrice"))).ToArray();
            Require(details.All(x=>InboundDraftValidation.Ansi(x.RowId,50)) && details.Select(x=>x.RowId).Distinct(StringComparer.Ordinal).Count()==details.Length,
                InboundDraftOutcome.Unavailable);
            var hash=Hash(data);
            return new(data,hash,new(document,head.Field<int>("StatusID"),header,Array.AsReadOnly(details),data[2].Rows.Count,hash));
        }
        public bool Verify(Snapshot? before,InboundDraftCommand request,Dictionary<string,InboundDraftDetailUpsert> inserted,string actor)
        {
            if(before is not null && (Hash(tables[2])!=Hash(before.tables[2]) || Hash(tables[3])!=Hash(before.tables[3])))return false;
            if(before is null && tables.Skip(2).Any(t=>t.Rows.Count!=0))return false;
            if(request.Action==InboundDraftAction.SendToWarehouse)
            {
                if(before is null || View.StatusId!=2 || !SameRow(tables[0].Rows[0],before.tables[0].Rows[0],["StatusID"])
                    || Hash(tables[1])!=Hash(before.tables[1]))return false;
                var old=before.tables[4].Rows.Cast<DataRow>().Select(x=>x.Field<string>("UserAutoID")).ToHashSet(StringComparer.Ordinal);
                var added=tables[4].Rows.Cast<DataRow>().Where(x=>!old.Contains(x.Field<string>("UserAutoID"))).ToArray();
                return old.Count==before.tables[4].Rows.Count && tables[4].Rows.Count==old.Count+1 && added.Length==1
                    && old.All(key=>key is not null && PreservedRow(tables[4],before.tables[4],key,[])) && added[0].Field<string?>("UserName")==actor
                    && added[0].Field<int?>("StatusID")==2 && added[0].Field<string?>("Notes")==request.Note;
            }
            if(View.Header!=request.Header || View.StatusId!=(before?.View.StatusId ?? 0))return false;
            if(before is not null && (Hash(tables[4])!=Hash(before.tables[4])
                || !SameRow(tables[0].Rows[0],before.tables[0].Rows[0],
                    ["DocumentDate","OrderNumber","InvoiceNo","DeparturePoint","DestinationPoint","OrderTypeID",
                     "ObjectID","CurrencyID","RateExchange","Notes"])))return false;
            var desired=before?.View.Details.ToDictionary(x=>x.RowId!,StringComparer.Ordinal) ?? new(StringComparer.Ordinal);
            foreach(var key in request.RemovedDetailIds ?? [])desired.Remove(key);
            foreach(var row in request.DetailUpserts ?? [])if(row.RowId is not null)desired[row.RowId]=row;
            foreach(var (key,row) in inserted)desired[key]=row with{RowId=key,ClientLineId=null};
            if(View.Details.Count!=desired.Count || !View.Details.All(x=>desired.TryGetValue(x.RowId!,out var expected) && x==expected))return false;
            var rateChanged=before is not null && before.View.Header.RateExchange!=View.Header.RateExchange;
            foreach(var expected in desired.Values)
            {
                var original=before?.View.Details.FirstOrDefault(x=>x.RowId==expected.RowId);
                var sourceChanged=original is null || CalculationChanged(original,expected);
                if(!sourceChanged && !rateChanged)continue;
                if(!ExactDerived(expected,View.Header.RateExchange,out var source,out var amount))return false;
                var observed=tables[1].Rows.Cast<DataRow>().Single(x=>x.Field<string>("UserAutoID")==expected.RowId);
                if(!tables[1].Columns.Contains("SourceAmount") || !tables[1].Columns.Contains("Amount")
                    || sourceChanged && observed.Field<decimal?>("SourceAmount")!=source
                    || observed.Field<decimal?>("Amount")!=amount)return false;
            }
            if(before is null)return true;
            foreach(var original in before.View.Details.Where(x=>desired.ContainsKey(x.RowId!)))
            {
                var key=original.RowId!;var expected=desired[key];
                var upsert=request.DetailUpserts!.Any(x=>x.RowId==key);
                var calculationChanged=CalculationChanged(original,expected);
                var allowed=new HashSet<string>(StringComparer.Ordinal);
                if(upsert)allowed.UnionWith(["ItemID","LotNumberByDocument","SetQuantityByDocument","BarrelQuantityByDocument","ExpireDateByDocument","UnitPrice"]);
                if(calculationChanged)allowed.Add("SourceAmount");
                if(calculationChanged || rateChanged)allowed.Add("Amount");
                if(!PreservedRow(tables[1],before.tables[1],key,allowed))return false;
            }
            return true;
        }
        private static bool PreservedRow(DataTable after,DataTable before,string key,IEnumerable<string> allowed)
        {
            var original=before.Rows.Cast<DataRow>().Single(x=>x.Field<string>("UserAutoID")==key);
            var observed=after.Rows.Cast<DataRow>().Where(x=>x.Field<string>("UserAutoID")==key).ToArray();
            return observed.Length==1 && SameRow(observed[0],original,allowed);
        }
        private static bool SameRow(DataRow after,DataRow before,IEnumerable<string> allowed)
        {
            var except=allowed.ToHashSet(StringComparer.Ordinal);
            if(after.Table.Columns.Count!=before.Table.Columns.Count)return false;
            foreach(DataColumn column in before.Table.Columns)
            {
                if(!after.Table.Columns.Contains(column.ColumnName) || after.Table.Columns[column.ColumnName]!.DataType!=column.DataType)return false;
                if(except.Contains(column.ColumnName))continue;
                var a=after[column.ColumnName];var b=before[column.ColumnName];
                if(a is byte[] binary && b is byte[] other){if(!binary.AsSpan().SequenceEqual(other))return false;}
                else if(!Equals(a,b))return false;
            }
            return true;
        }
        private static string Hash(params DataTable[] tables)
        {
            using var bytes=new MemoryStream(); using var writer=new BinaryWriter(bytes,new UTF8Encoding(false,true),true);
            foreach(var table in tables)
            {
                writer.Write(table.Columns.Count);writer.Write(table.Rows.Count);
                foreach(DataColumn col in table.Columns){writer.Write(col.ColumnName);writer.Write(col.DataType.FullName!);}
                foreach(DataRow row in table.Rows)foreach(var value in row.ItemArray)
                {
                    if(value is null or DBNull){writer.Write((byte)0);continue;}
                    writer.Write((byte)1);
                    switch(value)
                    {
                        case DateTime date:writer.Write(date.Ticks);break;
                        case byte[] binary:Require(binary.Length<=1048576,InboundDraftOutcome.Unavailable);writer.Write(binary.Length);writer.Write(binary);break;
                        case decimal number:foreach(var bits in decimal.GetBits(number))writer.Write(bits);break;
                        default:var text=Convert.ToString(value,CultureInfo.InvariantCulture)!;
                            Require(text.Length<=1048576,InboundDraftOutcome.Unavailable);writer.Write(text);break;
                    }
                }
                Require(bytes.Length<=8388608,InboundDraftOutcome.Unavailable);
            }
            writer.Flush();return Convert.ToHexString(SHA256.HashData(bytes.ToArray()));
        }
    }

    private sealed class SqlAuthority(Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,
        Func<CancellationToken,Task<AuthoritativeIdentity?>>? inspect):IInboundCommandAuthority
    {
        public Task<AuthoritativeIdentity?> ResolveAsync(CancellationToken token)=>resolve(token);
        public Task<AuthoritativeIdentity?> InspectAsync(CancellationToken token)=>inspect is null
            ? Task.FromResult<AuthoritativeIdentity?>(null) : inspect(token);
        public async Task<IReadOnlyList<string>?> ReadGrantsAsync(DbTransaction tx,AuthoritativeIdentity id,InboundDraftAction action,CancellationToken token)
        {
            string group; LegacyUser user;
            await using(var c=InboundDraftSql.Command(tx,InboundDraftSql.AuthorityUserText))
            {
                InboundDraftSql.Add(c,"@actor",DbType.AnsiString,id.PrincipalId,50);
                await using var r=await c.ExecuteReaderAsync(token);
                if(r.FieldCount!=6 || !await r.ReadAsync(token) || Enumerable.Range(0,6).Any(r.IsDBNull))return null;
                user=new LegacyUser(r.GetString(0),"",r.GetString(1),r.GetBoolean(2),r.GetString(3),!r.GetBoolean(4));
                if(user.Username!=id.PrincipalId || user.Disabled || !user.GroupEnabled
                    || !InboundDraftValidation.Ansi(user.GroupId,20) || user.GroupId!=r.GetString(5) || LegacyIdentityAuthority.Stamp(user)!=id.CredentialStamp
                    || await r.ReadAsync(token) || await r.NextResultAsync(token))return null;
                group=user.GroupId!;
            }
            await using(var c=InboundDraftSql.Command(tx,InboundDraftSql.AuthorityGrantsText))
            {
                InboundDraftSql.Add(c,"@username",DbType.AnsiString,id.PrincipalId,50);InboundDraftSql.Add(c,"@group",DbType.AnsiString,group,20);
                InboundDraftSql.Add(c,"@create",DbType.Boolean,action==InboundDraftAction.Create);
                InboundDraftSql.Add(c,"@menu",DbType.AnsiString,InboundDraftValidation.MenuId,50);
                await using var r=await c.ExecuteReaderAsync(token);
                if(r.FieldCount!=5 || !await r.ReadAsync(token) || r.IsDBNull(0) || r.IsDBNull(1) || r.IsDBNull(3) || r.IsDBNull(4)
                    || r.GetString(0)!=InboundDraftValidation.MenuId || r.GetString(1)!=InboundDraftValidation.FormId
                    || !r.IsDBNull(2) && r.GetString(2).Length!=0 || r.GetBoolean(3) || r.GetInt32(4)!=1
                    || await r.ReadAsync(token) || await r.NextResultAsync(token))return null;
            }
            // Native NULL/empty means the reviewed explicit catalog, never an empty
            // derived array or wildcard. Revalidate inside this serializable transaction
            // and intersect with the current independently resolved Web session scope.
            var branches = await SqlLegacyBranchScope.ReadAsync(tx, user, token);
            if (id.BranchIds is null || id.BranchIds.Count > 200
                || id.BranchIds.Any(branch => !InboundDraftValidation.Ansi(branch, 50))) return null;
            return Array.AsReadOnly(branches.Where(branch => id.BranchIds.Contains(branch, StringComparer.Ordinal)).ToArray());
        }
    }
}
