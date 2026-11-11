using System.Collections.Concurrent;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Medcom.Application.Audit;
using Medcom.Contracts;

namespace Medcom.Api;

/// <summary>
/// POST /api/audit/events  — browser interaction events of the signed-in user.
/// GET  /api/audit/logs    — search the activity log (audit.read only).
/// GET  /api/audit/logs/detail — one row with its full input/result data (audit.read only).
/// </summary>
public static partial class WebAuditEndpoints
{
    public const int MaximumEvents = 100;
    public const int MaximumEventBytes = 131_072;
    private const int MaximumDetailChars = 4096;
    private const int EventsPerWindow = 1200;
    private static readonly TimeSpan EventWindow = TimeSpan.FromMinutes(10);
    private static readonly ConcurrentDictionary<string, (DateTimeOffset Start, int Count)> Budgets = new(StringComparer.Ordinal);

    [GeneratedRegex("^[a-z][a-z0-9-]{1,39}$")]
    private static partial Regex EventType();

    public static void Map(IEndpointRouteBuilder app)
    {
        app.MapPost("/api/audit/events", async (HttpContext context, IWebAuditSink sink, TimeProvider clock) =>
        {
            if (context.Request.ContentLength > MaximumEventBytes) return Problem(413, "payload_too_large");
            var raw = await ErpScreenEndpoints.Body(context);
            if (raw is null || ErpScreenEndpoints.Decode<WebAuditEventBatch>(raw.Value) is not { Events: { Count: > 0 and <= MaximumEvents } } batch)
                return Problem(400, "invalid_audit_events");
            var session = AuthEndpoints.Current(context);
            if (!sink.Enabled) return Results.Json(new WebAuditEventsAccepted(0, batch.Events.Count), statusCode: 202);
            var sessionRef = WebAuditMiddleware.SessionRef(session.Token);
            var now = clock.GetUtcNow();
            var allowed = Budget(sessionRef, batch.Events.Count, now);
            // Client clocks drift: shift event times by the batch's own send-time offset.
            var offset = now - batch.SentAt;
            var client = context.RequestServices.GetService<WebAuditRelay>()?.Read(context);
            var peer = context.Connection.RemoteIpAddress?.ToString();
            var agent = WebAuditPayload.Text(client?.Agent ?? context.Request.Headers.UserAgent.ToString(), 512);
            int accepted = 0, rejected = 0;
            foreach (var item in batch.Events)
            {
                if (accepted >= allowed || item.Id == Guid.Empty || !EventType().IsMatch(item.Type)) { rejected++; continue; }
                var occurred = item.At + offset;
                if (occurred > now) occurred = now;
                if (occurred < now.AddDays(-2)) occurred = now.AddDays(-2);
                sink.Write(new WebAuditEntry(occurred, WebAuditSources.Client, WebAuditCategories.Ui, item.Type, "observed")
                {
                    UserName = session.Identity.PrincipalId,
                    DisplayName = session.Identity.DisplayName,
                    RoleName = session.Identity.RoleName,
                    SessionRef = sessionRef,
                    BranchId = WebAuditPayload.Text(item.BranchId, 50),
                    Module = WebAuditPayload.Text(item.Module, 100),
                    DocumentId = WebAuditPayload.Text(item.DocumentId, 100),
                    Page = WebAuditPayload.Text(item.Page, 200),
                    Target = WebAuditPayload.Text(item.Target, 400),
                    CorrelationId = context.TraceIdentifier,
                    ClientAddress = client?.Address ?? peer,
                    PeerAddress = peer,
                    UserAgent = agent,
                    ClientEventId = item.Id,
                    ClientTime = item.At,
                    RequestData = WebAuditPayload.Json(item.Detail, MaximumDetailChars)
                });
                accepted++;
            }
            return Results.Json(new WebAuditEventsAccepted(accepted, rejected), statusCode: 202);
        });

        app.MapGet("/api/audit/logs", async (HttpContext context, IWebAuditQueries queries) =>
        {
            if (!CanView(context)) return Problem(403, "audit_read_denied");
            var query = context.Request.Query;
            string[] names = ["from", "to", "user", "module", "category", "action", "outcome", "documentId", "branchId", "search", "page", "pageSize"];
            if (query.Any(pair => !names.Contains(pair.Key, StringComparer.Ordinal) || pair.Value.Count != 1)) return Problem(400, "invalid_query");
            if (!Time(query, "from", out var from) || !Time(query, "to", out var to)
                || !Number(query, "page", 1, 1, 100_000, out var page) || !Number(query, "pageSize", 50, 1, 200, out var size)
                || !Text(query, "user", 100, out var user) || !Text(query, "module", 100, out var module)
                || !Text(query, "category", 20, out var category) || !Text(query, "action", 100, out var action)
                || !Text(query, "outcome", 30, out var outcome) || !Text(query, "documentId", 100, out var document)
                || !Text(query, "branchId", 50, out var branch) || !Text(query, "search", 200, out var search))
                return Problem(400, "invalid_query");
            try
            {
                var result = await queries.SearchAsync(new WebAuditQuery(from, to, user, module, category, action, outcome, document, branch,
                    search, page, size), context.RequestAborted);
                return result is null ? Problem(503, "audit_unavailable") : Results.Ok(result);
            }
            catch (Exception error) when (error is System.Data.Common.DbException or InvalidOperationException or TimeoutException)
            { return Problem(503, "audit_unavailable"); }
        });

        app.MapGet("/api/audit/logs/detail", async (HttpContext context, IWebAuditQueries queries) =>
        {
            if (!CanView(context)) return Problem(403, "audit_read_denied");
            var query = context.Request.Query;
            if (query.Count != 1 || !query.TryGetValue("id", out var raw) || raw.Count != 1
                || !long.TryParse(raw.ToString(), NumberStyles.None, CultureInfo.InvariantCulture, out var id) || id < 1)
                return Problem(400, "invalid_query");
            try
            {
                var row = await queries.DetailAsync(id, context.RequestAborted);
                return row is null ? Problem(404, "audit_not_found") : Results.Ok(row);
            }
            catch (Exception error) when (error is System.Data.Common.DbException or InvalidOperationException or TimeoutException)
            { return Problem(503, "audit_unavailable"); }
        });
    }

