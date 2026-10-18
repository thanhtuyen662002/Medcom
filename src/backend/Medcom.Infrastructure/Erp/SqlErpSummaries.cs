using System.Data;
using System.Data.Common;
using System.Globalization;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

internal static class SqlErpSummaries
{
    internal static string? Text(ErpSqlPlan plan)
    {
        var fields=ErpCalculatedFields.Summary(plan.Module);
        if(fields.Count==0)return null;
        var sums=fields.Select(field=>
        {
            var scale=field.SqlType switch
            {
                "decimal" or "numeric"=>int.Parse(field.TypeArguments!.Trim('(',')').Split(',')[1],CultureInfo.InvariantCulture),
                "money" or "smallmoney"=>4,"int" or "bigint" or "smallint" or "tinyint"=>0,
                _=>throw new InvalidOperationException("Unsupported native summary type.")
            };
            return $"CONVERT(varchar(100),SUM(CONVERT(decimal(38,{scale}),D.[{field.Column}])))";
        });
        return $"SELECT COUNT_BIG(*),{string.Join(',',sums)} FROM dbo.[{plan.LineTable}] D WITH(HOLDLOCK) WHERE D.[{plan.SectionKey("lines")}]=@document AND {ErpSqlPlan.Exact("D.["+plan.SectionKey("lines")+"]","@document")};";
    }
    internal static async Task<IReadOnlyDictionary<string,object?>?> Read(DbTransaction transaction,ErpSqlPlan plan,
        string document,CancellationToken token)
    {
        if(Text(plan)is not {} text)return null;
        await using var command=ErpSqlPlan.Command(transaction,text);
        ErpSqlPlan.Parameter(command,"@document",DbType.String,document,50);
        await using var reader=await command.ExecuteReaderAsync(token);
        var fields=ErpCalculatedFields.Summary(plan.Module);
        if(reader.FieldCount!=1+fields.Count||!await reader.ReadAsync(token)||reader.IsDBNull(0)||reader.GetInt64(0)<0)
            throw new InvalidOperationException("Invalid native summary result.");
        var result=new Dictionary<string,object?>{{"rowCount",reader.GetInt64(0)}};
        for(var i=0;i<fields.Count;i++)result.Add(fields[i].Name,reader.IsDBNull(i+1)?null:reader.GetString(i+1));
        if(await reader.ReadAsync(token)||await reader.NextResultAsync(token))throw new InvalidOperationException("Unexpected native summary result.");
        return result;
    }
}
