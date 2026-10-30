using System.Collections.Frozen;
using System.Text.Json;
namespace Medcom.Contracts;

// Fixed audited form configuration; callers cannot select SQL or response fields.
public static class ErpVisibleFields
{
    public static JsonElement Metadata { get; } = Read();
    private static JsonElement Read()
    {
        using var stream=typeof(ErpVisibleFields).Assembly.GetManifestResourceStream("Medcom.ErpVisibleFields")!;
        using var document=JsonDocument.Parse(stream);return document.RootElement.Clone();
    }
    private static readonly FrozenDictionary<string,FrozenSet<string>> Hidden=Metadata.GetProperty("screens").EnumerateArray()
        .SelectMany(s=>s.GetProperty("sections").EnumerateArray().Select(section=>new KeyValuePair<string,FrozenSet<string>>(
            s.GetProperty("module").GetString()+"/"+section.GetProperty("section").GetString(),
            section.GetProperty("fields").EnumerateArray().Select(f=>f.GetString()!).Where(f=>!Protocol(f)).ToFrozenSet(StringComparer.OrdinalIgnoreCase))))
        .ToFrozenDictionary(StringComparer.Ordinal);
    // These are transport identities/control metadata, not rendered grid columns.
    private static bool Protocol(string field)=>field.ToLowerInvariant() is "documentid" or "purchaserequestid" or "batchid"
        or "userautoid" or "lineid" or "branchid" or "statusid" or "islock" or "islocked";
    // Owner 30/10: the batch form shows CN nguồn / Chi nhánh đích and Kho nguồn / Đến kho (FromStoreHouseID,
    // ToStoreHouseID) although its T0 HDE lists them; ERP refuses Gửi TP SA until both warehouses are set.
    private static bool Shown(string module,string section,string field)=>module=="internal-transfer-batches"&&section=="header"
        &&field.ToLowerInvariant() is "frombranchid" or "tobranchid" or "fromstorehouseid" or "tostorehouseid";
    // Earlier explicit owner PO exclusions remain in force independently of HDE.
    public static bool IsHidden(string module,string section,string field)=>!Shown(module,section,field)&&(module=="purchase-orders"&&section=="lines"
        &&field.ToLowerInvariant() is "property" or "property2" or "parentid" or "sourceamount" or "quantity2" or "amount"
        ||Hidden.GetValueOrDefault(module+"/"+section)?.Contains(field)==true);
    public static IReadOnlyList<ErpFieldDefinition> Visible(string module,string section,IReadOnlyList<ErpFieldDefinition> fields)
        =>Array.AsReadOnly(fields.Where(f=>!IsHidden(module,section,f.Name)).ToArray());
}
