using Medcom.Infrastructure;
namespace Medcom.Api;

// Cached, bounded dependency probes. Anonymous health polling never starts workers or SQL calls.
public sealed class LegacyHealthMonitor(SqlLegacyUserStore database, ILegacyPasswordVerifier passwords,
    LegacyReadiness readiness) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        do
        {
            using var timeout=CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            var db=ProbeDatabase(timeout.Token); var legacy=ProbePassword(timeout.Token);
            await Task.WhenAll(db,legacy);
            readiness.Update(await db,await legacy);
            try { await Task.Delay(TimeSpan.FromSeconds(30),stoppingToken); }
            catch(OperationCanceledException) when(stoppingToken.IsCancellationRequested) { return; }
        } while(!stoppingToken.IsCancellationRequested);
    }
    private async Task<bool> ProbeDatabase(CancellationToken token)
    {
        try { await database.ProbeSchemaAsync(token); return true; }
        catch(Exception) { return false; }
    }
    private async Task<bool> ProbePassword(CancellationToken token)
    {
        try
        {
            // Public synthetic pure-DLL health vector. It is never a DB account or Web identity.
            return await passwords.VerifyAsync("__medcom_health__","HealthCheck-Only-v1!",
                "F84127E7F3113268789BB9FB63E81916558A5A",token)==PasswordOutcome.Accepted;
        }
        catch(Exception) { return false; }
    }
}
