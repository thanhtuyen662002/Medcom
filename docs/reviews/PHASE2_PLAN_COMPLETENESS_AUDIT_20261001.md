# Phase 2 plan completeness audit

Audit date: 2026-10-01 (Asia/Ho_Chi_Minh)

This audit checks the requested pre-code plan against the durable master plan,
adversarial review, issue graph, specialist contracts and the newly verified
Tools.dll metadata. It records reviewed planning coverage with evidence still pending. It does not certify
that blocked source or runtime facts are solved, and it does not authorize
production code in this planning run.

## Coverage matrix

| Required plan area | Durable location | Decision |
|---|---|---|
| Goals, fixed pilot scope and non-goals | Master plan sections 1 and 2 | PASS |
| .NET 10, ASP.NET Core, SQL Server, SignalR and isolated Tool adapter | Master plan section 3; PHASE2_TECH_STACK; TOOL_DLL_BRIDGE_CONTRACT | PASS with Tool runtime blocker |
| One-port multi-customer topology | Master plan section 4; owner directives; architecture stack | PASS |
| Shared DB, per-company DB, multi-DB and local or remote SQL | Master plan section 4; Issue A2 | PASS |
| Tenant fencing for pools, cache, jobs, hubs, audit and config | Master plan section 4; A2 and Q1 | PASS |
| Deployment, health, secrets, telemetry and DR assumptions | Master plan section 5; R4 and R5 | PASS with live operations blocker |
| Backend platform boundaries | Master plan section 6; architecture contracts | PASS |
| CRUD/Form, Query and Command boundaries | Master plan sections 6 and 11; B1, B3 and B5 | PASS |
| Next, React, TypeScript, shadcn, Tailwind, TanStack and virtualization | Master plan sections 3 and 7; F1 and F2 | PASS |
| Dynamic Screen Definition compiler and registry | Master plan section 8; A7 and R3 | PASS with legacy precedence blocker |
| DAT watcher, hash reconciliation, validation, immutable versions and rollback | Master plan section 8; A7 and R3 | PASS |
| Presentation versus executable configuration separation | Master plan section 8; A7 | PASS |
| Tool.dll static identity and API shape | TOOL_DLL_METADATA_EVIDENCE; bridge contract; Issue 19 | PASS static only |
| Tool.dll runtime, session, logout and side effects | Bridge contract; T1 and Issue 19 | BLOCKED and explicitly bounded |
| Server-owned login, logout, 1440-minute idle policy and Continue Session | Master plan section 9; A3 | PASS as Web contract |
| Authorization at menu, route, query, mutation/state and export | Master plan section 10; A4, B4 and Q1 | PASS |
| Tenant, company, branch and storehouse scope authority | Master plan sections 4 and 10; A2, B4 and Q1 | PASS as contract; runtime evidence pending |
| Legacy View and SP reuse without arbitrary browser SQL | Master plan section 12; B1, B3 and R2 | PASS |
| Idempotency, OutcomeUnknown and command-specific retry | Master plan sections 11 and 19; B5 | PASS |
| WebCore settings, session, screen versions, overrides, quick nav, sync, audit and trace | Master plan section 13; A5, A6 and A7 | PASS |
| Business audit separate from high-volume diagnostics | Master plan section 14; A6 | PASS |
| Correlation from FE through API, handler, DB or SP and build | Master plan section 14; A6 | PASS |
| Realtime post-commit invalidation and SWR or polling fallback | Master plan section 15; Q3 and R1 | PASS with event-source blocker |
| Desktop grid and mobile semantic presentation | Master plan sections 7 and 16; F1, F2 and F4 | PASS |
| Mobile bottom nav, Menu drawer and admin-only quick nav | Master plan section 7; F1; mobile contract | PASS |
| Five fixed pilot screens and per-screen ownership | Master plan sections 16 and 25; B1, F4, F5, F6, F7, F8 and F9/#42 | Coverage reviewed; exact field/action/schema contracts remain evidence-blocked |
| Internal-transfer unknown preserved | Master plan section 16; F6 and Issue 33 | PASS |
| Additive DB migration and SY reconciliation | Master plan section 17; A5 and R5 | PASS |
| WinForms coexistence and non-destructive rollback | Master plan section 18; Q3 and R5 | PASS |
| Unit, integration, E2E, security, performance, mobile and recovery tests | Master plan section 19; Q1, Q2, Q3 and Q4 | PASS |
| Backend, frontend and integration CI gates | Master plan section 20; A1, Q2 and Q4 | PASS as planned gate; no workflow exists yet |
| Bounded implementation Issue graph and dependencies | Master plan section 21; issue graph; Issues 12 through 42 (31 canonical nodes) | PASS |
| Design disposition versus implementation eligibility | Master plan sections 21–23; graph status rules; PROJECT_STATE | Historical labels are not start eligibility; authorization false and eligible count zero |
| Definition of done and owner checkpoints | Master plan sections 23 and 24 | PASS |
| Adversarial multi-role attack and dispositions | PHASE2_PLAN_ADVERSARIAL_REVIEW.md | PASS |

