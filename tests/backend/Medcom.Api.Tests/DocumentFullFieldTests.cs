using System.Data;
using System.Data.Common;
using System.Net;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class DocumentFullFieldTests
{
    private static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders,false)] [InlineData(DocumentKind.PurchaseOrders,true)]
    [InlineData(DocumentKind.InboundRequests,false)] [InlineData(DocumentKind.InboundRequests,true)]
    public async Task Actual_SQL_reader_returns_every_source_field_with_nulls_unicode_precision_and_wall_clock_time(DocumentKind kind,bool nulls)
    {
        var source=new FullReadSource(kind){Nulls=nulls};
        var list=await source.Reader.ReadAsync(source.Identity,kind,new(1,20,null,null),default);
        Assert.Equal(DocumentOutcome.Success,list.Outcome);
        var detail=await source.Reader.ReadDetailAsync(source.Identity,kind,new("DOC",1,20),default);
        Assert.Equal(DocumentOutcome.Success,detail.Outcome);
        var header=kind==DocumentKind.PurchaseOrders
            ? JsonSerializer.SerializeToElement(detail.Detail!.Document.PurchaseOrderHeader,Json)
            : JsonSerializer.SerializeToElement(detail.Detail!.Document.InboundRequestHeader,Json);
        var listHeader=kind==DocumentKind.PurchaseOrders
            ? JsonSerializer.SerializeToElement(Assert.Single(list.Page!.Rows).PurchaseOrderHeader,Json)
            : JsonSerializer.SerializeToElement(Assert.Single(list.Page!.Rows).InboundRequestHeader,Json);
        Assert.Equal(header.GetRawText(),listHeader.GetRawText());
        var line=kind==DocumentKind.PurchaseOrders
            ? JsonSerializer.SerializeToElement(Assert.Single(detail.Detail!.PurchaseOrderLines).Fields,Json)
            : JsonSerializer.SerializeToElement(Assert.Single(detail.Detail!.InboundRequestLines).Fields,Json);
        var expected=source.LastRows!.Rows[0];
        AssertProjection(header,expected,13,kind==DocumentKind.PurchaseOrders?FullDocumentRows.OrderHeader:FullDocumentRows.InboundHeader);
        AssertProjection(line,expected,kind==DocumentKind.PurchaseOrders?32:50,
            kind==DocumentKind.PurchaseOrders?FullDocumentRows.OrderLine:FullDocumentRows.InboundLine);
        Assert.Equal("2026-10-01T12:34:56.997",header.GetProperty("documentDate").GetString());
        Assert.Equal(nulls?null:kind==DocumentKind.PurchaseOrders?"999999999999999999999999.12":"999999999999999999",
            line.GetProperty(kind==DocumentKind.PurchaseOrders?"quantity":"setQuantityByDocument").GetString());
        Assert.Equal("DOC",line.GetProperty("documentId").GetString());
    }

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders,1)] [InlineData(DocumentKind.InboundRequests,1)]
    [InlineData(DocumentKind.PurchaseOrders,2)] [InlineData(DocumentKind.InboundRequests,2)]
    public async Task Empty_line_page_retains_complete_authorized_header_and_no_fabricated_line(DocumentKind kind,int page)
    {
        var source=new FullReadSource(kind){NoLines=true};
        var result=await source.Reader.ReadDetailAsync(source.Identity,kind,new("DOC",page,20),default);
        Assert.Equal(DocumentOutcome.Success,result.Outcome);Assert.False(result.Detail!.HasMore);
        Assert.Empty(result.Detail.PurchaseOrderLines);Assert.Empty(result.Detail.InboundRequestLines);
        if(kind==DocumentKind.PurchaseOrders)Assert.NotNull(result.Detail.Document.PurchaseOrderHeader);
        else Assert.NotNull(result.Detail.Document.InboundRequestHeader);
    }

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders)] [InlineData(DocumentKind.InboundRequests)]
    public async Task Added_fields_cannot_bypass_branch_or_capability_and_missing_projection_is_unavailable(DocumentKind kind)
    {
        var source=new FullReadSource(kind);
        var denied=source.Identity with {BranchIds=["OTHER"]};
        Assert.Equal(DocumentOutcome.Denied,(await source.Reader.ReadDetailAsync(denied,kind,new("DOC",1,20),default)).Outcome);
        Assert.Equal(DocumentOutcome.Denied,(await source.Reader.ReadAsync(source.Identity with {Capabilities=[]},kind,new(1,20,null,null),default)).Outcome);
        Assert.Equal(0,source.DocumentReads);
        source.MissingProjection=true;
        var unavailable=await source.Reader.ReadDetailAsync(source.Identity,kind,new("DOC",1,20),default);
        Assert.Equal(DocumentOutcome.Unavailable,unavailable.Outcome);Assert.Null(unavailable.Detail);
    }

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders,0d)] [InlineData(DocumentKind.PurchaseOrders,-0.125d)]
    [InlineData(DocumentKind.InboundRequests,0d)] [InlineData(DocumentKind.InboundRequests,-0.125d)]
    public async Task Source_float_zero_and_negative_values_are_preserved(DocumentKind kind,double value)
    {
        var source=new FullReadSource(kind){FloatValue=value};
        var result=await source.Reader.ReadDetailAsync(source.Identity,kind,new("DOC",1,20),default);
        Assert.Equal(DocumentOutcome.Success,result.Outcome);
        Assert.Equal(value,kind==DocumentKind.PurchaseOrders?result.Detail!.Document.PurchaseOrderHeader!.RateExchange
            :Assert.Single(result.Detail!.InboundRequestLines).Fields!.UnitFactor);
    }

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders)] [InlineData(DocumentKind.InboundRequests)]
    public async Task Nonfinite_source_float_never_becomes_a_successful_or_invalid_JSON_response(DocumentKind kind)
    {
        var source=new FullReadSource(kind){FloatValue=double.NaN};
        var result=await source.Reader.ReadDetailAsync(source.Identity,kind,new("DOC",1,20),default);
        Assert.Equal(DocumentOutcome.Unavailable,result.Outcome);Assert.Null(result.Detail);
    }

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders)] [InlineData(DocumentKind.InboundRequests)]
    public async Task SQL_zero_millisecond_projection_is_normalized_without_a_timezone(DocumentKind kind)
    {
        var source=new FullReadSource(kind){DateWithoutFraction=true};
        var result=await source.Reader.ReadDetailAsync(source.Identity,kind,new("DOC",1,20),default);
        Assert.Equal(DocumentOutcome.Success,result.Outcome);
        Assert.Equal("2026-10-01T12:34:56.000",kind==DocumentKind.PurchaseOrders?result.Detail!.Document.PurchaseOrderHeader!.DocumentDate
            :result.Detail!.Document.InboundRequestHeader!.DocumentDate);
    }

    [Theory]
    [InlineData(DocumentKind.PurchaseOrders,"purchase-orders",19,12)]
    [InlineData(DocumentKind.InboundRequests,"inbound-requests",37,25)]
    public async Task HTTPS_document_routes_serialize_complete_headers_and_lines_and_contract_matches_current_source(DocumentKind kind,string name,int heads,int lines)
    {
        var source=new FullReadSource(kind);
        await using var fixture=await PurchaseHttpFixture.Start(services=>services.AddSingleton<IDocumentReader>(source.Reader));
        fixture.Authority.Identity=source.Identity;
        using(var unauthorized=await fixture.Client.GetAsync("/api/documents/field-contract?kind="+name))
            Assert.Equal(HttpStatusCode.Unauthorized,unauthorized.StatusCode);
        await fixture.Login();
        var contract=await fixture.Json("/api/documents/field-contract?kind="+name);
        Assert.Equal(2,contract.GetProperty("contractVersion").GetInt32());
        Assert.Equal(heads,contract.GetProperty("header").GetProperty("fields").GetArrayLength());
        Assert.Equal(lines,contract.GetProperty("lines").GetProperty("fields").GetArrayLength());
        Assert.Equal(0,source.DocumentReads);
        var list=await fixture.Json("/api/v2/documents/"+name);
        var detail=await fixture.Json("/api/v2/documents/"+name+"/detail?documentId=DOC");
        var legacyList=await fixture.Json("/api/documents/"+name);
        var legacyDetail=await fixture.Json("/api/documents/"+name+"/detail?documentId=DOC");
        Assert.Equal(new[]{"branchId","documentDate","documentId","isLocked","statusId","statusName"},
            legacyList.GetProperty("rows")[0].EnumerateObject().Select(p=>p.Name).Order(StringComparer.Ordinal).ToArray());
        Assert.False(legacyDetail.GetProperty("document").TryGetProperty("purchaseOrderHeader",out _));
        Assert.False(legacyDetail.GetProperty("document").TryGetProperty("inboundRequestHeader",out _));
        var legacyLines=legacyDetail.GetProperty(kind==DocumentKind.PurchaseOrders?"purchaseOrderLines":"inboundRequestLines");
        Assert.False(legacyLines[0].TryGetProperty("fields",out _));
        foreach(var field in contract.GetProperty("header").GetProperty("fields").EnumerateArray())
        {
            var path=field.GetProperty("jsonPath").GetString()!.Split('.');
            var listPath=field.GetProperty("listJsonPath").GetString()!.Split('.');
            var value=detail.GetProperty(path[0]).GetProperty(path[1]).GetProperty(path[2]);
            var listValue=list.GetProperty("rows")[0].GetProperty(listPath[1]).GetProperty(listPath[2]);
            Assert.Equal(value.GetRawText(),listValue.GetRawText());
        }
        foreach(var field in contract.GetProperty("lines").GetProperty("fields").EnumerateArray())
        {
            var path=field.GetProperty("jsonPath").GetString()!.Split('.');
            Assert.NotEqual(JsonValueKind.Undefined,detail.GetProperty(path[0][..^2])[0].GetProperty(path[1]).GetProperty(path[2]).ValueKind);
            Assert.Equal(JsonValueKind.Null,field.GetProperty("listJsonPath").ValueKind);
        }
    }

    [Fact]
    public async Task Purchase_list_and_detail_expose_all_14_and_9_source_fields_without_changing_command_token_or_receipt_shape()
    {
        await using var fixture=await PurchaseHttpFixture.Start();fixture.Source.Seed();await fixture.Login();
        var before=fixture.Source.Documents[0];
        var token=Medcom.Application.PurchaseRequests.PurchaseRequestCommandRules.EqualityToken(before);
        var raw=JsonSerializer.Serialize(before,Json);
        var list=await fixture.Json("/api/v2/purchase-requests");
        var detail=await fixture.Json("/api/v2/purchase-requests/detail?documentId=QA-DOC");
        var data=detail.GetProperty("data");var fields=data.GetProperty("sourceFields");
        Assert.Equal(14,fields.GetProperty("header").EnumerateObject().Count());
        Assert.Equal(fields.GetProperty("header").GetRawText(),list.GetProperty("data").GetProperty("rows")[0].GetProperty("fields").GetRawText());
        Assert.Equal(9,fields.GetProperty("lines")[0].EnumerateObject().Count());
        Assert.Equal("QA-DOC",fields.GetProperty("lines")[0].GetProperty("purchaseRequestId").GetString());
        Assert.Equal("999999999999999999",fields.GetProperty("lines")[0].GetProperty("quantity").GetString());
        Assert.Equal(JsonValueKind.Null,fields.GetProperty("header").GetProperty("notes").ValueKind);
        Assert.Equal(token,data.GetProperty("stateToken").GetString());
        Assert.Equal(raw,JsonSerializer.Serialize(fixture.Source.Documents[0],Json));
        Assert.False(data.GetProperty("commandAccess").GetProperty("canSave").GetBoolean());
        var legacyList=await fixture.Json("/api/purchase-requests");
        var legacyDetail=await fixture.Json("/api/purchase-requests/detail?documentId=QA-DOC");
        Assert.False(legacyList.GetProperty("data").GetProperty("rows")[0].TryGetProperty("fields",out _));
        Assert.False(legacyDetail.GetProperty("data").TryGetProperty("sourceFields",out _));
        Assert.Equal(legacyDetail.GetProperty("data").GetProperty("document").GetRawText(),data.GetProperty("document").GetRawText());
        Assert.Equal(token,legacyDetail.GetProperty("data").GetProperty("stateToken").GetString());
        var contract=await fixture.Json("/api/documents/field-contract?kind=purchase-requests");
        foreach(var field in contract.GetProperty("header").GetProperty("fields").EnumerateArray())
        {
            var path=field.GetProperty("jsonPath").GetString()!.Split('.');
            Assert.NotEqual(JsonValueKind.Undefined,detail.GetProperty(path[0]).GetProperty(path[1]).GetProperty(path[2]).GetProperty(path[3]).ValueKind);
        }
    }

    [Theory]
    [InlineData("kind=purchase-orders",403)] [InlineData("kind=inbound-requests",403)]
    [InlineData("kind=unknown",400)] [InlineData("",400)]
    [InlineData("kind=purchase-requests&kind=purchase-orders",400)]
    [InlineData("kind=purchase-requests&table=SY_User",400)]
    public async Task Field_contract_rejects_unauthorized_kinds_and_ambiguous_or_arbitrary_queries(string query,int status)
    {
        await using var fixture=await PurchaseHttpFixture.Start();await fixture.Login();
        using var response=await fixture.Client.GetAsync("/api/documents/field-contract?"+query);
        Assert.Equal(status,(int)response.StatusCode);Assert.Equal(0,fixture.Source.Opens);
    }

    [Theory]
    [InlineData("purchase-orders")] [InlineData("inbound-requests")]
    public async Task Version_2_refuses_incomplete_provider_data_while_legacy_wire_remains_compatible(string kind)
    {
        await using var fixture=await PurchaseHttpFixture.Start(services=>services.AddSingleton<IDocumentReader>(new LegacyOnlyDocumentReader()));
        fixture.Authority.Identity=fixture.Authority.Identity with {Capabilities=[kind+".read"]};
        await fixture.Login();
        foreach(var suffix in new[]{"","/detail?documentId=DOC"})
        {
            using var unavailable=await fixture.Client.GetAsync("/api/v2/documents/"+kind+suffix);
            Assert.Equal(HttpStatusCode.ServiceUnavailable,unavailable.StatusCode);
            Assert.False(unavailable.Headers.Contains("X-Medcom-Read-Scope"));
            Assert.False(unavailable.Headers.Contains("X-Medcom-Data-Projection"));
            Assert.False(unavailable.Headers.Contains("X-Medcom-Full-Data-Path"));
            using var original=await fixture.Client.GetAsync("/api/documents/"+kind+suffix);
            Assert.Equal(HttpStatusCode.OK,original.StatusCode);
        }
    }

    [Fact]
    public async Task Field_catalog_covers_the_entire_pinned_table_inventory_and_the_saved_consumer_contract()
    {
        var root=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../../../"));
        using var saved=JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(root,"docs/backend/document-field-contract.json")));
        var tables=new Dictionary<string,JsonElement>(StringComparer.Ordinal);
        foreach(var file in Directory.GetFiles(Path.Combine(root,"inventories/source/20261002"),"table-*.json"))
        {
            using var doc=JsonDocument.Parse(await File.ReadAllTextAsync(file));
            foreach(var table in doc.RootElement.GetProperty("objects").EnumerateArray())tables[table.GetProperty("name").GetString()!]=table.Clone();
        }
        await using var fixture=await PurchaseHttpFixture.Start();
        fixture.Authority.Identity=fixture.Authority.Identity with {Capabilities=["purchase-requests.read","purchase-orders.read","inbound-requests.read"]};
        await fixture.Login();var total=0;
        foreach(var kind in new[]{"purchase-orders","inbound-requests","purchase-requests"})
        {
            var contract=await fixture.Json("/api/documents/field-contract?kind="+kind);
            foreach(var part in new[]{"header","lines"})
            {
                var table=contract.GetProperty(part);var fields=table.GetProperty("fields").EnumerateArray().ToArray();
                var columns=tables[table.GetProperty("table").GetString()!].GetProperty("columns").EnumerateArray().ToArray();
                var expected=saved.RootElement.GetProperty("kinds").GetProperty(kind).GetProperty(part).GetProperty("fields").EnumerateArray().ToArray();
                Assert.Equal(columns.Length,fields.Length);Assert.Equal(expected.Length,fields.Length);total+=fields.Length;
                for(var i=0;i<columns.Length;i++)
                {
                    Assert.Equal(columns[i].GetProperty("name").GetString(),fields[i].GetProperty("column").GetString());
                    Assert.Equal(columns[i].GetProperty("type").GetString()+columns[i].GetProperty("typeArguments").GetString(),fields[i].GetProperty("sqlType").GetString());
                    Assert.Equal(columns[i].GetProperty("nullable").GetBoolean(),fields[i].GetProperty("nullable").GetBoolean());
                    foreach(var p in expected[i].EnumerateObject())Assert.Equal(p.Value.GetRawText(),fields[i].GetProperty(p.Name).GetRawText());
                }
            }
        }
        Assert.Equal(116,total);Assert.Equal(0,fixture.Source.Opens);
    }

    private static void AssertProjection(JsonElement json,DataRow row,int start,(string Name,Type Type,bool Nullable,string SqlType)[] columns)
    {
        Assert.Equal(columns.Length,json.EnumerateObject().Count());
        for(var i=0;i<columns.Length;i++)
        {
            var name=columns[i].Name switch {"isLock"=>"isLock","QRPrintType"=>"qrPrintType","BBKCUrl"=>"bbkcUrl",_=>char.ToLowerInvariant(columns[i].Name[0])+columns[i].Name[1..].Replace("ID","Id",StringComparison.Ordinal).Replace("URL","Url",StringComparison.Ordinal)};
            var expected=JsonSerializer.SerializeToElement(row.IsNull(start+i)?null:row[start+i],Json);
            Assert.Equal(expected.GetRawText(),json.GetProperty(name).GetRawText());
        }
    }
}

