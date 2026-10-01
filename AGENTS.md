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

## Definition of Phase 1 complete
Phase 1 is complete only when the repository contains:
1. ERP inventory covering modules/forms/reports/layout/config/permissions/workflows and unresolved unknowns.
2. DB inventory covering schemas/tables/columns/keys/indexes/views/procedures/functions/triggers/dependencies/config patterns.
3. Web product/UX specification including dense-grid workflows, keyboard productivity, accessibility, performance and refresh/realtime behavior.
4. ERP ↔ Web ↔ DB traceability with explicit gaps and proposed config extensions.
5. Migration architecture, sequencing, compatibility/rollback strategy and acceptance criteria.
6. Red-team register covering security, performance, reliability, concurrency, data integrity, UX failure, reporting, authorization and operational failure classes.
7. Lead quality review confirms that further discovered problems are variants of existing documented classes or are explicitly tracked as remaining unknowns.

When all seven are proven, Lead stops all Phase 1 schedules and records `phase_status: awaiting_csharp_round`.
