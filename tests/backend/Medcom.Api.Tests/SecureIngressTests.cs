using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class SecureIngressTests
{
    private const string BackendHost = "medcom-production.up.railway.app";
    private const string Hosts = BackendHost + ";healthcheck.railway.app";

    private static IConfiguration Configuration(string? enabled, string? hosts) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            [SecureIngress.ConfigurationKey] = enabled, ["AllowedHosts"] = hosts
        }).Build();

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    public void DefaultAndFalsePreserveExistingHostConfiguration(string? enabled)
    {
        Assert.False(SecureIngress.ReadConfiguration(Configuration(enabled, null)));
        Assert.False(SecureIngress.ReadConfiguration(Configuration(enabled, "*")));
    }

    [Theory]
    [InlineData("")]
    [InlineData("1")]
    [InlineData("yes")]
    [InlineData("true,false")]
    public void MalformedFlagFailsClosed(string value) =>
        Assert.Throws<InvalidOperationException>(() => SecureIngress.ReadConfiguration(Configuration(value, Hosts)));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("*")]
    [InlineData("*.railway.app")]
    [InlineData("localhost;*")]
    [InlineData("localhost;")]
    [InlineData("localhost;;healthcheck.railway.app")]
    [InlineData("https://medcom-production.up.railway.app")]
    [InlineData("medcom-production.up.railway.app:443")]
    [InlineData(" medcom-production.up.railway.app")]
    [InlineData("medcom-production.up.railway.app.")]
    public void EnabledRequiresOnlyExactHostnames(string? hosts) =>
        Assert.Throws<InvalidOperationException>(() => SecureIngress.ReadConfiguration(Configuration("true", hosts)));

    [Fact]
    public void ExplicitBackendAndHealthcheckHostsAreAccepted() =>
        Assert.True(SecureIngress.ReadConfiguration(Configuration("true", Hosts)));

    [Theory]
    [InlineData(false, "http")]
    [InlineData(true, "https")]
    public async Task ForgedForwardingHeadersNeverChangeAuthorityOrProvenance(bool enabled, string expectedScheme)
    {
        using var services = new ServiceCollection().AddLogging().BuildServiceProvider();
        var app = new ApplicationBuilder(services);
        app.UseSecureIngress(enabled);
        var observed = false;
        app.Run(context =>
        {
            observed = true;
            Assert.Equal(expectedScheme, context.Request.Scheme);
            Assert.Equal(BackendHost, context.Request.Host.Value);
            Assert.Equal(IPAddress.Parse("192.0.2.8"), context.Connection.RemoteIpAddress);
            Assert.Equal("/api/auth/login", context.Request.Path.Value);
            Assert.Equal("/base", context.Request.PathBase.Value);
            Assert.Equal("https://untrusted.invalid", context.Request.Headers.Origin.ToString());
            return Task.CompletedTask;
        });
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Scheme = "http";
        context.Request.Host = new HostString(BackendHost);
        context.Request.Path = "/api/auth/login";
        context.Request.PathBase = "/base";
        context.Connection.RemoteIpAddress = IPAddress.Parse("192.0.2.8");
        context.Request.Headers.Origin = "https://untrusted.invalid";
        context.Request.Headers["Forwarded"] = "for=198.51.100.1;proto=https;host=evil.invalid";
        context.Request.Headers["X-Forwarded-Proto"] = enabled ? "http" : "https";
        context.Request.Headers["X-Forwarded-Host"] = "evil.invalid";
        context.Request.Headers["X-Forwarded-For"] = "198.51.100.1";
        context.Request.Headers["X-Forwarded-Prefix"] = "/evil";
        context.Request.Headers["X-Real-IP"] = "198.51.100.2";
        context.Request.Headers["X-Railway-Edge"] = "synthetic";
        await app.Build()(context);
        Assert.True(observed);
    }

    [Fact]
    public async Task ApiHostAppliesAssertionBeforeCsrfAndAuthenticationWithoutWeakeningGuards()
    {
        await using var server = await HttpIngressServer.Start("true");
        using var csrfResponse = await server.Client.GetAsync("/api/auth/csrf");
        Assert.Equal(HttpStatusCode.OK, csrfResponse.StatusCode);
        var csrfCookie = Cookie(csrfResponse, "__Host-Medcom.Csrf=");
        var token = await Token(csrfResponse);
        using var missing = await server.Post("/api/auth/login", csrfCookie, null);
        Assert.Equal(HttpStatusCode.Forbidden, missing.StatusCode);
        using var invalid = await server.Post("/api/auth/login", csrfCookie, token + "invalid");
        Assert.Equal(HttpStatusCode.Forbidden, invalid.StatusCode);
        Assert.Equal(0, server.Authority.LoginCalls);

        using var login = await server.Post("/api/auth/login", csrfCookie, token);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Equal(1, server.Authority.LoginCalls);
        var sessionCookie = Cookie(login, "__Host-Medcom.Session=");
        using var csrfRequest = new HttpRequestMessage(HttpMethod.Get, "/api/auth/csrf");
        csrfRequest.Headers.Add("Cookie", sessionCookie);
        using var authenticatedCsrf = await server.Client.SendAsync(csrfRequest);
        Assert.Equal(HttpStatusCode.OK, authenticatedCsrf.StatusCode);
        var authenticatedCookies = sessionCookie + "; " + Cookie(authenticatedCsrf, "__Host-Medcom.Csrf=");
        var authenticatedToken = await Token(authenticatedCsrf);
        using var wrongOrigin = await server.Post("/api/purchase-requests/save", authenticatedCookies,
            authenticatedToken, "https://untrusted.invalid");
        Assert.Equal(HttpStatusCode.Forbidden, wrongOrigin.StatusCode);
        using var wrongOriginBody = JsonDocument.Parse(await wrongOrigin.Content.ReadAsStringAsync());
        Assert.Equal("origin_rejected", wrongOriginBody.RootElement.GetProperty("code").GetString());
        using var forgedHost = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        forgedHost.Headers.Host = "evil.invalid";
        forgedHost.Headers.Add("X-Forwarded-Host", BackendHost);
        using var rejected = await server.Client.SendAsync(forgedHost);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        using var health = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        health.Headers.Host = "healthcheck.railway.app";
        using var healthy = await server.Client.SendAsync(health);
        Assert.Equal(HttpStatusCode.OK, healthy.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("false")]
    public async Task DisabledHttpCannotIssueSessionEvenWithForgedHttpsHeader(string? enabled)
    {
        await using var server = await HttpIngressServer.Start(enabled);
        using var login = await server.Post("/api/auth/login", null, null);
        Assert.False(login.IsSuccessStatusCode);
        Assert.False(login.Headers.Contains("Set-Cookie"));
        Assert.Equal(0, server.Authority.LoginCalls);
    }

    private static async Task<string> Token(HttpResponseMessage response)
    {
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("token").GetString()!;
    }

    private static string Cookie(HttpResponseMessage response, string prefix)
    {
        var cookie = response.Headers.GetValues("Set-Cookie").Single(value => value.StartsWith(prefix, StringComparison.Ordinal));
        Assert.Contains("; secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("; httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("; path=/", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("; samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("; domain=", cookie, StringComparison.OrdinalIgnoreCase);
        return cookie.Split(';')[0];
    }

    private sealed class SyntheticAuthority : IIdentityAuthority
    {
        public int LoginCalls;
        private static readonly AuthoritativeIdentity Identity = new("synthetic-user", "synthetic-tenant",
            "synthetic-company", "Synthetic", "Synthetic", 1, ["platform.status"]);
        public Task<IdentityResult> AuthenticateAsync(string username, string password, CancellationToken cancellationToken)
        {
            LoginCalls++;
            return Task.FromResult(username == "synthetic-user" && password == "synthetic-password"
                ? new IdentityResult(IdentityOutcome.Success, Identity) : new IdentityResult(IdentityOutcome.Rejected));
        }
        public Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity, CancellationToken cancellationToken) =>
            Task.FromResult(new IdentityResult(IdentityOutcome.Success, Identity));
    }

    private sealed class HttpIngressServer(WebApplication app, HttpClient client, SyntheticAuthority authority) : IAsyncDisposable
    {
        public HttpClient Client { get; } = client;
        public SyntheticAuthority Authority { get; } = authority;
        public static async Task<HttpIngressServer> Start(string? enabled)
        {
            var authority = new SyntheticAuthority();
            var app = ApiHost.Build(["--environment", "Production", "--Legacy:Enabled", "false"], builder =>
            {
                builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
                { [SecureIngress.ConfigurationKey] = enabled, ["AllowedHosts"] = Hosts });
                builder.Logging.ClearProviders();
                builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
                builder.Services.AddSingleton<IIdentityAuthority>(authority);
            });
            await app.StartAsync();
            var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
            // Synthetic proxy-hop tests explicitly relay test cookies over loopback HTTP.
            // This does not claim a browser would send Secure cookies over public HTTP.
            var client = new HttpClient(new HttpClientHandler { UseCookies = false, AllowAutoRedirect = false })
            { BaseAddress = new Uri(address) };
            client.DefaultRequestHeaders.Host = BackendHost;
            client.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");
            return new(app, client, authority);
        }
        public Task<HttpResponseMessage> Post(string path, string? cookie, string? csrf, string? origin = null)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, path)
            { Content = JsonContent.Create(new { username = "synthetic-user", password = "synthetic-password" }) };
            if (cookie is not null) request.Headers.Add("Cookie", cookie);
            if (csrf is not null) request.Headers.Add("X-CSRF-TOKEN", csrf);
            if (origin is not null) request.Headers.Add("Origin", origin);
            return Client.SendAsync(request);
        }
        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }
}
