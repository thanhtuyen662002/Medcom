using System.Data;
using System.Globalization;
using System.Net;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.PurchaseRequests;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class DocumentSelectionTests
{
    [Theory]
    [InlineData(null,null,true)]
    [InlineData("1753-01-01","9999-12-31",true)]
    [InlineData("2028-02-29","2028-02-29",true)]
    [InlineData("2026-02-29",null,false)]
    [InlineData("1752-12-31",null,false)]
    [InlineData("2026-10-11","2026-10-10",false)]
    [InlineData("2026-10-10T00:00:00Z",null,false)]
    [InlineData("2026-1-1",null,false)]
    [InlineData("",null,false)]
    [InlineData(null,"2026-10-10 ",false)]
    public void Calendar_dates_are_lossless_and_within_SQL_datetime_range(string? from,string? to,bool valid)
        => Assert.Equal(valid,DocumentSelectionRules.Valid(from,to,null,null));

    [Fact]
    public void Inclusive_end_day_has_no_timezone_or_maximum_day_overflow()
    {
        var end=DocumentSelectionRules.ExclusiveUpperBound("2028-02-29");
        Assert.Equal(new DateTime(2028,3,1),end);Assert.Equal(DateTimeKind.Unspecified,end!.Value.Kind);
        Assert.Null(DocumentSelectionRules.ExclusiveUpperBound("9999-12-31"));
        Assert.Throws<ArgumentException>(()=>DocumentSelectionRules.ExclusiveUpperBound("1752-01-01"));
    }

    [Theory]
    [InlineData("documentDate","asc","D.DocumentDate ASC,CONVERT(varbinary(max),D.DocumentID) ASC")]
    [InlineData("statusId","desc","D.StatusID DESC,CONVERT(varbinary(max),D.DocumentID) ASC")]
    [InlineData("documentId","asc","CONVERT(varbinary(max),D.DocumentID) ASC")]
    public async Task Both_document_modules_pass_typed_selection_to_the_production_SQL_reader(string sort,string direction,string order)
    {
        foreach(var kind in new[]{DocumentKind.PurchaseOrders,DocumentKind.InboundRequests})
        {
            var source=new FullReadSource(kind);var observed=new ObservedReader(source);
            await using var fixture=await PurchaseHttpFixture.Start(services=>services.AddSingleton<IDocumentReader>(observed));
            fixture.Authority.Identity=fixture.Authority.Identity with {Capabilities=source.Identity.Capabilities};await fixture.Login();
            var path="/api/v2/documents/"+(kind==DocumentKind.PurchaseOrders?"purchase-orders":"inbound-requests");
            using var response=await fixture.Client.GetAsync(path+"?dateFrom=2026-10-01&dateTo=2026-10-10&statusId=0&sortBy="+sort+"&sortDirection="+direction+"&page=2&pageSize=20&branchId=QA-A");
            Assert.Equal(HttpStatusCode.OK,response.StatusCode);Assert.True(response.Headers.Contains("X-Medcom-Read-Scope"));
            Assert.Equal(1,observed.Calls);Assert.Equal(new(2,20,null,"QA-A","2026-10-01","2026-10-10",0,sort,direction),observed.Query);
            Assert.Contains("ORDER BY "+order,source.LastDocumentSql);
            Assert.Equal(new DateTime(2026,10,1),source.LastDocumentParameters["@dateFrom"]);
            Assert.Equal(new DateTime(2026,10,11),source.LastDocumentParameters["@dateToExclusive"]);
            Assert.Equal(true,source.LastDocumentParameters["@dateBounded"]);Assert.Equal(0,source.LastDocumentParameters["@statusId"]);
            Assert.Equal(20,source.LastDocumentParameters["@skip"]);Assert.Equal(21,source.LastDocumentParameters["@take"]);
            Assert.Contains("@storedHash",source.LastDocumentSql);Assert.Contains("@branch0",source.LastDocumentSql);
            Assert.DoesNotContain("2026-10-01",source.LastDocumentSql);
        }
    }

    [Theory]
    [InlineData("documentDate","asc")]
    [InlineData("documentId","desc")]
    [InlineData("statusId","asc")]
    public async Task Purchase_request_filters_reuse_current_authority_and_parameterized_SQL(string sort,string direction)
    {
        await using var fixture=await PurchaseHttpFixture.Start();fixture.Source.Seed();await fixture.Login();
        using var response=await fixture.Client.GetAsync("/api/v2/purchase-requests?dateFrom=1753-01-01&dateTo=9999-12-31&statusId=-1&sortBy="+sort+"&sortDirection="+direction);
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);
        var command=fixture.Source.Commands.Single(c=>c.Sql.Contains("OFFSET @skip",StringComparison.Ordinal));
        Assert.Equal(new DateTime(1753,1,1),command.Parameters["@dateFrom"]);
        Assert.Null(command.Parameters["@dateToExclusive"]);Assert.Equal(true,command.Parameters["@dateBounded"]);
        Assert.Equal(-1,command.Parameters["@statusId"]);Assert.Equal(0,fixture.Source.Commits);
        Assert.Contains("D.PurchaseDate IS NOT NULL",command.Sql);
        Assert.Contains(DocumentSelectionSql.Order("D.PurchaseDate","D.PurchaseRequestID",sort,direction),command.Sql);
        Assert.Contains(fixture.Source.Commands,c=>c.Sql==SqlPurchaseRequestQueries.CredentialText);
        Assert.Contains(fixture.Source.Commands,c=>c.Sql==SqlPurchaseRequestQueries.GrantsText);
    }

    [Theory]
    [InlineData("dateFrom=2026-02-29")]
    [InlineData("dateFrom=2026-10-11&dateTo=2026-10-10")]
    [InlineData("dateTo=")]
    [InlineData("dateFrom=2026-10-10&dateFrom=2026-10-11")]
    [InlineData("statusId=1&statusId=2")]
    [InlineData("statusId=2147483648")]
    [InlineData("statusId=1.0")]
    [InlineData("sortBy=DocumentDate")]
    [InlineData("sortBy=documentDate%3BDELETE%20FROM%20SY_User")]
    [InlineData("sortDirection=DESC")]
    [InlineData("sortDirection=")]
    [InlineData("table=SY_User")]
    [InlineData("page=1&page=2")]
    [InlineData("pageSize=0")]
    public async Task Invalid_selection_never_reaches_any_document_provider(string query)
    {
        var source=new FullReadSource(DocumentKind.PurchaseOrders);var observed=new ObservedReader(source);
        await using var fixture=await PurchaseHttpFixture.Start(services=>services.AddSingleton<IDocumentReader>(observed));
        fixture.Authority.Identity=fixture.Authority.Identity with {Capabilities=source.Identity.Capabilities};await fixture.Login();
        foreach(var path in new[]{"/api/v2/documents/purchase-orders","/api/v2/documents/inbound-requests","/api/v2/purchase-requests"})
        {
            using var response=await fixture.Client.GetAsync(path+"?"+query);
            Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
            Assert.False(response.Headers.Contains("X-Medcom-Read-Scope"));
        }
        Assert.Equal(0,observed.Calls);Assert.Equal(0,source.DocumentReads);Assert.Equal(0,fixture.Source.Opens);
    }

    [Fact]
    public async Task Legacy_routes_reject_new_fields_and_keep_original_default_ordering()
    {
        var source=new FullReadSource(DocumentKind.PurchaseOrders);var observed=new ObservedReader(source);
        await using var fixture=await PurchaseHttpFixture.Start(services=>services.AddSingleton<IDocumentReader>(observed));
        fixture.Authority.Identity=fixture.Authority.Identity with {Capabilities=source.Identity.Capabilities};await fixture.Login();
        foreach(var path in new[]{"/api/documents/purchase-orders","/api/documents/inbound-requests","/api/purchase-requests"})
        {
            using var response=await fixture.Client.GetAsync(path+"?statusId=1");Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
        }
        await fixture.Json("/api/documents/purchase-orders");
        Assert.Contains("ORDER BY DocumentDate DESC, DocumentID ASC",source.LastDocumentSql);
        Assert.Equal(DBNull.Value,source.LastDocumentParameters["@dateFrom"]);Assert.Equal(false,source.LastDocumentParameters["@dateBounded"]);
        Assert.Null(observed.Query!.SortBy);
    }

    [Fact]
    public async Task Filters_never_widen_branch_or_capability_and_revocation_still_retires_session()
    {
        await using var fixture=await PurchaseHttpFixture.Start();fixture.Source.Seed();await fixture.Login();
        using(var response=await fixture.Client.GetAsync("/api/v2/purchase-requests?branchId=FOREIGN&statusId=1"))
            Assert.Equal(HttpStatusCode.Forbidden,response.StatusCode);
        using(var response=await fixture.Client.GetAsync("/api/v2/documents/purchase-orders?statusId=1"))
            Assert.Equal(HttpStatusCode.Forbidden,response.StatusCode);
        Assert.Equal(0,fixture.Source.Opens);
        fixture.Authority.Rejected=true;
        using var retired=await fixture.Client.GetAsync("/api/v2/purchase-requests?statusId=1");
        Assert.Equal(HttpStatusCode.Unauthorized,retired.StatusCode);Assert.Equal(0,fixture.Source.Opens);
    }

    [Fact]
    public async Task Query_metadata_is_module_authorized_and_matches_executable_OpenAPI()
    {
        await using var fixture=await PurchaseHttpFixture.Start();
        using(var anonymous=await fixture.Client.GetAsync("/api/documents/query-contract?kind=purchase-requests"))
            Assert.Equal(HttpStatusCode.Unauthorized,anonymous.StatusCode);
        await fixture.Login();
        using(var denied=await fixture.Client.GetAsync("/api/documents/query-contract?kind=purchase-orders"))
            Assert.Equal(HttpStatusCode.Forbidden,denied.StatusCode);
        fixture.Authority.Identity=fixture.Authority.Identity with {Capabilities=["purchase-orders.read","inbound-requests.read","purchase-requests.read"]};
        var document=ApiContractCatalog.Build();
        foreach(var kind in new[]{"purchase-orders","inbound-requests","purchase-requests"})
        {
            var json=await fixture.Json("/api/documents/query-contract?kind="+kind);
            Assert.Equal(kind,json.GetProperty("kind").GetString());Assert.Equal(2,json.GetProperty("version").GetInt32());
            Assert.Equal("9999-12-31",json.GetProperty("maximumDate").GetString());Assert.True(json.GetProperty("dateToInclusive").GetBoolean());
            var path=json.GetProperty("listPath").GetString()!;
            var parameters=document["paths"]![path]!["get"]!["parameters"]!.AsArray().Select(p=>p!["name"]!.GetValue<string>()).ToArray();
            Assert.Equal(new[]{"page","pageSize","search","branchId","dateFrom","dateTo","statusId","sortBy","sortDirection"},parameters);
        }
        foreach(var query in new[]{"", "kind=unknown", "kind=purchase-requests&kind=purchase-orders", "kind=purchase-requests&sql=1"})
        {
            using var response=await fixture.Client.GetAsync("/api/documents/query-contract?"+query);
            Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);
        }
        Assert.Equal(0,fixture.Source.Opens);Assert.Equal(0,fixture.Source.Commits);
    }

    private sealed class ObservedReader(FullReadSource source):IDocumentReader
    {
        internal DocumentQuery? Query;internal int Calls;
        public Task<DocumentResult> ReadAsync(AuthoritativeIdentity identity,DocumentKind kind,DocumentQuery query,CancellationToken token)
        {Query=query;Calls++;return source.Reader.ReadAsync(identity,kind,query,token);}
        public Task<DocumentDetailResult> ReadDetailAsync(AuthoritativeIdentity identity,DocumentKind kind,DocumentDetailQuery query,CancellationToken token)
            => source.Reader.ReadDetailAsync(identity,kind,query,token);
    }
}
