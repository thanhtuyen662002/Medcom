# Phase 2 scheduled execution plan — at most ten lanes

Status: **configuration activated on 2026-10-02 in bootstrap/preparation mode**; actual IDs and runtime gates are in `docs/execution/SCHEDULE_ACTIVATION_20261002.md`.

The original 2026-10-01 planning statements below describe that preparation snapshot. The owner subsequently authorized activation and PR #43 was reviewed/merged. Current timing is Asia/Saigon (UTC+07:00), with the same hourly minute offsets; L01 alone writes GitHub until dispatcher proof. Timer activation does not admit parallel writers or close evidence/runtime gates.
Date: 2026-10-01. Proposed schedule timezone: **Asia/Bangkok (UTC+07:00)**.
Owner: Lead / Integrator. Implementation graph: **31 canonical issues, #12–42**.

## 1. Scope, precedence and activation boundary

The owner requested a stronger plan followed by a plan for at most ten scheduled
coding tasks, with 4–6 substantive tasks per working session, useful work while
CI runs, same-session repair of actionable CI failures, and active GitHub
bottleneck management. This document defines that future execution protocol.
The current work remains documentation and reconciliation; it does not start
product code, deploy software, create automations or fabricate automation IDs.

For future authorized execution, the owner's newer direction supersedes the
historical five-slot limit in `PHASE1_CLOSURE_AND_PHASE2_PILOT_HANDOFF.md` and
the old per-run throughput ranges in `ACCELERATED_EXECUTION_POLICY.md`. It does
not waive evidence, security, ownership, review or CI gates. Existing schedules
are not presumed to exist or to match the old descriptions. Before activation,
inventory their real IDs, scopes, owners and prompts; reuse compatible slots
where appropriate and present the concrete configuration for the requested
activation action. Merely reading an old instruction to stop Phase 1 jobs is
not authority to stop, pause or change any current job.

The master plan remains the product and architecture orchestration source:

- `docs/plans/PHASE2_IMPLEMENTATION_MASTER_PLAN.md`;
- `docs/plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md` and live GitHub issue bodies;
- `docs/PROJECT_STATE.yaml`, `docs/SOURCE_BASELINE.md`,
  `docs/EVIDENCE_STANDARDS.md`, and the applicable specialist contracts;
- the current Phase 1 audit and current evidence/reconciliation/red-team reviews.

This file owns scheduling, admission, leases, work-session behavior and recovery.
It references the graph rather than creating a second set of domain requirements.
If a live issue and a checked-in dependency disagree, L01 reconciles the conflict
before the affected work starts. Historical `READY` and `READY WITH BOUNDS`
labels are never start permission or proof of completed dependencies.

Future independent platform work may proceed when authorized, reviewed and
eligible even while unrelated legacy evidence remains open. Phase 1 is not
declared complete to unlock a shell or an adapter-independent session test.
Live Tool authentication, SQL-backed pilot bindings, physical schema changes,
commands and rollout retain their individual evidence/runtime gates. A sandbox
or test double proves its Web contract only; it does not prove legacy behavior.

## 2. Source guard specific to the supplied WinForms guide

`HUONG_DAN_BAO_TRI_ERP_WINFORMS.md` is a supplemental technical guide with a
2026-09-26 inspection snapshot, separated on 2026-09-30. Its source SHA-256 is
`f2d2b8dff8ebdf7f67495d22a1c17966f2959222ab4c7703eda2c1d4f61cf179`.
Future runs read `docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md`,
`inventories/erp/WINFORMS_PROPERTY_KEY_INDEX.json` and the current baseline
registration rather than depend on an attachment remaining in chat or scratch.
This planning run did not open the authoritative raw archives or WinForms source
tree. No guide statement is promoted to directly verified current source fact.

- `ERP.NET.vbproj` / `Tools2022.vbproj` describe VB.NET/.NET Framework source
  and assembly `Tools`. Do not treat the guide title or earlier “C# round”
  terminology as proof that those projects are C#.
- `Tool.dll` is historical shorthand in existing documents. The supplied `Tools.dll` has the immutable identity recorded in `docs/erp/TOOL_DLL_METADATA_EVIDENCE.md`; spelling alone does not establish a second binary. Provenance linking the guide's source/build to that observed binary remains unproved and must be checked by hash/build/dependencies.
- Its old database counts, menu rows, form declarations and property-key index
  describe that snapshot. They do not replace the authoritative Medcom dump's
  catalog, prove current production configuration, or establish reachability.
- Static source references narrow the verification queue; they do not prove
  build completeness, licenses, thread safety, permission precedence, logout
  cleanup, transaction boundaries or runtime effects.
- Do not start the legacy application against a real database just to inspect
  defaults: the guide identifies automatic DDL paths. Runtime work uses an
  explicitly authorized, isolated Windows/SQL test environment and synthetic
  data. Record the exact source/build/config/database identity for each result.
- Raw code packages, SQL dumps, binaries, credentials, internal connection
  details, patient/customer data and production transaction rows stay out of
  this public repository. Commit only necessary sanitized evidence and tests.

An inaccessible source is a named blocker, never a license to invent fields,
procedures, rowversion, actions or a runtime result. L03 and L04 close source
gaps; L01 re-audits Phase 1 separately from future implementation eligibility.

## 3. Proposed schedule configuration and resource budget

Use an hourly cadence, the intended fastest supported recurring cadence, with
staggered minute offsets. Verify the live automation service's actual supported
cadence, timezone handling, job limit and run-time budget before configuring it;
do not silently substitute a faster loop or launch duplicate sessions. These
offsets are a proposal, not observed activation times or completion deadlines.

| Lane | Proposed name | Hourly start in Asia/Bangkok | Primary focus |
| --- | --- | --- | --- |
| L01 | Medcom — Lead / Integrator / CI watchdog | HH:00 | State, admission, reviews, exact-head CI, integration |
| L02 | Medcom — Platform / Auth | HH:05 | A1–A4, A6 |
| L03 | Medcom — DB evidence / typed query | HH:10 | B1, B2; sole TRC-DB-001 owner |
| L04 | Medcom — Legacy runtime / effective scope | HH:15 | T1, B4 |
| L05 | Medcom — Screen config / WebCore | HH:20 | A5, A7, R3 |
| L06 | Medcom — Frontend shell / Grid / reads | HH:25 | F1–F4 |
| L07 | Medcom — Commands / idempotency | HH:30 | B3, B5 |
| L08 | Medcom — Five gated pilot slices | HH:35 | F5–F9 |
| L09 | Medcom — Reports / realtime / operations | HH:40 | R1, R2, R4, R5 |
| L10 | Medcom — QA / adversarial acceptance | HH:45 | Q1–Q4 |

