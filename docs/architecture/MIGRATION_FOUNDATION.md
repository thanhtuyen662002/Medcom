# Migration Architecture Foundation

Status: architecture contract. Unverified source behavior remains UNKNOWN.

## Boundaries
The Web client is presentation only and never connects directly to SQL Server. Backend services own server-side identity and company scope, authorization, validation, transactions, concurrency, retry safety, audit, queries, reporting and jobs. Use task-oriented APIs rather than generic table endpoints.

Database objects receive one disposition: REUSE, FACADE, CONTROLLED_CHANGE, ADDITIVE_WEB_CONFIG, REPLACE_RETIRE, or UNKNOWN. Repair/backup artifacts require explicit review.

## Web configuration
Before adding tables, DB Analysis must check existing configuration support. If extension is needed, model stable surface/element IDs, lookup definitions, scoped overrides, saved views and immutable config versions. Presentation precedence is system default, company default, role default, then user override. Authorization is not part of presentation precedence.

## Data changes
Critical edits require a server-validated expected version when concurrency applies. Retryable commands use a stable request key and the server must not execute the same logical change twice. Existing SQL trigger effects are part of the transaction and must be included in retry tests.

Business state and any durable notification/job intent commit together. Realtime and background dispatch happen only after commit.

## Queries and lookups
Large grids use server-side projections, paging, filtering and sorting with explicit allowed fields, stable row IDs and deterministic ordering. Lookups use stable keys, authorized search contracts and server validation of submitted IDs. Arbitrary client SQL is not supported.

## Freshness
The database remains authoritative. Realtime is post-commit and clients revalidate after reconnect, event gaps or authority changes. Cache keys include all data-scope dimensions. Each migrated surface selects the UX PUSH, SWR, POLL, MANUAL or SNAPSHOT policy.

## Reports and files
Stored-procedure report contracts and ERP RPX definitions are mapped report by report. Long reports/exports use durable jobs with authorized parameters, status, snapshot time where needed and authorized download. File operations validate metadata/content server-side and authorize every retrieval.

## Migration
Migrate by vertical slice: discover verified semantics, define contracts, shadow reads, enable controlled Web writes, compare outcomes, expand scope, then retire the Windows path only after evidence. Database evolution follows expand, migrate, contract. Rollback disables the Web slice and returns workflow to the known path without destructive reverse migration.

## Observability
Track API and SQL latency/errors, deadlocks, concurrency conflicts, duplicate retries, job backlog/failure, realtime gaps, cache freshness, authorization denials, report runtime and config-version failures.

## Current evidence anchors
The DB specialist branch verifies existence of AR_InvoiceTbl, AR_OrderTbl, CF_ObjectTbl, CF_ItemTbl, SY_User, SY_UserGroup and FA_AssetTbl, plus a broad report-procedure surface and trigger side effects. Until exact dependencies are catalogued, domain objects default to FACADE/UNKNOWN rather than direct generic reuse. The UX specialist branch defines reusable WEB contracts, but VERIFIED ERP screen IDs are not yet available on main.

## Gap register
- ARCH-GAP-001: VERIFIED ERP screen/form IDs are not yet on main.
- ARCH-GAP-002: exact procedure/view/trigger dependency catalog is pending.
- ARCH-GAP-003: existing system configuration/permission support for Web presentation configuration is unproven.
- ARCH-GAP-004: concurrency/version fields and transaction boundaries are unproven.
- ARCH-GAP-005: report procedure to RPX parameter/result mapping is pending.
- ARCH-GAP-006: company/branch/user enforcement needs DB analysis and later C# verification.
- ARCH-GAP-007: integration, background-job and file contracts remain to inventory.
- ARCH-GAP-008: UX screen bindings are pending.

Every VERIFIED ERP capability must eventually record ERP ID, evidence, user intent, WEB capabilities, API contract, DB IDs/disposition, authorization, concurrency, side effects, freshness, configuration, report/export dependencies, acceptance tests, rollback and explicit UNKNOWNs.
