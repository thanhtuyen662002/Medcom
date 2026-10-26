namespace Medcom.Contracts;

// Change is "added", "removed", "changed" or "missing" relative to the baseline the Web was last
// reconciled against. Keys name forms/controls/procedures/triggers only, never SQL text.
public sealed record ErpConfigDriftItem(string Category, string Key, string Change);

// Status: "healthy" (matches the baseline), "drifted" or "unavailable" (not checked yet / read failed).
public sealed record ErpConfigDriftReport(string Status, DateTimeOffset? CheckedAt, string Baseline,
    int Watched, int Unverifiable, IReadOnlyList<ErpConfigDriftItem> Changes);
