namespace Medcom.TargetInspect;

// Fixed, source-derived catalog plans. No external SQL, selectors, business rows or lock hints.
public static class InspectionSql
{
    public const string Environment = """
        SELECT CONVERT(int, CASE WHEN DB_ID()>4 AND DATALENGTH(DB_NAME())=DATALENGTH(@database)
            AND CONVERT(varbinary(max),DB_NAME())=CONVERT(varbinary(max),@database) THEN 1 ELSE 0 END),
          @@TRANCOUNT, CONVERT(int,CASE WHEN (@@OPTIONS & 2)=0 THEN 1 ELSE 0 END),
          CONVERT(int,CASE WHEN state=0 AND is_read_only=0 AND delayed_durability=0 THEN 1 ELSE 0 END),
          CONVERT(int,CASE WHEN IS_SRVROLEMEMBER('sysadmin')=1 OR USER_ID()=1 THEN 1 ELSE 0 END),
          CONVERT(int,CASE WHEN IS_SRVROLEMEMBER('sysadmin')=1 THEN 1 ELSE 0 END)
        FROM sys.databases WHERE database_id=DB_ID();
        """;
    public const string Columns = """
        WITH Expected(Tbl,Col,Typ,Len,Nullable,Prec,Scale,CollationName) AS (
          SELECT * FROM (VALUES
            ('MedcomPurchaseRequestCommandJournal','DatabaseBindingId','uniqueidentifier',16,0,0,0,''),
            ('MedcomPurchaseRequestCommandJournal','SlotHash','binary',32,0,0,0,''),
            ('MedcomPurchaseRequestCommandJournal','KeyBytes','varbinary',-1,0,0,0,''),
            ('MedcomPurchaseRequestCommandJournal','IntentBytes','varbinary',-1,0,0,0,''),
            ('MedcomPurchaseRequestCommandJournal','AttemptId','uniqueidentifier',16,0,0,0,''),
            ('MedcomPurchaseRequestCommandJournal','State','tinyint',1,0,3,0,''),
            ('MedcomPurchaseRequestCommandJournal','DocumentId','nvarchar',100,1,0,0,''),
            ('MedcomPurchaseRequestCommandJournal','ReceiptJson','nvarchar',-1,1,0,0,''),
            ('MedcomPurchaseRequestCommandJournal','AggregateBytes','varbinary',-1,1,0,0,''),
            ('MedcomPurchaseRequestCommandSchema','SingletonId','tinyint',1,0,3,0,''),
            ('MedcomPurchaseRequestCommandSchema','SchemaVersion','int',4,0,10,0,''),
            ('MedcomPurchaseRequestCommandSchema','DatabaseBindingId','uniqueidentifier',16,0,0,0,''),
            ('AP_PurchaseRequestTbl','PurchaseRequestID','nvarchar',100,0,0,0,''),
            ('AP_PurchaseRequestTbl','PurchaseDate','datetime',8,1,23,3,''),
            ('AP_PurchaseRequestTbl','PurposeID','int',4,1,10,0,''),
            ('AP_PurchaseRequestTbl','PersonSuggest','nvarchar',1000,0,0,0,''),
            ('AP_PurchaseRequestTbl','Department','nvarchar',200,0,0,0,''),
            ('AP_PurchaseRequestTbl','PurposeDescOrClient','nvarchar',-1,1,0,0,''),
            ('AP_PurchaseRequestTbl','Price','decimal',9,1,18,2,''),
            ('AP_PurchaseRequestTbl','Notes','nvarchar',-1,1,0,0,''),
            ('AP_PurchaseRequestTbl','StatusID','int',4,0,10,0,''),
            ('AP_PurchaseRequestTbl','isLock','bit',1,1,1,0,''),
            ('AP_PurchaseRequestTbl','CurrencyID','varchar',3,0,0,0,''),
            ('AP_PurchaseRequestTbl','ObjectID','varchar',100,0,0,0,''),
            ('AP_PurchaseRequestTbl','RateExchange','float',8,0,53,0,''),
            ('AP_PurchaseRequestTbl','BranchID','varchar',50,0,0,0,''),
            ('AP_PurchaseRequestDetailTbl','UserAutoID','varchar',50,0,0,0,''),
            ('AP_PurchaseRequestDetailTbl','ItemID','varchar',50,0,0,0,''),
            ('AP_PurchaseRequestDetailTbl','Budget','decimal',9,1,18,0,''),
            ('AP_PurchaseRequestDetailTbl','TimeRequired','nvarchar',400,1,0,0,''),
            ('AP_PurchaseRequestDetailTbl','Quantity','decimal',9,0,18,0,''),
            ('AP_PurchaseRequestDetailTbl','UnitPrice','decimal',9,0,18,0,''),
            ('AP_PurchaseRequestDetailTbl','TotalPrice','decimal',9,1,18,0,''),
            ('AP_PurchaseRequestDetailTbl','Model','varchar',50,1,0,0,''),
            ('AP_PurchaseRequestDetailTbl','PurchaseRequestID','nvarchar',100,1,0,0,''),
            ('IV_InboundRequestLogTbl','UserAutoID','varchar',50,0,0,0,''),
            ('IV_InboundRequestLogTbl','DocumentID','varchar',50,0,0,0,''),
            ('IV_InboundRequestLogTbl','ThoiGian','datetime',8,0,23,3,''),
            ('IV_InboundRequestLogTbl','UserName','varchar',50,1,0,0,''),
            ('IV_InboundRequestLogTbl','StatusID','int',4,1,10,0,''),
            ('IV_InboundRequestLogTbl','SendTo','nvarchar',-1,1,0,0,''),
            ('IV_InboundRequestLogTbl','Notes','nvarchar',400,1,0,0,''),
            ('IV_InboundRequestNoSuitableTbl','UserAutoID','varchar',50,0,0,0,''),
            ('IV_InboundRequestNoSuitableTbl','DocumentID','varchar',50,0,0,0,''),
            ('IV_InboundRequestNoSuitableTbl','ItemID','nvarchar',100,0,0,0,''),
            ('IV_InboundRequestNoSuitableTbl','Lot','nvarchar',100,1,0,0,''),
            ('IV_InboundRequestNoSuitableTbl','ExpireDate','datetime',8,1,23,3,''),
            ('IV_InboundRequestNoSuitableTbl','QuantityByDocument','decimal',9,1,18,0,''),
            ('IV_InboundRequestNoSuitableTbl','QuantityByReal','decimal',9,1,18,0,''),
            ('IV_InboundRequestNoSuitableTbl','QuantityChecked','decimal',9,1,18,0,''),
            ('IV_InboundRequestNoSuitableTbl','QuantityNoSuitable','decimal',9,1,18,0,''),
            ('IV_InboundRequestNoSuitableTbl','Status','nvarchar',510,1,0,0,''),
            ('IV_InboundRequestNoSuitableTbl','Solution','nvarchar',510,1,0,0,''),
            ('IV_InboundRequestNoSuitableTbl','Conclude','nvarchar',510,1,0,0,''),
            ('IV_InboundRequestNoSuitableTbl','Suggestion','nvarchar',510,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','UserAutoID','varchar',50,0,0,0,''),
            ('IV_InboundRequestDetailsTbl','DocumentID','varchar',50,0,0,0,''),
            ('IV_InboundRequestDetailsTbl','ContractID','nvarchar',200,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','ItemID','varchar',50,0,0,0,''),
            ('IV_InboundRequestDetailsTbl','HangSX','nvarchar',200,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','UnitFactor','float',8,1,53,0,''),
            ('IV_InboundRequestDetailsTbl','Unit2','nvarchar',100,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','Additional','bit',1,1,1,0,''),
            ('IV_InboundRequestDetailsTbl','LotNumberByDocument','nvarchar',100,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','SetQuantityByDocument','decimal',9,1,18,0,''),
            ('IV_InboundRequestDetailsTbl','BarrelQuantityByDocument','decimal',9,1,18,0,''),
            ('IV_InboundRequestDetailsTbl','ExpireDateByDocument','datetime',8,1,23,3,''),
            ('IV_InboundRequestDetailsTbl','LotNumberByReal','nvarchar',100,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','SetQuantityByReal','decimal',9,1,18,0,''),
            ('IV_InboundRequestDetailsTbl','BarrelQuantityByReal','decimal',9,1,18,0,''),
            ('IV_InboundRequestDetailsTbl','ExpireDateByReal','datetime',8,1,23,3,''),
            ('IV_InboundRequestDetailsTbl','SourceAmount','decimal',9,1,18,0,''),
            ('IV_InboundRequestDetailsTbl','UnitPrice','decimal',9,1,18,0,''),
            ('IV_InboundRequestDetailsTbl','Amount','decimal',9,1,18,0,''),
            ('IV_InboundRequestDetailsTbl','RandomTestQuantity','decimal',9,1,18,0,''),
            ('IV_InboundRequestDetailsTbl','TestStatus','nvarchar',200,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','NoPalletNote','nvarchar',1000,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','PalletNote','nvarchar',1000,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','CheckerNote','nvarchar',1000,1,0,0,''),
            ('IV_InboundRequestDetailsTbl','ItemCode','nvarchar',100,1,0,0,''),
            ('IV_InboundRequestTbl','DocumentID','varchar',50,0,0,0,''),
            ('IV_InboundRequestTbl','DocumentDate','datetime',8,0,23,3,''),
            ('IV_InboundRequestTbl','OrderNumber','nvarchar',100,0,0,0,''),
            ('IV_InboundRequestTbl','BranchID','varchar',50,1,0,0,''),
            ('IV_InboundRequestTbl','InvoiceNo','nvarchar',100,0,0,0,''),
            ('IV_InboundRequestTbl','DeclarationNumber','varchar',50,1,0,0,''),
            ('IV_InboundRequestTbl','DeparturePoint','nvarchar',200,0,0,0,''),
            ('IV_InboundRequestTbl','DestinationPoint','nvarchar',200,0,0,0,''),
            ('IV_InboundRequestTbl','IsRain','bit',1,1,1,0,''),
            ('IV_InboundRequestTbl','OrderTypeID','nvarchar',100,0,0,0,''),
            ('IV_InboundRequestTbl','ObjectID','varchar',50,1,0,0,''),
            ('IV_InboundRequestTbl','TotalPalletQuantityByDocument','decimal',9,1,18,0,''),
            ('IV_InboundRequestTbl','TotalBarrelQuantityByDocument','decimal',9,1,18,0,''),
            ('IV_InboundRequestTbl','TotalPalletQuantityByReal','decimal',9,1,18,0,''),
            ('IV_InboundRequestTbl','TotalBarrelQuantityByReal','decimal',9,1,18,0,''),
            ('IV_InboundRequestTbl','ExcessPackageQuantity','decimal',9,1,18,0,''),
            ('IV_InboundRequestTbl','LackOfPackageQuantity','decimal',9,1,18,0,''),
            ('IV_InboundRequestTbl','DamagedPackageQuantity','decimal',9,1,18,0,''),
            ('IV_InboundRequestTbl','PackageTypeID','nvarchar',100,1,0,0,''),
            ('IV_InboundRequestTbl','IsDamageOutsidePackage','bit',1,1,1,0,''),
            ('IV_InboundRequestTbl','DamageDescription','nvarchar',1000,1,0,0,''),
            ('IV_InboundRequestTbl','DamageInsideStatusID','nvarchar',100,1,0,0,''),
            ('IV_InboundRequestTbl','LocationDamageDetectedID','nvarchar',100,1,0,0,''),
            ('IV_InboundRequestTbl','LocationDamageDescription','nvarchar',1000,1,0,0,''),
            ('IV_InboundRequestTbl','ResultDesciption','nvarchar',-1,1,0,0,''),
            ('IV_InboundRequestTbl','TotalQuantityInboundResult','decimal',9,1,18,0,''),
            ('IV_InboundRequestTbl','GoodAwaitingInboundResult','decimal',9,1,18,0,''),
            ('IV_InboundRequestTbl','ResultNote','nvarchar',1000,1,0,0,''),
            ('IV_InboundRequestTbl','DatetimeRecorded','datetime',8,1,23,3,''),
            ('IV_InboundRequestTbl','StatusID','int',4,0,10,0,''),
            ('IV_InboundRequestTbl','CurrencyID','varchar',3,1,0,0,''),
            ('IV_InboundRequestTbl','RateExchange','decimal',13,1,28,10,''),
            ('IV_InboundRequestTbl','ImageURL','varchar',255,1,0,0,''),
            ('IV_InboundRequestTbl','BBKCUrl','varchar',255,1,0,0,''),
            ('IV_InboundRequestTbl','Notes','nvarchar',1000,1,0,0,''),
            ('IV_InboundRequestTbl','SendTo','nvarchar',-1,1,0,0,''),
            ('IV_InboundRequestTbl','QRPrintType','varchar',10,0,0,0,''),
            ('IV_InboundRequestCTCPTbl','UserAutoID','nvarchar',100,0,0,0,''),
            ('IV_InboundRequestCTCPTbl','DocumentID','varchar',50,0,0,0,''),
            ('IV_InboundRequestCTCPTbl','ObjectID','varchar',100,0,0,0,''),
            ('IV_InboundRequestCTCPTbl','NCC','varchar',100,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','Memo','nvarchar',400,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','Cost','decimal',9,1,18,2,''),
            ('IV_InboundRequestCTCPTbl','VATAmount','decimal',9,1,18,2,''),
            ('IV_InboundRequestCTCPTbl','Notes','nvarchar',400,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','CostType','varchar',30,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','CurrencyID','varchar',3,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','RateExchange','decimal',13,1,28,10,''),
            ('IV_InboundRequestCTCPTbl','SourceAmount','decimal',13,1,28,4,''),
            ('IV_InboundRequestCTCPTbl','VATID','varchar',50,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','VATPercent','decimal',9,1,18,2,''),
            ('IV_InboundRequestCTCPTbl','ExpenseAccID','varchar',50,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','InvoiceNo','varchar',50,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','InvoiceDate','datetime',8,1,23,3,''),
            ('IV_InboundRequestCTCPTbl','AllocateKind','varchar',5,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','IsAllocatable','bit',1,1,1,0,''),
            ('IV_InboundRequestCTCPTbl','ServiceDocumentID','varchar',30,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','ServiceDetailID','varchar',40,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','Status','int',4,1,10,0,''),
            ('IV_InboundRequestCTCPTbl','UserCreate','varchar',50,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','UserUpdate','varchar',50,1,0,0,''),
            ('IV_InboundRequestCTCPTbl','DateCreate','datetime',8,1,23,3,''),
            ('IV_InboundRequestCTCPTbl','DateUpdate','datetime',8,1,23,3,''),
            ('IV_InboundRequestCTCPTbl','IsActive','bit',1,0,1,0,''),
            ('WebInboundRequestCommandJournalV1','DatabaseBindingId','uniqueidentifier',16,0,0,0,''),
            ('WebInboundRequestCommandJournalV1','TenantId','nvarchar',200,0,0,0,'Latin1_General_100_BIN2'),
            ('WebInboundRequestCommandJournalV1','CompanyId','nvarchar',200,0,0,0,'Latin1_General_100_BIN2'),
            ('WebInboundRequestCommandJournalV1','Actor','varchar',50,0,0,0,'Latin1_General_100_BIN2'),
            ('WebInboundRequestCommandJournalV1','OperationId','uniqueidentifier',16,0,0,0,''),
            ('WebInboundRequestCommandJournalV1','IntentHash','binary',32,0,0,0,''),
            ('WebInboundRequestCommandJournalV1','Action','varchar',32,0,0,0,'Latin1_General_100_BIN2'),
            ('WebInboundRequestCommandJournalV1','AttemptId','uniqueidentifier',16,0,0,0,''),
            ('WebInboundRequestCommandJournalV1','State','tinyint',1,0,3,0,''),
            ('WebInboundRequestCommandJournalV1','BranchId','varchar',50,0,0,0,'Latin1_General_100_BIN2'),
            ('WebInboundRequestCommandJournalV1','DocumentId','varchar',50,1,0,0,'Latin1_General_100_BIN2'),
            ('WebInboundRequestCommandJournalV1','BeforeState','char',64,1,0,0,'Latin1_General_100_BIN2'),
            ('WebInboundRequestCommandJournalV1','AfterState','char',64,1,0,0,'Latin1_General_100_BIN2'),
            ('WebInboundRequestCommandJournalV1','StatusAfter','int',4,1,10,0,''),
            ('WebInboundRequestCommandJournalV1','AuditId','uniqueidentifier',16,1,0,0,''),
            ('WebInboundRequestCommandJournalV1','CreatedAtUtc','datetime2',8,0,27,7,''),
            ('WebInboundRequestCommandJournalV1','CommittedAtUtc','datetime2',8,1,27,7,'')
          ) E(Tbl,Col,Typ,Len,Nullable,Prec,Scale,CollationName)
        ), Tables AS (SELECT Tbl,COUNT(*) AS ExpectedCount FROM Expected GROUP BY Tbl)
        SELECT E.Tbl, CONVERT(int,CASE
          WHEN O.object_id IS NULL THEN 2
          WHEN EXISTS (SELECT 1 FROM Expected X LEFT JOIN sys.columns C ON C.object_id=O.object_id AND C.name=X.Col LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id WHERE X.Tbl=E.Tbl AND (C.column_id IS NULL OR T.name IS NULL)) THEN 2
          WHEN O.is_memory_optimized<>0 OR O.temporal_type<>0 OR O.is_filetable<>0 THEN 1
          WHEN (SELECT COUNT(*) FROM sys.columns WHERE object_id=O.object_id)<>E.ExpectedCount THEN 1
          WHEN EXISTS (SELECT 1 FROM Expected X
            LEFT JOIN sys.columns C ON C.object_id=O.object_id AND C.name COLLATE Latin1_General_100_BIN2=X.Col COLLATE Latin1_General_100_BIN2
              AND DATALENGTH(C.name)=DATALENGTH(CONVERT(nvarchar(128),X.Col))
            LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
            WHERE X.Tbl=E.Tbl AND (C.column_id IS NULL OR T.name IS NULL OR T.is_user_defined<>0 OR T.name<>X.Typ
              OR C.max_length<>X.Len OR C.is_nullable<>X.Nullable OR C.precision<>X.Prec OR C.scale<>X.Scale
              OR C.is_identity<>0 OR C.is_computed<>0 OR C.generated_always_type<>0 OR C.is_hidden<>0 OR C.encryption_type IS NOT NULL
              OR (X.CollationName<>'' AND (C.collation_name IS NULL OR C.collation_name<>X.CollationName)))) THEN 1
          ELSE 0 END)
        FROM Tables E LEFT JOIN sys.schemas S ON S.name COLLATE Latin1_General_100_BIN2=N'dbo'
        LEFT JOIN sys.tables O ON O.schema_id=S.schema_id AND O.name COLLATE Latin1_General_100_BIN2=E.Tbl COLLATE Latin1_General_100_BIN2
          AND DATALENGTH(O.name)=DATALENGTH(CONVERT(nvarchar(128),E.Tbl))
        ORDER BY E.Tbl OPTION(MAXDOP 1);
        """;
    public const string Keys = """
        WITH Expected(Tbl,Col,Ordinal) AS (SELECT * FROM (VALUES
            ('MedcomPurchaseRequestCommandJournal','DatabaseBindingId',1),
            ('MedcomPurchaseRequestCommandJournal','SlotHash',2),
            ('MedcomPurchaseRequestCommandSchema','SingletonId',1),
            ('AP_PurchaseRequestTbl','PurchaseRequestID',1),
            ('AP_PurchaseRequestDetailTbl','UserAutoID',1),
            ('IV_InboundRequestLogTbl','UserAutoID',1),
            ('IV_InboundRequestNoSuitableTbl','UserAutoID',1),
            ('IV_InboundRequestDetailsTbl','UserAutoID',1),
            ('IV_InboundRequestTbl','DocumentID',1),
            ('IV_InboundRequestCTCPTbl','UserAutoID',1),
            ('WebInboundRequestCommandJournalV1','DatabaseBindingId',1),
            ('WebInboundRequestCommandJournalV1','TenantId',2),
            ('WebInboundRequestCommandJournalV1','CompanyId',3),
            ('WebInboundRequestCommandJournalV1','Actor',4),
            ('WebInboundRequestCommandJournalV1','OperationId',5)
        ) E(Tbl,Col,Ordinal)), Tables AS (SELECT Tbl,COUNT(*) ExpectedCount FROM Expected GROUP BY Tbl)
        SELECT E.Tbl, CONVERT(int,CASE WHEN OBJECT_ID('dbo.'+E.Tbl,'U') IS NULL THEN 2
          WHEN NOT EXISTS(SELECT 1 FROM sys.indexes I WHERE I.object_id=OBJECT_ID('dbo.'+E.Tbl,'U')
            AND I.is_primary_key=1 AND I.is_unique=1 AND I.is_disabled=0 AND I.has_filter=0
            AND (SELECT COUNT(*) FROM sys.index_columns C WHERE C.object_id=I.object_id AND C.index_id=I.index_id AND C.key_ordinal>0)=E.ExpectedCount
            AND NOT EXISTS(SELECT 1 FROM Expected X WHERE X.Tbl=E.Tbl AND NOT EXISTS(
              SELECT 1 FROM sys.index_columns K JOIN sys.columns C ON C.object_id=K.object_id AND C.column_id=K.column_id
              WHERE K.object_id=I.object_id AND K.index_id=I.index_id AND K.key_ordinal=X.Ordinal
                AND C.name COLLATE Latin1_General_100_BIN2=X.Col COLLATE Latin1_General_100_BIN2
                AND DATALENGTH(C.name)=DATALENGTH(CONVERT(nvarchar(128),X.Col))))) THEN 1 ELSE 0 END)
        FROM Tables E ORDER BY E.Tbl OPTION(MAXDOP 1);
        """;
    public const string Safety = """
        WITH Expected(Tbl) AS (SELECT * FROM (VALUES
          ('MedcomPurchaseRequestCommandJournal'),
          ('MedcomPurchaseRequestCommandSchema'),
          ('AP_PurchaseRequestTbl'),
          ('AP_PurchaseRequestDetailTbl'),
          ('IV_InboundRequestLogTbl'),
          ('IV_InboundRequestNoSuitableTbl'),
          ('IV_InboundRequestDetailsTbl'),
          ('IV_InboundRequestTbl'),
          ('IV_InboundRequestCTCPTbl'),
          ('WebInboundRequestCommandJournalV1')
        ) E(Tbl))
        SELECT E.Tbl, CONVERT(int,CASE WHEN OBJECT_ID('dbo.'+E.Tbl,'U') IS NULL THEN 2
          WHEN EXISTS(SELECT 1 FROM sys.triggers WHERE parent_id=OBJECT_ID('dbo.'+E.Tbl,'U') AND is_disabled=0)
            OR EXISTS(SELECT 1 FROM sys.security_predicates P JOIN sys.security_policies S ON P.object_id=S.object_id
              WHERE P.target_object_id=OBJECT_ID('dbo.'+E.Tbl,'U') AND S.is_enabled=1) THEN 1 ELSE 0 END)
        FROM Expected E ORDER BY E.Tbl OPTION(MAXDOP 1);
        """;
    public const string PurchaseForeignKey = """
        SELECT CONVERT(int,CASE WHEN EXISTS(SELECT 1 FROM sys.foreign_keys F
          JOIN sys.foreign_key_columns X ON X.constraint_object_id=F.object_id
          JOIN sys.columns C ON C.object_id=X.parent_object_id AND C.column_id=X.parent_column_id
          JOIN sys.columns R ON R.object_id=X.referenced_object_id AND R.column_id=X.referenced_column_id
          WHERE F.parent_object_id=OBJECT_ID('dbo.AP_PurchaseRequestDetailTbl','U')
            AND F.referenced_object_id=OBJECT_ID('dbo.AP_PurchaseRequestTbl','U')
            AND F.is_disabled=0 AND F.is_not_trusted=0 AND F.delete_referential_action=0 AND F.update_referential_action=0
            AND C.name='PurchaseRequestID' AND R.name='PurchaseRequestID'
            AND (SELECT COUNT(*) FROM sys.foreign_key_columns Y WHERE Y.constraint_object_id=F.object_id)=1)
          THEN 0 ELSE 1 END) OPTION(MAXDOP 1);
        """;
    public const string Definitions = """
        WITH Expected(Tbl,Name) AS (SELECT * FROM (VALUES
          ('MedcomPurchaseRequestCommandSchema','CK_MedcomPurchaseRequestCommandSchema'),
          ('MedcomPurchaseRequestCommandJournal','CK_MedcomPurchaseRequestCommandJournal'),
          ('WebInboundRequestCommandJournalV1','CK_WebInboundJournal_Action'),
          ('WebInboundRequestCommandJournalV1','CK_WebInboundJournal_State')) E(Tbl,Name))
        SELECT E.Name,LEFT(C.definition,16385),CONVERT(int,CASE WHEN C.object_id IS NULL THEN 2
            WHEN C.is_disabled=1 OR C.is_not_trusted=1 OR C.is_not_for_replication=1 THEN 1 ELSE 0 END)
        FROM Expected E LEFT JOIN sys.check_constraints C ON C.parent_object_id=OBJECT_ID('dbo.'+E.Tbl,'U')
          AND C.name COLLATE Latin1_General_100_BIN2=E.Name COLLATE Latin1_General_100_BIN2
        ORDER BY E.Name OPTION(MAXDOP 1);
        """;
    public const string Defaults = """
        WITH Expected(Tbl,Col) AS (SELECT * FROM (VALUES
          ('WebInboundRequestCommandJournalV1','CreatedAtUtc'),('IV_InboundRequestLogTbl','UserAutoID'),
          ('IV_InboundRequestLogTbl','ThoiGian')) E(Tbl,Col))
        SELECT E.Tbl+'.'+E.Col,LEFT(D.definition,16385),CONVERT(int,CASE WHEN C.column_id IS NULL OR D.object_id IS NULL THEN 2 ELSE 0 END)
        FROM Expected E LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.'+E.Tbl,'U') AND C.name=E.Col
        LEFT JOIN sys.default_constraints D ON D.parent_object_id=C.object_id AND D.parent_column_id=C.column_id
        ORDER BY E.Tbl,E.Col OPTION(MAXDOP 1);
        """;
    public const string Binding = """
        WITH Rows AS (SELECT TOP(2) SingletonId,SchemaVersion,DatabaseBindingId FROM dbo.MedcomPurchaseRequestCommandSchema)
        SELECT CONVERT(int,CASE WHEN COUNT_BIG(*)=1 AND
          COUNT_BIG(CASE WHEN SingletonId=1 AND SchemaVersion=1 AND DatabaseBindingId=@binding THEN 1 END)=1
          THEN 0 ELSE 1 END) FROM Rows OPTION(MAXDOP 1);
        """;
    public const string ServerTriggers = """
        SELECT CONVERT(int,CASE WHEN EXISTS(SELECT 1 FROM sys.server_triggers T
          LEFT JOIN sys.server_trigger_events E ON T.object_id=E.object_id
          WHERE T.is_disabled=0 AND (E.type IS NULL OR E.type_desc IS NULL OR E.type_desc<>N'LOGON'))
          THEN 2 ELSE 0 END) OPTION(MAXDOP 1);
        """;
    // I46 read-only observations. These are not the transaction-bound qualification plan.
    // The first three I46 environment predicates require its owned transaction and are NOT_RUN here.
    public const string InboundEnvironment = """
        SELECT E.Name,CONVERT(int,E.Status) FROM sys.databases D
        CROSS APPLY (VALUES
          ('online',CASE WHEN D.state=0 THEN 0 ELSE 1 END),
          ('writable',CASE WHEN D.is_read_only=0 THEN 0 ELSE 1 END),
          ('delayed_durability_off',CASE WHEN D.delayed_durability=0 THEN 0 ELSE 1 END),
          ('non_system_database',CASE WHEN DB_ID()>4 THEN 0 ELSE 1 END),
          ('implicit_transactions_off',CASE WHEN (@@OPTIONS & 2)=0 THEN 0 ELSE 1 END),
          ('metadata_principal',CASE WHEN USER_ID()=1 OR IS_SRVROLEMEMBER('sysadmin')=1 THEN 0 ELSE 2 END),
          ('database_triggers',CASE WHEN USER_ID()=1 OR IS_SRVROLEMEMBER('sysadmin')=1
            THEN CASE WHEN NOT EXISTS(SELECT 1 FROM sys.triggers WHERE parent_class=0) THEN 0 ELSE 1 END ELSE 2 END)
        ) E(Name,Status) WHERE D.database_id=DB_ID() ORDER BY E.Name OPTION(MAXDOP 1);
        """;
    public const string InboundMarker = """
        WITH Expected(Col,Typ,Len,Nullable,Prec,Scale,CollationName) AS (SELECT * FROM (VALUES
          ('SingletonId','tinyint',1,0,3,0,''),
          ('SchemaVersion','int',4,0,10,0,''),
          ('DatabaseBindingId','uniqueidentifier',16,0,0,0,''),
          ('TenantId','nvarchar',200,0,0,0,'Latin1_General_100_BIN2'),
          ('CompanyId','nvarchar',200,0,0,0,'Latin1_General_100_BIN2')
        ) E(Col,Typ,Len,Nullable,Prec,Scale,CollationName)), Marker AS (
          SELECT T.* FROM sys.tables T JOIN sys.schemas S ON S.schema_id=T.schema_id
          WHERE S.name=N'dbo' COLLATE Latin1_General_100_BIN2 AND DATALENGTH(S.name)=6
            AND T.name=N'WebInboundRequestCommandBindingV1' COLLATE Latin1_General_100_BIN2
            AND DATALENGTH(T.name)=DATALENGTH(N'WebInboundRequestCommandBindingV1')
        ), Observations AS (
          SELECT 'presence' AS Name,CASE WHEN EXISTS(SELECT 1 FROM Marker) THEN 0 ELSE 1 END AS Status
          UNION ALL
          SELECT 'columns',CASE WHEN EXISTS(SELECT 1 FROM Marker T
            WHERE (SELECT COUNT(*) FROM sys.columns WHERE object_id=T.object_id)=5
            AND NOT EXISTS(SELECT 1 FROM Expected E LEFT JOIN sys.columns C ON C.object_id=T.object_id
              AND C.name=E.Col COLLATE Latin1_General_100_BIN2 AND DATALENGTH(C.name)=DATALENGTH(CONVERT(nvarchar(128),E.Col))
              LEFT JOIN sys.types Y ON Y.user_type_id=C.user_type_id
              WHERE C.column_id IS NULL OR Y.name IS NULL OR Y.name<>E.Typ OR Y.is_user_defined<>0
                OR C.max_length<>E.Len OR C.is_nullable<>E.Nullable OR C.precision<>E.Prec OR C.scale<>E.Scale
                OR C.is_identity<>0 OR C.is_computed<>0 OR C.generated_always_type<>0 OR C.is_hidden<>0 OR C.encryption_type IS NOT NULL
                OR C.is_sparse<>0 OR C.is_column_set<>0 OR C.is_filestream<>0 OR C.default_object_id<>0
                OR (E.CollationName<>'' AND (C.collation_name IS NULL OR C.collation_name<>E.CollationName)))) THEN 0 ELSE 1 END
          UNION ALL
          SELECT 'key',CASE WHEN EXISTS(SELECT 1 FROM Marker T JOIN sys.indexes I ON I.object_id=T.object_id
            WHERE I.is_primary_key=1 AND I.is_unique=1 AND I.is_disabled=0 AND I.has_filter=0 AND I.is_hypothetical=0
              AND I.ignore_dup_key=0 AND I.type IN (1,2)
              AND (SELECT COUNT(*) FROM sys.index_columns K WHERE K.object_id=I.object_id AND K.index_id=I.index_id AND K.key_ordinal>0)=1
              AND EXISTS(SELECT 1 FROM sys.index_columns K JOIN sys.columns C ON C.object_id=K.object_id AND C.column_id=K.column_id
                WHERE K.object_id=I.object_id AND K.index_id=I.index_id AND K.key_ordinal=1 AND K.is_descending_key=0 AND K.is_included_column=0
                  AND C.name=N'SingletonId' COLLATE Latin1_General_100_BIN2 AND DATALENGTH(C.name)=DATALENGTH(N'SingletonId'))) THEN 0 ELSE 1 END
          UNION ALL
          SELECT 'table_features',CASE WHEN EXISTS(SELECT 1 FROM Marker T WHERE T.is_ms_shipped=0
            AND T.is_memory_optimized=0 AND T.durability=0 AND T.temporal_type=0 AND T.is_filetable=0
            AND NOT EXISTS(SELECT 1 FROM sys.triggers WHERE parent_id=T.object_id)
            AND NOT EXISTS(SELECT 1 FROM sys.security_predicates WHERE target_object_id=T.object_id)
            AND NOT EXISTS(SELECT 1 FROM sys.columns WHERE object_id=T.object_id AND rule_object_id<>0)
            AND NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=T.object_id AND (is_disabled=1 OR is_hypothetical=1))
            AND NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id=T.object_id OR referenced_object_id=T.object_id)
            AND NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=T.object_id AND is_unique=1 AND is_primary_key=0)
            AND (SELECT COUNT(*) FROM sys.check_constraints WHERE parent_object_id=T.object_id)=1
            AND (SELECT COUNT(*) FROM sys.default_constraints WHERE parent_object_id=T.object_id)=0) THEN 0 ELSE 1 END
        )
        SELECT Name,CONVERT(int,CASE WHEN USER_ID()=1 OR IS_SRVROLEMEMBER('sysadmin')=1 THEN Status ELSE 2 END)
        FROM Observations ORDER BY Name OPTION(MAXDOP 1);
        """;
    public const string InboundMarkerDefinition = """
        SELECT LEFT(C.definition,16385),CONVERT(int,CASE
          WHEN NOT (USER_ID()=1 OR COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)=1) THEN 2
          WHEN C.object_id IS NULL THEN 1 WHEN C.definition IS NULL THEN 2
          WHEN C.is_disabled<>0 OR C.is_not_trusted<>0 OR C.is_not_for_replication<>0 THEN 1 ELSE 0 END)
        FROM (VALUES(1)) E(Id) LEFT JOIN sys.schemas S ON S.name=N'dbo' COLLATE Latin1_General_100_BIN2 AND DATALENGTH(S.name)=6
        LEFT JOIN sys.tables T ON T.schema_id=S.schema_id AND T.name=N'WebInboundRequestCommandBindingV1' COLLATE Latin1_General_100_BIN2
          AND DATALENGTH(T.name)=DATALENGTH(N'WebInboundRequestCommandBindingV1')
        LEFT JOIN sys.check_constraints C ON C.parent_object_id=T.object_id AND C.name=N'CK_WebInboundBinding_Identity' COLLATE Latin1_General_100_BIN2
          AND DATALENGTH(C.name)=DATALENGTH(N'CK_WebInboundBinding_Identity') OPTION(MAXDOP 1);
        """;
    // Same bounded marker projection as I46, without its transaction lock hint.
    // Never return these local values in InspectionReport or treat them as expected identity.
    public const string InboundBindingRows = """
        SELECT TOP(2) SingletonId,SchemaVersion,DatabaseBindingId,TenantId,CompanyId
        FROM dbo.WebInboundRequestCommandBindingV1 OPTION(MAXDOP 1);
        """;
    public static readonly string[] InboundEnvironmentChecks =
        ["online", "writable", "delayed_durability_off", "non_system_database", "implicit_transactions_off", "metadata_principal", "database_triggers"];
    public static readonly string[] InboundMarkerChecks = ["presence", "columns", "key", "table_features"];
    public static readonly string[] Tables =
    [
        "MedcomPurchaseRequestCommandJournal",
        "MedcomPurchaseRequestCommandSchema",
        "AP_PurchaseRequestTbl",
        "AP_PurchaseRequestDetailTbl",
        "IV_InboundRequestLogTbl",
        "IV_InboundRequestNoSuitableTbl",
        "IV_InboundRequestDetailsTbl",
        "IV_InboundRequestTbl",
        "IV_InboundRequestCTCPTbl",
        "WebInboundRequestCommandJournalV1"
    ];
}
