using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

// The Web runs the same native procedures as the ERP buttons (SY_FrmCfg LYS1 C4 / EBS, read 2026-10-25)
// instead of its own UPDATE/INSERT, and passes ERP's refusal wording to the user.
public sealed class ErpWorkflowParityTests
{
    private static readonly AuthoritativeIdentity Actor = new("synthetic.user","T","C","C","Synthetic",1,[]);

    private static (DbTransaction Transaction, List<DbCommand> Commands) Connection(Func<DbCommand,DataTable> respond)
    {
        var commands=new List<DbCommand>();
        var connection=new DisplayConnection(command=>{commands.Add(command);return respond(command).CreateDataReader();});
        connection.Open();
        return (connection.BeginTransaction(IsolationLevel.Serializable),commands);
    }
    private static DataTable Message(int type,string text)
    {
        var table=new DataTable();table.Columns.Add("Msg",typeof(string));table.Columns.Add("MsgType",typeof(int));
        table.Rows.Add(text,type);return table;
    }
    private static ErpCommandResult Refusal(Exception error)=>
        (ErpCommandResult)error.GetType().GetProperty("Result",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance)!.GetValue(error)!;

    [Fact]
    public async Task Send_purchase_order_runs_the_ERP_PO_procedure_that_writes_amounts()
    {
        var (transaction,commands)=Connection(_=>Message(3,"Đã gửi đặt mua hàng"));
        await SqlErpScreenCommands.PurchaseOrder(transaction,Actor,"PR'X",default);
        var command=Assert.Single(commands);
        Assert.Equal("EXEC dbo.[AP_PurchaseRequest_CreatePOStp] @PurchaseRequestID,@User;",command.CommandText);
        Assert.Equal("PR'X",command.Parameters["@PurchaseRequestID"].Value);
        Assert.Equal("synthetic.user",command.Parameters["@User"].Value);
        Assert.DoesNotContain("INSERT",command.CommandText);
    }

    [Theory]
    [InlineData("send-management","TM_SENDBLD")]
    [InlineData("send-warehouse","TM_SENDWH")]
    public async Task Inbound_send_runs_the_ERP_workflow_procedure(string operation,string action)
    {
        var (transaction,commands)=Connection(_=>Message(3,"Đã cập nhật"));
        await SqlErpScreenCommands.InboundSend(transaction,Actor,"inbound-requests",operation,"DN1",null,default);
        var command=Assert.Single(commands);
        Assert.StartsWith("EXEC dbo.[IV_InboundRequest_ChangeWorkflowStatusStp] @DocumentID,@User,@Action,@TargetStatus,@SendTo,@Notes",command.CommandText);
        Assert.Equal(action,command.Parameters["@Action"].Value);
        Assert.Equal(DBNull.Value,command.Parameters["@TargetStatus"].Value);
    }

    [Theory]
    [InlineData("approve",true)]
    [InlineData("reject",false)]
    public async Task Purchase_decision_runs_the_ERP_approval_procedure(string operation,bool approve)
    {
        var (transaction,commands)=Connection(_=>Message(3,"Đã duyệt đề nghị"));
        await SqlErpScreenCommands.PurchaseDecision(transaction,Actor,operation,"PR1","Lý do",default);
        var command=Assert.Single(commands);
        Assert.StartsWith("EXEC dbo.[AP_PurchaseRequest_ApproveOrRejectStp]",command.CommandText);
        Assert.Equal(approve,command.Parameters["@Approve"].Value);
    }

    [Fact]
    public async Task A_native_refusal_keeps_ERPs_own_message()
    {
        var (transaction,_)=Connection(_=>Message(1,"Chỉ được tạo PO từ đề nghị đã duyệt."));
        var error=await Assert.ThrowsAnyAsync<Exception>(()=>SqlErpScreenCommands.PurchaseOrder(transaction,Actor,"PR1",default));
        var result=Refusal(error);
        Assert.Equal(ErpCommandOutcome.Conflict,result.Outcome);
        Assert.Equal("native_action_rejected",result.Code);
        Assert.Equal("Chỉ được tạo PO từ đề nghị đã duyệt.",result.Message);
    }

