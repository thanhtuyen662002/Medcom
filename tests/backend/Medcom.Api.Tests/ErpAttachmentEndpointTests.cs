using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Medcom.Api;
using Medcom.Application;
using Medcom.Contracts;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpAttachmentEndpointTests
{
    internal static readonly byte[] Png=Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC");
    internal static readonly byte[] PreviewPng=Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC");
    internal static readonly string State=new('a',64);
    [Theory]
    [InlineData("good",200)][InlineData("with-preview",200)][InlineData("large",200)][InlineData("unicode-name",200)]
    [InlineData("no-csrf",403)][InlineData("no-origin",403)][InlineData("foreign-origin",403)]
    [InlineData("stale-scope",409)][InlineData("extra-field",400)][InlineData("duplicate-field",400)]
    [InlineData("duplicate-file",400)][InlineData("no-file",400)][InlineData("wrong-type",400)]
    [InlineData("path-name",400)][InlineData("invalid-name",400)][InlineData("bad-slot",400)][InlineData("too-large",413)]
    public async Task Multipart_upload_is_real_binary_and_enforces_the_existing_security_boundary(string variant,int status)
    {
        var service=new Attachments();await using var fixture=await Start(service);await fixture.Login();
        using var request=await Upload(fixture,variant);
        using var response=await fixture.Client.SendAsync(request);Assert.Equal((HttpStatusCode)status,response.StatusCode);
        Assert.Equal(status==200?1:0,service.UploadCalls);
        if(status!=200)return;
        Assert.Equal(variant=="large"?LargePng():Png,service.Bytes);Assert.Equal(variant=="unicode-name"?"ảnh.png":"image.png",service.Last!.AttachmentName);Assert.Equal(2,service.Last.SlotId);
        Assert.Equal(variant=="with-preview"?PreviewPng:Array.Empty<byte>(),service.Small);
        using var body=JsonDocument.Parse(await response.Content.ReadAsStringAsync());Assert.Equal("Committed",body.RootElement.GetProperty("outcome").GetString());
        Assert.False(body.RootElement.GetProperty("receipt").TryGetProperty("fields",out _));
    }
    [Fact]
    public async Task Anonymous_upload_is_denied_and_revoked_module_access_never_reaches_file_storage()
    {
        var service=new Attachments();await using var fixture=await Start(service);
        using(var anonymous=await fixture.Client.PostAsync("/api/erp/sales-orders/attachments/upload",new MultipartFormDataContent()))Assert.Equal(HttpStatusCode.Unauthorized,anonymous.StatusCode);
        await fixture.Login();fixture.Authority.Identity=fixture.Authority.Identity with{Capabilities=[]};
        using var request=await Upload(fixture,"good");using var response=await fixture.Client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden,response.StatusCode);Assert.Equal(0,service.UploadCalls);
    }
    [Fact]
    public async Task Content_is_a_binary_image_with_no_JSON_projection_and_remains_document_scoped()
    {
        var service=new Attachments();await using var fixture=await Start(service);await fixture.Login();
        using var response=await fixture.Client.GetAsync("/api/erp/sales-orders/attachments/content?branchId=B1&documentId=D&attachmentId=A&preview=true");
        Assert.Equal(HttpStatusCode.OK,response.StatusCode);Assert.Equal("image/png",response.Content.Headers.ContentType!.MediaType);
        Assert.Equal(Png,await response.Content.ReadAsByteArrayAsync());Assert.True(response.Headers.CacheControl!.NoStore);Assert.True(service.Preview);
        using var missing=await fixture.Client.GetAsync("/api/erp/sales-orders/attachments/content?branchId=B1&documentId=other&attachmentId=A");
        Assert.Equal(HttpStatusCode.NotFound,missing.StatusCode);
    }
    [Fact]
    public async Task List_exposes_paging_slots_rights_and_names_without_fields_wrappers()
    {
        var service=new Attachments();await using var fixture=await Start(service);await fixture.Login();
        var response=await fixture.Json("/api/erp/sales-orders/attachments?branchId=B1&documentId=D&page=2&pageSize=3");
        var data=response.GetProperty("data");Assert.Equal(2,data.GetProperty("page").GetInt32());Assert.Equal(3,data.GetProperty("pageSize").GetInt32());
        var row=data.GetProperty("rows")[0];Assert.Equal("image.png",row.GetProperty("attachmentName").GetString());Assert.Equal("Tài liệu đính kèm",row.GetProperty("slotName").GetString());
        Assert.DoesNotContain("fields",row.EnumerateObject().Select(p=>p.Name));Assert.Equal(10,row.EnumerateObject().Count());
    }
    [Fact]
    public async Task Delete_requires_JSON_tokens_and_does_not_accept_injected_unknown_properties()
    {
        var service=new Attachments();await using var fixture=await Start(service);await fixture.Login();
        foreach(var extra in new[]{false,true})
        {
            var csrf=await fixture.Json("/api/auth/csrf");var scope=await Scope(fixture);
            using var request=new HttpRequestMessage(HttpMethod.Post,"/api/erp/sales-orders/attachments/delete");
            var text=JsonSerializer.Serialize(new ErpAttachmentDelete("delete-key","B1","D",State,"A",State),new JsonSerializerOptions(JsonSerializerDefaults.Web));
            if(extra)text=text[..^1]+",\"table\":\"SY_User\"}";
            request.Content=new StringContent(text,Encoding.UTF8,"application/json");request.Headers.Add("Origin",fixture.Client.BaseAddress!.GetLeftPart(UriPartial.Authority));
            request.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());request.Headers.Add("X-Medcom-Read-Scope",scope);
            using var response=await fixture.Client.SendAsync(request);Assert.Equal(extra?HttpStatusCode.BadRequest:HttpStatusCode.OK,response.StatusCode);
        }
        Assert.Equal(1,service.DeleteCalls);
    }
    [Fact]
    public void OpenAPI_publishes_file_picker_and_binary_responses_only_on_fixed_supported_modules()
    {
        var api=ApiContractCatalog.Build();
        foreach(var module in ErpScreenCatalog.ModuleIds)
        {
            var path="/api/erp/"+module+"/attachments";Assert.NotNull(api["paths"]![path]);
            if(!ErpAttachmentCatalog.Supports(module)){Assert.Null(api["paths"]![path+"/upload"]);continue;}
            Assert.NotNull(api["paths"]![path+"/content"]!["get"]!["responses"]!["200"]!["content"]!["image/png"]);
            if(!ErpAttachmentCatalog.Writable(module)){Assert.Null(api["paths"]![path+"/upload"]);Assert.Null(api["paths"]![path+"/delete"]);continue;}
            var schema=api["paths"]![path+"/upload"]!["post"]!["requestBody"]!["content"]!["multipart/form-data"]!["schema"]!;
            Assert.Equal("binary",schema["properties"]!["file"]!["format"]!.GetValue<string>());
        }
    }
    private static async Task<PurchaseHttpFixture> Start(Attachments service)
    {
        var fixture=await PurchaseHttpFixture.Start(s=>s.AddSingleton<IErpAttachmentService>(service));
        fixture.Authority.Identity=fixture.Authority.Identity with{Capabilities=ErpScreenCatalog.ModuleIds.Select(m=>m+".read").ToArray()};return fixture;
    }
    private static async Task<string> Scope(PurchaseHttpFixture fixture)
    {using var response=await fixture.Client.GetAsync("/api/workspace");return response.Headers.GetValues("X-Medcom-Read-Scope").Single();}
    private static async Task<HttpRequestMessage> Upload(PurchaseHttpFixture fixture,string variant)
    {
        var csrf=await fixture.Json("/api/auth/csrf");var scope=await Scope(fixture);var form=new MultipartFormDataContent();
        foreach(var (key,value) in new[]{("idempotencyKey","upload-key"),("branchId","B1"),("documentId","D"),("expectedStateToken",State),("slotId",variant=="bad-slot"?"99":"2")})form.Add(new StringContent(value),key);
        if(variant=="extra-field")form.Add(new StringContent("SY_User"),"table");
        if(variant=="duplicate-field")form.Add(new StringContent("B2"),"branchId");
        if(variant!="no-file")
        {
            var bytes=variant=="too-large"?new byte[ErpAttachmentCatalog.MaximumFileBytes+1]:variant=="wrong-type"?Encoding.UTF8.GetBytes("<svg onload='bad'>"):variant=="large"?LargePng():Png;
            form.Add(new ByteArrayContent(bytes),"file",variant=="path-name"?"../image.png":variant=="invalid-name"?"bad|name.png":variant=="unicode-name"?"ảnh.png":"image.png");
            if(variant=="duplicate-file")form.Add(new ByteArrayContent(Png),"file","again.png");
        }
        if(variant=="with-preview")form.Add(new ByteArrayContent(PreviewPng),"preview","small.png");
        var request=new HttpRequestMessage(HttpMethod.Post,"/api/erp/sales-orders/attachments/upload"){Content=form};
        if(variant!="no-csrf")request.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());
        if(variant!="no-origin")request.Headers.Add("Origin",variant=="foreign-origin"?"https://untrusted.invalid":fixture.Client.BaseAddress!.GetLeftPart(UriPartial.Authority));
        request.Headers.Add("X-Medcom-Read-Scope",variant=="stale-scope"?new string('b',64):scope);return request;
    }
    private sealed class Attachments:IErpAttachmentService
    {
        internal int UploadCalls,DeleteCalls;internal byte[]? Bytes,Small;internal ErpAttachmentUpload? Last;internal bool Preview;
        public Task<ErpReadResult<ErpAttachmentPage>> ListAsync(string module,string branch,string document,int page,int size,CancellationToken token)=>Task.FromResult(new ErpReadResult<ErpAttachmentPage>(ErpReadOutcome.Success,
            new(true,ErpAttachmentCatalog.Slots(module),true,true,State,[new("A","image.png",2,"Tài liệu đính kèm",1,"Ảnh",Png.Length,State,"/content","/preview")],page,size,true)));
        public Task<ErpReadResult<ErpAttachmentContent>> ContentAsync(string module,string branch,string document,string attachment,bool preview,CancellationToken token)
        {Preview=preview;return Task.FromResult(document=="D"&&attachment=="A"&&branch=="B1"?new ErpReadResult<ErpAttachmentContent>(ErpReadOutcome.Success,new(Png,"image/png","image.png")):new(ErpReadOutcome.NotFound));}
        public Task<ErpAttachmentResult> UploadAsync(string module,ErpAttachmentUpload request,ReadOnlyMemory<byte> content,ReadOnlyMemory<byte> preview,CancellationToken token)
        {UploadCalls++;Last=request;Bytes=content.ToArray();Small=preview.ToArray();return Task.FromResult(new ErpAttachmentResult(ErpCommandOutcome.Committed,Receipt:new(module,"upload",request.IdempotencyKey,request.DocumentId,"A",request.AttachmentName,State,State,Guid.Empty.ToString("D"),false)));}
        public Task<ErpAttachmentResult> DeleteAsync(string module,ErpAttachmentDelete request,CancellationToken token)
        {DeleteCalls++;return Task.FromResult(new ErpAttachmentResult(ErpCommandOutcome.Committed));}
    }
    private static byte[] LargePng()
    {
        // Valid ancillary PNG chunk makes a file larger than the host's ordinary 1 MiB JSON limit.
        var payload=Encoding.ASCII.GetBytes("Comment\0"+new string('a',1048576));var type="tEXt"u8.ToArray();
        using var stream=new MemoryStream();stream.Write(Png.AsSpan(0,Png.Length-12));var length=new byte[4];
        System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(length,payload.Length);stream.Write(length);stream.Write(type);stream.Write(payload);
        uint crc=uint.MaxValue;foreach(var b in type.Concat(payload)){crc^=b;for(var i=0;i<8;i++)crc=(crc>>1)^((crc&1)==1?0xedb88320u:0);}
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(length,~crc);stream.Write(length);stream.Write(Png.AsSpan(Png.Length-12));return stream.ToArray();
    }
}
