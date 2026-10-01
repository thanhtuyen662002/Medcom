# Phase 2 implementation issue graph

This file is the durable source for bounded GitHub implementation Issues. Each
Issue created from this graph must keep the objective, non-goals, dependencies,
contracts, acceptance tests, security/tenant constraints and definition of done
in its body. This run is planning-only. Future implementation requires explicit
authorization, reviewed contracts, completed dependencies and applicable evidence
or runtime gates. A dependency labelled READY is not a completed dependency.
Evidence investigations may proceed within their authorized scope.

Current owner direction prepares a future coding workflow; `PHASE2_SCHEDULED_EXECUTION_PLAN.md` assigns each node exactly one primary scheduled lane. This preparation does not start application code or activate schedules. Source-free A1 may become eligible after plan integration/lease/preflight without claiming Phase 1 closure; all other predecessors and source/runtime gates remain mandatory.

## Status rules

- **READY**: historical label for a reviewed platform candidate; not permission to start.
- **READY WITH BOUNDS**: historical label for a bounded candidate; exact dependencies and evidence still apply.
- **BLOCKED**: a named evidence or runtime dependency must close first.
- **DONE** is reserved for a reviewed implementation head with green CI; these
  planning records are not DONE merely because an Issue exists.

## Foundation lane A — backend/auth/platform

| ID | Issue title | Status | Dependencies | Acceptance focus |
|---|---|---|---|---|
| A1 | Bootstrap .NET 10 solution, API/Application/Contracts/Infrastructure projects and CI | READY | none | Restore/build/analyzers/test skeleton; no Tool or SQL secrets in contracts. |
| A2 | Single-port tenant and authoritative data-source resolver | READY | A1 | Shared/per-company/multi-DB profiles; client cannot choose DB; pool/cache/job/audit/hub scope isolation tests. |
| A3 | Server session, 1,440-minute idle policy and logout invalidation | READY WITH BOUNDS | A1 | Meaningful activity only; warning/Continue/expiry/dirty recovery; background traffic does not extend idle. |
| A4 | Capability model and five-layer authorization middleware | READY WITH BOUNDS | A1,A2,A3 | Menu, route, query/data, mutation/state and export gates; no count/existence leak; role revoke. |
| A5 | Reconcile existing SY_* and define reusable WebCore schema/services | READY | A1,A2 | Settings/session/screen versions/overrides/quick-nav/sync/audit/idempotency/outbox/trace only where gaps are proven; indexes and purge. |
| A6 | Business audit, correlation, redaction and bounded operation trace | READY | A1,A2,A4 | FE→API→handler→DB/SP reference; safe support ID; secret/payload redaction and retention. |
| A7 | Screen Definition registry/compiler/config sync and rollback | READY WITH BOUNDS | A1,A4,A5 | DAT + SQL + admin sources, watcher/hash, fail-closed executable validation, immutable version and previous-good rollback. |
| T1 | Verify supplied Tools.dll source/build/runtime and choose isolated adapter or private bridge | BLOCKED | approved ERP/VB source and controlled runtime | Static target is .NETFramework v4.6.2; verify source-to-binary provenance, host/dependencies and session/logout/permission semantics, thread safety, timeout/disposal; contract suite and bridge decision. Tool.dll is historical shorthand. |

## Foundation lane B — data and commands

| ID | Issue title | Status | Dependencies | Acceptance focus |
|---|---|---|---|---|
| B1 | Typed query/form adapter platform and DTO versioning | READY WITH BOUNDS | A2,A4,A6,TRC-DB-001 | Stable ScreenId/QueryId, allow-listed filters/sorts/page, list/detail DTOs, no SQL object input. |
| B2 | Complete sanitized DB catalog, dependencies and per-object reuse disposition | BLOCKED | authoritative dump access | 583-table/column metadata, constraints/indexes, 203 views/591 procs/109 funcs/3 triggers, dependency graph, classification/reuse; no raw dump. |
| B3 | Command registry/handler and legacy SP transaction contract | BLOCKED | A4,A6,B2,T1,B4 | Typed ActionId, state/scope checks, SP signature/locks/hooks/XACT_ABORT/transaction owner, authoritative reread, idempotency. |
| B4 | Verify permission and company/branch/storehouse precedence | BLOCKED | T1,B2 | Server-derived effective scope, same-company user isolation and role-revoke tests using authoritative evidence. |
| B5 | Concurrency, idempotency and OutcomeUnknown contract per command | BLOCKED | A5,B2,B3 | Verified persistent ledger/outcome storage; version token only when verified; duplicate/lost-ACK/deadlock/timeout/partial-transaction tests. |
| R2 | RPX/report/query reachability and export contract | BLOCKED | B2,ERP evidence | Candidate vs reachable reports, parameters/subreports, typed adapter, export authorization and formula-injection tests. |
| R4 | Live SQL options, backup, restore and RPO/RTO evidence | BLOCKED | DBA/SRE access | Confirm dump options at runtime, backup/restore rehearsal and documented recovery targets. |

