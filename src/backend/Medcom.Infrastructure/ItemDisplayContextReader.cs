using System.Data;
using System.Data.Common;
using Medcom.Contracts;

namespace Medcom.Infrastructure;

// Only called after the parent/lines are authorized, using their owned serializable transaction.
// The bounded VALUES relation contains opaque read identities, never SQL identifiers.
internal static class ItemDisplayContextReader
{
    public const int MaximumLines = 500;
    public const int MaximumNameLength = 65536;
    private const int MaximumMetadataBytes = 262144;
    public const string MasterShapeText = """
        SELECT /* item-display:master-shape */ CONVERT(int,CASE WHEN
          (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.CF_ItemTbl','U'))=39
          AND NOT EXISTS(SELECT 1 FROM (VALUES
            ('ItemID','nvarchar',100,0),('ItemCode','nvarchar',200,1),
            ('ItemName','nvarchar',-1,1),('Unit','nvarchar',100,1)
          ) E(Col,Typ,Len,Nullable)
          LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.CF_ItemTbl','U') AND C.name=E.Col
          LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
          WHERE C.column_id IS NULL OR T.user_type_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0
            OR DATALENGTH(C.name)<>DATALENGTH(CONVERT(nvarchar(max),E.Col))
            OR CONVERT(varbinary(max),C.name)<>CONVERT(varbinary(max),CONVERT(nvarchar(max),E.Col))
            OR C.max_length<>E.Len OR C.is_nullable<>E.Nullable OR C.is_identity<>0 OR C.is_computed<>0
            OR C.precision<>0 OR C.scale<>0)
          THEN 1 ELSE 0 END) AS ShapeOk;
        """;
    public const string InboundShapeText = """
        SELECT /* item-display:inbound-shape */ CONVERT(int,CASE WHEN
          (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.IV_InboundRequestDetailsTbl','U'))=25
          AND NOT EXISTS(SELECT 1 FROM (VALUES
            ('UserAutoID','varchar',50,0),('DocumentID','varchar',50,0),
            ('ItemID','varchar',50,0),('ItemCode','nvarchar',100,1)
          ) E(Col,Typ,Len,Nullable)
          LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.IV_InboundRequestDetailsTbl','U') AND C.name=E.Col
          LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
          WHERE C.column_id IS NULL OR T.user_type_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0
            OR DATALENGTH(C.name)<>DATALENGTH(CONVERT(nvarchar(max),E.Col))
            OR CONVERT(varbinary(max),C.name)<>CONVERT(varbinary(max),CONVERT(nvarchar(max),E.Col))
            OR C.max_length<>E.Len OR C.is_nullable<>E.Nullable OR C.is_identity<>0 OR C.is_computed<>0
            OR C.precision<>0 OR C.scale<>0)
          THEN 1 ELSE 0 END) AS ShapeOk;
        """;

