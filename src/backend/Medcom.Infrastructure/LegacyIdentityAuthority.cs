using System.Security.Cryptography;
using System.Text;
using Medcom.Application;
using Medcom.Contracts;

namespace Medcom.Infrastructure;

// Private adapter data. Never use this record as an API response or log field.
public sealed record LegacyUser(string Username, string DisplayName, string StoredHash,
    bool Disabled, string? GroupId, bool GroupEnabled, IReadOnlyList<string>? Capabilities = null,
    IReadOnlyList<string>? BranchIds = null, BranchSelection? BranchSelection = null);
public interface ILegacyUserStore
{
    Task<LegacyUser?> FindAsync(string username, CancellationToken cancellationToken);
}
public sealed record LegacyCompany(string TenantId, string CompanyId, string CompanyName);

public sealed class LegacyIdentityAuthority(ILegacyUserStore users, ILegacyPasswordVerifier passwords,
    LegacyCompany company) : IIdentityAuthority
{
    private long sequence;
    public async Task<IdentityResult> AuthenticateAsync(string username, string password,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Length > 100 || password.Length is 0 or > 1024)
            return new(IdentityOutcome.Rejected);
        var version = Interlocked.Increment(ref sequence);
        try
        {
            var user = await users.FindAsync(username.Trim(), cancellationToken);
            if (!Enabled(user)) return new(IdentityOutcome.Rejected);
            var outcome = await passwords.VerifyAsync(user!.Username, password, user.StoredHash, cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            return outcome switch
            {
                PasswordOutcome.Accepted => new(IdentityOutcome.Success, Identity(user, version)),
                PasswordOutcome.Rejected => new(IdentityOutcome.Rejected),
                _ => new(IdentityOutcome.Unavailable)
            };
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested) { return new(IdentityOutcome.Unavailable); }
    }

    public async Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity,
        CancellationToken cancellationToken)
    {
        if (identity.TenantId != company.TenantId || identity.CompanyId != company.CompanyId
            || identity.CredentialStamp is null) return new(IdentityOutcome.Rejected);
        var version = Interlocked.Increment(ref sequence);
        try
        {
            var user = await users.FindAsync(identity.PrincipalId, cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();
            if (!Enabled(user) || user!.Username != identity.PrincipalId
                || Stamp(user) != identity.CredentialStamp) return new(IdentityOutcome.Rejected);
            return new(IdentityOutcome.Success, Identity(user, version));
        }
        catch (Exception) when (!cancellationToken.IsCancellationRequested) { return new(IdentityOutcome.Unavailable); }
    }

    private static bool Enabled(LegacyUser? user) => user is { Disabled: false, GroupEnabled: true }
        && !string.IsNullOrWhiteSpace(user.Username) && !string.IsNullOrWhiteSpace(user.DisplayName)
        && !string.IsNullOrWhiteSpace(user.StoredHash) && !string.IsNullOrWhiteSpace(user.GroupId);
    internal static string Stamp(LegacyUser user) => Convert.ToHexString(SHA256.HashData(
        Encoding.UTF8.GetBytes(user.Username + "\0" + user.StoredHash + "\0" + user.GroupId)));
    private AuthoritativeIdentity Identity(LegacyUser user, long version) => new(user.Username, company.TenantId,
        company.CompanyId, company.CompanyName, user.DisplayName, version, ["platform.status", .. user.Capabilities ?? []],
        Stamp(user), user.BranchIds, user.BranchSelection);
}
