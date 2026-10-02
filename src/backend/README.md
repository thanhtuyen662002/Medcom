# Backend foundation

The first runnable source-free .NET 10 backend contains API, Application, Contracts and Infrastructure projects. Business adapters, legacy authentication and database access remain disabled pending their own evidence and acceptance.

## Local run

Install the SDK selected by `global.json`, then run from the repository root:

```bash
dotnet restore Medcom.slnx --locked-mode
dotnet build Medcom.slnx --configuration Release --no-restore
dotnet test Medcom.slnx --configuration Release --no-build
dotnet run --project src/backend/Medcom.Api --no-launch-profile -- --urls http://127.0.0.1:5100
```

The local HTTP binding is for development. Production must run behind an authorized HTTPS endpoint and configure `AllowedHosts` for the actual deployment. The host does not expose login or mutation endpoints. Cookie security defaults are HttpOnly, Secure, SameSite Strict and no sliding expiration. Every principal is rejected until an authoritative session store is implemented; a signed cookie alone is insufficient authority.

## HTTP boundary

| Route | Current behavior |
| --- | --- |
| `GET /health/live` | 200 while the process serves requests; no database/readiness claim. |
| `GET /health/ready` | 503 with process healthy, database and legacy adapter not configured. |
| `GET /api/platform/metadata` | 401 until real session authority is implemented; no login redirect. |

All requests receive a fresh server-issued `X-Correlation-ID`, `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Denials and unhandled failures return safe ProblemDetails. Client correlation, identity and tenant headers never create authority. Exception details and payloads are excluded from the application failure log.

API tests start actual Kestrel listeners on ephemeral loopback ports. They check health/readiness separation, spoofed identity denial, cookie/session fail-closed behavior, safe errors and correlation. Test-only routes are registered exclusively by the test assembly.

`tools/backend/check_architecture.py` validates boundary direction and prohibits legacy/SQL assembly coupling. `tools/backend/run_preparation_checks.py` runs the separately labelled reference models and metadata validators. Passing reference checks does not complete source/runtime/business nodes. CI fetches full history because source pins validate immutable Git objects.

A sandboxed local MSBuild invocation may require `-m:1 -nr:false` and `dotnet restore --disable-parallel`; these serialize local work without skipping restore, analyzers or tests. Hosted CI uses the normal commands.