internal sealed class LegacyOnlyDocumentReader:IDocumentReader
{
    private static readonly DocumentSummary Summary=new("DOC","2026-10-01","QA-A",1,false);
    public Task<DocumentResult> ReadAsync(AuthoritativeIdentity identity,DocumentKind kind,DocumentQuery query,CancellationToken token)
        => Task.FromResult(new DocumentResult(DocumentOutcome.Success,new([Summary],query.Page,query.PageSize,false)));
    public Task<DocumentDetailResult> ReadDetailAsync(AuthoritativeIdentity identity,DocumentKind kind,DocumentDetailQuery query,CancellationToken token)
        => Task.FromResult(new DocumentDetailResult(DocumentOutcome.Success,new(Summary,[],[],query.Page,query.PageSize,false)));
}

internal sealed class FullReadSource
{
    private readonly DocumentKind kind;
    private readonly LegacyUser user=new("qa-user","Synthetic user","synthetic-stored-value",false,"qa-group",true,
        ["purchase-orders.read","inbound-requests.read","purchase-requests.read"],["QA-A","QA-B"]);
    private readonly ItemDisplayRecordingSource display=new();
    internal readonly AuthoritativeIdentity Identity;
    internal readonly SqlDocumentReader Reader;
    internal DataTable? LastRows;
    internal bool Nulls,NoLines,MissingProjection;
    internal double? FloatValue{get;set;}
    internal bool DateWithoutFraction{get;set;}
    internal int DocumentReads;
    internal string? LastDocumentSql;
    internal Dictionary<string,object?> LastDocumentParameters=[];
    internal FullReadSource(DocumentKind kind)
    {
        this.kind=kind;Identity=PurchaseQuerySource.NewIdentity() with {Capabilities=user.Capabilities!};
        Reader=new(PurchaseQuerySource.Company,()=>new DisplayConnection(Read),(_,_)=>Task.FromResult<LegacyUser?>(user));
    }
    private DbDataReader Read(DbCommand c)
    {
        if(ItemDisplayRecordingSource.Matches(c.CommandText))return display.Read(c);
        if(c.CommandText==SqlLegacyBranchScope.NativeUserText)
        {
            var t=InboundModel.Table(("U",typeof(string)),("P",typeof(string)),("D",typeof(bool)),("G",typeof(string)),("GD",typeof(bool)),("B",typeof(string)));
            t.Rows.Add(user.Username,user.StoredHash,false,user.GroupId,false,"QA-A");return t.CreateDataReader();
        }
        if(c.CommandText==SqlLegacyBranchScope.RestrictedText)
        {var t=InboundModel.Table(("BranchID",typeof(string)));t.Rows.Add("QA-A");t.Rows.Add("QA-B");return t.CreateDataReader();}
        DocumentReads++;
        LastDocumentSql=c.CommandText;
        LastDocumentParameters=c.Parameters.Cast<DbParameter>().ToDictionary(p=>p.ParameterName,p=>p.Value,StringComparer.Ordinal);
        foreach(var verb in new[]{"UPDATE ","INSERT ","DELETE ","EXEC "})
            Assert.DoesNotContain(verb,c.CommandText,StringComparison.OrdinalIgnoreCase);
        var detail=c.CommandText.Contains("OUTER APPLY",StringComparison.Ordinal);
        Assert.DoesNotContain("SELECT *",c.CommandText,StringComparison.OrdinalIgnoreCase);
        Assert.Contains("EXISTS (SELECT 1 FROM dbo.SY_User",c.CommandText);
        var header=kind==DocumentKind.PurchaseOrders?FullDocumentRows.OrderHeader:FullDocumentRows.InboundHeader;
        foreach(var col in header)Assert.Contains("D.["+col.Name+"]",c.CommandText);
        if(detail)
        {
            Assert.Equal("DOC",c.Parameters["@document"].Value);
            foreach(var col in kind==DocumentKind.PurchaseOrders?FullDocumentRows.OrderLine:FullDocumentRows.InboundLine)
                Assert.Contains("C.["+col.Name+"]",c.CommandText);
        }
        var t0=InboundModel.Table(("Doc",typeof(string)),("Date",typeof(DateTime)),("Branch",typeof(string)),("Status",typeof(int)),("Lock",typeof(bool)));
        if(detail)
        {
            foreach(var name in new[]{"Row","Item","Q1","Q2","Q3","Q4","Name"})t0.Columns.Add(name,typeof(string));
            t0.Columns.Add("StatusRows",typeof(long));
            t0.Rows.Add("DOC",new DateTime(2026,10,1),"QA-A",1,false,NoLines?DBNull.Value:"ROW",NoLines?DBNull.Value:"ITEM",
                NoLines?DBNull.Value:kind==DocumentKind.PurchaseOrders?"999999999999999999999999.12":"999999999999999999",
                DBNull.Value,DBNull.Value,DBNull.Value,"Synthetic",1L);
        }
        else
        {t0.Columns.Add("Name",typeof(string));t0.Columns.Add("StatusRows",typeof(long));t0.Rows.Add("DOC",new DateTime(2026,10,1),"QA-A",1,false,"Synthetic",1L);}
        LastRows=MissingProjection?t0:FullDocumentRows.Complete(t0,kind,detail,Nulls);
        if(FloatValue is {} value)
            foreach(DataColumn col in LastRows.Columns)
                if(col.DataType==typeof(double))LastRows.Rows[0][col]=value;
        if(DateWithoutFraction)
            foreach(DataColumn col in LastRows.Columns)
                if(LastRows.Rows[0][col] is string date&&date.EndsWith(".997",StringComparison.Ordinal))
                    LastRows.Rows[0][col]=date[..^4];
        return LastRows.CreateDataReader();
    }
}
