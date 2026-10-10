using System.Data;
using System.Data.Common;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Microsoft.Data.SqlClient;
namespace Medcom.Infrastructure.Erp;

// Trusted server seam for actual target acceptance. Schema presence, HTTP flags and catalog
// discovery cannot qualify effects. Implementations must verify private binding, native
// defaults/constraints/triggers and numbered-document/transaction runtime acceptance.
public interface IErpSqlWriteAcceptance
{
    bool Includes(string module);
    Task<bool> VerifyAsync(DbTransaction transaction,Guid binding,string module,CancellationToken token);
}
public interface IErpDocumentNumberAllocator
{
    bool IsQualified(string module);
    Task<string?> AllocateAsync(DbTransaction transaction,string module,JsonElement header,CancellationToken token);
}
public sealed record ErpSqlCommandDiagnostic(string Module,string Operation,string Stage,string ExceptionKind,int? ProviderNumber,IReadOnlyList<string> Frames);

public sealed partial class SqlErpScreenCommands:IErpSqlCommandExecutor
{
    private readonly Guid binding;private readonly LegacyCompany company;
    private readonly Func<DbConnection> connections;
    private readonly Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,inspect;
    private readonly IErpSqlWriteAcceptance acceptance;private readonly IErpDocumentNumberAllocator allocator;
    private readonly Action<ErpSqlCommandDiagnostic>? diagnostic;
    private readonly ConditionalWeakTable<DbConnection,object> issued=new();
    public SqlErpScreenCommands(Guid binding,LegacyCompany company,Func<DbConnection> connections,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,Func<CancellationToken,Task<AuthoritativeIdentity?>> inspect,
        IErpSqlWriteAcceptance acceptance,IErpDocumentNumberAllocator allocator,Action<ErpSqlCommandDiagnostic>? diagnostic=null)
    {
        if(binding==Guid.Empty)throw new ArgumentException("Dedicated database binding required.",nameof(binding));
        this.binding=binding;this.company=company;this.connections=connections;this.resolve=resolve;this.inspect=inspect;
        this.acceptance=acceptance;this.allocator=allocator;
        this.diagnostic=diagnostic;
    }
    public bool IsQualified(string module)=>ErpScreenCatalog.Get(module)is not null&&acceptance.Includes(module);
    public bool CanExecute(string module,string operation)=>IsQualified(module)&&(operation!="create"||allocator.IsQualified(module));
    public Task<ErpCommandResult> ExecuteAsync(string module,string operation,JsonElement intent,CancellationToken token)
        =>Run(module,operation,intent,false,token);
    public async Task<ErpReadResult<ErpCommandObservation>> ObserveAsync(string module,ErpCommandLookupRequest request,CancellationToken token)
    {
        if(request is null)return new(ErpReadOutcome.Invalid);
        var result=await Run(module,request.Operation,request.OriginalIntent,true,token);
        return result.Outcome switch
        {
            ErpCommandOutcome.Replayed=>new(ErpReadOutcome.Success,new("Committed",result.Receipt)),
            ErpCommandOutcome.OutcomeUnknown=>new(ErpReadOutcome.Success,new(result.Code=="command_absent"?"Absent":"Unknown")),
            ErpCommandOutcome.InvalidInput=>new(ErpReadOutcome.Invalid),ErpCommandOutcome.Denied=>new(ErpReadOutcome.Denied),
            ErpCommandOutcome.Conflict=>new(ErpReadOutcome.Invalid,Code:"idempotency_conflict"),
            ErpCommandOutcome.Cancelled=>new(ErpReadOutcome.Cancelled),_=>new(ErpReadOutcome.Unavailable,Code:result.Code)
        };
    }
    private sealed class Stop(ErpCommandOutcome outcome,string code):Exception
    {internal ErpCommandResult Result{get;}=new(outcome,code);}
    private static void Require(bool value,ErpCommandOutcome outcome,string code){if(!value)throw new Stop(outcome,code);}
    private async Task<ErpCommandResult> Run(string module,string operation,JsonElement intent,bool observation,CancellationToken token)
    {
        if(!ErpCommandRules.Freeze(module,operation,intent,out var frozen))return new(ErpCommandOutcome.InvalidInput,"invalid_erp_intent");
        var request=frozen!;var plan=ErpSqlPlan.Get(module)!;
        if(!IsQualified(module)||!observation&&!CanExecute(module,operation))
            return new(ErpCommandOutcome.QualificationRequired,"erp_write_or_numbering_unqualified");
        if(System.Transactions.Transaction.Current is not null)return new(ErpCommandOutcome.Unavailable,"ambient_transaction_rejected");
        DbConnection? connection=null;DbTransaction? transaction=null;var commitAttempted=false;var committed=false;var cleaned=true;
        var result=new ErpCommandResult(ErpCommandOutcome.Unavailable);AuthoritativeIdentity? identity=null;var stage="session";
        try
        {
            identity=await resolve(token);
            Require(identity is not null&&identity.BranchIds?.Contains(request.BranchId,StringComparer.Ordinal)==true,ErpCommandOutcome.Denied,"native_scope_denied");
            var candidate=connections();
            Require(candidate is not null&&candidate.State==ConnectionState.Closed&&!issued.TryGetValue(candidate,out _),ErpCommandOutcome.Unavailable,"connection_custody_rejected");
            connection=candidate!;issued.Add(connection,new());
            stage="open";await connection.OpenAsync(token);transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
            Require(ReferenceEquals(transaction.Connection,connection)&&await SqlErpScreenReader.TransactionValid(transaction,token),ErpCommandOutcome.Unavailable,"transaction_invalid");
            stage="qualification";Require(await acceptance.VerifyAsync(transaction,binding,module,token)&&await JournalBinding(transaction,token)
                &&await SqlErpScreenReader.SchemaMatches(transaction,plan,token),ErpCommandOutcome.QualificationRequired,"target_acceptance_changed");
            stage="authority";var rights=await ErpSqlAuthority.Read(transaction,company,identity!,plan.Screen,request.BranchId,token);
            Require(rights is not null,ErpCommandOutcome.Denied,"native_scope_denied");
            var key=JsonSerializer.SerializeToUtf8Bytes(new[]{"erp-command-v1",identity!.TenantId,identity.CompanyId,identity.PrincipalId,module,operation,request.BranchId,request.IdempotencyKey});
            var bytes=Encoding.UTF8.GetBytes(request.OriginalIntent.GetRawText());
            Require(key.Length<=4096&&bytes.Length<=ErpInputRules.MaximumBodyBytes,ErpCommandOutcome.InvalidInput,"intent_limit");
            stage="journal";var slot=SHA256.HashData(key);var stored=await JournalRead(transaction,slot,key,bytes,token);
            if(stored is not null)
            {
                Require(await ReceiptScope(transaction,identity,plan,rights!,request,stored,token),ErpCommandOutcome.Denied,"receipt_scope_denied");
                result=new(ErpCommandOutcome.Replayed,Receipt:stored);
            }
            else if(observation)result=new(ErpCommandOutcome.OutcomeUnknown,"command_absent");
            else
            {
                stage="snapshot";var before=request.DocumentId is null?null:await SqlErpScreenReader.Snapshot(transaction,identity,plan,request.BranchId,request.DocumentId,token);
                Require(operation=="create"||before is not null,ErpCommandOutcome.Denied,"document_scope_denied");
                Require(before is null||!before.LineLimitExceeded&&SqlErpScreenReader.StateToken(before)==request.ExpectedStateToken,
                    ErpCommandOutcome.Conflict,"document_state_changed");
                var context=await SqlErpScreenReader.ActionContext(transaction,identity,plan,request.BranchId,rights!,before,true,token);
                Require(ErpActionRules.Evaluate(context).Any(action=>action.Enabled&&plan.Screen.Actions.Any(def=>def.Id==action.Id&&def.Operation==operation)),
                    ErpCommandOutcome.Denied,"action_state_or_permission_denied");
                var document=request.DocumentId??await allocator.AllocateAsync(transaction,module,request.Header!.Value,token);
                Require(ErpInputRules.Identifier(document,50)&& (module!="internal-transfer-requests"||document!.Length<=30),
                    ErpCommandOutcome.QualificationRequired,"document_number_unqualified");
                Require(ErpInputRules.Value(plan.Screen.Fields["header"].Single(field=>field.Column==plan.HeaderKey),ErpInputRules.Serialize(document)),
                    ErpCommandOutcome.QualificationRequired,"document_number_transport_invalid");
                if(operation=="create")Require(!await HeaderExists(transaction,plan,document!,token),ErpCommandOutcome.Conflict,"document_number_collision");
                await Fence(transaction,identity,plan,rights!,request.BranchId,token);
                var audit=Guid.NewGuid();
                await JournalReserve(transaction,slot,key,bytes,before is null?ErpInputRules.Fingerprint("absent"):SqlErpScreenReader.StateToken(before),audit,token);
                stage="effects";var allocated=await Apply(transaction,identity,plan,request,document!,before,token);
                Require(await SqlErpScreenReader.TransactionValid(transaction,token),ErpCommandOutcome.Unavailable,"native_transaction_changed");
                stage="postcondition";var after=await SqlErpScreenReader.Snapshot(transaction,identity,plan,request.BranchId,document!,token);
                Require(operation=="delete"?after is null:after is not null&&!after.LineLimitExceeded,ErpCommandOutcome.Unavailable,"post_write_observation_failed");
                var state=after is null?ErpInputRules.Fingerprint(new[]{module,document!,"deleted"}):SqlErpScreenReader.StateToken(after);
                var receipt=new ErpCommandReceipt(module,operation,request.IdempotencyKey,document!,state,audit.ToString("D"),operation=="delete",allocated);
                stage="record";await JournalComplete(transaction,slot,receipt,token);
                var observed=await JournalRead(transaction,slot,key,bytes,token);
                Require(observed is not null&&ErpInputRules.Fingerprint(receipt)==ErpInputRules.Fingerprint(observed),ErpCommandOutcome.Unavailable,"journal_verification_failed");
                await Fence(transaction,identity,plan,rights!,request.BranchId,token);
                Require(await acceptance.VerifyAsync(transaction,binding,module,token),ErpCommandOutcome.QualificationRequired,"target_acceptance_changed");
                token.ThrowIfCancellationRequested();commitAttempted=true;
                stage="commit";await transaction.CommitAsync(token);committed=true;
                result=new(ErpCommandOutcome.Committed,Receipt:receipt);
            }
            if(!committed)await Fence(transaction,identity!,plan,rights!,request.BranchId,token);
        }
        catch(Stop stop){result=stop.Result;}
        catch(OperationCanceledException){result=new(ErpCommandOutcome.Cancelled);}
        catch(Exception error)
        {
            try{diagnostic?.Invoke(new(module,operation,stage,error.GetType().Name,error is SqlException sql?sql.Number:null,
                new System.Diagnostics.StackTrace(error,false).GetFrames().Take(5).Select(frame=>frame.GetMethod()?.DeclaringType?.Name+"."+frame.GetMethod()?.Name).ToArray()));}catch{ }
            result=new(ErpCommandOutcome.Unavailable,"erp_command_unavailable");
        }
        finally
        {
            if(transaction is not null)
            {
                if(!committed)try{await transaction.RollbackAsync(CancellationToken.None);}catch{cleaned=false;}
                try{await transaction.DisposeAsync();}catch{cleaned=false;}
            }
            if(connection is not null)try{await connection.DisposeAsync();}catch{cleaned=false;}
        }
        if(commitAttempted&&(!committed||!cleaned||token.IsCancellationRequested))return new(ErpCommandOutcome.OutcomeUnknown,"lookup_original_intent");
        if(!cleaned)return new(ErpCommandOutcome.Unavailable,"cleanup_failed");
        if(result.Receipt is not null)
        {
            try{if(!SqlErpScreenReader.SameSession(identity!,await inspect(token)))return new(ErpCommandOutcome.Denied,"session_changed_after_commit");}
            catch{return new(ErpCommandOutcome.OutcomeUnknown,"lookup_original_intent");}
        }
        return result;
    }
    private async Task Fence(DbTransaction transaction,AuthoritativeIdentity identity,ErpSqlPlan plan,ErpNativeRights rights,string branch,CancellationToken token)
    {
        Require(await SqlErpScreenReader.TransactionValid(transaction,token),ErpCommandOutcome.Unavailable,"transaction_invalid");
        Require(SqlErpScreenReader.SameSession(identity,await inspect(token))
            &&await ErpSqlAuthority.Read(transaction,company,identity,plan.Screen,branch,token)==rights,ErpCommandOutcome.Denied,"authority_changed");
    }
    private async Task<bool> JournalBinding(DbTransaction transaction,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"SELECT SingletonId,SchemaVersion,DatabaseBindingId,CatalogHash FROM dbo.MedcomErpCommandSchema WITH(HOLDLOCK);");
        await using var reader=await command.ExecuteReaderAsync(token);
        var catalog=SHA256.HashData(Encoding.UTF8.GetBytes(ErpScreenCatalog.SourceMetadata.GetRawText()));
        return await reader.ReadAsync(token)&&reader.GetByte(0)==1&&reader.GetInt32(1)==1&&reader.GetGuid(2)==binding
            &&reader.GetFieldValue<byte[]>(3).AsSpan().SequenceEqual(catalog)&&!await reader.ReadAsync(token)&&!await reader.NextResultAsync(token);
    }
    private async Task<ErpCommandReceipt?> JournalRead(DbTransaction transaction,byte[] slot,byte[] key,byte[] intent,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"SELECT KeyBytes,IntentBytes,ReceiptJson,DocumentId,AfterToken,AuditId FROM dbo.MedcomErpCommandJournal WITH(UPDLOCK,HOLDLOCK) WHERE DatabaseBindingId=@binding AND SlotHash=@slot;");
        JournalKey(command,slot);await using var reader=await command.ExecuteReaderAsync(token);
        if(!await reader.ReadAsync(token))return null;
        Require(reader.GetFieldValue<byte[]>(0).AsSpan().SequenceEqual(key)&&reader.GetFieldValue<byte[]>(1).AsSpan().SequenceEqual(intent),ErpCommandOutcome.Conflict,"idempotency_conflict");
        Require(!reader.IsDBNull(2),ErpCommandOutcome.OutcomeUnknown,"command_pending_no_takeover");
        var receipt=JsonSerializer.Deserialize<ErpCommandReceipt>(reader.GetString(2),new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Require(receipt is not null&&receipt.DocumentId==reader.GetString(3)&&receipt.StateToken==reader.GetString(4)&&receipt.AuditId==reader.GetGuid(5).ToString("D"),ErpCommandOutcome.Unavailable,"invalid_journal_receipt");
        Require(!await reader.ReadAsync(token)&&!await reader.NextResultAsync(token),ErpCommandOutcome.Unavailable,"ambiguous_journal");return receipt;
    }
    private async Task JournalReserve(DbTransaction transaction,byte[] slot,byte[] key,byte[] intent,string before,Guid audit,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"INSERT dbo.MedcomErpCommandJournal(DatabaseBindingId,SlotHash,KeyBytes,IntentBytes,BeforeToken,AuditId) VALUES(@binding,@slot,@key,@intent,@before,@audit);");
        JournalKey(command,slot);ErpSqlPlan.Parameter(command,"@key",DbType.Binary,key,4096);ErpSqlPlan.Parameter(command,"@intent",DbType.Binary,intent,-1);
        ErpSqlPlan.Parameter(command,"@before",DbType.AnsiString,before,64);ErpSqlPlan.Parameter(command,"@audit",DbType.Guid,audit);
        Require(await command.ExecuteNonQueryAsync(token)==1,ErpCommandOutcome.Unavailable,"journal_reservation_failed");
    }
    private async Task JournalComplete(DbTransaction transaction,byte[] slot,ErpCommandReceipt receipt,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"UPDATE dbo.MedcomErpCommandJournal SET DocumentId=@document,ReceiptJson=@receipt,AfterToken=@after WHERE DatabaseBindingId=@binding AND SlotHash=@slot AND ReceiptJson IS NULL;");
        JournalKey(command,slot);ErpSqlPlan.Parameter(command,"@document",DbType.String,receipt.DocumentId,50);
        ErpSqlPlan.Parameter(command,"@receipt",DbType.String,JsonSerializer.Serialize(receipt,new JsonSerializerOptions(JsonSerializerDefaults.Web)),-1);
        ErpSqlPlan.Parameter(command,"@after",DbType.AnsiString,receipt.StateToken,64);
        Require(await command.ExecuteNonQueryAsync(token)==1,ErpCommandOutcome.Unavailable,"journal_completion_failed");
    }
    private void JournalKey(DbCommand command,byte[] slot)
    {ErpSqlPlan.Parameter(command,"@binding",DbType.Guid,binding);ErpSqlPlan.Parameter(command,"@slot",DbType.Binary,slot,32);}
    private static async Task<bool> HeaderExists(DbTransaction transaction,ErpSqlPlan plan,string document,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,$"SELECT COUNT_BIG(*) FROM dbo.[{plan.HeaderTable}] WITH(UPDLOCK,HOLDLOCK) WHERE [{plan.HeaderKey}]=@document;");
        ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);return (long)(await command.ExecuteScalarAsync(token))!>0;
    }
    private static async Task<bool> ReceiptScope(DbTransaction transaction,AuthoritativeIdentity identity,ErpSqlPlan plan,ErpNativeRights rights,
        ErpFrozenCommand request,ErpCommandReceipt receipt,CancellationToken token)
    {
        if(receipt.Module!=request.Module||receipt.Operation!=request.Operation||receipt.IdempotencyKey!=request.IdempotencyKey
            ||!rights.Read||receipt.AllocatedLines is null)return false;
        if(!(request.Operation switch{"create"=>rights.Add,"delete"=>rights.Delete,_=>rights.Update}))return false;
        if(receipt.Deleted)return rights.Delete;
        return await SqlErpScreenReader.Header(transaction,identity,plan,request.BranchId,receipt.DocumentId,token)is not null;
    }
}
