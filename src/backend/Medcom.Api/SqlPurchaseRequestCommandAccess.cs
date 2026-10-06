using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure.PurchaseRequests;

namespace Medcom.Api;

/// <summary>
/// Adapts the native EDIT observation to I20's provisional access interface.
/// CanSave/CanSubmit mean authority to ATTEMPT the unchanged I14 command, not that
/// a document is still a draft. The final I20 UI must combine state separately.
/// This distinction preserves receipt access after Submit itself locks the document.
/// </summary>
public sealed class SqlPurchaseRequestCommandAccess : IPurchaseRequestCommandAccess
{
    private readonly PurchaseRequestCommandRequestScope request;
    internal SqlPurchaseRequestCommandAccess(PurchaseRequestCommandRequestScope request) => this.request = request;

    public async Task<PurchaseRequestCommandAccessState> ResolveAsync(ResolvedSession session,
        string documentId, string branchId, CancellationToken token)
    {
        if (!request.RuntimeAccepted) return UnavailablePurchaseRequestCommandAccess.State;
        try
        {
            var outcome = await request.ReadAccess(session, documentId, branchId, token);
            return outcome switch
            {
                PurchaseRequestCommandAuthorityOutcome.Admitted => new(true, true, true, false, "native_update_admitted"),
                PurchaseRequestCommandAuthorityOutcome.Denied => new(false, false, false, false, "native_edit_denied"),
                PurchaseRequestCommandAuthorityOutcome.Cancelled => new(false, false, false, false, "command_access_cancelled"),
                _ => UnavailablePurchaseRequestCommandAccess.State
            };
        }
        catch (OperationCanceledException) { return new(false, false, false, false, "command_access_cancelled"); }
        catch (Exception) { return UnavailablePurchaseRequestCommandAccess.State; }
    }
}
