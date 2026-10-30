using System.Collections.Frozen;
using System.Collections.ObjectModel;
using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

// SQL identifiers originate only in the finite compiled form catalog.
// No HTTP parameter, configuration SQL, caller-supplied schema or table is an identifier.
internal sealed class ErpSqlPlan
{
    private static readonly FrozenDictionary<string,ErpSqlPlan> Plans=ErpScreenCatalog.AllScreenMetadata
        .Select(row=>new ErpSqlPlan(row)).ToFrozenDictionary(plan=>plan.Module,StringComparer.Ordinal);
    private ErpSqlPlan(JsonElement row)
    {
        Module=row.GetProperty("id").GetString()!;Screen=ErpScreenCatalog.Get(Module)!;
        HeaderTable=row.GetProperty("headerTable").GetString()!;
        LineTable=row.GetProperty("lineTable").GetString()!;
        HistoryTable=Optional(row,"historyTable");ComparisonTable=Optional(row,"comparisonTable");
        HeaderKey=row.TryGetProperty("headerKey",out var key)?key.GetString()!:Module=="purchase-requests"?"PurchaseRequestID":"DocumentID";
        DateColumn=row.TryGetProperty("dateColumn",out var date)?date.GetString()!:Module=="purchase-requests"?"PurchaseDate":"DocumentDate";
        Tables=row.TryGetProperty("tables",out var tables)?tables.EnumerateObject().ToDictionary(p=>p.Name,p=>p.Value.GetString()!,StringComparer.Ordinal)
            :new Dictionary<string,string>(StringComparer.Ordinal){{"header",HeaderTable},{"lines",LineTable}};
        if(HistoryTable is not null)Tables.TryAdd("history",HistoryTable);
        if(ComparisonTable is not null)Tables.TryAdd("comparison",ComparisonTable);
    }
    internal string Module{get;} internal ErpScreenDescription Screen{get;}
    internal string HeaderTable{get;} internal string LineTable{get;}
    internal string? HistoryTable{get;} internal string? ComparisonTable{get;}
    internal string HeaderKey{get;} internal string DateColumn{get;}
    internal Dictionary<string,string> Tables{get;}
    internal string SectionKey(string section)=>ErpScreenCatalog.Metadata(Module).TryGetProperty("sectionKeys",out var keys)?keys.GetProperty(section).GetString()!:HeaderKey;
    internal string HeaderJsonKey=>NativeName(HeaderKey);
    internal string DateJsonKey=>NativeName(DateColumn);
    private static string NativeName(string value){var name=value.Replace("ID","Id",StringComparison.Ordinal);return char.ToLowerInvariant(name[0])+name[1..];}
    internal static ErpSqlPlan? Get(string module)=>Plans.GetValueOrDefault(module);
    internal static string Exact(string expression,string parameter)=>
        $"CONVERT(varbinary(max),CONVERT(nvarchar(max),{expression}))=CONVERT(varbinary(max),CONVERT(nvarchar(max),{parameter}))";
    internal static string Projection(IReadOnlyList<ErpFieldDefinition> fields,string alias)=>
        string.Join(",",fields.Select(field=>field.Virtual?$"V.[{field.SourceColumn??field.Column}] AS [{field.Column}]":$"{alias}.[{field.Column}]"));
    private string ReadJoin(string section,string alias)
    {
        if(!ErpScreenCatalog.Metadata(Module).TryGetProperty("readJoins",out var joins)||!joins.TryGetProperty(section,out var join))return "";
        var source=alias+".["+join.GetProperty("sourceKey").GetString()+"]";
        var target="V.["+join.GetProperty("targetKey").GetString()+"]";
        return $" LEFT JOIN dbo.[{join.GetProperty("view").GetString()}] V WITH(HOLDLOCK) ON {source}={target} AND {Exact(source,target)} ";
    }
    internal string ScopePredicate=>Module switch
    {
        "sales-orders"=>$"H.BranchID=@branch AND {Exact("H.UserCreate","@actor")}",
        "internal-transfer-requests"=>$"H.BranchID=@branch AND {Exact("H.SalesUser","@actor")}",
        "sales-order-pm"=>$"H.BranchID=@branch AND (EXISTS(SELECT 1 FROM dbo.SY_String2TableFnc(COALESCE(H.SendTo,N'')) U WHERE {Exact("LTRIM(RTRIM(CONVERT(nvarchar(4000),U.Value)))","@actor")}) OR EXISTS(SELECT 1 FROM dbo.AR_OrderLogTbl L WITH(HOLDLOCK) CROSS APPLY dbo.SY_String2TableFnc(COALESCE(L.SendTo,N'')) U WHERE L.DocumentID=H.DocumentID AND L.StatusID=12 AND {Exact("LTRIM(RTRIM(CONVERT(nvarchar(4000),U.Value)))","@actor")}))",
        "sales-order-sa"=>"H.BranchID=@branch AND EXISTS(SELECT 1 FROM dbo.AR_OrderLogTbl L WITH(HOLDLOCK) WHERE L.DocumentID=H.DocumentID AND L.StatusID=14)",
        // IV_IncomingShipmentStatusFrm T0 TN3/FTR: requests ever sent to the warehouse (history status 2),
        // so a request returned to it (3) or already passed on still lists; actions stay status-bound.
        "inbound-warehouse"=>"H.BranchID=@branch AND EXISTS(SELECT 1 FROM dbo.IV_InboundRequestLogTbl L WITH(HOLDLOCK) WHERE L.DocumentID=H.DocumentID AND L.StatusID=2)",
        // T0 TN3 of each form: history rows of the step (returned requests stay listed); PM also by SendTo like FTR.
        "inbound-sa"=>"H.BranchID=@branch AND EXISTS(SELECT 1 FROM dbo.IV_InboundRequestLogTbl L WITH(HOLDLOCK) WHERE L.DocumentID=H.DocumentID AND L.StatusID IN(4,5))",
        "inbound-tech"=>"H.BranchID=@branch AND EXISTS(SELECT 1 FROM dbo.IV_InboundRequestLogTbl L WITH(HOLDLOCK) WHERE L.DocumentID=H.DocumentID AND L.StatusID IN(8,9))",
        // IV_InboundRequestCTCPFrm T0 FTR: every request past TM except the BLĐ-rejected/cancelled ones.
        "inbound-costs"=>"H.BranchID=@branch AND H.StatusID>=2 AND H.StatusID NOT IN(11,12)",
        "inbound-bld"=>"H.BranchID=@branch AND EXISTS(SELECT 1 FROM dbo.IV_InboundRequestLogTbl L WITH(HOLDLOCK) WHERE L.DocumentID=H.DocumentID AND L.StatusID IN(10))",
        // IV_GoodsQualityControlConfirmFrm T0 TN3 + FTR: requests that reached PM (history 6/7) and are sent to this
        // PM now (header SendTo), so a request handed to another PM leaves the earlier PM's list.
        "inbound-pm"=>$"H.BranchID=@branch AND EXISTS(SELECT 1 FROM dbo.IV_InboundRequestLogTbl L WITH(HOLDLOCK) WHERE L.DocumentID=H.DocumentID AND L.StatusID IN(6,7)) AND EXISTS(SELECT 1 FROM dbo.SY_String2TableFnc(COALESCE(H.SendTo,N'')) U WHERE {Exact("LTRIM(RTRIM(CONVERT(nvarchar(4000),U.Value)))","@actor")})",
        "internal-transfer-pm"=>$"H.BranchID=@branch AND ( {Exact("H.AssignedPM","@actor")} OR EXISTS(SELECT 1 FROM dbo.SY_String2TableFnc(COALESCE(H.SendTo,N'')) U WHERE {Exact("LTRIM(RTRIM(CONVERT(nvarchar(4000),U.Value)))","@actor")}))",
        _ when HeaderKey=="BatchID"=>Module=="internal-transfer-warehouse-in"?"H.ToBranchID=@branch":"H.FromBranchID=@branch",
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
    internal string HeaderText=>$"SELECT TOP(2) {Projection(Screen.Fields["header"],"H")} FROM dbo.[{HeaderTable}] H WITH(HOLDLOCK) {ReadJoin("header","H")} WHERE H.[{HeaderKey}]=@document AND {Exact("H.["+HeaderKey+"]","@document")} AND ({ScopePredicate});";
    // The list search box says "Tìm mã, đối tượng": a document with an ERP object (customer/supplier) also matches
    // on the object's code or name.
    private string ObjectSearch=>Screen.Fields["header"].Any(column=>column.Column=="ObjectID")
        ?" OR H.ObjectID LIKE @search ESCAPE N'~' OR EXISTS(SELECT 1 FROM dbo.CF_ObjectTbl SO WITH(HOLDLOCK) WHERE SO.ObjectID=H.ObjectID AND SO.ObjectName LIKE @search ESCAPE N'~')":"";
    internal string ListText=>$"""
        SELECT {Projection(Screen.Fields["header"],"H")} FROM dbo.[{HeaderTable}] H WITH(HOLDLOCK) {ReadJoin("header","H")}
        WHERE ({ScopePredicate}) AND (@search IS NULL OR H.[{HeaderKey}] LIKE @search ESCAPE N'~'{ObjectSearch})
          AND (@from IS NULL OR H.[{DateColumn}]>=@from) AND (@to IS NULL OR H.[{DateColumn}]<@to)
          {(Screen.Fields["header"].Any(column=>column.Column=="StatusID")?"AND (@status IS NULL OR H.StatusID=@status)":"")}
        ORDER BY H.[{DateColumn}] DESC,H.[{HeaderKey}] COLLATE Latin1_General_100_BIN2 DESC
        OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY;
        """;
    // Same branch/native scope as ListText, grouped by status instead of paged.
    internal string StatusCountText=>$"""
        SELECT H.StatusID, COUNT_BIG(*) FROM dbo.[{HeaderTable}] H WITH(HOLDLOCK) {ReadJoin("header","H")}
        WHERE ({ScopePredicate}) AND H.StatusID IS NOT NULL
        GROUP BY H.StatusID ORDER BY H.StatusID;
        """;
    internal string LinesText(string section,bool full=false)
    {
        var table=Tables.GetValueOrDefault(section);
        if(table is null)throw new InvalidOperationException("Unsupported document section.");
        var key=SectionKey(section);
        return $"SELECT {Projection(Screen.Fields[section],"D")} FROM dbo.[{table}] D WITH(HOLDLOCK) {ReadJoin(section,"D")} WHERE D.[{key}]=@document AND {Exact("D.["+key+"]","@document")} ORDER BY D.UserAutoID COLLATE Latin1_General_100_BIN2 OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY;";
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
