# Phase 2 master-plan adversarial review

Review date: 2026-10-01 (Asia/Ho_Chi_Minh)  
Reviewer: Lead / Red Team  
Plan under attack: `docs/plans/PHASE2_IMPLEMENTATION_MASTER_PLAN.md`

This review intentionally tries to break the plan before production coding.
Every finding is either fixed by a cited plan rule or converted into a bounded
implementation blocker with an owner and acceptance test. A finding is not
closed merely because a heading exists.

## Disposition legend

- **FIXED** — the master plan contains a binding design rule and a testable
  acceptance condition; implementation must still prove it in CI.
- **BLOCKED** — a source/runtime fact is required; a named GitHub issue records
  the owner, evidence and acceptance test.
- **VARIANT** — the attack is covered by an existing risk/issue class and adds
  no new requirement, but its concrete test is recorded here.

## Attack matrix

| Perspective / attack | Attempt to break | Finding | Disposition |
|---|---|---|---|
| Senior Windows ERP engineer | Assume every DAT layout is a form and every RPX is reachable | DAT/RPX package evidence does not prove menu reachability, runtime hooks or authorization | **FIXED:** plan requires stable IDs, reachability UNKNOWN, typed report adapter and per-screen traceability. `F5`, `R2`, `R3` remain blockers. |
| Tool/legacy runtime engineer | Guess Tool.dll class, target runtime, login return code or thread model | Supplied Tools.dll metadata proves API shape and .NETFramework v4.6.2 target, but not runtime behavior | **BLOCKED T1:** verify actual host/dependencies, login/logout/validate, permission APIs, thread safety, disposal, timeout and ambiguous results; acceptance is adapter/bridge contract tests. |
| C# backend architect | Let Tool types, SQL names or client-selected DBs leak into application contracts | A generic repository or browser-supplied object could bypass policy | **FIXED:** typed Contracts and adapter boundary; A2/A4/B1 tests reject arbitrary object IDs and client data-source selection. |
| SQL Server DBA | Treat aggregate object counts as a complete catalog; ignore keyless tables, triggers, locks and options | DB gate lacks row-level catalog/dependency export; 50 keyless tables and mixed XACT_ABORT are real hazards | **BLOCKED TRC-DB-001/B2/B3:** sanitized catalog, dependency edges and per-command transaction mapping; no invented key or blanket retry. |
| SQL injection reviewer | Send DAT FieldID, aliases, sort or SP names through the browser | Metadata contains aliases and executable-looking values | **FIXED:** allow-listed Query Adapter, server-owned resolution, unresolved alias fail-closed, no arbitrary SQL; tamper tests in Q1. |
| Accounting operator | Approve or post a document after its state changed in another client | A visible button is not proof of current state | **FIXED/BLOCKED:** revalidate state immediately before command; exact state/SP mapping for approval is `F7`; stale/conflict/outcome-unknown UI is mandatory. |
| Warehouse operator | Perform an internal transfer without knowing source/destination/status or lose a write on a slow network | Exact internal-transfer binding and procedure contract are unknown | **BLOCKED F6/B2/B3:** platform design can proceed; implementation and the vertical slice remain separately gated; acceptance requires exact form/data/action evidence and concurrent state tests. |
| Purchasing operator | Retry a purchase order/approval command after a lost response | Duplicate document or approval is harmful | **FIXED:** idempotency fingerprint, authoritative reread and OutcomeUnknown; B3/B5 acceptance covers lost ACK, duplicate and partial transaction. |
| Sales operator | Open a known URL when menu visibility is stale or use a hidden export | UI-only authorization is bypassable | **FIXED:** route, API/data, mutation and export gates are independent; F5 and Q1 test crafted requests and no existence leak. |
| Security engineer | Widen tenant/company/branch/storehouse or reuse a cache/hub group from another customer | Pool, cache, jobs and groups can accidentally retain scope | **FIXED:** scope key and resolver rules cover connection checkout, cache, job restoration, audit and SignalR; Q1 tenant-identical-ID tests. |
| Malicious user | Forge quick-nav/admin config, action IDs, SQL identifiers, filters, export paths or CSRF | Presentation config can be mistaken for capability | **FIXED:** admin-only publish, server filtering, CSRF, stable IDs and export reauthorization; Q1/F1 tests. |
| Accidental user | Double-click Save, close a dirty form, click Continue after expiry or misread a toast | False success and data loss are UX failures | **FIXED:** immediate acknowledgement/progress, authoritative success only, persistent validation/conflict/outcome-unknown, dirty recovery and server Continue Session. |
| Frontend architect | Render a 100k-row/100-column grid or let superseded requests overwrite state | Naive client rendering and response ordering break productivity | **FIXED:** server paging/filter/sort, TanStack virtualization, request identity/cancellation and stress CI; F2/Q2. |
| Mobile UX specialist | Put a desktop grid and too many actions on a 390px screen | Horizontal scroll and unsafe actions block task completion | **FIXED:** separate semantic cards, 4–6 summary fields, bottom nav + authorized drawer, explicit action confirmation and 390px/a11y tests. |
| Accessibility reviewer | Rely on color/toast timing or remove keyboard/focus semantics | Critical state can be missed | **FIXED:** WCAG 2.2 AA, focus/keyboard/touch targets, non-color state, inline persistent errors; Q2. |
| Performance engineer | RCSI/version-store pressure, AUTO_SHRINK, stale stats, N+1 and pool exhaustion cause >10s latency | Static options do not prove safe runtime performance | **FIXED/BLOCKED:** budgets and stress/cold-stat tests are required; operational server/backup evidence is `R4` and not guessed. |
| Reliability/SRE | Drop, duplicate, reorder SignalR; lose bridge/DB; poison a tenant job | Push cannot be the correctness source | **FIXED:** post-commit invalidation, SWR/poll/focus/manual fallback, scoped job envelopes and bounded retries; R1/Q3 acceptance. |
| Support/operations | A user reports “it failed” with no safe reference or logs leak secrets | Unbounded diagnostic tables are unusable or unsafe | **FIXED:** separate business audit/OperationTrace, correlation reference, redaction, retention/purge and support bundle contract; A6/Q1. |
| Migration/coexistence reviewer | WinForms writes SQL directly without Web event; Web rollback reverses business data | Two writers can diverge and rollback can be destructive | **FIXED:** authoritative reread/SWR, additive expand-migrate-contract, slice kill switch and pointer rollback; Q3/R5. |
| Config/compiler reviewer | Missed DAT watcher event or publish malformed executable config | Bad config can replace the only working screen | **FIXED:** watcher plus periodic hash, normalized parse, executable validation, immutable version, previous-good pointer and audit; A7/R3 tests. |
| Multi-tenant isolation reviewer | A background job or connection pool restores the wrong tenant after retry | Scope is often lost outside HTTP requests | **FIXED:** job envelope and connection checkout require server-resolved scope; identical-ID cross-tenant stress test Q1. |
| Rollback/recovery reviewer | Restore an old build while new config or schema is active; rely on SIMPLE recovery for PITR | Build/config/schema versions can become incompatible | **BLOCKED R4/R5:** expand/contract compatibility, backup/RPO/RTO evidence and non-destructive rollback acceptance. |
| Reporting specialist | Treat all 786 RPX candidates as active and allow arbitrary report parameters | Reachability, parameter and export authorization are unknown | **BLOCKED R2:** report inventory/dependency/parameter evidence plus independent export policy and formula-injection tests. |
| Privacy/logging reviewer | Put passwords, tokens, connection strings or raw payloads in traces/audit | Support data becomes a secret store | **FIXED:** explicit redaction and schema allow-list; secret scanning and log fixtures in CI. |

