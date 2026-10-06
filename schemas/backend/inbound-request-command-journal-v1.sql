-- UNAPPLIED. No ERP table changes, triggers, fixture data, credentials or automatic startup DDL.
-- Operator qualification/approval is required before application to an isolated target.
-- State 0 reserves one operation without takeover; state 1 is the immutable committed
-- feature audit/receipt, updated in the SAME transaction as header/detail/source-log effects.
CREATE TABLE dbo.WebInboundRequestCommandJournalV1
(
    DatabaseBindingId uniqueidentifier NOT NULL,
    TenantId nvarchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CompanyId nvarchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Actor varchar(50) COLLATE Latin1_General_100_BIN2 NOT NULL,
    OperationId uniqueidentifier NOT NULL,
    IntentHash binary(32) NOT NULL,
    Action varchar(32) COLLATE Latin1_General_100_BIN2 NOT NULL,
    AttemptId uniqueidentifier NOT NULL,
    State tinyint NOT NULL,
    BranchId varchar(50) COLLATE Latin1_General_100_BIN2 NOT NULL,
    DocumentId varchar(50) COLLATE Latin1_General_100_BIN2 NULL,
    BeforeState char(64) COLLATE Latin1_General_100_BIN2 NULL,
    AfterState char(64) COLLATE Latin1_General_100_BIN2 NULL,
    StatusAfter int NULL,
    AuditId uniqueidentifier NULL,
    CreatedAtUtc datetime2(7) NOT NULL CONSTRAINT DF_WebInboundJournal_Created DEFAULT SYSUTCDATETIME(),
    CommittedAtUtc datetime2(7) NULL,
    CONSTRAINT PK_WebInboundRequestCommandJournalV1 PRIMARY KEY
      (DatabaseBindingId,TenantId,CompanyId,Actor,OperationId),
    CONSTRAINT CK_WebInboundJournal_Action CHECK (Action IN ('Create','Save','SendToWarehouse')),
    CONSTRAINT CK_WebInboundJournal_State CHECK
      ((State=0 AND BeforeState IS NULL AND AfterState IS NULL AND StatusAfter IS NULL AND AuditId IS NULL AND CommittedAtUtc IS NULL)
       OR (State=1 AND BranchId IS NOT NULL AND DocumentId IS NOT NULL AND BeforeState IS NOT NULL AND AfterState IS NOT NULL
           AND StatusAfter IN (0,1,2) AND AuditId IS NOT NULL AND CommittedAtUtc IS NOT NULL))
);
-- Receipt tokens represent state equality. This schema introduces no monotonic revision or ABA guarantee.
