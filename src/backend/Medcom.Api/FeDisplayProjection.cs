using System.Globalization;
using System.Numerics;
using System.Reflection;
using System.Collections;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Medcom.Application;
using Medcom.Contracts;
using Microsoft.Extensions.Options;
namespace Medcom.Api;

// Presentation is applied to a serialized copy, after authorization. Raw DTOs,
// commands, journal intents and aggregate equality tokens are never rewritten.
internal static partial class FeDisplayProjection
{
    private static readonly HashSet<string> MoneyNames=new(StringComparer.OrdinalIgnoreCase)
    {"Amount","AmountCost","AmountTotal","BaseTotal","CouponAmount","DepositAmount","DiscountAmount","DiscountAmount2",
     "DiscountAmountTT","DiscountTotal","ExportAmount","LaborAmount","PartsAmount","PhiKhacTotal","Price","SourceAmount",
     "TotalAmount","TotalPrice","UnitPrice","UnitPriceV","VATAmount","VATAmountTotal","CreditMax","CreditMax2","CreditMin",
     "Budget","PhiKhac","PhiVanChuyen","SoTienKM","TongTienNhom1","TongTienNhom2","TongTienNhomFyto","UnitCost"};
    private static readonly HashSet<string> DateNames=new(StringComparer.OrdinalIgnoreCase)
    {"AttachDate","DateCreate","DateUpdate","DebtDueDate","DeliverDate","DocumentDate","DueDate","EffectiveFrom","EffectiveTo",
     "EndDate","ExpireDate","HandoverDate","NextServiceDate","NgayGiaoLai","NgayHoaDon","NgayPhieu","PMConfirmedAt","PurchaseDate",
     "ReferenceDate","RequestedTransferDate","StartDate","ThoiGian","DatetimeRecorded","ExpireDateByDocument","ExpireDateByReal",
     "MsgTime","ViewDate","ExpireAt","WarrantyFrom","WarrantyTo","UsingDate","DepreDate","StopDate","LiquidationDate",
     "NgayChungTu","CustomsDeclarationDate","OriginDocumentDate","Birthday","NgayThanhLap"};
    private static readonly HashSet<string> TechnicalIds=new(StringComparer.OrdinalIgnoreCase)
    {"DocumentID","PurchaseRequestID","UserAutoID","LineID","ParentID","LinkID","QRPackageID","UID","AuditID","ModuleID","FormID",
     "RepairDocumentID","RepairDetailID","SourceInputDetailID","InternalTransferBatchID","ProductOrderID","RefSourceID"};
    internal static bool Applies(string method,string path)=>
        (path.StartsWith("/api/erp/",StringComparison.Ordinal)||path.StartsWith("/api/documents/",StringComparison.Ordinal)
         ||path.StartsWith("/api/v2/documents/",StringComparison.Ordinal)||path.StartsWith("/api/purchase-requests",StringComparison.Ordinal)
         ||path.StartsWith("/api/v2/purchase-requests",StringComparison.Ordinal)||path.StartsWith("/api/inbound-requests/",StringComparison.Ordinal)
         ||path.StartsWith("/api/notifications",StringComparison.Ordinal)||path=="/api/lookups/branches")
        &&!path.EndsWith("/screen",StringComparison.Ordinal)&&!path.EndsWith("/actions",StringComparison.Ordinal)
        &&!path.EndsWith("-contract",StringComparison.Ordinal)&&!path.EndsWith("/workspace",StringComparison.Ordinal)
        &&!path.Contains("/commands/",StringComparison.Ordinal)
        &&(method.Equals("get",StringComparison.OrdinalIgnoreCase)||path.EndsWith("/options",StringComparison.Ordinal)
            ||path.EndsWith("/selection",StringComparison.Ordinal)||path.EndsWith("/paste/validate",StringComparison.Ordinal)
            ||path.EndsWith("/read",StringComparison.Ordinal));
    internal static string? Module(string path)=>new[]{"internal-transfer-requests","purchase-requests","purchase-orders","inbound-requests",
        "sales-orders","warehouse-qr","sales-qr","machine-movements","machine-repairs"}.FirstOrDefault(x=>path.Split('/').Contains(x,StringComparer.Ordinal));
    private static string? FormModule(string? form)=>form switch
    {"AP_PurposeRequestListFrm"=>"purchase-requests","AP_OrderFrm"=>"purchase-orders","IV_InboundRequestFrm"=>"inbound-requests",
     "AR_OrderByContractFrm"=>"sales-orders","IV_InternalTransferRequestFrm"=>"internal-transfer-requests",
     "IV_Output_QRCodeFrm"=>"warehouse-qr","AR_Invoice_QRCodeFrm"=>"sales-qr","FA_Move2026Frm"=>"machine-movements",
     "FA_Repair2026Frm"=>"machine-repairs",_=>null};
    internal static string? Text(JsonNode? value)=>value is JsonValue v&&v.TryGetValue<string>(out var s)?s:null;
    private static string? Key(JsonNode? value)=>value is JsonValue v?v.GetValueKind() switch
    {JsonValueKind.String=>Text(v),JsonValueKind.Number=>v.ToJsonString(),_=>null}:null;
    internal static bool IsId(string field)=>field.EndsWith("Id",StringComparison.OrdinalIgnoreCase);
    internal static string NameField(string field)=>field=="id"?"name":field=="ID"?"Name":field[..^2]+"Name";
    internal static string StateField(string field)=>field.Length==2?(field=="id"?"referenceState":"ReferenceState"):field[..^2]+"ReferenceState";
    internal static bool IsDisplay(string field)=>MoneyNames.Contains(field)||DateNames.Contains(field);
    private static JsonNode? Get(JsonObject row,string field)=>row.FirstOrDefault(x=>x.Key.Equals(field,StringComparison.OrdinalIgnoreCase)).Value;
    private static string? Currency(JsonObject row,string? parent,int depth=0)=>Text(Get(row,"CurrencyID"))
        ??(depth<6?row.Where(x=>x.Key is "header" or "purchaseOrderHeader" or "inboundRequestHeader" or "fields" or "document" or "sourceFields" or "data").Select(x=>x.Value)
            .OfType<JsonObject>().Select(x=>Currency(x,null,depth+1)).FirstOrDefault(x=>x is not null):null)??parent;
    internal static IEnumerable<(JsonObject Row,string? Module,string? Currency)> Rows(JsonNode? node,string? module,string? currency=null,ISet<JsonNode>? protectedNodes=null)
    {
        if(node is not null&&protectedNodes?.Contains(node)==true)yield break;
        if(node is JsonObject row)
        {
            module=Text(Get(row,"ErpFormName"))is {} form?FormModule(form):module;
            currency=Currency(row,currency);
            yield return(row,module,currency);
            foreach(var child in row.ToArray().Where(x=>x.Key!="access"))foreach(var nested in Rows(child.Value,module,currency,protectedNodes))yield return nested;
        }
        else if(node is JsonArray array)foreach(var child in array)foreach(var nested in Rows(child,module,currency,protectedNodes))yield return nested;
    }
    private static string? Binding(string field,JsonObject row,string? module,string? choiceBinding)
    {
        if(!field.Equals("id",StringComparison.OrdinalIgnoreCase)||!row.ContainsKey("label"))return ApiReferenceCatalog.Resolve(field,module);
        if(choiceBinding is not null)return choiceBinding;
        var key=Key(Get(row,"id"));
        var matches=Get(row,"fields")is JsonObject fields?fields.Where(x=>Key(x.Value)==key).Select(x=>ApiReferenceCatalog.Resolve(x.Key,module))
            .Where(x=>x is not null).Distinct(StringComparer.Ordinal).Take(2).ToArray():[];
        return matches.Length==1?matches[0]:null;
    }
    internal static ReferenceKey[] Collect(JsonNode node,string? module,ISet<JsonNode>? protectedNodes=null,string? choiceBinding=null)=>Rows(node,module,protectedNodes:protectedNodes)
        .SelectMany(x=>x.Row.Where(p=>IsId(p.Key)).Select(p=>(Binding:Binding(p.Key,x.Row,x.Module,choiceBinding),Key:Key(p.Value))))
        .Where(x=>x.Binding is not null&&x.Key is {Length:>0 and <=250}).Select(x=>new ReferenceKey(x.Binding!,x.Key!)).Distinct().Take(1001).ToArray();
    internal static void Apply(JsonNode node,string? module,IReadOnlyDictionary<ReferenceKey,ReferenceValue> values,string fallback="unavailable",ISet<JsonNode>? protectedNodes=null,string? choiceBinding=null)
    {
        foreach(var (row,current,currency) in Rows(node,module,protectedNodes:protectedNodes).ToArray())
        foreach(var field in row.ToArray())
        {
            if(IsId(field.Key))
            {
                var binding=Binding(field.Key,row,current,choiceBinding);var key=Key(field.Value);
                ReferenceValue? found=null;if(binding is not null&&key is not null)values.TryGetValue(new(binding,key),out found);
                var name=found?.Name;
                if(field.Key.Equals("id",StringComparison.OrdinalIgnoreCase)&&binding is null)name=Text(Get(row,"label"))??Text(Get(row,"title"));
                var state=found is not null?found.State:name is not null?"available":key is null?"empty":TechnicalIds.Contains(field.Key)?"identifier"
                    :binding is null?"unknown":found?.State??fallback;
                var nameField=NameField(field.Key);if(!row.ContainsKey(nameField))row[nameField]=name;
                var stateField=StateField(field.Key);if(!row.ContainsKey(stateField))row[stateField]=state;
                if(field.Key.Equals("ItemID",StringComparison.OrdinalIgnoreCase))
                {
                    var native=field.Key.EndsWith("ID",StringComparison.Ordinal);
                    var code=native?"ItemCode":"itemCode";var unit=native?"Unit":"unit";
                    if(!row.ContainsKey(code))row[code]=Text(Get(row,"manufacturerItemCode"))??found?.Extra.GetValueOrDefault("ItemCode");
                    if(!row.ContainsKey(unit))row[unit]=found?.Extra.GetValueOrDefault("Unit");
                }
            }
            if(IsDisplay(field.Key))
            {
                var text=field.Value is null?null:Key(field.Value);
                row[field.Key+"Display"]=DateNames.Contains(field.Key)?FormatDate(text):FormatMoney(text,currency);
            }
        }
    }
    internal static bool ExactInput(Type type)=>type.GetCustomAttribute<JsonUnmappedMemberHandlingAttribute>()?.UnmappedMemberHandling==JsonUnmappedMemberHandling.Disallow
        ||type.IsGenericType&&type.GetGenericTypeDefinition()==typeof(IReadOnlyList<>)&&ExactInput(type.GetGenericArguments()[0]);
    internal static ISet<JsonNode> PreserveInputs(object value,JsonNode node,JsonSerializerOptions options)
    {
        var protectedNodes=new HashSet<JsonNode>(ReferenceEqualityComparer.Instance);
        void Walk(object? original,JsonNode? serialized)
        {
            if(original is null||serialized is null)return;
            if(serialized is JsonArray array&&original is IEnumerable list)
            {var index=0;foreach(var item in list){if(index<array.Count)Walk(item,array[index++]);}return;}
            if(serialized is not JsonObject row||original.GetType().Assembly!=typeof(BranchChoice).Assembly)return;
            foreach(var property in original.GetType().GetProperties(BindingFlags.Public|BindingFlags.Instance))
            {
                var field=property.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name??options.PropertyNamingPolicy?.ConvertName(property.Name)??property.Name;
                if(!row.TryGetPropertyValue(field,out var child))continue;
                if(ExactInput(property.PropertyType))
                {
                    row[field+"DisplayData"]=child?.DeepClone();if(child is not null)protectedNodes.Add(child);
                }
                else Walk(property.GetValue(original),child);
            }
        }
        Walk(value,node);return protectedNodes;
    }
    [GeneratedRegex(@"^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$",RegexOptions.CultureInvariant)]
    private static partial Regex Numeric();
    internal static string? FormatMoney(string? raw,string? currency)
    {
        if(raw is null||raw.Length>512||currency is not ("VND" or "USD"))return null;
        var match=Numeric().Match(raw);if(!match.Success)return null;
        var fraction=match.Groups[3].Value;var digits=match.Groups[2].Value+fraction;
        var exponent=0;if(match.Groups[4].Success&&(!int.TryParse(match.Groups[4].Value,NumberStyles.AllowLeadingSign,CultureInfo.InvariantCulture,out exponent)||exponent is <-400 or >400))return null;
        var precision=currency=="USD"?2:0;var shift=precision-fraction.Length+exponent;
        var magnitude=BigInteger.Parse(digits,CultureInfo.InvariantCulture);
        if(shift>=0)magnitude*=BigInteger.Pow(10,shift);
        else
        {
            var divisor=BigInteger.Pow(10,-shift);var quotient=BigInteger.DivRem(magnitude,divisor,out var remainder);
            magnitude=quotient+(remainder*2>=divisor?1:0);
        }
        var scale=precision==0?BigInteger.One:new BigInteger(100);
        var integer=BigInteger.DivRem(magnitude,scale,out var cents);
        return (match.Groups[1].Success&&match.Groups[1].Value=="-"&&!magnitude.IsZero?"-":"")
            +integer.ToString("N0",CultureInfo.InvariantCulture)+(precision==0?"":"."+((int)cents).ToString("D2",CultureInfo.InvariantCulture))+" "+currency;
    }
    internal static string? FormatDate(string? raw)
    {
        if(raw is null)return null;
        if(DateTime.TryParseExact(raw,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var date))return date.ToString("dd/MM/yyyy",CultureInfo.InvariantCulture);
        return DateTime.TryParseExact(raw,new[]{"yyyy-MM-dd'T'HH:mm:ss","yyyy-MM-dd'T'HH:mm:ss.FFFFFFF"},CultureInfo.InvariantCulture,DateTimeStyles.None,out date)
            ?date.ToString("dd/MM/yyyy HH:mm:ss",CultureInfo.InvariantCulture):null;
    }
}
internal sealed class FeDisplayFilter(IReferenceData references,IOptions<Microsoft.AspNetCore.Http.Json.JsonOptions> options,IWebSessions sessions):IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext invocation,EndpointFilterDelegate next)
    {
        var result=await next(invocation);var context=invocation.HttpContext;
        if(!FeDisplayProjection.Applies(context.Request.Method,context.Request.Path.Value??"")||result is not IValueHttpResult {Value:{} value}
            ||result is IStatusCodeHttpResult {StatusCode:{} status}&&status!=200)return result;
        var node=JsonSerializer.SerializeToNode(value,value.GetType(),options.Value.SerializerOptions);
        if(node is null)return result;
        if(context.Request.Path.Value=="/api/inbound-requests/draft"&&node["data"]?["document"]is null)return result;
        var protectedNodes=FeDisplayProjection.PreserveInputs(value,node,options.Value.SerializerOptions);
        var module=FeDisplayProjection.Module(context.Request.Path.Value!);
        if(context.Request.Path.Value!.EndsWith("/contract-info",StringComparison.Ordinal))module="contract-info";
        var choiceBinding=context.Request.Path.Value!.EndsWith("/lookup",StringComparison.Ordinal)?context.Request.Query["kind"].ToString() switch
            {"branches"=>"branch","items"=>"item","objects"=>"object","purposes"=>"purpose","currencies"=>"currency",_=>null}:null;
        var keys=FeDisplayProjection.Collect(node,module,protectedNodes,choiceBinding);
        if(keys.Length==0&&protectedNodes.Count==0&&!FeDisplayProjection.Rows(node,module).Any(x=>x.Row.Any(p=>FeDisplayProjection.IsId(p.Key)||FeDisplayProjection.IsDisplay(p.Key))))return result;
        var names=keys.Length==0?new ErpReadResult<IReadOnlyDictionary<ReferenceKey,ReferenceValue>>(ErpReadOutcome.Success,new Dictionary<ReferenceKey,ReferenceValue>())
            :await references.ReadAsync(keys,context.RequestAborted);
        var original=AuthEndpoints.Current(context);
        var current=await sessions.InspectAsync(original.Token,context.RequestAborted);
        if(names.Outcome==ErpReadOutcome.Denied||current is null||WorkspaceReadScope.Read(current)!=WorkspaceReadScope.Read(original))
            return Results.Problem(statusCode:403,title:"Reference authority changed.");
        FeDisplayProjection.Apply(node,module,names.Value??new Dictionary<ReferenceKey,ReferenceValue>(),protectedNodes:protectedNodes,choiceBinding:choiceBinding);
        context.Response.Headers["X-Medcom-Display-Projection"]="reference-names-v1";
        return Results.Json(node,options.Value.SerializerOptions);
    }
}
