using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

public sealed partial class SqlErpScreenCommands
{
    private static void WorkflowPostcondition(ErpFrozenCommand request,ErpReadSnapshot before,ErpReadSnapshot after)
    {
        var expected=(request.Module,request.Operation) switch
        {
            ("inbound-requests","send-management")=>10,("inbound-requests","send-warehouse")=>2,
            ("purchase-approvals","approve")=>3,("purchase-approvals","reject")=>4,
            ("sales-order-pm","send-sa")=>14,("sales-order-pm","reject")=>11,
            ("sales-order-sa","send-accounting")=>18,("sales-order-sa","send-tech")=>16,("sales-order-sa","reject")=>13,
            ("internal-transfer-pm","pm-confirm")=>20,("internal-transfer-pm","reject")=>30,
            ("internal-transfer-batches","send-tech")=>before.Header.GetValueOrDefault("hasEquipment")is true?20:40,
            ("internal-transfer-tech","send-sa")=>40,("internal-transfer-sa","send-accounting")=>60,
            ("internal-transfer-accounting","send-warehouse")=>70,("internal-transfer-warehouse-out","dispatch")=>100,
            (_,"return-step")=>request.Payload.GetProperty("statusId").GetInt32(),
            _=>-1
        };
        var observed=after.Header.GetValueOrDefault("statusId")as int?;
        Require(expected>=0?observed==expected:request.Operation=="receive"?observed is 120 or 130:
            request.Operation=="reject"?observed is 10 or 21 or 41 or 61:
            request.Operation=="sync-requests"&&observed==before.Header.GetValueOrDefault("statusId")as int?,
            ErpCommandOutcome.Unavailable,"native_action_postcondition_failed");
    }
    private static async Task WorkflowBeforeWrite(DbTransaction transaction,AuthoritativeIdentity actor,ErpSqlPlan plan,
        ErpFrozenCommand request,string document,CancellationToken token)
    {
        if(request.Operation=="create")
        {
            if(plan.Module=="internal-transfer-batches")
            {
                var header=request.Header!.Value;
                Require(Text(header,"fromBranchId")==request.BranchId&&Text(header,"toBranchId")!=request.BranchId,
                    ErpCommandOutcome.InvalidInput,"transfer_batch_branches_invalid");
                Require(Text(header,"assignedPM")is not {} pm||pm==actor.PrincipalId,ErpCommandOutcome.Denied,"transfer_batch_pm_invalid");
            }
            return;
        }
        var property=request.Operation=="delete"?"deleteProcedure":"editProcedure";
        if(request.Operation is "save" or "delete"||request.Operation.StartsWith("save-",StringComparison.Ordinal))
        {
            var metadata=ErpScreenCatalog.Metadata(plan.Module);
            if(metadata.GetProperty(property).GetString()is {} procedure)
            {
                var parameters=procedure=="IV_InternalTransfer_BatchRoleCheckEditStp"
                    ?new[]{("@BatchID",DbType.AnsiString,(object?)document,30),("@Status",DbType.AnsiString,(object?)string.Join(',',metadata.GetProperty("saveStatuses").EnumerateArray().Select(s=>s.GetInt32())),100)}
                    :new[]{(plan.HeaderKey=="BatchID"?"@BatchID":"@DocumentID",DbType.AnsiString,(object?)document,30),("@User",DbType.AnsiString,(object?)actor.PrincipalId,100)};
                await NativeCheck(transaction,procedure,parameters,token);
            }
        }
    }
    private static async Task NativeCheck(DbTransaction transaction,string procedure,
        (string Name,DbType Type,object? Value,int Size)[] parameters,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"EXEC dbo.["+procedure+"] "+string.Join(',',parameters.Select(p=>p.Name))+";");
        foreach(var parameter in parameters)ErpSqlPlan.Parameter(command,parameter.Name,parameter.Type,parameter.Value,parameter.Size);
        await using var reader=await command.ExecuteReaderAsync(token);var count=0;
        do
        {
            var ordinal=Enumerable.Range(0,reader.FieldCount).SingleOrDefault(i=>reader.GetName(i)=="MsgType",-1);
            while(await reader.ReadAsync(token))
            {
                Require(++count<=1000&&ordinal>=0,ErpCommandOutcome.Unavailable,"native_check_shape_changed");
                var value=Convert.ToInt32(reader.GetValue(ordinal),CultureInfo.InvariantCulture);
                Require(value!=1,ErpCommandOutcome.Conflict,"native_action_rejected");
                Require(value is 0 or 3,ErpCommandOutcome.Unavailable,"native_check_shape_changed");
            }
        }while(await reader.NextResultAsync(token));
    }
    private static void WorkflowCalculate(ErpSqlPlan plan,string section,Dictionary<string,JsonElement> row,
        Dictionary<string,JsonElement> header)
    {
        var fields=plan.Screen.Fields[section];
        decimal? Number(Dictionary<string,JsonElement> values,string name)=>!values.TryGetValue(name,out var value)||value.ValueKind==JsonValueKind.Null?null:
            value.ValueKind==JsonValueKind.Number?checked((decimal)value.GetDouble()):decimal.Parse(value.GetString()!,CultureInfo.InvariantCulture);
        void Set(string name,decimal? value)
        {
            var field=fields.Single(f=>f.Name==name);var args=field.TypeArguments!.Trim('(',')').Split(',');
            var rounded=value is null?null:(decimal?)decimal.Round(value.Value,int.Parse(args[1],CultureInfo.InvariantCulture),MidpointRounding.AwayFromZero);
            var raw=ErpInputRules.Serialize(rounded?.ToString(CultureInfo.InvariantCulture));
            Require(ErpInputRules.Value(field,raw),ErpCommandOutcome.InvalidInput,"calculated_value_out_of_range");row[name]=raw;
        }
        if(plan.Module=="purchase-orders")
        {Set("sourceAmount",Number(row,"quantity")*Number(row,"unitPrice"));Set("amount",Number(row,"sourceAmount")*Number(header,"rateExchange"));}
        if(plan.Module=="inbound-requests"&&section=="lines")
            Set("amount",Number(row,"setQuantityByDocument")*Number(row,"unitPrice")*Number(header,"rateExchange"));
        if(plan.Module=="inbound-requests"&&section=="costs")
        {Set("cost",Number(row,"sourceAmount")*Number(row,"rateExchange"));Set("vATAmount",Number(row,"cost")*Number(row,"vATPercent")/100m);}
    }
    private static async Task<IReadOnlyList<ErpAllocatedLine>> WorkflowSectionWrite(DbTransaction transaction,AuthoritativeIdentity actor,
        ErpSqlPlan plan,ErpFrozenCommand request,string document,ErpReadSnapshot before,CancellationToken token)
    {
        var section=request.Section;var table=plan.Tables[section];var key=plan.SectionKey(section);
        var fields=plan.Screen.Fields[section];var rows=before.Sections![section].ToDictionary(r=>r.LineId,r=>r.Fields,StringComparer.Ordinal);
        var header=before.Header.ToDictionary(p=>p.Key,p=>ErpInputRules.Serialize(p.Value),StringComparer.Ordinal);
        var allocated=new List<ErpAllocatedLine>();
        foreach(var change in request.Changes)
        {
            if(change.Kind!=ErpLineChangeKind.Add)Require(rows.ContainsKey(change.LineId!),ErpCommandOutcome.Conflict,"line_state_changed");
            var line=change.LineId??Guid.NewGuid().ToString("D");
            if(change.Kind==ErpLineChangeKind.Remove)
            {await DeleteRows(transaction,table,key,document,line,1,token);rows.Remove(line);continue;}
            var values=Map(change.Values!.Value);
            await References(transaction,actor,plan,section,values,header,request.BranchId,token);
            if(plan.Module=="inbound-requests"&&section=="costs")
            {
                var vatId=values.GetValueOrDefault("vATId");
                object? rate=null;
                if(vatId.ValueKind==JsonValueKind.String&&vatId.GetString() is {Length:>0} id)
                {
                    await using var vat=ErpSqlPlan.Command(transaction,"SELECT TOP(2) VATPercent FROM dbo.CF_VATTbl WITH(HOLDLOCK) WHERE VATID=@vat;");
                    ErpSqlPlan.Parameter(vat,"@vat",DbType.AnsiString,id,4);await using var data=await vat.ExecuteReaderAsync(token);
                    Require(await data.ReadAsync(token),ErpCommandOutcome.InvalidInput,"vat_reference_missing");
                    if(!data.IsDBNull(0))rate=data.GetDecimal(0).ToString(CultureInfo.InvariantCulture);
                    Require(!await data.ReadAsync(token)&&!await data.NextResultAsync(token),ErpCommandOutcome.InvalidInput,"vat_reference_ambiguous");
                }
                values["vATPercent"]=ErpInputRules.Serialize(rate);
            }
            WorkflowCalculate(plan,section,values,header);
            var cells=values.ToDictionary(p=>fields.Single(f=>f.Name==p.Key).Column,p=>Cell(fields.Single(f=>f.Name==p.Key),p.Value),StringComparer.Ordinal);
            if(change.Kind==ErpLineChangeKind.Add){cells[key]=document;cells["UserAutoID"]=line;allocated.Add(new(change.ClientLineKey!,line));}
            foreach(var column in new[]{"UserCreate","UserUpdate"})if(fields.Any(f=>f.Column==column)&&(change.Kind==ErpLineChangeKind.Add||column=="UserUpdate"))cells[column]=actor.PrincipalId;
            await Write(transaction,table,key,document,line,cells,fields,change.Kind==ErpLineChangeKind.Add,token);
            rows[line]=values.ToDictionary(p=>p.Key,p=>(object?)p.Value,StringComparer.Ordinal);
        }
        Require(rows.Count<=ErpInputRules.MaximumLines,ErpCommandOutcome.InvalidInput,"document_line_count");
        return allocated.AsReadOnly();
    }
    private static async Task PurchaseOrderAfterSave(DbTransaction transaction,string document,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"UPDATE dbo.AP_OrderTbl SET BaseTotal=(SELECT SUM(Amount) FROM dbo.AP_OrderDetailTbl WHERE DocumentID=@document) WHERE DocumentID=@document;");
        ErpSqlPlan.Parameter(command,"@document",DbType.AnsiString,document,50);await One(command,token);
    }
    private static async Task WorkflowAction(DbTransaction transaction,AuthoritativeIdentity actor,ErpSqlPlan plan,
        ErpFrozenCommand request,string document,CancellationToken token)
    {
        var notes=Text(request.Payload,"notes");var operation=request.Operation;
        if(plan.Module=="inbound-requests")
        {
            if(operation=="send-warehouse")
            {
                await ValidateInboundWarehouseInformation(transaction,document,token);
            }
            var status=operation=="send-management"?10:2;
            await using var command=ErpSqlPlan.Command(transaction,"UPDATE dbo.IV_InboundRequestTbl SET StatusID=@status WHERE DocumentID=@document; INSERT dbo.IV_InboundRequestLogTbl(UserAutoID,DocumentID,UserName,StatusID,Notes) VALUES(@line,@document,@actor,@status,@notes);");
            ErpSqlPlan.Parameter(command,"@document",DbType.AnsiString,document,50);ErpSqlPlan.Parameter(command,"@line",DbType.AnsiString,Guid.NewGuid().ToString("D"),50);
            ErpSqlPlan.Parameter(command,"@actor",DbType.AnsiString,actor.PrincipalId,50);ErpSqlPlan.Parameter(command,"@status",DbType.Int32,status);
            ErpSqlPlan.Parameter(command,"@notes",DbType.String,notes,-1);
            Require(await command.ExecuteNonQueryAsync(token)==2,ErpCommandOutcome.Unavailable,"inbound_send_failed");return;
        }
        if(plan.Module=="purchase-approvals")
        {
            var field=plan.Screen.Fields["header"].Single(f=>f.Column=="Notes");
            Require(ErpInputRules.Value(field,ErpInputRules.Serialize(notes)),ErpCommandOutcome.InvalidInput,"approval_notes_invalid");
            await using var command=ErpSqlPlan.Command(transaction,"UPDATE dbo.AP_PurchaseRequestTbl SET StatusID=@status,isLock=@locked,Notes=@notes WHERE PurchaseRequestID=@document;");
            ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);ErpSqlPlan.Parameter(command,"@status",DbType.Int32,operation=="approve"?3:4);
            ErpSqlPlan.Parameter(command,"@locked",DbType.Boolean,operation=="approve");ErpSqlPlan.Parameter(command,"@notes",DbType.String,notes,-1);await One(command,token);return;
        }
        if(plan.Module is "sales-order-pm" or "sales-order-sa")
        {
            var statuses=plan.Module=="sales-order-pm"?"12,13":"14,15";
            var check=new List<(string,DbType,object?,int)>{("@DocumentID",DbType.AnsiString,document,50),("@Status",DbType.AnsiString,statuses,50)};
            if(plan.Module=="sales-order-pm")check.Add(("@User",DbType.AnsiString,actor.PrincipalId,50));
            await NativeCheck(transaction,plan.Module=="sales-order-pm"?"AR_Order_CheckPMBeforeUpdateStp":"AR_Order_CheckBeforeUpdateStp",check.ToArray(),token);
            var status=operation switch{"send-sa"=>14,"send-accounting"=>18,"send-tech"=>16,"reject"=>plan.Module=="sales-order-pm"?11:13,_=>request.Payload.GetProperty("statusId").GetInt32()};
            if(operation=="return-step")await ReturnStepAllowed(transaction,plan.Module,status,token);
            await Procedure(transaction,"AR_OrderTbl_UpdateStatusStp",[("@DocumentID",DbType.AnsiString,document,50),("@User",DbType.String,actor.PrincipalId,4000),
                ("@StatusID",DbType.Int32,status,0),("@Notes",DbType.String,notes,-1),("@SendTo",DbType.String,"",-1)],token);return;
        }
        var batch=plan.HeaderKey=="BatchID";
        var allowed=string.Join(',',ErpScreenCatalog.Metadata(plan.Module).GetProperty("saveStatuses").EnumerateArray().Select(s=>s.GetInt32()));
        await NativeCheck(transaction,batch?"IV_InternalTransfer_BatchCheckBeforeUpdateStp":"IV_InternalTransfer_RequestPMCheckBeforeUpdateStp",
            batch?[("@BatchID",DbType.AnsiString,document,30),("@Status",DbType.AnsiString,allowed,100)]
                 :[("@DocumentID",DbType.AnsiString,document,30),("@Status",DbType.AnsiString,allowed,100),("@User",DbType.AnsiString,actor.PrincipalId,100)],token);
        var button=ErpScreenCatalog.Metadata(plan.Module).GetProperty("buttons").EnumerateArray().Single(b=>b.GetProperty("operation").GetString()==operation);
        var procedure=button.GetProperty("procedure").GetString()!;
        if(operation=="sync-requests"){await TransferSync(transaction,actor,document,token);return;}
        var parameters=new List<(string Name,DbType Type,object? Value,int Size)>{(batch?"@BatchID":"@DocumentID",DbType.AnsiString,document,30),("@User",DbType.AnsiString,actor.PrincipalId,100)};
        if(operation=="return-step")
        {var status=request.Payload.GetProperty("statusId").GetInt32();await ReturnStepAllowed(transaction,plan.Module,status,token);parameters.Add(("@TargetStatusID",DbType.Int32,status,0));}
        if(procedure=="IV_InternalTransfer_BatchTechConfirmStp")
        {parameters.Add(("@AssignedSA1",DbType.AnsiString,Text(request.Payload,"primarySaId"),100));parameters.Add(("@AssignedSA2",DbType.AnsiString,Text(request.Payload,"supportingSaId"),100));}
        if(procedure=="IV_InternalTransfer_BatchAccountingConfirmStp")parameters.Add(("@OutputDocumentID",DbType.AnsiString,null,30));
        if(procedure=="IV_InternalTransfer_BatchReceiveStp")parameters.Add(("@InputDocumentID",DbType.AnsiString,null,30));
        if(operation!="sync-requests")parameters.Add((procedure=="IV_InternalTransfer_RequestPMReturnStp"?"@Reason":"@Notes",DbType.String,notes,-1));
        await Procedure(transaction,procedure,parameters.ToArray(),token);
    }
    internal static async Task ValidateInboundWarehouseInformation(DbTransaction transaction,string document,CancellationToken token)
    {
        // SY_FrmCfg/IV_InboundRequestFrm/LYS1/ExecSQLWithParaButtonCtl_1/CS4,
        // rechecked on 2026-10-12: barrel quantity is optional for this action.
        await using var check=ErpSqlPlan.Command(transaction,"SELECT COUNT_BIG(*) FROM dbo.IV_InboundRequestDetailsTbl WITH(HOLDLOCK) WHERE DocumentID=@document AND (LotNumberByDocument IS NULL OR SetQuantityByDocument IS NULL OR ExpireDateByDocument IS NULL);");
        ErpSqlPlan.Parameter(check,"@document",DbType.AnsiString,document,50);
        await using var rows=await check.ExecuteReaderAsync(token);
        Require(await rows.ReadAsync(token)&&rows.FieldCount==1&&rows.GetInt64(0)==0
            &&!await rows.ReadAsync(token)&&!await rows.NextResultAsync(token),
            ErpCommandOutcome.Conflict,"inbound_document_information_incomplete");
    }
    private static async Task ReturnStepAllowed(DbTransaction transaction,string module,int status,CancellationToken token)
    {
        var text=module=="sales-order-sa"?"SELECT COUNT_BIG(*) FROM dbo.AR_OrderStatusTbl WITH(HOLDLOCK) WHERE StatusID=@status AND IsReject=1 AND StatusID<14;"
            :"SELECT COUNT_BIG(*) FROM dbo.IV_InternalTransferBatchStatusTbl WITH(HOLDLOCK) WHERE StatusID=@status AND IsReject=1 AND IsActive=1 AND StatusID IN(10,21,41,61);";
        await using var command=ErpSqlPlan.Command(transaction,text);ErpSqlPlan.Parameter(command,"@status",DbType.Int32,status);
        Require(await command.ExecuteScalarAsync(token)is long count&&count==1,ErpCommandOutcome.InvalidInput,"return_step_invalid");
    }
}
