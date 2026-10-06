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
// and synthetic I15/session/authority providers only. The optional ApiHost
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
        f.Writer.AfterExecute = () => {f.Sessions.Identity = f.Sessions.Identity with { AuthorityVersion = 2 }; return Task.CompletedTask;};
        using var changed = await f.Post(Body(), scope: scope);
        Assert.Equal(HttpStatusCode.Forbidden, changed.StatusCode);
        Assert.Single(f.Writer.Executed); Assert.NotNull(f.Writer.Receipt); // may have committed: not proof of rollback
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
        public AuthoritativeIdentity Identity = new("SYNTHETIC-USER", "T", "C", "Synthetic", "Synthetic", 1,
            ["inbound-requests.read"], "synthetic-credential-stamp", ["BR-A"]);
        public ResolvedSession Current => new(token, Identity, new SessionView(Identity.DisplayName, Identity.TenantId,
            Identity.CompanyId, Identity.CompanyName, Identity.AuthorityVersion, DateTimeOffset.UtcNow.AddHours(1),
            DateTimeOffset.UtcNow.AddDays(1), Identity.Capabilities));
        public void Rotate() { token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)); Revoked = false; }
        public ResolvedSession? Create(AuthoritativeIdentity identity) { Identity = identity; return Current; }
        public Task<ResolvedSession?> ResolveAsync(string supplied, bool userInteraction, CancellationToken ct)
        { ct.ThrowIfCancellationRequested(); return Task.FromResult(!Revoked && supplied == token ? Current : null); }
        public void Revoke(string supplied) { if (supplied == token) Revoked = true; }
    }
    private sealed class FakeAccess : IInboundDraftCommandAccess
    {
        public Guid Binding = Guid.Parse("33333333-3333-4333-8333-333333333333");
        public string Branch = "BR-A";
        public bool Update = true, Send = true;
        public Func<Task>? After;
        public async Task<InboundDraftAuthority?> ResolveAsync(ResolvedSession session, string documentId, CancellationToken ct)
        {
            var captured = new InboundDraftAuthority(Binding, documentId, Branch, Update, Send, true);
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
        public Func<Task>? AfterRead, AfterExecute;
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
        public Task<InboundDraftResult> ReconcileAsync(InboundDraftCommand originalRequest, CancellationToken token = default)
        {
            token.ThrowIfCancellationRequested(); Reconciled.Add(originalRequest);
            return Task.FromResult(new InboundDraftResult(ReconcileOutcome,
                ReconcileOutcome is InboundDraftOutcome.Replayed or InboundDraftOutcome.Committed ? Receipt : null));
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
        public string Origin { get; private set; } = "";
        public string HttpOrigin { get; private set; } = "";
        public string? PrivateConfigPath { get; private set; }
        private string? privateDirectory;
        private string csrfPath = "/qa/csrf";
        private X509Certificate2 certificate = null!;
        public static async Task<Fixture> Start(bool defaults = false, bool login = true, bool composed = false)
        {
            var f = new Fixture();
            try
            {
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
                    var contentRoot = Directory.CreateDirectory(Path.Combine(f.privateDirectory, "public")).FullName;
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
                        builder.Services.AddSingleton<IWebSessions>(f.Sessions);
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
                    builder.Services.AddSingleton<IWebSessions>(f.Sessions);
                    if (!defaults) {builder.Services.AddSingleton<IInboundDraftCommandAccess>(f.Access); builder.Services.AddSingleton<IInboundDraftCommandService>(f.Writer);}
                    builder.Services.AddInboundDraftFacade();
                    f.App = builder.Build();
                    f.App.Use(async (context, next) => {context.Response.Headers.CacheControl = "no-store"; await next(context);});
                    f.App.UseAuthentication(); f.App.UseAuthorization();
                    f.App.MapGet("/qa/csrf", (Microsoft.AspNetCore.Http.HttpContext c, IAntiforgery csrf) =>
                        Microsoft.AspNetCore.Http.Results.Ok(new {token = csrf.GetAndStoreTokens(c).RequestToken})).RequireAuthorization();
                    f.App.MapInboundDraftFacade();
                }
                f.App.MapGet("/qa/login", async (Microsoft.AspNetCore.Http.HttpContext c) =>
                {await c.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, AuthEndpoints.Principal(f.Sessions.Current)); return Microsoft.AspNetCore.Http.Results.Ok();}).AllowAnonymous();
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
        public async Task<HttpResponseMessage> Get(string document = "DOC-A", string? scope = null)
        {
            using var message = new HttpRequestMessage(HttpMethod.Get, InboundDraftEndpoints.Root + "?documentId=" + Uri.EscapeDataString(document));
            message.Headers.Add("Origin", Origin); message.Headers.Add("Sec-Fetch-Site", "same-origin");
            if (scope is not null) message.Headers.Add(InboundDraftEndpoints.ScopeHeader, scope);
            return await Client.SendAsync(message);
        }
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
            string contentType = "application/json; charset=utf-8", string? encoding = null)
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
                using var response = await Client.GetAsync(csrfPath); response.EnsureSuccessStatusCode(); using var json = await Json(response);
                message.Headers.Add("X-CSRF-TOKEN", json.RootElement.GetProperty("token").GetString());
            }
            return await Client.SendAsync(message);
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
            }
        }
    }
}
