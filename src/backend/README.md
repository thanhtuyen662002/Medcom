# Medcom backend

## Current source boundary — 10 October 2026

The current API registers 34 method/path pairs, including six complete v2 document reads, authenticated field/query metadata, a public OpenAPI contract, purchase Save/Submit/original lookup and the inbound draft facade. The three v2 lists support typed date/status filters and fixed server sorting; see [document query integration](../../docs/backend/DOCUMENT_QUERY_INTEGRATION_20261010.md). Default command/access providers remain unavailable; registered POST routes do not establish write admission or production readiness. Explicit legacy configuration may enable authorized typed reads. The shared Next frontend uses a same-origin BFF and backend availability/scope contracts.

The compiled backend serves `/api/contracts/openapi.json` and exports the same technical contract with `dotnet Medcom.Api.dll --print-api-contract`, without starting the host or loading private settings. [The integration handoff](../../docs/backend/FE_INTEGRATION_20261010.md) links the current 34-operation/99-schema artifact, deployment observations, FE/BFF adoption steps and the bounded read-only HTTPS verifier. Full ERP implementation and real target business acceptance remain open.

[The full data audit](../../docs/backend/API_FULL_DATA_AUDIT_20261010.md) reconciles every existing operation with source fields and actual consumer paths. Successful document responses distinguish `full` and `summary` via `X-Medcom-Data-Projection` and identify the full route via `X-Medcom-Full-Data-Path`. The complete v2 schema must be adopted by FE; an original summary or an unavailable provider is never evidence of a full ERP read.

See [the current HTTP boundary](../../docs/backend/CURRENT_HTTP_BOUNDARY_20261009.md) for the full route inventory, body bounds, scope/CSRF/receipt rules and handover gaps. That source review supersedes the historical endpoint inventory and absent-write-route statements below; no private SQL/DLL runtime or business write is newly accepted.

Read contract version 2 adds six complete document list/detail routes under `/api/v2` and an authenticated `/api/documents/field-contract?kind=…` catalog. These expose all 116 source columns of the three wired header/line modules while unversioned routes retain the original strict-consumer shape. See [full document fields](../../docs/backend/FULL_DOCUMENT_FIELDS_20261009.md) and [the exact JSON field mapping](../../docs/backend/document-field-contract.json). FE/BFF version 2 adoption and real SQL target validation remain separate.

## Historical foundation checkpoint — 2 October 2026

The runnable .NET 10 backend contains API, Application, Contracts and Infrastructure projects, Web session authority, CSRF-protected login/logout/continue routes and server-filtered workspace navigation. The default ERP identity adapter is unavailable: legacy authentication, business adapters and database access remain disabled pending their own evidence and acceptance. A working session implementation is not proof of ERP login or production readiness.

## Local run

Install the SDK selected by `global.json`, then run from the repository root:

```bash
dotnet restore Medcom.slnx --locked-mode
dotnet build Medcom.slnx --configuration Release --no-restore
dotnet test Medcom.slnx --configuration Release --no-build
dotnet run --project src/backend/Medcom.Api --no-launch-profile -- --urls http://127.0.0.1:5100
```

The local HTTP binding is for health/development inspection. Login requires HTTPS. Deployment must configure `AllowedHosts` and privately managed TLS. Cookie security defaults are HttpOnly, Secure, SameSite Strict and no sliding expiration. A signed cookie alone is insufficient: every authenticated request resolves its bounded server session and revalidates the ERP authority. The current default provider always returns unavailable; there is no environment variable or development password to bypass it.

## HTTP boundary

| Route | Current behavior |
| --- | --- |
| `GET /health/live` | 200 while the process serves requests; no database/readiness claim. |
| `GET /health/ready` | 503 with process healthy, database and legacy adapter not configured. |
| `GET /api/platform/metadata` | 401 until real session authority is implemented; no login redirect. |
| `GET /api/auth/csrf` | Issues an anti-CSRF request token with a Secure/HttpOnly companion cookie on HTTPS. |
| `POST /api/auth/login` | Closed username/password schema, HTTPS/CSRF required, bounded rate/concurrency; default identity provider returns 503. |
| `GET /api/auth/session` | Revalidated server-owned session view, no token/legacy secret in JSON. |
| `POST /api/auth/session/continue` | CSRF-protected explicit activity; passive GETs do not extend idle expiry. |
| `POST /api/auth/logout` | Retires server session, clears cookie; replay and late authority responses cannot restore it. |
| `GET /api/workspace` | Server-filtered navigation; no enabled business screens in this candidate. |

All requests receive a fresh server-issued `X-Correlation-ID`, `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Denials and unhandled failures return safe ProblemDetails. Client correlation, identity and tenant headers never create authority. Exception details and payloads are excluded from the application failure log.

API tests start actual Kestrel listeners on ephemeral loopback ports, including generated test-only TLS certificates. The suite checks session lifecycle, CSRF, schema/scope widening, cookie replay, idle/absolute expiry, authority revocation, concurrent distinct tenants on one HTTPS port, bounded admission, safe errors and correlation. Identity fixtures exist only in the test assembly and do not verify Tool.dll. Test-only routes/providers never appear in the production host.

The server session store is deliberately single-instance and bounded; restart retires all sessions. Horizontal scaling and durable security audit remain release gates. Default inactivity is 1440 minutes, configurable through range-checked deployment settings. See `docs/deployment/SERVER_DEPLOYMENT.md` for candidate packaging and remaining production acceptance.

`tools/backend/check_architecture.py` validates boundary direction and prohibits legacy/SQL assembly coupling. `tools/backend/run_preparation_checks.py` runs the separately labelled reference models and metadata validators. Passing reference checks does not complete source/runtime/business nodes. CI fetches full history because source pins validate immutable Git objects.

A sandboxed local MSBuild invocation may require `-m:1 -nr:false` and `dotnet restore --disable-parallel`; these serialize local work without skipping restore, analyzers or tests. Hosted CI uses the normal commands.

## Verified owner-DLL/SQL continuation

`Medcom.LegacyPasswordWorker` is a fifth executable boundary, with no compile-time owner assembly reference. It hashes the private DLL before loading, checks only the exact normal stored-password path and exits after one bounded request. It never runs Connector/startup, system-password verification or arbitrary calls. Infrastructure owns the pinned Microsoft.Data.SqlClient dependency; application/contracts remain platform independent.

Explicit `Legacy` server configuration can enable canonical SQL identity reads and conservative typed read-only pilots. Defaults stay unavailable, no synthetic identity is registered in product code, and write/effect/export admission remains unavailable by default. The current purchase and inbound POST boundaries are listed in the 9 October inventory above. Current grants/branches and credentials are revalidated and fenced. A bounded cached dependency monitor does not close the business release gate.

37 source-free backend tests and two separate private source/SQL/DLL/browser runtime tests were observed. Run general CI with `--filter 'Category!=LegacyRuntime'`; full fixture setup and limits are in `tools/legacy/README.md`. Source identities, actual evidence and production gaps are in `docs/erp/OWNER_SOURCE_RECOVERY_20261002.md` and `docs/deployment/SERVER_DEPLOYMENT.md`.
