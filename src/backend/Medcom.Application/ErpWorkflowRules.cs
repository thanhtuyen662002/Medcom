using Medcom.Contracts;
namespace Medcom.Application;

// Fixed current form/status/assignment rules. Native procedures recheck under the command transaction.
public static class ErpWorkflowRules
{
    public static bool StateAllows(ErpActionContext state,string operation)
    {
        var row=ErpScreenCatalog.Metadata(state.Module);
        if(state.Module=="purchase-orders")return !state.IsLocked&&operation is "save" or "delete";
        if(!row.GetProperty("saveStatuses").EnumerateArray().Any(s=>s.GetInt32()==state.StatusId))return false;
        string? Field(string name)=>state.WorkflowFields?.GetValueOrDefault(name)as string;
        var assigned=state.Module switch
        {
            "internal-transfer-pm" or "internal-transfer-batches"=>Field("assignedPM"),
            "internal-transfer-tech"=>Field("assignedTechnician"),
            "internal-transfer-sa"=>Field("assignedSA"),_=>null
        };
        if(state.Module is "internal-transfer-pm" or "internal-transfer-tech" or "internal-transfer-sa")
        {if(assigned!=state.Actor)return false;}
        else if(state.Module=="internal-transfer-batches"&&assigned is not null&&assigned!=state.Actor)return false;
        if(state.Module is "sales-order-pm" or "inbound-pm"&&!(Field("sendTo")??"").Split(';').Any(v=>v.Trim()==state.Actor))return false;
        if(operation=="delete")return state.Module=="inbound-requests"&&!state.IsLocked
            ||state.Module=="internal-transfer-batches"&&state.StatusId==0&&state.LineCount==0;
        if(operation=="save"||operation.StartsWith("save-",StringComparison.Ordinal))
            return row.GetProperty("directEditing").GetBoolean()&&(!state.Module.StartsWith("inbound-",StringComparison.Ordinal)||!state.IsLocked);
        return row.GetProperty("buttons").EnumerateArray().Any(b=>b.GetProperty("operation").GetString()==operation);
    }
    public static string? PayloadType(string module,string operation)=>ErpScreenCatalog.IsWorkflow(module)
        ?ErpScreenCatalog.Metadata(module).GetProperty("buttons").EnumerateArray()
            .Where(b=>b.GetProperty("operation").GetString()==operation)
            .Select(b=>b.GetProperty("payloadType").ValueKind==System.Text.Json.JsonValueKind.Null?null:b.GetProperty("payloadType").GetString()).SingleOrDefault():null;
    public static bool HasActionOptions(string module,string operation)=>operation=="return-step"
        ||operation=="send-sa"&&module=="internal-transfer-tech"||operation=="send-pm"&&module is "inbound-sa" or "inbound-tech";
    public static int MaximumNotes(string module,string operation)
    {
        var button=ErpScreenCatalog.Metadata(module).GetProperty("buttons").EnumerateArray().Single(b=>b.GetProperty("operation").GetString()==operation);
        if(button.GetProperty("procedure").GetString()is not {} procedure)return module=="purchase-approvals"?2000:4000;
        var metadata=ErpScreenCatalog.WorkflowMetadata.GetProperty("modules").EnumerateArray().Single(m=>m.GetProperty("name").GetString()==procedure);
        var parameter=metadata.GetProperty("parameters").EnumerateArray().FirstOrDefault(p=>p.GetProperty("ParameterName").GetString()is "@Notes" or "@Reason");
        if(parameter.ValueKind==System.Text.Json.JsonValueKind.Undefined)return 4000;
        var size=parameter.GetProperty("max_length").GetInt32();
        return size<0?4000:Math.Min(4000,parameter.GetProperty("TypeName").GetString()=="nvarchar"?size/2:size);
    }
}
