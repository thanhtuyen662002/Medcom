using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;
using Medcom.Contracts;

namespace Medcom.Api;

// A response-only projection. Domain objects, command bodies and equality/replay
// inputs keep their existing types and bytes. Never deduplicate equal values:
// two business columns may legitimately contain the same value.
internal static class CanonicalResponseProjection
{
    internal const string Version = "3";
    internal static bool Applies(string path) => !path.EndsWith("/screen", StringComparison.Ordinal)
        && !path.EndsWith("-contract", StringComparison.Ordinal);

    internal static string RecordAlias(string path)
    {
        var module = FeDisplayProjection.Module(path);
        if (module is not null)
        {
            var metadata = ErpScreenCatalog.Metadata(module);
            if (metadata.TryGetProperty("headerKey", out var key))
                return ErpScreenCatalog.Get(module)!.Fields["header"].Single(f => f.Column == key.GetString()).Name;
        }
        return path.Contains("/purchase-requests", StringComparison.Ordinal) ? "purchaseRequestId" : "documentId";
    }
    internal static JsonNode Normalize(JsonNode value, string path, string[]? choiceAliases = null)
    {
        var result = value.DeepClone();
        if (path.EndsWith("/screen", StringComparison.Ordinal) && result["data"]?["fields"] is JsonObject definitions)
        {
            var alias = RecordAlias(path);
            foreach (var section in definitions)
            {
                var members = section.Value!.AsArray().OfType<JsonObject>().ToArray();
                var separateDocument = members.Any(field => field["name"]!.GetValue<string>() == "documentId");
                foreach (var field in members)
                {
                    var name = field["name"]!.GetValue<string>();
                    var canonical = name == "userAutoId" ? "lineId" : name == "isLock" ? "isLocked"
                        : name == alias && (alias == "purchaseRequestId" || !separateDocument) ? "documentId" : name;
                    // Read-only identities change their public response name;
                    // accepted writable command field names do not change.
                    if (canonical != name && !field["writable"]!.GetValue<bool>()) field["name"] = canonical;
                }
            }
        }
        if (!Applies(path)) return result;
        Walk(result, RecordAlias(path), path.EndsWith("/contract-info", StringComparison.Ordinal), choiceAliases ?? []);
        return result;
    }

    private static void Walk(JsonNode? node, string recordAlias, bool contractInfo, string[] choiceAliases)
    {
        if (node is JsonArray array)
        {
            foreach (var child in array) Walk(child, recordAlias, contractInfo, choiceAliases);
            return;
        }
        if (node is not JsonObject row) return;
        var choice = row.ContainsKey("id") && row.ContainsKey("label");

        // Strict input snapshots previously had a second enriched copy. The
        // enriched response is now the only copy; inputs remain strict server-side.
        foreach (var pair in row.ToArray().Where(p => p.Key.EndsWith("DisplayData", StringComparison.Ordinal)))
        {
            var original = pair.Key[..^"DisplayData".Length];
            row[original] = pair.Value?.DeepClone();
            row.Remove(pair.Key);
        }

        if (row["sourceFields"] is JsonObject source && row["document"] is JsonObject document)
        {
            if (source["header"] is JsonObject header) document["header"] = header.DeepClone();
            document.Remove("headerDisplayData");
            document.Remove("linesDisplayData");
            if (source["lines"] is JsonArray lines)
            {
                // Physical row identities already come from the same authorized
                // source read. No positional merge with a writable snapshot.
                document["lines"] = lines.DeepClone();
            }
            row.Remove("sourceFields");
            if (row.ContainsKey("statusName") && document["header"] is JsonObject fullHeader)
            {
                if (fullHeader["statusName"] is null) fullHeader["statusName"] = row["statusName"]?.DeepClone();
                row.Remove("statusName");
            }
        }

        if (contractInfo && row["fields"] is JsonObject contractFields && row.ContainsKey("contractId"))
        {
            // Parent document and contract are different entities. Their IDs
            // must not collide when the contract source also has DocumentID.
            var contract = contractFields.DeepClone().AsObject();
            if (Find(contract, "documentId") is {} contractKey)
            {
                if (contractKey != "documentId")
                {
                    contract["documentId"] = contract[contractKey]?.DeepClone();
                    contract.Remove(contractKey);
                }
            }
            else contract["documentId"] = row["contractId"]?.DeepClone();
            row["contract"] = contract;
            row.Remove("fields");
            RemoveGroup(row, "contractId");
        }
        else if (row["fields"] is JsonObject fields
            && (Has(row, "lineId") || Has(row, "documentId") || row.ContainsKey("id")))
        {
            var full = fields.DeepClone().AsObject();
            row.Remove("fields");
            MergeFull(row, full);
        }

        foreach (var headerName in new[] { "purchaseOrderHeader", "inboundRequestHeader" })
            if (row[headerName] is JsonObject legacyHeader)
            {
                var full = legacyHeader.DeepClone().AsObject();
                row.Remove(headerName);
                MergeFull(row, full);
            }

        if (row["values"] is JsonObject values && (Has(row, "lineId") || row.ContainsKey("clientLineKey")))
        {
            var full = values.DeepClone().AsObject();
            row.Remove("values");
            MergeFull(row, full);
        }

        // A document's identity/status/branch belongs to its one header. Paging,
        // state tokens, actions and receipts stay in their own owning objects.
        if (row["header"] is JsonObject ownedHeader)
        {
            if (recordAlias != "documentId" && !Has(ownedHeader, "documentId")) Alias(ownedHeader, recordAlias, "documentId");
            foreach (var field in new[] { "documentId", "purchaseRequestId", "branchId", "statusId", "statusName", "isLocked" })
                MoveGroup(row, ownedHeader, field);
            if (row.Count == 1 && row.ContainsKey("header"))
            {
                var full = ownedHeader.DeepClone().AsObject();
                row.Remove("header");
                MergeFull(row, full);
            }
        }

        // Explicit aliases only. A quantity equal to a price is not an alias.
        if (!choice)
        {
            if (!contractInfo || Has(row, "lineId")) Alias(row, "userAutoId", "lineId");
            // Batch history can contain both its own DocumentID and BatchID.
            // Those are distinct source columns, even when their values match.
            if (recordAlias != "documentId" && (recordAlias == "purchaseRequestId" || !Has(row, "documentId")))
                Alias(row, recordAlias, "documentId");
        }
        Alias(row, "isLock", "isLocked");
        if (row.ContainsKey("id") && row.ContainsKey("label"))
        {
            if (row.ContainsKey("currencyName"))
            {
                row["name"] = row["currencyName"]?.DeepClone();
                row.Remove("currencyName");
            }
            if (row["name"] is null) row["name"] = row["label"]?.DeepClone();
            row.Remove("label");
            foreach (var alias in choiceAliases)
                if (!alias.Equals("id", StringComparison.OrdinalIgnoreCase) && !alias.Equals("name", StringComparison.OrdinalIgnoreCase))
                    RemoveGroup(row, alias);
        }
        foreach (var child in row.ToArray()) Walk(child.Value, recordAlias, contractInfo, choiceAliases);
        if (row.ContainsKey("itemDisplayContext"))
        {
            if (row["itemDisplayContext"] is JsonObject presentation && presentation["lines"] is JsonArray displayLines)
            {
                var owner = row["document"] as JsonObject ?? row;
                var lines = owner["lines"] as JsonArray ?? owner["details"] as JsonArray
                    ?? row["purchaseOrderLines"] as JsonArray;
                if (lines is { Count: 0 }) lines = row["inboundRequestLines"] as JsonArray ?? lines;
                foreach (var line in lines?.OfType<JsonObject>() ?? [])
                {
                    var identity = line["lineId"] ?? line["rowId"];
                    var display = displayLines.OfType<JsonObject>().SingleOrDefault(item => JsonNode.DeepEquals(item["lineId"], identity));
                    if (display is null) continue;
                    foreach (var name in new[] { "manufacturerItemCode", "manufacturerCodeSource" })
                        line[name] = display[name]?.DeepClone();
                    foreach (var name in new[] { "itemName", "unit" })
                        if (line[name] is null) line[name] = display[name]?.DeepClone();
                }
            }
            row.Remove("itemDisplayContext");
        }
    }

