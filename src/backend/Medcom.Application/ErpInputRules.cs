using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Medcom.Contracts;
namespace Medcom.Application;

public static class ErpInputRules
{
    public const int MaximumLines=500;
    public const int MaximumScans=10_000;
    public const int MaximumBodyBytes=1_048_576;
    private static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web)
    {PropertyNameCaseInsensitive=false,UnmappedMemberHandling=JsonUnmappedMemberHandling.Disallow,MaxDepth=16};
    public static bool Identifier(string? value,int maximum=100)=>value is {Length:>0}
        && value.Length<=maximum && value.Trim()==value && value.IsNormalized(NormalizationForm.FormC)
        && Text(value,false) && !value.EnumerateRunes().Any(r=>Rune.GetUnicodeCategory(r)
            is UnicodeCategory.Control or UnicodeCategory.Format);
    public static bool AnsiIdentifier(string? value,int maximum)=>Identifier(value,maximum)
        && value!.All(character=>character is >= '!' and <= '~');
    public static bool Token(string? value)=>value is {Length:64}&&value.All(c=>c is >= '0' and <= '9' or >= 'a' and <= 'f');
    public static bool Page(int page,int size)=>page is >=1 and <=10_000 && size is >=1 and <=100;
    public static bool Text(string? value,bool multiline=true)
    {
        if(value is null)return true;
        for(var i=0;i<value.Length;i++)
        {
            var c=value[i];
            if(c=='\0'||char.IsControl(c)&&(!multiline||c is not '\r' and not '\n' and not '\t'))return false;
            if(char.IsHighSurrogate(c)){if(i+1>=value.Length||!char.IsLowSurrogate(value[++i]))return false;}
            else if(char.IsLowSurrogate(c))return false;
        }
        return true;
    }
    public static bool UniqueJson(JsonElement value,int depth=0)
    {
        if(depth>16)return false;
        if(value.ValueKind==JsonValueKind.Object)
        {
            var names=new HashSet<string>(StringComparer.Ordinal);
            foreach(var property in value.EnumerateObject())
                if(!names.Add(property.Name)||!UniqueJson(property.Value,depth+1))return false;
        }
        else if(value.ValueKind==JsonValueKind.Array)
            foreach(var child in value.EnumerateArray())if(!UniqueJson(child,depth+1))return false;
        return value.ValueKind is not JsonValueKind.Undefined;
    }
    public static Type? HeaderType(string module)=>module switch
    {
        "purchase-requests"=>typeof(ErpPurchaseRequestHeaderInput),"sales-orders"=>typeof(ErpSalesOrderHeaderInput),
        "internal-transfer-requests"=>typeof(ErpInternalTransferRequestHeaderInput),
        "machine-movements"=>typeof(ErpMachineMovementHeaderInput),"machine-repairs"=>typeof(ErpMachineRepairHeaderInput),_=>null
    };
    public static Type? LineType(string module)=>module switch
    {
        "purchase-requests"=>typeof(ErpPurchaseRequestLineInput),"sales-orders"=>typeof(ErpSalesOrderLineInput),
        "internal-transfer-requests"=>typeof(ErpInternalTransferRequestLineInput),
        "machine-movements"=>typeof(ErpMachineMovementLineInput),"machine-repairs"=>typeof(ErpMachineRepairLineInput),_=>null
    };
    public static bool Normalize(string module,string section,JsonElement raw,out JsonElement normalized)
    {
        normalized=default;
        if(ErpScreenCatalog.Get(module)is not {} catalog || !catalog.Fields.TryGetValue(section,out var fields)
            || (section=="header"?HeaderType(module):LineType(module))is not {} type
            || raw.ValueKind!=JsonValueKind.Object || !UniqueJson(raw))return false;
        try
        {
            var typed=JsonSerializer.Deserialize(raw,type,Json);
            if(typed is null)return false;
            var result=JsonSerializer.SerializeToElement(typed,type,Json);
            foreach(var property in result.EnumerateObject())
            {
                var field=fields.SingleOrDefault(field=>field.Name==property.Name&&field.Writable);
                if(field is null||!Value(field,property.Value)
                    ||field.Column.EndsWith("ID",StringComparison.Ordinal)&&property.Value.ValueKind==JsonValueKind.String
                        &&!Identifier(property.Value.GetString(),field.TypeArguments=="(max)"?250:Argument(field.TypeArguments,0)))return false;
            }
            normalized=result.Clone();return true;
        }
        catch(Exception error)when(error is JsonException or ArgumentException or InvalidOperationException or FormatException)
        {return false;}
    }
    public static bool Value(ErpFieldDefinition field,JsonElement value)
    {
        if(value.ValueKind==JsonValueKind.Null)return field.Nullable;
        switch(field.SqlType)
        {
            case "nvarchar":case "varchar":case "nchar":case "char":
                if(value.ValueKind!=JsonValueKind.String)return false;
                var text=value.GetString()!;
                var length=field.TypeArguments=="(max)"?65536:Argument(field.TypeArguments,0);
                return text.Length<=length&&Text(text)&&(!field.SqlType.StartsWith("n",StringComparison.Ordinal)
                    ?text.All(c=>c is >= ' ' and <= '~' or '\r' or '\n' or '\t'):true);
            case "datetime":case "date":case "datetime2":
                if(value.ValueKind!=JsonValueKind.String)return false;
                var format=field.SqlType=="date"?"yyyy-MM-dd":"yyyy-MM-dd'T'HH:mm:ss.fff";
                return DateTime.TryParseExact(value.GetString(),format,CultureInfo.InvariantCulture,DateTimeStyles.None,out var date)
                    && (field.SqlType!="datetime" || date>=new DateTime(1753,1,1)&&date<=System.Data.SqlTypes.SqlDateTime.MaxValue.Value
                        && new System.Data.SqlTypes.SqlDateTime(date).Value==date);
            case "decimal":case "numeric":case "money":case "smallmoney":
                return value.ValueKind==JsonValueKind.String&&Decimal(value.GetString(),
                    field.SqlType is "money" or "smallmoney"?19:Argument(field.TypeArguments,0),
                    field.SqlType is "money" or "smallmoney"?4:Argument(field.TypeArguments,1));
            case "bit":return value.ValueKind is JsonValueKind.True or JsonValueKind.False;
            case "int":return value.ValueKind==JsonValueKind.Number&&value.TryGetInt32(out _);
            case "smallint":return value.ValueKind==JsonValueKind.Number&&value.TryGetInt16(out _);
            case "tinyint":return value.ValueKind==JsonValueKind.Number&&value.TryGetByte(out _);
            case "bigint":return value.ValueKind==JsonValueKind.Number&&value.TryGetInt64(out _);
            case "float":case "real":return value.ValueKind==JsonValueKind.Number&&value.TryGetDouble(out var floating)&&double.IsFinite(floating);
            default:return false;
        }
    }
    public static bool Decimal(string? value,int precision,int scale)
    {
        if(value is not {Length:>0 and <=64}||value.Trim()!=value
            ||!System.Text.RegularExpressions.Regex.IsMatch(value,@"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$",System.Text.RegularExpressions.RegexOptions.CultureInvariant)
            ||!decimal.TryParse(value,NumberStyles.AllowLeadingSign|NumberStyles.AllowDecimalPoint,CultureInfo.InvariantCulture,out var number))return false;
        if(precision is <1 or >28||scale<0||scale>precision||decimal.Round(number,scale)!=number)return false;
        var bound=1m;for(var i=0;i<precision-scale;i++)bound*=10;
        return number>-bound&&number<bound;
    }
    private static int Argument(string? args,int index)
    {
        var parts=args?.Trim('(',')').Split(',');
        return parts is not null&&parts.Length>index&&int.TryParse(parts[index],NumberStyles.Integer,CultureInfo.InvariantCulture,out var result)?result:0;
    }
    public static string Fingerprint<T>(T value)=>Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value,Json)));
    public static JsonElement Serialize<T>(T value)=>JsonSerializer.SerializeToElement(value,Json);
}
