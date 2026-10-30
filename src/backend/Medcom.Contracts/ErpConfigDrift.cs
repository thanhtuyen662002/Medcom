namespace Medcom.Contracts;

// Change is "added", "removed", "changed" or "missing" relative to the baseline the Web was last
// reconciled against. Keys name forms/controls/procedures/triggers only, never SQL text.
public sealed record ErpConfigDriftItem(string Category, string Key, string Change);

// Status: "healthy" (matches the baseline), "drifted" or "unavailable" (not checked yet / read failed).
public sealed record ErpConfigDriftReport(string Status, DateTimeOffset? CheckedAt, string Baseline,
    int Watched, int Unverifiable, IReadOnlyList<ErpConfigDriftItem> Changes);

// One ERP dropdown (SY_FrmDrdwTbl) whose metadata no longer matches what the Web lookup was qualified
// against; the Web refuses such a lookup (erp_lookup_binding_or_capacity_changed). Metadata only, never Source SQL.
public sealed record ErpLookupMismatch(string Field, string? Expected, string? Live);
public sealed record ErpLookupCheckItem(string Module, string LookupId, string Status, IReadOnlyList<ErpLookupMismatch> Mismatches);
public sealed record ErpLookupCheckReport(DateTimeOffset CheckedAt, int Checked, IReadOnlyList<ErpLookupCheckItem> Changed,
    IReadOnlyList<ErpFormConfigChange>? Forms = null);

// One SY_FrmCfg row of a workflow form that differs from the qualified catalog; the Web then refuses that
// screen's actions (native_form_configuration_changed). Values are shown only for a button caption (BT),
// lock expression (LBEX) and short flags, never command SQL.
public sealed record ErpFormConfigChange(string Module, string Key, string? Control, string? Property, string Change,
    string? Expected, string? Live);