    public static async Task<ItemDisplayContext?> ReadAsync(DbTransaction transaction, string kind,
        string documentId, string branchId, string? stateToken, int? statusId, bool? isLocked,
        int? page, int? pageSize, IReadOnlyList<(string LineId, string ItemId)> sourceLines,
        CancellationToken token)
    {
        if (transaction.Connection is null || transaction.IsolationLevel != IsolationLevel.Serializable
            || sourceLines.Count > MaximumLines
            || kind is not ("purchase-orders" or "purchase-requests" or "inbound-requests"))
            throw new InvalidOperationException("Invalid authorized display input.");
        // Original authorized rows are not requalified by an optional supplement. If the
        // opaque row relation is unsafe or nonunique, omit the whole context before lookup.
        // R1's ItemID handling remains separate: an unqualified item reference can supply
        // explicit unavailable metadata under an otherwise qualified original row identity.
        if (sourceLines.Any(x => x.LineId.Length==0 || !Text(x.LineId,50))
            || sourceLines.Select(x => x.LineId).Distinct(StringComparer.Ordinal).Count() != sourceLines.Count)
            return null;
        ItemDisplayContext Context(IEnumerable<ItemDisplayLine> lines) => new(kind, documentId, branchId,
            stateToken, statusId, isLocked, page, pageSize, lines.ToArray());
        ItemDisplayContext Unknown() => Context(sourceLines.Select(x => new ItemDisplayLine(
            x.LineId, x.ItemId, null, "unavailable", null, null, "unavailable")));
        if (sourceLines.Count == 0) return Context([]);
        if (sourceLines.All(x => !ReferenceKey(x.ItemId))) return Unknown();
        // An unqualified reference must not invalidate or filter the historical document.
        var master = await Shape(transaction, MasterShapeText, token);
        var inbound = kind == "inbound-requests";
        var stored = inbound && await Shape(transaction, InboundShapeText, token);
        if (!master && !stored) return Unknown();
        await using var command = Command(transaction, ProjectionText(sourceLines.Count, master, stored));
        Parameter(command, "@document", DbType.AnsiString, documentId, 50);
        for (var i = 0; i < sourceLines.Count; i++)
        {
            Parameter(command, $"@line{i}", DbType.String, sourceLines[i].LineId, 50);
            // A historical ItemID is retained in the envelope, but an unqualified key
            // cannot be truncated or used to select optional reference metadata.
            Parameter(command, $"@item{i}", DbType.String,
                ReferenceKey(sourceLines[i].ItemId) ? sourceLines[i].ItemId : DBNull.Value, 50);
        }
        await using var reader = await command.ExecuteReaderAsync(token);
        RequireShape(reader, [("Ordinal",typeof(int)),("MasterRows",typeof(long)),("ItemName",typeof(string)),
            ("Unit",typeof(string)),("MasterCode",typeof(string)),("InvalidMaster",typeof(int)),
            ("StoredRows",typeof(long)),("StoredCode",typeof(string)),("InvalidStored",typeof(int))]);
        var lines = new List<ItemDisplayLine>(); var bytes = 0;
        while (await reader.ReadAsync(token))
        {
            if (lines.Count == sourceLines.Count || reader.IsDBNull(0) || reader.GetInt32(0) != lines.Count
                || new[] {1,5,6,8}.Any(reader.IsDBNull)) throw new InvalidOperationException("Invalid display cardinality.");
            var (lineId, itemId) = sourceLines[lines.Count];
            var count = reader.GetInt64(1); var storedCount = reader.GetInt64(6);
            var invalidMaster = reader.GetInt32(5); var invalidStored = reader.GetInt32(8);
            if (count < 0 || storedCount < 0 || invalidMaster is < 0 or > 1 || invalidStored is < 0 or > 1)
                throw new InvalidOperationException("Invalid display qualification.");
            if (!ReferenceKey(itemId))
            {
                lines.Add(new(lineId,itemId,null,"unavailable",null,null,"unavailable"));
                continue;
            }
            string? Value(int i) => reader.IsDBNull(i) ? null : reader.GetString(i);
            var name = Value(2); var unit = Value(3); var masterCode = Value(4); var storedCode = Value(7);
            var state = !master ? "unavailable" : count == 0 ? "missing" : count != 1 ? "ambiguous"
                : invalidMaster != 0 || !NullableText(name, MaximumNameLength) || !NullableText(unit,50)
                    || !NullableText(masterCode,100) ? "invalid" : "available";
            var codeSource = inbound ? stored && storedCount == 1 && invalidStored == 0 && NullableText(storedCode,50)
                ? "document" : "unavailable" : state == "available" ? "master" : "unavailable";
            var code = codeSource == "document" ? storedCode : codeSource == "master" ? masterCode : null;
            if (state != "available") { name = null; unit = null; }
            // Budget uses JSON's worst-case six bytes per UTF-16 code unit. No truncation or coercion.
            bytes = checked(bytes + 6 * ((name?.Length ?? 0) + (unit?.Length ?? 0) + (code?.Length ?? 0)));
            lines.Add(new(lineId,itemId,code,codeSource,name,unit,state));
        }
        if (lines.Count != sourceLines.Count || await reader.NextResultAsync(token))
            throw new InvalidOperationException("Invalid display relation.");
        return bytes > MaximumMetadataBytes ? Unknown() : Context(lines);
    }

