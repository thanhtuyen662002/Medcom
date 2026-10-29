using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Xunit;

namespace Medcom.Api.Tests;

// ERP 29/10 (src/helps/content/technical/purchasing.md): optional line price, no request rate, draft-only delete.
public sealed class PurchaseRequestOptionalPriceTests
{
    private static PurchaseRequestHeaderInput Header(double? rate)=>new("2026-10-29T00:00:00.000",null,"QA","QA",null,null,null,"USD",null,rate);
    private static PurchaseRequestLineValues Line(string? price)=>new("QA-ITEM",null,null,"3",price,null,null);
    private static CreatePurchaseRequestDraft Create(string? price)=>new("crt-qa-1","B1",Header(null),[new("line-qa-1",Line(price))]);

    [Fact]
    public void A_request_saves_without_a_rate_and_without_a_unit_price()
    {
        var frozen=PurchaseRequestCommandRules.Freeze(Create(null));
        Assert.Null(frozen.Header.RateExchange);
        Assert.Null(frozen.Lines.Single().Values.UnitPrice);
        Assert.True(PurchaseRequestCommandRules.CalculateLine(frozen.Lines.Single().Values,out var calculated));
        Assert.Null(calculated.TotalPrice);
        Assert.Equal(2.5,PurchaseRequestCommandRules.Header(Header(2.5)).RateExchange);
    }

    [Fact]
    public void A_negative_unit_price_is_rejected_but_zero_is_kept()
    {
        Assert.Throws<ArgumentException>(()=>PurchaseRequestCommandRules.Freeze(Create("-1")));
        Assert.Equal("0",PurchaseRequestCommandRules.Freeze(Create("0")).Lines.Single().Values.UnitPrice);
        Assert.True(PurchaseRequestCommandRules.CalculateLine(Line("4"),out var calculated));
        Assert.Equal("12",calculated.TotalPrice);
    }

    [Theory]
    [InlineData(1,false,false,true)] [InlineData(1,true,false,false)] [InlineData(1,false,true,false)]
    [InlineData(4,false,false,false)] [InlineData(2,false,false,false)] [InlineData(5,false,false,false)]
    public void Delete_follows_the_ERP_draft_trigger(int status,bool locked,bool linkedToPo,bool allowed)
    {
        var state=new ErpActionContext("purchase-requests","actor","QA-PR",status,locked,"actor",null,1,linkedToPo,false,
            new(true,true,true,true),true);
        Assert.Equal(allowed,ErpActionRules.StateAllows(state,"delete"));
        // Rejected requests (4) can still be edited and resubmitted.
        if(status==4&&!locked)Assert.True(ErpActionRules.StateAllows(state,"save"));
    }

    [Fact]
    public void The_reviewed_schema_evolution_makes_the_request_rate_and_line_price_optional()
    {
        Assert.True(ErpSchemaEvolution.Nullable("AP_PurchaseRequestTbl","RateExchange",false));
        Assert.True(ErpSchemaEvolution.Nullable("AP_PurchaseRequestDetailTbl","UnitPrice",false));
        Assert.Throws<InvalidOperationException>(()=>ErpSchemaEvolution.Nullable("AP_PurchaseRequestTbl","RateExchange",true));
    }
}
