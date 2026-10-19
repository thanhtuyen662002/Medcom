using System.Collections.Frozen;
using System.Text.Json;
namespace Medcom.Contracts;

// Reviewed current metadata deltas; historical source inventories stay immutable.
// This changes the typed field contract, never authorizes arbitrary schema drift.
public static class ErpSchemaEvolution
{
    private static readonly FrozenDictionary<(string Table,string Column),(bool Previous,bool Current)> Changes=Load();
    public static bool Nullable(string table,string column,bool historical)
    {
        if(!Changes.TryGetValue((table,column),out var change))return historical;
        if(historical!=change.Previous)throw new InvalidOperationException("Schema evolution baseline mismatch.");
        return change.Current;
    }
    public static string Table(JsonElement screen,string section)=>screen.TryGetProperty("tables",out var tables)
        ?tables.GetProperty(section).GetString()!:screen.GetProperty(section switch
        {"header"=>"headerTable","lines"=>"lineTable","history"=>"historyTable","comparison"=>"comparisonTable",_=>throw new InvalidOperationException("Unknown source section.")}).GetString()!;
    private static FrozenDictionary<(string,string),(bool,bool)> Load()
    {
        using var stream=typeof(ErpSchemaEvolution).Assembly.GetManifestResourceStream("Medcom.ErpSchemaEvolution")
            ??throw new InvalidOperationException("Schema evolution metadata missing.");
        using var document=JsonDocument.Parse(stream);
        if(document.RootElement.GetProperty("format").GetInt32()!=1)throw new InvalidOperationException("Unknown schema evolution format.");
        return document.RootElement.GetProperty("changes").EnumerateArray().ToFrozenDictionary(
            c=>(c.GetProperty("table").GetString()!,c.GetProperty("column").GetString()!),
            c=>(c.GetProperty("previousNullable").GetBoolean(),c.GetProperty("nullable").GetBoolean()));
    }
}
