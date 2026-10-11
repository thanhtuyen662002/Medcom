using System.Text.Json;
using System.Text.Json.Nodes;
using Medcom.Contracts;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class CanonicalResponseTests
{
    [Fact]
    public void Batch_history_document_and_batch_are_distinct_columns_even_when_values_match()
    {
        foreach (var document in new[] { "SYNTHETIC-HISTORY", "SYNTHETIC-BATCH" })
        {
            var row = new JsonObject { ["lineId"] = "SYNTHETIC-L", ["fields"] = new JsonObject
                { ["userAutoId"] = "SYNTHETIC-L", ["documentId"] = document, ["batchId"] = "SYNTHETIC-BATCH" } };
            var actual = CanonicalResponseProjection.Normalize(row, "/api/erp/internal-transfer-tech/detail");
            Assert.Equal(document, actual["documentId"]!.GetValue<string>());
            Assert.Equal("SYNTHETIC-BATCH", actual["batchId"]!.GetValue<string>());
        }
    }
    [Fact]
    public void Full_purchase_source_wins_over_an_old_input_display_snapshot()
    {
        var input = JsonNode.Parse("""{"data":{"document":{"purchaseRequestId":"SYNTHETIC-D","header":{"notes":"old"},"headerDisplayData":{"notes":"old"},"lines":[]},"sourceFields":{"header":{"purchaseRequestId":"SYNTHETIC-D","notes":null},"lines":[{"userAutoId":"SYNTHETIC-L","quantity":"12.0000"}]}}}""")!;
        var actual = CanonicalResponseProjection.Normalize(input, "/api/purchase-requests/detail")["data"]!;
        Assert.Null(actual["document"]!["header"]!["notes"]);
        Assert.Equal("SYNTHETIC-D", actual["document"]!["header"]!["documentId"]!.GetValue<string>());
        Assert.Equal("12.0000", actual["document"]!["lines"]![0]!["quantity"]!.GetValue<string>());
        Assert.False(actual.AsObject().ContainsKey("sourceFields"));
    }
    [Fact]
    public void Complete_order_lines_have_one_location_and_keep_nulls_precision_names_and_paging()
    {
        var input = JsonNode.Parse("""{"purchaseOrderLines":[{"lineId":"SYNTHETIC-L","itemId":"SYNTHETIC-I","quantity":"200.00","quantity2":null,"fields":{"userAutoId":"SYNTHETIC-L","documentId":"SYNTHETIC-D","itemId":"SYNTHETIC-I","quantity":"200.00","quantity2":null,"unitPrice":"10.0000","amount":null,"itemCode":"SYNTHETIC-CODE","itemName":"Hàng mẫu","unit":"Cái","unitPriceDisplay":"10.00 USD"}}],"page":2,"pageSize":1,"hasMore":true}""")!;
        var before = input.ToJsonString();
        var actual = CanonicalResponseProjection.Normalize(input, "/api/documents/purchase-orders/detail");
        var line = actual["purchaseOrderLines"]![0]!.AsObject();
        Assert.False(line.ContainsKey("fields")); Assert.False(line.ContainsKey("userAutoId"));
        Assert.Equal("SYNTHETIC-L", line["lineId"]!.GetValue<string>());
        Assert.Equal("200.00", line["quantity"]!.GetValue<string>());
        Assert.Equal("10.0000", line["unitPrice"]!.GetValue<string>());
        Assert.Equal("10.00 USD", line["unitPriceDisplay"]!.GetValue<string>());
        Assert.Equal("Hàng mẫu", line["itemName"]!.GetValue<string>());
        Assert.True(line.ContainsKey("amount")); Assert.Null(line["amount"]);
        Assert.Equal(2, actual["page"]!.GetValue<int>()); Assert.True(actual["hasMore"]!.GetValue<bool>());
        Assert.Equal(before, input.ToJsonString());
        Assert.True(JsonNode.DeepEquals(actual, CanonicalResponseProjection.Normalize(actual, "/api/documents/purchase-orders/detail")));
    }
    [Theory]
    [InlineData("purchase-requests", "purchaseRequestId")]
    [InlineData("purchase-approvals", "purchaseRequestId")]
    [InlineData("internal-transfer-batches", "batchId")]
    [InlineData("internal-transfer-tech", "batchId")]
    [InlineData("internal-transfer-warehouse-in", "batchId")]
    public void Source_primary_key_has_one_header_location_and_different_foreign_keys_survive(string module, string primary)
    {
        var header = new JsonObject { [primary] = "SYNTHETIC-D", ["fromBranchId"] = "SYNTHETIC-FROM", ["toBranchId"] = "SYNTHETIC-TO" };
        var input = new JsonObject { ["data"] = new JsonObject { ["documentId"] = "SYNTHETIC-D", ["branchId"] = "SYNTHETIC-FROM", ["stateToken"] = "SYNTHETIC-TOKEN", ["header"] = header, ["lines"] = new JsonObject { ["rows"] = new JsonArray(), ["page"] = 3, ["pageSize"] = 20, ["hasMore"] = false } } };
        var result = CanonicalResponseProjection.Normalize(input, "/api/erp/" + module + "/detail")["data"]!.AsObject();
        Assert.False(result.ContainsKey("documentId")); Assert.False(result.ContainsKey("branchId"));
        Assert.False(result["header"]!.AsObject().ContainsKey(primary));
        Assert.Equal("SYNTHETIC-D", result["header"]!["documentId"]!.GetValue<string>());
        Assert.Equal("SYNTHETIC-FROM", result["header"]!["fromBranchId"]!.GetValue<string>());
        Assert.Equal("SYNTHETIC-TO", result["header"]!["toBranchId"]!.GetValue<string>());
        Assert.Equal("SYNTHETIC-TOKEN", result["stateToken"]!.GetValue<string>());
        Assert.Equal(3, result["lines"]!["page"]!.GetValue<int>());
    }
    [Fact]
    public void Contract_and_parent_document_remain_distinct_entities()
    {
        var input = JsonNode.Parse("""{"data":{"documentId":"SYNTHETIC-ORDER","contractId":"SYNTHETIC-CONTRACT","fields":{"DocumentID":"SYNTHETIC-CONTRACT","ContractName":"Hợp đồng mẫu"}}}""")!;
        var result = CanonicalResponseProjection.Normalize(input, "/api/erp/sales-orders/contract-info")["data"]!;
        Assert.Equal("SYNTHETIC-ORDER", result["documentId"]!.GetValue<string>());
        Assert.Equal("SYNTHETIC-CONTRACT", result["contract"]!["documentId"]!.GetValue<string>());
        Assert.False(result.AsObject().ContainsKey("fields")); Assert.False(result.AsObject().ContainsKey("contractId"));
    }
    [Fact]
    public void Choices_keep_one_identity_name_and_extra_columns_without_deduplicating_equal_business_values()
    {
        var input = JsonNode.Parse("""{"data":{"items":[{"id":"SYNTHETIC-I","label":"Hàng mẫu","fields":{"ItemID":"SYNTHETIC-I","ItemName":"Hàng mẫu","ItemCode":"SYNTHETIC-CODE","Unit":"Cái","quantity":"10.00","unitPrice":"10.00"}}],"page":1,"pageSize":20,"hasMore":false}}""")!;
        var choice = CanonicalResponseProjection.Normalize(input, "/api/erp/purchase-orders/options", ["ItemID", "ItemName"])["data"]!["items"]![0]!.AsObject();
        Assert.Equal("SYNTHETIC-I", choice["id"]!.GetValue<string>()); Assert.Equal("Hàng mẫu", choice["name"]!.GetValue<string>());
        foreach (var key in new[] { "fields", "label", "ItemID", "ItemName" }) Assert.False(choice.ContainsKey(key));
        Assert.Equal("SYNTHETIC-CODE", choice["ItemCode"]!.GetValue<string>());
        Assert.Equal("10.00", choice["quantity"]!.GetValue<string>()); Assert.Equal("10.00", choice["unitPrice"]!.GetValue<string>());
    }
    [Fact]
    public void Exact_input_display_snapshot_is_the_only_response_copy_and_request_schema_is_unchanged()
    {
        var input = JsonNode.Parse("""{"document":{"header":{"currencyId":"VND"},"headerDisplayData":{"currencyId":"VND","currencyName":"Việt Nam đồng"},"lines":[{"lineId":"SYNTHETIC-L","values":{"quantity":"1"},"valuesDisplayData":{"quantity":"1","itemName":"Hàng mẫu"}}]}}""")!;
        var result = CanonicalResponseProjection.Normalize(input, "/api/purchase-requests/detail");
        Assert.False(result["document"]!.AsObject().ContainsKey("headerDisplayData"));
        Assert.False(result["document"]!["lines"]![0]!.AsObject().ContainsKey("values"));
        Assert.Equal("Hàng mẫu", result["document"]!["lines"]![0]!["itemName"]!.GetValue<string>());
        var contract = ApiContractCatalog.Build();
        var request = contract["components"]!["schemas"]![nameof(PurchaseRequestHeaderInput)]!;
        Assert.True(request["x-medcom-exact-input"]!.GetValue<bool>());
        Assert.Null(request["properties"]!["currencyName"]);
        Assert.Equal("3.0.0", contract["info"]!["version"]!.GetValue<string>());
    }
    [Fact]
    public void Field_definitions_are_metadata_and_are_not_mistaken_for_business_rows()
    {
        var input = JsonNode.Parse("""{"data":{"id":"purchase-orders","fields":{"header":[{"name":"documentId","writable":false}],"lines":[{"name":"itemId","writable":true}]}}}""")!;
        Assert.True(JsonNode.DeepEquals(input, CanonicalResponseProjection.Normalize(input, "/api/erp/purchase-orders/screen")));
        Assert.Equal("data.document.header.isLocked", CanonicalResponseSchemas.CanonicalPath("data.sourceFields.header.isLock"));
        Assert.Equal("data.document.header.isLocked", CanonicalResponseSchemas.CanonicalPath("data.sourceFields.header.isLocked"));
    }
}
