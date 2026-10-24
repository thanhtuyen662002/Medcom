using System.Text.Json.Nodes;
namespace Medcom.Api;

// Response-only variants keep writable input DTOs exact and unchanged.
internal static class FeDisplaySchemas
{
    internal static void Apply(JsonObject paths,JsonObject schemas)
    {
        bool Exact(JsonNode? node)=>node is JsonObject obj&&(obj["$ref"]is {} r&&schemas[r.GetValue<string>().Split('/')[^1]]?["x-medcom-exact-input"]?.GetValue<bool>()==true
            ||Exact(obj["items"])||obj["anyOf"]is JsonArray options&&options.Any(Exact));
        JsonNode Transform(JsonNode node,bool displayCopy=false)
        {
            var copy=node.DeepClone();
            if(copy is JsonObject reference&&reference["$ref"]is JsonValue refValue)
            {
                var original=refValue.GetValue<string>().Split('/')[^1];var name=original+(displayCopy?"FeDisplayData":"FeDisplay");
                if(!schemas.ContainsKey(name))
                {
                    schemas[name]=new JsonObject();
                    schemas[name]=Transform(schemas[original]!,displayCopy);
                }
                reference["$ref"]="#/components/schemas/"+name;
                return reference;
            }
            if(copy is JsonObject obj)
            {
                if(displayCopy)obj.Remove("x-medcom-exact-input");
                foreach(var property in obj.ToArray())if(property.Key!="properties"&&property.Value is JsonObject or JsonArray)obj[property.Key]=Transform(property.Value!,displayCopy);
                if(obj["properties"]is JsonObject fields)
                {
                    var required=obj["required"]as JsonArray??new JsonArray();obj["required"]=required;
                    foreach(var field in fields.ToArray())
                    {
                        if(field.Key=="access")continue;
                        if(!displayCopy&&Exact(field.Value))
                        {
                            fields[field.Key+"DisplayData"]=Transform(field.Value!,true);
                            if(required.Any(x=>x?.GetValue<string>()==field.Key))required.Add(field.Key+"DisplayData");
                        }
                        else fields[field.Key]=Transform(field.Value!,displayCopy);
                    }
                    void Add(string field,string description,bool nullable,bool mandatory)
                    {
                        if(fields.ContainsKey(field))return;
                        fields[field]=nullable?new JsonObject{["anyOf"]=new JsonArray(new JsonObject{["type"]="string"},new JsonObject{["type"]="null"}),["readOnly"]=true,["description"]=description}
                            :new JsonObject{["type"]="string",["readOnly"]=true,["description"]=description};
                        if(mandatory)required.Add(field);
                    }
                    foreach(var property in fields.ToArray())
                    {
                        var mandatory=required.Any(x=>x?.GetValue<string>()==property.Key);
                        if(FeDisplayProjection.IsId(property.Key))
                        {
                            Add(FeDisplayProjection.NameField(property.Key),"Source reference name. Null for missing/ambiguous/unqualified references or technical identifiers; existing source name fields remain unchanged.",true,mandatory);
                            Add(FeDisplayProjection.StateField(property.Key),"available, unnamed, empty, missing, ambiguous, invalid, unavailable, unknown, identifier. Display metadata never grants permission.",false,mandatory);
                            if(FeDisplayProjection.IsStatusId(property.Key))
                            {
                                var prefix=property.Key[..^2];
                                Add(prefix+"ForeColor","Opaque status text CSS color (#RRGGBB), using RGB channels of source ForeColor integer; native alpha is ignored. Null if absent or unresolved.",true,mandatory);
                                Add(prefix+"BackColor","Opaque status background CSS color (#RRGGBB), using RGB channels of source BackColor integer; native alpha is ignored. Null if absent or unresolved.",true,mandatory);
                            }
                            if(property.Key.Equals("ItemID",StringComparison.OrdinalIgnoreCase))
                            {
                                Add(property.Key.EndsWith("ID",StringComparison.Ordinal)?"ItemCode":"itemCode","CF_ItemTbl.ItemCode; existing document snapshot is retained.",true,mandatory);
                                Add(property.Key.EndsWith("ID",StringComparison.Ordinal)?"Unit":"unit","CF_ItemTbl.Unit; existing document unit is retained.",true,mandatory);
                            }
                        }
                        if(FeDisplayProjection.IsAccount(property.Key))Add(FeDisplayProjection.AccountNameField(property.Key),"SY_User.HoTen for the stored login account. Null when the account is empty or unknown; the account value is retained.",true,mandatory);
                        if(FeDisplayProjection.IsDisplay(property.Key))Add(property.Key+"Display","dd/MM/yyyy[ HH:mm:ss], or comma-grouped VND (0 decimals) / USD (2 decimals). Raw values retained. Unknown currency/date yields null.",true,mandatory);
                    }
                    obj["x-medcom-response-presentation"]="reference-names-v1";
                }
            }
            else if(copy is JsonArray array)for(var i=0;i<array.Count;i++)if(array[i]is {} child)array[i]=Transform(child);
            return copy;
        }
        foreach(var path in paths)
        foreach(var operation in ((JsonObject)path.Value!).ToArray())
        {
            if(!FeDisplayProjection.Applies(operation.Key,path.Key))continue;
            operation.Value!["x-medcom-display-projection"]="reference-names-v1";
            if(operation.Value!["responses"]?["200"]?["content"]?["application/json"]is JsonObject response&&response["schema"]is {} shape)
                response["schema"]=Transform(shape);
        }
    }
}
