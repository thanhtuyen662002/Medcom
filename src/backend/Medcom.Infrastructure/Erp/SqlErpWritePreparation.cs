using System.Data;
using System.Data.Common;
using Medcom.Contracts;

namespace Medcom.Infrastructure.Erp;

public sealed record ErpWritePreparation(string? SchemaFingerprint, string CatalogHash, bool Installed, IReadOnlyList<string> Modules);

public static class SqlErpWritePreparation
{
    public static Task<ErpWritePreparation> PrepareAsync(SqlLegacyUserStore store, Guid binding, string database,
        IReadOnlyList<string> modules, bool install, CancellationToken token)
        => PrepareCoreAsync(() => store.CreateErpCommandConnection(), binding, database, modules, install, token);

    internal static async Task<ErpWritePreparation> PrepareCoreAsync(Func<DbConnection> connections, Guid binding, string database,
        IReadOnlyList<string> modules, bool install, CancellationToken token)
    {
        if (binding == Guid.Empty || modules.Count == 0 || modules.Any(module => ErpScreenCatalog.Get(module) is null))
            throw new ArgumentException("Explicit fixed ERP target required.");
        await using var connection = connections();
        await connection.OpenAsync(token);
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, token);
        await using (var command = ErpSqlPlan.Command(transaction, "SELECT DB_NAME();"))
        {
            await using var rows = await command.ExecuteReaderAsync(token);
            if (!await rows.ReadAsync(token) || rows.GetString(0) != database || await rows.ReadAsync(token)||await rows.NextResultAsync(token))
                throw new InvalidOperationException("Exact target required.");
        }
        foreach (var module in modules)
        {
            var plan = ErpSqlPlan.Get(module)!;
            if (!await SqlErpScreenReader.SchemaMatches(transaction, plan, token)) throw new InvalidOperationException("Native field contract changed.");
        }
        if (install)
        {
            await using var command = ErpSqlPlan.Command(transaction, InstallSql);
            ErpSqlPlan.Parameter(command, "@binding", DbType.Guid, binding);
            ErpSqlPlan.Parameter(command, "@catalog", DbType.Binary, Convert.FromHexString(ErpWriteRuntime.CatalogHash), 32);
            await command.ExecuteNonQueryAsync(token);
        }
        else
        {
            if (!await ErpWriteRuntime.JournalMatchesAsync(transaction,binding,token))
                throw new InvalidOperationException("Installed ERP journal binding required.");
        }
        // Retain the legacy JSON member as null; no fingerprint refresh is required.
        var result = new ErpWritePreparation(null, ErpWriteRuntime.CatalogHash, install, modules.ToArray());
        if (install) await transaction.CommitAsync(token);
        else await transaction.RollbackAsync(token);
        return result;
    }
    // New Web control objects only. No native tables/procedures/configuration or business
    // rows are changed. Never overwrite an existing journal or refresh its binding.
    internal const string InstallSql = """
        SET XACT_ABORT ON;
        IF OBJECT_ID('dbo.MedcomErpCommandSchema') IS NOT NULL OR OBJECT_ID('dbo.MedcomErpCommandJournal') IS NOT NULL
          THROW 51001,'Existing ERP journal requires read-only preparation.',1;
        CREATE TABLE dbo.MedcomErpCommandSchema(
          SingletonId tinyint NOT NULL PRIMARY KEY CHECK(SingletonId=1),SchemaVersion int NOT NULL CHECK(SchemaVersion=1),
          DatabaseBindingId uniqueidentifier NOT NULL,CatalogHash binary(32) NOT NULL);
        CREATE TABLE dbo.MedcomErpCommandJournal(
          DatabaseBindingId uniqueidentifier NOT NULL,SlotHash binary(32) NOT NULL,
          KeyBytes varbinary(4096) NOT NULL,IntentBytes varbinary(max) NOT NULL,
          DocumentId nvarchar(50) NULL,ReceiptJson nvarchar(max) NULL,
          BeforeToken varchar(64) NOT NULL,AfterToken varchar(64) NULL,AuditId uniqueidentifier NOT NULL,
          CommittedAtUtc datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME(),PRIMARY KEY(DatabaseBindingId,SlotHash),
          CHECK(DATALENGTH(KeyBytes)>0 AND DATALENGTH(IntentBytes) BETWEEN 1 AND 1048576),
          CHECK((DocumentId IS NULL AND ReceiptJson IS NULL AND AfterToken IS NULL)
            OR(DocumentId IS NOT NULL AND ReceiptJson IS NOT NULL AND AfterToken IS NOT NULL)));
        INSERT dbo.MedcomErpCommandSchema VALUES(1,1,@binding,@catalog);
        """;
}
