namespace Medcom.Api;

// Every registered document read returns all source fields for its bounded page.
internal static class DocumentDataProjection
{
    internal const string Header = "X-Medcom-Data-Projection";
    internal const string PathHeader = "X-Medcom-Full-Data-Path";
    internal static string? FullPath(string path) => path switch
    {
        "/api/documents/purchase-orders" or "/api/v2/documents/purchase-orders" => path,
        "/api/documents/purchase-orders/detail" or "/api/v2/documents/purchase-orders/detail" => path,
        "/api/documents/inbound-requests" or "/api/v2/documents/inbound-requests" => path,
        "/api/documents/inbound-requests/detail" or "/api/v2/documents/inbound-requests/detail" => path,
        "/api/purchase-requests" or "/api/v2/purchase-requests" => path,
        "/api/purchase-requests/detail" or "/api/v2/purchase-requests/detail" => path,
        _ => null
    };

    internal static void Stamp(HttpContext context, string registeredPath)
    {
        var full = FullPath(registeredPath) ?? throw new InvalidOperationException("Not a document data route.");
        context.Response.Headers[Header] = "full";
        // Fixed route only; never echo identifiers, query strings or private data in this header.
        context.Response.Headers[PathHeader] = full;
    }
}
