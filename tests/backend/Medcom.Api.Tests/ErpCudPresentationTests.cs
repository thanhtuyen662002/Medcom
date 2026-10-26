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
    public void Presentation_obeys_native_grants_and_preserves_source_metadata(string module)
    {
        var state=new ErpActionContext(module,"actor","synthetic",999,true,"other",null,0,true,true,
            new(true,false,false,false),false,NumberingQualified:false);
        Assert.Equal(ErpActionRules.Evaluate(state),ErpActionRules.ForDisplay(state));
        foreach(var action in ErpActionRules.ForDisplay(state))
        {
            var definition=ErpScreenCatalog.Get(module)!.Actions.Single(a=>a.Id==action.Id);
            if(definition.Operation!="contract-info"&&!definition.Operation.StartsWith("print",StringComparison.Ordinal))
            {Assert.False(action.Visible);Assert.False(action.Enabled);Assert.Null(action.Route);}
        }
        var screen=ErpScreenCatalog.Get(module)!;
        var displayed=ErpActionRules.ForDisplay(screen);
        Assert.Equal(screen.Fields.Keys,displayed.Fields.Keys);
        foreach(var section in screen.Fields)Assert.Equal(section.Value.Where(f=>!ErpVisibleFields.IsHidden(module,section.Key,f.Name)),displayed.Fields[section.Key]);
        var hidden=ErpActionRules.Permissions(screen,new(false,true,true,true));
        Assert.False(hidden.CanView);Assert.All(hidden.Actions,a=>{Assert.False(a.Visible);Assert.Null(a.Route);});
        Assert.Equal(new ErpCrudPermission(false,false,false,false),hidden.Crud);
    }
    [Theory]
    [InlineData("sales-orders",12)] [InlineData("purchase-requests",3)]
    [InlineData("internal-transfer-requests",10)] [InlineData("machine-movements",0)]
    public void Displayed_CUD_controls_follow_the_same_document_state_rules_as_writes(string module,int status)
    {
        var state=new ErpActionContext(module,"actor","synthetic",status,true,"actor",null,1,false,false,
            new(true,true,true,true),true);
        var save=ErpActionRules.ForDisplay(state).Single(a=>a.Id=="save");
        Assert.True(save.Visible);Assert.False(save.Enabled);Assert.Equal("state_or_assignment_not_allowed",save.Reason);
        Assert.Equal(ErpActionRules.Evaluate(state),ErpActionRules.ForDisplay(state));
        var editable=ErpActionRules.ForDisplay(state with{IsLocked=false,StatusId=module switch
            {"sales-orders"=>-1,"purchase-requests"=>1,"internal-transfer-requests"=>0,_=>status}}).Single(a=>a.Id=="save");
        Assert.True(editable.Enabled);Assert.Null(editable.Reason);
    }
    [Fact]
    public void Permission_controls_only_advertise_existing_web_routes()
    {
        var api=ApiContractCatalog.Build();var visible=0;
        foreach(var module in ErpScreenCatalog.ModuleIds)
        {
            var screen=ErpScreenCatalog.Get(module)!;
            var permissions=ErpActionRules.Permissions(screen,new(true,true,true,true));
            foreach(var action in permissions.Actions)
            {
                var definition=screen.Actions.Single(a=>a.Id==action.Id);
                Assert.Equal(definition.NativeVisible,action.Visible);
                if(!action.Visible){Assert.Null(action.Route);continue;}
                var method=definition.Operation=="contract-info"?"get":"post";
                Assert.NotNull(action.Route);
                Assert.True(api["paths"]![action.Route]?[method] is not null,module+"/"+action.Id+" route is missing");visible++;
                Assert.Equal(definition.RequiresSavedDocument,action.RequiresSavedDocument);
            }
        }
        Assert.Equal(87,visible);
    }
    [Theory]
    [InlineData(true,false,false,false)] [InlineData(true,true,false,false)]
    [InlineData(true,false,true,false)] [InlineData(true,false,false,true)] [InlineData(false,true,true,true)]
    public void CRUD_and_workflow_buttons_follow_the_corresponding_grant(bool read,bool add,bool update,bool delete)
    {
        var permission=ErpActionRules.Permissions(ErpScreenCatalog.Get("purchase-requests")!,new(read,add,update,delete));
        Assert.Equal(read,permission.CanView);
        Assert.Equal(new ErpCrudPermission(read,read&&add,read&&update,read&&delete),permission.Crud);
        foreach(var (id,allowed) in new[]{("create",add),("save",update),("delete",delete),("submit",update)})
            Assert.Equal(read&&allowed,permission.Actions.Single(a=>a.Id==id).Visible);
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
