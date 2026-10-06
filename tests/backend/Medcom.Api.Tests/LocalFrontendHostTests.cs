using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using Medcom.LocalFrontendHost;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Medcom.Api.Tests;

[CollectionDefinition("Local frontend relay environment", DisableParallelization = true)]
public sealed class LocalFrontendHostCollection { }

[Collection("Local frontend relay environment")]
public sealed class LocalFrontendHostTests
{
    [Theory]
    [InlineData("http://example.invalid/secret")]
    [InlineData("https://localhost:5187/")]
    [InlineData("//example.invalid/secret")]
    [InlineData("/\\example.invalid/")]
    [InlineData("/a/../api/erp/api/auth/login")]
    [InlineData("/a/./b")]
    [InlineData("/%2fexample.invalid/")]
    [InlineData("/%5cother/")]
    [InlineData("/%252fother/")]
    [InlineData("/%2e%2e/secret")]
    [InlineData("/a%3fb")]
    [InlineData("/a%23b")]
    [InlineData("/a%00b")]
    [InlineData("/a?x=%0d%0aHost:evil")]
    [InlineData("/a?x=%")]
    [InlineData("/a#fragment")]
    [InlineData("*")]
    public async Task UnsafeRawTargetsNeverReachUpstream(string target)
    {
        Assert.False(LoopbackRelay.IsSafeRequestTarget(target));
        await using var fixture = await RelayFixture.Start(context => context.Response.WriteAsync("unreachable"));
        var response = await fixture.Raw("GET", target);
        // Kestrel's OnAsteriskFormTarget rejects GET * before the application with OptionsMethodRequired (405).
        Assert.StartsWith(target == "*" ? "HTTP/1.1 405" : "HTTP/1.1 400", response, StringComparison.Ordinal);
        Assert.Equal(0, fixture.UpstreamCalls);
    }

    [Theory]
    [InlineData("localhost")]
    [InlineData("LOCALHOST:{port}")]
    [InlineData("127.0.0.1:{port}")]
    [InlineData("[::1]:{port}")]
    [InlineData("localhost.example.invalid:{port}")]
    [InlineData("localhost:1")]
    [InlineData("localhost.:{port}")]
    public async Task AuthorityMustBeTheExactPublicLoopbackHost(string host)
    {
        await using var fixture = await RelayFixture.Start(context => context.Response.WriteAsync("unreachable"));
        var response = await fixture.Raw("GET", "/", host: host.Replace("{port}", fixture.HttpsPort.ToString(System.Globalization.CultureInfo.InvariantCulture), StringComparison.Ordinal));
        Assert.StartsWith("HTTP/1.1 400", response, StringComparison.Ordinal);
        Assert.Equal(0, fixture.UpstreamCalls);
    }

    [Fact]
    public async Task DuplicateHostHeadersNeverReachUpstream()
    {
        await using var fixture = await RelayFixture.Start(context => context.Response.WriteAsync("unreachable"));
        var response = await fixture.Raw("GET", "/", $"Host: localhost:{fixture.HttpsPort}\r\n");
        Assert.StartsWith("HTTP/1.1 400", response, StringComparison.Ordinal);
        Assert.Equal(0, fixture.UpstreamCalls);
    }

    [Theory]
    [InlineData("CONNECT", "/")]
    [InlineData("TRACE", "/")]
    [InlineData("OPTIONS", "/api/erp/api/auth/login")]
    [InlineData("PUT", "/api/erp/api/auth/login")]
    [InlineData("POST", "/")]
    [InlineData("POST", "/api/unknown")]
    public async Task UnsupportedMethodsAndPostRoutesNeverReachUpstream(string method, string path)
    {
        await using var fixture = await RelayFixture.Start(context => context.Response.WriteAsync("unreachable"));
        var response = await fixture.Raw(method, path);
        // Kestrel may reject CONNECT's invalid authority-form before the application runs.
        Assert.True(response.StartsWith("HTTP/1.1 405", StringComparison.Ordinal) || response.StartsWith("HTTP/1.1 400", StringComparison.Ordinal));
        Assert.Equal(0, fixture.UpstreamCalls);
    }

