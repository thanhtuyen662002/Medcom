using System.Data;
using System.Data.Common;
using System.Globalization;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;

namespace Medcom.Infrastructure.PurchaseRequests;

// Source-pinned, feature-specific SELECTs. Config Source is hashed, never executed or returned.
// No catalog data, disabled predicates, positive-rate rule, date-rate substitution or default is invented.
internal static class PurchaseRequestLookupSql
{
    internal const int PageSize = 20;
    internal const string PurposeSourceHash = "83B4D2F350A6DC45B9840BC7AC4ED14AAE86106088210A6846FCE8ACE0003125";
    internal const string CurrencySourceHash = "9401708F1504420CA7A3F16DFEE1A5E4DE8D80D038519F94B4B9645B6DDAF534";
    internal const string BindingShapeText = """
        SELECT CONVERT(int,CASE WHEN
          (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.SY_FrmDrdwTbl','U'))=42
          AND NOT EXISTS(SELECT 1 FROM (VALUES
            ('UserAutoID','varchar',40,0,0,0,0),
            ('FormID','varchar',250,1,0,0,0),
            ('GridName','varchar',100,1,0,0,0),
            ('ColumnID','varchar',50,0,0,0,0),
            ('ValueColumn','varchar',50,1,0,0,0),
            ('DisplayColumn','varchar',50,1,0,0,0),
            ('ColumnArr','varchar',500,1,0,0,0),
            ('WidthArr','varchar',500,1,0,0,0),
            ('Source','nvarchar',-1,1,0,0,0),
            ('LinkColumn','varchar',500,1,0,0,0),
            ('DisableAddNew','bit',1,1,0,1,0),
            ('ParaArr','varchar',200,1,0,0,0),
            ('ParaRequireArr','varchar',100,1,0,0,0),
            ('Type','varchar',10,1,0,0,0),
            ('KeepValue','bit',1,1,0,1,0),
            ('SummaryFieldArr','varchar',100,1,0,0,0),
            ('IsMultiSelect','bit',1,1,0,1,0),
            ('IsNotInList','bit',1,1,0,1,0),
            ('IsDisable','bit',1,1,0,1,0),
            ('ColumnName_Filter','varchar',50,1,0,0,0),
            ('ColumnValue_Filter','varchar',50,1,0,0,0),
            ('OnlyValue_Filter','varchar',50,1,0,0,0),
            ('ManualSQLSearch','bit',1,1,0,1,0),
            ('ManualSQLOrderBy','varchar',50,1,0,0,0),
            ('DefaultValue','nvarchar',200,1,0,0,0),
            ('IsReload','bit',1,0,0,1,0),
            ('EditableColumns','varchar',250,1,0,0,0),
            ('Caption','nvarchar',300,1,0,0,0),
            ('isLock','bit',1,0,0,1,0),
            ('isInvisible','bit',1,0,0,1,0),
            ('isWordWrap','bit',1,0,0,1,0),
            ('isMultiValue','bit',1,0,0,1,0),
            ('GroupCaption','nvarchar',500,1,0,0,0),
            ('WordWrapArr','varchar',250,1,0,0,0),
            ('GroupColumnArr','varchar',100,1,0,0,0),
            ('DisplayMember2','varchar',50,1,0,0,0),
            ('TreeViewColumn','varchar',50,1,0,0,0),
            ('TreeViewColumnParent','varchar',50,1,0,0,0),
            ('ReloadType','int',4,1,0,10,0),
            ('EditType','int',4,1,0,10,0),
            ('DefaultValueSQL','nvarchar',500,1,0,0,0),
            ('TriggerOnOpenForm','bit',1,1,0,1,0)
          ) E(Col,Typ,Len,Nullable,IdentityValue,PrecisionValue,ScaleValue)
          LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.SY_FrmDrdwTbl','U') AND C.name=E.Col
          LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
          WHERE C.column_id IS NULL OR T.user_type_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0
            OR DATALENGTH(C.name)<>DATALENGTH(CONVERT(nvarchar(max),E.Col))
            OR CONVERT(varbinary(max),C.name)<>CONVERT(varbinary(max),CONVERT(nvarchar(max),E.Col))
            OR C.max_length<>E.Len OR C.is_nullable<>E.Nullable OR C.is_identity<>E.IdentityValue
            OR C.is_computed<>0 OR C.precision<>E.PrecisionValue OR C.scale<>E.ScaleValue)
          THEN 1 ELSE 0 END) AS ShapeOk;
        """;
    internal const string PurposeShapeText = """
        SELECT CONVERT(int,CASE WHEN
          (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.AP_PurposePurchaseTbl','U'))=3
          AND NOT EXISTS(SELECT 1 FROM (VALUES
            ('PurposeID','int',4,0,1,10,0),
            ('PurposeName','nvarchar',100,1,0,0,0),
            ('isDisable','bit',1,1,0,1,0)
          ) E(Col,Typ,Len,Nullable,IdentityValue,PrecisionValue,ScaleValue)
          LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.AP_PurposePurchaseTbl','U') AND C.name=E.Col
          LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
          WHERE C.column_id IS NULL OR T.user_type_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0
            OR DATALENGTH(C.name)<>DATALENGTH(CONVERT(nvarchar(max),E.Col))
            OR CONVERT(varbinary(max),C.name)<>CONVERT(varbinary(max),CONVERT(nvarchar(max),E.Col))
            OR C.max_length<>E.Len OR C.is_nullable<>E.Nullable OR C.is_identity<>E.IdentityValue
            OR C.is_computed<>0 OR C.precision<>E.PrecisionValue OR C.scale<>E.ScaleValue)
          THEN 1 ELSE 0 END) AS ShapeOk;
        """;
    internal const string CurrencyShapeText = """
        SELECT CONVERT(int,CASE WHEN
          (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.CF_CurrencyTbl','U'))=10
          AND NOT EXISTS(SELECT 1 FROM (VALUES
            ('CurrencyID','varchar',3,0,0,0,0),
            ('CurrencyName','nvarchar',200,0,0,0,0),
            ('CurrencyName2','nvarchar',200,1,0,0,0),
            ('isMultiply','bit',1,0,0,1,0),
            ('RateExchange','float',8,0,0,53,0),
            ('UserCreate','varchar',50,1,0,0,0),
            ('UserUpdate','varchar',50,1,0,0,0),
            ('DateUpdate','datetime',8,1,0,23,3),
            ('DateCreate','datetime',8,1,0,23,3),
            ('DonViTienLe','nvarchar',20,1,0,0,0)
          ) E(Col,Typ,Len,Nullable,IdentityValue,PrecisionValue,ScaleValue)
          LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.CF_CurrencyTbl','U') AND C.name=E.Col
          LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
          WHERE C.column_id IS NULL OR T.user_type_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0
            OR DATALENGTH(C.name)<>DATALENGTH(CONVERT(nvarchar(max),E.Col))
            OR CONVERT(varbinary(max),C.name)<>CONVERT(varbinary(max),CONVERT(nvarchar(max),E.Col))
            OR C.max_length<>E.Len OR C.is_nullable<>E.Nullable OR C.is_identity<>E.IdentityValue
            OR C.is_computed<>0 OR C.precision<>E.PrecisionValue OR C.scale<>E.ScaleValue)
          THEN 1 ELSE 0 END) AS ShapeOk;
        """;
    internal const string BindingText = """
        SELECT TOP (2) D.[UserAutoID],D.[FormID],D.[GridName],D.[ColumnID],D.[ValueColumn],D.[DisplayColumn],
          D.[ColumnArr],D.[WidthArr],D.[LinkColumn],D.[DisableAddNew],D.[ParaArr],D.[ParaRequireArr],
          D.[Type],D.[KeepValue],D.[SummaryFieldArr],D.[IsMultiSelect],D.[IsNotInList],D.[IsDisable],
          D.[ColumnName_Filter],D.[ColumnValue_Filter],D.[OnlyValue_Filter],D.[ManualSQLSearch],D.[ManualSQLOrderBy],D.[DefaultValue],
          D.[IsReload],D.[EditableColumns],D.[Caption],D.[isLock],D.[isInvisible],D.[isWordWrap],
          D.[isMultiValue],D.[GroupCaption],D.[WordWrapArr],D.[GroupColumnArr],D.[DisplayMember2],D.[TreeViewColumn],
          D.[TreeViewColumnParent],D.[ReloadType],D.[EditType],D.[DefaultValueSQL],D.[TriggerOnOpenForm],
          HASHBYTES('SHA2_256',CONVERT(varbinary(max),D.[Source])) AS SourceHash,
          CONVERT(int,CASE WHEN (SELECT COUNT_BIG(*) FROM dbo.SY_FrmDrdwTbl A WITH (HOLDLOCK)
            WHERE A.UserAutoID=D.UserAutoID)>1 THEN 1 ELSE 0 END) AS IdentityAlias
        FROM dbo.SY_FrmDrdwTbl D WITH (HOLDLOCK)
        WHERE D.FormID=@form AND D.ColumnID=@field AND (D.GridName IS NULL OR D.GridName='');
        """;
    internal const string PurposeText = """
        SELECT P.PurposeID,P.PurposeName,
          CONVERT(int,CASE WHEN (SELECT COUNT_BIG(*) FROM dbo.AP_PurposePurchaseTbl A WITH (HOLDLOCK)
            WHERE A.PurposeID=P.PurposeID)>1 THEN 1 ELSE 0 END) AS IdentityAlias
        FROM dbo.AP_PurposePurchaseTbl P WITH (HOLDLOCK)
        WHERE @search='' OR CONVERT(nvarchar(11),P.PurposeID) LIKE @search ESCAPE '~' OR P.PurposeName LIKE @search ESCAPE '~'
        ORDER BY P.PurposeID ASC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
        """;
    internal const string CurrencyText = """
        SELECT C.CurrencyID,C.CurrencyName,C.RateExchange,
          CONVERT(int,CASE WHEN (SELECT COUNT_BIG(*) FROM dbo.CF_CurrencyTbl A WITH (HOLDLOCK)
            WHERE A.CurrencyID=C.CurrencyID)>1 THEN 1 ELSE 0 END) AS IdentityAlias
        FROM dbo.CF_CurrencyTbl C WITH (HOLDLOCK)
        WHERE @search='' OR C.CurrencyID LIKE @search ESCAPE '~' OR C.CurrencyName LIKE @search ESCAPE '~'
        ORDER BY C.CurrencyName ASC,CONVERT(varbinary(max),C.CurrencyID) ASC
        OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
        """;
    private static readonly (string Name, Type Type)[] BindingColumns = [
        ("UserAutoID", typeof(string)),
        ("FormID", typeof(string)),
        ("GridName", typeof(string)),
        ("ColumnID", typeof(string)),
        ("ValueColumn", typeof(string)),
        ("DisplayColumn", typeof(string)),
        ("ColumnArr", typeof(string)),
        ("WidthArr", typeof(string)),
        ("LinkColumn", typeof(string)),
        ("DisableAddNew", typeof(bool)),
        ("ParaArr", typeof(string)),
        ("ParaRequireArr", typeof(string)),
        ("Type", typeof(string)),
        ("KeepValue", typeof(bool)),
        ("SummaryFieldArr", typeof(string)),
        ("IsMultiSelect", typeof(bool)),
        ("IsNotInList", typeof(bool)),
        ("IsDisable", typeof(bool)),
        ("ColumnName_Filter", typeof(string)),
        ("ColumnValue_Filter", typeof(string)),
        ("OnlyValue_Filter", typeof(string)),
        ("ManualSQLSearch", typeof(bool)),
        ("ManualSQLOrderBy", typeof(string)),
        ("DefaultValue", typeof(string)),
        ("IsReload", typeof(bool)),
        ("EditableColumns", typeof(string)),
        ("Caption", typeof(string)),
        ("isLock", typeof(bool)),
        ("isInvisible", typeof(bool)),
        ("isWordWrap", typeof(bool)),
        ("isMultiValue", typeof(bool)),
        ("GroupCaption", typeof(string)),
        ("WordWrapArr", typeof(string)),
        ("GroupColumnArr", typeof(string)),
        ("DisplayMember2", typeof(string)),
        ("TreeViewColumn", typeof(string)),
        ("TreeViewColumnParent", typeof(string)),
        ("ReloadType", typeof(int)),
        ("EditType", typeof(int)),
        ("DefaultValueSQL", typeof(string)),
        ("TriggerOnOpenForm", typeof(bool)),
        ("SourceHash", typeof(byte[])), ("IdentityAlias", typeof(int))];
    private static readonly object?[] PurposeBinding = [
        null, "AP_PurposeRequestListFrm", null, "PurposeID", "PurposeID", "PurposeName",
        "PurposeID;PurposeName", null, "PurposeID;PurposeName", true, null, null,
        "Dropdown", false, null, false, false, false,
        null, null, null, false, null, null,
        false, null, null, false, false, false,
        false, null, null, null, null, null,
        null, null, null, null, false];
    private static readonly object?[] CurrencyBinding = [
        null, "AP_PurposeRequestListFrm", null, "CurrencyID", "CurrencyID", "CurrencyID",
        "CurrencyID;CurrencyName;RateExchange", "60;120;70", "RateExchange", true, null, null,
        "Dropdown", false, null, false, false, false,
        null, null, null, false, null, null,
        false, null, null, false, false, false,
        false, null, null, null, null, null,
        null, null, null, null, false];

