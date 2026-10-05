using System.Data;
using System.Data.Common;
using Medcom.Application.Transfers;

namespace Medcom.Infrastructure.Execution.PmReturn;

public static class PmReturnJournalSql
{
    // Exact UTF-8/LF bytes of the new UNAPPLIED artifact, not an ERP/source hash.
    public const string ArtifactSha256 = "c7a777578470d1bc4b150503eb4fad7e7497386643c1cf2225e10e916e00f2ce";
    public static IReadOnlyList<string> ProbeColumns { get; } = Array.AsReadOnly(new[]
    { "MetadataCount", "SchemaVersion", "DatabaseBindingId", "ArtifactSha256", "ShapeOk", "IndexesOk",
        "ConstraintsOk", "Writable", "FullDurability", "TransactionOk", "SingletonCheck", "StateCheck", "SlotCheck", "PhaseCheck" });

    public const string ProbeText = """
        SELECT (SELECT CONVERT(int,COUNT_BIG(*)) FROM dbo.MedcomPmReturnJournalSchema WITH (UPDLOCK,HOLDLOCK)) AS MetadataCount,
          M.SchemaVersion,M.DatabaseBindingId,M.ArtifactSha256,
          CONVERT(int,CASE WHEN
            (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.MedcomPmReturnJournal'))=15
            AND (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.MedcomPmReturnJournalSchema'))=4
            AND NOT EXISTS (
              SELECT 1 FROM (VALUES
                ('MedcomPmReturnJournalSchema','SingletonId','tinyint',1,0,NULL),
                ('MedcomPmReturnJournalSchema','SchemaVersion','int',4,0,NULL),
                ('MedcomPmReturnJournalSchema','DatabaseBindingId','uniqueidentifier',16,0,NULL),
                ('MedcomPmReturnJournalSchema','ArtifactSha256','varchar',64,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','DatabaseBindingId','uniqueidentifier',16,0,NULL),
                ('MedcomPmReturnJournal','Slot','varbinary',871,0,NULL),
                ('MedcomPmReturnJournal','TenantId','nvarchar',200,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','CompanyId','nvarchar',200,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','Actor','varchar',50,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','ActionId','varchar',100,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','IdempotencyKey','varchar',100,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','DocumentKey','varchar',30,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','SubmissionIdentity','varchar',82,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','SourceProcedureSha256','varchar',64,0,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','State','int',4,0,NULL),
                ('MedcomPmReturnJournal','AttemptId','uniqueidentifier',16,0,NULL),
                ('MedcomPmReturnJournal','OriginalExecutionFingerprint','varchar',64,1,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','AuditId','varchar',100,1,'Latin1_General_100_BIN2'),
                ('MedcomPmReturnJournal','ReceiptJson','nvarchar',8000,1,'Latin1_General_100_BIN2')
              ) E(Tbl,Col,Typ,Len,Nullable,CollationName)
              LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.'+E.Tbl,'U') AND C.name=E.Col
              LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
              WHERE C.column_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0 OR C.max_length<>E.Len
                OR C.is_nullable<>E.Nullable OR C.is_identity<>0 OR C.is_computed<>0
                OR ISNULL(C.collation_name,'') COLLATE Latin1_General_100_BIN2<>ISNULL(E.CollationName,''))
            THEN 1 ELSE 0 END) AS ShapeOk,
          CONVERT(int,CASE WHEN
            (SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.MedcomPmReturnJournal') AND index_id>0)=1
            AND (SELECT COUNT(*) FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.MedcomPmReturnJournalSchema') AND index_id>0)=1
            AND EXISTS(SELECT 1 FROM sys.indexes I WHERE I.object_id=OBJECT_ID('dbo.MedcomPmReturnJournal')
              AND I.name='PK_MedcomPmReturnJournal' AND I.index_id=1 AND I.is_unique=1 AND I.is_primary_key=1
              AND I.is_disabled=0 AND I.is_hypothetical=0 AND I.has_filter=0
              AND (SELECT COUNT(*) FROM sys.index_columns X WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal>0)=2
              AND EXISTS(SELECT 1 FROM sys.index_columns X JOIN sys.columns C ON C.object_id=X.object_id AND C.column_id=X.column_id
                WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal=1 AND X.is_descending_key=0 AND C.name='DatabaseBindingId')
              AND EXISTS(SELECT 1 FROM sys.index_columns X JOIN sys.columns C ON C.object_id=X.object_id AND C.column_id=X.column_id
                WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal=2 AND X.is_descending_key=0 AND C.name='Slot'))
            AND EXISTS(SELECT 1 FROM sys.indexes I JOIN sys.index_columns X ON X.object_id=I.object_id AND X.index_id=I.index_id
              JOIN sys.columns C ON C.object_id=X.object_id AND C.column_id=X.column_id
              WHERE I.object_id=OBJECT_ID('dbo.MedcomPmReturnJournalSchema') AND I.name='PK_MedcomPmReturnJournalSchema'
                AND I.index_id=1 AND I.is_unique=1 AND I.is_primary_key=1 AND I.is_disabled=0 AND I.has_filter=0
                AND X.key_ordinal=1 AND C.name='SingletonId'
                AND (SELECT COUNT(*) FROM sys.index_columns Y WHERE Y.object_id=I.object_id AND Y.index_id=I.index_id AND Y.key_ordinal>0)=1)
            THEN 1 ELSE 0 END) AS IndexesOk,
          CONVERT(int,CASE WHEN
            (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.MedcomPmReturnJournal'))=3
            AND (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.MedcomPmReturnJournalSchema'))=1
            AND NOT EXISTS(SELECT 1 FROM (VALUES ('MedcomPmReturnJournal','CK_MedcomPmReturnJournal_State'),
              ('MedcomPmReturnJournal','CK_MedcomPmReturnJournal_Slot'),('MedcomPmReturnJournal','CK_MedcomPmReturnJournal_Phase'),
              ('MedcomPmReturnJournalSchema','CK_MedcomPmReturnJournalSchema_Singleton')) E(Tbl,Nm)
              LEFT JOIN sys.check_constraints C ON C.parent_object_id=OBJECT_ID('dbo.'+E.Tbl) AND C.name=E.Nm
              WHERE C.object_id IS NULL OR C.is_disabled<>0 OR C.is_not_trusted<>0)
            AND NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id IN
              (OBJECT_ID('dbo.MedcomPmReturnJournal'),OBJECT_ID('dbo.MedcomPmReturnJournalSchema')))
            AND NOT EXISTS(SELECT 1 FROM sys.triggers WHERE parent_id IN
              (OBJECT_ID('dbo.MedcomPmReturnJournal'),OBJECT_ID('dbo.MedcomPmReturnJournalSchema')) AND is_disabled=0)
            THEN 1 ELSE 0 END) AS ConstraintsOk,
          CONVERT(int,CASE WHEN D.state=0 AND D.is_read_only=0 THEN 1 ELSE 0 END) AS Writable,
          CONVERT(int,CASE WHEN D.delayed_durability=0 THEN 1 ELSE 0 END) AS FullDurability,
          CONVERT(int,CASE WHEN @@TRANCOUNT=1 AND XACT_STATE()=1 THEN 1 ELSE 0 END) AS TransactionOk,
          (SELECT definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.MedcomPmReturnJournalSchema') AND name='CK_MedcomPmReturnJournalSchema_Singleton') AS SingletonCheck,
          (SELECT definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.MedcomPmReturnJournal') AND name='CK_MedcomPmReturnJournal_State') AS StateCheck,
          (SELECT definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.MedcomPmReturnJournal') AND name='CK_MedcomPmReturnJournal_Slot') AS SlotCheck,
          (SELECT definition FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID('dbo.MedcomPmReturnJournal') AND name='CK_MedcomPmReturnJournal_Phase') AS PhaseCheck
        FROM dbo.MedcomPmReturnJournalSchema M WITH (UPDLOCK,HOLDLOCK)
        JOIN sys.databases D ON D.database_id=DB_ID() WHERE M.SingletonId=1;
        """;