The final configuration may express each row as `FREQ=HOURLY;INTERVAL=1`
plus its minute offset when that representation is supported. Preserve the
explicit timezone; UTC environment clocks must not shift the local schedule.
No automation/task identifier is assigned in this plan.

The **ten-task ceiling counts every existing active Medcom schedule plus every newly activated lane**. It is not ten new schedules on top of old Phase 1 jobs. Reconcile/reuse authorized existing slots and keep planned-only rows inactive when the budget is full. Unrelated schedules do not consume the Medcom-specific cap but do consume any provider/account-wide quota, checked separately. No job is paused merely to free capacity without current operational authorization.

Admission limits, enforced by the control registry and checked at every run:

1. **One active writer per lane/workstream**, normally one existing Draft PR.
   Never overlap two runs of the same lane just because a timer fires again.
2. **At most four specialist mutation leases globally.** L01's metadata/review
   work is separate, but an L01 application-code repair consumes one of the four
   tokens. Other lanes perform path-safe review/evidence work or prepare a
   checkpoint; they do not claim a fifth writer by renaming a unit.
3. **At most two path-disjoint units awaiting CI per lane, at most four globally.**
   They share the lane's single Draft PR unless L01 explicitly closes/supersedes
   a bounded package. This is not permission to open two active lane PRs.
4. **At most one heavy environment job** using the controlled Windows/legacy
   environment or disposable SQL stress/restore environment at a time. Do not
   consume shared production capacity or a paid external runner without its
   existing authorization. Runner and environment capacities are live facts.
5. **One integration queue and one main-branch writer: L01.** Specialists push
   their own authorized branches. They never race merges or write main directly.

Ten schedules therefore do not mean ten simultaneous coding processes. Begin
with the smallest available resource cap; raise it only after observed CI queue,
review and environment capacity show spare capacity. If the live service allows
fewer than ten slots, combine L09/L10 review dispatch or compatible prompts
while retaining the same primary ownership map and never exceeding its limit.

## 4. Exactly one primary owner for every graph node

Dependencies below are graph IDs for readable planning. Every live issue must
also retain its existing concrete GitHub issue-number dependencies and current
evidence blockers. A peer is a reviewer, not a second primary implementation
owner. L01 owns orchestration without adding a 32nd product node.

| Graph ID | GitHub issue | Primary lane | Required predecessors / additional gate | Cross-review |
| --- | --- | --- | --- | --- |
| A1 | #12 | L02 | Authorized independent foundation; reviewed stack | L01, L10 |
| A2 | #13 | L02 | A1 | L04, L10 |
| A3 | #14 | L02 | A1; adapter-independent session policy first | L04, L06, L10 |
| A4 | #15 | L02 | A1, A2, A3 | L04, L10 |
| A5 | #16 | L05 | A1, A2; existing SY_* reconciliation before physical tables | L03, L09 |
| A6 | #17 | L02 | A1, A2, A4 | L09, L10 |
| A7 | #18 | L05 | A1, A4, A5; real executable config also needs R3/source proof | L06, L10 |
| T1 | #19 | L04 | Exact source/build package and controlled runtime | L02, L07, L10 |
| B1 | #20 | L03 | A2, A4, A6, TRC-DB-001/B2 binding evidence | L06, L10 |
| B2 | #21 | L03 | Authoritative dump/source access | L04, L05 |
| B3 | #22 | L07 | A4, A6, B2, T1, B4; exact per-command signatures/hooks/transaction | L04, L08, L10 |
| B4 | #23 | L04 | T1, B2; effective permission/scope evidence | L02, L07, L10 |
| B5 | #24 | L07 | A5, B2, B3; verified concurrency and completion mechanism | L08, L09, L10 |
| R2 | #25 | L09 | B2, exact ERP/report reachability and export authority | L03, L10 |
| R3 | #26 | L05 | ERP source/config-machine/grammar evidence | L04, L06, L10 |
| R4 | #27 | L09 | Authorized DBA/SRE runtime access; actual recovery rehearsal | L03, L10 |
| F1 | #28 | L06 | A3, A4, A7; mock shell development is not live auth acceptance | L02, L10 |
| F2 | #29 | L06 | A4, B1; synthetic Grid primitives may precede live bindings | L03, L10 |
| F3 | #30 | L06 | A3, A4, A6 | L02, L07, L10 |
| F4 | #31 | L06 | F1, F2, B1, verified TRC-DB-001; read-only | L03, L08, L10 |
| F5 | #32 | L08 | T1, B1, B3, B4, B5, F1, F2, F3, exact sales menu/action evidence | L04, L07, L10 |
| F6 | #33 | L08 | B2, B3, B4, B5, F1, F2, F3, exact internal-transfer form/bindings | L03, L04, L10 |
| F7 | #34 | L08 | B2, B3, B4, B5, F1, F2, F3, exact purchase-approval transitions | L04, L07, L10 |
| F8 | #35 | L08 | B3, B4, B5, F1, F2, F3, F4, exact AP Order mutation evidence | L06, L07, L10 |
| Q1 | #36 | L10 | A2, A4, A6; test matrix design can precede executable target | L04, L01 |
| Q2 | #37 | L10 | F1, F2, F3 | L06, L01 |
| Q3 | #38 | L10 | A2, A6, A7, F2 | L09, L01 |
| R1 | #39 | L09 | A2, A4, A6, operations/event-source evidence | L04, L10 |
| R5 | #40 | L09 | A1, A5, A7, Q3, R4 | L05, L10, L01 |
| Q4 | #41 | L10 | F4–F9, B5, Q1–Q3, R1, R2, R4, R5; all pilot gates | L01 and independent domain reviewers |
| F9 | #42 | L08 | A4, A6, A7, T1, B1–B5, F1–F4, exact ERP/source/SQL evidence | L04, L06, L07, L10 |

Count: L02=5, L03=2, L04=2, L05=3, L06=4, L07=2, L08=5,
L09=4, L10=4: **31**. **B4/#23 appears and is counted once**.
TRC-DB-001 is evidence owned by B2/#21, not an extra issue or duplicate lane.
F4/#31 cannot close F9/#42 or satisfy inbound mutation acceptance for Q4.

