using System.Data;
using System.Data.Common;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;

namespace Medcom.Infrastructure.Erp;

public sealed class SqlErpAttachments:IErpAttachmentService
{
    private readonly LegacyCompany company;private readonly Func<DbConnection> connections;
    private readonly Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,inspect;
    private readonly Guid? binding;private readonly IErpSqlWriteAcceptance? acceptance;
    private readonly Action<ErpSqlCommandDiagnostic>? writeDiagnostic;
    private readonly SqlErpScreenReader reader;private readonly ConditionalWeakTable<DbConnection,object> issued=new();
    private static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);
    public SqlErpAttachments(SqlLegacyUserStore store,LegacyCompany company,Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> inspect,Guid? binding=null,IErpSqlWriteAcceptance? acceptance=null,
        Action<ErpReadDiagnostic>? readDiagnostic=null,Action<ErpSqlCommandDiagnostic>? writeDiagnostic=null)
        :this(company,()=>binding is null?store.CreateConnection():store.CreateErpCommandConnection(),resolve,inspect,binding,acceptance,readDiagnostic,writeDiagnostic){ }
    internal SqlErpAttachments(LegacyCompany company,Func<DbConnection> connections,Func<CancellationToken,Task<AuthoritativeIdentity?>> resolve,
        Func<CancellationToken,Task<AuthoritativeIdentity?>> inspect,Guid? binding=null,IErpSqlWriteAcceptance? acceptance=null,
        Action<ErpReadDiagnostic>? readDiagnostic=null,Action<ErpSqlCommandDiagnostic>? writeDiagnostic=null)
    {this.company=company;this.connections=connections;this.resolve=resolve;this.inspect=inspect;this.binding=binding;this.acceptance=acceptance;this.writeDiagnostic=writeDiagnostic;reader=new(company,connections,resolve,inspect,readDiagnostic);}
    private bool Qualified(string module)=>binding is not null&&binding!=Guid.Empty&&acceptance?.Includes(module)==true;
    public Task<ErpReadResult<ErpAttachmentPage>> ListAsync(string module,string branch,string document,int page,int size,CancellationToken token)
    {
        if(!ErpInputRules.Page(page,size)||!ErpInputRules.AnsiIdentifier(document,50))return Task.FromResult(new ErpReadResult<ErpAttachmentPage>(ErpReadOutcome.Invalid));
        return reader.Run<ErpAttachmentPage>(module,branch,async(tx,identity,plan,rights)=>
        {
            var snapshot=await SqlErpScreenReader.Snapshot(tx,identity,plan,branch,document,token);if(snapshot is null)return new(ErpReadOutcome.NotFound);
            var supported=ErpAttachmentCatalog.Supports(module);
            var enabled=supported&&ErpAttachmentRules.CanWrite(await SqlErpScreenReader.ActionContext(tx,identity,plan,branch,rights,snapshot,Qualified(module),token));
            if(supported&&!await SqlErpAttachmentStore.Compatible(tx,module,token))return new(ErpReadOutcome.Unavailable,Code:"erp_attachment_schema_changed");
            var rows=supported?await SqlErpAttachmentStore.List(tx,module,document,page,size,token):Array.Empty<SqlErpAttachmentStore.Row>();
            return new(ErpReadOutcome.Success,new(supported,ErpAttachmentCatalog.Slots(module),enabled,enabled,SqlErpScreenReader.StateToken(snapshot),
                rows.Take(size).Select(r=>r.Public(module,branch,document)).ToArray(),page,size,rows.Count>size));
        },token);
    }
    public Task<ErpReadResult<ErpAttachmentContent>> ContentAsync(string module,string branch,string document,string attachment,bool preview,CancellationToken token)
    {
        if(!ErpAttachmentCatalog.Supports(module)||!ErpInputRules.AnsiIdentifier(document,50)||!ErpInputRules.AnsiIdentifier(attachment,50))
            return Task.FromResult(new ErpReadResult<ErpAttachmentContent>(ErpReadOutcome.Invalid));
        return reader.Run<ErpAttachmentContent>(module,branch,async(tx,identity,plan,_)=>
        {
            if(await SqlErpScreenReader.Header(tx,identity,plan,branch,document,token)is null)return new(ErpReadOutcome.NotFound);
            if(!await SqlErpAttachmentStore.Compatible(tx,module,token))return new(ErpReadOutcome.Unavailable,Code:"erp_attachment_schema_changed");
            var value=await SqlErpAttachmentStore.Content(tx,module,document,attachment,preview,token);
            return value is null?new(ErpReadOutcome.NotFound):new(ErpReadOutcome.Success,value);
        },token);
    }
    public Task<ErpAttachmentResult> UploadAsync(string module,ErpAttachmentUpload request,ReadOnlyMemory<byte> content,ReadOnlyMemory<byte> preview,CancellationToken token)
    {
        if(request is null||!ErpAttachmentRules.Valid(request,module))return Task.FromResult(new ErpAttachmentResult(ErpCommandOutcome.InvalidInput,"invalid_attachment_request"));
        var bytes=content.ToArray();var small=preview.ToArray();
        if(!ErpAttachmentRules.Image(bytes,ErpAttachmentCatalog.MaximumFileBytes,request.AttachmentName)
            ||small.Length>0&&!ErpAttachmentRules.Image(small,ErpAttachmentCatalog.MaximumPreviewBytes))
            return Task.FromResult(new ErpAttachmentResult(ErpCommandOutcome.InvalidInput,"invalid_attachment_image"));
        var intent=JsonSerializer.SerializeToUtf8Bytes(new{request,contentSha256=Convert.ToHexStringLower(SHA256.HashData(bytes)),
            previewSha256=small.Length==0?null:Convert.ToHexStringLower(SHA256.HashData(small)),length=bytes.Length,previewLength=small.Length},Json);
        return Write(module,"upload",request.IdempotencyKey,request.BranchId,request.DocumentId,request.ExpectedStateToken,request.AttachmentId,
            request.ExpectedAttachmentToken,request,intent,bytes,small.Length==0?bytes:small,token);
    }
    public Task<ErpAttachmentResult> DeleteAsync(string module,ErpAttachmentDelete request,CancellationToken token)
    {
        if(request is null||!ErpAttachmentRules.Valid(request,module))return Task.FromResult(new ErpAttachmentResult(ErpCommandOutcome.InvalidInput,"invalid_attachment_request"));
        return Write(module,"delete",request.IdempotencyKey,request.BranchId,request.DocumentId,request.ExpectedStateToken,request.AttachmentId,
            request.ExpectedAttachmentToken,null,JsonSerializer.SerializeToUtf8Bytes(request,Json),[],[],token);
    }
    private sealed class Stop(ErpCommandOutcome outcome,string code):Exception
    {internal ErpAttachmentResult Result{get;}=new(outcome,code);}
    private static void Check(bool value,ErpCommandOutcome outcome,string code){if(!value)throw new Stop(outcome,code);}
    private async Task Fence(DbTransaction tx,AuthoritativeIdentity identity,ErpSqlPlan plan,ErpNativeRights rights,string branch,CancellationToken token)
    {
        Check(await SqlErpScreenReader.TransactionValid(tx,token),ErpCommandOutcome.Unavailable,"transaction_invalid");
        Check(SqlErpScreenReader.SameSession(identity,await inspect(token))&&await ErpSqlAuthority.Read(tx,company,identity,plan.Screen,branch,token)==rights,
            ErpCommandOutcome.Denied,"authority_changed");
    }
    private async Task<ErpAttachmentResult> Write(string module,string operation,string keyValue,string branch,string document,string expectedState,
        string? attachment,string? expectedAttachment,ErpAttachmentUpload? upload,byte[] intent,byte[] content,byte[] preview,CancellationToken token)
    {
        if(!Qualified(module))return new(ErpCommandOutcome.QualificationRequired,"erp_write_unqualified");
        if(System.Transactions.Transaction.Current is not null)return new(ErpCommandOutcome.Unavailable,"ambient_transaction_rejected");
        var plan=ErpSqlPlan.Get(module)!;DbConnection? connection=null;DbTransaction? tx=null;AuthoritativeIdentity? identity=null;
        var commitAttempted=false;var committed=false;var cleaned=true;var stage="session";var result=new ErpAttachmentResult(ErpCommandOutcome.Unavailable,"erp_attachment_unavailable");
        try
        {
            identity=await resolve(token);
            Check(identity is not null&&identity.BranchIds?.Contains(branch,StringComparer.Ordinal)==true&&identity.Capabilities.Contains(module+".read",StringComparer.Ordinal),ErpCommandOutcome.Denied,"native_scope_denied");
            var candidate=connections();Check(candidate is not null&&candidate.State==ConnectionState.Closed&&!issued.TryGetValue(candidate,out _),ErpCommandOutcome.Unavailable,"connection_custody_rejected");
            connection=candidate!;issued.Add(connection,new());stage="open";await connection.OpenAsync(token);tx=await connection.BeginTransactionAsync(IsolationLevel.Serializable,token);
            Check(ReferenceEquals(tx.Connection,connection)&&await SqlErpScreenReader.TransactionValid(tx,token),ErpCommandOutcome.Unavailable,"transaction_invalid");
            // Same lock and order as ordinary ERP CUD: serializes files with document delete/save.
            stage="command_lock";await using(var command=ErpSqlPlan.Command(tx,"DECLARE @result int; EXEC @result=sys.sp_getapplock @Resource=N'Medcom.ErpCommands.v1',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=8000,@DbPrincipal='public'; SELECT @result;"))
                Check(await command.ExecuteScalarAsync(token)is int locked&&locked>=0,ErpCommandOutcome.Conflict,"erp_command_busy");
            stage="target";Check(await acceptance!.VerifyAsync(tx,binding!.Value,module,token),ErpCommandOutcome.QualificationRequired,"erp_write_target_mismatch");
            Check(await ErpWriteRuntime.JournalMatchesAsync(tx,binding.Value,token),ErpCommandOutcome.QualificationRequired,"erp_journal_binding_mismatch");
            Check(await SqlErpScreenReader.SchemaMatches(tx,plan,token)&&await SqlErpAttachmentStore.Compatible(tx,module,token),ErpCommandOutcome.QualificationRequired,"erp_attachment_schema_changed");
            stage="authority";var rights=await ErpSqlAuthority.Read(tx,company,identity!,plan.Screen,branch,token);Check(rights is not null,ErpCommandOutcome.Denied,"native_scope_denied");
            var key=JsonSerializer.SerializeToUtf8Bytes(new[]{"erp-attachment-v1",identity!.TenantId,identity.CompanyId,identity.PrincipalId,module,operation,branch,keyValue},Json);
            Check(key.Length<=4096&&intent.Length<=16384,ErpCommandOutcome.InvalidInput,"attachment_intent_limit");var slot=SHA256.HashData(key);
            stage="journal";var stored=await JournalRead(tx,slot,key,intent,token);
            var before=await SqlErpScreenReader.Snapshot(tx,identity,plan,branch,document,token);Check(before is not null,ErpCommandOutcome.Denied,"document_scope_denied");
            if(stored is not null)
            {
                Check(stored.Module==module&&stored.Operation==operation&&stored.IdempotencyKey==keyValue&&stored.DocumentId==document,ErpCommandOutcome.Unavailable,"journal_verification_failed");
                result=new(ErpCommandOutcome.Replayed,Receipt:stored);
            }
            else
            {
                Check(!before!.LineLimitExceeded&&SqlErpScreenReader.StateToken(before)==expectedState,ErpCommandOutcome.Conflict,"document_state_changed");
                var context=await SqlErpScreenReader.ActionContext(tx,identity,plan,branch,rights!,before,true,token);
                Check(ErpAttachmentRules.CanWrite(context),ErpCommandOutcome.Denied,"action_state_or_permission_denied");
                var existing=attachment is null?null:await SqlErpAttachmentStore.Find(tx,module,document,attachment,token);
                Check(attachment is null||existing is not null&&existing.Token==expectedAttachment,ErpCommandOutcome.Conflict,"attachment_state_changed");
                Check(upload is null||existing is null||module=="purchase-orders"||upload.SlotId==existing.Slot,ErpCommandOutcome.InvalidInput,"attachment_slot_changed");
                if(upload is{AttachmentId:null,SlotId:{} number})Check(!await SqlErpAttachmentStore.SlotOccupied(tx,module,document,number,token),ErpCommandOutcome.Conflict,"attachment_slot_occupied");
                var id=attachment??Guid.NewGuid().ToString("D");var audit=Guid.NewGuid();await Fence(tx,identity,plan,rights!,branch,token);
                await JournalReserve(tx,slot,key,intent,expectedState,audit,token);
                stage="storage";if(upload is null)await SqlErpAttachmentStore.Delete(tx,module,document,id,token);
                else await SqlErpAttachmentStore.Write(tx,module,document,id,upload.SlotId,upload.AttachmentName,content,preview,identity.PrincipalId,attachment is not null,token);
                stage="postcondition";var after=await SqlErpAttachmentStore.Find(tx,module,document,id,token);
                Check(upload is null?after is null:after is not null&&after.Name==upload.AttachmentName&&after.Slot==(existing is null?upload.SlotId:existing.Slot)&&after.FileType==1
                    &&after.Length==content.Length&&after.ContentHash?.Equals(Convert.ToHexString(SHA256.HashData(content)),StringComparison.Ordinal)==true
                    &&after.PreviewHash?.Equals(Convert.ToHexString(SHA256.HashData(preview)),StringComparison.Ordinal)==true,ErpCommandOutcome.Unavailable,"attachment_postcondition_failed");
                var documentAfter=await SqlErpScreenReader.Snapshot(tx,identity,plan,branch,document,token);
                Check(documentAfter is not null&&SqlErpScreenReader.StateToken(documentAfter)==expectedState,ErpCommandOutcome.Conflict,"document_state_changed");
                var receipt=new ErpAttachmentReceipt(module,operation,keyValue,document,id,upload?.AttachmentName??existing!.Name,after?.Token,expectedState,audit.ToString("D"),upload is null);
                await JournalComplete(tx,slot,receipt,token);var observed=await JournalRead(tx,slot,key,intent,token);
                Check(observed==receipt,ErpCommandOutcome.Unavailable,"journal_verification_failed");
                await Fence(tx,identity,plan,rights!,branch,token);Check(await acceptance.VerifyAsync(tx,binding.Value,module,token),ErpCommandOutcome.QualificationRequired,"erp_write_target_mismatch");
                token.ThrowIfCancellationRequested();commitAttempted=true;stage="commit";await tx.CommitAsync(token);committed=true;result=new(ErpCommandOutcome.Committed,Receipt:receipt);
            }
            if(!committed)await Fence(tx,identity,plan,rights!,branch,token);
        }
        catch(Stop stop){result=stop.Result;}
        catch(OperationCanceledException){result=new(ErpCommandOutcome.Cancelled);}
        catch(Exception error)
        {
            try{writeDiagnostic?.Invoke(new(module,operation,stage,error.GetType().Name,error is Microsoft.Data.SqlClient.SqlException sql?sql.Number:null,[]));}catch{ }
            result=new(ErpCommandOutcome.Unavailable,"erp_attachment_unavailable");
        }
        finally
        {
            if(tx is not null){if(!committed)try{await tx.RollbackAsync(CancellationToken.None);}catch{cleaned=false;}try{await tx.DisposeAsync();}catch{cleaned=false;}}
            if(connection is not null)try{await connection.DisposeAsync();}catch{cleaned=false;}
        }
        if(commitAttempted&&(!committed||!cleaned||token.IsCancellationRequested))return new(ErpCommandOutcome.OutcomeUnknown,"retry_same_attachment_request");
        if(!cleaned)return new(ErpCommandOutcome.Unavailable,"cleanup_failed");
        if(result.Receipt is not null)try
        {if(identity is null||!SqlErpScreenReader.SameSession(identity,await inspect(token)))return new(ErpCommandOutcome.OutcomeUnknown,"retry_same_attachment_request");}
        catch{return new(ErpCommandOutcome.OutcomeUnknown,"retry_same_attachment_request");}
        return result;
    }
    private void JournalKey(DbCommand command,byte[] slot)
    {ErpSqlPlan.Parameter(command,"@binding",DbType.Guid,binding!.Value);ErpSqlPlan.Parameter(command,"@slot",DbType.Binary,slot,32);}
    private async Task<ErpAttachmentReceipt?> JournalRead(DbTransaction tx,byte[] slot,byte[] key,byte[] intent,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(tx,"SELECT KeyBytes,IntentBytes,ReceiptJson,DocumentId,AfterToken,AuditId FROM dbo.MedcomErpCommandJournal WITH(UPDLOCK,HOLDLOCK) WHERE DatabaseBindingId=@binding AND SlotHash=@slot;");JournalKey(command,slot);
        await using var data=await command.ExecuteReaderAsync(token);if(!await data.ReadAsync(token))return null;
        Check(data.GetFieldValue<byte[]>(0).AsSpan().SequenceEqual(key)&&data.GetFieldValue<byte[]>(1).AsSpan().SequenceEqual(intent),ErpCommandOutcome.Conflict,"idempotency_conflict");
        Check(!data.IsDBNull(2),ErpCommandOutcome.OutcomeUnknown,"command_pending_no_takeover");
        var receipt=JsonSerializer.Deserialize<ErpAttachmentReceipt>(data.GetString(2),Json);
        Check(receipt is not null&&data.GetString(3)==receipt.DocumentId&&data.GetString(4)==receipt.DocumentStateToken&&data.GetGuid(5).ToString("D")==receipt.AuditId
            &&!await data.ReadAsync(token)&&!await data.NextResultAsync(token),ErpCommandOutcome.Unavailable,"journal_verification_failed");return receipt;
    }
    private async Task JournalReserve(DbTransaction tx,byte[] slot,byte[] key,byte[] intent,string before,Guid audit,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(tx,"INSERT dbo.MedcomErpCommandJournal(DatabaseBindingId,SlotHash,KeyBytes,IntentBytes,BeforeToken,AuditId) VALUES(@binding,@slot,@key,@intent,@before,@audit);");JournalKey(command,slot);
        ErpSqlPlan.Parameter(command,"@key",DbType.Binary,key,key.Length);ErpSqlPlan.Parameter(command,"@intent",DbType.Binary,intent,intent.Length);
        ErpSqlPlan.Parameter(command,"@before",DbType.AnsiString,before,64);ErpSqlPlan.Parameter(command,"@audit",DbType.Guid,audit);
        Check(await command.ExecuteNonQueryAsync(token)==1,ErpCommandOutcome.Unavailable,"journal_reservation_failed");
    }
    private async Task JournalComplete(DbTransaction tx,byte[] slot,ErpAttachmentReceipt receipt,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(tx,"UPDATE dbo.MedcomErpCommandJournal SET DocumentId=@document,ReceiptJson=@receipt,AfterToken=@after WHERE DatabaseBindingId=@binding AND SlotHash=@slot AND ReceiptJson IS NULL;");JournalKey(command,slot);
        ErpSqlPlan.Parameter(command,"@document",DbType.String,receipt.DocumentId,50);ErpSqlPlan.Parameter(command,"@receipt",DbType.String,JsonSerializer.Serialize(receipt,Json),-1);
        ErpSqlPlan.Parameter(command,"@after",DbType.AnsiString,receipt.DocumentStateToken,64);Check(await command.ExecuteNonQueryAsync(token)==1,ErpCommandOutcome.Unavailable,"journal_completion_failed");
    }
}
