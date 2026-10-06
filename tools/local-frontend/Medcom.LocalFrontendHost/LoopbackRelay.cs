using System.Globalization;
using System.Net;
using System.Security.Authentication;
using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.Primitives;

namespace Medcom.LocalFrontendHost;

public sealed record LoopbackRelayOptions(int HttpsPort, int NodePort)
{
    public TimeSpan UpstreamTimeout { get; init; } = TimeSpan.FromSeconds(60);
}

/// <summary>A local TLS terminator for one fixed loopback Next server. This is not a configurable forward proxy.</summary>
public static class LoopbackRelay
{
    public const int SmallBodyLimit = 16 * 1024;
    public const int CommandBodyLimit = 1024 * 1024;

    private static readonly HashSet<string> CommandPaths = new(StringComparer.Ordinal)
    {
        "/api/erp/api/purchase-requests/save", "/api/erp/api/purchase-requests/submit",
        "/api/erp/api/purchase-requests/save/lookup", "/api/erp/api/purchase-requests/submit/lookup",
        "/api/erp/api/inbound-requests/draft/save", "/api/erp/api/inbound-requests/draft/send-to-warehouse",
        "/api/erp/api/inbound-requests/draft/reconcile"
    };

    private static readonly HashSet<string> OtherPostPaths = new(StringComparer.Ordinal)
    {
        "/api/erp/api/auth/login", "/api/erp/api/auth/session/continue", "/api/erp/api/auth/logout"
    };

    private static readonly HashSet<string> RequestHeaders = new(StringComparer.OrdinalIgnoreCase)
    {
        "Accept", "Accept-Encoding", "Accept-Language", "Cache-Control", "Pragma",
        "Content-Type", "Content-Encoding", "Content-Language", "Cookie",
        "If-Match", "If-None-Match", "If-Modified-Since", "If-Unmodified-Since", "If-Range", "Range",
        "Origin", "Referer", "User-Agent", "Sec-Fetch-Site", "Sec-Fetch-Mode", "Sec-Fetch-Dest", "Sec-Fetch-User",
        "Sec-CH-UA", "Sec-CH-UA-Mobile", "Sec-CH-UA-Platform",
        "RSC", "Next-Router-State-Tree", "Next-Router-Prefetch", "Next-Router-Segment-Prefetch", "Next-Url",
        "X-CSRF-TOKEN", "X-Purchase-Scope", "X-Inbound-Scope"
    };

    private static readonly HashSet<string> ResponseHeaders = new(StringComparer.OrdinalIgnoreCase)
    {
        "Content-Type", "Content-Encoding", "Content-Language", "Content-Length", "Content-Disposition",
        "Cache-Control", "ETag", "Last-Modified", "Expires", "Vary", "Accept-Ranges", "Content-Range",
        "Location", "Retry-After", "Link", "X-Correlation-ID", "X-Content-Type-Options", "X-Frame-Options",
        "Content-Security-Policy", "Referrer-Policy", "Permissions-Policy", "Cross-Origin-Opener-Policy",
        "Cross-Origin-Resource-Policy", "Strict-Transport-Security", "X-Nextjs-Cache", "X-Nextjs-Prerender", "X-Nextjs-Stale-Time"
    };

