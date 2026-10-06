using System.Data;
using System.Data.Common;
using System.Globalization;
using Medcom.Application;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;

namespace Medcom.Infrastructure.PurchaseRequests;

// Executes only fixed SELECT shapes. No command journal, allocator, procedure or mutation path.
public sealed class SqlPurchaseRequestQueries : IPurchaseRequestQueries
{
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> factory;
    private readonly Func<CancellationToken, Task<AuthoritativeIdentity?>> live;

    public SqlPurchaseRequestQueries(SqlLegacyUserStore database, LegacyCompany company,
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession)
        : this(company, () => database.CreateConnection(), resolveLiveSession) { }

    // Recording connections exercise this same SQL orchestration offline.
    public SqlPurchaseRequestQueries(LegacyCompany company, Func<DbConnection> connectionFactory,
        Func<CancellationToken, Task<AuthoritativeIdentity?>> resolveLiveSession)
    {
        this.company = company ?? throw new ArgumentNullException(nameof(company));
        factory = connectionFactory ?? throw new ArgumentNullException(nameof(connectionFactory));
        live = resolveLiveSession ?? throw new ArgumentNullException(nameof(resolveLiveSession));
    }

    public static readonly string CredentialText = ReadOnly(PurchaseRequestSql.CredentialText);
    // Reuse all three physically bound grant routes, with native Run for reads.
    public static readonly string GrantsText = ReadOnly(PurchaseRequestSql.GrantsText)
        .Replace("G.IsRun=1 AND G.IsAdd=1", "G.IsRun=1", StringComparison.Ordinal)
        .Replace("AS CanAdd", "AS CanRead", StringComparison.Ordinal);
    // Read qualification checks the fixed source fields, never the command journal.
    public const string ShapeText = """
        SELECT CONVERT(int,CASE WHEN
          (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.AP_PurchaseRequestTbl','U'))=14
          AND (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.AP_PurchaseRequestDetailTbl','U'))=9
          AND NOT EXISTS(SELECT 1 FROM (VALUES
            ('AP_PurchaseRequestTbl','PurchaseRequestID','nvarchar',100,0,0,0),
            ('AP_PurchaseRequestTbl','PurchaseDate','datetime',8,1,23,3),
            ('AP_PurchaseRequestTbl','PurposeID','int',4,1,10,0),
            ('AP_PurchaseRequestTbl','PersonSuggest','nvarchar',1000,0,0,0),
            ('AP_PurchaseRequestTbl','Department','nvarchar',200,0,0,0),
            ('AP_PurchaseRequestTbl','PurposeDescOrClient','nvarchar',-1,1,0,0),
            ('AP_PurchaseRequestTbl','Price','decimal',9,1,18,2),
            ('AP_PurchaseRequestTbl','Notes','nvarchar',-1,1,0,0),
            ('AP_PurchaseRequestTbl','StatusID','int',4,0,10,0),
            ('AP_PurchaseRequestTbl','isLock','bit',1,1,1,0),
            ('AP_PurchaseRequestTbl','CurrencyID','varchar',3,0,0,0),
            ('AP_PurchaseRequestTbl','ObjectID','varchar',100,0,0,0),
            ('AP_PurchaseRequestTbl','RateExchange','float',8,0,53,0),
            ('AP_PurchaseRequestTbl','BranchID','varchar',50,0,0,0),
            ('AP_PurchaseRequestDetailTbl','UserAutoID','varchar',50,0,0,0),
            ('AP_PurchaseRequestDetailTbl','ItemID','varchar',50,0,0,0),
            ('AP_PurchaseRequestDetailTbl','Budget','decimal',9,1,18,0),
            ('AP_PurchaseRequestDetailTbl','TimeRequired','nvarchar',400,1,0,0),
            ('AP_PurchaseRequestDetailTbl','Quantity','decimal',9,0,18,0),
            ('AP_PurchaseRequestDetailTbl','UnitPrice','decimal',9,0,18,0),
            ('AP_PurchaseRequestDetailTbl','TotalPrice','decimal',9,1,18,0),
            ('AP_PurchaseRequestDetailTbl','Model','varchar',50,1,0,0),
            ('AP_PurchaseRequestDetailTbl','PurchaseRequestID','nvarchar',100,1,0,0)
          ) E(Tbl,Col,Typ,Len,Nullable,PrecisionValue,ScaleValue)
          LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.'+E.Tbl,'U') AND C.name=E.Col
          LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
          WHERE C.column_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0 OR C.max_length<>E.Len
            OR C.is_nullable<>E.Nullable OR C.is_identity<>0 OR C.is_computed<>0
            OR C.precision<>E.PrecisionValue OR C.scale<>E.ScaleValue)
          THEN 1 ELSE 0 END) AS ShapeOk;
        """;
    public const string BranchesText = """
        SELECT TOP (401) BranchID FROM (
          SELECT BranchID FROM dbo.SY_User WITH (HOLDLOCK)
          WHERE DATALENGTH(CONVERT(nvarchar(max),UserName))=DATALENGTH(@actor)
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),UserName))=CONVERT(varbinary(max),@actor)
          UNION ALL SELECT BranchID FROM dbo.SY_UserBranch WITH (HOLDLOCK)
          WHERE DATALENGTH(CONVERT(nvarchar(max),UserName))=DATALENGTH(@actor)
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),UserName))=CONVERT(varbinary(max),@actor)
        ) B WHERE BranchID IS NOT NULL AND DATALENGTH(CONVERT(nvarchar(max),BranchID))>0;
        """;
    // Native equality deliberately fetches aliases as well; the reader rejects them.
    public const string HeadText = """
        SELECT TOP (2) PurchaseRequestID,PurchaseDate,PurposeID,PersonSuggest,Department,PurposeDescOrClient,Price,Notes,
          StatusID,isLock,CurrencyID,ObjectID,RateExchange,BranchID
        FROM dbo.AP_PurchaseRequestTbl WITH (HOLDLOCK) WHERE PurchaseRequestID=@document;
        """;
    // A byte-identical duplicate in another parent is ambiguous too.
    public const string DetailsText = """
        SELECT TOP (501) C.UserAutoID,C.ItemID,C.Budget,C.TimeRequired,C.Quantity,C.UnitPrice,C.TotalPrice,C.Model,C.PurchaseRequestID,
          CONVERT(int,CASE WHEN (SELECT COUNT_BIG(*) FROM dbo.AP_PurchaseRequestDetailTbl A WITH (HOLDLOCK)
            WHERE A.UserAutoID=C.UserAutoID)>1 THEN 1 ELSE 0 END) AS IdentityAlias
        FROM dbo.AP_PurchaseRequestDetailTbl C WITH (HOLDLOCK) WHERE C.PurchaseRequestID=@document;
        """;
    public static string ListText(int branchCount)
    {
        if (branchCount is < 1 or > 200) throw new ArgumentOutOfRangeException(nameof(branchCount));
        var scope = string.Join(" OR ", Enumerable.Range(0, branchCount).Select(i =>
            $"(DATALENGTH(CONVERT(nvarchar(max),D.BranchID))=DATALENGTH(@branch{i}) AND CONVERT(varbinary(max),CONVERT(nvarchar(max),D.BranchID))=CONVERT(varbinary(max),@branch{i}))"));
        return $$"""
            SELECT D.PurchaseRequestID,D.PurchaseDate,D.BranchID,D.PersonSuggest,D.Department,D.StatusID,D.isLock,
              CONVERT(int,CASE WHEN (SELECT COUNT_BIG(*) FROM dbo.AP_PurchaseRequestTbl A WITH (HOLDLOCK)
                WHERE A.PurchaseRequestID=D.PurchaseRequestID)>1 THEN 1 ELSE 0 END) AS IdentityAlias
            FROM dbo.AP_PurchaseRequestTbl D WITH (HOLDLOCK)
            WHERE ({{scope}}) AND (@search='' OR D.PurchaseRequestID LIKE @search ESCAPE '~')
            ORDER BY D.PurchaseDate DESC,CONVERT(varbinary(max),D.PurchaseRequestID) ASC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
            """;
    }

