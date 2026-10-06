using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text;
using Medcom.LocalFrontendHost;

// Test-only process. This project is never included in an operator artifact.
// The shipping relay class and built Next/BFF run unchanged; API data/auth below
// are explicit synthetic doubles, with no SQL, owner credentials or OS trust edits.
var options = args.Chunk(2).ToDictionary(pair => pair[0], pair => pair.Length == 2 ? pair[1] : throw new ArgumentException("Missing fixture argument."), StringComparer.Ordinal);
int Port(string name) => int.Parse(options[name], CultureInfo.InvariantCulture);
var apiPort = Port("--api-port");
var httpsPort = Port("--https-port");
var nodePort = Port("--node-port");
var output = Path.GetFullPath(options["--output"]);
if (new[] { apiPort, httpsPort, nodePort }.Distinct().Count() != 3) throw new ArgumentException("Fixture ports must differ.");
Directory.CreateDirectory(output);
using var rootKey = RSA.Create(2048);
var rootRequest = new CertificateRequest("CN=I28 synthetic temporary CA", rootKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
rootRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, false, 0, true));
rootRequest.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign, true));
using var root = rootRequest.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-5), DateTimeOffset.UtcNow.AddDays(1));
using var leafKey = RSA.Create(2048);
var leafRequest = new CertificateRequest("CN=localhost", leafKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
var san = new SubjectAlternativeNameBuilder(); san.AddDnsName(options.GetValueOrDefault("--certificate-name", "localhost"));
leafRequest.CertificateExtensions.Add(san.Build());
leafRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
leafRequest.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
leafRequest.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection { new("1.3.6.1.5.5.7.3.1") }, true));
using var issued = leafRequest.Create(root, DateTimeOffset.UtcNow.AddMinutes(-4), DateTimeOffset.UtcNow.AddHours(1), RandomNumberGenerator.GetBytes(16));
using var generated = issued.CopyWithPrivateKey(leafKey);
// Approved disposable-test-key-only normalization for Windows Schannel. No
// owner/store key is read/exported; no PFX file is written and bytes are zeroed.
// Platform temporary key storage may be used and is normally released on disposal.
var pfx = generated.Export(X509ContentType.Pfx);
X509Certificate2 certificate;
try { certificate = X509CertificateLoader.LoadPkcs12(pfx, null); }
finally { CryptographicOperations.ZeroMemory(pfx); }
using var certificateLifetime = certificate;
await File.WriteAllTextAsync(Path.Combine(output, "ca.pem"), root.ExportCertificatePem());
var calls = new ConcurrentQueue<object>();
var loggedIn = false;
// LegacyIdentityAuthority versions count observations, not permission changes.
// Stable markers below deliberately coexist with a new version on EVERY
// authenticated request, including failing purchase reads.
long version = 0;
var controlToken = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(24));
var control = new FixtureControls();
var controlLock = new object();
var holds = new ConcurrentDictionary<string, TaskCompletionSource<bool>>(StringComparer.Ordinal);
var waiting = new ConcurrentDictionary<string, int>(StringComparer.Ordinal);
var committedDocuments = new ConcurrentDictionary<string, JsonObject>(StringComparer.Ordinal);
var commandReceipts = new ConcurrentDictionary<string, (string Body, JsonObject Receipt)>(StringComparer.Ordinal);
long syntheticEffects = 0;
var idleExpiresAt = DateTimeOffset.UtcNow.AddHours(1);
var absoluteExpiresAt = DateTimeOffset.UtcNow.AddHours(2);
var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = [], ContentRootPath = output });
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(server => server.Listen(IPAddress.Loopback, apiPort, listen => listen.UseHttps(certificate)));
await using var api = builder.Build();
const string csrf = "synthetic-i28-csrf";
const string session = "synthetic-i28-session";
var cookieOptions = new CookieOptions { Secure = true, HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/" };
object Session(long observation, FixtureControls state) => new { displayName = "SYNTHETIC I28", tenantId = "I28-T", companyId = "I28-C", companyName = "Synthetic only", authorityVersion = observation,
    idleExpiresAt = state.Expired ? DateTimeOffset.UtcNow.AddMinutes(-1) : idleExpiresAt,
    absoluteExpiresAt, capabilities = state.Capabilities };
var row = new { documentId = "I28-PO-001", documentDate = "2026-10-06", branchId = "BR-A", statusId = 0, isLocked = false };
api.Run(async context =>
{
    var request = context.Request;
    var route = request.Path.Value ?? "/";
    if (route.StartsWith("/__fixture/", StringComparison.Ordinal))
    {
        // Control is available only on this disposable synthetic API, never the
        // shipping BFF, and is protected by an ephemeral harness-only nonce.
        if (route == "/__fixture/state") { await context.Response.WriteAsJsonAsync(new { calls = calls.ToArray(), loggedIn, authorityVersion = Interlocked.Read(ref version), waiting = waiting.ToArray(), syntheticEffects = Interlocked.Read(ref syntheticEffects) }); return; }
        if (route != "/__fixture/control" || request.Method != "POST" || request.Headers["X-I29-Fixture-Control"] != controlToken) { context.Response.StatusCode = 404; return; }
        var next = await request.ReadFromJsonAsync<FixtureControls>(context.RequestAborted) ?? throw new InvalidOperationException("Missing synthetic controls.");
        if (next.Holds.Concat(next.ReleaseHolds).Any(kind => kind is not ("workspace" or "orders-list" or "orders-detail" or "purchase-bootstrap" or "purchase-list" or "purchase-detail" or "purchase-save"))
            || next.Failures.Any(pair => pair.Value is not (401 or 403 or 503))) { context.Response.StatusCode = 400; return; }
        lock (controlLock)
        {
            if (next.CommandGeneration != control.CommandGeneration) { committedDocuments.Clear(); commandReceipts.Clear(); }
            control = next;
        }
        // Release the captured batch but install replacement gates BEFORE waking
        // it; the next fresh read can then be observed independently.
        var released = new List<TaskCompletionSource<bool>>();
        foreach (var kind in next.ReleaseHolds) if (holds.TryRemove(kind, out var prior)) released.Add(prior);
        foreach (var kind in next.Holds) holds.TryAdd(kind, new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously));
        foreach (var prior in released) prior.TrySetResult(true);
        foreach (var kind in holds.Keys.Except(next.Holds)) if (holds.TryRemove(kind, out var gate)) gate.TrySetResult(true);
        await context.Response.WriteAsJsonAsync(new { synthetic = true }); return;
    }
    FixtureControls observed;
    lock (controlLock) { observed = control; }
    var authenticated = loggedIn && request.Cookies["__Host-Medcom.Session"] == session;
    var observation = authenticated ? Interlocked.Increment(ref version) : 0;
    context.Response.Headers.CacheControl = "no-store";
    using var bytes = new MemoryStream(); await request.Body.CopyToAsync(bytes, context.RequestAborted);
    var body = bytes.ToArray();
    calls.Enqueue(new { path = route, query = request.Query.ToDictionary(pair => pair.Key, pair => pair.Value.ToString()), method = request.Method, authorityVersion = observation, origin = request.Headers.Origin.ToString(),
        cookieNames = request.Cookies.Keys.Order(StringComparer.Ordinal).ToArray(), csrfPresent = request.Headers.ContainsKey("X-CSRF-TOKEN"),
        scope = request.Headers["X-Inbound-Scope"].ToString(), readMarkerPresent = request.Headers.ContainsKey("X-Medcom-Session-Scope") || request.Headers.ContainsKey("X-Medcom-Read-Scope"), forwarded = request.Headers.ContainsKey("Forwarded") || request.Headers.ContainsKey("X-Forwarded-Host"),
        purchaseScope = request.Headers["X-Purchase-Scope"].ToString(),
        commandBody = route is "/api/purchase-requests/save" or "/api/purchase-requests/save/lookup" ? Encoding.UTF8.GetString(body) : null,
        bytes = body.Length, sha256 = Convert.ToHexStringLower(SHA256.HashData(body)) });
    async Task Pause(string kind)
    {
        if (holds.TryGetValue(kind, out var gate))
        {
            waiting.AddOrUpdate(kind, 1, (_, count) => count + 1);
            try { await gate.Task.WaitAsync(context.RequestAborted); }
            finally { waiting.AddOrUpdate(kind, 0, (_, count) => Math.Max(0, count - 1)); }
        }
    }
    async Task Reply(string kind, object data)
    {
        await Pause(kind);
        if (observed.Failures.TryGetValue(kind, out var status)) { context.Response.StatusCode = status; await context.Response.WriteAsJsonAsync(new { code = "synthetic_read_denied" }); return; }
        await context.Response.WriteAsJsonAsync(data);
    }
    async Task Problem(int status, string code) { context.Response.StatusCode = status; await context.Response.WriteAsJsonAsync(new { code }); }
    if (route == "/health/live") { await context.Response.WriteAsJsonAsync(new { status = "live" }); return; }
    if (route == "/health/ready") { context.Response.StatusCode = 503; await context.Response.WriteAsJsonAsync(new { status = "unavailable", checks = new[] { new { component = "business_release", status = "not_configured" } } }); return; }
    if (route == "/api/auth/csrf")
    {
        context.Response.Cookies.Append("__Host-Medcom.Csrf", csrf, cookieOptions);
        // Deliberately hostile upstream cookies prove that the BFF drops them.
        context.Response.Headers.Append("Set-Cookie", "unrelated=drop; Secure; HttpOnly; Path=/");
        context.Response.Headers.Append("Set-Cookie", "__Host-Medcom.Session=drop; Domain=localhost; Secure; HttpOnly; Path=/");
        await context.Response.WriteAsJsonAsync(new { token = csrf }); return;
    }
    if (request.Method == "POST" && (request.Headers["X-CSRF-TOKEN"] != csrf || request.Cookies["__Host-Medcom.Csrf"] != csrf)) { await Problem(403, "csrf_invalid"); return; }
    if (route == "/api/auth/login")
    {
        using var json = JsonDocument.Parse(body);
        if (json.RootElement.GetProperty("username").GetString() != "i28-user" || json.RootElement.GetProperty("password").GetString() != "synthetic-i28-password") { await Problem(401, "invalid_credentials"); return; }
        loggedIn = true; context.Response.Cookies.Append("__Host-Medcom.Session", session, cookieOptions);
        await context.Response.WriteAsJsonAsync(Session(observation > 0 ? observation : Interlocked.Increment(ref version), observed)); return;
    }
    if (!loggedIn || request.Cookies["__Host-Medcom.Session"] != session) { await Problem(401, "authentication_required"); return; }
    if (route is "/api/auth/session" or "/api/auth/session/continue") { await context.Response.WriteAsJsonAsync(Session(observation, observed)); return; }
    if (route == "/api/auth/logout") { loggedIn = false; context.Response.Cookies.Delete("__Host-Medcom.Session", cookieOptions); context.Response.StatusCode = 204; return; }
    if (route is "/api/workspace" or "/api/documents/purchase-orders" or "/api/documents/purchase-orders/detail")
    {
        // Synthetic noncredential correlation values; no owner session material.
        context.Response.Headers["X-Medcom-Session-Scope"] = observed.SessionScope;
        context.Response.Headers["X-Medcom-Read-Scope"] = observed.ReadScope;
    }
    var page = int.TryParse(request.Query["page"], out var parsedPage) ? Math.Clamp(parsedPage, 1, 1000) : 1;
    var branch = observed.BranchIds[0];
    var purchaseBranches = observed.PurchaseBranchIds ?? observed.BranchIds;
    var purchaseBranch = purchaseBranches[0];
    var documentId = request.Query["documentId"].ToString();
    if (route == "/api/workspace") { await Reply("workspace", new { session = Session(observation, observed), navigation = observed.Capabilities.Where(capability => capability.EndsWith(".read", StringComparison.Ordinal)).Select(capability => new { id = capability[..^5], label = capability[..^5], href = "/?screen=" + capability[..^5] }), branchIds = observed.BranchIds }); return; }
    if (route == "/api/documents/purchase-orders")
    {
        var rows = observed.ExtendedRows ? Enumerable.Range(0, 20).Select(index => new { documentId = $"I29-PO-P{page}-{index:00}", documentDate = "2026-10-06", branchId = branch, statusId = 0, isLocked = false }).ToArray() : new[] { row };
        await Reply("orders-list", new { rows, page, pageSize = 50, hasMore = observed.ExtendedRows && page < 3 }); return;
    }
    if (route == "/api/documents/purchase-orders/detail")
    {
        await Reply("orders-detail", new { document = new { documentId = string.IsNullOrEmpty(documentId) ? row.documentId : documentId, row.documentDate, branchId = branch, row.statusId, row.isLocked },
            purchaseOrderLines = Enumerable.Range(0, observed.ExtendedRows ? 60 : 1).Select(index => new { lineId = index.ToString(CultureInfo.InvariantCulture), itemId = observed.ExtendedRows ? $"I29-ITEM-P{page}-{index}" : "SYNTHETIC-ITEM", quantity = "10.0000", quantity2 = (string?)null }),
            inboundRequestLines = Array.Empty<object>(), page, pageSize = 50, hasMore = observed.ExtendedRows && page < 3 }); return;
    }
    if (route == "/api/purchase-requests/workspace")
    {
        await Reply("purchase-bootstrap", new { scopeKey = observed.PurchaseScope, data = new { branchIds = purchaseBranches, writeAvailable = false, writeReason = "numbering_journal_runtime_unqualified", lookups = Array.Empty<object>() } }); return;
    }
    if (route == "/api/purchase-requests")
    {
        await Reply("purchase-list", new { scopeKey = observed.PurchaseScope, data = new { rows = Enumerable.Range(0, 20).Select(index => new { documentId = $"I29-PR-P{page}-{index:00}", purchaseDate = "2026-10-06T00:00:00.000", branchId = purchaseBranch, personSuggest = "SYNTHETIC REQUESTER", department = "SYNTHETIC DEPARTMENT", statusId = 1, isLocked = false }), page, pageSize = 20, hasMore = page < 3 } }); return;
    }
    JsonObject PurchaseDocument(string id) => JsonSerializer.SerializeToNode(new {
        purchaseRequestId = id, branchId = purchaseBranch, statusId = 1, isLocked = false,
        header = new { purchaseDate = "2026-10-06T00:00:00.000", purposeId = 1, personSuggest = "SYNTHETIC REQUESTER", department = "SYNTHETIC DEPARTMENT", purposeDescOrClient = "Synthetic fixture only", price = "10.0000", notes = "SYNTHETIC NOTES", currencyId = "VND", objectId = "SYNTHETIC-OBJECT", rateExchange = 1 },
        lines = new[] { new { lineId = "SYNTHETIC-LINE", values = new { itemId = "SYNTHETIC-PURCHASE-ITEM", budget = "10", timeRequired = (string?)null, quantity = "1", unitPrice = "10", totalPrice = "10.0000", model = (string?)null } } }
    })!.AsObject();
    if (route == "/api/purchase-requests/detail")
    {
        var saved = committedDocuments.TryGetValue(documentId, out var committed);
        await Reply("purchase-detail", new { scopeKey = observed.PurchaseScope, data = new {
            document = saved ? committed!.DeepClone() : PurchaseDocument(documentId),
            commandAccess = new { canSave = observed.CommandAllowed, canSubmit = observed.CommandAllowed, canLookup = true, canAddLines = false, reason = observed.CommandAllowed ? "synthetic_grant_enabled" : "synthetic_grant_revoked" },
            stateToken = "prs1." + new string(saved ? '2' : '1', 64) } }); return;
    }
    if (route is "/api/purchase-requests/save" or "/api/purchase-requests/save/lookup")
    {
        // Only synthetic notes-only saves are admitted. This state lives in the
        // disposable fixture process and is never a production write provider.
        if (request.Method != "POST" || request.Headers["X-Purchase-Scope"] != observed.PurchaseScope) { await Problem(409, "synthetic_purchase_scope_mismatch"); return; }
        var original = Encoding.UTF8.GetString(body);
        var dto = JsonNode.Parse(original)!.AsObject();
        var key = dto["idempotencyKey"]!.GetValue<string>();
        if (route.EndsWith("/lookup", StringComparison.Ordinal))
        {
            if (!commandReceipts.TryGetValue(key, out var found) || found.Body != original) { await Problem(409, "synthetic_original_body_required"); return; }
            if (!committedDocuments.ContainsKey(found.Receipt["document"]!["purchaseRequestId"]!.GetValue<string>()))
            { await context.Response.WriteAsJsonAsync(new { scopeKey = observed.PurchaseScope, data = new { outcome = 1, receipt = (object?)null } }); return; }
            await context.Response.WriteAsJsonAsync(new { scopeKey = observed.PurchaseScope, data = new { outcome = 0, receipt = found.Receipt.DeepClone() } }); return;
        }
        if (!observed.CommandAllowed || dto["expectedStateToken"]!.GetValue<string>() != "prs1." + new string('1', 64)
            || !purchaseBranches.Contains(dto["branchId"]!.GetValue<string>()) || dto["lineChanges"]!.AsArray().Count != 0)
        { await Problem(409, "synthetic_notes_only_save_required"); return; }
        var id = dto["purchaseRequestId"]!.GetValue<string>();
        if (!id.StartsWith("I29-PR-", StringComparison.Ordinal)) { await Problem(409, "synthetic_document_required"); return; }
        var desired = PurchaseDocument(id);
        var header = dto["header"]!.DeepClone();
        var notesOnly = desired["header"]!.DeepClone(); notesOnly["notes"] = header["notes"]?.DeepClone();
        if (!JsonNode.DeepEquals(notesOnly, header)) { await Problem(409, "synthetic_notes_only_save_required"); return; }
        desired["header"] = header;
        var receipt = JsonSerializer.SerializeToNode(new { actionId = "purchase-request.save-draft", idempotencyKey = key,
            document = desired, stateToken = "prs1." + new string('2', 64), allocatedLines = Array.Empty<object>() })!.AsObject();
        if (!commandReceipts.TryAdd(key, (original, receipt))) { await Problem(409, "synthetic_duplicate_dispatch"); return; }
        if (observed.CommitOnAck) await Pause("purchase-save");
        committedDocuments[id] = desired; Interlocked.Increment(ref syntheticEffects);
        var answer = new { scopeKey = observed.PurchaseScope, data = new { outcome = 0, receipt } };
        if (observed.CommitOnAck) await context.Response.WriteAsJsonAsync(answer);
        else await Reply("purchase-save", answer);
        return;
    }
    if (route == "/api/inbound-requests/draft/save")
    {
        if (request.Headers.Origin != $"https://localhost:{apiPort}" || request.Headers["X-Inbound-Scope"] != new string('a', 64)) { await Problem(409, "synthetic_scope_mismatch"); return; }
        await context.Response.WriteAsJsonAsync(new { synthetic = true, bytes = body.Length, sha256 = Convert.ToHexStringLower(SHA256.HashData(body)) }); return;
    }
    await Problem(404, "synthetic_endpoint_unavailable");
});
await using var relay = LoopbackRelay.Build(new LoopbackRelayOptions(httpsPort, nodePort), certificate);
await api.StartAsync();
await relay.StartAsync();
await File.WriteAllTextAsync(Path.Combine(output, "ready.json"), JsonSerializer.Serialize(new { apiOrigin = $"https://localhost:{apiPort}", publicOrigin = $"https://localhost:{httpsPort}",
    spki = Convert.ToBase64String(SHA256.HashData(leafKey.ExportSubjectPublicKeyInfo())), controlToken, fixture = true }));
Console.WriteLine("I28_SYNTHETIC_READY");
await relay.WaitForShutdownAsync();
await api.StopAsync();

// Test-only controls; no production route, auth implementation, or SQL is changed.
sealed record FixtureControls
{
    public bool ExtendedRows { get; init; }
    public bool Expired { get; init; }
    public bool CommandAllowed { get; init; } = true;
    public int CommandGeneration { get; init; }
    public bool CommitOnAck { get; init; }
    public string SessionScope { get; init; } = new('a', 64);
    public string ReadScope { get; init; } = new('b', 64);
    public string PurchaseScope { get; init; } = new('c', 64);
    public string[] BranchIds { get; init; } = ["BR-A", "BR-B"];
    public string[]? PurchaseBranchIds { get; init; }
    public string[] Capabilities { get; init; } = ["platform.status", "purchase-orders.read", "purchase-requests.read"];
    public string[] Holds { get; init; } = [];
    public string[] ReleaseHolds { get; init; } = [];
    public Dictionary<string, int> Failures { get; init; } = new(StringComparer.Ordinal);
}
