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


## Updated owner execution directive — 2026-09-30 late evening

### Absolute deadlines

- **Phase 1 absolute cutoff: 2026-10-01 01:00 Asia/Ho_Chi_Minh.**
- **Phase 2 implementation plan + adversarial plan review: complete before 2026-10-01 08:00 Asia/Ho_Chi_Minh.**
- **Pilot functionality completion target: before 2026-10-02 09:00 Asia/Ho_Chi_Minh (Friday).**

The 01:00 cutoff is a hard transition point. Phase 1 workers must spend the remaining window only on closure-critical executable evidence. No broad new archaeology is allowed unless it can invalidate a closure gate.

At 00:30, if any closure gate is still blocked, Lead must escalate from normal hourly ownership to direct critical-path closure: consume the live specialist evidence, identify the smallest missing durable artifact, and drive that artifact to completion on the owning lease or record the exact non-deferrable blocker.

Do not fabricate completion. If a fact genuinely cannot be proven from the available authoritative source, keep it as a bounded UNKNOWN. Missing executable deliverables that can still be produced from the source are not allowed to be relabeled UNKNOWN merely to meet the clock.

### Phase 2 planning must be 100% implementation-ready

The Phase 2 plan is not complete merely because headings exist. It must contain:
- concrete BE/FE/QA issue graph and dependency ordering;
- Tool.dll authentication adapter boundary and explicit verification tasks for any unknown method/session semantics;
- navigation/menu, route, API, data-scope, mutation and export authorization contracts;
- exact known ERP/DB bindings for each pilot screen;
- screen-level DTO/query/command contracts;
- desktop/mobile schema decisions using the adopted Grid/Mobile contract;
- migration/coexistence/rollback strategy;
- test strategy, CI gates and definition of done;
- deployment/local-run assumptions;
- owner-visible progress checkpoints.

### Mandatory adversarial attack on the plan

Before implementation begins, Lead must attack the plan from all of these perspectives and durable-record findings/corrections:
- senior Windows/ERP engineer;
- backend/API engineer;
- frontend architect;
- SQL Server DBA;
- BA/accounting operator;
- warehouse operator;
- purchasing/sales operator;
- security engineer;
- performance engineer;
- reliability/SRE;
- support/operations;
- accessibility/mobile UX critic;
- accidental misuse;
- malicious misuse;
- migration/coexistence/rollback reviewer.

The attack must explicitly try to break:
- Tool.dll login/logout/session lifecycle;
- permission/menu visibility vs direct-route/API bypass;
- role changes during session;
- company/branch/storehouse scope;
- document-state authorization;
- stale/concurrent edits;
- duplicate retry/idempotency;
- partial transaction / trigger side effects;
- grid performance and huge datasets;
- slow network/offline/reconnect;
- export/report authorization;
- config corruption and saved-view drift;
- mobile action safety;
- observability/support diagnostics;
- rollout/rollback with WinForms coexistence.

Each discovered issue must be either fixed in the plan, converted to a bounded implementation blocker with owner/acceptance test, or explicitly proven to be a variant of an existing risk class.

### Immediate coding after plan acceptance

If the implementation plan and adversarial review finish before the 08:00 deadline, coding begins immediately. Do not wait for the deadline.

Reuse the existing five automation slots after Phase 1 instead of creating a sixth schedule. Lead owns the transition and should repurpose lanes to implementation work rather than leaving completed analysis loops idle.

Recommended implementation-lane mapping after Phase 1 closure:
1. **Backend/Auth lane** — Tool.dll adapter, login/logout/session, authorization/capability service, route/API enforcement.
2. **Backend/Data lane** — typed query/command adapters, DB bindings, transaction/idempotency/audit.
3. **Frontend lane** — login/session UX, authorized shell/navigation, shared Grid Engine, desktop/mobile screen schemas.
4. **Integration/QA lane** — cross-screen workflow, permission matrix, end-to-end tests, performance/reliability/rollback.
5. **Lead lane** — issue orchestration, red-team/review, CI closure, integration, release-readiness.

### Pilot implementation scope due before Friday 09:00

