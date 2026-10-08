# Railway backend + Vercel frontend staging

## Status and boundaries

This is a build/startup candidate for online foundation testing. It does not
activate ERP authentication, SQL access, business commands or production release.
The image contains public .NET source outputs and the separately published
password-worker program. It contains no private `Tools.dll`, SQL dump, connection
string, credentials or private server configuration.

Expected default behavior:

- `GET /health/live`: **200**, process is running.
- `GET /health/ready`: **503**, `not_ready`. This is intentional and must remain so.
- Anonymous `GET /api/workspace`: **401**.
- Legacy integration and read-only pilots remain disabled; command services remain
  unavailable under the existing application gates.

Authenticated ERP login is **blocked** on this staging topology until reviewed
trusted-proxy handling and separately authorized private DLL/SQL provisioning and
runtime acceptance are complete. A Railway green deployment is startup evidence
only. It is not readiness, authentication, SQL or business acceptance.

## Why the previous Railpack build failed

The selected service root `src/backend` contains multiple project directories,
not a root `.csproj`. Railpack v0.40.1 detects a root project and issues root
`dotnet restore`/`publish` commands. Forcing its .NET provider does not supply the
missing nested project selection. The backend also needs repository-level
`global.json`, `Directory.Build.props`, `Directory.Build.targets` and the
case-sensitive `NuGet.config`.

Use the repository root Dockerfile and repository root context. It explicitly
restores with lockfiles and publishes both:

- `src/backend/Medcom.Api/Medcom.Api.csproj`
- `src/backend/Medcom.LegacyPasswordWorker/Medcom.LegacyPasswordWorker.csproj`

The worker is not an API project reference. Its separate output is copied to
`/app/password-worker`, where the existing adapter expects it. Publishing only the
API would not include the worker.

