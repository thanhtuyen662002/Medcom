# Phase 1 Closure Deadline and Phase 2 Pilot Handoff

Owner directive date: 2026-09-30  
Timezone: Asia/Ho_Chi_Minh

## Hard deadlines

1. **Phase 1 closure target: before 2026-09-30 21:00.**
2. **Phase 2 BE/FE implementation plan target: before 2026-10-01 08:00.**

The second deliverable should be produced immediately after Phase 1 closes whenever possible; do not intentionally wait until morning.

## Phase 1 deadline mode

From this directive onward, all five Phase 1 workstreams prioritize closure evidence over open-ended exploration.

Closure work order:
1. close already-known acceptance gaps;
2. durable-write verified findings that are currently only in chat/tool output;
3. reconcile cross-document contradictions;
4. complete VERIFIED ERP ↔ Web ↔ DB dispositions;
5. bound remaining unprovable facts as explicit C#-round UNKNOWNs;
6. Lead independently runs all seven AGENTS.md gates.

Do not create unrelated research scope before the deadline unless a newly found fact can invalidate a closure gate.

## UI direction adopted for implementation

Use the adopted contract in:
- `docs/web/GRID_MOBILE_IMPLEMENTATION_CONTRACT.md`

Key decision:
- one shared Grid platform;
- one screen configuration per business screen;
- separate desktop and mobile presentation schemas;
- business actions outside Grid Core;
- server-side query adapters;
- permission + business-state checks for every action;
- server authorization remains authoritative.

## Phase 2 owner-prioritized pilot scope

### Authentication
- Login/logout must use the existing **Tool.dll** compatibility path.
- The browser must not load/call Tool.dll directly.
- Backend owns the Tool.dll adapter and session/authentication boundary.
- Exact Tool.dll class/method names and session semantics must be verified from source before coding; do not invent APIs.

Minimum Web auth surface to plan:
- login;
- logout;
- current user/session;
- authorized navigation/menu;
- capabilities/permissions;
- company/branch/storehouse scope where applicable;
- session-expired and permission-changed behavior.

### Business screens

| Priority | Business path | Current evidence binding |
|---:|---|---|
| 1 | Bán hàng → Đề nghị bán hàng | candidate `ERP-FRM-AR_InvoiceRequestFrm` → `AR_InvoiceRequestTbl` / `AR_InvoiceRequestDetailTbl`; exact menu-label equivalence must be confirmed |
| 2 | Quản lý kho → Đề nghị nhập hàng | `ERP-FRM-IV_InboundRequestFrm` → `IV_InboundRequestTbl` / `IV_InboundRequestDetailsTbl` |
| 3 | Quản lý kho → Đề nghị điều chuyển nội bộ | exact ERP form/data binding still UNKNOWN; must be resolved before implementation issue is marked READY |
| 4 | Mua hàng → Duyệt đề nghị mua hàng | `ERP-FRM-AP_ApprovePurchaseRequestListFrm` → `AP_PurchaseRequestTbl` / `AP_PurchaseRequestDetailTbl` |
| 5 | Mua hàng → Đặt mua hàng | `ERP-FRM-AP_OrderFrm` → `AP_OrderTbl` / `AP_OrderDetailTbl` |

## Authorization is a release blocker

Requirement: a role must see only screens it is authorized to access.

This requires four independent controls:

1. **Navigation authorization**  
   Server returns only authorized modules/screens/actions. Hidden menu is UX, not the security boundary.

2. **Route authorization**  
   Direct URL access to an unauthorized screen returns a forbidden/not-found-safe result even if the user knows the route.

3. **API/data authorization**  
   Every list/detail/query/export/report endpoint revalidates authenticated identity and authoritative scope. Unauthorized data must not leak through counts, search, exports, related-record lookups, or error messages.

4. **Mutation authorization + business state**  
   Create/edit/delete/approve/transition actions revalidate permission and current record state immediately before commit.

Company/branch/storehouse/data-scope rules must be included wherever legacy permission evidence requires them.

## Required Phase 2 planning artifacts

Before 2026-10-01 08:00 the repository must contain a reviewable implementation plan with at least:

### A. Backend plan
- Tool.dll auth adapter boundary;
- session/login/logout contract;
- permission/capability resolver;
- server-filtered menu/navigation contract;
- route/API authorization policy;
- screen query adapters;
- per-screen list/detail DTOs;
- command endpoints and transaction/idempotency policy;
- refresh/cache policy;
- audit/correlation IDs;
- error/conflict contract;
- exact DB procedures/views/tables used or explicit UNKNOWN blockers;
- tests for unauthorized role/direct URL/API/mutation/export access.

### B. Frontend plan
- login/logout/session-expiry UX;
- permission-driven application shell and module navigation;
- route guard behavior;
- shared ERP Grid Core;
- ERP field primitives;
- desktop screen schema + mobile screen schema per pilot screen;
- master/detail form structure;
- workflow/action visibility and enabled-state behavior;
- freshness indicators/SWR policy;
- empty/error/conflict/outcome-unknown states;
- accessibility/keyboard/responsive acceptance.

### C. Screen-by-screen matrix
For each of the five screens:
- ERP form ID;
- menu path;
- master/detail DB contract;
- list/query source;
- permissions required to view;
- permissions required per action;
- business-state restrictions;
- role/data-scope behavior;
- desktop columns;
- mobile 4–6-field summary;
- filters/search/default sort;
- actions/workflows;
- BE issue;
- FE issue;
- acceptance tests;
- remaining UNKNOWNs.

### D. Agent execution graph
Split into bounded issues suitable for at least:
- Backend agent;
- Frontend agent;
- Lead/Integrator/QA.

Identify dependencies explicitly so BE and FE can work in parallel after auth/menu/query contracts stabilize.

## Minimum pilot acceptance

The pilot is not accepted unless:
- valid Tool.dll-backed login succeeds;
- logout invalidates the Web session;
- unauthorized role cannot see target menu/screen;
- unauthorized direct route is blocked;
- unauthorized API/list/detail/export/action is blocked;
- authorized role sees only permitted business screens;
- list/search/filter/sort/paging operate server-side;
- desktop uses shared Grid Engine;
- mobile uses separate semantic list/card presentation;
- business-state rules can further disable actions even when the user owns the permission;
- every mutation returns authoritative success/rejection/conflict/outcome-unknown semantics;
- regression tests cover at least one allowed and one denied role path per pilot screen.

## Lead closure transition

When all seven Phase 1 gates pass:
1. update `docs/PROJECT_STATE.yaml` to `phase_status: awaiting_csharp_round` and `all_phase1_acceptance_proven: true`;
2. reconcile/close Phase 1 issues as appropriate;
3. immediately create/finalize the Phase 2 BE/FE implementation plan above;
4. only after the plan is durable, disable all five Phase 1 schedules.

If Phase 1 cannot be closed by 21:00, Lead must leave a precise durable blocker list and continue hourly closure work. The planning deadline remains 08:00 and must not be replaced by status-only reporting.
