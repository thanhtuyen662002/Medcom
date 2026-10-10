using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Medcom.Contracts;
using Medcom.Contracts.Inbound;
using Microsoft.AspNetCore.Routing;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ApiContractCatalogTests
{
    [Fact]
    public void Seven_screen_contracts_publish_module_specific_input_and_full_read_schemas()
    {
        var document=ApiContractCatalog.Build();var schemas=document["components"]!["schemas"]!;
        foreach(var module in ErpScreenCatalog.ModuleIds)
        {
            var id=module.Replace('-','_');var prefix="Erp_"+id;
            var detail=document["paths"]!["/api/erp/"+module+"/detail"]!["get"]!["responses"]!["200"]!["content"]!["application/json"]!["schema"]!["$ref"]!.GetValue<string>();
            Assert.Equal("#/components/schemas/"+prefix+"_detail_response",detail);
            var header=schemas[prefix+"_header_fields"]!;
            Assert.Equal(ErpScreenCatalog.Get(module)!.Fields["header"].Count,((JsonObject)header["properties"]!).Count);
            if(module is "sales-qr" or "warehouse-qr")continue;
            var create=schemas[prefix+"_create"]!;
            Assert.Contains("HeaderInput",create["properties"]!["header"]!["$ref"]!.GetValue<string>());
            Assert.Equal(500,create["properties"]!["lines"]!["maxItems"]!.GetValue<int>());
            Assert.Equal(3,((JsonArray)schemas[prefix+"_save"]!["properties"]!["lineChanges"]!["items"]!["oneOf"]!).Count);
            Assert.Equal("Remove",schemas[prefix+"_line_remove"]!["properties"]!["kind"]!["const"]!.GetValue<string>());
        }
    }
    [Fact]
    public void Frontend_download_artifact_matches_the_contract_exported_by_the_current_backend()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        string? path = null;
        while (directory is not null)
        {
            var candidate = System.IO.Path.Combine(directory.FullName, "docs", "backend", "medcom-openapi.json");
            if (File.Exists(candidate)) { path = candidate; break; }
            directory = directory.Parent;
        }
        Assert.NotNull(path);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(File.ReadAllText(path)), JsonNode.Parse(ApiContractCatalog.Json)));
    }

    [Fact]
    public async Task Published_operations_exactly_cover_real_host_routes_without_invented_ERP_endpoints()
    {
        await using var app = ApiHost.Build(["--Legacy:Enabled", "false"]);
        var actual = ((IEndpointRouteBuilder)app).DataSources.SelectMany(s => s.Endpoints).OfType<RouteEndpoint>()
            .SelectMany(e => e.Metadata.GetMetadata<HttpMethodMetadata>()!.HttpMethods.Select(m => m.ToLowerInvariant() + " " + e.RoutePattern.RawText))
            .Order(StringComparer.Ordinal).ToArray();
        var document = ApiContractCatalog.Build();
        var expected = ((JsonObject)document["paths"]!).SelectMany(p => ((JsonObject)p.Value!).Select(m => m.Key + " " + p.Key)).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(115, actual.Length); Assert.Equal(actual, expected);
        var ids = ((JsonObject)document["paths"]!).SelectMany(p => ((JsonObject)p.Value!).Select(m => m.Value!["operationId"]!.GetValue<string>())).ToArray();
        Assert.Equal(ids.Length, ids.Distinct(StringComparer.Ordinal).Count());
        Assert.Equal("not-admitted", document["x-medcom-business-release"]!.GetValue<string>());
        foreach(var module in new[]{"warehouse-qr","sales-qr"})
            Assert.DoesNotContain(expected,p=>p=="post /api/erp/"+module+"/create"||p=="post /api/erp/"+module+"/delete");
        CheckReferences(document, document);
    }

    [Fact]
    public async Task Anonymous_and_authenticated_contract_reads_never_resolve_authority_or_expose_private_settings()
    {
        await using var fixture = await PurchaseHttpFixture.Start();
        var anonymous = await fixture.Json(ApiContractCatalog.Path);
        Assert.Equal("3.1.1", anonymous.GetProperty("openapi").GetString());
        Assert.Equal(0, fixture.Authority.Revalidations);
        await fixture.Login(); var previous = fixture.Authority.Revalidations;
        var authenticated = await fixture.Json(ApiContractCatalog.Path);
        Assert.Equal(anonymous.GetRawText(), authenticated.GetRawText());
        Assert.Equal(previous, fixture.Authority.Revalidations);
        Assert.Equal(0, fixture.Source.Commits);
        Assert.DoesNotContain("synthetic-password", authenticated.GetRawText(), StringComparison.Ordinal);
        Assert.DoesNotContain("connectionString", authenticated.GetRawText(), StringComparison.OrdinalIgnoreCase);
        using var denied = await fixture.Client.GetAsync("/api/v2/documents/purchase-orders");
        Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode); // protected reads retain authority/capability checks
        Assert.True(fixture.Authority.Revalidations > previous);
        Assert.Equal("application/problem+json", denied.Content.Headers.ContentType!.MediaType);
        var problem = JsonSerializer.Deserialize<JsonElement>(await denied.Content.ReadAsStringAsync());
        var errorSchema = ApiContractCatalog.Build()["paths"]!["/api/v2/documents/purchase-orders"]!["get"]!["responses"]!["default"]!["content"]!["application/problem+json"]!["schema"]!;
        Assert.True(Matches(ApiContractCatalog.Build(), errorSchema, problem));
    }

    [Theory]
    [InlineData("PurchaseOrderHeaderFields", "purchase-orders", true, 19)]
    [InlineData("PurchaseOrderLineFields", "purchase-orders", false, 12)]
    [InlineData("InboundRequestHeaderFields", "inbound-requests", true, 38)]
    [InlineData("InboundRequestLineFields", "inbound-requests", false, 26)]
    [InlineData("PurchaseRequestHeaderFields", "purchase-requests", true, 14)]
    [InlineData("PurchaseRequestLineFields", "purchase-requests", false, 9)]
    public void Every_SQL_source_field_has_an_exact_required_typed_nullable_schema_and_mapping(string name, string kind, bool header, int count)
    {
        var document = ApiContractCatalog.Build(); var schema = document["components"]!["schemas"]![name]!;
        var mapping = DocumentFieldCatalog.Get(kind) ?? throw new InvalidOperationException();
        var fields = header ? mapping.Header : mapping.Lines;
        var properties = (JsonObject)schema["properties"]!;
        Assert.Equal(count, properties.Count); Assert.Equal(count, ((JsonArray)schema["required"]!).Count);
        Assert.Equal(fields.Table, schema["x-medcom-source-table"]!.GetValue<string>());
        foreach (var field in fields.Fields)
        {
            var property = properties[field.JsonPath.Split('.')[^1]]!;
            Assert.Equal(field.SqlType, property["x-medcom-sql-type"]!.GetValue<string>());
            Assert.Equal(field.Column, property["x-medcom-source-column"]!.GetValue<string>());
            Assert.Equal(field.Nullable, property["x-medcom-sql-nullable"]!.GetValue<bool>());
            Assert.Equal(field.Nullable, property["anyOf"] is JsonArray);
            var primitive = field.Nullable ? property["anyOf"]![0]! : property;
            Assert.Equal(field.JsonType, primitive["type"]!.GetValue<string>());
        }
    }

    [Fact]
    public async Task Actual_purchase_read_wire_requires_full_fields_on_current_and_v2_routes()
    {
        await using var fixture = await PurchaseHttpFixture.Start(); fixture.Source.Seed(); await fixture.Login();
        var contract = ApiContractCatalog.Build();
        foreach (var path in new[] { "/api/purchase-requests", "/api/v2/purchase-requests", "/api/purchase-requests/detail", "/api/v2/purchase-requests/detail" })
        {
            var body = await fixture.Json(path + (path.EndsWith("detail", StringComparison.Ordinal) ? "?documentId=QA-DOC" : ""));
            var schema = contract["paths"]![path]!["get"]!["responses"]!["200"]!["content"]!["application/json"]!["schema"]!;
            Assert.True(Matches(contract, schema, body), path);
            {
                var altered = JsonNode.Parse(body.GetRawText())!;
                if (path.EndsWith("detail", StringComparison.Ordinal)) ((JsonObject)altered["data"]!).Remove("sourceFields");
                else ((JsonObject)altered["data"]!["rows"]![0]!).Remove("fields");
                Assert.False(Matches(contract, schema, JsonSerializer.SerializeToElement(altered)));
            }
        }
    }

    [Fact]
    public void Command_schemas_preserve_numeric_purchase_outcomes_string_inbound_outcomes_and_actual_parser_limits()
    {
        var contract = ApiContractCatalog.Build(); var schemas = contract["components"]!["schemas"]!;
        Assert.Equal("integer", schemas[nameof(PurchaseRequestCommandOutcome)]!["type"]!.GetValue<string>());
        Assert.Equal("integer", schemas[nameof(PurchaseRequestLookupOutcome)]!["type"]!.GetValue<string>());
        Assert.Equal("string", schemas[nameof(InboundDraftOutcome)]!["type"]!.GetValue<string>());
        var command = schemas[nameof(InboundDraftCommand)]!;
        Assert.Equal(new[] { "operationId", "action", "documentId", "expectedStateEqualityToken", "header" }, ((JsonArray)command["required"]!).Select(n => n!.GetValue<string>()));
        Assert.Equal(0, command["properties"]!["costChanges"]!["maxItems"]!.GetValue<int>());
        Assert.DoesNotContain("Create", command["properties"]!["action"]!["enum"]!.ToJsonString(), StringComparison.Ordinal);
        Assert.DoesNotContain("Add", schemas[nameof(PurchaseRequestLineChange)]!["properties"]!["kind"]!["enum"]!.ToJsonString(), StringComparison.Ordinal);
        Assert.Equal("Save", schemas["InboundDraftSavePayload"]!["properties"]!["action"]!["const"]!.GetValue<string>());
        Assert.Equal("SendToWarehouse", schemas["InboundDraftSendPayload"]!["properties"]!["action"]!["const"]!.GetValue<string>());
        Assert.Equal("null", schemas["InboundDraftSendPayload"]!["properties"]!["header"]!["type"]!.GetValue<string>());
        Assert.Equal(500, schemas[nameof(SavePurchaseRequestDraft)]!["properties"]!["lineChanges"]!["maxItems"]!.GetValue<int>());
        foreach (var route in ((JsonObject)contract["paths"]!).Where(p => ((JsonObject)p.Value!).ContainsKey("post")))
        {
            var auth = route.Value!["post"]!["security"]![0]!;
            Assert.NotNull(auth["CsrfToken"]); Assert.NotNull(auth["CsrfCookie"]);
            Assert.Equal(route.Key != "/api/auth/login", auth["SessionCookie"] is not null);
        }
        Assert.Empty((JsonArray)contract["paths"]![ApiContractCatalog.Path]!["get"]!["security"]!);
    }

    private static void CheckReferences(JsonNode root, JsonNode node)
    {
        if (node is JsonObject obj)
        {
            if (obj["$ref"] is {} reference) Assert.NotNull(Resolve(root, reference.GetValue<string>()));
            foreach (var child in obj.Select(p => p.Value).OfType<JsonNode>()) CheckReferences(root, child);
        }
        else if (node is JsonArray array) foreach (var child in array.OfType<JsonNode>()) CheckReferences(root, child);
    }
    private static JsonNode? Resolve(JsonNode root, string reference) => reference[2..].Split('/').Aggregate<string, JsonNode?>(root, (node, part) => node?[part]);
    private static bool Matches(JsonNode root, JsonNode schema, JsonElement value)
    {
        if (schema["$ref"] is {} reference) return Matches(root, Resolve(root, reference.GetValue<string>())!, value);
        if (schema["anyOf"] is JsonArray alternatives) return alternatives.Any(s => Matches(root, s!, value));
        var type = schema["type"]?.GetValue<string>();
        if (type == "null") return value.ValueKind == JsonValueKind.Null;
        if (type == "object")
        {
            if (value.ValueKind != JsonValueKind.Object) return false;
            var properties = (JsonObject)schema["properties"]!;
            if (((JsonArray)schema["required"]!).Any(n => !value.TryGetProperty(n!.GetValue<string>(), out _))) return false;
            return value.EnumerateObject().All(p => properties[p.Name] is {} child
                ? Matches(root, child, p.Value)
                : schema["additionalProperties"]?.GetValue<bool>() == true);
        }
        if (type == "array") return value.ValueKind == JsonValueKind.Array && value.EnumerateArray().All(v => Matches(root, schema["items"]!, v));
        if (schema["pattern"] is {} pattern && (value.ValueKind != JsonValueKind.String
            || !Regex.IsMatch(value.GetString()!, pattern.GetValue<string>(), RegexOptions.CultureInvariant))) return false;
        return type switch
        {
            "string" => value.ValueKind == JsonValueKind.String,
            "integer" => value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out _),
            "number" => value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var n) && double.IsFinite(n),
            "boolean" => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
            _ => false
        };
    }
}
