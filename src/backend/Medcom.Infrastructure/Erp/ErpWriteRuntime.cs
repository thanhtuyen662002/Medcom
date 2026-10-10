using System.Data;
using System.Data.Common;
using System.Security.Cryptography;
using System.Text;
using Medcom.Application;
using Medcom.Contracts;

namespace Medcom.Infrastructure.Erp;

// Technical target verification, not a claim of production/business acceptance.
// An operator prepares the journal and captures the exact schema fingerprint once.
// Startup never installs, refreshes or silently accepts a changed target.
public sealed class ErpWriteRuntime : IErpSqlWriteAcceptance
{
    private readonly Guid binding;
    private readonly string database;
    private readonly byte[] fingerprint;
    private readonly HashSet<string> modules;
    public ErpWriteRuntime(Guid binding, string database, string schemaFingerprint, IEnumerable<string> modules)
    {
        if (binding == Guid.Empty || string.IsNullOrWhiteSpace(database) || database.Equals("master", StringComparison.OrdinalIgnoreCase)
            || schemaFingerprint.Length != 64 || !schemaFingerprint.All(char.IsAsciiHexDigit))
            throw new ArgumentException("Complete ERP write target configuration required.");
        this.modules = new(modules, StringComparer.Ordinal);
        if (this.modules.Count == 0 || this.modules.Any(module => ErpScreenCatalog.Get(module) is null))
            throw new ArgumentException("Fixed ERP screen modules required.");
        this.binding = binding; this.database = database; fingerprint = Convert.FromHexString(schemaFingerprint);
    }
    public bool Includes(string module) => modules.Contains(module);
    public async Task<bool> VerifyAsync(DbTransaction transaction, Guid binding, string module, CancellationToken token)
    {
        if (this.binding != binding || !Includes(module)) return false;
        await using (var command = ErpSqlPlan.Command(transaction, "SELECT DB_NAME();"))
            if (await command.ExecuteScalarAsync(token) as string != database) return false;
        var observed = await SchemaFingerprintAsync(transaction, token);
        if (!CryptographicOperations.FixedTimeEquals(fingerprint, observed)) return false;
        await SqlErpScreenCommands.VerifyNativeMetadata(transaction, token);
        await SqlErpScreenCommands.VerifyScreenConfiguration(transaction, ErpSqlPlan.Get(module)!, token);
        return true;
    }
    public static string CatalogHash => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(ErpScreenCatalog.SourceMetadata.GetRawText())));

    // Only the digest leaves SQL Server. No definition, user, settings value or business row
    // is read into a public artifact. Include complete database module/constraint signatures,
    // column shapes and index/foreign-key/trigger enablement, rather than table presence alone.
    internal const string FingerprintSql = """
        DECLARE @shape nvarchar(max) = (
          SELECT S.name AS [schema],O.name,O.type,O.principal_id,M.uses_ansi_nulls,M.uses_quoted_identifier,
            M.is_schema_bound,M.execute_as_principal_id,
            CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),M.definition)),2) AS moduleHash,
            JSON_QUERY((SELECT C.name,C.column_id,T.name AS sqlType,TS.name AS typeSchema,C.max_length,C.precision,C.scale,
              C.is_nullable,C.is_identity,C.is_computed,C.collation_name,
              CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),D.definition)),2) AS defaultHash,
              CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),CC.definition)),2) AS computedHash
              FROM sys.columns C JOIN sys.types T ON T.user_type_id=C.user_type_id JOIN sys.schemas TS ON TS.schema_id=T.schema_id
              LEFT JOIN sys.default_constraints D ON D.object_id=C.default_object_id
              LEFT JOIN sys.computed_columns CC ON CC.object_id=C.object_id AND CC.column_id=C.column_id
              WHERE C.object_id=O.object_id ORDER BY C.column_id FOR JSON PATH,INCLUDE_NULL_VALUES)) AS columns,
            JSON_QUERY((SELECT I.name,I.type,I.is_unique,I.is_primary_key,I.is_unique_constraint,I.is_disabled,I.has_filter,
              CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),I.filter_definition)),2) AS filterHash,
              JSON_QUERY((SELECT C.name,IC.key_ordinal,IC.is_descending_key,IC.is_included_column
                FROM sys.index_columns IC JOIN sys.columns C ON C.object_id=IC.object_id AND C.column_id=IC.column_id
                WHERE IC.object_id=I.object_id AND IC.index_id=I.index_id ORDER BY IC.index_column_id FOR JSON PATH)) AS columns
              FROM sys.indexes I WHERE I.object_id=O.object_id AND I.index_id>0 ORDER BY I.name FOR JSON PATH,INCLUDE_NULL_VALUES)) AS indexes,
            JSON_QUERY((SELECT F.name,F.is_disabled,F.is_not_trusted,F.delete_referential_action,F.update_referential_action,
              JSON_QUERY((SELECT PC.name AS sourceColumn,RS.name AS targetSchema,RO.name AS targetTable,RC.name AS targetColumn
                FROM sys.foreign_key_columns FC JOIN sys.columns PC ON PC.object_id=FC.parent_object_id AND PC.column_id=FC.parent_column_id
                JOIN sys.objects RO ON RO.object_id=FC.referenced_object_id JOIN sys.schemas RS ON RS.schema_id=RO.schema_id
                JOIN sys.columns RC ON RC.object_id=FC.referenced_object_id AND RC.column_id=FC.referenced_column_id
                WHERE FC.constraint_object_id=F.object_id ORDER BY FC.constraint_column_id FOR JSON PATH)) AS columns
              FROM sys.foreign_keys F WHERE F.parent_object_id=O.object_id ORDER BY F.name FOR JSON PATH)) AS foreignKeys,
            JSON_QUERY((SELECT C.name,C.is_disabled,C.is_not_trusted,
              CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),C.definition)),2) AS definitionHash
              FROM sys.check_constraints C WHERE C.parent_object_id=O.object_id ORDER BY C.name FOR JSON PATH)) AS checks,
            JSON_QUERY((SELECT T.name,T.is_disabled,T.is_instead_of_trigger,T.is_not_for_replication
              FROM sys.triggers T WHERE T.parent_id=O.object_id ORDER BY T.name FOR JSON PATH)) AS triggers
          FROM sys.objects O JOIN sys.schemas S ON S.schema_id=O.schema_id
          LEFT JOIN sys.sql_modules M ON M.object_id=O.object_id
          WHERE O.is_ms_shipped=0 AND O.type IN('U','V','P','FN','IF','TF','TR','SO')
          ORDER BY S.name,O.name,O.type FOR JSON PATH,INCLUDE_NULL_VALUES);
        DECLARE @databaseShape nvarchar(max)=(SELECT compatibility_level,collation_name,is_read_committed_snapshot_on,snapshot_isolation_state
          FROM sys.databases WHERE database_id=DB_ID() FOR JSON PATH,INCLUDE_NULL_VALUES);
        SELECT HASHBYTES('SHA2_256',CONVERT(varbinary(max),@databaseShape+@shape));
        """;
    public static async Task<byte[]> SchemaFingerprintAsync(DbTransaction transaction, CancellationToken token)
    {
        await using var command = ErpSqlPlan.Command(transaction, FingerprintSql);
        return await command.ExecuteScalarAsync(token) as byte[] is { Length: 32 } hash ? hash
            : throw new InvalidOperationException("ERP target fingerprint unavailable.");
    }
}
