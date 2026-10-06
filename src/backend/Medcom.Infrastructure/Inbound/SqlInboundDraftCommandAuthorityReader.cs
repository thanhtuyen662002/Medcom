using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;

namespace Medcom.Infrastructure.Inbound;

public enum InboundDraftCommandAuthorityOutcome { Unavailable, Denied, Admitted, Cancelled }
public sealed record InboundDraftCommandAuthorityObservation(InboundDraftCommandAuthorityOutcome Outcome, string? BranchId = null);

// A read-only observation of native Run AND Update and the physical document.
// Reuses I15's actual reader and aggregate checks, not a second permission plan.
public sealed class SqlInboundDraftCommandAuthorityReader
{
    private readonly Guid binding;
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> connections;
    private readonly Func<CancellationToken, Task<AuthoritativeIdentity?>> resolve;
    private readonly InboundDraftCommandRuntimeAcceptance? acceptance;

    internal SqlInboundDraftCommandAuthorityReader(Guid binding, LegacyCompany company, Func<DbConnection> connections,
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolve, InboundDraftCommandRuntimeAcceptance? acceptance)
    {
        this.binding = binding; this.company = company; this.connections = connections;
        this.resolve = resolve ?? throw new ArgumentNullException(nameof(resolve)); this.acceptance = acceptance;
    }

    public async Task<InboundDraftCommandAuthorityObservation> ReadAsync(string documentId, CancellationToken token = default)
    {
        // A session resolver may itself query SQL. Check external qualification first.
        if (acceptance?.Covers(binding, company) != true) return new(InboundDraftCommandAuthorityOutcome.Unavailable);
        if (!InboundDraftValidation.Ansi(documentId, 50)) return new(InboundDraftCommandAuthorityOutcome.Denied);
        if (token.IsCancellationRequested) return new(InboundDraftCommandAuthorityOutcome.Cancelled);
        if (System.Transactions.Transaction.Current is not null) return new(InboundDraftCommandAuthorityOutcome.Unavailable);
        var fence = new InboundDraftSessionFence();
        async Task<AuthoritativeIdentity?> Live(CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            var observed = await resolve(ct).WaitAsync(ct);
            ct.ThrowIfCancellationRequested();
            return observed is not null && observed.TenantId == company.TenantId && observed.CompanyId == company.CompanyId
                && fence.TryAccept(observed, out var accepted) ? accepted : null;
        }
        var native = SqlInboundDraftCommandService.NativeAuthority(Live);
        DbConnection? connection = null;
        DbTransaction? transaction = null;
        var owned = false;
        var cleanupOk = true;
        var answer = new InboundDraftCommandAuthorityObservation(InboundDraftCommandAuthorityOutcome.Unavailable);
        try
        {
            var first = await Live(token);
            if (first is null) answer = new(InboundDraftCommandAuthorityOutcome.Denied);
            else
            {
                connection = connections();
                if (connection is null || connection.State != ConnectionState.Closed)
                    return new(InboundDraftCommandAuthorityOutcome.Unavailable);
                owned = true;
                await connection.OpenAsync(token);
                var started = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);
                // Never roll back or dispose a transaction reporting a foreign owner.
                if (!ReferenceEquals(started.Connection, connection)) return new(InboundDraftCommandAuthorityOutcome.Unavailable);
                transaction = started;
                if (transaction.IsolationLevel != IsolationLevel.Serializable) return new(InboundDraftCommandAuthorityOutcome.Unavailable);
                var grants = await native.ReadGrantsAsync(transaction, first, InboundDraftAction.Save, token);
                if (grants is not { Count: > 0 and <= 200 }) answer = new(InboundDraftCommandAuthorityOutcome.Denied);
                else
                {
                    var branch = await SqlInboundDraftCommandService.ReadAuthorizedDocumentBranchAsync(transaction, documentId, grants, token);
                    var last = await Live(token);
                    if (branch is null || last is null) answer = new(InboundDraftCommandAuthorityOutcome.Denied);
                    else
                    {
                        var current = await native.ReadGrantsAsync(transaction, last, InboundDraftAction.Save, token);
                        answer = current?.Contains(branch, StringComparer.Ordinal) == true
                            ? new(InboundDraftCommandAuthorityOutcome.Admitted, branch)
                            : new(InboundDraftCommandAuthorityOutcome.Denied);
                    }
                }
            }
        }
        catch (OperationCanceledException) { answer = new(InboundDraftCommandAuthorityOutcome.Cancelled); }
        catch (Exception e) when (e is not OutOfMemoryException) { answer = new(InboundDraftCommandAuthorityOutcome.Unavailable); }
        finally
        {
            // Admission cannot commit, reserve an operation, allocate or mutate.
            if (transaction is not null)
            {
                try { await transaction.RollbackAsync(CancellationToken.None); } catch (Exception e) when (e is not OutOfMemoryException) { cleanupOk = false; }
                try { await transaction.DisposeAsync(); } catch (Exception e) when (e is not OutOfMemoryException) { cleanupOk = false; }
            }
            if (owned && connection is not null)
                try { await connection.DisposeAsync(); } catch (Exception e) when (e is not OutOfMemoryException) { cleanupOk = false; }
        }
        if (!cleanupOk) return new(InboundDraftCommandAuthorityOutcome.Unavailable);
        if (answer.Outcome != InboundDraftCommandAuthorityOutcome.Admitted) return answer;
        try
        {
            // Cleanup is an await boundary too: never publish stale positive access.
            return await Live(token) is not null ? answer : new(InboundDraftCommandAuthorityOutcome.Denied);
        }
        catch (OperationCanceledException) { return new(InboundDraftCommandAuthorityOutcome.Cancelled); }
        catch (Exception e) when (e is not OutOfMemoryException) { return new(InboundDraftCommandAuthorityOutcome.Unavailable); }
    }
}
