using Medcom.Application;
using Medcom.Application.PurchaseRequests;

namespace Medcom.Infrastructure.PurchaseRequests;

/// <summary>
/// Purchase-command observation fence. One instance belongs to exactly one
/// admission/command/lookup invocation. It preserves the security scope while
/// allowing the existing session authority to advance its observation version.
/// </summary>
public sealed class PurchaseRequestSessionFence
{
    private SecurityScope? scope;
    private long lastAcceptedVersion;

    public long LastAcceptedVersion => lastAcceptedVersion;

    public bool TryAccept(AuthoritativeIdentity? observed, out AuthoritativeIdentity accepted)
    {
        accepted = null!;
        if (observed is null || observed.AuthorityVersion < 1
            || !PurchaseRequestCommandRules.Identifier(observed.PrincipalId, 100)
            || !PurchaseRequestCommandRules.Identifier(observed.TenantId, 100)
            || !PurchaseRequestCommandRules.Identifier(observed.CompanyId, 100)
            || string.IsNullOrEmpty(observed.CredentialStamp)
            || !TryCanonicalize(observed.Capabilities, 256, 100, out var capabilities)
            || !TryCanonicalize(observed.BranchIds, 200, 50, out var branches)) return false;

        var current = new SecurityScope(observed.PrincipalId, observed.TenantId, observed.CompanyId,
            observed.CredentialStamp!, capabilities, branches);
        if (scope is not null && (!scope.Matches(current) || observed.AuthorityVersion < lastAcceptedVersion))
            return false;

        scope ??= current;
        lastAcceptedVersion = observed.AuthorityVersion;
        accepted = observed with
        {
            Capabilities = Array.AsReadOnly(capabilities),
            BranchIds = Array.AsReadOnly(branches)
        };
        return true;
    }

    private static bool TryCanonicalize(IReadOnlyList<string>? values, int maximumCount, int maximumLength,
        out string[] canonical)
    {
        canonical = [];
        if (values is null || values.Count > maximumCount
            || values.Any(value => string.IsNullOrWhiteSpace(value) || value.Length > maximumLength)) return false;
        canonical = values.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        return true;
    }

    private sealed record SecurityScope(string PrincipalId, string TenantId, string CompanyId,
        string CredentialStamp, string[] Capabilities, string[] Branches)
    {
        public bool Matches(SecurityScope other) => PrincipalId == other.PrincipalId
            && TenantId == other.TenantId && CompanyId == other.CompanyId
            && CredentialStamp == other.CredentialStamp
            && Capabilities.SequenceEqual(other.Capabilities, StringComparer.Ordinal)
            && Branches.SequenceEqual(other.Branches, StringComparer.Ordinal);
    }
}
