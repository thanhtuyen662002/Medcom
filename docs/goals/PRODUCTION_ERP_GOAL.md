# Complete Medcom ERP for production

Canonical goal: [GitHub #45](https://github.com/thanhtuyen662002/Medcom/issues/45). Owner direction: 2026-10-02, complete BE/FE for owner-managed deployment and real users; activate scheduled work.

The goal covers the agreed ERP surface, not only the two existing read screens or initial five pilots. Every source capability requires a reviewed Web/DB disposition; exclusions require an explicit owner decision. Existing implementation graph #12–42 remains authoritative for dependencies.

## Definition of done

- Exhaustive finite source/schema/dependency and ERP → Web → DB traceability; all seven Phase 1 gates independently accepted.
- Complete source-backed backend: normal Tools.dll password path, current trusted permissions/scopes, business effects, atomic commands, concurrency, idempotency/unknown-outcome reconciliation and durable audit.
- Complete authorized FE workflows, grids/forms/actions, keyboard/mobile/accessibility, per-user configuration, refresh/conflicts/recovery.
- End-to-end independently accepted five pilots, reachable reports/exports and all remaining agreed source capabilities.
- Exact-head tests/security/performance/independent review, healthy integrated main, no unresolved critical finding.
- Versioned package/checksums, executable configuration validation, installation/monitoring and measured backup/restore/coexistence/rollback rehearsals.
- Authorized target-host/staging acceptance with real DLL/SQL/TLS/schema/trigger versions and representative load. Mock CI and synthetic SQL are separate evidence.
- Exact release build/config/schema GO decision and owner-managed real-user installation verification. Only then close #45 and pause the six configured schedules.

## Present baseline

PR #44 contains normal-password BE, scope-safe list/detail FE and the full SQL extraction correction. Source availability is resolved: 609 procedures, seven transfer checks, stored trigger versions. Previous-head hosted CI passed at 692a8ab05ab248dbaad58a65f4c18893fbe34ca5 (run 37029121428). Read live current head before any integration decision. No Web mutation or production deployment has been accepted. Product status remains BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE.

Execution: docs/execution/PRODUCTION_WORKFLOW_20261002.md, production-tickets.json and production-schedules.json.
