namespace Medcom.Infrastructure;

internal static class SqlLegacyPolicy
{
    internal const string GrantsCte = """
        WITH Grants AS (
            SELECT P.MenuID, P.IsRun, P.IsAdd, P.IsUpdate, P.IsDelete, P.isManager, P.isAdmin
            FROM dbo.SY_UserGroupPermisstion P WHERE P.UserGroupID = @group
            UNION ALL
            SELECT P.MenuID, P.IsRun, P.IsAdd, P.IsUpdate, P.IsDelete, P.isManager, P.isAdmin
            FROM dbo.SY_UserPermisstion P WHERE P.UserName = @username
            UNION ALL
            SELECT P.MenuID, P.IsRun, P.IsAdd, P.IsUpdate, P.IsDelete, P.isManager, P.isAdmin
            FROM dbo.SY_UserGroupPermisstion P
            JOIN dbo.SY_User U ON U.UserGroupID=P.UserGroupID
            JOIN dbo.SY_UserGroup G ON G.UserGroupID=U.UserGroupID
            WHERE U.UserAuthority=@username AND U.[Disable]=0 AND G.IsDisable=0
        )
        """;
    internal const string ViewGrant = "(P.IsRun=1 OR P.IsAdd=1 OR P.IsUpdate=1 OR P.IsDelete=1 OR P.isManager=1 OR P.isAdmin=1)";
}