    private static bool Has(JsonObject row, string key) => Find(row, key) is not null;
    private static string? Find(JsonObject row, string key) => row.Select(p => p.Key)
        .FirstOrDefault(name => name.Equals(key, StringComparison.OrdinalIgnoreCase));
    private static void MergeFull(JsonObject row, JsonObject full)
    {
        foreach (var pair in full)
        {
            var existing = Find(row, pair.Key);
            if (existing is not null && row[existing] is not null && pair.Value is null
                && pair.Key.EndsWith("Name", StringComparison.OrdinalIgnoreCase)) continue;
            if (existing is not null && existing != pair.Key) row.Remove(existing);
            row[pair.Key] = pair.Value?.DeepClone();
        }
    }
    private static void MoveGroup(JsonObject source, JsonObject target, string field)
    {
        foreach (var name in Group(field))
        {
            var key = Find(source, name);
            if (key is null) continue;
            var targetKey = Find(target, name);
            if (targetKey is null || target[targetKey] is null) target[targetKey ?? name] = source[key]?.DeepClone();
            source.Remove(key);
        }
    }
    private static void RemoveGroup(JsonObject row, string field)
    {
        foreach (var name in Group(field)) if (Find(row, name) is {} key) row.Remove(key);
    }
    private static string[] Group(string field) => FeDisplayProjection.IsStatusId(field)
        ? [field,FeDisplayProjection.NameField(field),FeDisplayProjection.StateField(field),field[..^2]+"ForeColor",field[..^2]+"BackColor"] : FeDisplayProjection.IsId(field)
        ? [field, FeDisplayProjection.NameField(field), FeDisplayProjection.StateField(field)] : [field];
    private static void Alias(JsonObject row, string from, string to)
    {
        var fromNames = Group(from); var toNames = Group(to);
        for (var i = 0; i < fromNames.Length; i++)
        {
            var key = Find(row, fromNames[i]);
            if (key is null) continue;
            var destination = Find(row, toNames[i]);
            if (destination is null || row[destination] is null) row[destination ?? toNames[i]] = row[key]?.DeepClone();
            row.Remove(key);
        }
    }
}

internal sealed class CanonicalResponseFilter(IOptions<Microsoft.AspNetCore.Http.Json.JsonOptions> options) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext invocation, EndpointFilterDelegate next)
    {
        var result = await next(invocation);
        if (result is not IValueHttpResult { Value: { } value }
            || result is IStatusCodeHttpResult { StatusCode: { } status } && status != 200) return result;
        var node = value is JsonNode json ? json : JsonSerializer.SerializeToNode(value, value.GetType(), options.Value.SerializerOptions);
        if (node is null) return result;
        var context = invocation.HttpContext;
        var aliases = context.Items["Medcom.CanonicalChoiceAliases"] as string[];
        var normalized = CanonicalResponseProjection.Normalize(node, context.Request.Path.Value ?? "", aliases);
        context.Response.Headers["X-Medcom-Response-Contract"] = CanonicalResponseProjection.Version;
        return Results.Json(normalized, options.Value.SerializerOptions);
    }
}