    public const string LookupText = """
        SELECT TOP (2) DatabaseBindingId,Slot,TenantId,CompanyId,Actor,ActionId,IdempotencyKey,
          DocumentKey,SubmissionIdentity,SourceProcedureSha256,State,AttemptId,OriginalExecutionFingerprint,AuditId,ReceiptJson
        FROM dbo.MedcomPmReturnJournal WITH (UPDLOCK,HOLDLOCK,INDEX(PK_MedcomPmReturnJournal))
        WHERE DatabaseBindingId=@binding AND Slot=@slot;
        """;

    public const string InsertText = """
        INSERT dbo.MedcomPmReturnJournal(DatabaseBindingId,Slot,TenantId,CompanyId,Actor,ActionId,IdempotencyKey,
          DocumentKey,SubmissionIdentity,SourceProcedureSha256,State,AttemptId)
        VALUES(@binding,@slot,@tenant,@company,@actor,@action,@key,@document,@submission,@source,2,@attempt);
        """;

    public static DbCommand Probe(DbConnection connection, DbTransaction transaction) => Command(connection, transaction, ProbeText);

    public static DbCommand Lookup(DbConnection connection, DbTransaction transaction, PmReturnSubmittedIntent intent)
    {
        var command = Command(connection, transaction, LookupText);
        BindKey(command, intent);
        return command;
    }

