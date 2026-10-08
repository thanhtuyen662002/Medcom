using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Contracts;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class AuthenticationHttpTests
{
    [Fact]
    public async Task Workspace_branch_metadata_changes_read_scope_with_equal_grants_without_rejecting_supplemental_queries()
    {
        var documents = new ScopeDocuments();
        await using var server = await SecureTestServer.Start(documentReader: documents);
        server.Authority.Identity = server.Authority.Identity with { Capabilities = ["platform.status", "purchase-orders.read"],
            BranchIds = ["A", "B"], BranchSelection = new("all", null, false) };
        using var login = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "synthetic-password" }, await server.Csrf());
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        async Task<(string Session, string Read)> Workspace(BranchSelection? expected)
        {
            using var response = await server.Client.GetAsync("/api/workspace");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<WorkspaceView>();
            Assert.NotNull(body); Assert.Equal(expected, body.BranchSelection);
            Assert.Equal(new[] { "A", "B" }, body.BranchIds);
            return (response.Headers.GetValues("X-Medcom-Session-Scope").Single(),
                response.Headers.GetValues("X-Medcom-Read-Scope").Single());
        }
        var all = await Workspace(new("all", null, false));
        server.Authority.Identity = server.Authority.Identity with { AuthorityVersion = 2, BranchSelection = new("assigned", "A", true) };
        var assigned = await Workspace(new("assigned", "A", true));
        Assert.Equal(all.Session, assigned.Session); Assert.NotEqual(all.Read, assigned.Read);
        using (var supplemental = await server.Client.GetAsync("/api/documents/purchase-orders?branchId=B"))
        {
            Assert.Equal(HttpStatusCode.OK, supplemental.StatusCode);
            Assert.Equal(assigned.Read, supplemental.Headers.GetValues("X-Medcom-Read-Scope").Single());
        }
        Assert.Equal("B", documents.LastBranchQuery);
        Assert.Contains("B", documents.LastIdentity!.BranchIds!);
        using (var detail = await server.Client.GetAsync("/api/documents/purchase-orders/detail?documentId=TEST"))
            Assert.Equal(HttpStatusCode.OK, detail.StatusCode);
        server.Authority.Identity = server.Authority.Identity with { AuthorityVersion = 3, BranchSelection = new("assigned", "B", true) };
        var reassigned = await Workspace(new("assigned", "B", true));
        Assert.Equal(all.Session, reassigned.Session); Assert.NotEqual(assigned.Read, reassigned.Read);
        server.Authority.Identity = server.Authority.Identity with { AuthorityVersion = 4, BranchSelection = null };
        var unavailable = await Workspace(null);
        Assert.Equal(all.Session, unavailable.Session); Assert.NotEqual(reassigned.Read, unavailable.Read);
        server.Authority.Identity = server.Authority.Identity with { AuthorityVersion = 5, BranchSelection = new("all", null, false) };
        Assert.Equal(all, await Workspace(new("all", null, false)));
        Assert.Equal(2, documents.Calls);
    }

    [Fact]
    public async Task RealLoginSessionLogoutAndReplayAreServerAuthoritative()
    {
        await using var server = await SecureTestServer.Start();
        var csrf = await server.Csrf();
        using var login = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "synthetic-password" }, csrf);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var cookie = login.Headers.GetValues("Set-Cookie").Single(value => value.StartsWith("__Host-Medcom.Session="));
        Assert.Contains("secure", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        using var session = await server.Client.GetAsync("/api/auth/session");
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
        using var json = JsonDocument.Parse(await session.Content.ReadAsStringAsync());
        Assert.Equal("test-tenant", json.RootElement.GetProperty("tenantId").GetString());
        Assert.False(json.RootElement.TryGetProperty("token", out _));
        csrf = await server.Csrf();
        using var logout = await server.Post("/api/auth/logout", null, csrf);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        using var replay = new HttpRequestMessage(HttpMethod.Get, "/api/auth/session");
        replay.Headers.Add("Cookie", cookie.Split(';')[0]);
        using var response = await server.Client.SendAsync(replay);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ReadScopeHeadersTrackSessionAndRightsNotObservationOrActivity()
    {
        await using var server = await SecureTestServer.Start(documentReader: new ScopeDocuments());
        server.Authority.Identity = server.Authority.Identity with
        { Capabilities = ["purchase-orders.read", "platform.status"], BranchIds = ["B", "A"] };
        async Task<(string Session, string Read)> Scope(string route)
        {
            using var response = await server.Client.GetAsync(route);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var session = response.Headers.GetValues("X-Medcom-Session-Scope").Single();
            var read = response.Headers.GetValues("X-Medcom-Read-Scope").Single();
            Assert.Matches("^[a-f0-9]{64}$", session); Assert.Matches("^[a-f0-9]{64}$", read);
            Assert.NotEqual(session, read);
            var body = await response.Content.ReadAsStringAsync();
            Assert.DoesNotContain(session, body); Assert.DoesNotContain(read, body);
            return (session, read);
        }
        using var login = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "synthetic-password" }, await server.Csrf());
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var initial = await Scope("/api/workspace");
        Assert.Equal(initial, await Scope("/api/documents/purchase-orders"));
        Assert.Equal(initial, await Scope("/api/documents/purchase-orders/detail?documentId=TEST"));
        server.Authority.Identity = server.Authority.Identity with
        { AuthorityVersion = 2, Capabilities = ["platform.status", "purchase-orders.read"], BranchIds = ["A", "B", "A"] };
        using var continued = await server.Post("/api/auth/session/continue", null, await server.Csrf());
        Assert.Equal(HttpStatusCode.OK, continued.StatusCode);
        Assert.Equal(initial, await Scope("/api/workspace"));
        server.Authority.Identity = server.Authority.Identity with { AuthorityVersion = 3, BranchIds = ["A"] };
        var changed = await Scope("/api/workspace");
        Assert.Equal(initial.Session, changed.Session); Assert.NotEqual(initial.Read, changed.Read);
        Assert.Equal(changed, await Scope("/api/documents/purchase-orders"));
        using var rotated = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "synthetic-password" }, await server.Csrf());
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        var replacement = await Scope("/api/workspace");
        Assert.NotEqual(changed.Session, replacement.Session); Assert.NotEqual(changed.Read, replacement.Read);
        using var anonymous = server.NewClient();
        using var spoof = new HttpRequestMessage(HttpMethod.Get, "/api/workspace");
        spoof.Headers.Add("X-Medcom-Session-Scope", replacement.Session);
        spoof.Headers.Add("X-Medcom-Read-Scope", replacement.Read);
        using var denied = await anonymous.SendAsync(spoof);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        Assert.False(denied.Headers.Contains("X-Medcom-Session-Scope"));
        Assert.False(denied.Headers.Contains("X-Medcom-Read-Scope"));
        server.Authority.Identity = server.Authority.Identity with { AuthorityVersion = 4, Capabilities = [] };
        using var forbidden = await server.Client.GetAsync("/api/documents/purchase-orders");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.False(forbidden.Headers.Contains("X-Medcom-Read-Scope"));
    }

    private sealed class ScopeDocuments : IDocumentReader
    {
        private static readonly Medcom.Contracts.DocumentSummary Row = new("TEST", "2026-10-06", "A", 1, false);
        public int Calls;
        public string? LastBranchQuery;
        public AuthoritativeIdentity? LastIdentity;
        public Task<DocumentResult> ReadAsync(AuthoritativeIdentity identity, DocumentKind kind, DocumentQuery query, CancellationToken token)
        {
            Calls++; LastBranchQuery = query.BranchId; LastIdentity = identity;
            return Task.FromResult(new DocumentResult(DocumentOutcome.Success, new([Row], query.Page, query.PageSize, false)));
        }
        public Task<DocumentDetailResult> ReadDetailAsync(AuthoritativeIdentity identity, DocumentKind kind, DocumentDetailQuery query, CancellationToken token)
        {
            Calls++; LastIdentity = identity;
            return Task.FromResult(new DocumentDetailResult(DocumentOutcome.Success, new(Row, [], [], query.Page, query.PageSize, false)));
        }
    }

    [Fact]
    public async Task LoginCsrfIsRequiredAndRejectedRequestsNeverIssueSessionCookie()
    {
        await using var server = await SecureTestServer.Start();
        using var missing = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "synthetic-password" }, null);
        Assert.Equal(HttpStatusCode.Forbidden, missing.StatusCode);
        Assert.False(missing.Headers.Contains("Set-Cookie"));
        var csrf = await server.Csrf();
        using var invalid = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "synthetic-password" }, csrf + "invalid");
        Assert.Equal(HttpStatusCode.Forbidden, invalid.StatusCode);
    }

    [Fact]
    public async Task DefaultAuthorityHasNoFakeLoginAndReturns503()
    {
        await using var server = await SecureTestServer.Start(configureAuthority: false);
        using var result = await server.Post("/api/auth/login", new { username = "admin", password = "any-value" }, await server.Csrf());
        Assert.Equal(HttpStatusCode.ServiceUnavailable, result.StatusCode);
        Assert.False(result.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task UnknownLoginFieldsCannotSelectTenantDatabaseOrScope()
    {
        await using var server = await SecureTestServer.Start();
        using var result = await server.Post("/api/auth/login", new
        {
            username = "synthetic-user", password = "synthetic-password", tenantId = "other", database = "arbitrary"
        }, await server.Csrf());
        Assert.Equal(HttpStatusCode.BadRequest, result.StatusCode);
        Assert.False(result.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task AnonymousCsrfCannotBeReusedAfterLoginAndCapabilityRevocationIsImmediate()
    {
        await using var server = await SecureTestServer.Start();
        var before = await server.Csrf();
        using var login = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "synthetic-password" }, before);
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        using var invalidContinue = await server.Post("/api/auth/session/continue", null, before);
        Assert.Equal(HttpStatusCode.Forbidden, invalidContinue.StatusCode);
        using var metadata = await server.Client.GetAsync("/api/platform/metadata");
        Assert.Equal(HttpStatusCode.OK, metadata.StatusCode);
        server.Authority.Identity = server.Authority.Identity with { AuthorityVersion = 2, Capabilities = [] };
        using var denied = await server.Client.GetAsync("/api/platform/metadata");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        using var workspace = await server.Client.GetAsync("/api/workspace");
        using var body = JsonDocument.Parse(await workspace.Content.ReadAsStringAsync());
        Assert.Empty(body.RootElement.GetProperty("navigation").EnumerateArray());
        using var continued = await server.Post("/api/auth/session/continue", null, await server.Csrf());
        Assert.Equal(HttpStatusCode.OK, continued.StatusCode);
    }

    [Fact]
    public async Task RateLimitBoundsAttemptsWithoutUnboundedQueue()
    {
        await using var server = await SecureTestServer.Start();
        var csrf = await server.Csrf();
        for (var i = 0; i < 30; i++)
        {
            using var response = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "wrong" }, csrf);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        using var throttled = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "wrong" }, csrf);
        Assert.Equal(HttpStatusCode.TooManyRequests, throttled.StatusCode);
    }

    [Fact]
    public async Task AuthorityCannotMoveExistingSessionToAnotherTenant()
    {
        await using var server = await SecureTestServer.Start();
        using var login = await server.Post("/api/auth/login", new { username = "synthetic-user", password = "synthetic-password" }, await server.Csrf());
        server.Authority.Identity = server.Authority.Identity with { TenantId = "different-tenant" };
        using var result = await server.Client.GetAsync("/api/workspace");
        Assert.Equal(HttpStatusCode.Unauthorized, result.StatusCode);
    }

    [Fact]
    public async Task DistinctUsersAndTenantsAreIsolatedOnOneHttpsPort()
    {
        var authority = new MultipleTenantAuthority();
        await using var server = await SecureTestServer.Start(identityAuthority: authority);
        using var other = server.NewClient();
        async Task Login(HttpClient client, string username)
        {
            using var issued = await client.GetAsync("/api/auth/csrf");
            using var csrf = JsonDocument.Parse(await issued.Content.ReadAsStringAsync());
            using var request = new HttpRequestMessage(HttpMethod.Post, "/api/auth/login")
            { Content = JsonContent.Create(new { username, password = "synthetic-password" }) };
            request.Headers.Add("X-CSRF-TOKEN", csrf.RootElement.GetProperty("token").GetString());
            using var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        }
        await Task.WhenAll(Login(server.Client, "one"), Login(other, "two"));
        foreach (var (client, tenant) in new[] { (server.Client, "tenant-one"), (other, "tenant-two") })
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "/api/workspace?tenantId=arbitrary");
            request.Headers.Add("X-Tenant-ID", "arbitrary");
            using var response = await client.SendAsync(request);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal(tenant, body.RootElement.GetProperty("session").GetProperty("tenantId").GetString());
        }
    }

    [Fact]
    public async Task DocumentApiRechecksCapabilityAndRejectsUnknownQueryFieldsBeforeReader()
    {
        var reader=new CountingDocuments();
        await using var server=await SecureTestServer.Start(documentReader:reader);
        server.Authority.Identity=server.Authority.Identity with { Capabilities=["platform.status","purchase-orders.read"], BranchIds=["BR-A"] };
        using var login=await server.Post("/api/auth/login",new { username="synthetic-user",password="synthetic-password" },await server.Csrf());
        Assert.Equal(HttpStatusCode.OK,login.StatusCode);
        using var unknown=await server.Client.GetAsync("/api/documents/purchase-orders?table=SY_User");
        Assert.Equal(HttpStatusCode.BadRequest,unknown.StatusCode); Assert.Equal(0,reader.Calls);
        using var allowed=await server.Client.GetAsync("/api/documents/purchase-orders?page=1");
        Assert.Equal(HttpStatusCode.OK,allowed.StatusCode); Assert.Equal(1,reader.Calls);
        foreach(var query in new[]{"", "documentId=TEST&table=SY_User", "documentId=TEST&page=0", "documentId=TEST&pageSize=101", "documentId="+new string('x',31)})
        {
            using var invalid=await server.Client.GetAsync("/api/documents/purchase-orders/detail?"+query);
            Assert.Equal(HttpStatusCode.BadRequest,invalid.StatusCode); Assert.Equal(1,reader.Calls);
        }
        using var detail=await server.Client.GetAsync("/api/documents/purchase-orders/detail?documentId=TEST");
        Assert.Equal(HttpStatusCode.NotFound,detail.StatusCode); Assert.Equal(2,reader.Calls);
        server.Authority.Identity=server.Authority.Identity with { AuthorityVersion=2,Capabilities=["platform.status"] };
        using var revoked=await server.Client.GetAsync("/api/documents/purchase-orders");
        Assert.Equal(HttpStatusCode.Forbidden,revoked.StatusCode); Assert.Equal(2,reader.Calls);
        using var revokedDetail=await server.Client.GetAsync("/api/documents/purchase-orders/detail?documentId=TEST");
        Assert.Equal(HttpStatusCode.Forbidden,revokedDetail.StatusCode); Assert.Equal(2,reader.Calls);
    }

    private sealed class CountingDocuments : IDocumentReader
    {
        public int Calls;
        public Task<DocumentResult> ReadAsync(AuthoritativeIdentity identity,DocumentKind kind,DocumentQuery query,CancellationToken token)
        { Calls++; return Task.FromResult(new DocumentResult(DocumentOutcome.Success,new([],query.Page,query.PageSize,false))); }
        public Task<DocumentDetailResult> ReadDetailAsync(AuthoritativeIdentity identity,DocumentKind kind,DocumentDetailQuery query,CancellationToken token)
        { Calls++; return Task.FromResult(new DocumentDetailResult(DocumentOutcome.NotFound)); }
    }

    private sealed class MultipleTenantAuthority : IIdentityAuthority
    {
        private static AuthoritativeIdentity Identity(string user) => new(user, "tenant-" + user, "company-" + user,
            "Synthetic " + user, "Synthetic " + user, 1, ["platform.status"]);
        public Task<IdentityResult> AuthenticateAsync(string username, string password, CancellationToken cancellationToken) =>
            Task.FromResult(username is "one" or "two" && password == "synthetic-password"
                ? new IdentityResult(IdentityOutcome.Success, Identity(username)) : new IdentityResult(IdentityOutcome.Rejected));
        public Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity, CancellationToken cancellationToken) =>
            Task.FromResult(new IdentityResult(IdentityOutcome.Success, Identity(identity.PrincipalId)));
    }
}

