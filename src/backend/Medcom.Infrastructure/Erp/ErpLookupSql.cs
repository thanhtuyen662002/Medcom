using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

// Exact current-form lookup bindings only. SQL remains private in the owner database;
// the compiled source hash and typed context bind it before any read. No HTTP SQL is accepted.
internal static class ErpLookupSql
{
    internal sealed record Bound(string Text,IReadOnlyList<(string Name,string Value)> Parameters);
    private static readonly Regex Literal=new(@"N?'(?:''|[^'])*'",RegexOptions.CultureInvariant|RegexOptions.IgnoreCase);
    private static readonly Regex Placeholder=new(@"\{([^{}]+)\}",RegexOptions.CultureInvariant);
    internal static Bound? Bind(string source,IReadOnlyList<string> arguments,IReadOnlyList<string> values,string actor,string branch)
    {
        if(source.Length>65536||arguments.Count!=values.Count)return null;
        var masked=Literal.Replace(source," ");
        masked=Regex.Replace(masked,@"--[^\r\n]*|/\*[\s\S]*?\*/"," ",RegexOptions.CultureInvariant);
        if(Regex.IsMatch(masked,@"\b(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|INTO|OPENROWSET|OPENQUERY|OPENDATASOURCE|GO|SP_EXECUTESQL|WAITFOR|DBCC|GRANT|REVOKE|DENY|BACKUP|RESTORE)\b",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant))return null;
        var procedure=Regex.Match(masked.Trim(),@"^(?:EXEC\s+)?(?:dbo\.)?WA_OrderByContract_GetItemStp\b",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant);
        if(!procedure.Success&&(!Regex.IsMatch(masked.Trim(),@"^(?:SELECT|DECLARE)\b",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant)
            ||Regex.IsMatch(masked,@"\b(?:EXEC|EXECUTE)\b",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant)))return null;
        if(procedure.Success&&masked[(masked.IndexOf(procedure.Value,StringComparison.Ordinal)+procedure.Length)..].Any(c=>!char.IsWhiteSpace(c)&&c!=','))return null;
        var parameters=new List<(string Name,string Value)>();var valid=true;
        var text=Literal.Replace(source,match=>
        {
            var literal=match.Value;var start=literal.StartsWith('N')||literal.StartsWith('n')?2:1;
            var content=literal[start..^1].Replace("''","'",StringComparison.Ordinal);
            if(!Placeholder.IsMatch(content))return literal;
            var value=Placeholder.Replace(content,placeholder=>
            {
                var key=placeholder.Groups[1].Value;
                if(key=="User")return actor;
                if(key is "BranchID" or "Branch")return branch;
                if(int.TryParse(key,NumberStyles.None,CultureInfo.InvariantCulture,out var index)&&index>=0&&index<values.Count)return values[index];
                var mapped=Enumerable.Range(0,arguments.Count).Where(i=>arguments[i]==key).ToArray();
                if(mapped.Length==1)return values[mapped[0]];
                valid=false;return "";
            });
            if(value.Length>1000||!ErpInputRules.Text(value,false)){valid=false;return "";}
            var name="@lookupValue"+parameters.Count.ToString(CultureInfo.InvariantCulture);parameters.Add((name,value));return name;
        });
        if(!valid||Placeholder.IsMatch(Literal.Replace(text," ")))return null;
        if(procedure.Success&&!Regex.IsMatch(masked.Trim(),@"^EXEC\b",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant))text="EXEC "+text;
        return new(text,parameters.AsReadOnly());
    }
    internal static async Task<string?> Source(DbTransaction transaction,ErpScreenDescription screen,ErpLookupDefinition lookup,CancellationToken token)
    {
        await using var command=ErpSqlPlan.Command(transaction,"""
            SELECT TOP(2) Source,ValueColumn,DisplayColumn,ParaArr,ParaRequireArr,IsDisable,IsMultiSelect,LinkColumn,IsNotInList
            FROM dbo.SY_FrmDrdwTbl WITH(HOLDLOCK) WHERE FormID=@form AND ColumnID=@column
              AND ((GridName IS NULL AND @grid IS NULL) OR GridName=@grid);
            """);
        ErpSqlPlan.Parameter(command,"@form",DbType.String,screen.FormId,255);
        ErpSqlPlan.Parameter(command,"@column",DbType.String,lookup.Field,255);
        ErpSqlPlan.Parameter(command,"@grid",DbType.String,lookup.Grid,255);
        await using var reader=await command.ExecuteReaderAsync(token);
        if(!await reader.ReadAsync(token)||reader.IsDBNull(0)||reader.IsDBNull(1)||reader.IsDBNull(2))return null;
        var source=reader.GetString(0);
        if(Convert.ToHexStringLower(SHA256.HashData(Encoding.Unicode.GetBytes(source)))!=lookup.SourceHash
            ||reader.GetString(1)!=lookup.ValueField||reader.GetString(2)!=lookup.DisplayField
            ||(reader.IsDBNull(3)?null:reader.GetString(3))!=lookup.Parameters
            ||(reader.IsDBNull(4)?null:reader.GetString(4))!=lookup.RequiredParameters
            ||!reader.IsDBNull(5)&&reader.GetBoolean(5)||(!reader.IsDBNull(6)&&reader.GetBoolean(6))!=lookup.MultiSelect
            ||(reader.IsDBNull(7)?null:reader.GetString(7))!=lookup.LinkedFields)return null;
        if(await reader.ReadAsync(token)||await reader.NextResultAsync(token))return null;
        await reader.DisposeAsync();
        if(Regex.IsMatch(source.TrimStart(),@"^(?:EXEC\s+)?(?:dbo\.)?WA_OrderByContract_GetItemStp\b",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant))
        {
            var expected=ErpScreenCatalog.SourceMetadata.GetProperty("modules").EnumerateArray()
                .Single(module=>module.GetProperty("name").GetString()=="WA_OrderByContract_GetItemStp")
                .GetProperty("definitionSha256Utf16LE").GetString();
            await using var probe=ErpSqlPlan.Command(transaction,"SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),definition)),2) FROM sys.sql_modules WHERE object_id=OBJECT_ID('dbo.WA_OrderByContract_GetItemStp','P');");
            if((await probe.ExecuteScalarAsync(token)as string)?.ToLowerInvariant()!=expected)return null;
        }
        return source;
    }
    internal static bool Sensitive(string column)=>column.Contains("password",StringComparison.OrdinalIgnoreCase)
        ||column.Contains("credential",StringComparison.OrdinalIgnoreCase)||column.Contains("secret",StringComparison.OrdinalIgnoreCase)
        ||column.Contains("token",StringComparison.OrdinalIgnoreCase)||column.Contains("connectionstring",StringComparison.OrdinalIgnoreCase)
        ||column.Contains("privatekey",StringComparison.OrdinalIgnoreCase)||column.Contains("license",StringComparison.OrdinalIgnoreCase);
    internal static string? SelectExpression(string source)
    {
        var text=source.Trim().TrimEnd(';').TrimEnd();
        var mask=Literal.Replace(text,m=>new string(' ',m.Length));
        mask=Regex.Replace(mask,@"--[^\r\n]*|/\*[\s\S]*?\*/|\[(?:\]\]|[^\]])*\]|""(?:""""|[^""])*""",m=>new string(' ',m.Length),RegexOptions.CultureInvariant);
        if(!Regex.IsMatch(mask.TrimStart(),@"^SELECT\b",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant))return null;
        var depth=0;var end=text.Length;
        for(var i=0;i<mask.Length;i++)
        {
            if(mask[i]=='(')depth++;else if(mask[i]==')'){if(--depth<0)return null;}
            else if(depth==0&&mask[i]==';')return null;
            else if(depth==0&&mask[i] is 'O' or 'o'&&(i==0||!char.IsLetterOrDigit(mask[i-1])&&mask[i-1]!='_')
                &&Regex.IsMatch(mask[i..],@"^ORDER\s+BY\b",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant)){end=i;break;}
        }
        return depth==0?text[..end].TrimEnd():null;
    }
    internal static object? Scalar(DbDataReader reader,int index)
    {
        if(reader.IsDBNull(index))return null;
        var value=reader.GetValue(index);
        return value switch
        {decimal d=>d.ToString(CultureInfo.InvariantCulture),DateTime date=>date.ToString("yyyy-MM-dd'T'HH:mm:ss.fff",CultureInfo.InvariantCulture),
         Guid guid=>guid.ToString("D"),string or bool or byte or short or int or long=>value,
         double d when double.IsFinite(d)=>d,float f when float.IsFinite(f)=>f,
         _=>throw new InvalidOperationException("Unsupported lookup value.")};
    }
}
