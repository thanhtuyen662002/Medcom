using Medcom.Application.Audit;
using Medcom.Infrastructure.Audit;
using Microsoft.Data.SqlClient;
using Xunit;

namespace Medcom.Api.Tests;

/// <summary>
/// Opt-in: MEDCOM_AUDIT_TEST_SQL must name a disposable database whose name starts with
/// "MedcomAuditTest" (for example LocalDB). The test drops and recreates the log table there.
/// </summary>
public sealed class WebAuditSqlFactAttribute : FactAttribute
{
    public WebAuditSqlFactAttribute()
    {
        var value = Environment.GetEnvironmentVariable("MEDCOM_AUDIT_TEST_SQL");
        if (string.IsNullOrEmpty(value)) Skip = "Disposable SQL database for the activity log is required (MEDCOM_AUDIT_TEST_SQL).";
        else if (!new SqlConnectionStringBuilder(value).InitialCatalog.StartsWith("MedcomAuditTest", StringComparison.Ordinal))
            Skip = "MEDCOM_AUDIT_TEST_SQL must point at a database named MedcomAuditTest*.";
    }
}

public sealed class WebAuditSqlTests
{
    [WebAuditSqlFact, Trait("Category", "WebAuditSql")]
    public async Task Install_insert_search_detail_and_retention_work_on_sql_server()
    {
        var connection = Environment.GetEnvironmentVariable("MEDCOM_AUDIT_TEST_SQL")!;
        await using (var reset = new SqlConnection(connection))
        {
            await reset.OpenAsync();
            await using var drop = new SqlCommand("DROP TABLE IF EXISTS dbo.MedcomWebAuditLog;", reset);
            await drop.ExecuteNonQueryAsync();
        }
        var store = new SqlWebAuditStore(() => new SqlConnection(connection));
        Assert.False(await store.InstalledAsync(default));
        Assert.True(await store.InstallAsync(default));
        Assert.False(await store.InstallAsync(default));
        Assert.True(await store.InstalledAsync(default));

        var now = DateTimeOffset.UtcNow;
        var clientEvent = Guid.NewGuid();
        WebAuditEntry Command(string user, string document, int minutesAgo) =>
            new(now.AddMinutes(-minutesAgo), WebAuditSources.Server, WebAuditCategories.Command, "save", "success")
            {
                UserName = user, DisplayName = "Người dùng " + user, BranchId = "MB", Module = "sales-orders", DocumentId = document,
                HttpMethod = "POST", Path = "/api/erp/sales-orders/save", StatusCode = 200, DurationMs = 120,
                CorrelationId = Guid.NewGuid().ToString("N"), ClientAddress = "203.0.113.9",
                RequestData = "{\"branchId\":\"MB\",\"lines\":[{\"itemId\":\"VT-ĐẶC-BIỆT-01\",\"quantity\":\"5\"}]}",
                ResultData = "{\"outcome\":\"Committed\"}"
            };
        var click = new WebAuditEntry(now, WebAuditSources.Client, WebAuditCategories.Ui, "click", "observed")
        { UserName = "kho01", Page = "sales-orders", Target = "Lưu", ClientEventId = clientEvent, ClientTime = now.AddHours(-3) };
        await store.InsertAsync([Command("kho01", "DMB0926/0030", 5), Command("ketoan", "DMB0926/0031", 3), click, click], default);
        await store.InsertAsync([click], default); // browser retry of the same event
        var old = Command("kho01", "DMB0101/0001", 0) with { OccurredAt = now.AddMonths(-13) };
        await store.InsertAsync([old], default);

        var all = await store.SearchAsync(new(null, null, null, null, null, null, null, null, null, null, 1, 50), default);
        Assert.Equal(4, all!.TotalRows);
        Assert.Equal(clientEvent, (await store.DetailAsync(all.Items.Single(r => r.Action == "click").Id, default))!.ClientEventId);
        Assert.True(all.Items[0].OccurredAt >= all.Items[1].OccurredAt);

        var byUser = await store.SearchAsync(new(now.AddDays(-1), null, "kho", null, WebAuditCategories.Command, null, null, null, null, null, 1, 50), default);
        Assert.Equal("DMB0926/0030", Assert.Single(byUser!.Items).DocumentId);
        var byItem = await store.SearchAsync(new(null, null, null, null, null, null, null, null, null, "VT-ĐẶC-BIỆT", 1, 50), default);
        Assert.Equal(3, byItem!.TotalRows);
        var byDocument = await store.SearchAsync(new(null, null, null, "sales-orders", null, null, "success", "0926/0031", "MB", null, 1, 50), default);
        var row = Assert.Single(byDocument!.Items);
        Assert.Equal(("ketoan", true, true), (row.UserName, row.HasRequestData, row.HasResultData));
        var detail = await store.DetailAsync(row.Id, default);
        Assert.Contains("VT-ĐẶC-BIỆT-01", detail!.RequestData, StringComparison.Ordinal);
        Assert.Equal("Người dùng ketoan", detail.DisplayName);
        var wildcard = await store.SearchAsync(new(null, null, "%", null, null, null, null, null, null, null, 1, 50), default);
        Assert.Equal(0, wildcard!.TotalRows);
        var paged = await store.SearchAsync(new(null, null, null, null, null, null, null, null, null, null, 2, 3), default);
        Assert.Single(paged!.Items);

        Assert.Equal(1, await store.PurgeAsync(now.AddMonths(-12), 1, default));
        Assert.Equal(3, (await store.SearchAsync(new(null, null, null, null, null, null, null, null, null, null, 1, 50), default))!.TotalRows);
    }

