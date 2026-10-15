using System.Data;
using System.Data.Common;
using System.Net;
using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
namespace Medcom.Api.Tests;

// Synthetic SQL orchestration plus real HTTPS/session middleware; no production rows.
public sealed class ErpPermissionsTests
{
    [Fact]
    public async Task All_screens_include_explicit_denials_and_reads_are_batched_and_read_only()
    {
        var source=new PermissionSource();source.Grants["purchase-requests"]=new(true,true,false,false);
        var result=await source.Service().PermissionsAsync("QA-A",default);
        Assert.Equal(ErpReadOutcome.Success,result.Outcome);Assert.Equal("QA-A",result.Value!.BranchId);
        Assert.Equal(19,result.Value.Screens.Count);Assert.Equal(2,source.GrantReads);
        Assert.Equal(1,source.Rows.Opens);Assert.Equal(1,source.Rows.Rollbacks);Assert.Equal(0,source.Rows.Commits);
        Assert.Equal(1,source.Rows.ConnectionDisposals);Assert.Equal(1,source.Rows.TransactionDisposals);
        var purchase=result.Value.Screens.Single(s=>s.Module=="purchase-requests");
        Assert.True(purchase.CanView);Assert.Equal(new(true,true,false,false),purchase.Crud);
        Assert.True(purchase.Actions.Single(a=>a.Id=="create").Visible);
        Assert.False(purchase.Actions.Single(a=>a.Id=="submit").Visible);
        Assert.All(result.Value.Screens.Where(s=>s.Module!="purchase-requests"),screen=>
        {Assert.False(screen.CanView);Assert.All(screen.Actions,a=>{Assert.False(a.Visible);Assert.Null(a.Route);});});
        Assert.DoesNotContain(source.Rows.Commands,c=>c.Sql.Contains("AP_PurchaseRequestTbl",StringComparison.Ordinal));
    }
    [Theory]
    [InlineData("no-capability")][InlineData("disabled-menu")][InlineData("wrong-form")][InlineData("parameterized-menu")][InlineData("missing-menu")]
    public async Task A_menu_must_be_bound_enabled_and_present_in_the_live_session(string scenario)
    {
        var source=new PermissionSource{Scenario=scenario};source.Grants["purchase-requests"]=new(true,true,true,true);
        if(scenario=="no-capability")source.Rows.Identity=source.Rows.Identity! with{Capabilities=[]};
        var result=await source.Service().PermissionsAsync("QA-A",default);
        Assert.Equal(ErpReadOutcome.Success,result.Outcome);
        Assert.False(result.Value!.Screens.Single(s=>s.Module=="purchase-requests").CanView);
    }
    [Theory]
    [InlineData("duplicate-menu",ErpReadOutcome.Unavailable)][InlineData("extra-result",ErpReadOutcome.Unavailable)]
    [InlineData("sql-error",ErpReadOutcome.Unavailable)][InlineData("revoked-grant",ErpReadOutcome.Denied)]
    [InlineData("revoked-session",ErpReadOutcome.Denied)][InlineData("cleanup-revocation",ErpReadOutcome.Denied)]
    [InlineData("disabled-user",ErpReadOutcome.Denied)][InlineData("changed-credential",ErpReadOutcome.Denied)]
    [InlineData("changed-branches",ErpReadOutcome.Denied)]
    public async Task Invalid_or_changed_authority_never_releases_partial_grants(string scenario,ErpReadOutcome expected)
    {
        var source=new PermissionSource{Scenario=scenario};source.Grants["purchase-requests"]=new(true,true,true,true);
        if(scenario=="disabled-user")source.Rows.Disabled=true;
        if(scenario=="changed-credential")source.Rows.StoredHash="changed";
        if(scenario=="changed-branches")source.Rows.NativeBranches=["QA-A"];
        if(scenario=="cleanup-revocation")source.Rows.AfterCleanup=()=>source.Rows.Identity=null;
        var result=await source.Service().PermissionsAsync("QA-A",default);
        Assert.Equal(expected,result.Outcome);Assert.Null(result.Value);Assert.Equal(0,source.Rows.Commits);
        Assert.Equal(1,source.Rows.Rollbacks);Assert.Equal(1,source.Rows.ConnectionDisposals);
    }
    [Theory]
    [InlineData("",ErpReadOutcome.Invalid)][InlineData("OTHER",ErpReadOutcome.Denied)]
    public async Task Missing_or_outside_branch_is_rejected_before_SQL(string branch,ErpReadOutcome expected)
    {
        var source=new PermissionSource();var result=await source.Service().PermissionsAsync(branch,default);
        Assert.Equal(expected,result.Outcome);Assert.Null(result.Value);Assert.Equal(0,source.Rows.Opens);
    }
    [Fact]
    public async Task Cancellation_and_missing_local_session_inspection_fail_closed()
    {
        var source=new PermissionSource();using var cancellation=new CancellationTokenSource();cancellation.Cancel();
        Assert.Equal(ErpReadOutcome.Cancelled,(await source.Service().PermissionsAsync("QA-A",cancellation.Token)).Outcome);
        var unavailable=new SqlErpScreenService(PurchaseQuerySource.Company,()=>new QueryConnection(source.Rows),_=>Task.FromResult(source.Rows.Identity));
        Assert.Equal(ErpReadOutcome.Unavailable,(await unavailable.PermissionsAsync("QA-A",default)).Outcome);
    }
    [Fact]
    public async Task HTTPS_endpoint_uses_current_actor_and_rejects_role_or_user_overrides()
    {
        var source=new PermissionSource();source.Grants["purchase-requests"]=new(true,false,true,false);
        await using var fixture=await PurchaseHttpFixture.Start(services=>services.AddSingleton<IErpScreenService>(source.Service()));
        using(var anonymous=await fixture.Client.GetAsync("/api/erp/permissions?branchId=QA-A"))Assert.Equal(HttpStatusCode.Unauthorized,anonymous.StatusCode);
        await fixture.Login();
        var body=await fixture.Json("/api/erp/permissions?branchId=QA-A");
        Assert.Equal(64,body.GetProperty("readScope").GetString()!.Length);
        Assert.Equal(19,body.GetProperty("data").GetProperty("screens").GetArrayLength());
        var sample=body.GetProperty("data").GetProperty("screens")[0].GetProperty("actions")[0];
        Assert.False(sample.TryGetProperty("name",out _));Assert.False(sample.TryGetProperty("referenceState",out _));
        foreach(var query in new[]{"branchId=QA-A&role=admin","branchId=QA-A&userName=other","branchId=QA-A&branchId=QA-B"})
        {using var bad=await fixture.Client.GetAsync("/api/erp/permissions?"+query);Assert.Equal(HttpStatusCode.BadRequest,bad.StatusCode);}
        using var missing=await fixture.Client.GetAsync("/api/erp/permissions");Assert.Equal(HttpStatusCode.BadRequest,missing.StatusCode);
        using var outside=await fixture.Client.GetAsync("/api/erp/permissions?branchId=OTHER");Assert.Equal(HttpStatusCode.Forbidden,outside.StatusCode);
        source.Scenario="sql-error";
        using var failed=await fixture.Client.GetAsync("/api/erp/permissions?branchId=QA-A");Assert.Equal(HttpStatusCode.ServiceUnavailable,failed.StatusCode);
    }
    [Fact]
    public async Task An_authenticated_user_without_ERP_grants_can_get_explicit_hidden_screens()
    {
        var source=new PermissionSource();source.Rows.Identity=source.Rows.Identity! with{Capabilities=[]};
        await using var fixture=await PurchaseHttpFixture.Start(services=>services.AddSingleton<IErpScreenService>(source.Service()));
        fixture.Authority.Identity=fixture.Authority.Identity with{Capabilities=[]};await fixture.Login();
        var body=await fixture.Json("/api/erp/permissions?branchId=QA-A");
        Assert.All(body.GetProperty("data").GetProperty("screens").EnumerateArray(),screen=>Assert.False(screen.GetProperty("canView").GetBoolean()));
    }
    private sealed class PermissionSource
    {
        internal readonly PurchaseQuerySource Rows=new();
        internal readonly Dictionary<string,ErpNativeRights> Grants=new(StringComparer.Ordinal);
        internal string? Scenario;internal int GrantReads;
        internal PermissionSource()
        {
            Rows.Identity=Rows.Identity! with{Capabilities=ErpScreenCatalog.ModuleIds.Select(m=>m+".read").ToArray(),BranchSelection=new("assigned","QA-A",true)};
            Rows.PermissionRead=Read;
        }
        internal SqlErpScreenService Service()=>new(PurchaseQuerySource.Company,()=>new QueryConnection(Rows),
            token=>{token.ThrowIfCancellationRequested();return Task.FromResult(Rows.Identity);},_=>Task.FromResult(Rows.Identity));
        private DbDataReader? Read(QueryCommand command)
        {
            static DataTable Table(params Type[] types){var table=new DataTable();for(var i=0;i<types.Length;i++)table.Columns.Add("c"+i,types[i]);return table;}
            if(command.CommandText=="SELECT @@TRANCOUNT,CONVERT(int,XACT_STATE());")
            {var table=Table(typeof(int),typeof(int));table.Rows.Add(1,1);return table.CreateDataReader();}
            if(command.CommandText.Contains("SELECT TOP(2) U.UserName,U.[Password]",StringComparison.Ordinal))
            {
                Assert.Equal(Rows.Username,command.Parameters["@actor"].Value);
                var table=Table(typeof(string),typeof(string),typeof(bool),typeof(string),typeof(bool));
                table.Rows.Add(Rows.Username,Rows.StoredHash,Rows.Disabled,Rows.Group,false);return table.CreateDataReader();
            }
            if(!command.CommandText.Contains(ErpSqlAuthority.GrantProjection,StringComparison.Ordinal))return null;
            Assert.StartsWith(SqlLegacyPolicy.GrantsCte,command.CommandText);
            Assert.Equal(Rows.Username,command.Parameters["@username"].Value);Assert.Equal(Rows.Group,command.Parameters["@group"].Value);
            Assert.Equal(21,command.Parameters.Count);Assert.All(command.Parameters.Cast<DbParameter>(),p=>Assert.Equal(DbType.AnsiString,p.DbType));
            GrantReads++;if(Scenario=="sql-error")throw new InvalidOperationException("Synthetic database failure");
            var result=Table(typeof(string),typeof(string),typeof(bool),typeof(string),typeof(int),typeof(int),typeof(int),typeof(int));
            foreach(var screen in ErpScreenCatalog.ModuleIds.Select(m=>ErpScreenCatalog.Get(m)!))
            {
                if(Scenario=="missing-menu")continue;
                var rights=Grants.GetValueOrDefault(screen.Id,new(false,false,false,false));
                if(Scenario=="revoked-grant"&&GrantReads>1)rights=new(false,false,false,false);
                result.Rows.Add(screen.MenuId,Scenario=="wrong-form"?"OTHER":screen.FormId,Scenario=="disabled-menu",
                    Scenario=="parameterized-menu"?"OTHER":"",rights.Read?1:0,rights.Add?1:0,rights.Update?1:0,rights.Delete?1:0);
            }
            if(Scenario=="duplicate-menu")result.Rows.Add(result.Rows[0].ItemArray);
            if(Scenario=="revoked-session"&&GrantReads==2)Rows.Identity=null;
            return Scenario=="extra-result"?new DataTableReader([result,result.Clone()]):result.CreateDataReader();
        }
    }
}
