using Medcom.Contracts;

namespace Medcom.Application;

public enum IdentityOutcome { Success, Rejected, Unavailable }

// Only the verified server adapter creates this identity. No legacy password,
// connection string or executable configuration crosses this boundary.
public sealed record AuthoritativeIdentity(string PrincipalId, string TenantId,
    string CompanyId, string CompanyName, string DisplayName, long AuthorityVersion,
    IReadOnlyList<string> Capabilities, string? CredentialStamp = null, IReadOnlyList<string>? BranchIds = null,
    BranchSelection? BranchSelection = null, string? RoleName = null);

public sealed record IdentityResult(IdentityOutcome Outcome, AuthoritativeIdentity? Identity = null);

public interface IIdentityAuthority
{
    Task<IdentityResult> AuthenticateAsync(string username, string password, CancellationToken cancellationToken);
    Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity, CancellationToken cancellationToken);
}

public sealed record ResolvedSession(string Token, AuthoritativeIdentity Identity, SessionView View);

public interface IWebSessions
{
    ResolvedSession? Create(AuthoritativeIdentity identity);
    Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction, CancellationToken cancellationToken);
    // Passive reads may share a successful observation completed while they were
    // waiting. A request beginning after it completes must revalidate again.
    // This is not a time-based authority cache and never extends session activity.
    Task<ResolvedSession?> ResolveReadAsync(string token, CancellationToken cancellationToken)
        => ResolveAsync(token, false, cancellationToken);
    // Liveness only, never proof of current database authority. Implementations without
    // a local session store conservatively retain full revalidation.
    Task<ResolvedSession?> InspectAsync(string token, CancellationToken cancellationToken)
        => ResolveAsync(token, false, cancellationToken);
    void Revoke(string token);
}
