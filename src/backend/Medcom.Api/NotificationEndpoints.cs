using System.Globalization;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Api;

public static class NotificationEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/notifications",async(HttpContext context,INotificationQueries queries)=>{
            if(!Query(context,"page","pageSize","unreadOnly")||!Number(context,"page",1,out var page)||!Number(context,"pageSize",30,out var size)
                ||page is <1 or >1000||size is <1 or >100)return Problem(400,"invalid_query");
            var raw=context.Request.Query["unreadOnly"].ToString();
            if(context.Request.Query.ContainsKey("unreadOnly")&&raw is not ("true" or "false"))return Problem(400,"invalid_query");
            return await Call(context,token=>queries.ListAsync(page,size,raw=="true",token));
        });
        app.MapGet("/api/notifications/{id}",async(HttpContext context,INotificationQueries queries,int id)=>{
            if(id<=0||!Query(context))return Problem(400,"invalid_query");
            return await Call(context,token=>queries.DetailAsync(id,token));
        });
        app.MapGet("/api/notifications/{id}/target",async(HttpContext context,INotificationQueries queries,
            IErpScreenService screens,IDocumentReader documents,int id)=>{
            if(id<=0||!Query(context))return Problem(400,"invalid_query");
            return await Call<NotificationTarget>(context,async token=>{
                var first=await queries.DetailAsync(id,token);
                if(first.Outcome!=ErpReadOutcome.Success||first.Value is null)return new(first.Outcome,Code:first.Code);
                var target=await NotificationNavigation.ResolveAsync(first.Value,AuthEndpoints.Current(context).Identity,screens,documents,token);
                var last=await queries.DetailAsync(id,token);
                if(last.Outcome!=ErpReadOutcome.Success||last.Value is null)return new(last.Outcome,Code:last.Code);
                if(first.Value.DocumentId!=last.Value.DocumentId||first.Value.ErpFormName!=last.Value.ErpFormName||first.Value.WebFormName!=last.Value.WebFormName)
                    return new(ErpReadOutcome.Invalid,Code:"notification_target_changed");
                return new(ErpReadOutcome.Success,target);
            });
        });
        app.MapPost("/api/notifications/{id}/read",async(HttpContext context,INotificationQueries queries,int id,JsonElement body)=>{
            if(id<=0||!Query(context))return Problem(400,"invalid_query");
            if(body.ValueKind!=JsonValueKind.Object)return Problem(400,"invalid_notification_intent");
            var properties=body.EnumerateObject().ToArray();
            if(properties.Length!=1||properties[0].Name!="isView"||properties[0].Value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))return Problem(400,"invalid_notification_intent");
            if(!context.Request.IsHttps||context.Request.Headers.Origin.Count!=1||context.Request.Headers.Origin.ToString()!=$"{context.Request.Scheme}://{context.Request.Host}")return Problem(403,"origin_rejected");
            if(context.Request.Headers[WorkspaceReadScope.ReadHeader].Count!=1||context.Request.Headers[WorkspaceReadScope.ReadHeader].ToString()!=WorkspaceReadScope.Read(AuthEndpoints.Current(context)))return Problem(409,"erp_scope_changed");
            return await Call(context,token=>queries.SetReadAsync(id,properties[0].Value.GetBoolean(),token));
        });
    }
    private static async Task<IResult> Call<T>(HttpContext context,Func<CancellationToken,Task<ErpReadResult<T>>> operation)
    {
        using var timeout=CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);timeout.CancelAfter(TimeSpan.FromSeconds(12));
        try {
            var result=await operation(timeout.Token);
            if(result.Outcome==ErpReadOutcome.Success&&result.Value is not null){WorkspaceReadScope.Stamp(context,AuthEndpoints.Current(context));return Results.Ok(new ErpScopedResponse<T>(WorkspaceReadScope.Read(AuthEndpoints.Current(context)),result.Value));}
            return Problem(result.Outcome switch{ErpReadOutcome.Invalid=>400,ErpReadOutcome.Denied=>403,ErpReadOutcome.NotFound=>404,_=>503},result.Code??"notification_unavailable");
        }catch(OperationCanceledException)when(!context.RequestAborted.IsCancellationRequested){return Problem(503,"notification_timeout");}
    }
    private static IResult Problem(int status,string code)=>Results.Problem(statusCode:status,title:"Notification operation could not be completed.",extensions:new Dictionary<string,object?>{{"code",code}});
    private static bool Query(HttpContext context,params string[] names)=>context.Request.Query.All(pair=>names.Contains(pair.Key,StringComparer.Ordinal)&&pair.Value.Count==1);
    private static bool Number(HttpContext context,string name,int fallback,out int value)
    {value=fallback;return !context.Request.Query.TryGetValue(name,out var raw)||int.TryParse(raw,NumberStyles.None,CultureInfo.InvariantCulture,out value);}
}
