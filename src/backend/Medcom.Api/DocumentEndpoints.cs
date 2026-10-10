using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Api;
public static class DocumentEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/documents/query-contract", (HttpContext context,string? kind) =>
        {
            if(context.Request.Query.Keys.Any(key=>key!="kind") || context.Request.Query["kind"].Count!=1
                || kind is null || DocumentListBinding.Contract(kind) is not {} contract)
                return Results.Problem(statusCode:400,title:"Invalid query.");
            var session=AuthEndpoints.Current(context);
            if(!session.Identity.Capabilities.Contains(kind+".read",StringComparer.Ordinal))
                return Results.Problem(statusCode:403,title:"Access denied.");
            WorkspaceReadScope.Stamp(context,session);
            return Results.Ok(contract);
        });
        app.MapGet("/api/documents/field-contract", (HttpContext context,string? kind) =>
        {
            if(context.Request.Query.Keys.Any(key=>key!="kind") || context.Request.Query["kind"].Count!=1)
                return Results.Problem(statusCode:400,title:"Invalid query.");
            var capability=kind switch
            {
                "purchase-orders"=>"purchase-orders.read",
                "inbound-requests"=>"inbound-requests.read",
                "purchase-requests"=>"purchase-requests.read",
                _=>null
            };
            if(capability is null)return Results.Problem(statusCode:400,title:"Invalid query.");
            var session=AuthEndpoints.Current(context);
            if(!session.Identity.Capabilities.Contains(capability,StringComparer.Ordinal))
                return Results.Problem(statusCode:403,title:"Access denied.");
            WorkspaceReadScope.Stamp(context,session);
            return Results.Ok(DocumentFieldCatalog.Get(kind!));
        });
        Map(app, "/api/documents/purchase-orders", DocumentKind.PurchaseOrders, "purchase-orders.read");
        Map(app, "/api/documents/inbound-requests", DocumentKind.InboundRequests, "inbound-requests.read");
        MapDetail(app, "/api/documents/purchase-orders/detail", DocumentKind.PurchaseOrders, "purchase-orders.read");
        MapDetail(app, "/api/documents/inbound-requests/detail", DocumentKind.InboundRequests, "inbound-requests.read");
        Map(app, "/api/v2/documents/purchase-orders", DocumentKind.PurchaseOrders, "purchase-orders.read",true);
        Map(app, "/api/v2/documents/inbound-requests", DocumentKind.InboundRequests, "inbound-requests.read",true);
        MapDetail(app, "/api/v2/documents/purchase-orders/detail", DocumentKind.PurchaseOrders, "purchase-orders.read",true);
        MapDetail(app, "/api/v2/documents/inbound-requests/detail", DocumentKind.InboundRequests, "inbound-requests.read",true);
    }
    private static void Map(WebApplication app, string path, DocumentKind kind, string capability,bool fullFields=false) =>
        app.MapGet(path, async (HttpContext context, IDocumentReader reader, int? page, int? pageSize,
            string? search, string? branchId) =>
        {
            var session = AuthEndpoints.Current(context);
            if (!session.Identity.Capabilities.Contains(capability, StringComparer.Ordinal))
                return Results.Problem(statusCode:403,title:"Access denied.");
            if (!DocumentListBinding.TryRead(context,fullFields,out var selection)
                || page is < 1 or > 1000 || pageSize is < 1 or > 100
                || search?.Length>100 || branchId?.Length>50)
                return Results.Problem(statusCode:400,title:"Invalid query.");
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            DocumentResult result;
            try { result=await reader.ReadAsync(session.Identity,kind,new(page??1,pageSize??50,search,branchId,
                selection.DateFrom,selection.DateTo,selection.StatusId,selection.SortBy,selection.SortDirection),timeout.Token); }
            catch(OperationCanceledException) when(!context.RequestAborted.IsCancellationRequested)
            { return Results.Problem(statusCode:503,title:"Data is temporarily unavailable."); }
            if (result.Outcome == DocumentOutcome.Success && result.Page is not null
                && (!fullFields || result.Page.Rows.All(row=>FullHeader(row,kind))))
            {
                WorkspaceReadScope.Stamp(context, session);
                DocumentDataProjection.Stamp(context,path);
            }
            return result.Outcome switch
            {
                DocumentOutcome.Success when result.Page is not null && (!fullFields || result.Page.Rows.All(row=>FullHeader(row,kind)))
                    => Results.Ok(fullFields?result.Page:result.Page with {Rows=result.Page.Rows.Select(LegacyHeader).ToArray()}),
                DocumentOutcome.Denied => Results.Problem(statusCode:403,title:"Access denied."),
                DocumentOutcome.Invalid => Results.Problem(statusCode:400,title:"Invalid query."),
                _ => Results.Problem(statusCode:503,title:"Data is temporarily unavailable.")
            };
        });

    private static void MapDetail(WebApplication app, string path, DocumentKind kind, string capability,bool fullFields=false) =>
        app.MapGet(path, async (HttpContext context, IDocumentReader reader, string? documentId, int? page, int? pageSize) =>
        {
            var session=AuthEndpoints.Current(context);
            if (!session.Identity.Capabilities.Contains(capability,StringComparer.Ordinal))
                return Results.Problem(statusCode:403,title:"Access denied.");
            if (string.IsNullOrWhiteSpace(documentId)
                || documentId.Length > (kind==DocumentKind.PurchaseOrders?30:50)
                || page is < 1 or > 1000 || pageSize is < 1 or > 100
                || context.Request.Query.Keys.Any(key=>key is not ("documentId" or "page" or "pageSize")))
                return Results.Problem(statusCode:400,title:"Invalid query.");
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            DocumentDetailResult result;
            try { result=await reader.ReadDetailAsync(session.Identity,kind,new(documentId,page??1,pageSize??50),timeout.Token); }
            catch(OperationCanceledException) when(!context.RequestAborted.IsCancellationRequested)
            { return Results.Problem(statusCode:503,title:"Data is temporarily unavailable."); }
            if (result.Outcome == DocumentOutcome.Success && result.Detail is not null
                && (!fullFields || FullDetail(result.Detail,kind)))
            {
                WorkspaceReadScope.Stamp(context, session);
                DocumentDataProjection.Stamp(context,path);
            }
            return result.Outcome switch
            {
                DocumentOutcome.Success when result.Detail is not null && (!fullFields || FullDetail(result.Detail,kind))
                    => Results.Ok(fullFields?result.Detail:result.Detail with
                    {
                        Document=LegacyHeader(result.Detail.Document),
                        PurchaseOrderLines=result.Detail.PurchaseOrderLines.Select(line=>line with {Fields=null}).ToArray(),
                        InboundRequestLines=result.Detail.InboundRequestLines.Select(line=>line with {Fields=null}).ToArray()
                    }),
                DocumentOutcome.Denied => Results.Problem(statusCode:403,title:"Access denied."),
                DocumentOutcome.Invalid => Results.Problem(statusCode:400,title:"Invalid query."),
                DocumentOutcome.NotFound => Results.Problem(statusCode:404,title:"Document unavailable."),
                _ => Results.Problem(statusCode:503,title:"Data is temporarily unavailable.")
            };
        });
    private static bool FullHeader(DocumentSummary row,DocumentKind kind) => kind==DocumentKind.PurchaseOrders
        ? row.PurchaseOrderHeader is not null : row.InboundRequestHeader is not null;
    private static bool FullDetail(DocumentDetailPage detail,DocumentKind kind) => FullHeader(detail.Document,kind)
        && detail.PurchaseOrderLines.All(line=>line.Fields is not null)
        && detail.InboundRequestLines.All(line=>line.Fields is not null);
    private static DocumentSummary LegacyHeader(DocumentSummary row) => row with {PurchaseOrderHeader=null,InboundRequestHeader=null};
}