    public Task<PurchaseRequestQueryResult<PurchaseRequestWorkspace>> WorkspaceAsync(CancellationToken token = default)
        => Run<PurchaseRequestWorkspace>(async (tx, branches, ct) =>
        {
            await Task.CompletedTask;
            return new(branches, false, PurchaseRequestQueryRules.WriteReason, [
                new("branches", true, null, "SY_User.BranchID + SY_UserBranch.BranchID; current physical principal"),
                new("items", false, "source_binding_unqualified", "inventories/source/20261002/table-02.json: CF_ItemTbl; F4 filters UNKNOWN"),
                new("objects", false, "source_binding_unqualified", "inventories/source/20261002/table-01.json: CF_ObjectTbl; F4/branch filters UNKNOWN"),
                new("purposes", false, "source_binding_unqualified", "inventories/source/20261002/table-08.json: AP_PurposePurchaseTbl; F4 binding UNKNOWN"),
                new("currencies", false, "source_binding_unqualified", "CF_CurrencyTbl + CF_CurrencyRateTbl; date/rate precedence UNKNOWN")]);
        }, token);

    public Task<PurchaseRequestQueryResult<PurchaseRequestListPage>> ListAsync(PurchaseRequestListQuery query, CancellationToken token = default)
    {
        if (!PurchaseRequestQueryRules.List(query)) return Invalid<PurchaseRequestListPage>();
        return Run<PurchaseRequestListPage>(async (tx, branches, ct) =>
        {
            if (!string.IsNullOrEmpty(query.BranchId))
            {
                if (!branches.Contains(query.BranchId, StringComparer.Ordinal)) throw new QueryDenied();
                branches = [query.BranchId];
            }
            await using var command = PurchaseRequestSql.Command(tx, ListText(branches.Length));
            for (var i = 0; i < branches.Length; i++) PurchaseRequestSql.Parameter(command, $"@branch{i}", DbType.String, branches[i], 50);
            var search = (query.Search ?? "").Replace("~", "~~", StringComparison.Ordinal).Replace("%", "~%", StringComparison.Ordinal)
                .Replace("_", "~_", StringComparison.Ordinal).Replace("[", "~[", StringComparison.Ordinal);
            PurchaseRequestSql.Parameter(command, "@search", DbType.String, search.Length == 0 ? "" : $"%{search}%", 204);
            PurchaseRequestSql.Parameter(command, "@skip", DbType.Int32, (query.Page - 1) * query.PageSize);
            PurchaseRequestSql.Parameter(command, "@take", DbType.Int32, query.PageSize + 1);
            await using var reader = await command.ExecuteReaderAsync(ct);
            var rows = new List<PurchaseRequestListRow>(); var seen = new HashSet<string>(StringComparer.Ordinal);
            while (await reader.ReadAsync(ct))
            {
                if (new[] { 0, 2, 3, 4, 5, 7 }.Any(reader.IsDBNull) || reader.GetInt32(7) != 0
                    || !branches.Contains(reader.GetString(2), StringComparer.Ordinal)
                    || !PurchaseRequestCommandRules.Identifier(reader.GetString(0), 50) || !seen.Add(reader.GetString(0))
                    || rows.Count > query.PageSize) throw new InvalidOperationException("Invalid source projection.");
                rows.Add(new(reader.GetString(0), Date(reader, 1), reader.GetString(2), reader.GetString(3), reader.GetString(4),
                    reader.GetInt32(5), reader.IsDBNull(6) ? null : reader.GetBoolean(6)));
            }
            return new(rows.Take(query.PageSize).ToArray(), query.Page, query.PageSize, rows.Count > query.PageSize);
        }, token);
    }

