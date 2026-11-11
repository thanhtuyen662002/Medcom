using System.Data;
using System.Text;
using Medcom.Application.Audit;
using Medcom.Contracts;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.Audit;

/// <summary>
/// Stores and reads dbo.MedcomWebAuditLog. Every statement is fixed text with typed
/// parameters; filters only add fixed predicates. Never touches native ERP objects.
/// </summary>
public sealed class SqlWebAuditStore(Func<SqlConnection> connect) : IWebAuditQueries
{
    public const string Table = "dbo.MedcomWebAuditLog";
    public const int MaximumPageSize = 200;

    public static string InstallSql { get; } = ReadResource("Medcom.WebAuditLog.sql");

    /// <summary>Uses the ERP connection settings with its own application name.</summary>
    public static SqlWebAuditStore FromStore(SqlLegacyUserStore store) => new(store.CreateAuditConnection);

    // Column order of the bulk insert; AuditId and RecordedAtUtc come from SQL Server.
    private static readonly (string Name, Type Type, int Size)[] Columns =
    [
        ("OccurredAtUtc", typeof(DateTime), 0), ("Source", typeof(string), 10), ("Category", typeof(string), 20),
        ("Action", typeof(string), 100), ("Outcome", typeof(string), 30), ("UserName", typeof(string), 100),
        ("DisplayName", typeof(string), 200), ("RoleName", typeof(string), 200), ("SessionRef", typeof(string), 32),
        ("BranchId", typeof(string), 50), ("Module", typeof(string), 100), ("DocumentId", typeof(string), 100),
        ("HttpMethod", typeof(string), 10), ("Path", typeof(string), 400), ("QueryText", typeof(string), 2000),
        ("StatusCode", typeof(short), 0), ("DurationMs", typeof(int), 0), ("CorrelationId", typeof(string), 64),
        ("ClientAddress", typeof(string), 64), ("PeerAddress", typeof(string), 64), ("UserAgent", typeof(string), 512),
        ("Page", typeof(string), 200), ("Target", typeof(string), 400), ("ClientEventId", typeof(Guid), 0),
        ("ClientTimeUtc", typeof(DateTime), 0), ("RequestData", typeof(string), -1), ("ResultData", typeof(string), -1),
        ("ErrorCode", typeof(string), 100)
    ];
    internal static IReadOnlyList<string> ColumnNames { get; } = ["AuditId", "RecordedAtUtc", .. Columns.Select(c => c.Name)];

    /// <summary>True only when the table exists with every expected column.</summary>
    public async Task<bool> InstalledAsync(CancellationToken token)
    {
        await using var connection = connect();
        await connection.OpenAsync(token);
        await using var command = new SqlCommand(
            "SELECT name FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.MedcomWebAuditLog',N'U');", connection) { CommandTimeout = 10 };
        var present = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using (var reader = await command.ExecuteReaderAsync(token))
            while (await reader.ReadAsync(token)) present.Add(reader.GetString(0));
        return ColumnNames.All(present.Contains);
    }

    /// <summary>Creates the table if absent (idempotent). Returns whether it was created now.</summary>
    public async Task<bool> InstallAsync(CancellationToken token)
    {
        await using var connection = connect();
        await connection.OpenAsync(token);
        bool existed;
        await using (var probe = new SqlCommand("SELECT CASE WHEN OBJECT_ID(N'dbo.MedcomWebAuditLog',N'U') IS NULL THEN 0 ELSE 1 END;", connection))
            existed = Convert.ToInt32(await probe.ExecuteScalarAsync(token), System.Globalization.CultureInfo.InvariantCulture) == 1;
        await using (var command = new SqlCommand(InstallSql, connection) { CommandTimeout = 120 })
            await command.ExecuteNonQueryAsync(token);
        if (!await InstalledAsync(token)) throw new InvalidOperationException("Existing dbo.MedcomWebAuditLog does not match schema version 1.");
        return !existed;
    }