## Specific break scenarios and expected outcomes

### Login and session

- Tool adapter timeout after credential submission returns `Unknown` or
  `Unavailable`, never a local “invalid password” guess; the next request
  revalidates server state.
- SignalR traffic, polling and background Query refresh do not move idle time.
- Logout and expiry revoke the Web cookie/session and legacy reference; stale
  requests fail without revealing protected data.

### Authorization and scope

- A user with a valid screen capability but an invalid document state receives a
  stable state rejection; the command is not sent to a generic CRUD endpoint.
- A user changes company context to a value present in the URL but not in their
  server membership; the resolver rejects it before opening a connection.
- A revoked role retains a stale browser shortcut or hub subscription; the next
  authoritative navigation/query/mutation is denied and the shortcut disappears.

### Configuration and realtime

- A malformed DAT or admin executable override leaves the previous-good screen
  version active and produces an audit/reference ID.
- A watcher event is dropped; hash reconciliation discovers the change.
- SignalR events arrive twice or out of order; the client refetches by version
  and converges. A WinForms direct SQL write becomes visible through SWR.

### Transactions and support

- A request times out after an SP commit; the UI shows OutcomeUnknown, consults
  the idempotency record and authoritative state, and never blindly repeats a
  harmful command.
- A trigger or mixed XACT_ABORT path fails partway; no post-commit invalidation
  or success toast is emitted until the command result is authoritative.
