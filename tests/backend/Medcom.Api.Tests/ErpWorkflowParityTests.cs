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
        await SqlErpScreenCommands.InboundSend(transaction,Actor,operation,"DN1",null,default);
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
