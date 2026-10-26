using System.Text.Json;
using Medcom.Contracts;
namespace Medcom.Application;

public sealed record ErpFrozenCommand(string Module,string Operation,string IdempotencyKey,string BranchId,
    string? DocumentId,string? ExpectedStateToken,JsonElement? Header,IReadOnlyList<ErpLineChange> Changes,
    JsonElement Payload,string? Barcode,JsonElement OriginalIntent,string Section="lines");

public static class ErpCommandRules
{
    public static bool Freeze(string module,string operation,JsonElement raw,out ErpFrozenCommand? command)
    {
        command=null;
        if(ErpScreenCatalog.Get(module)?.Actions.Any(action=>action.Operation==operation)!=true||!ErpInputRules.UniqueJson(raw)
            ||raw.ValueKind!=JsonValueKind.Object)return false;
        try
        {
            string key,branch;string? document=null,state=null,barcode=null;JsonElement? header=null;var section="lines";
            var changes=new List<ErpLineChange>();var payload=ErpInputRules.Serialize(new Dictionary<string,object?>());
            switch(operation)
            {
                case "create":
                    var create=Read<ErpCreateRequest>(raw);key=create.IdempotencyKey;branch=create.BranchId;
                    if(!ErpInputRules.Normalize(module,"header",create.Header,out var h)||create.Lines is null||create.Lines.Count>500
                        ||create.Lines.Count==0&&!(ErpScreenCatalog.IsWorkflow(module)&&ErpScreenCatalog.Metadata(module).GetProperty("allowEmptyLines").GetBoolean()))return false;
                    header=h;
                    foreach(var line in create.Lines)
                    {
                        if(line is null||!ErpInputRules.Identifier(line.ClientLineKey,64)||!ErpInputRules.Normalize(module,"lines",line.Values,out var values))return false;
                        changes.Add(new(ErpLineChangeKind.Add,null,line.ClientLineKey,values));
                    }
                    break;
                case "save":
                    if(!raw.TryGetProperty("lineChanges",out var changeArray)||changeArray.ValueKind!=JsonValueKind.Array
                        ||changeArray.EnumerateArray().Any(change=>!change.TryGetProperty("kind",out var kind)||kind.ValueKind!=JsonValueKind.String||kind.GetString()is not ("Add" or "Update" or "Remove")))return false;
                    var save=Read<ErpSaveRequest>(raw);key=save.IdempotencyKey;branch=save.BranchId;document=save.DocumentId;state=save.ExpectedStateToken;
                    if(!ErpInputRules.Normalize(module,"header",save.Header,out h,preserveHiddenOmissions:true)||save.LineChanges is null||save.LineChanges.Count>500)return false;
                    header=h;
                    foreach(var change in save.LineChanges)
                    {
                        if(change is null||!Enum.IsDefined(change.Kind))return false;
                        if(change.Kind==ErpLineChangeKind.Add)
                        {if(change.LineId is not null||!ErpInputRules.Identifier(change.ClientLineKey,64))return false;}
                        else if(!ErpInputRules.Identifier(change.LineId,50)||change.ClientLineKey is not null)return false;
                        if(change.Kind==ErpLineChangeKind.Remove)
                        {if(change.Values is not null)return false;changes.Add(change);}
                        else
                        {if(change.Values is not {} value||!ErpInputRules.Normalize(module,"lines",value,out var normalized,preserveHiddenOmissions:change.Kind==ErpLineChangeKind.Update))return false;
                         changes.Add(change with{Values=normalized});}
                    }
                    break;
                case "delete":
                    var delete=Read<ErpDeleteRequest>(raw);key=delete.IdempotencyKey;branch=delete.BranchId;document=delete.DocumentId;state=delete.ExpectedStateToken;
                    break;
                case "scan-add":case "scan-delete":
                    var scan=Read<ErpScanRequest>(raw);key=scan.IdempotencyKey;branch=scan.BranchId;document=scan.DocumentId;state=scan.ExpectedStateToken;barcode=scan.Barcode;
                    if(!ErpInputRules.Identifier(barcode,250)||!barcode!.All(c=>c is >= '!' and <= '~'))return false;
                    break;
                default:
                    if(operation.StartsWith("save-",StringComparison.Ordinal))
                    {
                        section=operation[5..];
                        var saveSection=Read<ErpSectionSaveRequest>(raw);
                        key=saveSection.IdempotencyKey;branch=saveSection.BranchId;document=saveSection.DocumentId;state=saveSection.ExpectedStateToken;
                        if(!raw.TryGetProperty("lineChanges",out var rows)||rows.ValueKind!=JsonValueKind.Array
                            ||rows.EnumerateArray().Any(row=>!row.TryGetProperty("kind",out var k)||k.ValueKind!=JsonValueKind.String||k.GetString()is not ("Add" or "Update" or "Remove"))
                            ||saveSection.LineChanges is not {Count:>0 and <=500})return false;
                        foreach(var change in saveSection.LineChanges)
                        {
                            if(change is null||!Enum.IsDefined(change.Kind))return false;
                            if(change.Kind==ErpLineChangeKind.Add)
                            {if(change.LineId is not null||!ErpInputRules.Identifier(change.ClientLineKey,64))return false;}
                            else if(!ErpInputRules.Identifier(change.LineId,50)||change.ClientLineKey is not null)return false;
                            if(change.Kind==ErpLineChangeKind.Remove)
                            {if(change.Values is not null)return false;changes.Add(change);}
                            else
                            {if(change.Values is not {} v||!ErpInputRules.Normalize(module,section,v,out var n,preserveHiddenOmissions:change.Kind==ErpLineChangeKind.Update))return false;changes.Add(change with{Values=n});}
                        }
                        break;
                    }
                    var action=Read<ErpActionRequest>(raw);key=action.IdempotencyKey;branch=action.BranchId;document=action.DocumentId;state=action.ExpectedStateToken;
                    if(action.Payload.ValueKind!=JsonValueKind.Object)return false;
                    if(ErpScreenCatalog.IsWorkflow(module))
                    {
                        if(action.Payload.TryGetProperty("notes",out var notes)&&notes.ValueKind==JsonValueKind.String
                            &&notes.GetString()!.Length>ErpWorkflowRules.MaximumNotes(module,operation))return false;
                        switch(ErpWorkflowRules.PayloadType(module,operation))
                        {
                            case "notes":var note=Read<ErpActionNotes>(action.Payload);if(!Note(note.Notes))return false;payload=ErpInputRules.Serialize(note);break;
                            case "return":var step=Read<ErpReturnStep>(action.Payload);if(!action.Payload.TryGetProperty("statusId",out _)||!Note(step.Notes))return false;payload=ErpInputRules.Serialize(step);break;
                            case "transfer-tech":var tech=Read<ErpTransferTechSend>(action.Payload);
                                if(!ErpInputRules.AnsiIdentifier(tech.PrimarySaId,100)||!ErpInputRules.AnsiIdentifier(tech.SupportingSaId,100)
                                    ||tech.PrimarySaId==tech.SupportingSaId||!Note(tech.Notes))return false;payload=ErpInputRules.Serialize(tech);break;
                            case "pm":var pm=Read<ErpSendOrderPm>(action.Payload);if(!ErpInputRules.AnsiIdentifier(pm.PmId,100)||!Note(pm.Notes))return false;payload=ErpInputRules.Serialize(pm);break;
                            case "empty":if(action.Payload.EnumerateObject().Any())return false;break;
                            default:return false;
                        }
                    }
                    else if(operation=="send-pm")
                    {
                        if(module=="sales-orders")
                        {var pm=Read<ErpSendOrderPm>(action.Payload);if(!ErpInputRules.AnsiIdentifier(pm.PmId,50)||!Note(pm.Notes))return false;payload=ErpInputRules.Serialize(pm);}
                        else if(module=="internal-transfer-requests")
                        {var pm=Read<ErpSendTransferPm>(action.Payload);
                         if(!ErpInputRules.AnsiIdentifier(pm.PrimaryPmId,100)||pm.SupportingPmId is null
                             ||pm.SupportingPmId!=""&&!ErpInputRules.AnsiIdentifier(pm.SupportingPmId,100)
                             ||pm.PrimaryPmId==pm.SupportingPmId||!Note(pm.Notes))return false;payload=ErpInputRules.Serialize(pm);}
                        else return false;
                    }
                    else if(action.Payload.EnumerateObject().Any())return false;
                    break;
            }
            if(!ErpInputRules.AnsiIdentifier(key,100)||!ErpInputRules.AnsiIdentifier(branch,50)
                ||operation!="create"&&(!ErpInputRules.Identifier(document,50)||!ErpInputRules.Token(state))
                ||module=="internal-transfer-requests"&&document?.Length>30
                ||changes.Where(c=>c.Kind==ErpLineChangeKind.Add).Select(c=>c.ClientLineKey).Distinct(StringComparer.Ordinal).Count()!=changes.Count(c=>c.Kind==ErpLineChangeKind.Add)
                ||changes.Where(c=>c.Kind!=ErpLineChangeKind.Add).Select(c=>c.LineId).Distinct(StringComparer.Ordinal).Count()!=changes.Count(c=>c.Kind!=ErpLineChangeKind.Add))return false;
            if(ErpScreenCatalog.IsWorkflow(module))
            {
                var metadata=ErpScreenCatalog.Metadata(module);
                if(!metadata.GetProperty("allowLineAddRemove").GetBoolean()&&changes.Any(c=>c.Kind!=ErpLineChangeKind.Update))return false;
                if(section=="assets"&&changes.Any(c=>c.Kind!=ErpLineChangeKind.Update))return false;
                if(document is not null&&!ErpInputRules.Value(ErpScreenCatalog.Get(module)!.Fields["header"].Single(f=>f.Column==metadata.GetProperty("headerKey").GetString()),ErpInputRules.Serialize(document)))return false;
            }
            // Normalize at this boundary for both execution and receipt lookup. Optional nulls,
            // record/JSON property ordering and numeric spellings never make the original intent conflict with itself.
            object normalizedIntent=operation switch
            {
                "create"=>new ErpCreateRequest(key,branch,header!.Value,changes.Select(c=>new ErpNewLine(c.ClientLineKey!,c.Values!.Value)).ToArray()),
                "save"=>new ErpSaveRequest(key,branch,document!,state!,header!.Value,changes.AsReadOnly()),
                "delete"=>new ErpDeleteRequest(key,branch,document!,state!),
                "scan-add" or "scan-delete"=>new ErpScanRequest(key,branch,document!,state!,barcode!),
                _ when operation.StartsWith("save-",StringComparison.Ordinal)=>new ErpSectionSaveRequest(key,branch,document!,state!,changes.AsReadOnly()),
                _=>new ErpActionRequest(key,branch,document!,state!,payload)
            };
            command=new(module,operation,key,branch,document,state,header,changes.AsReadOnly(),payload,barcode,ErpInputRules.Serialize(normalizedIntent),section);return true;
        }
        catch(Exception e)when(e is JsonException or InvalidOperationException or ArgumentException or NullReferenceException){return false;}
    }
    private static T Read<T>(JsonElement value)=>JsonSerializer.Deserialize<T>(value,new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {PropertyNameCaseInsensitive=false,UnmappedMemberHandling=System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow})
        ??throw new JsonException();
    private static bool Note(string? note)=>note is null||note.Length<=4000&&ErpInputRules.Text(note);
}
