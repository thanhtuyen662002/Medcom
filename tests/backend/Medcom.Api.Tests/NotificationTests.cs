using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class NotificationTests
{
    [Fact]
    public void Notification_DTO_exactly_covers_every_current_native_column()
    {
        var directory=new DirectoryInfo(AppContext.BaseDirectory);
        while(directory is not null&&!File.Exists(Path.Combine(directory.FullName,"inventories/source/20261010/notification-api-source.json")))directory=directory.Parent;
        Assert.NotNull(directory);using var source=JsonDocument.Parse(File.ReadAllText(Path.Combine(directory.FullName,"inventories/source/20261010/notification-api-source.json")));
        var columns=source.RootElement.GetProperty("columns").EnumerateArray().ToArray();
        var properties=typeof(NotificationRow).GetProperties();Assert.Equal(22,columns.Length);Assert.Equal(22,properties.Length);
        foreach(var column in columns){var property=Assert.Single(properties,p=>p.Name.Equals(column.GetProperty("column").GetString(),StringComparison.OrdinalIgnoreCase));
            Assert.Equal(column.GetProperty("jsonField").GetString(),JsonNamingPolicy.CamelCase.ConvertName(property.Name));}
    }
    [Theory]
    [InlineData("purchase-orders","AP_OrderFrm")][InlineData("inbound-requests","IV_InboundRequestFrm")]
    public async Task Existing_document_forms_use_their_authorized_detail_reader(string module,string form)
    {
        var row=NotificationSource.Sample() with{ErpFormName=form};var documents=new NotificationDocuments();
        var identity=PurchaseQuerySource.NewIdentity() with{Capabilities=[module+".read"],BranchIds=["B2"]};
        var target=await NotificationNavigation.ResolveAsync(row,identity,new UnavailableErpScreenService(),documents,default);
        Assert.True(target.CanOpen);Assert.Equal("B2",target.BranchId);Assert.Equal(form,target.FormId);Assert.Equal(row.DocumentId,documents.LastDocument);
        Assert.Equal(module,target.ModuleId);Assert.StartsWith("/api/documents/"+module+"/detail?documentId=",target.DetailApi,StringComparison.Ordinal);
    }
    [Theory]
    [InlineData("/api/notifications")][InlineData("/api/notifications/1")][InlineData("/api/notifications/1/target")]
    public async Task Anonymous_reads_are_rejected(string path)
    {
        var source=new NotificationSource();await using var fixture=await Start(source);
        using var response=await fixture.Client.GetAsync(path);Assert.Equal(HttpStatusCode.Unauthorized,response.StatusCode);Assert.Equal(0,source.Calls);
    }
    [Theory]
    [InlineData("?ToUserID=other")][InlineData("?username=other")][InlineData("?page=1&page=2")]
    [InlineData("?page=0")][InlineData("?page=1001")][InlineData("?pageSize=101")]
    [InlineData("?page=+1")][InlineData("?unreadOnly=1")][InlineData("?unreadOnly=")]
    public async Task Invalid_paging_and_recipient_overrides_never_reach_the_provider(string query)
    {
        var source=new NotificationSource();await using var fixture=await Start(source);await fixture.Login();
        using var response=await fixture.Client.GetAsync("/api/notifications"+query);Assert.Equal(HttpStatusCode.BadRequest,response.StatusCode);Assert.Equal(0,source.Calls);
    }
    [Fact]
    public async Task List_keeps_all_22_fields_and_nullable_values_with_page_and_unread_count()
    {
        var source=new NotificationSource();await using var fixture=await Start(source);await fixture.Login();
        var response=await fixture.Json("/api/notifications?page=2&pageSize=10&unreadOnly=true");
        Assert.Equal((2,10,true),source.Selection);var data=response.GetProperty("data");
        Assert.Equal(2,data.GetProperty("page").GetInt32());Assert.Equal(8,data.GetProperty("unreadCount").GetInt64());
        var row=data.GetProperty("rows")[0];Assert.Equal(22,row.EnumerateObject().Count());Assert.Equal(JsonValueKind.Null,row.GetProperty("viewDate").ValueKind);
        Assert.Equal(source.Row.Message,row.GetProperty("message").GetString());Assert.Equal("javascript:unsafe()",row.GetProperty("webRoute").GetString());
        var schema=ApiContractCatalog.Build()["components"]!["schemas"]![nameof(NotificationRow)]!;
        Assert.Equal(22,schema["required"]!.AsArray().Count);Assert.False(schema["additionalProperties"]!.GetValue<bool>());
    }
    [Theory]
    [InlineData("missing",404)][InlineData("denied",403)][InlineData("unavailable",503)]
    public async Task Personal_detail_does_not_reveal_another_recipient_or_unavailable_data(string mode,int status)
    {
        var source=new NotificationSource{Mode=mode};await using var fixture=await Start(source);await fixture.Login();
        using var response=await fixture.Client.GetAsync("/api/notifications/1");Assert.Equal(status,(int)response.StatusCode);
        Assert.DoesNotContain("Synthetic notification",await response.Content.ReadAsStringAsync(),StringComparison.Ordinal);
    }
    [Theory]
    [InlineData("missing", "notification_document_missing")][InlineData("unknown", "notification_form_unsupported")]
    [InlineData("ambiguous", "notification_form_ambiguous")][InlineData("denied", "notification_document_denied")]
    public async Task Unsafe_or_unusable_targets_are_closed_without_running_document_queries(string mode,string reason)
    {
        var row=NotificationSource.Sample();var identity=PurchaseQuerySource.NewIdentity();
        row=mode switch {"missing"=>row with{DocumentId=null},"unknown"=>row with{ErpFormName="dbo.SY_User",WebFormName=null},
            "ambiguous"=>row with{WebFormName="sales-orders"},_=>row};
        var screens=DispatchProxy.Create<IErpScreenService,NotificationScreens>();
        var target=await NotificationNavigation.ResolveAsync(row,identity with{Capabilities=[]},screens,new UnavailableDocumentReader(),default);
        Assert.False(target.CanOpen);Assert.Equal(reason,target.Reason);Assert.Null(target.DetailApi);Assert.Empty(((NotificationScreens)(object)screens).Calls);
    }
    [Theory]
    [InlineData("purchase-requests")][InlineData("sales-orders")][InlineData("internal-transfer-requests")]
    [InlineData("warehouse-qr")][InlineData("sales-qr")][InlineData("machine-movements")][InlineData("machine-repairs")]
    public async Task Click_uses_a_finite_form_and_original_document_key_in_an_authorized_branch(string module)
    {
        var screens=DispatchProxy.Create<IErpScreenService,NotificationScreens>();var probe=(NotificationScreens)(object)screens;
        probe.VisibleBranch="B2";
        var row=NotificationSource.Sample() with{ErpFormName=ErpScreenCatalog.Get(module)!.FormId,DocumentId="SYNTHETIC/1 & 2"};
        var identity=PurchaseQuerySource.NewIdentity() with{Capabilities=[module+".read"],BranchIds=["B1","B2"]};
        var target=await NotificationNavigation.ResolveAsync(row,identity,screens,new UnavailableDocumentReader(),default);
        Assert.True(target.CanOpen);Assert.Equal(module,target.ModuleId);Assert.Equal(row.DocumentId,target.DocumentId);Assert.Equal("B2",target.BranchId);
        Assert.Equal(row.ErpFormName,target.FormId);Assert.Contains("documentId=SYNTHETIC%2F1%20%26%202",target.DetailApi,StringComparison.Ordinal);
        Assert.All(probe.Calls,c=>{Assert.Equal(row.DocumentId,c.Document);Assert.Equal(1,c.Size);});
        Assert.DoesNotContain("javascript",target.DetailApi,StringComparison.Ordinal);
    }
    [Theory]
    [InlineData("changed",400)][InlineData("lost",404)]
    public async Task Click_rechecks_personal_notification_before_returning_navigation(string mode,int status)
    {
        var source=new NotificationSource{Mode=mode};await using var fixture=await Start(source);await fixture.Login();
        using var response=await fixture.Client.GetAsync("/api/notifications/1/target");Assert.Equal(status,(int)response.StatusCode);
        Assert.DoesNotContain("detailApi",await response.Content.ReadAsStringAsync(),StringComparison.Ordinal);
    }
    [Theory]
    [InlineData("no-origin",403)][InlineData("foreign-origin",403)][InlineData("no-scope",409)]
    [InlineData("stale-scope",409)][InlineData("no-csrf",403)][InlineData("missing-view",400)][InlineData("other-user",400)]
    [InlineData("duplicate",400)][InlineData("wrong-type",400)][InlineData("wrong-case",400)]
    public async Task Mark_read_requires_csrf_origin_current_scope_and_only_the_typed_boolean(string variant,int status)
    {
        var source=new NotificationSource();await using var fixture=await Start(source);await fixture.Login();
        var list=await fixture.Json("/api/notifications");var csrf=await fixture.Json("/api/auth/csrf");
        using var request=new HttpRequestMessage(HttpMethod.Post,"/api/notifications/1/read");
        request.Content=JsonContent.Create(variant=="missing-view"?new{}:variant=="other-user"?(object)new{isView=true,toUserId="other"}:new{isView=true});
        if(variant is "duplicate" or "wrong-type" or "wrong-case")request.Content=new StringContent(variant switch{"duplicate"=>"{\"isView\":true,\"isView\":false}","wrong-type"=>"{\"isView\":1}",_=>"{\"IsView\":true}"},System.Text.Encoding.UTF8,"application/json");
        if(variant!="no-origin")request.Headers.Add("Origin",variant=="foreign-origin"?"https://example.invalid":fixture.Client.BaseAddress!.GetLeftPart(UriPartial.Authority));
        if(variant!="no-scope")request.Headers.Add("X-Medcom-Read-Scope",variant=="stale-scope"?new string('0',64):list.GetProperty("readScope").GetString());
        if(variant!="no-csrf")request.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());
        using var response=await fixture.Client.SendAsync(request);Assert.Equal(status,(int)response.StatusCode);Assert.Equal(0,source.Writes);
    }
    [Fact]
    public async Task Valid_mark_read_returns_the_authoritative_row_and_allows_marking_unread()
    {
        var source=new NotificationSource();await using var fixture=await Start(source);await fixture.Login();
        var list=await fixture.Json("/api/notifications");var csrf=await fixture.Json("/api/auth/csrf");
        foreach(var isView in new[]{true,false}) {
            using var request=new HttpRequestMessage(HttpMethod.Post,"/api/notifications/1/read"){Content=JsonContent.Create(new{isView})};
            request.Headers.Add("Origin",fixture.Client.BaseAddress!.GetLeftPart(UriPartial.Authority));request.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());request.Headers.Add("X-Medcom-Read-Scope",list.GetProperty("readScope").GetString());
            using var response=await fixture.Client.SendAsync(request);Assert.Equal(HttpStatusCode.OK,response.StatusCode);
            using var body=JsonDocument.Parse(await response.Content.ReadAsStringAsync());Assert.Equal(isView,body.RootElement.GetProperty("data").GetProperty("isView").GetBoolean());
        }
        Assert.Equal(2,source.Writes);
    }
    private static Task<PurchaseHttpFixture> Start(NotificationSource source)=>PurchaseHttpFixture.Start(services=>services.AddSingleton<INotificationQueries>(source));
}
internal sealed class NotificationSource:INotificationQueries
{
    internal int Calls,Writes,Details;internal string Mode="ok";internal (int,int,bool) Selection;
    internal NotificationRow Row=Sample();
    internal static NotificationRow Sample()=>new(1,"synthetic-sender","qa-user","Synthetic notification","Synthetic notification message","2026-10-10T12:00:00","Info",null,"ERP",ErpScreenCatalog.Get("purchase-requests")!.FormId,null,"javascript:unsafe()","SYNTHETIC-DOC",null,null,false,null,true,true,true,null,null);
    public Task<ErpReadResult<NotificationPage>> ListAsync(int page,int size,bool unreadOnly,CancellationToken token){Calls++;Selection=(page,size,unreadOnly);return Task.FromResult(new ErpReadResult<NotificationPage>(ErpReadOutcome.Success,new(page,size,8,8,[Row])));}
    public Task<ErpReadResult<NotificationRow>> DetailAsync(int id,CancellationToken token){Calls++;Details++;return Task.FromResult(Mode switch{"missing" or "lost" when Details>1=>new ErpReadResult<NotificationRow>(ErpReadOutcome.NotFound),"missing"=>new(ErpReadOutcome.NotFound),"denied"=>new(ErpReadOutcome.Denied),"unavailable"=>new(ErpReadOutcome.Unavailable),_=>new(ErpReadOutcome.Success,Mode=="changed"&&Details>1?Row with{DocumentId="OTHER"}:Row)});}
    public Task<ErpReadResult<NotificationRow>> SetReadAsync(int id,bool isView,CancellationToken token){Calls++;Writes++;Row=Row with{IsView=isView};return Task.FromResult(new ErpReadResult<NotificationRow>(ErpReadOutcome.Success,Row));}
}
public class NotificationScreens:DispatchProxy
{
    public string VisibleBranch="B1";public List<(string Module,string Branch,string Document,int Size)> Calls=[];
    protected override object? Invoke(MethodInfo? method,object?[]? args)
    {
        if(method?.Name!=nameof(IErpScreenService.DetailAsync)||args is null)throw new InvalidOperationException("Unexpected document operation");
        var module=(string)args[0]!;var branch=(string)args[1]!;var document=(string)args[2]!;Calls.Add((module,branch,document,(int)args[4]!));
        var row=new ErpDocumentDetail(document,branch,new string('a',64),new Dictionary<string,object?>(),new([],1,1,false),null,null,[]);
        return Task.FromResult(branch==VisibleBranch?new ErpReadResult<ErpDocumentDetail>(ErpReadOutcome.Success,row):new(ErpReadOutcome.NotFound));
    }
}
internal sealed class NotificationDocuments:IDocumentReader
{
    internal string? LastDocument;
    public Task<DocumentResult> ReadAsync(AuthoritativeIdentity identity,DocumentKind kind,DocumentQuery query,CancellationToken token)=>throw new InvalidOperationException("Unexpected list operation");
    public Task<DocumentDetailResult> ReadDetailAsync(AuthoritativeIdentity identity,DocumentKind kind,DocumentDetailQuery query,CancellationToken token)
    {LastDocument=query.DocumentId;return Task.FromResult(new DocumentDetailResult(DocumentOutcome.Success,new(new(query.DocumentId,"2026-10-10","B2",null,null),[],[],1,1,false)));}
}
