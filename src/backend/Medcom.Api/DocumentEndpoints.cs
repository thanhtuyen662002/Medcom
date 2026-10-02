using Medcom.Application;
namespace Medcom.Api;
public static class DocumentEndpoints
{
    public static void Map(WebApplication app)
    {
        Map(app, "/api/documents/purchase-orders", DocumentKind.PurchaseOrders, "purchase-orders.read");
        Map(app, "/api/documents/inbound-requests", DocumentKind.InboundRequests, "inbound-requests.read");
    }
    private static void Map(WebApplication app, string path, DocumentKind kind, string capability) =>
        app.MapGet(path, async (HttpContext context, IDocumentReader reader, int? page, int? pageSize,
            string? search, string? branchId) =>
        {
            var session = AuthEndpoints.Current(context);
            if (!session.Identity.Capabilities.Contains(capability, StringComparer.Ordinal))
                return Results.Problem(statusCode:403,title:"Access denied.");
            if (context.Request.Query.Keys.Any(key => key is not ("page" or "pageSize" or "search" or "branchId")))
                return Results.Problem(statusCode:400,title:"Invalid query.");
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            DocumentResult result;
            try { result=await reader.ReadAsync(session.Identity,kind,new(page??1,pageSize??50,search,branchId),timeout.Token); }
            catch(OperationCanceledException) when(!context.RequestAborted.IsCancellationRequested)
            { return Results.Problem(statusCode:503,title:"Data is temporarily unavailable."); }
            return result.Outcome switch
            {
                DocumentOutcome.Success when result.Page is not null => Results.Ok(result.Page),
                DocumentOutcome.Denied => Results.Problem(statusCode:403,title:"Access denied."),
                DocumentOutcome.Invalid => Results.Problem(statusCode:400,title:"Invalid query."),
                _ => Results.Problem(statusCode:503,title:"Data is temporarily unavailable.")
            };
        });
}
