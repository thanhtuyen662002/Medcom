# Backend delivery and FE handoff ledger

Canonical acceptance and execution policy: [PRODUCTION_ERP_GOAL.md](PRODUCTION_ERP_GOAL.md), [GitHub #45](https://github.com/thanhtuyen662002/Medcom/issues/45). Owner refocused the existing goal on BE/API/SQL and FE handoff on 2026-10-04; no duplicate goal issue and no native GitHub approval gate.

| Capability | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Source/request scope | inventories/source/20261002/source-set.json; existing issue graph #12-42 | Reconcile every live requested backend action/report/configuration/permission; total UNKNOWN |
| SQL Server private configuration | Api/ServerConfiguration.cs; ServerConfigurationTests.cs; tools/deploy/Configure-MedcomServer.ps1; docs/backend/SERVER_CONFIGURATION.md; published c4e66d6 in Draft #53 | Package setup assets; successful authorized connection and deployed service identity validation |
| Authentication/session/scope | ApiHost and legacy adapters in Draft #53 | Full source-compatible runtime, durable multi-instance session behavior and authority acceptance |
| SQL-backed reads | Existing scoped read pilots in Draft chain | All required source queries, pagination/filter/report/export and target SQL acceptance |
| Transfer commands | Application/Transfers; Infrastructure/Transfers; TRANSFER_COMMAND_CONTRACT_20261003.md | Concrete gateway, trusted reread/locks, source detail save, transaction journal/audit/idempotency and HTTP wiring; writes remain gated |
| FE API handoff | Shared read contracts exist | Full versioned OpenAPI/typed command/error/session/report contracts, sanitized examples and consumer contract evidence |
| Packaging and operations | tools/deploy/package.py; package_integrity.py | Include setup UI/guide, prove final package integrity; target install/HTTPS/monitoring/load/backup/restore/rollback |
| Main integration | Draft #53; CI on 285c3af green | New head checks, live gate receipts and main merge |
| Staging SQL | Private D:\Config configuration is non-template | Connectivity and representative business/effects/audit tests not yet verified |
| Production backend | No target acceptance receipt | Deployment and authorized business acceptance UNKNOWN |

Accepted backend production capabilities: **0 / UNKNOWN total**. No item above is implicitly excluded. Implementation, publication, main integration, staging and production acceptance are distinct states; the full backend denominator must be reconciled before percentages.

For each delivery, hand FE an API contract/version, permission/state/action matrix, validation/error examples, pagination/filter and report behavior, idempotency/concurrency/session requirements and test/SQL acceptance receipts. Do not call an unwired abstraction a delivered endpoint.
