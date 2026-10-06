using System.Text.Json.Serialization;

namespace Medcom.Contracts;

public sealed record PurchaseRequestListQuery(int Page = 1, int PageSize = 20,
    string? Search = null, string? BranchId = null);
public sealed record PurchaseRequestListRow(string DocumentId, string? PurchaseDate, string BranchId,
    string PersonSuggest, string Department, int StatusId, bool? IsLocked);
public sealed record PurchaseRequestListPage(IReadOnlyList<PurchaseRequestListRow> Rows,
    int Page, int PageSize, bool HasMore);
public sealed record PurchaseRequestReadback(PurchaseRequestAggregate Document, string StateToken,
    PurchaseRequestCommandAccessState? CommandAccess = null);
// Fixed existing-document bridge. No Create/Add capability is exposed.
public sealed record PurchaseRequestCommandAccessState(bool CanSave, bool CanSubmit, bool CanLookup,
    bool CanAddLines, string Reason);
public sealed record PurchaseRequestLookupState(string Kind, bool Available, string? Reason, string Evidence);
public sealed record PurchaseRequestWorkspace(IReadOnlyList<string> BranchIds, bool WriteAvailable,
    string WriteReason, IReadOnlyList<PurchaseRequestLookupState> Lookups);
// Currency-only additive fields are omitted for the unchanged branch wire shape.
public sealed record PurchaseRequestChoice(string Id, string? Label,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? CurrencyName = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] double? RateExchange = null);
public sealed record PurchaseRequestLookupPage(bool Available, string? Reason,
    IReadOnlyList<PurchaseRequestChoice> Items, int Page, bool HasMore);
public sealed record PurchaseRequestScopedResponse<T>(string ScopeKey, T Data);
