# Medcom document consistency audit — 2026-10-01

Status: **reviewed reconciliation findings; implementation and Phase 1 evidence gates remain separate**.

Review anchor: PR #43 local head `2ab4eebbf4ee77accb9956e5aaba7ed5c3b891a2`.
This audit records contradictions found at that head. Corrections landed afterward
must be checked against the actual resulting commit; recording a proposal below
does not claim that the proposal is already merged or that its runtime test ran.

The owner supplied `HUONG_DAN_BAO_TRI_ERP_WINFORMS.md`, read in full, including
appendices A–D and F. File identity: SHA-256
`f2d2b8dff8ebdf7f67495d22a1c17966f2959222ab4c7703eda2c1d4f61cf179`;
115,810 bytes, 1,402 lines. It is a secondary technical maintenance guide,
split on 2026-09-30 while retaining a 2026-09-26 inventory snapshot. It is not
the raw WinForms source, a new Medcom database dump, or a runtime test result.
No private connection details, customer identity, production rows, raw source
exports or credentials from it are reproduced here.

## 1. Scope and evidence boundary

The review inspected the complete repository document/inventory registry and
all five workstream records; scanned evidence levels, counts, phase status,
ownership, source-language descriptions and execution instructions across them;
and read the conflicting source and target contract sections directly. This is
a document consistency review, not a fresh parse of the ERP archive or SQL dump.

Three distinct questions must remain separate:

1. What static source/package/database evidence has been recovered?
2. What Web behavior has been selected as an engineering contract?
3. What work is authorized and eligible to start after its own dependencies?

An informative guide can refine the first two questions without answering a
runtime UNKNOWN, granting database write access, or closing Phase 1.

## 2. Canonical ownership and precedence

| Subject | Canonical document / accountable owner | Role of companion documents |
|---|---|---|
| Phase and seven-gate state | `docs/PROJECT_STATE.yaml`; Lead | Dated audits preserve decisions at their recorded heads; evidence documents do not independently change global state. |
| Source identity and provenance | `docs/SOURCE_BASELINE.md`; ERP/DB with Lead verification | Guide-derived facts remain secondary until independent package/DDL or direct source evidence corroborates them. |
| Medcom structural counts | `docs/db/DECLARATION_COUNT_CORRECTION.md`, `STRUCTURAL_CATALOG_CLOSURE.md`; B2 / #21 | `BASELINE_INVENTORY.md` summarizes canonical counts; historical scanner counts remain history. |
| DB closure evidence | `docs/db/PHASE1_CATALOG_COVERAGE_MATRIX.md`; B2 / #21 | Aggregate inventories cannot substitute for per-object rows, column metadata, indexes and dependencies. |
| ERP↔Web↔DB disposition | `inventories/traceability/PHASE1_TRACEABILITY_CLOSURE_AUDIT.md`; Architecture | Bound contracts and filter deltas are partial evidence; every new ERP capability still needs disposition. |
| Legacy key/parser facts | Provenance-tagged ERP evidence plus the new guide reconciliation; ERP | The old `CSHARP_*` summaries remain secondary. Unknown grammar is rejected instead of compiled. |
| Fixed pilot scope and transport | Master plan §§16/25 plus `PHASE2_PILOT_API_DTO_DEPENDENCY_CONTRACT.md`; Architecture | FE pack owns interaction detail; it cannot rename a legacy workflow or change pilot scope. |
| Issue/dependency ownership | `docs/plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md`; Lead | GitHub live issue/PR state is authoritative for actual ownership and completion. |
| Legacy worker isolation | `docs/architecture/PHASE2_TOOL_DLL_BRIDGE_CONTRACT.md`; T1 / #19 | Tech stack is a summary; successful load alone does not prove safe concurrent sessions. |
| Execution/scheduling | Current owner direction plus the new bounded schedule/run policy; Lead | Older five-lane and deadline instructions are historical where explicitly superseded. |
| UX/freshness/idle behavior | `PHASE2_FRONTEND_ACCEPTANCE.md`, `PHASE2_AUTH_CAPABILITY_CONTRACT.md`; UX/Auth | All companion specs must retain authoritative success, passive-traffic exclusion and fallback revalidation. |