Each issue tracks `design_status`, `start_status`, `depends_on`,
`evidence_blockers`, `owner_lane`, and the latest reviewed implementation head.
For a selected executable unit, require reviewed design, authorized scope,
completed relevant dependencies, available evidence/environment and a valid
lease. A preparatory independent sub-unit may proceed before a whole successor
issue is eligible only when explicitly bounded as contract/test-double/UI
preparation; keep the issue blocked and do not bind it to real legacy data.

## 5. Bounded path ownership and shared changes

The following paths are a **proposed Web tree**, not a claim that product code
already exists. A1 first records the actual tree/path ownership. Until that
record exists, specialists prepare reviewed patches/contracts without claiming
unallocated shared paths. Existing specialist documentation keeps its present
owner and contracts; changing another lane's document requires an explicit
bounded handoff.

| Lane | Proposed exclusively writable areas after bootstrap | Shared boundary |
| --- | --- | --- |
| L01 | `docs/execution/`, `docs/workstreams/phase2-*.yaml`, orchestration/state and integration manifests | Root solution/package/lockfiles, required-check policy and shared workflow edits go through its serialized change queue |
| L02 | `src/backend/Platform/{Tenancy,Session,Authorization,Audit}/`, corresponding unit tests; A1 initial backend skeleton | A1 creates initial solution/CI only; later shared build files queue via L01 |
| L03 | `src/backend/Data/{Queries,Adapters}/`, `src/backend/Contracts/Queries/`, DB catalogs and query tests | No unreviewed DDL, invented columns or pilot mutation handlers |
| L04 | `src/legacy/ToolBridge/`, `src/backend/Legacy/`, runtime/scope evidence and legacy contract tests | Verify actual source-to-binary provenance rather than infer identity from Tools/Tool shorthand; adapter public contracts change through review |
| L05 | `src/backend/Configuration/`, `src/backend/WebCore/`, config compiler/sync tests and additive WebCore migrations | Reconcile actual SY_* first; business command persistence interface reviewed with L07 |
| L06 | `apps/web/src/{shell,grid,forms,read-surfaces}/`, shared FE component tests and initial FE skeleton | No pilot command handlers; FE package/lockfile changes after bootstrap queue via L01 |
| L07 | `src/backend/Commands/Core/`, command/concurrency/idempotency tests | Persist through reviewed WebCore interfaces; no edits to L05 migration files or guessed legacy SP signatures |
| L08 | `src/backend/Pilots/`, `apps/web/src/pilots/`, per-pilot contract fixtures and tests | Consume L03 query/L07 command interfaces and L06 primitives; do not fork the Grid or shell |
| L09 | `src/backend/{Reporting,Realtime,Operations}/`, `ops/`, recovery/report/realtime tests | Runtime SQL configuration and deployments require their separate authorized operation scope |
| L10 | `tests/{e2e,security,accessibility,performance,chaos}/`, acceptance fixtures and quality reports | Fix a product defect through the product owner lane or a recorded path sublease |

A dependency does not give file ownership. For example L10 finds an auth bug,
provides a minimal failing reproduction, and L02 repairs its owned code in that
session; L10 does not silently patch the same file while L02 is writing it.
L01 can grant a time-bounded, nonoverlapping sublease, but the node's primary
owner remains unchanged. Contract/root-file changes are integrated before
downstream consumers start; do not create parallel incompatible DTO definitions.

All fallback work that writes files also needs a bounded path claim and writer token. Shared contracts/DTOs, common fixtures, package/lockfiles, CI and schema changes go through their canonical owner and serialized queue. Read-only preparation is safe progress but is not falsely counted as a completed code unit.

## 6. Lease, fencing and durable state machine

A Draft PR is the human-visible workstream lease, not an atomic mutex by itself.
Before activation, L01 must provide a tested compare-and-swap control channel;
a PR comment or “I checked first” is not sufficient mutual exclusion. A proposed
control branch `agent/execution-control` holds sanitized lease/admission state,
separate from main and from any worker's application branch. The exact existing
branch/PR is discovered first; no branch is overwritten just because its name
matches this proposal.

Registry admission uses **atomic whole-control-branch expected-head CAS** through a tested authorized dispatcher. A per-file SHA is insufficient for generation/global-token fencing. The lane claim and writer/CI/environment token allocation occur in one serialized transaction against the same observed whole-branch head, preserving all other rows. Read after every write.
On contention, refresh all ownership/head data and retry the bounded claim at
most twice. A loser performs safe independent review or reports admission
deferral; it neither force-pushes nor creates a second workstream branch.

Admission also maintains a durable queue with request age, resource class and next bounded work quantum. Release a writer token whenever no useful mutation remains (including CI-only waiting); retaining a lane/PR lease does not reserve global capacity indefinitely. Existing admitted work may finish its bounded unit, then the oldest compatible waiting request gets the next slot before repeated renewal. L01 records and resolves starvation through actual token allocation; after two denied sessions it must reprioritize or split the blocking quantum. Verify queue fairness under contention before enabling parallel lanes.

Each lease records at least:

```yaml
lane_id: Lxx
workstream: canonical_name
owner_run_id: actual_current_run_identity
state: claimed_or_other_state
epoch: monotonically_increasing_fencing_number
pr_number: actual_existing_or_created_draft
branch: actual_remote_branch
expected_remote_head: actual_oid
base_head: actual_main_oid
issue_ids: [canonical_numbers]
owned_paths: [bounded_paths]
claimed_at: actual_utc_timestamp
heartbeat_at: actual_utc_timestamp
expires_at: actual_utc_timestamp
write_token: actual_slot_or_none
environment_token: actual_slot_or_none
ci_heads: []
completed_units: []
next_unit: exact_next_action
blocker: {kind: none, owner: none, evidence: none}
```

Recommended initial values: **45-minute lease TTL**, heartbeat at least every
**10 minutes** and before/after a material mutation; each heartbeat renews the
TTL by CAS while the same owner/epoch remains valid. Actual run budgets may
require lower limits; no heartbeats are fabricated when a run has ended. Lease
TTL is distinct from the application's 1,440-minute user idle policy.

