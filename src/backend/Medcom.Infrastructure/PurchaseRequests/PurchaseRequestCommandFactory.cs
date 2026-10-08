using System.Data;
using System.Data.Common;
using System.Runtime.CompilerServices;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.PurchaseRequests;

/// <summary>
/// A narrow, server-owned attestation supplied ONLY by the integrating parent after
/// actual target runtime acceptance. No I22 production attestation is supplied.
/// Matching these fields checks scope, not the truth of the external evidence.
/// Never construct this from HTTP, configuration flags, a schema probe or offline tests.
/// </summary>
public sealed record PurchaseRequestCommandRuntimeAcceptance(Guid DatabaseBindingId,
    string TenantId, string CompanyId, string EvidenceReference)
{
    internal bool Covers(Guid binding, LegacyCompany company) => binding != Guid.Empty
        && DatabaseBindingId == binding
        && PurchaseRequestCommandRules.Identifier(TenantId, 100)
        && PurchaseRequestCommandRules.Identifier(CompanyId, 100)
        && TenantId == company.TenantId && CompanyId == company.CompanyId
        && PurchaseRequestCommandRules.Identifier(EvidenceReference, 256);
}

/// <summary>
/// Immutable, explicitly bound composition input. The parent owns the connection
/// delegate and acceptance evidence. It holds no request identity or shared connection.
/// </summary>
public sealed class PurchaseRequestCommandFactory
{
    private readonly Guid binding;
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> connections;
    private readonly PurchaseRequestCommandRuntimeAcceptance? acceptance;
    private readonly PurchaseRequestPilotAuthorization? pilot;
    private readonly TimeProvider clock = TimeProvider.System;
    private readonly ConditionalWeakTable<DbConnection, object> issued = new();

    public PurchaseRequestCommandFactory(Guid databaseBindingId, LegacyCompany company,
        Func<SqlConnection> connections, PurchaseRequestCommandRuntimeAcceptance? acceptance = null)
        : this(databaseBindingId, company, Adapt(connections), acceptance) { }

    // Recording tests use the same orchestration without a SQL Server connection.
    public PurchaseRequestCommandFactory(Guid databaseBindingId, LegacyCompany company,
        Func<DbConnection> connections, PurchaseRequestCommandRuntimeAcceptance? acceptance = null)
    {
        binding = databaseBindingId;
        this.company = company ?? throw new ArgumentNullException(nameof(company));
        this.connections = connections ?? throw new ArgumentNullException(nameof(connections));
        this.acceptance = acceptance;
    }

    // A pilot is a separately authorized experiment, never a production attestation.
    public static PurchaseRequestCommandFactory ForOwnerAuthorizedPilot(
        PurchaseRequestPilotAuthorization authorization, LegacyCompany company,
        Func<SqlConnection> connections, TimeProvider? clock = null) =>
        new(authorization, company, Adapt(connections), clock ?? TimeProvider.System);

    // Only the test assembly can substitute the recording provider for this path.
    internal static PurchaseRequestCommandFactory ForOwnerAuthorizedPilot(
        PurchaseRequestPilotAuthorization authorization, LegacyCompany company,
        Func<DbConnection> connections, TimeProvider? clock = null) =>
        new(authorization, company, connections, clock ?? TimeProvider.System);

    private PurchaseRequestCommandFactory(PurchaseRequestPilotAuthorization authorization,
        LegacyCompany company, Func<DbConnection> connections, TimeProvider clock)
        : this((authorization ?? throw new ArgumentNullException(nameof(authorization))).DatabaseBindingId,
            company, connections)
    {
        if (!authorization.Covers(binding, company)) throw new ArgumentException("Purchase pilot company mismatch.");
        pilot = authorization;
        this.clock = clock;
    }

    public bool RuntimeAccepted => acceptance?.Covers(binding, company) == true;
    public bool IsOwnerAuthorizedPilot => pilot?.Covers(binding, company) == true;
    public bool PilotWriteAllowed => IsOwnerAuthorizedPilot && pilot!.CanWrite(clock.GetUtcNow());

    public SqlPurchaseRequestCommandAuthorityReader CreatePilotAuthorityReader(
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession,
        Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspectLocalSession = null) =>
        new(binding, company, FreshConnection, resolveLiveSession, null, inspectLocalSession,
            pilot, clock);

    public IPurchaseRequestCommands CreatePilotCommands(
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession,
        Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspectLocalSession = null)
    {
        ArgumentNullException.ThrowIfNull(resolveLiveSession);
        if (!IsOwnerAuthorizedPilot || inspectLocalSession is null) return new ExistingDocumentCommands(null);
        return new ExistingDocumentCommands(new SqlPurchaseRequestCommands(binding, company,
            FreshConnection, resolveLiveSession, new NoIdentifierAllocation(), pilot!, clock,
            inspectLocalSession));
    }

    // The inspector is an explicit server-composition contract: local session state only,
    // no SQL, activity refresh or full revalidation. An omitted inspector fails closed;
    // the old single-resolver overload remains source-compatible, not operational.
    public SqlPurchaseRequestCommandAuthorityReader CreateAuthorityReader(
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession,
        Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspectLocalSession = null) =>
        new(binding, company, FreshConnection, resolveLiveSession, acceptance, inspectLocalSession);

