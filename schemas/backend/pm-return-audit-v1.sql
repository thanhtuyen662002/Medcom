-- Web-owned artifact, version 1. UNAPPLIED; never bootstrap from application startup.
-- Operator admission, configured database binding and exact artifact pin are separate gates.
CREATE TABLE dbo.MedcomPmReturnAuditSchema
(
    SingletonId tinyint NOT NULL,
    SchemaVersion int NOT NULL,
    DatabaseBindingId uniqueidentifier NOT NULL,
    ArtifactSha256 varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CONSTRAINT PK_MedcomPmReturnAuditSchema PRIMARY KEY CLUSTERED (SingletonId),
    CONSTRAINT CK_MedcomPmReturnAuditSchema_Singleton CHECK (SingletonId = 1)
);
GO
CREATE TABLE dbo.MedcomPmReturnAudit
(
    DatabaseBindingId uniqueidentifier NOT NULL,
    Slot varbinary(871) NOT NULL,
    AttemptId uniqueidentifier NOT NULL,
    AuditId uniqueidentifier NOT NULL,
    DocumentKey varchar(30) COLLATE Latin1_General_100_BIN2 NOT NULL,
    SubmissionIdentity varchar(82) COLLATE Latin1_General_100_BIN2 NOT NULL,
    SourceProcedureSha256 varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    OriginalExecutionFingerprint varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    BeforeStatus int NOT NULL,
    AfterStatus int NOT NULL,
    RecordedAtUtc datetime2(7) NOT NULL,
    -- 16 + 871 = 887 bytes; no attempt/audit GUID in this clustered key.
    CONSTRAINT PK_MedcomPmReturnAudit PRIMARY KEY CLUSTERED (DatabaseBindingId, Slot),
    CONSTRAINT UQ_MedcomPmReturnAudit_Attempt UNIQUE NONCLUSTERED (DatabaseBindingId, AttemptId),
    CONSTRAINT UQ_MedcomPmReturnAudit_Audit UNIQUE NONCLUSTERED (DatabaseBindingId, AuditId),
    CONSTRAINT CK_MedcomPmReturnAudit_Slot CHECK (DATALENGTH(Slot) > 0)
);
GO
