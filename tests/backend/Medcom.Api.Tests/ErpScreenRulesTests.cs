using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class ErpScreenRulesTests
{
    [Fact]
    public void Catalog_preserves_current_seven_forms_and_all_417_source_fields()
    {
        Assert.Equal(7,ErpScreenCatalog.ModuleIds.Count);
        Assert.Equal(417,ErpScreenCatalog.ModuleIds.Sum(module=>ErpScreenCatalog.Get(module)!.Fields.Sum(section=>section.Value.Count)));
        Assert.Equal("AR_OrderByContractFrm",ErpScreenCatalog.Get("sales-orders")!.FormId);
        Assert.Equal("FA_Move2026Frm",ErpScreenCatalog.Get("machine-movements")!.FormId);
        Assert.Equal("FA_Repair2026Frm",ErpScreenCatalog.Get("machine-repairs")!.FormId);
        Assert.Null(ErpScreenCatalog.Get("AP_OrderTbl"));
        Assert.Null(ErpScreenCatalog.Get("sales-orders;DROP TABLE X"));
        Assert.Equal(106,ErpScreenCatalog.ModuleIds.Sum(module=>ErpScreenCatalog.Get(module)!.Lookups.Count));
        Assert.Equal(14,ErpScreenCatalog.SourceMetadata.GetProperty("screens").EnumerateArray().Sum(row=>row.GetProperty("buttons").GetArrayLength()));
    }
    [Theory]
    [InlineData("warehouse-qr")][InlineData("sales-qr")]
    public void QR_forms_expose_scan_commands_and_do_not_advertise_parent_creation_or_deletion(string module)
    {
        var actions=ErpScreenCatalog.Get(module)!.Actions;
        Assert.Contains(actions,a=>a.Id=="scan-add");Assert.Contains(actions,a=>a.Id=="scan-delete");
        Assert.DoesNotContain(actions,a=>a.Id is "create" or "save" or "delete");
        Assert.Null(ErpInputRules.HeaderType(module));Assert.Null(ErpInputRules.LineType(module));
    }
    private static ErpActionContext State(string module,int status,string? owner="actor",bool locked=false)
        =>new(module,"actor","synthetic-doc",status,locked,owner,"synthetic-contract",1,false,false,new(true,true,true,true),true,true);
    [Theory]
    [InlineData(-1,true,true,true,false)][InlineData(11,true,false,true,false)]
    [InlineData(12,false,false,false,true)][InlineData(14,false,false,false,false)]
    public void Sales_order_native_steps_distinguish_edit_delete_send_and_recall(int status,bool save,bool delete,bool send,bool recall)
    {
        var state=State("sales-orders",status);
        Assert.Equal(save,ErpActionRules.StateAllows(state,"save"));Assert.Equal(delete,ErpActionRules.StateAllows(state,"delete"));
        Assert.Equal(send,ErpActionRules.StateAllows(state,"send-pm"));Assert.Equal(recall,ErpActionRules.StateAllows(state,"recall"));
        Assert.False(ErpActionRules.StateAllows(state with{Owner="other"},"save"));
        Assert.False(ErpActionRules.StateAllows(state with{Owner="other"},"recall"));
    }
    [Theory]
    [InlineData(0,true,true,true,false)][InlineData(30,true,false,true,false)]
    [InlineData(10,false,false,false,true)][InlineData(20,false,false,false,false)]
    public void Transfer_recall_delete_and_resubmission_follow_distinct_source_states(int status,bool save,bool delete,bool send,bool recall)
    {
        var state=State("internal-transfer-requests",status);
        Assert.Equal(save,ErpActionRules.StateAllows(state,"save"));Assert.Equal(delete,ErpActionRules.StateAllows(state,"delete"));
        Assert.Equal(send,ErpActionRules.StateAllows(state,"send-pm"));Assert.Equal(recall,ErpActionRules.StateAllows(state,"recall"));
        Assert.False(ErpActionRules.StateAllows(state with{LinkedToTransferBatch=true},"recall"));
    }
    [Fact]
    public void Purchase_resubmission_and_order_generation_do_not_confuse_approval_with_draft()
    {
        Assert.True(ErpActionRules.StateAllows(State("purchase-requests",4),"submit"));
        Assert.False(ErpActionRules.StateAllows(State("purchase-requests",2),"submit"));
        var approved=State("purchase-requests",3,locked:true);
        Assert.True(ErpActionRules.StateAllows(approved,"send-purchase-order"));
        Assert.False(ErpActionRules.StateAllows(approved with{LinkedToPurchaseOrder=true},"send-purchase-order"));
        Assert.False(ErpActionRules.StateAllows(approved,"save"));
    }
    [Fact]
    public void Native_permissions_visibility_and_runtime_qualification_remain_separate()
    {
        var state=State("sales-orders",11)with{WritesQualified=false};
        var send=ErpActionRules.Evaluate(state).Single(action=>action.Id=="send-pm");
        Assert.True(send.Visible);Assert.False(send.Enabled);Assert.Equal("erp_write_unqualified",send.Reason);
        var denied=ErpActionRules.Evaluate(state with{Rights=new(true,false,false,false)}).Single(action=>action.Id=="send-pm");
        Assert.False(denied.Visible);Assert.False(denied.Enabled);Assert.Null(denied.Route);
        var read=ErpActionRules.Evaluate(state with{IsLocked=true}).Single(action=>action.Id=="contract-info");
        Assert.True(read.Enabled);
    }
    [Theory]
    [InlineData("9999999999999999999999999999",28,0,true)]
    [InlineData("10000000000000000000000000000",28,0,false)]
    [InlineData("1.0000",28,4,true)][InlineData("1.00001",28,4,false)]
    [InlineData("1e3",18,2,false)][InlineData(" 1",18,2,false)]
    public void Decimal_strings_preserve_SQL_precision_without_rounding_or_exponent_coercion(string value,int precision,int scale,bool accepted)
        =>Assert.Equal(accepted,ErpInputRules.Decimal(value,precision,scale));
    [Theory]
    [InlineData("{\"itemId\":\"synthetic-item\",\"quantity\":\"1\",\"unitPrice\":\"2\"}",true)]
    [InlineData("{\"itemId\":\"synthetic-item\",\"quantity\":\"1\",\"unitPrice\":\"2\",\"totalPrice\":\"999\"}",false)]
    [InlineData("{\"itemId\":\"synthetic-item\",\"quantity\":\"1\",\"unitPrice\":\"2\",\"documentId\":\"other\"}",false)]
    [InlineData("{\"itemId\":\"synthetic-item\",\"itemId\":\"other\",\"quantity\":\"1\",\"unitPrice\":\"2\"}",false)]
    [InlineData("{\"ItemId\":\"synthetic-item\",\"quantity\":\"1\",\"unitPrice\":\"2\"}",false)]
    [InlineData("{\"itemId\":null,\"quantity\":\"1\",\"unitPrice\":\"2\"}",false)]
    public void Fixed_draft_inputs_reject_derived_fields_owner_keys_duplicates_case_aliases_and_null_requirements(string json,bool accepted)
    {
        using var document=JsonDocument.Parse(json);
        Assert.Equal(accepted,ErpInputRules.Normalize("purchase-requests","lines",document.RootElement,out _));
    }
}
