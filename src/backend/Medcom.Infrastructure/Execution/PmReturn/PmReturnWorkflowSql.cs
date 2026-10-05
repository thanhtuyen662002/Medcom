using System.Data;
using System.Data.Common;
using System.Text.Json;
using Medcom.Application.Transfers;

namespace Medcom.Infrastructure.Execution.PmReturn;

// Parameter plans for the new UNAPPLIED Web audit and the I09 committed transition.
// No connection opening, DDL, resource ownership, retry or provider diagnostics.
public static class PmReturnWorkflowSql
{
    public const string ArtifactSha256 = "06e27844cddf2080b37351cf312f9f9481d8e010334260feed8e992c3a908dc9";
    public static IReadOnlyList<string> ProbeColumns { get; } = Array.AsReadOnly(new[]
    { "MetadataCount", "SchemaVersion", "DatabaseBindingId", "ArtifactSha256", "ShapeOk", "IndexesOk",
      "ConstraintsOk", "Writable", "FullDurability", "TransactionOk", "SingletonCheck", "SlotCheck" });
    public static IReadOnlyList<string> AuditColumns { get; } = Array.AsReadOnly(new[]
    { "DatabaseBindingId", "Slot", "AttemptId", "AuditId", "DocumentKey", "SubmissionIdentity",
      "SourceProcedureSha256", "OriginalExecutionFingerprint", "BeforeStatus", "AfterStatus", "RecordedAtUtc" });

