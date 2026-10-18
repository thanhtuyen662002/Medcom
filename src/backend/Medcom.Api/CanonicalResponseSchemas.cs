using System.Text.Json.Nodes;

namespace Medcom.Api;

// Compiled response schemas mirror the response projection. Request schemas are
// never rewritten: accepting a response field does not authorize a command field.
internal static class CanonicalResponseSchemas
{
    internal static void Apply(JsonObject paths, JsonObject schemas)
    {
        JsonObject ObjectOf(JsonNode node)
        {
            while (node is JsonObject reference && reference["$ref"] is {} target)
                node = schemas[target.GetValue<string>().Split('/')[^1]]!;
            return node.AsObject().DeepClone().AsObject();
        }
        JsonNode Edit(JsonNode node, Action<JsonObject> edit)
        {
            var copy = ObjectOf(node);
            if (copy["anyOf"] is JsonArray alternatives)
            {
                for (var i = 0; i < alternatives.Count; i++)
                    if (alternatives[i] is JsonObject variant && variant["type"]?.GetValue<string>() != "null")
                        alternatives[i] = Edit(variant, edit);
            }
            else edit(copy);
            return copy;
        }
        JsonNode Transform(JsonNode input, string recordAlias, bool contractInfo)
        {
            var node = input.DeepClone();
            if (node is JsonObject reference && reference["$ref"] is {} target)
            {
                var original = target.GetValue<string>().Split('/')[^1];
                var name = original + "CanonicalV3_" + recordAlias + (contractInfo ? "_contract" : "");
                if (!schemas.ContainsKey(name))
                {
                    schemas[name] = new JsonObject();
                    schemas[name] = Transform(schemas[original]!, recordAlias, contractInfo);
                }
                reference["$ref"] = "#/components/schemas/" + name;
                return reference;
            }
            if (node is JsonArray array)
            {
                for (var i = 0; i < array.Count; i++) if (array[i] is {} child) array[i] = Transform(child, recordAlias, contractInfo);
                return array;
            }
            if (node is not JsonObject shape) return node;
            shape.Remove("x-medcom-exact-input");
            if (shape["properties"] is JsonObject fields)
            {
                var required = (shape["required"] as JsonArray)?.Select(x => x!.GetValue<string>()).ToHashSet(StringComparer.Ordinal) ?? [];
                var choice = fields.ContainsKey("id") && fields.ContainsKey("label");
                void Remove(string field) { fields.Remove(field); required.Remove(field); }
                void Merge(JsonObject full)
                {
                    if (full["properties"] is JsonObject properties)
                        foreach (var pair in properties) fields[pair.Key] = pair.Value?.DeepClone();
                    if (full["required"] is JsonArray names) foreach (var name in names) required.Add(name!.GetValue<string>());
                    if (full["additionalProperties"] is JsonObject || full["additionalProperties"]?.ToJsonString() == "true")
                        shape["additionalProperties"] = full["additionalProperties"]!.DeepClone();
                }
                foreach (var pair in fields.ToArray().Where(p => p.Key.EndsWith("DisplayData", StringComparison.Ordinal)))
                {
                    fields[pair.Key[..^"DisplayData".Length]] = pair.Value?.DeepClone();
                    Remove(pair.Key);
                }
                if (fields["sourceFields"] is {} source && fields["document"] is {} document)
                {
                    var full = ObjectOf(source); var aggregate = ObjectOf(document);
                    aggregate["properties"]!["header"] = full["properties"]!["header"]!.DeepClone();
                    aggregate["properties"]!["lines"] = full["properties"]!["lines"]!.DeepClone();
                    aggregate["properties"]!.AsObject().Remove("headerDisplayData");
                    aggregate["properties"]!.AsObject().Remove("linesDisplayData");
                    aggregate["required"] = Array(aggregate["required"]!.AsArray().Select(x => x!.GetValue<string>())
                        .Where(x => x is not ("headerDisplayData" or "linesDisplayData")));
                    fields["document"] = aggregate;
                    Remove("sourceFields");
                    if (fields["statusName"] is {} name)
                    {
                        var header = ObjectOf(aggregate["properties"]!["header"]!);
                        header["properties"]!["statusName"] = name.DeepClone();
                        var headerRequired = header["required"]!.AsArray();
                        if (!headerRequired.Any(x => x!.GetValue<string>() == "statusName")) headerRequired.Add("statusName");
                        aggregate["properties"]!["header"] = header;
                        Remove("statusName");
                    }
                }
                if (contractInfo && fields["fields"] is {} contract && fields.ContainsKey("contractId"))
                {
                    var owned = ObjectOf(contract);
                    owned["properties"] ??= new JsonObject();
                    owned["properties"]!["documentId"] = fields["contractId"]!.DeepClone();
                    owned["required"] = new JsonArray("documentId");
                    fields["contract"] = owned; required.Add("contract");
                    Remove("fields");
                    foreach (var key in Group("contractId")) Remove(key);
                }
                else if (fields["fields"] is {} all && (fields.ContainsKey("lineId") || fields.ContainsKey("documentId") || fields.ContainsKey("id")))
                {
                    var full = ObjectOf(all); Remove("fields"); Merge(full);
                }
                foreach (var key in new[] { "purchaseOrderHeader", "inboundRequestHeader" })
                    if (fields[key] is {} header) { var full = ObjectOf(header); Remove(key); Merge(full); }
                if (fields["values"] is {} values && (fields.ContainsKey("lineId") || fields.ContainsKey("clientLineKey")))
                {
                    var full = ObjectOf(values); Remove("values"); Merge(full);
                }
                if (fields["header"] is {} owner)
                {
                    var header = ObjectOf(owner);
                    header["properties"] ??= new JsonObject();
                    var headerRequired = (header["required"] as JsonArray)?.Select(x => x!.GetValue<string>()).ToHashSet(StringComparer.Ordinal) ?? [];
                    if (recordAlias != "documentId" && header["properties"]!["documentId"] is null)
                    {
                        var sourceKeys = Group(recordAlias); var targetKeys = Group("documentId");
                        for (var i = 0; i < sourceKeys.Length; i++)
                        {
                            if (header["properties"]![sourceKeys[i]] is not {} sourceField) continue;
                            header["properties"]![targetKeys[i]] = sourceField.DeepClone();
                            header["properties"]!.AsObject().Remove(sourceKeys[i]);
                            if (headerRequired.Remove(sourceKeys[i])) headerRequired.Add(targetKeys[i]);
                        }
                    }
                    foreach (var identity in new[] { "documentId", "purchaseRequestId", "branchId", "statusId", "statusName", "isLocked" })
                    foreach (var key in Group(identity))
                    {
                        if (fields[key] is not {} field) continue;
                        if (header["properties"]![key] is null) header["properties"]![key] = field.DeepClone();
                        if (required.Contains(key)) headerRequired.Add(key);
                        Remove(key);
                    }
                    header["required"] = Array(headerRequired);
                    fields["header"] = header;
                    if (fields.Count == 1) { Remove("header"); Merge(header); }
                }
                if (fields.ContainsKey("itemDisplayContext"))
                {
                    void AddPresentation(JsonObject ownerFields)
                    {
                    foreach (var key in new[] { "lines", "details", "purchaseOrderLines", "inboundRequestLines" })
                    {
                        if (ownerFields[key] is not {} lines) continue;
                        ownerFields[key] = Edit(lines, arrayShape =>
                        {
                            if (arrayShape["items"] is not {} item) return;
                            arrayShape["items"] = Edit(item, line =>
                            {
                                line["properties"]!["manufacturerItemCode"] = new JsonObject { ["anyOf"] = new JsonArray(new JsonObject { ["type"] = "string" }, new JsonObject { ["type"] = "null" }), ["readOnly"] = true };
                                line["properties"]!["manufacturerCodeSource"] = new JsonObject { ["type"] = "string", ["readOnly"] = true };
                            });
                        });
                    }
                    }
                    if (fields["document"] is {} documentShape)
                        fields["document"] = Edit(documentShape, owned => AddPresentation(owned["properties"]!.AsObject()));
                    AddPresentation(fields);
                    Remove("itemDisplayContext");
                }
                void Alias(string from, string to)
                {
                    var source = Group(from); var destination = Group(to);
                    for (var i = 0; i < source.Length; i++)
                    {
                        if (fields[source[i]] is not {} field) continue;
                        // Retain the source-column/type annotation at the single canonical key.
                        if (fields[destination[i]] is null || field["x-medcom-source-column"] is not null)
                            fields[destination[i]] = field.DeepClone();
                        if (required.Contains(source[i])) required.Add(destination[i]);
                        Remove(source[i]);
                    }
                }
                if (!choice)
                {
                    if (!contractInfo || fields.ContainsKey("lineId")) Alias("userAutoId", "lineId");
                    if (recordAlias != "documentId" && (recordAlias == "purchaseRequestId" || !fields.ContainsKey("documentId")))
                        Alias(recordAlias, "documentId");
                }
                Alias("isLock", "isLocked");
                if (choice)
                {
                    if (fields["currencyName"] is {} currencyName)
                    {
                        fields["name"] = currencyName.DeepClone();
                        Remove("currencyName");
                    }
                    fields["name"] ??= fields["label"]!.DeepClone();
                    if (required.Contains("label")) required.Add("name");
                    Remove("label");
                }
                shape["required"] = Array(required);
                foreach (var pair in fields.ToArray()) if (pair.Value is {} child) fields[pair.Key] = Transform(child, recordAlias, contractInfo);
                shape["x-medcom-response-contract"] = 3;
            }
            foreach (var pair in shape.ToArray())
            {
                if (pair.Key is "properties" or "required") continue;
                if (pair.Value is JsonObject or JsonArray) shape[pair.Key] = Transform(pair.Value!, recordAlias, contractInfo);
                if (pair.Key is "x-medcom-json-path" or "x-medcom-list-json-path" && pair.Value is JsonValue text && text.TryGetValue<string>(out var path))
                    shape[pair.Key] = CanonicalPath(path);
            }
            return shape;
        }
        foreach (var path in paths)
        {
            if (!CanonicalResponseProjection.Applies(path.Key)) continue;
            foreach (var operation in path.Value!.AsObject())
            {
                if (operation.Value?["responses"]?["200"]?["content"]?["application/json"] is not JsonObject response || response["schema"] is not {} schema) continue;
                var alias = CanonicalResponseProjection.RecordAlias(path.Key);
                response["schema"] = Transform(schema, alias, path.Key.EndsWith("/contract-info", StringComparison.Ordinal));
                operation.Value!["x-medcom-response-contract"] = 3;
            }
        }
    }
    internal static string CanonicalPath(string path) => string.Join('.', path.Split('.')
        .Where(part => part is not ("fields" or "purchaseOrderHeader" or "inboundRequestHeader"))
        .Select(part => part switch { "sourceFields" => "document", "userAutoId" => "lineId", "purchaseRequestId" => "documentId", "isLock" => "isLocked", _ => part }));
    private static string[] Group(string field) => FeDisplayProjection.IsStatusId(field)
        ? [field,FeDisplayProjection.NameField(field),FeDisplayProjection.StateField(field),field[..^2]+"ForeColor",field[..^2]+"BackColor"] : FeDisplayProjection.IsId(field)
        ? [field, FeDisplayProjection.NameField(field), FeDisplayProjection.StateField(field)] : [field];
    private static JsonArray Array(IEnumerable<string> fields) => new(fields.Select(x => (JsonNode?)JsonValue.Create(x)).ToArray());
}
