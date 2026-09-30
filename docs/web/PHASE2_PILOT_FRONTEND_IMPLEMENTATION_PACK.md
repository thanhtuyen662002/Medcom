# Phase 2 Pilot UX / Frontend Implementation Pack

Status: **implementation-ready UX contract** derived from Phase 1 VERIFIED/CORROBORATED evidence.  
Owner: `web-product-ux`.  
This pack does not upgrade unresolved C# semantics to VERIFIED.

## 1. Purpose and implementation boundary

Phase 2 should not begin by inventing five unrelated pages. Build reusable frontend primitives, then bind the five owner-priority workflows as evidence permits.

Required frontend stack:
- Next.js + React + TypeScript;
- shadcn/ui + Tailwind;
- TanStack Query;
- TanStack Table + TanStack Virtual;
- generated/shared typed API contracts where practical.

Browser inputs use stable screen/action/filter IDs. Raw SQL/table/view/stored-procedure names are never browser authority.

## 2. Shared component contracts

### WEB-FE-APP-SHELL
Desktop: authorized module navigation + page breadcrumb/context + user/session/freshness controls.  
Mobile: persistent authorized bottom quick nav + Menu opening the full authorized drawer. Role quick-nav changes presentation only.

### WEB-FE-ERP-GRID
One shared grid engine configured per screen:
- server-side filter/sort/page/window;
- row virtualization and column virtualization when width requires it;
- stable row identity;
- resize/reorder/freeze/hide;
- personal/shared view integration;
- keyboard active-cell/row navigation;
- selection and bulk-action scope;
- explicit loading/refreshing/stale/error/empty/no-permission states.

Grid core owns mechanics. Screen config owns columns, format, filters, actions, permissions and business semantics.

### WEB-FE-DOCUMENT-SHELL
Reusable document state machine:
`loading → pristine ↔ dirty → submitting → confirmed | rejected | outcome-unknown → reconciling → confirmed | rejected | conflict`.

It owns dirty-navigation guard, save progress, correlation/reference ID, conflict/recovery panel and authoritative success toast.

### WEB-FE-LOOKUP
Remote cancellable lookup with stable ID/value separation, keyboard selection, identifying columns, historical inaccessible/deleted value state and authoritative commit revalidation where required.

### WEB-FE-ACTION-BAR
Renders only server-resolved capabilities. A hidden/disabled button is never security. Destructive/state-changing actions revalidate permission + business state server-side.

### WEB-FE-TOAST
Preferred top-center:
- success ~3 s;
- info ~4 s;
- warning ~6 s;
- critical recovery state persists outside the toast.
Never emit success before authoritative commit confirmation.

### WEB-FE-SESSION-GUARD
Default idle timeout 1440 minutes. Server is authoritative. Passive SignalR, polling and TanStack background refetch do not reset idle. Admin-configured policy drives warning/continue flow. Dirty document recovery must be considered before forced navigation.

## 3. Pilot screen schemas

Evidence confidence is explicit.

### P1 — Purchasing: Đặt mua hàng
Binding: `ERP-FRM-AP_OrderFrm` → `DB-TABLE-dbo.AP_OrderTbl` + `DB-TABLE-dbo.AP_OrderDetailTbl` (**VERIFIED/CORROBORATED from current Phase 1 artifacts**).

Desktop:
- list uses WEB-FE-ERP-GRID with master filters;
- document uses header + detail grid;
- identity/status/date/supplier-like field priority is bound only when exact field evidence exists;
- screen-specific workflow actions remain capability descriptors until C# verifies them.

Mobile:
- list/card: document identity, primary party, date, status, key amount only after field mapping is verified;
- document: summary → header sections → detail lines → actions;
- no shrunk desktop detail grid.

Freshness: list SWR ≤30 s; editable document version-aware revalidation before critical commit and after mutation.

### P2 — Inventory: Đề nghị nhập hàng
Binding: `ERP-FRM-IV_InboundRequestFrm` → `DB-TABLE-dbo.IV_InboundRequestTbl` + `DB-TABLE-dbo.IV_InboundRequestDetailsTbl` (**VERIFIED**).

Desktop: operational list + master/detail document shell.  
Mobile: operational card/list optimized for status/review and line drill-down.  
Freshness: active operational list SWR ≤15 s.  
Gap: exact commands/status transitions remain `UX-GAP-WORKFLOW-001`.