    [WebAuditSqlFact, Trait("Category", "WebAuditSql")]
    public async Task Rows_recorded_before_installation_are_spooled_and_replayed_after_it()
    {
        var connection = Environment.GetEnvironmentVariable("MEDCOM_AUDIT_TEST_SQL")!;
        await using (var reset = new SqlConnection(connection))
        {
            await reset.OpenAsync();
            await using var drop = new SqlCommand("DROP TABLE IF EXISTS dbo.MedcomWebAuditLog;", reset);
            await drop.ExecuteNonQueryAsync();
        }
        var spool = Path.Combine(Path.GetTempPath(), "medcom-audit-spool-test-" + Guid.NewGuid().ToString("N"));
        var store = new SqlWebAuditStore(() => new SqlConnection(connection));
        var clock = new PurchaseClock();
        var writer = new WebAuditWriter(store, new WebAuditOptions(12, spool),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<WebAuditWriter>.Instance, clock);
        WebAuditEntry Entry(string action) => new(clock.GetUtcNow(), WebAuditSources.Server, WebAuditCategories.Read, action, "success") { UserName = "kho01" };
        try
        {
            await writer.StartAsync(default);
            foreach (var action in new[] { "list", "detail", "contract-info" }) writer.Write(Entry(action));
            await Until(() => Directory.Exists(spool) && Directory.EnumerateFiles(spool, "audit-*.jsonl").Any());

            Assert.True(await store.InstallAsync(default));
            clock.Now = clock.Now.AddMinutes(6); // the writer re-checks installation every 5 minutes
            writer.Write(Entry("attachments"));
            await Until(async () => (await store.SearchAsync(new(null, null, null, null, null, null, null, null, null, null, 1, 50), default))!.TotalRows == 4);
            await Until(() => !Directory.EnumerateFiles(spool, "audit-*.jsonl").Any());
        }
        finally
        {
            await writer.StopAsync(default);
            writer.Dispose();
            if (Directory.Exists(spool)) Directory.Delete(spool, recursive: true);
        }
    }

    private static Task Until(Func<bool> condition) => Until(() => Task.FromResult(condition()));
    private static async Task Until(Func<Task<bool>> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(20);
        while (!await condition())
        {
            Assert.True(DateTime.UtcNow < deadline, "Condition not reached in time.");
            await Task.Delay(100);
        }
    }
}
