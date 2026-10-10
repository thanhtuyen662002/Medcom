namespace Medcom.Api;

// Explicit successful-read metadata. A legacy summary never advertises full source fields.
internal static class DocumentDataProjection
{
    internal const string Header = "X-Medcom-Data-Projection";
    internal const string PathHeader = "X-Medcom-Full-Data-Path";
    internal static string? FullPath(string path) => path switch
    {
        "/api/documents/purchase-orders" or "/api/v2/documents/purchase-orders" => "/api/v2/documents/purchase-orders",
        "/api/documents/purchase-orders/detail" or "/api/v2/documents/purchase-orders/detail" => "/api/v2/documents/purchase-orders/detail",
        "/api/documents/inbound-requests" or "/api/v2/documents/inbound-requests" => "/api/v2/documents/inbound-requests",
        "/api/documents/inbound-requests/detail" or "/api/v2/documents/inbound-requests/detail" => "/api/v2/documents/inbound-requests/detail",
        "/api/purchase-requests" or "/api/v2/purchase-requests" => "/api/v2/purchase-requests",
        "/api/purchase-requests/detail" or "/api/v2/purchase-requests/detail" => "/api/v2/purchase-requests/detail",
        _ => null
    };

    internal static void Stamp(HttpContext context, string registeredPath)
    {
        var full = FullPath(registeredPath) ?? throw new InvalidOperationException("Not a document data route.");
        context.Response.Headers[Header] = registeredPath == full ? "full" : "summary";
        // Fixed route only; never echo identifiers, query strings or private data in this header.
        context.Response.Headers[PathHeader] = full;
    }
}
