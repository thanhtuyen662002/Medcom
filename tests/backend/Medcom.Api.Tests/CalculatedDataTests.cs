using System.Data;
using System.Data.Common;
using System.Text.Json;
using System.Text.Json.Nodes;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class CalculatedDataTests
{
    [Theory]
    [InlineData("sales-orders",3)] [InlineData("sales-order-pm",3)] [InlineData("sales-order-sa",3)]
    [InlineData("warehouse-qr",1)] [InlineData("sales-qr",1)] [InlineData("machine-movements",1)] [InlineData("machine-repairs",4)]
    public async Task Native_summaries_cover_all_document_rows_without_a_page_or_decimal_precision_loss(string module,int count)
    {
        var plan=ErpSqlPlan.Get(module)!;var fields=ErpCalculatedFields.Summary(module);
        Assert.Equal(count,fields.Count);var calls=0;
        await using var connection=new DisplayConnection(command=>
        {
            calls++;Assert.NotNull(command.Transaction);Assert.Contains("COUNT_BIG(*)",command.CommandText);
            Assert.Contains("WITH(HOLDLOCK)",command.CommandText);Assert.Contains("CONVERT(varbinary(max)",command.CommandText);
            Assert.DoesNotContain("OFFSET",command.CommandText);Assert.DoesNotContain("FETCH",command.CommandText);
            Assert.Equal("QA-DOC",command.Parameters["@document"].Value);Assert.Equal(DbType.String,command.Parameters["@document"].DbType);
            var t=Table(typeof(long),[..Enumerable.Repeat(typeof(string),count)]);
            t.Rows.Add(new object[]{501L}.Concat(Enumerable.Repeat<object>("99999999999999999999999999999999999999",count)).ToArray());return t.CreateDataReader();
        });
        await connection.OpenAsync();await using var transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        var summary=await SqlErpSummaries.Read(transaction,plan,"QA-DOC",default);
        Assert.Equal(501L,summary!["rowCount"]);Assert.Equal(1,calls);
        foreach(var field in fields)Assert.Equal("99999999999999999999999999999999999999",summary[field.Name]);
        var node=JsonSerializer.SerializeToNode(new{header=new{currencyId="USD"},summary})!;
        FeDisplayProjection.Apply(node,module,new Dictionary<ReferenceKey,ReferenceValue>());
        foreach(var field in fields.Where(f=>FeDisplayProjection.IsDisplay(f.Name)))
            Assert.EndsWith(".00 USD",node["summary"]![field.Name+"Display"]!.GetValue<string>());
        await transaction.RollbackAsync();
    }
    [Theory]
    [InlineData("empty")] [InlineData("missing")] [InlineData("extra-row")] [InlineData("extra-result")] [InlineData("shape")] [InlineData("negative-count")]
    public async Task Summary_nulls_and_malformed_results_are_not_substituted_with_invented_totals(string defect)
    {
        await using var connection=new DisplayConnection(_=>
        {
            var t=Table(typeof(long),typeof(string));
            if(defect!="missing")t.Rows.Add(defect=="negative-count"?-1L:0L,DBNull.Value);
            if(defect=="extra-row")t.Rows.Add(1L,"1");
            if(defect=="shape")t.Columns.Add("Unexpected",typeof(string));
            return defect=="extra-result"?new DataTableReader([t,t.Clone()]):t.CreateDataReader();
        });
        await connection.OpenAsync();await using var transaction=await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        if(defect=="empty")
        {
            var result=await SqlErpSummaries.Read(transaction,ErpSqlPlan.Get("warehouse-qr")!,"QA-DOC",default);
            Assert.Equal(0L,result!["rowCount"]);Assert.Null(result["quantity"]);
        }
        else await Assert.ThrowsAsync<InvalidOperationException>(()=>SqlErpSummaries.Read(transaction,ErpSqlPlan.Get("warehouse-qr")!,"QA-DOC",default));
        await transaction.RollbackAsync();
    }
    [Fact]
    public void Only_source_configured_forms_have_summary_and_PO_removed_money_is_not_reintroduced()
    {
        Assert.Equal(7,ErpScreenCatalog.ModuleIds.Count(m=>ErpCalculatedFields.Summary(m).Count>0));
        Assert.Empty(ErpCalculatedFields.Summary("purchase-orders"));Assert.Null(SqlErpSummaries.Text(ErpSqlPlan.Get("purchase-orders")!));
    }
    [Theory]
    [InlineData("purchase-orders","1.5","2","3")]
    [InlineData("purchase-orders","-10","1.5","-15")]
    [InlineData("purchase-orders",null,"2",null)]
    [InlineData("inbound-requests","2","3","12")]
    public void Rate_derived_amount_uses_the_active_source_expression_and_keeps_null_propagation(string module,string? source,string rate,string? expected)
    {
        var row=new Dictionary<string,object?>{{"sourceAmount",source},{"setQuantityByDocument",source},{"unitPrice","2"}};
        Assert.True(ErpCalculationRules.RateAmount(module,row,ErpInputRules.Serialize(rate),out var actual));
        Assert.Equal(expected,actual is null?null:decimal.Parse(actual,System.Globalization.CultureInfo.InvariantCulture).ToString(System.Globalization.CultureInfo.InvariantCulture));
    }
    [Fact]
    public void Rate_overflow_is_rejected_without_truncating_or_wrapping()
    {
        var row=new Dictionary<string,object?>{{"sourceAmount","99999999999999999999999999999"}};
        Assert.False(ErpCalculationRules.RateAmount("purchase-orders",row,ErpInputRules.Serialize("999"),out _));
        Assert.False(ErpCalculationRules.RateAmount("sales-orders",row,ErpInputRules.Serialize("1"),out _));
    }
    [Theory]
    [InlineData("purchase-orders")] [InlineData("inbound-requests")]
    public async Task Rate_change_updates_only_unchanged_remaining_lines_in_one_parameterized_scoped_write(string module)
    {
        var plan=ErpSqlPlan.Get(module)!;var calls=0;
        var lines=new[]{"keep","touched","removed"}.Select(id=>new ErpLineRow(id,new Dictionary<string,object?>
            {{"sourceAmount","3"},{"setQuantityByDocument","3"},{"unitPrice","2"}})).ToArray();
        var before=new ErpReadSnapshot(plan,"QA-A","QA-DOC",new Dictionary<string,object?>{{"rateExchange",1d}},lines,false);
        var header=new Dictionary<string,JsonElement>{{"rateExchange",ErpInputRules.Serialize(2d)}};
        var raw=ErpInputRules.Serialize(new{});
        var request=new ErpFrozenCommand(module,"save","key","QA-A","QA-DOC",new string('a',64),null,
            [new(ErpLineChangeKind.Update,"touched",null,raw)],raw,null,raw);
        var remaining=lines.Where(l=>l.LineId!="removed").ToDictionary(l=>l.LineId,l=>l.Fields);
        await using var connection=new DisplayConnection(_=>throw new InvalidOperationException("Unexpected read"),command=>
        {
            calls++;Assert.Equal(3,command.Parameters.Count);Assert.Equal("keep",command.Parameters["@line0"].Value);
            Assert.Equal(module=="purchase-orders"?6m:12m,command.Parameters["@amount0"].Value);
            Assert.Equal("QA-DOC",command.Parameters["@document"].Value);Assert.Contains("CONVERT(varbinary(max)",command.CommandText);
            Assert.DoesNotContain("SourceAmount]=",command.CommandText);Assert.NotNull(command.Transaction);return 1;
        });
        await connection.OpenAsync();await using var tx=await connection.BeginTransactionAsync(IsolationLevel.Serializable);
        await SqlErpScreenCommands.RevalueUnchangedLines(tx,plan,request,"QA-DOC",before,header,remaining,default);Assert.Equal(1,calls);
        header["rateExchange"]=ErpInputRules.Serialize(1d);
        await SqlErpScreenCommands.RevalueUnchangedLines(tx,plan,request,"QA-DOC",before,header,remaining,default);Assert.Equal(1,calls);
        await tx.RollbackAsync();
    }
    [Theory]
    [InlineData(null,"10")] [InlineData("999","10")]
    public void Legacy_purchase_total_is_derived_without_changing_the_submitted_intent(string? submitted,string expected)
    {
        var input=PurchaseFixtures.Values with{TotalPrice=submitted};var bytes=PurchaseRequestCommandRules.IntentBytes(input);
        Assert.True(PurchaseRequestCommandRules.CalculateLine(input,out var result));Assert.Equal(expected,result.TotalPrice);
        Assert.Equal(bytes,PurchaseRequestCommandRules.IntentBytes(input));Assert.Equal(submitted,input.TotalPrice);
        Assert.False(PurchaseRequestCommandRules.CalculateLine(input with{Quantity="999999999999999999",UnitPrice="999999999999999999"},out _));
    }
    private static DataTable Table(Type first,params Type[] rest)
    {var t=new DataTable();t.Columns.Add("C0",first);for(var i=0;i<rest.Length;i++)t.Columns.Add("C"+(i+1),rest[i]);return t;}
}
