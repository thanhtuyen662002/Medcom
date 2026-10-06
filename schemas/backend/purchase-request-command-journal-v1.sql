-- NEW Web control artifact, UNAPPLIED. Not ERP/source SQL. Never executed by application startup.
-- Deployment owner supplies @DatabaseBindingId uniqueidentifier for the dedicated qualified database.
-- No production/customer data, ERP schema alteration, global trigger, expiry takeover or cleanup job.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF @DatabaseBindingId IS NULL OR @DatabaseBindingId = '00000000-0000-0000-0000-000000000000'
    THROW 51000, 'An explicit database binding is required.', 1;
IF OBJECT_ID('dbo.MedcomPurchaseRequestCommandSchema') IS NOT NULL
   OR OBJECT_ID('dbo.MedcomPurchaseRequestCommandJournal') IS NOT NULL
    THROW 51001, 'Existing control objects require independent review.', 1;
CREATE TABLE dbo.MedcomPurchaseRequestCommandSchema (
    SingletonId tinyint NOT NULL CONSTRAINT PK_MedcomPurchaseRequestCommandSchema PRIMARY KEY,
    SchemaVersion int NOT NULL,
    DatabaseBindingId uniqueidentifier NOT NULL,
    CONSTRAINT CK_MedcomPurchaseRequestCommandSchema CHECK (SingletonId=1 AND SchemaVersion=1)
);
CREATE TABLE dbo.MedcomPurchaseRequestCommandJournal (
    DatabaseBindingId uniqueidentifier NOT NULL,
    SlotHash binary(32) NOT NULL,
    KeyBytes varbinary(max) NOT NULL,
    IntentBytes varbinary(max) NOT NULL,
    AttemptId uniqueidentifier NOT NULL,
    State tinyint NOT NULL,
    DocumentId nvarchar(50) NULL,
    ReceiptJson nvarchar(max) NULL,
    AggregateBytes varbinary(max) NULL,
    CONSTRAINT PK_MedcomPurchaseRequestCommandJournal PRIMARY KEY (DatabaseBindingId,SlotHash),
    CONSTRAINT CK_MedcomPurchaseRequestCommandJournal CHECK (
      DATALENGTH(KeyBytes) BETWEEN 1 AND 4096 AND DATALENGTH(IntentBytes) BETWEEN 1 AND 1048576
      AND ((State=0 AND DocumentId IS NULL AND ReceiptJson IS NULL AND AggregateBytes IS NULL)
        OR (State=1 AND DocumentId IS NOT NULL AND ReceiptJson IS NOT NULL AND AggregateBytes IS NOT NULL)))
);
INSERT dbo.MedcomPurchaseRequestCommandSchema(SingletonId,SchemaVersion,DatabaseBindingId)
VALUES(1,1,@DatabaseBindingId);
COMMIT TRANSACTION;
