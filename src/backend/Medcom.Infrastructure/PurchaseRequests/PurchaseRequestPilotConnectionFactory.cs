namespace Medcom.Infrastructure.PurchaseRequests;

// Reuses the exact reader/identity store's resolved SQL and TLS policy. Creating
// or inspecting a closed connection does not probe the target or run SQL.
public static class PurchaseRequestPilotConnectionFactory
{
    public static PurchaseRequestCommandFactory Create(PurchaseRequestPilotAuthorization authorization,
        LegacyCompany company, SqlLegacyUserStore store, TimeProvider? clock = null)
    {
        ArgumentNullException.ThrowIfNull(authorization);
        ArgumentNullException.ThrowIfNull(company);
        ArgumentNullException.ThrowIfNull(store);
        using (var closed = store.CreateConnection()) authorization.VerifyTarget(closed);
        return PurchaseRequestCommandFactory.ForOwnerAuthorizedPilot(authorization, company,
            store.CreateConnection, clock);
    }
}
