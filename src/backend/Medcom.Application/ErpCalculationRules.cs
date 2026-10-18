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
}
