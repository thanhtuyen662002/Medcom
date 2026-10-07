using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Medcom.Contracts.Inbound;
using Medcom.Infrastructure;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Medcom.Api.Tests;

// Real ASP.NET/Kestrel/cookie/antiforgery tests WHEN RUN, with ephemeral test TLS
// and synthetic I15 providers only. The R8 cases also exercise the real
// LegacyIdentityAuthority and LocalWebSessions over synthetic in-memory users,
// passwords, company and clock, never legacy SQL/DLL. The optional ApiHost
// composition uses an explicit owned harmless PrivateConfigPath BEFORE Build,
// with Legacy disabled; it never reads server settings. No SQL/DLL needed.
public sealed class InboundDraftEndpointTests
{
    private static readonly Guid Operation = Guid.Parse("11111111-1111-4111-8111-111111111111");
    private static readonly JsonSerializerOptions Wire = new(JsonSerializerDefaults.Web);
    private static InboundDraftHeader Header() => new(new DateTime(2026, 10, 1, 14, 22, 11, 3),
        "FULL ERP A", "", "FROM", "TO", "TYPE", "BR-A", null, "VND", 1.0000000000m, "");
    private static InboundDraftDetailUpsert Detail(string id = "ROW-1") => new(id, null, "ITEM-1", "",
        999999999999999999m, 0m, new DateTime(2027, 1, 2, 12, 34, 56, 997), 1m);
    private static InboundDraftCommand Command(InboundDraftAction action = InboundDraftAction.Save) => new(Operation, action,
        "DOC-A", new string('A', 64), action == InboundDraftAction.Save ? Header() with { Notes = null } : null,
        [], [], [], action == InboundDraftAction.Save ? null : "");
    private static string Body(InboundDraftAction action = InboundDraftAction.Save) => JsonSerializer.Serialize(Command(action), Wire);
    private static async Task<JsonDocument> Json(HttpResponseMessage response)
    {
        var bytes = await response.Content.ReadAsByteArrayAsync();
        return JsonDocument.Parse(bytes);
    }

    [Fact]
    public async Task ApiHost_composes_exact_inbound_routes_with_unavailable_defaults_and_preserves_existing_routes()
    {
        await using var f = await Fixture.Start(composed: true);
        var endpoints = ((IEndpointRouteBuilder)f.App).DataSources.SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>().ToArray();
        static string[] Methods(RouteEndpoint endpoint) => endpoint.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods.ToArray();
        var inbound = endpoints.Where(endpoint => endpoint.RoutePattern.RawText!
            .StartsWith(InboundDraftEndpoints.Root, StringComparison.Ordinal)).ToArray();
        Assert.Equal(new[]
        {
            "GET /api/inbound-requests/draft", "POST /api/inbound-requests/draft/reconcile",
            "POST /api/inbound-requests/draft/save", "POST /api/inbound-requests/draft/send-to-warehouse"
        }, inbound.SelectMany(endpoint => Methods(endpoint).Select(method => method + " " + endpoint.RoutePattern.RawText))
            .OrderBy(value => value, StringComparer.Ordinal).ToArray());
        foreach (var (route, method) in new[]
        {
            ("/api/auth/csrf", "GET"), ("/api/auth/login", "POST"), ("/api/auth/session", "GET"),
            ("/api/auth/session/continue", "POST"), ("/api/auth/logout", "POST"), ("/api/workspace", "GET"),
            ("/api/purchase-requests", "GET"), ("/api/purchase-requests/workspace", "GET"),
            ("/api/purchase-requests/detail", "GET"), ("/api/purchase-requests/lookup", "GET"),
            ("/api/purchase-requests/save", "POST"), ("/api/purchase-requests/submit", "POST"),
            ("/api/purchase-requests/save/lookup", "POST"), ("/api/purchase-requests/submit/lookup", "POST")
        }) Assert.Single(endpoints, endpoint => endpoint.RoutePattern.RawText == route && Methods(endpoint).Contains(method));
        using var scope = f.App.Services.CreateScope();
        var services = scope.ServiceProvider;
        Assert.IsType<UnavailableInboundDraftCommandAccess>(services.GetRequiredService<IInboundDraftCommandAccess>());
        Assert.IsType<UnavailableInboundDraftCommandService>(services.GetRequiredService<IInboundDraftCommandService>());
        Assert.IsType<UnavailablePurchaseRequestQueries>(services.GetRequiredService<IPurchaseRequestQueries>());
        Assert.IsType<UnavailablePurchaseRequestCommandAccess>(services.GetRequiredService<IPurchaseRequestCommandAccess>());
        Assert.IsType<UnavailablePurchaseRequestCommands>(services.GetRequiredService<IPurchaseRequestCommands>());
        Assert.IsType<UnavailableIdentityAuthority>(services.GetRequiredService<IIdentityAuthority>());
        var configuration = services.GetRequiredService<IConfiguration>();
        Assert.False(configuration.GetValue<bool>("Legacy:Enabled"));
        Assert.Equal(f.PrivateConfigPath, configuration[ServerConfiguration.PrivateConfigPathKey]);
        using var session = await f.Client.GetAsync("/api/auth/session");
        Assert.Equal(HttpStatusCode.OK, session.StatusCode);
        f.Sessions.Identity = f.Sessions.Identity with { Capabilities = ["inbound-requests.read", "purchase-requests.read"] };
        using var purchase = await f.Client.GetAsync("/api/purchase-requests/workspace");
        Assert.Equal(HttpStatusCode.ServiceUnavailable, purchase.StatusCode);
    }

