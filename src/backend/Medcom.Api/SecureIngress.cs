namespace Medcom.Api;

/// <summary>
/// Explicit operator assertion that every path to this listener is secure and trusted.
/// This does not authenticate a proxy or read client-supplied forwarding headers.
/// </summary>
public static class SecureIngress
{
    public const string ConfigurationKey = "Medcom:Ingress:AllRequestsSecure";
    private const string ConfigurationError = "Secure ingress requires a valid boolean and explicit exact AllowedHosts.";

    public static bool ReadConfiguration(IConfiguration configuration)
    {
        var value = configuration[ConfigurationKey];
        if (value is null) return false;
        if (!bool.TryParse(value, out var enabled)) throw new InvalidOperationException(ConfigurationError);
        if (!enabled) return false;

        // A finite host allowlist limits accidental authority exposure. It does NOT
        // authenticate the edge or a private peer: any such peer can supply Host.
        var hosts = configuration["AllowedHosts"]?.Split(';');
        if (hosts is null || hosts.Length == 0 || hosts.Any(host =>
            string.IsNullOrWhiteSpace(host) || host != host.Trim() || host.Contains('*')
            || host.EndsWith('.') || Uri.CheckHostName(host) is not (UriHostNameType.Dns or UriHostNameType.IPv4)))
            throw new InvalidOperationException(ConfigurationError);
        return true;
    }

    public static IApplicationBuilder UseSecureIngress(this IApplicationBuilder app, bool enabled)
    {
        if (enabled)
        {
            app.Use((context, next) =>
            {
                // The deployment assertion applies equally to public-edge and private
                // ingress. Never infer it from Host, Origin or X-Forwarded-* values.
                context.Request.Scheme = "https";
                return next(context);
            });
        }
        return app;
    }
}
