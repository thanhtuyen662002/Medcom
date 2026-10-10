using System.Data;
using System.Data.Common;
using Medcom.Application;
using Medcom.Contracts;
namespace Medcom.Infrastructure.Erp;

internal static class ErpSqlAuthority
{
    internal static async Task<ErpNativeRights?> Read(DbTransaction transaction,LegacyCompany company,
        AuthoritativeIdentity identity,ErpScreenDescription screen,string branch,CancellationToken token)
    {
        if(identity.TenantId!=company.TenantId||identity.CompanyId!=company.CompanyId
            ||!ErpInputRules.AnsiIdentifier(identity.PrincipalId,100)||!ErpInputRules.AnsiIdentifier(branch,50)
            ||string.IsNullOrEmpty(identity.CredentialStamp)||identity.BranchIds?.Contains(branch,StringComparer.Ordinal)!=true)return null;
        LegacyUser user;
        await using(var command=ErpSqlPlan.Command(transaction,"""
            SELECT TOP(2) U.UserName,U.[Password],U.[Disable],U.UserGroupID,G.IsDisable
            FROM dbo.SY_User U WITH(HOLDLOCK) LEFT JOIN dbo.SY_UserGroup G WITH(HOLDLOCK) ON G.UserGroupID=U.UserGroupID
            WHERE U.UserName=@actor;
            """))
        {
            ErpSqlPlan.Parameter(command,"@actor",DbType.AnsiString,identity.PrincipalId,100);
            await using var reader=await command.ExecuteReaderAsync(token);
            if(!await reader.ReadAsync(token)||Enumerable.Range(0,5).Any(reader.IsDBNull))return null;
            user=new(reader.GetString(0),"",reader.GetString(1),reader.GetBoolean(2),reader.GetString(3),!reader.GetBoolean(4));
            if(await reader.ReadAsync(token)||await reader.NextResultAsync(token)||user.Username!=identity.PrincipalId
                ||user.Disabled||!user.GroupEnabled||!ErpInputRules.AnsiIdentifier(user.GroupId,50)
                ||LegacyIdentityAuthority.Stamp(user)!=identity.CredentialStamp)return null;
        }
        var branches=await SqlLegacyBranchScope.ResolveAsync(transaction,user,token);
        if(!branches.BranchIds.Contains(branch,StringComparer.Ordinal)
            ||!(identity.BranchIds??[]).Order(StringComparer.Ordinal).SequenceEqual(branches.BranchIds.Order(StringComparer.Ordinal))
            ||identity.BranchSelection!=branches.BranchSelection)return null;
        await using var grant=ErpSqlPlan.Command(transaction,SqlLegacyPolicy.GrantsCte+"""
            SELECT TOP(2) M.MenuID,M.FormName,M.isDisable,M.Para,
              COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 OR P.IsAdd=1 OR P.IsUpdate=1 OR P.IsDelete=1 OR P.isManager=1 OR P.isAdmin=1 THEN 1 ELSE 0 END) FROM Grants P WHERE P.MenuID=M.MenuID),0),
              COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 AND P.IsAdd=1 THEN 1 ELSE 0 END) FROM Grants P WHERE P.MenuID=M.MenuID),0),
              COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 AND P.IsUpdate=1 THEN 1 ELSE 0 END) FROM Grants P WHERE P.MenuID=M.MenuID),0),
              COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 AND P.IsDelete=1 THEN 1 ELSE 0 END) FROM Grants P WHERE P.MenuID=M.MenuID),0)
            FROM dbo.SY_Menu M WITH(HOLDLOCK) WHERE M.MenuID=@menu;
            """);
        ErpSqlPlan.Parameter(grant,"@username",DbType.AnsiString,user.Username,100);
        ErpSqlPlan.Parameter(grant,"@group",DbType.AnsiString,user.GroupId,50);
        ErpSqlPlan.Parameter(grant,"@menu",DbType.AnsiString,screen.MenuId,50);
        await using var grants=await grant.ExecuteReaderAsync(token);
        if(!await grants.ReadAsync(token)||Enumerable.Range(0,3).Any(grants.IsDBNull)
            ||grants.GetString(0)!=screen.MenuId||grants.GetString(1)!=screen.FormId||grants.GetBoolean(2)
            ||!grants.IsDBNull(3)&&grants.GetString(3)!="")return null;
        var answer=new ErpNativeRights(grants.GetInt32(4)==1,grants.GetInt32(5)==1,grants.GetInt32(6)==1,grants.GetInt32(7)==1);
        return await grants.ReadAsync(token)||await grants.NextResultAsync(token)||!answer.Read?null:answer;
    }
}
