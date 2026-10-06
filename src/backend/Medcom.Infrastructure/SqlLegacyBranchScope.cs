using System.Data;
using System.Data.Common;
using Medcom.Application.PurchaseRequests;

[assembly: System.Runtime.CompilerServices.InternalsVisibleTo("Medcom.Api.Tests")]

namespace Medcom.Infrastructure;

// Native blank is a property of a successfully resolved user, never of a derived array.
// CF_BranchTbl source: table-04.json, source line 13987, masked SHA-256
// 34314ab656dcbff2a8448bd50a7bd3b72bc29b7899b24f3edf019bd977d49e6c.
internal static class SqlLegacyBranchScope
{
    internal const int MaximumBranches = 200;
    internal const string NativeUserText = """
        SELECT TOP (2) U.UserName,U.[Password],U.[Disable],U.UserGroupID,G.IsDisable,U.BranchID
        FROM dbo.SY_User U WITH (HOLDLOCK)
        LEFT JOIN dbo.SY_UserGroup G WITH (HOLDLOCK) ON G.UserGroupID=U.UserGroupID
          AND DATALENGTH(CONVERT(nvarchar(max),G.UserGroupID))=DATALENGTH(CONVERT(nvarchar(max),U.UserGroupID))
          AND CONVERT(varbinary(max),CONVERT(nvarchar(max),G.UserGroupID))=CONVERT(varbinary(max),CONVERT(nvarchar(max),U.UserGroupID))
        WHERE U.UserName=@actor;
        """;
    internal const string RestrictedText = """
        SELECT TOP (401) BranchID FROM (
          SELECT BranchID FROM dbo.SY_User WITH (HOLDLOCK)
          WHERE DATALENGTH(CONVERT(nvarchar(max),UserName))=DATALENGTH(@actor)
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),UserName))=CONVERT(varbinary(max),@actor)
          UNION ALL SELECT BranchID FROM dbo.SY_UserBranch WITH (HOLDLOCK)
          WHERE DATALENGTH(CONVERT(nvarchar(max),UserName))=DATALENGTH(@actor)
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),UserName))=CONVERT(varbinary(max),@actor)
        ) B WHERE BranchID IS NOT NULL AND DATALENGTH(BranchID)>0;
        """;
    // Every known column is qualified; additions/removals cannot silently introduce scope/status semantics.
    // isDefault is intentionally not interpreted as enabled or disabled.
    internal const string CatalogShapeText = """
        SELECT CONVERT(int,CASE WHEN
          (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.CF_BranchTbl','U'))=17
          AND NOT EXISTS(SELECT 1 FROM (VALUES
            ('BranchID','varchar',50,0),
            ('BranchName','nvarchar',200,0),
            ('BranchFullName','nvarchar',500,1),
            ('BranchAddress','nvarchar',300,1),
            ('BranchPhone','nvarchar',300,1),
            ('BranchTaxcode','nvarchar',100,1),
            ('isDefault','bit',1,0),
            ('OrderStorehouseID','varchar',50,1),
            ('UserCreate','varchar',50,1),
            ('UserUpdate','varchar',50,1),
            ('DateUpdate','datetime',8,1),
            ('DateCreate','datetime',8,1),
            ('ThongTinChuyenKhoan','nvarchar',1000,1),
            ('ThongTinChuyenKhoan2','nvarchar',1000,1),
            ('ChamSocKhachHang','nvarchar',1000,1),
            ('ChamSocKhachHang2','nvarchar',1000,1),
            ('SoDienThoaiCSKH','varchar',50,1)
          ) E(Col,Typ,Len,Nullable)
          LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.CF_BranchTbl','U') AND C.name=E.Col
          LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
          WHERE C.column_id IS NULL OR T.user_type_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0 OR C.max_length<>E.Len
            OR C.is_nullable<>E.Nullable OR C.is_identity<>0 OR C.is_computed<>0)
          THEN 1 ELSE 0 END) AS ShapeOk;
        """;
    internal const string CatalogText = """
        SELECT TOP (201) C.BranchID,
          CONVERT(int,CASE WHEN (SELECT COUNT_BIG(*) FROM dbo.CF_BranchTbl A WITH (HOLDLOCK)
            WHERE A.BranchID=C.BranchID)>1 THEN 1 ELSE 0 END) AS IdentityAlias
        FROM dbo.CF_BranchTbl C WITH (HOLDLOCK);
        """;

    internal static bool NativeAll(string? nativeBranch) => nativeBranch is null || nativeBranch.Length == 0;

    internal static string[] Validate(IEnumerable<string?> values, bool rejectDuplicates)
    {
        var result = new HashSet<string>(StringComparer.Ordinal);
        foreach (var value in values)
        {
            if (!PurchaseRequestCommandRules.Identifier(value, 50) || value != value!.Trim()
                || (!result.Add(value!) && rejectDuplicates) || result.Count > MaximumBranches)
                throw new InvalidOperationException("Invalid native branch scope.");
        }
        return result.Order(StringComparer.Ordinal).ToArray();
    }

