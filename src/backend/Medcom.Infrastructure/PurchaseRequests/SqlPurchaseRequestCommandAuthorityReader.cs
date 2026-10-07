using System.Data;
using System.Data.Common;
using System.Globalization;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;

namespace Medcom.Infrastructure.PurchaseRequests;

public enum PurchaseRequestCommandAuthorityOutcome { Unavailable, Denied, Admitted, Cancelled }

/// <summary>
/// Point-in-time native EDIT authority, NOT draft eligibility or permission to bypass
/// the I14/I19 transaction gates. No receipt, credential or document payload is returned.
/// Every SQL statement comes unchanged from PurchaseRequestSql's fixed SELECT plans.
/// </summary>
public sealed class SqlPurchaseRequestCommandAuthorityReader
{
    private readonly Guid binding;
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> connections;
    private readonly Func<CancellationToken, Task<AuthoritativeIdentity?>> session;
    private readonly PurchaseRequestCommandRuntimeAcceptance? acceptance;
    private readonly Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspect;

    internal SqlPurchaseRequestCommandAuthorityReader(Guid databaseBindingId, LegacyCompany company,
        Func<DbConnection> connections, Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession,
        PurchaseRequestCommandRuntimeAcceptance? acceptance = null,
        Func<CancellationToken, Task<AuthoritativeIdentity?>>? inspectLocalSession = null)
    {
        binding = databaseBindingId;
        this.company = company ?? throw new ArgumentNullException(nameof(company));
        this.connections = connections ?? throw new ArgumentNullException(nameof(connections));
        session = resolveLiveSession ?? throw new ArgumentNullException(nameof(resolveLiveSession));
        this.acceptance = acceptance;
        inspect = inspectLocalSession;
    }

