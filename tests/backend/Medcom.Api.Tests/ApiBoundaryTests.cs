using System.Net;
using System.Security.Claims;
using System.Text.Json;
using Medcom.Api;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ApiBoundaryTests
{
    [Fact]
    public async Task LivenessDoesNotClaimDatabaseOrLegacyReadiness()
    {
        await using var server = await TestServer.Start();
        using var response = await server.Client.GetAsync("/health/live");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.False(response.Headers.Contains("Server"));
        Assert.False(response.Headers.Contains("Set-Cookie"));
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("healthy", body.RootElement.GetProperty("status").GetString());
        Assert.False(body.RootElement.TryGetProperty("checks", out _));
    }

    [Fact]
    public async Task UnconfiguredDependenciesReturn503EvenInDevelopment()
    {
        await using var server = await TestServer.Start(environment: "Development");
        using var response = await server.Client.GetAsync("/health/ready");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("not_ready", body.RootElement.GetProperty("status").GetString());
        var checks = body.RootElement.GetProperty("checks").EnumerateArray()
            .ToDictionary(item => item.GetProperty("component").GetString()!,
                item => item.GetProperty("status").GetString());
        Assert.Equal("healthy", checks["process"]);
        Assert.Equal("not_configured", checks["database"]);
        Assert.Equal("not_configured", checks["legacy_adapter"]);
    }

    [Theory]
    [InlineData("/api/platform/metadata")]
    [InlineData("/api/unknown?tenant=other&database=arbitrary")]
    public async Task UnauthenticatedApiReturnsSafeProblemWithoutRedirect(string path)
    {
        await using var server = await TestServer.Start();
        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.Add("X-User-ID", "pretend-admin");
        request.Headers.Add("X-Tenant-ID", "pretend-tenant");
        using var response = await server.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("authentication_required", body.RootElement.GetProperty("code").GetString());
        Assert.Equal(response.Headers.GetValues(ApiHost.CorrelationHeader).Single(),
            body.RootElement.GetProperty("correlationId").GetString());
        Assert.False(body.RootElement.TryGetProperty("detail", out _));
    }

    [Fact]
    public async Task CorrelationIsServerIssuedAndDistinctForEveryRequest()
    {
        await using var server = await TestServer.Start();
        server.Client.DefaultRequestHeaders.Add(ApiHost.CorrelationHeader, "client-claimed-reference");
        using var first = await server.Client.GetAsync("/health/live");
        using var second = await server.Client.GetAsync("/health/live");
        var firstId = first.Headers.GetValues(ApiHost.CorrelationHeader).Single();
        var secondId = second.Headers.GetValues(ApiHost.CorrelationHeader).Single();
        Assert.True(Guid.TryParseExact(firstId, "N", out _));
        Assert.NotEqual("client-claimed-reference", firstId);
        Assert.NotEqual(firstId, secondId);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Development")]
    public async Task UnhandledFailureNeverExposesExceptionOrLogsItsPayload(string environment)
    {
        var logs = new CapturedLogs();
        await using var server = await TestServer.Start(environment, logs);
        using var response = await server.Client.GetAsync("/tests/fault");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var payload = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("synthetic-private-exception", payload);
        Assert.DoesNotContain("synthetic-private-exception", string.Join("\n", logs.Messages));
        using var body = JsonDocument.Parse(payload);
        Assert.Equal("internal_error", body.RootElement.GetProperty("code").GetString());
        Assert.Equal(response.Headers.GetValues(ApiHost.CorrelationHeader).Single(),
            body.RootElement.GetProperty("correlationId").GetString());
    }

    [Fact]
    public async Task ValidCookieCannotBypassMissingAuthoritativeSessionStore()
    {
        await using var server = await TestServer.Start();
        using var issued = await server.Client.GetAsync("/tests/issue-cookie");
        var cookie = issued.Headers.GetValues("Set-Cookie").Single();
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.StartsWith("__Host-Medcom.Session=", cookie);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/platform/metadata");
        request.Headers.Add("Cookie", cookie.Split(';')[0]);
        using var response = await server.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    private sealed class TestServer(WebApplication app, HttpClient client) : IAsyncDisposable
    {
        public HttpClient Client { get; } = client;

        public static async Task<TestServer> Start(string environment = "Production", CapturedLogs? logs = null)
        {
            var app = ApiHost.Build(["--environment", environment], builder =>
            {
                builder.WebHost.UseUrls("http://127.0.0.1:0");
                builder.Logging.ClearProviders();
                if (logs is not null) builder.Logging.AddProvider(logs);
            });
            // Test-only endpoints never appear in the production host.
            app.MapGet("/tests/fault", (Func<IResult>)(() =>
                throw new InvalidOperationException("synthetic-private-exception"))).AllowAnonymous();
            app.MapGet("/tests/issue-cookie", async (HttpContext context) =>
            {
                var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "synthetic-user")],
                    CookieAuthenticationDefaults.AuthenticationScheme);
                await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
                    new ClaimsPrincipal(identity));
                return Results.NoContent();
            }).AllowAnonymous();
            await app.StartAsync();
            var address = app.Services.GetRequiredService<IServer>().Features
                .Get<IServerAddressesFeature>()!.Addresses.Single();
            return new TestServer(app, new HttpClient(new HttpClientHandler
            {
                AllowAutoRedirect = false,
                UseCookies = false
            }) { BaseAddress = new Uri(address) });
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private sealed class CapturedLogs : ILoggerProvider
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<string> messages = new();
        public IReadOnlyCollection<string> Messages => messages.ToArray();
        public ILogger CreateLogger(string categoryName) => new Capture(messages);
        public void Dispose() { }

        private sealed class Capture(System.Collections.Concurrent.ConcurrentQueue<string> messages) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
            public bool IsEnabled(LogLevel logLevel) => true;
            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
                Exception? exception, Func<TState, Exception?, string> formatter) =>
                messages.Enqueue(formatter(state, exception));
        }
    }
}
