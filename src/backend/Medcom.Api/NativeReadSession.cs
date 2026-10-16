using Medcom.Application;

namespace Medcom.Api;

// These providers perform native credential/branch/permission checks around SQL
// reads, including explicitly registered read-only POSTs. Cookie validation
// already observed authority for this request; inspection
// supplies the current local identity and fences logout/expiry without repeating
// the complete login query. Mutation admission still revalidates independently.
internal static class NativeReadSession
{
    // Only endpoint registration can grant this marker. HTTP headers, bodies and
    // path suffixes cannot select the cheaper read admission for a command.
    internal sealed record SqlReadOperation;
    internal static bool IsRead(HttpContext context)=>HttpMethods.IsGet(context.Request.Method)
        ||HttpMethods.IsPost(context.Request.Method)&&context.GetEndpoint()?.Metadata.GetMetadata<SqlReadOperation>() is not null;

    internal static async Task<AuthoritativeIdentity?> Resolve(HttpContext context,
        IWebSessions sessions, CancellationToken cancellation)
    {
        var token = AuthEndpoints.Current(context).Token;
        var session = IsRead(context)
            ? await sessions.InspectAsync(token, cancellation)
            : await sessions.ResolveAsync(token, false, cancellation);
        return session?.Identity;
    }
}
