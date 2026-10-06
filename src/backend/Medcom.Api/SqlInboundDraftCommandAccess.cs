using Medcom.Application;

namespace Medcom.Api;

// Current native Update authority, not a draft-status predicate. This remains
// available after Send so the original historical receipt can be reconciled.
public sealed class SqlInboundDraftCommandAccess : IInboundDraftCommandAccess
{
    private readonly InboundDraftCommandRequestScope request;
    internal SqlInboundDraftCommandAccess(InboundDraftCommandRequestScope request) => this.request = request;

    public Task<InboundDraftAuthority?> ResolveAsync(ResolvedSession liveSession, string documentId,
        CancellationToken cancellationToken) => request.ReadAccess(liveSession, documentId, cancellationToken);
}
