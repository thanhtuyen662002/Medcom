using System.Collections.Frozen;
using System.Text.Json;
namespace Medcom.Contracts;

// Finite source-pinned reference metadata, never caller-selected SQL identifiers.
public sealed record ReferenceColumn(string Name,string Type,string? TypeArguments,bool Nullable);
public sealed record ReferenceBinding(string Id,string Table,string Key,string Label,
    IReadOnlyList<string> Extras,IReadOnlyList<string> Aliases,IReadOnlyList<ReferenceColumn> Columns);
public static class ApiReferenceCatalog
{
    public static IReadOnlyList<ReferenceBinding> Bindings { get; }=Load();
    private static readonly FrozenDictionary<string,ReferenceBinding> ById=Bindings.ToFrozenDictionary(x=>x.Id,StringComparer.Ordinal);
    private static readonly FrozenDictionary<string,string> Aliases=Bindings.SelectMany(x=>x.Aliases.Select(a=>KeyValuePair.Create(a,x.Id)))
        .ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);
    public static ReferenceBinding? Get(string id)=>ById.GetValueOrDefault(id);
    public static string? Resolve(string field,string? module)=>field.Equals("StatusID",StringComparison.OrdinalIgnoreCase)
        ?module is not null&&ById.ContainsKey("status:"+module)?"status:"+module:null
        :Aliases.GetValueOrDefault(field);
    private static IReadOnlyList<ReferenceBinding> Load()
    {
        using var stream=typeof(ApiReferenceCatalog).Assembly.GetManifestResourceStream("Medcom.ApiReferenceCatalog")!;
        using var json=JsonDocument.Parse(stream);
        return Array.AsReadOnly(JsonSerializer.Deserialize<ReferenceBinding[]>(json.RootElement.GetProperty("bindings"),
            new JsonSerializerOptions{PropertyNameCaseInsensitive=true})!);
    }
}
public sealed record BranchChoice(string BranchId,string BranchName);
public sealed record BranchChoicePage(IReadOnlyList<BranchChoice> Items,int Page,int PageSize,bool HasMore);