    public IPurchaseRequestCommands CreateCommands(
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession,
        Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspectLocalSession = null)
    {
        ArgumentNullException.ThrowIfNull(resolveLiveSession);
        // No session revalidation (which may itself query SQL), writer construction
        // or connection factory call while acceptance is absent/mismatched.
        if (!RuntimeAccepted || inspectLocalSession is null) return new ExistingDocumentCommands(null);
        return new ExistingDocumentCommands(new SqlPurchaseRequestCommands(binding, company,
            (Func<DbConnection>)FreshConnection, resolveLiveSession, new NoIdentifierAllocation(),
            runtimeQualified: RuntimeAccepted, inspectLocalSession: inspectLocalSession));
    }

    private static Func<DbConnection> Adapt(Func<SqlConnection> factory)
    {
        ArgumentNullException.ThrowIfNull(factory);
        return () => factory();
    }

    private DbConnection FreshConnection()
    {
        var connection = connections();
        // Do not close/dispose a supplied connection already owned by someone else.
        if (connection is null || connection.State != ConnectionState.Closed)
            throw new InvalidOperationException("A fresh closed connection is required.");
        lock (issued)
        {
            if (issued.TryGetValue(connection, out _))
                throw new InvalidOperationException("A connection instance cannot be reused.");
            issued.Add(connection, new object());
        }
        return connection;
    }

    // A tripwire: successful no-Add Save/Submit proves neither allocator method was
    // needed. Create/Add are blocked BEFORE dispatch, not by inventing identifiers.
    private sealed class NoIdentifierAllocation : IPurchaseRequestIdentifierAllocator
    {
        public bool IsQualified(PurchaseRequestAllocationContext context) =>
            throw new InvalidOperationException("Identifier allocation is not admitted by I22.");
        public Task<PurchaseRequestAllocatedIdentifiers> AllocateAsync(DbTransaction transaction,
            PurchaseRequestAllocationContext context, CancellationToken token) =>
            throw new InvalidOperationException("Identifier allocation is not admitted by I22.");
    }

    private sealed class ExistingDocumentCommands(SqlPurchaseRequestCommands? inner) : IPurchaseRequestCommands
    {
        private PurchaseRequestCommandOutcome Blocked => inner is null
            ? PurchaseRequestCommandOutcome.Unavailable : PurchaseRequestCommandOutcome.Denied;

        public Task<PurchaseRequestCommandResult> CreateAsync(CreatePurchaseRequestDraft request,
            CancellationToken token = default) => Task.FromResult(new PurchaseRequestCommandResult(Blocked));

        public Task<PurchaseRequestCommandResult> SaveAsync(SavePurchaseRequestDraft request,
            CancellationToken token = default)
        {
            if (inner is null) return Task.FromResult(new PurchaseRequestCommandResult(Blocked));
            try
            {
                ArgumentNullException.ThrowIfNull(request);
                // Freeze once before checking Add: a caller cannot mutate the list
                // between the no-Add check and the unchanged I14 freeze/dispatch.
                var frozen = PurchaseRequestCommandRules.Freeze(request);
                if (frozen.LineChanges.Any(change => change.Kind == PurchaseRequestLineChangeKind.Add))
                    return Task.FromResult(new PurchaseRequestCommandResult(PurchaseRequestCommandOutcome.Denied));
                return inner.SaveAsync(frozen, token);
            }
            catch (ArgumentException)
            { return Task.FromResult(new PurchaseRequestCommandResult(PurchaseRequestCommandOutcome.InvalidInput)); }
        }

        public Task<PurchaseRequestCommandResult> SubmitAsync(SubmitPurchaseRequest request,
            CancellationToken token = default) => inner is null
                ? Task.FromResult(new PurchaseRequestCommandResult(Blocked)) : inner.SubmitAsync(request, token);

        // I22 is an existing-document bridge. A Create intent has no original document
        // ID for its admission contract; this overload is not exposed through I22.
        public Task<PurchaseRequestLookupResult> LookupAsync(CreatePurchaseRequestDraft originalIntent,
            CancellationToken token = default) => Task.FromResult(new PurchaseRequestLookupResult(inner is null
                ? PurchaseRequestLookupOutcome.Unavailable : PurchaseRequestLookupOutcome.Denied));

        // Lookup is NOT another Save. Preserve the entire original DTO, even if an
        // older Save had Add changes; I19 alone validates that historical intent.
        public Task<PurchaseRequestLookupResult> LookupAsync(SavePurchaseRequestDraft originalIntent,
            CancellationToken token = default) => inner is null
                ? Task.FromResult(new PurchaseRequestLookupResult(PurchaseRequestLookupOutcome.Unavailable))
                : inner.LookupAsync(originalIntent, token);
        public Task<PurchaseRequestLookupResult> LookupAsync(SubmitPurchaseRequest originalIntent,
            CancellationToken token = default) => inner is null
                ? Task.FromResult(new PurchaseRequestLookupResult(PurchaseRequestLookupOutcome.Unavailable))
                : inner.LookupAsync(originalIntent, token);
    }
}
