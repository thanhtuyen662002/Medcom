# Sales order status presentation — 2026-10-19

Sales, PM and SA now use the module's `header.StatusID` lookup for status-filter badges. Labels come from the options response; no status names or counts are invented. Selecting a status sends its signed integer ID in the server list query and starts at page 1. Subsequent pagination retains that ID. The all-status choice omits `statusId`. Lock/open filter badges are removed from Sales screens, and row labels no longer infer workflow status from the document lock. The generic “Phân hệ ERP” heading badge is removed.

Evidence:

- `inventories/erp/20261010/six-screen-catalog.json`, object `screens[id=sales-orders].lookups[ColumnID=StatusID]`: native StatusID / StatusName binding.
- `inventories/erp/20261011/cud-workflow-catalog.json`, objects `screens[id=sales-order-pm|sales-order-sa].lookups[id=header.StatusID]`: corresponding native bindings.
- `src/backend/Medcom.Infrastructure/Erp/ErpSql.cs`, `ErpSqlPlan.ListText`: server StatusID filtering before page slicing. `ScopePredicate` restricts PM reads by recipient and branch; this change does not broaden that scope.
- `components/erp/sales-order-status-filter.tsx`: paged options, retry and stale-response guards; scoped by module and branch.
- `components/untitledui/tab-erp-screen.tsx`: server-filter integration and API-derived row status on desktop and mobile.
- `tests/erp-screen-list-load.test.mjs`: observed 10 passing tests, including signed/zero status IDs on all three modules, filtered pagination, all-status reset, lookup pagination/retry and stale branch responses. TypeScript and changed-file ESLint pass.

No backend/SQL/permissions or business records were changed. Actual current business rows were not inspected: the available browser session remained on initialization. The owner confirmed that the missing PM record was being checked while signed in as Admin, rather than the selected PM. No fresh historical archive access or runtime source equivalence is claimed; canonical source identities remain in `docs/SOURCE_BASELINE.md` and `inventories/source/20261002/source-set.json`.

The owner subsequently resumed the separate help refresh. Its current content, screenshots and verification are recorded in `HELP_CENTER_20261019.md`; this status-filter checkpoint precedes that refresh.
