using System.Globalization;
using System.Text;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Microsoft.AspNetCore.Http.Features;
namespace Medcom.Api;

public static class ErpScreenEndpoints
{
    public static void Map(WebApplication app)
    {
        foreach(var module in ErpScreenCatalog.ModuleIds)
        {
            var path="/api/erp/"+module;
            app.MapGet(path+"/screen",(HttpContext context)=>CanRead(context,module)&&Query(context)
                ? Read(context,new ErpReadResult<ErpScreenDescription>(ErpReadOutcome.Success,ErpScreenCatalog.Get(module))) : Problem(403,"native_read_denied"));
            app.MapGet(path,async(HttpContext context,IErpScreenService service)=>
            {
                if(!CanRead(context,module))return Problem(403,"native_read_denied");
                if(!Query(context,"branchId","page","pageSize","search","dateFrom","dateTo","statusId")
                    ||!Number(context,"page",1,out var page)||!Number(context,"pageSize",20,out var size)
                    ||!OptionalInteger(context,"statusId",out var status))return Problem(400,"invalid_query");
                return Read(context,await service.ListAsync(module,new(Value(context,"branchId")??"",page,size,Value(context,"search"),
                    Value(context,"dateFrom"),Value(context,"dateTo"),status),context.RequestAborted));
            });
            app.MapGet(path+"/detail",async(HttpContext context,IErpScreenService service)=>
            {
                if(!CanRead(context,module))return Problem(403,"native_read_denied");
                if(!Query(context,"branchId","documentId","page","pageSize")||!Number(context,"page",1,out var page)
                    ||!Number(context,"pageSize",20,out var size))return Problem(400,"invalid_query");
                return Read(context,await service.DetailAsync(module,Value(context,"branchId")??"",Value(context,"documentId")??"",page,size,context.RequestAborted));
            });
            app.MapGet(path+"/actions",async(HttpContext context,IErpScreenService service)=>
            {
                if(!CanRead(context,module))return Problem(403,"native_read_denied");
                if(!Query(context,"branchId","documentId"))return Problem(400,"invalid_query");
                return Read(context,await service.ActionsAsync(module,Value(context,"branchId")??"",Value(context,"documentId"),context.RequestAborted));
            });
            if(ErpScreenCatalog.Get(module)!.Actions.Any(action=>action.Operation=="contract-info"))
                app.MapGet(path+"/contract-info",async(HttpContext context,IErpScreenService service)=>
                {
                    if(!CanRead(context,module))return Problem(403,"native_read_denied");
                    if(!Query(context,"branchId","documentId"))return Problem(400,"invalid_query");
                    return Read(context,await service.ContractAsync(module,Value(context,"branchId")??"",Value(context,"documentId")??"",context.RequestAborted));
                });
            MapReadBody<ErpLookupQuery,ErpChoicePage>(app,path+"/options",module,(service,request,token)=>service.OptionsAsync(module,request,token));
            if(module is "sales-orders" or "internal-transfer-requests")MapReadBody<ErpPmLookupQuery,ErpChoicePage>(app,path+"/actions/send-pm/options",module,
                (service,request,token)=>service.PmOptionsAsync(module,request,token));
            if(module is not ("warehouse-qr" or "sales-qr"))
            {
                MapReadBody<ErpSelectionRequest,ErpDraftSelection>(app,path+"/selection",module,(service,request,token)=>service.SelectionAsync(module,request,token));
                MapReadBody<ErpPasteRequest,ErpDraftSelection>(app,path+"/paste/validate",module,(service,request,token)=>service.PasteAsync(module,request,token));
                MapCommand<ErpCreateRequest>(app,path+"/create",module,"create",(service,request,token)=>service.CreateAsync(module,request,token));
                MapCommand<ErpSaveRequest>(app,path+"/save",module,"save",(service,request,token)=>service.SaveAsync(module,request,token));
                MapCommand<ErpDeleteRequest>(app,path+"/delete",module,"delete",(service,request,token)=>service.DeleteAsync(module,request,token));
            }
            foreach(var action in ErpScreenCatalog.Get(module)!.Actions.Where(action=>action.Operation is "submit" or "send-purchase-order" or "send-pm" or "recall"))
                MapCommand<ErpActionRequest>(app,path+"/actions/"+action.Operation,module,action.Operation,(service,request,token)=>service.ActionAsync(module,action.Operation,request,token));
            if(module is "warehouse-qr" or "sales-qr")
                foreach(var action in new[]{"add","delete"})MapCommand<ErpScanRequest>(app,path+"/qr/"+action,module,"scan-"+action,
                    (service,request,token)=>service.ScanAsync(module,"scan-"+action,request,token));
            MapReadBody<ErpCommandLookupRequest,ErpCommandObservation>(app,path+"/commands/lookup",module,
                (service,request,token)=>service.ObserveAsync(module,request,token));
        }
    }
    private static void MapReadBody<T,R>(WebApplication app,string path,string module,
        Func<IErpScreenService,T,CancellationToken,Task<ErpReadResult<R>>> call)=>app.MapPost(path,async(HttpContext context,IErpScreenService service)=>
        {
            if(Guard(context,module)is {} rejection)return rejection;
            var raw=await Body(context);if(raw is null)return Problem(400,"invalid_json");
            var value=Decode<T>(raw.Value);if(value is null)return Problem(400,"invalid_json");
            return Read(context,await call(service,value,context.RequestAborted));
        });
    private static void MapCommand<T>(WebApplication app,string path,string module,string operation,
        Func<IErpScreenService,T,CancellationToken,Task<ErpCommandResult>> call)=>app.MapPost(path,async(HttpContext context,IErpScreenService service)=>
        {
            if(Guard(context,module)is {} rejection)return rejection;
            var raw=await Body(context);if(raw is null||!ErpCommandRules.Freeze(module,operation,raw.Value,out _))return Problem(400,"invalid_erp_intent");
            var value=Decode<T>(raw.Value);if(value is null)return Problem(400,"invalid_erp_intent");
            var result=await call(service,value,context.RequestAborted);
            var status=result.Outcome switch
            {ErpCommandOutcome.Committed or ErpCommandOutcome.Replayed=>200,ErpCommandOutcome.InvalidInput=>400,ErpCommandOutcome.Denied=>403,
                ErpCommandOutcome.Conflict or ErpCommandOutcome.OutcomeUnknown=>409,_=>503};
            WorkspaceReadScope.Stamp(context,AuthEndpoints.Current(context));return Results.Json(result,statusCode:status);
        });
    private static IResult? Guard(HttpContext context,string module)
    {
        if(!CanRead(context,module))return Problem(403,"native_read_denied");
        if(!context.Request.IsHttps||context.Request.Headers.Origin.Count!=1
            ||context.Request.Headers.Origin.ToString()!=$"{context.Request.Scheme}://{context.Request.Host}")return Problem(403,"origin_rejected");
        if(!Query(context))return Problem(400,"invalid_query");
        if(context.Request.Headers[WorkspaceReadScope.ReadHeader].Count!=1
            ||context.Request.Headers[WorkspaceReadScope.ReadHeader].ToString()!=WorkspaceReadScope.Read(AuthEndpoints.Current(context)))return Problem(409,"erp_scope_changed");
        return null;
    }
    private static bool CanRead(HttpContext context,string module)=>AuthEndpoints.Current(context).Identity.Capabilities.Contains(module+".read",StringComparer.Ordinal);
    private static IResult Read<T>(HttpContext context,ErpReadResult<T> result)
    {
        if(result.Outcome==ErpReadOutcome.Success&&result.Value is not null)
        {
            var session=AuthEndpoints.Current(context);WorkspaceReadScope.Stamp(context,session);
            context.Response.Headers["X-Medcom-Data-Projection"]="full";
            return Results.Ok(new ErpScopedResponse<T>(WorkspaceReadScope.Read(session),result.Value));
        }
        return Problem(result.Outcome switch{ErpReadOutcome.Invalid=>400,ErpReadOutcome.Denied=>403,ErpReadOutcome.NotFound=>404,_=>503},result.Code??"erp_read_unavailable");
    }
    private static IResult Problem(int status,string code)=>Results.Problem(statusCode:status,title:"ERP operation could not be completed.",extensions:new Dictionary<string,object?>{{"code",code}});
    private static bool Query(HttpContext context,params string[] names)=>context.Request.Query.All(pair=>names.Contains(pair.Key,StringComparer.Ordinal)&&pair.Value.Count==1);
    private static string? Value(HttpContext context,string name)=>context.Request.Query.TryGetValue(name,out var value)?value.ToString():null;
    private static bool Number(HttpContext context,string name,int fallback,out int value)
    {value=fallback;return !context.Request.Query.TryGetValue(name,out var raw)||int.TryParse(raw,NumberStyles.None,CultureInfo.InvariantCulture,out value);}
    private static bool OptionalInteger(HttpContext context,string name,out int? value)
    {value=null;var raw=Value(context,name);if(raw is null)return true;if(!int.TryParse(raw,NumberStyles.AllowLeadingSign,CultureInfo.InvariantCulture,out var n))return false;value=n;return true;}
    private static T? Decode<T>(JsonElement raw)
    {
        try{return JsonSerializer.Deserialize<T>(raw,new JsonSerializerOptions(JsonSerializerDefaults.Web){PropertyNameCaseInsensitive=false,
            UnmappedMemberHandling=System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow,MaxDepth=16});}
        catch(JsonException){return default;}
    }
    private static async Task<JsonElement?> Body(HttpContext context)
    {
        var type=context.Request.ContentType??"";
        if(!type.Equals("application/json",StringComparison.OrdinalIgnoreCase)&&!type.Equals("application/json; charset=utf-8",StringComparison.OrdinalIgnoreCase))
            throw new BadHttpRequestException("JSON required.",415);
        if(context.Request.ContentLength>ErpInputRules.MaximumBodyBytes)throw new BadHttpRequestException("Body too large.",413);
        if(context.Request.Protocol=="HTTP/1.1"&&context.Request.ContentLength is null
            &&context.Features.Get<IHttpMaxRequestBodySizeFeature>()is{IsReadOnly:false} limit)limit.MaxRequestBodySize=ErpInputRules.MaximumBodyBytes+65536;
        using var buffer=new MemoryStream();var chunk=new byte[8192];
        while(true)
        {var read=await context.Request.Body.ReadAsync(chunk,context.RequestAborted);if(read==0)break;
         if(buffer.Length+read>ErpInputRules.MaximumBodyBytes)throw new BadHttpRequestException("Body too large.",413);buffer.Write(chunk,0,read);}
        if(context.Request.ContentLength is {} length&&length!=buffer.Length)throw new BadHttpRequestException("Body length mismatch.",400);
        try
        {using var document=JsonDocument.Parse(new UTF8Encoding(false,true).GetString(buffer.ToArray()),new JsonDocumentOptions{MaxDepth=16});
         return ErpInputRules.UniqueJson(document.RootElement)?document.RootElement.Clone():null;}
        catch(Exception error)when(error is JsonException or DecoderFallbackException){return null;}
    }
}
