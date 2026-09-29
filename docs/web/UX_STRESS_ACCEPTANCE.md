# Web UX stress and acceptance scenarios

Status: product acceptance contract. These scenarios validate the reusable `WEB-*` contracts in `PRODUCT_UX_FOUNDATION.md`; they do not assert undocumented Windows ERP behavior.

## 1. Dense-grid stress

**UX-TEST-GRID-001 — 100k+ result set**

Given a query whose server-side cardinality exceeds 100,000 rows, the browser must not download or render the full set. Initial useful rows meet the grid performance budget, scrolling remains virtualized, filter/sort are server scoped, and the UI distinguishes selected loaded rows from selected query-wide scope.

Fail if DOM/data memory grows with total cardinality, if sorting silently applies only to the loaded window, or if selection changes meaning after refresh.

**UX-TEST-GRID-002 — 100+ columns**

A wide grid with at least 100 available columns remains usable through column virtualization or equivalent bounded rendering. Frozen identity columns stay aligned; resize/reorder/hide/show do not lose stable column identity. Saved view restore must tolerate columns added, removed or renamed by a newer configuration version and expose recoverable conflicts instead of blanking the grid.

This test directly applies to packaged multi-grid/layout evidence such as `ERP-CFG-AR_InvoiceFrm`, `ERP-CFG-AP_OrderFrm` and `ERP-CFG-FA_AssetListFrm`, without claiming those exact grids currently have 100 columns.

**UX-TEST-GRID-003 — master/detail snapshot**

Refresh the master list while a detail panel/grid is open. The product must not display detail from record/version A beneath a refreshed master selection for record/version B. Loading, stale and version identity must be explicit.

## 2. Filter and lookup safety

**UX-TEST-FILTER-001 — typed legacy filter**

Exercise text, number, date and boolean fields and the VERIFIED packaged operator classes `Like`, `=`, `>=`, `<=`. Client requests use typed server-owned field/operator identifiers. Tampering with a legacy `FieldID`, alias or operator must be rejected server-side rather than interpolated into a query.

Applies to VERIFIED filter-config families including AP Order/Purchase, AR Invoice Request/Order Ship, IV Inbound Request and their detail filters.

**UX-TEST-LOOKUP-001 — superseded search**

With 1–10 s variable latency, issue lookup searches A, AB, ABC rapidly. A late response for A must never replace the visible result for ABC. Keyboard focus/active option remains coherent and inaccessible/deleted selected references are rendered explicitly.

## 3. Editing, concurrency and retries

**UX-TEST-EDIT-001 — concurrent writer**

Two sessions open the same editable document. Session A commits, then session B attempts a critical mutation from its older base version. B must not silently overwrite A. The UI exposes conflict state and preserves B's attempted input for compare/reapply or recovery.

This remains a required contract while `UX-GAP-CONCURRENCY-001` is unresolved; no specific ERP screen is claimed to have a VERIFIED version column yet.

**UX-TEST-EDIT-002 — ambiguous save acknowledgement**

Drop the browser response after the server may have committed. A user retry must not create a duplicate financial/document mutation. The UI shows an unresolved/synchronizing state until command identity or server reconciliation proves the outcome; it must not optimistically claim either failure or success.

**UX-TEST-EDIT-003 — permission revoked mid-edit**

Open an editable document while authorized, revoke the relevant capability in another administrative context, then save. Presentation may lag, but server mutation authorization must reject the stale permission. User input remains recoverable subject to data-handling policy.

## 4. Freshness and degraded connectivity

**UX-TEST-FRESH-001 — SWR staleness**

For a bound SWR surface, pause revalidation beyond its declared SLA. The UI must show data age/degraded freshness rather than presenting stale data as current. Manual refresh remains available. Current initial bindings are transaction/master ≤30 s, warehouse/inbound ≤15 s and reference lookup ≤60 s/on-open.

**UX-TEST-FRESH-002 — reconnect**

Disconnect during active use, then reconnect after server data and permissions changed. Before a critical commit, the client revalidates authorization, record version and relevant freshness. Queued offline writes are not replayed unless that workflow has an explicit idempotent offline contract.

No current bound surface is assumed to support realtime PUSH while `UX-GAP-REALTIME-001` remains unresolved.

## 5. Bulk actions

**UX-TEST-BULK-001 — selection scope**

Select records across virtualization/paging, change a filter, then invoke a bulk action. The confirmation must state exact scope and selected count and must not silently reinterpret selection as all rows matching the new query.

**UX-TEST-BULK-002 — partial result**

Force mixed server outcomes: success, permission denied, stale version and validation failure. Result UX reports each class and permits safe retry only for retryable records. Atomicity is never implied unless the API contract guarantees it.

## 6. Reports, export and print

**UX-TEST-REPORT-001 — long report**

A report exceeding 5 s moves to durable/background status rather than freezing a modal. The user can navigate away and later see success/failure, effective parameters and data-as-of/snapshot identity.

**UX-TEST-REPORT-002 — RPX behavior parity**

For a migrated RPX with embedded script, subreport, barcode/image or chart behavior, acceptance checks the behavior/control contract rather than only a screenshot. Barcode/QR output must machine-decode. Parent reports with subreports are incomplete if a child dependency is absent.

**UX-TEST-EXPORT-001 — large authorized export**

A large export executes server-side/asynchronously, rechecks export authorization independently from grid visibility, records scope, and protects spreadsheet consumers from formula injection in untrusted text. Browser memory remains bounded.

## 7. Navigation, forms and recovery

**UX-TEST-NAV-001 — return context**

Open a document from a filtered/sorted/grouped list, edit or review it, then return. When safe, the prior list context—view, filter, sort, group and scroll/selection anchor—is restored without bypassing current authorization.

**UX-TEST-FORM-001 — dirty navigation**

Attempt route change, tab close, browser refresh and session expiry with unsaved changes. The product provides a clear recovery/discard path and never silently loses acknowledged user input. Sensitive values are not indiscriminately persisted to local storage.

**UX-TEST-FORM-002 — hidden-tab validation**

A submit-blocking validation error located on a non-active or configured-hidden tab is surfaced at form/tab level with an accessible path to resolution. Configuration must not create an impossible-to-fix validation state.

## 8. Accessibility and responsive acceptance

**UX-TEST-A11Y-001 — keyboard-only power flow**

A representative list → filter → open → edit → save → return workflow is completable without a pointer. Focus remains visible and logical through virtualized grids, dialogs and tab changes. No business status is communicated by color alone.

**UX-TEST-RESP-001 — narrow task completion**

At narrow viewport widths, review/approval/lookup/light-edit tasks retain key identity, status and actions. Dense desktop grids may transform to task-specific list/detail presentation; they must not become an unreadable scaled desktop canvas.

Domain-specific mobile priorities remain unresolved under `UX-GAP-RESPONSIVE-001`.

## 9. Acceptance evidence required before complete_candidate

The UX workstream is not complete merely because these tests are specified. Before `complete_candidate`:

1. every VERIFIED ERP surface published for Phase 1 has a Web disposition or explicit bounded gap;
2. each bound surface declares freshness policy and visible stale/degraded behavior;
3. navigation, permission, configuration precedence, workflow/action, lookup, reporting and concurrency gaps are either resolved from evidence or explicitly reserved as source UNKNOWNs;
4. representative dense-grid, form/conflict, report/export, slow-network and accessibility scenarios are mapped into migration acceptance;
5. no UX document promotes an INFERRED interaction into VERIFIED ERP behavior.

Current status: **active**.
