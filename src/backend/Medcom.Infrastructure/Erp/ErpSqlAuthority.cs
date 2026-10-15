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
        var user=await ReadUser(transaction,company,identity,branch,token);
        if(user is null)return null;
        await using var grant=ErpSqlPlan.Command(transaction,SqlLegacyPolicy.GrantsCte+GrantProjection+" WHERE M.MenuID=@menu;");
        ErpSqlPlan.Parameter(grant,"@username",DbType.AnsiString,user.Username,100);
        ErpSqlPlan.Parameter(grant,"@group",DbType.AnsiString,user.GroupId,50);
        ErpSqlPlan.Parameter(grant,"@menu",DbType.AnsiString,screen.MenuId,50);
        await using var grants=await grant.ExecuteReaderAsync(token);
        if(!await grants.ReadAsync(token)||!Matches(grants,screen))return null;
        var answer=Rights(grants);
        return await grants.ReadAsync(token)||await grants.NextResultAsync(token)||!answer.Read?null:answer;
    }
    internal const string GrantProjection="""
        SELECT M.MenuID,M.FormName,M.isDisable,M.Para,
          COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 OR P.IsAdd=1 OR P.IsUpdate=1 OR P.IsDelete=1 OR P.isManager=1 OR P.isAdmin=1 THEN 1 ELSE 0 END) FROM Grants P WHERE P.MenuID=M.MenuID),0),
          COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 AND P.IsAdd=1 THEN 1 ELSE 0 END) FROM Grants P WHERE P.MenuID=M.MenuID),0),
          COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 AND P.IsUpdate=1 THEN 1 ELSE 0 END) FROM Grants P WHERE P.MenuID=M.MenuID),0),
          COALESCE((SELECT MAX(CASE WHEN P.IsRun=1 AND P.IsDelete=1 THEN 1 ELSE 0 END) FROM Grants P WHERE P.MenuID=M.MenuID),0)
        FROM dbo.SY_Menu M WITH(HOLDLOCK)
        """;
    private static bool Matches(DbDataReader data,ErpScreenDescription screen)=>data.FieldCount==8
        &&!Enumerable.Range(0,3).Any(data.IsDBNull)&&data.GetString(0)==screen.MenuId&&data.GetString(1)==screen.FormId
        &&!data.GetBoolean(2)&&(data.IsDBNull(3)||data.GetString(3)=="");
    private static ErpNativeRights Rights(DbDataReader data)=>new(data.GetInt32(4)==1,data.GetInt32(5)==1,data.GetInt32(6)==1,data.GetInt32(7)==1);

    internal static async Task<IReadOnlyDictionary<string,ErpNativeRights>?> ReadAll(DbTransaction transaction,LegacyCompany company,
        AuthoritativeIdentity identity,string branch,CancellationToken token)
    {
        var user=await ReadUser(transaction,company,identity,branch,token);
        if(user is null)return null;
        var screens=ErpScreenCatalog.ModuleIds.Select(id=>ErpScreenCatalog.Get(id)!).ToArray();
        var none=new ErpNativeRights(false,false,false,false);
        var result=screens.ToDictionary(s=>s.Id,_=>none,StringComparer.Ordinal);
        await using var command=ErpSqlPlan.Command(transaction,SqlLegacyPolicy.GrantsCte+GrantProjection+
            " WHERE M.MenuID IN ("+string.Join(",",screens.Select((_,i)=>"@menu"+i))+");");
        ErpSqlPlan.Parameter(command,"@username",DbType.AnsiString,user.Username,100);
        ErpSqlPlan.Parameter(command,"@group",DbType.AnsiString,user.GroupId,50);
        for(var i=0;i<screens.Length;i++)ErpSqlPlan.Parameter(command,"@menu"+i,DbType.AnsiString,screens[i].MenuId,50);
        await using var data=await command.ExecuteReaderAsync(token);
        var seen=new HashSet<string>(StringComparer.Ordinal);
        while(await data.ReadAsync(token))
        {
            if(data.FieldCount!=8||data.IsDBNull(0))throw new InvalidOperationException("Invalid permission projection.");
            var screen=screens.SingleOrDefault(s=>s.MenuId==data.GetString(0));
            if(screen is null||!seen.Add(screen.Id))throw new InvalidOperationException("Ambiguous permission menu.");
            if(Matches(data,screen)&&identity.Capabilities.Contains(screen.Id+".read",StringComparer.Ordinal))result[screen.Id]=Rights(data);
        }
        if(await data.NextResultAsync(token))throw new InvalidOperationException("Unexpected permission result.");
        return result;
    }
    private static async Task<LegacyUser?> ReadUser(DbTransaction transaction,LegacyCompany company,
        AuthoritativeIdentity identity,string branch,CancellationToken token)
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
        return user;
    }
}
