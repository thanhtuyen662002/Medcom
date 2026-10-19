using System.Text.Json.Nodes;
using Medcom.Contracts;
namespace Medcom.Api;

// Applied after reference names, currency formatting and canonical aliases.
internal static class ErpVisibleProjection
{
    internal static string? Module(string path)
    {
        var module=FeDisplayProjection.Module(path);
        if(module is null)return null;
        return path.EndsWith("/"+module,StringComparison.Ordinal)||path.EndsWith("/"+module+"/detail",StringComparison.Ordinal)
            ?module:null;
    }
    internal static IEnumerable<string> HiddenNames(string module,string section)
    {
        if(module=="purchase-orders"&&section=="lines")
            foreach(var name in new[]{"lineName","lineReferenceState","documentReferenceState","itemReferenceState","documentName","parentName","parentReferenceState"})yield return name;
        foreach(var field in ErpScreenCatalog.Get(module)!.Fields.GetValueOrDefault(section)??[])
        {
            if(!ErpVisibleFields.IsHidden(module,section,field.Name))continue;
            yield return field.Name;
            if(FeDisplayProjection.IsId(field.Name))
            {
                var name=FeDisplayProjection.NameField(field.Name);
                // ERP often hides a foreign key but explicitly selects its
                // display-name column. That visible business name must survive.
                if(!ErpScreenCatalog.Get(module)!.Fields[section].Any(f=>f.Name.Equals(name,StringComparison.OrdinalIgnoreCase)
                    &&!ErpVisibleFields.IsHidden(module,section,f.Name)))yield return name;
                yield return FeDisplayProjection.StateField(field.Name);
            }
            if(FeDisplayProjection.IsDisplay(field.Name))yield return field.Name+"Display";
            if(FeDisplayProjection.IsStatusId(field.Name))
            {yield return field.Name[..^2]+"ForeColor";yield return field.Name[..^2]+"BackColor";}
        }
    }
    internal static void Apply(JsonNode root,string path)
    {
        if(Module(path)is not {} module)return;
        void Row(JsonNode? node,string section)
        {
            if(node is not JsonObject row)return;
            var hidden=HiddenNames(module,section).ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach(var key in row.Select(p=>p.Key).Where(hidden.Contains).ToArray())row.Remove(key);
        }
        void Page(JsonNode? node,string section)
        {if(node?["rows"]is JsonArray rows)foreach(var row in rows)Row(row,section);}
        var data=root["data"]??root;
        if(path.EndsWith("/detail",StringComparison.Ordinal))
        {
            Row(data["header"]??data["document"],"header");
            foreach(var section in ErpScreenCatalog.Get(module)!.Fields.Keys.Where(s=>s!="header"))
                Page(data[section]??data["sections"]?[section],section);
            if(data["purchaseOrderLines"]is JsonArray po)foreach(var row in po)Row(row,"lines");
            if(data["inboundRequestLines"]is JsonArray inbound)foreach(var row in inbound)Row(row,"lines");
        }
        else Page(data,"header");
    }
}
