# Autonomous analysis policy

GitHub is the durable source of truth for this project. Live repository state overrides chat history and stale workstream notes.

## Mandatory sources
Every worker must use the latest approved Library baseline:
- `ERP_Medcom2026(4).zip`
- `Medcom-Data (3)(1).zip`

Workers must record evidence paths/object names for every factual claim. Unknowns must be marked UNKNOWN, not guessed.

The owner-supplied `HUONG_DAN_BAO_TRI_ERP_WINFORMS.md` is supplementary maintenance-guide evidence. Read its sanitized reconciliation at `docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md`. It describes an older source/database snapshot and does not replace the approved archives, prove Medcom runtime behavior or close the seven gates. When authoritative source access fails, record the exact limitation and continue independent planning/validation; do not fabricate direct-source verification.

## Public-repository safety
This repository is public. Never commit:
- raw ERP binaries, raw ZIPs, raw database dumps or full production exports;
- credentials, connection strings with secrets, passwords, tokens, license material or private keys;
- patient/customer/personally identifying data or real transaction rows;
- confidential attachments that are not necessary for architecture documentation.

Allowed durable artifacts are sanitized technical metadata, object inventories, dependency maps, field/type definitions, redacted examples, migration plans and generated documentation. If evidence contains sensitive values, cite the source location descriptively and redact the value.

## Work protocol
- One active lease per workstream, represented by a Draft PR when mutations are needed.
- Resume an existing valid Draft PR before creating a duplicate.
- Do not wait idle on another workstream. If a dependency is unavailable, continue independent inventory, validation, gap analysis, test design or documentation within the same role.
- Every run must leave durable progress in GitHub when new verified knowledge exists.
- Never turn an assumption into a baseline fact.
- Cross-check Windows ERP behavior against DB evidence where possible.
- Lead/Watchdog owns deadlock detection, overlap resolution, stale-lease recovery, quality gates and phase completion.

## Current owner execution direction — 2026-10-01

- Prepare at most **10 scheduled lanes** using `docs/plans/PHASE2_SCHEDULED_EXECUTION_PLAN.md`; this preparation does not create, enable, repurpose or stop automations.
- Each scheduled working session selects **4–6 meaningful bounded tasks**, verifies and persists each completed result, and uses independent fallback work while CI/dependencies are pending. A trivial edit or one heavy task must not be counted several times. Record any unavoidable shortfall honestly.
- Every actionable CI failure on the owned current head, introduced now or inherited, is repaired **in the same session before new product code**. Reserve repair/drain budget, inspect the latest pushed head and rerun appropriate checks. Coordinate bounded owner repair for shared paths; never discard another worker's work. Never defer an owned regression as routine next-session work, merge red/pending code, disable checks or hide a failure. A provider outage or missing authorized environment is a disclosed external block, never a claimed fix.
- One primary owner per issue/path range; one valid Draft lease per lane; fenced source-head writes; one coordinator-controlled integration queue. Shared contracts, lockfiles, schemas and CI changes go through their declared owner.
- This request authorizes preparation of the future coding workflow. Independent source-free foundation work may be eligible only after plan integration/preflight; enabled legacy authentication, domain writes, SQL changes and release remain individually evidence/dependency gated. The current run produces planning/evidence artifacts only.
- `docs/PROJECT_STATE.yaml` holds current state, the issue graph holds dependencies, the scheduled plan holds lane/session mechanics, and specialist contracts hold semantics. Historical READY labels and old five-lane/deadline rules do not grant start permission.

## Activated workflow — 2026-10-02

The owner has now explicitly activated the schedule workflow and requested review/merge of PR #43. The reviewed plan is on main; read `docs/execution/SCHEDULE_ACTIVATION_20261002.md` and its actual configuration registry. Ten hourly schedules are enabled in Asia/Saigon. This newer direction supersedes the earlier planned-only schedule restriction and blanket planning-run authorization note. It preserves all evidence, source, dependency, runtime, CI and operation gates.

L01 is the sole authorized GitHub writer during bootstrap; L02–L10 perform read-only GitHub/preparation until tested dispatcher fencing and eligible leases admit them. Minimum single-writer preflight is allowed before dispatcher proof; source-free A1 follows that preflight and the already-completed plan integration. Record an L02→L01 sublease if L01 applies A1 preparation. Do not resume merged PR #43 as a lease. In-session subagents may prepare bounded local patches without GitHub mutations, with direct reviewed handoff.