    public static DbCommand Insert(DbConnection connection, DbTransaction transaction, PmReturnSubmittedIntent intent, Guid attempt)
    {
        if (attempt == Guid.Empty) throw new ArgumentException("A server attempt is required.", nameof(attempt));
        var command = Command(connection, transaction, InsertText);
        BindKey(command, intent);
        Add(command, "@tenant", DbType.String, 100, intent.Key.TenantId);
        Add(command, "@company", DbType.String, 100, intent.Key.CompanyId);
        Add(command, "@actor", DbType.AnsiString, 50, intent.Key.Actor);
        Add(command, "@action", DbType.AnsiString, 100, intent.Key.ActionId);
        Add(command, "@key", DbType.AnsiString, 100, intent.Key.IdempotencyKey);
        Add(command, "@document", DbType.AnsiString, 30, intent.DocumentKey);
        Add(command, "@submission", DbType.AnsiString, 82, intent.SubmissionIdentity);
        Add(command, "@source", DbType.AnsiString, 64, intent.SourceProcedureSha256);
        Add(command, "@attempt", DbType.Guid, 0, attempt);
        return command;
    }

    private static void BindKey(DbCommand command, PmReturnSubmittedIntent intent)
    {
        ArgumentNullException.ThrowIfNull(intent);
        var bytes = PmReturnJournalCodec.EncodeSlot(intent.Key);
        Add(command, "@binding", DbType.Guid, 0, intent.Key.DatabaseBindingId);
        Add(command, "@slot", DbType.Binary, PmReturnJournalCodec.MaximumSlotBytes, bytes);
    }

    private static void Add(DbCommand command, string name, DbType type, int size, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name; parameter.DbType = type; parameter.Size = size; parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    private static DbCommand Command(DbConnection connection, DbTransaction transaction, string text)
    {
        ArgumentNullException.ThrowIfNull(connection);
        ArgumentNullException.ThrowIfNull(transaction);
        if (connection.State != ConnectionState.Open || !ReferenceEquals(transaction.Connection, connection)
            || transaction.IsolationLevel != IsolationLevel.Serializable)
            throw new InvalidOperationException("A live bound SERIALIZABLE transaction is required.");
        var command = connection.CreateCommand();
        command.Transaction = transaction; command.CommandText = text; command.CommandType = CommandType.Text;
        command.CommandTimeout = 15;
        return command;
    }
}
