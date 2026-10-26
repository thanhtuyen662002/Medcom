using System.Data.Common;
using System.Text.Json;
using Medcom.Contracts;

namespace Medcom.Infrastructure.Erp;

public sealed record ErpConfigItem(string Category, string Key, string? Hash);

// Compares the ERP configuration the Web depends on (buttons/hooks of the 19 Web forms, the
// procedures they and the Web call, triggers on tables the Web writes) with the baseline captured
// when the Web was last reconciled with ERP. ERP changes after that (a new INSTEAD OF trigger, a
// button switched to a new procedure) surface here instead of as a failed save in production.
public sealed class ErpConfigDriftCheck
{
    internal const int MaximumReportedChanges = 200;
    private static readonly string SnapshotSql = Resource("Medcom.ErpConfigSnapshot.sql");
    private static readonly (string CapturedAt, IReadOnlyList<ErpConfigItem> Items) BaselineData = LoadBaseline();
    private readonly Func<DbConnection> connect;
    private readonly TimeProvider clock;

    public ErpConfigDriftCheck(SqlLegacyUserStore store, TimeProvider clock) : this(store.CreateConnection, clock) { }
    internal ErpConfigDriftCheck(Func<DbConnection> connect, TimeProvider clock)
    {
        this.connect = connect;
        this.clock = clock;
        Latest = new("unavailable", null, Baseline, BaselineData.Items.Count, 0, []);
    }

    public static string Baseline => BaselineData.CapturedAt;
    public ErpConfigDriftReport Latest { get; private set; }

    public async Task<ErpConfigDriftReport> RunAsync(CancellationToken token)
    {
        try
        {
            await using var connection = connect();
            await connection.OpenAsync(token);
            await using var command = connection.CreateCommand();
            command.CommandText = SnapshotSql;
            command.CommandTimeout = 60;
            var live = new List<ErpConfigItem>();
            await using (var reader = await command.ExecuteReaderAsync(token))
                while (await reader.ReadAsync(token))
                    live.Add(new(reader.GetString(0), reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2).Trim()));
            Latest = Compare(BaselineData.Items, live, clock.GetUtcNow(), Baseline);
        }
        catch (Exception) when (!token.IsCancellationRequested)
        {
            // A failed read is "unavailable", never "healthy": keep the last changes for diagnosis.
            Latest = Latest with { Status = "unavailable", CheckedAt = clock.GetUtcNow() };
        }
        return Latest;
    }

    public static ErpConfigDriftReport Compare(IReadOnlyList<ErpConfigItem> baseline, IReadOnlyList<ErpConfigItem> live,
        DateTimeOffset checkedAt, string baselineName)
    {
        static (string, string) Key(ErpConfigItem item) => (item.Category, item.Key);
        var expected = baseline.GroupBy(Key).ToDictionary(g => g.Key, g => g.First().Hash);
        var observed = live.GroupBy(Key).ToDictionary(g => g.Key, g => g.First().Hash);
        var changes = new List<ErpConfigDriftItem>();
        var unverifiable = 0;
        foreach (var (key, hash) in expected.OrderBy(p => p.Key.Item1, StringComparer.Ordinal).ThenBy(p => p.Key.Item2, StringComparer.Ordinal))
        {
            if (!observed.TryGetValue(key, out var now)) { changes.Add(new(key.Item1, key.Item2, "removed")); continue; }
            if (now == "MISSING" && hash != "MISSING") { changes.Add(new(key.Item1, key.Item2, "missing")); continue; }
            if (hash is null && now is null) continue;
            // The SQL account may not see a definition; that is unknown, not a change.
            if (now is null || hash is null) { unverifiable++; continue; }
            if (!string.Equals(hash, now, StringComparison.OrdinalIgnoreCase)) changes.Add(new(key.Item1, key.Item2, "changed"));
        }
        foreach (var key in observed.Keys.Where(k => !expected.ContainsKey(k)).OrderBy(k => k.Item1, StringComparer.Ordinal).ThenBy(k => k.Item2, StringComparer.Ordinal))
            changes.Add(new(key.Item1, key.Item2, "added"));
        // What can break a Web command first; the list is capped for a mass change.
        static int Rank(string change) => change switch { "changed" => 0, "missing" => 1, "added" => 2, _ => 3 };
        var ordered = changes.OrderBy(c => Rank(c.Change)).ThenBy(c => c.Category, StringComparer.Ordinal).ThenBy(c => c.Key, StringComparer.Ordinal);
        return new(changes.Count == 0 ? "healthy" : "drifted", checkedAt, baselineName, expected.Count, unverifiable,
            Array.AsReadOnly(ordered.Take(MaximumReportedChanges).ToArray()));
    }

    private static string Resource(string name)
    {
        using var stream = typeof(ErpConfigDriftCheck).Assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException("ERP configuration snapshot resource missing.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static (string, IReadOnlyList<ErpConfigItem>) LoadBaseline()
    {
        using var document = JsonDocument.Parse(Resource("Medcom.ErpConfigBaseline"));
        var root = document.RootElement;
        var items = root.GetProperty("items").EnumerateArray().Select(item => new ErpConfigItem(
            item.GetProperty("category").GetString()!, item.GetProperty("key").GetString()!,
            item.GetProperty("hash").ValueKind == JsonValueKind.Null ? null : item.GetProperty("hash").GetString())).ToArray();
        return (root.GetProperty("capturedAt").GetString()!, Array.AsReadOnly(items));
    }
}
