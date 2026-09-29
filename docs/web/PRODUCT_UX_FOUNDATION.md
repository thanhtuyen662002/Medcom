# Web Product & UX Contract — Foundation

Status: **INFERRED product contract**, pending incremental binding to VERIFIED ERP/DB IDs.

This document defines implementation-level interaction contracts that do not depend on a complete Windows ERP inventory. It follows `docs/WEB_MIGRATION_PRINCIPLES.md`. ERP-specific parity claims are intentionally excluded until source evidence exists.

## 1. Product posture

The Web ERP should feel calm, coherent and immediately understandable, but it is a professional work surface rather than a consumer landing page. “Apple-inspired” means strong hierarchy, restrained chrome, consistent spacing, high-quality typography, predictable motion and progressive disclosure. It must not reduce information density, hide frequent actions behind decorative navigation, or force mouse-only workflows.

Desktop is the primary high-productivity surface. Tablet/mobile must preserve review, approval, lookup and light-edit workflows, but dense accounting/warehouse grids may use purpose-built responsive presentations rather than pretending a desktop grid fits a phone.

## 2. Information architecture

**WEB-NAV-SHELL** — persistent application shell:
- global product/company context, module navigation, global search/command entry, notifications/tasks, user/profile and connection/freshness status;
- module navigation remembers the user's last valid location without bypassing authorization;
- recently used and favorite screens are shortcuts, never a second permission model;
- page identity is always visible: module → screen → document/context;
- opening a record from a grid preserves return context (filter, sort, group, selection, scroll position) when feasible.

**WEB-NAV-TABS** — work tabs are allowed for power users when multiple documents/screens must remain open. Tabs expose dirty state, duplicate-instance identity and close safeguards. A tab is presentation state, not a transaction boundary.

## 3. Dense data-grid contract

**WEB-GRID-CORE** applies to list/search/master/transaction grids unless a screen-specific contract overrides it.

### Rendering and data
- Virtualize rows and, for very wide grids, columns. Never render an unbounded result set into the DOM.
- Server-side filtering/sorting/grouping/paging is the default when result cardinality can be large. The UI must disclose when an operation only applies to loaded rows.
- Stable row identity is mandatory. Selection must survive viewport virtualization and safe refreshes.
- Keep horizontal scrolling deliberate: frozen identity/action columns, clear overflow affordance, no accidental page-level horizontal scroll.
- Numbers align by decimal semantics; dates/times use one locale-aware convention; statuses use text plus shape/icon where needed, never color alone.

### Personalization
**WEB-GRID-VIEW** supports resize, reorder, hide/show, freeze, sort, filter, group, density and saved views. Separate:
1. system default,
2. company/role default when policy permits,
3. personal saved view.
A user can reset to the effective default. Configuration version mismatch must fail safely and preserve recoverability.

### Keyboard productivity
Minimum desktop contract:
- Arrow keys move active cell/row predictably.
- Home/End and PageUp/PageDown navigate without losing selection semantics.
- Enter opens/commits according to edit mode; Escape cancels the current transient action.
- Tab/Shift+Tab traverse editable fields in logical order.
- Ctrl/Cmd+F focuses grid search when the screen owns search.
- Ctrl/Cmd+S saves a dirty editable document where saving is valid.
- Multi-select supports Shift range and Ctrl/Cmd additive selection.
All shortcuts must have visible discoverability and must not override browser/OS behavior without a strong ERP reason.

### Bulk actions
Bulk actions show selected count and scope. Destructive/financial/state-transition actions require preview of affected records, permission revalidation on the server, idempotent submission where applicable and a result summary that distinguishes success, skipped and failed rows. Never imply atomicity unless the backend actually guarantees it.

## 4. Forms, tabs and lookup controls

**WEB-FORM-STATE**:
- distinguish pristine, dirty, saving, saved, validation-failed, conflict and disconnected states;
- do not discard unsaved changes on navigation/refresh without an explicit recovery path;
- inline validation appears near the field, with a page-level summary for submit-blocking errors;
- required/read-only/hidden presentation rules must be derived from server-authorized capability plus business state; hiding alone is never authorization.

**WEB-FORM-TABS**:
- tabs have stable IDs independent of display labels;
- labels/order/visibility may be configured only through an explicit precedence model;
- validation errors in hidden/non-active tabs surface at the tab level and link to the field when accessible.

**WEB-LOOKUP**:
- searchable lookups debounce remote queries and cancel superseded requests;
- keyboard selection is first-class;
- show enough identifying columns to disambiguate duplicate/similar names;
- selected value stores stable ID, not display text;
- stale/deleted/inaccessible selected references render explicitly rather than silently clearing;
- large lookup datasets never download wholesale to the browser.

