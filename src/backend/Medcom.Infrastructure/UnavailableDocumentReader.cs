using Medcom.Application;
namespace Medcom.Infrastructure;
public sealed class UnavailableDocumentReader : IDocumentReader
{
    public Task<DocumentResult> ReadAsync(AuthoritativeIdentity identity, DocumentKind kind, DocumentQuery query,
        CancellationToken cancellationToken) => Task.FromResult(new DocumentResult(DocumentOutcome.Unavailable));
}
