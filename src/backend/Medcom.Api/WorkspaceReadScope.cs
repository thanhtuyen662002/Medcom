using System.Security.Cryptography;
using System.Text.Json;
using Medcom.Application;

namespace Medcom.Api;

// Correlation only: these public opaque digests are never accepted as credentials
// or grants. The random 256-bit server session token prevents guessing identities
// or rights from their digest. Observation versions and expiry are not identity.
internal static class WorkspaceReadScope
{
    internal const string SessionHeader = "X-Medcom-Session-Scope";
    internal const string ReadHeader = "X-Medcom-Read-Scope";
    internal static string Session(ResolvedSession session) => Digest(new[]
        { "medcom-workspace-session-v1", session.Token });
    internal static string Read(ResolvedSession session) => Digest(new object[]
    {
        "medcom-workspace-read-v1", session.Token, session.Identity.PrincipalId,
        session.Identity.TenantId, session.Identity.CompanyId,
        Canonical(session.Identity.Capabilities), Canonical(session.Identity.BranchIds ?? [])
    });
    internal static void Stamp(HttpContext context, ResolvedSession session)
    {
        context.Response.Headers[SessionHeader] = Session(session);
        context.Response.Headers[ReadHeader] = Read(session);
    }
    private static string[] Canonical(IReadOnlyList<string> values) =>
        values.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
    private static string Digest<T>(T value) =>
        Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value)));
}
