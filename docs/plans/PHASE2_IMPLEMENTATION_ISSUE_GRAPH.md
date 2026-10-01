# Phase 2 implementation issue graph

This file is the durable source for bounded GitHub implementation Issues. Each
Issue created from this graph must keep the objective, non-goals, dependencies,
contracts, acceptance tests, security/tenant constraints and definition of done
in its body. A lane may begin only when all dependency IDs marked READY are
available; BLOCKED issues may be investigated without enabling unsafe product
behavior.

## Status rules

- **READY**: implementation can start from current verified contracts.
- **READY WITH BOUNDS**: only the stated read/platform subset may start.
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
| T1 | Verify Tool.dll source/runtime and choose isolated adapter or private bridge | BLOCKED | source/C# package | Exact APIs, target, dependencies, session/logout/permission semantics, thread safety, timeout/disposal; contract suite and bridge decision. |
| B4 | Verify permission and company/branch/storehouse precedence | BLOCKED | T1,TRC-DB-001 | Server-derived effective scope and role-revoke tests using authoritative evidence. |

## Foundation lane B — data and commands

| ID | Issue title | Status | Dependencies | Acceptance focus |
|---|---|---|---|---|
| B1 | Typed query/form adapter platform and DTO versioning | READY WITH BOUNDS | A2,A4,A6,TRC-DB-001 | Stable ScreenId/QueryId, allow-listed filters/sorts/page, list/detail DTOs, no SQL object input. |
| B2 | Complete sanitized DB catalog, dependencies and per-object reuse disposition | BLOCKED | authoritative dump access | 583-table/column metadata, constraints/indexes, 203 views/591 procs/109 funcs/3 triggers, dependency graph, classification/reuse; no raw dump. |
| B3 | Command registry/handler and legacy SP transaction contract | BLOCKED | B2,T1,B4 | Typed ActionId, state/scope checks, SP signature/locks/hooks/XACT_ABORT/transaction owner, authoritative reread, idempotency. |
| B4 | (shared above) | BLOCKED | T1,B2 | Scope/permission precedence and tests. |
| B5 | Concurrency, idempotency and OutcomeUnknown contract per command | BLOCKED | B2,B3 | Version token only when verified; duplicate/lost-ACK/deadlock/timeout/partial-transaction tests. |
| R2 | RPX/report/query reachability and export contract | BLOCKED | B2,ERP evidence | Candidate vs reachable reports, parameters/subreports, typed adapter, export authorization and formula-injection tests. |
| R4 | Live SQL options, backup, restore and RPO/RTO evidence | BLOCKED | DBA/SRE access | Confirm dump options at runtime, backup/restore rehearsal and documented recovery targets. |

## Foundation lane F — frontend

| ID | Issue title | Status | Dependencies | Acceptance focus |
|---|---|---|---|---|
| F1 | Next.js/shadcn/Tailwind shell, auth route guard and authorized navigation | READY WITH BOUNDS | A3,A4,A7 | Server capability-driven menu, direct-route denial UX, mobile drawer + persistent role quick-nav. |
| F2 | Shared ERP Grid/query state/virtualization engine | READY WITH BOUNDS | A4,B1 | Server filter/sort/page, 100k rows/100+ columns, keyboard/frozen columns/saved views/freshness. |
| F3 | Form/lookup/toast/error/conflict/session UX primitives | READY | A3,A4,A6 | Top-center feedback, authoritative success only, persistent validation/conflict/OutcomeUnknown, accessibility. |
| F4 | Read-only AP Order and IV Inbound Request surfaces | READY WITH BOUNDS | F1,F2,B1,TRC-DB-001 | Authorized list/detail/read path only; server scope and mobile/desktop/freshness tests. |
| F5 | Verify Sales request menu/action and implement slice | BLOCKED | T1,B1,B3,B4,B5,ERP evidence | Exact `AR_InvoiceRequestFrm` path/action; query + mutation + state + export acceptance. |
| F6 | Verify internal-transfer binding and implement slice | BLOCKED | B2,B3,B4,B5,ERP evidence | Exact form/master/detail/query/action; no guessed contract; concurrent transfer tests. |
| F7 | Verify purchase approval transition and implement slice | BLOCKED | B2,B3,B4,B5,ERP evidence | Approve/reject/return state/SP/lock/idempotency and allowed/denied E2E. |
| F8 | Implement AP Order mutation slice | BLOCKED | B3,B4,B5,ERP evidence | Save/submit/cancel state and authoritative reread; read surface from F4 may proceed. |
| R3 | Verify DAT source machine, precedence and executable grammar | BLOCKED | ERP/C# evidence | Source identity, watcher/hash test, normalized parser, presentation-vs-executable validation. |

## Integration and quality lane Q/R

| ID | Issue title | Status | Dependencies | Acceptance focus |
|---|---|---|---|---|
| Q1 | Authorization and tenant-isolation E2E matrix | READY WITH BOUNDS | A2,A4,A6 | Allowed/denied roles, direct URL/API/export, scope widening, stale role, identical IDs and no leaks. |
| Q2 | Frontend accessibility, responsive and grid-stress harness | READY | F1,F2,F3 | WCAG 2.2 AA, 390px mobile, keyboard/focus/touch, 100k/100+ grid and 10s latency budgets. |
| Q3 | WinForms external-write, SignalR loss/reconnect and freshness harness | READY WITH BOUNDS | A2,A6,A7,F2 | Dropped/duplicate/reordered events, external SQL write, SWR/poll/focus/manual convergence. |
| R1 | SignalR event source, group isolation and scale/backplane decision | BLOCKED | A2,A4,A6,operations evidence | Post-commit only, scope-derived groups, reconnect/gap recovery and measured topology choice. |
| R5 | Coexistence rollout, kill switch and non-destructive rollback | READY WITH BOUNDS | A1,A5,A7,Q3,R4 | Additive migration, slice disablement, build/config rollback, no transaction reversal, restore runbook. |
| Q4 | Full five-pilot integration/E2E and release readiness | BLOCKED | F5,F6,F7,F8,B5,Q1,Q2,Q3,R1,R2,R5 | Complete auth, scope, query, mutation, export, freshness, mobile, support, CI and rollback matrix. |

## Dependency waves

1. **Wave 0:** A1, B2 evidence preparation, T1 and R3 investigations begin;
   A2, A3, A4, A5, A6, A7, F1, F2, F3, Q1 and Q2 can proceed in parallel.
2. **Wave 1:** B1 and F1/F2 integration after A2/A4 contracts; F4 read-only
   surfaces after B1 plus DB ID confirmation.
3. **Wave 2:** B3/B4/B5 and F5–F8 only as their exact ERP/DB/Tool evidence
   closes; R1/R2/R4/R5 run in parallel where environment access permits.
4. **Wave 3:** Q3 and Q4 complete the full pilot matrix; Lead repeats the
   adversarial review and release/rollback decision.

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
