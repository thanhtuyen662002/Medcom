using System.Globalization;
using System.Text.Json;
using Medcom.Contracts;
namespace Medcom.Application;

public static class ErpCalculationRules
{
    public static bool RateAmount(string module,IReadOnlyDictionary<string,object?> row,JsonElement rate,out string? amount)
    {
        amount=null;
        if(module is not ("purchase-orders" or "inbound-requests"))return false;
        try
        {
            decimal? Number(object? value)=>value switch
            {
                null=>null,JsonElement {ValueKind:JsonValueKind.Null}=>null,
                JsonElement {ValueKind:JsonValueKind.String} json=>decimal.Parse(json.GetString()!,CultureInfo.InvariantCulture),
                JsonElement json=>checked((decimal)json.GetDouble()),string text=>decimal.Parse(text,CultureInfo.InvariantCulture),
                _=>Convert.ToDecimal(value,CultureInfo.InvariantCulture)
            };
            var source=module=="purchase-orders"?Number(row.GetValueOrDefault("sourceAmount")):
                checked(Number(row.GetValueOrDefault("setQuantityByDocument"))*Number(row.GetValueOrDefault("unitPrice")));
            var value=checked(source*Number(rate));
            var field=ErpScreenCatalog.Get(module)!.Fields["lines"].Single(f=>f.Name=="amount");
            var scale=int.Parse(field.TypeArguments!.Trim('(',')').Split(',')[1],CultureInfo.InvariantCulture);
            amount=value is null?null:decimal.Round(value.Value,scale,MidpointRounding.AwayFromZero).ToString(CultureInfo.InvariantCulture);
            return ErpInputRules.Value(field,ErpInputRules.Serialize(amount));
        }
        catch(Exception error)when(error is OverflowException or FormatException or InvalidOperationException or ArgumentException)
        {amount=null;return false;}
    }
    // CF_Document_ExchangeRateValidationFnc (ERP 29/10, AP_OrderFrm EBS/EBC): the saved rate must be positive and VND must be 1.
    // AP_PurchaseRequest_CreatePOStp leaves 0 when no dated rate exists, so such a PO cannot be saved until a rate is chosen.
    public static bool DocumentRate(JsonElement currency,JsonElement rate)
    {
        decimal? value=rate.ValueKind switch
        {
            JsonValueKind.Number when rate.TryGetDecimal(out var number)=>number,
            JsonValueKind.String when decimal.TryParse(rate.GetString(),NumberStyles.Float,CultureInfo.InvariantCulture,out var text)=>text,
            _=>null
        };
        if(value is not >0m)return false;
        return currency.ValueKind!=JsonValueKind.String||!string.Equals(currency.GetString()?.Trim(),"VND",StringComparison.OrdinalIgnoreCase)||value==1m;
    }
}
