using System.Net;
using System.Text.Json;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class DocumentDataProjectionTests
{
    [Theory]
    [InlineData("purchase-orders", false, false)] [InlineData("purchase-orders", false, true)]
    [InlineData("purchase-orders", true, false)] [InlineData("purchase-orders", true, true)]
    [InlineData("inbound-requests", false, false)] [InlineData("inbound-requests", false, true)]
    [InlineData("inbound-requests", true, false)] [InlineData("inbound-requests", true, true)]
    [InlineData("purchase-requests", false, false)] [InlineData("purchase-requests", false, true)]
    [InlineData("purchase-requests", true, false)] [InlineData("purchase-requests", true, true)]
    public async Task All_existing_document_reads_explicitly_identify_summary_or_full_and_the_matching_complete_route(
        string kind, bool version2, bool detail)
    {
        var source = new FullReadSource(kind == "inbound-requests" ? DocumentKind.InboundRequests : DocumentKind.PurchaseOrders);
        await using var fixture = await PurchaseHttpFixture.Start(services => services.AddSingleton<IDocumentReader>(source.Reader));
        fixture.Authority.Identity = source.Identity;
        fixture.Source.Seed();
        var suffix = kind == "purchase-requests" ? kind : "documents/" + kind;
        if (detail) suffix += "/detail";
        var fullPath = "/api/v2/" + suffix;
        var path = (version2 ? "/api/v2/" : "/api/") + suffix;
        var query = detail ? "?documentId=" + (kind == "purchase-requests" ? "QA-DOC" : "DOC") : "";
        using (var denied = await fixture.Client.GetAsync(path + query))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
            Assert.False(denied.Headers.Contains("X-Medcom-Data-Projection"));
            Assert.False(denied.Headers.Contains("X-Medcom-Full-Data-Path"));
        }
        await fixture.Login();
        using var response = await fixture.Client.GetAsync(path + query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Equal(version2 ? "full" : "summary", Assert.Single(response.Headers.GetValues("X-Medcom-Data-Projection")));
        Assert.Equal(fullPath, Assert.Single(response.Headers.GetValues("X-Medcom-Full-Data-Path")));
        var operation = ApiContractCatalog.Build()["paths"]![path]!["get"]!;
        var headers = operation["responses"]!["200"]!["headers"]!;
        Assert.Equal(version2 ? "full" : "summary", headers["X-Medcom-Data-Projection"]!["schema"]!["const"]!.GetValue<string>());
        Assert.Equal(fullPath, headers["X-Medcom-Full-Data-Path"]!["schema"]!["const"]!.GetValue<string>());
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = kind == "purchase-requests" ? body.RootElement.GetProperty("data") : body.RootElement;
        var row = detail ? data : data.GetProperty("rows")[0];
        if (kind == "purchase-requests")
            Assert.Equal(version2, row.TryGetProperty(detail ? "sourceFields" : "fields", out _));
        else
            Assert.Equal(version2, (detail ? row.GetProperty("document") : row)
                .TryGetProperty(kind == "purchase-orders" ? "purchaseOrderHeader" : "inboundRequestHeader", out _));
    }

    [Theory]
    [InlineData(false)] [InlineData(true)]
    public async Task Purchase_v2_missing_full_source_data_is_unavailable_instead_of_a_summary_success(bool detail)
    {
        await using var fixture = await PurchaseHttpFixture.Start(services =>
        {
            var original = services.Last(d => d.ServiceType == typeof(IPurchaseRequestQueries)).ImplementationFactory!;
            services.AddScoped<IPurchaseRequestQueries>(provider => new PartialQueries((IPurchaseRequestQueries)original(provider)));
        });
        fixture.Source.Seed(); await fixture.Login();
        var suffix = detail ? "/detail?documentId=QA-DOC" : "";
        using var response = await fixture.Client.GetAsync("/api/v2/purchase-requests" + suffix);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.False(response.Headers.Contains("X-Medcom-Data-Projection"));
        Assert.False(response.Headers.Contains("X-Medcom-Full-Data-Path"));
        using var legacy = await fixture.Client.GetAsync("/api/purchase-requests" + suffix);
        Assert.Equal(HttpStatusCode.OK, legacy.StatusCode);
        Assert.Equal("summary", Assert.Single(legacy.Headers.GetValues("X-Medcom-Data-Projection")));
    }

    [Theory]
    [InlineData(false, false)] [InlineData(false, true)]
    [InlineData(true, false)] [InlineData(true, true)]
    public async Task Routing_case_and_trailing_slash_cannot_change_the_registered_projection(bool purchase, bool version2)
    {
        var source = new FullReadSource(DocumentKind.PurchaseOrders);
        await using var fixture = await PurchaseHttpFixture.Start(services => services.AddSingleton<IDocumentReader>(source.Reader));
        fixture.Authority.Identity = source.Identity;
        fixture.Source.Seed(); await fixture.Login();
        var suffix = purchase ? "purchase-requests" : "documents/purchase-orders";
        var path = (version2 ? "/api/v2/" : "/api/") + suffix;
        using var response = await fixture.Client.GetAsync(path.ToUpperInvariant() + "/");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(version2 ? "full" : "summary", Assert.Single(response.Headers.GetValues("X-Medcom-Data-Projection")));
        Assert.Equal("/api/v2/" + suffix, Assert.Single(response.Headers.GetValues("X-Medcom-Full-Data-Path")));
    }

    private sealed class PartialQueries(IPurchaseRequestQueries inner) : IPurchaseRequestQueries
    {
        public Task<PurchaseRequestQueryResult<PurchaseRequestWorkspace>> WorkspaceAsync(CancellationToken token = default) => inner.WorkspaceAsync(token);
        public Task<PurchaseRequestQueryResult<PurchaseRequestLookupPage>> LookupAsync(string kind, string? search, int page, CancellationToken token = default) => inner.LookupAsync(kind, search, page, token);
        public async Task<PurchaseRequestQueryResult<PurchaseRequestListPage>> ListAsync(PurchaseRequestListQuery query, CancellationToken token = default)
        {
            var result = await inner.ListAsync(query, token);
            return result with { Value = result.Value is {} page ? page with { Rows = page.Rows.Select(row => row with { Fields = null }).ToArray() } : null };
        }
        public async Task<PurchaseRequestQueryResult<PurchaseRequestReadback>> OpenAsync(string id, CancellationToken token = default)
        {
            var result = await inner.OpenAsync(id, token);
            return result with { Value = result.Value is {} document ? document with { SourceFields = null } : null };
        }
    }
}