Required:
1. Tool.dll-backed login.
2. Logout and invalid session handling.
3. Permission-filtered module/menu/navigation.
4. Server-enforced route/API/data/mutation/export authorization.
5. Bán hàng → Đề nghị bán hàng.
6. Quản lý kho → Đề nghị nhập hàng.
7. Quản lý kho → Đề nghị điều chuyển nội bộ.
8. Mua hàng → Duyệt đề nghị mua hàng.
9. Mua hàng → Đặt mua hàng.

For each business screen, "complete" means:
- authorized role can discover/open/use the screen;
- unauthorized role cannot see it in navigation and cannot access it by direct URL/API;
- list/detail data is scoped correctly;
- server-side search/filter/sort/paging works;
- required create/edit/approve/transition behavior in scope is bound to authoritative backend rules;
- desktop uses shared Grid Engine;
- mobile uses its own semantic presentation;
- permission + business-state tests exist;
- critical mutation outcomes are unambiguous and retry-safe according to the available contract;
- CI is green for the exact implementation head.

If any exact source dependency (for example Tool.dll method names or the exact internal-transfer form binding) remains unknown, resolve it as the first implementation blocker; do not substitute a guessed API or guessed form.


## Adopted implementation stack and mobile navigation

Owner-approved Phase 2 implementation decisions:

### Backend
- C# / ASP.NET Core on **.NET 10 LTS**.
- Tool.dll must be isolated behind a backend compatibility adapter. If direct .NET 10 loading is unsafe/incompatible, use a Windows/.NET Framework compatibility bridge rather than rewriting or guessing Tool.dll behavior.
- SQL Server access remains server-only and typed.
- ASP.NET Core SignalR is the preferred realtime transport for post-commit Web-owned invalidation where freshness materially matters.

### Frontend
- Next.js + React + TypeScript.
- **shadcn/ui** + Tailwind for fast implementation of shell/forms/drawer/dialog/menu/admin surfaces.
- TanStack Query for authoritative server state/revalidation.
- TanStack Table + virtualization for the shared ERP Grid platform.

### Mobile navigation
- persistent bottom quick-navigation bar;
- Menu item opens a left-side drawer/sidebar containing the full authorized ERP menu;
- quick-action slots are configurable **per role**;
- only a verified admin account can edit/publish role quick-nav configuration from the UI;
- non-admin users cannot override the role quick-nav layout;
- role quick-nav is presentation only and never grants permission;
- permission/capability changes should invalidate navigation through SignalR when possible, with SWR/focus/manual revalidation fallback.

Implementation must read:
- `docs/web/MOBILE_NAVIGATION_ROLE_CONFIG.md`
- `docs/web/GRID_MOBILE_IMPLEMENTATION_CONTRACT.md`
- `docs/architecture/PHASE2_TECH_STACK.md`

### Added authorization acceptance
- admin configuration API/route is server-protected;
- a non-admin cannot modify role bottom nav by crafted requests;
- configured shortcuts targeting unauthorized capabilities are omitted from effective navigation;
- role permission revocation removes the shortcut without requiring a new login after authoritative revalidation;
- drawer and bottom nav derive from one server-resolved capability model, not separate permission systems.


## Mandatory consolidated owner directives

Before declaring the Phase 2 implementation plan complete, Lead and all implementation lanes must read and disposition:
- `docs/plans/OWNER_WEB_IMPLEMENTATION_DIRECTIVES.md`
- `docs/architecture/WEB_PLATFORM_SHARED_SERVICES.md` from the live Architecture lease
- `docs/web/UX_RUNTIME_FEEDBACK_SESSION.md` from the live UX lease
- `docs/web/MOBILE_NAVIGATION_ROLE_CONFIG.md`
- `docs/web/GRID_MOBILE_IMPLEMENTATION_CONTRACT.md`
- `docs/architecture/PHASE2_TECH_STACK.md`

New mandatory planning coverage:
- reusable cross-project WebCore/config/session/audit/idempotency/outbox/trace services;
- durable business/security audit plus bounded diagnostic trace;
- FE/API/DB correlation IDs;
- toast/operation feedback and perceived-speed behavior;
- 24h default idle logout with admin-configurable timeout minutes;
- background polling/SignalR cannot extend genuine inactivity;
- dynamic Screen Definition + DB/DAT synchronization with versioning, validation, audit and rollback;
- explicit separation of presentation changes from executable/business configuration;
- agents may adopt a better architecture only with documented rationale and equivalent-or-better acceptance coverage.
