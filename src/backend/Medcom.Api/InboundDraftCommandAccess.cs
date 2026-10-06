using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;

namespace Medcom.Api;

/// <summary>
/// Trusted, request-scoped qualification seam. There is deliberately no SQL,
/// generic lookup, capability-name inference or enabled implementation here.
/// The parent must bind this and I15 to the SAME live session and database.
/// </summary>
public interface IInboundDraftCommandAccess
{
    // Resolve the document's CURRENT branch and the CURRENT I15 Update grant
    // (menu 07011 / IV_InboundRequestFrm), not inbound-requests.read. SendGranted
    // additionally admits the existing SendToWarehouse action; never infer it
    // from a list permission, a client header/branch or a previous observation.
    // Revalidate identity/grants/branch around any provider awaits. Null means
    // unqualified/unavailable, not an authenticated user with invented rights.
    Task<InboundDraftAuthority?> ResolveAsync(ResolvedSession liveSession,
        string documentId, CancellationToken cancellationToken);
}

public sealed record InboundDraftAuthority(Guid DatabaseBindingId, string DocumentId,
    string BranchId, bool UpdateGranted, bool SendGranted, bool Available);

public sealed class UnavailableInboundDraftCommandAccess : IInboundDraftCommandAccess
{
    public Task<InboundDraftAuthority?> ResolveAsync(ResolvedSession liveSession,
        string documentId, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult<InboundDraftAuthority?>(null);
    }
}

// The registration helper defaults to this service even if other read-only
// pilots are enabled. No constructor opens a connection or activates I15 SQL.
public sealed class UnavailableInboundDraftCommandService : IInboundDraftCommandService
{
    public Task<InboundDraftReadResult> ReadAsync(string documentId, CancellationToken token = default)
    {
        token.ThrowIfCancellationRequested();
        return Task.FromResult(new InboundDraftReadResult(InboundDraftOutcome.Unavailable));
    }
    public Task<InboundDraftResult> ExecuteAsync(InboundDraftCommand request, CancellationToken token = default)
        => Unavailable(token);
    public Task<InboundDraftResult> ReconcileAsync(InboundDraftCommand originalRequest, CancellationToken token = default)
        => Unavailable(token);
    private static Task<InboundDraftResult> Unavailable(CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        return Task.FromResult(new InboundDraftResult(InboundDraftOutcome.Unavailable));
    }
}
