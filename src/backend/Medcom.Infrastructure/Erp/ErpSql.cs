using System.Collections.Frozen;
using System.Collections.ObjectModel;
using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

// SQL identifiers originate only in the finite compiled seven-form catalog.
// No HTTP parameter, configuration SQL, caller-supplied schema or table is an identifier.
internal sealed class ErpSqlPlan
{
    private static readonly FrozenDictionary<string,ErpSqlPlan> Plans=ErpScreenCatalog.SourceMetadata
        .GetProperty("screens").EnumerateArray().Select(row=>new ErpSqlPlan(row)).ToFrozenDictionary(plan=>plan.Module,StringComparer.Ordinal);
    private ErpSqlPlan(JsonElement row)
    {
        Module=row.GetProperty("id").GetString()!;Screen=ErpScreenCatalog.Get(Module)!;
        HeaderTable=row.GetProperty("headerTable").GetString()!;
        LineTable=row.GetProperty("lineTable").GetString()!;
        HistoryTable=Optional(row,"historyTable");ComparisonTable=Optional(row,"comparisonTable");
        HeaderKey=Module=="purchase-requests"?"PurchaseRequestID":"DocumentID";
        DateColumn=Module=="purchase-requests"?"PurchaseDate":"DocumentDate";
    }
    internal string Module{get;} internal ErpScreenDescription Screen{get;}
    internal string HeaderTable{get;} internal string LineTable{get;}
    internal string? HistoryTable{get;} internal string? ComparisonTable{get;}
    internal string HeaderKey{get;} internal string DateColumn{get;}
    internal static ErpSqlPlan? Get(string module)=>Plans.GetValueOrDefault(module);
    internal static string Exact(string expression,string parameter)=>
        $"CONVERT(varbinary(max),CONVERT(nvarchar(max),{expression}))=CONVERT(varbinary(max),CONVERT(nvarchar(max),{parameter}))";
    internal static string Projection(IReadOnlyList<ErpFieldDefinition> fields,string alias)=>
        string.Join(",",fields.Select(field=>$"{alias}.[{field.Column}]"));
    internal string ScopePredicate=>Module switch
    {
        "sales-orders"=>$"H.BranchID=@branch AND {Exact("H.UserCreate","@actor")}",
        "internal-transfer-requests"=>$"H.BranchID=@branch AND {Exact("H.SalesUser","@actor")}",
        "machine-movements" or "machine-repairs"=>$"""
            EXISTS(SELECT 1 FROM dbo.[{LineTable}] S WITH(HOLDLOCK)
              JOIN dbo.FA_AssetTbl A WITH(HOLDLOCK) ON A.AssetID=S.AssetID
              WHERE S.DocumentID=H.DocumentID AND A.BranchID=@branch)
            AND NOT EXISTS(SELECT 1 FROM dbo.[{LineTable}] S WITH(HOLDLOCK)
              LEFT JOIN dbo.FA_AssetTbl A WITH(HOLDLOCK) ON A.AssetID=S.AssetID
              WHERE S.DocumentID=H.DocumentID AND (A.AssetID IS NULL OR A.BranchID IS NULL OR A.BranchID<>@branch))
            """,
        _=>"H.BranchID=@branch"
    };
    internal string HeaderText=>$"SELECT TOP(2) {Projection(Screen.Fields["header"],"H")} FROM dbo.[{HeaderTable}] H WITH(HOLDLOCK) WHERE H.[{HeaderKey}]=@document AND {Exact("H.["+HeaderKey+"]","@document")} AND ({ScopePredicate});";
    internal string ListText=>$"""
        SELECT {Projection(Screen.Fields["header"],"H")} FROM dbo.[{HeaderTable}] H WITH(HOLDLOCK)
        WHERE ({ScopePredicate}) AND (@search IS NULL OR H.[{HeaderKey}] LIKE @search ESCAPE N'~')
          AND (@from IS NULL OR H.[{DateColumn}]>=@from) AND (@to IS NULL OR H.[{DateColumn}]<@to)
          {(Screen.Fields["header"].Any(column=>column.Column=="StatusID")?"AND (@status IS NULL OR H.StatusID=@status)":"")}
        ORDER BY H.[{DateColumn}] DESC,H.[{HeaderKey}] COLLATE Latin1_General_100_BIN2 DESC
        OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY;
        """;
    internal string LinesText(string section,bool full=false)
    {
        var table=section switch{"lines"=>LineTable,"history"=>HistoryTable,"comparison"=>ComparisonTable,_=>null};
        if(table is null)throw new InvalidOperationException("Unsupported document section.");
        return $"SELECT {Projection(Screen.Fields[section],"D")} FROM dbo.[{table}] D WITH(HOLDLOCK) WHERE D.[{HeaderKey}]=@document AND {Exact("D.["+HeaderKey+"]","@document")} ORDER BY D.UserAutoID COLLATE Latin1_General_100_BIN2 OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY;";
    }
    internal static DbCommand Command(DbTransaction transaction,string text)
    {
        if(transaction.Connection is not {} connection||transaction.IsolationLevel!=IsolationLevel.Serializable)
            throw new InvalidOperationException("Owned serializable transaction required.");
        var command=connection.CreateCommand();command.Transaction=transaction;command.CommandType=CommandType.Text;
        command.CommandText=text;command.CommandTimeout=10;return command;
    }
    internal static void Parameter(DbCommand command,string name,DbType type,object? value,int size=0)
    {
        var p=command.CreateParameter();p.ParameterName=name;p.DbType=type;p.Value=value??DBNull.Value;p.Size=size;command.Parameters.Add(p);
    }
    internal static void Scope(DbCommand command,AuthoritativeIdentity actor,string branch)
    {Parameter(command,"@actor",DbType.AnsiString,actor.PrincipalId,100);Parameter(command,"@branch",DbType.AnsiString,branch,50);}
    internal static async Task<IReadOnlyDictionary<string,object?>> Row(DbDataReader reader,IReadOnlyList<ErpFieldDefinition> fields,CancellationToken token)
    {
        if(reader.FieldCount!=fields.Count)throw new InvalidOperationException("Source projection shape changed.");
        var result=new Dictionary<string,object?>(StringComparer.Ordinal);
        for(var i=0;i<fields.Count;i++)
        {
            var f=fields[i];object? value=null;
            if(!await reader.IsDBNullAsync(i,token))value=f.SqlType switch
            {
                "varchar" or "nvarchar" or "char" or "nchar"=>reader.GetString(i),
                "datetime" or "datetime2"=>reader.GetDateTime(i).ToString("yyyy-MM-dd'T'HH:mm:ss.fff",CultureInfo.InvariantCulture),
                "date"=>reader.GetDateTime(i).ToString("yyyy-MM-dd",CultureInfo.InvariantCulture),
                "decimal" or "numeric" or "money" or "smallmoney"=>reader.GetDecimal(i).ToString(CultureInfo.InvariantCulture),
                "bit"=>reader.GetBoolean(i),"int"=>reader.GetInt32(i),"smallint"=>reader.GetInt16(i),
                "tinyint"=>reader.GetByte(i),"bigint"=>reader.GetInt64(i),"float"=>reader.GetDouble(i),"real"=>reader.GetFloat(i),
                _=>throw new InvalidOperationException("Unsupported source type.")
            };
            else if(!f.Nullable)throw new InvalidOperationException("Unexpected source null.");
            if(value is double d&&!double.IsFinite(d)||value is float single&&!float.IsFinite(single))
                throw new InvalidOperationException("Invalid source numeric value.");
            result.Add(f.Name,value);
        }
        return new ReadOnlyDictionary<string,object?>(result);
    }
    private static string? Optional(JsonElement row,string key)=>row.GetProperty(key).ValueKind==JsonValueKind.Null?null:row.GetProperty(key).GetString();
}
