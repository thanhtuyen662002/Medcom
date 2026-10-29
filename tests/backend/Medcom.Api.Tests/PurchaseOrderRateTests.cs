using System.Text.Json;
using Medcom.Application;
using Xunit;

namespace Medcom.Api.Tests;

// ERP 29/10: AP_OrderFrm EBS/EBC calls CF_Document_ExchangeRateValidationFnc; a PO from a request without a dated rate carries 0.
public sealed class PurchaseOrderRateTests
{
    private static JsonElement J(string json)=>JsonDocument.Parse(json).RootElement;

    [Theory]
    [InlineData("\"USD\"","25000",true)] [InlineData("\"USD\"","\"24.5\"",true)] [InlineData("\"VND\"","1",true)] [InlineData("\" vnd \"","1.0",true)]
    [InlineData("\"USD\"","0",false)] [InlineData("\"USD\"","-3",false)] [InlineData("\"USD\"","null",false)] [InlineData("\"USD\"","\"x\"",false)]
    [InlineData("\"VND\"","25000",false)] [InlineData("\"VND\"","0",false)]
    public void A_saved_PO_rate_is_positive_and_VND_is_one(string currency,string rate,bool valid)
        =>Assert.Equal(valid,ErpCalculationRules.DocumentRate(J(currency),J(rate)));
}
