using System.Globalization;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Api;
public static class BranchEndpoints
{
    public static void Map(IEndpointRouteBuilder endpoints)=>endpoints.MapGet("/api/lookups/branches",async(HttpContext context,IReferenceData references)=>
    {
        var query=context.Request.Query;
        if(query.Any(x=>x.Key is not ("page" or "pageSize" or "search")||x.Value.Count!=1)
            ||!Number("page",1,out var page)||!Number("pageSize",20,out var size))return Results.Problem(statusCode:400,title:"Invalid query.");
        bool Number(string name,int fallback,out int value){value=fallback;return !query.ContainsKey(name)||int.TryParse(query[name],NumberStyles.None,CultureInfo.InvariantCulture,out value);}
        var result=await references.BranchesAsync(page,size,query.ContainsKey("search")?query["search"].ToString():null,context.RequestAborted);
        if(result.Outcome!=ErpReadOutcome.Success||result.Value is null)return Results.Problem(statusCode:result.Outcome switch{ErpReadOutcome.Invalid=>400,ErpReadOutcome.Denied=>403,_=>503},title:"Branch lookup unavailable.");
        var session=AuthEndpoints.Current(context);WorkspaceReadScope.Stamp(context,session);
        return Results.Ok(new ErpScopedResponse<BranchChoicePage>(WorkspaceReadScope.Read(session),result.Value));
    });
}
