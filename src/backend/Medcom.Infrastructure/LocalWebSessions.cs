using System.Security.Cryptography;
using System.Text;
using Medcom.Application;
using Medcom.Contracts;

namespace Medcom.Infrastructure;

public sealed record WebSessionPolicy(TimeSpan IdleTimeout, TimeSpan AbsoluteTimeout, int Capacity)
{
    public static WebSessionPolicy Default { get; } = new(TimeSpan.FromMinutes(1440), TimeSpan.FromDays(7), 10000);
}

// Bounded, single-instance authority. With a file store, sessions survive a
// restart/deploy (token hashes only; each one revalidates against ERP on use);
// without one, restart revokes every Web session. This is not a distributed
// store; load-balanced deployment is gated.
public sealed class LocalWebSessions : IWebSessions, IDisposable
{
    private static readonly TimeSpan SaveDelay = TimeSpan.FromSeconds(2);

    private sealed record Entry(AuthoritativeIdentity Identity, DateTimeOffset LastActivity,
        DateTimeOffset AbsoluteExpiry, SemaphoreSlim RevalidationGate);

    private readonly Dictionary<string, Entry> entries = new(StringComparer.Ordinal);
    private readonly object gate = new();
    private readonly IIdentityAuthority authority;
    private readonly TimeProvider clock;
    private readonly WebSessionPolicy policy;
    private readonly WebSessionFileStore? store;
    private readonly object saveGate = new();
    private ITimer? pendingSave;
    private int saveScheduled;

    public LocalWebSessions(IIdentityAuthority authority, TimeProvider clock, WebSessionPolicy policy,
        WebSessionFileStore? store = null)
    {
        if (policy.IdleTimeout <= TimeSpan.Zero || policy.IdleTimeout > TimeSpan.FromDays(7)
            || policy.AbsoluteTimeout < policy.IdleTimeout || policy.AbsoluteTimeout > TimeSpan.FromDays(30)
            || policy.Capacity is < 1 or > 100000)
            throw new ArgumentOutOfRangeException(nameof(policy));
        this.authority = authority;
        this.clock = clock;
        this.policy = policy;
        this.store = store;
        if (store is null) return;
        var now = clock.GetUtcNow();
        foreach (var saved in store.Load())
        {
            var identity = Freeze(saved.Identity);
            var entry = identity is null ? null
                : new Entry(identity, saved.LastActivity, saved.AbsoluteExpiry, new SemaphoreSlim(1, 1));
            // A changed policy can only shorten a restored session, never extend it.
            if (entry is null || Expired(entry, now) || entry.AbsoluteExpiry > now + policy.AbsoluteTimeout
                || entries.Count >= policy.Capacity) continue;
            entries[saved.TokenHash] = entry;
        }
    }

    /// <summary>Writes the current sessions now (used on shutdown and by tests).</summary>
    public void Flush()
    {
        if (store is null) return;
        lock (saveGate)
        {
            // Reset first so a change made while saving schedules the next write.
            Interlocked.Exchange(ref saveScheduled, 0);
            Interlocked.Exchange(ref pendingSave, null)?.Dispose();
            WebSessionFileStore.Snapshot[] snapshot;
            var now = clock.GetUtcNow();
            lock (gate)
                snapshot = entries.Where(pair => !Expired(pair.Value, now))
                    .Select(pair => new WebSessionFileStore.Snapshot(pair.Key, pair.Value.Identity,
                        pair.Value.LastActivity, pair.Value.AbsoluteExpiry)).ToArray();
            store.Save(snapshot);
        }
    }

    public void Dispose() => Flush();

    // Coalesce bursts of activity into one write a couple of seconds later. Runs
    // under the session lock, so it never takes saveGate (Flush takes both).
    private void Changed()
    {
        if (store is null || Interlocked.Exchange(ref saveScheduled, 1) == 1) return;
        Interlocked.Exchange(ref pendingSave,
            clock.CreateTimer(_ => Flush(), null, SaveDelay, Timeout.InfiniteTimeSpan))?.Dispose();
    }

    public ResolvedSession? Create(AuthoritativeIdentity identity)
    {
        var frozen = Freeze(identity);
        if (frozen is null) return null;
        var now = clock.GetUtcNow();
        lock (gate)
        {
            foreach (var key in entries.Where(pair => Expired(pair.Value, now)).Select(pair => pair.Key).ToArray())
                entries.Remove(key);
            if (entries.Count >= policy.Capacity) return null;
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            var entry = new Entry(frozen, now, now + policy.AbsoluteTimeout, new SemaphoreSlim(1, 1));
            entries.Add(Hash(token), entry);
            Changed();
            return Resolve(token, entry);
        }
    }