    public const string ProbeText = """
        SELECT (SELECT CONVERT(int,COUNT_BIG(*)) FROM dbo.MedcomPmReturnAuditSchema WITH (UPDLOCK,HOLDLOCK)) AS MetadataCount,
          M.SchemaVersion,M.DatabaseBindingId,M.ArtifactSha256,
          CONVERT(int,CASE WHEN
            (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.MedcomPmReturnAudit'))=11
            AND (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.MedcomPmReturnAuditSchema'))=4
            AND NOT EXISTS (
              SELECT 1 FROM (VALUES
                ('MedcomPmReturnAuditSchema','SingletonId','tinyint',1,0,NULL),
                ('MedcomPmReturnAuditSchema','SchemaVersion','int',4,0,NULL),
                ('MedcomPmReturnAuditSchema','DatabaseBindingId','uniqueidentifier',16,0,NULL),
                ('MedcomPmReturnAuditSchema','ArtifactSha256','varchar',64,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnAudit','DatabaseBindingId','uniqueidentifier',16,0,NULL),
                ('MedcomPmReturnAudit','Slot','varbinary',871,0,NULL),
                ('MedcomPmReturnAudit','AttemptId','uniqueidentifier',16,0,NULL),
                ('MedcomPmReturnAudit','AuditId','uniqueidentifier',16,0,NULL),
                ('MedcomPmReturnAudit','DocumentKey','varchar',30,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnAudit','SubmissionIdentity','varchar',82,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnAudit','SourceProcedureSha256','varchar',64,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnAudit','OriginalExecutionFingerprint','varchar',64,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnAudit','BeforeStatus','int',4,0,NULL),
                ('MedcomPmReturnAudit','AfterStatus','int',4,0,NULL),
                ('MedcomPmReturnAudit','RecordedAtUtc','datetime2',8,0,NULL)
              ) E(Tbl,Col,Typ,Len,Nullable,CollationName)
              LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.'+E.Tbl,'U') AND C.name=E.Col
              LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
              WHERE C.column_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0 OR C.max_length<>E.Len
                OR C.is_nullable<>E.Nullable OR C.is_identity<>0 OR C.is_computed<>0 OR C.default_object_id<>0
                OR (E.Typ='datetime2' AND C.scale<>7)
                OR ISNULL(C.collation_name,'') COLLATE Latin1_General_100_BIN2<>ISNULL(E.CollationName,''))
            THEN 1 ELSE 0 END) AS ShapeOk,
          CONVERT(int,CASE WHEN
            (SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.MedcomPmReturnAudit') AND index_id>0)=3
            AND (SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.MedcomPmReturnAuditSchema') AND index_id>0)=1
            AND NOT EXISTS (
              SELECT 1 FROM (VALUES
                ('MedcomPmReturnAuditSchema','PK_MedcomPmReturnAuditSchema',1,1,'SingletonId',NULL),
                ('MedcomPmReturnAudit','PK_MedcomPmReturnAudit',1,1,'DatabaseBindingId','Slot'),
                ('MedcomPmReturnAudit','UQ_MedcomPmReturnAudit_Attempt',2,0,'DatabaseBindingId','AttemptId'),
                ('MedcomPmReturnAudit','UQ_MedcomPmReturnAudit_Audit',2,0,'DatabaseBindingId','AuditId')
              ) E(Tbl,Nm,Typ,Pk,FirstCol,SecondCol)
              LEFT JOIN sys.indexes I ON I.object_id=OBJECT_ID('dbo.'+E.Tbl,'U') AND I.name=E.Nm
              WHERE I.index_id IS NULL OR I.type<>E.Typ OR I.is_unique<>1 OR I.is_primary_key<>E.Pk
                OR I.is_disabled<>0 OR I.is_hypothetical<>0 OR I.has_filter<>0
                OR (E.Pk=0 AND I.is_unique_constraint<>1)
                OR (SELECT COUNT(*) FROM sys.index_columns X WHERE X.object_id=I.object_id AND X.index_id=I.index_id
                     AND X.key_ordinal>0)<>CASE WHEN E.SecondCol IS NULL THEN 1 ELSE 2 END
                OR EXISTS(SELECT 1 FROM sys.index_columns X WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.is_included_column=1)
                OR NOT EXISTS(SELECT 1 FROM sys.index_columns X JOIN sys.columns C ON C.object_id=X.object_id AND C.column_id=X.column_id
                  WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal=1 AND X.is_descending_key=0 AND C.name=E.FirstCol)
                OR (E.SecondCol IS NOT NULL AND NOT EXISTS(SELECT 1 FROM sys.index_columns X JOIN sys.columns C ON C.object_id=X.object_id AND C.column_id=X.column_id
                  WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal=2 AND X.is_descending_key=0 AND C.name=E.SecondCol)))
            THEN 1 ELSE 0 END) AS IndexesOk,
          CONVERT(int,CASE WHEN
            (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id IN
              (OBJECT_ID('dbo.MedcomPmReturnAudit'),OBJECT_ID('dbo.MedcomPmReturnAuditSchema')))=2
            AND NOT EXISTS(SELECT 1 FROM (VALUES ('MedcomPmReturnAudit','CK_MedcomPmReturnAudit_Slot'),
              ('MedcomPmReturnAuditSchema','CK_MedcomPmReturnAuditSchema_Singleton')) E(Tbl,Nm)
              LEFT JOIN sys.check_constraints C ON C.parent_object_id=OBJECT_ID('dbo.'+E.Tbl) AND C.name=E.Nm
              WHERE C.object_id IS NULL OR C.is_disabled<>0 OR C.is_not_trusted<>0)
            AND NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id IN
              (OBJECT_ID('dbo.MedcomPmReturnAudit'),OBJECT_ID('dbo.MedcomPmReturnAuditSchema')))
            AND NOT EXISTS(SELECT 1 FROM sys.triggers WHERE parent_id IN
              (OBJECT_ID('dbo.MedcomPmReturnAudit'),OBJECT_ID('dbo.MedcomPmReturnAuditSchema')) AND is_disabled=0)
            THEN 1 ELSE 0 END) AS ConstraintsOk,
          CONVERT(int,CASE WHEN D.state=0 AND D.is_read_only=0 THEN 1 ELSE 0 END) AS Writable,
          CONVERT(int,CASE WHEN D.delayed_durability=0 THEN 1 ELSE 0 END) AS FullDurability,
          CONVERT(int,CASE WHEN @@TRANCOUNT=1 AND XACT_STATE()=1 THEN 1 ELSE 0 END) AS TransactionOk,
          (SELECT definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.MedcomPmReturnAuditSchema') AND name='CK_MedcomPmReturnAuditSchema_Singleton') AS SingletonCheck,
          (SELECT definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.MedcomPmReturnAudit') AND name='CK_MedcomPmReturnAudit_Slot') AS SlotCheck
        FROM dbo.MedcomPmReturnAuditSchema M WITH (UPDLOCK,HOLDLOCK)
        JOIN sys.databases D ON D.database_id=DB_ID() WHERE M.SingletonId=1;
        """;
    public const string AuditReadText = """
        SELECT TOP (2) DatabaseBindingId,Slot,AttemptId,AuditId,DocumentKey,SubmissionIdentity,
          SourceProcedureSha256,OriginalExecutionFingerprint,BeforeStatus,AfterStatus,RecordedAtUtc
        FROM dbo.MedcomPmReturnAudit WITH (UPDLOCK,HOLDLOCK,INDEX(PK_MedcomPmReturnAudit))
        WHERE DatabaseBindingId=@binding AND Slot=@slot;
        """;
    public const string AuditInsertText = """
        INSERT dbo.MedcomPmReturnAudit(DatabaseBindingId,Slot,AttemptId,AuditId,DocumentKey,SubmissionIdentity,
          SourceProcedureSha256,OriginalExecutionFingerprint,BeforeStatus,AfterStatus,RecordedAtUtc)
        VALUES(@binding,@slot,@attempt,@audit,@document,@submission,@source,@execution,10,30,SYSUTCDATETIME());
        """;
    public const string CommitJournalText = """
        UPDATE dbo.MedcomPmReturnJournal
        SET State=1,OriginalExecutionFingerprint=@execution,AuditId=@auditText,ReceiptJson=@receipt
        WHERE DatabaseBindingId=@binding AND Slot=@slot AND AttemptId=@attempt AND State=2
          AND TenantId=@tenant AND CompanyId=@company AND Actor=@actor AND ActionId=@action AND IdempotencyKey=@key
          AND DocumentKey=@document AND SubmissionIdentity=@submission AND SourceProcedureSha256=@source
          AND OriginalExecutionFingerprint IS NULL AND AuditId IS NULL AND ReceiptJson IS NULL;
        """;
    public const string TransactionText = "SELECT CONVERT(int,@@TRANCOUNT) AS TransactionCount, CONVERT(int,XACT_STATE()) AS TransactionState;";