    [Fact]
    public async Task Sales_lines_over_the_contract_remainder_are_refused_like_the_ERP_save_hook()
    {
        var (transaction,commands)=Connection(_=>
        {
            var table=new DataTable();
            foreach(var name in new[]{"Title","ItemID","ItemName","Notes"})table.Columns.Add(name,typeof(string));
            table.Columns.Add("MsgType",typeof(int));
            table.Rows.Add("Số lượng vượt quá hợp đồng","IT1","Máy A","Còn lại 2, đang nhập 5",1);
            return table;
        });
        var error=await Assert.ThrowsAnyAsync<Exception>(()=>SqlErpScreenCommands.SalesContractQuantity(transaction,"SO'1",default));
        var command=Assert.Single(commands);
        Assert.Contains("FOR XML PATH('T1'),ROOT('Data')",command.CommandText);
        Assert.Contains("EXEC dbo.AR_OrderDetail_WarningOverQuantityStp @xml",command.CommandText);
        Assert.DoesNotContain("SO'1",command.CommandText);
        var result=Refusal(error);
        Assert.Equal("sales_quantity_exceeds_contract",result.Code);
        Assert.Contains("Máy A: Còn lại 2, đang nhập 5",result.Message);
    }

    [Theory]
    [InlineData("send-sa","WH_SENDSA")]
    [InlineData("reject","WH_RETURN")]
    public async Task Warehouse_buttons_run_the_ERP_inbound_transition(string operation,string action)
    {
        // IV_IncomingShipmentStatusFrm LYS1 C4: "Gửi TP SA" WH_SENDSA, "Từ chối" WH_RETURN.
        var (transaction,commands)=Connection(_=>Message(3,"Đã cập nhật"));
        await SqlErpScreenCommands.InboundSend(transaction,Actor,"inbound-warehouse",operation,"DN1",null,default);
        Assert.Equal(action,Assert.Single(commands).Parameters["@Action"].Value);
    }

    [Fact]
    public void Warehouse_list_shows_every_request_ever_sent_to_the_warehouse_like_ERP()
    {
        // T0 TN3/FTR: history rows with StatusID 2, so returned (3) and passed-on requests still list.
        var plan=ErpSqlPlan.Get("inbound-warehouse")!;
        Assert.Contains("IV_InboundRequestLogTbl",plan.ScopePredicate);
        Assert.Contains("L.StatusID=2",plan.ScopePredicate);
        Assert.Contains("H.BranchID=@branch",plan.ScopePredicate);
        var screen=ErpScreenCatalog.Get("inbound-warehouse")!;
        Assert.Equal("IV_IncomingShipmentStatusFrm",screen.FormId);
        Assert.Equal(new[]{"send-sa","reject"},screen.Actions.Where(a=>a.Control.StartsWith("ExecSQL",StringComparison.Ordinal)).Select(a=>a.Id).ToArray());
        Assert.DoesNotContain(screen.Actions,a=>a.Id is "create" or "delete"&&a.NativeVisible);
        Assert.Contains(screen.Fields["lines"],f=>f.Column=="LotNumberByReal"&&f.Writable);
        Assert.DoesNotContain(screen.Fields["lines"],f=>f.Column is "SetQuantityByDocument" or "UnitPrice" or "ItemID"&&f.Writable);
    }

