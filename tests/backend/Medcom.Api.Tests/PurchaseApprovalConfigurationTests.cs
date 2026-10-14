using System.Data;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseApprovalConfigurationTests
{
    private const string CurrentHash="ab018e267556cc5530ca3b5d049e151bd3c75c2c9277357dce6d8a9e22d1cf41";
    private const string PreviousHash="7f6d00e492158f3a93a4566fdd17b9d41dcd0a762ad0a22d1eed17f7d863eadc";

    [Theory]
    [InlineData("current")] [InlineData("old")] [InlineData("unknown")]
    [InlineData("missing")] [InlineData("extra")] [InlineData("duplicate")] [InlineData("null")]
    public async Task Reviewed_approval_button_passes_without_accepting_other_form_drift(string mutation)
    {
        var metadata=ErpScreenCatalog.Metadata("purchase-approvals");
        var buttons=metadata.GetProperty("buttons").EnumerateArray().ToArray();
        Assert.Equal(CurrentHash,buttons.Single(b=>b.GetProperty("operation").GetString()=="approve")
            .GetProperty("checkSha256Utf16LE").GetString());
        Assert.Equal(PreviousHash,buttons.Single(b=>b.GetProperty("operation").GetString()=="reject")
            .GetProperty("checkSha256Utf16LE").GetString());
        var table=new DataTable();
        foreach(var name in new[]{"KeyID","SubID","SubValue","Hash"})table.Columns.Add(name,typeof(string));
        table.Columns.Add("IsNull",typeof(int));
        foreach(var row in metadata.GetProperty("configuration").EnumerateArray())
            table.Rows.Add(row.GetProperty("key").GetString(),row.GetProperty("control").GetString(),
                row.GetProperty("property").GetString(),row.GetProperty("sha256Utf16LE").GetString(),row.GetProperty("valueIsNull").GetBoolean()?1:0);
        Assert.Equal(58,table.Rows.Count);
        var guard=Assert.Single(table.Rows.Cast<DataRow>(),r=>(string)r[0]=="LYS1"
            &&(string)r[1]=="ExecSQLWithParaButtonCtl_1"&&(string)r[2]=="CS4");
        Assert.Equal(CurrentHash,guard[3]);
        if(mutation=="old")guard[3]=PreviousHash;
        if(mutation=="unknown")guard[3]=new string('a',64);
        if(mutation=="null")guard[4]=1;
        if(mutation=="missing")table.Rows.Remove(guard);
        if(mutation=="duplicate")table.Rows.Add(guard.ItemArray);
        if(mutation=="extra")table.Rows.Add("UNKNOWN","UNKNOWN","CS4",CurrentHash,0);
        using var connection=new DisplayConnection(command=>
        {
            Assert.Equal("AP_ApprovePurchaseRequestListFrm",command.Parameters["@form"].Value);
            return table.CreateDataReader();
        });
        connection.Open();using var transaction=connection.BeginTransaction(IsolationLevel.Serializable);
        var verify=()=>SqlErpScreenCommands.VerifyScreenConfiguration(transaction,ErpSqlPlan.Get("purchase-approvals")!,default);
        if(mutation=="current")await verify();else await Assert.ThrowsAnyAsync<Exception>(verify);
    }

    [Theory]
    [InlineData(1,false)] [InlineData(2,true)] [InlineData(3,false)] [InlineData(4,false)] [InlineData(5,false)]
    public void Reviewed_draft_restriction_keeps_command_admission_pending_only(int status,bool allowed)
    {
        var state=new ErpActionContext("purchase-approvals","actor","synthetic",status,false,
            "actor",null,1,false,false,new(true,true,true,true),true);
        Assert.Equal(allowed,ErpActionRules.StateAllows(state,"approve"));
        Assert.Equal(allowed,ErpActionRules.StateAllows(state,"reject"));
        Assert.False(ErpActionRules.StateAllows(state,"save"));
    }
}
