using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class ErpCudPresentationTests
{
    public static IEnumerable<object[]> Modules()=>ErpScreenCatalog.ModuleIds.Select(module=>new object[]{module});
    [Theory]
    [MemberData(nameof(Modules))]
    public void Existing_CUD_controls_stay_enabled_without_mutating_native_command_admission(string module)
    {
        var state=new ErpActionContext(module,"actor","synthetic",999,true,"other",null,0,true,true,
            new(true,false,false,false),false,NumberingQualified:false);
        var before=ErpActionRules.Evaluate(state);var display=ErpActionRules.ForDisplay(state);
        Assert.Equal(before.Count,display.Count);
        foreach(var definition in ErpScreenCatalog.Get(module)!.Actions)
        {
            var native=before.Single(a=>a.Id==definition.Id);var shown=display.Single(a=>a.Id==definition.Id);
            if(ErpActionRules.IsCudOperation(definition.Operation))
            {
                Assert.True(shown.Enabled);Assert.True(shown.Visible);Assert.Null(shown.Reason);
                Assert.StartsWith("/api/erp/"+module+"/",shown.Route);
                Assert.False(native.Enabled);
            }
            else Assert.Equal(native,shown);
        }
        Assert.Equal(before,ErpActionRules.Evaluate(state));
        var catalog=ErpScreenCatalog.Get(module)!;var copy=ErpActionRules.ForDisplay(catalog);
        Assert.Same(catalog,ErpScreenCatalog.Get(module));Assert.NotSame(catalog.Actions,copy.Actions);
        foreach(var action in copy.Actions.Where(a=>ErpActionRules.IsCudOperation(a.Operation)))
        {Assert.True(action.NativeVisible);Assert.Null(action.LockExpression);}
    }
    [Theory]
    [InlineData("sales-orders",12)] [InlineData("purchase-requests",3)]
    [InlineData("internal-transfer-requests",10)] [InlineData("machine-movements",0)]
    public void An_edit_control_does_not_allow_writing_a_locked_document(string module,int status)
    {
        var state=new ErpActionContext(module,"actor","synthetic",status,true,"actor",null,1,false,false,
            new(true,true,true,true),true);
        Assert.True(ErpActionRules.ForDisplay(state).Single(a=>a.Id=="save").Enabled);
        Assert.False(ErpActionRules.Evaluate(state).Single(a=>a.Id=="save").Enabled);
        Assert.False(ErpActionRules.StateAllows(state,"save"));
    }
    [Fact]
    public void Unsupported_or_workflow_operations_are_never_made_available_as_CUD()
    {
        Assert.Empty(ErpActionRules.ForDisplay(new ErpActionContext("unknown","actor",null,null,false,null,null,0,false,false,new(true,true,true,true),true)));
        foreach(var operation in new[]{"save-unknown","approve","send-pm","recall","receive","paste","print"})
            Assert.False(ErpActionRules.IsCudOperation(operation));
        Assert.Equal(48,ErpScreenCatalog.ModuleIds.Sum(module=>ErpScreenCatalog.Get(module)!.Actions.Count(action=>ErpActionRules.IsCudOperation(action.Operation))));
    }
    [Fact]
    public void Every_label_is_bound_to_the_audited_form_or_button_without_generated_fallbacks()
    {
        foreach(var module in ErpScreenCatalog.ModuleIds)
        {
            var screen=ErpScreenCatalog.Get(module)!;
            var source=ErpCaptionCatalog.Metadata.GetProperty("screens").EnumerateArray().Single(row=>row.GetProperty("module").GetString()==module);
            Assert.Equal("dbo.SY_FrmLstTbl.CaptionVN",source.GetProperty("source").GetString());
            Assert.Equal(source.GetProperty("caption").GetString(),screen.Caption);
            foreach(var action in screen.Actions)
            {
                var row=ErpCaptionCatalog.Metadata.GetProperty("actions").EnumerateArray().Single(row=>row.GetProperty("module").GetString()==module&&row.GetProperty("actionId").GetString()==action.Id);
                Assert.Equal(row.GetProperty("caption").GetString(),action.Caption);
                if(action.Control is "native-toolbar" or "web-draft-validation")Assert.Equal("",action.Caption);
            }
        }
        Assert.Equal("Phiếu đề nghị nhập hàng",ErpScreenCatalog.Get("inbound-requests")!.Caption);
        Assert.Equal("Đặt mua hàng",ErpScreenCatalog.Get("purchase-orders")!.Caption);
        Assert.Equal("Gửi Thủ kho",ErpScreenCatalog.Get("inbound-requests")!.Actions.Single(a=>a.Id=="send-warehouse").Caption);
        Assert.Equal("",ErpCaptionCatalog.Screen("unknown","unknown"));
        Assert.Equal("",ErpCaptionCatalog.Screen("sales-orders","unknown"));
        Assert.Equal("",ErpCaptionCatalog.Action("sales-orders","recall","unknown"));
    }
    [Theory]
    [InlineData("missing")] [InlineData("duplicate")] [InlineData("unsourced")]
    [InlineData("null")] [InlineData("control")] [InlineData("oversized")]
    public void Missing_ambiguous_or_invalid_captions_are_empty(string scenario)
    {
        var value=scenario switch{"null"=>null,"control"=>"Tên\nkhông hợp lệ","oversized"=>new string('x',201),_=>"Tên đúng"};
        var row=new{caption=value,source=scenario=="unsourced"?null:"dbo.SY_FrmLstTbl.CaptionVN"};
        var rows=JsonSerializer.SerializeToElement(scenario=="missing"?Array.Empty<object>():scenario=="duplicate"?new object[]{row,row}:new object[]{row});
        Assert.Equal("",ErpCaptionCatalog.Resolve(rows,_=>true));
    }
}