The current owner request supersedes conflicting older task-count or schedule-count
instructions. It authorizes preparation of bounded future coding/scheduling work
and GitHub delivery; it does not supply missing SQL, source or runtime evidence.
The preparation run and each future implementation slice must have separate
authorization/start fields. No blanket approval for production DB mutation,
deployment, secret publication or unknown business behavior follows from it.

## 3. Concrete contradictions and corrections

| ID / priority | Exact source location and conflict | Canonical owner / proposed correction | Validation required |
|---|---|---|---|
| DOC-01 / high | `docs/db/BASELINE_INVENTORY.md`, Database-level facts: still asserts 7,968 column declarations. `STRUCTURAL_CATALOG_CLOSURE.md` explicitly supersedes that count with 7,985, comprising 5,610 nullable + 2,375 NOT NULL. | B2 / #21: replace operative baseline count with 7,985 and link structural closure. Preserve the provisional figure only as labelled history. | Arithmetic equals 7,985; every operative aggregate uses the same baseline hash and definition. This wording correction does not close the row-level catalog gate. |
| DOC-02 / critical | Guide §3.1 and appendices B–D describe a historical database/environment. The guide's 403 tables, 353 menu rows, 173 SQL form definitions and 106 FIDs differ from the Medcom dump baseline. Guide §4.3 also lists enabled invoice triggers from that historical catalog, whereas the Medcom baseline normalizes to three distinct triggers. | Source/DB: record date/environment separation. Keep Medcom at 583 tables, 203 views, 591 procedures, 109 functions and 3 distinct triggers. Use guide objects as comparison candidates, never transplant counts, enabled-state assertions or trigger behavior. | Provenance per fact identifies its artifact/date; no historical snapshot count is promoted to current Medcom coverage. Direct DDL/runtime verification resolves any actual object mismatch. |
| DOC-03 / high | `docs/SOURCE_BASELINE.md`, Baseline discipline / Supplemental C# review summaries; `docs/ROADMAP.md`, Next phase; `docs/erp/CSHARP_*`, titles/provenance/queues; `docs/architecture/CSHARP_RECONCILIATION.md`: assume incoming legacy C# source. Guide §2 and appendix A identify `.vbproj`, `.vb`, VB.NET and .NET Framework 4.6.2. | ERP: retain filenames/stable gap IDs for compatibility but label legacy verification as VB.NET/source verification. C# remains the selected new backend language. Do not infer that raw legacy source has been supplied by a Markdown guide. Keep `awaiting_csharp_round` as a historical state token until a deliberate state-schema change. | Every source-language statement distinguishes legacy guide-described VB.NET from target C#. Existing relative links and stable IDs still resolve. |
| DOC-04 / critical | `docs/erp/CSHARP_ENGINE_ARCHITECTURE_REVIEW.md` §2.2 reports literal `T1..T19`, `SAV_BFR/SAV/DEL/FML` and calls `IJ1` a join expression. Guide §3.3/§3.5/appendix F reports `T1..T9`, `TA..TJ`; form hooks `EBS/ESS/ESD`; table hooks `DBS/S10/S11`; `IJ1` is `InnerJoinMode1`, `JC1` is `JoinConditionEx`. | ERP/compiler: mark old literals obsolete/unverified examples, attach exact guide-backed correction and retain direct-source verification. Never silently alias an unknown key to a business hook. | Parser fixtures cover all detail keys, context-specific hook namespaces and rejection/quarantine of unsupported literals. Verify consumers before executing any hook. |
| DOC-05 / critical | Guide §3.3/§3.4/§6.2 gives fuller row addressing/default behavior than the earlier summary: `LYT` uses SubValue as order, `LYS` uses it as property key; `FW/FH` keys collide across contexts; empty Confirm1/Confirm2 values differ; no unique configuration tuple is guaranteed. Existing compiler contracts specify versioning but do not bind these edge cases. | ERP/A7: add contextual identity `(FID, KeyID, SubID, SubValue, PFID/consumer)` and source-row identity; duplicate-row ambiguity fails closed. Preserve empty fields and future trailing positions in LYT. Distinguish runtime default from stored value. | Duplicate tuple, NULL vs empty, two `FW/FH` contexts, Confirm1/Confirm2, truncated/trailing LYT and nested PFID fixtures. No broad DELETE-FID update or invented SQL uniqueness. |
| DOC-06 / high | `docs/workstreams/migration-architecture.yaml`, completion_note says disposition coverage complete although status is active and Gate 4 is FAIL in project state / traceability audit. | Architecture/Lead: state design coverage is reviewed; exhaustive evidence disposition remains incomplete pending Gates 2/4. | YAML, project gate table and traceability audit agree; a bounded runtime UNKNOWN is distinct from dump-extractable work still absent. |
| DOC-07 / medium | `docs/erp/RPX_STRUCTURAL_EVIDENCE.md` §7, `FILTER_CONFIGURATION_EVIDENCE.md` §5 and `HISTORICAL_ERROR_FREQUENCY_AND_DRIFT.md` §6 retain active stream language; ERP YAML and `STABLE_ID_COVERAGE_AND_GAPS.md` say complete_candidate. `docs/web/UX_STRESS_ACCEPTANCE.md` §9 says complete_candidate but ends Current status active. | ERP/UX: evidence files should link canonical stream state or describe their own slice status. Make ERP/UX specification complete_candidate explicit while keeping runtime acceptance unexecuted. | No document claims a runtime test passed merely because its specification is complete_candidate. Canonical YAML matches project state. |
| DOC-08 / high | `docs/architecture/PHASE1_POST_CLOSURE_WATCH_20260930.md`, Live specialist state, says Architecture complete_candidate. Dated Lead reviews/checkpoints reference earlier leases and gate outcomes. These are historical observations, not reliable current lease/status instructions. | Lead: add a top historical/supersession pointer to current project state and current audit; preserve recorded facts and heads. Do not silently edit the historical checkpoint into a new account of events. | Worker entry path leads to current state; history retains original dates/heads. Live lease checks use GitHub rather than an old PR list. |
| DOC-09 / critical | Master §16 / API pilot contract call `AR_InvoiceRequestFrm` a sales-request candidate. Guide appendix B explicitly labels that historical form as an invoice-issuance request; the requested business label cannot be assumed equivalent. Historical menu lacks proof for current inbound/purchase-approval/internal-transfer pilot reachability. | ERP/Architecture: keep requested Web intent and historical menu label in separate fields. Resolve exact version, menu+Para+FID, data source, commands and permission before selecting a route label or mutation. | A label mismatch fails readiness. `IV_StockTranferFrm`, incoming-status, `AP_InputRequestFrm` and other similarly named forms never become the pilot by naming inference. |
| DOC-10 / high | `docs/web/PHASE2_PILOT_FRONTEND_IMPLEMENTATION_PACK.md` §3 numbers incoming/status companion as P3 then adds owner internal-transfer separately; §10 also contains six rows. Master §16 has exactly five owner pilots and does not count incoming-status. | UX: use the same five numbered pilots as master. Classify incoming/status as optional corroborating companion outside fixed scope; no accidental sixth release requirement. | Set equality of five pilot IDs across master, API contract, FE pack and Q4; optional surfaces cannot satisfy internal-transfer acceptance. |
| DOC-11 / high | Same FE pack §§3/8/10 says Build now or slices can proceed without dependencies. Master/graph correctly require authorization and completed predecessors. | UX/Lead: say components can be developed independently of exact legacy bindings after their applicable foundation/dependency gates. Safe UI design is not permission to claim an integrated business slice works. | Readiness evaluates graph predecessors and evidence separately from design status. A1 can become eligible without making every historical READY node eligible. |
| DOC-12 / critical | `docs/architecture/PHASE2_TECH_STACK.md` §2 allows an in-process adapter based on loadability; bridge Invariants and graph isolation require dedicated process context per authenticated ERP session until T1 proves safe hosting/isolation. | T1 / #19: stack summary points to the bridge as operative boundary. Alternatives require both controlled compatibility and session isolation evidence; a per-call lock or three-property reset is not proof. | Same-company distinct users, cross-company, logout/revoke, timeout, late-result fencing and worker retirement tests; production interfaces cannot expose Tool types. |
| DOC-13 / medium | `docs/architecture/MIGRATION_FOUNDATION.md`, Web configuration, states system→company→role→user precedence without its policy qualifier; `PHASE2_SCREEN_DEFINITION_CONTRACT.md`, configuration UX and bound contracts correctly retain legacy precedence UNKNOWN. | Architecture: mark the order as target presentation policy and link evidence-bound legacy resolution. | No claim of observed legacy precedence; UI exposes only proven effective scopes; presentation cannot widen authorization. |
| DOC-14 / high | `docs/PARALLEL_EXECUTION.md` introduction, accelerated policy Phase 2 acceleration, handoff Immediate coding after plan acceptance and older Lead decision enforce exactly five lanes/no sixth. Current owner requests planning up to ten schedule tasks. | Lead: supersede operative schedule limit with at most ten enabled Medcom tasks. Keep five archaeology streams as historical roles. Census/reuse/pause current schedules before adding any; planned lanes need unique ownership and dependency waves. | Count enabled schedules, including existing ones, stays ≤10. Shared contract/source ownership and branch leases are unique. No schedule activation is claimed from a plan artifact alone. |
| DOC-15 / high | `docs/plans/ACCELERATED_EXECUTION_POLICY.md`, Minimum throughput target and Adaptive workload, gives 4–8 planning/Lead and 3–6 coding, with a heavy unit counted multiple times. Current owner requires 4–6 tasks per session. | Lead: operative target becomes 4–6 meaningful bounded tasks for every chat/session, including actual test/review/CI remediation. Heavy work is reported as actual completed scope rather than artificial task multiplication. | Run ledger contains task IDs, outputs and verification. A blocker/budget exception is precise; workers do not fabricate completion, skip tests or inflate trivial edits. |
| DOC-16 / critical | Accelerated policy CI behavior and Level 4 say fix failures immediately when safe, but do not explicitly forbid deferring an actionable red failure to the next session or reserve a finish window. | Lead/CI: reserve session budget for check polling, log diagnosis, repair and final exact-head verification. While CI runs, work independent nonconflicting tasks; after a new commit, earlier green checks are stale. Actionable failures owned by the run are fixed and rerun within it. | Run exit requires latest-head green checks for claimed code completion. External outage/canceled/zero-step failure is classified, retried once, recorded and blocks completion/merge; it is never described as repaired or deferred feature work. |
| DOC-17 / high | `docs/PROJECT_STATE.yaml`, implementation_authorized false / zero eligible; graph Lead correction / master / pilot and bridge headers say not authorized in this planning run. They describe the prior preparation request, whereas the current request directs a future bounded implementation schedule plan. | Lead: date the earlier planning restriction. Record preparation-run scope separately from future owner-authorized bounded work. Recompute per-issue eligibility using completed dependencies/evidence/runtime access, instead of retaining a blanket waiting_authorization on every node or declaring all 31 ready. | The code-start and future-authorization fields cannot conflict. No blocked pilot becomes eligible because an owner approved the schedule plan. No production code is claimed as started during a documentation-only preparation run. |

