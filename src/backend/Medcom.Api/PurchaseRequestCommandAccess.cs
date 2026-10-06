using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;

namespace Medcom.Api;

/// <summary>
/// Server-owned admission, independent of purchase-requests.read. A real provider
/// must verify the live native EDIT grant for menu05011/AP_PurposeRequestListFrm,
/// exact document/branch authority, binding/schema/journal and runtime qualification.
/// UI booleans are observations, never grants. The command implementation must still
/// recheck all of its own transaction/session/qualification gates on every call.
/// No production provider is supplied or activated by I20.
/// </summary>
public interface IPurchaseRequestCommandAccess
{
    Task<PurchaseRequestCommandAccessState> ResolveAsync(ResolvedSession session,
        string documentId, string branchId, CancellationToken token);
}

public sealed class UnavailablePurchaseRequestCommandAccess : IPurchaseRequestCommandAccess
{
    public static PurchaseRequestCommandAccessState State { get; } =
        new(false, false, false, false, "command_access_provider_unavailable");
    public Task<PurchaseRequestCommandAccessState> ResolveAsync(ResolvedSession session,
        string documentId, string branchId, CancellationToken token) => Task.FromResult(State);
}

// Deliberately no SQL factory, configuration switch, identifier allocator or runtimeQualified flag.
// Tests replace both this service and admission explicitly; read-pilot configuration cannot enable writes.
public sealed class UnavailablePurchaseRequestCommands : IPurchaseRequestCommands
{
    private static Task<PurchaseRequestCommandResult> Command() =>
        Task.FromResult(new PurchaseRequestCommandResult(PurchaseRequestCommandOutcome.Unavailable));
    private static Task<PurchaseRequestLookupResult> Lookup() =>
        Task.FromResult(new PurchaseRequestLookupResult(PurchaseRequestLookupOutcome.Unavailable));
    public Task<PurchaseRequestCommandResult> CreateAsync(CreatePurchaseRequestDraft request, CancellationToken token = default) => Command();
    public Task<PurchaseRequestCommandResult> SaveAsync(SavePurchaseRequestDraft request, CancellationToken token = default) => Command();
    public Task<PurchaseRequestCommandResult> SubmitAsync(SubmitPurchaseRequest request, CancellationToken token = default) => Command();
    public Task<PurchaseRequestLookupResult> LookupAsync(CreatePurchaseRequestDraft originalIntent, CancellationToken token = default) => Lookup();
    public Task<PurchaseRequestLookupResult> LookupAsync(SavePurchaseRequestDraft originalIntent, CancellationToken token = default) => Lookup();
    public Task<PurchaseRequestLookupResult> LookupAsync(SubmitPurchaseRequest originalIntent, CancellationToken token = default) => Lookup();
}
