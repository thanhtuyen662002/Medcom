# ERP stable-ID coverage and remaining acceptance gaps

This checkpoint consolidates only evidence already recovered from the authoritative `ERP_Medcom2026(4).zip` baseline. It is intentionally a coverage/acceptance document rather than a raw artifact dump.

## Durable evidence now available

### Package and layout surface
- `ERP-CFG-*` stable IDs exist for persisted DAT configuration/layout artifacts.
- All 232 packaged DAT files were XML-parseable in the source analysis.
- 170 DAT basenames contain `Frm`; filter artifacts are treated separately from form-presence evidence.
- Persisted grid semantics directly observed include grid/column identifiers, width, visibility, position, aggregation and wrapping.
- 24 filter DAT artifacts provide typed/operator/order/visibility metadata; 11 form families have master/detail filter pairs.

### Form presence
- Root executable/resource metadata provides candidate current form identifiers across AR/AP/CS/FA/GJ/IV/SY.
- 23 form identifiers have independent executable/resource plus DAT-layout evidence and therefore qualify as CORROBORATED packaged presence.
- A DAT-only or executable-only form remains candidate packaged surface; absence from the other source is not evidence of retirement.

### Reporting
- `ERP-RPT-*` stable IDs are used for report artifacts.
- 786 RPX files outside backup report directories are candidate-current packaged reports; 234 backup-directory RPX files remain version-history evidence.
- Structural evidence records embedded script, subreport dependencies, DataField bindings and specialized image/barcode/chart controls.
- Candidate-current packaging does not prove navigation reachability or authorization.

### Filtering/data references
- Persisted filter metadata directly names several table/view identifiers, creating bounded ERP-to-DB traceability without guessing.
- Alias-prefixed fields whose alias targets cannot be recovered remain UNKNOWN.
- Filter configuration proves presentation/query metadata, not authorization or safe server execution.

## Acceptance gaps that remain UNKNOWN

The package evidence currently does **not** independently prove all of the following:

1. Exact current menu tree, captions, order and form reachability.
2. Runtime permission evaluation, role/company/user precedence and server-side enforcement semantics.
3. Complete tab/control/toolbar/action inventory per form.
4. Save/delete/approve/post/cancel state transitions and side effects.
5. Validation/default rules implemented only in executable code.
6. Complete dropdown/lookup query contracts and alias resolution.
7. Exact precedence among packaged DAT defaults and per-user/per-company persisted personalization.
8. Which candidate-current RPX reports are actually reachable, their complete runtime parameter/data contracts and authorization.
9. Complete export/print options exposed by each workflow.
10. Runtime integrations, external endpoints, file movement and background behavior that are not safely established from static package metadata.

These gaps must not be converted to VERIFIED from naming conventions. They are reserved for further packaged evidence where available and the incoming C# verification round where code is required.

## Phase-1 ERP disposition

The ERP workstream is **complete_candidate**. Package evidence classes have been exhausted into stable-ID inventories and explicit UNKNOWN boundaries; remaining C#-only runtime semantics stay UNKNOWN pending the direct C# verification round. Until Lead closes Phase 1, ERP work remains focused on closure verification and evidence-backed pilot unblockers rather than reopening broad archaeology.
