-- UNAPPLIED DESIGN FOR MIKA REVIEW. No bootstrap row or accepted binding is supplied.
-- This inbound-only marker is separate from runtime acceptance and connection custody.
-- A copied marker does NOT distinguish a clone/restore. The owner must bind credential
-- reads and inbound commands to one approved physical target and control restore/rebinding.
-- Missing marker, incomplete metadata, or any identity mismatch means closed admission.
CREATE TABLE dbo.WebInboundRequestCommandBindingV1
(
    SingletonId tinyint NOT NULL,
    SchemaVersion int NOT NULL,
    DatabaseBindingId uniqueidentifier NOT NULL,
    TenantId nvarchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CompanyId nvarchar(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CONSTRAINT PK_WebInboundRequestCommandBindingV1 PRIMARY KEY (SingletonId),
    CONSTRAINT CK_WebInboundBinding_Identity CHECK (SingletonId=1 AND SchemaVersion=1)
);
-- Installation, nonempty binding assignment, connection-provider custody, runtime
-- evidence and host registration remain owner decisions, outside this local patch.
