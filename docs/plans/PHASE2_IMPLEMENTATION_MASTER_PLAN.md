# Medcom Phase 2 implementation master plan

Status: **coverage reviewed; evidence pending; implementation not authorized in this planning run**  
Plan date: 2026-10-01 (Asia/Ho_Chi_Minh)  
Owner: Lead / Integrator

This document is the single orchestration plan for Phase 2. Specialist
contracts remain normative at their existing paths; this file joins them into
an executable dependency graph, records the fixed pilot scope, and makes every
READY/BLOCKED boundary explicit. It does not replace the evidence baseline or
invent legacy runtime behavior.

The independent Phase 1 audit in
`docs/reviews/PHASE1_CLOSURE_AUDIT_20261001.md` currently leaves the DB catalog
and exhaustive traceability gates open. Those gaps are included as bounded
implementation dependencies. No production application code is created by
this planning run.

## 1. Goals, fixed scope and non-goals

### Goals

Phase 2 will provide a server-authoritative Web ERP foundation that can be
implemented in parallel by backend, frontend and QA lanes. It must:

- serve multiple Medcom customers through one shared HTTPS backend endpoint;
- preserve proven ERP/SQL business semantics during WinForms coexistence;
- expose typed query and command contracts instead of arbitrary SQL metadata;
- make dense desktop work fast while giving mobile a semantic presentation;
- make authorization, scope, audit, freshness and failure outcomes observable;
- support dynamic, versioned presentation configuration without shipping every
  label or column change in a frontend release;
- leave exact Tool.dll, menu, mutation and internal-transfer unknowns blocked
  until source evidence is available.

### Fixed pilot scope

1. Tool.dll-backed login.
2. Logout and server-session invalidation.
3. Authorized navigation/menu and capability discovery.
4. Server enforcement at route, query/data, mutation/action and export/report.
5. Bán hàng → Đề nghị bán hàng.
6. Quản lý kho → Đề nghị nhập hàng.
7. Quản lý kho → Đề nghị điều chuyển nội bộ.
8. Mua hàng → Duyệt đề nghị mua hàng.
9. Mua hàng → Đặt mua hàng.

The internal-transfer screen is a required pilot slot even though its exact
form and data binding is UNKNOWN. Generic platform contracts can be planned independently. Any future implementation
requires authorization and its dependencies; this vertical slice also requires exact source evidence.

### Non-goals for this run

- no ASP.NET, Next.js, SQL, Tool.dll, bridge or production UI scaffolding;
- no raw ERP ZIP, SQL dump, binary, credential, connection string, customer or
  transaction data in the public repository;
- no blanket rewrite of working stored procedures into C#;
- no per-customer ports, code forks or client-selected connection strings;
- no guessed Tool.dll method/class names, permission precedence, workflow,
  SP signatures, concurrency tokens or internal-transfer tables;
- no destructive schema cleanup or rollback of committed business data.

## 2. Evidence and source policy

The authoritative baselines are recorded in `docs/SOURCE_BASELINE.md`:

- Windows package `ERP_Medcom2026(4).zip`, SHA-256
  `801cccb871fedce049ec3c446aeff819d7661ec94641a891d6013d4b86a0bd52`;
- SQL package `Medcom-Data (3)(1).zip`, SHA-256
  `2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`.

Use the four evidence levels from `docs/EVIDENCE_STANDARDS.md`. Every screen,
object, permission and command row must cite a source path/object and retain
UNKNOWN when static evidence cannot prove runtime behavior. The corrected SQL
counts in `docs/db/DECLARATION_COUNT_CORRECTION.md` and
`DECLARATION_NORMALIZATION.md` supersede earlier provisional numbers. The
required row-level catalog is tracked by `TRC-DB-001`; it is not silently
replaced by aggregate counts.

The sanitized owner-supplied C# review summaries are secondary evidence. They
help prioritize verification of `FormControler`, `LayoutX`, `Storer`, LYT1/LYS1
and dynamic UserControls, but raw C# source remains a separate verification
round and cannot prove Tool.dll runtime APIs by itself.

## 3. Fixed technical stack

### Backend

- C# with ASP.NET Core on .NET 10 LTS.
- SQL Server through server-only, parameterized adapters.
- ASP.NET Core SignalR for post-commit invalidation where it improves
  correctness or perceived freshness.
- OpenTelemetry-compatible structured traces/metrics alongside bounded durable
  support records.
