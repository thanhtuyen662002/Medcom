using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Application.Inbound;
using Medcom.Contracts.Inbound;

namespace Medcom.Infrastructure.Inbound;

// Fixed source-derived plans. No payload/configuration may supply SQL, tables or columns.
public static class InboundDraftSql
{
    public const string JournalTable = "dbo.WebInboundRequestCommandJournalV1";
    public const string ProbeText = """
        /* inbound:probe */
        SELECT TOP (0) DatabaseBindingId,TenantId,CompanyId,Actor,OperationId,IntentHash,
          Action,AttemptId,State,BranchId,DocumentId,BeforeState,AfterState,StatusAfter,AuditId,CommittedAtUtc
        FROM dbo.WebInboundRequestCommandJournalV1;
        """;
    public const string SnapshotText = """
        /* inbound:snapshot */
        SELECT TOP (2) * FROM dbo.IV_InboundRequestTbl WITH (UPDLOCK,HOLDLOCK) WHERE DocumentID=@document;
        SELECT TOP (501) * FROM dbo.IV_InboundRequestDetailsTbl WITH (UPDLOCK,HOLDLOCK) WHERE DocumentID=@document ORDER BY UserAutoID;
        SELECT TOP (501) * FROM dbo.IV_InboundRequestCTCPTbl WITH (UPDLOCK,HOLDLOCK) WHERE DocumentID=@document ORDER BY UserAutoID;
        SELECT TOP (501) * FROM dbo.IV_InboundRequestNoSuitableTbl WITH (UPDLOCK,HOLDLOCK) WHERE DocumentID=@document ORDER BY UserAutoID;
        SELECT TOP (501) * FROM dbo.IV_InboundRequestLogTbl WITH (UPDLOCK,HOLDLOCK) WHERE DocumentID=@document ORDER BY UserAutoID;
        """;
    public const string BranchText = """
        /* inbound:branch */
        SELECT TOP (2) DocumentID,BranchID FROM dbo.IV_InboundRequestTbl WITH (UPDLOCK,HOLDLOCK) WHERE DocumentID=@document;
        """;
    public const string LookupText = """
        /* inbound:lookup */
        SELECT DatabaseBindingId,TenantId,CompanyId,Actor,OperationId,IntentHash,Action,
          AttemptId,State,BranchId,DocumentId,BeforeState,AfterState,StatusAfter,AuditId,CommittedAtUtc
        FROM dbo.WebInboundRequestCommandJournalV1 WITH (UPDLOCK,HOLDLOCK)
        WHERE DatabaseBindingId=@binding AND TenantId=@tenant AND CompanyId=@company AND Actor=@actor AND OperationId=@operation;
        """;
    // Convert to Unicode BEFORE applying the binary collation, avoiding lossy varchar
    // code-page conversion. DATALENGTH also rejects SQL's padded trailing-space aliases.
    public const string AuthorityUserText = """
        /* inbound:user */
        SELECT TOP (2) U.UserName,U.[Password],U.[Disable],U.UserGroupID,G.IsDisable,G.UserGroupID
        FROM dbo.SY_User U WITH (UPDLOCK,HOLDLOCK)
        LEFT JOIN dbo.SY_UserGroup G WITH (UPDLOCK,HOLDLOCK)
          ON CONVERT(nvarchar(max),G.UserGroupID) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),U.UserGroupID) COLLATE Latin1_General_100_BIN2
          AND DATALENGTH(CONVERT(nvarchar(max),G.UserGroupID))=DATALENGTH(CONVERT(nvarchar(max),U.UserGroupID))
        WHERE U.UserName=@actor
          AND CONVERT(nvarchar(max),U.UserName) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),@actor) COLLATE Latin1_General_100_BIN2
          AND DATALENGTH(CONVERT(nvarchar(max),U.UserName))=DATALENGTH(CONVERT(nvarchar(max),@actor));
        """;
    public const string AuthorityGrantsText = """
        /* inbound:grants */
        WITH Grants AS (
          SELECT P.MenuID,P.IsRun,P.IsAdd,P.IsUpdate FROM dbo.SY_UserGroupPermisstion P
          WHERE P.UserGroupID=@group
            AND CONVERT(nvarchar(max),P.UserGroupID) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),@group) COLLATE Latin1_General_100_BIN2
            AND DATALENGTH(CONVERT(nvarchar(max),P.UserGroupID))=DATALENGTH(CONVERT(nvarchar(max),@group))
          UNION ALL
          SELECT P.MenuID,P.IsRun,P.IsAdd,P.IsUpdate FROM dbo.SY_UserPermisstion P
          WHERE P.UserName=@username
            AND CONVERT(nvarchar(max),P.UserName) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),@username) COLLATE Latin1_General_100_BIN2
            AND DATALENGTH(CONVERT(nvarchar(max),P.UserName))=DATALENGTH(CONVERT(nvarchar(max),@username))
          UNION ALL
          SELECT P.MenuID,P.IsRun,P.IsAdd,P.IsUpdate FROM dbo.SY_UserGroupPermisstion P
          JOIN dbo.SY_User U
            ON CONVERT(nvarchar(max),U.UserGroupID) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),P.UserGroupID) COLLATE Latin1_General_100_BIN2
            AND DATALENGTH(CONVERT(nvarchar(max),U.UserGroupID))=DATALENGTH(CONVERT(nvarchar(max),P.UserGroupID))
          JOIN dbo.SY_UserGroup G
            ON CONVERT(nvarchar(max),G.UserGroupID) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),U.UserGroupID) COLLATE Latin1_General_100_BIN2
            AND DATALENGTH(CONVERT(nvarchar(max),G.UserGroupID))=DATALENGTH(CONVERT(nvarchar(max),U.UserGroupID))
          WHERE U.UserAuthority=@username
            AND CONVERT(nvarchar(max),U.UserAuthority) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),@username) COLLATE Latin1_General_100_BIN2
            AND DATALENGTH(CONVERT(nvarchar(max),U.UserAuthority))=DATALENGTH(CONVERT(nvarchar(max),@username))
            AND U.[Disable]=0 AND G.IsDisable=0
        )
        SELECT TOP (2) M.MenuID,M.FormName,M.Para,M.isDisable,
          COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 AND ((@create=1 AND P.IsAdd=1) OR (@create=0 AND P.IsUpdate=1))
            THEN 1 ELSE 0 END) FROM Grants P
            WHERE CONVERT(nvarchar(max),P.MenuID) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),M.MenuID) COLLATE Latin1_General_100_BIN2
              AND DATALENGTH(CONVERT(nvarchar(max),P.MenuID))=DATALENGTH(CONVERT(nvarchar(max),M.MenuID))),0) AS Granted
        FROM dbo.SY_Menu M WITH (UPDLOCK,HOLDLOCK) WHERE M.MenuID=@menu;
        """;
    public const string AuthorityBranchesText = """
        /* inbound:branches */
        SELECT DISTINCT TOP (201) BranchID FROM (
          SELECT U.BranchID FROM dbo.SY_User U
          WHERE U.UserName=@actor
            AND CONVERT(nvarchar(max),U.UserName) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),@actor) COLLATE Latin1_General_100_BIN2
            AND DATALENGTH(CONVERT(nvarchar(max),U.UserName))=DATALENGTH(CONVERT(nvarchar(max),@actor))
          UNION ALL SELECT B.BranchID FROM dbo.SY_UserBranch B
          WHERE B.UserName=@actor
            AND CONVERT(nvarchar(max),B.UserName) COLLATE Latin1_General_100_BIN2=CONVERT(nvarchar(max),@actor) COLLATE Latin1_General_100_BIN2
            AND DATALENGTH(CONVERT(nvarchar(max),B.UserName))=DATALENGTH(CONVERT(nvarchar(max),@actor))
        ) S WHERE BranchID IS NOT NULL AND BranchID<>'';
        """;

