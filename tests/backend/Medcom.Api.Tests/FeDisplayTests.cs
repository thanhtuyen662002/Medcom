using System.Data;
using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class FeDisplayTests
{
    [Theory]
    [InlineData("1234.5","VND","1,235 VND")]
    [InlineData("1234","USD","1,234.00 USD")]
    [InlineData("-1234.005","USD","-1,234.01 USD")]
    [InlineData("0.0049","USD","0.00 USD")]
    [InlineData("-0.1","VND","0 VND")]
    [InlineData("99999999999999999999999999999999999999.995","USD","100,000,000,000,000,000,000,000,000,000,000,000,000.00 USD")]
    [InlineData("1.234e3","USD","1,234.00 USD")]
    [InlineData("1,234","USD",null)]
    [InlineData("1234",null,null)]
    [InlineData("1234","EUR",null)]
    public void Money_formats_exact_digits_and_rounding_without_culture_or_float_loss(string raw,string? currency,string? expected)
    {
        var before=CultureInfo.CurrentCulture;
        try{CultureInfo.CurrentCulture=CultureInfo.GetCultureInfo("vi-VN");Assert.Equal(expected,FeDisplayProjection.FormatMoney(raw,currency));}
        finally{CultureInfo.CurrentCulture=before;}
    }
    [Theory]
    [InlineData("2026-10-11","11/10/2026")]
    [InlineData("2026-10-11T13:24:56.997","11/10/2026 13:24:56")]
    [InlineData("2026-10-11T00:00:00","11/10/2026 00:00:00")]
    [InlineData("2026-02-30",null)]
    [InlineData("2026-10-11T13:24:56Z",null)]
    public void Calendar_dates_are_Vietnamese_without_guessing_SQL_timezone(string raw,string? expected)
        =>Assert.Equal(expected,FeDisplayProjection.FormatDate(raw));
    [Fact]
    public void Names_and_displays_are_added_to_every_page_row_without_altering_raw_values_or_existing_names()
    {
        var original=JsonNode.Parse("""{"data":{"header":{"documentId":"DOC","currencyId":"USD","statusId":12,"branchId":"B"},"lines":{"page":2,"pageSize":1,"hasMore":true,"rows":[{"lineId":"L","fields":{"itemId":"I","unitPrice":"1234.005","storeHouseId":"S","notes":"2026-10-11","documentDate":"2026-10-11T13:24:56.997"}}]}}}""")!;
        var before=original.DeepClone();
        var names=new Dictionary<ReferenceKey,ReferenceValue>
        {
            [new("item","I")]=new("Tên hàng","available",new Dictionary<string,string?>{{"ItemCode","CODE"},{"Unit","Cái"}}),
            [new("store","S")]=new("Kho","available",new Dictionary<string,string?>()),
            [new("status:sales-orders","12")]=new("Chờ PM","available",new Dictionary<string,string?>()),
            [new("branch","B")]=new("Chi nhánh","available",new Dictionary<string,string?>())
        };
        FeDisplayProjection.Apply(original,"sales-orders",names);
        var row=original["data"]!["lines"]!["rows"]![0]!["fields"]!;
        Assert.Equal("CODE",row["itemCode"]!.GetValue<string>());Assert.Equal("Tên hàng",row["itemName"]!.GetValue<string>());
        Assert.Equal("Cái",row["unit"]!.GetValue<string>());Assert.Equal("Kho",row["storeHouseName"]!.GetValue<string>());
        Assert.Equal("1,234.01 USD",row["unitPriceDisplay"]!.GetValue<string>());
        Assert.Equal("11/10/2026 13:24:56",row["documentDateDisplay"]!.GetValue<string>());
        Assert.Null(row["notesDisplay"]);Assert.Equal("Chờ PM",original["data"]!["header"]!["statusName"]!.GetValue<string>());
        foreach(var (raw,_,_) in FeDisplayProjection.Rows(before,"sales-orders"))
        {
            // Compare against the corresponding row through a recursive raw-field check below.
            Assert.NotEmpty(raw);
        }
        Retains(before,original);
        var snapshot=JsonNode.Parse("""{"ItemID":"I","ItemCode":null,"ItemName":"Tên lịch sử","Unit":"Bộ"}""")!;
        FeDisplayProjection.Apply(snapshot,"sales-orders",names);
        Assert.Equal("CODE",snapshot["ItemCode"]!.GetValue<string>());Assert.Equal("Tên lịch sử",snapshot["ItemName"]!.GetValue<string>());
        Assert.Equal("Bộ",snapshot["Unit"]!.GetValue<string>());
    }
    private static void Retains(JsonNode? raw,JsonNode? projected)
    {
        if(raw is JsonObject obj)foreach(var field in obj)Retains(field.Value,projected![field.Key]);
        else if(raw is JsonArray array)for(var i=0;i<array.Count;i++)Retains(array[i],projected![i]);
        else Assert.True(JsonNode.DeepEquals(raw,projected));
    }
    [Fact]
    public void ERP_fees_promotion_totals_budget_and_cost_get_currency_displays_without_formatting_rates_or_quantities()
    {
        var row=JsonNode.Parse("""{"CurrencyID":"USD","Budget":"1234.005","PhiKhac":"1234.005","PhiVanChuyen":"1234.005","SoTienKM":"1234.005","TongTienNhom1":"1234.005","TongTienNhom2":"1234.005","TongTienNhomFyto":"1234.005","UnitCost":1234.005,"Quantity":1234.005,"RateExchange":1234.005,"DiscountPercent":12.345}""")!;
        var before=row.DeepClone();FeDisplayProjection.Apply(row,"sales-qr",new Dictionary<ReferenceKey,ReferenceValue>());
        foreach(var field in new[]{"Budget","PhiKhac","PhiVanChuyen","SoTienKM","TongTienNhom1","TongTienNhom2","TongTienNhomFyto","UnitCost"})
            Assert.Equal("1,234.01 USD",row[field+"Display"]!.GetValue<string>());
        foreach(var field in new[]{"Quantity","RateExchange","DiscountPercent"})Assert.Null(row[field+"Display"]);
        Retains(before,row);
    }
    [Fact]
    public void Status_names_use_document_kind_including_notification_rows_and_contracts()
    {
        var node=JsonNode.Parse("""{"rows":[{"erpFormName":"AR_OrderByContractFrm","statusId":12},{"erpFormName":"AR_Invoice_QRCodeFrm","statusId":12},{"erpFormName":"UNKNOWN","statusId":12}]}""")!;
        Assert.Equal(new[]{new ReferenceKey("status:sales-orders","12"),new ReferenceKey("status:sales-qr","12")},FeDisplayProjection.Collect(node,null));
        FeDisplayProjection.Apply(node,null,new Dictionary<ReferenceKey,ReferenceValue>());
        Assert.Null(node["rows"]![2]!["statusName"]);Assert.Equal("unknown",node["rows"]![2]!["statusReferenceState"]!.GetValue<string>());
    }
    [Fact]
    public void Binding_queries_are_batched_exact_and_never_accept_caller_SQL_identifiers()
    {
        var binding=ApiReferenceCatalog.Get("item")!;var text=SqlReferenceData.BatchText(binding,100);
        Assert.Contains("TOP(2)",text);Assert.Contains("CONVERT(varbinary(max)",text);Assert.Contains("@k99",text);
        Assert.Throws<InvalidOperationException>(()=>SqlReferenceData.BatchText(binding with{Table="CF_ItemTbl; DROP TABLE X"},1));
        Assert.Throws<InvalidOperationException>(()=>SqlReferenceData.BatchText(binding,101));
    }
    [Fact]
    public async Task Corrupt_duplicate_reference_never_chooses_a_name_or_multiplies_parent_rows()
    {
        var table=new DataTable();table.Columns.Add("Ordinal",typeof(int));table.Columns.Add("StoreHouseID",typeof(string));table.Columns.Add("StoreHouseName",typeof(string));
        table.Rows.Add(0,"S","Name one");table.Rows.Add(0,"S","Name two");table.Rows.Add(1,DBNull.Value,DBNull.Value);
        await using var connection=new DisplayConnection(_=>table.CreateDataReader());await connection.OpenAsync();
        await using var transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        var keys=new[]{new ReferenceKey("store","S"),new ReferenceKey("store","MISSING")};
        var result=await SqlReferenceData.ReadBatch(transaction,ApiReferenceCatalog.Get("store")!,keys,default);
        Assert.Equal(2,result.Count);Assert.Equal("ambiguous",result[keys[0]].State);Assert.Null(result[keys[0]].Name);
        Assert.Equal("missing",result[keys[1]].State);await transaction.RollbackAsync();
    }
    [Fact]
    public async Task Branch_route_is_authenticated_paged_and_rejects_caller_grants()
    {
        var source=new Names();await using var fixture=await PurchaseHttpFixture.Start(s=>s.AddSingleton<IReferenceData>(source));
        using(var anonymous=await fixture.Client.GetAsync("/api/lookups/branches"))Assert.Equal(HttpStatusCode.Unauthorized,anonymous.StatusCode);
        await fixture.Login();var data=await fixture.Json("/api/lookups/branches?page=2&pageSize=1&search=Chi");
        Assert.Equal((2,1,"Chi"),source.Query);Assert.Equal("B2",data.GetProperty("data").GetProperty("items")[0].GetProperty("branchId").GetString());
        Assert.Equal("Chi nhánh 2",data.GetProperty("data").GetProperty("items")[0].GetProperty("branchName").GetString());
        using(var forged=await fixture.Client.GetAsync("/api/lookups/branches?branchId=FOREIGN"))Assert.Equal(HttpStatusCode.BadRequest,forged.StatusCode);
    }
    [Fact]
    public async Task HTTP_read_gets_names_and_dates_but_no_display_value_is_accepted_as_a_write_field()
    {
        var source=new Names();await using var fixture=await PurchaseHttpFixture.Start(s=>s.AddSingleton<IReferenceData>(source));
        fixture.Source.Seed();await fixture.Login();var response=await fixture.Json("/api/purchase-requests/detail?documentId=QA-DOC");
        var fields=response.GetProperty("data").GetProperty("sourceFields").GetProperty("lines")[0];
        Assert.Equal("CODE",fields.GetProperty("itemCode").GetString());Assert.Equal("Tên hàng",fields.GetProperty("itemName").GetString());
        Assert.Contains(source.Keys,x=>x.Binding=="item");
        using var raw=JsonDocument.Parse("""{"itemId":"I","quantity":"1","unit":"Cái","itemName":"Name"}""");
        Assert.False(ErpInputRules.Normalize("purchase-requests","lines",raw.RootElement,out _));
        var document=response.GetProperty("data").GetProperty("document");
        Assert.False(document.GetProperty("header").TryGetProperty("purchaseDateDisplay",out _));
        Assert.True(document.GetProperty("headerDisplayData").TryGetProperty("purchaseDateDisplay",out _));
        Assert.NotNull(document.GetProperty("header").Deserialize<PurchaseRequestHeaderInput>(new JsonSerializerOptions(JsonSerializerDefaults.Web)));
    }
    [Fact]
    public async Task Nullable_item_name_does_not_discard_its_code_or_unit()
    {
        var table=new DataTable();table.Columns.Add("Ordinal",typeof(int));table.Columns.Add("ItemID",typeof(string));table.Columns.Add("ItemName",typeof(string));
        table.Columns.Add("ItemCode",typeof(string));table.Columns.Add("Unit",typeof(string));table.Rows.Add(0,"I",DBNull.Value,"CODE","Cái");
        await using var connection=new DisplayConnection(_=>table.CreateDataReader());await connection.OpenAsync();
        await using var transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        var key=new ReferenceKey("item","I");var values=await SqlReferenceData.ReadBatch(transaction,ApiReferenceCatalog.Get("item")!,[key],default);
        Assert.Equal("unnamed",values[key].State);Assert.Null(values[key].Name);Assert.Equal("CODE",values[key].Extra["ItemCode"]);
        var row=JsonNode.Parse("""{"itemId":"I"}""")!;FeDisplayProjection.Apply(row,"purchase-requests",values);
        Assert.Equal("Cái",row["unit"]!.GetValue<string>());Assert.Equal("CODE",row["itemCode"]!.GetValue<string>());
        await transaction.RollbackAsync();
    }
    private sealed class Names:IReferenceData
    {
        internal (int,int,string?) Query;internal IReadOnlyList<ReferenceKey> Keys=[];
        public Task<ErpReadResult<IReadOnlyDictionary<ReferenceKey,ReferenceValue>>> ReadAsync(IReadOnlyList<ReferenceKey> keys,CancellationToken token)
        {Keys=keys;return Task.FromResult(new ErpReadResult<IReadOnlyDictionary<ReferenceKey,ReferenceValue>>(ErpReadOutcome.Success,keys.ToDictionary(x=>x,x=>new ReferenceValue(x.Binding=="item"?"Tên hàng":"Tên","available",new Dictionary<string,string?>{{"ItemCode","CODE"},{"Unit","Cái"}}))));}
        public Task<ErpReadResult<BranchChoicePage>> BranchesAsync(int page,int size,string? search,CancellationToken token)
        {Query=(page,size,search);return Task.FromResult(new ErpReadResult<BranchChoicePage>(ErpReadOutcome.Success,new([new("B2","Chi nhánh 2")],page,size,true)));}
    }
}
