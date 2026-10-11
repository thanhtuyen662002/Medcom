using System.Collections.Frozen;
using System.Collections.ObjectModel;
using System.Text.Json;
namespace Medcom.Contracts;

public static class ErpScreenCatalog
{
    public static JsonElement WorkflowMetadata { get; } = ReadResource("Medcom.ErpWorkflowCatalog");
    public static JsonElement SourceMetadata { get; } = ReadSource();
    private static readonly FrozenDictionary<string, ErpScreenDescription> Screens = Load();
    public static IReadOnlyList<string> ModuleIds { get; } = Array.AsReadOnly(Screens.Keys.Order(StringComparer.Ordinal).ToArray());
    public static ErpScreenDescription? Get(string module) => Screens.GetValueOrDefault(module);
    // Fixed internal artifact bytes, never a user/configuration-supplied file or executable SQL.

    private static JsonElement ReadSource() => ReadResource("Medcom.ErpScreenCatalog");
    private static JsonElement ReadResource(string name)
    {
        using var stream = typeof(ErpScreenCatalog).Assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException("ERP source metadata missing.");
        using var document = JsonDocument.Parse(stream);
        return document.RootElement.Clone();
    }
    public static IEnumerable<JsonElement> AllScreenMetadata => SourceMetadata.GetProperty("screens").EnumerateArray()
        .Concat(WorkflowMetadata.GetProperty("screens").EnumerateArray());
    public static JsonElement Metadata(string module) => AllScreenMetadata.Single(row=>Text(row,"id")==module);
    public static bool IsWorkflow(string module) => WorkflowMetadata.GetProperty("screens").EnumerateArray().Any(row=>Text(row,"id")==module);
    private static FrozenDictionary<string, ErpScreenDescription> Load()
    {
        var result = new Dictionary<string, ErpScreenDescription>(StringComparer.Ordinal);
        foreach (var row in AllScreenMetadata)
        {
            var module = row.GetProperty("id").GetString()!;
            var fields = new Dictionary<string, IReadOnlyList<ErpFieldDefinition>>(StringComparer.Ordinal);
            foreach (var section in row.GetProperty("fields").EnumerateObject())
                fields.Add(section.Name, Array.AsReadOnly(section.Value.EnumerateArray().Select(field => new ErpFieldDefinition(
                    Text(field,"name"),Text(field,"column"),Text(field,"type"),Optional(field,"typeArguments"),
                    field.GetProperty("nullable").GetBoolean(),field.GetProperty("ordinal").GetInt32(),
                    field.GetProperty("hasDefault").GetBoolean(),field.GetProperty("writable").GetBoolean(),
                    field.TryGetProperty("virtual",out var computed)&&computed.GetBoolean(),Optional(field,"sourceColumn"))).ToArray()));
            var lookups = row.GetProperty("lookups").EnumerateArray().Select(item => new ErpLookupDefinition(
                item.TryGetProperty("id",out var lookupId)?lookupId.GetString()!:LookupId(Optional(item,"GridName"),Text(item,"ColumnID")),Optional(item,"GridName"),Text(item,"ColumnID"),
                Text(item,"ValueColumn"),Text(item,"DisplayColumn"),Optional(item,"LinkColumn"),Optional(item,"ParaArr"),Optional(item,"ParaRequireArr"),
                item.GetProperty("IsMultiSelect").ValueKind==JsonValueKind.True,
                item.GetProperty("IsDisable").ValueKind==JsonValueKind.True,Text(item,"sourceSha256Utf16LE"),
                row.TryGetProperty("directEditing",out _)&&item.TryGetProperty("IsNotInList",out var unlisted)&&unlisted.ValueKind==JsonValueKind.True)).ToArray();
            var extension=row.TryGetProperty("directEditing",out var editing);
            var evidence = (extension?"inventories/erp/20261011/cud-workflow-catalog.json#":"inventories/erp/20261010/six-screen-catalog.json#")+module;
            var actions = new List<ErpActionDefinition>();
            var qr = module is "warehouse-qr" or "sales-qr";
            bool Hidden(string key) => row.GetProperty("toolbar").TryGetProperty(key,out var value) && value.GetBoolean();
            if (!qr && (!extension || editing.GetBoolean()))
            {
                actions.Add(new("create","Thêm","native-toolbar","create",null,!Hidden("HBA"),false,evidence));
                actions.Add(new("save","Lưu","native-toolbar","save",null,!Hidden("HBE"),true,evidence));
                actions.Add(new("delete","Xóa","native-toolbar","delete",null,!Hidden("HBD"),true,evidence));
                if(!extension)actions.Add(new("paste","Dán dữ liệu","web-draft-validation","paste",null,true,false,evidence));
            }
            else if(qr)
            {
                actions.Add(new("scan-add","Quét thêm mã QR","BarcodeInputCtl","scan-add",null,true,true,evidence));
                actions.Add(new("scan-delete","Quét xóa mã QR","BarcodeInputCtl_1","scan-delete",null,true,true,evidence));
            }
            foreach(var button in row.GetProperty("buttons").EnumerateArray())
            {
                var control=Text(button,"control");
                var id=extension?Text(button,"operation"):(module,control) switch
                {
                    ("purchase-requests","CommandButtonCtl")=>"submit",
                    ("purchase-requests","CommandButtonCtl_1")=>"send-purchase-order",
                    ("sales-orders","CommandButtonCtl")=>"contract-info",
                    ("sales-orders","CommandButtonCtl_1")=>"recall",
                    ("sales-orders","ExecSQLWithParaButtonCtl")=>"send-pm",
                    ("internal-transfer-requests","CommandButtonCtl_1")=>"recall",
                    ("internal-transfer-requests","ExecSQLWithParaButtonCtl")=>"send-pm",
                    ("sales-qr","CommandButtonCtl_2")=>"contract-info",
                    _ when control.StartsWith("PrintButtonCtl",StringComparison.Ordinal)=>"print"+control["PrintButtonCtl".Length..],
                    _=>throw new InvalidOperationException("Unmapped current ERP button.")
                };
                actions.Add(new(id,Text(button,"caption"),control,id,Optional(button,"lockExpression"),true,true,Text(button,"propertyEvidence")));
            }
            if(extension)foreach(var section in fields.Where(s=>s.Key is not ("header" or "lines")&&s.Value.Any(f=>f.Writable)))
                actions.Add(new("save-"+section.Key,"Lưu "+section.Key,"native-toolbar","save-"+section.Key,null,true,true,evidence));
            result.Add(module,new(module,Text(row,"caption"),Text(row,"menuId"),Text(row,"formId"),
                new ReadOnlyDictionary<string,IReadOnlyList<ErpFieldDefinition>>(fields),actions.AsReadOnly(),
                Array.AsReadOnly(lookups),evidence));
        }
        if(result.Count!=19) throw new InvalidOperationException("ERP screen catalog incomplete.");
        return result.ToFrozenDictionary(StringComparer.Ordinal);
    }
    public static string LookupId(string? grid,string field) => (grid switch
    {null or ""=>"header","grdChitiet"=>"lines","grdListDoc"=>"list",_=>grid})+"."+field;
    private static string Text(JsonElement item,string key)=>item.GetProperty(key).GetString()
        ??throw new InvalidOperationException("Required source metadata missing.");
    private static string? Optional(JsonElement item,string key)=>item.TryGetProperty(key,out var value)
        && value.ValueKind!=JsonValueKind.Null?value.GetString():null;
}
