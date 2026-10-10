using System.Globalization;
using Medcom.Application;
using Medcom.Contracts;

namespace Medcom.Api;

internal sealed record DocumentListBinding(string? DateFrom, string? DateTo, int? StatusId,
    string? SortBy, string? SortDirection)
{
    private static readonly string[] Legacy = ["page", "pageSize", "search", "branchId"];
    private static readonly string[] Selection = ["dateFrom", "dateTo", "statusId", "sortBy", "sortDirection"];
    internal static bool TryRead(HttpContext context, bool version2, out DocumentListBinding selection)
    {
        selection = new(null, null, null, null, null);
        var query = context.Request.Query;
        if (query.Any(pair => pair.Value.Count != 1 || !(Legacy.Contains(pair.Key, StringComparer.Ordinal)
            || version2 && Selection.Contains(pair.Key, StringComparer.Ordinal)))) return false;
        string? Value(string key) => query.TryGetValue(key, out var value) ? value[0] : null;
        var statusText = Value("statusId"); int? status = null;
        if (statusText is not null)
        {
            if (!int.TryParse(statusText, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var number)) return false;
            status = number;
        }
        selection = new(Value("dateFrom"), Value("dateTo"), status,
            Value("sortBy") ?? (version2 ? "documentDate" : null), Value("sortDirection"));
        return DocumentSelectionRules.Valid(selection.DateFrom, selection.DateTo, selection.SortBy, selection.SortDirection);
    }

    internal static DocumentQueryContract? Contract(string kind) => kind switch
    {
        "purchase-orders" => Make(kind, "/api/v2/documents/purchase-orders", 100, "DocumentDate", "DocumentID", false),
        "inbound-requests" => Make(kind, "/api/v2/documents/inbound-requests", 100, "DocumentDate", "DocumentID", false),
        "purchase-requests" => Make(kind, "/api/v2/purchase-requests", 50, "PurchaseDate", "PurchaseRequestID", true),
        _ => null
    };
    private static DocumentQueryContract Make(string kind, string path, int size, string date, string id, bool nullable)
        => new(2, kind, path, 1000, size, date, id, DocumentSelectionRules.SortFields,
            "documentDate", "desc", "1753-01-01", "9999-12-31", "yyyy-MM-dd", true, nullable, "StatusID");
}
