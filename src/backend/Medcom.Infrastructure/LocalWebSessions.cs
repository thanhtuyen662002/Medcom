using System.Security.Cryptography;
using System.Text;
using Medcom.Application;
using Medcom.Contracts;

namespace Medcom.Infrastructure;

public sealed record WebSessionPolicy(TimeSpan IdleTimeout, TimeSpan AbsoluteTimeout, int Capacity)
{
    public static WebSessionPolicy Default { get; } = new(TimeSpan.FromMinutes(1440), TimeSpan.FromDays(7), 10000);
}

// Bounded, single-instance authority. Restart intentionally revokes every Web
// session. This is not a distributed store; load-balanced deployment is gated.
public sealed class LocalWebSessions : IWebSessions
{
    private sealed record Entry(AuthoritativeIdentity Identity, DateTimeOffset LastActivity,
        DateTimeOffset AbsoluteExpiry);

    private readonly Dictionary<string, Entry> entries = new(StringComparer.Ordinal);
    private readonly object gate = new();
    private readonly IIdentityAuthority authority;
    private readonly TimeProvider clock;
    private readonly WebSessionPolicy policy;

    public LocalWebSessions(IIdentityAuthority authority, TimeProvider clock, WebSessionPolicy policy)
    {
        if (policy.IdleTimeout <= TimeSpan.Zero || policy.IdleTimeout > TimeSpan.FromDays(7)
            || policy.AbsoluteTimeout < policy.IdleTimeout || policy.AbsoluteTimeout > TimeSpan.FromDays(30)
            || policy.Capacity is < 1 or > 100000)
            throw new ArgumentOutOfRangeException(nameof(policy));
        this.authority = authority;
        this.clock = clock;
        this.policy = policy;
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
            var entry = new Entry(frozen, now, now + policy.AbsoluteTimeout);
            entries.Add(Hash(token), entry);
            return Resolve(token, entry);
        }
    }

    public async Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction,
        CancellationToken cancellationToken)
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
                || currentIdentity.CompanyId != latest.Identity.CompanyId)
            {
                entries.Remove(key);
                return null;
            }
            if (currentIdentity.AuthorityVersion < latest.Identity.AuthorityVersion) return null;
            if (currentIdentity.AuthorityVersion == latest.Identity.AuthorityVersion
                && !currentIdentity.Capabilities.SequenceEqual(latest.Identity.Capabilities))
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
            return Resolve(token, updated);
        }
    }

    public void Revoke(string token)
    {
        lock (gate) entries.Remove(Hash(token));
    }

    private bool Expired(Entry entry, DateTimeOffset now) =>
        now >= entry.AbsoluteExpiry || now >= entry.LastActivity + policy.IdleTimeout;

    private ResolvedSession Resolve(string token, Entry entry) => new(token, entry.Identity,
        new SessionView(entry.Identity.DisplayName, entry.Identity.TenantId, entry.Identity.CompanyId,
            entry.Identity.CompanyName, entry.Identity.AuthorityVersion,
            Min(entry.LastActivity + policy.IdleTimeout, entry.AbsoluteExpiry), entry.AbsoluteExpiry,
            entry.Identity.Capabilities));

    private static DateTimeOffset Min(DateTimeOffset left, DateTimeOffset right) => left < right ? left : right;
    private static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static AuthoritativeIdentity? Freeze(AuthoritativeIdentity identity)
    {
        if (new[] { identity.PrincipalId, identity.TenantId, identity.CompanyId, identity.CompanyName,
                identity.DisplayName }.Any(value => string.IsNullOrWhiteSpace(value) || value.Length > 250)
            || identity.AuthorityVersion < 1 || identity.Capabilities is null
            || identity.Capabilities.Count > 256
            || identity.Capabilities.Any(value => string.IsNullOrWhiteSpace(value) || value.Length > 100))
            return null;
        return identity with { Capabilities = Array.AsReadOnly(identity.Capabilities
            .Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray()) };
    }
}
