# Autonomous analysis policy

GitHub is the durable source of truth for this project. Live repository state overrides chat history and stale workstream notes.

## Mandatory sources
Every worker must use the latest approved Library baseline:
- `ERP_Medcom2026(4).zip`
- `Medcom-Data (3)(1).zip`

Workers must record evidence paths/object names for every factual claim. Unknowns must be marked UNKNOWN, not guessed.

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
