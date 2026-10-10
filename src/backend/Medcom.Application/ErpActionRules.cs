using Medcom.Contracts;
namespace Medcom.Application;

public sealed record ErpNativeRights(bool Read,bool Add,bool Update,bool Delete);
// Created from authoritative SQL rows and source/reference checks, never from request roles or button flags.
public sealed record ErpActionContext(string Module,string Actor,string? DocumentId,int? StatusId,
    bool IsLocked,string? Owner,string? ContractId,int LineCount,bool LinkedToPurchaseOrder,
    bool LinkedToTransferBatch,ErpNativeRights Rights,bool WritesQualified,bool ContractReadQualified=false,
    bool ReportsQualified=false,bool NumberingQualified=true,bool HasActivePartReferences=false);

public static class ErpActionRules
{
    public static IReadOnlyList<ErpActionState> Evaluate(ErpActionContext state)
    {
        if(ErpScreenCatalog.Get(state.Module)is not {} screen)return Array.Empty<ErpActionState>();
        return Array.AsReadOnly(screen.Actions.Select(action=>Evaluate(state,action)).ToArray());
    }
    private static ErpActionState Evaluate(ErpActionContext state,ErpActionDefinition action)
    {
        var write=action.Operation is not ("contract-info" or "paste") && !action.Operation.StartsWith("print",StringComparison.Ordinal);
        var grant=action.Operation switch
        {"create"=>state.Rights.Add,"delete"=>state.Rights.Delete,"paste"=>state.Rights.Add||state.Rights.Update,
          "contract-info"=>state.Rights.Read,_ when action.Operation.StartsWith("print",StringComparison.Ordinal)=>state.Rights.Read,
          _=>state.Rights.Update};
        var visible=action.NativeVisible&&state.Rights.Read&&grant;
        string? reason=!visible?"native_permission_or_hidden":null;
        if(reason is null&&action.RequiresSavedDocument&&state.DocumentId is null)reason="save_document_first";
        if(reason is null&&action.Operation=="contract-info"&&string.IsNullOrEmpty(state.ContractId))reason="contract_missing";
        if(reason is null&&!StateAllows(state,action.Operation))reason="state_or_assignment_not_allowed";
        if(reason is null&&write&&!state.WritesQualified)reason="erp_write_unqualified";
        if(reason is null&&action.Operation=="create"&&!state.NumberingQualified)reason="document_numbering_unqualified";
        if(reason is null&&action.Operation=="contract-info"&&!state.ContractReadQualified)reason="contract_read_unqualified";
        if(reason is null&&action.Operation.StartsWith("print",StringComparison.Ordinal)&&!state.ReportsQualified)reason="report_runtime_unqualified";
        var operation=action.Operation;
        var suffix=operation switch
        {"create"=>"create","save"=>"save","delete"=>"delete","paste"=>"paste/validate",
          "contract-info"=>"contract-info","scan-add"=>"qr/add","scan-delete"=>"qr/delete",
          _ when operation.StartsWith("print",StringComparison.Ordinal)=>"reports/"+operation,
          _=>"actions/"+operation};
        return new(action.Id,action.Caption,visible,reason is null,reason,action.RequiresSavedDocument,
            visible&&!operation.StartsWith("print",StringComparison.Ordinal)?"/api/erp/"+state.Module+"/"+suffix:null);
    }
    public static bool StateAllows(ErpActionContext state,string operation)
    {
        if(operation=="paste")return state.DocumentId is null||StateAllows(state,"save");
        if(operation is "create" or "contract-info" || operation.StartsWith("print",StringComparison.Ordinal))return true;
        if(state.DocumentId is null)return false;
        var owner=state.Owner==state.Actor;
        return (state.Module,operation) switch
        {
            ("purchase-requests","save" or "delete" or "submit")=>!state.IsLocked&&state.StatusId is 1 or 4,
            ("purchase-requests","send-purchase-order")=>state.StatusId==3&&!state.LinkedToPurchaseOrder&&state.LineCount>0,
            ("sales-orders","save")=>!state.IsLocked&&owner&&state.StatusId is -1 or 11,
            ("sales-orders","delete")=>!state.IsLocked&&owner&&state.StatusId==-1,
            ("sales-orders","send-pm")=>!state.IsLocked&&owner&&state.StatusId is -1 or 11&&state.LineCount>0,
            ("sales-orders","recall")=>!state.IsLocked&&owner&&state.StatusId==12,
            ("internal-transfer-requests","save" or "send-pm")=>!state.IsLocked&&owner&&state.StatusId is 0 or 30
                &&(operation!="send-pm"||state.LineCount>0),
            ("internal-transfer-requests","delete")=>!state.IsLocked&&owner&&state.StatusId==0&&!state.LinkedToTransferBatch,
            ("internal-transfer-requests","recall")=>!state.IsLocked&&owner&&state.StatusId==10&&!state.LinkedToTransferBatch,
            ("machine-movements" or "machine-repairs","save" or "delete")=>!state.IsLocked&&(operation!="delete"||!state.HasActivePartReferences),
            ("warehouse-qr" or "sales-qr","scan-add" or "scan-delete")=>!state.IsLocked,
            _=>false
        };
    }
}
