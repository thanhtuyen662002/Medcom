# Medcom backend

The backend includes `/swagger` for API inspection. Sign in with an ERP account,
then use **Try it out**; its client supplies CSRF/current scope and retains normal
server permissions. See the [Swagger usage guide](../../docs/backend/SWAGGER_UI.md).

Runtime schema/source/form fingerprint gates were retired by owner direction on 15 October 2026. Existing `SchemaFingerprint` settings are ignored; keep the current DB/journal binding, native permissions, document state and concurrency checks. See the [operator update handoff](../../docs/backend/ERP_WRITES_WITHOUT_FINGERPRINT_20261015.md).

## Current API and frontend handoff — 11 October 2026

The [complete Vietnamese FE API reference](../../docs/backend/BE_FE_API_REFERENCE_20261011.md) covers **244 HTTP operations, 1202 schemas and 214 dropdown bindings** across 19 forms. Use the [authenticated permissions handoff](../../docs/backend/BE_FE_PERMISSIONS_20261015.md) for menu, screen, CRUD and button rendering. The [CUD/workflow handoff](../../docs/backend/BE_FE_CUD_WORKFLOW_20261011.md) identifies each added screen, owned input fields, business buttons, statuses, section routes and stock-voucher preconditions. Print/import/copy additions are excluded from PR140. Source, native SQL fixture, CI and deployment evidence are recorded separately in [I78](../../docs/execution/I78_CUD_ACTIONS_20261011.md).

Business reads add source reference names, ItemCode/Unit and Vietnamese money/date display fields while retaining raw values, document snapshots, paging and exact command inputs. Strict input objects have separate `...DisplayData` companions. `GET /api/lookups/branches` returns paged BranchID/BranchName choices within the native user's grants. FE must adopt this route in its BFF allowlist and use the response's actual property casing. The [display and CUD/button audit](../../docs/backend/API_DISPLAY_AUDIT_20261011.md) records the previous snapshot; the current reference catalog has 45 verified bindings, null/unknown name semantics and remaining CUD/report/import gaps.

Ordinary legacy startup now composes the SQL writer and number allocator when the private ERP write profile is configured. The owner-authorized MedData journal installation and activation of all seven modules on BE Medcom are recorded in [PR 132](https://github.com/thanhtuyen662002/Medcom/pull/132#issuecomment-6097976637) and the [main/deployment checkpoint of PR 134](https://github.com/thanhtuyen662002/Medcom/pull/134#issuecomment-6099096715). Use `/api/erp/{module}/*` for current CUD/workflow/QR. The older purchase command and inbound draft facades retain unavailable default providers; their availability flags do not govern the new API. See [write runtime setup](../../docs/backend/ERP_WRITE_RUNTIME_SETUP_20261010.md) for operator configuration.

The compiled backend serves `/api/contracts/openapi.json` and exports the same contract with `dotnet Medcom.Api.dll --print-api-contract`, without starting the host or loading private settings. [medcom-openapi.json](../../docs/backend/medcom-openapi.json) is the machine-readable contract. Current compatible document reads contain 118 source fields across three header/line modules, while the combined nineteen-screen catalog contains 1,516 section fields with overlapping purchase-request definitions. Both original and v2 reads retain full fields and pagination; v2 lists additionally offer fixed filter/sort semantics. Use the module-specific DTOs and preserve nullable keys.

Notifications use the current native user's `SY_User.UserName` as recipient authority. Four notification routes return all 22 columns, resolve nine permitted form targets and mark read/unread using the native SQL procedure. BFF adoption remains the separately owned FE's responsibility. The readiness route still returns 503 for the business release gate; use per-document actions and actual command outcomes for FE operation availability.

Full backend scope, real owner business acceptance, reports, additional imports and other tracked UNKNOWNs remain open under goal #45. No production acceptance is inferred from route counts, source tests or the existing write profile. Historical foundation checkpoints below describe their own earlier state.

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

The local HTTP binding is for health/development inspection. Login requires HTTPS. Deployment must configure `AllowedHosts` and privately managed TLS. Cookie security defaults are HttpOnly, Secure, SameSite Strict and no sliding expiration. A signed cookie alone is insufficient: every authenticated request resolves its bounded server session and revalidates the ERP authority. Without private legacy configuration the default identity provider returns unavailable; there is no development password bypass.

## Historical foundation HTTP boundary

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
