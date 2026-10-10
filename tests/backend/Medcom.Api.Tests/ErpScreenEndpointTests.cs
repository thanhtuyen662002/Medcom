using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
using Xunit;
namespace Medcom.Api.Tests;

public sealed class ErpScreenEndpointTests
{
    [Theory]
    [InlineData("purchase-requests")][InlineData("sales-orders")][InlineData("internal-transfer-requests")]
    [InlineData("warehouse-qr")][InlineData("sales-qr")][InlineData("machine-movements")][InlineData("machine-repairs")]
    public async Task Fixed_screen_metadata_is_authenticated_authorized_and_publishes_complete_fields(string module)
    {
        await using var fixture=await PurchaseHttpFixture.Start();
        using(var anonymous=await fixture.Client.GetAsync("/api/erp/"+module+"/screen"))Assert.Equal(HttpStatusCode.Unauthorized,anonymous.StatusCode);
        fixture.Authority.Identity=fixture.Authority.Identity with{Capabilities=ErpScreenCatalog.ModuleIds.Select(id=>id+".read").ToArray()};
        await fixture.Login();var result=await fixture.Json("/api/erp/"+module+"/screen");var screen=result.GetProperty("data");
        Assert.Equal(ErpScreenCatalog.Get(module)!.FormId,screen.GetProperty("formId").GetString());
        Assert.Equal(ErpScreenCatalog.Get(module)!.Fields["header"].Count,screen.GetProperty("fields").GetProperty("header").GetArrayLength());
        Assert.Equal(ErpScreenCatalog.Get(module)!.Lookups.Count,screen.GetProperty("lookups").GetArrayLength());
        fixture.Authority.Identity=fixture.Authority.Identity with{Capabilities=[]};
        using var revoked=await fixture.Client.GetAsync("/api/erp/"+module+"/screen");Assert.Equal(HttpStatusCode.Forbidden,revoked.StatusCode);
    }
    internal static object Create()=>new
    {
        idempotencyKey="synthetic-create",branchId="B1",header=new
        {personSuggest="Synthetic person",department="Synthetic department",currencyId="VND",objectId="SYNTHETIC",rateExchange=1.0},
        lines=new[]{new{clientLineKey="synthetic-line",values=new{itemId="SYNTHETIC-ITEM",quantity="1",unitPrice="100"}}}
    };
    [Theory]
    [InlineData("valid",503)][InlineData("no-origin",403)][InlineData("foreign-origin",403)]
    [InlineData("stale-scope",409)][InlineData("extra-query",400)][InlineData("extra-field",400)]
    [InlineData("duplicate",400)][InlineData("invalid-utf8",400)][InlineData("no-csrf",403)]
    public async Task Create_boundary_rejects_stale_or_malformed_intents_and_never_enables_unqualified_writes(string variant,int status)
    {
        await using var fixture=await PurchaseHttpFixture.Start();await fixture.Login();
        var screen=await fixture.Json("/api/erp/purchase-requests/screen");var csrf=await fixture.Json("/api/auth/csrf");
        var text=JsonSerializer.Serialize(Create());
        if(variant=="extra-field")text=text[..^1]+",\"statusId\":3}";
        if(variant=="duplicate")text=text[..^1]+",\"branchId\":\"B2\"}";
        using var request=new HttpRequestMessage(HttpMethod.Post,"/api/erp/purchase-requests/create"+(variant=="extra-query"?"?table=FA_AssetTbl":""));
        request.Content=variant=="invalid-utf8"?new ByteArrayContent([0xff,0xfe]):new StringContent(text,Encoding.UTF8,"application/json");
        if(variant=="invalid-utf8")request.Content.Headers.ContentType=new("application/json");
        if(variant!="no-csrf")request.Headers.Add("X-CSRF-TOKEN",csrf.GetProperty("token").GetString());
        if(variant!="no-origin")request.Headers.Add("Origin",variant=="foreign-origin"?"https://example.invalid":fixture.Client.BaseAddress!.GetLeftPart(UriPartial.Authority));
        request.Headers.Add("X-Medcom-Read-Scope",variant=="stale-scope"?new string('0',64):screen.GetProperty("readScope").GetString());
        using var response=await fixture.Client.SendAsync(request);Assert.Equal(status,(int)response.StatusCode);
        Assert.Equal(0,fixture.Source.Commits);
    }
    [Fact]
    public void Command_freezing_checks_source_types_owner_fields_changed_line_identity_and_action_specific_payloads()
    {
        var create=JsonSerializer.SerializeToElement(Create());Assert.True(ErpCommandRules.Freeze("purchase-requests","create",create,out var frozen));
        Assert.Equal("synthetic-line",Assert.Single(frozen!.Changes).ClientLineKey);
        var raw=JsonSerializer.Serialize(Create()).Replace("\"quantity\":\"1\"","\"quantity\":\"1e3\"",StringComparison.Ordinal);
        Assert.False(ErpCommandRules.Freeze("purchase-requests","create",JsonSerializer.Deserialize<JsonElement>(raw),out _));
        var request=new ErpActionRequest("synthetic-send","B1","SYNTHETIC-DOC",new string('a',64),JsonSerializer.SerializeToElement(new{primaryPmId="PM1",supportingPmId="",notes=(string?)null}));
        Assert.True(ErpCommandRules.Freeze("internal-transfer-requests","send-pm",ErpInputRules.Serialize(request),out _));
        Assert.False(ErpCommandRules.Freeze("sales-orders","send-pm",ErpInputRules.Serialize(request),out _));
        Assert.False(ErpCommandRules.Freeze("warehouse-qr","delete",ErpInputRules.Serialize(new ErpDeleteRequest("key","B1","D",new string('a',64))),out _));
    }
    [Fact]
    public void OpenAPI_keeps_all_417_source_properties_required_in_module_section_schemas()
    {
        using var document=JsonDocument.Parse(ApiContractCatalog.Json);var schemas=document.RootElement.GetProperty("components").GetProperty("schemas");var count=0;
        foreach(var module in ErpScreenCatalog.ModuleIds)
        foreach(var section in ErpScreenCatalog.Get(module)!.Fields)
        {
            var schema=schemas.GetProperty("Erp_"+module.Replace('-','_')+"_"+section.Key+"_fields");
            Assert.False(schema.GetProperty("additionalProperties").GetBoolean());
            Assert.Equal(section.Value.Count,schema.GetProperty("required").GetArrayLength());count+=section.Value.Count;
            Assert.Equal(section.Value.Select(c=>c.Name),schema.GetProperty("properties").EnumerateObject().Select(p=>p.Name));
        }
        Assert.Equal(417,count);
    }
}
