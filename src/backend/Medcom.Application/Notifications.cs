using Medcom.Contracts;
namespace Medcom.Application;

public interface INotificationQueries
{
    Task<ErpReadResult<NotificationPage>> ListAsync(int page, int size, bool unreadOnly, CancellationToken token);
    Task<ErpReadResult<NotificationRow>> DetailAsync(int id, CancellationToken token);
    Task<ErpReadResult<NotificationRow>> SetReadAsync(int id, bool isView, CancellationToken token);
}
public sealed class UnavailableNotificationQueries : INotificationQueries
{
    public Task<ErpReadResult<NotificationPage>> ListAsync(int page,int size,bool unreadOnly,CancellationToken token)
        => Task.FromResult(new ErpReadResult<NotificationPage>(ErpReadOutcome.Unavailable));
    public Task<ErpReadResult<NotificationRow>> DetailAsync(int id,CancellationToken token)
        => Task.FromResult(new ErpReadResult<NotificationRow>(ErpReadOutcome.Unavailable));
    public Task<ErpReadResult<NotificationRow>> SetReadAsync(int id,bool isView,CancellationToken token)
        => Task.FromResult(new ErpReadResult<NotificationRow>(ErpReadOutcome.Unavailable));
}

public static class NotificationNavigation
{
    public static NotificationTarget Closed(string reason) => new(false,reason,null,null,null,null,null);
    public static string? Module(string? form)
    {
        if (string.IsNullOrEmpty(form)) return null;
        if(form is "AP_OrderFrm" or "purchase-orders") return "purchase-orders";
        if(form is "IV_InboundRequestFrm" or "inbound-requests") return "inbound-requests";
        return ErpScreenCatalog.ModuleIds.FirstOrDefault(id => id==form || ErpScreenCatalog.Get(id)!.FormId==form);
    }
    public static async Task<NotificationTarget> ResolveAsync(NotificationRow row,AuthoritativeIdentity identity,
        IErpScreenService screens,IDocumentReader documents,CancellationToken token)
    {
        if(string.IsNullOrEmpty(row.DocumentId)) return Closed("notification_document_missing");
        var erp=Module(row.ErpFormName);var web=Module(row.WebFormName);
        if(erp is not null && web is not null && erp!=web) return Closed("notification_form_ambiguous");
        var module=erp??web;
        if(module is null) return Closed("notification_form_unsupported");
        if(!identity.Capabilities.Contains(module+".read",StringComparer.Ordinal)) return Closed("notification_document_denied");
        if(module is "purchase-orders" or "inbound-requests")
        {
            var kind=module=="purchase-orders"?DocumentKind.PurchaseOrders:DocumentKind.InboundRequests;
            var detail=await documents.ReadDetailAsync(identity,kind,new(row.DocumentId,1,1),token);
            if(detail.Outcome==DocumentOutcome.Unavailable) return Closed("notification_document_unavailable");
            if(detail.Outcome!=DocumentOutcome.Success || detail.Detail is null) return Closed("notification_document_not_found");
            var form=module=="purchase-orders"?"AP_OrderFrm":"IV_InboundRequestFrm";
            return new(true,null,module,form,row.DocumentId,detail.Detail.Document.BranchId,
                "/api/documents/"+module+"/detail?documentId="+Uri.EscapeDataString(row.DocumentId));
        }
        if(identity.BranchIds is not {Count: >0 and <=200}) return Closed("notification_document_denied");
        NotificationTarget? target=null;
        foreach(var branch in identity.BranchIds.Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal))
        {
            var detail=await screens.DetailAsync(module,branch,row.DocumentId,1,1,token);
            if(detail.Outcome is ErpReadOutcome.Unavailable or ErpReadOutcome.Cancelled) return Closed("notification_document_unavailable");
            if(detail.Outcome!=ErpReadOutcome.Success || detail.Value is null) continue;
            if(target is not null) return Closed("notification_document_ambiguous");
            target=new(true,null,module,ErpScreenCatalog.Get(module)!.FormId,row.DocumentId,branch,
                "/api/erp/"+module+"/detail?branchId="+Uri.EscapeDataString(branch)+"&documentId="+Uri.EscapeDataString(row.DocumentId));
        }
        return target??Closed("notification_document_not_found");
    }
}
