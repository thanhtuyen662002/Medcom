# Backend delivery and FE handoff ledger

Canonical acceptance and execution policy: [PRODUCTION_ERP_GOAL.md](PRODUCTION_ERP_GOAL.md), [GitHub #45](https://github.com/thanhtuyen662002/Medcom/issues/45). Owner refocused the existing goal on BE/API/SQL and FE handoff on 2026-10-04; no duplicate goal issue and no native GitHub approval gate.

| Capability | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Source/request scope | inventories/source/20261002/source-set.json; existing issue graph #12-42 | Reconcile every live requested backend action/report/configuration/permission; total UNKNOWN |
| SQL Server private configuration | Api/ServerConfiguration.cs; ServerConfigurationTests.cs; tools/deploy/Configure-MedcomServer.ps1; docs/backend/SERVER_CONFIGURATION.md; published c4e66d6 in Draft #53 | Package setup assets; successful authorized connection and deployed service identity validation |
| Authentication/session/scope | ApiHost and legacy adapters in Draft #53 | Full source-compatible runtime, durable multi-instance session behavior and authority acceptance |
| SQL-backed reads | I67 / merged #122 established the 116-column source projection. I70 / #127 returns these complete objects on both original and v2 document routes, retaining compatibility scalars and page bounds; 12 full GETs across six source tables | Remaining ERP modules/source queries, reports/exports and real target SQL acceptance |
| Transfer commands | Application/Transfers; Infrastructure/Transfers; TRANSFER_COMMAND_CONTRACT_20261003.md | Concrete gateway, trusted reread/locks, source detail save, transaction journal/audit/idempotency and HTTP wiring; writes remain gated |
| FE API handoff | I70 / #127: full fields by default, current/v2 required OpenAPI schemas, all-API audit and Vietnamese field-by-field BE guide at docs/backend/BE_FE_FULL_FIELDS_INTEGRATION_20261010.md; 34 operations / 99 schemas. I69 query filters/order remain v2-only | FE full-schema adoption on current routes; optional v2/BFF query adoption; larger purchase aggregate reads; remaining ERP command/report surfaces and actual consumer/runtime acceptance |
| Packaging and operations | tools/deploy/package.py; package_integrity.py | Include setup UI/guide, prove final package integrity; target install/HTTPS/monitoring/load/backup/restore/rollback |
| Main integration | I69 / #125 merged 2fd9779149e12ae46634de3218a2505c214244fb after exact-head/base CI and package checks. I70 / #127 requires its own implementation checks/integration | I70 exact-head/base checks; current deployed contract smoke; remaining ERP implementation and target acceptance |
| Staging SQL | Private D:\Config configuration is non-template | Connectivity and representative business/effects/audit tests not yet verified |
| Production backend | No target acceptance receipt | Deployment and authorized business acceptance UNKNOWN |

Accepted backend production capabilities: **0 / UNKNOWN total**. No item above is implicitly excluded. Implementation, publication, main integration, staging and production acceptance are distinct states; the full backend denominator must be reconciled before percentages.

For each delivery, hand FE an API contract/version, permission/state/action matrix, validation/error examples, pagination/filter and report behavior, idempotency/concurrency/session requirements and test/SQL acceptance receipts. Do not call an unwired abstraction a delivered endpoint.