| Current state | Allowed next state / condition |
| --- | --- |
| UNCLAIMED | CLAIMED after atomic admission, current-head recheck and bounded paths |
| CLAIMED | WORKING after reusing/creating the one valid Draft and recording its actual head |
| WORKING | AWAITING_CI after coherent push with relevant local checks; another independent unit may start within caps |
| AWAITING_CI | REPAIRING for actionable failure, WORKING for safe independent work, READY_FOR_REVIEW only after current-head checks pass |
| REPAIRING | AWAITING_CI after same-session fix/revert and focused verification; never DONE while red |
| READY_FOR_REVIEW | INTEGRATION_QUEUED after independent review and exact-head eligibility validation |
| INTEGRATION_QUEUED | MERGED only through L01's healthy reviewed integration queue; otherwise CHANGES_REQUESTED or BLOCKED |
| CHANGES_REQUESTED | WORKING/REPAIRING under the same valid lane lease |
| Any live state | BLOCKED with precise evidence when no safe independent work remains; valid checkpoint and honest unfinished count required |
| Any live state | EXPIRED_SUSPECT when TTL passes; this alone grants no takeover permission |
| EXPIRED_SUSPECT | FENCING only after L01 verifies last commits, activity, CI and owner state and records reason |
| FENCING | CLAIMED with a new epoch after old writer is quiescent and the remote branch fence is advanced safely |
| MERGED / released / invalid | UNCLAIMED for a new bounded package; old references are not active leases |

Before every push/file update/PR change, revalidate owner, epoch, TTL, paths,
remote branch head and live PR. Resume an existing valid Draft rather than create
a duplicate. Never push to another lane's remote branch, force-push or discard
unrecognized remote commits. Merge/rebase only the owning lane's branch safely;
new findings on stale heads are reviewed again against the current head.

GitHub does not intrinsically enforce this custom epoch. Before parallel writers/takeover are admitted, test an authorized serialized mutation dispatcher that validates run+epoch and the **whole work-branch expected head atomically** for every mutation. A checkpoint on another path does not invalidate an unchanged file's SHA; ordinary fast-forward is not exact expected-head CAS. An old run must be rejected even if it rereads a newer head. No direct worker write may bypass the dispatcher; no new writer may write during FENCING. If this enforcement is unavailable/unproved, **disable parallel branch writers and takeovers**: one authorized writer commits reviewed prepared patches while other lanes perform read-only review/preparation. Heartbeats, per-file SHAs and cooperative generation checks are not hard fencing.

Connector-resilient fallback remains bounded: if Draft creation is rejected but
authorized branch writes work, use the existing canonical lane branch and its
latest verified durable commit as a temporary fallback, record missing-PR state,
and let L01 retry creation sequentially. It is not a second branch or permission
to bypass a rejected safety layer. With no working CAS/control write path, do
not claim a new mutation lease; checkpoint prepared work and continue safe reads.

## 7. Every-session work and CI protocol

The target is **4–6 genuinely completed substantive units in every working
session**, including coordinator and evidence sessions. Select five at the
start and one compatible reserve. A unit delivers independently reviewable
behavior/evidence plus its relevant verification. Implementing one feature,
adding its necessary test, committing it and checking its CI are **one unit**,
not four. File counts, comments, status refreshes and pushes are not task counts.

Do not label unfinished preparation as completion or claim an issue DONE before
review/CI. Report `completed / prepared / blocked` separately. If source access,
environment, admission or budget permits fewer than four completed units,
record the actual count and exact reason. The target never justifies guessed
evidence, trivial split tasks or unverified code. A legitimately expensive
recovery still counts once; its cost explains the shortfall instead of inflating
the count. A session can finish five units without closing five whole issues.

Execute the loop:

1. Read live main, own Draft/branch, `AGENTS.md`, canonical state, applicable
   contracts, new evidence and existing checks. Reconcile a stale local checkout
   before writing. Inspect an inherited actionable red check first.
   Any actionable red check on the lane's owned current head, whether introduced now or inherited, is repaired in this session before new product code is admitted. It cannot be routine next-session carryover. Safe review/evidence may continue while diagnosis runs; only an evidenced external outage/access/runtime blocker qualifies for an incident exception.
2. Acquire/renew the lease and needed tokens by CAS. Choose eligible units in
   order: security/data-integrity defect; critical-path blocker; CI/review/merge
   repair; current acceptance; independent consumer-unblocking unit; next safe
   unit; adversarial cross-review. Respect primary path ownership throughout.
3. Implement one bounded unit, run its relevant focused checks, inspect the diff
   for leaks and accidental scope changes, commit, push the owned branch, verify
   the resulting actual remote head, and record its checks.
4. If CI queues/runs, immediately take the next **path-disjoint** eligible unit
   within the two-unit/four-global cap. Prefer local focused work or read-only
   review while capacity is full. A new push supersedes old-head green results;
   older CI cannot prove the new head. Preserve a record of each unit's commit.
5. Poll the actionable CI result during useful work. On an actionable failure of the owned current head,
   stop starting new code units, diagnose the exact failing job/log, repair it
   **in the same session**, run focused verification and push the same PR.
   If repair cannot safely finish, remove/revert only that session's isolated
   offending unit on the owned branch, without erasing another writer's work,
   and recheck the restored head. The removed unit is not completed.
6. A provider/runner outage, absent authorized secret, unavailable Windows/SQL
   environment or an unfixable preexisting external failure cannot be repaired
   by assertion. Retry a demonstrably transient infrastructure failure once,
   then record BLOCKED with owner/log/head and keep the PR unmergeable. Do not
   disable checks, delete tests, accept flaky results or bypass branch policy.
7. Reserve budget for CI drain and one repair cycle before starting the next
   code unit. Use the observed check duration/queue length and real session
   limit, not an assumed fixed CI time. With insufficient reserve, perform an
   independent review/evidence unit instead of pushing fresh unverified code.
8. Before closing the session, drain/recheck all started checks for the **exact
   current remote head**, including relevant integration checks after a rebase
   or changed main. Ready/green is recorded only if that head is healthy. An
   unexpected hard timeout or external outage leaves a truthful incident and
   unmergeable checkpoint, never a successful session or a silently deferred
   owned actionable code failure.
9. Leave actual branch/base/head, completed-unit artifacts and checks, review
   state, remaining acceptance, blocker owner, next executable unit and pending
   write manifest. Release/renew tokens accurately; preserve the valid Draft
   for resumption. A local result is not durable GitHub progress until verified
   on GitHub. A code-green Draft is not merged or an issue closed by default.

L01 is the overall CI incident owner; the introducing lane owns the actual fix.
Review comments and requests must identify the current head and reproduction.
L01 does not assign any actionable red check on an owned head to tomorrow's session in order
to report target throughput. It intervenes before budget expires, narrows the
unit or facilitates a safe same-session revert when necessary.

