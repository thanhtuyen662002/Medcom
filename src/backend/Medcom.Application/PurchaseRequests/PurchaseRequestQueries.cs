using Medcom.Contracts;

namespace Medcom.Application.PurchaseRequests;

public enum PurchaseRequestQueryOutcome { Success, Invalid, Denied, NotFound, Unavailable }
public sealed record PurchaseRequestQueryResult<T>(PurchaseRequestQueryOutcome Outcome, T? Value = default);

// Closed business queries; neither table names nor SQL/actions are request inputs.
public interface IPurchaseRequestQueries
{
    Task<PurchaseRequestQueryResult<PurchaseRequestWorkspace>> WorkspaceAsync(CancellationToken token = default);
    Task<PurchaseRequestQueryResult<PurchaseRequestListPage>> ListAsync(PurchaseRequestListQuery query, CancellationToken token = default);
    Task<PurchaseRequestQueryResult<PurchaseRequestReadback>> OpenAsync(string documentId, CancellationToken token = default);
    Task<PurchaseRequestQueryResult<PurchaseRequestLookupPage>> LookupAsync(string kind, string? search, int page, CancellationToken token = default);
}

public static class PurchaseRequestQueryRules
{
    public const string Capability = "purchase-requests.read";
    public const string WriteReason = "numbering_journal_runtime_unqualified";
    public static readonly string[] LookupKinds = ["branches", "items", "objects", "purposes", "currencies"];
    public static bool List(PurchaseRequestListQuery? query) => query is not null
        && query.Page is >= 1 and <= 1000 && query.PageSize is >= 1 and <= 50
        && Search(query.Search) && (string.IsNullOrEmpty(query.BranchId) || PurchaseRequestCommandRules.Identifier(query.BranchId, 50))
        && DocumentSelectionRules.Valid(query.DateFrom, query.DateTo, query.SortBy, query.SortDirection);
    public static bool Search(string? value) => value is null || value.Length <= 100 && !value.Any(char.IsControl);
    public static bool Lookup(string kind, string? search, int page) => LookupKinds.Contains(kind, StringComparer.Ordinal)
        && Search(search) && page is >= 1 and <= 1000;
}

public sealed class UnavailablePurchaseRequestQueries : IPurchaseRequestQueries
{
    private static Task<PurchaseRequestQueryResult<T>> Unavailable<T>() => Task.FromResult(new PurchaseRequestQueryResult<T>(PurchaseRequestQueryOutcome.Unavailable));
    public Task<PurchaseRequestQueryResult<PurchaseRequestWorkspace>> WorkspaceAsync(CancellationToken token = default) => Unavailable<PurchaseRequestWorkspace>();
    public Task<PurchaseRequestQueryResult<PurchaseRequestListPage>> ListAsync(PurchaseRequestListQuery query, CancellationToken token = default) => Unavailable<PurchaseRequestListPage>();
    public Task<PurchaseRequestQueryResult<PurchaseRequestReadback>> OpenAsync(string documentId, CancellationToken token = default) => Unavailable<PurchaseRequestReadback>();
    public Task<PurchaseRequestQueryResult<PurchaseRequestLookupPage>> LookupAsync(string kind, string? search, int page, CancellationToken token = default) => Unavailable<PurchaseRequestLookupPage>();
}
