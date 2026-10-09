using Medcom.Contracts;
namespace Medcom.Application;

public enum DocumentKind { PurchaseOrders, InboundRequests }
public sealed record DocumentQuery(int Page = 1, int PageSize = 50, string? Search = null, string? BranchId = null,
    string? DateFrom = null, string? DateTo = null, int? StatusId = null, string? SortBy = null, string? SortDirection = null);
public enum DocumentOutcome { Success, Denied, Invalid, Unavailable, NotFound }
public sealed record DocumentResult(DocumentOutcome Outcome, DocumentPage? Page = null);
public sealed record DocumentDetailQuery(string DocumentId, int Page = 1, int PageSize = 50);
public sealed record DocumentDetailResult(DocumentOutcome Outcome, DocumentDetailPage? Detail = null);
public interface IDocumentReader
{
    Task<DocumentResult> ReadAsync(AuthoritativeIdentity identity, DocumentKind kind, DocumentQuery query,
        CancellationToken cancellationToken);
    Task<DocumentDetailResult> ReadDetailAsync(AuthoritativeIdentity identity, DocumentKind kind,
        DocumentDetailQuery query, CancellationToken cancellationToken);
}
