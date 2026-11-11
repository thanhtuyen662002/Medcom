using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Medcom.Application;
using Medcom.Application.Audit;
using Medcom.Contracts;

namespace Medcom.Api;

/// <summary>What one request did, as far as the activity log is concerned.</summary>
internal sealed record WebAuditKind(string Category, string Action, string? Module = null, string? DocumentId = null);

/// <summary>Facts an endpoint adds for the log row of its own request.</summary>
internal sealed class WebAuditNotes
{
    public ResolvedSession? Session { get; set; }
    public string? LoginUser { get; set; }
    public string? BranchId { get; set; }
    public string? DocumentId { get; set; }
    public JsonElement? Request { get; set; }
    public object? Result { get; set; }
    public string? Outcome { get; set; }
    public string? ErrorCode { get; set; }
    public bool Skip { get; set; }
}

/// <summary>
/// Records signed-in users' meaningful requests: sign-in/out, every ERP command with its
/// input and outcome, list/document reads, Excel paste and source picks, attachment
/// files and log views. Polling, dropdown lookups and metadata are not recorded.
/// Passwords and other secret-named fields are never stored.
/// </summary>
internal static class WebAuditMiddleware
{
    private static readonly object NotesKey = new();
    private static readonly HashSet<string> Modules = new(ErpScreenCatalog.ModuleIds, StringComparer.Ordinal);
    private static readonly ConcurrentDictionary<string, long> RecentReads = new(StringComparer.Ordinal);
    private static readonly TimeSpan ReadRepeatWindow = TimeSpan.FromMinutes(2);

    internal static WebAuditNotes Note(HttpContext context)
    {
        if (context.Items.TryGetValue(NotesKey, out var value) && value is WebAuditNotes notes) return notes;
        notes = new WebAuditNotes();
        context.Items[NotesKey] = notes;
        return notes;
    }

    internal static async Task Observe(HttpContext context, RequestDelegate next)
    {
        var sink = context.RequestServices.GetService<IWebAuditSink>();
        var kind = sink is { Enabled: true } ? Classify(context.Request.Method, context.Request.Path.Value ?? "") : null;
        if (kind is null) { await next(context); return; }
        var started = Stopwatch.GetTimestamp();
        var failed = false;
        try { await next(context); }
        catch { failed = true; throw; }
        finally
        {
            try
            {
                if (Build(context, kind, started, failed) is { } entry) sink!.Write(entry);
            }
            catch (Exception error)
            {
                context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("Medcom.Api.WebAudit").LogWarning(
                    new EventId(1204, "WebAuditCaptureFailed"), "Activity log capture failed; exception kind {ExceptionKind}; correlation {CorrelationId}",
                    error.GetType().Name, context.TraceIdentifier);
            }
        }
    }

    internal static WebAuditKind? Classify(string method, string path)
    {
        var post = HttpMethods.IsPost(method);
        var get = HttpMethods.IsGet(method);
        if (!post && !get) return null;
        var parts = path.Trim('/').Split('/');
        if (parts.Length < 2 || parts[0] != "api") return null;
        switch (parts[1])
        {
            case "auth" when post && parts.Length == 3 && parts[2] is "login" or "logout":
                return new(WebAuditCategories.Auth, parts[2]);
            case "audit" when get && parts.Length == 3 && parts[2] == "logs":
                return new(WebAuditCategories.Audit, "view-log");
            case "audit" when get && parts.Length == 4 && parts[2] == "logs" && parts[3] == "detail":
                return new(WebAuditCategories.Audit, "view-log-detail");
            case "notifications" when parts.Length == 4 && post && parts[3] == "read":
                return new(WebAuditCategories.Command, "notification-read", "notifications", parts[2]);
            case "notifications" when parts.Length == 4 && get && parts[3] == "target":
                return new(WebAuditCategories.Read, "open-notification", "notifications", parts[2]);
            case "erp" when parts.Length >= 3 && Modules.Contains(parts[2]):
                return Erp(parts[2], parts[3..], post, get);
            case "purchase-requests" when post && parts.Length == 3 && parts[2] is "save" or "submit":
                return new(WebAuditCategories.Command, parts[2], "purchase-requests");
            case "purchase-requests" when get && parts.Length == 2:
                return new(WebAuditCategories.Read, "list", "purchase-requests");
            case "purchase-requests" when get && parts.Length == 3 && parts[2] == "detail":
                return new(WebAuditCategories.Read, "detail", "purchase-requests");
            case "inbound-requests" when parts.Length == 4 && parts[2] == "draft" && post && parts[3] is "save" or "send-to-warehouse" or "reconcile":
                return new(WebAuditCategories.Command, parts[3], "inbound-requests");
            case "inbound-requests" when parts.Length == 3 && parts[2] == "draft" && get:
                return new(WebAuditCategories.Read, "detail", "inbound-requests");
            case "documents" when get && parts.Length is 3 or 4:
                return Documents(parts[2..]);
            case "v2" when get && parts.Length >= 3 && parts[2] == "documents" && parts.Length is 4 or 5:
                return Documents(parts[3..]);
            case "v2" when get && parts.Length >= 3 && parts[2] == "purchase-requests":
                return parts.Length == 3 ? new(WebAuditCategories.Read, "list", "purchase-requests")
                    : parts.Length == 4 && parts[3] == "detail" ? new(WebAuditCategories.Read, "detail", "purchase-requests") : null;
            default:
                return null;
        }
    }

