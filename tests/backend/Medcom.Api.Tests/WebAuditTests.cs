using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Medcom.Application.Audit;
using Medcom.Contracts;
using Medcom.Infrastructure.Audit;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class WebAuditTests
{
    [Theory]
    [InlineData("POST", "/api/auth/login", "auth", "login")]
    [InlineData("POST", "/api/auth/logout", "auth", "logout")]
    [InlineData("GET", "/api/erp/sales-orders", "read", "list")]
    [InlineData("GET", "/api/erp/sales-orders/detail", "read", "detail")]
    [InlineData("POST", "/api/erp/sales-orders/save", "command", "save")]
    [InlineData("POST", "/api/erp/purchase-requests/create", "command", "create")]
    [InlineData("POST", "/api/erp/purchase-requests/delete", "command", "delete")]
    [InlineData("POST", "/api/erp/inbound-sa/actions/send-pm", "command", "send-pm")]
    [InlineData("POST", "/api/erp/inbound-requests/sections/costs/save", "command", "save-costs")]
    [InlineData("POST", "/api/erp/warehouse-qr/qr/add", "command", "scan-add")]
    [InlineData("POST", "/api/erp/sales-orders/paste/validate", "import", "paste-validate")]
    [InlineData("POST", "/api/erp/sales-orders/selection", "import", "selection")]
    [InlineData("POST", "/api/erp/sales-orders/attachments/upload", "file", "upload")]
    [InlineData("GET", "/api/erp/sales-orders/attachments/content", "file", "download")]
    [InlineData("POST", "/api/notifications/12/read", "command", "notification-read")]
    [InlineData("GET", "/api/audit/logs", "audit", "view-log")]
    [InlineData("POST", "/api/purchase-requests/submit", "command", "submit")]
    [InlineData("GET", "/api/v2/documents/purchase-orders/detail", "read", "detail")]
    public void Meaningful_requests_are_classified(string method, string path, string category, string action)
    {
        var kind = WebAuditMiddleware.Classify(method, path);
        Assert.NotNull(kind);
        Assert.Equal(category, kind.Category);
        Assert.Equal(action, kind.Action);
    }

    [Theory]
    [InlineData("GET", "/api/auth/csrf")]
    [InlineData("GET", "/api/auth/session")]
    [InlineData("POST", "/api/auth/session/continue")]
    [InlineData("GET", "/api/workspace")]
    [InlineData("GET", "/api/notifications")]
    [InlineData("GET", "/api/erp/permissions")]
    [InlineData("GET", "/api/erp/sales-orders/screen")]
    [InlineData("GET", "/api/erp/sales-orders/status-counts")]
    [InlineData("GET", "/api/erp/sales-orders/actions")]
    [InlineData("POST", "/api/erp/sales-orders/options")]
    [InlineData("POST", "/api/erp/sales-orders/commands/lookup")]
    [InlineData("POST", "/api/erp/inbound-sa/actions/send-pm/options")]
    [InlineData("POST", "/api/audit/events")]
    [InlineData("GET", "/health/live")]
    [InlineData("GET", "/api/erp/unknown-module")]
    public void Polling_lookups_and_metadata_are_not_recorded(string method, string path) =>
        Assert.Null(WebAuditMiddleware.Classify(method, path));

    [Fact]
    public void Secret_fields_are_masked_and_large_payloads_stay_valid_json()
    {
        var input = JsonSerializer.SerializeToElement(new
        {
            username = "qa", password = "p1", nested = new { newPassword = "p2", stateToken = "keep-me", lines = new[] { new { pwd = "p3", quantity = "2" } } }
        });
        var text = WebAuditPayload.Json(input)!;
        Assert.DoesNotContain("p1", text, StringComparison.Ordinal);
        Assert.DoesNotContain("p2", text, StringComparison.Ordinal);
        Assert.DoesNotContain("p3", text, StringComparison.Ordinal);
        Assert.Contains("keep-me", text, StringComparison.Ordinal);
        Assert.Contains("\"quantity\":\"2\"", text, StringComparison.Ordinal);
        var large = WebAuditPayload.Json(JsonSerializer.SerializeToElement(new { notes = new string('x', 10_000) }), 1000)!;
        using var parsed = JsonDocument.Parse(large);
        Assert.True(parsed.RootElement.GetProperty("truncated").GetBoolean());
        Assert.True(large.Length <= 1000);
    }

    [Fact]
    public void Identical_reads_within_the_window_are_recorded_once()
    {
        var key = "session|" + Guid.NewGuid().ToString("N");
        Assert.False(WebAuditMiddleware.Repeated(key));
        Assert.True(WebAuditMiddleware.Repeated(key));
        Assert.False(WebAuditMiddleware.Repeated(key + "-other"));
    }

    [Fact]
    public void Viewer_policy_matches_configured_users_and_groups_only()
    {
        var policy = new WebAuditViewerPolicy(["Admin"], ["KT", "Quản trị"]);
        Assert.True(policy.Allows("admin", null, null));
        Assert.True(policy.Allows("someone", "KT", null));
        Assert.True(policy.Allows("someone", "X", "quản trị"));
        Assert.False(policy.Allows("someone", "X", "Kho"));
        Assert.False(WebAuditViewerPolicy.None.Allows("admin", "KT", "Quản trị"));
    }

    [Fact]
    public void Relay_headers_are_trusted_only_with_a_fresh_valid_signature()
    {
        var key = Encoding.UTF8.GetBytes(new string('k', 40));
        var clock = new PurchaseClock();
        var relay = new WebAuditRelay(key, clock);
        var now = clock.GetUtcNow().ToUnixTimeSeconds();
        HttpContext Request(long seconds, string address, string signedAddress)
        {
            var context = new DefaultHttpContext();
            context.Request.Method = "POST";
            context.Request.Path = "/api/erp/sales-orders/save";
            context.Request.Headers[WebAuditRelay.AddressHeader] = address;
            context.Request.Headers[WebAuditRelay.AgentHeader] = Uri.EscapeDataString("Mozilla/5.0 (Test)");
            context.Request.Headers[WebAuditRelay.TimeHeader] = seconds.ToString(System.Globalization.CultureInfo.InvariantCulture);
            context.Request.Headers[WebAuditRelay.SignatureHeader] = Convert.ToHexString(WebAuditRelay.Sign(key, seconds, signedAddress,
                Uri.EscapeDataString("Mozilla/5.0 (Test)"), "POST", "/api/erp/sales-orders/save"));
            return context;
        }
        var valid = relay.Read(Request(now, "203.0.113.7", "203.0.113.7"));
        Assert.Equal("203.0.113.7", valid?.Address);
        Assert.Equal("Mozilla/5.0 (Test)", valid?.Agent);
        Assert.Null(relay.Read(Request(now, "198.51.100.1", "203.0.113.7")));
        Assert.Null(relay.Read(Request(now - 3600, "203.0.113.7", "203.0.113.7")));
    }

    [Fact]
    public void Published_schema_file_matches_the_embedded_install_script()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "schemas", "backend", "web-audit-log-v1.sql")))
            directory = directory.Parent;
        Assert.NotNull(directory);
        var file = File.ReadAllText(Path.Combine(directory.FullName, "schemas", "backend", "web-audit-log-v1.sql"));
        Assert.Equal(file.ReplaceLineEndings("\n"), SqlWebAuditStore.InstallSql.ReplaceLineEndings("\n"));
        foreach (var column in SqlWebAuditStore.ColumnNames) Assert.Contains(" " + column + " ", file, StringComparison.Ordinal);
        Assert.DoesNotContain("DROP TABLE dbo.", file, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Sign_in_attempts_are_recorded_with_the_account_name_and_never_the_password()
    {
        var sink = new RecordingAuditSink();
        await using var fixture = await PurchaseHttpFixture.Start(services => services.AddSingleton<IWebAuditSink>(sink));
        using (var rejected = await fixture.Post("/api/auth/login", new { username = "qa-user", password = "wrong-synthetic" }))
            Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        await fixture.Login();
        var entries = sink.Wait(2);
        var failed = entries.Single(e => e.Outcome == "rejected");
        Assert.Equal(("auth", "login", "qa-user", "invalid_credentials"), (failed.Category, failed.Action, failed.UserName, failed.ErrorCode));
        Assert.Null(failed.SessionRef);
        var success = entries.Single(e => e.Outcome == "success");
        Assert.Equal(("qa-user", "Synthetic user"), (success.UserName, success.DisplayName));
        Assert.Matches("^[0-9a-f]{20}$", success.SessionRef);
        var stored = JsonSerializer.Serialize(entries);
        Assert.DoesNotContain("synthetic-password", stored, StringComparison.Ordinal);
        Assert.DoesNotContain("wrong-synthetic", stored, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Erp_commands_are_recorded_with_their_input_and_outcome()
    {
        var sink = new RecordingAuditSink();
        await using var fixture = await PurchaseHttpFixture.Start(services => services.AddSingleton<IWebAuditSink>(sink));
        await fixture.Login();
        var screen = await fixture.Json("/api/erp/purchase-requests/screen");
        var csrf = await fixture.Json("/api/auth/csrf");
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/erp/purchase-requests/create")
        { Content = new StringContent(JsonSerializer.Serialize(ErpScreenEndpointTests.Create()), Encoding.UTF8, "application/json") };
        request.Headers.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
        request.Headers.Add("Origin", fixture.Client.BaseAddress!.GetLeftPart(UriPartial.Authority));
        request.Headers.Add("X-Medcom-Read-Scope", screen.GetProperty("readScope").GetString());
        using var response = await fixture.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        var entry = sink.Wait(2).Single(e => e.Category == "command");
        Assert.Equal(("create", "purchase-requests", "B1", "unavailable", 503), (entry.Action, entry.Module, entry.BranchId, entry.Outcome, entry.StatusCode));
        Assert.Equal("erp_write_unqualified", entry.ErrorCode);
        Assert.Contains("SYNTHETIC-ITEM", entry.RequestData, StringComparison.Ordinal);
        Assert.Contains("QualificationRequired", entry.ResultData, StringComparison.Ordinal);
        Assert.Equal(response.Headers.GetValues("X-Correlation-ID").Single(), entry.CorrelationId);
        Assert.Equal("qa-user", entry.UserName);
    }

    [Fact]
    public async Task Browser_events_are_stamped_with_the_server_identity_and_validated()
    {
        var sink = new RecordingAuditSink();
        await using var fixture = await PurchaseHttpFixture.Start(services => services.AddSingleton<IWebAuditSink>(sink));
        using (var anonymous = await fixture.Post("/api/audit/events", Batch(DateTimeOffset.UtcNow, "click")))
            Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        await fixture.Login();
        var sent = DateTimeOffset.UtcNow.AddHours(-3); // a browser clock three hours slow
        using (var accepted = await fixture.Post("/api/audit/events", new
        {
            sentAt = sent,
            events = new object[]
            {
                new { id = Guid.NewGuid(), at = sent.AddSeconds(-5), type = "navigate", page = "sales-orders" },
                new { id = Guid.NewGuid(), at = sent, type = "click", page = "sales-orders", target = "Lưu", module = "sales-orders",
                      documentId = "DMB0926/0030", detail = new { password = "never" } },
                new { id = Guid.NewGuid(), at = sent, type = "Not A Type" }
            }
        }))
        {
            Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);
            var body = await accepted.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal((2, 1), (body.GetProperty("accepted").GetInt32(), body.GetProperty("rejected").GetInt32()));
        }
        using (var extra = await fixture.Post("/api/audit/events", new { sentAt = sent, events = new[] { new { id = Guid.NewGuid(), at = sent, type = "click", userName = "someone-else" } } }))
            Assert.Equal(HttpStatusCode.BadRequest, extra.StatusCode);
        var ui = sink.Wait(3).Where(e => e.Source == "client").ToArray();
        Assert.Equal(2, ui.Length);
        Assert.All(ui, e => Assert.Equal(("qa-user", "ui", "observed"), (e.UserName, e.Category, e.Outcome)));
        var click = ui.Single(e => e.Action == "click");
        Assert.Equal(("Lưu", "DMB0926/0030"), (click.Target, click.DocumentId));
        Assert.DoesNotContain("never", click.RequestData, StringComparison.Ordinal);
        Assert.InRange(click.OccurredAt, DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));
        Assert.True(ui.Single(e => e.Action == "navigate").OccurredAt < click.OccurredAt);
    }

    [Fact]
    public async Task Log_search_requires_the_audit_capability_and_is_itself_recorded()
    {
        var sink = new RecordingAuditSink();
        var queries = new StubAuditQueries();
        await using var fixture = await PurchaseHttpFixture.Start(services =>
        {
            services.AddSingleton<IWebAuditSink>(sink);
            services.AddSingleton<IWebAuditQueries>(queries);
        });
        await fixture.Login();
        using (var denied = await fixture.Client.GetAsync("/api/audit/logs"))
            Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
        fixture.Authority.Identity = fixture.Authority.Identity with { Capabilities = [.. fixture.Authority.Identity.Capabilities, WebAuditViewerPolicy.Capability] };
        var page = await fixture.Json("/api/audit/logs?user=qa&category=command&from=2026-11-01T00:00:00Z&page=2&pageSize=20");
        Assert.Equal(2, page.GetProperty("page").GetInt32());
        Assert.Equal(("qa", "command", 2, 20), (queries.Last!.UserName, queries.Last.Category, queries.Last.Page, queries.Last.PageSize));
        Assert.Equal(new DateTimeOffset(2026, 11, 1, 0, 0, 0, TimeSpan.Zero), queries.Last.From);
        using (var invalid = await fixture.Client.GetAsync("/api/audit/logs?pageSize=1000"))
            Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        using (var unknown = await fixture.Client.GetAsync("/api/audit/logs?table=SY_User"))
            Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        using (var missing = await fixture.Client.GetAsync("/api/audit/logs/detail?id=99"))
            Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        var views = sink.Wait(5).Where(e => e.Category == "audit").ToArray();
        Assert.Contains(views, e => e.Action == "view-log" && e.Outcome == "denied");
        Assert.Contains(views, e => e.Action == "view-log" && e.Outcome == "success" && e.QueryText!.Contains("category=command", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Sessions_ended_by_timeout_or_a_rejected_ERP_account_are_recorded_once()
    {
        var sink = new RecordingAuditSink();
        await using var fixture = await PurchaseHttpFixture.Start(services => services.AddSingleton<IWebAuditSink>(sink));
        await fixture.Login();
        fixture.Clock.Now = fixture.Clock.Now.AddMinutes(6); // idle timeout is 5 minutes in the fixture
        using (var expired = await fixture.Client.GetAsync("/api/auth/session")) Assert.Equal(HttpStatusCode.Unauthorized, expired.StatusCode);
        using (var again = await fixture.Client.GetAsync("/api/auth/session")) Assert.Equal(HttpStatusCode.Unauthorized, again.StatusCode);
        await fixture.Login();
        fixture.Authority.Rejected = true; // e.g. the ERP account was disabled or its password changed
        using (var rejected = await fixture.Client.GetAsync("/api/auth/session")) Assert.Equal(HttpStatusCode.Unauthorized, rejected.StatusCode);
        var entries = sink.Wait(4);
        var logins = entries.Where(e => e.Action == "login").ToArray();
        var ended = entries.Where(e => e.Action == "session-ended").ToArray();
        Assert.Equal(2, ended.Length);
        Assert.Equal(("auth", "idle-timeout", "qa-user", logins[0].SessionRef), (ended[0].Category, ended[0].Outcome, ended[0].UserName, ended[0].SessionRef));
        Assert.Equal(("authority-rejected", logins[1].SessionRef), (ended[1].Outcome, ended[1].SessionRef));
    }

    private static object Batch(DateTimeOffset sent, string type) =>
        new { sentAt = sent, events = new[] { new { id = Guid.NewGuid(), at = sent, type } } };

    private sealed class RecordingAuditSink : IWebAuditSink
    {
        private readonly ConcurrentQueue<WebAuditEntry> entries = new();
        public bool Enabled => true;
        public void Write(WebAuditEntry entry) => entries.Enqueue(entry);
        // The row is written after the response is produced; give the server a moment.
        public WebAuditEntry[] Wait(int count)
        {
            var until = DateTime.UtcNow.AddSeconds(5);
            while (entries.Count < count && DateTime.UtcNow < until) Thread.Sleep(20);
            return entries.ToArray();
        }
    }

    private sealed class StubAuditQueries : IWebAuditQueries
    {
        public WebAuditQuery? Last;
        public Task<WebAuditPage?> SearchAsync(WebAuditQuery query, CancellationToken cancellationToken)
        {
            Last = query;
            return Task.FromResult<WebAuditPage?>(new WebAuditPage([], query.Page, query.PageSize, 0));
        }
        public Task<WebAuditDetail?> DetailAsync(long id, CancellationToken cancellationToken) => Task.FromResult<WebAuditDetail?>(null);
    }
}