- A support trace can connect FE/API/handler/SQL/build without exposing a
  password, token, connection string or sensitive row payload.

## Residual blockers (explicit, bounded)

| ID | Owner | Why the plan cannot guess | Acceptance test |
|---|---|---|---|
| T1 | ERP + Lead | Tool.dll API/runtime/session/thread semantics | Direct source/runtime inspection, adapter contract suite and bridge choice recorded. |
| TRC-DB-001 | DB + Lead | Row-level catalog/dependency is dump-extractable but not durable | Generated sanitized catalog resolves all referenced stable DB IDs and dependency edges. |
| B2/B3 | DB + ERP + Backend | Exact query aliases, SP signatures, hooks, transaction owners and state transitions | Per-command contract tests against approved SQL/legacy fixtures; no arbitrary object selection. |
| F5 | ERP + Frontend | Sales Vietnamese menu/action equivalence is not proven | Evidence maps path to form and action/state matrix; route/menu test passes. |
| F6 | ERP + DB + Frontend | Internal-transfer form/master/detail/query binding is UNKNOWN | Exact binding and workflow evidence; concurrent transition and scope tests pass. |
| F7 | ERP + DB | Purchase approval transition/state is not proven | State/action/SP/lock/idempotency contract and allowed/denied E2E tests. |
| F8/F9 | ERP + DB + Frontend | Purchase-order and inbound-request write contracts are not proven; F4 is read-only | Source-backed actions/fields/state/transaction/concurrency and authoritative reread; F9 does not imply stock receipt or posting. |
| B4/B5 | Architecture + DB | Permission precedence, scope source and version/retry semantics unknown | Server-derived scope and stale/duplicate/concurrent tests pass for each pilot. |
| R1/R2/R3/R4/R5 | Architecture + SRE | Event source, report reachability, DAT source/grammar and DR facts unknown | Evidence plus failure/recovery test for each bounded area. |

## Follow-up attacks and corrections

| Attack | Finding | Disposition and owner |
| --- | --- | --- |
| Complete inbound pilot using only F4 read surfaces | Mutation ownership was absent | Planning gap corrected by F9/[#42](https://github.com/thanhtuyen662002/Medcom/issues/42); actual actions and mappings remain BLOCKED. Q4/#41 now requires F9. |
| Reuse one Tools process for two users in the same company | Static identity properties create a process-state hazard | Master section 12 requires a dedicated process context per authenticated ERP session and serialized calls. T1/#19 must prove runtime isolation; three-property reset, AsyncLocal or a per-call lock is insufficient. |
| Kill a timed-out worker and retry its write | Worker death does not prove SQL rollback | B5/#24 and Q4/#41 require ledger/correlation outside the worker, OutcomeUnknown and authoritative reconciliation before retry. |
| Start all foundation issues in Wave 0 | Parallel instructions contradicted dependency edges | Graph waves now obey prerequisites; historical READY labels do not mark a dependency complete or grant authorization. |
| Count B4 twice and omit the new pilot owner | Count and issue-range drift | Graph lists B4 once, maps canonical links and contains 31 issues, #12–42. No issue is authorized to start code in this run. |
| Treat DTO names as a complete browser contract | Types, bounds and error semantics were underspecified | Master section 25 defines proposed envelopes; action-specific fields and SQL/state/concurrency semantics remain source-gated. |
| Treat a completeness heading as Phase1 acceptance | Earlier conclusion overstated readiness | PROJECT_STATE and completeness audit now record coverage_reviewed_evidence_pending. Seven Phase1 gates remain authoritative. |

Expected outcomes include same-company distinct-user isolation, no context reuse
after logout/revoke/timeout, late worker results fenced by session generation,
and no automatic replay after possible commit. These are future acceptance
scenarios, not tests executed or passed by this review.

## Review conclusion

The follow-up closes the identified documentation gaps in ownership, dependency
ordering, transport boundaries and conservative Tools isolation. It does not
prove runtime isolation, SQL correctness, pilot behavior or release readiness.
The current disposition is **coverage reviewed; evidence pending**. Implementation
is not authorized in this planning run.

Lead must re-audit the source and runtime blockers after evidence arrives and
re-run the seven Phase1 gates before any phase transition. Later implementation
requires reviewed contracts, completed dependencies, relevant evidence and
explicit authorization; a reviewed plan alone cannot make a blocked issue eligible.