- Tool.dll behind `Medcom.Legacy.ToolAdapter`; use an isolated Windows/.NET
  Framework compatibility bridge if direct .NET 10 loading is not proven safe.

Classic ASPX is not the default. It can be considered only if a verified
legacy compatibility requirement makes it materially safer and the decision is
recorded as an architecture exception.

### Frontend

- Next.js, React and TypeScript.
- shadcn/ui and Tailwind for shell, forms, drawer, dialogs and admin surfaces.
- TanStack Query for authoritative cache/revalidation and TanStack Table with
  virtualization for the shared ERP Grid platform.
- Separate desktop grid and mobile list/card schemas from
  `docs/web/GRID_MOBILE_IMPLEMENTATION_CONTRACT.md`.

## 4. Single-port multi-customer topology

The default topology is one HTTPS endpoint and one service deployment:

```text
Customer browsers
        |
        v
one HTTPS endpoint / one ASP.NET Core service port
        |
        +--> authenticated tenant/company resolver
        +--> authoritative data-source resolver
        +--> typed query/command adapters
        +--> SQL Server / legacy profile selected by server policy
```

The resolver must support:

- several companies in one shared database;
- one database per company;
- several databases for one company;
- local or remote SQL Server;
- a company-specific legacy/Tool.dll profile.

The browser may request a business company context for a permitted switch, but
it cannot select a tenant, server, database, connection string, storage target
or legacy profile. The server resolves those values from authenticated identity,
approved membership, provisioning records and deployment policy. Invalid or
stale context is rejected before query construction.

Every scope-bearing key includes tenant/company/branch/storehouse identity as
applicable. This fencing is mandatory for:

- connection and connection-pool checkout;
- query/result and screen-definition caches;
- SignalR groups and subscriptions;
- background jobs and retry payloads;
- audit and operation traces;
- correlation and idempotency records;
- screen/config overrides and saved views.

A pool checkout must set a scope-safe session context and clear it before
return. No singleton repository may retain a tenant-specific connection or
mutable scope. Cross-tenant tests use identical business IDs in separate
customers and assert no counts, errors, exports or cache entries cross the
boundary.

## 5. Deployment and topology plan

The first deployment is a small, observable service behind TLS termination and
an HTTP load balancer. The service is stateless except for server-side session,
idempotency, config and audit stores. A scale-out design must choose a shared
SignalR backplane only after a measured need; a single instance is sufficient
for the first slice but the contract cannot depend on process-local groups.

Required operational components:

- secret manager for SQL credentials and bridge credentials;
- health endpoint that distinguishes process readiness, database readiness and
  Tool/bridge readiness;
- bounded worker for config sync, outbox delivery and retention purge;
- metrics for latency, DB time, pool saturation, adapter availability, event
  gaps, session expiry, denied requests and cache staleness;
- centralized redacted logs with build, environment and correlation metadata;
- runbooks for bridge outage, database failover, config rollback and Web slice
  disablement.

The baseline SQL dump records SIMPLE recovery, RCSI ON, explicit SNAPSHOT OFF,
Service Broker disabled, Query Store OFF and AUTO_SHRINK ON. The first release
preserves these settings. Live backup cadence, restore evidence, RPO/RTO,
server-level options, tempdb and storage latency are operational blockers, not
assumptions.

## 6. Backend platform architecture

Organize the solution into boundaries that can be tested independently:

1. **Host/API** — HTTPS, cookies/CSRF, request limits, correlation, error
   mapping, route policies and health checks.
2. **Application** — session, capability, tenant/scope, query, command, screen
   definition, audit and idempotency services.
3. **Contracts** — versioned DTOs, stable ScreenId/ActionId/QueryId and result
   codes. No Tool.dll types or SQL object names cross this boundary.
4. **Adapters** — CRUD/Form Adapter, Query Adapter, Command Registry/Handler,
   report/export adapter and the isolated Tool.dll adapter.
5. **Infrastructure** — SQL connection/source resolver, cache, SignalR
   invalidation, outbox/job runner, telemetry and secret access.

Classify a screen/action as `SAFE_GENERIC_CRUD`, `CRUD_WITH_HOOKS`,
`COMMAND_ONLY`, `READ_ONLY` or `SPECIAL_WORKFLOW`. Transactional forms with
   triggers, locks, procedures or legacy hooks default to a compatibility
   facade. The browser never sends a table, view, stored-procedure name or SQL
   statement for execution.