## 4. Consistent contracts to preserve

These are not outstanding duplicate-ownership defects at the review anchor:

- Graph B4 is one permission/scope node owned by #23, listed and counted once.
- Graph B2 / #21 is the sole owner of `TRC-DB-001`; a Phase 1 DB lane and a future
  coding lane cannot maintain competing catalogs under the same identifier.
- F4 / #31 owns read-only AP Order and inbound surfaces; F8 / #35 owns AP Order
  writes; F9 / #42 owns inbound writes. F5–F7 own their other pilot slices.
  Preserve those owners in FE documentation, schedules and issue updates.
- Q4 / #41 requires all five pilot outcomes, including F9. A read-only F4
  surface cannot satisfy inbound mutation acceptance.
- Web idle defaults are 1,440 minutes; admin changes minutes server-side;
  polling/SWR/SignalR do not extend idle. Session contracts are aligned.
- Important operation success follows authoritative confirmation; conflict and
  OutcomeUnknown states persist outside transient toasts. Feedback contracts align.
- SignalR invalidation is post-commit and scoped. Legacy WinForms writers need
  SWR/poll/focus/manual convergence. No static evidence proves all writers push.
- New WebCore physical tables are candidates requiring reuse review, not an
  instruction to create all twelve regardless of existing `SY_*` capability.
