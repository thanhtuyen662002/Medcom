using Medcom.Contracts;

namespace Medcom.Application;

public enum IdentityOutcome { Success, Rejected, Unavailable }

// Only the verified server adapter creates this identity. No legacy password,
// connection string or executable configuration crosses this boundary.
public sealed record AuthoritativeIdentity(string PrincipalId, string TenantId,
    string CompanyId, string CompanyName, string DisplayName, long AuthorityVersion,
    IReadOnlyList<string> Capabilities, string? CredentialStamp = null, IReadOnlyList<string>? BranchIds = null);

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
    void Revoke(string token);
}