## 5. State, errors and conflicts

**WEB-STATE-ASYNC**:
- first load uses structure-preserving skeletons only when layout is known; subsequent refresh retains usable stale data when safe and indicates refreshing;
- empty result, no permission, not found, filter-produced-empty and system error are distinct states;
- retry does not duplicate a mutation;
- slow operations expose progress/state when backend supports it and can move to a background-job experience rather than holding a modal indefinitely.

**WEB-CONFLICT-EDIT**:
- for concurrently editable records, show that the server changed since the user's base version;
- do not silently last-write-wins critical business fields;
- provide reload/compare/reapply where feasible; otherwise preserve the user's attempted values for recovery.

## 6. Reporting, print and export

**WEB-REPORT-RUN**:
- report parameters have explicit validation/default provenance;
- long reports become background jobs with status, completion time and failure reason;
- generated output records the effective parameters and data-as-of time where meaningful;
- preview and print/export are distinct actions;
- large export must not freeze the browser and must enforce server-side authorization over the exported scope;
- CSV/Excel exports guard against spreadsheet formula injection for untrusted text.

Exact RPX parity remains **UNKNOWN** until ERP Analysis publishes VERIFIED report IDs and behaviors.

## 7. Freshness and realtime policy

Every migrated screen must declare one policy; “unspecified refresh” is not acceptable.

| Policy ID | Use when | UX contract | Initial target |
|---|---|---|---|
| **WEB-FRESH-PUSH** | another user's change can make the current decision materially wrong or shared operational state needs coordination | push invalidation/update; visible reconnect/degraded indicator; reconcile by stable version/order; refresh after event gaps | visible propagation p95 ≤ 2 s after server commit under normal conditions |
| **WEB-FRESH-SWR** | lists benefit from freshness but brief staleness is acceptable | render cached/current data, revalidate in background, show last-updated and refreshing state | revalidate on focus and ≤ 30 s while actively used |
| **WEB-FRESH-POLL** | push complexity is unjustified but periodic freshness matters | visible last-updated; pause/backoff when hidden; manual refresh always available | domain-specific 30–120 s interval |
| **WEB-FRESH-MANUAL** | reference/config/report data changes rarely or refresh is expensive | explicit Refresh action and data-as-of timestamp | no silent promise of freshness |
| **WEB-FRESH-SNAPSHOT** | a workflow/report requires a consistent point-in-time set | freeze snapshot identity/time; changes require explicit reload/new run | no background replacement of the user's snapshot |

Initial domain hypotheses, all **INFERRED pending ERP/DB binding**:
- shared operational queues, stock availability during fulfillment, document status being worked by multiple users → PUSH or SWR;
- master-data lists → SWR/POLL;
- configuration/admin → MANUAL/SWR after save;
- reports → SNAPSHOT;
- editable documents → explicit version/conflict checks plus targeted invalidation, not blind live field replacement.

If push disconnects, the UI must say that live updates are degraded and fall back to revalidation/polling where safe. Never show a green “live” indicator merely because the browser socket is open; freshness is an end-to-end property.

## 8. Performance budgets

These are product acceptance targets, not claims about the current ERP:
- shell/navigation interaction response: visual acknowledgement ≤ 100 ms;
- local grid interaction (selection, column resize, opening menu): p95 ≤ 100 ms;
- filter/sort request: p95 ≤ 1.0 s for normal indexed workloads; show non-blocking progress after 300 ms;
- first useful grid data: p75 ≤ 1.5 s on normal office network, p95 ≤ 2.5 s;
- form open with primary data: p75 ≤ 1.2 s, p95 ≤ 2.0 s;
- save acknowledgement for ordinary documents: p95 ≤ 1.5 s excluding explicitly long-running workflows;
- scrolling: target 60 fps, no sustained main-thread task > 50 ms during normal grid navigation;
- no screen may require loading the full large dataset merely to calculate pagination/filter UI;
- exports/reports expected to exceed 5 s use asynchronous/background execution with resumable status.

Budgets must be tested with realistic wide rows, large result cardinality, concurrent users and network latency—not only empty/demo data.

## 9. Slow/degraded network

**WEB-NET-DEGRADED**:
- distinguish offline, reconnecting, slow and server-error states;
- never claim a mutation succeeded before durable server acknowledgement;
- prevent double-submit while preserving safe retry;
- queued/offline writes are **not a default ERP behavior**; enable only per workflow after conflict/idempotency design;
- preserve unsaved form input locally enough to recover from a transient page/app failure when policy permits, but never persist sensitive fields casually;
- after reconnect, revalidate permissions, record version and freshness before allowing a critical commit.

