# Backend foundation

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

Explicit `Legacy` server configuration can enable canonical SQL identity reads and two conservative typed read-only pilots. Defaults stay unavailable, no synthetic identity is registered in product code, and all write/effect/export endpoints remain absent. Current grants/branches and credentials are revalidated and fenced. A bounded cached dependency monitor does not close the business release gate.

37 source-free backend tests and two separate private source/SQL/DLL/browser runtime tests were observed. Run general CI with `--filter 'Category!=LegacyRuntime'`; full fixture setup and limits are in `tools/legacy/README.md`. Source identities, actual evidence and production gaps are in `docs/erp/OWNER_SOURCE_RECOVERY_20261002.md` and `docs/deployment/SERVER_DEPLOYMENT.md`.