- Only 17 columns declare IDENTITY in the Medcom structural inventory. Never
  treat a cookbook integer detail key as a universal ERP persistence contract.

## 5. Coverage ledger and overlap disposition

| Document family inspected | Disposition / relationship |
|---|---|
| Root `README.md`, `AGENTS.md`; `SOURCE_BASELINE`, `EVIDENCE_STANDARDS`, `ROADMAP`, `WEB_MIGRATION_PRINCIPLES`, `PROJECT_STATE`, `PARALLEL_EXECUTION` | Entry policy, source provenance, evidence vocabulary and current state are separate owners; language and schedule rules require the corrections above. |
| All `docs/db/*.md` | Declaration normalization/count correction supersede scanner totals; structural closure supplies aggregate schema facts; coverage matrix is the closure gate; configuration, keyless, domain/reuse, runtime options, locking and concurrency artifacts are focused evidence, not duplicate catalog owners. |
| All `docs/erp/*.md`, `inventories/erp/RPX_DOMAIN_SUMMARY.md` | Package/DAT/executable/RPX/template/error files own static artifact classes. Stable-ID coverage owns stream summary; `CSHARP_*` files are older secondary summaries; Tool metadata owns static binary facts. Runtime and current menu reachability remain separate. |
| All `inventories/traceability/*.md` | Bound contracts + filter delta are additive partial joins. Closure audit is the gate; consolidate duplicate rows only after checking stable ID/evidence, while preserving old delta history. |
| All `docs/architecture/*.md` | Foundation/tech stack/shared services are summary/design layers. Auth, command, screen, audit, pilot, bridge and realtime contracts own their focused details. Dated watch is history. Legacy grammar and in-process compatibility cannot override evidence-bound contracts. |
| All `docs/web/*.md` | Foundation, grid/mobile, navigation, feedback/session and configuration/dynamic capability specs are reusable UX; closure matrix distinguishes specification from tests; FE acceptance owns release cases; pilot pack must mirror the fixed pilot set and graph ownership. |
| All `docs/plans/*.md` | Owner directives are product constraints; master is integrated design; graph owns work/dependencies; accelerated policy owns run protocol; old closure/handoff deadlines and slot count need explicit supersession. |
| All `docs/reviews/*.md`, `docs/risks/*.md` | Recorded audits/reviews retain historical heads and open runtime risks. A new attack/reconciliation result adds evidence and supersession pointers; it does not silently convert an earlier FAIL into historical PASS. |
| Five `docs/workstreams/*.yaml` | Canonical Phase 1 lane roles/status; synchronize with project state and distinguish them from future scheduled coding lanes. |