## Remaining blockers

The following are explicitly represented in both the plan and issue graph:

- B2 and Issue 21: row-level sanitized SQL catalog, dependencies,
  classification and reuse disposition. Aggregate counts are insufficient.
- T1 and Issue 19: runtime and session semantics, dependency load test,
  exception and side-effect behavior, thread safety, and direct-load versus
  private bridge. Static Tools.dll metadata is verified but does not close it.
- B4 and Issue 23: authoritative permission and company, branch and storehouse
  precedence and runtime scope.
- B3 and B5, Issues 22 and 24: exact command or SP signatures, transaction
  ownership, concurrency and retry-safe behavior.
- R3 and Issue 26: DAT source machine, precedence and executable grammar.
- F5 and Issue 32: exact Sales request menu and action equivalence.
- F6 and Issue 33: exact internal-transfer form and data binding.
- F7 and Issue 34: exact purchase approval transition.
- F8 and Issue 35: exact purchase-order mutation contract.
- F9 and Issue 42: source-backed inbound-request action enumeration and exact
  field, permission, validation, transaction, state, concurrency and reread mapping.
  F4 is read-only and cannot satisfy this write coverage.
- R2 and Issue 25: RPX reachability, parameters and export authorization.
- R1 and Issue 39: event source, hub group and scale or backplane evidence.
- R4 and Issue 27: live SQL options, backup, restore and RPO or RTO evidence.

Each blocker has an owner lane, dependencies, security constraints and
acceptance tests. None is hidden behind a generic status field.

## Lead follow-up review

The follow-up found substantive omissions in the earlier certification. This
revision replaces that conclusion; PASS entries above mean an explicit planned
contract or gate exists, never a claim of implemented or verified runtime behavior.