    public async Task<PurchaseRequestCommandAuthorityOutcome> ReadAsync(string documentId, string branchId,
        CancellationToken token = default)
    {
        // An absent attestation must not even invoke the live-session resolver: that
        // resolver may perform its own SQL revalidation. A SELECT probe cannot qualify us.
        if (acceptance?.Covers(binding, company) != true || inspect is null) return PurchaseRequestCommandAuthorityOutcome.Unavailable;
        if (!PurchaseRequestCommandRules.Identifier(documentId, 50)
            || !PurchaseRequestCommandRules.Identifier(branchId, 50)) return PurchaseRequestCommandAuthorityOutcome.Denied;
        if (token.IsCancellationRequested) return PurchaseRequestCommandAuthorityOutcome.Cancelled;
        if (System.Transactions.Transaction.Current is not null) return PurchaseRequestCommandAuthorityOutcome.Unavailable;

        DbConnection? connection = null;
        DbTransaction? transaction = null;
        var sessionFence = new PurchaseRequestSessionFence();
        AuthoritativeIdentity? first = null;
        var owned = false;
        var cleanupOk = true;
        var answer = PurchaseRequestCommandAuthorityOutcome.Unavailable;
        try
        {
            var observed = await Resolve(branchId, token);
            if (!sessionFence.TryAccept(observed, out first)) answer = PurchaseRequestCommandAuthorityOutcome.Denied;
            else
            {
                connection = connections();
                if (connection is null || connection.State != ConnectionState.Closed)
                    return PurchaseRequestCommandAuthorityOutcome.Unavailable;
                owned = true;
                await connection.OpenAsync(token);
                var started = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);
                // Never roll back/dispose a transaction reporting a foreign owner.
                if (!ReferenceEquals(started.Connection, connection)) return PurchaseRequestCommandAuthorityOutcome.Unavailable;
                transaction = started;
                if (transaction.IsolationLevel != IsolationLevel.Serializable)
                    return PurchaseRequestCommandAuthorityOutcome.Unavailable;
                answer = await Observe(transaction, first, sessionFence, documentId, branchId, token);
            }
        }
        catch (OperationCanceledException) { answer = PurchaseRequestCommandAuthorityOutcome.Cancelled; }
        catch (Exception) { answer = PurchaseRequestCommandAuthorityOutcome.Unavailable; }
        finally
        {
            // No COMMIT, DML/DDL, procedure, allocator or journal reservation in admission.
            if (transaction is not null)
            {
                try { await transaction.RollbackAsync(CancellationToken.None); } catch (Exception) { cleanupOk = false; }
                try { await transaction.DisposeAsync(); } catch (Exception) { cleanupOk = false; }
            }
            if (owned && connection is not null)
                try { await connection.DisposeAsync(); } catch (Exception) { cleanupOk = false; }
        }
        if (!cleanupOk) return PurchaseRequestCommandAuthorityOutcome.Unavailable;
        if (answer != PurchaseRequestCommandAuthorityOutcome.Admitted) return answer;
        try
        {
            // Cleanup awaited: logout/cancel there must not release a stale positive.
            token.ThrowIfCancellationRequested();
            var last = await Resolve(branchId, token);
            token.ThrowIfCancellationRequested();
            return sessionFence.TryAccept(last, out _) ? answer : PurchaseRequestCommandAuthorityOutcome.Denied;
        }
        catch (OperationCanceledException) { return PurchaseRequestCommandAuthorityOutcome.Cancelled; }
        catch (Exception) { return PurchaseRequestCommandAuthorityOutcome.Unavailable; }
    }

    private async Task<PurchaseRequestCommandAuthorityOutcome> Observe(DbTransaction tx,
        AuthoritativeIdentity first, PurchaseRequestSessionFence sessionFence, string document, string branch, CancellationToken token)
    {
        // Bind the actual database before reading any document/credential rows.
        if (!await Probe(tx, token) || !await TransactionValid(tx, token))
            return PurchaseRequestCommandAuthorityOutcome.Unavailable;
        if (!await Authority(tx, first, branch, token)) return PurchaseRequestCommandAuthorityOutcome.Denied;
        if (!await DocumentInScope(tx, document, branch, token)) return PurchaseRequestCommandAuthorityOutcome.Denied;
        if (!await TransactionValid(tx, token)) return PurchaseRequestCommandAuthorityOutcome.Unavailable;
        var live = await Resolve(branch, token, localOnly: true);
        if (!sessionFence.TryAccept(live, out var accepted) || !await Authority(tx, accepted, branch, token))
            return PurchaseRequestCommandAuthorityOutcome.Denied;
        token.ThrowIfCancellationRequested();
        return PurchaseRequestCommandAuthorityOutcome.Admitted;
    }

    private async Task<AuthoritativeIdentity?> Resolve(string branch, CancellationToken token, bool localOnly = false)
    {
        token.ThrowIfCancellationRequested();
        var id = await (localOnly ? inspect!(token) : session(token)).WaitAsync(token);
        token.ThrowIfCancellationRequested();
        if (id is null || id.TenantId != company.TenantId || id.CompanyId != company.CompanyId
            || !PurchaseRequestCommandRules.Identifier(id.PrincipalId, 100)
            || !PurchaseRequestCommandRules.Identifier(id.TenantId, 100)
            || !PurchaseRequestCommandRules.Identifier(id.CompanyId, 100)
            || string.IsNullOrEmpty(id.CredentialStamp) || id.AuthorityVersion < 1
            || id.BranchIds is null || id.BranchIds.Count > 200 || id.Capabilities is null) return null;
        var frozen = id with { BranchIds = Array.AsReadOnly(id.BranchIds.ToArray()),
            Capabilities = Array.AsReadOnly(id.Capabilities.ToArray()) };
        return frozen.BranchIds!.Contains(branch, StringComparer.Ordinal) ? frozen : null;
    }

    private static async Task<bool> Authority(DbTransaction tx, AuthoritativeIdentity id, string branch, CancellationToken token)
    {
        LegacyUser user;
        await using (var cmd = PurchaseRequestSql.Command(tx, PurchaseRequestSql.CredentialText))
        {
            PurchaseRequestSql.Parameter(cmd, "@actor", DbType.String, id.PrincipalId, 100);
            await using var r = await cmd.ExecuteReaderAsync(token);
            Shape(r, typeof(string), typeof(string), typeof(bool), typeof(string), typeof(bool));
            if (!await r.ReadAsync(token)) return false;
            Required(r, 0, 1, 2, 3, 4);
            user = new(r.GetString(0), "", r.GetString(1), r.GetBoolean(2), r.GetString(3), !r.GetBoolean(4));
            if (user.Username != id.PrincipalId || user.Disabled || !user.GroupEnabled
                || !PurchaseRequestCommandRules.Identifier(user.GroupId, 20) || string.IsNullOrEmpty(user.StoredHash)
                || LegacyIdentityAuthority.Stamp(user) != id.CredentialStamp) return false;
            await End(r, token);
        }
        await using (var cmd = PurchaseRequestSql.Command(tx, PurchaseRequestSql.GrantsText))
        {
            PurchaseRequestSql.Parameter(cmd, "@username", DbType.String, id.PrincipalId, 100);
            PurchaseRequestSql.Parameter(cmd, "@group", DbType.String, user.GroupId, 20);
            PurchaseRequestSql.Parameter(cmd, "@menu", DbType.String, PurchaseRequestCommandRules.MenuId, 50);
            await using var r = await cmd.ExecuteReaderAsync(token);
            Shape(r, typeof(string), typeof(string), typeof(string), typeof(bool), typeof(string), typeof(bool), typeof(int), typeof(int));
            if (!await r.ReadAsync(token)) return false;
            Required(r, 0, 1, 3, 4, 5, 6, 7);
            // CanUpdate is the existing SQL's per-route conjunction Run AND Update.
            // Neither CanAdd nor the read-pilot capability confers EDIT authority.
            if (r.GetString(0) != PurchaseRequestCommandRules.MenuId || r.GetString(1) != PurchaseRequestCommandRules.FormId
                || (!r.IsDBNull(2) && r.GetString(2).Length != 0) || r.GetBoolean(3)
                || r.GetString(4) != "05" || r.GetBoolean(5) || r.GetInt32(7) != 1) return false;
            await End(r, token);
        }
        // Native blank expands only through the reviewed catalog resolver; the live
        // identity's exact branch membership remains an independent fence.
        var branches = await SqlLegacyBranchScope.ReadAsync(tx, user, token);
        return branches.Contains(branch, StringComparer.Ordinal);
    }

    private async Task<bool> Probe(DbTransaction tx, CancellationToken token)
    {
        await using var cmd = PurchaseRequestSql.Command(tx, PurchaseRequestSql.ProbeText);
        await using var r = await cmd.ExecuteReaderAsync(token);
        Shape(r, typeof(int), typeof(Guid), typeof(int), typeof(int));
        if (!await r.ReadAsync(token)) return false;
        Required(r, 0, 1, 2, 3);
        var valid = r.GetInt32(0) == 1 && r.GetGuid(1) == binding && r.GetInt32(2) == 1 && r.GetInt32(3) == 1;
        await End(r, token);
        return valid;
    }

    private static async Task<bool> TransactionValid(DbTransaction tx, CancellationToken token)
    {
        await using var cmd = PurchaseRequestSql.Command(tx, PurchaseRequestSql.TransactionText);
        await using var r = await cmd.ExecuteReaderAsync(token);
        Shape(r, typeof(int), typeof(int));
        if (!await r.ReadAsync(token)) return false;
        Required(r, 0, 1);
        var valid = r.GetInt32(0) == 1 && r.GetInt32(1) == 1;
        await End(r, token);
        return valid;
    }

    private static async Task<bool> DocumentInScope(DbTransaction tx, string document, string branch, CancellationToken token)
    {
        PurchaseRequestAggregate head;
        await using (var cmd = PurchaseRequestSql.Command(tx, PurchaseRequestSql.HeadText))
        {
            PurchaseRequestSql.Document(cmd, document);
            await using var r = await cmd.ExecuteReaderAsync(token);
            Shape(r, typeof(string), typeof(DateTime), typeof(int), typeof(string), typeof(string), typeof(string),
                typeof(decimal), typeof(string), typeof(int), typeof(bool), typeof(string), typeof(string), typeof(double), typeof(string));
            if (!await r.ReadAsync(token))
            {
                if (await r.NextResultAsync(token)) throw new InvalidOperationException("Unexpected result.");
                return false;
            }
            Required(r, 0, 3, 4, 8, 10, 11, 12, 13);
            if (r.GetString(0) != document || r.GetString(13) != branch) return false;
            var header = new PurchaseRequestHeaderInput(r.IsDBNull(1) ? null : r.GetDateTime(1).ToString("yyyy-MM-dd'T'HH:mm:ss.fff", CultureInfo.InvariantCulture),
                r.IsDBNull(2) ? null : r.GetInt32(2), r.GetString(3), r.GetString(4), r.IsDBNull(5) ? null : r.GetString(5),
                r.IsDBNull(6) ? null : r.GetDecimal(6).ToString("0.00", CultureInfo.InvariantCulture), r.IsDBNull(7) ? null : r.GetString(7),
                r.GetString(10), r.GetString(11), r.GetDouble(12));
            // DO NOT gate on StatusId/IsLocked here. Submit changes these itself;
            // post-dispatch receipt access and historical lookup must remain possible.
            head = new(document, branch, header, r.GetInt32(8), r.IsDBNull(9) ? null : r.GetBoolean(9), []);
            await End(r, token);
        }
        var lines = new List<PurchaseRequestPersistedLine>();
        await using (var cmd = PurchaseRequestSql.Command(tx, PurchaseRequestSql.DetailsText))
        {
            PurchaseRequestSql.Document(cmd, document);
            await using var r = await cmd.ExecuteReaderAsync(token);
            Shape(r, typeof(string), typeof(string), typeof(decimal), typeof(string), typeof(decimal), typeof(decimal), typeof(decimal), typeof(string), typeof(string));
            while (await r.ReadAsync(token))
            {
                if (lines.Count == PurchaseRequestCommandRules.MaxLines) throw new InvalidOperationException("Detail bound.");
                Required(r, 0, 1, 4, 5, 8);
                // Reuse the full native FK relation, then reject physical aliases.
                // Do not filter away a case/accent/space-owned child before checking it.
                if (r.GetString(8) != document) return false;
                string? D(int i) => r.IsDBNull(i) ? null : r.GetDecimal(i).ToString("0", CultureInfo.InvariantCulture);
                lines.Add(new(r.GetString(0), new(r.GetString(1), D(2), r.IsDBNull(3) ? null : r.GetString(3),
                    D(4)!, D(5)!, D(6), r.IsDBNull(7) ? null : r.GetString(7))));
            }
            if (await r.NextResultAsync(token)) throw new InvalidOperationException("Unexpected result.");
        }
        _ = PurchaseRequestCommandRules.Normalize(head with { Lines = lines });
        return true;
    }

    private static void Shape(DbDataReader r, params Type[] types)
    {
        if (r.FieldCount != types.Length || types.Where((t, i) => r.GetFieldType(i) != t).Any())
            throw new InvalidOperationException("Unexpected row shape.");
    }
    private static void Required(DbDataReader r, params int[] columns)
    {
        if (columns.Any(r.IsDBNull)) throw new InvalidOperationException("Required field missing.");
    }
    private static async Task End(DbDataReader r, CancellationToken token)
    {
        if (await r.ReadAsync(token) || await r.NextResultAsync(token)) throw new InvalidOperationException("Unexpected result.");
    }
}
