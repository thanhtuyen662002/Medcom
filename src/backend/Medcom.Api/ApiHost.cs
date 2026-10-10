using Medcom.Application;
using Medcom.Infrastructure;
using Medcom.Application.PurchaseRequests;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

namespace Medcom.Api;

public static class ApiHost
{
    public const string CorrelationHeader = "X-Correlation-ID";

    internal static void LogPurchaseReadUnavailable(ILogger logger, HttpContext context,
        PurchaseRequestReadDiagnostic diagnostic) => logger.LogWarning(
        new EventId(1002, "PurchaseReadUnavailable"),
        "Purchase read unavailable; correlation {CorrelationId}; operation {Operation}; stage {Stage}; reason {Reason}; exception kind {ExceptionKind}; provider number {ProviderErrorNumber}; elapsed ms {ElapsedMilliseconds}",
        context.TraceIdentifier, diagnostic.Operation, diagnostic.Stage, diagnostic.Reason,
        diagnostic.ExceptionKind, diagnostic.ProviderErrorNumber, diagnostic.ElapsedMilliseconds);

    public static WebApplication Build(string[] args, Action<WebApplicationBuilder>? configure = null, string? webRoot = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = args,
            WebRootPath = webRoot,
            ApplicationName = typeof(ApiHost).Assembly.GetName().Name
        });
        ServerConfiguration.LoadPrivateConfiguration(builder.Configuration, builder.Environment.ContentRootPath, args);
        builder.WebHost.ConfigureKestrel(options =>
        {
            options.AddServerHeader = false;
            options.Limits.MaxRequestBodySize = 1_048_576;
        });
        // Request paths, query strings and payloads are not diagnostic fields.
        builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
        builder.Services.AddSingleton<IPlatformReadiness, UnconfiguredPlatformReadiness>();
        builder.Services.AddSingleton(TimeProvider.System);
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddSingleton<IPurchaseRequestQueries, UnavailablePurchaseRequestQueries>();
        builder.Services.AddSingleton<IPurchaseRequestCommandAccess, UnavailablePurchaseRequestCommandAccess>();
        builder.Services.AddSingleton<IPurchaseRequestCommands, UnavailablePurchaseRequestCommands>();
        builder.Services.AddSingleton<IErpScreenService, UnavailableErpScreenService>();
        builder.Services.AddInboundDraftFacade();
        if (builder.Configuration.GetValue("Legacy:Enabled", false))
        {
            string Required(string key) => builder.Configuration[key] is { Length: > 0 } value
                ? value : throw new InvalidOperationException($"Missing server setting {key}.");
            var enablePilots = builder.Configuration.GetValue("Legacy:EnableReadOnlyPilots", false);
            var connectionString = ServerConfiguration.ResolveConnectionString(builder.Configuration,
                out var developmentTestTlsTarget);
            builder.Services.AddSingleton(new LegacyCompany(Required("Legacy:TenantId"),
                Required("Legacy:CompanyId"), Required("Legacy:CompanyName")));
            builder.Services.AddSingleton(new SqlLegacyUserStore(connectionString, enablePilots: enablePilots,
                developmentTestTlsTarget: developmentTestTlsTarget));
            builder.Services.AddSingleton<ILegacyUserStore>(provider=>provider.GetRequiredService<SqlLegacyUserStore>());
            builder.Services.AddSingleton(new LegacyPasswordOptions(builder.Configuration["Legacy:DotnetPath"] ?? "dotnet",
                Path.Combine(AppContext.BaseDirectory, "password-worker", "Medcom.LegacyPasswordWorker.dll"),
                Required("Legacy:ToolsPath")));
            builder.Services.AddSingleton<ILegacyPasswordVerifier, LegacyPasswordVerifier>();
            builder.Services.AddSingleton<LegacyReadiness>();
            builder.Services.AddSingleton<IPlatformReadiness>(provider=>provider.GetRequiredService<LegacyReadiness>());
            builder.Services.AddHostedService<LegacyHealthMonitor>();
            builder.Services.AddSingleton<IIdentityAuthority, LegacyIdentityAuthority>();
            if (enablePilots) builder.Services.AddSingleton<IDocumentReader>(provider => new SqlDocumentReader(
                connectionString, provider.GetRequiredService<LegacyCompany>(),
                developmentTestTlsTarget: developmentTestTlsTarget));
            else builder.Services.AddSingleton<IDocumentReader, UnavailableDocumentReader>();
            if (enablePilots) builder.Services.AddScoped<IPurchaseRequestQueries>(provider =>
            {
                var context = provider.GetRequiredService<IHttpContextAccessor>().HttpContext
                    ?? throw new InvalidOperationException("A current request is required.");
                var token = AuthEndpoints.Current(context).Token;
                var sessions = provider.GetRequiredService<IWebSessions>();
                return new SqlPurchaseRequestQueries(provider.GetRequiredService<SqlLegacyUserStore>(),
                    provider.GetRequiredService<LegacyCompany>(), async cancellation =>
                        (await sessions.ResolveAsync(token, false, cancellation))?.Identity,
                    async cancellation => (await sessions.InspectAsync(token, cancellation))?.Identity,
                    diagnostic => LogPurchaseReadUnavailable(provider.GetRequiredService<ILogger<SqlPurchaseRequestQueries>>(),
                        context, diagnostic));
            });
            if(enablePilots) builder.Services.AddScoped<IErpScreenService>(provider=>
            {
                var context=provider.GetRequiredService<IHttpContextAccessor>().HttpContext??throw new InvalidOperationException("Current request required.");
                var token=AuthEndpoints.Current(context).Token;var sessions=provider.GetRequiredService<IWebSessions>();
                return new Medcom.Infrastructure.Erp.SqlErpScreenService(provider.GetRequiredService<SqlLegacyUserStore>(),provider.GetRequiredService<LegacyCompany>(),
                    async cancellation=>(await sessions.ResolveAsync(token,false,cancellation))?.Identity,
                    async cancellation=>(await sessions.InspectAsync(token,cancellation))?.Identity,
                    provider.GetService<Medcom.Infrastructure.Erp.IErpSqlCommandExecutor>());
            });
        }
        else
        {
            builder.Services.AddSingleton<IIdentityAuthority, UnavailableIdentityAuthority>();
            builder.Services.AddSingleton<IDocumentReader, UnavailableDocumentReader>();
        }
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
                        // These exact public GETs expose only fixed health or cached
                        // technical contract data.
                        // Treat even a supplied cookie as anonymous, not as authority;
                        // never refresh, resolve, or revoke its server session here.
                        if (HttpMethods.IsGet(context.Request.Method)
                            && context.Request.Path.Value is "/health/live" or "/health/ready" or ApiContractCatalog.Path)
                        {
                            context.RejectPrincipal();
                            context.ShouldRenew = false;
                            return;
                        }
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
        var allRequestsSecure = SecureIngress.ReadConfiguration(builder.Configuration);
        var app = builder.Build();
        app.UseSecureIngress(allRequestsSecure);
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
            ? Results.Ok(new { contractVersion = 1, status = AuthEndpoints.Current(context).Identity.CredentialStamp is null ? "foundation_only" : "read_only_adapter" })
            : Results.Problem(statusCode: 403, title: "Access denied."));
        AuthEndpoints.Map(app);
        DocumentEndpoints.Map(app);
        ApiContractCatalog.Map(app);
        PurchaseRequestEndpoints.Map(app);
        ErpScreenEndpoints.Map(app);
        app.MapInboundDraftFacade();
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