    public static DbCommand Command(DbTransaction transaction, string text)
    {
        var connection = transaction.Connection;
        if (connection is null || connection.State != ConnectionState.Open || transaction.IsolationLevel != IsolationLevel.Serializable)
            throw new InvalidOperationException("Live workflow-owned SERIALIZABLE transaction required.");
        var command = connection.CreateCommand();
        command.Transaction = transaction; command.CommandType = CommandType.Text;
        command.CommandText = text; command.CommandTimeout = 15;
        return command;
    }
    private static void Add(DbCommand command, string name, DbType type, int size, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName=name; parameter.DbType=type; parameter.Size=size; parameter.Value=value;
        command.Parameters.Add(parameter);
    }
    public static DbCommand AuditRead(DbTransaction transaction, PmReturnSubmittedIntent intent)
    {
        var command=Command(transaction,AuditReadText); Key(command,intent); return command;
    }
    public static async Task<bool> AuditAbsentAsync(DbTransaction transaction,PmReturnSubmittedIntent intent,CancellationToken token)
    {
        await using var command=AuditRead(transaction,intent);
        await using var reader=await command.ExecuteReaderAsync(token);
        // Any SQL-equal audit candidate (including malformed padding) blocks a noncommitted key.
        return PmReturnJournalCodec.Shape(reader,AuditColumns) && !await reader.ReadAsync(token) && !await reader.NextResultAsync(token);
    }
    public static DbCommand LegacyLogCount(DbTransaction transaction,PreparedPmReturn prepared)
    {
        var command=Command(transaction,"""
            SELECT COUNT_BIG(*) FROM dbo.IV_InternalTransferRequestLogTbl WITH (UPDLOCK,HOLDLOCK)
            WHERE StatusID=30 AND DocumentID=@document AND UserName=@actor
              AND DATALENGTH(DocumentID)=DATALENGTH(@document) AND DATALENGTH(UserName)=DATALENGTH(@actor)
              AND CONVERT(varbinary(max),DocumentID)=CONVERT(varbinary(max),@document)
              AND CONVERT(varbinary(max),UserName)=CONVERT(varbinary(max),@actor)
              AND DATALENGTH(Notes)=DATALENGTH(@reason)
              AND CONVERT(varbinary(max),Notes)=CONVERT(varbinary(max),@reason);
            """);
        Add(command,"@document",DbType.AnsiString,30,prepared.Command.DocumentKey.Value);
        Add(command,"@actor",DbType.AnsiString,50,prepared.Command.Actor.Value);
        Add(command,"@reason",DbType.String,-1,((ReturnByPmPayload)prepared.Command.Payload).Reason);
        return command;
    }
    private static void Key(DbCommand command, PmReturnSubmittedIntent intent)
    {
        Add(command,"@binding",DbType.Guid,0,intent.Key.DatabaseBindingId);
        Add(command,"@slot",DbType.Binary,871,PmReturnJournalCodec.EncodeSlot(intent.Key));
    }
    private static void Correlation(DbCommand command, PmReturnSubmittedIntent intent, Guid attempt, string execution)
    {
        if (attempt==Guid.Empty || !PmReturnJournalCodec.Hex(execution)) throw new ArgumentException("Invalid receipt correlation.");
        Key(command,intent);
        Add(command,"@attempt",DbType.Guid,0,attempt);
        Add(command,"@document",DbType.AnsiString,30,intent.DocumentKey);
        Add(command,"@submission",DbType.AnsiString,82,intent.SubmissionIdentity);
        Add(command,"@source",DbType.AnsiString,64,intent.SourceProcedureSha256);
        Add(command,"@execution",DbType.AnsiString,64,execution);
    }
    public static DbCommand AuditInsert(DbTransaction transaction, PmReturnSubmittedIntent intent, Guid attempt, Guid audit, string execution)
    {
        if(audit==Guid.Empty) throw new ArgumentException("Audit identity required.");
        var command=Command(transaction,AuditInsertText); Correlation(command,intent,attempt,execution);
        Add(command,"@audit",DbType.Guid,0,audit); return command;
    }
    public static DbCommand CommitJournal(DbTransaction transaction, PmReturnSubmittedIntent intent, Guid attempt, Guid audit, string execution)
    {
        if(audit==Guid.Empty) throw new ArgumentException("Audit identity required.");
        var command=Command(transaction,CommitJournalText); Correlation(command,intent,attempt,execution);
        Add(command,"@tenant",DbType.String,100,intent.Key.TenantId); Add(command,"@company",DbType.String,100,intent.Key.CompanyId);
        Add(command,"@actor",DbType.AnsiString,50,intent.Key.Actor); Add(command,"@action",DbType.AnsiString,100,intent.Key.ActionId);
        Add(command,"@key",DbType.AnsiString,100,intent.Key.IdempotencyKey);
        Add(command,"@auditText",DbType.AnsiString,100,audit.ToString("D"));
        var receipt=JsonSerializer.Serialize(new {version=1,bindingId=intent.Key.DatabaseBindingId.ToString("D"),
          tenantId=intent.Key.TenantId,companyId=intent.Key.CompanyId,actor=intent.Key.Actor,actionId=intent.Key.ActionId,
          idempotencyKey=intent.Key.IdempotencyKey,documentKey=intent.DocumentKey,submissionIdentity=intent.SubmissionIdentity,
          sourceProcedureSha256=intent.SourceProcedureSha256,originalExecutionFingerprint=execution,
          auditId=audit.ToString("D"),outcome="Committed",observedPostStatus=30,rejectionCode=(string?)null});
        if(receipt.Length>4000) throw new ArgumentException("Receipt width exceeded.");
        Add(command,"@receipt",DbType.String,4000,receipt); return command;
    }
    public static async Task<bool> ProbeAsync(DbTransaction transaction, Guid binding, CancellationToken token)
    {
        await using var command=Command(transaction,ProbeText);
        await using var reader=await command.ExecuteReaderAsync(token);
        return PmReturnJournalCodec.Shape(reader,ProbeColumns) && await reader.ReadAsync(token)
          && reader.GetInt32(0)==1 && reader.GetInt32(1)==1 && reader.GetGuid(2)==binding && reader.GetString(3)==ArtifactSha256
          && Enumerable.Range(4,6).All(i=>!reader.IsDBNull(i) && reader.GetInt32(i)==1)
          && PmReturnJournalCodec.ConstraintMatches("Singleton",reader.GetString(10))
          && PmReturnJournalCodec.ConstraintMatches("Slot",reader.GetString(11))
          && !await reader.ReadAsync(token) && !await reader.NextResultAsync(token);
    }
    public static async Task<bool> TransactionAsync(DbTransaction transaction, CancellationToken token)
    {
        await using var command=Command(transaction,TransactionText);
        await using var reader=await command.ExecuteReaderAsync(token);
        return PmReturnJournalCodec.Shape(reader,new[]{"TransactionCount","TransactionState"}) && await reader.ReadAsync(token)
          && reader.GetInt32(0)==1 && reader.GetInt32(1)==1 && !await reader.ReadAsync(token) && !await reader.NextResultAsync(token);
    }
    public static async Task<bool> AuditMatchesAsync(DbTransaction transaction, PmReturnSubmittedIntent intent,
        PmReturnStoredObservation row, CancellationToken token)
    {
        if(!row.Matches(intent) || row.Observation.State!=PmReturnJournalState.Committed || row.Observation.Record is not {} receipt
           || !Guid.TryParseExact(receipt.AuditId,"D",out var audit) || audit==Guid.Empty || receipt.AuditId!=audit.ToString("D")) return false;
        await using var command=AuditRead(transaction,intent);
        await using var reader=await command.ExecuteReaderAsync(token);
        return PmReturnJournalCodec.Shape(reader,AuditColumns) && await reader.ReadAsync(token)
          && Enumerable.Range(0,11).All(i=>!reader.IsDBNull(i)) && reader.GetGuid(0)==intent.Key.DatabaseBindingId
          && ((byte[])reader.GetValue(1)).AsSpan().SequenceEqual(PmReturnJournalCodec.EncodeSlot(intent.Key))
          && reader.GetGuid(2)==row.AttemptId && row.AttemptId!=Guid.Empty && reader.GetGuid(3)==audit
          && reader.GetString(4)==intent.DocumentKey && reader.GetString(5)==intent.SubmissionIdentity
          && reader.GetString(6)==intent.SourceProcedureSha256 && reader.GetString(7)==receipt.OriginalExecutionFingerprint
          && reader.GetInt32(8)==10 && reader.GetInt32(9)==30 && reader.GetDateTime(10)>DateTime.MinValue
          && !await reader.ReadAsync(token) && !await reader.NextResultAsync(token);
    }
}