| Finding | Planning correction | Evidence or implementation still required |
| --- | --- | --- |
| Missing inbound write owner | F9/[#42](https://github.com/thanhtuyen662002/Medcom/issues/42) added; Q4/[#41](https://github.com/thanhtuyen662002/Medcom/issues/41) requires its verified outcome | Authoritative actions and field/SQL/permission/transaction mappings; no inferred receipt or posting |
| READY and parallel waves bypassed dependencies | Graph status rules and waves corrected; B4 counted once; all 31 nodes require authorization | Each prerequisite must actually complete before dependent code starts |
| Static Tools identity could cross users | Master section 12 and graph require a dedicated process context per authenticated ERP session, serialized calls and immutable server context | T1 must prove startup, runtime compatibility, isolation, timeout, logout and retirement behavior |
| Worker retirement could be mistaken for rollback | External command ledger and authoritative OutcomeUnknown reconciliation; B5 and Q4 acceptance | Controlled loss-after-commit and safe retry evidence |
| Target framework incorrectly called unknown | Supplied Tools.dll metadata establishes .NETFramework v4.6.2; PE I386/ILOnly does not prove x86-only | Actual host compatibility, dependency availability and load behavior |
| Transport contract listed names without bounds | Master section 25 defines proposed types, requiredness, limits, versions, errors and outcomes | Action-specific domain schemas, precision, state and concurrency require source review |
| Completion and count drift | PROJECT_STATE uses coverage_reviewed_evidence_pending, 31 issues and zero eligible starts | Phase1 seven-gate proof and later implementation authorization |

## Evidence handoff and closure criteria

| Owner / issue | Required evidence | Closure criterion |
| --- | --- | --- |
| DB B2 / [#21](https://github.com/thanhtuyen662002/Medcom/issues/21), Phase1 DB / [#2](https://github.com/thanhtuyen662002/Medcom/issues/2) | Approved Medcom-Data (3)(1).zip baseline; sanitized row-level objects, columns, keys, constraints, indexes, definitions and dependency edges with source provenance | Reconcile coverage matrix and corrected counts; unresolved/dynamic dependencies retain UNKNOWN with disposition; counts alone cannot close the gate |
| ERP / [#1](https://github.com/thanhtuyen662002/Medcom/issues/1), Lead traceability / [#5](https://github.com/thanhtuyen662002/Medcom/issues/5), pilot F5–F9 | Approved ERP_Medcom2026(4).zip baseline, form/DAT/menu/report evidence and authorized handler evidence when available | Complete ERP–Web–DB joins; prove each pilot's exact form, query, actions, scope and state; internal transfer stays unbound until proved |
| T1 / [#19](https://github.com/thanhtuyen662002/Medcom/issues/19) | Supplied Tools.dll static evidence plus controlled nonproduction runtime environment, dependencies, representative users and approved observations | Same-company and cross-company isolation, login/logout/revoke/timeout and failure semantics; no invented reset protocol; framework metadata alone is insufficient |
| B3/B4/B5 / [#22](https://github.com/thanhtuyen662002/Medcom/issues/22), [#23](https://github.com/thanhtuyen662002/Medcom/issues/23), [#24](https://github.com/thanhtuyen662002/Medcom/issues/24) | Verified permissions, procedure signatures, hooks, lock/state rules and transaction ownership | Each enabled command has a reviewed typed mapping, scoped authority, concurrency, retry and authoritative reread disposition |
| R1–R5 / [#39](https://github.com/thanhtuyen662002/Medcom/issues/39), [#25](https://github.com/thanhtuyen662002/Medcom/issues/25), [#26](https://github.com/thanhtuyen662002/Medcom/issues/26), [#27](https://github.com/thanhtuyen662002/Medcom/issues/27), [#40](https://github.com/thanhtuyen662002/Medcom/issues/40) | Event source, report reachability, DAT authority, live operations and recovery evidence | Reviewed freshness/export/config/recovery/coexistence contracts with measurable acceptance; no runtime or restore success inferred from a plan |

The original ERP and SQL packages are still required for the unproven inventory
and traceability work. Tools.dll has already been supplied; it is not a
replacement for those packages. Keep raw binaries, archives, dump data and
credentials outside this public repository; commit sanitized findings only.
No duplicate or resolved status is inferred between Phase1 issue #2 and B2/#21
without comparing their scopes and acceptance evidence.

## Pre-code decision

Status: **coverage_reviewed_evidence_pending**. The plan now gives the five pilots
and cross-cutting requirements named owners, dependencies and acceptance gates.
The master plan, graph and PROJECT_STATE distinguish coverage review from
source proof, runtime verification and implementation authorization.

The graph has 31 canonical issues, #12–42. The historical 16 READY/BOUNDS and
15 BLOCKED labels are planning categories, not current eligibility counts.
Implementation authorization is false and eligible-to-start count is zero for
this run. A later implementation start requires its reviewed contract, completed
dependencies, applicable evidence/runtime gates and authorization.

Phase1 remains active: the row-level SQL catalog and exhaustive ERP–Web–DB
traceability are not proven, architecture closure depends on them, and Lead
saturation is not achieved. Bounded inventory or UX acceptance cannot close a
broader gate. Only an actual seven-gate re-audit may set awaiting_csharp_round
or all_phase1_acceptance_proven to true. No production code, runtime test,
CI pass or release readiness is claimed by this documentation review.
