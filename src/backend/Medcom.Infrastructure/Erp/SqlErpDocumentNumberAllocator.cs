using System.Data;
using System.Data.Common;
using System.Globalization;
using System.Text.Json;
using Medcom.Application;

namespace Medcom.Infrastructure.Erp;

public sealed class ErpDocumentNumberExhaustedException : Exception;

// Current Tools.Data.DefaultValueSQL: prefix + month + year + four digit counter.
// Locks the native header table until the caller commits or rolls back, including
// empty tables; a process-local lock/counter would not coordinate multiple servers.
public sealed class SqlErpDocumentNumberAllocator : IErpDocumentNumberAllocator
{
    internal const string CurrentMask = "{P}{MM}{YY}/{4}";
    public bool IsQualified(string module) => module is "purchase-requests" or "sales-orders" or "internal-transfer-requests"
        or "machine-movements" or "machine-repairs";
    internal static string Prefix(string module) => module switch
    {
        "purchase-requests" => "PO", "sales-orders" => "DMB", "internal-transfer-requests" => "DCNB",
        "machine-movements" => "MLI", "machine-repairs" => "MLRP", _ => throw new ArgumentException("Unsupported numbered screen.")
    };
    public async Task<string?> AllocateAsync(DbTransaction transaction, string module, JsonElement header, CancellationToken token)
    {
        if (!IsQualified(module)) return null;
        var plan = ErpSqlPlan.Get(module)!;
        var dateName = module == "purchase-requests" ? "purchaseDate" : "documentDate";
        if (!header.TryGetProperty(dateName, out var raw) || raw.ValueKind != JsonValueKind.String
            || !DateTime.TryParseExact(raw.GetString(), "yyyy-MM-dd'T'HH:mm:ss.fff", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var date)) return null;
        await SqlErpScreenCommands.VerifyScreenConfiguration(transaction, plan, token);
        await using (var mask = ErpSqlPlan.Command(transaction, "SELECT CodeValue FROM dbo.SY_Setup WITH(HOLDLOCK) WHERE CodeID='DocumentMask';"))
        {
            await using var rows = await mask.ExecuteReaderAsync(token);
            // Tools.Utils.Functions initializes the same default when no setup row exists.
            if (await rows.ReadAsync(token) && (rows.IsDBNull(0) || rows.GetString(0) != CurrentMask || await rows.ReadAsync(token))) return null;
            if (await rows.NextResultAsync(token)) return null;
        }
        var stem = Prefix(module) + date.ToString("MMyy", CultureInfo.InvariantCulture) + "/";
        await using var command = ErpSqlPlan.Command(transaction, $"""
            SELECT MAX(TRY_CONVERT(int,SUBSTRING(DocumentId,@start,4))) FROM (
              SELECT [{plan.HeaderKey}] AS DocumentId FROM dbo.[{plan.HeaderTable}] WITH(TABLOCKX,HOLDLOCK)
              UNION ALL
              SELECT DocumentId FROM dbo.MedcomErpCommandJournal WITH(HOLDLOCK)
                WHERE JSON_VALUE(ReceiptJson,'$.module')=@module
            ) N WHERE LEFT(DocumentId,@stemLength)=@stem AND LEN(DocumentId)=@length
              AND SUBSTRING(DocumentId,@start,4) NOT LIKE '%[^0-9]%' COLLATE Latin1_General_100_BIN2;
            """);
        ErpSqlPlan.Parameter(command, "@stem", DbType.AnsiString, stem, 50);
        ErpSqlPlan.Parameter(command, "@module", DbType.String, module, 50);
        ErpSqlPlan.Parameter(command, "@stemLength", DbType.Int32, stem.Length);
        ErpSqlPlan.Parameter(command, "@start", DbType.Int32, stem.Length + 1);
        ErpSqlPlan.Parameter(command, "@length", DbType.Int32, stem.Length + 4);
        var value = await command.ExecuteScalarAsync(token);
        var highest = value is int current ? current : value is null or DBNull ? 0
            : throw new InvalidOperationException("Invalid native document counter.");
        // Never wrap 9999 to 0000. A full month is an actionable configuration error.
        if (highest >= 9999) throw new ErpDocumentNumberExhaustedException();
        return stem + (highest + 1).ToString("D4", CultureInfo.InvariantCulture);
    }
}
