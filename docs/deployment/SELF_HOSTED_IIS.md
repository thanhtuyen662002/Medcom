# Separate frontend and API on an existing IIS host

Status: **preparation only; production and target-host acceptance remain open**.
I04 (`docs/execution/direct-runs/I04.json`) authorizes source/package/CI preparation,
not installation, DNS changes, service registration, deployment or real SQL access.
These examples contain placeholders and are not an unattended setup procedure.
The reported five existing IIS sites on ports 80/443 must retain their bindings,
application pools, certificates, roots and current behavior. The operator report relayed during I04 confirms `RewriteModule` and
`ApplicationRequestRouting` are installed; Hosting Bundle/ANCM remains absent.
Installed modules do not establish proxy activation or effective configuration.
Exact binding inventory and target acceptance remain **UNKNOWN/unverified here**;
retain the sanitized observation in the I04 execution checkpoint.

## 1. Chosen topology and boundaries

- Browser → dedicated frontend DNS HTTPS IIS site → ARR/URL Rewrite → Node 24
  Next standalone service listening only on `127.0.0.1:<chosen-unused-port>`.
- Node BFF → `MEDCOM_API_ORIGIN=https://<api-dns-name>` → dedicated API HTTPS
  IIS site and separate application pool → ASP.NET Core Module V2 **in-process**.
- The API candidate's generated `web.config` already selects `inprocess`; retain
  its handler and `aspNetCore` entries. Do not switch to a second HTTP Kestrel
  listener or pretend IIS in-process is equivalent to the historical Kestrel host.
- Only the frontend is the browser origin. Do not add CORS or expose an arbitrary
  destination proxy. Browser calls remain same-origin through the bounded BFF.

The BFF-to-API connection must be real TLS, including for co-located services.
Operator-approved private DNS or hosts mapping may resolve the API DNS name to
loopback. The URI remains its DNS name, IIS SNI selects the correct dedicated
binding, and the certificate must contain that name in SAN and chain to a CA
trusted by the actual Node service identity. Never use an IP URI, a Host header
hack, `NODE_TLS_REJECT_UNAUTHORIZED=0`, or any certificate/hostname bypass.
For an approved private CA, `NODE_EXTRA_CA_CERTS` can reference a protected PEM
CA chain outside releases; validate trust with the actual Node process, not only
PowerShell or a browser, since trust-store behavior can differ.

`MEDCOM_PUBLIC_ORIGIN` is the exact canonical frontend HTTPS origin, with no path,
query, fragment, credentials or trailing slash. It is a runtime server setting.
POST origin checks use this configured public origin even though ARR's internal
request URL is HTTP loopback. Do not set it to the Node listener URL, derive it
from arbitrary forwarded headers, or treat `MEDCOM_API_ORIGIN` as the public origin.
See [runtime setting placeholders](iis/frontend-environment.example).

## 2. Operator admission before any host mutation

1. Inventory existing sites/pools/bindings (including wildcard/catch-all bindings),
   certificate thumbprints and expiry, TLS/SNI, Windows/.NET/Node versions,
   identities, firewall, installed modules, inherited configuration and locks.
   Keep the detailed host inventory private. Capture pre-change smoke results for
   all five sites and a restorable IIS configuration backup.
2. Select two unused DNS names, two dedicated site/pool names and an unused Node
   loopback port. Confirm 443 host/SNI bindings do not shadow existing sites; do
   not repurpose a current site, default site, app pool or port-80 binding.
3. Verify .NET 10 Hosting Bundle/ANCM V2 and matching x64 .NET/ASP.NET runtimes for
   API and password worker. An SDK or `dotnet --list-runtimes` alone does not prove
   the IIS module is installed. Microsoft documents installation/repair and
   service restart requirements: [Hosting Bundle](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/iis/hosting-bundle?view=aspnetcore-10.0).
   If installation or repair is needed, obtain a separate operator-approved
   maintenance window and impact plan for all existing sites. This guide supplies
   no install command and must not be used to run a global IIS reset.
4. Verify URL Rewrite 2 and ARR, proxy enablement, effective cache behavior and
   allowed server variables. ARR proxy enablement and related settings can be
   server-wide; enabling them requires explicit shared-host impact review and
   approval. Do not silently unlock sections or change global proxy settings to
   make the example load. See Microsoft's [ARR walkthrough](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing).