    public async Task InsertAsync(IReadOnlyList<WebAuditEntry> entries, CancellationToken token)
    {
        if (entries.Count == 0) return;
        using var table = new DataTable();
        foreach (var (name, type, _) in Columns) table.Columns.Add(name, type);
        foreach (var entry in entries)
        {
            var row = table.NewRow();
            var values = Values(entry);
            for (var i = 0; i < Columns.Length; i++) row[i] = values[i] ?? DBNull.Value;
            table.Rows.Add(row);
        }
        await using var connection = connect();
        await connection.OpenAsync(token);
        await using var transaction = (SqlTransaction)await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted, token);
        var columns = string.Join(",", Columns.Select(c => c.Name));
        var definitions = string.Join(",", Columns.Select(c => c.Name + " " + SqlType(c.Type, c.Size) + " NULL"));
        await using (var create = new SqlCommand("CREATE TABLE #MedcomWebAuditBatch(BatchRow int IDENTITY(1,1) NOT NULL," + definitions + ");", connection, transaction))
            await create.ExecuteNonQueryAsync(token);
        using (var bulk = new SqlBulkCopy(connection, SqlBulkCopyOptions.Default, transaction)
               { DestinationTableName = "#MedcomWebAuditBatch", BulkCopyTimeout = 60 })
        {
            foreach (var (name, _, _) in Columns) bulk.ColumnMappings.Add(name, name);
            await bulk.WriteToServerAsync(table, token);
        }
        // Resent browser events keep their id: store each id once.
        await using (var insert = new SqlCommand($"""
            INSERT {Table}({columns})
            SELECT {columns} FROM #MedcomWebAuditBatch AS B
            WHERE B.ClientEventId IS NULL
               OR (NOT EXISTS (SELECT 1 FROM {Table} AS L WHERE L.ClientEventId=B.ClientEventId)
                   AND B.BatchRow=(SELECT MIN(D.BatchRow) FROM #MedcomWebAuditBatch AS D WHERE D.ClientEventId=B.ClientEventId))
            ORDER BY B.BatchRow;
            DROP TABLE #MedcomWebAuditBatch;
            """, connection, transaction) { CommandTimeout = 60 })
            await insert.ExecuteNonQueryAsync(token);
        await transaction.CommitAsync(token);
    }

    /// <summary>Deletes rows older than the cutoff in small batches. Returns rows deleted.</summary>
    public async Task<long> PurgeAsync(DateTimeOffset cutoff, int batchSize, CancellationToken token)
    {
        long total = 0;
        await using var connection = connect();
        await connection.OpenAsync(token);
        while (!token.IsCancellationRequested)
        {
            await using var command = new SqlCommand($"DELETE TOP (@batch) FROM {Table} WHERE OccurredAtUtc<@cutoff;", connection) { CommandTimeout = 120 };
            command.Parameters.Add("@batch", SqlDbType.Int).Value = batchSize;
            command.Parameters.Add("@cutoff", SqlDbType.DateTime2).Value = cutoff.UtcDateTime;
            var deleted = await command.ExecuteNonQueryAsync(token);
            total += deleted;
            if (deleted < batchSize) break;
        }
        return total;
    }

    public async Task<WebAuditPage?> SearchAsync(WebAuditQuery query, CancellationToken cancellationToken)
    {
        var page = Math.Max(1, query.Page);
        var size = Math.Clamp(query.PageSize, 1, MaximumPageSize);
        var where = new StringBuilder("WHERE 1=1");
        var parameters = new List<SqlParameter>();
        void Add(string predicate, string name, SqlDbType type, object value, int size = 0)
        {
            where.Append(" AND ").Append(predicate);
            parameters.Add(size > 0 ? new SqlParameter(name, type, size) { Value = value } : new SqlParameter(name, type) { Value = value });
        }
        if (query.From is { } from) Add("L.OccurredAtUtc>=@from", "@from", SqlDbType.DateTime2, from.UtcDateTime);
        if (query.To is { } to) Add("L.OccurredAtUtc<@to", "@to", SqlDbType.DateTime2, to.UtcDateTime);
        if (Present(query.UserName) is { } user)
            Add("(L.UserName LIKE @user ESCAPE '\\' OR L.DisplayName LIKE @user ESCAPE '\\')", "@user", SqlDbType.NVarChar, Contains(user), 210);
        if (Present(query.Module) is { } module) Add("L.Module=@module", "@module", SqlDbType.VarChar, module, 100);
        if (Present(query.Category) is { } category) Add("L.Category=@category", "@category", SqlDbType.VarChar, category, 20);
        if (Present(query.Action) is { } action) Add("L.Action=@action", "@action", SqlDbType.VarChar, action, 100);
        if (Present(query.Outcome) is { } outcome) Add("L.Outcome=@outcome", "@outcome", SqlDbType.VarChar, outcome, 30);
        if (Present(query.DocumentId) is { } document) Add("L.DocumentId LIKE @document ESCAPE '\\'", "@document", SqlDbType.NVarChar, Contains(document), 210);
        if (Present(query.BranchId) is { } branch) Add("L.BranchId=@branch", "@branch", SqlDbType.NVarChar, branch, 50);
        if (Present(query.Search) is { } search)
            Add("(L.Path LIKE @search ESCAPE '\\' OR L.QueryText LIKE @search ESCAPE '\\' OR L.Target LIKE @search ESCAPE '\\' OR L.Page LIKE @search ESCAPE '\\'"
                + " OR L.ErrorCode LIKE @search ESCAPE '\\' OR L.CorrelationId LIKE @search ESCAPE '\\' OR L.ClientAddress LIKE @search ESCAPE '\\'"
                + " OR L.RequestData LIKE @search ESCAPE '\\' OR L.ResultData LIKE @search ESCAPE '\\')",
                "@search", SqlDbType.NVarChar, Contains(search), 410);
        await using var connection = connect();
        await connection.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            SELECT COUNT_BIG(*) FROM {Table} AS L {where};
            SELECT L.AuditId,L.OccurredAtUtc,L.Source,L.Category,L.Action,L.Outcome,L.UserName,L.DisplayName,L.RoleName,L.SessionRef,
                   L.BranchId,L.Module,L.DocumentId,L.HttpMethod,L.Path,L.StatusCode,L.DurationMs,L.CorrelationId,L.ClientAddress,
                   L.Page,L.Target,L.ErrorCode,
                   CASE WHEN L.RequestData IS NULL THEN 0 ELSE 1 END,CASE WHEN L.ResultData IS NULL THEN 0 ELSE 1 END
            FROM {Table} AS L {where}
            ORDER BY L.OccurredAtUtc DESC,L.AuditId DESC OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
            """, connection) { CommandTimeout = 30 };
        command.Parameters.AddRange(parameters.ToArray());
        command.Parameters.Add("@skip", SqlDbType.Int).Value = (page - 1) * size;
        command.Parameters.Add("@take", SqlDbType.Int).Value = size;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        await reader.ReadAsync(cancellationToken);
        var total = (int)Math.Min(int.MaxValue, reader.GetInt64(0));
        await reader.NextResultAsync(cancellationToken);
        var items = new List<WebAuditRow>();
        while (await reader.ReadAsync(cancellationToken))
            items.Add(new WebAuditRow(reader.GetInt64(0), Utc(reader.GetDateTime(1)), reader.GetString(2), reader.GetString(3),
                reader.GetString(4), reader.GetString(5), Str(reader, 6), Str(reader, 7), Str(reader, 8), Str(reader, 9), Str(reader, 10),
                Str(reader, 11), Str(reader, 12), Str(reader, 13), Str(reader, 14), reader.IsDBNull(15) ? null : reader.GetInt16(15),
                reader.IsDBNull(16) ? null : reader.GetInt32(16), Str(reader, 17), Str(reader, 18), Str(reader, 19), Str(reader, 20),
                Str(reader, 21), reader.GetInt32(22) == 1, reader.GetInt32(23) == 1));
        return new WebAuditPage(items, page, size, total);
    }

    public async Task<WebAuditDetail?> DetailAsync(long id, CancellationToken cancellationToken)
    {
        await using var connection = connect();
        await connection.OpenAsync(cancellationToken);
        await using var command = new SqlCommand($"""
            SELECT AuditId,OccurredAtUtc,Source,Category,Action,Outcome,UserName,DisplayName,RoleName,SessionRef,BranchId,Module,
                   DocumentId,HttpMethod,Path,QueryText,StatusCode,DurationMs,CorrelationId,ClientAddress,PeerAddress,UserAgent,
                   Page,Target,ClientEventId,ClientTimeUtc,RequestData,ResultData,ErrorCode
            FROM {Table} WHERE AuditId=@id;
            """, connection) { CommandTimeout = 15 };
        command.Parameters.Add("@id", SqlDbType.BigInt).Value = id;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new WebAuditDetail(reader.GetInt64(0), Utc(reader.GetDateTime(1)), reader.GetString(2), reader.GetString(3),
            reader.GetString(4), reader.GetString(5), Str(reader, 6), Str(reader, 7), Str(reader, 8), Str(reader, 9), Str(reader, 10),
            Str(reader, 11), Str(reader, 12), Str(reader, 13), Str(reader, 14), Str(reader, 15),
            reader.IsDBNull(16) ? null : reader.GetInt16(16), reader.IsDBNull(17) ? null : reader.GetInt32(17), Str(reader, 18),
            Str(reader, 19), Str(reader, 20), Str(reader, 21), Str(reader, 22), Str(reader, 23),
            reader.IsDBNull(24) ? null : reader.GetGuid(24), reader.IsDBNull(25) ? null : Utc(reader.GetDateTime(25)),
            Str(reader, 26), Str(reader, 27), Str(reader, 28));
    }

    private static object?[] Values(WebAuditEntry e) =>
    [
        e.OccurredAt.UtcDateTime, Cut(e.Source, 10), Cut(e.Category, 20), Cut(e.Action, 100), Cut(e.Outcome, 30), Cut(e.UserName, 100),
        Cut(e.DisplayName, 200), Cut(e.RoleName, 200), Cut(e.SessionRef, 32), Cut(e.BranchId, 50), Cut(e.Module, 100),
        Cut(e.DocumentId, 100), Cut(e.HttpMethod, 10), Cut(e.Path, 400), Cut(e.QueryText, 2000),
        e.StatusCode is { } status ? (short)Math.Clamp(status, short.MinValue, short.MaxValue) : null,
        e.DurationMs, Cut(e.CorrelationId, 64), Cut(e.ClientAddress, 64), Cut(e.PeerAddress, 64), Cut(e.UserAgent, 512),
        Cut(e.Page, 200), Cut(e.Target, 400), e.ClientEventId, e.ClientTime?.UtcDateTime, e.RequestData, e.ResultData,
        Cut(e.ErrorCode, 100)
    ];

    private static string? Cut(string? value, int size) => value is null ? null : value.Length <= size ? value : value[..size];
    private static string? Present(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string Contains(string value) => "%" + value.Replace("\\", "\\\\", StringComparison.Ordinal)
        .Replace("%", "\\%", StringComparison.Ordinal).Replace("_", "\\_", StringComparison.Ordinal)
        .Replace("[", "\\[", StringComparison.Ordinal) + "%";
    private static string? Str(SqlDataReader reader, int index) => reader.IsDBNull(index) ? null : reader.GetString(index);
    private static DateTimeOffset Utc(DateTime value) => new(DateTime.SpecifyKind(value, DateTimeKind.Utc));
    private static string SqlType(Type type, int size) => type == typeof(DateTime) ? "datetime2(3)" : type == typeof(short) ? "smallint"
        : type == typeof(int) ? "int" : type == typeof(Guid) ? "uniqueidentifier" : size < 0 ? "nvarchar(max)" : $"nvarchar({size})";
    private static string ReadResource(string name)
    {
        using var stream = typeof(SqlWebAuditStore).Assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException("Missing embedded audit schema.");
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
