using System.Security.Claims;
using Medcom.Application;
using Medcom.Contracts;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace Medcom.Api;

public static class AuthEndpoints
{
    public const string SessionClaim = "medcom_session";
    public static readonly object ResolvedKey = new();

    public static void Map(WebApplication app)
    {
        app.MapGet("/api/auth/csrf", (HttpContext context, IAntiforgery antiforgery) =>
            Results.Ok(new { token = antiforgery.GetAndStoreTokens(context).RequestToken })).AllowAnonymous();

        app.MapPost("/api/auth/login", async (LoginRequest request, HttpContext context,
            IIdentityAuthority authority, IWebSessions sessions) =>
        {
            if (!context.Request.IsHttps)
                return Problem(400, "https_required", "HTTPS is required.");
            if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Length > 100
                || string.IsNullOrEmpty(request.Password) || request.Password.Length > 256)
                return Problem(400, "invalid_login_request", "Check the login fields.");
            IdentityResult result;
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            try
            {
                result = await authority.AuthenticateAsync(request.Username, request.Password, timeout.Token);
                timeout.Token.ThrowIfCancellationRequested();
            }
            catch (OperationCanceledException) when (!context.RequestAborted.IsCancellationRequested)
            { return Problem(503, "identity_unavailable", "Authentication is temporarily unavailable."); }
            if (result.Outcome == IdentityOutcome.Rejected)
                return Problem(401, "invalid_credentials", "The login was not accepted.");
            if (result.Outcome != IdentityOutcome.Success || result.Identity is null)
                return Problem(503, "identity_unavailable", "Authentication is temporarily unavailable.");
            var session = sessions.Create(result.Identity);
            if (session is null)
                return Problem(503, "session_unavailable", "The session could not be created.");
            // Rotation retires the old server session before replacing its cookie.
            var oldToken = context.User.FindFirstValue(SessionClaim);
            if (oldToken is not null) sessions.Revoke(oldToken);
            try
            {
                await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
                    Principal(session), new AuthenticationProperties
                    {
                        IsPersistent = false, ExpiresUtc = session.View.AbsoluteExpiresAt,
                        AllowRefresh = false
                    });
            }
            catch { sessions.Revoke(session.Token); throw; }
            return Results.Ok(session.View);
        }).AllowAnonymous().RequireRateLimiting("login");

        app.MapGet("/api/auth/session", (HttpContext context) =>
            Results.Ok(Current(context).View));

        app.MapPost("/api/auth/session/continue", async (HttpContext context, IWebSessions sessions) =>
        {
            var session = await sessions.ResolveAsync(Current(context).Token, true, context.RequestAborted);
            return session is null ? Problem(401, "session_expired", "Sign in again.") : Results.Ok(session.View);
        });

        app.MapPost("/api/auth/logout", async (HttpContext context, IWebSessions sessions) =>
        {
            sessions.Revoke(Current(context).Token);
            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });

        app.MapGet("/api/workspace", (HttpContext context) =>
        {
            var session = Current(context);
            var navigation = new List<NavigationItem>();
            if (session.Identity.Capabilities.Contains("platform.status", StringComparer.Ordinal))
                navigation.Add(new("platform-status", "Trạng thái hệ thống", "/workspace/"));
            if (session.Identity.Capabilities.Contains("purchase-orders.read", StringComparer.Ordinal))
                navigation.Add(new("purchase-orders", "Đơn đặt hàng mua", "/workspace/?screen=purchase-orders"));
            if (session.Identity.Capabilities.Contains("purchase-requests.read", StringComparer.Ordinal))
                navigation.Add(new("purchase-requests", "Đề nghị mua hàng", "/workspace/?screen=purchase-requests"));
            if (session.Identity.Capabilities.Contains("inbound-requests.read", StringComparer.Ordinal))
                navigation.Add(new("inbound-requests", "Yêu cầu nhập kho", "/workspace/?screen=inbound-requests"));
            return Results.Ok(new WorkspaceView(session.View, navigation, session.Identity.BranchIds ?? []));
        });
    }

    public static ResolvedSession Current(HttpContext context) => (ResolvedSession)context.Items[ResolvedKey]!;

    public static ClaimsPrincipal Principal(ResolvedSession session) => new(new ClaimsIdentity(
        [new Claim(ClaimTypes.NameIdentifier, session.Token),
         new Claim(SessionClaim, session.Token)], CookieAuthenticationDefaults.AuthenticationScheme));

    private static IResult Problem(int status, string code, string title) => Results.Problem(
        statusCode: status, title: title, extensions: new Dictionary<string, object?> { ["code"] = code });
}