    internal static async Task<bool> QualifyAsync(DbTransaction transaction, string kind, CancellationToken token)
    {
        var purpose = kind == "purposes";
        if (!purpose && kind != "currencies") return false;
        if (!await ShapeAsync(transaction, BindingShapeText, token)
            || !await ShapeAsync(transaction, purpose ? PurposeShapeText : CurrencyShapeText, token)) return false;
        await using var command = PurchaseRequestSql.Command(transaction, BindingText);
        PurchaseRequestSql.Parameter(command, "@form", DbType.AnsiString, "AP_PurposeRequestListFrm", 250);
        PurchaseRequestSql.Parameter(command, "@field", DbType.AnsiString, purpose ? "PurposeID" : "CurrencyID", 50);
        await using var reader = await command.ExecuteReaderAsync(token);
        RequireShape(reader, BindingColumns);
        var valid = await reader.ReadAsync(token);
        if (valid)
        {
            var expected = purpose ? PurposeBinding : CurrencyBinding;
            valid = !reader.IsDBNull(0) && PurchaseRequestCommandRules.Identifier(reader.GetString(0), 40);
            for (var index = 1; index < expected.Length; index++)
                valid &= expected[index] is null ? reader.IsDBNull(index)
                    : !reader.IsDBNull(index) && expected[index]!.Equals(reader.GetValue(index));
            valid &= !reader.IsDBNull(41) && reader.GetValue(41) is byte[] hash
                && hash.AsSpan().SequenceEqual(Convert.FromHexString(purpose ? PurposeSourceHash : CurrencySourceHash));
            valid &= !reader.IsDBNull(42) && reader.GetInt32(42) == 0;
            // Native equality finds case, accent and padded aliases; never choose an arbitrary one.
            if (await reader.ReadAsync(token)) valid = false;
        }
        await RequireEndAsync(reader, token);
        return valid;
    }