internal sealed class SecureTestServer(WebApplication app, HttpClient client, X509Certificate2 certificate,
    ControlledAuthority authority) : IAsyncDisposable
{
    public HttpClient Client { get; } = client;
    public ControlledAuthority Authority { get; } = authority;

    public static async Task<SecureTestServer> Start(bool configureAuthority = true, IIdentityAuthority? identityAuthority = null, IDocumentReader? documentReader = null, string? webRoot = null)
    {
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=localhost", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var generated = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddHours(1));
        // Windows Schannel needs an imported private key for the server handshake.
        // DefaultKeySet creates a temporary key which is cleaned up on certificate disposal.
        // Keep the same fixture-only thumbprint trust boundary on every platform.
        var pkcs12 = generated.Export(X509ContentType.Pfx);
        X509Certificate2 certificate;
        try { certificate = X509CertificateLoader.LoadPkcs12(pkcs12, null); }
        finally { CryptographicOperations.ZeroMemory(pkcs12); }
        var authority = new ControlledAuthority();
        var app = ApiHost.Build(["--environment", "Production", "--Legacy:Enabled", "false"], builder =>
        {
            builder.Logging.ClearProviders();
            builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0,
                listen => listen.UseHttps(certificate)));
            if (configureAuthority) builder.Services.AddSingleton(identityAuthority ?? authority);
            if (documentReader is not null) builder.Services.AddSingleton(documentReader);
        }, webRoot);
        await app.StartAsync();
        var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        var client = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = false, CookieContainer = new CookieContainer(),
            // This test-only generated TLS certificate is trusted only by this fixture.
            ServerCertificateCustomValidationCallback = (_, cert, _, _) => cert?.Thumbprint == certificate.Thumbprint
        }) { BaseAddress = new Uri(address) };
        return new(app, client, certificate, authority);
    }

    public async Task<string> Csrf()
    {
        using var result = await Client.GetAsync("/api/auth/csrf");
        result.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await result.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("token").GetString()!;
    }

    public HttpClient NewClient() => new(new HttpClientHandler
    {
        AllowAutoRedirect = false, CookieContainer = new CookieContainer(),
        ServerCertificateCustomValidationCallback = (_, cert, _, _) => cert?.Thumbprint == certificate.Thumbprint
    }) { BaseAddress = Client.BaseAddress };

    public Task<HttpResponseMessage> Post(string route, object? body, string? csrf)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, route);
        if (body is not null) request.Content = JsonContent.Create(body);
        if (csrf is not null) request.Headers.Add("X-CSRF-TOKEN", csrf);
        return Client.SendAsync(request);
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await app.StopAsync();
        await app.DisposeAsync();
        certificate.Dispose();
    }
}