5. Select and approve a Windows service wrapper for Node from a trusted official
   source, its version/hash, least-privilege service identity, environment storage,
   startup/restart policy, logs, working directory and precise stop/start controls.
   Wrapper selection and installation remain **operator-gated**. Running Node in
   an interactive terminal is not evidence of reboot/service recovery. No wrapper
   installer or service-registration command is provided here.
6. Approve DNS/certificates/trust/firewall changes separately. Keep Node loopback
   inaccessible remotely. Do not put a load balancer in front of these examples
   without another reviewed trust/forwarding design.

## 3. Separate immutable releases and private state

Keep the source checkout, API releases, Node releases and frontend IIS proxy root
separate. Example *logical* layout (operator chooses actual absolute paths):

- API releases: `<API_RELEASE_ROOT>/<revision>-<hash>/`.
- Frontend releases: `<FE_RELEASE_ROOT>/<revision>-<hash>/` containing the verified
  standalone output. Service working directory and `server.js` resolve here.
- Frontend IIS root: `<PROXY_ROOT>/` containing only the reviewed site `web.config`,
  never `.next`, server bundles, source, environment files or API binaries.
- Private backend configuration and its existing selector, owner DLL, Data
  Protection keys, CA trust material, certificates, service environment and logs:
  separately ACL-protected paths outside all checkouts, releases and served roots.

Use separate least-privilege identities. API identity needs only required private
configuration/DLL/key access; Node does not need ERP SQL settings or the DLL.
Read [backend private configuration](../backend/SERVER_CONFIGURATION.md) and the
[backend update workflow](WINDOWS_UPDATE_WORKFLOW.md). Persist/encrypt Data Protection
keys under the intended identity and verify it on the real host before admitting
sessions. This document does not implement or certify that host-specific setup.
Application restarts revoke in-memory sessions even when keys persist. Do not
introduce multiple API replicas without a separately reviewed session-store design.

## 4. Site-level review checklist

For the API: use its dedicated application pool with the reviewed x64, No Managed
Code configuration; isolate it from every other application. Preserve the generated
ANCM handler. Merge [the fragment](iis/api-request-filter.fragment.xml) into the
existing `system.webServer` (possibly inside its generated `location` element),
without duplicate sections. Set the existing private `AllowedHosts` setting to
the exact API DNS hostname, not `*`, and verify rejection of an unexpected Host.

The fragment imposes a 1,048,576-byte IIS request filter matching the source API's
Kestrel limit (`src/backend/Medcom.Api/ApiHost.cs`). Kestrel-only settings do not
protect ANCM in-process hosting. IIS filtering can reject oversize requests before
the app, with an IIS-specific status/body; do not require a JSON API error for
that boundary. Microsoft documents this distinction in [in-process hosting](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/iis/in-process-hosting?view=aspnetcore-10.0).

For the frontend: review [the proxy template](iis/frontend.web.config.example),
replace all placeholders, regex-escape the exact DNS name and use only the
chosen loopback port. Reject unknown Host and non-HTTPS traffic before proxying.
No new port-80 redirect binding is assumed. The template passes all routes to
Next; it is not a static export or SPA fallback. Preserve query strings.

Allow the template's five server variables only through approved IIS configuration:
`HTTP_X_FORWARDED_FOR`, `HTTP_X_FORWARDED_HOST`, `HTTP_X_FORWARDED_PROTO`,
`HTTP_X_FORWARDED_PORT`, `HTTP_FORWARDED`. Replace client-supplied values, and strip
`Forwarded`; never append an untrusted chain. Verify the effective request after
ARR processing (ARR may append its own client-IP entry). Neither BFF origin
validation nor API authentication may trust an arbitrary incoming forwarded host.
Microsoft explains the required [allowed-variable list](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/setting-http-request-headers-and-iis-server-variables).

