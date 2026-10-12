using Medcom.Application;

namespace Medcom.Api;

// These providers perform native credential/branch/permission checks around SQL
// reads. Cookie validation already observed authority for this request; inspection
// supplies the current local identity and fences logout/expiry without repeating
// the complete login query. Mutation admission still revalidates independently.
internal static class NativeReadSession
{
    internal static async Task<AuthoritativeIdentity?> Resolve(HttpContext context,
        IWebSessions sessions, CancellationToken cancellation)
    {
        var token = AuthEndpoints.Current(context).Token;
        var session = HttpMethods.IsGet(context.Request.Method)
            ? await sessions.InspectAsync(token, cancellation)
            : await sessions.ResolveAsync(token, false, cancellation);
        return session?.Identity;
    }
}
