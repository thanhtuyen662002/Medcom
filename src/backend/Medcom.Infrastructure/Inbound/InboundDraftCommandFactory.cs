using System.Data;
using System.Data.Common;
using System.Runtime.CompilerServices;
using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.Inbound;

/// <summary>
/// Target-specific, server-owned acceptance INPUT. Field equality cannot establish
/// the truth of external runtime evidence. Never build this from HTTP, settings,
/// synthetic tests or I15's weak journal column probe. No real acceptance is supplied.
/// New Send admission needs its own qualified evidence; no native Send column is proven.
/// </summary>
public sealed record InboundDraftCommandRuntimeAcceptance(Guid DatabaseBindingId,
    string TenantId, string CompanyId, string EvidenceReference, string? NewSendEvidenceReference = null)
{
    internal bool Covers(Guid binding, LegacyCompany company) => binding != Guid.Empty
        && DatabaseBindingId == binding && TenantId == company.TenantId && CompanyId == company.CompanyId
        && InboundDraftSessionFence.Identifier(TenantId, 100) && InboundDraftSessionFence.Identifier(CompanyId, 100)
        && InboundDraftSessionFence.Identifier(EvidenceReference, 256);
    internal bool CoversNewSend => InboundDraftSessionFence.Identifier(NewSendEvidenceReference, 256);
}

// Dormant composition. Connection ownership/binding and real target qualification
// belong to the integrator; neither construction nor registration opens SQL.
public sealed class InboundDraftCommandFactory
{
    private readonly Guid binding;
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> connections;
    private readonly InboundDraftCommandRuntimeAcceptance? acceptance;
    private readonly ConditionalWeakTable<DbConnection, object> issued = new();

    public InboundDraftCommandFactory(Guid databaseBindingId, LegacyCompany company,
        Func<SqlConnection> connections, InboundDraftCommandRuntimeAcceptance? acceptance = null)
        : this(databaseBindingId, company, Adapt(connections), acceptance) { }

    // Recording connections exercise the same native I15 code, never stubbed commands.
    public InboundDraftCommandFactory(Guid databaseBindingId, LegacyCompany company,
        Func<DbConnection> connections, InboundDraftCommandRuntimeAcceptance? acceptance = null)
    {
        binding = databaseBindingId;
        this.company = company ?? throw new ArgumentNullException(nameof(company));
        this.connections = connections ?? throw new ArgumentNullException(nameof(connections));
        this.acceptance = acceptance;
    }

    public bool RuntimeAccepted => acceptance?.Covers(binding, company) == true;
    public bool NewSendAccepted => RuntimeAccepted && acceptance!.CoversNewSend;
    public Guid DatabaseBindingId => binding;

    public SqlInboundDraftCommandAuthorityReader CreateAuthorityReader(
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession) =>
        new(binding, company, FreshConnection, resolveLiveSession, acceptance);

    public IInboundDraftCommandService CreateCommands(Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession)
    {
        ArgumentNullException.ThrowIfNull(resolveLiveSession);
        return new ExistingDocumentCommands(this, resolveLiveSession);
    }

    private static Func<DbConnection> Adapt(Func<SqlConnection> connections)
    {
        ArgumentNullException.ThrowIfNull(connections);
        return () => connections();
    }

    private DbConnection FreshConnection()
    {
        var connection = connections();
        if (connection is null || connection.State != ConnectionState.Closed)
            throw new InvalidOperationException("A fresh closed connection is required.");
        lock (issued)
        {
            if (issued.TryGetValue(connection, out _)) throw new InvalidOperationException("A connection cannot be reused.");
            issued.Add(connection, new object());
        }
        return connection;
    }

    private sealed class NoDocumentAllocation : IInboundDocumentNumberAllocator
    {
        public bool IsQualified => throw new InvalidOperationException("Create is not admitted by I31.");
        public Task<string?> AllocateAsync(DbTransaction transaction, DateTime documentDate, CancellationToken token) =>
            throw new InvalidOperationException("Create is not admitted by I31.");
    }

    private sealed class ExistingDocumentCommands(InboundDraftCommandFactory owner,
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolve) : IInboundDraftCommandService
    {
        private Invocation NewInvocation() => new(owner, resolve);

        public async Task<InboundDraftReadResult> ReadAsync(string documentId, CancellationToken token = default)
        {
            if (!owner.RuntimeAccepted) return new(InboundDraftOutcome.Unavailable);
            var invocation = NewInvocation();
            var result = await invocation.Service.ReadAsync(documentId, token);
            if (result.Outcome != InboundDraftOutcome.Observed) return result;
            return await invocation.FinalFence(token) ? result : new(InboundDraftOutcome.Denied);
        }

        public Task<InboundDraftResult> ExecuteAsync(InboundDraftCommand request, CancellationToken token = default) =>
            Run(request, false, token);
        public Task<InboundDraftResult> ReconcileAsync(InboundDraftCommand originalRequest, CancellationToken token = default) =>
            Run(originalRequest, true, token);

        private async Task<InboundDraftResult> Run(InboundDraftCommand request, bool reconcile, CancellationToken token)
        {
            if (!owner.RuntimeAccepted) return new(InboundDraftOutcome.Unavailable);
            if (request is null) return new(InboundDraftOutcome.InvalidInput);
            // Before session resolution, SQL, allocator qualification or reservation.
            if (request.Action == InboundDraftAction.Create) return new(InboundDraftOutcome.Denied);
            if (!reconcile && request.Action == InboundDraftAction.SendToWarehouse && !owner.NewSendAccepted)
                return new(InboundDraftOutcome.Denied);
            var invocation = NewInvocation();
            // Preserve the entire original DTO and operation. Reconcile never dispatches.
            var result = reconcile ? await invocation.Service.ReconcileAsync(request, token)
                : await invocation.Service.ExecuteAsync(request, token);
            if (result.Receipt is null) return result;
            // SQL disposal is awaited before releasing data; a lost fence cannot imply
            // rollback or give a replacement operation permission to dispatch.
            return await invocation.FinalFence(token) ? result : new(InboundDraftOutcome.OutcomeUnknown,
                Code: "result_authority_changed_reconcile_only");
        }
    }

    private sealed class Invocation
    {
        private readonly InboundDraftCommandFactory owner;
        private readonly Func<CancellationToken, Task<AuthoritativeIdentity?>> resolve;
        private readonly InboundDraftSessionFence fence = new();
        internal SqlInboundDraftCommandService Service { get; }
        internal Invocation(InboundDraftCommandFactory owner, Func<CancellationToken, Task<AuthoritativeIdentity?>> resolve)
        {
            this.owner = owner; this.resolve = resolve;
            Service = new(owner.binding, owner.company, (Func<DbConnection>)owner.FreshConnection,
                SqlInboundDraftCommandService.NativeAuthority(Resolve), new NoDocumentAllocation());
        }
        private async Task<AuthoritativeIdentity?> Resolve(CancellationToken token)
        {
            token.ThrowIfCancellationRequested();
            var current = await resolve(token).WaitAsync(token);
            token.ThrowIfCancellationRequested();
            return current is not null && current.TenantId == owner.company.TenantId && current.CompanyId == owner.company.CompanyId
                && fence.TryAccept(current, out var accepted) ? accepted : null;
        }
        internal async Task<bool> FinalFence(CancellationToken token)
        {
            try { return await Resolve(token) is not null; }
            catch (Exception e) when (e is not OutOfMemoryException) { return false; }
        }
    }
}
