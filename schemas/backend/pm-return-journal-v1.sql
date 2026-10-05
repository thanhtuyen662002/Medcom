-- I09 new Web journal DDL artifact. UNAPPLIED. No legacy definitions/rows are included.
-- Provision only in an independently authorized disposable/qualified database.
-- The operator must separately provision the single immutable schema/binding marker;
-- neither this artifact nor the store chooses a binding or inserts that marker.
CREATE TABLE dbo.MedcomPmReturnJournalSchema (
    SingletonId tinyint NOT NULL,
    SchemaVersion int NOT NULL,
    DatabaseBindingId uniqueidentifier NOT NULL,
    ArtifactSha256 varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CONSTRAINT PK_MedcomPmReturnJournalSchema PRIMARY KEY CLUSTERED (SingletonId),
    CONSTRAINT CK_MedcomPmReturnJournalSchema_Singleton CHECK (SingletonId = 1)
);
GO
CREATE TABLE dbo.MedcomPmReturnJournal (
    DatabaseBindingId uniqueidentifier NOT NULL,
    Slot varbinary(871) NOT NULL,
    TenantId nvarchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CompanyId nvarchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Actor varchar(50) COLLATE Latin1_General_100_BIN2 NOT NULL,
    ActionId varchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    IdempotencyKey varchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    DocumentKey varchar(30) COLLATE Latin1_General_100_BIN2 NOT NULL,
    SubmissionIdentity varchar(82) COLLATE Latin1_General_100_BIN2 NOT NULL,
    SourceProcedureSha256 varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    State int NOT NULL,
    AttemptId uniqueidentifier NOT NULL,
    OriginalExecutionFingerprint varchar(64) COLLATE Latin1_General_100_BIN2 NULL,
    AuditId varchar(100) COLLATE Latin1_General_100_BIN2 NULL,
    ReceiptJson nvarchar(4000) COLLATE Latin1_General_100_BIN2 NULL,
    CONSTRAINT PK_MedcomPmReturnJournal PRIMARY KEY CLUSTERED (DatabaseBindingId, Slot),
    CONSTRAINT CK_MedcomPmReturnJournal_State CHECK (State = 1 OR State = 2 OR State = 3 OR State = 4),
    CONSTRAINT CK_MedcomPmReturnJournal_Slot CHECK (DATALENGTH(Slot) > 0),
    CONSTRAINT CK_MedcomPmReturnJournal_Phase CHECK (
        (State = 1 AND OriginalExecutionFingerprint IS NOT NULL AND AuditId IS NOT NULL AND ReceiptJson IS NOT NULL)
        OR ((State = 2 OR State = 3 OR State = 4) AND OriginalExecutionFingerprint IS NULL AND AuditId IS NULL AND ReceiptJson IS NULL))
);
GO
