using System.Text.Json.Serialization;

namespace Medcom.Contracts;

public sealed record ErpAttachmentSlot(int? SlotId,string SlotName);
public sealed record ErpAttachmentRow(string AttachmentId,string AttachmentName,int? SlotId,string SlotName,
    int? FileTypeId,string FileTypeName,long ByteLength,string StateToken,string ContentUrl,string PreviewUrl);
public sealed record ErpAttachmentPage(bool Supported,IReadOnlyList<ErpAttachmentSlot> Slots,bool CanUpload,bool CanDelete,
    string DocumentStateToken,IReadOnlyList<ErpAttachmentRow> Rows,int Page,int PageSize,bool HasMore);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpAttachmentUpload(string IdempotencyKey,string BranchId,string DocumentId,string ExpectedStateToken,
    int? SlotId,string? AttachmentId,string? ExpectedAttachmentToken,string AttachmentName);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ErpAttachmentDelete(string IdempotencyKey,string BranchId,string DocumentId,string ExpectedStateToken,
    string AttachmentId,string ExpectedAttachmentToken);
public sealed record ErpAttachmentReceipt(string Module,string Operation,string IdempotencyKey,string DocumentId,
    string AttachmentId,string AttachmentName,string? AttachmentStateToken,string DocumentStateToken,string AuditId,bool Deleted);
public sealed record ErpAttachmentResult(ErpCommandOutcome Outcome,string? Code=null,ErpAttachmentReceipt? Receipt=null);

// Finite current form bindings: inventories/backend/20261016/attachment-bindings.json.
public static class ErpAttachmentCatalog
{
    public const int MaximumFileBytes=10*1024*1024;
    public const int MaximumPreviewBytes=1024*1024;
    public const int MaximumMultipartBytes=MaximumFileBytes+MaximumPreviewBytes+262144;
    public static IReadOnlyList<string> Modules{get;}=Array.AsReadOnly(new[]{"purchase-orders","sales-orders","sales-order-pm","sales-order-sa","inbound-requests","inbound-warehouse","inbound-sa","inbound-tech","inbound-pm","inbound-bld"});
    public static bool Supports(string module)=>Modules.Contains(module,StringComparer.Ordinal);
    // Current SA form hides Edit (SY_FrmCfg HBE=1); expose its shared images as reads.
    public static bool Writable(string module)=>Supports(module)&&module!="sales-order-sa";
    public static IReadOnlyList<ErpAttachmentSlot> Slots(string module)=>module switch
    {
        "purchase-orders"=>Array.AsReadOnly(new[]{new ErpAttachmentSlot(null,"")}),
        "sales-orders" or "sales-order-pm" or "sales-order-sa"=>Array.AsReadOnly(new[]{new ErpAttachmentSlot(2,"Tài liệu đính kèm")}),
        // Every inbound form (LYS2 AttachWebcamImageControlCtl STT 2/4/6) shows the same three photo slots.
        _ when module.StartsWith("inbound-",StringComparison.Ordinal)=>Array.AsReadOnly(new[]{new ErpAttachmentSlot(2,"Ảnh chụp hư hỏng"),new(4,"Ảnh chụp trước khi dở hàng"),new(6,"Ảnh chụp sau khi dở hàng")}),
        _=>Array.Empty<ErpAttachmentSlot>()
    };
}
