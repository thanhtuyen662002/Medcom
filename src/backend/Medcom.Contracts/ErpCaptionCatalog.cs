using System.Text.Json;
[assembly:System.Runtime.CompilerServices.InternalsVisibleTo("Medcom.Api.Tests")]
namespace Medcom.Contracts;

// Reviewed DB labels, never generated from module IDs, SQL objects or control names.
// An unknown, ambiguous or invalid binding supplies no UI label.
public static class ErpCaptionCatalog
{
    public static JsonElement Metadata {get;}=Read();
    private static JsonElement Read()
    {
        using var stream=typeof(ErpCaptionCatalog).Assembly.GetManifestResourceStream("Medcom.ErpCaptions")
            ??throw new InvalidOperationException("ERP caption metadata missing.");
        using var document=JsonDocument.Parse(stream);return document.RootElement.Clone();
    }
    public static string Screen(string module,string form)=>Resolve(Metadata.GetProperty("screens"),
        row=>Text(row,"module")==module&&Text(row,"formId")==form);
    public static string Action(string module,string action,string control)=>Resolve(Metadata.GetProperty("actions"),
        row=>Text(row,"module")==module&&Text(row,"actionId")==action&&Text(row,"control")==control);
    internal static string Resolve(JsonElement rows,Func<JsonElement,bool> matches)
    {
        var found=rows.EnumerateArray().Where(matches).Take(2).ToArray();
        if(found.Length!=1||string.IsNullOrEmpty(Text(found[0],"source")))return "";
        var caption=Text(found[0],"caption");
        return caption is not null&&caption.Length<=200&&!caption.Any(char.IsControl)?caption.Trim():"";
    }
    private static string? Text(JsonElement row,string key)=>row.TryGetProperty(key,out var value)
        &&value.ValueKind==JsonValueKind.String?value.GetString():null;
}
