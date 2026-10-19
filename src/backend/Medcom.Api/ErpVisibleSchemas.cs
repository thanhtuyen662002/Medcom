using System.Text.Json.Nodes;
using Medcom.Contracts;
namespace Medcom.Api;

internal static class ErpVisibleSchemas
{
    internal static void Apply(JsonObject paths,JsonObject schemas)
    {
        JsonObject Resolve(JsonNode node)
        {
            while(node["$ref"]is {} reference)node=schemas[reference.GetValue<string>().Split('/')[^1]]!;
            return node.DeepClone().AsObject();
        }
        JsonNode Edit(JsonNode node,string[] route,int index,HashSet<string> hidden)
        {
            var shape=Resolve(node);
            if(shape["anyOf"]is JsonArray choices)
            {
                for(var i=0;i<choices.Count;i++)if(choices[i]is {} choice&&choice["type"]?.GetValue<string>()!="null")choices[i]=Edit(choice,route,index,hidden);
            }
            else if(index==route.Length&&shape["properties"]is JsonObject fields)
            {
                foreach(var key in fields.Select(p=>p.Key).Where(hidden.Contains).ToArray())fields.Remove(key);
                if(shape["required"]is JsonArray required)shape["required"]=new JsonArray(required.Select(x=>x!.GetValue<string>()).Where(x=>!hidden.Contains(x)).Select(x=>(JsonNode?)JsonValue.Create(x)).ToArray());
            }
            else if(index<route.Length)
            {
                if(route[index]=="*"&&shape["items"]is {} item)shape["items"]=Edit(item,route,index+1,hidden);
                else if(shape["properties"]is JsonObject members&&members[route[index]]is {} child)members[route[index]]=Edit(child,route,index+1,hidden);
            }
            return shape;
        }
        foreach(var path in paths)
        {
            if(ErpVisibleProjection.Module(path.Key)is not {} module||path.Value?["get"]?["responses"]?["200"]?["content"]?["application/json"]is not JsonObject response||response["schema"]is not {} original)continue;
            JsonNode schema=original.DeepClone();var scoped=path.Key.StartsWith("/api/erp/",StringComparison.Ordinal);var prefix=scoped?new[]{"data"}:Array.Empty<string>();
            void Prune(string section,params string[] route)=>schema=Edit(schema,[..prefix,..route],0,ErpVisibleProjection.HiddenNames(module,section).ToHashSet(StringComparer.OrdinalIgnoreCase));
            if(path.Key.EndsWith("/detail",StringComparison.Ordinal))
            {
                Prune("header",scoped?"header":"document");
                if(scoped)foreach(var section in ErpScreenCatalog.Get(module)!.Fields.Keys.Where(s=>s!="header"))
                {if(section is "lines" or "history" or "comparison")Prune(section,section,"rows","*");else Prune(section,"sections",section,"rows","*");}
                else
                {Prune("lines","purchaseOrderLines","*");Prune("lines","inboundRequestLines","*");}
            }
            else Prune("header","rows","*");
            var name="ErpVisible_"+module.Replace('-','_')+(path.Key.EndsWith("/detail",StringComparison.Ordinal)?"_detail":"_list")+(scoped?"_erp":"_documents");
            schemas[name]=schema;response["schema"]=new JsonObject{["$ref"]="#/components/schemas/"+name};
            path.Value!["get"]!["x-medcom-response-visibility"]="erp-visible-fields-v1";
        }
    }
}