    public static WebApplication Build(LoopbackRelayOptions options, X509Certificate2 certificate)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(certificate);
        if (options.HttpsPort is < 1024 or > 65535 || options.NodePort is < 1024 or > 65535 || options.HttpsPort == options.NodePort)
            throw new ArgumentOutOfRangeException(nameof(options), "Use distinct, explicit nonprivileged loopback ports.");
        if (options.UpstreamTimeout <= TimeSpan.Zero || options.UpstreamTimeout > TimeSpan.FromMinutes(2))
            throw new ArgumentOutOfRangeException(nameof(options), "The upstream timeout must be positive and at most two minutes.");
        DevelopmentCertificateSelector.EnsureAccessiblePrivateKey(certificate);

        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions
        {
            Args = [], ApplicationName = typeof(LoopbackRelay).Assembly.GetName().Name,
            EnvironmentName = Environments.Production, ContentRootPath = AppContext.BaseDirectory
        });
        // No environment, appsettings or command-line values may introduce another listener or proxy target.
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddInMemoryCollection();
        var publicOrigin = $"https://localhost:{options.HttpsPort.ToString(CultureInfo.InvariantCulture)}";
        // GenericWebHostService also retains host settings captured before configuration providers are cleared.
        // Override those fallbacks and always prefer our explicit ListenLocalhost endpoint.
        builder.WebHost.UseUrls(publicOrigin);
        builder.WebHost.PreferHostingUrls(false);
        builder.Logging.ClearProviders();
        builder.WebHost.UseKestrelHttpsConfiguration();
        builder.WebHost.ConfigureKestrel(server =>
        {
            server.AddServerHeader = false;
            server.Limits.MaxRequestBodySize = CommandBodyLimit;
            server.Limits.MaxRequestLineSize = 16 * 1024;
            server.Limits.MaxRequestHeadersTotalSize = 64 * 1024;
            server.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(15);
            server.Limits.KeepAliveTimeout = TimeSpan.FromSeconds(30);
            server.ListenLocalhost(options.HttpsPort, listener =>
            {
                listener.Protocols = HttpProtocols.Http1AndHttp2;
                listener.UseHttps(https =>
                {
                    https.ServerCertificate = certificate;
                    https.SslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13;
                    https.OnAuthenticate = (_, authentication) =>
                    {
                        // Authority is independently checked on every request, including reused HTTP/2 connections.
                        authentication.AllowRenegotiation = false;
                    };
                });
            });
        });

        var handler = new SocketsHttpHandler
        {
            UseProxy = false, UseCookies = false, AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.None, ConnectTimeout = TimeSpan.FromSeconds(5),
            MaxResponseHeadersLength = 64, PooledConnectionLifetime = TimeSpan.Zero
        };
        var client = new HttpClient(handler) { Timeout = Timeout.InfiniteTimeSpan };
        var app = builder.Build();
        var addresses = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()
            ?? throw new InvalidOperationException("The local server did not expose its binding addresses.");
        addresses.Addresses.Clear();
        addresses.Addresses.Add(publicOrigin);
        addresses.PreferHostingUrls = false;
        app.Lifetime.ApplicationStopped.Register(client.Dispose);
        app.Run(context => RelayAsync(context, options, client));
        return app;
    }

    public static bool IsSafeRequestTarget(string? target)
    {
        if (string.IsNullOrEmpty(target) || target.Length > 12 * 1024 || target[0] != '/') return false;
        var queryIndex = target.IndexOf('?');
        var path = queryIndex < 0 ? target : target[..queryIndex];
        if (path.Contains("//", StringComparison.Ordinal) || path.Split('/').Any(segment => segment is "." or "..")) return false;
        for (var index = 0; index < target.Length; index++)
        {
            var value = target[index];
            if (value is <= ' ' or >= '\u007f' or '\\' or '#') return false;
            if (value != '%') continue;
            if (index + 2 >= target.Length || !char.IsAsciiHexDigit(target[index + 1]) || !char.IsAsciiHexDigit(target[index + 2])) return false;
            var decoded = Convert.ToByte(target.Substring(index + 1, 2), 16);
            if (decoded is <= 0x1f or 0x7f ||
                (index < path.Length && decoded is 0x2f or 0x5c or 0x25 or 0x2e or 0x3f or 0x23 or 0x3a)) return false;
            index += 2;
        }
        return true;
    }

    public static bool IsSafeRelayCookie(string value)
    {
        if (value.Length > 8192 || value.Any(character => character is < ' ' or >= '\u007f')) return false;
        var segments = value.Split(';');
        var pair = segments[0];
        var equals = pair.IndexOf('=');
        if (equals < 0 || !IsMedcomCookieName(pair[..equals]) ||
            pair[(equals + 1)..].Any(character => character is ' ' or ',' or '"' or '\\')) return false;
        var secure = false;
        var httpOnly = false;
        var path = false;
        var attributes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var segment in segments.Skip(1))
        {
            var attribute = segment.Trim();
            var separator = attribute.IndexOf('=');
            var name = separator < 0 ? attribute : attribute[..separator].Trim();
            if (!attributes.Add(name) || name.Equals("Domain", StringComparison.OrdinalIgnoreCase)) return false;
            if (name.Equals("Secure", StringComparison.OrdinalIgnoreCase)) secure = separator < 0;
            if (name.Equals("HttpOnly", StringComparison.OrdinalIgnoreCase)) httpOnly = separator < 0;
            if (name.Equals("Path", StringComparison.OrdinalIgnoreCase)) path = separator >= 0 && attribute[(separator + 1)..] == "/";
        }
        return secure && httpOnly && path;
    }

    private static bool IsMedcomCookieName(string name)
    {
        if (name is "__Host-Medcom.Session" or "__Host-Medcom.Csrf") return true;
        const string prefix = "__Host-Medcom.SessionC";
        return name.StartsWith(prefix, StringComparison.Ordinal) && name.Length > prefix.Length && name[prefix.Length..].All(char.IsAsciiDigit);
    }

    private static async Task RelayAsync(HttpContext context, LoopbackRelayOptions options, HttpClient client)
    {
        var authority = $"localhost:{options.HttpsPort.ToString(CultureInfo.InvariantCulture)}";
        if (!context.Request.IsHttps || context.Request.Host.Value != authority ||
            context.Connection.RemoteIpAddress is not { } remote || !IPAddress.IsLoopback(remote))
        {
            await RejectAsync(context, 400, "local_authority_required");
            return;
        }
        var target = context.Features.Get<IHttpRequestFeature>()?.RawTarget;
        if (!IsSafeRequestTarget(target))
        {
            await RejectAsync(context, 400, "invalid_request_target");
            return;
        }
        var path = target!.Split('?', 2)[0];
        var isPost = HttpMethods.IsPost(context.Request.Method);
        if (!(HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method) ||
              (isPost && (CommandPaths.Contains(path) || OtherPostPaths.Contains(path)))))
        {
            await RejectAsync(context, 405, "method_or_route_unavailable");
            return;
        }
        // Reject observable unknown Connection options. Kestrel may canonicalize mixed options to "close";
        // provenance below is therefore always copied from native headers and is never stripped by nomination.
        if (context.Request.Headers.Connection.SelectMany(value => (value ?? "").Split(','))
            .Any(value => !value.Trim().Equals("close", StringComparison.OrdinalIgnoreCase) && !value.Trim().Equals("keep-alive", StringComparison.OrdinalIgnoreCase)) ||
            (context.Request.Headers.TryGetValue("Next-Url", out var nextUrl) && (nextUrl.Count != 1 || !IsSafeRequestTarget(nextUrl[0]))))
        {
            await RejectAsync(context, 400, "invalid_request_headers");
            return;
        }
        var limit = isPost && CommandPaths.Contains(path) ? CommandBodyLimit : SmallBodyLimit;
        if (context.Request.ContentLength > limit)
        {
            await RejectAsync(context, 413, "payload_too_large");
            return;
        }

        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        cancellation.CancelAfter(options.UpstreamTimeout);
        try
        {
            using var body = new MemoryStream();
            var buffer = new byte[8192];
            while (true)
            {
                // Inspect at most one byte beyond the route limit; retain the independent 1 MiB Kestrel cap.
                var remaining = Math.Min(buffer.Length, limit + 1 - (int)body.Length);
                var read = await context.Request.Body.ReadAsync(buffer.AsMemory(0, remaining), cancellation.Token);
                if (read == 0) break;
                if (body.Length + read > limit)
                {
                    await RejectAsync(context, 413, "payload_too_large");
                    return;
                }
                await body.WriteAsync(buffer.AsMemory(0, read), cancellation.Token);
            }
            if ((!isPost && body.Length != 0) || (context.Request.ContentLength is { } declared && declared != body.Length))
            {
                await RejectAsync(context, 400, "invalid_request_body");
                return;
            }
            // Validated origin-form is appended to a constant authority, never resolved relative to an attacker URL.
            var upstream = new Uri($"http://127.0.0.1:{options.NodePort.ToString(CultureInfo.InvariantCulture)}{target}", UriKind.Absolute);
            using var request = new HttpRequestMessage(new HttpMethod(context.Request.Method), upstream)
            {
                Version = HttpVersion.Version11, VersionPolicy = HttpVersionPolicy.RequestVersionExact,
                Content = isPost ? new ByteArrayContent(body.ToArray()) : null
            };
            request.Headers.Host = authority;
            request.Headers.ConnectionClose = true;
            foreach (var header in context.Request.Headers)
            {
                if (!RequestHeaders.Contains(header.Key)) continue;
                if (header.Key.Equals("Cookie", StringComparison.OrdinalIgnoreCase))
                {
                    var cookies = header.Value.SelectMany(value => (value ?? "").Split(';')).Select(value => value.Trim())
                        .Where(value => value.IndexOf('=') is var separator && separator > 0 && IsMedcomCookieName(value[..separator]));
                    var cookie = string.Join("; ", cookies);
                    if (cookie.Length != 0) request.Headers.TryAddWithoutValidation("Cookie", cookie);
                    continue;
                }
                if (!request.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray()) && request.Content is not null)
                    request.Content.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray());
            }
            request.Headers.TryAddWithoutValidation("X-Forwarded-Host", authority);
            request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");
            request.Headers.TryAddWithoutValidation("X-Forwarded-Port", options.HttpsPort.ToString(CultureInfo.InvariantCulture));
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellation.Token);
            if (response.Headers.TryGetValues("Location", out var locations) &&
                locations.Any(location => !IsLocalLocation(location, authority)))
            {
                await RejectAsync(context, 502, "upstream_redirect_rejected");
                return;
            }
            context.Response.StatusCode = (int)response.StatusCode;
            var hopHeaders = response.Headers.Connection.ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var header in response.Headers.Concat(response.Content.Headers))
                if (ResponseHeaders.Contains(header.Key) && !hopHeaders.Contains(header.Key))
                    context.Response.Headers[header.Key] = new StringValues(header.Value.ToArray());
            // Narrow response-only correlation for authorized read clients.
            // Do not add these markers to RequestHeaders or the general response allowlist.
            if (HttpMethods.IsGet(context.Request.Method) && response.StatusCode == HttpStatusCode.OK
                && context.Request.Path.Value is "/api/erp/api/workspace"
                    or "/api/erp/api/documents/purchase-orders" or "/api/erp/api/documents/purchase-orders/detail"
                    or "/api/erp/api/documents/inbound-requests" or "/api/erp/api/documents/inbound-requests/detail")
            {
                const string sessionHeader = "X-Medcom-Session-Scope", readHeader = "X-Medcom-Read-Scope";
                if (!hopHeaders.Contains(sessionHeader) && !hopHeaders.Contains(readHeader)
                    && response.Headers.TryGetValues(sessionHeader, out var sessionValues)
                    && response.Headers.TryGetValues(readHeader, out var readValues))
                {
                    var sessions = sessionValues.ToArray(); var reads = readValues.ToArray();
                    static bool Valid(string[] values) => values.Length == 1 && values[0].Length == 64
                        && values[0].All(c => c is >= 'a' and <= 'f' or >= '0' and <= '9');
                    if (Valid(sessions) && Valid(reads))
                    {
                        context.Response.Headers[sessionHeader] = sessions[0];
                        context.Response.Headers[readHeader] = reads[0];
                    }
                }
            }
            if (response.Headers.TryGetValues("Set-Cookie", out var setCookies))
                foreach (var cookie in setCookies)
                    if (IsSafeRelayCookie(cookie)) context.Response.Headers.Append("Set-Cookie", cookie);
            if (!HttpMethods.IsHead(context.Request.Method))
                await response.Content.CopyToAsync(context.Response.Body, cancellation.Token);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            context.Abort();
        }
        catch (OperationCanceledException)
        {
            await RejectAsync(context, 504, "local_upstream_timeout");
        }
        catch (Microsoft.AspNetCore.Http.BadHttpRequestException exception)
        {
            await RejectAsync(context, exception.StatusCode == 413 ? 413 : 400, "invalid_request_body");
        }
        catch (HttpRequestException)
        {
            await RejectAsync(context, 502, "local_upstream_unavailable");
        }
        catch (IOException)
        {
            await RejectAsync(context, 502, "local_stream_unavailable");
        }
    }

    private static bool IsLocalLocation(string value, string authority)
    {
        if (IsSafeRequestTarget(value)) return true;
        var prefix = $"https://{authority}";
        return value.StartsWith(prefix + "/", StringComparison.Ordinal) && IsSafeRequestTarget(value[prefix.Length..]);
    }

    private static async Task RejectAsync(HttpContext context, int status, string code)
    {
        if (context.Response.HasStarted)
        {
            context.Abort();
            return;
        }
        context.Response.Clear();
        context.Response.StatusCode = status;
        context.Response.Headers.CacheControl = "no-store";
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync($"{{\"code\":\"{code}\"}}", context.RequestAborted);
    }
}
