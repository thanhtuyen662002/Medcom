using Medcom.Application;
using Medcom.Infrastructure;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

namespace Medcom.Api;

public static class ApiHost
{
    public const string CorrelationHeader = "X-Correlation-ID";

    public static WebApplication Build(string[] args, Action<WebApplicationBuilder>? configure = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            ApplicationName = typeof(ApiHost).Assembly.GetName().Name
        });
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.AddServerHeader = false;
            options.Limits.MaxRequestBodySize = 1_048_576;
        });
        // Request paths, query strings and payloads are not diagnostic fields.
        builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
        builder.Services.AddSingleton<IPlatformReadiness, UnconfiguredPlatformReadiness>();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddSingleton<IIdentityAuthority, UnavailableIdentityAuthority>();
        var idleMinutes = builder.Configuration.GetValue("Session:IdleMinutes", 1440);
        var absoluteMinutes = builder.Configuration.GetValue("Session:AbsoluteMinutes", 10080);
        builder.Services.AddSingleton(new WebSessionPolicy(TimeSpan.FromMinutes(idleMinutes),
            TimeSpan.FromMinutes(absoluteMinutes), builder.Configuration.GetValue("Session:Capacity", 10000)));
        builder.Services.AddSingleton<IWebSessions, LocalWebSessions>();
        builder.Services.ConfigureHttpJsonOptions(options =>
            options.SerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow);
        builder.Services.AddAntiforgery(options =>
        {
            options.HeaderName = "X-CSRF-TOKEN";
            options.Cookie.Name = "__Host-Medcom.Csrf";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Strict;
            options.Cookie.Path = "/";
        });
        builder.Services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.AddPolicy("login", _ => RateLimitPartition.GetFixedWindowLimiter("login",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
                }));
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                context.Request.Path == "/api/auth/login"
                ? RateLimitPartition.GetConcurrencyLimiter("login", _ => new ConcurrencyLimiterOptions
                { PermitLimit = 8, QueueLimit = 0 }) : RateLimitPartition.GetNoLimiter("other"));
        });
        builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
            .AddCookie(options =>
            {
                options.Cookie.Name = "__Host-Medcom.Session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                options.Cookie.SameSite = SameSiteMode.Strict;
                options.Cookie.Path = "/";
                options.SlidingExpiration = false;
                options.Events = new CookieAuthenticationEvents
                {
                    OnRedirectToLogin = context => WriteProblem(context.HttpContext,
                        StatusCodes.Status401Unauthorized, "authentication_required", "Authentication required."),
                    OnRedirectToAccessDenied = context => WriteProblem(context.HttpContext,
                        StatusCodes.Status403Forbidden, "forbidden", "Access denied."),
                    OnValidatePrincipal = async context =>
                    {
                        var token = context.Principal?.FindFirst(AuthEndpoints.SessionClaim)?.Value;
                        if (token is null) { context.RejectPrincipal(); return; }
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.HttpContext.RequestAborted);
                        timeout.CancelAfter(TimeSpan.FromSeconds(10));
                        var sessions = context.HttpContext.RequestServices.GetRequiredService<IWebSessions>();
                        try
                        {
                            var session = await sessions.ResolveAsync(token, false, timeout.Token);
                            if (session is null) { context.RejectPrincipal(); return; }
                            context.HttpContext.Items[AuthEndpoints.ResolvedKey] = session;
                            context.ReplacePrincipal(AuthEndpoints.Principal(session));
                        }
                        catch (Exception) when (!context.HttpContext.RequestAborted.IsCancellationRequested)
                        {
                            sessions.Revoke(token);
                            context.RejectPrincipal();
                        }
                    }
                };
            });
        builder.Services.AddAuthorization(options =>
            options.FallbackPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser().Build());
        configure?.Invoke(builder);
        var app = builder.Build();
        var contentSecurityPolicy = WebSecurity.ContentSecurityPolicy(app.Environment.WebRootPath);
        app.Use(async (context, next) =>
        {
            // Ignore client correlation as authority and never reflect it.
            context.TraceIdentifier = Guid.NewGuid().ToString("N");
            SetResponseHeaders(context, contentSecurityPolicy);
            try
            {
                await next(context);
            }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
            {
                context.Abort();
            }
            catch (BadHttpRequestException exception)
            {
                await WriteProblem(context, exception.StatusCode, "invalid_request", "The request is invalid.");
            }
            catch (Exception)
            {
                app.Logger.LogError(new EventId(1001, "RequestFailure"),
                    "Request failed; correlation {CorrelationId}", context.TraceIdentifier);
                if (context.Response.HasStarted)
                {
                    context.Abort();
                    return;
                }
                context.Response.Clear();
                SetResponseHeaders(context, contentSecurityPolicy);
                await WriteProblem(context, StatusCodes.Status500InternalServerError,
                    "internal_error", "The request could not be completed.");
            }
        });
        // Static HTML contains no session or business data; all data routes
        // continue through authentication/authorization below.
        app.UseDefaultFiles();
        app.UseStaticFiles();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();
        app.Use(async (context, next) =>
        {
            if (context.Request.Path.StartsWithSegments("/api")
                && !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method)
                && !HttpMethods.IsOptions(context.Request.Method))
            {
                try { await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); }
                catch (AntiforgeryValidationException)
                {
                    await WriteProblem(context, 403, "csrf_invalid", "Refresh the page and try again.");
                    return;
                }
            }
            await next(context);
        });
        app.MapGet("/health/live", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();
        app.MapGet("/health/ready", (IPlatformReadiness readiness) =>
            Results.Json(readiness.Check(), statusCode: StatusCodes.Status503ServiceUnavailable))
            .AllowAnonymous();
        app.MapGet("/api/platform/metadata", (HttpContext context) =>
            AuthEndpoints.Current(context).Identity.Capabilities.Contains("platform.status", StringComparer.Ordinal)
            ? Results.Ok(new { contractVersion = 1, status = "foundation_only" })
            : Results.Problem(statusCode: 403, title: "Access denied."));
        AuthEndpoints.Map(app);
        return app;
    }

    private static void SetResponseHeaders(HttpContext context, string contentSecurityPolicy)
    {
        context.Response.Headers[CorrelationHeader] = context.TraceIdentifier;
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        context.Response.Headers["X-Frame-Options"] = "DENY";
        context.Response.Headers["Content-Security-Policy"] = contentSecurityPolicy;
    }

    private static Task WriteProblem(HttpContext context, int status, string code, string title) =>
        Results.Problem(statusCode: status, title: title,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = code,
                ["correlationId"] = context.TraceIdentifier
            }).ExecuteAsync(context);
}