    internal static bool CanView(HttpContext context) =>
        AuthEndpoints.Current(context).Identity.Capabilities.Contains(WebAuditViewerPolicy.Capability, StringComparer.Ordinal);

    private static int Budget(string sessionRef, int requested, DateTimeOffset now)
    {
        if (Budgets.Count > 10_000)
            foreach (var item in Budgets)
                if (now - item.Value.Start > EventWindow) Budgets.TryRemove(item.Key, out _);
        var allowed = 0;
        Budgets.AddOrUpdate(sessionRef, _ => { allowed = Math.Min(requested, EventsPerWindow); return (now, allowed); }, (_, current) =>
        {
            if (now - current.Start > EventWindow) current = (now, 0);
            allowed = Math.Clamp(EventsPerWindow - current.Count, 0, requested);
            return (current.Start, current.Count + allowed);
        });
        return allowed;
    }

    private static bool Time(IQueryCollection query, string name, out DateTimeOffset? value)
    {
        value = null;
        if (!query.TryGetValue(name, out var raw)) return true;
        if (!DateTimeOffset.TryParse(raw.ToString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var parsed)) return false;
        value = parsed;
        return true;
    }

    private static bool Number(IQueryCollection query, string name, int fallback, int minimum, int maximum, out int value)
    {
        value = fallback;
        if (!query.TryGetValue(name, out var raw)) return true;
        return int.TryParse(raw.ToString(), NumberStyles.None, CultureInfo.InvariantCulture, out value) && value >= minimum && value <= maximum;
    }

    private static bool Text(IQueryCollection query, string name, int maximum, out string? value)
    {
        value = null;
        if (!query.TryGetValue(name, out var raw)) return true;
        var text = raw.ToString().Trim();
        if (text.Length > maximum) return false;
        value = text.Length == 0 ? null : text;
        return true;
    }

    private static IResult Problem(int status, string code) => Results.Problem(statusCode: status, title: "Activity log request could not be completed.",
        extensions: new Dictionary<string, object?> { ["code"] = code });
}
