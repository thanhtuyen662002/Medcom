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
The DB specialist branch verifies a broad SQL object/configuration/concurrency baseline, including existing SY_* configuration surfaces. ERP Analysis now publishes VERIFIED package IDs for layout/config/filter/report evidence, and Web Product/UX publishes reusable WEB contracts plus a complete-candidate closure matrix. Architecture therefore binds live specialist branch evidence rather than waiting for it to land on main. Until exact DB dependencies and per-command mutation semantics are catalogued, domain writes remain FACADE/UNKNOWN rather than direct generic reuse.

## Gap register
- ARCH-GAP-001: exact runtime menu reachability/captions/order remain C#-round UNKNOWN; package form/config IDs are available now.
- ARCH-GAP-002: exact procedure/view/trigger dependency catalog is pending DB closure.
- ARCH-GAP-003: existing SY_* configuration support is VERIFIED at schema/capability level; exact precedence, executable semantics and safe Web personalization persistence remain UNKNOWN.
- ARCH-GAP-004: concurrency/version fields and per-command transaction/idempotency boundaries are unproven.
- ARCH-GAP-005: report procedure to RPX parameter/result mapping is partial; exact result/side-effect contracts remain pending.
- ARCH-GAP-006: exact permission precedence and company/branch/storehouse enforcement remain C#-round UNKNOWN; server authorization remains mandatory.
- ARCH-GAP-007: exact integration/background-job/file runtime bindings remain to inventory or reserve explicitly for C# verification.
- ARCH-GAP-008: reusable UX bindings exist; remaining work is exhaustive disposition of newly VERIFIED ERP IDs, not absence of a UX contract.

Every VERIFIED ERP capability must eventually record ERP ID, evidence, user intent, WEB capabilities, API contract, DB IDs/disposition, authorization, concurrency, side effects, freshness, configuration, report/export dependencies, acceptance tests, rollback and explicit UNKNOWNs.


## Phase 2 implementation stack

The adopted implementation stack is defined in `docs/architecture/PHASE2_TECH_STACK.md`.

Key constraints:
- backend: C# / ASP.NET Core on .NET 10 LTS;
- Tool.dll isolated behind a compatibility adapter/bridge;
- frontend: Next.js + React + TypeScript + shadcn/ui;
- shared dense-grid platform: TanStack Table + virtualization;
- server state/revalidation: TanStack Query;
- realtime candidate transport: ASP.NET Core SignalR, post-commit and authorization-scoped;
- SignalR never replaces SWR/poll/revalidation while legacy WinForms writers can bypass the Web backend;
- role-configurable mobile quick navigation is presentation configuration only and cannot grant permissions.