    [Fact]
    public async Task RelayPreservesNativeProvenanceBytesStatusAndSeparateCookiesWithoutTrustingRoutingHeaders()
    {
        Dictionary<string, string>? received = null;
        string? rawTarget = null;
        var bytes = new byte[] { 0, 1, 2, 13, 10, 127, 128, 254, 255 };
        await using var fixture = await RelayFixture.Start(async context =>
        {
            received = context.Request.Headers.ToDictionary(header => header.Key, header => header.Value.ToString(), StringComparer.OrdinalIgnoreCase);
            rawTarget = context.Features.Get<IHttpRequestFeature>()!.RawTarget;
            context.Response.StatusCode = 206;
            context.Response.ContentType = "application/octet-stream";
            context.Response.Headers.ContentEncoding = "br";
            context.Response.Headers.ETag = "\"synthetic-asset\"";
            context.Response.Headers.CacheControl = "public, max-age=60";
            context.Response.Headers.Vary = "RSC, Next-Router-State-Tree";
            context.Response.Headers.XFrameOptions = "DENY";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "same-origin";
            context.Response.Headers.ContentSecurityPolicy = "default-src 'self'; frame-ancestors 'none'";
            context.Response.Headers["X-Middleware-Rewrite"] = "https://example.invalid/";
            context.Response.Headers.Append("Set-Cookie", "__Host-Medcom.Session=one; Path=/; Secure; HttpOnly; SameSite=Strict");
            context.Response.Headers.Append("Set-Cookie", "__Host-Medcom.Session=replacement; Path=/; Secure; HttpOnly; SameSite=Strict");
            context.Response.Headers.Append("Set-Cookie", "__Host-Medcom.SessionC1=two; Path=/; Secure; HttpOnly");
            context.Response.Headers.Append("Set-Cookie", "__Host-Medcom.Csrf=three; Path=/; Secure; HttpOnly");
            context.Response.Headers.Append("Set-Cookie", "foreign=four; Path=/; Secure; HttpOnly");
            context.Response.Headers.Append("Set-Cookie", "__Host-Medcom.Session=bad; Domain=localhost; Path=/; Secure; HttpOnly");
            await context.Response.Body.WriteAsync(bytes);
        });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/_next/static/chunks/main.js?value=a%2Fb&part=one+two");
        request.Headers.TryAddWithoutValidation("Origin", "https://attacker.invalid");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Site", "cross-site");
        request.Headers.TryAddWithoutValidation("Sec-Fetch-Mode", "cors");
        request.Headers.TryAddWithoutValidation("Forwarded", "host=attacker.invalid;proto=http");
        request.Headers.TryAddWithoutValidation("X-Forwarded-Host", "attacker.invalid");
        request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "http");
        request.Headers.TryAddWithoutValidation("X-Forwarded-For", "203.0.113.1");
        request.Headers.TryAddWithoutValidation("X-Forwarded-Port", "80");
        request.Headers.TryAddWithoutValidation("X-Middleware-Subrequest", "middleware");
        request.Headers.TryAddWithoutValidation("X-Invoke-Path", "/other");
        request.Headers.TryAddWithoutValidation("Next-Action", "unknown-action");
        request.Headers.TryAddWithoutValidation("RSC", "1");
        request.Headers.TryAddWithoutValidation("Next-Router-State-Tree", "[]");
        request.Headers.TryAddWithoutValidation("Next-Url", "/workspace");
        request.Headers.TryAddWithoutValidation("Cookie", "foreign=secret; __Host-Medcom.Session=first; __Host-Medcom.Session=second; __Host-Medcom.SessionC1=chunk");
        using var response = await fixture.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.PartialContent, response.StatusCode);
        Assert.Equal(bytes, await response.Content.ReadAsByteArrayAsync());
        Assert.Equal("br", Assert.Single(response.Content.Headers.ContentEncoding));
        Assert.Equal("\"synthetic-asset\"", response.Headers.ETag!.Tag);
        Assert.Equal(new[]
        {
            "__Host-Medcom.Session=one; Path=/; Secure; HttpOnly; SameSite=Strict",
            "__Host-Medcom.Session=replacement; Path=/; Secure; HttpOnly; SameSite=Strict",
            "__Host-Medcom.SessionC1=two; Path=/; Secure; HttpOnly",
            "__Host-Medcom.Csrf=three; Path=/; Secure; HttpOnly"
        }, response.Headers.GetValues("Set-Cookie"));
        Assert.Equal("DENY", Assert.Single(response.Headers.GetValues("X-Frame-Options")));
        Assert.Equal("nosniff", Assert.Single(response.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("same-origin", Assert.Single(response.Headers.GetValues("Referrer-Policy")));
        Assert.Equal("default-src 'self'; frame-ancestors 'none'", Assert.Single(response.Headers.GetValues("Content-Security-Policy")));
        Assert.False(response.Headers.Contains("X-Middleware-Rewrite"));
        Assert.NotNull(received);
        Assert.Equal($"localhost:{fixture.HttpsPort}", received["Host"]);
        Assert.Equal($"localhost:{fixture.HttpsPort}", received["X-Forwarded-Host"]);
        Assert.Equal("https", received["X-Forwarded-Proto"]);
        Assert.Equal(fixture.HttpsPort.ToString(System.Globalization.CultureInfo.InvariantCulture), received["X-Forwarded-Port"]);
        Assert.False(received.ContainsKey("Forwarded"));
        Assert.False(received.ContainsKey("X-Forwarded-For"));
        Assert.False(received.ContainsKey("X-Middleware-Subrequest"));
        Assert.False(received.ContainsKey("X-Invoke-Path"));
        Assert.False(received.ContainsKey("Next-Action"));
        Assert.Equal("https://attacker.invalid", received["Origin"]);
        Assert.Equal("cross-site", received["Sec-Fetch-Site"]);
        Assert.Equal("cors", received["Sec-Fetch-Mode"]);
        Assert.Equal("1", received["RSC"]);
        Assert.Equal("[]", received["Next-Router-State-Tree"]);
        Assert.Equal("/workspace", received["Next-Url"]);
        Assert.Equal("__Host-Medcom.Session=first; __Host-Medcom.Session=second; __Host-Medcom.SessionC1=chunk", received["Cookie"]);
        Assert.Equal("/_next/static/chunks/main.js?value=a%2Fb&part=one+two", rawTarget);
        Assert.Equal(1, fixture.UpstreamCalls);
    }

    [Theory]
    [InlineData("__Host-Medcom.Session=x; Secure; HttpOnly; Path=/", true)]
    [InlineData("__Host-Medcom.SessionC12=x; Secure; HttpOnly; Path=/", true)]
    [InlineData("__Host-Medcom.Csrf=; Secure; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT", true)]
    [InlineData("__Host-Medcom.Session=x; HttpOnly; Path=/", false)]
    [InlineData("__Host-Medcom.Session=x; Secure; Path=/", false)]
    [InlineData("__Host-Medcom.Session=x; Secure; HttpOnly; Path=/other", false)]
    [InlineData("__Host-Medcom.Session=x; Secure; HttpOnly; Path=/; Domain=localhost", false)]
    [InlineData("__Host-Medcom.Session=x; Secure; HttpOnly; Path=/; Path=/other", false)]
    [InlineData("__Host-Medcom.Session=x; Secure=true; HttpOnly; Path=/", false)]
    [InlineData("__Host-Medcom.Session=x,other=y; Secure; HttpOnly; Path=/", false)]
    [InlineData("__Host-Medcom.SessionC=x; Secure; HttpOnly; Path=/", false)]
    [InlineData("unrelated=x; Secure; HttpOnly; Path=/", false)]
    [InlineData("__Host-Medcom.Session=x\r\nX-Evil: 1; Secure; HttpOnly; Path=/", false)]
    public void ResponseCookieFilterEnforcesHostCookieScope(string value, bool accepted) =>
        Assert.Equal(accepted, LoopbackRelay.IsSafeRelayCookie(value));

    [Fact]
    public async Task RelayHasNoCookieJarBetweenBrowserRequests()
    {
        var receivedCookies = new List<string>();
        await using var fixture = await RelayFixture.Start(context =>
        {
            receivedCookies.Add(context.Request.Headers.Cookie.ToString());
            context.Response.Headers.Append("Set-Cookie", "__Host-Medcom.Session=synthetic; Secure; HttpOnly; Path=/");
            return context.Response.WriteAsync("ok");
        });
        using var first = await fixture.Client.GetAsync("/");
        using var second = await fixture.Client.GetAsync("/");
        Assert.Equal(new[] { "", "" }, receivedCookies);
    }

    [Theory]
    [InlineData("/workspace?tab=inbound", 302)]
    [InlineData("https://localhost:{port}/workspace", 302)]
    [InlineData("//example.invalid/workspace", 502)]
    [InlineData("https://example.invalid/workspace", 502)]
    [InlineData("http://localhost:{port}/workspace", 502)]
    [InlineData("https://localhost:{port}@example.invalid/workspace", 502)]
    [InlineData("/%2fexample.invalid/workspace", 502)]
    public async Task RedirectsAreNeverFollowedAndOnlyExactLocalLocationsSurvive(string location, int status)
    {
        var httpsPort = 0;
        await using var fixture = await RelayFixture.Start(context =>
        {
            context.Response.StatusCode = 302;
            context.Response.Headers.Location = location.Replace("{port}", httpsPort.ToString(System.Globalization.CultureInfo.InvariantCulture), StringComparison.Ordinal);
            return Task.CompletedTask;
        });
        httpsPort = fixture.HttpsPort;
        using var response = await fixture.Client.GetAsync("/");
        Assert.Equal(status, (int)response.StatusCode);
        Assert.Equal(1, fixture.UpstreamCalls);
        if (status == 302) Assert.NotNull(response.Headers.Location);
        else Assert.Null(response.Headers.Location);
    }

    [Theory]
    [InlineData("Connection: Origin\r\nOrigin: https://attacker.invalid\r\n")]
    [InlineData("Next-Url: https://example.invalid/\r\n")]
    [InlineData("Next-Url: //example.invalid/\r\n")]
    public async Task RoutingHeaderAmbiguitiesFailBeforeUpstream(string headers)
    {
        await using var fixture = await RelayFixture.Start(context => context.Response.WriteAsync("unreachable"));
        // Do not add "close": Kestrel's ParseConnection canonicalizes Origin + close to close before middleware.
        var response = await fixture.Raw("GET", "/", headers, appendConnectionClose: false);
        Assert.StartsWith("HTTP/1.1 400", response, StringComparison.Ordinal);
        Assert.Equal(0, fixture.UpstreamCalls);
    }

    [Theory]
    [InlineData("Connection: Origin, close\r\n")]
    [InlineData("Connection: Origin\r\nConnection: close\r\n")]
    [InlineData("Connection: close\r\nConnection: Origin\r\n")]
    public async Task KestrelNormalizedConnectionOptionsCannotEraseNativeProvenance(string connectionHeaders)
    {
        string? origin = null;
        string? site = null;
        await using var fixture = await RelayFixture.Start(context =>
        {
            origin = context.Request.Headers.Origin.ToString();
            site = context.Request.Headers["Sec-Fetch-Site"].ToString();
            context.Response.StatusCode = 403;
            return context.Response.WriteAsync("origin_rejected");
        });
        var response = await fixture.Raw("GET", "/api/erp/api/inbound-requests/draft",
            connectionHeaders + "Origin: https://attacker.invalid\r\nSec-Fetch-Site: cross-site\r\n", appendConnectionClose: false);
        Assert.StartsWith("HTTP/1.1 403", response, StringComparison.Ordinal);
        Assert.Equal("https://attacker.invalid", origin);
        Assert.Equal("cross-site", site);
        Assert.Equal(1, fixture.UpstreamCalls);
    }

    [Theory]
    [InlineData("/api/erp/api/auth/login", LoopbackRelay.SmallBodyLimit)]
    [InlineData("/api/erp/api/inbound-requests/draft/save", LoopbackRelay.CommandBodyLimit)]
    public async Task BodyLimitsPreserveExactBytesAtLimitAndRejectKnownOrStreamedOverflow(string path, int limit)
    {
        var bytes = Enumerable.Range(0, limit).Select(index => (byte)(index % 256)).ToArray();
        byte[]? received = null;
        await using var fixture = await RelayFixture.Start(async context =>
        {
            using var body = new MemoryStream();
            await context.Request.Body.CopyToAsync(body);
            received = body.ToArray();
            context.Response.StatusCode = 201;
            await context.Response.WriteAsync("created");
        });
        using var accepted = await fixture.Client.PostAsync(path, new ByteArrayContent(bytes));
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        Assert.Equal(bytes, received);
        using var acceptedStreamed = await fixture.Client.PostAsync(path, new StreamingContent(bytes));
        Assert.Equal(HttpStatusCode.Created, acceptedStreamed.StatusCode);
        Assert.Equal(bytes, received);
        // Read TLS responses while sending: an early 413 can close the request write side before HttpClient
        // finishes serializing a large body. A write failure alone never satisfies either rejection assertion.
        var declaredOverflow = await fixture.Raw("POST", path, body: new byte[limit + 1]);
        Assert.StartsWith("HTTP/1.1 413", declaredOverflow, StringComparison.Ordinal);
        Assert.Equal(2, fixture.UpstreamCalls);
        var streamedOverflow = await fixture.Raw("POST", path, body: new byte[limit + 1], chunked: true);
        Assert.StartsWith("HTTP/1.1 413", streamedOverflow, StringComparison.Ordinal);
        Assert.Equal(2, fixture.UpstreamCalls);
    }

    [Fact]
    public async Task BrowserCancellationCancelsTheFixedUpstreamRequest()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var canceled = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var fixture = await RelayFixture.Start(async context =>
        {
            started.TrySetResult();
            try { await Task.Delay(Timeout.InfiniteTimeSpan, context.RequestAborted); }
            catch (OperationCanceledException) { canceled.TrySetResult(); }
        });
        using var cancellation = new CancellationTokenSource();
        var request = fixture.Client.GetAsync("/", cancellation.Token);
        await started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => request);
        await canceled.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(1, fixture.UpstreamCalls);
    }

    [Fact]
    public async Task TimeoutReturnsGatewayTimeoutAndCancelsUpstream()
    {
        var canceled = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var fixture = await RelayFixture.Start(async context =>
        {
            try { await Task.Delay(Timeout.InfiniteTimeSpan, context.RequestAborted); }
            catch (OperationCanceledException) { canceled.TrySetResult(); }
        }, TimeSpan.FromMilliseconds(250));
        using var response = await fixture.Client.GetAsync("/");
        Assert.Equal(HttpStatusCode.GatewayTimeout, response.StatusCode);
        await canceled.Task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal(1, fixture.UpstreamCalls);
    }

    [Fact]
    public async Task TimeoutAfterResponseStartsAbortsTheStreamWithoutAppendingAnErrorBody()
    {
        var canceled = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var fixture = await RelayFixture.Start(async context =>
        {
            context.Response.ContentLength = 100;
            await context.Response.Body.WriteAsync(new byte[] { 0x42 });
            await context.Response.Body.FlushAsync();
            try { await Task.Delay(Timeout.InfiniteTimeSpan, context.RequestAborted); }
            catch (OperationCanceledException) { canceled.TrySetResult(); }
        }, TimeSpan.FromSeconds(1));
        using var response = await fixture.Client.GetAsync("/", HttpCompletionOption.ResponseHeadersRead);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var body = await response.Content.ReadAsStreamAsync();
        var first = new byte[1];
        Assert.Equal(1, await body.ReadAsync(first));
        Assert.Equal(0x42, first[0]);
        using var remaining = new MemoryStream();
        var error = await Record.ExceptionAsync(() => body.CopyToAsync(remaining));
        Assert.True(error is IOException or HttpRequestException, $"Expected a truncated response; got {error?.GetType().Name ?? "success"}.");
        Assert.Empty(remaining.ToArray());
        await canceled.Task.WaitAsync(TimeSpan.FromSeconds(10));
    }

    [Fact]
    public async Task InheritedHostConfigurationCannotReplaceOrAddListeners()
    {
        // This test collection runs without other parallel collections because environment variables are process-wide.
        var hostile = new Dictionary<string, string>
        {
            ["ASPNETCORE_URLS"] = "http://0.0.0.0:0",
            ["ASPNETCORE_PREFERHOSTINGURLS"] = "true",
            ["DOTNET_URLS"] = "http://0.0.0.0:0",
            ["DOTNET_PREFERHOSTINGURLS"] = "true",
            ["ASPNETCORE_HTTP_PORTS"] = "0",
            ["ASPNETCORE_HTTPS_PORTS"] = "0",
            ["Kestrel__Endpoints__Injected__Url"] = "http://0.0.0.0:0",
            ["ASPNETCORE_Kestrel__Endpoints__Injected__Url"] = "http://0.0.0.0:0"
        };
        var saved = hostile.Keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
        using var certificate = MakeCertificate();
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var httpsPort = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        try
        {
            foreach (var entry in hostile) Environment.SetEnvironmentVariable(entry.Key, entry.Value);
            await using var relay = LoopbackRelay.Build(new(httpsPort, httpsPort == 3100 ? 3101 : 3100), certificate);
            var bindings = relay.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!;
            Assert.False(bindings.PreferHostingUrls);
            Assert.Equal($"https://localhost:{httpsPort}", Assert.Single(bindings.Addresses));
            await relay.StartAsync();
            Assert.False(bindings.PreferHostingUrls);
            Assert.Equal($"https://localhost:{httpsPort}", Assert.Single(bindings.Addresses));
            await relay.StopAsync();
        }
        finally
        {
            foreach (var entry in saved) Environment.SetEnvironmentVariable(entry.Key, entry.Value);
        }
    }

    [Fact]
    public async Task HeadAndNotModifiedRetainStatusAndCachingHeaders()
    {
        await using var fixture = await RelayFixture.Start(context =>
        {
            context.Response.StatusCode = context.Request.Method == "HEAD" ? 200 : 304;
            context.Response.Headers.ETag = "\"same-asset\"";
            context.Response.Headers.CacheControl = "public, max-age=60";
            if (context.Request.Method == "HEAD") context.Response.ContentLength = 123;
            return Task.CompletedTask;
        });
        using var head = await fixture.Client.SendAsync(new HttpRequestMessage(HttpMethod.Head, "/_next/static/a.js"));
        Assert.Equal(HttpStatusCode.OK, head.StatusCode);
        Assert.Equal(123, head.Content.Headers.ContentLength);
        Assert.Empty(await head.Content.ReadAsByteArrayAsync());
        using var cached = await fixture.Client.GetAsync("/_next/static/a.js");
        Assert.Equal(HttpStatusCode.NotModified, cached.StatusCode);
        Assert.Equal("\"same-asset\"", cached.Headers.ETag!.Tag);
    }

    [Fact]
    public void CertificateSelectionRequiresAnExactThumbprintAndWindowsStore()
    {
        Assert.Equal("certificate_thumbprint_invalid", Assert.Throws<CertificateSelectionException>(() => DevelopmentCertificateSelector.Select("auto")).Code);
        Assert.Equal("certificate_thumbprint_invalid", Assert.Throws<CertificateSelectionException>(() => DevelopmentCertificateSelector.Select(new string('a', 40) + " ")).Code);
        if (!OperatingSystem.IsWindows())
            Assert.Equal("certificate_platform_unsupported", Assert.Throws<CertificateSelectionException>(() => DevelopmentCertificateSelector.Select(new string('a', 40))).Code);
    }

    [Theory]
    [InlineData("missing-key", "certificate_private_key_unavailable")]
    [InlineData("missing-san", "certificate_localhost_san_required")]
    [InlineData("wrong-san", "certificate_localhost_san_required")]
    [InlineData("missing-marker", "certificate_development_marker_required")]
    [InlineData("missing-eku", "certificate_server_auth_required")]
    [InlineData("wrong-eku", "certificate_server_auth_required")]
    [InlineData("expired", "certificate_expired_or_not_yet_valid")]
    [InlineData("future", "certificate_expired_or_not_yet_valid")]
    [InlineData("untrusted", "certificate_not_system_trusted")]
    public void CertificateChecksFailClosedWithoutChangingTrustStores(string variant, string code)
    {
        using var generated = MakeCertificate(variant);
        using var certificate = variant == "missing-key" ? X509CertificateLoader.LoadCertificate(generated.RawData) : null;
        Assert.Equal(code, Assert.Throws<CertificateSelectionException>(() => DevelopmentCertificateSelector.Validate(certificate ?? generated)).Code);
    }

    [Fact]
    public void PublicFixtureApiStillRequiresExplicitSafePortsAndAnAccessibleKey()
    {
        using var certificate = MakeCertificate();
        Assert.Throws<ArgumentOutOfRangeException>(() => LoopbackRelay.Build(new(0, 3100), certificate));
        Assert.Throws<ArgumentOutOfRangeException>(() => LoopbackRelay.Build(new(5187, 5187), certificate));
        Assert.Throws<ArgumentOutOfRangeException>(() => LoopbackRelay.Build(new(5187, 3100) { UpstreamTimeout = Timeout.InfiniteTimeSpan }, certificate));
        using var publicOnly = X509CertificateLoader.LoadCertificate(certificate.RawData);
        Assert.Throws<CertificateSelectionException>(() => LoopbackRelay.Build(new(5187, 3100), publicOnly));
    }

    private static X509Certificate2 MakeCertificate(string variant = "untrusted")
    {
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
        if (variant != "missing-san")
        {
            var san = new SubjectAlternativeNameBuilder();
            san.AddDnsName(variant == "wrong-san" ? "example.invalid" : "localhost");
            request.CertificateExtensions.Add(san.Build());
        }
        if (variant != "missing-marker") request.CertificateExtensions.Add(new X509Extension("1.3.6.1.4.1.311.84.1.1", [0x02], false));
        if (variant != "missing-eku") request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(
            new OidCollection { new(variant == "wrong-eku" ? "1.3.6.1.5.5.7.3.2" : "1.3.6.1.5.5.7.3.1") }, false));
        var from = variant == "future" ? DateTimeOffset.UtcNow.AddHours(1) : DateTimeOffset.UtcNow.AddHours(-2);
        var until = variant == "expired" ? DateTimeOffset.UtcNow.AddHours(-1) : DateTimeOffset.UtcNow.AddHours(2);
        using var generated = request.CreateSelfSigned(from, until);
        // Only this newly generated disposable synthetic key is normalized for Windows Schannel.
        // No owner/store certificate is exported, and no PFX file is written.
        var pfx = generated.Export(X509ContentType.Pfx);
        try { return X509CertificateLoader.LoadPkcs12(pfx, null); }
        finally { CryptographicOperations.ZeroMemory(pfx); }
    }

    private sealed class StreamingContent(byte[] bytes) : HttpContent
    {
        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) => stream.WriteAsync(bytes).AsTask();
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
    }

    private sealed class RelayFixture(WebApplication upstream, WebApplication relay, X509Certificate2 certificate,
        HttpClient client, int httpsPort, Func<int> calls) : IAsyncDisposable
    {
        public HttpClient Client { get; } = client;
        public int HttpsPort { get; } = httpsPort;
        public int UpstreamCalls => calls();

        public static async Task<RelayFixture> Start(RequestDelegate respond, TimeSpan? timeout = null)
        {
            var count = 0;
            var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions
            {
                Args = [], EnvironmentName = "Production", ContentRootPath = Path.GetTempPath()
            });
            builder.Logging.ClearProviders();
            builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0));
            var upstream = builder.Build();
            upstream.Run(async context => { Interlocked.Increment(ref count); await respond(context); });
            await upstream.StartAsync();
            var address = upstream.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
            var nodePort = new Uri(address).Port;
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            var httpsPort = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            var certificate = MakeCertificate();
            var relay = LoopbackRelay.Build(new(httpsPort, nodePort) { UpstreamTimeout = timeout ?? TimeSpan.FromSeconds(20) }, certificate);
            await relay.StartAsync();
            var client = new HttpClient(new HttpClientHandler
            {
                UseProxy = false, UseCookies = false, AllowAutoRedirect = false, AutomaticDecompression = DecompressionMethods.None,
                // Only this ephemeral fixture certificate is accepted. Production has no callback or bypass option.
                ServerCertificateCustomValidationCallback = (_, presented, _, _) => presented is not null && presented.RawData.AsSpan().SequenceEqual(certificate.RawData)
            }) { BaseAddress = new Uri($"https://localhost:{httpsPort}"), Timeout = TimeSpan.FromSeconds(15) };
            return new(upstream, relay, certificate, client, httpsPort, () => Volatile.Read(ref count));
        }

        public async Task<string> Raw(string method, string target, string headers = "", string? host = null,
            byte[]? body = null, bool chunked = false, bool appendConnectionClose = true)
        {
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            using var socket = new TcpClient();
            await socket.ConnectAsync(IPAddress.Loopback, HttpsPort, cancellation.Token);
            await using var stream = new SslStream(socket.GetStream(), false,
                (_, presented, _, _) => presented is not null && presented.GetRawCertData().AsSpan().SequenceEqual(certificate.RawData));
            await stream.AuthenticateAsClientAsync(new SslClientAuthenticationOptions
            {
                TargetHost = "localhost", EnabledSslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13
            }, cancellation.Token);
            var framing = body is null ? "" : chunked ? "Transfer-Encoding: chunked\r\n" : $"Content-Length: {body.Length}\r\n";
            var connection = appendConnectionClose ? "Connection: close\r\n" : "";
            var request = Encoding.ASCII.GetBytes($"{method} {target} HTTP/1.1\r\nHost: {host ?? $"localhost:{HttpsPort}"}\r\n{headers}{framing}{connection}\r\n");
            await stream.WriteAsync(request, cancellation.Token);
            var response = ReadResponseHeaders(stream, cancellation.Token);
            IOException? uploadFailure = null;
            try
            {
                if (body is not null)
                {
                    if (chunked)
                    {
                        for (var offset = 0; offset < body.Length; offset += 8192)
                        {
                            var length = Math.Min(8192, body.Length - offset);
                            await stream.WriteAsync(Encoding.ASCII.GetBytes(length.ToString("X", System.Globalization.CultureInfo.InvariantCulture) + "\r\n"), cancellation.Token);
                            await stream.WriteAsync(body.AsMemory(offset, length), cancellation.Token);
                            await stream.WriteAsync("\r\n"u8.ToArray(), cancellation.Token);
                        }
                        await stream.WriteAsync("0\r\n\r\n"u8.ToArray(), cancellation.Token);
                    }
                    else await stream.WriteAsync(body, cancellation.Token);
                }
            }
            catch (IOException exception) { uploadFailure = exception; }
            var result = await response;
            if (uploadFailure is not null && !result.StartsWith("HTTP/1.1 413", StringComparison.Ordinal))
                throw new IOException("The upload failed without an observed HTTP 413 response.", uploadFailure);
            return result;
        }

        private static async Task<string> ReadResponseHeaders(Stream stream, CancellationToken cancellation)
        {
            using var response = new MemoryStream();
            var buffer = new byte[1024];
            while (response.Length <= 64 * 1024)
            {
                var read = await stream.ReadAsync(buffer, cancellation);
                if (read == 0) throw new IOException("The connection ended before complete HTTP response headers.");
                response.Write(buffer, 0, read);
                var value = Encoding.ASCII.GetString(response.GetBuffer(), 0, (int)response.Length);
                var end = value.IndexOf("\r\n\r\n", StringComparison.Ordinal);
                if (end >= 0) return value[..(end + 4)];
            }
            throw new IOException("The response headers exceeded the fixture limit.");
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await relay.StopAsync();
            await relay.DisposeAsync();
            await upstream.StopAsync();
            await upstream.DisposeAsync();
            certificate.Dispose();
        }
    }
}