    public Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction,
        CancellationToken cancellationToken) => Revalidate(token, userInteraction, false, cancellationToken);

    public Task<ResolvedSession?> ResolveReadAsync(string token, CancellationToken cancellationToken)
        => Revalidate(token, false, true, cancellationToken);

    private async Task<ResolvedSession?> Revalidate(string token, bool userInteraction,
        bool shareConcurrentObservation, CancellationToken cancellationToken)
    {
        if (token.Length != 64 || token.Any(c => !Uri.IsHexDigit(c))) return null;
        var key = Hash(token);
        Entry original;
        lock (gate)
        {
            if (!entries.TryGetValue(key, out original!) || Expired(original, clock.GetUtcNow()))
            {
                entries.Remove(key);
                return null;
            }
        }
        // One database observation at a time per session. Request-start sequence
        // numbers cannot order SQL snapshots when overlapping reads finish out
        // of order. Keep different sessions independent and preserve the gate
        // through immutable Entry replacements.
        var revalidationGate = original.RevalidationGate;
        var atRequestStart = original;
        await revalidationGate.WaitAsync(cancellationToken);
        try
        {
            lock (gate)
            {
                cancellationToken.ThrowIfCancellationRequested();
                // A queued validation must read the latest identity and cannot
                // begin a database read after logout or expiry.
                if (!entries.TryGetValue(key, out original!) || Expired(original, clock.GetUtcNow()))
                {
                    entries.Remove(key);
                    return null;
                }
                // Entry replacement proves a successful observation since this
                // invocation started. Only overlapping passive reads reuse it;
                // writes and explicit interactions always observe authority anew.
                if (shareConcurrentObservation && !ReferenceEquals(original, atRequestStart))
                    return Resolve(token, original);
            }
            var result = await authority.RevalidateAsync(original.Identity, cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            var currentIdentity = result.Outcome == IdentityOutcome.Success && result.Identity is not null
                ? Freeze(result.Identity) : null;
            lock (gate)
            {
                // Never resurrect a logout or a late validation result. Concurrent
                // validation may update activity/capabilities but cannot regress them.
                if (!entries.TryGetValue(key, out var latest)) return null;
                if (currentIdentity is null || Expired(latest, clock.GetUtcNow())
                    || currentIdentity.PrincipalId != latest.Identity.PrincipalId
                    || currentIdentity.TenantId != latest.Identity.TenantId
                    || currentIdentity.CompanyId != latest.Identity.CompanyId
                    || currentIdentity.CredentialStamp != latest.Identity.CredentialStamp)
                {
                    entries.Remove(key);
                    return null;
                }
                if (currentIdentity.AuthorityVersion < latest.Identity.AuthorityVersion) return null;
                if (currentIdentity.AuthorityVersion == latest.Identity.AuthorityVersion
                    && (!currentIdentity.Capabilities.SequenceEqual(latest.Identity.Capabilities)
                        || !currentIdentity.BranchIds!.SequenceEqual(latest.Identity.BranchIds!)))
                {
                    entries.Remove(key);
                    return null;
                }
                var updated = latest with
                {
                    Identity = currentIdentity,
                    LastActivity = userInteraction ? clock.GetUtcNow() : latest.LastActivity
                };
                entries[key] = updated;
                if (updated.LastActivity != latest.LastActivity || !ReferenceEquals(updated.Identity, latest.Identity))
                    Changed();
                return Resolve(token, updated);
            }
        }
        finally
        {
            revalidationGate.Release();
        }
    }

    // Read-only checkpoints already protected by native SQL authorization use this
    // to fence logout/expiry without opening another SQL connection while locks are held.
    // It never refreshes authority, advances activity, or resurrects a removed entry.
    public Task<ResolvedSession?> InspectAsync(string token, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (token.Length != 64 || token.Any(c => !Uri.IsHexDigit(c)))
            return Task.FromResult<ResolvedSession?>(null);
        lock (gate)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var key = Hash(token);
            if (!entries.TryGetValue(key, out var entry) || Expired(entry, clock.GetUtcNow()))
            {
                entries.Remove(key);
                return Task.FromResult<ResolvedSession?>(null);
            }
            return Task.FromResult<ResolvedSession?>(Resolve(token, entry));
        }
    }

    public void Revoke(string token)
    {
        bool removed;
        lock (gate) removed = entries.Remove(Hash(token));
        if (removed) Changed();
    }

    private bool Expired(Entry entry, DateTimeOffset now) =>
        now >= entry.AbsoluteExpiry || now >= entry.LastActivity + policy.IdleTimeout;

    private ResolvedSession Resolve(string token, Entry entry) => new(token, entry.Identity,
        new SessionView(entry.Identity.DisplayName, entry.Identity.TenantId, entry.Identity.CompanyId,
            entry.Identity.CompanyName, entry.Identity.AuthorityVersion,
            Min(entry.LastActivity + policy.IdleTimeout, entry.AbsoluteExpiry), entry.AbsoluteExpiry,
            entry.Identity.Capabilities, entry.Identity.RoleName));

    private static DateTimeOffset Min(DateTimeOffset left, DateTimeOffset right) => left < right ? left : right;
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static AuthoritativeIdentity? Freeze(AuthoritativeIdentity identity)
    {
        if (new[] { identity.PrincipalId, identity.TenantId, identity.CompanyId, identity.CompanyName,
                identity.DisplayName }.Any(value => string.IsNullOrWhiteSpace(value) || value.Length > 250)
            || identity.BranchIds is { Count: > 200 }
            || identity.BranchIds?.Any(value => string.IsNullOrWhiteSpace(value) || value.Length > 50) == true
            || identity.AuthorityVersion < 1 || identity.Capabilities is null
            || identity.Capabilities.Count > 256
            || identity.Capabilities.Any(value => string.IsNullOrWhiteSpace(value) || value.Length > 100))
            return null;
        return identity with { BranchIds = Array.AsReadOnly((identity.BranchIds ?? []).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray()), Capabilities = Array.AsReadOnly(identity.Capabilities
            .Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray()) };
    }
}