    public Task<PurchaseRequestQueryResult<PurchaseRequestReadback>> OpenAsync(string documentId, CancellationToken token = default)
    {
        if (!PurchaseRequestCommandRules.Identifier(documentId, 50)) return Invalid<PurchaseRequestReadback>();
        return Run<PurchaseRequestReadback>(async (tx, branches, ct) =>
        {
            PurchaseRequestAggregate head;
            await using (var command = PurchaseRequestSql.Command(tx, HeadText))
            {
                PurchaseRequestSql.Document(command, documentId);
                await using var reader = await command.ExecuteReaderAsync(ct);
                if (!await reader.ReadAsync(ct)) throw new QueryNotFound();
                if (new[] { 0, 3, 4, 8, 10, 11, 12, 13 }.Any(reader.IsDBNull)
                    || reader.GetString(0) != documentId || !branches.Contains(reader.GetString(13), StringComparer.Ordinal)) throw new QueryNotFound();
                var header = new PurchaseRequestHeaderInput(Date(reader, 1), reader.IsDBNull(2) ? null : reader.GetInt32(2),
                    reader.GetString(3), reader.GetString(4), Text(reader, 5), Decimal(reader, 6, "0.00"), Text(reader, 7),
                    reader.GetString(10), reader.GetString(11), reader.GetDouble(12));
                head = new(documentId, reader.GetString(13), header, reader.GetInt32(8), reader.IsDBNull(9) ? null : reader.GetBoolean(9), []);
                if (await reader.ReadAsync(ct)) throw new QueryNotFound();
            }
            var lines = new List<PurchaseRequestPersistedLine>();
            await using (var command = PurchaseRequestSql.Command(tx, DetailsText))
            {
                PurchaseRequestSql.Document(command, documentId);
                await using var reader = await command.ExecuteReaderAsync(ct);
                while (await reader.ReadAsync(ct))
                {
                    if (lines.Count == PurchaseRequestCommandRules.MaxLines || new[] { 0, 1, 4, 5, 8, 9 }.Any(reader.IsDBNull)
                        || reader.GetString(8) != documentId || reader.GetInt32(9) != 0) throw new InvalidOperationException("Invalid source relation.");
                    lines.Add(new(reader.GetString(0), new(reader.GetString(1), Decimal(reader, 2, "0"), Text(reader, 3),
                        Decimal(reader, 4, "0")!, Decimal(reader, 5, "0")!, Decimal(reader, 6, "0"), Text(reader, 7))));
                }
            }
            var document = PurchaseRequestCommandRules.Normalize(head with { Lines = lines });
            return new(document, PurchaseRequestCommandRules.EqualityToken(document));
        }, token);
    }

