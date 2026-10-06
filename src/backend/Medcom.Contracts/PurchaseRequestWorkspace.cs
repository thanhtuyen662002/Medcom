namespace Medcom.Contracts;

public sealed record PurchaseRequestListQuery(int Page = 1, int PageSize = 20,
    string? Search = null, string? BranchId = null);
public sealed record PurchaseRequestListRow(string DocumentId, string? PurchaseDate, string BranchId,
    string PersonSuggest, string Department, int StatusId, bool? IsLocked);
public sealed record PurchaseRequestListPage(IReadOnlyList<PurchaseRequestListRow> Rows,
    int Page, int PageSize, bool HasMore);
public sealed record PurchaseRequestReadback(PurchaseRequestAggregate Document, string StateToken);
public sealed record PurchaseRequestLookupState(string Kind, bool Available, string? Reason, string Evidence);
public sealed record PurchaseRequestWorkspace(IReadOnlyList<string> BranchIds, bool WriteAvailable,
    string WriteReason, IReadOnlyList<PurchaseRequestLookupState> Lookups);
public sealed record PurchaseRequestChoice(string Id, string Label);
public sealed record PurchaseRequestLookupPage(bool Available, string? Reason,
    IReadOnlyList<PurchaseRequestChoice> Items, int Page, bool HasMore);
public sealed record PurchaseRequestScopedResponse<T>(string ScopeKey, T Data);