    [Theory]
    [InlineData("inbound-sa","reject","SA_RETURN")]
    [InlineData("inbound-sa","send-pm","SA_SENDPM")]
    [InlineData("inbound-sa","return-step","SA_RETURNTO")]
    [InlineData("inbound-sa","send-tech","SA_SENDTECH")]
    [InlineData("inbound-tech","reject","TECH_RETURN")]
    [InlineData("inbound-tech","send-pm","TECH_SENDPM")]
    [InlineData("inbound-tech","return-step","TECH_RETURNTO")]
    [InlineData("inbound-pm","reject","PM_RETURN")]
    [InlineData("inbound-pm","send-accounting","PM_SENDACCOUNT")]
    [InlineData("inbound-pm","return-step","PM_RETURNTO")]
    [InlineData("inbound-bld","approve","BLD_APPROVE")]
    [InlineData("inbound-bld","reject","BLD_CANCEL")]
    public async Task Inbound_step_buttons_pass_ERP_action_target_and_recipient(string module,string operation,string action)
    {
        // IV_GoodsInfoControlFrm / IV_GoodsStatusConfirmFrm / IV_GoodsQualityControlConfirmFrm LYS1 C4.
        var (transaction,commands)=Connection(_=>Message(3,"Đã cập nhật"));
        await SqlErpScreenCommands.InboundSend(transaction,Actor,module,operation,"DN1","Lý do",default,
            operation=="return-step"?3:null,operation=="send-pm"?"pm.user":null);
        var command=Assert.Single(commands);
        Assert.Equal(action,command.Parameters["@Action"].Value);
        Assert.Equal(operation=="return-step"?3:DBNull.Value,command.Parameters["@TargetStatus"].Value);
        Assert.Equal(operation=="send-pm"?"pm.user":DBNull.Value,command.Parameters["@SendTo"].Value);
        Assert.Equal("Lý do",command.Parameters["@Notes"].Value);
    }

    [Theory]
    [InlineData("inbound-sa","IV_GoodsInfoControlFrm","IN(4,5)",new[]{"send-tech","send-pm","reject","return-step"})]
    [InlineData("inbound-tech","IV_GoodsStatusConfirmFrm","IN(8,9)",new[]{"send-pm","reject","return-step"})]
    [InlineData("inbound-pm","IV_GoodsQualityControlConfirmFrm","IN(6,7)",new[]{"send-accounting","reject","return-step"})]
    [InlineData("inbound-bld","IV_CargoHandlingPlanApprovalFrm","IN(10)",new[]{"approve","reject"})]
    public void Inbound_step_lists_keep_returned_requests_like_ERP(string module,string form,string statuses,string[] buttons)
    {
        // T0 TN3: history rows of the step, so a request sent back or passed on still lists.
        var plan=ErpSqlPlan.Get(module)!;
        Assert.Contains("L.StatusID "+statuses,plan.ScopePredicate);
        Assert.Contains("H.BranchID=@branch",plan.ScopePredicate);
        Assert.Equal(module=="inbound-pm",plan.ScopePredicate.Contains("@actor",StringComparison.Ordinal));
        var screen=ErpScreenCatalog.Get(module)!;
        Assert.Equal(form,screen.FormId);
        Assert.Equal(buttons,screen.Actions.Where(a=>a.Control.StartsWith("ExecSQL",StringComparison.Ordinal)).Select(a=>a.Id).ToArray());
        Assert.DoesNotContain(screen.Fields["lines"],f=>f.Writable);
        Assert.Equal(module is "inbound-sa" or "inbound-bld",!screen.Fields["header"].Any(f=>f.Writable));
        Assert.Equal(module is "inbound-sa" or "inbound-tech",ErpWorkflowRules.HasActionOptions(module,"send-pm"));
        Assert.Equal(module!="inbound-bld",screen.Actions.Any(a=>a.Id=="return-step"));
    }

    [Fact]
    public void Inbound_PM_screen_only_lets_the_recipient_act()
    {
        var fields=new Dictionary<string,object?>{["sendTo"]="other.pm"};
        var state=new ErpActionContext("inbound-pm",Actor.PrincipalId,"DN1",6,false,null,null,0,false,false,new(true,false,true,false),true,WorkflowFields:fields);
        Assert.False(ErpWorkflowRules.StateAllows(state,"send-accounting"));
        fields["sendTo"]=Actor.PrincipalId;
        Assert.True(ErpWorkflowRules.StateAllows(state,"send-accounting"));
        Assert.False(ErpWorkflowRules.StateAllows(state with{StatusId=8},"send-accounting"));
    }

