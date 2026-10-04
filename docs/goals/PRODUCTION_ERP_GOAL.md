# Medcom backend, API and SQL production goal

Canonical goal: [GitHub #45](https://github.com/thanhtuyen662002/Medcom/issues/45).
Direct owner scope revision: 2026-10-04. Native Codex goal created with this scope and ACTIVE on 2026-10-04.
Reuse #45; do not create a duplicate goal issue. This direction supersedes historical BE/FE goal text and independent GitHub approval requirements.

## Objective and boundaries

Deliver the complete source-backed backend, API and SQL business capabilities requested in GitHub, with usable integration handoffs for the separately owned frontend. Cover the full ERP backend surface, not only pilots or read endpoints. Preserve the SQL Server/WinForms/Tools.dll compatibility architecture; do not replace source business semantics with generic CRUD. Implement no separately owned FE/Sites application in this goal.

Frontend implementation and full Web ERP user acceptance remain separate responsibilities. Their absence is not concealed as backend completion. Backend acceptance includes executable API contracts and consumer integration evidence, not an assertion that a finished UI exists. Scope exclusions require the owner's explicit agreement.

## Acceptance gates

1. **Scope and source:** reconcile all current GitHub feature requests with the complete module/action/report/configuration/permission inventory. Map each required item: source evidence/object -> backend/API -> SQL effects -> FE contract -> tests -> acceptance receipt. Record UNKNOWN explicitly; close the denominator before claiming 100%.
2. **Identity and authority:** source-compatible authentication, session lifecycle and concurrent sessions; trusted user/unit/branch permissions; data scope enforcement; unauthorized access/session expiry tests. No client authority claims or plaintext password substitutes.
3. **Business commands:** typed payloads for every source action; a concrete SQL gateway wired into HTTP; source-defined stored procedures/triggers/state effects; transactions/isolation/locking, concurrency tokens, retry/double-submit protection and durable idempotency. Do not enable writes through a flag alone.
4. **Audit and recovery:** committed/rejected/rolled-back/unknown outcomes recorded correctly; durable correlation and reconciliation; no false success on uncertain commit; prove database effects and audit agreement.
5. **Reads, reports and configuration:** real SQL-backed query/detail/pagination/filter/report/export/configuration endpoints, scoped authorization, cache boundaries and predictable errors. Private SQL Server configuration remains outside the public repo, default D:\Config\appsettings.Private.json; server setup permits choosing its directory.
6. **FE handoff:** versioned OpenAPI/typed contracts, action/permission/state requirements, field validation, paging/filter rules, errors, idempotency/concurrency examples, session recovery and report/export contracts. Provide sanitized request/response examples, runnable contract tests and evidence for each delivered feature; mocks only in isolated tests.
7. **Release and target acceptance:** backend build and verified package; unit/API/integration tests and representative authorized SQL acceptance; target host/database verification, HTTPS/secrets/logging/monitoring, measurable load criteria, install/upgrade and necessary migrations, backup/restore/rollback, deployment smoke checks and authorized business acceptance.

Never publish raw archives/binaries/dumps, private connection strings, credentials, patient/customer data or real transaction rows. Mandatory approved Library archives remain ERP_Medcom2026(4).zip and Medcom-Data (3)(1).zip; the current technical source-set does not silently replace them. See inventories/source/20261002/source-set.json and docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md for provenance distinctions.

## GitHub execution policy

The owner explicitly delegates GitHub execution to this Codex lead as the sole executor. GitHub approvals are not a required gate. No fabricated review or second GitHub actor is needed. Local code review, positive writer handoffs, one active Draft lease, exact source/base checks, all required CI, conversation resolution, artifact integrity, no force-push/deletion protections and public-data safety remain mandatory. Merge only a verified current head after reading current reviews and resolving actionable findings. Do not disable checks or reuse checks from an older head.

Keep Medcom automations OFF. Do not create, enable or repurpose schedules. Schedule state or claim age never proves a writer stopped; use positive custody evidence. Root alone publishes GitHub mutations; delegated agents, if used, operate bounded local file scopes.

## Current checkpoint (2026-10-04)

- Active lease: [Draft PR #53](https://github.com/thanhtuyen662002/Medcom/pull/53), branch codex/g45-production-i02-20261004, run 2c24e90b-4e0a-49cb-828b-83b824788e33.
- Published private configuration feature: c4e66d6801ee898ad93e08fac65e40f015121b99; configurable private directory, direct SQL Server TLS validation and protected persistence. Published in Draft, not integrated or deployed. Evidence: docs/backend/SERVER_CONFIGURATION.md; docs/execution/checkpoints/I02_SERVER_CONFIGURATION_20261004.md; CI runs 37183893976 and 37183893981.
- Last previously pushed head 285c3af57283ed373ca1111928fdf78e5fdcf242 has green runs 37189214588 and 37189214621. These checks do not cover later uncommitted work.
- Current work: package the actual setup tool/guide, reject private payloads, reconcile sole-executor policy, then validate private remote SQL configuration and complete concrete transactional transfer/API wiring.
- Transfer adapter and typed commands exist, but the concrete transactional gateway, durable journal/audit and HTTP commands are incomplete. Evidence: src/backend/Medcom.Application/Transfers, src/backend/Medcom.Infrastructure/Transfers and docs/erp/TRANSFER_COMMAND_CONTRACT_20261003.md.
- Full backend denominator: **UNKNOWN**. Production accepted backend capabilities: **0 / UNKNOWN**. Code/published/main/staging/production stages must be counted separately. Tests or source object counts are not business acceptance percentages.
- Target deployment, representative SQL runtime and authorized business acceptance: **UNKNOWN** until actual receipts exist. A private non-template configuration file is present; this alone does not prove connectivity, permissions or business behavior.

## Closure and continuation

Close #45/native goal only when the reconciled backend scope has no required missing/disabled/mock capability, all API/SQL/FE handoff gates are evidenced, code is integrated into main with current-head CI, and the backend release is deployed and accepted on the authorized target with operational recovery evidence. Do not claim full Web ERP production completion from this backend goal. Missing external access must be stated precisely while independent work continues. Destructive data changes, irreversible migrations or material access changes need the concrete backup/rollback plan and owner decision unless already authorized.

Every checkpoint records exact commit/PR, tests, remaining source/runtime gaps, handoff location and next executable step. No promise of unsupported background execution. Detailed delivery matrix: [BACKEND_PRODUCTION_GOAL.md](BACKEND_PRODUCTION_GOAL.md).