## Foundation lane F — frontend

| ID | Issue title | Status | Dependencies | Acceptance focus |
|---|---|---|---|---|
| F1 | Next.js/shadcn/Tailwind shell, auth route guard and authorized navigation | READY WITH BOUNDS | A3,A4,A7 | Server capability-driven menu, direct-route denial UX, mobile drawer + persistent role quick-nav. |
| F2 | Shared ERP Grid/query state/virtualization engine | READY WITH BOUNDS | A4,B1 | Server filter/sort/page, 100k rows/100+ columns, keyboard/frozen columns/saved views/freshness. |
| F3 | Form/lookup/toast/error/conflict/session UX primitives | READY | A3,A4,A6 | Top-center feedback, authoritative success only, persistent validation/conflict/OutcomeUnknown, accessibility. |
| F4 | Read-only AP Order and IV Inbound Request surfaces | READY WITH BOUNDS | F1,F2,B1,TRC-DB-001 | Authorized list/detail/read path only; server scope and mobile/desktop/freshness tests. |
| F5 | Verify Sales request menu/action and implement slice | BLOCKED | T1,B1,B3,B4,B5,F1,F2,F3,ERP evidence | Exact `AR_InvoiceRequestFrm` path/action; query + mutation + state + export acceptance. |
| F6 | Verify internal-transfer binding and implement slice | BLOCKED | B2,B3,B4,B5,F1,F2,F3,ERP evidence | Exact form/master/detail/query/action; no guessed contract; concurrent transfer tests. |
| F7 | Verify purchase approval transition and implement slice | BLOCKED | B2,B3,B4,B5,F1,F2,F3,ERP evidence | Approve/reject/return state/SP/lock/idempotency and allowed/denied E2E. |
| F8 | Implement AP Order mutation slice | BLOCKED | B3,B4,B5,F1,F2,F3,F4,ERP evidence | Save/submit/cancel state and authoritative reread; F4 supplies the separately gated read surface. |
| F9 | Verify inbound request mutations and implement bounded slice | BLOCKED | A4,A6,A7,T1,B1,B2,B3,B4,B5,F1,F2,F3,F4,ERP/VB/SQL evidence | Enumerate actual actions first; verify fields, permissions, hooks, transaction/state, idempotency and reread. Request entry never implies receipt or stock posting. |
| R3 | Verify DAT source machine, precedence and executable grammar | BLOCKED | ERP/VB evidence | Source identity, watcher/hash test, normalized parser, presentation-vs-executable validation. |

## Integration and quality lane Q/R

| ID | Issue title | Status | Dependencies | Acceptance focus |
|---|---|---|---|---|
| Q1 | Authorization and tenant-isolation E2E matrix | READY WITH BOUNDS | A2,A4,A6 | Allowed/denied roles, direct URL/API/export, scope widening, stale role, identical IDs and no leaks. |
| Q2 | Frontend accessibility, responsive and grid-stress harness | READY | F1,F2,F3 | WCAG 2.2 AA, 390px mobile, keyboard/focus/touch, 100k/100+ grid and 10s latency budgets. |
| Q3 | WinForms external-write, SignalR loss/reconnect and freshness harness | READY WITH BOUNDS | A2,A6,A7,F2 | Dropped/duplicate/reordered events, external SQL write, SWR/poll/focus/manual convergence. |
| R1 | SignalR event source, group isolation and scale/backplane decision | BLOCKED | A2,A4,A6,operations evidence | Post-commit only, scope-derived groups, reconnect/gap recovery and measured topology choice. |
| R5 | Coexistence rollout, kill switch and non-destructive rollback | READY WITH BOUNDS | A1,A5,A7,Q3,R4 | Additive migration, slice disablement, build/config rollback, no transaction reversal, restore runbook. |
| Q4 | Full five-pilot integration/E2E and release readiness | BLOCKED | F4,F5,F6,F7,F8,F9,B5,Q1,Q2,Q3,R1,R2,R4,R5 | Complete auth, scope, query, mutation, export, freshness, mobile, support, CI and rollback matrix. |

## Dependency waves

These are scheduling groups after implementation authorization, not exceptions to
the dependency table. Evidence investigations can be planned independently.

1. Start A1 after authorization. Prepare B2, T1 and R3 evidence only where the
   authoritative sources and controlled environment are available.
2. Complete A2/A3 after A1; A4 after A2/A3; A5 after A2; A6 after A4; A7 after
   A4/A5. Only nodes with every predecessor complete may execute in parallel.