CI admission counts **unfinished logical units**, not just current workflow runs. Record unit_id, commit(s), required-check set and coverage on descendant heads. Superseding/canceling H1 does not free its unfinished-unit token: only green checks covering that unit on the current containing head, or its verified safe removal, do. Old queued/running checks still count toward actual provider capacity. A descendant head cannot mark a unit complete if its required test scope was skipped.

## 8. Concrete lane backlogs and example five-unit sessions

Examples are **conditional backlog choices**, not a command to do blocked work
or a prediction that five issues finish in one hour. Each selected behavior
includes its meaningful acceptance checks. Where a predecessor is incomplete,
use the fallback items and leave the successor issue's real gate unchanged.

### L01 — Lead / Integrator / CI watchdog

Primary product nodes: none; owns coordination and the sole main integration
queue. Expected artifacts: current issue/lease/head ledger, bounded recovery
decisions, independently reviewed integration commits and audited state changes.

Example five units: (1) reconcile one conflicting issue/contract with source
references; (2) resolve one duplicate/stale lease with preserved commits and
tested fencing; (3) independently review one exact-head security-sensitive PR;
(4) integrate one reviewed green bounded package and validate the resulting
main head; (5) close one dependency-cycle/CI-queue bottleneck with a verified
recovery artifact. These are five separate substantive outcomes, not five
steps of a single merge.

Fallback: repair scheduling/ownership manifests, review the next nonconflicting
PR, red-team a reviewed contract, reconcile newly landed evidence, or prepare
the exact pending integration patch. No merge occurs while required CI/review,
source, migration or release evidence is absent. Done: every changed state has
live head/evidence, preserved ownership, relevant verification and durable audit.

### L02 — Platform / Auth

Owns A1–A4/A6. Expected artifacts: buildable backend foundation, authoritative
tenant/session/capability/audit contracts and their focused tests.

Example five units, once dependencies permit: (1) create one compiling API/
application boundary with nullable/analyzer enforcement; (2) implement scoped
data-source resolution rejecting client-selected database input; (3) implement
meaningful-activity idle enforcement and logout invalidation; (4) implement
one complete query/data/export capability boundary with count-leak denial;
(5) implement safe correlation/redaction and bounded audit retention.

Fallback: adapter-agnostic session test doubles, tenant-isolation contract
fixtures, policy-revision tamper tests, support-ID/error schema, threat-model
reproduction. Mock authentication never becomes a production login provider.
Done: verified foundation compiles, focused checks pass and independent review
plus current-head CI prove each implemented boundary; actual Tool login waits T1.

### L03 — DB evidence / typed queries

Owns B2/TRC-DB-001 and B1. Expected artifacts: sanitized row-level catalog,
dependency/reuse dispositions and typed, scoped versioned query adapters.

Example five evidence units: (1) close an AP table/column/constraint catalog
shard; (2) close an IV key/index/nullability shard; (3) close a procedure/function
signature and dependency shard; (4) classify a report/view reuse shard with
source-backed dispositions; (5) close one ERP→Web→DB pilot read traceability
record. Never import raw rows or count aggregate totals as catalog closure.

Later five-unit code queue: allow-listed filter typing, deterministic paging,
versioned DTO serialization, scoped detail/lookup adapter and cancellation/
timeout behavior. Each adapter uses its exact verified object and permission
binding. Fallback: validate existing sanitized metadata, repair catalog joins,
negative query-contract fixtures, precise source-access manifests or independent
cross-review. Done: evidence links and counts are reproducible; a real adapter
requires its reviewed bindings/dependencies and green current-head checks.

### L04 — Legacy runtime / effective scope

Owns T1 and the single B4. Expected artifacts: build identity/provenance,
controlled runtime observations, direct-load/bridge decision, effective scope
matrix and isolated legacy adapter contract.

Example five units with authorized environment: (1) verify exact Tool/Tools
assembly identities and referenced targets; (2) observe login/session cleanup
in isolated synthetic-user processes; (3) test same-company cross-user mutable
state isolation; (4) observe revocation/logout/timeout and retire contexts;
(5) establish one company/branch/storehouse permission precedence case with
source and DB corroboration. Termination alone is never rollback proof.

Fallback without runtime: source-consumer trace, assembly provenance map,
explicit UNKNOWN register, synthetic bridge timeout/disposal contract fixtures,
and one review of server-resolved scope fencing. Do not execute legacy startup
DDL on a real DB. Done: actual observations name environment/build/data scope;
unknowns remain blocked. Until safe sharing is proven, one serialized dedicated
process per authenticated ERP session remains the isolation boundary.

### L05 — Screen config / WebCore

Owns A5/A7/R3. Expected artifacts: SY_* reuse/gap decisions, reviewed additive
WebCore changes, versioned Screen Definitions, safe compiler/sync/rollback.

Example five units: (1) close one existing SY_* versus WebCore capability
reconciliation; (2) implement a presentation-only immutable definition version;
(3) implement source/provenance scope selection rejecting workstation override
of global defaults; (4) implement missed-event hash reconciliation; (5) implement
malformed/executable configuration denial retaining the previous-good version.

Fallback: LYT/LYS property-consumer evidence with exact class/key context,
presentation parser fixtures, source-machine decision record, stale-version
fixtures or rollback-pointer tests. Preserve empty/trailing LYT segments and
unknown attributes where the real grammar requires it; never treat literal
config SQL as browser authority. Done: physical tables only for proven gaps,
reviewed additive migration/rollback, no guessed grammar, tested scope/rollback
and exact-head CI. Real executable definitions stay gated on R3 and signatures.

### L06 — Frontend shell / Grid / forms / read surfaces

Owns F1–F4. Expected artifacts: shared authorized shell, semantic mobile views,
ERP Grid and recoverable UX primitives; AP Order/inbound read surfaces only.

Example five units after their dependencies permit: (1) authorized route/menu
shell including direct-route denial; (2) keyboard/frozen-column virtualization
for synthetic 100k-row/100+column fixtures; (3) server query cancellation and
superseded-response protection; (4) persistent conflict/OutcomeUnknown/session
recovery with authoritative success feedback; (5) one verified AP Order or
inbound list/detail read binding with scoped freshness and 390px presentation.

Fallback: grid interaction and accessibility components against explicit Web
test contracts, role quick-nav tests, dirty-form recovery, mobile card schema,
safe error fixtures and approved design review. Keep mock/demo paths disabled
for real users. Read surfaces have no hidden mutation buttons/endpoints.
Done: meaningful frontend checks, keyboard/mobile/accessibility/performance
evidence and green exact-head CI; F4 remains read-only and does not close F9.

