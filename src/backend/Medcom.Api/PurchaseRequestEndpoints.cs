using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;

namespace Medcom.Api;

public static class PurchaseRequestEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/purchase-requests/workspace", async (HttpContext context, IPurchaseRequestQueries queries) =>
        {
            if (!CanRead(context)) return Denied();
            if (!Fields(context)) return Invalid();
            var result = await queries.WorkspaceAsync(context.RequestAborted);
            if (result.Outcome != PurchaseRequestQueryOutcome.Success || result.Value is null) return Response(context, result);
            return Response(context, result with { Value = result.Value with
                { WriteAvailable = false, WriteReason = PurchaseRequestQueryRules.WriteReason } });
        });
        app.MapGet("/api/purchase-requests", async (HttpContext context, IPurchaseRequestQueries queries) =>
        {
            if (!CanRead(context)) return Denied();
            if (!Fields(context, "page", "pageSize", "search", "branchId")
                || !Number(context, "page", 1, out var page) || !Number(context, "pageSize", 20, out var size)) return Invalid();
            var query = new PurchaseRequestListQuery(page, size, context.Request.Query["search"], context.Request.Query["branchId"]);
            if (!PurchaseRequestQueryRules.List(query)) return Invalid();
            if (!string.IsNullOrEmpty(query.BranchId)
                && AuthEndpoints.Current(context).Identity.BranchIds?.Contains(query.BranchId, StringComparer.Ordinal) != true) return Denied();
            return Response(context, await queries.ListAsync(query, context.RequestAborted));
        });
        app.MapGet("/api/purchase-requests/detail", async (HttpContext context, IPurchaseRequestQueries queries) =>
        {
            if (!CanRead(context)) return Denied();
            if (!Fields(context, "documentId") || !PurchaseRequestCommandRules.Identifier(context.Request.Query["documentId"], 50)) return Invalid();
            return Response(context, await queries.OpenAsync(context.Request.Query["documentId"].ToString(), context.RequestAborted));
        });
        app.MapGet("/api/purchase-requests/lookup", async (HttpContext context, IPurchaseRequestQueries queries) =>
        {
            if (!CanRead(context)) return Denied();
            var kind = context.Request.Query["kind"].ToString();
            if (!Fields(context, "kind", "search", "page") || !Number(context, "page", 1, out var page)
                || !PurchaseRequestQueryRules.Lookup(kind, context.Request.Query["search"], page)) return Invalid();
            return Response(context, await queries.LookupAsync(kind, context.Request.Query["search"], page, context.RequestAborted));
        });
    }

    private static bool CanRead(HttpContext context) => AuthEndpoints.Current(context).Identity.Capabilities
        .Contains(PurchaseRequestQueryRules.Capability, StringComparer.Ordinal);
    private static bool Fields(HttpContext context, params string[] fields) => context.Request.Query
        .All(pair => fields.Contains(pair.Key, StringComparer.Ordinal) && pair.Value.Count == 1);
    private static bool Number(HttpContext context, string name, int fallback, out int number)
    {
        number = fallback;
        return !context.Request.Query.ContainsKey(name) || int.TryParse(context.Request.Query[name], NumberStyles.None,
            CultureInfo.InvariantCulture, out number);
    }
    private static IResult Invalid() => Results.Problem(statusCode: 400, title: "Invalid purchase request query.", extensions: new Dictionary<string, object?> { ["code"] = "invalid_purchase_query" });
    private static IResult Denied() => Results.Problem(statusCode: 403, title: "Access denied.", extensions: new Dictionary<string, object?> { ["code"] = "forbidden" });
    private static string Scope(HttpContext context)
    {
        // Opaque UI identity, not a bearer token. Stable across authority/choice refreshes.
        var session = AuthEndpoints.Current(context);
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(
            "purchase-request-ui-v1\0" + session.Token + "\0" + session.Identity.PrincipalId
            + "\0" + session.Identity.TenantId + "\0" + session.Identity.CompanyId)));
    }
    private static IResult Response<T>(HttpContext context, PurchaseRequestQueryResult<T> result) => result.Outcome switch
    {
        PurchaseRequestQueryOutcome.Success when result.Value is not null => Results.Ok(new PurchaseRequestScopedResponse<T>(Scope(context), result.Value)),
        PurchaseRequestQueryOutcome.Invalid => Invalid(),
        PurchaseRequestQueryOutcome.Denied => Denied(),
        PurchaseRequestQueryOutcome.NotFound => Results.Problem(statusCode: 404, title: "Document unavailable.", extensions: new Dictionary<string, object?> { ["code"] = "purchase_request_not_found" }),
        _ => Results.Problem(statusCode: 503, title: "Purchase request reads unavailable.", extensions: new Dictionary<string, object?> { ["code"] = "purchase_read_unavailable" })
    };
}
