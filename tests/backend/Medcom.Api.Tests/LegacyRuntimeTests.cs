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
    public LegacyRuntimeFactAttribute(bool transferChecks = false)
    {
        if (new[] { "MEDCOM_TEST_SQL", "MEDCOM_LEGACY_TOOLS", "MEDCOM_TEST_HASH", "MEDCOM_TEST_SCHEMA" }
            .Any(key => string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key))))
            Skip = "Explicit disposable SQL + owner DLL fixture is required; this is not a production acceptance substitute.";
        if (transferChecks && string.IsNullOrEmpty(Environment.GetEnvironmentVariable("MEDCOM_TEST_TRANSFER_SCHEMA")))
            Skip = "Full verified source workflow fixture is required.";
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
                INSERT dbo.AP_OrderDetailTbl(UserAutoID,DocumentID,ItemID,Quantity,Quantity2)
                VALUES('LINE-A1','ORDER-A',N'ITEM-A',12345678901234567890123456.78,1.2345),
                      ('LINE-A2','ORDER-A',N'ITEM-NULL',NULL,NULL),
                      ('LINE-B','ORDER-B',N'HIDDEN-ITEM',999,1),
                      ('LINE-ORPHAN','MISSING',N'ORPHAN-ITEM',888,1);
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
            var detail=await documents.ReadDetailAsync(identity,DocumentKind.PurchaseOrders,new("ORDER-A",PageSize:1),default);
            Assert.Equal(DocumentOutcome.Success,detail.Outcome);
            Assert.Equal("ORDER-A",detail.Detail!.Document.DocumentId);
            Assert.True(detail.Detail.HasMore); Assert.Empty(detail.Detail.InboundRequestLines);
            var line=Assert.Single(detail.Detail.PurchaseOrderLines);
            Assert.Equal("12345678901234567890123456.78",line.Quantity); Assert.Equal("1.2345",line.Quantity2);
            var secondLine=await documents.ReadDetailAsync(identity,DocumentKind.PurchaseOrders,new("ORDER-A",2,1),default);
            Assert.False(secondLine.Detail!.HasMore); Assert.Null(Assert.Single(secondLine.Detail.PurchaseOrderLines).Quantity);
            Assert.Empty((await documents.ReadDetailAsync(identity,DocumentKind.PurchaseOrders,new("ORDER-A",3,1),default)).Detail!.PurchaseOrderLines);
            Assert.Empty((await documents.ReadDetailAsync(identity,DocumentKind.PurchaseOrders,new("ORDER%LITERAL"),default)).Detail!.PurchaseOrderLines);
            foreach(var id in new[]{"ORDER-B","MISSING","' OR 1=1 --"})
                Assert.Equal(DocumentOutcome.NotFound,(await documents.ReadDetailAsync(identity,DocumentKind.PurchaseOrders,new(id),default)).Outcome);
            Assert.Equal(DocumentOutcome.Invalid,(await documents.ReadDetailAsync(identity,DocumentKind.PurchaseOrders,new(new string('x',31)),default)).Outcome);
            Assert.Equal(DocumentOutcome.Denied,(await documents.ReadDetailAsync(identity with { CompanyId="another" },DocumentKind.PurchaseOrders,new("ORDER-A"),default)).Outcome);
            Assert.Equal(DocumentOutcome.Denied,(await documents.ReadDetailAsync(identity,DocumentKind.InboundRequests,new("ORDER-A"),default)).Outcome);

            // The second reviewed shape uses its own source columns and enabled menu.
            await Execute(connection,"""
                INSERT dbo.SY_Menu(MenuID,VN,MenuType,isBeginGroup,isDisable,isBold,FormName)
                VALUES('07011',N'Synthetic Inbound',2,0,0,0,'IV_InboundRequestFrm');
                INSERT dbo.SY_UserGroupPermisstion(ID,UserGroupID,MenuID,IsRun,IsAdd,IsUpdate,IsDelete,isAdmin)
                VALUES('synthetic_inbound','test_group','07011',1,0,0,0,0);
                INSERT dbo.IV_InboundRequestTbl(DocumentID,DocumentDate,OrderNumber,BranchID,InvoiceNo,DeparturePoint,DestinationPoint,OrderTypeID,StatusID,QRPrintType)
                VALUES('INBOUND-A','2026-10-01',N'SYNTHETIC','BR-A',N'SYNTHETIC',N'TEST',N'TEST',N'TEST',1,'TEST'),
                      ('INBOUND-B','2026-10-01',N'SYNTHETIC','BR-B',N'SYNTHETIC',N'TEST',N'TEST',N'TEST',1,'TEST');
                INSERT dbo.IV_InboundRequestDetailsTbl(UserAutoID,DocumentID,ItemID,SetQuantityByDocument,BarrelQuantityByDocument,SetQuantityByReal,BarrelQuantityByReal)
                VALUES('IN-LINE-A','INBOUND-A','IN-ITEM',123456789012345678,10,NULL,9),
                      ('IN-LINE-B','INBOUND-B','HIDDEN-IN-ITEM',999,999,999,999);
                """);
            var inboundIdentity=(await authority.RevalidateAsync(identity,default)).Identity!;
            var inbound=await documents.ReadDetailAsync(inboundIdentity,DocumentKind.InboundRequests,new("INBOUND-A"),default);
            Assert.Equal(DocumentOutcome.Success,inbound.Outcome); Assert.Null(inbound.Detail!.Document.IsLocked);
            Assert.Empty(inbound.Detail.PurchaseOrderLines);
            var inboundLine=Assert.Single(inbound.Detail.InboundRequestLines);
            Assert.Equal("123456789012345678",inboundLine.SetQuantityByDocument);
            Assert.Null(inboundLine.SetQuantityByReal); Assert.Equal("9",inboundLine.BarrelQuantityByReal);
            Assert.Equal(DocumentOutcome.NotFound,(await documents.ReadDetailAsync(inboundIdentity,DocumentKind.InboundRequests,new("INBOUND-B"),default)).Outcome);
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
            Assert.Equal(DocumentOutcome.Denied,(await documents.ReadDetailAsync(identity,DocumentKind.PurchaseOrders,new("ORDER-A"),default)).Outcome);
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

    [LegacyRuntimeFact(transferChecks:true), Trait("Category","LegacyRuntime")]
    public async Task ActualTransferCheckProceduresEnforceSourceAssignmentsAndStatuses()
    {
        var adminBuilder=new SqlConnectionStringBuilder(Environment.GetEnvironmentVariable("MEDCOM_TEST_SQL"));
        Assert.StartsWith("127.0.0.1,",adminBuilder.DataSource); Assert.Equal("master",adminBuilder.InitialCatalog);
        var database="medcom_test_"+Guid.NewGuid().ToString("N");
        await using var admin=new SqlConnection(adminBuilder.ConnectionString);await admin.OpenAsync();
        await Execute(admin,$"CREATE DATABASE [{database}];");
        try
        {
            var builder=new SqlConnectionStringBuilder(adminBuilder.ConnectionString) { InitialCatalog=database };
            await using var connection=new SqlConnection(builder.ConnectionString);await connection.OpenAsync();
            var schema=await File.ReadAllTextAsync(Environment.GetEnvironmentVariable("MEDCOM_TEST_TRANSFER_SCHEMA")!);
            foreach(var batch in Regex.Split(schema,@"^\s*GO\s*$",RegexOptions.Multiline|RegexOptions.IgnoreCase))
            {
                if(string.IsNullOrWhiteSpace(batch))continue;
                Assert.Matches(@"^\s*CREATE\s+(TABLE|PROCEDURE)\s+\[dbo\]\.\[",batch);
                await Execute(connection,batch);
            }
            await Execute(connection,"""
                INSERT dbo.IV_InternalTransferRequestTbl(DocumentID,DocumentDate,SalesUser,BranchID,FromBranchID,ToBranchID,AssignedPM,StatusID,isLock)
                VALUES(N'REQUEST-TEST','2026-10-02','SYNTHETIC-SALES','BR-A','BR-A','BR-B','SYNTHETIC-PM',0,0);
                INSERT dbo.IV_InternalTransferBatchTbl(BatchID,BatchDate,FromBranchID,ToBranchID,AssignedPM,AssignedTechnician,HasEquipment,StatusID,isLock)
                VALUES('BATCH-TEST','2026-10-02','BR-A','BR-B','SYNTHETIC-PM','SYNTHETIC-TECH',0,0,0);
                """);
            async Task<bool> Denied(string name,string id,string context,bool status=false)
            {
                await using var command=new SqlCommand("dbo.IV_InternalTransfer_"+name,connection) { CommandType=CommandType.StoredProcedure,CommandTimeout=5 };
                command.Parameters.Add(name.StartsWith("Request",StringComparison.Ordinal)?"@DocumentID":"@BatchID",SqlDbType.VarChar,30).Value=id;
                command.Parameters.Add(status?"@Status":"@User",SqlDbType.VarChar,100).Value=context;
                await using var reader=await command.ExecuteReaderAsync();
                var denied=await reader.ReadAsync();
                if(denied)Assert.Equal(1,reader.GetInt32(reader.GetOrdinal("MsgType")));
                return denied;
            }
            Assert.False(await Denied("RequestCheckEditStp","REQUEST-TEST","SYNTHETIC-SALES"));
            Assert.True(await Denied("RequestCheckEditStp","REQUEST-TEST","OTHER"));
            Assert.False(await Denied("RequestCheckDeleteStp","REQUEST-TEST","SYNTHETIC-SALES"));
            Assert.True(await Denied("RequestCheckDeleteStp","REQUEST-TEST","OTHER"));
            await Execute(connection,"UPDATE dbo.IV_InternalTransferRequestTbl SET StatusID=30;");
            Assert.False(await Denied("RequestCheckEditStp","REQUEST-TEST","SYNTHETIC-SALES"));
            Assert.True(await Denied("RequestCheckDeleteStp","REQUEST-TEST","SYNTHETIC-SALES"));
            await Execute(connection,"UPDATE dbo.IV_InternalTransferRequestTbl SET StatusID=10;");
            Assert.True(await Denied("RequestCheckEditStp","REQUEST-TEST","SYNTHETIC-SALES"));
            Assert.False(await Denied("RequestPMCheckEditStp","REQUEST-TEST","SYNTHETIC-PM"));
            Assert.True(await Denied("RequestPMCheckEditStp","REQUEST-TEST","OTHER"));
            Assert.True(await Denied("RequestPMCheckEditStp","MISSING","SYNTHETIC-PM"));

            Assert.False(await Denied("BatchCheckDeleteStp","BATCH-TEST","SYNTHETIC-PM"));
            Assert.True(await Denied("BatchCheckDeleteStp","BATCH-TEST","OTHER"));
            await Execute(connection,"INSERT dbo.IV_InternalTransferBatchRequestTbl(UserAutoID,BatchID,RequestID) VALUES('SYNTHETIC-LINK','BATCH-TEST',N'REQUEST-TEST');");
            Assert.True(await Denied("BatchCheckDeleteStp","BATCH-TEST","SYNTHETIC-PM"));
            await Execute(connection,"DELETE dbo.IV_InternalTransferBatchRequestTbl; UPDATE dbo.IV_InternalTransferBatchTbl SET AssignedPM=NULL;");
            Assert.False(await Denied("BatchCheckDeleteStp","BATCH-TEST","OTHER"));
            foreach(var sourceStatus in new[]{0,10,25,45})
            {
                await Execute(connection,$"UPDATE dbo.IV_InternalTransferBatchTbl SET StatusID={sourceStatus},AssignedPM='SYNTHETIC-PM';");
                Assert.False(await Denied("BatchPMCheckEditStp","BATCH-TEST","SYNTHETIC-PM"));
                Assert.True(await Denied("BatchPMCheckEditStp","BATCH-TEST","OTHER"));
            }
            await Execute(connection,"UPDATE dbo.IV_InternalTransferBatchTbl SET StatusID=20;");
            Assert.True(await Denied("BatchPMCheckEditStp","BATCH-TEST","SYNTHETIC-PM"));
            Assert.False(await Denied("BatchTechCheckEditStp","BATCH-TEST","SYNTHETIC-TECH"));
            Assert.True(await Denied("BatchTechCheckEditStp","BATCH-TEST","OTHER"));
            Assert.False(await Denied("BatchRoleCheckEditStp","BATCH-TEST","20,21",true));
            Assert.True(await Denied("BatchRoleCheckEditStp","BATCH-TEST","30,40",true));
            Assert.True(await Denied("BatchRoleCheckEditStp","BATCH-TEST","invalid",true));
            await Execute(connection,"UPDATE dbo.IV_InternalTransferBatchTbl SET StatusID=21;");
            Assert.False(await Denied("BatchTechCheckEditStp","BATCH-TEST","SYNTHETIC-TECH"));
            await Execute(connection,"UPDATE dbo.IV_InternalTransferBatchTbl SET StatusID=30;");
            Assert.True(await Denied("BatchTechCheckEditStp","BATCH-TEST","SYNTHETIC-TECH"));
        }
        finally
        {
            SqlConnection.ClearAllPools();
            await Execute(admin,$"ALTER DATABASE [{database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{database}];");
        }
    }
}
