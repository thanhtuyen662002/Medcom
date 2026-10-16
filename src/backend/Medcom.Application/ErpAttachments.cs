using System.Buffers.Binary;
using Medcom.Contracts;

namespace Medcom.Application;

public sealed record ErpAttachmentContent(byte[] Bytes,string MediaType,string AttachmentName);
public interface IErpAttachmentService
{
    Task<ErpReadResult<ErpAttachmentPage>> ListAsync(string module,string branch,string document,int page,int size,CancellationToken token);
    Task<ErpReadResult<ErpAttachmentContent>> ContentAsync(string module,string branch,string document,string attachment,bool preview,CancellationToken token);
    Task<ErpAttachmentResult> UploadAsync(string module,ErpAttachmentUpload request,ReadOnlyMemory<byte> content,ReadOnlyMemory<byte> preview,CancellationToken token);
    Task<ErpAttachmentResult> DeleteAsync(string module,ErpAttachmentDelete request,CancellationToken token);
}
public sealed class UnavailableErpAttachmentService:IErpAttachmentService
{
    public Task<ErpReadResult<ErpAttachmentPage>> ListAsync(string module,string branch,string document,int page,int size,CancellationToken token)=>Task.FromResult(new ErpReadResult<ErpAttachmentPage>(ErpReadOutcome.Unavailable));
    public Task<ErpReadResult<ErpAttachmentContent>> ContentAsync(string module,string branch,string document,string attachment,bool preview,CancellationToken token)=>Task.FromResult(new ErpReadResult<ErpAttachmentContent>(ErpReadOutcome.Unavailable));
    public Task<ErpAttachmentResult> UploadAsync(string module,ErpAttachmentUpload request,ReadOnlyMemory<byte> content,ReadOnlyMemory<byte> preview,CancellationToken token)=>Task.FromResult(new ErpAttachmentResult(ErpCommandOutcome.QualificationRequired,"erp_write_unqualified"));
    public Task<ErpAttachmentResult> DeleteAsync(string module,ErpAttachmentDelete request,CancellationToken token)=>Task.FromResult(new ErpAttachmentResult(ErpCommandOutcome.QualificationRequired,"erp_write_unqualified"));
}
public static class ErpAttachmentRules
{
    public static bool Token(string? value)=>value?.Length==64&&value.All(char.IsAsciiHexDigit);
    public static bool Name(string? value)=>value is{Length:>0 and <=200}&&value==value.Trim()&&ErpInputRules.Text(value,false)
        &&value.IndexOfAny(['/', '\\', ':','*','?','<','>','|','"','\r','\n','\0'])<0&&value is not ("." or "..");
    public static bool CanWrite(ErpActionContext state)
    {
        if(!ErpAttachmentCatalog.Supports(state.Module)||!state.Rights.Read||!state.Rights.Update||!state.WritesQualified
            ||state.DocumentId is null||state.IsLocked)return false;
        var toolbar=ErpScreenCatalog.Metadata(state.Module).GetProperty("toolbar");
        if(toolbar.TryGetProperty("HBE",out var hidden)&&hidden.GetBoolean())return false;
        if(state.Module=="sales-order-pm")return state.StatusId is 12 or 13
            &&(state.WorkflowFields?.GetValueOrDefault("sendTo")as string??"").Split(';').Any(s=>s.Trim()==state.Actor);
        return ErpActionRules.StateAllows(state,"save");
    }
    public static bool Valid(ErpAttachmentUpload r,string module)=>ErpAttachmentCatalog.Writable(module)
        &&ErpInputRules.Identifier(r.IdempotencyKey,100)&&ErpInputRules.AnsiIdentifier(r.BranchId,50)&&ErpInputRules.AnsiIdentifier(r.DocumentId,module=="purchase-orders"?30:50)
        &&Token(r.ExpectedStateToken)&&Name(r.AttachmentName)&&ErpAttachmentCatalog.Slots(module).Any(s=>s.SlotId==r.SlotId)
        &&(r.AttachmentId is null?r.ExpectedAttachmentToken is null:ErpInputRules.AnsiIdentifier(r.AttachmentId,50)&&Token(r.ExpectedAttachmentToken));
    public static bool Valid(ErpAttachmentDelete r,string module)=>ErpAttachmentCatalog.Writable(module)
        &&ErpInputRules.Identifier(r.IdempotencyKey,100)&&ErpInputRules.AnsiIdentifier(r.BranchId,50)&&ErpInputRules.AnsiIdentifier(r.DocumentId,module=="purchase-orders"?30:50)
        &&Token(r.ExpectedStateToken)&&ErpInputRules.AnsiIdentifier(r.AttachmentId,50)&&Token(r.ExpectedAttachmentToken);

    // Inspect bounded raster headers without loading GDI+, executing file content or decompressing pixels.
    // Full-size/thumbnail bytes remain the original bytes. SVG and executable/document formats are not accepted for image upload.
    public static string? ImageType(ReadOnlySpan<byte> data)
    {
        bool Size(uint width,uint height)=>width is >0 and <=16384&&height is >0 and <=16384&&(ulong)width*height<=40000000;
        if(data.Length>=45&&data[..8].SequenceEqual(new byte[]{137,80,78,71,13,10,26,10})
            &&BinaryPrimitives.ReadUInt32BigEndian(data[8..])==13&&data.Slice(12,4).SequenceEqual("IHDR"u8)
            &&Size(BinaryPrimitives.ReadUInt32BigEndian(data[16..]),BinaryPrimitives.ReadUInt32BigEndian(data[20..]))
            &&data.Slice(data.Length-12,8).SequenceEqual(new byte[]{0,0,0,0,73,69,78,68}))return "image/png";
        if(data.Length>=12&&data[0]==255&&data[1]==216&&data[^2]==255&&data[^1]==217)
        {
            var at=2;
            while(at<data.Length-2)
            {
                if(data[at++]!=255)return null;while(at<data.Length&&data[at]==255)at++;
                if(at>=data.Length)return null;var marker=data[at++];
                if(marker==218||marker==217)return null;
                if(marker is 1 or >=208 and <=215)continue;
                if(at+2>data.Length)return null;var count=BinaryPrimitives.ReadUInt16BigEndian(data[at..]);
                if(count<2||at+count>data.Length)return null;
                if(marker is 192 or 193 or 194 or 195 or 197 or 198 or 199 or 201 or 202 or 203 or 205 or 206 or 207)
                    return count>=8&&Size(BinaryPrimitives.ReadUInt16BigEndian(data[(at+5)..]),BinaryPrimitives.ReadUInt16BigEndian(data[(at+3)..]))?"image/jpeg":null;
                at+=count;
            }
        }
        return null;
    }
    public static bool Image(ReadOnlyMemory<byte> bytes,int maximum,string? name=null)
    {
        if(bytes.Length is 0||bytes.Length>maximum||ImageType(bytes.Span)is not {} type)return false;
        if(name is null)return true;
        var extension=Path.GetExtension(name);
        return type=="image/png"?extension.Equals(".png",StringComparison.OrdinalIgnoreCase)
            :extension.Equals(".jpg",StringComparison.OrdinalIgnoreCase)||extension.Equals(".jpeg",StringComparison.OrdinalIgnoreCase);
    }
}
