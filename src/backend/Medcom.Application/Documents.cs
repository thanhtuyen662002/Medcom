using Medcom.Contracts;
namespace Medcom.Application;

public enum DocumentKind { PurchaseOrders, InboundRequests }
public sealed record DocumentQuery(int Page = 1, int PageSize = 50, string? Search = null, string? BranchId = null);
public enum DocumentOutcome { Success, Denied, Invalid, Unavailable }
public sealed record DocumentResult(DocumentOutcome Outcome, DocumentPage? Page = null);
public interface IDocumentReader
{
    Task<DocumentResult> ReadAsync(AuthoritativeIdentity identity, DocumentKind kind, DocumentQuery query,
        CancellationToken cancellationToken);
}