Overlap between summary, focused contract, evidence inventory and historical
audit is useful when the owner and precedence are explicit. Duplicating
independent mutable versions of a schema, action map, pilot set or issue owner is
not useful. Link to the owner document and keep companions scoped to their role.

## 6. Smallest validation and remaining gates

Reconciliation should complete these checks once on the resulting commit:

1. Parse project/workstream YAML and compare stream/gate/start fields.
2. Check every local Markdown link, canonical issue map and graph dependency.
   Guide-relative `PROJECT_CONTEXT.md`, `PROGRESS.md`, `connections.md` and
   `Win_Version/*` paths describe its source workspace; do not create invented
   local targets or copy private files to make those links appear valid.
3. Verify five pilot set equality, one owner per graph node and F4/F8/F9 division.
4. Verify canonical count vocabulary: declarations versus distinct identities,
   columns versus tables, source snapshot versus runtime catalog.
5. Scan executable-key and worker-isolation wording for superseded claims.
6. Validate future run/schedule plan: ≤10 enabled tasks, 4–6 real tasks/session,
   unique leases, branch/head checks, CI overlap work, same-session actionable
   repair and exact-head completion evidence.
7. Run existing repository checks and inspect actual GitHub checks on the
   published commit before declaring durable completion.

The new guide makes several Phase 1 unknowns more precise but does **not** prove
the complete sanitized SQL catalog/dependency graph, exhaustive ERP-Web-DB join,
actual Tool runtime login/logout/session isolation, current permission precedence,
pilot command/state/transaction bindings, current integration endpoints, live DB
options, backup/restore readiness or runtime performance. Those remain named
evidence/runtime gates with owners. Document synchronization and stronger
execution policy can proceed while those bounded investigations continue.