## 7. Frontend platform architecture

The shell is capability-driven. On bootstrap it obtains the server-resolved
user, tenant context, effective capabilities, authorized modules/screens and
published Screen Definition versions. A route guard is a usability aid; every
API still enforces the same policy.

The shared Grid Engine owns server-side paging, filter descriptors, sorting,
column visibility/order/width, frozen columns, keyboard navigation, selection,
virtualized rows/columns, saved-view identifiers and freshness state. It does
not own business commands. It must handle 100,000+ rows and 100+ columns
without rendering the full result set.

Desktop forms optimize dense keyboard workflows, master/detail navigation,
validation and safe bulk actions. Mobile screens use semantic list/card
presentations with 4–6 high-value summary fields, explicit actions and no
horizontal desktop grid. The persistent bottom quick nav is role-configurable;
Menu opens the full authorized drawer/sidebar. Only an authorized admin can
edit/publish role quick-nav configuration, and shortcuts never grant access.

## 8. Dynamic Screen Definition and config sync

The compiler consumes three sources:

1. verified SQL metadata/config (including existing `SY_*` capability);
2. authoritative DAT layout/filter sources from the approved source machine;
3. Web/admin presentation overrides.

It normalizes these into a versioned Screen Registry. A sync cycle is:

1. FileSystemWatcher or equivalent event notices a candidate change;
2. periodic hash reconciliation catches missed events and wrong-source drift;
3. parser validates normalized DAT/XML and SQL metadata;
4. compiler resolves only allow-listed screen, field, lookup and command IDs;
5. changes are classified as presentation or executable;
6. executable references require server-side contract validation;
7. an immutable candidate version is written and audited;
8. the current pointer moves transactionally after validation;
9. a post-commit invalidation is emitted;
10. clients re-fetch and may retain the previous-good version on failure.

Presentation changes include labels, order, widths, visibility, harmless filters,
tabs, mobile fields and quick-nav layout. SP targets, signatures, SQL/formulas,
save/delete hooks, workflows and permission semantics are executable and never
reach the browser. Invalid executable config fails closed and leaves the last
known-good version active.

Target precedence is system → company → role → user only as an implementation
policy; the legacy precedence is UNKNOWN until verified. An override cannot
grant a capability, widen scope, weaken required validation or choose arbitrary
SQL. Admin publish and rollback require capability, optimistic version checks,
immutable history and audit.

## 9. Authentication, session and logout

The browser calls only the ASP.NET Core auth endpoints. The backend calls the
typed Tool adapter or private bridge. It owns the Secure/HttpOnly session cookie,
CSRF protection, session record, idle enforcement and revocation.

Default idle timeout is 1,440 minutes of real user inactivity. An authorized
admin may configure the timeout in minutes within a safe policy range. Only
meaningful user actions (pointer/keyboard input that the app accepts,
navigation, explicit refresh, save or Continue Session) advance activity.
SignalR, polling, SWR, background Query refresh, passive tab visibility and job
updates do not.

The client receives a warning before expiry. Continue Session is an
authoritative request, not a local timer reset. Logout invalidates the Web
session and the server-side legacy reference; ambiguous adapter results are
revalidated and reported as unknown. Expiry clears protected query state and
returns to a safe route. Dirty forms offer a local recovery path without
persisting secrets or unauthorized data.

Static metadata for Tools.dll is now verified in docs/erp/TOOL_DLL_METADATA_EVIDENCE.md. The observed signature shape is available for adapter design, but it does not prove login, logout, session, permission precedence or side effects.

