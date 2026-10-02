namespace Medcom.Contracts;

public sealed record DocumentSummary(string DocumentId, string DocumentDate, string BranchId,
    int? StatusId, bool? IsLocked);
public sealed record DocumentPage(IReadOnlyList<DocumentSummary> Rows, int Page, int PageSize, bool HasMore);