### L07 — Commands / concurrency / idempotency

Owns B3/B5. Expected artifacts: typed ActionId dispatch, proven per-command
transaction/lock/side-effect contracts and reconciliation before uncertain retry.

Example five units for an evidence-eligible command: (1) reject stale permission/
metadata revisions before side effects; (2) bind exact reviewed parameters and
transaction owner without an incompatible nested transaction; (3) implement
scoped idempotency fingerprints and mismatched-payload denial; (4) implement
lost-ack/worker-loss OutcomeUnknown reconciliation; (5) implement verified
lock/state conflict handling and authoritative reread before success.

Fallback: registry envelope validation, synthetic duplicate/lost-ack fixtures,
transaction-ownership audit template, nonretriable error classification, or a
source-backed legacy hook trace. No generic SQL/SP execution endpoint, invented
rowversion or blanket deadlock retry. Done: each command's real signature,
permissions, state, lock, hooks and outcome evidence are reviewed; code/replay/
fault tests pass on the current head. A generic harness does not close a real
business command gate.

### L08 — Five gated pilot slices

Owns F5–F9. Expected artifacts: per-pilot traceability and bounded backend/FE
slices consuming shared adapters/primitives, with allowed/denied outcomes.

Example five units for **one** eligible pilot: (1) close its exact menu/form/
query/action evidence record; (2) implement its scoped list/detail adapter
binding without bypassing L03; (3) implement one evidenced action through L07's
command contract; (4) implement the desktop/mobile state and conflict UX;
(5) pass its allowed/denied direct API/export/state/freshness acceptance slice.
If an implementation action is not yet evidenced, select another verified
pilot unit rather than implement the example mechanically.

Fallback: sales menu/action trace, purchase approval transition evidence,
AP Order hook/transaction map, inbound request action enumeration, internal
transfer source/destination binding evidence, or independent shared-contract
review. Internal transfer cannot be inferred from a procedure family or a name.
Inbound request entry does not imply receipt/stock posting/approval/cancellation/
deletion. Done: exact per-pilot evidence and predecessors close; current-head
code/UX/security/uncertain-outcome checks pass. Track all five separately so one
working read-only pilot never hides four missing mutation workflows.

### L09 — Reports / realtime / recovery / coexistence

Owns R1/R2/R4/R5. Expected artifacts: reachable report/export contract,
post-commit scope-safe invalidation, measured topology decision, actual recovery
evidence and non-destructive rollout/kill-switch runbooks.

Example five units after individual gates permit: (1) verify a reachable report
parameter/subreport chain and export authorization; (2) implement formula-safe
export and file-download scope revalidation; (3) implement post-commit scoped
invalidation with reconnect/gap recovery; (4) perform an authorized isolated
backup/restore rehearsal with measured RPO/RTO; (5) exercise a slice kill switch
and previous-build/config rollback preserving committed business data.

Fallback: candidate-versus-reachable report map, event-loss synthetic fixture,
SQL runtime-options evidence request, sanitized recovery checklist or a
WinForms-direct-write freshness rehearsal using a disposable test target.
No fabricated restore success, unverified RPO/RTO, automatic production SQL
options change or transaction reversal. Done: each operation names actual
environment/head/checks; rollout waits all graph dependencies and required owner
sign-off. R4's access blocker does not freeze independent report test design.

### L10 — QA / adversarial acceptance

Owns Q1–Q4. Expected artifacts: reproducible, synthetic acceptance harnesses,
independent defect records and per-head pilot/release matrices.

Example five units: (1) same-ID cross-tenant/company direct-request attack;
(2) stale-role/session/API/export revocation attack; (3) keyboard/focus/mobile
and large-grid stress case; (4) WinForms external-write plus dropped/reordered
SignalR convergence case; (5) lost-ack/worker-crash/partial-commit outcome case.
Each unit produces one independently useful reproduction/harness/result,
not a duplicate assertion of an implementation's internal structure.

Fallback: acceptance matrix/spec review, source-supported malicious-input
fixtures, report formula-injection tests, previous-good config rollback tests
and support-log leakage review. Attack roles rotate: user/operator, IT/support,
DBA/SRE, manager/reviewer, internal malicious user and external attacker. Record
the concrete entry point, head, failure, impact, owner, correction and regression
test. Done: defects are verified and fixed by the owning lane; expected denials
are observed. Q4 cannot close until all listed five-pilot and recovery gates are
actually green, independently reviewed and eligible for release.

## 9. Bottleneck detection, bounded SLA and recovery

SLAs are **initial targets measured from detection**, not guarantees that an
external outage or missing human access will resolve on time. Every active
worker detects local problems immediately; L01 audits at each hourly start and
at integration/review checkpoints. Critical CI/security failures are handled
within the current active session, not held for the next timer tick.

| Bottleneck / detection | Owner and target | Same-session response / durable outcome |
| --- | --- | --- |
| Actionable own CI failure | Introducing lane; begin diagnosis immediately, L01 incident owner | Stop new code, fix or safely revert its isolated unit, re-run exact-head CI; no red merge or planned next-session repair |
| CI queue >15 min or >2× observed normal duration | L01/L09; investigate during active run | Inspect provider/runner concurrency, stop new heavy admissions, do safe independent work; retry one real transient infrastructure failure; external outage stays BLOCKED |
| Same lane duplicate claim or overlapping paths | L01; immediate write freeze for conflicting paths | Earliest valid atomic claim wins; preserve both diffs, verify head, revoke loser token by fencing and move loser to review; no branch theft |
| No heartbeat for 20 min | L01; suspect only, not takeover | Inspect run/PR/commit/CI activity; TTL still governs; >45 min triggers EXPIRED_SUSPECT and documented safe recovery |
| Lease takeover / dead writer | L01; inspect at first active checkpoint after expiry | Confirm inactivity, preserve commits, advance remote generation safely, revalidate new owner; no takeover merely because last commit is old |
| Merge queue item blocked >30 min or main changed | L01; inspect next active checkpoint | Identify check/review/conflict gate; owned branch reconciles base and reruns affected checks; release only a reviewed healthy head |
| Shared-file/root-lockfile conflict | L01; resolve before next dependent write | Serialize bounded patch, integrate shared contract once, notify consumers by durable issue/PR artifact; no parallel broad rebases |
| Dependency cycle or lane blocked with independent backlog | L01/primary lane; one active session | Name exact edge; split preparation from real gate, select independent unit, preserve canonical owner; do not falsify completion to break cycle |
| Missing source, secret, license or environment | L03/L04/L09 as applicable; identify immediately | Record exact artifact/permission/environment owner and safe request; use independent fallback; do not print secrets or invent evidence |
| GitHub safety-layer rejection | Owning lane; one bounded retry | Refresh SHA/head; try smallest authorized sequential write once; if blocked, preserve pending manifest, continue reads, never bypass/spam |
| API rate-limit / provider outage | L01; inspect exact error/reset signal | Defer writes, reduce polling/claims, preserve prepared result; no brute-force retry or claimed durable progress |
| No substantive output for two consecutive sessions | L01; review before further identical dispatch | Compare actual artifacts with claimed count, narrow the unit, change fallback/resource allocation, resolve the precise owner blocker |
| Unsafe source/data leakage discovered | Introducing lane + L01; immediate containment | Stop affected writes/releases, follow existing repository incident process and preserve sanitized evidence; do not republish leaked content |

