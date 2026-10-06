using System.Data;
using Microsoft.Data.SqlClient;

namespace Medcom.Infrastructure;

public sealed class SqlLegacyUserStore : ILegacyUserStore
{
    private readonly string connectionString;
    private readonly bool enablePilots;
    public SqlLegacyUserStore(string connectionString, bool allowLoopbackTestCertificate = false, bool enablePilots = false,
        SqlDevelopmentTestTlsTarget? developmentTestTlsTarget = null)
    {
        SqlConnectionStringBuilder builder;
        try { builder = new SqlConnectionStringBuilder(connectionString); }
        catch (Exception exception) when (exception is ArgumentException or FormatException
            or InvalidOperationException or NotSupportedException)
        {
            // Parser diagnostics can contain private input. Do not retain their inner exception.
            throw new ArgumentException("A valid SQL Server connection is required.");
        }
        if (string.IsNullOrWhiteSpace(builder.InitialCatalog) || builder.InitialCatalog.Equals("master", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(builder.DataSource)) throw new ArgumentException("A dedicated ERP database is required.");
        if (developmentTestTlsTarget is not null) developmentTestTlsTarget.ApplyTo(builder);
        else if (builder.TrustServerCertificate && !(allowLoopbackTestCertificate
                && builder.DataSource.StartsWith("127.0.0.1,", StringComparison.Ordinal)))
            throw new ArgumentException("The SQL server certificate must be trusted.");
        builder.Encrypt = SqlConnectionEncryptOption.Mandatory;
        builder.ConnectTimeout = 5;
        builder.ApplicationName = "Medcom.Web.Identity.ReadOnly";
        builder.PersistSecurityInfo = false;
        this.connectionString = builder.ConnectionString;
        this.enablePilots = enablePilots;
    }

    internal SqlConnection CreateConnection() => new(connectionString);

    public async Task ProbeSchemaAsync(CancellationToken cancellationToken)
    {
        await using var connection=CreateConnection();
        await connection.OpenAsync(cancellationToken);
        var sql="SELECT TOP (0) U.UserName,U.HoTen,U.[Password],U.[Disable],U.UserGroupID,G.IsDisable FROM dbo.SY_User U LEFT JOIN dbo.SY_UserGroup G ON G.UserGroupID=U.UserGroupID;";
        if(enablePilots) sql+="""
            SELECT TOP (0) M.MenuID,M.FormName,M.Para,M.isDisable,P.IsRun,P.IsAdd,P.IsUpdate,P.IsDelete,P.isManager,P.isAdmin
            FROM dbo.SY_Menu M LEFT JOIN dbo.SY_UserGroupPermisstion P ON P.MenuID=M.MenuID;
            SELECT TOP (0) UserName,MenuID,IsRun,IsAdd,IsUpdate,IsDelete,isManager,isAdmin FROM dbo.SY_UserPermisstion;
            SELECT TOP (0) UserName,BranchID FROM dbo.SY_UserBranch;
            SELECT TOP (0) DocumentID,DocumentDate,BranchID,StatusID,isLock FROM dbo.AP_OrderTbl;
            SELECT TOP (0) DocumentID,DocumentDate,BranchID,StatusID FROM dbo.IV_InboundRequestTbl;
            SELECT TOP (0) UserAutoID,DocumentID,ItemID,Quantity,Quantity2 FROM dbo.AP_OrderDetailTbl;
            SELECT TOP (0) UserAutoID,DocumentID,ItemID,SetQuantityByDocument,BarrelQuantityByDocument,
                SetQuantityByReal,BarrelQuantityByReal FROM dbo.IV_InboundRequestDetailsTbl;
            """;
        await using var command=new SqlCommand(sql,connection) { CommandTimeout=5 };
        await using var reader=await command.ExecuteReaderAsync(cancellationToken);
        while(await reader.NextResultAsync(cancellationToken)) { }
    }

    public async Task<LegacyUser?> FindAsync(string username, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(username) || username.Length > 100) return null;
        await using var connection = CreateConnection();
        await connection.OpenAsync(cancellationToken);
        await using var command = new SqlCommand("""
            SELECT TOP (2) U.UserName, U.HoTen, U.[Password], U.[Disable], U.UserGroupID, G.IsDisable
            FROM dbo.SY_User AS U
            LEFT JOIN dbo.SY_UserGroup AS G ON G.UserGroupID = U.UserGroupID
            WHERE U.UserName = @username;
            """, connection) { CommandTimeout = 5 };
        command.Parameters.Add("@username", SqlDbType.VarChar, 100).Value = username;
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        var user = new LegacyUser(reader.GetString(0), reader.GetString(1),
            reader.IsDBNull(2) ? "" : reader.GetString(2), reader.IsDBNull(3) || reader.GetBoolean(3),
            reader.IsDBNull(4) ? null : reader.GetString(4), !reader.IsDBNull(5) && !reader.GetBoolean(5));
        // Ambiguous user/group matches cannot select an arbitrary identity.
        if (await reader.ReadAsync(cancellationToken)) return null;
        await reader.CloseAsync();
        if (!enablePilots || user.Disabled || !user.GroupEnabled) return user;
        await using var permissions = new SqlCommand(SqlLegacyPolicy.GrantsCte + """
            SELECT DISTINCT M.MenuID
            FROM Grants P JOIN dbo.SY_Menu M ON M.MenuID=P.MenuID
            WHERE M.isDisable=0 AND COALESCE(M.Para,'')=''
              AND ((M.MenuID='050129' AND M.FormName='AP_OrderFrm')
                OR (M.MenuID='07011' AND M.FormName='IV_InboundRequestFrm'))
              AND (P.IsRun=1 OR P.IsAdd=1 OR P.IsUpdate=1 OR P.IsDelete=1 OR P.isManager=1 OR P.isAdmin=1);
            """, connection) { CommandTimeout=5 };
        permissions.Parameters.Add("@username",SqlDbType.VarChar,100).Value=user.Username;
        permissions.Parameters.Add("@group",SqlDbType.VarChar,50).Value=(object?)user.GroupId??DBNull.Value;
        await using var grants=await permissions.ExecuteReaderAsync(cancellationToken);
        var capabilities=new List<string>();
        while(await grants.ReadAsync(cancellationToken))
        {
            var capability = grants.GetString(0) switch
            { "050129" => "purchase-orders.read", "07011" => "inbound-requests.read", _ => null };
            if (capability is not null) capabilities.Add(capability);
        }
        await grants.CloseAsync();
        if (await PurchaseRequests.SqlPurchaseRequestQueries.HasNativeReadGrantAsync(connection, user, cancellationToken))
            capabilities.Add("purchase-requests.read");
        await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
        var branches = await SqlLegacyBranchScope.ReadAsync(transaction, user, cancellationToken);
        await transaction.RollbackAsync(cancellationToken);
        return user with { Capabilities=capabilities.AsReadOnly(), BranchIds=branches };
    }
}
