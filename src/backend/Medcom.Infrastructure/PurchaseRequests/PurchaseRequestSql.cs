using System.Data;
using System.Data.Common;
using System.Globalization;
using Medcom.Application.PurchaseRequests;
using Medcom.Contracts;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure.PurchaseRequests;

// New fixed Web SQL, not exported owner SQL bodies. No metadata SQL or table selector.
public static class PurchaseRequestSql
{
    public const string TransactionText = "SELECT @@TRANCOUNT AS TransactionCount,XACT_STATE() AS TransactionState;";
    public const string ProbeText = """
        SELECT M.SchemaVersion,M.DatabaseBindingId,
          CONVERT(int,CASE WHEN D.state=0 AND D.is_read_only=0 AND D.delayed_durability=0 THEN 1 ELSE 0 END) AS Durable,
          CONVERT(int,CASE WHEN
            (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.MedcomPurchaseRequestCommandJournal'))=9
            AND (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.MedcomPurchaseRequestCommandSchema'))=3
            AND (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.AP_PurchaseRequestTbl'))=14
            AND (SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.AP_PurchaseRequestDetailTbl'))=9
            AND NOT EXISTS (
              SELECT 1 FROM (VALUES
                ('MedcomPurchaseRequestCommandJournal','DatabaseBindingId','uniqueidentifier',16,0,0,0),
                ('MedcomPurchaseRequestCommandJournal','SlotHash','binary',32,0,0,0),
                ('MedcomPurchaseRequestCommandJournal','KeyBytes','varbinary',-1,0,0,0),
                ('MedcomPurchaseRequestCommandJournal','IntentBytes','varbinary',-1,0,0,0),
                ('MedcomPurchaseRequestCommandJournal','AttemptId','uniqueidentifier',16,0,0,0),
                ('MedcomPurchaseRequestCommandJournal','State','tinyint',1,0,3,0),
                ('MedcomPurchaseRequestCommandJournal','DocumentId','nvarchar',100,1,0,0),
                ('MedcomPurchaseRequestCommandJournal','ReceiptJson','nvarchar',-1,1,0,0),
                ('MedcomPurchaseRequestCommandJournal','AggregateBytes','varbinary',-1,1,0,0),
                ('MedcomPurchaseRequestCommandSchema','SingletonId','tinyint',1,0,3,0),
                ('MedcomPurchaseRequestCommandSchema','SchemaVersion','int',4,0,10,0),
                ('MedcomPurchaseRequestCommandSchema','DatabaseBindingId','uniqueidentifier',16,0,0,0),
                ('AP_PurchaseRequestTbl','PurchaseRequestID','nvarchar',100,0,0,0),
                ('AP_PurchaseRequestTbl','PurchaseDate','datetime',8,1,23,3),
                ('AP_PurchaseRequestTbl','PurposeID','int',4,1,10,0),
                ('AP_PurchaseRequestTbl','PersonSuggest','nvarchar',1000,0,0,0),
                ('AP_PurchaseRequestTbl','Department','nvarchar',200,0,0,0),
                ('AP_PurchaseRequestTbl','PurposeDescOrClient','nvarchar',-1,1,0,0),
                ('AP_PurchaseRequestTbl','Price','decimal',9,1,18,2),
                ('AP_PurchaseRequestTbl','Notes','nvarchar',-1,1,0,0),
                ('AP_PurchaseRequestTbl','StatusID','int',4,0,10,0),
                ('AP_PurchaseRequestTbl','isLock','bit',1,1,1,0),
                ('AP_PurchaseRequestTbl','CurrencyID','varchar',3,0,0,0),
                ('AP_PurchaseRequestTbl','ObjectID','varchar',100,0,0,0),
                ('AP_PurchaseRequestTbl','RateExchange','float',8,0,53,0),
                ('AP_PurchaseRequestTbl','BranchID','varchar',50,0,0,0),
                ('AP_PurchaseRequestDetailTbl','UserAutoID','varchar',50,0,0,0),
                ('AP_PurchaseRequestDetailTbl','ItemID','varchar',50,0,0,0),
                ('AP_PurchaseRequestDetailTbl','Budget','decimal',9,1,18,0),
                ('AP_PurchaseRequestDetailTbl','TimeRequired','nvarchar',400,1,0,0),
                ('AP_PurchaseRequestDetailTbl','Quantity','decimal',9,0,18,0),
                ('AP_PurchaseRequestDetailTbl','UnitPrice','decimal',9,0,18,0),
                ('AP_PurchaseRequestDetailTbl','TotalPrice','decimal',9,1,18,0),
                ('AP_PurchaseRequestDetailTbl','Model','varchar',50,1,0,0),
                ('AP_PurchaseRequestDetailTbl','PurchaseRequestID','nvarchar',100,1,0,0)
              ) E(Tbl,Col,Typ,Len,Nullable,PrecisionValue,ScaleValue)
              LEFT JOIN sys.columns C ON C.object_id=OBJECT_ID('dbo.'+E.Tbl,'U') AND C.name=E.Col
              LEFT JOIN sys.types T ON T.user_type_id=C.user_type_id
              WHERE C.column_id IS NULL OR T.name<>E.Typ OR T.is_user_defined<>0 OR C.max_length<>E.Len
                OR C.is_nullable<>E.Nullable OR C.is_identity<>0 OR C.is_computed<>0
                OR C.precision<>E.PrecisionValue OR C.scale<>E.ScaleValue)
            AND EXISTS(SELECT 1 FROM sys.indexes I WHERE I.object_id=OBJECT_ID('dbo.MedcomPurchaseRequestCommandJournal')
              AND I.name='PK_MedcomPurchaseRequestCommandJournal' AND I.is_unique=1 AND I.is_primary_key=1
              AND I.is_disabled=0 AND I.has_filter=0
              AND (SELECT COUNT(*) FROM sys.index_columns X WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal>0)=2
              AND EXISTS(SELECT 1 FROM sys.index_columns X JOIN sys.columns C ON C.object_id=X.object_id AND C.column_id=X.column_id
                WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal=1 AND C.name='DatabaseBindingId')
              AND EXISTS(SELECT 1 FROM sys.index_columns X JOIN sys.columns C ON C.object_id=X.object_id AND C.column_id=X.column_id
                WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal=2 AND C.name='SlotHash'))
            AND NOT EXISTS(SELECT 1 FROM (VALUES
              ('MedcomPurchaseRequestCommandSchema','SingletonId'),
              ('AP_PurchaseRequestTbl','PurchaseRequestID'),('AP_PurchaseRequestDetailTbl','UserAutoID')) E(Tbl,Col)
              WHERE NOT EXISTS(SELECT 1 FROM sys.indexes I
                WHERE I.object_id=OBJECT_ID('dbo.'+E.Tbl,'U') AND I.is_primary_key=1 AND I.is_unique=1
                  AND I.is_disabled=0 AND I.has_filter=0
                  AND (SELECT COUNT(*) FROM sys.index_columns X WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal>0)=1
                  AND EXISTS(SELECT 1 FROM sys.index_columns X JOIN sys.columns C ON C.object_id=X.object_id AND C.column_id=X.column_id
                    WHERE X.object_id=I.object_id AND X.index_id=I.index_id AND X.key_ordinal=1 AND C.name=E.Col)))
            AND NOT EXISTS(SELECT 1 FROM (VALUES
              ('MedcomPurchaseRequestCommandSchema','CK_MedcomPurchaseRequestCommandSchema'),
              ('MedcomPurchaseRequestCommandJournal','CK_MedcomPurchaseRequestCommandJournal')) E(Tbl,ConstraintName)
              WHERE NOT EXISTS(SELECT 1 FROM sys.check_constraints C WHERE C.parent_object_id=OBJECT_ID('dbo.'+E.Tbl,'U')
                AND C.name=E.ConstraintName AND C.is_disabled=0 AND C.is_not_trusted=0))
            AND EXISTS(SELECT 1 FROM sys.foreign_keys F JOIN sys.foreign_key_columns X ON X.constraint_object_id=F.object_id
              JOIN sys.columns C ON C.object_id=X.parent_object_id AND C.column_id=X.parent_column_id
              JOIN sys.columns R ON R.object_id=X.referenced_object_id AND R.column_id=X.referenced_column_id
              WHERE F.parent_object_id=OBJECT_ID('dbo.AP_PurchaseRequestDetailTbl','U')
                AND F.referenced_object_id=OBJECT_ID('dbo.AP_PurchaseRequestTbl','U')
                AND F.is_disabled=0 AND F.is_not_trusted=0 AND C.name='PurchaseRequestID' AND R.name='PurchaseRequestID'
                AND (SELECT COUNT(*) FROM sys.foreign_key_columns Y WHERE Y.constraint_object_id=F.object_id)=1)
            AND NOT EXISTS(SELECT 1 FROM sys.triggers WHERE parent_id IN
              (OBJECT_ID('dbo.MedcomPurchaseRequestCommandJournal'),OBJECT_ID('dbo.MedcomPurchaseRequestCommandSchema'),
               OBJECT_ID('dbo.AP_PurchaseRequestTbl'),OBJECT_ID('dbo.AP_PurchaseRequestDetailTbl')) AND is_disabled=0)
            THEN 1 ELSE 0 END) AS ShapeOk
        FROM dbo.MedcomPurchaseRequestCommandSchema M WITH (UPDLOCK,HOLDLOCK)
        JOIN sys.databases D ON D.database_id=DB_ID() WHERE M.SingletonId=1;
        """;
    public const string CredentialText = """
        SELECT TOP (2) U.UserName,U.[Password],U.[Disable],U.UserGroupID,G.IsDisable
        FROM dbo.SY_User U WITH (UPDLOCK,HOLDLOCK)
        LEFT JOIN dbo.SY_UserGroup G WITH (UPDLOCK,HOLDLOCK)
          ON DATALENGTH(CONVERT(nvarchar(max),G.UserGroupID))=DATALENGTH(CONVERT(nvarchar(max),U.UserGroupID))
          AND CONVERT(varbinary(max),CONVERT(nvarchar(max),G.UserGroupID))=CONVERT(varbinary(max),CONVERT(nvarchar(max),U.UserGroupID))
        WHERE DATALENGTH(CONVERT(nvarchar(max),U.UserName))=DATALENGTH(@actor)
          AND CONVERT(varbinary(max),CONVERT(nvarchar(max),U.UserName))=CONVERT(varbinary(max),@actor);
        """;
    // I14-local policy retains the source's three grant routes, bound to physical
    // Unicode principal/menu bytes. SQL collation aliases and binary zero padding
    // must not borrow another actor/group/delegation's rights. No shared policy edit.
    public static readonly string GrantsText = """
        WITH Grants AS (
          SELECT P.MenuID,P.IsRun,P.IsAdd,P.IsUpdate
          FROM dbo.SY_UserGroupPermisstion P WITH (UPDLOCK,HOLDLOCK)
          WHERE DATALENGTH(CONVERT(nvarchar(max),P.UserGroupID))=DATALENGTH(@group)
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),P.UserGroupID))=CONVERT(varbinary(max),@group)
          UNION ALL
          SELECT P.MenuID,P.IsRun,P.IsAdd,P.IsUpdate
          FROM dbo.SY_UserPermisstion P WITH (UPDLOCK,HOLDLOCK)
          WHERE DATALENGTH(CONVERT(nvarchar(max),P.UserName))=DATALENGTH(@username)
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),P.UserName))=CONVERT(varbinary(max),@username)
          UNION ALL
          SELECT P.MenuID,P.IsRun,P.IsAdd,P.IsUpdate
          FROM dbo.SY_UserGroupPermisstion P WITH (UPDLOCK,HOLDLOCK)
          JOIN dbo.SY_User U WITH (UPDLOCK,HOLDLOCK)
            ON DATALENGTH(CONVERT(nvarchar(max),U.UserGroupID))=DATALENGTH(CONVERT(nvarchar(max),P.UserGroupID))
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),U.UserGroupID))=CONVERT(varbinary(max),CONVERT(nvarchar(max),P.UserGroupID))
          JOIN dbo.SY_UserGroup G WITH (UPDLOCK,HOLDLOCK)
            ON DATALENGTH(CONVERT(nvarchar(max),G.UserGroupID))=DATALENGTH(CONVERT(nvarchar(max),U.UserGroupID))
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),G.UserGroupID))=CONVERT(varbinary(max),CONVERT(nvarchar(max),U.UserGroupID))
          WHERE DATALENGTH(CONVERT(nvarchar(max),U.UserAuthority))=DATALENGTH(@username)
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),U.UserAuthority))=CONVERT(varbinary(max),@username)
            AND U.[Disable]=0 AND G.IsDisable=0
        )
        SELECT TOP (2) M.MenuID,M.FormName,M.Para,M.isDisable,M.Parent,P.isDisable AS ParentDisabled,
          COALESCE((SELECT MAX(CASE WHEN G.IsRun=1 AND G.IsAdd=1 THEN 1 ELSE 0 END) FROM Grants G
            WHERE DATALENGTH(CONVERT(nvarchar(max),G.MenuID))=DATALENGTH(CONVERT(nvarchar(max),M.MenuID))
              AND CONVERT(varbinary(max),CONVERT(nvarchar(max),G.MenuID))=CONVERT(varbinary(max),CONVERT(nvarchar(max),M.MenuID))),0) AS CanAdd,
          COALESCE((SELECT MAX(CASE WHEN G.IsRun=1 AND G.IsUpdate=1 THEN 1 ELSE 0 END) FROM Grants G
            WHERE DATALENGTH(CONVERT(nvarchar(max),G.MenuID))=DATALENGTH(CONVERT(nvarchar(max),M.MenuID))
              AND CONVERT(varbinary(max),CONVERT(nvarchar(max),G.MenuID))=CONVERT(varbinary(max),CONVERT(nvarchar(max),M.MenuID))),0) AS CanUpdate
        FROM dbo.SY_Menu M WITH (UPDLOCK,HOLDLOCK)
        LEFT JOIN dbo.SY_Menu P WITH (UPDLOCK,HOLDLOCK)
          ON DATALENGTH(CONVERT(nvarchar(max),P.MenuID))=DATALENGTH(CONVERT(nvarchar(max),M.Parent))
          AND CONVERT(varbinary(max),CONVERT(nvarchar(max),P.MenuID))=CONVERT(varbinary(max),CONVERT(nvarchar(max),M.Parent))
        WHERE DATALENGTH(CONVERT(nvarchar(max),M.MenuID))=DATALENGTH(@menu)
          AND CONVERT(varbinary(max),CONVERT(nvarchar(max),M.MenuID))=CONVERT(varbinary(max),@menu);
        """;
    public const string BranchesText = """
        SELECT DISTINCT TOP (201) BranchID FROM (
          SELECT BranchID FROM dbo.SY_User WHERE DATALENGTH(CONVERT(nvarchar(max),UserName))=DATALENGTH(@actor)
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),UserName))=CONVERT(varbinary(max),@actor)
          UNION ALL SELECT BranchID FROM dbo.SY_UserBranch WHERE DATALENGTH(CONVERT(nvarchar(max),UserName))=DATALENGTH(@actor)
            AND CONVERT(varbinary(max),CONVERT(nvarchar(max),UserName))=CONVERT(varbinary(max),@actor)
        ) B WHERE BranchID IS NOT NULL AND BranchID<>'';
        """;
    public const string LookupText = """
        SELECT TOP (2) DatabaseBindingId,SlotHash,KeyBytes,IntentBytes,AttemptId,State,DocumentId,ReceiptJson,AggregateBytes
        FROM dbo.MedcomPurchaseRequestCommandJournal WITH (UPDLOCK,HOLDLOCK,INDEX(PK_MedcomPurchaseRequestCommandJournal))
        WHERE DatabaseBindingId=@binding AND SlotHash=@slot;
        """;
    public const string ReserveText = """
        INSERT dbo.MedcomPurchaseRequestCommandJournal(DatabaseBindingId,SlotHash,KeyBytes,IntentBytes,AttemptId,State)
        VALUES(@binding,@slot,@keyBytes,@intentBytes,@attempt,0);
        """;
    public const string CompleteText = """
        UPDATE dbo.MedcomPurchaseRequestCommandJournal SET State=1,DocumentId=@document,ReceiptJson=@receipt,AggregateBytes=@aggregate
        WHERE DatabaseBindingId=@binding AND SlotHash=@slot AND AttemptId=@attempt AND State=0
          AND DATALENGTH(KeyBytes)=@keyLength AND KeyBytes=@keyBytes
          AND DATALENGTH(IntentBytes)=@intentLength AND IntentBytes=@intentBytes;
        """;
    public const string HeadText = """
        SELECT TOP (2) PurchaseRequestID,PurchaseDate,PurposeID,PersonSuggest,Department,PurposeDescOrClient,Price,Notes,
          StatusID,isLock,CurrencyID,ObjectID,RateExchange,BranchID
        FROM dbo.AP_PurchaseRequestTbl WITH (UPDLOCK,HOLDLOCK)
        WHERE CONVERT(varbinary(max),PurchaseRequestID)=CONVERT(varbinary(max),@document);
        """;
    public const string DetailsText = """
        SELECT TOP (501) UserAutoID,ItemID,Budget,TimeRequired,Quantity,UnitPrice,TotalPrice,Model,PurchaseRequestID
        FROM dbo.AP_PurchaseRequestDetailTbl WITH (UPDLOCK,HOLDLOCK)
        WHERE PurchaseRequestID=@document;
        """;
    public const string InsertHeadText = """
        INSERT dbo.AP_PurchaseRequestTbl(PurchaseRequestID,PurchaseDate,PurposeID,PersonSuggest,Department,PurposeDescOrClient,
          Price,Notes,StatusID,isLock,CurrencyID,ObjectID,RateExchange,BranchID)
        VALUES(@document,@date,@purpose,@person,@department,@description,@price,@notes,1,0,@currency,@object,@rate,@branch);
        """;
    public const string UpdateHeadText = """
        UPDATE dbo.AP_PurchaseRequestTbl SET PurchaseDate=@date,PurposeID=@purpose,PersonSuggest=@person,Department=@department,
          PurposeDescOrClient=@description,Price=@price,Notes=@notes,CurrencyID=@currency,ObjectID=@object,RateExchange=@rate
        WHERE CONVERT(varbinary(max),PurchaseRequestID)=CONVERT(varbinary(max),@document)
          AND CONVERT(varbinary(max),CONVERT(nvarchar(max),BranchID))=CONVERT(varbinary(max),@branchScope)
          AND StatusID=1 AND ISNULL(isLock,0)=0;
        """;
    public const string InsertLineText = """
        INSERT dbo.AP_PurchaseRequestDetailTbl(UserAutoID,ItemID,Budget,TimeRequired,Quantity,UnitPrice,TotalPrice,Model,PurchaseRequestID)
        VALUES(@line,@item,@budget,@time,@quantity,@unitPrice,@total,@model,@document);
        """;
    public const string UpdateLineText = """
        UPDATE dbo.AP_PurchaseRequestDetailTbl SET ItemID=@item,Budget=@budget,TimeRequired=@time,Quantity=@quantity,
          UnitPrice=@unitPrice,TotalPrice=@total,Model=@model
        WHERE CONVERT(varbinary(max),CONVERT(nvarchar(max),UserAutoID))=CONVERT(varbinary(max),@lineScope)
          AND CONVERT(varbinary(max),PurchaseRequestID)=CONVERT(varbinary(max),@document);
        """;
    public const string DeleteLineText = """
        DELETE dbo.AP_PurchaseRequestDetailTbl
        WHERE CONVERT(varbinary(max),CONVERT(nvarchar(max),UserAutoID))=CONVERT(varbinary(max),@lineScope)
          AND CONVERT(varbinary(max),PurchaseRequestID)=CONVERT(varbinary(max),@document);
        """;
    // Configured submit effect (SQL source 299451-299453), with explicit Web scope/state fences.
    // Existing draft state 1 only; rejected/reopened state 4 is not silently admitted.
    public const string SubmitText = """
        UPDATE dbo.AP_PurchaseRequestTbl SET StatusID=2,isLock=1
        WHERE CONVERT(varbinary(max),PurchaseRequestID)=CONVERT(varbinary(max),@document)
          AND CONVERT(varbinary(max),CONVERT(nvarchar(max),BranchID))=CONVERT(varbinary(max),@branchScope)
          AND StatusID=1 AND ISNULL(isLock,0)=0;
        """;
    public static DbCommand Command(DbTransaction transaction, string sql)
    {
        ArgumentNullException.ThrowIfNull(transaction);
        if (transaction.Connection is not {} connection || transaction.IsolationLevel != IsolationLevel.Serializable)
            throw new InvalidOperationException("Owned serializable transaction required.");
        var command = connection.CreateCommand();
        command.Transaction = transaction; command.CommandText = sql; command.CommandType = CommandType.Text; command.CommandTimeout = 5;
        return command;
    }
    public static void Parameter(DbCommand command, string name, DbType type, object? value, int size = 0, byte precision = 0, byte scale = 0)
    {
        var parameter = command.CreateParameter(); parameter.ParameterName = name; parameter.DbType = type;
        parameter.Size = size; parameter.Precision = precision; parameter.Scale = scale; parameter.Value = value ?? DBNull.Value;
        if (parameter is SqlParameter sql && type == DbType.Binary && size == 32) sql.SqlDbType = SqlDbType.Binary;
        command.Parameters.Add(parameter);
    }
    public static void Document(DbCommand command, string document) => Parameter(command, "@document", DbType.String, document, 50);
    public static void Scope(DbCommand command, string branch) => Parameter(command, "@branchScope", DbType.String, branch, 50);
    public static void Header(DbCommand command, PurchaseRequestHeaderInput header)
    {
        Parameter(command,"@date",DbType.DateTime,header.PurchaseDate is null ? null : DateTime.ParseExact(header.PurchaseDate,"yyyy-MM-dd'T'HH:mm:ss.fff",CultureInfo.InvariantCulture));
        Parameter(command,"@purpose",DbType.Int32,header.PurposeId); Parameter(command,"@person",DbType.String,header.PersonSuggest,500);
        Parameter(command,"@department",DbType.String,header.Department,100); Parameter(command,"@description",DbType.String,header.PurposeDescOrClient,-1);
        Parameter(command,"@price",DbType.Decimal,Number(header.Price),0,18,2); Parameter(command,"@notes",DbType.String,header.Notes,-1);
        Parameter(command,"@currency",DbType.AnsiString,header.CurrencyId,3); Parameter(command,"@object",DbType.AnsiString,header.ObjectId,100);
        Parameter(command,"@rate",DbType.Double,header.RateExchange);
    }
    public static void Line(DbCommand command, PurchaseRequestLineValues line)
    {
        Parameter(command,"@item",DbType.AnsiString,line.ItemId,50); Parameter(command,"@budget",DbType.Decimal,Number(line.Budget),0,18,0);
        Parameter(command,"@time",DbType.String,line.TimeRequired,200); Parameter(command,"@quantity",DbType.Decimal,Number(line.Quantity),0,18,0);
        Parameter(command,"@unitPrice",DbType.Decimal,Number(line.UnitPrice),0,18,0); Parameter(command,"@total",DbType.Decimal,Number(line.TotalPrice),0,18,0);
        Parameter(command,"@model",DbType.AnsiString,line.Model,50);
    }
    private static decimal? Number(string? text) => text is null ? null : decimal.Parse(text,CultureInfo.InvariantCulture);
}