    internal static async Task<PurchaseRequestLookupPage> ReadAsync(DbTransaction transaction, string kind,
        string? search, int page, CancellationToken token)
    {
        if (!await QualifyAsync(transaction, kind, token)) return new(false, "source_binding_unqualified", [], page, false);
        var purpose = kind == "purposes";
        await using var command = PurchaseRequestSql.Command(transaction, purpose ? PurposeText : CurrencyText);
        var escaped = (search ?? "").Replace("~", "~~", StringComparison.Ordinal).Replace("%", "~%", StringComparison.Ordinal)
            .Replace("_", "~_", StringComparison.Ordinal).Replace("[", "~[", StringComparison.Ordinal);
        PurchaseRequestSql.Parameter(command, "@search", DbType.String, escaped.Length == 0 ? "" : $"%{escaped}%", 204);
        PurchaseRequestSql.Parameter(command, "@skip", DbType.Int32, (page - 1) * PageSize);
        PurchaseRequestSql.Parameter(command, "@take", DbType.Int32, PageSize + 1);
        await using var reader = await command.ExecuteReaderAsync(token);
        RequireShape(reader, purpose
            ? [("PurposeID", typeof(int)), ("PurposeName", typeof(string)), ("IdentityAlias", typeof(int))]
            : [("CurrencyID", typeof(string)), ("CurrencyName", typeof(string)), ("RateExchange", typeof(double)), ("IdentityAlias", typeof(int))]);
        var rows = new List<PurchaseRequestChoice>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        while (await reader.ReadAsync(token))
        {
            var aliasIndex = purpose ? 2 : 3;
            if (rows.Count == PageSize + 1 || reader.IsDBNull(0) || reader.IsDBNull(aliasIndex) || reader.GetInt32(aliasIndex) != 0)
                throw new InvalidOperationException("Ambiguous or excessive lookup projection.");
            var id = purpose ? reader.GetInt32(0).ToString(CultureInfo.InvariantCulture) : reader.GetString(0);
            if (!seen.Add(id) || !purpose && !PurchaseRequestCommandRules.Identifier(id, 3))
                throw new InvalidOperationException("Invalid lookup identity.");
            if (purpose)
            {
                var label = reader.IsDBNull(1) ? null : reader.GetString(1);
                if (!PurchaseRequestCommandRules.Text(label, 50, true)) throw new InvalidOperationException("Invalid purpose label.");
                rows.Add(new(id, label));
            }
            else
            {
                if (reader.IsDBNull(1) || reader.IsDBNull(2)) throw new InvalidOperationException("Incomplete currency projection.");
                var name = reader.GetString(1); var rate = reader.GetDouble(2);
                if (!PurchaseRequestCommandRules.Text(name, 100) || !double.IsFinite(rate))
                    throw new InvalidOperationException("Invalid currency projection.");
                rows.Add(new(id, id, name, rate));
            }
        }
        await RequireEndAsync(reader, token);
        return new(true, null, rows.Take(PageSize).ToArray(), page, rows.Count > PageSize);
    }

    private static async Task<bool> ShapeAsync(DbTransaction transaction, string sql, CancellationToken token)
    {
        await using var command = PurchaseRequestSql.Command(transaction, sql);
        await using var reader = await command.ExecuteReaderAsync(token);
        RequireShape(reader, ("ShapeOk", typeof(int)));
        var valid = await reader.ReadAsync(token) && !reader.IsDBNull(0) && reader.GetInt32(0) == 1;
        if (await reader.ReadAsync(token)) valid = false;
        await RequireEndAsync(reader, token);
        return valid;
    }
    private static void RequireShape(DbDataReader reader, params (string Name, Type Type)[] columns)
    {
        if (reader.FieldCount != columns.Length || columns.Where((column, index) =>
                reader.GetFieldType(index) != column.Type || reader.GetName(index) != column.Name).Any())
            throw new InvalidOperationException("Unexpected lookup projection.");
    }
    private static async Task RequireEndAsync(DbDataReader reader, CancellationToken token)
    {
        if (await reader.NextResultAsync(token)) throw new InvalidOperationException("Unexpected lookup result set.");
    }
}
