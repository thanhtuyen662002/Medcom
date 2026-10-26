using Medcom.Infrastructure;
using Medcom.Infrastructure.Erp;
namespace Medcom.Api;

// Re-checks the ERP configuration the Web depends on shortly after start and every six hours,
// publishing the status in readiness ("erp_config") and the details at /api/platform/erp-config-drift.
public sealed class ErpConfigDriftMonitor(ErpConfigDriftCheck check, LegacyReadiness readiness,
    ILogger<ErpConfigDriftMonitor> logger) : BackgroundService
{
    internal static readonly TimeSpan FirstCheck = TimeSpan.FromSeconds(20);
    internal static readonly TimeSpan Interval = TimeSpan.FromHours(6);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(FirstCheck, stoppingToken); } catch (OperationCanceledException) { return; }
        while (!stoppingToken.IsCancellationRequested)
        {
            var report = await check.RunAsync(stoppingToken);
            readiness.UpdateErpConfig(report.Status);
            if (report.Status == "drifted")
                logger.LogWarning(new EventId(1012, "ErpConfigDrift"),
                    "ERP configuration differs from baseline {Baseline}: {Count} change(s): {Changes}",
                    report.Baseline, report.Changes.Count,
                    string.Join("; ", report.Changes.Take(20).Select(c => c.Change + " " + c.Category + " " + c.Key)));
            else if (report.Status == "unavailable")
                logger.LogWarning(new EventId(1012, "ErpConfigDrift"), "ERP configuration check could not read ERP.");
            try { await Task.Delay(Interval, stoppingToken); } catch (OperationCanceledException) { return; }
        }
    }
}