## 10. Accessibility and responsive behavior

Target WCAG 2.2 AA for Web-owned UI. Every interactive control has a keyboard path, visible focus, programmatic name and non-color-only state. Grid semantics must remain usable with assistive technology; where a highly virtualized grid cannot expose all rows simultaneously, expose correct row/column context and document the supported navigation model.

At narrow widths, prioritize task completion: summary + key fields + actions + drill-down. Do not merely shrink typography or create horizontal overflow across the whole page.

## 11. Permissions UX

**WEB-AUTHZ-PRESENTATION**:
- server decides whether data/action is authorized;
- client capability data may remove/disable unavailable controls for clarity, but a crafted request must still fail server-side;
- disabled actions should explain why when disclosure is safe;
- permission changes during a session require revalidation at mutation time;
- export/report/download authorization is independent of whether the source grid was visible.

## 12. Binding and gap register

Current binding status:
- VERIFIED ERP screen/form IDs: **UNKNOWN / not yet published to this workstream**.
- VERIFIED ERP report IDs: **UNKNOWN / not yet published**.
- VERIFIED DB object IDs relevant to individual screens: **UNKNOWN / not yet published to main**.

Therefore this foundation intentionally defines reusable `WEB-*` contracts without claiming parity. Subsequent passes must create domain/screen binding tables:
`ERP ID → current behavior evidence → WEB capability IDs → freshness policy → performance budget → permission behavior → DB/API disposition → unresolved gaps`.

### Required next UX passes
1. Bind first VERIFIED ERP form/grid/report inventory as soon as it lands.
2. Build design tokens, density modes and component anatomy.
3. Define command/search/navigation taxonomy from VERIFIED module inventory.
4. Define configuration precedence and saved-view conflict UX jointly with Migration Architecture.
5. Validate keyboard shortcuts against actual ERP high-frequency workflows.
6. Create representative stress scenarios: 100k+ result sets, 100+ columns, multi-user document conflict, live-update loss, 10s latency and long-running exports.


## 13. Verified binding checkpoint

ERP Analysis now publishes VERIFIED packaged IDs including ERP-CFG-AR_InvoiceFrm, ERP-CFG-AP_OrderFrm, ERP-CFG-FA_AssetListFrm and 24 persisted filter artifacts. These bind WEB-GRID-CORE/WEB-GRID-VIEW to multi-grid layouts with persisted width/order/visibility/aggregation semantics; filter metadata binds a new WEB-FILTER-CONTRACT with typed, server-allow-listed fields/operators. Browser-supplied legacy FieldID is never query authority.

DB Analysis VERIFIED configuration objects including DB-TABLE-dbo.SY_Menu, SY_FrmCfg, SY_FrmCtrTbl, SY_FrmDrdwTbl, SY_FrmFltTbl, SY_FrmGrdActTbl, SY_FrmLstTbl, SY_FrmMstActTbl, SY_FrmOptBtnTbl and SY_FrmParTbl. WEB-CONFIG-RESOLUTION therefore consumes typed server-resolved capabilities rather than executable legacy source/action expressions. SY_UserBranch/SY_UserStorehouse prove scope metadata exists, not universal authorization enforcement.

ERP report evidence now binds WEB-REPORT-RUN: 786 candidate-current RPX files include 119 with embedded script, 8 parent/subreport families, 7 barcode-bearing reports and one chart-bearing report. Report runs default to SNAPSHOT; embedded RPX script never executes in the browser; barcode outputs require machine-decode acceptance tests.

Initial freshness binding: transactional/master lists SWR ≤30 s; warehouse/inbound operational lists SWR ≤15 s; reference lookups SWR ≤60 s/on-open; editable documents use version-aware targeted revalidation; config uses SWR after save + manual refresh; reports are SNAPSHOT. No bound surface is promoted to PUSH until an authoritative event/version source is VERIFIED.

New explicit gaps: UX-GAP-NAV-001 menu reachability; UX-GAP-AUTH-001 enforcement semantics; UX-GAP-CONFIG-001 legacy precedence; UX-GAP-FILTER-001 Like/A-B aliases; UX-GAP-WORKFLOW-001 commands/side effects; UX-GAP-LOOKUP-001 lookup dependencies; UX-GAP-REPORT-001 report reachability/print options; UX-GAP-CONCURRENCY-001 version/idempotency; UX-GAP-REALTIME-001 event source; UX-GAP-RESPONSIVE-001 domain task priority. Status remains active.