Both examples use `httpErrors existingResponse="PassThrough"` to retain upstream
401/403/409/429/503 bodies/statuses. Keep detailed IIS errors private. See
[HTTP error configuration](https://learn.microsoft.com/en-us/iis/configuration/system.webserver/httperrors/).
Disable output/kernel caching at these dedicated sites, and separately verify no
ARR disk cache, inherited cache rule or intermediary caches API/auth responses.
Site `caching` alone does not prove ARR caching is disabled. Never cache cookies,
CSRF responses, authenticated data or error bodies; retain application no-store
headers. Do not change caching for the existing five sites without approval.

## 5. Build, verify and provenance

The new `.github/workflows/medcom-selfhost.yml` runs separately from existing
backend/policy checks. Both Windows and Linux use Node 24 and pnpm 11.25.0,
frozen lockfile install, typecheck, lint, ERP and packaging tests, production build,
package verification and packaged-process smoke. Synthetic/source-free CI does
not read private configuration, load the owner DLL or contact real ERP SQL.

From the clean, reviewed repository checkout (Node 24 and pnpm 11.25.0), build
and validate the frontend independently:

```powershell
cd apps/medcom-sites
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
node scripts/test-erp.mjs
node --test tests/standalone-package.test.mjs
pnpm build
$env:SOURCE_REVISION = (git rev-parse HEAD).Trim()
node scripts/package-standalone.mjs
cd ../..
node apps/medcom-sites/scripts/verify-standalone.mjs artifacts/medcom-frontend-win32-x64 $env:SOURCE_REVISION
node apps/medcom-sites/scripts/smoke-standalone.mjs artifacts/medcom-frontend-win32-x64 $env:SOURCE_REVISION
```

Stop on any failed command. The packager refuses an existing destination; use a
fresh isolated build workspace instead of overwriting an earlier candidate.
The output is a directory, not the backend ZIP. On Linux x64 its name is
`artifacts/medcom-frontend-linux-x64`. The manifest records source revision,
platform, architecture and per-file hashes; these are unsigned integrity metadata,
not proof of trusted publication. Use the matching verifier from trusted
reviewed source. Obtain expected artifact hashes and revision from the trusted
CI run, not from an unverified file bundled with an arbitrary archive. Keep the
Windows-produced artifact for the Windows target; do not assume native dependency
compatibility of a Linux-produced archive. FE and backend remain separate candidates.

PR provenance is emitted only after successful checks using the existing tested
receipt checker, which verifies the tested merge's exact source and base parents
and clean tracked source. Matrix receipt artifacts are uniquely named and remain
separate from backend receipts. For push/manual runs, the checkout SHA is logged;
a manual run is not a substitute for exact-head/base PR checks or independent
review. Recheck live PR head/base, all required checks and artifact origin before
integration. No workflow deploys a server or changes branch protection.

## 6. Controlled staging, rollback and actual acceptance

After separate operator deployment approval:

1. Verify both selected candidates/hashes/revisions. Extract into new empty,
   unlinked release directories; never overlay a live release or copy private
   state into it. Record previous IIS paths, service executable/working directory,
   nonsecret configuration identity and release hashes privately.
2. Apply reviewed site-only configuration. Stop only the identified Medcom Node
   service and/or dedicated API pool being switched; confirm stop before changing
   paths. Never kill all Node/dotnet processes or reset the shared IIS host.
3. Start only those components. Verify Node binds loopback only, API receives
   HTTPS under its DNS name, and the actual Node identity accepts its certificate.
   Check frontend HTML and `_next/static` assets over the public HTTPS hostname.
4. In an authorized staging fixture, test CSRF fetch, valid/invalid login, cookie
   Secure/HttpOnly/Path=/ and no Domain on `__Host-` cookies, session, continue and
   logout/replay. Check permitted read-only pilot flow without inventing business
   acceptance. Wrong/missing public Origin, hostile Host/forwarded headers,
   unapproved upstream destinations and oversize bodies must fail closed. Inspect
   cache headers and preservation of error statuses through IIS/ARR.
5. `/health/live` is process health. `/health/ready` stays 503 while business/runtime
   release acceptance is blocked; never relabel it healthy or bypass the gate.
   Verify CA/SAN failure fails closed, and service reboot/recovery behavior within
   the approved window. Real host, SQL/DLL, business, restore and performance
   acceptance remain separate evidence requirements.
6. Repeat pre-change smoke checks for all five existing sites. If Medcom fails or
   any existing site regresses, stop only the affected new Medcom component,
   restore its recorded previous release/path and approved configuration, restart
   it and verify recovery. Shared-setting rollback belongs to the separately
   approved maintenance plan; do not experiment on existing sites.
7. Keep prior releases until operator-approved retention/removal. Rollback never
   undoes SQL writes or external effects. This procedure performs no schema/data
   migration and grants no production admission.

Target Windows/IIS execution, actual binding/module inventory, wrapper choice,
certificate trust, protected key persistence, all five-site non-regression and
production readiness are **not established by this source preparation**.