    private static WebAuditKind? Documents(string[] rest)
    {
        if (rest[0] is not ("purchase-orders" or "inbound-requests")) return null;
        if (rest.Length == 1) return new(WebAuditCategories.Read, "list", rest[0]);
        return rest[1] == "detail" ? new(WebAuditCategories.Read, "detail", rest[0]) : null;
    }

    private static WebAuditKind? Erp(string module, string[] rest, bool post, bool get)
    {
        if (get)
            return rest switch
            {
                [] => new(WebAuditCategories.Read, "list", module),
                ["detail"] => new(WebAuditCategories.Read, "detail", module),
                ["contract-info"] => new(WebAuditCategories.Read, "contract-info", module),
                ["attachments"] => new(WebAuditCategories.Read, "attachments", module),
                ["attachments", "content"] => new(WebAuditCategories.File, "download", module),
                _ => null // screen metadata, status counts, available actions
            };
        if (!post) return null;
        return rest switch
        {
            ["create" or "save" or "delete"] => new(WebAuditCategories.Command, rest[0], module),
            ["actions", var operation] => new(WebAuditCategories.Command, operation, module),
            ["sections", var section, "save"] => new(WebAuditCategories.Command, "save-" + section, module),
            ["qr", "add" or "delete"] => new(WebAuditCategories.Command, "scan-" + rest[1], module),
            ["paste", "validate"] => new(WebAuditCategories.Import, "paste-validate", module),
            ["selection"] => new(WebAuditCategories.Import, "selection", module),
            ["attachments", "upload"] => new(WebAuditCategories.File, "upload", module),
            ["attachments", "delete"] => new(WebAuditCategories.File, "delete-file", module),
            _ => null // dropdown options, command lookups, item price, action options
        };
    }

    private static WebAuditEntry? Build(HttpContext context, WebAuditKind kind, long started, bool failed)
    {
        var notes = context.Items.TryGetValue(NotesKey, out var value) ? value as WebAuditNotes : null;
        if (notes?.Skip == true) return null;
        var session = context.Items.TryGetValue(AuthEndpoints.ResolvedKey, out var resolved) ? resolved as ResolvedSession : null;
        session ??= notes?.Session;
        var status = failed ? StatusCodes.Status500InternalServerError : context.Response.StatusCode;
        var sessionRef = session is null ? null : SessionRef(session.Token);
        var query = context.Request.Query;
        // Repeated identical list/detail reads (screen refresh timers) are recorded once.
        if (kind.Category == WebAuditCategories.Read && HttpMethods.IsGet(context.Request.Method) && status is >= 200 and < 300
            && sessionRef is not null && Repeated(sessionRef + "|" + context.Request.Path + context.Request.QueryString)) return null;
        var request = notes?.Request;
        var result = notes?.Result;
        var command = result as ErpCommandResult;
        var client = context.RequestServices.GetService<WebAuditRelay>()?.Read(context);
        var peer = context.Connection.RemoteIpAddress?.ToString();
        return new WebAuditEntry(context.RequestServices.GetRequiredService<TimeProvider>().GetUtcNow(), WebAuditSources.Server,
            kind.Category, kind.Action, notes?.Outcome ?? CommandOutcome(command) ?? Outcome(status))
        {
            UserName = session?.Identity.PrincipalId ?? WebAuditPayload.Text(notes?.LoginUser, 100),
            DisplayName = session?.Identity.DisplayName,
            RoleName = session?.Identity.RoleName,
            SessionRef = sessionRef,
            BranchId = First(Query(query, "branchId"), notes?.BranchId, Property(request, "branchId")),
            Module = kind.Module,
            DocumentId = First(kind.DocumentId, Query(query, "documentId"), notes?.DocumentId, Property(request, "documentId"),
                command?.Receipt?.DocumentId),
            HttpMethod = context.Request.Method,
            Path = WebAuditPayload.Text(context.Request.Path.Value, 400),
            QueryText = QueryText(context),
            StatusCode = status,
            DurationMs = (int)Math.Min(int.MaxValue, Stopwatch.GetElapsedTime(started).TotalMilliseconds),
            CorrelationId = context.TraceIdentifier,
            ClientAddress = client?.Address ?? peer,
            PeerAddress = peer,
            UserAgent = WebAuditPayload.Text(client?.Agent ?? context.Request.Headers.UserAgent.ToString(), 512),
            RequestData = WebAuditPayload.Json(request),
            ResultData = result is null ? null : WebAuditPayload.Json(result),
            ErrorCode = notes?.ErrorCode ?? (command is { Outcome: not (ErpCommandOutcome.Committed or ErpCommandOutcome.Replayed) } ? command.Code : null)
        };
    }

