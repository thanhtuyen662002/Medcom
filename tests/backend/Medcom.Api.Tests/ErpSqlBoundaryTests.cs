using System.Data;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class ErpSqlBoundaryTests
{
    [Fact]
    public void Bare_native_lookup_procedure_remains_valid_after_the_rowcount_prefix()
    {
        var bound=ErpLookupSql.Bind("WA_OrderByContract_GetItemStp '{0}','{User}'",["ContractID"],["synthetic-contract"],"actor","B1");
        Assert.NotNull(bound);Assert.StartsWith("EXEC WA_OrderByContract_GetItemStp",bound.Text);
        Assert.Equal("synthetic-contract",bound.Parameters[0].Value);Assert.Equal("actor",bound.Parameters[1].Value);
        Assert.DoesNotContain("synthetic-contract",bound.Text);
    }
    [Theory]
    [InlineData("SELECT ItemID,ROW_NUMBER() OVER(ORDER BY ItemID) N FROM X ORDER BY ItemID", "SELECT ItemID,ROW_NUMBER() OVER(ORDER BY ItemID) N FROM X")]
    [InlineData("SELECT 'ORDER BY fake', [ORDER BY], \"ORDER BY\" FROM X ORDER BY ItemID;", "SELECT 'ORDER BY fake', [ORDER BY], \"ORDER BY\" FROM X")]
    [InlineData("SELECT OrderByColumn FROM X", "SELECT OrderByColumn FROM X")]
    [InlineData("DECLARE @a int; SELECT @a", null)]
    [InlineData("SELECT 1; SELECT 2", null)]
    [InlineData("SELECT (1", null)]
    public void Exact_key_lookup_strips_only_outer_ordering_and_rejects_multiple_batches(string source,string? expected)
        =>Assert.Equal(expected,ErpLookupSql.SelectExpression(source));
    [Theory]
    [InlineData("CF_QRcodeStp",0)]
    [InlineData("AR_OrderTbl_UpdateStatusStp",3)]
    [InlineData("IV_InternalTransfer_RequestSendPMStp",3)]
    public void Native_success_dialects_are_not_interchanged(string procedure,int expected)
        =>Assert.Equal(expected,SqlErpScreenCommands.NativeSuccessCode(procedure));
    [Fact]
    public void Receipt_normalization_is_stable_when_optional_nulls_are_omitted_and_fields_reordered()
    {
        var raw=JsonSerializer.SerializeToElement(new {payload=new {notes=(string?)null,pmId="synthetic-pm"},
            documentId="synthetic-document",branchId="B1",expectedStateToken=new string('a',64),idempotencyKey="synthetic-key"});
        var other=JsonSerializer.SerializeToElement(new {idempotencyKey="synthetic-key",branchId="B1",documentId="synthetic-document",
            expectedStateToken=new string('a',64),payload=new {pmId="synthetic-pm"}});
        Assert.True(ErpCommandRules.Freeze("sales-orders","send-pm",raw,out var first));
        Assert.True(ErpCommandRules.Freeze("sales-orders","send-pm",other,out var second));
        Assert.Equal(first!.OriginalIntent.GetRawText(),second!.OriginalIntent.GetRawText());
    }
    [Fact]
    public void Paste_validation_is_available_before_write_admission_and_respects_document_state()
    {
        var state=new ErpActionContext("sales-orders","actor",null,null,false,"actor",null,0,false,false,new(true,true,true,true),false);
        Assert.True(ErpActionRules.Evaluate(state).Single(a=>a.Id=="paste").Enabled);
        Assert.False(ErpActionRules.Evaluate(state with{DocumentId="synthetic",StatusId=12}).Single(a=>a.Id=="paste").Enabled);
        var print=ErpActionRules.Evaluate(state with{Module="purchase-requests",DocumentId="synthetic",StatusId=1}).First(a=>a.Id.StartsWith("print",StringComparison.Ordinal));
        Assert.False(print.Enabled);Assert.Null(print.Route);
    }
    [Fact]
    public async Task Full_row_conversion_preserves_nulls_and_decimal_strings()
    {
        var table=new DataTable();table.Columns.Add("Quantity",typeof(decimal));table.Columns.Add("Notes",typeof(string));
        table.Rows.Add(1.2300m,DBNull.Value);using var data=table.CreateDataReader();Assert.True(data.Read());
        var row=await ErpSqlPlan.Row(data,[new("quantity","Quantity","decimal","(28,4)",false,1,false,true),
            new("notes","Notes","nvarchar","(100)",true,2,false,true)],default);
        Assert.Equal("1.2300",row["quantity"]);Assert.True(row.ContainsKey("notes"));Assert.Null(row["notes"]);
    }
}