    [Fact]
    public void Inbound_PM_list_shows_only_requests_sent_to_the_PM_now()
    {
        // IV_GoodsQualityControlConfirmFrm T0 FTR: C.StatusID = 6 AND IV_InboundRequestTbl.SendTo = '{User}'.
        var predicate=ErpSqlPlan.Get("inbound-pm")!.ScopePredicate;
        Assert.Contains("L.StatusID IN(6,7))",predicate);
        Assert.Contains("COALESCE(H.SendTo,N'')",predicate);
        Assert.DoesNotContain("L.SendTo",predicate);
        Assert.DoesNotContain(" OR ",predicate);
    }

    [Theory]
    [InlineData(true,"send-tech",true)][InlineData(true,"send-sa",false)]
    [InlineData(false,"send-tech",false)][InlineData(false,"send-sa",true)]
    public void Transfer_batch_sends_to_tech_with_equipment_and_to_SA_without(bool equipment,string operation,bool allowed)
    {
        // IV_InternalTransferBatchFrm LYS1: "Gửi kỹ thuật" LBEX ... OR HasEquipment=0, "Gửi TP SA" LBEX ... OR HasEquipment=1.
        var screen=ErpScreenCatalog.Get("internal-transfer-batches")!;
        Assert.Equal(new[]{"sync-requests","send-tech","send-sa"},screen.Actions.Where(a=>a.Control.StartsWith("ExecSQL",StringComparison.Ordinal)).Select(a=>a.Id).ToArray());
        Assert.Contains(screen.Actions,a=>a.Id=="send-sa"&&a.Caption=="Gửi TP SA"&&a.Control=="ExecSQLWithParaButtonCtl_2");
        var fields=new Dictionary<string,object?>{["assignedPM"]=Actor.PrincipalId,["hasEquipment"]=equipment};
        var state=new ErpActionContext("internal-transfer-batches",Actor.PrincipalId,"DCT1",10,false,null,null,1,false,false,new(true,false,true,false),true,WorkflowFields:fields);
        Assert.Equal(allowed,ErpWorkflowRules.StateAllows(state,operation));
        Assert.False(ErpWorkflowRules.StateAllows(state with{StatusId=20},operation));
    }

    [Theory]
    [InlineData("send-tech","HasEquipment=1","Chỉ gửi Kỹ thuật khi đợt còn ở bước PM và có thiết bị.")]
    [InlineData("send-sa","D.IsEquipment=1","Chỉ gửi TP SA khi đợt còn ở bước PM và không có thiết bị. Vui lòng đồng bộ đề nghị nếu loại hàng thay đổi.")]
    public async Task Transfer_batch_send_rechecks_equipment_like_the_ERP_button(string operation,string condition,string message)
    {
        DataTable Bit(bool value){var table=new DataTable();table.Columns.Add("V",typeof(bool));table.Rows.Add(value);return table;}
        var (transaction,commands)=Connection(_=>Bit(true));
        await SqlErpScreenCommands.TransferSubmitCheck(transaction,operation,"DCT1",default);
        Assert.Contains(condition,Assert.Single(commands).CommandText);
        Assert.Equal("DCT1",commands[0].Parameters["@batch"].Value);
        (transaction,_)=Connection(_=>Bit(false));
        var refusal=Refusal(await Assert.ThrowsAnyAsync<Exception>(()=>SqlErpScreenCommands.TransferSubmitCheck(transaction,operation,"DCT1",default)));
        Assert.Equal(ErpCommandOutcome.Conflict,refusal.Outcome);
        Assert.Equal(message,refusal.Message);
    }

