# Complete Medcom ERP for production

Canonical long-term goal: [GitHub #45](https://github.com/thanhtuyen662002/Medcom/issues/45). Renewed direct owner direction: 2026-10-04, continue code, review, tests and integration until the complete ERP reaches independently verified production acceptance for real users. Reuse this goal rather than creating a duplicate. The native production Goal is active; it does not replace this durable acceptance record.

The goal covers the agreed ERP surface, not only the two existing read screens or initial five pilots. Every source capability requires a reviewed Web/DB disposition; exclusions require an explicit owner decision. Existing implementation graph #12–42 remains authoritative for dependencies.

## Definition of done

- Exhaustive finite source/schema/dependency and ERP → Web → DB traceability; all seven Phase 1 gates independently accepted.
- Complete source-backed backend: normal Tools.dll password path, current trusted permissions/scopes, business effects, atomic commands, concurrency, idempotency/unknown-outcome reconciliation and durable audit.
- Complete authorized FE workflows, grids/forms/actions, keyboard/mobile/accessibility, per-user configuration, refresh/conflicts/recovery.
- End-to-end independently accepted five pilots, reachable reports/exports and all remaining agreed source capabilities.
- Exact-head tests/security/performance/independent review, healthy integrated main, no unresolved critical finding.
- Versioned package/checksums, executable configuration validation, installation/monitoring and measured backup/restore/coexistence/rollback rehearsals.
- Authorized target-host/staging acceptance with real DLL/SQL/TLS/schema/trigger versions and representative load. Mock CI and synthetic SQL are separate evidence.
- Exact release build/config/schema GO decision and owner-managed real-user installation verification. Only then close #45 with the complete evidence and report acceptance to the owner. Medcom schedules must remain OFF under the current direct owner instruction.

## Persistent execution and schedule authority

The newer direct owner instruction supersedes the historical `MEDCOM_SCHEDULE_GUARD_V1` instruction to keep six schedules enabled: keep all Medcom schedules OFF. Do not create, enable or repurpose automations. Historical enabled-state snapshots and old scheduled prompts do not grant restart authority.

A blocked ticket, missing environment/toolchain/reviewer, failed CI, occupied claim, finished PR, accepted baseline or duplicate reporting does not authorize enabling a schedule. Record concrete evidence and the next unblock step and continue eligible work. Claim age and disabled schedules never prove another writer's quiescence: verify positive terminal handoffs and live activity before integration.

The current direct interactive I02 continuation uses its own Draft PR #53 and immutable custody/scope refs; predecessor branches and claims remain preserved. Source, custody, fresh exact-head CI, independent review and authorized target-operation gates remain mandatory. Configuration state does not prove execution or production acceptance.

## Current direct execution checkpoints — 2026-10-04

- [Integration and Windows package repair](../execution/checkpoints/I02_INTEGRATION_REPAIR_20261004.md): public gate handoffs recovered, tested merge receipts wired, 61 guard tests and 43 backend tests verified locally; publication `6cb69451107a2561c2ccfbe1ec634ccf0a92318a` has fresh green CI.
- [Typed transfer recovery](../execution/checkpoints/I02_TRANSFER_RECOVERY_20261004.md): six terminal handoff file hashes verified, 143 backend tests pass; publication `00460399e3b0cf9220401859bb8a0a34ca5f1e85` has fresh green backend and policy/Windows CI.
- [Windows source fixture repair scope](../execution/checkpoints/I02_SOURCE_FIXTURE_SCOPE_20261004.json): UTF-8 preparation of the verified owner SQL member. Direct source file/member reads are separate from runtime evidence.
- Prepared code remains in a Draft; integration into main is pending a distinct latest-push GitHub approval and the integration gate. The transfer gateway remains an interface; SQL provider, trusted authority reread, API/UI wiring and durable transactional audit/idempotency remain incomplete.
- Production accepted capabilities: **0 / UNKNOWN total**. The full ERP denominator has not been closed; SQL object counts and green test counts are not product acceptance counts. No scope item is excluded by this checkpoint.

## Present baseline

PR #44 contains normal-password BE, scope-safe list/detail FE and the full SQL extraction correction. Source availability is resolved: 609 procedures, seven transfer checks, stored trigger versions. Previous-head hosted CI passed at 692a8ab05ab248dbaad58a65f4c18893fbe34ca5 (run 37029121428). Read live current head before any integration decision. No Web mutation or production deployment has been accepted. Product status remains BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE.

Execution: docs/execution/PRODUCTION_WORKFLOW_20261002.md, production-tickets.json and production-schedules.json.