    internal static async Task<string[]> ReadAsync(DbTransaction transaction, LegacyUser expected, CancellationToken token)
    {
        if (transaction.IsolationLevel != IsolationLevel.Serializable || expected.Disabled || !expected.GroupEnabled
            || string.IsNullOrEmpty(expected.StoredHash)) throw new InvalidOperationException("Invalid scope authority.");
        string? native;
        await using (var command = Command(transaction, NativeUserText, expected.Username))
        await using (var reader = await command.ExecuteReaderAsync(token))
        {
            RequireShape(reader, typeof(string), typeof(string), typeof(bool), typeof(string), typeof(bool), typeof(string));
            if (!await reader.ReadAsync(token) || Enumerable.Range(0, 5).Any(reader.IsDBNull))
                throw new InvalidOperationException("Native principal unavailable.");
            var current = new LegacyUser(reader.GetString(0), "", reader.GetString(1), reader.GetBoolean(2), reader.GetString(3), !reader.GetBoolean(4));
            native = reader.IsDBNull(5) ? null : reader.GetString(5);
            if (await reader.ReadAsync(token) || current.Username != expected.Username || current.Disabled || !current.GroupEnabled
                || LegacyIdentityAuthority.Stamp(current) != LegacyIdentityAuthority.Stamp(expected))
                throw new InvalidOperationException("Native principal changed.");
            await RequireEnd(reader, token);
        }
        if (!NativeAll(native))
        {
            // Whitespace and malformed native assignments are never expanded or repaired.
            Validate([native], true);
            await using var command = Command(transaction, RestrictedText, expected.Username);
            await using var reader = await command.ExecuteReaderAsync(token);
            RequireShape(reader, typeof(string));
            var values = new List<string?>();
            while (await reader.ReadAsync(token))
            {
                if (values.Count == 400) throw new InvalidOperationException("Native scope exceeds bound.");
                values.Add(reader.IsDBNull(0) ? null : reader.GetString(0));
            }
            await RequireEnd(reader, token);
            return Validate(values, false);
        }
        await using (var command = Command(transaction, CatalogShapeText))
        await using (var reader = await command.ExecuteReaderAsync(token))
        {
            RequireShape(reader, typeof(int));
            if (!await reader.ReadAsync(token) || reader.IsDBNull(0) || reader.GetInt32(0) != 1 || await reader.ReadAsync(token))
                throw new InvalidOperationException("Unqualified branch catalog.");
            await RequireEnd(reader, token);
        }
        await using (var command = Command(transaction, CatalogText))
        await using (var reader = await command.ExecuteReaderAsync(token))
        {
            RequireShape(reader, typeof(string), typeof(int));
            var values = new List<string?>();
            while (await reader.ReadAsync(token))
            {
                if (values.Count == MaximumBranches || reader.IsDBNull(0) || reader.IsDBNull(1) || reader.GetInt32(1) != 0)
                    throw new InvalidOperationException("Ambiguous or excessive branch catalog.");
                values.Add(reader.GetString(0));
            }
            await RequireEnd(reader, token);
            return Validate(values, true);
        }
    }

    private static void RequireShape(DbDataReader reader, params Type[] types)
    {
        if (reader.FieldCount != types.Length || types.Where((type, index) => reader.GetFieldType(index) != type).Any())
            throw new InvalidOperationException("Unexpected native scope projection.");
    }

    private static async Task RequireEnd(DbDataReader reader, CancellationToken token)
    {
        if (await reader.NextResultAsync(token)) throw new InvalidOperationException("Unexpected native scope result set.");
    }

    internal static DbCommand Command(DbTransaction transaction, string sql, string? actor = null)
    {
        var command = transaction.Connection!.CreateCommand();
        command.Transaction = transaction; command.CommandText = sql; command.CommandTimeout = 5;
        if (actor is not null)
        {
            var parameter = command.CreateParameter(); parameter.ParameterName = "@actor";
            parameter.DbType = DbType.String; parameter.Size = 100; parameter.Value = actor;
            command.Parameters.Add(parameter);
        }
        return command;
    }

    internal static string ExactBranchPredicate(string column, int count)
    {
        if (count is < 1 or > MaximumBranches) throw new ArgumentOutOfRangeException(nameof(count));
        return string.Join(" OR ", Enumerable.Range(0, count).Select(i =>
            $"(DATALENGTH(CONVERT(nvarchar(max),{column}))=DATALENGTH(@branch{i}) AND CONVERT(varbinary(max),CONVERT(nvarchar(max),{column}))=CONVERT(varbinary(max),@branch{i}))"));
    }
}