3. B1 needs its platform predecessors and verified catalog; F1 needs A3/A4/A7;
   F2 needs A4/B1; F3 needs A3/A4/A6. F4 follows F1/F2/B1 and catalog binding.
4. B4 follows T1/B2; B3 follows A4/A6/B2/T1/B4; B5 follows A5/B2/B3. F5–F9 need F1/F2/F3 and their exact ERP/SQL evidence; F8/F9 also require F4's approved read surface. Bounded evidence investigation and storage-free test-double preparation may proceed independently without completing an integrated node or removing its gates.
5. Q1–Q3 and R1–R5 follow their listed dependencies and access requirements.
   Q4 is last and requires verified outcomes for all five pilots, including F9,
   operational recovery R4 and coexistence R5. Lead records final review.

## Common Issue body requirements

Every created Issue must include:

- objective and explicit non-goals;
- dependency IDs and exact contract/document paths;
- evidence level and unresolved facts;
- acceptance tests, including security and tenant constraints;
- definition of done tied to a green CI check;
- READY, READY WITH BOUNDS or BLOCKED reason;
- owner lane and handoff artifact.

No giant “implement the backend” or “implement the frontend” Issue is allowed.


## 2026-10-01 Lead correction: inbound coverage, isolation, and readiness

The status rules, rows and waves above have been reconciled with this review. This preparation run changes evidence/planning documents only. The 2026-10-01 owner request prepares a future gated coding workflow; future authorization and current-run start state are distinct. A reviewed design never overrides a missing predecessor, source or runtime gate.

### Readiness fields

Track design and implementation start separately in every Issue and status record:

- design_status: reviewed, needs_evidence, or needs_decision.
- start_status: eligible, waiting_dependencies, waiting_evidence, waiting_runtime, waiting_authorization, waiting_plan_integration, or waiting_preflight.
- depends_on: canonical GitHub issue numbers, not unresolved shorthand.
- evidence_blockers: exact source artifact, object, handler, runtime observation, or owner needed.

Only start_status=eligible means the reviewed design, completed dependencies, evidence/runtime gates and authorization all permit implementation. Historical READY/BOUNDS labels alone never establish eligibility. All 31 issues are waiting_plan_integration in this preparation run, with additional evidence/runtime/dependency blockers recorded independently. The owner has directed a future gated workflow; current application implementation remains false until integration and minimal bootstrap preflight. DONE still requires reviewed implementation and green CI.

### F9 inbound request mutation slice

