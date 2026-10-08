using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class PurchaseRequestEndpointTests
{
    [Fact]
    public async Task Authorized_endpoint_serializes_display_outside_the_unchanged_aggregate()
    {
        await using var fixture=await PurchaseHttpFixture.Start();fixture.Source.Seed();
        fixture.Source.Display.MasterQualified=true;fixture.Source.Display.Items.Add(("QA-ITEM","NSX","Bộ thử nghiệm","ĐVT",true));
        await fixture.Login();
        var result=await fixture.Json("/api/purchase-requests/detail?documentId=QA-DOC");var data=result.GetProperty("data");
        var display=data.GetProperty("itemDisplayContext");var document=data.GetProperty("document");
        Assert.Equal(document.GetProperty("purchaseRequestId").GetString(),display.GetProperty("documentId").GetString());
        Assert.Equal(data.GetProperty("stateToken").GetString(),display.GetProperty("stateToken").GetString());
        Assert.Equal("NSX",display.GetProperty("lines")[0].GetProperty("manufacturerItemCode").GetString());
        Assert.False(document.TryGetProperty("itemDisplayContext",out _));
        Assert.False(document.GetProperty("lines")[0].GetProperty("values").TryGetProperty("manufacturerItemCode",out _));
        Assert.Equal(0,fixture.Source.Commits);
    }

    [Theory]
    [InlineData("/health/live", 200)]
    [InlineData("/health/ready", 503)]
    public async Task ExactPublicHealthGetIgnoresCookieAuthorityWithoutResolvingOrRetiringSession(string path, int status)
    {
        HealthSessions? sessions = null;
        var observations = new System.Collections.Concurrent.ConcurrentQueue<(bool Authenticated, bool Resolved)>();
        await using var fixture = await PurchaseHttpFixture.Start(services => {
            services.AddSingleton<LocalWebSessions>();
            services.AddSingleton<IWebSessions>(provider => sessions = new HealthSessions(provider.GetRequiredService<LocalWebSessions>()));
        }, context => {
            if (context.Request.Path == path) observations.Enqueue((context.User.Identity?.IsAuthenticated == true,
                context.Items.ContainsKey(AuthEndpoints.ResolvedKey)));
        });
        using var anonymous = await fixture.Client.GetAsync(path);
        Assert.Equal(status, (int)anonymous.StatusCode);
        var expected = await anonymous.Content.ReadAsStringAsync();
        await fixture.Login();
        sessions!.Clear(); var beforeAuthority = fixture.Authority.Revalidations;
        using var authenticatedCookie = await fixture.Client.GetAsync(path);
        Assert.Equal(status, (int)authenticatedCookie.StatusCode);
        Assert.Equal(expected, await authenticatedCookie.Content.ReadAsStringAsync());
        Assert.False(authenticatedCookie.Headers.Contains("Set-Cookie"));
        Assert.Equal(0, sessions.Resolves); Assert.Equal(0, sessions.Inspections); Assert.Equal(0, sessions.Revocations);
        Assert.Equal(beforeAuthority, fixture.Authority.Revalidations);
        // Health did not remove or replace the real session. A protected route
        // still resolves its cookie and sees current database authority.
        using var protectedRead = await fixture.Client.GetAsync("/api/workspace");
        Assert.Equal(HttpStatusCode.OK, protectedRead.StatusCode);
        Assert.Equal(1, sessions.Resolves); Assert.Equal(beforeAuthority + 1, fixture.Authority.Revalidations);
        sessions.Revoke(sessions.Created!.Token); sessions.Clear();
        using var revokedCookie = await fixture.Client.GetAsync(path);
        Assert.Equal(status, (int)revokedCookie.StatusCode);
        Assert.Equal(expected, await revokedCookie.Content.ReadAsStringAsync());
        Assert.False(revokedCookie.Headers.Contains("Set-Cookie"));
        Assert.Equal(0, sessions.Resolves); Assert.Equal(0, sessions.Inspections); Assert.Equal(0, sessions.Revocations);
        using var denied = await fixture.Client.GetAsync("/api/workspace");
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode); Assert.Equal(1, sessions.Resolves);
        Assert.Equal(3, observations.Count);
        Assert.All(observations, observation => { Assert.False(observation.Authenticated); Assert.False(observation.Resolved); });
    }

    [Theory]
    [InlineData("HEAD", "/health/live")]
    [InlineData("GET", "/health/live/")]
    [InlineData("GET", "/HEALTH/live")]
    [InlineData("GET", "/api/auth/csrf")]
    [InlineData("GET", "/api/auth/session")]
    public async Task HealthOptimizationDoesNotApplyToOtherMethodsPathsOrAnonymousRoutes(string method, string path)
    {
        HealthSessions? sessions = null;
        await using var fixture = await PurchaseHttpFixture.Start(services => {
            services.AddSingleton<LocalWebSessions>();
            services.AddSingleton<IWebSessions>(provider => sessions = new HealthSessions(provider.GetRequiredService<LocalWebSessions>()));
        });
        await fixture.Login(); sessions!.Clear(); var before = fixture.Authority.Revalidations;
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        using var response = await fixture.Client.SendAsync(request);
        Assert.Equal(1, sessions.Resolves); Assert.Equal(before + 1, fixture.Authority.Revalidations);
    }

    private sealed class HealthSessions(IWebSessions inner) : IWebSessions
    {
        public int Resolves, Inspections, Revocations;
        public ResolvedSession? Created;
        public void Clear() { Resolves = 0; Inspections = 0; Revocations = 0; }
        public ResolvedSession? Create(AuthoritativeIdentity identity) => Created = inner.Create(identity);
        public Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction, CancellationToken cancellationToken)
        { Resolves++; return inner.ResolveAsync(token, userInteraction, cancellationToken); }
        public Task<ResolvedSession?> InspectAsync(string token, CancellationToken cancellationToken)
        { Inspections++; return inner.InspectAsync(token, cancellationToken); }
        public void Revoke(string token) { Revocations++; inner.Revoke(token); }
    }

    [Theory]
    [InlineData("/api/purchase-requests/workspace", 2)]
    [InlineData("/api/purchase-requests?page=1&pageSize=20", 2)]
    [InlineData("/api/purchase-requests/detail?documentId=QA-DOC", 3)]
    public async Task ReadRoutesHaveBoundedFullAuthorityChecksWithoutDroppingNativeQueries(string path, int expected)
    {
        await using var fixture = await PurchaseHttpFixture.Start(); fixture.Source.Seed(101);
        await fixture.Login(); var before = fixture.Authority.Revalidations;
        using var response = await fixture.Client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(expected, fixture.Authority.Revalidations - before);
        Assert.Contains(fixture.Source.Commands, command => command.Sql == SqlPurchaseRequestQueries.CredentialText);
        Assert.Contains(fixture.Source.Commands, command => command.Sql == SqlPurchaseRequestQueries.GrantsText);
        Assert.Contains(fixture.Source.Commands, command => command.Sql == SqlLegacyBranchScope.NativeUserText);
        Assert.Equal(0, fixture.Source.Commits);
    }

    [Fact]
    public async Task CustomReadProviderStillGetsFullAuthorityBeforeAccessResolution()
    {
        var source = new PurchaseQuerySource(); source.Seed();
        var custom = new CustomReadQueries(source.Documents[0]); var access = new RecordingReadAccess();
        await using var fixture = await PurchaseHttpFixture.Start(services => {
            services.AddSingleton<IPurchaseRequestQueries>(custom);
            services.AddSingleton<IPurchaseRequestCommandAccess>(access);
        });
        await fixture.Login();
        // A custom read provider need not own the SQL reader's final full fence.
        custom.AfterRead = () => fixture.Authority.Rejected = true;
        using var response = await fixture.Client.GetAsync("/api/purchase-requests/detail?documentId=QA-DOC");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.DoesNotContain("Synthetic requester", await response.Content.ReadAsStringAsync());
        Assert.Equal(2, fixture.Authority.Revalidations); Assert.Equal(0, access.Calls);
    }

    private sealed class RecordingReadAccess : IPurchaseRequestCommandAccess
    {
        public int Calls;
        public Task<PurchaseRequestCommandAccessState> ResolveAsync(ResolvedSession session, string documentId, string branchId, CancellationToken token)
        { Calls++; return Task.FromResult(UnavailablePurchaseRequestCommandAccess.State); }
    }

    private sealed class CustomReadQueries(PurchaseRequestAggregate document) : IPurchaseRequestQueries
    {
        private readonly UnavailablePurchaseRequestQueries unavailable = new();
        public Action? AfterRead;
        public Task<PurchaseRequestQueryResult<PurchaseRequestReadback>> OpenAsync(string documentId, CancellationToken token = default)
        {
            AfterRead?.Invoke();
            return Task.FromResult(new PurchaseRequestQueryResult<PurchaseRequestReadback>(PurchaseRequestQueryOutcome.Success,
                new(document, PurchaseRequestCommandRules.EqualityToken(document))));
        }
        public Task<PurchaseRequestQueryResult<PurchaseRequestWorkspace>> WorkspaceAsync(CancellationToken token = default) => unavailable.WorkspaceAsync(token);
        public Task<PurchaseRequestQueryResult<PurchaseRequestListPage>> ListAsync(PurchaseRequestListQuery query, CancellationToken token = default) => unavailable.ListAsync(query, token);
        public Task<PurchaseRequestQueryResult<PurchaseRequestLookupPage>> LookupAsync(string kind, string? search, int page, CancellationToken token = default) => unavailable.LookupAsync(kind, search, page, token);
    }

    [Fact]
    public async Task Real_cookie_session_reads_full_source_data_and_separates_purchase_order_navigation()
    {
        await using var fixture=await PurchaseHttpFixture.Start(); fixture.Source.Seed(101);
        using var anonymous=await fixture.Client.GetAsync("/api/purchase-requests");Assert.Equal(HttpStatusCode.Unauthorized,anonymous.StatusCode);Assert.Equal(0,fixture.Source.Opens);
        await fixture.Login();
        var workspace=await fixture.Json("/api/workspace");
        Assert.Contains(workspace.GetProperty("navigation").EnumerateArray(),entry=>entry.GetProperty("id").GetString()=="purchase-requests");
        Assert.DoesNotContain(workspace.GetProperty("navigation").EnumerateArray(),entry=>entry.GetProperty("id").GetString()=="purchase-orders");
        var bootstrap=await fixture.Json("/api/purchase-requests/workspace");var scope=bootstrap.GetProperty("scopeKey").GetString();
        Assert.Matches("^[a-f0-9]{64}$",scope!);Assert.False(bootstrap.GetProperty("data").GetProperty("writeAvailable").GetBoolean());
        var list=await fixture.Json("/api/purchase-requests?page=1&pageSize=20&branchId=QA-A");Assert.Equal(scope,list.GetProperty("scopeKey").GetString());
        Assert.Equal("QA-DOC",Assert.Single(list.GetProperty("data").GetProperty("rows").EnumerateArray()).GetProperty("documentId").GetString());
        var detail=await fixture.Json("/api/purchase-requests/detail?documentId=QA-DOC");Assert.Equal(scope,detail.GetProperty("scopeKey").GetString());
        Assert.Equal(101,detail.GetProperty("data").GetProperty("document").GetProperty("lines").GetArrayLength());
        Assert.Equal("999999999999999999",detail.GetProperty("data").GetProperty("document").GetProperty("lines")[0].GetProperty("values").GetProperty("quantity").GetString());
        Assert.Equal(0,fixture.Source.Commits);
    }
    [Theory]
    [InlineData("/api/purchase-requests?table=SY_User")]
    [InlineData("/api/purchase-requests?page=1&page=2")]
    [InlineData("/api/purchase-requests?pageSize=51")]
    [InlineData("/api/purchase-requests/detail")]
    [InlineData("/api/purchase-requests/detail?documentId=QA-DOC&companyId=other")]
    [InlineData("/api/purchase-requests/lookup?kind=sql")]
    [InlineData("/api/purchase-requests/workspace?tenantId=other")]
    public async Task Invalid_selectors_are_rejected_before_source_reads(string path)
    {
        await using var fixture=await PurchaseHttpFixture.Start();await fixture.Login();
        using var response=await fixture.Client.GetAsync(path);Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);Assert.Equal(0,fixture.Source.Opens);
    }
    [Fact]
    public async Task Native_and_session_branch_permission_revocation_is_authoritative()
    {
        await using var fixture=await PurchaseHttpFixture.Start();fixture.Source.Seed();await fixture.Login();
        using var deniedBranch=await fixture.Client.GetAsync("/api/purchase-requests?branchId=other");Assert.Equal(HttpStatusCode.Forbidden,deniedBranch.StatusCode);Assert.Equal(0,fixture.Source.Opens);
        fixture.Source.NativeBranches=["QA-B"];
        using var hidden=await fixture.Client.GetAsync("/api/purchase-requests/detail?documentId=QA-DOC");Assert.Equal(HttpStatusCode.NotFound,hidden.StatusCode);
        fixture.Source.NativeBranches=["QA-A","QA-B"];fixture.Source.CanRun=false;
        using var nativeDenied=await fixture.Client.GetAsync("/api/purchase-requests");Assert.Equal(HttpStatusCode.Forbidden,nativeDenied.StatusCode);
        fixture.Authority.Identity=fixture.Authority.Identity with { Capabilities=["platform.status"] };
        var before=fixture.Source.Opens;using var revoked=await fixture.Client.GetAsync("/api/purchase-requests");Assert.Equal(HttpStatusCode.Forbidden,revoked.StatusCode);Assert.Equal(before,fixture.Source.Opens);
        var workspace=await fixture.Json("/api/workspace");Assert.DoesNotContain(workspace.GetProperty("navigation").EnumerateArray(),entry=>entry.GetProperty("id").GetString()=="purchase-requests");
    }
    [Fact]
    public async Task Scope_is_stable_on_observation_refresh_and_changes_after_logout_login()
    {
        await using var fixture=await PurchaseHttpFixture.Start();await fixture.Login();
        var first=(await fixture.Json("/api/purchase-requests/workspace")).GetProperty("scopeKey").GetString();
        fixture.Authority.Identity=fixture.Authority.Identity with { BranchIds=["QA-A"] };
        var second=(await fixture.Json("/api/purchase-requests/workspace")).GetProperty("scopeKey").GetString();Assert.Equal(first,second);
        using var logout=await fixture.Post("/api/auth/logout",null);Assert.Equal(HttpStatusCode.NoContent,logout.StatusCode);
        using var old=await fixture.Client.GetAsync("/api/purchase-requests");Assert.Equal(HttpStatusCode.Unauthorized,old.StatusCode);
        await fixture.Login();var third=(await fixture.Json("/api/purchase-requests/workspace")).GetProperty("scopeKey").GetString();Assert.NotEqual(first,third);
    }
    [Fact]
    public async Task Logout_during_SQL_read_and_idle_expiry_cannot_release_rows()
    {
        await using var fixture=await PurchaseHttpFixture.Start();fixture.Source.Seed();await fixture.Login();
        fixture.Source.AfterData=()=>fixture.Authority.Rejected=true;
        using var late=await fixture.Client.GetAsync("/api/purchase-requests/detail?documentId=QA-DOC");Assert.Equal(HttpStatusCode.Forbidden,late.StatusCode);
        var body=await late.Content.ReadAsStringAsync();Assert.DoesNotContain("QA-ITEM",body);Assert.DoesNotContain("synthetic-stored-value",body);
        fixture.Source.AfterData=null;fixture.Authority.Rejected=false;await fixture.Login();fixture.Clock.Now+=TimeSpan.FromMinutes(6);
        using var expired=await fixture.Client.GetAsync("/api/purchase-requests");Assert.Equal(HttpStatusCode.Unauthorized,expired.StatusCode);
    }
    [Fact]
    public async Task Typed_lookups_fail_closed_and_write_routes_do_not_dispatch()
    {
        await using var fixture=await PurchaseHttpFixture.Start();await fixture.Login();
        var branch=await fixture.Json("/api/purchase-requests/lookup?kind=branches&search=QA-A&page=1");Assert.Equal("QA-A",Assert.Single(branch.GetProperty("data").GetProperty("items").EnumerateArray()).GetProperty("id").GetString());
        foreach(var kind in new[]{"items","objects","purposes","currencies"})
        {var lookup=await fixture.Json("/api/purchase-requests/lookup?kind="+kind);Assert.False(lookup.GetProperty("data").GetProperty("available").GetBoolean());Assert.Equal(0,lookup.GetProperty("data").GetProperty("items").GetArrayLength());}
        var opens=fixture.Source.Opens;using var write=await fixture.Post("/api/purchase-requests",new{action="create"});Assert.Equal(HttpStatusCode.MethodNotAllowed,write.StatusCode);Assert.Equal(opens,fixture.Source.Opens);
    }
    [Fact]
    public async Task Qualified_reference_routes_return_exact_typed_values_and_preserve_branch_JSON()
    {
        await using var fixture = await PurchaseHttpFixture.Start(); await fixture.Login();
        fixture.Source.LookupShapeOk = true;
        fixture.Source.Purposes.Add((-1, null));
        fixture.Source.Currencies.AddRange([("NEG", "  Synthetic currency  ", -1.25), ("ZER", "Zero synthetic", 0)]);
        var purposes = await fixture.Json("/api/purchase-requests/lookup?kind=purposes");
        var purpose = Assert.Single(purposes.GetProperty("data").GetProperty("items").EnumerateArray());
        Assert.Equal("-1", purpose.GetProperty("id").GetString()); Assert.Equal(JsonValueKind.Null, purpose.GetProperty("label").ValueKind);
        Assert.Equal(2, purpose.EnumerateObject().Count());
        var currencies = await fixture.Json("/api/purchase-requests/lookup?kind=currencies");
        Assert.Equal(purposes.GetProperty("scopeKey").GetString(), currencies.GetProperty("scopeKey").GetString());
        var currency = currencies.GetProperty("data").GetProperty("items")[0];
        Assert.Equal("NEG", currency.GetProperty("id").GetString()); Assert.Equal("NEG", currency.GetProperty("label").GetString());
        Assert.Equal("  Synthetic currency  ", currency.GetProperty("currencyName").GetString()); Assert.Equal(-1.25, currency.GetProperty("rateExchange").GetDouble());
        Assert.Equal(0, currencies.GetProperty("data").GetProperty("items")[1].GetProperty("rateExchange").GetDouble());
        var branches = await fixture.Json("/api/purchase-requests/lookup?kind=branches&search=QA-A");
        var branch = Assert.Single(branches.GetProperty("data").GetProperty("items").EnumerateArray());
        Assert.Equal(new[] { "id", "label" }, branch.EnumerateObject().Select(property => property.Name));
        var workspace = (await fixture.Json("/api/purchase-requests/workspace")).GetProperty("data");
        Assert.False(workspace.GetProperty("writeAvailable").GetBoolean());
        foreach (var lookup in workspace.GetProperty("lookups").EnumerateArray())
            Assert.Equal(lookup.GetProperty("kind").GetString() is "branches" or "purposes" or "currencies", lookup.GetProperty("available").GetBoolean());
        Assert.Equal(0, fixture.Source.Commits);
    }
    [Theory]
    [InlineData("purposes")] [InlineData("currencies")]
    public async Task Reference_drift_is_honestly_unavailable_and_late_logout_cannot_release_values(string kind)
    {
        await using var fixture = await PurchaseHttpFixture.Start(); await fixture.Login();
        fixture.Source.LookupShapeOk = true; fixture.Source.BindingOverrides["GridName"] = "";
        var unavailable = (await fixture.Json("/api/purchase-requests/lookup?kind=" + kind)).GetProperty("data");
        Assert.False(unavailable.GetProperty("available").GetBoolean()); Assert.Equal("source_binding_unqualified", unavailable.GetProperty("reason").GetString());
        Assert.Empty(unavailable.GetProperty("items").EnumerateArray());
        fixture.Source.BindingOverrides.Clear(); fixture.Source.Purposes.Add((1, "Synthetic reference value"));
        fixture.Source.Currencies.Add(("SYN", "Synthetic reference value", 0));
        fixture.Source.AfterLookupData = () => fixture.Authority.Rejected = true;
        using var revoked = await fixture.Client.GetAsync("/api/purchase-requests/lookup?kind=" + kind);
        Assert.Equal(HttpStatusCode.Forbidden, revoked.StatusCode); Assert.DoesNotContain("Synthetic reference value", await revoked.Content.ReadAsStringAsync());
        Assert.Equal(0, fixture.Source.Commits); Assert.Equal(fixture.Source.Opens, fixture.Source.ConnectionDisposals);
    }
    [Theory]
    [InlineData("/api/purchase-requests/lookup?kind=purposes&page=1001")]
    [InlineData("/api/purchase-requests/lookup?kind=currencies&kind=purposes")]
    [InlineData("/api/purchase-requests/lookup?kind=currencies&date=2026-10-06")]
    public async Task Reference_selectors_cannot_expand_fixed_query_scope(string path)
    {
        await using var fixture = await PurchaseHttpFixture.Start(); await fixture.Login();
        using var response = await fixture.Client.GetAsync(path);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); Assert.Equal(0, fixture.Source.Opens);
    }
    [Fact]
    public async Task Malformed_reference_projection_returns_safe_unavailable_response()
    {
        await using var fixture = await PurchaseHttpFixture.Start(); await fixture.Login();
        fixture.Source.LookupShapeOk = true; fixture.Source.BadLookupProjection = "currencies"; fixture.Source.BadLookupShape = "extra-result";
        fixture.Source.Currencies.Add(("SYN", "Synthetic private label", 1));
        using var response = await fixture.Client.GetAsync("/api/purchase-requests/lookup?kind=currencies");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.DoesNotContain("Synthetic private label", await response.Content.ReadAsStringAsync()); Assert.Equal(0, fixture.Source.Commits);
    }

}

