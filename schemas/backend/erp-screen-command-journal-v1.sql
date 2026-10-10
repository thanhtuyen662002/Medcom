-- New Web control metadata, UNAPPLIED. Deployment-owner review and dedicated target acceptance required.
-- Startup never executes this file. No native ERP objects, credentials or business rows are changed here.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF @DatabaseBindingId IS NULL OR @DatabaseBindingId='00000000-0000-0000-0000-000000000000'
   OR @CatalogHash IS NULL OR DATALENGTH(@CatalogHash)<>32
    THROW 51000,'Explicit target binding and catalog hash required.',1;
IF OBJECT_ID('dbo.MedcomErpCommandSchema') IS NOT NULL OR OBJECT_ID('dbo.MedcomErpCommandJournal') IS NOT NULL
    THROW 51001,'Existing control objects require review.',1;
CREATE TABLE dbo.MedcomErpCommandSchema(
    SingletonId tinyint NOT NULL PRIMARY KEY CHECK(SingletonId=1),SchemaVersion int NOT NULL CHECK(SchemaVersion=1),
    DatabaseBindingId uniqueidentifier NOT NULL,CatalogHash binary(32) NOT NULL);
CREATE TABLE dbo.MedcomErpCommandJournal(
    DatabaseBindingId uniqueidentifier NOT NULL,SlotHash binary(32) NOT NULL,
    KeyBytes varbinary(4096) NOT NULL,IntentBytes varbinary(max) NOT NULL,
    DocumentId nvarchar(50) NULL,ReceiptJson nvarchar(max) NULL,
    BeforeToken varchar(64) NOT NULL,AfterToken varchar(64) NULL,
    AuditId uniqueidentifier NOT NULL,CommittedAtUtc datetime2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY(DatabaseBindingId,SlotHash),
    CHECK(DATALENGTH(KeyBytes)>0 AND DATALENGTH(IntentBytes) BETWEEN 1 AND 1048576),
    CHECK((DocumentId IS NULL AND ReceiptJson IS NULL AND AfterToken IS NULL)
       OR(DocumentId IS NOT NULL AND ReceiptJson IS NOT NULL AND AfterToken IS NOT NULL)));
INSERT dbo.MedcomErpCommandSchema VALUES(1,1,@DatabaseBindingId,@CatalogHash);
COMMIT TRANSACTION;
