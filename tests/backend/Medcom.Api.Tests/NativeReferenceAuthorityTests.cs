using System.Data;
using System.Data.Common;
using System.Globalization;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class NativeReferenceAuthorityTests
{
    [Theory]
    [InlineData("success")]
    [InlineData("before-disabled")]
    [InlineData("after-disabled")]
    [InlineData("before-password")]
    [InlineData("after-password")]
    [InlineData("before-branch")]
    [InlineData("after-branch")]
    [InlineData("logout")]
    public async Task Native_branch_query_checks_database_authority_even_when_local_identity_is_unchanged(string change)
    {
        var source=new Source();
        void Change()
        {
            if(change.EndsWith("disabled",StringComparison.Ordinal))source.User=source.User with{Disabled=true};
            else if(change.EndsWith("password",StringComparison.Ordinal))source.User=source.User with{StoredHash="changed"};
            else if(change.EndsWith("branch",StringComparison.Ordinal))source.Branch="QA-OTHER";
            else if(change=="logout")source.Identity=null;
        }
        if(change.StartsWith("before-",StringComparison.Ordinal))Change();
        else source.AfterData=Change;
        // Both delegates represent local inspection after cookie validation.
        var service=new SqlReferenceData(Source.Company,()=>new DisplayConnection(source.Read),
            _=>Task.FromResult(source.Identity),_=>Task.FromResult(source.Identity));
        var result=await service.BranchesAsync(1,20,null,default);
        Assert.Equal(change=="success"?ErpReadOutcome.Success:ErpReadOutcome.Denied,result.Outcome);
        if(change=="success")Assert.Equal(new BranchChoice("QA-B","Synthetic branch"),Assert.Single(result.Value!.Items));
        else Assert.Null(result.Value);
    }

    private sealed class Source
    {
        internal static readonly LegacyCompany Company=new("test-tenant","test-company","Test company");
        internal LegacyUser User=new("fixture.actor","Fixture actor","fixture.hash",false,"fixture.group",true);
        internal string Branch="QA-B";
        internal AuthoritativeIdentity? Identity;
        internal Action? AfterData;
        internal Source()=>Identity=new(User.Username,Company.TenantId,Company.CompanyId,Company.CompanyName,User.DisplayName,1,
            ["platform.status"],LegacyIdentityAuthority.Stamp(User),[Branch],new("all",null,false));
        internal DbDataReader Read(DbCommand command)
        {
            if(command.CommandText==SqlLegacyBranchScope.NativeUserText)
                return Rows([typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool),typeof(string)],
                    [[User.Username,User.StoredHash,User.Disabled,User.GroupId,!User.GroupEnabled,null]]);
            if(command.CommandText==SqlLegacyBranchScope.CatalogShapeText)return Rows([typeof(int)],[[1]]);
            if(command.CommandText==SqlLegacyBranchScope.CatalogText)return Rows([typeof(string),typeof(int)],[[Branch,0]]);
            if(command.CommandText.Contains("@@TRANCOUNT",StringComparison.Ordinal))return Rows([typeof(int),typeof(int)],[[1,1]]);
            var binding=ApiReferenceCatalog.Get("branch")!;
            if(command.CommandText.Contains("SELECT C.name,T.name",StringComparison.Ordinal))
                return Rows([typeof(string),typeof(string),typeof(short),typeof(bool)],binding.Columns.Select(column=>new object?[]{
                    column.Name,column.Type,(short)(int.Parse(column.TypeArguments!.Trim('(',')'),CultureInfo.InvariantCulture)
                        *(column.Type.StartsWith('n')?2:1)),column.Nullable}).ToArray());
            if(command.CommandText==SqlReferenceData.BatchText(binding,1))
            {var rows=Rows([typeof(int),typeof(string),typeof(string)],[[0,Branch,"Synthetic branch"]]);AfterData?.Invoke();return rows;}
            throw new InvalidOperationException("Unexpected synthetic query.");
        }
        private static DbDataReader Rows(Type[] types,object?[][] rows)
        {
            var table=new DataTable();foreach(var type in types)table.Columns.Add("C"+table.Columns.Count,type);
            foreach(var row in rows)table.Rows.Add(row.Select(value=>value??DBNull.Value).ToArray());return table.CreateDataReader();
        }
    }
}