    // SQL equality detects padded/case/accent aliases. Aggregation prevents fanout; only one
    // exact reference can supply metadata. Historical disabled items are deliberately included.
    public static string ProjectionText(int count, bool master, bool stored)
    {
        if (count is < 1 or > MaximumLines) throw new ArgumentOutOfRangeException(nameof(count));
        var values = string.Join(",", Enumerable.Range(0,count).Select(i => $"({i},@line{i},@item{i})"));
        var masterProjection = master ? "M.MasterRows,M.ItemName,M.Unit,M.MasterCode,M.InvalidMaster"
            : "CAST(0 AS bigint) AS MasterRows,CAST(NULL AS nvarchar(max)) AS ItemName,CAST(NULL AS nvarchar(50)) AS Unit,CAST(NULL AS nvarchar(100)) AS MasterCode,0 AS InvalidMaster";
        var storedProjection = stored ? "S.StoredRows,S.StoredCode,S.InvalidStored"
            : "CAST(0 AS bigint) AS StoredRows,CAST(NULL AS nvarchar(50)) AS StoredCode,0 AS InvalidStored";
        var masterApply = master ? """
            OUTER APPLY (SELECT COUNT_BIG(*) AS MasterRows,
              CASE WHEN COUNT_BIG(*)=1 THEN MAX(CASE WHEN DATALENGTH(I.ItemName)<=131072 THEN I.ItemName END) END AS ItemName,
              CASE WHEN COUNT_BIG(*)=1 THEN MAX(I.Unit) END AS Unit,
              CASE WHEN COUNT_BIG(*)=1 THEN MAX(I.ItemCode) END AS MasterCode,
              COALESCE(MAX(CASE WHEN DATALENGTH(I.ItemName)>131072
                OR DATALENGTH(I.ItemID)<>DATALENGTH(L.ItemId)
                OR CONVERT(varbinary(max),I.ItemID)<>CONVERT(varbinary(max),L.ItemId) THEN 1 ELSE 0 END),0) AS InvalidMaster
              FROM dbo.CF_ItemTbl I WITH (HOLDLOCK) WHERE I.ItemID=L.ItemId) M
            """ : "";
        var storedApply = stored ? """
            OUTER APPLY (SELECT COUNT_BIG(*) AS StoredRows,
              CASE WHEN COUNT_BIG(*)=1 THEN MAX(C.ItemCode) END AS StoredCode,
              COALESCE(MAX(CASE WHEN DATALENGTH(CONVERT(nvarchar(max),C.DocumentID))<>DATALENGTH(CONVERT(nvarchar(max),@document))
                OR CONVERT(varbinary(max),CONVERT(nvarchar(max),C.DocumentID))<>CONVERT(varbinary(max),CONVERT(nvarchar(max),@document))
                OR DATALENGTH(CONVERT(nvarchar(max),C.UserAutoID))<>DATALENGTH(L.LineId)
                OR CONVERT(varbinary(max),CONVERT(nvarchar(max),C.UserAutoID))<>CONVERT(varbinary(max),L.LineId)
                OR DATALENGTH(CONVERT(nvarchar(max),C.ItemID))<>DATALENGTH(L.ItemId)
                OR CONVERT(varbinary(max),CONVERT(nvarchar(max),C.ItemID))<>CONVERT(varbinary(max),L.ItemId)
                THEN 1 ELSE 0 END),0) AS InvalidStored
              FROM dbo.IV_InboundRequestDetailsTbl C WITH (HOLDLOCK)
              WHERE C.DocumentID=@document AND C.UserAutoID=L.LineId) S
            """ : "";
        return $"SELECT /* item-display:rows */ L.Ordinal,{masterProjection},{storedProjection} FROM (VALUES {values}) L(Ordinal,LineId,ItemId) {masterApply} {storedApply} ORDER BY L.Ordinal;";
    }
    private static bool ReferenceKey(string text) => text.Length != 0 && Text(text,50);
    private static bool NullableText(string? text,int max) => text is null || Text(text,max);
    private static bool Text(string text,int max)
    {
        if (text.Length > max || text.Contains('\0')) return false;
        for (var i=0;i<text.Length;i++)
            if (char.IsHighSurrogate(text[i])) { if (++i==text.Length || !char.IsLowSurrogate(text[i])) return false; }
            else if (char.IsLowSurrogate(text[i])) return false;
        return true;
    }
    private static DbCommand Command(DbTransaction tx,string sql)
    {
        var command = tx.Connection!.CreateCommand(); command.Transaction=tx; command.CommandTimeout=5; command.CommandText=sql; return command;
    }
    private static void Parameter(DbCommand command,string name,DbType type,object value,int size)
    { var p=command.CreateParameter();p.ParameterName=name;p.DbType=type;p.Size=size;p.Value=value;command.Parameters.Add(p); }
    private static void RequireShape(DbDataReader reader,(string Name,Type Type)[] columns)
    {
        if (reader.FieldCount!=columns.Length || columns.Where((c,i)=>reader.GetName(i)!=c.Name || reader.GetFieldType(i)!=c.Type).Any())
            throw new InvalidOperationException("Invalid display projection.");
    }
    private static async Task<bool> Shape(DbTransaction tx,string sql,CancellationToken token)
    {
        await using var command=Command(tx,sql);await using var reader=await command.ExecuteReaderAsync(token);
        RequireShape(reader,[("ShapeOk",typeof(int))]);
        if (!await reader.ReadAsync(token) || reader.IsDBNull(0)) throw new InvalidOperationException("Invalid display schema result.");
        var value=reader.GetInt32(0);
        if (value is <0 or >1 || await reader.ReadAsync(token) || await reader.NextResultAsync(token))
            throw new InvalidOperationException("Invalid display schema cardinality.");
        return value==1;
    }
}
