# UI implementation and BE integration — 2026-10-04

This frontend follows the adopted repository contracts, rather than an invented business prototype. No production transactions, users, job results, permissions or success responses are simulated. The deployment remains owner-private. BE/API/SQL ownership remains with Codex.

## Repository decisions consumed

- `docs/web/PRODUCT_UX_FOUNDATION.md`: professional desktop work surface, semantic mobile cards, strict authority and mutation recovery.
- `docs/web/GRID_MOBILE_IMPLEMENTATION_CONTRACT.md`: one shared grid, per-screen schemas, independent desktop/mobile presentations.
- `docs/web/PHASE2_FRONTEND_ACCEPTANCE.md` and `PHASE2_PILOT_FRONTEND_IMPLEMENTATION_PACK.md`: shared components can proceed independently; unresolved domain bindings fail closed.
- `docs/web/CONFIGURATION_LOOKUP_UX.md`: stable IDs, immutable normalized definitions, cancellable remote lookup, presentation/configuration separation.
- `docs/web/MOBILE_NAVIGATION_ROLE_CONFIG.md`: authorized bottom shortcuts, full drawer, admin-only role configuration.
- `docs/web/UX_RUNTIME_FEEDBACK_SESSION.md`: top-center feedback, durable errors/support references, expiry warning/continue, passive refresh does not extend idle.
- `docs/web/UX_STRESS_ACCEPTANCE.md`: bounded reads, stale-response fences, conflicts and unknown outcomes; runtime budgets require measured evidence.

The current user direction supersedes planning-only historical eligibility language for frontend authoring. It does not resolve unknown ERP command semantics or authorize changes to the BE lane.

## Delivered and remaining boundary

| Surface | Frontend delivered | BE dependency / acceptance still open |
|---|---|---|
| Shell | Sticky header, neutral light/dark, optional palettes, logo, command navigation, drawer, mobile bottom nav | Stable principal identity, effective role navigation version/push invalidation |
| AP order / inbound lists | Existing real API adapter; 50-row server pages, branch/search, shared TanStack grid; reorder/resize/hide/freeze; keyboard cells; explicit current-page selection; semantic mobile cards | Typed server sort/filter/group/summary and independently authorized export; no local sort/filter of partial results |
| Personal layout | Named session-local layouts; restored valid stable IDs after schema drift, explicit recovery notice | User/company/screen persistence, shared view scopes and version/conflict API. No invented user key or localStorage role configuration |
| Freshness | Passive visible-page refresh: purchasing 30s, inbound 15s; focus refresh; retain same-query safe data on transient errors; visible age/manual refresh | Verify timing with actual BE/SQL and WinForms writes. No PUSH badge or realtime correctness claim |
| Read details | Real paged line API, desktop table, separate mobile line cards, exact decimal strings | Published edit definitions/actions and concurrency/reconciliation contracts |
| Document editor | Server-defined sections/fields/actions, inline validation/tab markers, save lock, dirty-navigation guard, confirmed/rejected/conflict/unknown/reconciling UI, compare/reload/reapply | Adapter supplies actual verified document/command/version/receipt/reconciliation semantics. Creating/approving/deleting cannot be inferred from read permission |
| Lookup | Server adapter, debounced search, AbortSignal fencing, keyboard selection, separate ID/label, explicit inaccessible historical reference | Stable lookup descriptors and search/commit authorization. Derived linked-field propagation needs its verified descriptor |
| Typed query controls | Allowlisted fields/operators, sort and grouping selectors; decimal strings, bounded terms | Query descriptor and matching server contract. Current live read DTO supports search/branch/page only, so advanced controls are not enabled there |
| Role nav configuration | Capability-gated editor, labels, order, enabled/primary, mobile preview, publish lock, conflict review; effective configuration can drive bottom nav | Real admin/role catalog, versioned role persistence, actor audit/history/rollback and config-change invalidation. No admin inferred from Site ownership |
| Reports | Server catalog/parameters, run lock, server jobs and status, snapshot time, independent download gate, unknown-start reconciliation | Catalog/parameters/job/receipt/reconciliation/output adapters and report-specific permissions; no guessed report fields or totals |
| Session/errors | 5-minute warning from server expiry timestamps, explicit continue, absolute-limit explanation, offline banner, support ID/copy, top-center Sonner, auth cache clearing | Admin session policy descriptor/editor, cross-tab authority event contract, staging integration and real session tests |
| Other owner workflows | Common document/query/action components are reusable | Purchase approval, transfer stages, sales equivalence, accounting and their validated business bindings. Existing unavailable states remain until an authorized adapter exists |
| Extended capabilities | Architecture contract retained | Attachment/import/device/office/spreadsheet-specific UI and adapters remain outside this shared-core implementation; no undocumented endpoints added |

