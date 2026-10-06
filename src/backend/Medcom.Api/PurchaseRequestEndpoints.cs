using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;

namespace Medcom.Api;

public static class PurchaseRequestEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapGet("/api/purchase-requests/workspace", async (HttpContext context, IPurchaseRequestQueries queries) =>
        {
            if (!CanRead(context)) return Denied();
            if (!Fields(context)) return Invalid();
            var result = await queries.WorkspaceAsync(context.RequestAborted);
            if (result.Outcome != PurchaseRequestQueryOutcome.Success || result.Value is null) return Response(context, result);
            return Response(context, result with { Value = result.Value with
                { WriteAvailable = false, WriteReason = PurchaseRequestQueryRules.WriteReason } });
        });
        app.MapGet("/api/purchase-requests", async (HttpContext context, IPurchaseRequestQueries queries) =>
        {
            if (!CanRead(context)) return Denied();
            if (!Fields(context, "page", "pageSize", "search", "branchId")
                || !Number(context, "page", 1, out var page) || !Number(context, "pageSize", 20, out var size)) return Invalid();
            var query = new PurchaseRequestListQuery(page, size, context.Request.Query["search"], context.Request.Query["branchId"]);
            if (!PurchaseRequestQueryRules.List(query)) return Invalid();
            if (!string.IsNullOrEmpty(query.BranchId)
                && AuthEndpoints.Current(context).Identity.BranchIds?.Contains(query.BranchId, StringComparer.Ordinal) != true) return Denied();
            return Response(context, await queries.ListAsync(query, context.RequestAborted));
        });
        app.MapGet("/api/purchase-requests/detail", async (HttpContext context, IPurchaseRequestQueries queries, IPurchaseRequestCommandAccess access, IWebSessions sessions) =>
        {
            if (!CanRead(context)) return Denied();
            if (!Fields(context, "documentId") || !PurchaseRequestCommandRules.Identifier(context.Request.Query["documentId"], 50)) return Invalid();
            var result = await queries.OpenAsync(context.Request.Query["documentId"].ToString(), context.RequestAborted);
            if (result.Outcome != PurchaseRequestQueryOutcome.Success || result.Value is null) return Response(context, result);
            var original = AuthEndpoints.Current(context);
            var live = await Live(context, sessions, original, result.Value.Document.BranchId);
            if (live is null) return Denied();
            PurchaseRequestCommandAccessState grant;
            try { grant = await access.ResolveAsync(live, result.Value.Document.PurchaseRequestId, result.Value.Document.BranchId, context.RequestAborted); }
            catch (Exception) when (!context.RequestAborted.IsCancellationRequested)
            { grant = UnavailablePurchaseRequestCommandAccess.State; }
            if (await Live(context, sessions, live, result.Value.Document.BranchId) is null) return Denied();
            if (grant.CanAddLines) grant = UnavailablePurchaseRequestCommandAccess.State;
            if (result.Value.Document.StatusId != 1 || result.Value.Document.IsLocked is true)
                grant = grant with { CanSave = false, CanSubmit = false };
            return Response(context, result with { Value = result.Value with { CommandAccess = grant } });
        });
        app.MapGet("/api/purchase-requests/lookup", async (HttpContext context, IPurchaseRequestQueries queries) =>
        {
            if (!CanRead(context)) return Denied();
            var kind = context.Request.Query["kind"].ToString();
            if (!Fields(context, "kind", "search", "page") || !Number(context, "page", 1, out var page)
                || !PurchaseRequestQueryRules.Lookup(kind, context.Request.Query["search"], page)) return Invalid();
            return Response(context, await queries.LookupAsync(kind, context.Request.Query["search"], page, context.RequestAborted));
        });
        app.MapPost("/api/purchase-requests/save", (HttpContext context, IPurchaseRequestCommands commands,
            IPurchaseRequestCommandAccess access, IWebSessions sessions) => Command(context, commands, access, sessions, true, false));
        app.MapPost("/api/purchase-requests/submit", (HttpContext context, IPurchaseRequestCommands commands,
            IPurchaseRequestCommandAccess access, IWebSessions sessions) => Command(context, commands, access, sessions, false, false));
        app.MapPost("/api/purchase-requests/save/lookup", (HttpContext context, IPurchaseRequestCommands commands,
            IPurchaseRequestCommandAccess access, IWebSessions sessions) => Command(context, commands, access, sessions, true, true));
        app.MapPost("/api/purchase-requests/submit/lookup", (HttpContext context, IPurchaseRequestCommands commands,
            IPurchaseRequestCommandAccess access, IWebSessions sessions) => Command(context, commands, access, sessions, false, true));
    }


    private const int CommandBodyLimit = 1_048_576;
    private static readonly JsonSerializerOptions CommandJson = new(PurchaseRequestCommandRules.Json)
    {
        PropertyNameCaseInsensitive = false,
        NumberHandling = JsonNumberHandling.Strict
    };

    private static async Task<IResult> Command(HttpContext context, IPurchaseRequestCommands commands,
        IPurchaseRequestCommandAccess access, IWebSessions sessions, bool save, bool lookup)
    {
        // Authentication + CSRF are enforced by ApiHost for ALL four POST endpoints.
        if (!context.Request.IsHttps || context.Request.Headers.Origin.Count != 1
            || context.Request.Headers.Origin.ToString() != $"{context.Request.Scheme}://{context.Request.Host}")
            return CommandProblem(403, "origin_rejected");
        if (!Fields(context)) return Invalid();
        if (context.Request.Headers["X-Purchase-Scope"].Count != 1
            || context.Request.Headers["X-Purchase-Scope"].ToString() != Scope(context))
            return CommandProblem(409, "purchase_scope_changed");
        var contentType = context.Request.ContentType ?? "";
        if (!contentType.Equals("application/json", StringComparison.OrdinalIgnoreCase)
            && !contentType.Equals("application/json; charset=utf-8", StringComparison.OrdinalIgnoreCase))
            return CommandProblem(415, "json_required");

        SavePurchaseRequestDraft? saving = null;
        SubmitPurchaseRequest? submitting = null;
        try
        {
            var bytes = await ReadCommandBytes(context);
            // Decode strictly BEFORE parsing: invalid UTF-8 must never become replacement characters.
            var text = new UTF8Encoding(false, true).GetString(bytes);
            using var json = JsonDocument.Parse(text);
            if (save)
            {
                saving = json.RootElement.Deserialize<SavePurchaseRequestDraft>(CommandJson);
                if (saving is null || !ExactShape(json.RootElement, JsonSerializer.SerializeToElement(saving, CommandJson))) return Invalid();
                var validated = PurchaseRequestCommandRules.Freeze(saving);
                if (validated.LineChanges.Any(change => change.Kind == PurchaseRequestLineChangeKind.Add))
                    return CommandProblem(400, "purchase_add_unavailable");
            }
            else
            {
                submitting = json.RootElement.Deserialize<SubmitPurchaseRequest>(CommandJson);
                if (submitting is null || !ExactShape(json.RootElement, JsonSerializer.SerializeToElement(submitting, CommandJson))) return Invalid();
                _ = PurchaseRequestCommandRules.Freeze(submitting);
            }
        }
        catch (Exception exception) when (exception is JsonException or ArgumentException)
        { return CommandProblem(400, "invalid_purchase_command"); }

        var documentId = save ? saving!.PurchaseRequestId : submitting!.PurchaseRequestId;
        var branchId = save ? saving!.BranchId : submitting!.BranchId;
        var first = await Live(context, sessions, AuthEndpoints.Current(context), branchId);
        if (first is null) return Denied();
        var grant = await access.ResolveAsync(first, documentId, branchId, context.RequestAborted);
        bool Permitted(PurchaseRequestCommandAccessState state) => !state.CanAddLines
            && (lookup ? state.CanLookup : save ? state.CanSave : state.CanSubmit);
        if (!Permitted(grant)) return CommandProblem(503, "purchase_command_unavailable");
        if (await Live(context, sessions, first, branchId) is null) return Denied();

        // Pass the deserialized ORIGINAL DTO unchanged. Lookup calls only the matching
        // merged I19 LookupAsync overload, never SaveAsync/SubmitAsync or a fresh form.
        PurchaseRequestCommandResult? executed = null;
        PurchaseRequestLookupResult? observed = null;
        if (lookup) observed = save
            ? await commands.LookupAsync(saving!, context.RequestAborted)
            : await commands.LookupAsync(submitting!, context.RequestAborted);
        else executed = save
            ? await commands.SaveAsync(saving!, context.RequestAborted)
            : await commands.SubmitAsync(submitting!, context.RequestAborted);

        var last = await Live(context, sessions, first, branchId);
        if (last is null) return Denied();
        if (!Permitted(await access.ResolveAsync(last, documentId, branchId, context.RequestAborted))) return Denied();
        if (await Live(context, sessions, last, branchId) is null) return Denied();
        context.RequestAborted.ThrowIfCancellationRequested();
        var receipt = lookup ? observed?.Receipt : executed?.Receipt;
        var success = lookup ? observed?.Outcome == PurchaseRequestLookupOutcome.Committed
            : executed?.Outcome is PurchaseRequestCommandOutcome.Committed or PurchaseRequestCommandOutcome.Replayed;
        if (success && !ReceiptValid(receipt, saving, submitting))
        {
            if (lookup) observed = new(PurchaseRequestLookupOutcome.Unavailable);
            else executed = new(PurchaseRequestCommandOutcome.OutcomeUnknown);
        }
        // This endpoint pins the actual DTO serializer. Outcome enums are NUMBERS;
        // PurchaseRequestLineChangeKind alone has the string-enum attribute in Contracts.
        return lookup
            ? Results.Json(new PurchaseRequestScopedResponse<PurchaseRequestLookupResult>(Scope(context),
                success ? observed! : new(observed?.Outcome ?? PurchaseRequestLookupOutcome.Unavailable)), CommandJson)
            : Results.Json(new PurchaseRequestScopedResponse<PurchaseRequestCommandResult>(Scope(context),
                success ? executed! : new(executed?.Outcome ?? PurchaseRequestCommandOutcome.OutcomeUnknown)), CommandJson);
    }

    private static async Task<byte[]> ReadCommandBytes(HttpContext context)
    {
        if (context.Request.ContentLength > CommandBodyLimit) throw new BadHttpRequestException("Body too large.", 413);
        using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        while (true)
        {
            var read = await context.Request.Body.ReadAsync(chunk.AsMemory(), context.RequestAborted);
            if (read == 0) break;
            if (buffer.Length + read > CommandBodyLimit) throw new BadHttpRequestException("Body too large.", 413);
            buffer.Write(chunk, 0, read);
        }
        if (context.Request.ContentLength is {} length && length != buffer.Length)
            throw new BadHttpRequestException("Body length mismatch.", 400);
        return buffer.ToArray();
    }

    private static bool ExactShape(JsonElement raw, JsonElement typed)
    {
        if (raw.ValueKind != typed.ValueKind) return false;
        if (raw.ValueKind == JsonValueKind.Object)
        {
            var actual = raw.EnumerateObject().ToArray(); var expected = typed.EnumerateObject().ToArray();
            return actual.Length == expected.Length && actual.Select(p => p.Name).Distinct(StringComparer.Ordinal).Count() == actual.Length
                && expected.All(p => raw.TryGetProperty(p.Name, out var value) && ExactShape(value, p.Value));
        }
        return raw.ValueKind != JsonValueKind.Array || raw.GetArrayLength() == typed.GetArrayLength()
            && raw.EnumerateArray().Zip(typed.EnumerateArray(), ExactShape).All(value => value);
    }

    private static async Task<ResolvedSession?> Live(HttpContext context, IWebSessions sessions, ResolvedSession original, string branch)
    {
        var live = await sessions.ResolveAsync(original.Token, false, context.RequestAborted);
        if (live is null || live.Token != original.Token || live.Identity.PrincipalId != original.Identity.PrincipalId
            || live.Identity.TenantId != original.Identity.TenantId || live.Identity.CompanyId != original.Identity.CompanyId
            || live.Identity.CredentialStamp != original.Identity.CredentialStamp
            || !live.Identity.Capabilities.Order(StringComparer.Ordinal).SequenceEqual(original.Identity.Capabilities.Order(StringComparer.Ordinal))
            || !(live.Identity.BranchIds ?? []).Order(StringComparer.Ordinal).SequenceEqual((original.Identity.BranchIds ?? []).Order(StringComparer.Ordinal))
            || live.Identity.BranchIds?.Contains(branch, StringComparer.Ordinal) != true) return null;
        context.Items[AuthEndpoints.ResolvedKey] = live;
        return live;
    }

    private static bool ReceiptValid(PurchaseRequestCommandReceipt? receipt, SavePurchaseRequestDraft? save, SubmitPurchaseRequest? submit)
    {
        try
        {
            if (receipt is null || receipt.Document is null || receipt.Document.Header is null || receipt.Document.Lines is null
                || receipt.AllocatedLines is null || receipt.AllocatedLines.Count != 0) return false;
            var document = receipt.Document;
            if (receipt.ActionId != (save is null ? PurchaseRequestCommandRules.SubmitAction : PurchaseRequestCommandRules.SaveAction)
                || receipt.IdempotencyKey != (save?.IdempotencyKey ?? submit!.IdempotencyKey)
                || document.PurchaseRequestId != (save?.PurchaseRequestId ?? submit!.PurchaseRequestId)
                || document.BranchId != (save?.BranchId ?? submit!.BranchId)
                || document.StatusId != (save is null ? 2 : 1) || (save is null ? document.IsLocked is not true : document.IsLocked is true)
                || receipt.StateToken != PurchaseRequestCommandRules.EqualityToken(document)) return false;
            if (!PurchaseRequestCommandRules.IntentBytes(document).AsSpan().SequenceEqual(
                PurchaseRequestCommandRules.IntentBytes(PurchaseRequestCommandRules.Normalize(document)))) return false;
            if (save is null) return true;
            var frozen = PurchaseRequestCommandRules.Freeze(save);
            if (!PurchaseRequestCommandRules.IntentBytes(frozen.Header).AsSpan().SequenceEqual(PurchaseRequestCommandRules.IntentBytes(document.Header))) return false;
            return frozen.LineChanges.All(change => change.Kind == PurchaseRequestLineChangeKind.Remove
                ? document.Lines.All(line => line.LineId != change.LineId)
                : document.Lines.Any(line => line.LineId == change.LineId && PurchaseRequestCommandRules.IntentBytes(line.Values).AsSpan()
                    .SequenceEqual(PurchaseRequestCommandRules.IntentBytes(change.Values))));
        }
        catch (Exception exception) when (exception is ArgumentException or NullReferenceException or InvalidOperationException)
        { return false; }
    }
    private static IResult CommandProblem(int status, string code) => Results.Problem(statusCode: status,
        title: "Purchase command unavailable or invalid.", extensions: new Dictionary<string, object?> { ["code"] = code });

    private static bool CanRead(HttpContext context) => AuthEndpoints.Current(context).Identity.Capabilities
        .Contains(PurchaseRequestQueryRules.Capability, StringComparer.Ordinal);
    private static bool Fields(HttpContext context, params string[] fields) => context.Request.Query
        .All(pair => fields.Contains(pair.Key, StringComparer.Ordinal) && pair.Value.Count == 1);
    private static bool Number(HttpContext context, string name, int fallback, out int number)
    {
        number = fallback;
        return !context.Request.Query.ContainsKey(name) || int.TryParse(context.Request.Query[name], NumberStyles.None,
            CultureInfo.InvariantCulture, out number);
    }
    private static IResult Invalid() => Results.Problem(statusCode: 400, title: "Invalid purchase request query.", extensions: new Dictionary<string, object?> { ["code"] = "invalid_purchase_query" });
    private static IResult Denied() => Results.Problem(statusCode: 403, title: "Access denied.", extensions: new Dictionary<string, object?> { ["code"] = "forbidden" });
    private static string Scope(HttpContext context)
    {
        // Opaque UI identity, not a bearer token. Stable across authority/choice refreshes.
        var session = AuthEndpoints.Current(context);
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(
            "purchase-request-ui-v1\0" + session.Token + "\0" + session.Identity.PrincipalId
            + "\0" + session.Identity.TenantId + "\0" + session.Identity.CompanyId)));
    }
    private static IResult Response<T>(HttpContext context, PurchaseRequestQueryResult<T> result) => result.Outcome switch
    {
        PurchaseRequestQueryOutcome.Success when result.Value is not null => Results.Ok(new PurchaseRequestScopedResponse<T>(Scope(context), result.Value)),
        PurchaseRequestQueryOutcome.Invalid => Invalid(),
        PurchaseRequestQueryOutcome.Denied => Denied(),
        PurchaseRequestQueryOutcome.NotFound => Results.Problem(statusCode: 404, title: "Document unavailable.", extensions: new Dictionary<string, object?> { ["code"] = "purchase_request_not_found" }),
        _ => Results.Problem(statusCode: 503, title: "Purchase request reads unavailable.", extensions: new Dictionary<string, object?> { ["code"] = "purchase_read_unavailable" })
    };
}
