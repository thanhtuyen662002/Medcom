using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
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
const int version = 1;
var idleExpiresAt = DateTimeOffset.UtcNow.AddHours(1);
var absoluteExpiresAt = DateTimeOffset.UtcNow.AddHours(2);
var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = [], ContentRootPath = output });
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(server => server.Listen(IPAddress.Loopback, apiPort, listen => listen.UseHttps(certificate)));
await using var api = builder.Build();
const string csrf = "synthetic-i28-csrf";
const string session = "synthetic-i28-session";
var cookieOptions = new CookieOptions { Secure = true, HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/" };
object Session() => new { displayName = "SYNTHETIC I28", tenantId = "I28-T", companyId = "I28-C", companyName = "Synthetic only", authorityVersion = version,
    idleExpiresAt, absoluteExpiresAt, capabilities = new[] { "platform.status", "purchase-orders.read" } };
var row = new { documentId = "I28-PO-001", documentDate = "2026-10-06", branchId = "BR-A", statusId = 0, isLocked = false };
api.Run(async context =>
{
    var request = context.Request;
    var route = request.Path.Value ?? "/";
    if (route == "/__fixture/state") { await context.Response.WriteAsJsonAsync(new { calls = calls.ToArray(), loggedIn }); return; }
    context.Response.Headers.CacheControl = "no-store";
    using var bytes = new MemoryStream(); await request.Body.CopyToAsync(bytes, context.RequestAborted);
    var body = bytes.ToArray();
    calls.Enqueue(new { path = route, method = request.Method, origin = request.Headers.Origin.ToString(),
        cookieNames = request.Cookies.Keys.Order(StringComparer.Ordinal).ToArray(), csrfPresent = request.Headers.ContainsKey("X-CSRF-TOKEN"),
        scope = request.Headers["X-Inbound-Scope"].ToString(), forwarded = request.Headers.ContainsKey("Forwarded") || request.Headers.ContainsKey("X-Forwarded-Host"),
        bytes = body.Length, sha256 = Convert.ToHexStringLower(SHA256.HashData(body)) });
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
        await context.Response.WriteAsJsonAsync(Session()); return;
    }
    if (!loggedIn || request.Cookies["__Host-Medcom.Session"] != session) { await Problem(401, "authentication_required"); return; }
    if (route is "/api/auth/session" or "/api/auth/session/continue") { await context.Response.WriteAsJsonAsync(Session()); return; }
    if (route == "/api/auth/logout") { loggedIn = false; context.Response.Cookies.Delete("__Host-Medcom.Session", cookieOptions); context.Response.StatusCode = 204; return; }
    if (route == "/api/workspace") { await context.Response.WriteAsJsonAsync(new { session = Session(), navigation = new[] { new { id = "purchase-orders", label = "Đơn đặt hàng mua", href = "/?screen=purchase-orders" } }, branchIds = new[] { "BR-A" } }); return; }
    if (route == "/api/documents/purchase-orders") { await context.Response.WriteAsJsonAsync(new { rows = new[] { row }, page = 1, pageSize = 50, hasMore = false }); return; }
    if (route == "/api/documents/purchase-orders/detail") { await context.Response.WriteAsJsonAsync(new { document = row, purchaseOrderLines = new[] { new { lineId = "1", itemId = "SYNTHETIC-ITEM", quantity = "10.0000", quantity2 = (string?)null } }, inboundRequestLines = Array.Empty<object>(), page = 1, pageSize = 50, hasMore = false }); return; }
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
    spki = Convert.ToBase64String(SHA256.HashData(leafKey.ExportSubjectPublicKeyInfo())), fixture = true }));
Console.WriteLine("I28_SYNTHETIC_READY");
await relay.WaitForShutdownAsync();
await api.StopAsync();
