using System.Data;
using Medcom.Application;
using Medcom.Contracts;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure;

public sealed class SqlDocumentReader(string connectionString, LegacyCompany company,
    bool allowLoopbackTestCertificate = false, SqlDevelopmentTestTlsTarget? developmentTestTlsTarget = null) : IDocumentReader
{
    // Configuration goes through the same certificate/database checks as identity reads.
    private readonly SqlLegacyUserStore database = new(connectionString, allowLoopbackTestCertificate, enablePilots: true,
        developmentTestTlsTarget: developmentTestTlsTarget);
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
            var current = await database.FindAsync(identity.PrincipalId, cancellationToken);
            if (current is null || current.Disabled || !current.GroupEnabled
                || LegacyIdentityAuthority.Stamp(current) != identity.CredentialStamp
                || current.Capabilities?.Contains(capability, StringComparer.Ordinal) != true)
                return new(DocumentOutcome.Denied);
            branches = branches.Intersect(current.BranchIds ?? [], StringComparer.Ordinal).ToArray();
            if (branches.Length == 0) return new(DocumentOutcome.Denied);
            await using var connection = database.CreateConnection();
            await connection.OpenAsync(cancellationToken);
            var parameters = string.Join(",", branches.Select((_, i) => $"@branch{i}"));
            // Only these two reviewed shapes are executable. No identifier comes from an HTTP request.
            var projection = kind == DocumentKind.PurchaseOrders
                ? "D.DocumentID, D.DocumentDate, D.BranchID, D.StatusID, D.isLock FROM dbo.AP_OrderTbl D"
                : "D.DocumentID, D.DocumentDate, D.BranchID, D.StatusID, CAST(NULL AS bit) FROM dbo.IV_InboundRequestTbl D";
            await using var command = new SqlCommand(SqlLegacyPolicy.GrantsCte + $"""
                SELECT {projection}
                WHERE D.BranchID IN ({parameters}) AND (@search = '' OR DocumentID LIKE @search ESCAPE '~')
                  AND EXISTS (SELECT 1 FROM dbo.SY_User U JOIN dbo.SY_UserGroup G ON G.UserGroupID=U.UserGroupID
                    WHERE U.UserName=@username AND U.[Password] COLLATE Latin1_General_100_BIN2=@storedHash COLLATE Latin1_General_100_BIN2 AND U.UserGroupID=@group
                      AND U.[Disable]=0 AND G.IsDisable=0
                      AND (U.BranchID=D.BranchID OR EXISTS (SELECT 1 FROM dbo.SY_UserBranch B
                        WHERE B.UserName=U.UserName AND B.BranchID=D.BranchID)))
                  AND EXISTS (SELECT 1 FROM Grants P JOIN dbo.SY_Menu M ON M.MenuID=P.MenuID
                    WHERE M.MenuID=@menu AND M.FormName=@form AND M.isDisable=0 AND COALESCE(M.Para,'')=''
                      AND {SqlLegacyPolicy.ViewGrant})
                ORDER BY DocumentDate DESC, DocumentID ASC
                OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
                """, connection) { CommandTimeout = 5 };
            command.Parameters.Add("@username",SqlDbType.VarChar,100).Value=current.Username;
            command.Parameters.Add("@storedHash",SqlDbType.VarChar,200).Value=current.StoredHash;
            command.Parameters.Add("@group",SqlDbType.VarChar,50).Value=current.GroupId!;
            command.Parameters.Add("@menu",SqlDbType.VarChar,50).Value=kind==DocumentKind.PurchaseOrders?"050129":"07011";
            command.Parameters.Add("@form",SqlDbType.VarChar,100).Value=kind==DocumentKind.PurchaseOrders?"AP_OrderFrm":"IV_InboundRequestFrm";
            for (var i = 0; i < branches.Length; i++) command.Parameters.Add($"@branch{i}",SqlDbType.VarChar,50).Value=branches[i];
            var search = query.Search?.Trim() ?? "";
            search = search.Replace("~","~~",StringComparison.Ordinal).Replace("%","~%",StringComparison.Ordinal)
                .Replace("_","~_",StringComparison.Ordinal).Replace("[","~[",StringComparison.Ordinal);
            command.Parameters.Add("@search",SqlDbType.VarChar,204).Value=search.Length==0?"":$"%{search}%";
            command.Parameters.Add("@skip",SqlDbType.Int).Value=(query.Page-1)*query.PageSize;
            command.Parameters.Add("@take",SqlDbType.Int).Value=query.PageSize+1;
            await using var reader=await command.ExecuteReaderAsync(cancellationToken);
            var rows=new List<DocumentSummary>();
            while(await reader.ReadAsync(cancellationToken))
                rows.Add(new(reader.GetString(0), reader.GetDateTime(1).ToString("yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture),
                    reader.GetString(2),reader.IsDBNull(3)?null:reader.GetInt32(3),reader.IsDBNull(4)?null:reader.GetBoolean(4)));
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
            var current = await database.FindAsync(identity.PrincipalId, cancellationToken);
            if (current is null || current.Disabled || !current.GroupEnabled
                || LegacyIdentityAuthority.Stamp(current) != identity.CredentialStamp
                || current.Capabilities?.Contains(capability, StringComparer.Ordinal) != true)
                return new(DocumentOutcome.Denied);
            var branches = identity.BranchIds.Intersect(current.BranchIds ?? [], StringComparer.Ordinal).ToArray();
            if (branches.Length == 0) return new(DocumentOutcome.Denied);
            await using var connection = database.CreateConnection();
            await connection.OpenAsync(cancellationToken);
            var parameters = string.Join(",", branches.Select((_, i) => $"@branch{i}"));
            var purchase = kind == DocumentKind.PurchaseOrders;
            // Parent authorization and line selection share one statement. Child rows never authorize themselves.
            // These identifiers and projections are fixed reviewed shapes, never request-provided SQL.
            var parent = purchase ? "dbo.AP_OrderTbl" : "dbo.IV_InboundRequestTbl";
            var child = purchase ? "dbo.AP_OrderDetailTbl" : "dbo.IV_InboundRequestDetailsTbl";
            var locked = purchase ? "D.isLock" : "CAST(NULL AS bit)";
            var quantities = purchase
                ? "CONVERT(varchar(40),C.Quantity) AS Q1, CONVERT(varchar(40),C.Quantity2) AS Q2, CAST(NULL AS varchar(40)) AS Q3, CAST(NULL AS varchar(40)) AS Q4"
                : "CONVERT(varchar(40),C.SetQuantityByDocument) AS Q1, CONVERT(varchar(40),C.BarrelQuantityByDocument) AS Q2, CONVERT(varchar(40),C.SetQuantityByReal) AS Q3, CONVERT(varchar(40),C.BarrelQuantityByReal) AS Q4";
            await using var command = new SqlCommand(SqlLegacyPolicy.GrantsCte + $"""
                SELECT D.DocumentID,D.DocumentDate,D.BranchID,D.StatusID,{locked},L.UserAutoID,L.ItemID,L.Q1,L.Q2,L.Q3,L.Q4
                FROM {parent} D
                OUTER APPLY (SELECT C.UserAutoID,C.ItemID,{quantities} FROM {child} C
                  WHERE C.DocumentID=D.DocumentID ORDER BY C.UserAutoID
                  OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY) L
                WHERE D.DocumentID=@document AND D.BranchID IN ({parameters})
                  AND EXISTS (SELECT 1 FROM dbo.SY_User U JOIN dbo.SY_UserGroup G ON G.UserGroupID=U.UserGroupID
                    WHERE U.UserName=@username AND U.[Password] COLLATE Latin1_General_100_BIN2=@storedHash COLLATE Latin1_General_100_BIN2 AND U.UserGroupID=@group
                      AND U.[Disable]=0 AND G.IsDisable=0
                      AND (U.BranchID=D.BranchID OR EXISTS (SELECT 1 FROM dbo.SY_UserBranch B
                        WHERE B.UserName=U.UserName AND B.BranchID=D.BranchID)))
                  AND EXISTS (SELECT 1 FROM Grants P JOIN dbo.SY_Menu M ON M.MenuID=P.MenuID
                    WHERE M.MenuID=@menu AND M.FormName=@form AND M.isDisable=0 AND COALESCE(M.Para,'')=''
                      AND {SqlLegacyPolicy.ViewGrant})
                ORDER BY L.UserAutoID;
                """, connection) { CommandTimeout = 5 };
            command.Parameters.Add("@username",SqlDbType.VarChar,100).Value=current.Username;
            command.Parameters.Add("@storedHash",SqlDbType.VarChar,200).Value=current.StoredHash;
            command.Parameters.Add("@group",SqlDbType.VarChar,50).Value=current.GroupId!;
            command.Parameters.Add("@menu",SqlDbType.VarChar,50).Value=purchase?"050129":"07011";
            command.Parameters.Add("@form",SqlDbType.VarChar,100).Value=purchase?"AP_OrderFrm":"IV_InboundRequestFrm";
            command.Parameters.Add("@document",SqlDbType.VarChar,purchase?30:50).Value=query.DocumentId;
            for (var i=0;i<branches.Length;i++) command.Parameters.Add($"@branch{i}",SqlDbType.VarChar,50).Value=branches[i];
            command.Parameters.Add("@skip",SqlDbType.Int).Value=(query.Page-1)*query.PageSize;
            command.Parameters.Add("@take",SqlDbType.Int).Value=query.PageSize+1;
            await using var reader=await command.ExecuteReaderAsync(cancellationToken);
            DocumentSummary? document=null;
            var orderLines=new List<PurchaseOrderLine>(); var inboundLines=new List<InboundRequestLine>();
            while(await reader.ReadAsync(cancellationToken))
            {
                document ??= new(reader.GetString(0),reader.GetDateTime(1).ToString("yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture),
                    reader.GetString(2),reader.IsDBNull(3)?null:reader.GetInt32(3),reader.IsDBNull(4)?null:reader.GetBoolean(4));
                if (reader.IsDBNull(5)) continue; // Visible parent with no lines on this page.
                string? Value(int ordinal) => reader.IsDBNull(ordinal)?null:reader.GetString(ordinal);
                if(purchase) orderLines.Add(new(reader.GetString(5),reader.GetString(6),Value(7),Value(8)));
                else inboundLines.Add(new(reader.GetString(5),reader.GetString(6),Value(7),Value(8),Value(9),Value(10)));
            }
            // Hidden and missing parents have the same response, regardless of child existence.
            if(document is null) return new(DocumentOutcome.NotFound);
            return new(DocumentOutcome.Success,new(document,orderLines.Take(query.PageSize).ToArray(),
                inboundLines.Take(query.PageSize).ToArray(),query.Page,query.PageSize,
                orderLines.Count>query.PageSize || inboundLines.Count>query.PageSize));
        }
        catch(Exception) when(!cancellationToken.IsCancellationRequested) { return new(DocumentOutcome.Unavailable); }
    }
}
