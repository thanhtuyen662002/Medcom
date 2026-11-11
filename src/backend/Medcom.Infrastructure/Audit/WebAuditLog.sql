-- Medcom Web activity log ("Nhat ky thao tac web"), schema version 1.
-- Installed only by the explicit operator command `Medcom.Api.dll --install-web-audit`.
-- Creates one new table plus indexes. No native ERP table, procedure or row is changed.
-- Keep identical to src/backend/Medcom.Infrastructure/Audit/WebAuditLog.sql (a test compares them).
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID(N'dbo.MedcomWebAuditLog', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.MedcomWebAuditLog(
        AuditId bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_MedcomWebAuditLog PRIMARY KEY CLUSTERED,
        OccurredAtUtc datetime2(3) NOT NULL,
        RecordedAtUtc datetime2(3) NOT NULL CONSTRAINT DF_MedcomWebAuditLog_Recorded DEFAULT SYSUTCDATETIME(),
        Source varchar(10) NOT NULL,
        Category varchar(20) NOT NULL,
        Action varchar(100) NOT NULL,
        Outcome varchar(30) NOT NULL,
        UserName nvarchar(100) NULL,
        DisplayName nvarchar(200) NULL,
        RoleName nvarchar(200) NULL,
        SessionRef varchar(32) NULL,
        BranchId nvarchar(50) NULL,
        Module varchar(100) NULL,
        DocumentId nvarchar(100) NULL,
        HttpMethod varchar(10) NULL,
        Path nvarchar(400) NULL,
        QueryText nvarchar(2000) NULL,
        StatusCode smallint NULL,
        DurationMs int NULL,
        CorrelationId varchar(64) NULL,
        ClientAddress varchar(64) NULL,
        PeerAddress varchar(64) NULL,
        UserAgent nvarchar(512) NULL,
        Page nvarchar(200) NULL,
        Target nvarchar(400) NULL,
        ClientEventId uniqueidentifier NULL,
        ClientTimeUtc datetime2(3) NULL,
        RequestData nvarchar(max) NULL,
        ResultData nvarchar(max) NULL,
        ErrorCode varchar(100) NULL,
        CONSTRAINT CK_MedcomWebAuditLog_Source CHECK (Source IN ('server','client')));
    CREATE INDEX IX_MedcomWebAuditLog_Time ON dbo.MedcomWebAuditLog(OccurredAtUtc DESC);
    CREATE INDEX IX_MedcomWebAuditLog_User ON dbo.MedcomWebAuditLog(UserName, OccurredAtUtc DESC);
    CREATE INDEX IX_MedcomWebAuditLog_Document ON dbo.MedcomWebAuditLog(DocumentId, OccurredAtUtc DESC) WHERE DocumentId IS NOT NULL;
    CREATE INDEX IX_MedcomWebAuditLog_Module ON dbo.MedcomWebAuditLog(Module, OccurredAtUtc DESC) WHERE Module IS NOT NULL;
    -- Browser retries resend the same event id; the writer skips ids already stored.
    CREATE INDEX IX_MedcomWebAuditLog_ClientEvent ON dbo.MedcomWebAuditLog(ClientEventId) WHERE ClientEventId IS NOT NULL;
END
COMMIT TRANSACTION;
