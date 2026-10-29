using System.Data;
using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
using Xunit;

namespace Medcom.Api.Tests;

public sealed class ErpConfigDriftTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 26, 2, 0, 0, TimeSpan.Zero);
    private static ErpConfigItem I(string category, string key, string? hash) => new(category, key, hash);

    [Fact]
    public void Matching_configuration_is_healthy_and_definition_visibility_is_not_a_change()
    {
        var baseline = new[] { I("form", "F|LYS1|Btn|C4", "AA"), I("control", "F|Btn", null), I("module", "P1", "BB") };
        var live = new[] { I("form", "F|LYS1|Btn|C4", "aa"), I("control", "F|Btn", null), I("module", "P1", null) };
        var report = ErpConfigDriftCheck.Compare(baseline, live, Now, "2026-10-26");
        Assert.Equal("healthy", report.Status);
        Assert.Empty(report.Changes);
        Assert.Equal(1, report.Unverifiable);
        Assert.Equal(3, report.Watched);
    }

    [Fact]
    public void A_new_trigger_a_switched_procedure_and_a_new_button_are_reported_by_name()
    {
        // The two production breakages of October: a button now calling another procedure, and
        // an INSTEAD OF trigger on a table the Web writes.
        var baseline = new[] { I("form", "IV_InboundRequestFrm|LYS1|ExecSQLWithParaButtonCtl|C4", "OLD"),
            I("module", "AP_PurchaseRequest_CreatePOStp", "P"), I("control", "IV_InboundRequestFrm|PrintButtonCtl", null) };
        var live = new[] { I("form", "IV_InboundRequestFrm|LYS1|ExecSQLWithParaButtonCtl|C4", "NEW"),
            I("module", "AP_PurchaseRequest_CreatePOStp", "MISSING"),
            I("trigger", "IV_InboundRequestDetailsTbl|IV_InboundRequest_SaveBatchAdapterTrg", "T"),
            I("control", "IV_InboundRequestFrm|ExecSQLWithParaButtonCtl_PartialCancel", null) };
        var report = ErpConfigDriftCheck.Compare(baseline, live, Now, "2026-10-26");
        Assert.Equal("drifted", report.Status);
        Assert.Equal(new[]
        {
            ("form","IV_InboundRequestFrm|LYS1|ExecSQLWithParaButtonCtl|C4","changed"),
            ("module","AP_PurchaseRequest_CreatePOStp","missing"),
            ("control","IV_InboundRequestFrm|ExecSQLWithParaButtonCtl_PartialCancel","added"),
            ("trigger","IV_InboundRequestDetailsTbl|IV_InboundRequest_SaveBatchAdapterTrg","added"),
            ("control","IV_InboundRequestFrm|PrintButtonCtl","removed"),
        }, report.Changes.Select(c => (c.Category, c.Key, c.Change)).ToArray());
    }

    [Fact]
    public async Task A_failed_read_is_unavailable_never_healthy()
    {
        var check = new ErpConfigDriftCheck(() => throw new InvalidOperationException("no db"), new ManualClock());
        var report = await check.RunAsync(default);
        Assert.Equal("unavailable", report.Status);
        Assert.NotNull(report.CheckedAt);
    }

    [Fact]
    public async Task The_snapshot_query_is_read_only_and_its_rows_are_compared()
    {
        string? text = null;
        var connection = new DisplayConnection(command =>
        {
            text = command.CommandText;
            var table = new DataTable();
            table.Columns.Add("Category", typeof(string)); table.Columns.Add("ItemKey", typeof(string)); table.Columns.Add("Hash", typeof(string));
            table.Rows.Add("module", "SOME_NEW_Stp", "AB");
            return table.CreateDataReader();
        });
        var report = await new ErpConfigDriftCheck(() => connection, new ManualClock()).RunAsync(default);
        Assert.Contains("SY_FrmCfg", text);
        Assert.Contains("sys.triggers", text);
        // ERP 29/10 save checks are reached only through form EBS/EBC text, so they are listed by name.
        Assert.Contains("N'AP_PurchaseRequest_OptionalPriceValidationFnc'", text);
        Assert.Contains("N'CF_Document_ExchangeRateValidationFnc'", text);
        foreach (var write in new[] { "INSERT dbo.", "UPDATE ", "DELETE ", "EXEC ", "MERGE ", "ALTER ", "DROP " })
            Assert.DoesNotContain(write, text!.Replace("INSERT @", "", StringComparison.Ordinal), StringComparison.OrdinalIgnoreCase);
        Assert.Contains(report.Changes, c => c.Key == "SOME_NEW_Stp" && c.Change == "added");
    }

    [Fact]
    public void The_embedded_baseline_covers_forms_procedures_and_triggers()
    {
        var check = new ErpConfigDriftCheck(() => throw new InvalidOperationException(), new ManualClock());
        Assert.Equal("2026-10-26", ErpConfigDriftCheck.Baseline);
        Assert.True(check.Latest.Watched >= 500);
        Assert.Equal("unavailable", check.Latest.Status);
    }

    [Fact]
    public void Readiness_carries_the_drift_status()
    {
        var readiness = new LegacyReadiness();
        string Status() => readiness.Check().Checks.Single(c => c.Component == "erp_config").Status;
        Assert.Equal("unavailable", Status());
        readiness.UpdateErpConfig("drifted");
        Assert.Equal("drifted", Status());
        readiness.UpdateErpConfig("anything");
        Assert.Equal("unavailable", Status());
    }
}
