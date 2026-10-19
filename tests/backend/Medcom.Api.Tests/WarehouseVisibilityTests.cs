using System.Text.Json;
using System.Text.Json.Nodes;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class WarehouseVisibilityTests
{
    [Fact]
    public void Contract_information_formats_its_own_money_fields_without_changing_raw_values_or_quantities()
    {
        var raw=JsonNode.Parse("""{"documentId":"D","contractId":"C","fields":{"CurrencyID":"USD","ContractAmount":"1234.5","CreditLimit":"9999","CurrentBalance":"-1234.005","Quantity":"12","RateExchange":25000}}""")!;
        FeDisplayProjection.Apply(raw,"sales-orders",new Dictionary<ReferenceKey,ReferenceValue>());
        var result=CanonicalResponseProjection.Normalize(raw,"/api/erp/sales-orders/contract-info")["contract"]!;
        Assert.Equal("1,234.50 USD",result["ContractAmountDisplay"]!.GetValue<string>());
        Assert.Equal("9,999.00 USD",result["CreditLimitDisplay"]!.GetValue<string>());
        Assert.Equal("-1,234.01 USD",result["CurrentBalanceDisplay"]!.GetValue<string>());
        Assert.Equal("1234.5",result["ContractAmount"]!.GetValue<string>());
        Assert.Null(result["QuantityDisplay"]);Assert.Null(result["RateExchangeDisplay"]);
    }
    [Theory]
    [InlineData("warehouse-qr")][InlineData("sales-qr")]
    public void QR_add_and_remove_use_native_update_rights_and_advertise_the_registered_scan_routes(string module)
    {
        var screen=ErpScreenCatalog.Get(module)!;
        var rights=new ErpNativeRights(true,false,true,false);
        var permission=ErpActionRules.Permissions(screen,rights);
        Assert.Equal(new ErpCrudPermission(true,true,true,true),permission.Crud);
        Assert.Equal("/api/erp/"+module+"/qr/add",permission.Actions.Single(a=>a.Id=="scan-add").Route);
        Assert.Equal("/api/erp/"+module+"/qr/delete",permission.Actions.Single(a=>a.Id=="scan-delete").Route);
        var locked=new ErpActionContext(module,"actor","doc",0,true,"actor",null,1,false,false,rights,true);
        Assert.All(ErpActionRules.ForDisplay(locked).Where(a=>a.Id.StartsWith("scan-",StringComparison.Ordinal)),a=>Assert.True(a.Enabled));
        Assert.All(ErpActionRules.Evaluate(locked).Where(a=>a.Id.StartsWith("scan-",StringComparison.Ordinal)),a=>Assert.False(a.Enabled));
        Assert.Equal(new ErpCrudPermission(true,false,false,false),ErpActionRules.Permissions(screen,new(true,true,false,true)).Crud);
    }
    [Theory]
    [InlineData("inbound-requests")][InlineData("internal-transfer-requests")][InlineData("internal-transfer-batches")]
    public void All_document_CUD_routes_are_available_when_native_rights_allow_them(string module)
    {
        var permission=ErpActionRules.Permissions(ErpScreenCatalog.Get(module)!,new(true,true,true,true));
        Assert.Equal(new ErpCrudPermission(true,true,true,true),permission.Crud);
        foreach(var operation in new[]{"create","save","delete"})Assert.Equal("/api/erp/"+module+"/"+operation,permission.Actions.Single(a=>a.Id==operation).Route);
    }
    [Theory]
    [InlineData("warehouse-qr")][InlineData("machine-repairs")]
    public void Native_forms_without_currency_use_owner_selected_VND_and_explicit_currency_still_wins(string module)
    {
        var row=JsonNode.Parse("""{"data":{"header":{"documentId":"D"},"lines":{"rows":[{"unitPrice":"1234.50","quantity":"1234.50"}]},"summary":{"amount":"1234.50"}}}""")!;
        FeDisplayProjection.Apply(row,module,new Dictionary<ReferenceKey,ReferenceValue>());
        Assert.Equal("1,235 VND",row["data"]!["lines"]!["rows"]![0]!["unitPriceDisplay"]!.GetValue<string>());
        Assert.Equal("1,235 VND",row["data"]!["summary"]!["amountDisplay"]!.GetValue<string>());
        Assert.Null(row["data"]!["lines"]!["rows"]![0]!["quantityDisplay"]);
        row["data"]!["header"]!["currencyId"]="usd ";FeDisplayProjection.Apply(row,module,new Dictionary<ReferenceKey,ReferenceValue>());
        Assert.Equal("1,234.50 USD",row["data"]!["lines"]!["rows"]![0]!["unitPriceDisplay"]!.GetValue<string>());
    }
    [Fact]
    public void Hidden_columns_are_section_specific_and_do_not_remove_protocol_status_or_item_names()
    {
        var root=JsonNode.Parse("""{"data":{"stateToken":"unchanged","header":{"documentId":"D","branchId":"B","statusId":70,"statusName":"S","statusForeColor":"#000000","statusBackColor":"#FFFFFF","isLocked":false,"fromBranchId":"HIDDEN","fromBranchName":"HIDDEN","fromBranchReferenceState":"available","notes":"visible"},"lines":{"page":2,"rows":[{"lineId":"L","itemId":"I","itemName":"Item","techNotes":"HIDDEN","actualIssueQty":"2","actualReceiveQty":"HIDDEN"}]}}}""")!;
        ErpVisibleProjection.Apply(root,"/api/erp/internal-transfer-warehouse-out/detail");
        var data=root["data"]!;var header=data["header"]!;var line=data["lines"]!["rows"]![0]!;
        foreach(var key in new[]{"fromBranchId","fromBranchReferenceState"})Assert.Null(header[key]);
        Assert.NotNull(header["fromBranchName"]);
        foreach(var key in new[]{"documentId","branchId","statusId","statusName","statusForeColor","statusBackColor","isLocked"})Assert.NotNull(header[key]);
        Assert.NotNull(line["lineId"]);Assert.NotNull(line["itemName"]);Assert.NotNull(line["actualIssueQty"]);
        Assert.Null(line["techNotes"]);Assert.Null(line["actualReceiveQty"]);Assert.Equal(2,data["lines"]!["page"]!.GetValue<int>());
        Assert.Equal("unchanged",data["stateToken"]!.GetValue<string>());
    }
    [Fact]
    public void Omitted_hidden_values_are_preserved_on_save_and_explicit_null_is_distinct_and_replay_stable()
    {
        const string module="inbound-requests";var plan=ErpSqlPlan.Get(module)!;
        var source=CanonicalErpHttpTests.SyntheticScreens.Fields(module,"header");
        var visible=source.Where(p=>plan.Screen.Fields["header"].Any(f=>f.Name==p.Key&&f.Writable)&&!ErpVisibleFields.IsHidden(module,"header",p.Key)).ToDictionary(p=>p.Key,p=>p.Value);
        var save=new ErpSaveRequest("synthetic-save","B1","D",new string('a',64),ErpInputRules.Serialize(visible),[]);
        Assert.True(ErpCommandRules.Freeze(module,"save",ErpInputRules.Serialize(save),out var frozen));
        Assert.False(frozen!.Header!.Value.TryGetProperty("damageDescription",out _));
        var values=frozen.Header.Value.EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value.Clone());
        SqlErpScreenCommands.RestoreHidden(plan,"header",values,source);
        Assert.Equal(JsonSerializer.Serialize(source["damageDescription"]),values["damageDescription"].GetRawText());
        Assert.True(ErpCommandRules.Freeze(module,"save",frozen.OriginalIntent,out var replay));
        Assert.True(JsonElement.DeepEquals(frozen.OriginalIntent,replay!.OriginalIntent));
        visible["damageDescription"]=null;
        Assert.True(ErpCommandRules.Freeze(module,"save",ErpInputRules.Serialize(save with{Header=ErpInputRules.Serialize(visible)}),out var clear));
        Assert.False(JsonElement.DeepEquals(frozen.OriginalIntent,clear!.OriginalIntent));
        var clearing=clear.Header!.Value.EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value.Clone());
        SqlErpScreenCommands.RestoreHidden(plan,"header",clearing,source);Assert.Equal(JsonValueKind.Null,clearing["damageDescription"].ValueKind);
    }
}