## Integration seam

`lib/erp/extensions.ts` defines `WorkspaceExtensions`. Pass verified adapters to `<Workspace extensions={...} />`:

- `documentScreens[kind].load(documentId, workspace, signal)` returns a normalized snapshot with stable field/action IDs and opaque versions. The existing list remains and opens `ConfiguredDocumentSheet`; successful acknowledged commands invalidate the affected read list. Unknown outcomes call `DocumentAdapter.reconcile`, never replay `save`.
- `reports` supplies catalog/jobs/start/reconcileStart/download and the lookup adapter. Job history is fetched from BE so it survives navigation; the UI never manufactures a completed job.
- `roleNavigation` supplies the already-authorized role configuration and publish/reload adapter. Only `canPublish` enables the editor; server rechecks every write. A missing acknowledgment requires reading/reviewing authoritative configuration before another publish.
- `effectiveMobileNavigation` is a server-resolved presentation DTO. Its entries are intersected again with the current authorized known-screen set. Menu always stays available. Config does not grant capability.

`lib/erp/ui-contracts.ts` provides bounded strict schemas. Executable metadata/SQL, unknown fields, duplicate IDs and targets outside the authorized role descriptor are rejected. Adapters must parse responses and convert server outcomes into the typed result, preserving server correlation/receipt IDs. No concurrency or receipt token is fabricated.

New endpoint paths must first be published and reviewed in the BE repository; only then add them to the same-origin proxy allowlist and wire the adapter. The current proxy allowlist is unchanged. `MEDCOM_API_ORIGIN` remains unset because no approved externally reachable BE origin was supplied.

## Security and red-team review

Review before implementation considered: partial-page bulk scope, unknown metadata execution, stale role/query replies, logout race, cross-company/session reuse, lost acknowledgment replay, configuration permission escalation and fake report success. Boundaries: current-page selection only; strict normalized descriptors; cancellation/generation guards; query scopes include tenant/company/authority and absolute session expiry; no business cache persistence; no local mutation retries; server-only rights and outcomes.

Drafts stay in component memory. Explicit discard may lose them; no sensitive localStorage drafts are introduced. Navigation within the application is guarded and browser unload prompts when work is unfinished. Authentication expiry/revocation clears business state rather than preserving it across principals. Dirty back navigation may replace the target history entry to preserve the current route while the user decides.

## Verification status

TypeScript, unit/state/schema/proxy/auth tests and production Worker build are required in scoped CI. Tests include 100-column preference drift, bounded selection, duplicate submit, exact decimal preservation, lost acknowledgment, conflict reapply/read-only schema changes and metadata/authority tampering.

These checks do not prove 100k-result performance, 60fps, WCAG conformance, interactive keyboard/focus, visual mobile layout, production SQL compatibility, WinForms concurrency or all-ERP completion. A supported supervised browser was unavailable in this session; runtime/browser QA and live BE acceptance remain open. Production readiness requires those measured checks after adapter integration, not a "100%" label from compilation.