    [Fact]
    public async Task Cancel_draft_runs_the_ERP_partial_inbound_cancel_procedure()
    {
        // IV_InboundRequestFrm LYS1 ExecSQLWithParaButtonCtl_PartialCancel C4: '{0}',N'{1}','{User}'.
        var (transaction,commands)=Connection(_=>new DataTable());
        await SqlErpScreenCommands.InboundDraftCancel(transaction,Actor,"DN1","Sai đợt",default);
        var command=Assert.Single(commands);
        Assert.Equal("EXEC dbo.[AP_POInboundPartial_CancelStp] @InboundRequestDocumentID,@Reason,@User;",command.CommandText);
        Assert.Equal("DN1",command.Parameters["@InboundRequestDocumentID"].Value);
        Assert.Equal("Sai đợt",command.Parameters["@Reason"].Value);
        Assert.Equal(Actor.PrincipalId,command.Parameters["@User"].Value);
        var screen=ErpScreenCatalog.Get("inbound-requests")!;
        Assert.Contains(screen.Actions,a=>a.Id=="cancel-draft"&&a.Caption=="Hủy đợt nháp");
    }

    [Fact]
    public void Cost_documents_screen_lists_requests_past_TM_and_only_edits_costs()
    {
        // IV_InboundRequestCTCPFrm T0 FTR: StatusID >= 2 AND StatusID NOT IN (11, 12).
        var plan=ErpSqlPlan.Get("inbound-costs")!;
        Assert.Contains("H.StatusID>=2 AND H.StatusID NOT IN(11,12)",plan.ScopePredicate);
        var screen=ErpScreenCatalog.Get("inbound-costs")!;
        Assert.Equal("IV_InboundRequestCTCPFrm",screen.FormId);
        Assert.All(screen.Fields.Where(s=>s.Key!="costs").SelectMany(s=>s.Value),f=>Assert.False(f.Writable));
        Assert.Contains(screen.Fields["costs"],f=>f.Column=="SourceAmount"&&f.Writable);
        Assert.Contains(screen.Actions,a=>a.Id=="save-costs"&&a.NativeVisible);
        Assert.DoesNotContain(screen.Actions,a=>a.Id is "create" or "save" or "delete"&&a.NativeVisible);
        var state=new ErpActionContext("inbound-costs",Actor.PrincipalId,"DN1",13,false,null,null,0,false,false,new(true,false,true,false),true);
        Assert.True(ErpWorkflowRules.StateAllows(state,"save-costs"));
        Assert.False(ErpWorkflowRules.StateAllows(state with{StatusId=12},"save-costs"));
    }

    [Fact]
    public async Task Row_counts_ignore_rows_added_by_ERP_triggers()
    {
        // IV_InboundRequest_SaveBatchAdapterTrg (INSTEAD OF INSERT, SET NOCOUNT OFF) makes one inserted
        // line report 2 rows to the client; the statement's own @@ROWCOUNT is still 1.
        var connection=new DisplayConnection(_=>throw new InvalidOperationException(),command=>
        {
            Assert.EndsWith("; SET @affected=@@ROWCOUNT;",command.CommandText);
            command.Parameters["@affected"].Value=1;
            return 2;
        });
        connection.Open();
        using var transaction=connection.BeginTransaction(IsolationLevel.Serializable);
        using var command=connection.CreateCommand();command.Transaction=transaction;
        command.CommandText="INSERT dbo.[IV_InboundRequestDetailsTbl]([ItemID]) VALUES(@value0);";
        Assert.Equal(1,await SqlErpScreenCommands.Affected(command,default));
    }

    [Fact]
    public async Task Sales_lines_within_the_contract_save_normally()
    {
        var (transaction,_)=Connection(_=>{var t=new DataTable();t.Columns.Add("Title",typeof(string));t.Columns.Add("MsgType",typeof(int));return t;});
        await SqlErpScreenCommands.SalesContractQuantity(transaction,"SO1",default);
    }
}