### P3 — Inventory: incoming/status companion
Binding: `ERP-FRM-IV_IncomingShipmentStatusFrm` → inbound-request master/detail objects (**VERIFIED packaged binding**).

Treat as an operational status surface, not automatically as the owner-requested “Đề nghị điều chuyển nội bộ”. Do not rename/reuse it for internal transfer without exact evidence.

Freshness: SWR ≤15 s + visible last-updated/manual refresh.

### P4 — Sales: Đề nghị bán hàng
Current package evidence includes `ERP-FRM-AR_InvoiceRequestFrm` → `AR_InvoiceRequestTbl/AR_InvoiceRequestDetailTbl`, but the exact owner business label “Đề nghị bán hàng” must not be assumed identical without direct C# / menu verification.

Frontend may implement the reusable Sales request list/document schema now; route label and business command set remain blocked on `UX-P2-GAP-SALES-BINDING`.

Freshness: list SWR ≤30 s.

### P5 — Purchasing: Duyệt đề nghị mua hàng
Exact form/action/SP binding is not currently VERIFIED in the Phase 1 UX evidence. Implement the approval interaction contract now:
- review summary + relevant detail;
- action capability resolved by server;
- confirmation only when destructive/financial policy requires it;
- submit once with idempotency/correlation;
- no optimistic status success;
- authoritative resulting state reread;
- outcome-unknown reconciliation;
- rejection/conflict remains persistent.

Exact route/form/action IDs stay blocked on `UX-P2-GAP-PURCHASE-APPROVAL`.

### Owner-requested Inventory: Đề nghị điều chuyển nội bộ
No current VERIFIED binding in the consumed evidence. Build no guessed route/table/SP. Reuse the generic inventory request schema after ERP/C# lane supplies exact stable IDs. Track as `UX-P2-GAP-INTERNAL-TRANSFER`.

## 4. Permission/action matrix contract

For every pilot screen, FE consumes server-resolved booleans/capabilities separately:

| Capability | FE behavior | Server requirement |
|---|---|---|
| navigate/view | show route/menu when allowed | route + query scope authorization |
| create | show create affordance | authorize create + scope |
| edit | fields/actions enabled only in valid state | authorize record + field/action + state |
| delete | destructive affordance with confirmation | authoritative delete permission/state |
| approve/workflow action | server-provided action descriptor | permission + current state + idempotency |
| print/report | report action visible | report/document scope authorization |
| export | export action visible | independent export authorization |
| configure personal view | personal settings UI | authenticated owner scope |
| configure role quick-nav | admin UI only | admin authorization; never grants business permission |

A crafted browser request must fail even if FE mistakenly renders an action.

## 5. Auth/session UX slice

Login:
- concise credentials surface;
- no legacy DB/tool details exposed;
- server creates Secure/HttpOnly session;
- authentication failure is generic enough to avoid account disclosure;
- post-login return route only when still authorized.

Active session:
- no noisy countdown during normal work;
- session policy fetched from server;
- user-originated meaningful activity may be throttled before server heartbeat;
- background query/realtime activity is passive and cannot extend idle.

Pre-expiry:
- warning dialog/banner when policy permits;
- “Tiếp tục phiên” performs authoritative server refresh;
- dirty document warns and preserves recoverable local input only where security policy allows.

Expired:
- backend operations fail as expired;
- redirect to login;
- safe return route preserved;
- never silently replay a financial/business mutation after re-login.

## 6. Error / conflict / toast package

| Situation | Toast | Persistent UI |
|---|---|---|
| save committed | success | saved timestamp/state |
| business rejection | warning/error | field/document reason |
| validation | optional summary | inline fields + tab markers |
| concurrency conflict | warning | compare/reload/reapply panel |
| network after submit | info “Đang kiểm tra kết quả…” | outcome-unknown reconciliation |
| server/system failure | error + support ref | retry/support state |
| realtime degraded | avoid spam | freshness/reconnect indicator |
| background export/report | started/completed toast | job/status affordance |

Duplicate polling/SignalR invalidations must not create user-facing toast spam.

## 7. Performance/freshness acceptance

Shared budgets:
- tap/click acknowledgement ≤100 ms;
- show non-blocking pending feedback after ~300 ms;
- local grid interactions p95 ≤100 ms;
- normal filter/sort p95 ≤1.0 s indexed workload;
- first useful grid p75 ≤1.5 s, p95 ≤2.5 s normal office network;
- form primary data p75 ≤1.2 s, p95 ≤2.0 s;
- ordinary save acknowledgement p95 ≤1.5 s excluding declared long workflows;
- 60 fps target for grid scrolling;
- report/export expected >5 s becomes background work.

