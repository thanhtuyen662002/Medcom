using Medcom.Application;
using Medcom.Application.Inbound;

namespace Medcom.Infrastructure.Inbound;

// Exactly one invocation owns this tracker. Versions are authority observations;
// accept real increases, but freeze all security scope and never rewrite versions.
public sealed class InboundDraftSessionFence
{
    private AuthoritativeIdentity? first;
    public long LastAcceptedVersion { get; private set; }

    public bool TryAccept(AuthoritativeIdentity? observed, out AuthoritativeIdentity accepted)
    {
        accepted = null!;
        if (observed is null || observed.AuthorityVersion < 1
            || !InboundDraftValidation.Ansi(observed.PrincipalId, 50)
            || !Identifier(observed.TenantId, 100) || !Identifier(observed.CompanyId, 100)
            || string.IsNullOrWhiteSpace(observed.CredentialStamp)
            || !Canonical(observed.Capabilities, 256, 100, out var capabilities)
            || !Canonical(observed.BranchIds, 200, 50, out var branches)) return false;
        var current = observed with
        {
            Capabilities = Array.AsReadOnly(capabilities), BranchIds = Array.AsReadOnly(branches)
        };
        if (first is not null && (current.AuthorityVersion < LastAcceptedVersion
            || first.PrincipalId != current.PrincipalId || first.TenantId != current.TenantId
            || first.CompanyId != current.CompanyId || first.CredentialStamp != current.CredentialStamp
            || !first.Capabilities.SequenceEqual(current.Capabilities, StringComparer.Ordinal)
            || !first.BranchIds!.SequenceEqual(current.BranchIds!, StringComparer.Ordinal))) return false;
        first ??= current;
        LastAcceptedVersion = current.AuthorityVersion;
        accepted = current;
        return true;
    }

    internal static bool Identifier(string? value, int limit) => !string.IsNullOrWhiteSpace(value)
        && InboundDraftValidation.Text(value, limit, true) && !value.Any(char.IsControl);

    private static bool Canonical(IReadOnlyList<string>? values, int count, int length, out string[] result)
    {
        result = [];
        if (values is null || values.Count > count || values.Any(value => !Identifier(value, length))) return false;
        result = values.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        return true;
    }
}