Sources: [Railpack .NET provider](https://railpack.com/languages/dotnet/),
[v0.40.1 implementation](https://github.com/railwayapp/railpack/blob/v0.40.1/core/providers/dotnet/dotnet.go),
[`ApiHost.cs`](../../src/backend/Medcom.Api/ApiHost.cs) and
[existing packager](../../tools/deploy/package.py).

## Build contract

The SDK is `mcr.microsoft.com/dotnet/sdk:10.0.401-noble`, matching `global.json`;
the runtime is `mcr.microsoft.com/dotnet/aspnet:10.0.12-noble`. These are explicit
version tags, not immutable image digests. Revalidate updated tags together with
the SDK/runtime and the exact-head CI before changing them.

The multi-stage image runs as Microsoft's non-root `APP_UID`. It starts the API
with `exec` and a quoted `http://0.0.0.0:${PORT:-8080}` URL. Railway's runtime
`PORT` takes precedence; local fallback is 8080. No custom start command is needed.

`.dockerignore` excludes everything by default. It admits only the required root
build files, backend `.cs`/`.csproj` files, package lockfiles and the exact public
API `appsettings.json`. New backend classes and nested directories are naturally
included. Trailing exclusions remove `bin`, `obj`, environment/private settings,
secrets, credentials, binaries, archives, SQL dumps and key material. Files with
private/secret/credential names remain excluded even if their extension is source.
Keep those rules last. Review source contents for secrets as usual; a filename
filter cannot prove that arbitrary source text is safe.

The Dockerfile never copies the entire repository. It copies only root build
inputs and the filtered backend subtree. It has no secret build arguments, login,
registry push or deployment step. `Tools.dll` must never enter this context or an
image layer. The private ERP archives are not needed for this foundation build.

## Railway settings for a separately authorized staging deployment

Apply these only to the intended backend staging service after the candidate is
integrated and its exact-head container validation passes:

1. Source: the reviewed Medcom repository revision. Root Directory: `/`, not
   `src/backend` or `src/backend/Medcom.Api`.
2. Use the root `Dockerfile` (capital D). Railway should log that it detected the
   Dockerfile. Clear incompatible build/start overrides from the previous Railpack
   attempt; keep Start Command unset so the image entrypoint runs. No custom
   Dockerfile-path variable is needed for the root filename.
3. Keep one replica. `LocalWebSessions` stores authority in this process. Restarts
   invalidate sessions; horizontal scaling is not supported by this candidate.
4. Use Railway's supplied `PORT`. If an explicit domain target port is configured,
   it must match the actual service port. Do not replace the entrypoint with an
   unquoted command or bind to loopback.
5. Set `AllowedHosts` to the exact generated Railway backend hostname followed by
   `;healthcheck.railway.app`, without schemes, paths, ports or wildcards. Replace
   the hostname with the actual verified value, not a placeholder. For example,
   the value shape is `<actual-backend-hostname>;healthcheck.railway.app`.
6. Keep `Legacy__Enabled=false` and `Legacy__EnableReadOnlyPilots=false`. Do not add
   database credentials, a private configuration path, worker/DLL overrides or
   command-enabling flags during this foundation check.
7. Configure startup healthcheck path `/health/live`. `/health/ready` remains 503
   and must not be rewritten to pass a platform startup check.

Railway discovers a root Dockerfile and uses its supplied `PORT` for service
healthchecks; the healthcheck host must be allowed explicitly. Its deployment
healthcheck is not continuous application monitoring.
Sources: [Railway Dockerfiles](https://docs.railway.com/builds/dockerfiles) and
[Railway healthchecks](https://docs.railway.com/deployments/healthchecks).

No Railway account, service, domain, variables or deployment is changed by adding
these files. Keep any paid capacity, account permissions and target changes under
the owner's specific authorization.

## Vercel handoff

The separate frontend lives at `apps/medcom-sites`. Keep its existing same-origin
server proxy. For the intended Vercel environment, configure these **server-only**
variables using the actual verified origins:

```text
MEDCOM_API_ORIGIN=https://<actual-backend-hostname>
MEDCOM_PUBLIC_ORIGIN=https://<exact-frontend-hostname>
```

Use origins only: no `/api` suffix, other path, credentials, query or fragment.
Do not add `NEXT_PUBLIC_` variants. Leave `MEDCOM_LOCAL_HTTPS` unset. Set the exact
frontend origin for each intended environment; changing to a different Vercel
preview hostname requires the matching configured origin. No CORS wildcard or
browser-direct backend access is required. SQL details and private ERP files
belong only in a separately reviewed backend provisioning plan.

These variables connect the existing proxy after authorized deployment; they do
not make ERP login usable yet. The current backend checks `Request.IsHttps`,
requires secure cookies and retains CSRF validation. Railway TLS termination
leaves an HTTP hop to this container, and `ApiHost` currently has no forwarded-
header middleware. Do **not** set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`, trust
arbitrary forwarded headers, disable HTTPS/secure cookies or bypass CSRF to make
login appear successful.

A separate change must establish the actual trusted proxy/network boundary,
configure validated forwarding before authentication/CSRF, and test spoofed
headers and the real TLS path. The Microsoft cloud environment flag does not
restrict forwarding to configured known proxies. The target trust configuration
is **UNKNOWN** until verified; do not invent Railway proxy addresses.

Sources: [`AuthEndpoints.cs`](../../src/backend/Medcom.Api/AuthEndpoints.cs),
[`ApiHost.cs`](../../src/backend/Medcom.Api/ApiHost.cs),
[frontend proxy](../../apps/medcom-sites/lib/erp/proxy.ts),
[frontend route](../../apps/medcom-sites/app/api/erp/%5B...path%5D/route.ts) and
[Microsoft trusted-proxy guidance](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0).

## Validation and evidence

From the repository root, with Python and the existing pinned CI dependency:

```sh
python -m pip install -r .github/requirements-ci.txt
python -m unittest discover -s tests/deploy -p 'test_*.py' -v
```

This runs source/entrypoint/workflow checks; the three Docker tests report
**skipped** without `MEDCOM_CONTAINER_IMAGE`. A source-only pass must not be
reported as an image build or running-service pass.

With Docker and BuildKit available (the wildcard context allowlist is validated
with BuildKit, not the legacy Docker builder):

```sh
export DOCKER_BUILDKIT=1
docker build --pull --tag medcom-railway:test .
MEDCOM_CONTAINER_IMAGE=medcom-railway:test \
  python -m unittest discover -s tests/deploy -p 'test_*.py' -v
```

`.github/workflows/railway-container.yml` runs the same steps on a hosted Linux
runner, with read-only repository permissions and no secrets or deployments. It
adds a validation job without modifying existing required-check/ruleset policy.
The root integrator must inspect this new job on the exact candidate head in
addition to all existing required checks before integrating this change.

The opt-in suite tests the actual Docker context with synthetic accepted and
rejected files. Runtime containers have `--network none`, no supplied credentials
or mounts, and no private DLL. It checks fallback/custom ports, live 200, ready
503, unauthorized workspace 401, unknown host rejection, non-root UID, `dotnet`
as PID 1 and worker output presence. It does not execute the password worker or
contact SQL. Temporary smoke containers/images are cleaned up.

After an authorized Railway deployment, record the exact source SHA and image/
deployment identity, verify `/health/live` 200 and `/health/ready` 503 over the
real HTTPS hostname, and record the actual Vercel origin separately. Those target
checks are **not performed** by local or hosted Docker tests. ERP authentication,
trusted proxy behavior, private DLL/SQL connectivity, business operations,
rollback and production acceptance remain separate open gates.