TRC-DB-001/#21 and exhaustive traceability remain open under `docs/reviews/PHASE1_DB_TRACEABILITY_CLOSURE_DECISION_20261002.md`. Close static coverage by the finite catalog/manifest/export acceptance, rather than waiting indefinitely on unrelated runtime facts. Bounded runtime UNKNOWNs remain separate enabled-slice gates; missing manifest members and dump-extractable facts cannot be waived. Historical Phase 1 stop rules do not independently authorize changing these active coding schedules.

## Definition of Phase 1 complete
Phase 1 is complete only when the repository contains:
1. ERP inventory covering modules/forms/reports/layout/config/permissions/workflows and unresolved unknowns.
2. DB inventory covering schemas/tables/columns/keys/indexes/views/procedures/functions/triggers/dependencies/config patterns.
3. Web product/UX specification including dense-grid workflows, keyboard productivity, accessibility, performance and refresh/realtime behavior.
4. ERP ↔ Web ↔ DB traceability with explicit gaps and proposed config extensions.
5. Migration architecture, sequencing, compatibility/rollback strategy and acceptance criteria.
6. Red-team register covering security, performance, reliability, concurrency, data integrity, UX failure, reporting, authorization and operational failure classes.
7. Lead quality review confirms that further discovered problems are variants of existing documented classes or are explicitly tracked as remaining unknowns.

Historical Phase 1 completion records `phase_status: awaiting_csharp_round`. Its former schedule-stop permission is superseded by `MEDCOM_SCHEDULE_GUARD_V1` below; completion grants no authority to alter schedules.

## Direct execution — 2026-10-02 (newest owner direction)

The owner requested: “Tạm thời tắt 10 schedule, bạn sẽ đảm nhiệm toàn quyền xử lý github và tiến hành code dự án”. All ten automation update responses confirmed `is_enabled=false`. Preserve their prompts and schedules; do not resume them without a new request. Pausing does not prove an already-running invocation was cancelled.

The current interactive lead owns direct GitHub/code execution across previous lane path boundaries. Existing lane ownership is historical context; a new dispatcher, parallel admission or lane sublease is not a prerequisite for this one writer's source-free implementation. This supersedes scheduled-only/preparation-only restrictions for the direct lead. Resume Draft #44, preserve existing work and read the remote head before normal fast-forward publication. No force-push, no direct overwrite of main, no invented source or runtime evidence. Existing independent-review/CI and sensitive-data constraints remain.

A1 now has a checksum-verified .NET 10.0.401 SDK in the interactive runtime. Restore/build/tests must be observed, not assumed from SDK installation. The direct checkpoint and local run instructions are in `docs/execution/DIRECT_EXECUTION_20261002.md` and `src/backend/README.md`. Keep TRC-DB-001, T1, total traceability and business/release gates open until their actual acceptance passes.

## Full-stack continuation — 2026-10-02

The owner explicitly requested using Tool.dll from the ERP ZIP without bypassing passwords, completing the backend and frontend, and producing a production system for owner-managed server deployment. Continue direct single-writer implementation across BE/FE. The desired production outcome does not establish source access, legacy semantics, database bindings or runtime acceptance. Take source-access recovery as a concrete first task; use only authorized accessible archives and record hashes. Preserve the existing password mechanism. Do not ship guessed authentication, generic SQL CRUD or test providers as a production substitute. `docs/execution/FULL_STACK_CONTINUATION_20261002.md` records actual progress and blockers.

## Owner source recovery — 2026-10-02

The owner supplied accessible new ERP/DB ZIPs and Tools.dll for continued implementation. Use the new technical verification round recorded in `docs/SOURCE_BASELINE.md`, `docs/erp/OWNER_SOURCE_RECOVERY_20261002.md` and `inventories/source/20261002/source-set.json` for direct continuation. Historical baseline evidence retains its identity; do not claim archive equivalence. The pure stored-password subset has observed .NET 10/Linux compatibility and a process-isolated adapter; it does not authorize full legacy engine portability or system-password fallback. Two typed read-only pilots are explicitly configuration-gated. Mutations, complete legacy contexts, exports and production admission remain gated by actual evidence.

## Full SQL extraction correction — 2026-10-02