    public Task<PurchaseRequestQueryResult<PurchaseRequestLookupPage>> LookupAsync(string kind, string? search, int page, CancellationToken token = default)
    {
        if (!PurchaseRequestQueryRules.Lookup(kind, search, page)) return Invalid<PurchaseRequestLookupPage>();
        return Run<PurchaseRequestLookupPage>(async (tx, branches, ct) =>
        {
            await Task.CompletedTask;
            if (kind != "branches") return new(false, "source_binding_unqualified", [], page, false);
            var matches = branches.Where(branch => branch.Contains(search ?? "", StringComparison.OrdinalIgnoreCase)).ToArray();
            var selected = matches.Skip((page - 1) * 20).Take(21).ToArray();
            // Display the actual authorized ID; no invented branch names.
            return new(true, null, selected.Take(20).Select(id => new PurchaseRequestChoice(id, id)).ToArray(), page, selected.Length > 20);
        }, token);
    }

    private async Task<PurchaseRequestQueryResult<T>> Run<T>(Func<DbTransaction, string[], CancellationToken, Task<T>> read, CancellationToken token)
    {
        try
        {
            var identity = await live(token);
            if (!Eligible(identity)) return new(PurchaseRequestQueryOutcome.Denied);
            if (System.Transactions.Transaction.Current is not null) return new(PurchaseRequestQueryOutcome.Unavailable);
            await using var connection = factory();
            if (connection.State != ConnectionState.Closed) return new(PurchaseRequestQueryOutcome.Unavailable);
            await connection.OpenAsync(token);
            await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);
            var user = await Credential(transaction, identity!, token);
            if (user is null || !await Grant(transaction, user, token)) return new(PurchaseRequestQueryOutcome.Denied);
            var branches = await Branches(transaction, identity!, token);
            if (branches.Length == 0) return new(PurchaseRequestQueryOutcome.Denied);
            await using (var shape = PurchaseRequestSql.Command(transaction, ShapeText))
            {
                await using var reader = await shape.ExecuteReaderAsync(token);
                if (!await reader.ReadAsync(token) || reader.IsDBNull(0) || reader.GetInt32(0) != 1 || await reader.ReadAsync(token))
                    return new(PurchaseRequestQueryOutcome.Unavailable);
            }
            var value = await read(transaction, branches, token);
            var current = await live(token);
            if (!Eligible(current) || current!.PrincipalId != identity!.PrincipalId || current.CredentialStamp != identity.CredentialStamp
                || branches.Any(branch => !current.BranchIds!.Contains(branch, StringComparer.Ordinal))) return new(PurchaseRequestQueryOutcome.Denied);
            await transaction.RollbackAsync(token); // Read-only: release locks without any durable writes.
            return new(PurchaseRequestQueryOutcome.Success, value);
        }
        catch (QueryDenied) { return new(PurchaseRequestQueryOutcome.Denied); }
        catch (QueryNotFound) { return new(PurchaseRequestQueryOutcome.NotFound); }
        catch (Exception) when (!token.IsCancellationRequested) { return new(PurchaseRequestQueryOutcome.Unavailable); }
    }
    private bool Eligible(AuthoritativeIdentity? identity) => identity is not null
        && identity.TenantId == company.TenantId && identity.CompanyId == company.CompanyId
        && PurchaseRequestCommandRules.Identifier(identity.PrincipalId, 100) && identity.CredentialStamp is { Length: > 0 }
        && identity.Capabilities.Contains(PurchaseRequestQueryRules.Capability, StringComparer.Ordinal)
        && identity.BranchIds is { Count: > 0 and <= 200 };
    private static async Task<LegacyUser?> Credential(DbTransaction transaction, AuthoritativeIdentity identity, CancellationToken token)
    {
        await using var command = PurchaseRequestSql.Command(transaction, CredentialText);
        PurchaseRequestSql.Parameter(command, "@actor", DbType.String, identity.PrincipalId, 100);
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token) || Enumerable.Range(0, 5).Any(reader.IsDBNull)) return null;
        var user = new LegacyUser(reader.GetString(0), "", reader.GetString(1), reader.GetBoolean(2), reader.GetString(3), !reader.GetBoolean(4));
        if (await reader.ReadAsync(token) || user.Username != identity.PrincipalId || user.Disabled || !user.GroupEnabled
            || !PurchaseRequestCommandRules.Identifier(user.GroupId, 20) || string.IsNullOrEmpty(user.StoredHash)
            || LegacyIdentityAuthority.Stamp(user) != identity.CredentialStamp) return null;
        return user;
    }
    private static async Task<bool> Grant(DbTransaction transaction, LegacyUser user, CancellationToken token)
    {
        await using var command = PurchaseRequestSql.Command(transaction, GrantsText);
        PurchaseRequestSql.Parameter(command, "@username", DbType.String, user.Username, 100);
        PurchaseRequestSql.Parameter(command, "@group", DbType.String, user.GroupId, 20);
        PurchaseRequestSql.Parameter(command, "@menu", DbType.String, PurchaseRequestCommandRules.MenuId, 50);
        await using var reader = await command.ExecuteReaderAsync(token);
        if (!await reader.ReadAsync(token) || new[] { 0, 1, 3, 4, 5, 6 }.Any(reader.IsDBNull)) return false;
        var allowed = reader.GetString(0) == PurchaseRequestCommandRules.MenuId && reader.GetString(1) == PurchaseRequestCommandRules.FormId
            && (reader.IsDBNull(2) || reader.GetString(2).Length == 0) && !reader.GetBoolean(3)
            && reader.GetString(4) == "05" && !reader.GetBoolean(5) && reader.GetInt32(6) == 1;
        return !await reader.ReadAsync(token) && allowed;
    }
    private static async Task<string[]> Branches(DbTransaction transaction, AuthoritativeIdentity identity, CancellationToken token)
    {
        await using var command = PurchaseRequestSql.Command(transaction, BranchesText);
        PurchaseRequestSql.Parameter(command, "@actor", DbType.String, identity.PrincipalId, 100);
        await using var reader = await command.ExecuteReaderAsync(token);
        var branches = new HashSet<string>(StringComparer.Ordinal); var count = 0;
        while (await reader.ReadAsync(token))
        {
            if (++count > 400 || reader.IsDBNull(0) || !PurchaseRequestCommandRules.Identifier(reader.GetString(0), 50)) throw new QueryDenied();
            if (identity.BranchIds!.Contains(reader.GetString(0), StringComparer.Ordinal)) branches.Add(reader.GetString(0));
            if (branches.Count > 200) throw new QueryDenied();
        }
        return branches.Order(StringComparer.Ordinal).ToArray();
    }
    internal static async Task<bool> HasNativeReadGrantAsync(DbConnection connection, LegacyUser user, CancellationToken token)
    {
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);
        var identity = new AuthoritativeIdentity(user.Username, "", "", "", "", 0, [], LegacyIdentityAuthority.Stamp(user));
        var current = await Credential(transaction, identity, token);
        var allowed = current is not null && await Grant(transaction, current, token);
        await transaction.RollbackAsync(token);
        return allowed;
    }
    private static string ReadOnly(string sql) => sql.Replace("UPDLOCK,HOLDLOCK", "HOLDLOCK", StringComparison.Ordinal);
    private static string? Text(DbDataReader reader, int index) => reader.IsDBNull(index) ? null : reader.GetString(index);
    private static string? Decimal(DbDataReader reader, int index, string format) => reader.IsDBNull(index) ? null
        : PurchaseRequestCommandRules.Decimal(reader.GetDecimal(index).ToString(CultureInfo.InvariantCulture), format == "0.00" ? (byte)2 : (byte)0);
    private static string? Date(DbDataReader reader, int index)
    {
        if (reader.IsDBNull(index)) return null;
        var date = reader.GetDateTime(index);
        if (new System.Data.SqlTypes.SqlDateTime(date).Value != date) throw new InvalidOperationException("Invalid source datetime.");
        return date.ToString("yyyy-MM-dd'T'HH:mm:ss.fff", CultureInfo.InvariantCulture);
    }
    private static Task<PurchaseRequestQueryResult<T>> Invalid<T>() => Task.FromResult(new PurchaseRequestQueryResult<T>(PurchaseRequestQueryOutcome.Invalid));
    private sealed class QueryDenied : Exception;
    private sealed class QueryNotFound : Exception;
}