If a specialist lacks sufficient execution budget to remediate a detected code
failure, L01 can facilitate a recorded nonoverlapping repair sublease while that
same session remains active. Neither party claims resolution until the actual
current head passes. If a hard platform cutoff prevents repair despite the
budget guard, record a failed/incomplete session with an incident; the next run
must prioritize it, but that is an exception report, not an approved policy of
deferring CI failure.

Heavy backlog imbalance is corrected by L01 lending review/evidence capacity
or an explicit bounded path sublease. Do not create an 11th schedule, change
primary ownership silently, or pause/unpause other automations as “recovery”
without the current requested operational authorization.

## 10. Integration and release gates

L01 integrates one reviewed healthy package at a time. Re-read actual main,
source head, approval, ownership, dependency evidence and check conclusions
immediately before merge. A green check on an old source head or unrelated
workflow is insufficient. If GitHub provides a protected merge queue, use its
verified current candidate; otherwise serialize a temporary integration
candidate against current main and run the relevant required checks before
integration. Recheck resulting main and halt the queue on any new actionable
regression. No `admin` bypass, disabled checks or concurrent direct main writes.

The actual merge operation pins the independently approved source OID with GitHub `expected_head_sha` (or an equivalent enforced operation). The protected tested base/integration candidate must also remain current. A pre-merge read cannot stop a source/base race: if either changes, invalidate approval/check eligibility and rebuild/retest the candidate. If required merge preconditions and protected queue/base semantics cannot be enforced, keep merge execution blocked; a serial intention is not an atomic gate.

Issue completion requires its reviewed implementation, acceptance evidence and
green current implementation head. Merging a prep harness or reviewing a plan
does not close a source/runtime/business issue. Source hashes, runtime build,
config version and environment remain attached to the relevant acceptance.

Release review needs Q4's full dependency set and five independently completed
pilot records, including inbound mutations F9; permission/query/action/export,
mobile/Grid/freshness, transaction/idempotency/OutcomeUnknown, reporting,
actual R4 recovery and R5 coexistence/rollback evidence. No release while a
safety-critical finding is unmitigated or a required evidence/runtime gate is
UNKNOWN. Deploying or changing real databases is a separately authorized
operation; this schedule plan supplies no implicit production rollout command.

Phase 1 closure remains its seven-gate independent audit. L01 records a real
closure only when all seven pass, never by substituting a green foundation
build, old database snapshot or a throughput count. This planning session
does not execute old phase-stop instructions or alter any automation.

## 11. Copy-ready shared prompt for each future lane

Combine this prompt with the one lane-specific assignment below. Resolve live
repository/tool paths at run time; placeholders are not pre-created IDs.

```text
Bạn là agent scheduled của Medcom, lane {LANE_ID}. Mục tiêu phiên làm việc:
hoàn thành 4–6 task có ý nghĩa, mỗi task có kết quả và kiểm chứng độc lập.
Không đếm commit/test/push/status của cùng một tính năng thành nhiều task.

1. Đọc live main và Draft PR/branch đang thuộc lane; đọc AGENTS.md,
   docs/PROJECT_STATE.yaml, SOURCE_BASELINE, EVIDENCE_STANDARDS, master plan,
   issue graph, scheduled execution plan và contract/evidence hiện hành.
   Repo live thắng lịch sử chat. File hướng dẫn WinForms là evidence bổ sung
   đúng snapshot; không chứng minh runtime hay thay catalog dump hiện hành.
2. Kiểm tra eligibility thực tế cho từng unit: phạm vi đã được cho phép,
   design reviewed, dependencies đã hoàn thành, source/runtime gate phù hợp,
   path ownership và resource token. READY cũ không phải quyền code.
   Làm foundation/test-double/UI preparation độc lập khi hợp lệ; không gỡ
   blocker của nghiệp vụ hoặc đánh dấu Phase 1 complete chỉ vì mock chạy được.
3. Resume đúng một Draft hợp lệ của lane. Acquire/renew lease qua CAS,
   kiểm tra TTL/heartbeat/epoch/current head trước mọi mutation. Không tạo
   Draft trùng, không lấy branch người khác, không force-push hay ghi main.
   Thiếu control write/CAS hợp lệ thì không tự claim writer mới.
4. Chọn 5 task ưu tiên và 1 dự phòng trong backlog lane. Hoàn thành từng task
   cùng kiểm chứng cần thiết; commit/push nhỏ vào branch sở hữu; kiểm tra
   remote head thật. Chỉ ghi progress durable sau khi thấy nó trên GitHub.
5. Khi CI queued/running, chuyển ngay sang unit eligible khác, path-disjoint.
   Tối đa 2 unit chờ CI mỗi lane, 4 toàn hệ thống; tối đa 4 specialist writer
   và 1 heavy environment job. Không mở Draft thứ hai để né resource cap.
6. CI trên current head mình sở hữu fail, dù mới tạo hay kế thừa: ngừng khởi động code mới, đọc log, sửa ngay cùng phiên,
   chạy focused check và recheck current head. Nếu không thể sửa an toàn,
   revert chỉ unit lỗi cô lập của phiên này trên branch đang sở hữu rồi recheck;
   lỗi kế thừa/shared path cần owner repair hoặc sublease trong cùng phiên;
   không xóa code người khác. Unit bị revert không tính completed. Không để lỗi code biết trước sang
   phiên sau, không disable check/test, không bypass review hoặc branch policy.
   Provider outage/secrets/source/runtime thiếu: ghi BLOCKED trung thực với
   head/log/owner; retry transient một lần; không tuyên bố CI green giả.
7. Chừa ngân sách drain CI + một vòng repair. Trước khi kết thúc, recheck tất
   cả check bắt buộc trên remote head hiện tại; old-head green không đủ.
   Nếu hard cutoff/outage bất ngờ, ghi failed/incomplete incident, không giả
   thành phiên thành công. Không merge; L01 là integrator/main writer duy nhất.
8. Báo completed/prepared/blocked riêng, artifact/commit/check/head cụ thể,
   acceptance còn lại, next task có thể chạy, blocker owner, pending write.
   Dưới 4 completed phải ghi lý do thật; không tạo task vụn hoặc đoán evidence.
9. Chỉ lưu metadata/source evidence đã sanitized. Không raw ZIP/dump/binary,
   dữ liệu khách hàng/bệnh nhân/giao dịch thật, password/token/connection secret.
   Không chạy startup DDL legacy hoặc chỉnh DB/production ngoài phạm vi cho phép.
10. Khi nút thắt còn xử lý được, thực hiện recovery nhỏ nhất cùng phiên.
    Dùng sublease/queue có fencing cho shared files; không đổi ownership lén.
    Không tự tạo/pause/stop/unpause schedule khác. Chỉ hành động với automation
    khi yêu cầu hiện tại cho phép cụ thể; tài liệu kế hoạch không tự kích hoạt.
```

