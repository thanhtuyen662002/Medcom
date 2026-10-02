using System.Data;
using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using Medcom.Application;
using Medcom.Infrastructure;
using Microsoft.Data.SqlClient;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class LegacyRuntimeFactAttribute : FactAttribute
{
    public LegacyRuntimeFactAttribute()
    {
        if (new[] { "MEDCOM_TEST_SQL", "MEDCOM_LEGACY_TOOLS", "MEDCOM_TEST_HASH", "MEDCOM_TEST_SCHEMA" }
            .Any(key => string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key))))
            Skip = "Explicit disposable SQL + owner DLL fixture is required; this is not a production acceptance substitute.";
    }
}

public sealed class LegacyRuntimeTests
{
    private static LegacyPasswordVerifier Worker(string tools) => new(new(
        Path.Combine(Environment.GetEnvironmentVariable("DOTNET_ROOT")!, "dotnet"),
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../../../src/backend/Medcom.LegacyPasswordWorker/bin/Release/net10.0/Medcom.LegacyPasswordWorker.dll")),tools));

    [LegacyRuntimeFact, Trait("Category","LegacyRuntime")]
    public async Task ExactOwnerDllNormalPasswordAndIntegrityBoundary()
    {
        var tools=Environment.GetEnvironmentVariable("MEDCOM_LEGACY_TOOLS")!;
        var hash=Environment.GetEnvironmentVariable("MEDCOM_TEST_HASH")!;
        var worker=Worker(tools);
        Assert.Equal(PasswordOutcome.Accepted,await worker.VerifyAsync("web_synthetic_test","Synthetic-Only-482!",hash,default));
        Assert.Equal(PasswordOutcome.Rejected,await worker.VerifyAsync("web_synthetic_test","wrong",hash,default));
        Assert.Equal(PasswordOutcome.Rejected,await worker.VerifyAsync("other_synthetic","Synthetic-Only-482!",hash,default));
        Assert.Equal(PasswordOutcome.Rejected,await worker.VerifyAsync("web_synthetic_test","anything","malformed",default));
        var modified=Path.GetTempFileName();
        try { Assert.Equal(PasswordOutcome.Unavailable,await Worker(modified).VerifyAsync("web_synthetic_test","input",hash,default)); }
        finally { File.Delete(modified); }
    }

    [LegacyRuntimeFact, Trait("Category","LegacyRuntime")]
    public async Task SourceSchemaSqlIdentityRevocationAndScopedDocumentReads()
    {
        var adminBuilder=new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("MEDCOM_TEST_SQL"));
        // Runtime test can never target a remote or pre-existing ERP database.
        Assert.StartsWith("127.0.0.1,",adminBuilder.DataSource);
        Assert.Equal("master",adminBuilder.InitialCatalog);
        var database="medcom_test_"+Guid.NewGuid().ToString("N");
        await using var admin=new SqlConnection(adminBuilder.ConnectionString);
        await admin.OpenAsync();
        await Execute(admin,$"CREATE DATABASE [{database}];");
        var builder=new SqlConnectionStringBuilder(adminBuilder.ConnectionString) { InitialCatalog=database };
        try
        {
            await using var connection=new SqlConnection(builder.ConnectionString);
            await connection.OpenAsync();
            var schema=await File.ReadAllTextAsync(Environment.GetEnvironmentVariable("MEDCOM_TEST_SCHEMA")!);
            foreach(var batch in Regex.Split(schema,@"^\s*GO\s*$",RegexOptions.Multiline|RegexOptions.IgnoreCase))
            {
                if(string.IsNullOrWhiteSpace(batch))continue;
                Assert.Matches(@"^\s*CREATE TABLE \[dbo\]\.\[",batch);
                await Execute(connection,batch);
            }
            await Execute(connection,"""
                INSERT dbo.SY_UserGroup(UserGroupID,UserGroupName,IsDisable) VALUES('test_group',N'Synthetic Group',0);
                INSERT dbo.SY_User(UserName,HoTen,TenNgan,[Password],[Disable],UserGroupID,BranchID)
                VALUES('web_synthetic_test',N'Synthetic User',N'Synthetic',@hash,0,'test_group','BR-A');
                INSERT dbo.SY_Menu(MenuID,VN,MenuType,isBeginGroup,isDisable,isBold,FormName)
                VALUES('050129',N'Synthetic Orders',2,0,0,0,'AP_OrderFrm');
                INSERT dbo.SY_UserGroupPermisstion(ID,UserGroupID,MenuID,IsRun,IsAdd,IsUpdate,IsDelete,isAdmin)
                VALUES('synthetic_grant','test_group','050129',1,0,0,0,0);
                INSERT dbo.AP_OrderTbl(DocumentID,DocumentDate,ObjectID,CurrencyID,RateExchange,isLock,BranchID,StatusID)
                VALUES('ORDER-A','2026-10-01','SYNTHETIC','VND',1,0,'BR-A',1),
                      ('ORDER-B','2026-10-01','SYNTHETIC','VND',1,0,'BR-B',1),
                      ('ORDER%LITERAL','2026-10-01','SYNTHETIC','VND',1,0,'BR-A',1);
                """,Environment.GetEnvironmentVariable("MEDCOM_TEST_HASH"));
            var store=new SqlLegacyUserStore(builder.ConnectionString,true,true);
            await store.ProbeSchemaAsync(default);
            var readiness=new LegacyReadiness();
            using (var monitor=new Medcom.Api.LegacyHealthMonitor(store,Worker(Environment.GetEnvironmentVariable("MEDCOM_LEGACY_TOOLS")!),readiness))
            {
                await monitor.StartAsync(default);
                var deadline=DateTime.UtcNow.AddSeconds(10);
                while(readiness.Check().Checks.Any(check=>check.Component is "database" or "legacy_adapter" && check.Status!="healthy") && DateTime.UtcNow<deadline)
                    await Task.Delay(50);
                Assert.All(readiness.Check().Checks.Where(check=>check.Component is "database" or "legacy_adapter"),check=>Assert.Equal("healthy",check.Status));
                Assert.Equal("not_ready",readiness.Check().Status);
                Assert.Contains(readiness.Check().Checks,check=>check.Component=="business_release"&&check.Status=="unavailable");
                await monitor.StopAsync(default);
            }
            var company=new LegacyCompany("test-tenant","test-company","Synthetic Company");
            var authority=new LegacyIdentityAuthority(store,Worker(Environment.GetEnvironmentVariable("MEDCOM_LEGACY_TOOLS")!),company);
            Assert.Null(await store.FindAsync("' OR 1=1 --",default));
            var result=await authority.AuthenticateAsync("WEB_SYNTHETIC_TEST","Synthetic-Only-482!",default);
            Assert.Equal(IdentityOutcome.Success,result.Outcome);
            var identity=result.Identity!;
            Assert.Contains("purchase-orders.read",identity.Capabilities);
            Assert.Equal(new[]{"BR-A"},identity.BranchIds);
            Assert.Equal(IdentityOutcome.Rejected,(await authority.AuthenticateAsync("web_synthetic_test","wrong",default)).Outcome);
            var documents=new SqlDocumentReader(builder.ConnectionString,company,true);
            var page=await documents.ReadAsync(identity,DocumentKind.PurchaseOrders,new(),default);
            Assert.Equal(DocumentOutcome.Success,page.Outcome);
            Assert.Equal(2,page.Page!.Rows.Count);
            Assert.All(page.Page.Rows,row=>Assert.Equal("BR-A",row.BranchId));
            Assert.DoesNotContain(page.Page.Rows,row=>row.DocumentId=="ORDER-B");
            Assert.Equal(DocumentOutcome.Denied,(await documents.ReadAsync(identity,DocumentKind.PurchaseOrders,new(BranchId:"BR-B"),default)).Outcome);
            Assert.Equal(DocumentOutcome.Denied,(await documents.ReadAsync(identity,DocumentKind.InboundRequests,new(),default)).Outcome);
            var literal=await documents.ReadAsync(identity,DocumentKind.PurchaseOrders,new(Search:"%"),default);
            Assert.Single(literal.Page!.Rows); Assert.Equal("ORDER%LITERAL",literal.Page.Rows[0].DocumentId);
            var first=await documents.ReadAsync(identity,DocumentKind.PurchaseOrders,new(PageSize:1),default);
            Assert.True(first.Page!.HasMore); Assert.Single(first.Page.Rows);
            var root=Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,"../../../../../../"));
            await using (var server=await SecureTestServer.Start(identityAuthority:authority,documentReader:documents,
                webRoot:Path.Combine(root,"artifacts/server/wwwroot")))
            {
                using var browser=new Process { StartInfo=new("node")
                    { RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,UseShellExecute=false } };
                browser.StartInfo.ArgumentList.Add(Path.Combine(root,"tools/legacy/browser_runtime.mjs"));
                browser.StartInfo.ArgumentList.Add(server.Client.BaseAddress!.ToString().TrimEnd('/'));
                browser.Start();
                await browser.StandardInput.WriteAsync(JsonSerializer.Serialize(new { username="web_synthetic_test",password="Synthetic-Only-482!" }));
                browser.StandardInput.Close();
                var output=browser.StandardOutput.ReadToEndAsync(); var error=browser.StandardError.ReadToEndAsync();
                using var browserTimeout=new CancellationTokenSource(TimeSpan.FromSeconds(60));
                try { await browser.WaitForExitAsync(browserTimeout.Token); }
                finally { if(!browser.HasExited)browser.Kill(entireProcessTree:true); }
                Assert.True(browser.ExitCode==0,"Synthetic browser integration failed: "+await error);
                using var receipt=JsonDocument.Parse(await output);
                Assert.Equal("PASS",receipt.RootElement.GetProperty("status").GetString());
                Assert.Equal(403,receipt.RootElement.GetProperty("scopeWidening").GetInt32());
            }
            await Execute(connection,"UPDATE dbo.SY_UserGroupPermisstion SET IsRun=0 WHERE ID='synthetic_grant';");
            Assert.Equal(DocumentOutcome.Denied,(await documents.ReadAsync(identity,DocumentKind.PurchaseOrders,new(),default)).Outcome);
            var revalidated=await authority.RevalidateAsync(identity,default);
            Assert.Equal(IdentityOutcome.Success,revalidated.Outcome);
            Assert.DoesNotContain("purchase-orders.read",revalidated.Identity!.Capabilities);
            Assert.True(revalidated.Identity.AuthorityVersion>identity.AuthorityVersion);
            await Execute(connection,"UPDATE dbo.SY_User SET [Password]='changed' WHERE UserName='web_synthetic_test';");
            Assert.Equal(IdentityOutcome.Rejected,(await authority.RevalidateAsync(identity,default)).Outcome);
            await Execute(connection,"UPDATE dbo.SY_UserGroup SET IsDisable=1 WHERE UserGroupID='test_group';");
            Assert.Equal(IdentityOutcome.Rejected,(await authority.AuthenticateAsync("web_synthetic_test","Synthetic-Only-482!",default)).Outcome);
        }
        finally
        {
            SqlConnection.ClearAllPools();
            await Execute(admin,$"ALTER DATABASE [{database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{database}];");
        }
    }

    private static async Task Execute(SqlConnection connection,string sql,string? hash=null)
    {
        await using var command=new SqlCommand(sql,connection) { CommandTimeout=20 };
        if(hash is not null)command.Parameters.Add("@hash",SqlDbType.VarChar,200).Value=hash;
        await command.ExecuteNonQueryAsync();
    }
}
