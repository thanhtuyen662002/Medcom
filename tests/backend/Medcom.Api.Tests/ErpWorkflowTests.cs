using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class ErpWorkflowTests
{
    [Fact]
    public void Contract_inspection_cannot_change_the_served_contract_or_other_callers()
    {
        var copy=ApiContractCatalog.Build();
        var original=copy["paths"]!["/api/erp/inbound-requests/create"]!.DeepClone();
        copy["paths"]!["/api/erp/inbound-requests/create"]=null;
        Assert.True(System.Text.Json.Nodes.JsonNode.DeepEquals(original,
            ApiContractCatalog.Build()["paths"]!["/api/erp/inbound-requests/create"]));
        Assert.True(System.Text.Json.Nodes.JsonNode.DeepEquals(ApiContractCatalog.Build(),
            System.Text.Json.Nodes.JsonNode.Parse(ApiContractCatalog.Json)));
    }
    private static ErpActionContext State(string module,int status,string actor="primary")=>new(module,actor,"SYNTHETIC-DOC",status,false,
        actor,null,1,false,false,new(true,true,true,true),true,WorkflowFields:new Dictionary<string,object?>
        {{"assignedPM","primary"},{"assignedTechnician","primary"},{"assignedSA","primary"},{"sendTo","primary; supporting"}});
    [Theory]
    [InlineData("internal-transfer-pm",10,"pm-confirm")]
    [InlineData("internal-transfer-tech",20,"send-sa")]
    [InlineData("internal-transfer-sa",40,"send-accounting")]
    public void Supporting_recipients_cannot_modify_primary_recipient_documents(string module,int status,string action)
    {
        Assert.True(ErpActionRules.StateAllows(State(module,status),"save"));
        Assert.True(ErpActionRules.StateAllows(State(module,status),action));
        Assert.False(ErpActionRules.StateAllows(State(module,status,"supporting"),"save"));
        Assert.False(ErpActionRules.StateAllows(State(module,status,"supporting"),action));
        Assert.False(ErpActionRules.StateAllows(State(module,120),action));
    }
    [Theory]
    [InlineData("purchase-approvals",2,"approve")]
    [InlineData("sales-order-pm",12,"send-sa")]
    [InlineData("sales-order-sa",14,"send-accounting")]
    public void Approval_forms_publish_workflow_commands_without_unsupported_direct_CUD(string module,int status,string action)
    {
        var definitions=ErpScreenCatalog.Get(module)!.Actions;
        Assert.DoesNotContain(definitions,a=>a.Operation is "create" or "save" or "delete");
        var state=State(module,status);Assert.True(ErpActionRules.Evaluate(state).Single(a=>a.Id==action).Enabled);
        Assert.False(ErpActionRules.Evaluate(state with{Rights=new(true,true,false,true)}).Single(a=>a.Id==action).Visible);
        Assert.False(ErpActionRules.StateAllows(state,"save"));
    }
    [Fact]
    public void Purchase_order_edits_do_not_invent_a_draft_only_restriction()
    {
        Assert.True(ErpActionRules.StateAllows(State("purchase-orders",9),"save"));
        Assert.False(ErpActionRules.StateAllows(State("purchase-orders",9)with{IsLocked=true},"save"));
        Assert.False(ErpActionRules.StateAllows(State("internal-transfer-batches",0),"delete"));
        Assert.True(ErpActionRules.StateAllows(State("internal-transfer-batches",0)with{LineCount=0},"delete"));
    }
    [Theory]
    [InlineData("internal-transfer-pm","{\"pMApprovedQty\":\"3\",\"pMNote\":\"Synthetic\"}",true)]
    [InlineData("internal-transfer-pm","{\"pMApprovedQty\":\"3\",\"requestedQty\":\"99\"}",false)]
    [InlineData("internal-transfer-sa","{\"approvedQty\":\"3\",\"notes\":null}",true)]
    [InlineData("internal-transfer-sa","{\"approvedQty\":\"3\",\"itemId\":\"OTHER\"}",false)]
    [InlineData("purchase-orders","{\"itemId\":\"ITEM\",\"quantity\":\"2\",\"unitPrice\":\"3\",\"amount\":\"999\"}",false)]
    public void Department_inputs_preserve_owned_keys_and_calculated_values(string module,string json,bool allowed)
        =>Assert.Equal(allowed,ErpInputRules.Normalize(module,"lines",JsonSerializer.Deserialize<JsonElement>(json),out _));
    [Theory]
    [InlineData("sales-order-sa","return-step","{\"statusId\":11,\"notes\":null}",true)]
    [InlineData("sales-order-sa","return-step","{\"notes\":null}",false)]
    [InlineData("internal-transfer-tech","send-sa","{\"primarySaId\":\"SA1\",\"supportingSaId\":\"SA2\",\"notes\":null}",true)]
    [InlineData("internal-transfer-tech","send-sa","{\"primarySaId\":\"SA1\",\"supportingSaId\":\"SA1\"}",false)]
    [InlineData("internal-transfer-tech","send-sa","{\"primarySaId\":\"SA1\"}",false)]
    [InlineData("inbound-requests","send-management","{\"notes\":\"Synthetic\",\"statusId\":2}",false)]
    public void Action_payloads_reject_missing_assignments_extra_fields_and_arbitrary_status_changes(string module,string action,string json,bool allowed)
    {
        var request=new ErpActionRequest("synthetic-key","B1","SYNTHETIC-DOC",new string('a',64),JsonSerializer.Deserialize<JsonElement>(json));
        Assert.Equal(allowed,ErpCommandRules.Freeze(module,action,ErpInputRules.Serialize(request),out _));
    }
    [Fact]
    public void SQL_procedure_notes_are_rejected_before_silent_truncation()
    {
        Assert.Equal(1000,ErpWorkflowRules.MaximumNotes("internal-transfer-accounting","send-warehouse"));
        var body=new ErpActionRequest("key","B1","SYNTHETIC-DOC",new string('a',64),ErpInputRules.Serialize(new ErpActionNotes(new string('x',1001))));
        Assert.False(ErpCommandRules.Freeze("internal-transfer-accounting","send-warehouse",ErpInputRules.Serialize(body),out _));
    }
    [Fact]
    public void Native_readonly_item_procedure_binds_parameters_and_other_procedures_remain_unselectable()
    {
        var value="x');DELETE dbo.X;--";
        var bound=ErpLookupSql.Bind("IV_GetItemByContractIDStp N'{0}'",["ContractID"],[value],"actor","B1");
        Assert.NotNull(bound);Assert.DoesNotContain(value,bound.Text);Assert.Equal(value,Assert.Single(bound.Parameters).Value);
        Assert.Null(ErpLookupSql.Bind("IV_InternalTransfer_BatchReceiveStp '{0}'",["BatchID"],["x"],"actor","B1"));
        Assert.Equal(new[]{"Cự Lộc","Điều chuyển"},ErpLookupSql.StaticChoices("Cự Lộc;Điều chuyển"));
        Assert.Null(ErpLookupSql.StaticChoices("SELECT ItemID FROM dbo.CF_ItemTbl"));
    }
    [Fact]
    public void Extra_sections_use_their_native_read_and_write_shapes()
    {
        var paths=ApiContractCatalog.Build()["paths"]!;
        Assert.NotNull(paths["/api/erp/inbound-requests/sections/costs/save"]);
        Assert.NotNull(paths["/api/erp/internal-transfer-tech/sections/assets/save"]);
        Assert.Null(paths["/api/erp/internal-transfer-sa/sections/assets/save"]);
        Assert.Null(paths["/api/erp/inbound-requests/sections/discrepancies/save"]);
        Assert.Null(paths["/api/erp/purchase-orders/selection"]);
        var binding=ApiReferenceCatalog.Resolve("StatusID","internal-transfer-warehouse-in");
        Assert.Equal("status:internal-transfer-batches",binding);
        Assert.Equal("IV_InternalTransferBatchStatusTbl",ApiReferenceCatalog.Get(binding!)!.Table);
    }
}
