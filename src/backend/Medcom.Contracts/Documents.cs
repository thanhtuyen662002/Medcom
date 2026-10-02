namespace Medcom.Contracts;

public sealed record DocumentSummary(string DocumentId, string DocumentDate, string BranchId,
    int? StatusId, bool? IsLocked);
public sealed record DocumentPage(IReadOnlyList<DocumentSummary> Rows, int Page, int PageSize, bool HasMore);

// Quantities stay decimal strings across JSON; ERP decimal(28,4) must not lose precision in JavaScript.
public sealed record PurchaseOrderLine(string LineId, string ItemId, string? Quantity, string? Quantity2);
public sealed record InboundRequestLine(string LineId, string ItemId,
    string? SetQuantityByDocument, string? BarrelQuantityByDocument,
    string? SetQuantityByReal, string? BarrelQuantityByReal);
public sealed record DocumentDetailPage(DocumentSummary Document,
    IReadOnlyList<PurchaseOrderLine> PurchaseOrderLines, IReadOnlyList<InboundRequestLine> InboundRequestLines,
    int Page, int PageSize, bool HasMore);
