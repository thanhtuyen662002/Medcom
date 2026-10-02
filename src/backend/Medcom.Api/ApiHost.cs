using Medcom.Application;
using Medcom.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;

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
                    // A cryptographically valid cookie alone cannot establish a
                    // session until an authoritative session store is implemented.
                    OnValidatePrincipal = context =>
                    {
                        context.RejectPrincipal();
                        return Task.CompletedTask;
                    }
                };
            });
        builder.Services.AddAuthorization(options =>
            options.FallbackPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser().Build());
        configure?.Invoke(builder);
        var app = builder.Build();
        app.Use(async (context, next) =>
        {
            // Ignore client correlation as authority and never reflect it.
            context.TraceIdentifier = Guid.NewGuid().ToString("N");
            SetResponseHeaders(context);
            try
            {
                await next(context);
            }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
            {
                context.Abort();
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
                SetResponseHeaders(context);
                await WriteProblem(context, StatusCodes.Status500InternalServerError,
                    "internal_error", "The request could not be completed.");
            }
        });
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapGet("/health/live", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();
        app.MapGet("/health/ready", (IPlatformReadiness readiness) =>
            Results.Json(readiness.Check(), statusCode: StatusCodes.Status503ServiceUnavailable))
            .AllowAnonymous();
        app.MapGet("/api/platform/metadata", () => Results.Ok(new
        {
            contractVersion = 1,
            status = "foundation_only"
        }));
        return app;
    }

    private static void SetResponseHeaders(HttpContext context)
    {
        context.Response.Headers[CorrelationHeader] = context.TraceIdentifier;
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    }

    private static Task WriteProblem(HttpContext context, int status, string code, string title) =>
        Results.Problem(statusCode: status, title: title,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = code,
                ["correlationId"] = context.TraceIdentifier
            }).ExecuteAsync(context);
}