F4 / issue [#31](https://github.com/thanhtuyen662002/Medcom/issues/31) remains read-only. F9 / issue [#42](https://github.com/thanhtuyen662002/Medcom/issues/42) owns any future write slice for IV_InboundRequestFrm and the candidate IV_InboundRequestTbl / IV_InboundRequestDetailsTbl bindings. F9 is BLOCKED on issues [#15](https://github.com/thanhtuyen662002/Medcom/issues/15), [#17](https://github.com/thanhtuyen662002/Medcom/issues/17), [#18](https://github.com/thanhtuyen662002/Medcom/issues/18), [#19](https://github.com/thanhtuyen662002/Medcom/issues/19), [#20](https://github.com/thanhtuyen662002/Medcom/issues/20), [#21](https://github.com/thanhtuyen662002/Medcom/issues/21), [#22](https://github.com/thanhtuyen662002/Medcom/issues/22), [#23](https://github.com/thanhtuyen662002/Medcom/issues/23), [#24](https://github.com/thanhtuyen662002/Medcom/issues/24), [#28](https://github.com/thanhtuyen662002/Medcom/issues/28), [#29](https://github.com/thanhtuyen662002/Medcom/issues/29), [#30](https://github.com/thanhtuyen662002/Medcom/issues/30), [#31](https://github.com/thanhtuyen662002/Medcom/issues/31) and source-backed ERP/VB/SQL evidence. The exact enabled actions, field bindings, permissions, validation, procedure signatures, transaction boundary, state transitions, concurrency and reread must be verified first. Request entry does not imply inventory receipt, stock posting, approval, cancellation or deletion. Q4 / issue [#41](https://github.com/thanhtuyen662002/Medcom/issues/41) depends on F4 and F9 as well as F5–F8, B5, Q1–Q3, R1, R2, R4 and R5.

### Tool.dll user isolation boundary

Static metadata verifies Connector.UserLogin, Connector.UserGroup and Connector.UserFullName are static user identity properties; it does not establish the full mutable process state, thread safety, reset, logout or cleanup behavior. Until controlled runtime evidence closes T1 / issue [#19](https://github.com/thanhtuyen662002/Medcom/issues/19), do not multiplex different authenticated ERP users through one live Tool.dll context. Use a dedicated process context for each authenticated ERP session and serialize its calls. Bind it to immutable server-resolved tenant, company, data source, authenticated ERP user and permission/session generation. Fail closed on missing or mismatched context and retire or invalidate the worker after logout, timeout, revocation, context mismatch or failure. Same-company users require isolation too. Worker termination does not prove transaction rollback; preserve command/correlation records outside the worker and reconcile OutcomeUnknown before any retry. B5 and Q4 own this failure acceptance. Do not treat restoring these three properties, a per-call lock, or AsyncLocal alone as proof of safety.

### Transport contract boundary

Master plan section 25 defines the proposed fields, types, requiredness, bounds, versions and outcomes. Proposed Web contracts may define stable ScreenId, QueryId and ActionId; opaque record/detail references; typed and versioned DTOs; bounded paging and allow-listed filter/sort operators; validation codes and safe messages; correlation and idempotency keys; explicit conflict and OutcomeUnknown results; and authoritative rereads. These are proposed API contracts, not extracted ERP/SQL facts. Do not invent columns, rowversion support, parameters, defaults, permission precedence or business transitions. The browser never supplies SQL, table/view/procedure names, connection selection or tenant/user authority.

### Canonical issue map

| Graph ID | GitHub issue | Graph ID | GitHub issue |
|---|---:|---|---:|
| A1 | [#12](https://github.com/thanhtuyen662002/Medcom/issues/12) | A2 | [#13](https://github.com/thanhtuyen662002/Medcom/issues/13) |
| A3 | [#14](https://github.com/thanhtuyen662002/Medcom/issues/14) | A4 | [#15](https://github.com/thanhtuyen662002/Medcom/issues/15) |
| A5 | [#16](https://github.com/thanhtuyen662002/Medcom/issues/16) | A6 | [#17](https://github.com/thanhtuyen662002/Medcom/issues/17) |
| A7 | [#18](https://github.com/thanhtuyen662002/Medcom/issues/18) | T1 | [#19](https://github.com/thanhtuyen662002/Medcom/issues/19) |
| B1 | [#20](https://github.com/thanhtuyen662002/Medcom/issues/20) | B2 | [#21](https://github.com/thanhtuyen662002/Medcom/issues/21) |
| B3 | [#22](https://github.com/thanhtuyen662002/Medcom/issues/22) | B4 | [#23](https://github.com/thanhtuyen662002/Medcom/issues/23) |
| B5 | [#24](https://github.com/thanhtuyen662002/Medcom/issues/24) | R2 | [#25](https://github.com/thanhtuyen662002/Medcom/issues/25) |
| R3 | [#26](https://github.com/thanhtuyen662002/Medcom/issues/26) | R4 | [#27](https://github.com/thanhtuyen662002/Medcom/issues/27) |
| F1 | [#28](https://github.com/thanhtuyen662002/Medcom/issues/28) | F2 | [#29](https://github.com/thanhtuyen662002/Medcom/issues/29) |
| F3 | [#30](https://github.com/thanhtuyen662002/Medcom/issues/30) | F4 | [#31](https://github.com/thanhtuyen662002/Medcom/issues/31) |
| F5 | [#32](https://github.com/thanhtuyen662002/Medcom/issues/32) | F6 | [#33](https://github.com/thanhtuyen662002/Medcom/issues/33) |
| F7 | [#34](https://github.com/thanhtuyen662002/Medcom/issues/34) | F8 | [#35](https://github.com/thanhtuyen662002/Medcom/issues/35) |
| Q1 | [#36](https://github.com/thanhtuyen662002/Medcom/issues/36) | Q2 | [#37](https://github.com/thanhtuyen662002/Medcom/issues/37) |
| Q3 | [#38](https://github.com/thanhtuyen662002/Medcom/issues/38) | R1 | [#39](https://github.com/thanhtuyen662002/Medcom/issues/39) |
| R5 | [#40](https://github.com/thanhtuyen662002/Medcom/issues/40) | Q4 | [#41](https://github.com/thanhtuyen662002/Medcom/issues/41) |
| F9 | [#42](https://github.com/thanhtuyen662002/Medcom/issues/42) | TRC-DB-001 | [#21](https://github.com/thanhtuyen662002/Medcom/issues/21) |

B4 is one node, owned by issue [#23](https://github.com/thanhtuyen662002/Medcom/issues/23), listed once and counted once. B2 / issue [#21](https://github.com/thanhtuyen662002/Medcom/issues/21) is the single owner of TRC-DB-001 row-level catalog evidence. The implementation graph has 31 issues. The historical labels comprise 16 READY/BOUNDS candidates and 15 BLOCKED candidates; these are not eligibility counts. Every issue still needs plan integration/preflight for the directed future workflow and any unfinished dependency or evidence/runtime gate. Current eligible-to-start count is zero.