The supplied Tools.dll statically targets `.NETFramework v4.6.2`; PE I386 with
CLR ILOnly does not prove an x86-only deployment. Host compatibility, dependency
availability, login/logout/session behavior, result semantics, thread safety and
disposal remain blocked by [T1/#19](https://github.com/thanhtuyen662002/Medcom/issues/19).

## 10. Authorization and data scope

Enforce five independent gates:

1. navigation/menu capability;
2. direct route;
3. query, detail, lookup, count and data scope;
4. mutation/action plus current business state;
5. export/report/file download.

The server derives tenant, company, branch and storehouse scope. A crafted URL,
API body, filter, sort, export parameter, quick-nav record or related lookup
cannot widen it. Responses avoid out-of-scope existence/count leaks. Role
revocation invalidates capability/navigation/cache state and takes effect on the
next authoritative request without requiring a new login.

Capability resolution and presentation configuration are separate services.
Quick-nav entries are filtered by effective capability and cannot create one.
Admin config routes are protected by the same server policy and have separate
audit events.

Required tamper cases are listed in `docs/architecture/PHASE2_AUTH_CAPABILITY_CONTRACT.md`
and the issue graph: direct route, direct API, tenant/company widening, branch
and storehouse widening, export bypass, role revoke, stale hub membership and
invalid business state.

## 11. CRUD, query and command model

### Query path

```text
FE stable ScreenId + typed filters/sort/page
  -> route/capability/scope policy
  -> allow-listed Query Adapter
  -> server-resolved SQL/view/SP contract
  -> list DTO + page/freshness metadata
```

Filter fields/operators are validated against a server contract derived from
DAT and verified DB metadata. Hidden DAT rows are retained and classified;
unresolved aliases fail closed. List and detail DTOs are separate. The server
controls maximum page size, sort allow-list, search normalization and timeout.

### Command path

```text
FE stable ActionId + typed DTO + idempotency key
  -> capability/scope/state validation
  -> typed Command Handler / approved legacy SP
  -> authoritative transaction and reread
  -> business/security audit + bounded trace
  -> post-commit cache invalidation/SignalR
```

Use idempotency records for harmful retries. A lost response is `OutcomeUnknown`
until the command ledger and authoritative business state reconcile it. The
same key with a different request fingerprint is rejected. Do not invent a row
version where no verified concurrency token exists; preserve procedure locks and
mark the gap.

## 12. Legacy Views, stored procedures and Tool.dll

Working legacy Views/SPs are reusable compatibility contracts when their
parameters, outputs, side effects, transaction owner and authorization behavior
are evidenced. The server wraps them with typed adapters and authoritative
rereads. Changing an SP mapping later must not change the browser contract.

The database evidence includes explicit `UPDLOCK,HOLDLOCK`, `sp_getapplock`,
mixed `XACT_ABORT ON/OFF`, triggers and internal-transfer procedure families.
The adapter must preserve those semantics and must not add a blanket outer
transaction or generic retry. Exact lock resources, timeout behavior, caller
transaction ownership, hook ordering and idempotency remain blockers for each
command family.

Tool.dll is never referenced by frontend or public contracts. The conservative
plan is a private Windows worker compatible with the verified Framework target.
A dedicated process context belongs to one authenticated ERP session and its
immutable server-established tenant, company, data source, ERP principal and
authorization generation. Serialize calls within that worker; never multiplex
different users, even within one company. Static `Connector.UserLogin`,
`UserGroup` and `UserFullName` prove a shared-state hazard, not the full state
model. Restoring those fields, AsyncLocal or a per-call lock is not evidence of
safe reuse. T1 must verify startup, dependencies, compatibility, capacity limits,
cleanup and a controlled isolation protocol before any alternative is accepted.
Retire the worker on logout, expiry, revocation, context mismatch, timeout or
unrecoverable failure. Invalidate access immediately; preserve command and
correlation records outside it. Worker termination does not prove SQL rollback.
An ambiguous write remains `OutcomeUnknown` until authoritative reconciliation;
no blind retry or reassignment to a fresh worker is allowed. The adapter maps only normalized
Success, Rejected, Expired, Forbidden, Unavailable, Timeout and Unknown states.

## 13. Reusable WebCore platform services and tables

Before adding tables, reconcile existing `SY_*` objects. A WebCore-style
capability set is required, but exact normalization is an implementation
decision. It must cover:

- app/tenant settings and session policy;
- immutable ScreenDefinition and ScreenDefinitionVersion;
- scoped presentation overrides and saved views;
- role quick-nav configuration;
- config sync checkpoints, audit/history and rollback pointers;
- idempotency records;
- durable outbox only where post-commit delivery needs it;
- business/security audit;
- bounded OperationTrace/support correlation.

All records need scope, actor/time and appropriate unique/index keys. Audit is
immutable. Diagnostic traces have retention and purge/partition rules so a
high-volume SQL table cannot grow without bound. A better design or external
telemetry sink is allowed when it preserves these invariants and documents the
trade-off.

## 14. Audit, trace and support

Business/security audit answers who, when, tenant/company/branch/storehouse,
screen, action, business object/document, result and correlation ID. It is
separate from high-volume diagnostic telemetry.

The operation trace links:

```text
FE request -> API route -> handler -> query/SP -> DB duration/retry
          -> idempotency result -> authoritative result/error -> build
```

Every support-worthy error returns a safe reference/correlation ID. Logs never
contain passwords, reusable tokens, connection strings, secrets or raw
sensitive payloads. Redaction, retention, access control and purge are tested.

## 15. Realtime, freshness and coexistence

SignalR sends only post-commit invalidation hints with server-derived scope and
version. It is never the sole correctness source because WinForms may write
SQL directly without a Web event. Each screen therefore defines SWR,
focus-return revalidation, bounded polling where justified and manual refresh.

The client refetches authoritative state after invalidation, reconnect, a gap,
stale-age threshold or suspected external write. Duplicate/reordered/dropped
events are harmless. Hub groups are derived from live authorization and are
revoked after role/scope changes. Background refresh never extends session idle
activity.

## 16. Fixed pilot screen matrix

The following is a planning baseline. Read candidates still require verified
query bindings, scope, completed dependencies and future implementation authorization.
`BLOCKED` identifies evidence that cannot be guessed. No row authorizes coding in this run.

| Pilot | Stable ERP ID / path / confidence | Master/detail and list source | Route + DTO | Scope, permissions and state | Actions/command disposition | Desktop/mobile/freshness | BE / FE / QA / blockers |
|---|---|---|---|---|---|---|---|
| Sales request | `ERP-FRM-AR_InvoiceRequestFrm`; Bán hàng → Đề nghị bán hàng; CORROBORATED packaged form + DAT filter evidence, exact menu label UNKNOWN | `AR_InvoiceRequestTbl` / `AR_InvoiceRequestDetailTbl`; typed query candidate; exact joins/aliases require DB catalog | `/sales/invoice-requests`; `InvoiceRequestListDto`, `InvoiceRequestDetailDto`; server filter/sort/page | View/query/action capability plus tenant/company/branch/storehouse scope; document-state transitions UNKNOWN | Query candidate; binding and authorization pending. Create/edit/submit/approve/export command mapping BLOCKED (`F5`, `B3`) until menu/action/SP evidence and reread contract | Shared dense Grid + master/detail keyboard flow; mobile 4–6 field cards and safe action sheet; SWR with post-commit invalidation | BE `B1/B2/B3`; FE `F5`; QA `Q1/Q3`; exact menu/action and mutation contract remain blockers |
| Inbound request | `ERP-FRM-IV_InboundRequestFrm`; Quản lý kho → Đề nghị nhập hàng; CORROBORATED filter/table references, runtime aliases UNKNOWN | `IV_InboundRequestTbl` / `IV_InboundRequestDetailsTbl`; typed read adapter candidate; exact query dependencies pending catalog | `/inventory/inbound-requests`; `InboundRequestListDto`, `InboundRequestDetailDto` | Warehouse/company scope; view/query capability; submit/approve/state rules UNKNOWN | Read/list/query candidate; binding and authorization pending. Mutations and workflow command BLOCKED until hooks/SP/state contract verified | Grid with item/quantity/source warehouse columns; mobile request-oriented cards; freshness ≤15s target subject to evidence | BE `B1/B2/B3`; FE `F4` read-only and [F9/#42](https://github.com/thanhtuyen662002/Medcom/issues/42) source-gated writes; QA `Q1/Q3/Q4`; alias and mutation evidence |
| Internal transfer | Stable form, menu binding and master/detail DB objects UNKNOWN; path required by scope; confidence UNKNOWN | `IV_InternalTransfer_*` procedure family is VERIFIED; exact tables/views/query and aliases UNKNOWN | Reserved `/inventory/internal-transfers`; DTO names provisional and cannot be bound until `F6/B2` closes | Server warehouse/company scope; capability/state model defined, concrete permission/state mapping UNKNOWN | Entire vertical mutation/read binding BLOCKED; generic shell/grid may proceed; no guessed route/data source | Transfer-specific source/destination and status cards; manual refresh/SWR plus event fallback; no success toast without reread | BE `B2/B3`; FE `F6`; QA `Q1/Q3`; exact ERP form/data binding is a release blocker |
| Purchase approval | `ERP-FRM-AP_ApprovePurchaseRequestListFrm`; Mua hàng → Duyệt đề nghị mua hàng; CORROBORATED filter/table references, reachability/state UNKNOWN | `AP_PurchaseRequestTbl` / `AP_PurchaseRequestDetailTbl`; typed read candidate | `/purchasing/purchase-requests/approval`; `PurchaseRequestApprovalListDto`, `PurchaseRequestApprovalDetailDto` | Purchase/company/branch scope; view + approve capability; current-state precondition UNKNOWN | Read/query candidate; binding and authorization pending. Approve/reject/return commands BLOCKED (`F7/B3`) until transition/SP/lock/idempotency evidence | Dense approval grid with reason/conflict display; mobile review card with explicit confirm; SWR and authoritative reread | BE `B1/B2/B3`; FE `F7`; QA `Q1`; transition and permission precedence |
| Purchase order | `ERP-FRM-AP_OrderFrm`; Mua hàng → Đặt mua hàng; CORROBORATED form/filter/table references, exact mutation UNKNOWN | `AP_OrderTbl` / `AP_OrderDetailTbl`; typed read candidate | `/purchasing/orders`; `PurchaseOrderListDto`, `PurchaseOrderDetailDto` | Supplier/company/branch/storehouse scope; CRUD/action capability; status rules UNKNOWN | List/detail query candidate; binding and authorization pending. Save/submit/cancel commands BLOCKED until hooks/SP/signature/transaction evidence | Dense order grid and keyboard detail editor; mobile summary + line cards; freshness by workflow SLA | BE `B1/B2/B3`; FE `F4` read-only and `F8` source-gated writes; QA `Q1/Q3/Q4`; mutation contract and concurrency |

Every row must be expanded into a traceability record before its implementation
Issue is closed. Candidate table names are not permission or SQL authority.

## 17. Database migration strategy

Use additive expand → migrate/dual-read where proven → contract. First add
only WebCore/config/audit records that the reconciliation task proves missing;
do not duplicate existing `SY_*` data. Keep legacy columns/procedures intact
while adapters are exercised. Schema changes require a reviewed migration,
backout script, compatibility test and owner sign-off.

Pilot reads can begin through compatibility adapters once the exact DB catalog
row and authorization scope are resolved. Pilot writes remain behind typed
commands and proven procedures. Never expose a generic browser CRUD endpoint
over every table.

## 18. WinForms coexistence and rollback

During coexistence, both clients may write the same SQL contracts. Web-originated
changes emit post-commit invalidation; WinForms-originated changes may not. SWR,
focus refresh and manual refresh remain mandatory. Audit records source channel
when known and never fabricate a Web correlation for an uninstrumented legacy
write.

A Web vertical slice has a kill switch that removes its route/menu/capability
and returns users to the WinForms path while preserving committed business
data. Config rollback moves a pointer to a previous immutable version. Web
build rollback and bridge rollback do not reverse transactions, alter SQL
recovery/isolation settings or destructively rewrite shared schema. Database
restore/RPO/RTO remains an operations acceptance item.

## 19. Test strategy

### Unit and contract tests

- tenant/company resolver rejects client-selected server/database values;
- connection pool checkout/return clears scope;
- capability policy covers menu, route, query, mutation/state and export;
- session idle activity excludes background traffic;
- Tool adapter contract tests run without Tool.dll;
- query allow-list rejects unknown fields/operators/aliases;
- command registry rejects arbitrary object/action IDs;
- idempotency fingerprint and OutcomeUnknown reconciliation are deterministic;
- Screen Definition compiler rejects malformed/executable config and retains
  previous-good version;
- DTO serialization contains no Tool types, secrets or SQL object authority.

### Integration and end-to-end tests

- allowed and denied role for every pilot screen;
- crafted direct URL, API, detail, lookup, count, export and file requests;
- tenant/company/branch/storehouse widening with identical IDs;
- role revocation during an active session and stale hub connection;
- Tool login/logout/expiry/bridge unavailable/timeout once verified;
- server-side filter/sort/page and 100,000-row/100+column grid stress;
- 10-second latency, slow mobile network, superseded requests and reconnect;
- lost acknowledgement, duplicate retry, partial transaction, trigger effect,
  deadlock/lock timeout and stale edit;
- dropped, duplicate and reordered SignalR events plus WinForms direct SQL write;
- formula-injection-safe exports, redacted logs and bounded purge;
- malformed DAT/config, missed watcher event/hash reconciliation and rollback;
- coexistence slice disablement with no business-data reversal;
- WCAG 2.2 AA keyboard/focus/touch and 390px mobile layout.

## 20. CI and quality gates

### Backend

Restore/build with .NET 10, analyzers and nullable checks; unit tests;
SQL-adapter contract tests; integration tests against a disposable SQL Server;
tenant isolation and authorization tamper suite; migration idempotency and
rollback checks; secret/log scanning.

### Frontend

Typecheck, lint, component tests, route/capability tests, responsive/mobile
tests, accessibility checks, Grid virtualization/stress tests and bundle/perf
budgets. No UI test may treat hidden navigation as authorization proof.

### Integration/release

Run the allowed/denied permission matrix, direct tamper and scope isolation,
10-second latency and lost-ack tests, SignalR loss/reconnect, external WinForms
write simulation, export authorization, config rollback and coexistence smoke
tests. Do not weaken a gate to meet a date.

## 21. Implementation issue graph

The detailed issue records are in
`docs/plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md` and GitHub Issues created
from it. The critical dependency chain is:

```text
A1 bootstrap
  -> A2 tenant/data-source scope
  -> A3 session + A4 capability/authorization
  -> A5 WebCore reconciliation + A6 audit/trace
  -> B1 typed query platform + A7 Screen Registry
  -> F1 shell + F2 Grid/mobile primitives
  -> per-screen read slices
T1 Tool verification -> auth adapter -> login/route acceptance
DB/ERP catalog + C# evidence -> B2/B3 command bindings -> mutation slices
B4 scope/concurrency evidence -> retry/conflict UX -> E2E pilot release
```

The graph has 31 canonical issues (#12–42). Its historical 16 READY/BOUNDS and
15 BLOCKED labels describe planning disposition, not current start eligibility.
All implementation remains unauthorized in this run. After authorization,
respect each dependency edge before starting; only independent ready nodes may
run in parallel. Pilot writes and internal-transfer bindings additionally need
their evidence gates. F4/#31 covers reads; F9/#42 owns inbound write evidence
and the future bounded mutation slice. Q4/#41 requires verified F5–F9 outcomes,
B5, Q1–Q3, R1, R2, R4 and R5; read-only F4 alone cannot satisfy inbound acceptance.

## 22. READY/BLOCKED dependency ledger

### Reviewed platform candidates; dependencies and authorization still required

- .NET solution/API/contracts/CI bootstrap;
- single-port tenant and data-source interfaces with scope fencing;
- server-owned session policy and idle tests (adapter-agnostic);
- capability model and five-layer policy middleware;
- WebCore reconciliation/design task (physical tables gated by evidence);
- audit/correlation/redaction/retention baseline;
- Screen Definition registry/compiler interfaces and fail-closed tests;
- Next/shadcn shell, route guard, mobile drawer/bottom-nav primitives;
- shared Grid/query state/virtualization primitives;
- typed read adapters for AP Order and IV Inbound Request once catalog IDs are
  confirmed, without mutation claims;
- frontend accessibility/responsive/performance harness.

### Evidence-blocked or bounded candidates

- Tool.dll direct API/runtime/session verification;
- exact DB row-level catalog/dependency export;
- exact sales menu/action equivalence;
- exact internal-transfer form/master/detail/query/action binding;
- inbound request, purchase approval and AP Order mutation contracts;
- permission/company/branch/storehouse precedence and runtime scope;
- concurrency token, lock timeout and retry-safe command mapping;
- report/RPX reachability, parameters and export authorization;
- DAT source machine, executable grammar and legacy precedence;
- SignalR event source/backplane and operational RPO/RTO.

## 23. Definition of done

Planning coverage is reviewed when each requirement has a canonical owner issue,
ordered dependencies, an acceptance criterion and an explicit disposition for
unknown evidence. This is distinct from closing Phase 1, authorizing code,
passing runtime verification or proving implementation quality. A future issue
is eligible only when its contract is reviewed, its dependencies and applicable
evidence/runtime gates are closed, and implementation is authorized. Test
strategies here describe future acceptance; no test or CI pass is claimed.

A pilot screen is complete only when an authorized role can discover and use it,
an unauthorized role fails at navigation, route, API/data, mutation and export,
scope is correct, server-side query works, desktop/mobile presentations are
usable, critical outcomes are unambiguous/retry-safe, and the exact
implementation head is green in CI.

## 24. Owner-visible checkpoints

1. **Plan accepted:** this file, the adversarial review and issue graph are
   present on main; Phase 1 audit status is visible.
2. **Foundation green:** A1–A7 CI and security tests pass; no production
   vertical slice is enabled.
3. **Evidence unblock:** DB catalog, Tool verification and pilot bindings are
   reviewed; BLOCKED issues move individually, never by blanket status.
4. **First read slice:** one authorized pilot read path passes query, scope,
   grid, mobile and freshness acceptance.
5. **Mutation rehearsal:** command/idempotency/lock/audit/outcome-unknown tests
   pass for one verified workflow.
6. **Pilot release review:** all five screen rows, auth matrix, coexistence,
   rollback, support diagnostics and CI gates are green.

The Lead must re-run the seven-gate Phase 1 audit after the missing DB and
traceability artifacts land. Only then may `docs/PROJECT_STATE.yaml` transition
to `phase_status: awaiting_csharp_round` and
`all_phase1_acceptance_proven: true`.

## 25. Proposed Web transport contract

These are new Web contract decisions, not extracted ERP or SQL facts. A1/#12,
B1/#20 and B3/#22 own their versioned definitions; A4/#15 enforces authority.
Domain field lists, SQL mappings and concurrency mechanisms stay blocked until
source evidence is reviewed. Contract version 1 uses the following envelope.

| Field / shape | Requiredness and proposed rule |
| --- | --- |
| `contractVersion: integer` | Required; 1 initially. Unsupported versions fail before dispatch; breaking shape or semantic changes require a new version. |
| `screenId: string`, `queryId: string` or `actionId: string` | Required registered IDs, 1–128 characters; resolved by server allow-lists. No SQL object selectors. |
| `recordRef: string`, `detailRefs: string[]` | Required only for existing-record operations. Opaque scoped references; server reauthorizes every referenced row. Reference opacity does not establish permission. |
| Query `page: integer`, `pageSize: integer` | Required; page at least 1, pageSize 1–200. Sort includes a verified deterministic tie-breaker. Deep paging/cursor alternatives require a versioned query contract and measured evidence. |
| `filters: Filter[]`, `sort: Sort[]` | Required arrays, may be empty; at most 20 filters and 3 sort terms. Each uses a registered fieldId. Operators are allow-listed per field from eq, ne, lt, lte, gt, gte, contains, startsWith, in, isNull; in has at most 100 values. Unsupported fields, operators, coercions and nesting are rejected. |
| `payload: action-specific DTO` | Required for a command; closed typed schema rejects unknown properties. Dates, decimals, nullability and validation follow each reviewed domain contract; never infer SQL columns from an envelope. |
| `metadataRevision: string`, `permissionRevision: string` | Required for commands. Server compares revisions and rejects stale commands before side effects; it always re-evaluates live permission. Query responses include the current revisions. |
| `expectedVersion: string` | Required only when a verified domain concurrency mechanism exists. Do not invent rowversion; otherwise a reviewed lock/state precondition is a blocker. |
| `idempotencyKey: string` | Required for side-effect commands, 1–128 characters. Server scopes it to authenticated context and action, binds a canonical payload fingerprint, and rejects reuse with different content. Retention/replay windows require the per-command contract before enablement. |
| `correlationId: string` | Server generated and returned on every result; optional client reference is validated and never establishes authority. |
| Query response | Typed items plus page metadata, server timestamp, freshness state, metadata/permission revisions and correlation. Counts are optional and scoped; no unfiltered totals. |
| Command response | Discriminated outcome: Succeeded, Rejected, Conflict, OutcomeUnknown, Unavailable or Forbidden; correlation and operationRef when recorded. Success requires the verified completion and authoritative reread contract. |
| Safe error / validation | Stable code, safe message, correlation and optional fieldId errors. No SQL, secret, connection or out-of-scope existence details. Invalid input uses 400, unauthenticated 401, denied 403, stale/conflict 409, unavailable 503. Operation status distinguishes unknown completion from rejection. |

The browser never supplies authoritative tenant, company membership, data source,
ERP principal or permission state. A company-switch request is resolved and
reauthorized by the server. Background refresh never extends session activity.

For inbound requests, F9 first enumerates actions from authoritative form/DAT,
handlers and SQL evidence. Create, edit, save and submit are hypotheses until
verified; receipt, stock posting, approval, cancellation and deletion are not
implied. Each enabled action needs field/permission/state mappings, transaction
ownership, side effects, concurrency, idempotency and authoritative reread.
B5/#24 and Q4/#41 must cover worker loss after a possible commit and ensure
reconciliation precedes retry.
