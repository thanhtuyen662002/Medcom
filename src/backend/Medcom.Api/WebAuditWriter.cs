using System.Text.Json;
using System.Threading.Channels;
using Medcom.Application.Audit;
using Medcom.Infrastructure.Audit;

namespace Medcom.Api;

internal sealed record WebAuditOptions(int RetentionMonths, string? SpoolDirectory, long SpoolLimitBytes = 512L * 1024 * 1024);

/// <summary>
/// Background writer for the activity log. Requests only enqueue (never wait on SQL).
/// Rows are inserted about once a second in batches. When SQL is unavailable or the
/// table is not installed yet, batches go to private spool files and are replayed later,
/// so nothing recorded before installation or during an outage is lost.
/// </summary>
internal sealed class WebAuditWriter(SqlWebAuditStore store, WebAuditOptions options, ILogger<WebAuditWriter> logger,
    TimeProvider clock) : BackgroundService, IWebAuditSink
{
    private const int BatchSize = 1000;
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly Channel<WebAuditEntry> queue = Channel.CreateBounded<WebAuditEntry>(new BoundedChannelOptions(50_000)
    { FullMode = BoundedChannelFullMode.DropWrite, SingleReader = true, SingleWriter = false });
    private long dropped;
    private bool installed;
    private DateTimeOffset nextInstallCheck = DateTimeOffset.MinValue, nextReplay = DateTimeOffset.MinValue, nextPurge = DateTimeOffset.MinValue;
    private DateTimeOffset lastFailureLog = DateTimeOffset.MinValue;

    public bool Enabled => true;

    public void Write(WebAuditEntry entry)
    {
        if (queue.Writer.TryWrite(entry)) return;
        if (Interlocked.Increment(ref dropped) % 1000 == 1)
            logger.LogWarning(new EventId(1201, "WebAuditDropped"), "Activity log queue full; {Dropped} entries dropped so far", Interlocked.Read(ref dropped));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var reader = queue.Reader;
        try
        {
            while (true)
            {
                using var tick = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                tick.CancelAfter(TimeSpan.FromSeconds(30));
                bool available;
                try { available = await reader.WaitToReadAsync(tick.Token); }
                catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested) { available = false; }
                if (available)
                {
                    // Gather a second's worth of rows into one insert.
                    try { await Task.Delay(TimeSpan.FromSeconds(1), clock, stoppingToken); } catch (OperationCanceledException) { }
                    var batch = Drain(reader);
                    if (batch.Count > 0) await StoreAsync(batch, CancellationToken.None);
                }
                if (stoppingToken.IsCancellationRequested) break;
                await MaintainAsync(stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        // Shutdown: keep what is still queued.
        var rest = Drain(reader, int.MaxValue);
        if (rest.Count > 0) await StoreAsync(rest, CancellationToken.None, shuttingDown: true);
    }

    private static List<WebAuditEntry> Drain(ChannelReader<WebAuditEntry> reader, int maximum = BatchSize)
    {
        var batch = new List<WebAuditEntry>();
        while (batch.Count < maximum && reader.TryRead(out var entry)) batch.Add(entry);
        return batch;
    }

    private async Task StoreAsync(List<WebAuditEntry> batch, CancellationToken token, bool shuttingDown = false)
    {
        if (await InstalledAsync(token))
        {
            try
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(shuttingDown ? 10 : 60));
                for (var i = 0; i < batch.Count; i += BatchSize)
                    await store.InsertAsync(batch.GetRange(i, Math.Min(BatchSize, batch.Count - i)), timeout.Token);
                return;
            }
            catch (Exception error)
            {
                installed = false; nextInstallCheck = clock.GetUtcNow().AddSeconds(30);
                LogFailure("insert", error);
            }
        }
        Spool(batch);
    }

    private async Task<bool> InstalledAsync(CancellationToken token)
    {
        if (installed) return true;
        var now = clock.GetUtcNow();
        if (now < nextInstallCheck) return false;
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            installed = await store.InstalledAsync(timeout.Token);
            if (!installed)
            {
                nextInstallCheck = now.AddMinutes(5);
                logger.LogWarning(new EventId(1202, "WebAuditNotInstalled"),
                    "Activity log table dbo.MedcomWebAuditLog is not installed; entries are kept in the spool until --install-web-audit runs");
            }
        }
        catch (Exception error)
        {
            nextInstallCheck = now.AddSeconds(30);
            LogFailure("check", error);
        }
        return installed;
    }

    private async Task MaintainAsync(CancellationToken token)
    {
        var now = clock.GetUtcNow();
        if (now >= nextReplay && options.SpoolDirectory is { } directory && Directory.Exists(directory))
        {
            nextReplay = now.AddMinutes(1);
            if (await InstalledAsync(token)) await ReplayAsync(directory, token);
        }
        if (options.RetentionMonths > 0 && now >= nextPurge && await InstalledAsync(token))
        {
            nextPurge = now.AddHours(24);
            try
            {
                var deleted = await store.PurgeAsync(now.AddMonths(-options.RetentionMonths), 5000, token);
                if (deleted > 0) logger.LogInformation(new EventId(1203, "WebAuditRetention"),
                    "Activity log retention removed {Deleted} entries older than {Months} months", deleted, options.RetentionMonths);
            }
            catch (Exception error) when (error is not OperationCanceledException) { LogFailure("retention", error); }
        }
    }

    private async Task ReplayAsync(string directory, CancellationToken token)
    {
        foreach (var file in Directory.EnumerateFiles(directory, "audit-*.jsonl").Order(StringComparer.Ordinal).ToArray())
        {
            try
            {
                var entries = new List<WebAuditEntry>();
                foreach (var line in await File.ReadAllLinesAsync(file, token))
                    if (line.Length > 0 && JsonSerializer.Deserialize<WebAuditEntry>(line, Json) is { } entry) entries.Add(entry);
                for (var i = 0; i < entries.Count; i += BatchSize)
                    await store.InsertAsync(entries.GetRange(i, Math.Min(BatchSize, entries.Count - i)), token);
                File.Delete(file);
            }
            catch (JsonException)
            {
                File.Move(file, file + ".invalid", overwrite: true);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                LogFailure("replay", error);
                return;
            }
        }
    }

    private void Spool(List<WebAuditEntry> batch)
    {
        if (options.SpoolDirectory is not { } directory)
        {
            Interlocked.Add(ref dropped, batch.Count);
            logger.LogWarning(new EventId(1201, "WebAuditDropped"), "Activity log has no spool folder; {Count} entries dropped", batch.Count);
            return;
        }
        try
        {
            Directory.CreateDirectory(directory);
            var used = new DirectoryInfo(directory).EnumerateFiles("audit-*.jsonl").Sum(f => f.Length);
            if (used > options.SpoolLimitBytes)
            {
                Interlocked.Add(ref dropped, batch.Count);
                logger.LogWarning(new EventId(1201, "WebAuditDropped"), "Activity log spool is full; {Count} entries dropped", batch.Count);
                return;
            }
            var name = Path.Combine(directory, "audit-" + clock.GetUtcNow().ToString("yyyyMMddHHmmssfff", System.Globalization.CultureInfo.InvariantCulture)
                + "-" + Guid.NewGuid().ToString("N")[..8] + ".jsonl");
            File.WriteAllLines(name, batch.Select(e => JsonSerializer.Serialize(e, Json)));
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException)
        {
            Interlocked.Add(ref dropped, batch.Count);
            LogFailure("spool", error);
        }
    }

    private void LogFailure(string stage, Exception error)
    {
        var now = clock.GetUtcNow();
        if (now - lastFailureLog < TimeSpan.FromMinutes(1)) return;
        lastFailureLog = now;
        logger.LogWarning(new EventId(1200, "WebAuditStoreUnavailable"),
            "Activity log storage unavailable; stage {Stage}; exception kind {ExceptionKind}; provider number {ProviderNumber}",
            stage, error.GetType().Name, error is Microsoft.Data.SqlClient.SqlException sql ? sql.Number : null);
    }
}