    public static DbCommand Command(DbTransaction transaction, string fixedText)
    {
        var connection = transaction.Connection ?? throw new InvalidOperationException("Transaction unavailable.");
        var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandTimeout = 15;
        command.CommandText = fixedText;
        return command;
    }
    public static void Add(DbCommand command, string name, DbType type, object? value,
        int size = 0, byte precision = 0, byte scale = 0)
    {
        var p = command.CreateParameter();
        p.ParameterName = name; p.DbType = type; p.Value = value ?? DBNull.Value;
        p.Size = size; p.Precision = precision; p.Scale = scale;
        command.Parameters.Add(p);
    }
    public static DbCommand Document(DbTransaction transaction, string text, string document)
    {
        var c = Command(transaction, text); Add(c, "@document", DbType.AnsiString, document, 50); return c;
    }
    public static DbCommand Journal(DbTransaction transaction, string text, Guid binding,
        AuthoritativeIdentity identity, Guid operation)
    {
        var c = Command(transaction, text);
        Add(c, "@binding", DbType.Guid, binding); Add(c, "@tenant", DbType.String, identity.TenantId, 100);
        Add(c, "@company", DbType.String, identity.CompanyId, 100); Add(c, "@actor", DbType.AnsiString, identity.PrincipalId, 50);
        Add(c, "@operation", DbType.Guid, operation); return c;
    }
    public static DbCommand Reserve(DbTransaction transaction, Guid binding, AuthoritativeIdentity identity,
        InboundDraftCommand request, byte[] intentHash, Guid attempt, string branch)
    {
        var c = Journal(transaction, """
            /* inbound:reserve */
            INSERT dbo.WebInboundRequestCommandJournalV1
              (DatabaseBindingId,TenantId,CompanyId,Actor,OperationId,IntentHash,Action,AttemptId,State,BranchId,DocumentId)
            VALUES (@binding,@tenant,@company,@actor,@operation,@intent,@action,@attempt,0,@branch,@document);
            """, binding, identity, request.OperationId);
        Add(c,"@intent",DbType.Binary,intentHash,32); Add(c,"@action",DbType.AnsiString,request.Action.ToString(),32);
        Add(c,"@attempt",DbType.Guid,attempt); Add(c,"@branch",DbType.AnsiString,branch,50);
        Add(c,"@document",DbType.AnsiString,request.DocumentId,50); return c;
    }
    public static DbCommand CommitRecord(DbTransaction transaction, Guid binding, AuthoritativeIdentity identity,
        InboundDraftCommand request, byte[] intentHash, Guid attempt, string branch, string document,
        string beforeState, string afterState, int status, Guid audit)
    {
        var c = Journal(transaction, """
            /* inbound:record */
            UPDATE dbo.WebInboundRequestCommandJournalV1 SET State=1,BranchId=@branch,DocumentId=@document,
              BeforeState=@before,AfterState=@after,StatusAfter=@status,AuditId=@audit,CommittedAtUtc=SYSUTCDATETIME()
            WHERE DatabaseBindingId=@binding AND TenantId=@tenant AND CompanyId=@company AND Actor=@actor
              AND OperationId=@operation AND State=0 AND AttemptId=@attempt AND IntentHash=@intent;
            """, binding, identity, request.OperationId);
        Add(c,"@intent",DbType.Binary,intentHash,32); Add(c,"@attempt",DbType.Guid,attempt);
        Add(c,"@branch",DbType.AnsiString,branch,50); Add(c,"@document",DbType.AnsiString,document,50);
        Add(c,"@before",DbType.AnsiStringFixedLength,beforeState,64); Add(c,"@after",DbType.AnsiStringFixedLength,afterState,64);
        Add(c,"@status",DbType.Int32,status); Add(c,"@audit",DbType.Guid,audit); return c;
    }
    public static DbCommand Header(DbTransaction transaction, string document, InboundDraftHeader h, bool create)
    {
        var c = Document(transaction, create ? """
            /* inbound:create */
            INSERT dbo.IV_InboundRequestTbl
              (DocumentID,DocumentDate,OrderNumber,InvoiceNo,DeparturePoint,DestinationPoint,OrderTypeID,
               BranchID,ObjectID,CurrencyID,RateExchange,Notes,StatusID)
            VALUES (@document,@date,@order,@invoice,@departure,@destination,@type,@branch,@object,@currency,@rate,@notes,0);
            """ : """
            /* inbound:header */
            UPDATE dbo.IV_InboundRequestTbl SET DocumentDate=@date,OrderNumber=@order,InvoiceNo=@invoice,
              DeparturePoint=@departure,DestinationPoint=@destination,OrderTypeID=@type,ObjectID=@object,
              CurrencyID=@currency,RateExchange=@rate,Notes=@notes
            WHERE DocumentID=@document AND BranchID=@branch AND StatusID IN (0,1);
            """, document);
        Add(c,"@date",DbType.DateTime,h.DocumentDate); Add(c,"@order",DbType.String,h.OrderNumber,50);
        Add(c,"@invoice",DbType.String,h.InvoiceNo,50); Add(c,"@departure",DbType.String,h.DeparturePoint,100);
        Add(c,"@destination",DbType.String,h.DestinationPoint,100); Add(c,"@type",DbType.String,h.OrderTypeId,50);
        Add(c,"@branch",DbType.AnsiString,h.BranchId,50); Add(c,"@object",DbType.AnsiString,h.ObjectId,50);
        Add(c,"@currency",DbType.AnsiString,h.CurrencyId,3); Add(c,"@rate",DbType.Decimal,h.RateExchange,0,28,10);
        Add(c,"@notes",DbType.String,h.Notes,500); return c;
    }
    public static DbCommand Detail(DbTransaction transaction, string document, string rowId,
        InboundDraftDetailUpsert d, decimal? rate, bool create)
    {
        var c = Document(transaction, create ? """
            /* inbound:detail-insert */
            INSERT dbo.IV_InboundRequestDetailsTbl
              (UserAutoID,DocumentID,ItemID,LotNumberByDocument,SetQuantityByDocument,BarrelQuantityByDocument,
               ExpireDateByDocument,UnitPrice,SourceAmount,Amount)
            VALUES (@row,@document,@item,@lot,@set,@barrel,@expiry,@price,
              CAST(@set*@price AS decimal(18,0)),CAST((@set*@price)*@rate AS decimal(18,0)));
            """ : """
            /* inbound:detail-update */
            UPDATE dbo.IV_InboundRequestDetailsTbl SET ItemID=@item,LotNumberByDocument=@lot,
              SetQuantityByDocument=@set,BarrelQuantityByDocument=@barrel,ExpireDateByDocument=@expiry,
              UnitPrice=@price,
              SourceAmount=CASE WHEN (SetQuantityByDocument=@set OR (SetQuantityByDocument IS NULL AND @set IS NULL))
                AND (UnitPrice=@price OR (UnitPrice IS NULL AND @price IS NULL)) THEN SourceAmount
                ELSE CAST(@set*@price AS decimal(18,0)) END,
              Amount=CASE WHEN (SetQuantityByDocument=@set OR (SetQuantityByDocument IS NULL AND @set IS NULL))
                AND (UnitPrice=@price OR (UnitPrice IS NULL AND @price IS NULL)) THEN Amount
                ELSE CAST((@set*@price)*@rate AS decimal(18,0)) END WHERE UserAutoID=@row AND DocumentID=@document;
            """, document);
        Add(c,"@row",DbType.AnsiString,rowId,50); Add(c,"@item",DbType.AnsiString,d.ItemId,50);
        Add(c,"@lot",DbType.String,d.LotNumberByDocument,50); Add(c,"@set",DbType.Decimal,d.SetQuantityByDocument,0,18,0);
        Add(c,"@barrel",DbType.Decimal,d.BarrelQuantityByDocument,0,18,0); Add(c,"@expiry",DbType.DateTime,d.ExpireDateByDocument);
        Add(c,"@price",DbType.Decimal,d.UnitPrice,0,18,0); Add(c,"@rate",DbType.Decimal,rate,0,28,10); return c;
    }
    // Fixed mathematical dependencies observed in Detail expressions; never evaluates metadata.
    public static DbCommand RecalculateAmounts(DbTransaction transaction, string document, decimal? rate)
    {
        var c=Document(transaction,"""
            /* inbound:amounts */
            UPDATE dbo.IV_InboundRequestDetailsTbl SET Amount=CAST((SetQuantityByDocument*UnitPrice)*@rate AS decimal(18,0))
            WHERE DocumentID=@document;
            """,document); Add(c,"@rate",DbType.Decimal,rate,0,28,10); return c;
    }
    public static DbCommand RemoveDetail(DbTransaction transaction, string document, string row)
    {
        var c=Document(transaction,"""
            /* inbound:detail-delete */
            DELETE dbo.IV_InboundRequestDetailsTbl WHERE UserAutoID=@row AND DocumentID=@document;
            """,document); Add(c,"@row",DbType.AnsiString,row,50); return c;
    }
    public static DbCommand Send(DbTransaction transaction, string document, string branch)
    {
        var c=Document(transaction,"""
            /* inbound:send */
            UPDATE dbo.IV_InboundRequestTbl SET StatusID=2
            WHERE DocumentID=@document AND BranchID=@branch AND StatusID IN (0,1);
            """,document); Add(c,"@branch",DbType.AnsiString,branch,50); return c;
    }
    public static DbCommand LegacyLog(DbTransaction transaction, string document, string actor, string? note)
    {
        var c=Document(transaction,"""
            /* inbound:legacy-log */
            INSERT dbo.IV_InboundRequestLogTbl (DocumentID,UserName,StatusID,Notes) VALUES (@document,@actor,2,@note);
            """,document); Add(c,"@actor",DbType.AnsiString,actor,50); Add(c,"@note",DbType.String,note,200); return c;
    }
}
