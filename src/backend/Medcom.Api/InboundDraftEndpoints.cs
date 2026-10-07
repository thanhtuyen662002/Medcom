using System.Buffers;
using System.Globalization;
using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Medcom.Api;

/// <summary>Default-unavailable inbound facade; no SQL registration or second writer.</summary>
public static class InboundDraftEndpoints
{
    public const string Root = "/api/inbound-requests/draft";
    public const string ScopeHeader = "X-Inbound-Scope";
    public const int MaximumBodyBytes = 1_048_576;
    private static readonly UTF8Encoding Utf8 = new(false, true);
    // Local options: never inherit purchase enums, number handling, case folding,
    // ignore-null settings, or permissive application-wide JSON options.
    private static readonly JsonSerializerOptions Wire = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        MaxDepth = 24
    };

    public static IServiceCollection AddInboundDraftFacade(this IServiceCollection services)
    {
        services.TryAddScoped<IInboundDraftCommandAccess, UnavailableInboundDraftCommandAccess>();
        services.TryAddScoped<IInboundDraftCommandService, UnavailableInboundDraftCommandService>();
        return services;
    }

    public static void MapInboundDraftFacade(this IEndpointRouteBuilder endpoints)
    {
        // Existing cookie/antiforgery/session infrastructure is required. This
        // helper does not replace it or weaken the application's fallback policy.
        var cookie = new AuthorizeAttribute { AuthenticationSchemes = CookieAuthenticationDefaults.AuthenticationScheme };
        endpoints.MapGet(Root, (Func<HttpContext, Task<IResult>>)(c => Run(c, null))).RequireAuthorization(cookie);
        endpoints.MapPost(Root + "/save", (Func<HttpContext, Task<IResult>>)(c => Run(c, "save"))).RequireAuthorization(cookie);
        endpoints.MapPost(Root + "/send-to-warehouse", (Func<HttpContext, Task<IResult>>)(c => Run(c, "send-to-warehouse"))).RequireAuthorization(cookie);
        endpoints.MapPost(Root + "/reconcile", (Func<HttpContext, Task<IResult>>)(c => Run(c, "reconcile"))).RequireAuthorization(cookie);
    }

    private sealed class BoundaryFailure(int status, string code) : Exception
    {
        public int Status { get; } = status;
        public string Code { get; } = code;
    }
    private sealed record Gate(ResolvedSession Session, InboundDraftAuthority? Authority, string? Scope,
        InboundDraftAccessView Access);
    private static void Require([DoesNotReturnIf(false)] bool condition, int status = 400, string code = "invalid_inbound_request")
    {
        if (!condition) throw new BoundaryFailure(status, code);
    }
    private static readonly InboundDraftAccessView Closed = new(false, false, false, false, MaximumBodyBytes);

    private static async Task<IResult> Run(HttpContext context, string? route)
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Headers.Pragma = "no-cache";
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers.Vary = "Cookie, " + ScopeHeader;
        try
        {
            Origin(context, route is not null);
            var authenticated = await context.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            context.RequestAborted.ThrowIfCancellationRequested();
            var claims = authenticated.Principal?.FindAll(AuthEndpoints.SessionClaim).ToArray();
            Require(authenticated.Succeeded && claims is { Length: 1 }, 401, "authentication_required");
            var token = claims![0].Value;
            var sessions = context.RequestServices.GetRequiredService<IWebSessions>();
            // The exact built-in disabled pair cannot return document data, receipts,
            // scope, or permissions. Avoid repeated SQL authority reads for that GET
            // only; custom providers and every POST retain the normal fences below.
            if (route is null
                && context.RequestServices.GetService<IInboundDraftCommandAccess>() is UnavailableInboundDraftCommandAccess
                && context.RequestServices.GetService<IInboundDraftCommandService>() is UnavailableInboundDraftCommandService)
            {
                _ = ReadScope(context, false);
                Require(context.Request.Query.Count == 1 && context.Request.Query.Keys.Single() == "documentId"
                    && context.Request.Query.TryGetValue("documentId", out var disabledIds)
                    && disabledIds.Count == 1 && InboundDraftValidation.Ansi(disabledIds[0], 50));
                var current = await sessions.InspectAsync(token, context.RequestAborted);
                context.RequestAborted.ThrowIfCancellationRequested();
                Require(current is not null && current.Token == token, 401, "authentication_required");
                return Json(new InboundDraftWorkspace(null, Closed, new(InboundDraftOutcome.Unavailable)));
            }
            // This invocation owns its baseline and last observed version. Other
            // requests may advance the authority sequence independently.
            var sessionFence = new SessionFence(context, sessions, token);
            await sessionFence.ResolveAsync();
            if (route is not null)
            {
                // Validate explicitly: JSON endpoints must not depend on form
                // binding or on the eventual parent middleware arrangement.
                await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context);
                await sessionFence.ResolveAsync();
            }
            var suppliedScope = ReadScope(context, route is not null);
            string documentId;
            InboundDraftCommand? command = null;
            if (route is null)
            {
                Require(context.Request.Query.Count == 1 && context.Request.Query.Keys.Single() == "documentId"
                    && context.Request.Query.TryGetValue("documentId", out var ids)
                    && ids.Count == 1 && InboundDraftValidation.Ansi(ids[0], 50));
                documentId = context.Request.Query["documentId"].ToString();
            }
            else
            {
                Require(context.Request.Query.Count == 0);
                var bytes = await ReadBody(context, sessionFence.ResolveAsync);
                command = ParseCommand(bytes, route);
                documentId = command.DocumentId!;
            }
            var before = await Authorize(context, sessionFence, documentId);
            var service = context.RequestServices.GetService<IInboundDraftCommandService>();
            if (before.Authority is not null) MatchScope(suppliedScope, before.Scope);
            if (before.Authority is null || !before.Access.Available || service is null)
                return Json(route is null
                    ? (object)new InboundDraftWorkspace(before.Scope, Closed, new(InboundDraftOutcome.Unavailable))
                    : new InboundDraftCommandResponse(before.Scope, new(InboundDraftOutcome.Unavailable)));
            if (!before.Access.CanRead || route is not null && route != "reconcile" &&
                (command!.Action == InboundDraftAction.Save ? !before.Access.CanSave : !before.Access.CanSend))
                return Json(route is null
                    ? (object)new InboundDraftWorkspace(before.Scope, before.Access, new(InboundDraftOutcome.Denied))
                    : new InboundDraftCommandResponse(before.Scope, new(InboundDraftOutcome.Denied)));
            if (command?.Header is { } header)
                Require(header.BranchId == before.Authority.BranchId, 403, "inbound_branch_denied");

            // No body/CSRF await exists between this current grant and the I15
            // call. I15 itself retains its transaction/live-authority checks.
            if (route is null)
            {
                var read = await service.ReadAsync(documentId, context.RequestAborted);
                var after = await Authorize(context, sessionFence, documentId);
                SameGate(before, after);
                Require(Enum.IsDefined(read.Outcome), 503, "inbound_read_unavailable");
                if (read.Outcome == InboundDraftOutcome.Observed)
                {
                    var view = read.Document;
                    Require(view is not null && view.DocumentId == documentId
                        && view.Header.BranchId == after.Authority!.BranchId
                        && view.Details.Count <= InboundDraftValidation.MaximumDetails
                        && view.Details.All(r => r.RowId is not null && r.ClientLineId is null)
                        && view.Details.Select(r => r.RowId).Distinct(StringComparer.Ordinal).Count() == view.Details.Count
                        && !view.CostEditingSupported && InboundDraftValidation.StateToken(view.StateEqualityToken),
                        503, "inbound_read_unavailable");
                }
                else Require(read.Document is null, 503, "inbound_read_unavailable");
                return Json(new InboundDraftWorkspace(after.Scope, after.Access, read));
            }

            // Reconcile needs the current full-read/Update grant, not admission to a
            // NEW Send. I15 still verifies the ORIGINAL action and live branch.
            // Original I15 DTO, unchanged. In particular reconciliation NEVER
            // calls ExecuteAsync, ReadAsync, an allocator, or a substitute lookup.
            var result = route == "reconcile"
                ? await service.ReconcileAsync(command!, context.RequestAborted)
                : await service.ExecuteAsync(command!, context.RequestAborted);
            var final = await Authorize(context, sessionFence, documentId);
            SameGate(before, final);
            Require(Enum.IsDefined(result.Outcome), 503, "inbound_result_unavailable");
            if (result.Outcome is InboundDraftOutcome.Committed or InboundDraftOutcome.Replayed)
            {
                var receipt = result.Receipt;
                Require(receipt is not null && receipt.OperationId == command!.OperationId
                    && receipt.DocumentId == documentId && receipt.AuditId != Guid.Empty
                    && InboundDraftValidation.StateToken(receipt.StateEqualityToken)
                    && receipt.CommittedAtUtc.Kind == DateTimeKind.Utc
                    && (command.Action == InboundDraftAction.SendToWarehouse ? receipt.StatusId == 2 : receipt.StatusId is 0 or 1),
                    503, "inbound_result_unavailable");
            }
            else Require(result.Receipt is null, 503, "inbound_result_unavailable");
            return Json(new InboundDraftCommandResponse(final.Scope, result));
        }
        catch (AntiforgeryValidationException) { return Problem(403, "csrf_invalid"); }
        catch (BoundaryFailure failure) { return Problem(failure.Status, failure.Code); }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { throw; }
        catch (Exception) { return Problem(503, "inbound_unavailable"); }
        // After a possible dispatch even a 401/403/503 is NOT proof of rollback.
        // The FE keeps the original command until a valid matching receipt.
    }

    private static IResult Json(object value) => Results.Json(value, Wire);
    private static IResult Problem(int status, string code) => Results.Problem(statusCode: status,
        title: "Inbound request unavailable.", extensions: new Dictionary<string, object?> { ["code"] = code });

    private static void Origin(HttpContext context, bool post)
    {
        var request = context.Request;
        Require(request.IsHttps, 400, "https_required");
        var origins = request.Headers.Origin;
        var sites = request.Headers["Sec-Fetch-Site"];
        Require(sites.Count == 0 || sites.Count == 1 && sites[0] == "same-origin", 403, "same_origin_required");
        if (origins.Count != 0)
        {
            Require(origins.Count == 1 && Uri.TryCreate(origins[0], UriKind.Absolute, out _), 403, "same_origin_required");
            var origin = new Uri(origins[0]!, UriKind.Absolute);
            Require(origin.Scheme == "https" && origin.UserInfo.Length == 0 && origin.AbsolutePath == "/"
                && origin.Query.Length == 0 && origin.Fragment.Length == 0
                && string.Equals(origin.Authority, request.Host.Value, StringComparison.OrdinalIgnoreCase),
                403, "same_origin_required");
        }
        // Browser GET fetches often omit Origin. The parent's same-origin BFF
        // must forward validated fetch metadata or a validated canonical Origin.
        Require(origins.Count == 1 || !post && sites.Count == 1, 403, "same_origin_required");
    }
    private static string? ReadScope(HttpContext context, bool required)
    {
        var values = context.Request.Headers[ScopeHeader];
        if (!required && values.Count == 0) return null; // first full read only
        Require(values.Count == 1 && values[0] is { Length: 64 } value
            && value.All(c => c is >= 'a' and <= 'f' or >= '0' and <= '9'), 409, "inbound_scope_mismatch");
        return values[0];
    }
    private static void MatchScope(string? supplied, string? actual)
    {
        if (supplied is null) return;
        Require(actual is not null && CryptographicOperations.FixedTimeEquals(Utf8.GetBytes(supplied), Utf8.GetBytes(actual)),
            409, "inbound_scope_mismatch");
    }
    private static bool SameIdentity(ResolvedSession a, ResolvedSession b) => a.Token == b.Token
        && a.Identity.PrincipalId == b.Identity.PrincipalId && a.Identity.TenantId == b.Identity.TenantId
        && a.Identity.CompanyId == b.Identity.CompanyId && a.Identity.CredentialStamp == b.Identity.CredentialStamp;
    private static bool SameRights(ResolvedSession a, ResolvedSession b) => SameIdentity(a, b)
        && a.Identity.Capabilities.SequenceEqual(b.Identity.Capabilities, StringComparer.Ordinal)
        && (a.Identity.BranchIds ?? []).SequenceEqual(b.Identity.BranchIds ?? [], StringComparer.Ordinal);

    // AuthorityVersion is an observation sequence, not a stable rights revision:
    // LegacyIdentityAuthority legitimately advances it on every ResolveAsync.
    // Bind the entire HTTP invocation to frozen identity/rights, while checking
    // every observation against the LAST accepted version (e.g. 1 -> 5 -> 4
    // must fail). Never rewrite a returned version or share this tracker.
    private sealed class SessionFence(HttpContext context, IWebSessions sessions, string token)
    {
        private ResolvedSession? baseline;
        private long lastAcceptedVersion;

        public async Task<ResolvedSession> ResolveAsync()
        {
            context.RequestAborted.ThrowIfCancellationRequested();
            var value = await sessions.ResolveAsync(token, false, context.RequestAborted);
            context.RequestAborted.ThrowIfCancellationRequested();
            Require(value is not null && value.Token == token && value.Identity.AuthorityVersion > 0
                && !string.IsNullOrWhiteSpace(value.Identity.PrincipalId)
                && !string.IsNullOrWhiteSpace(value.Identity.TenantId)
                && !string.IsNullOrWhiteSpace(value.Identity.CompanyId)
                && !string.IsNullOrWhiteSpace(value.Identity.CredentialStamp)
                && value.Identity.Capabilities is { Count: <= 256 }
                && value.Identity.Capabilities.All(capability => !string.IsNullOrWhiteSpace(capability) && capability.Length <= 100)
                && (value.Identity.BranchIds is null || value.Identity.BranchIds.Count <= 200
                    && value.Identity.BranchIds.All(branch => !string.IsNullOrWhiteSpace(branch) && branch.Length <= 50)),
                401, "authentication_required");
            // Copy before comparing: a provider-owned collection must not be
            // able to alter an earlier gate or the invocation's first snapshot.
            var current = value! with { Identity = value.Identity with
            {
                Capabilities = Array.AsReadOnly(value.Identity.Capabilities.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray()),
                BranchIds = Array.AsReadOnly((value.Identity.BranchIds ?? []).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray())
            } };
            if (baseline is not null)
            {
                Require(SameIdentity(baseline, current), 401, "session_changed");
                Require(current.Identity.AuthorityVersion >= lastAcceptedVersion && SameRights(baseline, current),
                    403, "inbound_authority_changed");
            }
            else baseline = current;
            lastAcceptedVersion = current.Identity.AuthorityVersion;
            return current;
        }
    }

    private static async Task<Gate> Authorize(HttpContext c, SessionFence sessionFence, string documentId)
    {
        var start = await sessionFence.ResolveAsync();
        var provider = c.RequestServices.GetService<IInboundDraftCommandAccess>();
        var grant = provider is null ? null : await provider.ResolveAsync(start, documentId, c.RequestAborted);
        var end = await sessionFence.ResolveAsync();
        Require(SameRights(start, end), 403, "inbound_authority_changed");
        if (grant is null) return new(end, null, null, Closed);
        Require(grant.DatabaseBindingId != Guid.Empty && grant.DocumentId == documentId
            && InboundDraftValidation.Ansi(grant.BranchId, 50)
            && end.Identity.BranchIds?.Contains(grant.BranchId, StringComparer.Ordinal) == true,
            403, "inbound_branch_denied");
        var scope = Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[]
        {
            "medcom-inbound-scope-v1", grant.DatabaseBindingId.ToString("D"), end.Identity.TenantId,
            end.Identity.CompanyId, end.Identity.PrincipalId, end.Token
        })));
        var available = grant.Available && c.RequestServices.GetService<IInboundDraftCommandService>()
            is not (null or UnavailableInboundDraftCommandService);
        return new(end, grant, scope, new(grant.UpdateGranted && available, grant.UpdateGranted && available,
            grant.UpdateGranted && grant.SendGranted && available, available, MaximumBodyBytes));
    }
    private static void SameGate(Gate before, Gate after)
    {
        Require(SameRights(before.Session, after.Session) && before.Scope == after.Scope
            && before.Authority == after.Authority && before.Access == after.Access,
            403, "inbound_authority_changed");
    }

    private static async Task<byte[]> ReadBody(HttpContext c, Func<Task<ResolvedSession>> revalidate)
    {
        var media = c.Request.ContentType?.Split(';', StringSplitOptions.TrimEntries);
        Require(media is { Length: > 0 } && media[0].Equals("application/json", StringComparison.OrdinalIgnoreCase)
            && media.Skip(1).All(p => p.Equals("charset=utf-8", StringComparison.OrdinalIgnoreCase)), 415, "json_utf8_required");
        Require(c.Request.Headers.ContentEncoding.Count == 0, 415, "content_encoding_unsupported");
        Require(c.Request.ContentLength is null or <= MaximumBodyBytes, 413, "inbound_body_too_large");
        using var buffer = new MemoryStream();
        var chunk = ArrayPool<byte>.Shared.Rent(16_384);
        try
        {
            while (true)
            {
                // Read at most limit+1 even when Content-Length is missing/false.
                var count = await c.Request.Body.ReadAsync(chunk.AsMemory(0,
                    (int)Math.Min(chunk.Length, MaximumBodyBytes + 1L - buffer.Length)), c.RequestAborted);
                await revalidate();
                if (count == 0) break;
                Require(buffer.Length + count <= MaximumBodyBytes, 413, "inbound_body_too_large");
                buffer.Write(chunk, 0, count);
            }
            Require(buffer.Length > 0);
            return buffer.ToArray();
        }
        finally { ArrayPool<byte>.Shared.Return(chunk, clearArray: true); }
    }

    // Wire checks are additional to, not replacements for, I15 validation.
    // They reject coercion/duplicate members before System.Text.Json can fold
    // an enum number, invalid UTF-8, an offset timestamp or a rounded decimal.
    private static InboundDraftCommand ParseCommand(byte[] bytes, string route)
    {
        try
        {
            _ = Utf8.GetString(bytes); // fatal decoder; no replacement characters
            using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 24 });
            var root = document.RootElement;
            Unique(root);
            Shape(root, ["operationId", "action", "documentId", "expectedStateEqualityToken", "header",
                "detailUpserts", "removedDetailIds", "costChanges", "note"],
                ["operationId", "action", "documentId", "expectedStateEqualityToken", "header"]);
            var action = root.GetProperty("action");
            Require(action.ValueKind == JsonValueKind.String && action.GetString() is "Save" or "SendToWarehouse");
            Require(route == "reconcile" || route == "save" && action.GetString() == "Save"
                || route == "send-to-warehouse" && action.GetString() == "SendToWarehouse");
            if (root.GetProperty("header") is { ValueKind: not JsonValueKind.Null } header)
            {
                Shape(header, ["documentDate", "orderNumber", "invoiceNo", "departurePoint", "destinationPoint", "orderTypeId",
                    "branchId", "objectId", "currencyId", "rateExchange", "notes"],
                    ["documentDate", "orderNumber", "invoiceNo", "departurePoint", "destinationPoint", "orderTypeId", "branchId"]);
                Date(header.GetProperty("documentDate"), false);
                DecimalProperty(header, "rateExchange", 28, 10);
            }
            if (root.TryGetProperty("detailUpserts", out var details) && details.ValueKind != JsonValueKind.Null)
            {
                Require(details.ValueKind == JsonValueKind.Array && details.GetArrayLength() <= 500);
                foreach (var row in details.EnumerateArray())
                {
                    Shape(row, ["rowId", "clientLineId", "itemId", "lotNumberByDocument", "setQuantityByDocument",
                        "barrelQuantityByDocument", "expireDateByDocument", "unitPrice"], ["itemId"]);
                    DecimalProperty(row, "setQuantityByDocument", 18, 0);
                    DecimalProperty(row, "barrelQuantityByDocument", 18, 0);
                    DecimalProperty(row, "unitPrice", 18, 0);
                    if (row.TryGetProperty("expireDateByDocument", out var date)) Date(date, true);
                }
            }
            if (root.TryGetProperty("costChanges", out var costs) && costs.ValueKind != JsonValueKind.Null)
                Require(costs.ValueKind == JsonValueKind.Array && costs.GetArrayLength() == 0, 400, "unsupported_cost_edits");
            if (root.TryGetProperty("removedDetailIds", out var removed) && removed.ValueKind != JsonValueKind.Null)
                Require(removed.ValueKind == JsonValueKind.Array && removed.GetArrayLength() <= 500);
            var value = JsonSerializer.Deserialize<InboundDraftCommand>(bytes, Wire);
            Require(value is not null && value.Action != InboundDraftAction.Create && InboundDraftValidation.Check(value) is null);
            return value!;
        }
        catch (Exception e) when (e is JsonException or DecoderFallbackException or FormatException or InvalidOperationException)
        { throw new BoundaryFailure(400, "invalid_inbound_json"); }
    }
    private static void Shape(JsonElement value, string[] allowed, string[] required)
    {
        Require(value.ValueKind == JsonValueKind.Object);
        Require(value.EnumerateObject().All(p => allowed.Contains(p.Name, StringComparer.Ordinal))
            && required.All(name => value.TryGetProperty(name, out _)));
    }
    private static void Unique(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject())
            {
                Require(names.Add(property.Name) && InboundDraftValidation.Text(property.Name, 128, true));
                Unique(property.Value);
            }
        }
        else if (value.ValueKind == JsonValueKind.Array) foreach (var item in value.EnumerateArray()) Unique(item);
        else if (value.ValueKind == JsonValueKind.String)
            Require(InboundDraftValidation.Text(value.GetString(), MaximumBodyBytes, true));
    }
    private static void DecimalProperty(JsonElement owner, string name, int precision, int scale)
    {
        if (!owner.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null) return;
        Require(value.ValueKind == JsonValueKind.String);
        var text = value.GetString()!;
        Require(text.Length <= 128 && Regex.IsMatch(text, @"^-?[0-9]+(?:\.[0-9]+)?$", RegexOptions.CultureInvariant));
        var parts = text.TrimStart('-').Split('.');
        Require(parts[0].TrimStart('0').Length <= precision - scale
            && (parts.Length == 1 || parts[1].TrimEnd('0').Length <= scale)
            && decimal.TryParse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                CultureInfo.InvariantCulture, out var number) && InboundDraftValidation.Number(number, precision, scale));
    }
    private static void Date(JsonElement value, bool nullable)
    {
        if (nullable && value.ValueKind == JsonValueKind.Null) return;
        Require(value.ValueKind == JsonValueKind.String);
        var text = value.GetString()!;
        Require(Regex.IsMatch(text, @"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,7})?$", RegexOptions.CultureInvariant)
            && DateTime.TryParseExact(text, ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF"],
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
            && date.Kind == DateTimeKind.Unspecified && InboundDraftValidation.Date(date));
    }
}
