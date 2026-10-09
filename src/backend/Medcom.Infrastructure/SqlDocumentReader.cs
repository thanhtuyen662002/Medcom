using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Contracts;

namespace Medcom.Infrastructure;

public sealed class SqlDocumentReader : IDocumentReader
{
    private readonly SqlLegacyUserStore? database;
    private readonly LegacyCompany company;
    private readonly Func<DbConnection> factory;
    private readonly Func<string,CancellationToken,Task<LegacyUser?>> find;
    public SqlDocumentReader(string connectionString, LegacyCompany company,
        bool allowLoopbackTestCertificate = false, SqlDevelopmentTestTlsTarget? developmentTestTlsTarget = null)
    {
        this.company=company;
        // The production route keeps the existing certificate/database checks.
        database=new SqlLegacyUserStore(connectionString,allowLoopbackTestCertificate,enablePilots:true,
            developmentTestTlsTarget:developmentTestTlsTarget);
        factory=database.CreateConnection;find=database.FindAsync;
    }
    // Trusted recording seam; no runtime registration or alternate authority policy.
    internal SqlDocumentReader(LegacyCompany company,Func<DbConnection> factory,
        Func<string,CancellationToken,Task<LegacyUser?>> find)
    {this.company=company;this.factory=factory;this.find=find;}
    public async Task<DocumentResult> ReadAsync(AuthoritativeIdentity identity, DocumentKind kind,
        DocumentQuery query, CancellationToken cancellationToken)
    {
        var capability = kind switch
        { DocumentKind.PurchaseOrders => "purchase-orders.read", DocumentKind.InboundRequests => "inbound-requests.read", _ => null };
        if (capability is null || identity.TenantId != company.TenantId || identity.CompanyId != company.CompanyId
            || !identity.Capabilities.Contains(capability, StringComparer.Ordinal)
            || identity.BranchIds is not { Count: > 0 and <= 200 }) return new(DocumentOutcome.Denied);
        if (query.Page is < 1 or > 1000 || query.PageSize is < 1 or > 100 || query.Search?.Length > 100
            || query.BranchId?.Length > 50) return new(DocumentOutcome.Invalid);
        var branches = identity.BranchIds.Distinct(StringComparer.Ordinal).ToArray();
        if (query.BranchId is { Length: > 0 } && !branches.Contains(query.BranchId, StringComparer.Ordinal))
            return new(DocumentOutcome.Denied);
        if (!string.IsNullOrEmpty(query.BranchId)) branches = [query.BranchId];
        try
        {
            var current = await find(identity.PrincipalId, cancellationToken);
            if (current is null || current.Disabled || !current.GroupEnabled
                || LegacyIdentityAuthority.Stamp(current) != identity.CredentialStamp
                || current.Capabilities?.Contains(capability, StringComparer.Ordinal) != true)
                return new(DocumentOutcome.Denied);
            branches = branches.Intersect(current.BranchIds ?? [], StringComparer.Ordinal).ToArray();
            if (branches.Length == 0) return new(DocumentOutcome.Denied);
            await using var connection = factory();
            await connection.OpenAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            var nativeBranches = await SqlLegacyBranchScope.ReadAsync(transaction, current, cancellationToken);
            branches = branches.Intersect(nativeBranches, StringComparer.Ordinal).ToArray();
            if (branches.Length == 0) return new(DocumentOutcome.Denied);
            await using var command = Command(transaction,ListSql(kind, branches.Length));
            Parameter(command,"@username",DbType.AnsiString,current.Username,100);
            Parameter(command,"@storedHash",DbType.AnsiString,current.StoredHash,200);
            Parameter(command,"@group",DbType.AnsiString,current.GroupId!,50);
            Parameter(command,"@menu",DbType.AnsiString,kind==DocumentKind.PurchaseOrders?"050129":"07011",50);
            Parameter(command,"@form",DbType.AnsiString,kind==DocumentKind.PurchaseOrders?"AP_OrderFrm":"IV_InboundRequestFrm",100);
            for (var i = 0; i < branches.Length; i++) Parameter(command,$"@branch{i}",DbType.String,branches[i],50);
            var search = query.Search?.Trim() ?? "";
            search = search.Replace("~","~~",StringComparison.Ordinal).Replace("%","~%",StringComparison.Ordinal)
                .Replace("_","~_",StringComparison.Ordinal).Replace("[","~[",StringComparison.Ordinal);
            Parameter(command,"@search",DbType.AnsiString,search.Length==0?"":$"%{search}%",204);
            Parameter(command,"@skip",DbType.Int32,(query.Page-1)*query.PageSize,0);
            Parameter(command,"@take",DbType.Int32,query.PageSize+1,0);
            await using var reader=await command.ExecuteReaderAsync(cancellationToken);
            var rows=new List<DocumentSummary>();
            while(await reader.ReadAsync(cancellationToken))
                rows.Add(new(reader.GetString(0), reader.GetDateTime(1).ToString("yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture),
                    reader.GetString(2),reader.IsDBNull(3)?null:reader.GetInt32(3),reader.IsDBNull(4)?null:reader.GetBoolean(4),
                    DocumentStatusSql.ReadName(reader,5,kind==DocumentKind.PurchaseOrders?50:100),
                    kind==DocumentKind.PurchaseOrders?DocumentSourceFieldReader.ReadPurchaseOrderHeaderFields(reader,7):null,
                    kind==DocumentKind.InboundRequests?DocumentSourceFieldReader.ReadInboundRequestHeaderFields(reader,7):null));
            var more=rows.Count>query.PageSize;
            return new(DocumentOutcome.Success,new(rows.Take(query.PageSize).ToArray(),query.Page,query.PageSize,more));
        }
        catch(Exception) when(!cancellationToken.IsCancellationRequested) { return new(DocumentOutcome.Unavailable); }
    }

    public async Task<DocumentDetailResult> ReadDetailAsync(AuthoritativeIdentity identity, DocumentKind kind,
        DocumentDetailQuery query, CancellationToken cancellationToken)
    {
        var capability = kind switch
        { DocumentKind.PurchaseOrders => "purchase-orders.read", DocumentKind.InboundRequests => "inbound-requests.read", _ => null };
        if (capability is null || identity.TenantId != company.TenantId || identity.CompanyId != company.CompanyId
            || !identity.Capabilities.Contains(capability, StringComparer.Ordinal)
            || identity.BranchIds is not { Count: > 0 and <= 200 }) return new(DocumentOutcome.Denied);
        if (string.IsNullOrWhiteSpace(query.DocumentId)
            || query.DocumentId.Length > (kind == DocumentKind.PurchaseOrders ? 30 : 50)
            || query.Page is < 1 or > 1000 || query.PageSize is < 1 or > 100)
            return new(DocumentOutcome.Invalid);
        try
        {
            var current = await find(identity.PrincipalId, cancellationToken);
            if (current is null || current.Disabled || !current.GroupEnabled
                || LegacyIdentityAuthority.Stamp(current) != identity.CredentialStamp
                || current.Capabilities?.Contains(capability, StringComparer.Ordinal) != true)
                return new(DocumentOutcome.Denied);
            var branches = identity.BranchIds.Intersect(current.BranchIds ?? [], StringComparer.Ordinal).ToArray();
            if (branches.Length == 0) return new(DocumentOutcome.Denied);
            await using var connection = factory();
            await connection.OpenAsync(cancellationToken);
            await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
            var nativeBranches = await SqlLegacyBranchScope.ReadAsync(transaction, current, cancellationToken);
            branches = branches.Intersect(nativeBranches, StringComparer.Ordinal).ToArray();
            if (branches.Length == 0) return new(DocumentOutcome.Denied);
            var purchase = kind == DocumentKind.PurchaseOrders;
            await using var command = Command(transaction,DetailSql(kind, branches.Length));
            Parameter(command,"@username",DbType.AnsiString,current.Username,100);
            Parameter(command,"@storedHash",DbType.AnsiString,current.StoredHash,200);
            Parameter(command,"@group",DbType.AnsiString,current.GroupId!,50);
            Parameter(command,"@menu",DbType.AnsiString,purchase?"050129":"07011",50);
            Parameter(command,"@form",DbType.AnsiString,purchase?"AP_OrderFrm":"IV_InboundRequestFrm",100);
            Parameter(command,"@document",DbType.AnsiString,query.DocumentId,purchase?30:50);
            for (var i=0;i<branches.Length;i++) Parameter(command,$"@branch{i}",DbType.String,branches[i],50);
            Parameter(command,"@skip",DbType.Int32,(query.Page-1)*query.PageSize,0);
            Parameter(command,"@take",DbType.Int32,query.PageSize+1,0);
            await using var reader=await command.ExecuteReaderAsync(cancellationToken);
            DocumentSummary? document=null;
            var orderLines=new List<PurchaseOrderLine>(); var inboundLines=new List<InboundRequestLine>();
            while(await reader.ReadAsync(cancellationToken))
            {
                document ??= new(reader.GetString(0),reader.GetDateTime(1).ToString("yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture),
                    reader.GetString(2),reader.IsDBNull(3)?null:reader.GetInt32(3),reader.IsDBNull(4)?null:reader.GetBoolean(4),
                    DocumentStatusSql.ReadName(reader,11,purchase?50:100),
                    purchase?DocumentSourceFieldReader.ReadPurchaseOrderHeaderFields(reader,13):null,
                    purchase?null:DocumentSourceFieldReader.ReadInboundRequestHeaderFields(reader,13));
                if (reader.IsDBNull(5)) continue; // Visible parent with no lines on this page.
                string? Value(int ordinal) => reader.IsDBNull(ordinal)?null:reader.GetString(ordinal);
                if(purchase) orderLines.Add(new(reader.GetString(5),reader.GetString(6),Value(7),Value(8),
                    DocumentSourceFieldReader.ReadPurchaseOrderLineFields(reader,32)));
                else inboundLines.Add(new(reader.GetString(5),reader.GetString(6),Value(7),Value(8),Value(9),Value(10),
                    DocumentSourceFieldReader.ReadInboundRequestLineFields(reader,50)));
            }
            // Hidden and missing parents have the same response, regardless of child existence.
            if(document is null) return new(DocumentOutcome.NotFound);
            await reader.DisposeAsync(); // Enrichment reuses this authorized transaction, never an open reader.
            var selectedOrders=orderLines.Take(query.PageSize).ToArray();
            var selectedInbound=inboundLines.Take(query.PageSize).ToArray();
            var display=await ItemDisplayContextReader.ReadAsync(transaction,purchase?"purchase-orders":"inbound-requests",
                document.DocumentId,document.BranchId,null,document.StatusId,document.IsLocked,query.Page,query.PageSize,
                purchase?selectedOrders.Select(line=>(line.LineId,line.ItemId)).ToArray()
                    :selectedInbound.Select(line=>(line.LineId,line.ItemId)).ToArray(),cancellationToken);
            return new(DocumentOutcome.Success,new(document,selectedOrders,
                selectedInbound,query.Page,query.PageSize,
                orderLines.Count>query.PageSize || inboundLines.Count>query.PageSize,display));
        }
        catch(Exception) when(!cancellationToken.IsCancellationRequested) { return new(DocumentOutcome.Unavailable); }
    }

    private static DbCommand Command(DbTransaction tx,string sql)
    {var c=tx.Connection!.CreateCommand();c.Transaction=tx;c.CommandText=sql;c.CommandTimeout=5;return c;}
    private static void Parameter(DbCommand command,string name,DbType type,object value,int size)
    {var p=command.CreateParameter();p.ParameterName=name;p.DbType=type;p.Size=size;p.Value=value;command.Parameters.Add(p);}

    internal static string ListSql(DocumentKind kind, int branchCount)
    {
        var scope = SqlLegacyBranchScope.ExactBranchPredicate("D.BranchID", branchCount);
        // Only these two reviewed shapes are executable. No identifier comes from an HTTP request.
        var projection = kind == DocumentKind.PurchaseOrders
                ? "D.DocumentID, D.DocumentDate, D.BranchID, D.StatusID, D.isLock, S.StatusName, S.StatusRows," + DocumentSourceFieldReader.PurchaseOrderHeaderFieldsProjection + " FROM dbo.AP_OrderTbl D " + DocumentStatusSql.PurchaseOrders
                : "D.DocumentID, D.DocumentDate, D.BranchID, D.StatusID, CAST(NULL AS bit), S.StatusName, S.StatusRows," + DocumentSourceFieldReader.InboundRequestHeaderFieldsProjection + " FROM dbo.IV_InboundRequestTbl D " + DocumentStatusSql.InboundRequests;
        return SqlLegacyPolicy.GrantsCte + $"""
                SELECT {projection}
                WHERE ({scope}) AND (@search = '' OR DocumentID LIKE @search ESCAPE '~')
                  AND EXISTS (SELECT 1 FROM dbo.SY_User U JOIN dbo.SY_UserGroup G ON G.UserGroupID=U.UserGroupID
                    WHERE U.UserName=@username AND U.[Password] COLLATE Latin1_General_100_BIN2=@storedHash COLLATE Latin1_General_100_BIN2 AND U.UserGroupID=@group
                      AND U.[Disable]=0 AND G.IsDisable=0
                      AND (U.BranchID IS NULL OR DATALENGTH(U.BranchID)=0
                        OR U.BranchID=D.BranchID OR EXISTS (SELECT 1 FROM dbo.SY_UserBranch B
                          WHERE B.UserName=U.UserName AND B.BranchID=D.BranchID)))
                  AND EXISTS (SELECT 1 FROM Grants P JOIN dbo.SY_Menu M ON M.MenuID=P.MenuID
                    WHERE M.MenuID=@menu AND M.FormName=@form AND M.isDisable=0 AND COALESCE(M.Para,'')=''
                      AND {SqlLegacyPolicy.ViewGrant})
                ORDER BY DocumentDate DESC, DocumentID ASC
                OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
                """;
    }
    internal static string DetailSql(DocumentKind kind, int branchCount)
    {
        var scope = SqlLegacyBranchScope.ExactBranchPredicate("D.BranchID", branchCount);
        var purchase = kind == DocumentKind.PurchaseOrders;
        // Parent authorization and line selection share one statement. Child rows never authorize themselves.
        // These identifiers and projections are fixed reviewed shapes, never request-provided SQL.
        var parent = purchase ? "dbo.AP_OrderTbl" : "dbo.IV_InboundRequestTbl";
        var child = purchase ? "dbo.AP_OrderDetailTbl" : "dbo.IV_InboundRequestDetailsTbl";
        var statusJoin = purchase ? DocumentStatusSql.PurchaseOrders : DocumentStatusSql.InboundRequests;
        var locked = purchase ? "D.isLock" : "CAST(NULL AS bit)";
        var headerFields = purchase ? DocumentSourceFieldReader.PurchaseOrderHeaderFieldsProjection : DocumentSourceFieldReader.InboundRequestHeaderFieldsProjection;
        var lineFields = purchase ? DocumentSourceFieldReader.PurchaseOrderLineFieldsProjection : DocumentSourceFieldReader.InboundRequestLineFieldsProjection;
        var selectedFields = string.Join(",",Enumerable.Range(0,purchase?12:25).Select(i=>$"L.F{i}"));
        var quantities = purchase
                ? "CONVERT(varchar(40),C.Quantity) AS Q1, CONVERT(varchar(40),C.Quantity2) AS Q2, CAST(NULL AS varchar(40)) AS Q3, CAST(NULL AS varchar(40)) AS Q4"
                : "CONVERT(varchar(40),C.SetQuantityByDocument) AS Q1, CONVERT(varchar(40),C.BarrelQuantityByDocument) AS Q2, CONVERT(varchar(40),C.SetQuantityByReal) AS Q3, CONVERT(varchar(40),C.BarrelQuantityByReal) AS Q4";
        return SqlLegacyPolicy.GrantsCte + $"""
                SELECT D.DocumentID,D.DocumentDate,D.BranchID,D.StatusID,{locked},L.UserAutoID,L.ItemID,L.Q1,L.Q2,L.Q3,L.Q4,S.StatusName,S.StatusRows,{headerFields},{selectedFields}
                FROM {parent} D
                {statusJoin}
                OUTER APPLY (SELECT C.UserAutoID,C.ItemID,{quantities},{lineFields} FROM {child} C
                  WHERE C.DocumentID=D.DocumentID ORDER BY C.UserAutoID
                  OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY) L
                WHERE D.DocumentID=@document AND ({scope})
                  AND EXISTS (SELECT 1 FROM dbo.SY_User U JOIN dbo.SY_UserGroup G ON G.UserGroupID=U.UserGroupID
                    WHERE U.UserName=@username AND U.[Password] COLLATE Latin1_General_100_BIN2=@storedHash COLLATE Latin1_General_100_BIN2 AND U.UserGroupID=@group
                      AND U.[Disable]=0 AND G.IsDisable=0
                      AND (U.BranchID IS NULL OR DATALENGTH(U.BranchID)=0
                        OR U.BranchID=D.BranchID OR EXISTS (SELECT 1 FROM dbo.SY_UserBranch B
                          WHERE B.UserName=U.UserName AND B.BranchID=D.BranchID)))
                  AND EXISTS (SELECT 1 FROM Grants P JOIN dbo.SY_Menu M ON M.MenuID=P.MenuID
                    WHERE M.MenuID=@menu AND M.FormName=@form AND M.isDisable=0 AND COALESCE(M.Para,'')=''
                      AND {SqlLegacyPolicy.ViewGrant})
                ORDER BY L.UserAutoID;
                """;
    }
}
