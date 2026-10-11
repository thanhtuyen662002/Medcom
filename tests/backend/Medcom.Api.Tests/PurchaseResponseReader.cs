using System.Text.Json;
using System.Text.Json.Nodes;
using Medcom.Contracts;

namespace Medcom.Api.Tests;

// Test-only domain comparison adapter. HTTP response is read through the v3
// paths; exact writable DTOs remain strict and reject complete read objects.
internal static class PurchaseResponseReader
{
    internal static T Read<T>(JsonElement wire, JsonSerializerOptions options)
    {
        var copy = JsonNode.Parse(wire.GetRawText())!;
        JsonObject Pick<TInput>(JsonObject source)
        {
            var allowed = typeof(TInput).GetProperties().Select(p => JsonNamingPolicy.CamelCase.ConvertName(p.Name));
            return new JsonObject(allowed.Where(source.ContainsKey).Select(key => new KeyValuePair<string, JsonNode?>(key, source[key]?.DeepClone())));
        }
        void Walk(JsonNode? node)
        {
            if (node is JsonArray array) { foreach (var item in array) Walk(item); return; }
            if (node is not JsonObject obj) return;
            if (obj["header"] is JsonObject header && header.ContainsKey("documentId") && obj["lines"] is JsonArray lines)
            {
                obj["purchaseRequestId"] = header["documentId"]!.DeepClone();
                foreach (var key in new[] { "branchId", "statusId", "isLocked" }) obj[key] = header[key]?.DeepClone();
                obj["header"] = Pick<PurchaseRequestHeaderInput>(header);
                foreach (var line in lines.OfType<JsonObject>())
                {
                    var values = Pick<PurchaseRequestLineValues>(line);
                    var id = line["lineId"]!.DeepClone();
                    line.Clear(); line["lineId"] = id; line["values"] = values;
                }
            }
            foreach (var child in obj.ToArray()) Walk(child.Value);
        }
        Walk(copy);
        return copy.Deserialize<T>(options)!;
    }
}