Lane additions (append exactly one; retain the full common protocol):

| Lane | Copy-ready assignment |
| --- | --- |
| L01 | `Own coordination, tested CAS/fencing, live eligibility, all CI incidents and the sole reviewed healthy integration queue. Audit leases/heads/evidence, remove concrete bottlenecks, preserve independently blocked gates. No product node duplication or unauthorized automation operations.` |
| L02 | `Own A1/#12, A2/#13, A3/#14, A4/#15, A6/#17. Build independent platform/auth/session/audit behavior and tests; actual Tool login waits verified T1. Read L02 example/fallback and its exclusive paths.` |
| L03 | `Own B1/#20 and B2/#21, including all TRC-DB-001 row-level evidence. Extract only sanitized authoritative catalogs/dependencies/reuse; real typed adapters require exact bindings. Read L03 example/fallback and exclusive paths.` |
| L04 | `Own T1/#19 and the sole B4/#23. Verify the supplied Tools.dll source/build provenance and isolated runtime/session behavior and effective scope; Tool.dll is historical shorthand, not proof of a second binary. Without actual source/runtime, retain UNKNOWN and work on safe evidence/contracts. Read L04 example/fallback and exclusive paths.` |
| L05 | `Own A5/#16, A7/#18, R3/#26. Reconcile existing SY_* before additive storage; versioned config/compiler/sync/rollback, source-scoped DAT and executable fail-closed validation. Read L05 example/fallback and exclusive paths.` |
| L06 | `Own F1/#28, F2/#29, F3/#30, F4/#31. Shared authorized shell/Grid/forms/mobile/recovery and separately gated AP Order/inbound reads only. No F9 mutations. Read L06 example/fallback and exclusive paths.` |
| L07 | `Own B3/#22 and B5/#24. Typed commands and evidence-backed transactions/hooks/concurrency/idempotency/OutcomeUnknown; reconcile uncertain completion before retry. Read L07 example/fallback and exclusive paths.` |
| L08 | `Own F5/#32, F6/#33, F7/#34, F8/#35, F9/#42. Close exact per-pilot evidence before real bindings/actions; consume shared platform, Grid/query/command contracts. Inbound request never implies receipt/posting. Read L08 example/fallback and exclusive paths.` |
| L09 | `Own R2/#25, R4/#27, R1/#39, R5/#40. Reachable reports/scoped exports, post-commit realtime plus revalidation, actual isolated recovery and non-destructive coexistence. No invented RPO/RTO or production operation. Read L09 example/fallback and exclusive paths.` |
| L10 | `Own Q1/#36, Q2/#37, Q3/#38, Q4/#41. Independently reproduce user/IT/manager/DBA/SRE/internal-malicious/external-attacker failures with synthetic data; route product fixes to the owner lane. Q4 waits all five pilot and operational gates. Read L10 example/fallback and exclusive paths.` |

## 12. Validation required before activation

Avoid a bootstrap/preflight cycle. First, an authorized **single writer** performs minimum bootstrap preflight (repo access, coherent reviewed plan, branch ownership, source-free scope, tool/runtime access and local verification), then A1 initializes the actual tree/ownership and CI. No parallel takeover or live legacy/domain binding is allowed at this stage. Second, prove the full dispatcher/resource/CI/automation preflight below against that initialized tree before scheduled writers are admitted. A preflight fixture or bootstrap CI pass does not close a source/runtime/pilot issue.

L01 records the result of each check below as actual evidence, not an unchecked
claim that this file already supplies a working scheduler:

- All 31 live issues match the one-primary-owner map; B4 and TRC-DB-001 have
  no duplicate node; dependency and scope conflicts are reconciled.
- The accepted live source baseline, supplemental guide limitations and open
  Phase 1/runtime gates are visible; independent authorized preparation has its
  own eligibility rather than a blanket freeze or blanket unlock.
- Real automation inventory/capability and existing grants are known; proposed
  ten-or-fewer configuration, Bangkok timezone, hourly offsets and prompts are
  concrete, with no unauthorized changes to other jobs.
- CAS contention, duplicate same-lane start, heartbeat expiry and stale writer
  rejection are tested; a valid Draft/fallback branch is resumed and commits
  survive takeover. Missing control writes cannot produce a duplicate claimant.
- Four-writer/two-unit-per-lane/four-global-CI/one-heavy-environment caps work;
  code and shared-file ownership paths match the actual initialized tree.
- A queued CI result triggers useful independent work; an owned current-head failing
  fixture is repaired or safely reverted within its session; older-head green
  and an infrastructure outage both remain unmergeable.
- Budget reserve, hard-cutoff incident reporting, exact-head review/integration
  and durable completed/prepared/blocked task counts work without chat memory.
- Release/migration evidence gates remain separate from code completion;
  public-repository redaction and no-secret logs are checked.

After this operational preflight and the separately requested scheduling action,
activate only the lanes whose reviewed units are eligible. Inactive evidence
gates keep their real blocker; their scheduled lane can still execute its safe
fallback backlog. Never manufacture an activation ID, CI result, source proof
or completed task to make the plan appear operational.