internal sealed class PurchaseHttpFixture(WebApplication app,HttpClient client,X509Certificate2 certificate,string configPath,PurchaseQuerySource source,PurchaseHttpAuthority authority,PurchaseClock clock):IAsyncDisposable
{
    public HttpClient Client=>client;public PurchaseQuerySource Source=>source;public PurchaseHttpAuthority Authority=>authority;public PurchaseClock Clock=>clock;
    public static async Task<PurchaseHttpFixture> Start(Action<IServiceCollection>? commandServices = null, Action<HttpContext>? observeRequest = null)
    {
        // Only a generated fixture certificate and an empty synthetic configuration file.
        using var key=RSA.Create(2048);var request=new CertificateRequest("CN=localhost",key,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1);
        using var generated=request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1),DateTimeOffset.UtcNow.AddHours(1));
        var bytes=generated.Export(X509ContentType.Pfx);X509Certificate2 certificate;
        try{certificate=X509CertificateLoader.LoadPkcs12(bytes,null);}finally{CryptographicOperations.ZeroMemory(bytes);}
        var configPath=Path.Combine(Path.GetTempPath(),"medcom-i17-synthetic-"+Guid.NewGuid().ToString("N")+".json");await File.WriteAllTextAsync(configPath,"{}");
        var source=new PurchaseQuerySource();var authority=new PurchaseHttpAuthority();var clock=new PurchaseClock();
        var app=ApiHost.Build(["--environment","Production","--Legacy:Enabled","false","--Medcom:PrivateConfigPath",configPath,"--Session:IdleMinutes","5","--Session:AbsoluteMinutes","10"],builder=>{
            builder.Logging.ClearProviders();builder.WebHost.ConfigureKestrel(options=>options.Listen(IPAddress.Loopback,0,listen=>listen.UseHttps(certificate)));
            builder.Services.AddSingleton<IIdentityAuthority>(authority);builder.Services.AddSingleton<TimeProvider>(clock);
            builder.Services.AddScoped<IPurchaseRequestQueries>(provider=>{
                var context=provider.GetRequiredService<IHttpContextAccessor>().HttpContext!;var token=AuthEndpoints.Current(context).Token;
                var sessions=provider.GetRequiredService<IWebSessions>();
                return new SqlPurchaseRequestQueries(PurchaseQuerySource.Company,()=>new QueryConnection(source),async cancellation=>(await sessions.ResolveAsync(token,false,cancellation))?.Identity,
                    async cancellation=>(await sessions.InspectAsync(token,cancellation))?.Identity);
            });
            commandServices?.Invoke(builder.Services);
        });
        if (observeRequest is not null) app.Use(async (context, next) => { await next(context); observeRequest(context); });
        await app.StartAsync();var address=app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.Single();
        var client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false,CookieContainer=new CookieContainer(),ServerCertificateCustomValidationCallback=(_,cert,_,_)=>cert?.Thumbprint==certificate.Thumbprint}){BaseAddress=new Uri(address)};
        return new(app,client,certificate,configPath,source,authority,clock);
    }
    public async Task Login(){using var response=await Post("/api/auth/login",new{username="qa-user",password="synthetic-password"});Assert.Equal(HttpStatusCode.OK,response.StatusCode);}
    public async Task<HttpResponseMessage> Post(string path,object? body)
    {
        var csrf=await Json("/api/auth/csrf");var request=new HttpRequestMessage(HttpMethod.Post,path);if(body is not null)request.Content=JsonContent.Create(body);
        request.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());return await client.SendAsync(request);
    }
    public async Task<JsonElement> Json(string path){using var response=await client.GetAsync(path);Assert.Equal(HttpStatusCode.OK,response.StatusCode);Assert.True(response.Headers.CacheControl?.NoStore);using var body=JsonDocument.Parse(await response.Content.ReadAsStringAsync());return body.RootElement.Clone();}
    public async ValueTask DisposeAsync(){client.Dispose();await app.StopAsync();await app.DisposeAsync();certificate.Dispose();File.Delete(configPath);}
}
internal sealed class PurchaseHttpAuthority:IIdentityAuthority
{
    public AuthoritativeIdentity Identity=PurchaseQuerySource.NewIdentity();public bool Rejected;private long version;public int Revalidations;
    public Task<IdentityResult> AuthenticateAsync(string username,string password,CancellationToken token)=>Task.FromResult(username=="qa-user"&&password=="synthetic-password"&&!Rejected?new IdentityResult(IdentityOutcome.Success,Identity with {AuthorityVersion=Interlocked.Increment(ref version)}):new IdentityResult(IdentityOutcome.Rejected));
    public Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity,CancellationToken token)
    { Interlocked.Increment(ref Revalidations); return Task.FromResult(Rejected?new IdentityResult(IdentityOutcome.Rejected):new IdentityResult(IdentityOutcome.Success,Identity with {AuthorityVersion=Interlocked.Increment(ref version)})); }
}
internal sealed class PurchaseClock:TimeProvider{public DateTimeOffset Now=DateTimeOffset.UtcNow;public override DateTimeOffset GetUtcNow()=>Now;}