## 7. Reconciliation observed during this review

The following prepared changes were read back in the shared working tree after
the findings were sent to Lead. They are document corrections, with publication
and final checks still owned by the integrating run. They do not assert that
future runtime/parser/security acceptance cases have executed.

| Findings | Observed document correction | Remaining evidence / integration check |
|---|---|---|
| DOC-01 | `BASELINE_INVENTORY.md` now summarizes 7,985 columns with a structural-closure pointer. | B2 still needs complete per-column and dependency artifacts. |
| DOC-02 / DOC-03 | `SOURCE_BASELINE.md` records guide hash, size, dates, historical-environment boundary and secondary provenance; `ROADMAP.md` distinguishes legacy VB.NET verification from target C#. | Remaining historical C# titles/queues need a supersession pointer; no raw archive/source/runtime was reopened by this wording change. |
| DOC-04 | Engine summary disavows conceptual detail numbering, unproven hook examples and the IJ1/JC1 conflation; it points to contextual guide evidence. | Direct-source/build-consumer verification and parser fixtures remain required before activation. |
| DOC-05 | Screen Definition contract adds contextual row addressing, duplicate quarantine, sparse/trailing LYT preservation, default collisions, hook separation and legacy-cache convergence acceptance. | These are planned fixtures and gates, not executed compatibility tests. |
| DOC-12 | Tech stack now defers to dedicated worker/session isolation and requires load compatibility plus lifecycle/isolation evidence. | T1 runtime, dependency host, logout/revoke/timeout and late-result tests remain open. |
| DOC-14 / DOC-15 / DOC-16 | `AGENTS.md` has the new owner-bound ≤10 schedule, 4–6 task and same-session CI rules. | Companion run/parallel/handoff policies and actual automation census must agree before activation. |

Other table entries remain explicit reconciliation actions until their corrected
documents and live GitHub state are checked. A later integrating review may add
the final commit and validation disposition without changing the historical
observations in §3.

## 8. Integrating review of remaining findings

The integrating run applied the remaining DOC-01–DOC-17 corrections to their owner documents, including historical supersession pointers, current/future authorization separation, fixed five-pilot scope, canonical 7,985 columns and contextual source grammar. Final validation is recorded in `PHASE2_RECONCILIATION_VALIDATION_20261001.md`; the original observations remain historical evidence.

A second independent read identified operational design gaps now addressed in the scheduled plan: whole-branch atomic CAS and enforced run/epoch fencing (single-writer fallback until proved), one-transaction resource admission, expected source-head merge and tested base/candidate, two-stage bootstrap/preflight, descendant-head CI unit accounting, inherited actionable CI repair, existing-plus-new schedule census, starvation prevention and path claims for fallback writes. These are planned acceptance controls, not deployed infrastructure.

The graph and live-issue synchronization add A4/A6 before integrated B3 handlers, A5 before B5 persistent outcomes, F1/F2/F3 before integrated F5–F8, F4 before F8/F9 and explicit F4 before Q4. Bounded source investigation/test-double preparation remains independent; it cannot close the corresponding integrated issue.