    /// <summary>A stable, non-reversible reference to the server session (never the token itself).</summary>
    internal static string SessionRef(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("medcom-web-audit-session\0" + token)))[..20].ToLowerInvariant();

    internal static string Outcome(int status) => status switch
    {
        >= 200 and < 300 => "success",
        400 or 415 => "invalid",
        401 => "rejected",
        403 => "denied",
        404 => "not-found",
        409 => "conflict",
        413 => "too-large",
        429 => "rate-limited",
        >= 500 => "failed",
        _ => "status-" + status.ToString(CultureInfo.InvariantCulture)
    };

    private static string? CommandOutcome(ErpCommandResult? result) => result is null ? null : Outcome(result.Outcome);

    internal static string Outcome(ErpCommandOutcome outcome) => outcome switch
    {
        ErpCommandOutcome.Committed => "success",
        ErpCommandOutcome.Replayed => "replayed",
        ErpCommandOutcome.InvalidInput => "invalid",
        ErpCommandOutcome.Denied => "denied",
        ErpCommandOutcome.Conflict => "conflict",
        ErpCommandOutcome.OutcomeUnknown => "unknown",
        ErpCommandOutcome.Cancelled => "cancelled",
        _ => "unavailable"
    };

    internal static bool Repeated(string key)
    {
        var now = Stopwatch.GetTimestamp();
        var window = (long)(ReadRepeatWindow.TotalSeconds * Stopwatch.Frequency);
        if (RecentReads.Count > 20_000)
            foreach (var item in RecentReads)
                if (now - item.Value > window) RecentReads.TryRemove(item.Key, out _);
        var repeated = false;
        RecentReads.AddOrUpdate(key, now, (_, last) => { repeated = now - last < window; return repeated ? last : now; });
        return repeated;
    }

    private static string? QueryText(HttpContext context)
    {
        var text = context.Request.QueryString.Value;
        if (string.IsNullOrEmpty(text)) return null;
        try { text = Uri.UnescapeDataString(text.Replace('+', ' ')); } catch (UriFormatException) { }
        return text.Length <= 2000 ? text : text[..2000];
    }

    private static string? Query(IQueryCollection query, string name) =>
        query.TryGetValue(name, out var value) && value.Count == 1 ? WebAuditPayload.Text(value.ToString(), 100) : null;

    private static string? Property(JsonElement? element, string name) =>
        element is { ValueKind: JsonValueKind.Object } value && value.TryGetProperty(name, out var property)
            && property.ValueKind == JsonValueKind.String ? WebAuditPayload.Text(property.GetString(), 100) : null;

    private static string? First(params string?[] values) => values.FirstOrDefault(v => !string.IsNullOrWhiteSpace(v));
}

/// <summary>
/// The Next.js BFF calls the API server-to-server, so the API's TCP peer is the BFF.
/// The BFF forwards the browser's address and user agent with an HMAC over them,
/// keyed by a secret both sides hold privately (Audit:RelayKey / MEDCOM_AUDIT_RELAY_KEY).
/// Unsigned or stale values are ignored, so a browser cannot spoof another address.
/// </summary>
internal sealed class WebAuditRelay(byte[] key, TimeProvider clock)
{
    public const string AddressHeader = "X-Medcom-Client-Address";
    public const string AgentHeader = "X-Medcom-Client-Agent";
    public const string TimeHeader = "X-Medcom-Client-Time";
    public const string SignatureHeader = "X-Medcom-Client-Signature";

    internal sealed record Client(string Address, string? Agent);

    public static WebAuditRelay? FromConfiguration(IConfiguration configuration, TimeProvider clock) =>
        configuration["Audit:RelayKey"] is { Length: >= 32 } secret ? new WebAuditRelay(Encoding.UTF8.GetBytes(secret), clock) : null;

    public Client? Read(HttpContext context)
    {
        var headers = context.Request.Headers;
        if (headers[AddressHeader].Count != 1 || headers[TimeHeader].Count != 1 || headers[SignatureHeader].Count != 1) return null;
        var address = headers[AddressHeader].ToString();
        var agent = headers[AgentHeader].Count == 1 ? headers[AgentHeader].ToString() : "";
        if (address.Length is 0 or > 64 || agent.Length > 2048
            || !long.TryParse(headers[TimeHeader].ToString(), NumberStyles.None, CultureInfo.InvariantCulture, out var seconds)
            || Math.Abs(clock.GetUtcNow().ToUnixTimeSeconds() - seconds) > 300) return null;
        var expected = Sign(key, seconds, address, agent, context.Request.Method, context.Request.Path.Value ?? "");
        byte[] actual;
        try { actual = Convert.FromHexString(headers[SignatureHeader].ToString()); } catch (FormatException) { return null; }
        if (!CryptographicOperations.FixedTimeEquals(expected, actual)) return null;
        string? decoded;
        try { decoded = agent.Length == 0 ? null : Uri.UnescapeDataString(agent); } catch (UriFormatException) { decoded = null; }
        return new Client(address, decoded);
    }

    internal static byte[] Sign(byte[] key, long seconds, string address, string agent, string method, string path) =>
        HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(string.Join('\n',
            seconds.ToString(CultureInfo.InvariantCulture), address, agent, method.ToUpperInvariant(), path)));
}