Pilot freshness:
- sales/purchasing lists: SWR ≤30 s;
- inbound/warehouse operational: SWR ≤15 s;
- editable document: targeted version revalidation before critical commit + after mutation;
- lookup: authoritative search/open, permitted cache ≤60 s;
- reports: immutable run SNAPSHOT;
- PUSH: prohibited as sole freshness path until commit-correlated event/version evidence is VERIFIED.

Slow-network test profile:
- 10 s request latency;
- interrupted mutation acknowledgement;
- reconnect after stale permissions;
- superseded lookup requests;
- 100k+ result cardinality;
- 100+ potential columns;
- wide detail rows;
- background export/report.

## 8. Phase 2 frontend issue slicing

Recommended independent implementation slices:
1. FE shell + authorization presentation + responsive navigation.
2. Shared Grid Core + virtualization + query state + saved-view boundary.
3. Document Shell + dirty/conflict/outcome-unknown state machine.
4. Lookup + typed filter controls.
5. Toast/error/support-reference + degraded-network package.
6. Session Guard + idle warning/continue/expiry UX.
7. AP_Order pilot binding.
8. IV_InboundRequest pilot binding.
9. Sales request pilot after exact route label/action binding.
10. Internal transfer pilot after exact ERP/DB binding.
11. Purchase approval pilot after exact action/workflow binding.
12. accessibility/performance/slow-network E2E acceptance suite.

Slices 1–6 can proceed without waiting for unresolved form bindings.

## 9. Phase 2 gap register

- `UX-P2-GAP-SALES-BINDING` — exact owner “Đề nghị bán hàng” menu/form/action binding.
- `UX-P2-GAP-INTERNAL-TRANSFER` — exact “Đề nghị điều chuyển nội bộ” form/table/query/action binding.
- `UX-P2-GAP-PURCHASE-APPROVAL` — exact “Duyệt đề nghị mua hàng” form/action/workflow binding.
- `UX-P2-GAP-AUTH` — direct C# permission source/precedence/admin semantics.
- `UX-P2-GAP-SESSION-TOOL` — Tool.dll exact login/logout/session compatibility.
- `UX-P2-GAP-WORKFLOW` — per-screen state/action/save/delete side effects.
- `UX-P2-GAP-VERSION-IDEMPOTENCY` — exact concurrency/idempotency contracts.
- `UX-P2-GAP-CONFIG-PRECEDENCE` — package/DB/company/role/user precedence.
- `UX-P2-GAP-REALTIME` — authoritative commit-correlated event/version source.

These gaps block only the unsafe binding, not shared FE implementation.


## 10. Pilot implementation matrix

| Unit | Evidence gate | Frontend delivery |
|---|---|---|
| AP Order | `ERP-FRM-AP_OrderFrm` and AP Order master/detail are VERIFIED | Build desktop list/document and mobile semantic list/document now; workflow actions remain server-capability gated. |
| Inbound Request | `ERP-FRM-IV_InboundRequestFrm` and inbound master/detail are VERIFIED | Build operational desktop/mobile surfaces now; status transitions remain gated. |
| Incoming Status | packaged form/data binding VERIFIED | Build read/review status surface; do not treat it as internal transfer. |
| Sales Request | candidate form/data binding exists; exact business-label/action equivalence unresolved | Build reusable request schema; gate route label and commands. |
| Purchase Approval | exact form/action/workflow unresolved | Build approval interaction shell; do not bind a business adapter yet. |
| Internal Transfer | exact form/table/query/action unresolved | Reuse generic inventory-request schema only; do not invent a binding. |

Shared components remain App Shell, ERP Grid, Document Shell, Lookup, Action Bar, Session Guard, top-center Feedback and Freshness indicator. Mobile uses bottom quick-nav plus authorized drawer; role quick-nav editing is admin-only and never grants business permission. Passive polling/SWR/SignalR never resets the 1440-minute default idle timer.

Acceptance must cover 100k+ result cardinality, 100+ potential columns, superseded requests, 10-second latency, lost mutation acknowledgement, concurrent-edit conflict, role revocation, realtime degradation, keyboard/accessibility and background export/report. Missing ERP semantics stay fail-closed under the existing `UX-P2-GAP-*` register.
