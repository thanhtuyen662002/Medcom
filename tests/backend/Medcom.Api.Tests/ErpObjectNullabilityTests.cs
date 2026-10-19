using System.Data;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class ErpObjectNullabilityTests
{
    public static IEnumerable<object[]> Modules()=>new[]{"purchase-requests","purchase-approvals","purchase-orders","sales-orders","sales-order-pm","sales-order-sa"}.Select(m=>new object[]{m});
    [Theory]
    [MemberData(nameof(Modules))]
    public async Task Current_nullable_object_is_read_as_null_without_relaxing_identity_columns(string module)
    {
        var plan=ErpSqlPlan.Get(module)!;var fields=plan.Screen.Fields["header"];
        var historical=ErpScreenCatalog.Metadata(module).GetProperty("fields").GetProperty("header").EnumerateArray().Single(f=>f.GetProperty("column").GetString()=="ObjectID");
        Assert.False(historical.GetProperty("nullable").GetBoolean());
        Assert.True(fields.Single(f=>f.Column=="ObjectID").Nullable);
        using var table=new DataTable();
        foreach(var field in fields)table.Columns.Add(field.Column,field.SqlType switch
        {"datetime" or "date" or "datetime2"=>typeof(DateTime),"decimal" or "numeric" or "money" or "smallmoney"=>typeof(decimal),"int"=>typeof(int),"bit"=>typeof(bool),"float"=>typeof(double),_=>typeof(string)});
        table.Rows.Add(fields.Select(f=>f.Nullable?(object)DBNull.Value:f.SqlType switch
        {"datetime" or "date" or "datetime2"=>new DateTime(2026,10,19),"decimal" or "numeric" or "money" or "smallmoney"=>0m,"int"=>0,"bit"=>false,"float"=>1d,_=>"SYNTHETIC"}).ToArray());
        using var reader=table.CreateDataReader();Assert.True(await reader.ReadAsync());
        var row=await ErpSqlPlan.Row(reader,fields,default);Assert.Null(row["objectId"]);
        Assert.NotNull(row[plan.HeaderJsonKey]);Assert.False(fields.Single(f=>f.Column==plan.HeaderKey).Nullable);
    }
    [Theory]
    [InlineData("purchase-requests")][InlineData("purchase-orders")][InlineData("sales-orders")]
    public void Current_CUD_inputs_accept_an_omitted_or_explicit_null_object_but_reject_an_invalid_ID(string module)
    {
        var fields=ErpScreenCatalog.Get(module)!.Fields["header"].Where(f=>f.Writable&&(!f.Nullable||f.Name=="objectId"));
        var values=fields.ToDictionary(f=>f.Name,f=>f.Name=="objectId"?null:f.SqlType switch
        {"datetime" or "datetime2" or "date"=>(object)"2026-10-19T00:00:00.000","bit"=>false,"int"=>1,"float"=>1d,_=>f.SqlType is "decimal" or "numeric"?"0":"X"});
        Assert.True(ErpInputRules.Normalize(module,"header",ErpInputRules.Serialize(values),out var explicitNull));
        Assert.Equal(JsonValueKind.Null,explicitNull.GetProperty("objectId").ValueKind);
        values.Remove("objectId");Assert.True(ErpInputRules.Normalize(module,"header",ErpInputRules.Serialize(values),out _));
        values["objectId"]=" ";Assert.False(ErpInputRules.Normalize(module,"header",ErpInputRules.Serialize(values),out _));
    }
    [Fact]
    public void Evolution_does_not_change_unreviewed_columns_or_accept_a_different_historical_baseline()
    {
        Assert.False(ErpSchemaEvolution.Nullable("AP_PurchaseRequestTbl","PurchaseRequestID",false));
        Assert.False(ErpSchemaEvolution.Nullable("CF_ObjectTbl","ObjectID",false));
        Assert.Throws<InvalidOperationException>(()=>ErpSchemaEvolution.Nullable("AP_OrderTbl","ObjectID",true));
    }
}