The owner corrected the earlier procedure/trigger absence claim. The previous SQL extraction was incomplete; it is superseded by the exact full ZIP member (1,212,595,716 bytes, CRC32 16a9a7e6, SHA-256 61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096). Use the current source-set, extraction-integrity and 1,527-object/33-member manifest. All seven transfer checks are present among 609 procedures; three trigger names also have stored definitions cataloged with version provenance. Do not repeat the missing-procedure blocker or demand another export for these definitions. Continue typed business implementation from actual source; preserve private SQL bodies, current Web action/branch authorization, transaction/concurrency and runtime/release acceptance. Exact archive size/CRC/hash checks must pass before declaring a source catalog complete. Three private runtime tests include the actual eight-procedure transfer-check fixture.

## Production goal and six-role resumption — 2026-10-02 (latest owner direction)

The owner requested one complete production goal and resumed scheduled coding. Goal #45 and `docs/goals/PRODUCTION_ERP_GOAL.md` define full authorized ERP BE/FE completion and real target acceptance, not five read-only demos. `docs/execution/PRODUCTION_WORKFLOW_20261002.md` replaces the historical ten-lane bootstrap/pause and planning-only restrictions for this resumption. Five different hourly coder scopes start ten minutes apart, plus one hourly lead; identical same-task copies are not supported. Use the observed `production-schedules.json` configuration and `production-tickets.json` ready assignments. Four other Medcom schedules stay paused; unrelated tasks are unchanged.

Coders may implement eligible verified code in their declared paths on isolated invocation-owned branches after a successful immutable create-only ticket claim. No coder writes #44/main/shared contracts or takes over an old run. Lead owns contracts/wiring/tickets/serial integration; only positive quiescent completion allows a successor. Actual create-if-absent was probed; full dispatcher/credential fencing remains unproved and must not be claimed. Read the detailed protocol before mutation. No expired-lease takeover, forced ref updates, fabricated source/runtime/review, red merge or production database/deployment changes. Existing evidence/independent-review/current-head CI/operation gates remain. Continue useful code/testing/review until goal acceptance; keep these six task IDs unchanged and report acceptance to the owner.

## Long-term goal and schedule guard — owner renewal 2026-10-03

The latest direct owner instruction renews canonical goal #45 and authorizes direct code/test/review/integration toward complete real production acceptance. Reuse the existing goal and six schedules. The direct writer works on a new isolated branch and preserves previous runs, PRs and immutable claims; this is not a takeover of a scheduled ticket. Do not infer target deployment or production database authorization.

`MEDCOM_SCHEDULE_GUARD_V1` supersedes all earlier stop/pause instructions in this file, workflows, handoffs and historical schedule snapshots. During a scheduled invocation coder/lead must not create, update, pause, disable, delete, reschedule, modify prompt/permissions/notifications, add COUNT/UNTIL, mark a schedule completed, or delegate any such operation through any API/tool. Keep five coder schedules plus one lead unchanged, including after full goal acceptance. Only a newer direct owner instruction grants schedule administration. BLOCKED, no ready ticket, duplicate claim, missing reviewer/runtime/network, CI failure, finished PR or repeated reports never grants that authority. Checkpoint evidence and the next eligible task; if none is eligible, end the invocation and preserve the schedules. Schedule state and claim age do not prove quiescence. These are operating instructions, not a claim of credential-level fencing.


## Current owner backend direction — 2026-10-04

This latest direct owner direction supersedes historical preparation-only, BE/FE implementation, schedule activation and independent GitHub approval instructions above. Canonical goal #45 now covers full source-backed backend, API, SQL and usable handoff for the separately owned FE; do not mutate that FE/Sites application. No backend scope item is silently excluded. Follow docs/goals/PRODUCTION_ERP_GOAL.md and the latest owner_backend_direction_20261004 state entry.

The owner authorizes this lead as the sole GitHub executor; no GitHub approval is required. Preserve PR traceability, local quality review, exact-head/base CI, conversation resolution, artifact/source safety and positive custody handoffs. Do not fabricate GitHub approval, disable tests or merge failed/pending required checks. Other agents, if explicitly delegated, operate only bounded local scopes and do not publish to GitHub.

Keep all Medcom schedules OFF; do not create, enable or repurpose automations. The older MEDCOM_SCHEDULE_GUARD_V1/activation text is historical and does not override this newer direct instruction. Schedule state never proves writer quiescence. Preserve the existing I02 Draft #53 lease and immutable claim/scope refs. Continue meaningful code and verified publication; checkpoint source/runtime unknowns honestly, and protect private SQL settings and raw ERP data.