    [Fact]
    public async Task ApiHost_valid_authenticated_read_returns_closed_unavailable_without_an_invented_scope()
    {
        await using var f = await Fixture.Start(composed: true);
        using var response = await f.Get();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = await Json(response);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("scopeKey").ValueKind);
        foreach (var right in new[] { "available", "canRead", "canSave", "canSend" })
            Assert.False(json.RootElement.GetProperty("access").GetProperty(right).GetBoolean());
        Assert.Equal(InboundDraftEndpoints.MaximumBodyBytes, json.RootElement.GetProperty("access").GetProperty("maxCommandBytes").GetInt32());
        Assert.Equal("Unavailable", json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("data").GetProperty("document").ValueKind);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
        Assert.Equal("nosniff", Assert.Single(response.Headers.GetValues("X-Content-Type-Options")));
    }

    [Fact]
    public async Task BuiltInUnavailableGetUsesOneFullAuthenticationAndNoDocumentAccess()
    {
        await using var f = await Fixture.Start(composed: true, realAuthority: true);
        f.Real!.Observed.Clear();
        using var response = await f.Get();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Single(f.Real.Observed.Delivered);
        Assert.Equal(1, f.Real.Observed.Inspections);
        Assert.Equal(0, f.Writer.Reads);
        using var json = await Json(response);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("scopeKey").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("data").GetProperty("document").ValueKind);
        foreach (var right in new[] { "available", "canRead", "canSave", "canSend" })
            Assert.False(json.RootElement.GetProperty("access").GetProperty(right).GetBoolean());
    }

    [Theory]
    [InlineData("access")] [InlineData("service")]
    public async Task MixedCustomAndUnavailableProvidersRetainNormalReadFences(string provider)
    {
        await using var f = await Fixture.Start(composed: true, realAuthority: true, partialProvider: provider);
        f.Real!.Observed.Clear();
        using var response = await f.Get();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(4, f.Real.Observed.Delivered.Length); Assert.Equal(0, f.Real.Observed.Inspections);
        using var json = await Json(response);
        Assert.Equal("Unavailable", json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("data").GetProperty("document").ValueKind);
        Assert.Equal(provider == "access", json.RootElement.GetProperty("scopeKey").ValueKind == JsonValueKind.String);
        Assert.Equal(0, f.Writer.Reads);
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task BuiltInUnavailableGetStillFencesLogoutOrExpiryAfterAuthentication(bool expire)
    {
        await using var f = await Fixture.Start(composed: true, realAuthority: true);
        f.Real!.Observed.Clear();
        f.Real.Observed.AfterResolve = (call, session, _) => {
            if (call == 1 && session is not null) {
                if (expire) f.Real.Clock.Advance(TimeSpan.FromMinutes(10));
                else f.Real.Sessions.Revoke(session.Token);
            }
            return Task.CompletedTask;
        };
        using var response = await f.Get();
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(0, f.Writer.Reads);
    }

    [Theory]
    [InlineData("save", InboundDraftAction.Save)]
    [InlineData("send-to-warehouse", InboundDraftAction.SendToWarehouse)]
    [InlineData("reconcile", InboundDraftAction.Save)]
    [InlineData("reconcile", InboundDraftAction.SendToWarehouse)]
    public async Task ApiHost_valid_commands_are_mapped_but_remain_unavailable(string route, InboundDraftAction action)
    {
        await using var f = await Fixture.Start(composed: true);
        using var response = await f.Post(Body(action), route, new string('a', 64));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = await Json(response);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("scopeKey").ValueKind);
        Assert.Equal("Unavailable", json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("data").GetProperty("receipt").ValueKind);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
    }

    [Theory]
    [InlineData(false, "same", false, 403)]
    [InlineData(true, "cross", false, 403)]
    [InlineData(true, "missing", false, 403)]
    [InlineData(true, "same", true, 409)]
    public async Task ApiHost_composed_command_guards_precede_unavailable_response(bool csrf, string origin, bool omitScope, int status)
    {
        await using var f = await Fixture.Start(composed: true);
        using var response = await f.Post(Body(), scope: new string('a', 64), csrf: csrf, origin: origin, omitScope: omitScope);
        Assert.Equal(status, (int)response.StatusCode);
    }

    [Fact]
    public async Task ApiHost_composed_reads_reject_unproved_provenance_and_malformed_scope()
    {
        await using var f = await Fixture.Start(composed: true);
        using var missing = await f.Client.GetAsync(InboundDraftEndpoints.Root + "?documentId=DOC-A");
        Assert.Equal(HttpStatusCode.Forbidden, missing.StatusCode);
        using var request = new HttpRequestMessage(HttpMethod.Get, InboundDraftEndpoints.Root + "?documentId=DOC-A");
        request.Headers.Add("Origin", f.Origin); request.Headers.Add("Sec-Fetch-Site", "cross-site");
        using var contradictory = await f.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, contradictory.StatusCode);
        using var malformed = await f.Get(scope: "not-an-inbound-scope");
        Assert.Equal(HttpStatusCode.Conflict, malformed.StatusCode);
    }

    [Fact]
    public async Task ApiHost_composed_inbound_requires_a_live_cookie_session()
    {
        await using var f = await Fixture.Start(composed: true, login: false);
        using var anonymous = await f.Get();
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        await f.Login();
        using var authenticated = await f.Get();
        Assert.Equal(HttpStatusCode.OK, authenticated.StatusCode);
        f.Sessions.Revoked = true;
        using var revoked = await f.Get();
        Assert.Equal(HttpStatusCode.Unauthorized, revoked.StatusCode);
    }

    [Fact]
    public async Task Defaults_are_unavailable_and_do_not_activate_I15()
    {
        await using var f = await Fixture.Start(defaults: true);
        using var services = f.App.Services.CreateScope();
        Assert.IsType<UnavailableInboundDraftCommandAccess>(services.ServiceProvider.GetRequiredService<IInboundDraftCommandAccess>());
        Assert.IsType<UnavailableInboundDraftCommandService>(services.ServiceProvider.GetRequiredService<IInboundDraftCommandService>());
        using var response = await f.Get();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = await Json(response);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("scopeKey").ValueKind);
        Assert.False(json.RootElement.GetProperty("access").GetProperty("available").GetBoolean());
        Assert.Equal("Unavailable", json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        using var post = await f.Post(Body(), scope: new string('a', 64));
        using var data = await Json(post);
        Assert.Equal("Unavailable", data.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Empty(f.Writer.Executed); Assert.Equal(0, f.Writer.Reads); Assert.Empty(f.Writer.Reconciled);
    }
    [Fact]
    public async Task Cookie_authentication_is_required_not_a_bearer_or_client_claim()
    {
        await using var f = await Fixture.Start(login: false);
        using var request = new HttpRequestMessage(HttpMethod.Get, InboundDraftEndpoints.Root + "?documentId=DOC-A");
        request.Headers.Add("Origin", f.Origin); request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "synthetic-not-a-cookie");
        using var result = await f.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, result.StatusCode); Assert.Equal(0, f.Writer.Reads);
        Assert.Contains("no-store", result.Headers.CacheControl!.ToString());
    }
    [Theory]
    [InlineData(false, "same", 403)]
    [InlineData(true, "cross", 403)]
    [InlineData(true, "missing", 403)]
    public async Task Csrf_and_origin_fail_closed_before_dispatch(bool csrf, string origin, int status)
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        using var result = await f.Post(Body(), scope: scope, csrf: csrf, origin: origin);
        Assert.Equal(status, (int)result.StatusCode); Assert.Empty(f.Writer.Executed);
    }
    [Fact]
    public async Task Https_is_required_even_with_a_valid_cookie_on_the_loopback_http_listener()
    {
        await using var f = await Fixture.Start();
        using var request = new HttpRequestMessage(HttpMethod.Get, f.HttpOrigin + InboundDraftEndpoints.Root + "?documentId=DOC-A");
        request.Headers.Add("Cookie", f.Cookies.GetCookieHeader(new Uri(f.Origin)));
        request.Headers.Add("Origin", f.Origin);
        using var response = await f.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); Assert.Equal(0, f.Writer.Reads);
    }
    [Fact]
    public async Task Full_read_requires_current_Update_not_list_capability_and_does_not_truncate()
    {
        await using var f = await Fixture.Start();
        f.Access.Update = false;
        Assert.Contains("inbound-requests.read", f.Sessions.Identity.Capabilities);
        using (var denied = await f.Get())
        using (var json = await Json(denied))
        {
            Assert.Equal("Denied", json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
            Assert.False(json.RootElement.GetProperty("access").GetProperty("canRead").GetBoolean());
        }
        Assert.Equal(0, f.Writer.Reads);
        f.Access.Update = true;
        f.Writer.View = f.Writer.View with { Details = Enumerable.Range(1, 500).Select(i => Detail("ROW-" + i)).ToArray() };
        using var response = await f.Get(); using var result = await Json(response);
        var document = result.RootElement.GetProperty("data").GetProperty("document");
        Assert.Equal(500, document.GetProperty("details").GetArrayLength());
        Assert.Equal("999999999999999999", document.GetProperty("details")[499].GetProperty("setQuantityByDocument").GetString());
        Assert.Equal("1.0000000000", document.GetProperty("header").GetProperty("rateExchange").GetString());
        Assert.Equal("2026-10-01T14:22:11.003", document.GetProperty("header").GetProperty("documentDate").GetString());
        Assert.Equal(JsonValueKind.Null, document.GetProperty("header").GetProperty("objectId").ValueKind);
        Assert.Equal("", document.GetProperty("header").GetProperty("invoiceNo").GetString());
    }
    [Fact]
    public async Task Scope_is_stable_for_rights_document_changes_but_binds_database_company_principal_login()
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        f.Sessions.Identity = f.Sessions.Identity with { AuthorityVersion = 2, Capabilities = ["inbound-requests.read", "synthetic-other"] };
        f.Access.Send = false; Assert.Equal(scope, await f.Scope());
        using (var other = await f.Get(document: "DOC-B"))
        using (var json = await Json(other)) Assert.Equal(scope, json.RootElement.GetProperty("scopeKey").GetString());
        f.Access.Binding = Guid.NewGuid();
        using (var changed = await f.Get(scope: scope)) Assert.Equal(HttpStatusCode.Conflict, changed.StatusCode);
        var databaseScope = await f.Scope(); Assert.NotEqual(scope, databaseScope);
        f.Sessions.Identity = f.Sessions.Identity with { CompanyId = "ANOTHER-COMPANY" };
        Assert.NotEqual(databaseScope, await f.Scope());
        var companyScope = await f.Scope(); f.Sessions.Identity = f.Sessions.Identity with { PrincipalId = "OTHER-USER" };
        Assert.NotEqual(companyScope, await f.Scope());
        var principalScope = await f.Scope(); await f.Login(rotate: true);
        Assert.NotEqual(principalScope, await f.Scope());
    }
    [Theory]
    [InlineData("missing")]
    [InlineData("wrong")]
    [InlineData("duplicate")]
    public async Task Command_scope_header_is_mandatory_single_and_exact(string kind)
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        using var result = await f.Post(Body(), scope: kind == "wrong" ? new string('b', 64) : scope,
            omitScope: kind == "missing", duplicateScope: kind == "duplicate");
        Assert.Equal(HttpStatusCode.Conflict, result.StatusCode); Assert.Empty(f.Writer.Executed);
    }
    [Fact]
    public async Task Branch_is_server_resolved_and_rechecked_after_provider_and_service_awaits()
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        using (var changedHeader = await f.Post(Body().Replace("BR-A", "BR-B"), scope: scope))
            Assert.Equal(HttpStatusCode.Forbidden, changedHeader.StatusCode);
        Assert.Empty(f.Writer.Executed);
        f.Access.After = () => { f.Sessions.Identity = f.Sessions.Identity with { BranchIds = [] }; return Task.CompletedTask; };
        using (var afterProvider = await f.Get(scope: scope)) Assert.Equal(HttpStatusCode.Forbidden, afterProvider.StatusCode);
        f.Access.After = null; f.Sessions.Identity = f.Sessions.Identity with { BranchIds = ["BR-A"] };
        f.Writer.AfterRead = () => {f.Access.Branch = "BR-B"; return Task.CompletedTask;};
        using var afterService = await f.Get(scope: scope); Assert.Equal(HttpStatusCode.Forbidden, afterService.StatusCode);
    }
    [Fact]
    public async Task Revoked_login_or_authority_after_await_cannot_return_old_data_or_receipt()
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        f.Writer.AfterRead = () => {f.Sessions.Revoked = true; return Task.CompletedTask;};
        using (var revoked = await f.Get(scope: scope)) Assert.Equal(HttpStatusCode.Unauthorized, revoked.StatusCode);
        f.Sessions.Revoked = false; f.Writer.AfterRead = null;
        f.Writer.AfterExecute = () => {f.Sessions.Identity = f.Sessions.Identity with { AuthorityVersion = 2, Capabilities = [] }; return Task.CompletedTask;};
        using var changed = await f.Post(Body(), scope: scope);
        Assert.Equal(HttpStatusCode.Forbidden, changed.StatusCode);
        Assert.Single(f.Writer.Executed); Assert.NotNull(f.Writer.Receipt); // may have committed: not proof of rollback
    }
    [Theory]
    [InlineData("read", false)]
    [InlineData("save", false)]
    [InlineData("send-to-warehouse", false)]
    [InlineData("reconcile", false)]
    [InlineData("read", true)]
    [InlineData("save", true)]
    [InlineData("send-to-warehouse", true)]
    [InlineData("reconcile", true)]
    public async Task Real_legacy_revalidation_advances_versions_without_closing_stable_ApiHost_requests(string route, bool enabled)
    {
        await using var f = await Fixture.Start(composed: true, realAuthority: true, enabled: enabled);
        using (var services = f.App.Services.CreateScope())
        {
            Assert.Same(f.Real!.Authority, services.ServiceProvider.GetRequiredService<IIdentityAuthority>());
            if (!enabled)
            {
                Assert.IsType<UnavailableInboundDraftCommandAccess>(services.ServiceProvider.GetRequiredService<IInboundDraftCommandAccess>());
                Assert.IsType<UnavailableInboundDraftCommandService>(services.ServiceProvider.GetRequiredService<IInboundDraftCommandService>());
            }
        }
        var scope = enabled ? await f.Scope() : new string('a', 64);
        f.Writer.Receipt = Receipt(InboundDraftAction.Save);
        f.Real!.Observed.Clear();
        var reads = f.Writer.Reads;
        using var response = await f.Invoke(route, scope);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = await Json(response);
        Assert.Equal(enabled ? route == "read" ? "Observed" : route == "reconcile" ? "Replayed" : "Committed" : "Unavailable",
            json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Equal(enabled ? scope : null, json.RootElement.GetProperty("scopeKey").GetString());
        if (!enabled)
        {
            Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("data").GetProperty(route == "read" ? "document" : "receipt").ValueKind);
            Assert.Equal(reads, f.Writer.Reads); Assert.Empty(f.Writer.Executed); Assert.Empty(f.Writer.Reconciled);
        }
        else
        {
            Assert.Equal(reads + (route == "read" ? 1 : 0), f.Writer.Reads);
            Assert.Equal(route is "save" or "send-to-warehouse" ? 1 : 0, f.Writer.Executed.Count);
            Assert.Equal(route == "reconcile" ? 1 : 0, f.Writer.Reconciled.Count);
        }
        // Includes the real cookie middleware and every facade revalidation.
        // The decorator records returned snapshots unchanged, without rewriting versions.
        var observations = f.Real.Observed.Delivered;
        if (route == "read" && !enabled)
        {
            Assert.Single(observations); Assert.Equal(1, f.Real.Observed.Inspections);
        }
        else Assert.True(observations.Length >= (route == "read" ? 6 : enabled ? 9 : 7));
        long previous = f.Real.Created.Identity.AuthorityVersion;
        foreach (var observation in observations)
        {
            Assert.Equal(f.Real.Created.Token, observation.Token); Assert.False(observation.UserInteraction);
            var live = Assert.IsType<ResolvedSession>(observation.Session);
            Assert.Equal(f.Real.Created.Token, live.Token);
            Assert.True(live.Identity.AuthorityVersion > previous);
            Assert.Equal(f.Real.Created.Identity.Capabilities, live.Identity.Capabilities);
            Assert.Equal(f.Real.Created.Identity.BranchIds, live.Identity.BranchIds);
            previous = live.Identity.AuthorityVersion;
        }
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
    }

    public static IEnumerable<object[]> SessionCheckpoints()
    {
        // Facade-only fixture uses a buffered MemoryStream body: one data read
        // and one EOF read. These counts therefore cannot depend on TCP chunks.
        // GET: initial, pre-provider, post-provider, post-service/pre-provider,
        // post-provider. POST adds post-CSRF, body-data and body-EOF before these.
        foreach (var route in new[] { "read", "save", "send-to-warehouse", "reconcile" })
            for (var checkpoint = 1; checkpoint <= (route == "read" ? 5 : 8); checkpoint++)
                yield return [route, checkpoint];
    }

    [Theory]
    [MemberData(nameof(SessionCheckpoints))]
    public async Task Every_session_checkpoint_rejects_invalid_or_regressing_actual_versions(string route, int checkpoint)
    {
        await using var f = await Fixture.Start();
        var scope = await f.Scope();
        f.BufferRequestBody = true; f.Writer.Receipt = Receipt(InboundDraftAction.Save);
        f.Sessions.Clear();
        f.Sessions.Observe = (call, live) => live with { Identity = live.Identity with
        {
            // Later checkpoints prove 1 -> 5 -> 4 fails even though 4 >= 1.
            // The second observation has only the 5 -> 4 prefix available.
            AuthorityVersion = call == checkpoint ? checkpoint == 1 ? 0 : 4
                : checkpoint == 2 || call > 1 ? 5 : 1
        } };
        var reads = f.Writer.Reads;
        using var response = await f.Invoke(route, scope);
        await AssertSuppressed(response, checkpoint == 1 ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden);
        Assert.Equal(checkpoint, f.Sessions.Delivered.Count);
        Assert.Equal(checkpoint == 1 ? 0 : 4, f.Sessions.Delivered[^1]!.Identity.AuthorityVersion);
        var dispatched = checkpoint >= (route == "read" ? 4 : 7);
        Assert.Equal(reads + (route == "read" && dispatched ? 1 : 0), f.Writer.Reads);
        Assert.Equal((route is "save" or "send-to-warehouse") && dispatched ? 1 : 0, f.Writer.Executed.Count);
        Assert.Equal(route == "reconcile" && dispatched ? 1 : 0, f.Writer.Reconciled.Count);
        if (dispatched && route != "read") Assert.NotNull(f.Writer.Receipt); // Suppression is not rollback.
    }

    [Theory]
    [InlineData("read")]
    [InlineData("save")]
    [InlineData("send-to-warehouse")]
    [InlineData("reconcile")]
    public async Task Positive_equal_and_increasing_observations_and_canonical_rights_remain_admitted(string route)
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        f.BufferRequestBody = true; f.Writer.Receipt = Receipt(InboundDraftAction.Save);
        f.Sessions.Identity = f.Sessions.Identity with
        { Capabilities = ["synthetic-extra", "inbound-requests.read"], BranchIds = ["BR-B", "BR-A"] };
        f.Sessions.Clear();
        f.Sessions.Observe = (call, live) => live with { Identity = live.Identity with
        {
            AuthorityVersion = call == 1 ? 1 : call <= 3 ? 2 : 5,
            Capabilities = call % 2 == 0 ? ["inbound-requests.read", "synthetic-extra", "inbound-requests.read"] : ["synthetic-extra", "inbound-requests.read"],
            BranchIds = call % 2 == 0 ? ["BR-A", "BR-B", "BR-A"] : ["BR-B", "BR-A"]
        } };
        using var response = await f.Invoke(route, scope);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = await Json(response);
        Assert.Equal(scope, json.RootElement.GetProperty("scopeKey").GetString());
        Assert.Equal(route == "read" ? "Observed" : route == "reconcile" ? "Replayed" : "Committed",
            json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Equal(route == "read" ? 5 : 8, f.Sessions.Delivered.Count);
        Assert.Equal(1, f.Sessions.Delivered[0]!.Identity.AuthorityVersion);
        Assert.Equal(2, f.Sessions.Delivered[1]!.Identity.AuthorityVersion);
    }

    public static IEnumerable<object[]> IdentityAndRightsChanges()
    {
        foreach (var route in new[] { "read", "save", "send-to-warehouse", "reconcile" })
            foreach (var mutation in new[] { "token", "principal", "tenant", "company", "stamp", "capability", "capability-case", "branch", "branch-case" })
                // Catch a transient change immediately, even if the provider
                // would restore the old identity before the next observation.
                yield return [route, mutation];
    }

    [Theory]
    [MemberData(nameof(IdentityAndRightsChanges))]
    public async Task Frozen_baseline_rejects_transient_identity_or_rights_changes_before_dispatch(string route, string mutation)
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        f.BufferRequestBody = true; f.Sessions.Clear();
        f.Sessions.Observe = (call, live) => call != 2 ? live : mutation switch
        {
            "token" => live with { Token = new string('B', 64) },
            "principal" => live with { Identity = live.Identity with { PrincipalId = "OTHER" } },
            "tenant" => live with { Identity = live.Identity with { TenantId = "OTHER" } },
            "company" => live with { Identity = live.Identity with { CompanyId = "OTHER" } },
            "stamp" => live with { Identity = live.Identity with { CredentialStamp = "OTHER" } },
            "capability" => live with { Identity = live.Identity with { Capabilities = [] } },
            "capability-case" => live with { Identity = live.Identity with { Capabilities = ["INBOUND-REQUESTS.READ"] } },
            "branch" => live with { Identity = live.Identity with { BranchIds = [] } },
            _ => live with { Identity = live.Identity with { BranchIds = ["br-a"] } }
        };
        var reads = f.Writer.Reads;
        using var response = await f.Invoke(route, scope);
        await AssertSuppressed(response, mutation is "token" or "principal" or "tenant" or "company" or "stamp"
            ? HttpStatusCode.Unauthorized : HttpStatusCode.Forbidden);
        Assert.Equal(2, f.Sessions.Delivered.Count);
        Assert.Equal(reads, f.Writer.Reads); Assert.Empty(f.Writer.Executed); Assert.Empty(f.Writer.Reconciled);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Provider_owned_rights_lists_cannot_mutate_the_frozen_request_baseline(bool branches)
    {
        await using var f = await Fixture.Start();
        var capabilities = new List<string> { "inbound-requests.read", "synthetic-extra" };
        var branchIds = new List<string> { "BR-A", "BR-B" };
        f.Sessions.Identity = f.Sessions.Identity with { Capabilities = capabilities, BranchIds = branchIds };
        f.Access.After = () =>
        {
            if (branches) branchIds.Remove("BR-B"); else capabilities.Remove("synthetic-extra");
            return Task.CompletedTask;
        };
        using var response = await f.Get();
        await AssertSuppressed(response, HttpStatusCode.Forbidden);
        Assert.Equal(0, f.Writer.Reads);
    }

    [Theory]
    [InlineData("read", "capability")]
    [InlineData("save", "capability")]
    [InlineData("send-to-warehouse", "capability")]
    [InlineData("reconcile", "capability")]
    [InlineData("read", "branch")]
    [InlineData("save", "branch")]
    [InlineData("send-to-warehouse", "branch")]
    [InlineData("reconcile", "branch")]
    [InlineData("read", "stamp")]
    [InlineData("save", "revoke")]
    [InlineData("send-to-warehouse", "disabled")]
    [InlineData("reconcile", "expiry")]
    public async Task Real_session_revocation_or_rights_loss_after_service_suppresses_old_data_and_receipts(string route, string mutation)
    {
        await using var f = await Fixture.Start(realAuthority: true);
        var scope = await f.Scope(); f.Writer.Receipt = Receipt(InboundDraftAction.Save);
        var reads = f.Writer.Reads;
        Task Change()
        {
            switch (mutation)
            {
                case "capability": f.Real!.Users.Capabilities = []; break;
                case "branch": f.Real!.Users.Branches = []; break;
                case "stamp": f.Real!.Users.StoredHash = "synthetic-changed-hash"; break;
                case "disabled": f.Real!.Users.Disabled = true; break;
                case "revoke": f.Real!.Sessions.Revoke(f.Real.Created.Token); break;
                case "expiry": f.Real!.Clock.Advance(TimeSpan.FromMinutes(10)); break;
            }
            return Task.CompletedTask;
        }
        f.Writer.AfterRead = Change; f.Writer.AfterExecute = Change; f.Writer.AfterReconcile = Change;
        using var response = await f.Invoke(route, scope);
        await AssertSuppressed(response, mutation is "capability" or "branch" ? HttpStatusCode.Forbidden : HttpStatusCode.Unauthorized);
        Assert.Equal(reads + (route == "read" ? 1 : 0), f.Writer.Reads);
        Assert.Equal(route is "save" or "send-to-warehouse" ? 1 : 0, f.Writer.Executed.Count);
        Assert.Equal(route == "reconcile" ? 1 : 0, f.Writer.Reconciled.Count);
        if (route != "read") Assert.NotNull(f.Writer.Receipt); // A possible committed write remains recorded.
    }

    [Theory]
    [InlineData("binding")]
    [InlineData("branch")]
    [InlineData("document")]
    [InlineData("update")]
    [InlineData("send")]
    [InlineData("available")]
    public async Task Increasing_real_versions_do_not_weaken_provider_scope_and_access_rechecks(string mutation)
    {
        await using var f = await Fixture.Start(realAuthority: true); var scope = await f.Scope();
        f.Writer.AfterExecute = () =>
        {
            switch (mutation)
            {
                case "binding": f.Access.Binding = Guid.NewGuid(); break;
                case "branch": f.Access.Branch = "BR-B"; break;
                case "document": f.Access.Document = "OTHER"; break;
                case "update": f.Access.Update = false; break;
                case "send": f.Access.Send = false; break;
                case "available": f.Access.Available = false; break;
            }
            return Task.CompletedTask;
        };
        using var response = await f.Post(Body(), scope: scope);
        await AssertSuppressed(response, HttpStatusCode.Forbidden);
        Assert.Single(f.Writer.Executed); Assert.NotNull(f.Writer.Receipt);
    }

    [Fact]
    public async Task Concurrent_real_requests_keep_independent_last_accepted_version_fences()
    {
        await using var f = await Fixture.Start(realAuthority: true);
        var captured = new TaskCompletionSource<ResolvedSession>(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        f.Real!.Observed.AfterResolve = async (call, live, token) =>
        {
            // First request already accepted its baseline. Hold its next genuine
            // snapshot AFTER LocalWebSessions has released the per-session lock.
            if (call == 2)
            {
                captured.TrySetResult(Assert.IsType<ResolvedSession>(live));
                await release.Task.WaitAsync(token);
            }
        };
        var first = f.Get(cancellation: cancellation.Token);
        Task<HttpResponseMessage>? second = null;
        try
        {
            var delayed = await captured.Task.WaitAsync(cancellation.Token);
            second = f.Get(cancellation: cancellation.Token);
            using var secondResponse = await second.WaitAsync(cancellation.Token);
            Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
            Assert.False(first.IsCompleted);
            var latest = f.Real.Observed.Delivered[^1].Session!;
            Assert.True(latest.Identity.AuthorityVersion > delayed.Identity.AuthorityVersion);
            release.TrySetResult();
            using var firstResponse = await first.WaitAsync(cancellation.Token);
            Assert.Equal(HttpStatusCode.OK, firstResponse.StatusCode);
            using var firstJson = await Json(firstResponse); using var secondJson = await Json(secondResponse);
            Assert.Equal(firstJson.RootElement.GetProperty("scopeKey").GetString(), secondJson.RootElement.GetProperty("scopeKey").GetString());
            Assert.Equal(2, f.Writer.Reads); Assert.Empty(f.Writer.Executed); Assert.Empty(f.Writer.Reconciled);
            Assert.Equal(10, f.Real.Observed.Delivered.Length);
            Assert.Same(delayed, f.Real.Observed.Delivered[6].Session);
        }
        finally
        {
            cancellation.Cancel(); release.TrySetResult();
            foreach (var pending in new[] { first, second }.OfType<Task<HttpResponseMessage>>())
                try { (await pending.WaitAsync(TimeSpan.FromSeconds(5))).Dispose(); }
                catch (OperationCanceledException) { }
        }
    }

    [Fact]
    public async Task Overlapping_real_requests_keep_their_own_frozen_rights_baselines()
    {
        await using var f = await Fixture.Start(realAuthority: true);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var reads = 0;
        f.Writer.AfterRead = async () =>
        {
            if (Interlocked.Increment(ref reads) != 1) return;
            entered.TrySetResult();
            await release.Task.WaitAsync(cancellation.Token);
        };
        var first = f.Get(cancellation: cancellation.Token);
        Task<HttpResponseMessage>? second = null;
        try
        {
            await entered.Task.WaitAsync(cancellation.Token);
            f.Real!.Users.Capabilities = ["inbound-requests.read", "synthetic-new-grant"];
            second = f.Get(cancellation: cancellation.Token);
            using var secondResponse = await second.WaitAsync(cancellation.Token);
            Assert.Equal(HttpStatusCode.OK, secondResponse.StatusCode);
            using var secondJson = await Json(secondResponse);
            Assert.Equal("Observed", secondJson.RootElement.GetProperty("data").GetProperty("outcome").GetString());
            Assert.False(first.IsCompleted);
            release.TrySetResult();
            using var firstResponse = await first.WaitAsync(cancellation.Token);
            await AssertSuppressed(firstResponse, HttpStatusCode.Forbidden);
            Assert.Equal(2, f.Writer.Reads); Assert.Empty(f.Writer.Executed); Assert.Empty(f.Writer.Reconciled);
        }
        finally
        {
            cancellation.Cancel(); release.TrySetResult();
            foreach (var pending in new[] { first, second }.OfType<Task<HttpResponseMessage>>())
                try { (await pending.WaitAsync(TimeSpan.FromSeconds(5))).Dispose(); }
                catch (OperationCanceledException) { }
        }
    }

    [Theory]
    [InlineData("read", false)]
    [InlineData("save", false)]
    [InlineData("send-to-warehouse", false)]
    [InlineData("reconcile", false)]
    [InlineData("read", true)]
    [InlineData("save", true)]
    [InlineData("send-to-warehouse", true)]
    [InlineData("reconcile", true)]
    public async Task Cancelled_requests_cannot_dispatch_later_or_expose_a_completed_service_result(string route, bool afterDispatch)
    {
        await using var f = await Fixture.Start(realAuthority: true); var scope = await f.Scope();
        f.BufferRequestBody = true; f.Writer.Receipt = Receipt(InboundDraftAction.Save); f.Real!.Observed.Clear();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var cancelled = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var checkpoint = afterDispatch ? route == "read" ? 4 : 7 : 2;
        f.Real.Observed.AfterResolve = async (call, _, token) =>
        {
            if (call != checkpoint) return;
            entered.TrySetResult();
            try { await Task.Delay(Timeout.InfiniteTimeSpan, token); }
            finally { cancelled.TrySetResult(); }
        };
        var reads = f.Writer.Reads;
        using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        var pending = f.Invoke(route, scope, cancellation.Token);
        try
        {
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            cancellation.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => { using var ignored = await pending; });
            await cancelled.Task.WaitAsync(TimeSpan.FromSeconds(5));
            Assert.Equal(reads + (afterDispatch && route == "read" ? 1 : 0), f.Writer.Reads);
            Assert.Equal(afterDispatch && (route is "save" or "send-to-warehouse") ? 1 : 0, f.Writer.Executed.Count);
            Assert.Equal(afterDispatch && route == "reconcile" ? 1 : 0, f.Writer.Reconciled.Count);
        }
        finally { cancellation.Cancel(); }
    }

    private static InboundDraftReceipt Receipt(InboundDraftAction action) => new(Operation, "DOC-A",
        action == InboundDraftAction.Save ? 0 : 2, new string('C', 64),
        Guid.Parse("22222222-2222-4222-8222-222222222222"), new DateTime(2026, 10, 6, 0, 0, 0, DateTimeKind.Utc));

    private static async Task AssertSuppressed(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        using var json = await Json(response);
        Assert.False(json.RootElement.TryGetProperty("data", out _));
        Assert.False(json.RootElement.TryGetProperty("document", out _));
        Assert.False(json.RootElement.TryGetProperty("receipt", out _));
        Assert.False(json.RootElement.TryGetProperty("scopeKey", out _));
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
    }

    [Theory]
    [InlineData("duplicate")]
    [InlineData("escaped-duplicate")]
    [InlineData("nested-duplicate")]
    [InlineData("extra")]
    [InlineData("nested-extra")]
    [InlineData("wrong-case")]
    [InlineData("numeric-action")]
    [InlineData("string-number-action")]
    [InlineData("numeric-decimal")]
    [InlineData("rounded-decimal")]
    [InlineData("timezone")]
    [InlineData("date-only")]
    [InlineData("sql-rounding")]
    [InlineData("surrogate")]
    [InlineData("broken-json")]
    [InlineData("utf8")]
    [InlineData("cost")]
    public async Task Strict_wire_rejects_ambiguous_coerced_or_unsupported_input(string mutation)
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope(); var body = Body();
        body = mutation switch
        {
            "duplicate" => body.Replace("\"action\":\"Save\"", "\"action\":\"Save\",\"action\":\"Save\""),
            "escaped-duplicate" => body.Replace("\"action\":\"Save\"", "\"action\":\"Save\",\"\\u0061ction\":\"Save\""),
            "nested-duplicate" => body.Replace("\"invoiceNo\":\"\"", "\"invoiceNo\":\"\",\"invoiceNo\":null"),
            "extra" => body.Insert(1, "\"statusId\":0,"),
            "nested-extra" => body.Replace("\"header\":{", "\"header\":{\"amount\":\"1\","),
            "wrong-case" => body.Replace("\"action\"", "\"Action\""),
            "numeric-action" => body.Replace("\"Save\"", "1"),
            "string-number-action" => body.Replace("\"Save\"", "\"1\""),
            "numeric-decimal" => body.Replace("\"1.0000000000\"", "1.0000000000"),
            "rounded-decimal" => body.Replace("\"1.0000000000\"", "\"1.00000000001\""),
            "timezone" => body.Replace("14:22:11.003", "14:22:11.003Z"),
            "date-only" => body.Replace("2026-10-01T14:22:11.003", "2026-10-01"),
            "sql-rounding" => body.Replace("14:22:11.003", "14:22:11.001"),
            "surrogate" => body.Replace("FULL ERP A", "\\ud800"),
            "broken-json" => body + "{",
            "cost" => body.Replace("\"costChanges\":[]", "\"costChanges\":[{}]"),
            _ => body
        };
        var bytes = mutation == "utf8" ? new byte[] { 0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d } : Encoding.UTF8.GetBytes(body);
        using var result = await f.Post(bytes, scope: scope);
        Assert.Equal(HttpStatusCode.BadRequest, result.StatusCode); Assert.Empty(f.Writer.Executed); Assert.Empty(f.Writer.Reconciled);
    }
    [Theory]
    [InlineData("save", "SendToWarehouse")]
    [InlineData("send-to-warehouse", "Save")]
    [InlineData("save", "Create")]
    [InlineData("reconcile", "Create")]
    public async Task Route_action_is_exact_and_Create_is_closed(string route, string action)
    {
        await using var f = await Fixture.Start();
        using var result = await f.Post(Body().Replace("\"Save\"", "\"" + action + "\""), route);
        Assert.Equal(HttpStatusCode.BadRequest, result.StatusCode); Assert.Empty(f.Writer.Executed); Assert.Empty(f.Writer.Reconciled);
    }
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Body_is_bounded_for_content_length_and_chunked_streams(bool chunked)
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        var exact = Encoding.UTF8.GetBytes(Body().PadRight(InboundDraftEndpoints.MaximumBodyBytes));
        using (var accepted = await f.Post(exact, scope: scope, chunked: chunked)) Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        var over = exact.Concat(new byte[] { 32 }).ToArray();
        using var rejected = await f.Post(over, scope: scope, chunked: chunked);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, rejected.StatusCode); Assert.Single(f.Writer.Executed);
    }
    [Theory]
    [InlineData("text/plain", null)]
    [InlineData("application/json; charset=iso-8859-1", null)]
    [InlineData("application/json", "gzip")]
    public async Task Json_utf8_uncompressed_only(string media, string? encoding)
    {
        await using var f = await Fixture.Start();
        using var response = await f.Post(Encoding.UTF8.GetBytes(Body()), contentType: media, encoding: encoding);
        Assert.Equal(HttpStatusCode.UnsupportedMediaType, response.StatusCode); Assert.Empty(f.Writer.Executed);
    }
    [Theory]
    [InlineData(InboundDraftAction.Save, "save", 0)]
    [InlineData(InboundDraftAction.SendToWarehouse, "send-to-warehouse", 2)]
    public async Task Lost_ACK_reconciles_original_without_Execute_or_Read(InboundDraftAction action, string route, int status)
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope(); var body = Body(action);
        f.Writer.LoseAck = true;
        using (var lost = await f.Post(body, route, scope)) Assert.Equal(HttpStatusCode.ServiceUnavailable, lost.StatusCode);
        Assert.Single(f.Writer.Executed); var readCount = f.Writer.Reads;
        using var response = await f.Post(body, "reconcile", scope); using var json = await Json(response);
        Assert.Equal("Replayed", json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Equal(status, json.RootElement.GetProperty("data").GetProperty("receipt").GetProperty("statusId").GetInt32());
        Assert.Equal(scope, json.RootElement.GetProperty("scopeKey").GetString());
        Assert.Equal(JsonSerializer.Serialize(f.Writer.Executed.Single(), Wire), JsonSerializer.Serialize(f.Writer.Reconciled.Single(), Wire));
        Assert.Equal(readCount, f.Writer.Reads); Assert.Single(f.Writer.Executed);
        Assert.Contains("no-store", response.Headers.CacheControl!.ToString());
    }
    [Fact]
    public async Task Reconcile_uses_current_Update_even_when_admission_to_a_new_Send_is_closed()
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope(); var body = Body(InboundDraftAction.SendToWarehouse);
        f.Writer.LoseAck = true;
        using var lost = await f.Post(body, "send-to-warehouse", scope);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, lost.StatusCode);
        f.Access.Send = false;
        using var response = await f.Post(body, "reconcile", scope); using var json = await Json(response);
        Assert.Equal("Replayed", json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Single(f.Writer.Executed); Assert.Single(f.Writer.Reconciled);
    }
    [Theory]
    [InlineData(InboundDraftOutcome.Observed)]
    [InlineData(InboundDraftOutcome.InvalidInput)]
    [InlineData(InboundDraftOutcome.Denied)]
    [InlineData(InboundDraftOutcome.NotFound)]
    [InlineData(InboundDraftOutcome.Conflict)]
    [InlineData(InboundDraftOutcome.Rejected)]
    [InlineData(InboundDraftOutcome.UnsupportedCostEdits)]
    [InlineData(InboundDraftOutcome.NumberingUnavailable)]
    [InlineData(InboundDraftOutcome.Unavailable)]
    [InlineData(InboundDraftOutcome.OutcomeUnknown)]
    public async Task Reconcile_forwards_typed_no_receipt_outcomes_without_dispatch(InboundDraftOutcome outcome)
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope(); var reads = f.Writer.Reads;
        f.Writer.ReconcileOutcome = outcome;
        using var response = await f.Post(Body(), "reconcile", scope); using var json = await Json(response);
        Assert.Equal(outcome.ToString(), json.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("data").GetProperty("receipt").ValueKind);
        Assert.Empty(f.Writer.Executed); Assert.Single(f.Writer.Reconciled); Assert.Equal(reads, f.Writer.Reads);
    }
    [Fact]
    public async Task Save_preserves_nullable_header_SQL_times_and_supported_row_deltas_in_original_DTO()
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        var original = Command() with
        {
            Header = Header() with { Notes = null, InvoiceNo = "", ObjectId = null },
            DetailUpserts = [Detail() with { BarrelQuantityByDocument = -2m, LotNumberByDocument = null },
                Detail() with { RowId = null, ClientLineId = Guid.Parse("44444444-4444-4444-8444-444444444444"), UnitPrice = null }],
            RemovedDetailIds = ["ROW-2"]
        };
        var body = JsonSerializer.Serialize(original, Wire);
        using var response = await f.Post(body, scope: scope);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(body, JsonSerializer.Serialize(Assert.Single(f.Writer.Executed), Wire));
        using var reconcile = await f.Post(body, "reconcile", scope);
        Assert.Equal(HttpStatusCode.OK, reconcile.StatusCode);
        Assert.Equal(body, JsonSerializer.Serialize(Assert.Single(f.Writer.Reconciled), Wire));
        Assert.Single(f.Writer.Executed);
    }

    [Fact]
    public async Task Malformed_receipt_or_wrong_read_branch_cannot_be_exposed_as_success()
    {
        await using var f = await Fixture.Start(); var scope = await f.Scope();
        f.Writer.AfterExecute = () => {f.Writer.Receipt = f.Writer.Receipt! with { DocumentId = "DOC-B" }; return Task.CompletedTask;};
        using (var result = await f.Post(Body(), scope: scope)) Assert.Equal(HttpStatusCode.ServiceUnavailable, result.StatusCode);
        f.Writer.View = f.Writer.View with { Header = Header() with { BranchId = "BR-B" } };
        using var read = await f.Get(scope: scope); Assert.Equal(HttpStatusCode.ServiceUnavailable, read.StatusCode);
    }

    private sealed class FakeSessions : IWebSessions
    {
        private string token = new('A', 64);
        public bool Revoked;
        private int calls;
        public Func<int, ResolvedSession, ResolvedSession?>? Observe;
        public List<ResolvedSession?> Delivered { get; } = [];
        public void Clear() { calls = 0; Delivered.Clear(); }
        public AuthoritativeIdentity Identity = new("SYNTHETIC-USER", "T", "C", "Synthetic", "Synthetic", 1,
            ["inbound-requests.read"], "synthetic-credential-stamp", ["BR-A"]);
        public ResolvedSession Current => new(token, Identity, new SessionView(Identity.DisplayName, Identity.TenantId,
            Identity.CompanyId, Identity.CompanyName, Identity.AuthorityVersion, DateTimeOffset.UtcNow.AddHours(1),
            DateTimeOffset.UtcNow.AddDays(1), Identity.Capabilities));
        public void Rotate() { token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)); Revoked = false; }
        public ResolvedSession? Create(AuthoritativeIdentity identity) { Identity = identity; return Current; }
        public Task<ResolvedSession?> ResolveAsync(string supplied, bool userInteraction, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            var live = !Revoked && supplied == token ? Current : null;
            var call = ++calls;
            if (live is not null && Observe is not null) live = Observe(call, live);
            Delivered.Add(live);
            return Task.FromResult(live);
        }
        public void Revoke(string supplied) { if (supplied == token) Revoked = true; }
    }
    private sealed class FakeAccess : IInboundDraftCommandAccess
    {
        public Guid Binding = Guid.Parse("33333333-3333-4333-8333-333333333333");
        public string Branch = "BR-A";
        public string? Document;
        public bool Update = true, Send = true, Available = true;
        public Func<Task>? After;
        public async Task<InboundDraftAuthority?> ResolveAsync(ResolvedSession session, string documentId, CancellationToken ct)
        {
            var captured = new InboundDraftAuthority(Binding, Document ?? documentId, Branch, Update, Send, Available);
            if (After is not null) await After(); ct.ThrowIfCancellationRequested(); return captured;
        }
    }
    private sealed class FakeWriter : IInboundDraftCommandService
    {
        public int Reads;
        public readonly List<InboundDraftCommand> Executed = [], Reconciled = [];
        public InboundDraftView View = new("DOC-A", 0, Header(), [Detail()], 2, new string('A', 64));
        public InboundDraftReceipt? Receipt;
        public InboundDraftOutcome ReconcileOutcome = InboundDraftOutcome.Replayed;
        public bool LoseAck;
        public Func<Task>? AfterRead, AfterExecute, AfterReconcile;
        public async Task<InboundDraftReadResult> ReadAsync(string documentId, CancellationToken token = default)
        {
            Reads++; var captured = View with { DocumentId = documentId };
            if (AfterRead is not null) await AfterRead(); token.ThrowIfCancellationRequested();
            return new(InboundDraftOutcome.Observed, captured);
        }
        public async Task<InboundDraftResult> ExecuteAsync(InboundDraftCommand request, CancellationToken token = default)
        {
            Executed.Add(request);
            Receipt = new(request.OperationId, request.DocumentId!, request.Action == InboundDraftAction.Save ? 0 : 2,
                new string('C', 64), Guid.Parse("22222222-2222-4222-8222-222222222222"), new DateTime(2026, 10, 6, 0, 0, 0, DateTimeKind.Utc));
            if (AfterExecute is not null) await AfterExecute(); token.ThrowIfCancellationRequested();
            if (LoseAck) throw new IOException("synthetic lost ACK");
            return new(InboundDraftOutcome.Committed, Receipt);
        }
        public async Task<InboundDraftResult> ReconcileAsync(InboundDraftCommand originalRequest, CancellationToken token = default)
        {
            token.ThrowIfCancellationRequested(); Reconciled.Add(originalRequest);
            if (AfterReconcile is not null) await AfterReconcile(); token.ThrowIfCancellationRequested();
            return new(ReconcileOutcome,
                ReconcileOutcome is InboundDraftOutcome.Replayed or InboundDraftOutcome.Committed ? Receipt : null);
        }
    }
    private sealed class SyntheticLegacyUsers : ILegacyUserStore
    {
        public string StoredHash = "synthetic-stored-hash";
        public bool Disabled;
        public IReadOnlyList<string> Capabilities = ["inbound-requests.read"];
        public IReadOnlyList<string> Branches = ["BR-A", "BR-B"];
        public Task<LegacyUser?> FindAsync(string username, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult<LegacyUser?>(username == "SYNTHETIC-USER"
                ? new(username, "Synthetic user", StoredHash, Disabled, "synthetic-group", true, Capabilities, Branches)
                : null);
        }
    }
    private sealed class SyntheticPassword : ILegacyPasswordVerifier
    {
        public Task<PasswordOutcome> VerifyAsync(string username, string password, string storedHash, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(username == "SYNTHETIC-USER" && password == "synthetic-password" && storedHash == "synthetic-stored-hash"
                ? PasswordOutcome.Accepted : PasswordOutcome.Rejected);
        }
    }
    private sealed class SyntheticClock : TimeProvider
    {
        private DateTimeOffset now = new(2026, 10, 6, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(TimeSpan duration) => now += duration;
    }
    private sealed record SessionObservation(string Token, bool UserInteraction, ResolvedSession? Session);
    private sealed class ObservedSessions(IWebSessions inner) : IWebSessions
    {
        private readonly ConcurrentQueue<SessionObservation> delivered = new();
        private int calls;
        public int Inspections;
        public Func<int, ResolvedSession?, CancellationToken, Task>? AfterResolve;
        public SessionObservation[] Delivered => delivered.ToArray();
        public void Clear() { delivered.Clear(); Interlocked.Exchange(ref calls, 0); Inspections = 0; }
        public Task<ResolvedSession?> InspectAsync(string token, CancellationToken cancellationToken)
        { Interlocked.Increment(ref Inspections); return inner.InspectAsync(token, cancellationToken); }
        public ResolvedSession? Create(AuthoritativeIdentity identity) => inner.Create(identity);
        public void Revoke(string token) => inner.Revoke(token);
        public async Task<ResolvedSession?> ResolveAsync(string token, bool userInteraction, CancellationToken cancellationToken)
        {
            var call = Interlocked.Increment(ref calls);
            var live = await inner.ResolveAsync(token, userInteraction, cancellationToken);
            if (AfterResolve is not null) await AfterResolve(call, live, cancellationToken);
            delivered.Enqueue(new(token, userInteraction, live));
            return live; // Preserve the real authority's exact snapshot and version.
        }
    }
    private sealed record RealAuthorityFixture(SyntheticLegacyUsers Users, LegacyIdentityAuthority Authority,
        LocalWebSessions Sessions, ObservedSessions Observed, ResolvedSession Created, SyntheticClock Clock)
    {
        public static async Task<RealAuthorityFixture> Create()
        {
            var users = new SyntheticLegacyUsers(); var clock = new SyntheticClock();
            var authority = new LegacyIdentityAuthority(users, new SyntheticPassword(), new("T", "C", "Synthetic company"));
            var result = await authority.AuthenticateAsync("SYNTHETIC-USER", "synthetic-password", default);
            Assert.Equal(IdentityOutcome.Success, result.Outcome);
            var identity = Assert.IsType<AuthoritativeIdentity>(result.Identity);
            var sessions = new LocalWebSessions(authority, clock,
                new WebSessionPolicy(TimeSpan.FromMinutes(10), TimeSpan.FromMinutes(30), 10));
            var created = Assert.IsType<ResolvedSession>(sessions.Create(identity));
            return new(users, authority, sessions, new ObservedSessions(sessions), created, clock);
        }
    }
    private sealed class Chunked(byte[] bytes) : HttpContent
    {
        protected override bool TryComputeLength(out long length) { length = 0; return false; }
        protected override async Task SerializeToStreamAsync(Stream stream, TransportContext? context)
        { for (var offset = 0; offset < bytes.Length; offset += 4096) await stream.WriteAsync(bytes.AsMemory(offset, Math.Min(4096, bytes.Length - offset))); }
    }
    private sealed class Fixture : IAsyncDisposable
    {
        public WebApplication App { get; private set; } = null!;
        public HttpClient Client { get; private set; } = null!;
        public CookieContainer Cookies { get; } = new();
        public FakeSessions Sessions { get; } = new();
        public FakeAccess Access { get; } = new();
        public FakeWriter Writer { get; } = new();
        public RealAuthorityFixture? Real { get; private set; }
        public bool BufferRequestBody;
        private IWebSessions WebSessions => Real?.Observed ?? (IWebSessions)Sessions;
        public string Origin { get; private set; } = "";
        public string HttpOrigin { get; private set; } = "";
        public string? PrivateConfigPath { get; private set; }
        private string? privateDirectory, publicDirectory;
        private string csrfPath = "/qa/csrf";
        private X509Certificate2 certificate = null!;
        public static async Task<Fixture> Start(bool defaults = false, bool login = true, bool composed = false,
            bool realAuthority = false, bool enabled = false, string? partialProvider = null)
        {
            var f = new Fixture();
            try
            {
                if (realAuthority) f.Real = await RealAuthorityFixture.Create();
                using var rsa = RSA.Create(2048);
                var request = new CertificateRequest("CN=localhost", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                var san = new SubjectAlternativeNameBuilder(); san.AddIpAddress(IPAddress.Loopback); request.CertificateExtensions.Add(san.Build());
                using var generated = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddHours(2));
                // Match the existing synthetic HTTPS fixtures: Windows Schannel
                // needs an imported private key. Keep exact-certificate client pinning.
                var pkcs12 = generated.Export(X509ContentType.Pfx);
                try { f.certificate = X509CertificateLoader.LoadPkcs12(pkcs12, null); }
                finally { CryptographicOperations.ZeroMemory(pkcs12); }
                if (composed)
                {
                    f.privateDirectory = Directory.CreateTempSubdirectory("medcom-i24-host-").FullName;
                    // Keep public application content on the app/repository side and
                    // synthetic private JSON in a separate temp root. Some executors
                    // expose a .git marker in the temp root; sibling directories there
                    // are correctly rejected by the production repository-boundary guard.
                    // This layout needs no guard exception and probes no machine config.
                    f.publicDirectory = Directory.CreateDirectory(Path.Combine(AppContext.BaseDirectory,
                        "synthetic-public-" + Guid.NewGuid().ToString("N"))).FullName;
                    var contentRoot = f.publicDirectory;
                    f.PrivateConfigPath = Path.Combine(f.privateDirectory, "synthetic-private.json");
                    await File.WriteAllTextAsync(f.PrivateConfigPath, "{\"Legacy\":{\"Enabled\":false}}");
                    // The explicit external path is supplied before Build reads configuration,
                    // not in its later callback. Never probe the machine's private settings.
                    f.App = ApiHost.Build(["--environment", "Production", "--contentRoot", contentRoot,
                        "--Medcom:PrivateConfigPath", f.PrivateConfigPath, "--Legacy:Enabled", "false"], builder =>
                    {
                        builder.Logging.ClearProviders();
                        builder.WebHost.ConfigureKestrel(options => options.Listen(IPAddress.Loopback, 0,
                            listen => listen.UseHttps(f.certificate)));
                        builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
                        builder.Services.AddSingleton<IWebSessions>(f.WebSessions);
                        if (f.Real is not null) builder.Services.AddSingleton<IIdentityAuthority>(f.Real.Authority);
                        if (enabled)
                        {
                            builder.Services.AddSingleton<IInboundDraftCommandAccess>(f.Access);
                            builder.Services.AddSingleton<IInboundDraftCommandService>(f.Writer);
                        }
                        else if (partialProvider == "access") builder.Services.AddSingleton<IInboundDraftCommandAccess>(f.Access);
                        else if (partialProvider == "service") builder.Services.AddSingleton<IInboundDraftCommandService>(f.Writer);
                    });
                    f.csrfPath = "/api/auth/csrf";
                }
                else
                {
                    var builder = WebApplication.CreateEmptyBuilder(new WebApplicationOptions { ApplicationName = typeof(InboundDraftEndpointTests).Assembly.FullName,
                        EnvironmentName = "SyntheticInboundTest", ContentRootPath = Path.GetTempPath() });
                    builder.Logging.ClearProviders(); builder.Services.AddLogging(); builder.Services.AddRouting();
                    builder.WebHost.UseKestrel(options => {options.Listen(IPAddress.Loopback, 0, listen => listen.UseHttps(f.certificate)); options.Listen(IPAddress.Loopback, 0);});
                    builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
                    builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
                    {
                        options.Cookie.Name = "__Host-I21.Test.Session"; options.Cookie.SecurePolicy = Microsoft.AspNetCore.Http.CookieSecurePolicy.Always;
                        options.Cookie.Path = "/"; options.Cookie.HttpOnly = true; options.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Strict;
                        options.Events.OnRedirectToLogin = c => {c.Response.StatusCode = 401; return Task.CompletedTask;};
                        options.Events.OnRedirectToAccessDenied = c => {c.Response.StatusCode = 403; return Task.CompletedTask;};
                    });
                    builder.Services.AddAuthorization();
                    builder.Services.AddAntiforgery(options => {options.HeaderName = "X-CSRF-TOKEN"; options.Cookie.Name = "__Host-I21.Test.Csrf";
                        options.Cookie.SecurePolicy = Microsoft.AspNetCore.Http.CookieSecurePolicy.Always; options.Cookie.Path = "/"; options.Cookie.SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Strict;});
                    builder.Services.AddSingleton<IWebSessions>(f.WebSessions);
                    if (!defaults) {builder.Services.AddSingleton<IInboundDraftCommandAccess>(f.Access); builder.Services.AddSingleton<IInboundDraftCommandService>(f.Writer);}
                    builder.Services.AddInboundDraftFacade();
                    f.App = builder.Build();
                    f.App.Use(async (context, next) =>
                    {
                        context.Response.Headers.CacheControl = "no-store";
                        if (!f.BufferRequestBody || context.Request.Method != "POST") { await next(context); return; }
                        // Deterministic facade body checkpoints without relying on
                        // network packet boundaries or changing production streams.
                        var original = context.Request.Body;
                        using var buffered = new MemoryStream();
                        await original.CopyToAsync(buffered, context.RequestAborted); buffered.Position = 0;
                        context.Request.Body = buffered;
                        try { await next(context); }
                        finally { context.Request.Body = original; }
                    });
                    f.App.UseAuthentication(); f.App.UseAuthorization();
                    f.App.MapGet("/qa/csrf", (Microsoft.AspNetCore.Http.HttpContext c, IAntiforgery csrf) =>
                        Microsoft.AspNetCore.Http.Results.Ok(new {token = csrf.GetAndStoreTokens(c).RequestToken})).RequireAuthorization();
                    f.App.MapInboundDraftFacade();
                }
                f.App.MapGet("/qa/login", async (Microsoft.AspNetCore.Http.HttpContext c) =>
                {await c.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, AuthEndpoints.Principal(f.Real?.Created ?? f.Sessions.Current)); return Microsoft.AspNetCore.Http.Results.Ok();}).AllowAnonymous();
                await f.App.StartAsync();
                var addresses = f.App.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses;
                f.Origin = addresses.Single(a => a.StartsWith("https://", StringComparison.Ordinal));
                f.HttpOrigin = composed ? "" : addresses.Single(a => a.StartsWith("http://", StringComparison.Ordinal));
                var handler = new HttpClientHandler {CookieContainer = f.Cookies, AllowAutoRedirect = false,
                    ServerCertificateCustomValidationCallback = (_, cert, _, _) => cert is not null && cert.RawData.AsSpan().SequenceEqual(f.certificate.RawData)};
                f.Client = new HttpClient(handler) {BaseAddress = new Uri(f.Origin), Timeout = TimeSpan.FromSeconds(20)};
                if (login) await f.Login(); return f;
            }
            catch
            {
                await f.DisposeAsync();
                throw;
            }
        }
        public async Task Login(bool rotate = false)
        {
            if (rotate) Sessions.Rotate();
            using var result = await Client.GetAsync("/qa/login"); result.EnsureSuccessStatusCode();
        }
        public async Task<HttpResponseMessage> Get(string document = "DOC-A", string? scope = null, CancellationToken cancellation = default)
        {
            using var message = new HttpRequestMessage(HttpMethod.Get, InboundDraftEndpoints.Root + "?documentId=" + Uri.EscapeDataString(document));
            message.Headers.Add("Origin", Origin); message.Headers.Add("Sec-Fetch-Site", "same-origin");
            if (scope is not null) message.Headers.Add(InboundDraftEndpoints.ScopeHeader, scope);
            return await Client.SendAsync(message, cancellation);
        }
        public Task<HttpResponseMessage> Invoke(string route, string? scope, CancellationToken cancellation = default) => route == "read"
            ? Get(scope: scope, cancellation: cancellation)
            : Post(Encoding.UTF8.GetBytes(Body(route == "send-to-warehouse" ? InboundDraftAction.SendToWarehouse : InboundDraftAction.Save)),
                route, scope, cancellation: cancellation);
        public async Task<string> Scope()
        {
            using var result = await Get(); result.EnsureSuccessStatusCode(); using var json = await Json(result);
            return json.RootElement.GetProperty("scopeKey").GetString()!;
        }
        public Task<HttpResponseMessage> Post(string body, string route = "save", string? scope = null, bool csrf = true,
            string origin = "same", bool omitScope = false, bool duplicateScope = false) =>
            Post(Encoding.UTF8.GetBytes(body), route, scope, csrf, origin, omitScope, duplicateScope);
        public async Task<HttpResponseMessage> Post(byte[] bytes, string route = "save", string? scope = null, bool csrf = true,
            string origin = "same", bool omitScope = false, bool duplicateScope = false, bool chunked = false,
            string contentType = "application/json; charset=utf-8", string? encoding = null, CancellationToken cancellation = default)
        {
            scope ??= await Scope();
            using var message = new HttpRequestMessage(HttpMethod.Post, InboundDraftEndpoints.Root + "/" + route)
                {Content = chunked ? new Chunked(bytes) : new ByteArrayContent(bytes), Version = HttpVersion.Version11};
            message.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
            if (encoding is not null) message.Content.Headers.ContentEncoding.Add(encoding);
            if (origin != "missing") message.Headers.Add("Origin", origin == "same" ? Origin : "https://other.invalid");
            message.Headers.Add("Sec-Fetch-Site", "same-origin");
            if (!omitScope) message.Headers.Add(InboundDraftEndpoints.ScopeHeader, duplicateScope ? new[] {scope, scope} : new[] {scope});
            if (csrf)
            {
                using var response = await Client.GetAsync(csrfPath, cancellation); response.EnsureSuccessStatusCode(); using var json = await Json(response);
                message.Headers.Add("X-CSRF-TOKEN", json.RootElement.GetProperty("token").GetString());
            }
            return await Client.SendAsync(message, cancellation);
        }
        public async ValueTask DisposeAsync()
        {
            try
            {
                Client?.Dispose();
                if (App is not null)
                {
                    try { await App.StopAsync(); }
                    finally { await App.DisposeAsync(); }
                }
            }
            finally
            {
                certificate?.Dispose();
                if (privateDirectory is not null) Directory.Delete(privateDirectory, recursive: true);
                if (publicDirectory is not null) Directory.Delete(publicDirectory, recursive: true);
            }
        }
    }
}
