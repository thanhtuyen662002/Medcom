using System.Globalization;
using System.Text;
using Medcom.Application;
using Medcom.Contracts;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace Medcom.Api;

public static class ErpAttachmentEndpoints
{
    public static void Map(IEndpointRouteBuilder app)
    {
        foreach(var module in ErpScreenCatalog.ModuleIds)
        {
            var path="/api/erp/"+module+"/attachments";
            app.MapGet(path,async(HttpContext context,IErpAttachmentService service)=>
            {
                if(!CanRead(context,module))return Problem(403,"native_read_denied");
                if(!Query(context,"branchId","documentId","page","pageSize")||!Number(context,"page",1,out var page)||!Number(context,"pageSize",20,out var size))return Problem(400,"invalid_query");
                return Read(context,await service.ListAsync(module,Value(context,"branchId")??"",Value(context,"documentId")??"",page,size,context.RequestAborted));
            });
            if(!ErpAttachmentCatalog.Supports(module))continue;
            app.MapGet(path+"/content",async(HttpContext context,IErpAttachmentService service)=>
            {
                if(!CanRead(context,module))return Problem(403,"native_read_denied");
                if(!Query(context,"branchId","documentId","attachmentId","preview")||Value(context,"preview")is {} p&&p is not ("true" or "false"))return Problem(400,"invalid_query");
                var result=await service.ContentAsync(module,Value(context,"branchId")??"",Value(context,"documentId")??"",Value(context,"attachmentId")??"",Value(context,"preview")=="true",context.RequestAborted);
                if(result.Outcome!=ErpReadOutcome.Success||result.Value is null)return Read(context,result);
                Stamp(context);context.Response.Headers["X-Content-Type-Options"]="nosniff";
                // Fixed raster content types can render as images; legacy non-image files download.
                return Results.File(result.Value.Bytes,result.Value.MediaType,result.Value.MediaType.StartsWith("image/",StringComparison.Ordinal)?null:result.Value.AttachmentName,enableRangeProcessing:false);
            });
            if(!ErpAttachmentCatalog.Writable(module))continue;
            app.MapPost(path+"/upload",async(HttpContext context,IErpAttachmentService service)=>
            {
                if(ErpScreenEndpoints.Guard(context,module)is {} rejection)return rejection;
                var form=await Multipart(context);if(form is null)return Problem(400,"invalid_attachment_form");
                int? slot=null;if(form.Fields.TryGetValue("slotId",out var raw)&&!string.IsNullOrEmpty(raw))
                {if(!int.TryParse(raw,NumberStyles.None,CultureInfo.InvariantCulture,out var number))return Problem(400,"invalid_attachment_slot");slot=number;}
                string Field(string key)=>form.Fields.GetValueOrDefault(key)??"";
                var request=new ErpAttachmentUpload(Field("idempotencyKey"),Field("branchId"),Field("documentId"),Field("expectedStateToken"),slot,
                    form.Fields.GetValueOrDefault("attachmentId"),form.Fields.GetValueOrDefault("expectedAttachmentToken"),form.Name);
                if(!ErpAttachmentRules.Valid(request,module)||!ErpAttachmentRules.Image(form.Content,ErpAttachmentCatalog.MaximumFileBytes,form.Name)
                    ||form.Preview.Length>0&&!ErpAttachmentRules.Image(form.Preview,ErpAttachmentCatalog.MaximumPreviewBytes))return Problem(400,"invalid_attachment_image_or_request");
                return Command(context,await service.UploadAsync(module,request,form.Content,form.Preview,context.RequestAborted));
            });
            app.MapPost(path+"/delete",async(HttpContext context,IErpAttachmentService service)=>
            {
                if(ErpScreenEndpoints.Guard(context,module)is {} rejection)return rejection;
                var raw=await ErpScreenEndpoints.Body(context);if(raw is null||ErpScreenEndpoints.Decode<ErpAttachmentDelete>(raw.Value)is not {} request)return Problem(400,"invalid_attachment_request");
                if(!ErpAttachmentRules.Valid(request,module))return Problem(400,"invalid_attachment_request");
                return Command(context,await service.DeleteAsync(module,request,context.RequestAborted));
            });
        }
    }
    private static bool CanRead(HttpContext context,string module)=>AuthEndpoints.Current(context).Identity.Capabilities.Contains(module+".read",StringComparer.Ordinal);
    private static IResult Read<T>(HttpContext context,ErpReadResult<T> result)
    {
        if(result.Outcome==ErpReadOutcome.Success&&result.Value is not null)
        {Stamp(context);context.Response.Headers["X-Medcom-Data-Projection"]="full";return Results.Ok(new ErpScopedResponse<T>(WorkspaceReadScope.Read(AuthEndpoints.Current(context)),result.Value));}
        return Problem(result.Outcome switch{ErpReadOutcome.Invalid=>400,ErpReadOutcome.Denied=>403,ErpReadOutcome.NotFound=>404,_=>503},result.Code??"erp_attachment_unavailable");
    }
    private static IResult Command(HttpContext context,ErpAttachmentResult result)
    {
        Stamp(context);var status=result.Outcome switch{ErpCommandOutcome.Committed or ErpCommandOutcome.Replayed=>200,ErpCommandOutcome.InvalidInput=>400,
            ErpCommandOutcome.Denied=>403,ErpCommandOutcome.Conflict or ErpCommandOutcome.OutcomeUnknown=>409,_=>503};return Results.Json(result,statusCode:status);
    }
    private static void Stamp(HttpContext context)
    {WorkspaceReadScope.Stamp(context,AuthEndpoints.Current(context));context.Response.Headers["X-Medcom-Response-Contract"]=CanonicalResponseProjection.Version;}
    private static IResult Problem(int status,string code)=>Results.Problem(statusCode:status,title:"ERP attachment operation could not be completed.",extensions:new Dictionary<string,object?>{{"code",code}});
    private static bool Query(HttpContext context,params string[] names)=>context.Request.Query.All(p=>names.Contains(p.Key,StringComparer.Ordinal)&&p.Value.Count==1);
    private static string? Value(HttpContext context,string key)=>context.Request.Query.TryGetValue(key,out var value)?value.ToString():null;
    private static bool Number(HttpContext context,string key,int fallback,out int number)
    {number=fallback;return !context.Request.Query.TryGetValue(key,out var raw)||int.TryParse(raw,NumberStyles.None,CultureInfo.InvariantCulture,out number);}
    private sealed record UploadForm(Dictionary<string,string> Fields,string Name,byte[] Content,byte[] Preview);
    private static async Task<UploadForm?> Multipart(HttpContext context)
    {
        if(!MediaTypeHeaderValue.TryParse(context.Request.ContentType,out var media)||!media.MediaType.Equals("multipart/form-data",StringComparison.OrdinalIgnoreCase))
            throw new BadHttpRequestException("Multipart form required.",415);
        var boundary=HeaderUtilities.RemoveQuotes(media.Boundary).Value;
        if(string.IsNullOrWhiteSpace(boundary)||boundary.Length>70)return null;
        if(context.Request.ContentLength>ErpAttachmentCatalog.MaximumMultipartBytes)throw new BadHttpRequestException("Attachment body limit.",413);
        if(context.Features.Get<IHttpMaxRequestBodySizeFeature>()is{IsReadOnly:false} limit)limit.MaxRequestBodySize=ErpAttachmentCatalog.MaximumMultipartBytes;
        // The outer parser ceiling is above each explicit part ceiling so oversized
        // files produce 413 from Bytes rather than an indistinguishable malformed-form error.
        var reader=new MultipartReader(boundary,context.Request.Body){HeadersCountLimit=16,HeadersLengthLimit=16384,BodyLengthLimit=ErpAttachmentCatalog.MaximumMultipartBytes};
        var fields=new Dictionary<string,string>(StringComparer.Ordinal);var files=new HashSet<string>(StringComparer.Ordinal);byte[]? content=null;byte[] preview=[];string name="";
        var allowed=new[]{"idempotencyKey","branchId","documentId","expectedStateToken","slotId","attachmentId","expectedAttachmentToken"};
        try
        {
            for(var sections=0;;sections++)
            {
                var section=await reader.ReadNextSectionAsync(context.RequestAborted);if(section is null)break;
                if(sections>=9||!ContentDispositionHeaderValue.TryParse(section.ContentDisposition,out var disposition)
                    ||!disposition.DispositionType.Equals("form-data",StringComparison.OrdinalIgnoreCase))return null;
                var key=HeaderUtilities.RemoveQuotes(disposition.Name).Value;
                if(key is null)return null;
                if(disposition.FileName.HasValue||disposition.FileNameStar.HasValue)
                {
                    if(key is not ("file" or "preview")||!files.Add(key))return null;
                    var bytes=await Bytes(section.Body,key=="file"?ErpAttachmentCatalog.MaximumFileBytes:ErpAttachmentCatalog.MaximumPreviewBytes,context.RequestAborted);
                    if(key=="file"){content=bytes;name=HeaderUtilities.RemoveQuotes(disposition.FileNameStar.HasValue?disposition.FileNameStar:disposition.FileName).Value??"";}else preview=bytes;
                }
                else
                {
                    if(!allowed.Contains(key,StringComparer.Ordinal)||fields.ContainsKey(key))return null;
                    fields.Add(key,new UTF8Encoding(false,true).GetString(await Bytes(section.Body,4096,context.RequestAborted)));
                }
            }
        }
        catch(Exception error)when(error is InvalidDataException or DecoderFallbackException or FormatException){return null;}
        return content is null?null:new(fields,name,content,preview);
    }
    private static async Task<byte[]> Bytes(Stream stream,int maximum,CancellationToken token)
    {
        using var buffer=new MemoryStream();var chunk=new byte[81920];
        while(true){var count=await stream.ReadAsync(chunk,token);if(count==0)break;if(buffer.Length+count>maximum)throw new BadHttpRequestException("Attachment part limit.",413);buffer.Write(chunk,0,count);}
        return buffer.ToArray();
    }
}
