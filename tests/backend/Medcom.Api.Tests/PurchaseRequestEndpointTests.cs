using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
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
}

internal sealed class PurchaseHttpFixture(WebApplication app,HttpClient client,X509Certificate2 certificate,string configPath,PurchaseQuerySource source,PurchaseHttpAuthority authority,PurchaseClock clock):IAsyncDisposable
{
    public HttpClient Client=>client;public PurchaseQuerySource Source=>source;public PurchaseHttpAuthority Authority=>authority;public PurchaseClock Clock=>clock;
    public static async Task<PurchaseHttpFixture> Start()
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
                return new SqlPurchaseRequestQueries(PurchaseQuerySource.Company,()=>new QueryConnection(source),async cancellation=>(await sessions.ResolveAsync(token,false,cancellation))?.Identity);
            });
        });
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
    public AuthoritativeIdentity Identity=PurchaseQuerySource.NewIdentity();public bool Rejected;private long version;
    public Task<IdentityResult> AuthenticateAsync(string username,string password,CancellationToken token)=>Task.FromResult(username=="qa-user"&&password=="synthetic-password"&&!Rejected?new IdentityResult(IdentityOutcome.Success,Identity with {AuthorityVersion=Interlocked.Increment(ref version)}):new IdentityResult(IdentityOutcome.Rejected));
    public Task<IdentityResult> RevalidateAsync(AuthoritativeIdentity identity,CancellationToken token)=>Task.FromResult(Rejected?new IdentityResult(IdentityOutcome.Rejected):new IdentityResult(IdentityOutcome.Success,Identity with {AuthorityVersion=Interlocked.Increment(ref version)}));
}
internal sealed class PurchaseClock:TimeProvider{public DateTimeOffset Now=DateTimeOffset.UtcNow;public override DateTimeOffset GetUtcNow()=>Now;}
