# Login → workspace → purchasing/inbound read slice

## Exact source boundary

This slice uses the existing frontend in PR #54, baseline
`e35eb6326b80b079ab52f17a5c32ed8732ac79db`, and the published backend in PR #53,
`99781dec5f32d2e9a31cb1643ef1af005d0cdb30`:

- `src/backend/Medcom.Api/AuthEndpoints.cs`: CSRF, login, session, continue,
  logout, workspace, capability-filtered navigation and branch IDs.
- `src/backend/Medcom.Api/ApiHost.cs`: secure host-only session/antiforgery
  cookies, CSRF header, in-process sessions and HTTPS-only login.
- `src/backend/Medcom.Api/DocumentEndpoints.cs`: list/detail GET routes and
  capability/query restrictions for purchase-orders and inbound-requests.
- `src/backend/Medcom.Contracts/{Authentication,Documents}.cs`: JSON contract
  field types. Quantities remain decimal strings, not JavaScript numbers.

These sources were inspected together. No backend files, SQL, legacy password
mechanism, route allowlist, business permissions or mutation adapters change.
The ERP/DB archives were not re-extracted for this HTTP seam; this work makes no
new legacy-source or SQL-runtime claim. BE source/acceptance gates remain open.

## Executable seam verification

`tests/proxy.test.mjs` now exercises the actual `proxyErpRequest` handler used
by the Node route, including full frontend client calls through that handler
to explicitly synthetic, source-shaped backend fixtures:

- CSRF-before-login, authenticated CSRF refresh before continue/logout,
  workspace branches/navigation, both document lists/details and second pages.
- Session/CSRF cookies relayed; logout deletion relayed; subsequent reads denied.
- Branch-denied 403 and anonymous 401 remain errors; correlation IDs survive.
- Exact decimal strings survive. No fixture is imported by production code.
- Unrelated identity cookies, bearer/identity/forwarding headers are not sent to ERP;
  unrelated/Domain cookies and upstream private headers are not relayed.
- Unconfigured/invalid origin, unsupported paths/methods, cross-origin writes,
  oversized query/body and non-JSON requests fail closed.
- Redirects are rejected without replay; upstream/upload errors remain generic.
  A synthetic request cancellation reaches the upstream fetch alongside the
  20s timeout. Actual browser disconnect behavior remains a live acceptance check through IIS and Node.

The route wrapper only supplies path and the server runtime API and public origins. Login,
continue and logout do not retry. Logout now rejects redirects consistently
with the other browser API calls.

Run from `apps/medcom-sites` with the committed Node/pnpm versions:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
node scripts/test-erp.mjs
pnpm build
```

These are contract-fixture/handler tests, not actual ASP.NET antiforgery,
browser cookie enforcement, legacy password verification or SQL integration.
They do not prove deployed readiness or whole-ERP acceptance.

## Operator staging prerequisites (not performed by this patch)

1. Supply an approved, externally reachable HTTPS DNS backend origin, without
   user info, path, query or fragment. `MEDCOM_API_ORIGIN` stays empty until then;
   an empty value intentionally returns `503 backend_not_configured`.
2. Verify the chosen backend build, trusted TLS certificate and routing without
   redirects to sign-in pages. `AuthEndpoints` requires `Request.IsHttps`;
   TLS termination must not silently make the backend perceive HTTP. The
   current `ApiHost` has no forwarded-header setup; review any reverse-proxy
   configuration explicitly rather than trusting browser-supplied headers.
3. Backend operator privately verifies service identity, SQL TLS/access,
   source-compatible `Tools.dll`, tenant/company settings, and separately
   approved read-only pilot configuration. Consult the pinned BE
   `docs/backend/SERVER_CONFIGURATION.md`. Never place SQL settings, DLLs,
   passwords, session/CSRF tokens or raw ERP data in the frontend package or GitHub.
4. Arrange authorized staging accounts with known allowed/denied capabilities
   and branches and non-sensitive representative fixture data. Authentication
   still uses the real approved backend mechanism; no bypass account/provider.
5. Obtain separate approval before changing the server environment or
   deploying. Set the runtime variable server-side through private Node service
   configuration only after that approval. No browser-selectable API target or
   `NEXT_PUBLIC_` origin is needed. Browser traffic remains same-origin, so this
   design does not require broadening backend browser CORS permissions.
6. Keep a single verified backend process for the initial acceptance unless
   session continuity is explicitly designed/tested: current `LocalWebSessions`
   stores authority in-process. Restarts/replica changes are not proven seamless.

## Live acceptance record to complete privately

Record FE/BE exact deployed SHAs, test time, authorized environment, result and
sanitized support/correlation references; never capture credentials, cookie or
CSRF values, customer rows, or raw connection settings in a public artifact.

- Login succeeds with the approved account; wrong credentials fail. Confirm
  actual browser Secure/HttpOnly/Path=/ host-only cookies and CSRF rejection
  with a missing/invalid token using approved staging-only tests.
- Workspace navigation and branch list match server permissions; changing
  client parameters cannot reveal unauthorized branch/document data.
- PO and inbound first/next pages, search, empty result, details and line paging
  agree with authorized read-only SQL evidence; decimals stay exact.
- Explicit continue extends only the server-permitted idle window. Passive
  refresh does not extend it. Expired/revoked sessions clear business state.
- Logout clears/revokes the session; Back/refresh and in-flight older responses
  cannot restore business data. Repeat login/logout and interrupted navigation.
- Offline/upstream timeout/403/404/429/malformed-response states remain usable
  without success fabrication or mutation replay; retry-after/support IDs work.
- Browser/mobile keyboard/focus and shared-grid behavior receive actual visual
  acceptance; synthetic node tests are not browser evidence.

`/health/ready` in the pinned backend always emits HTTP 503 while returning its
readiness report. Inspect its documented body alongside actual authorized
login/read results; neither `/health/live` nor this status alone proves ERP
production readiness. Do not change backend readiness semantics in this patch.

## Still blocked

Approved live `MEDCOM_API_ORIGIN`, configured deployed BE/SQL/Tools runtime,
authorized staging accounts and live browser/SQL acceptance evidence remain
UNKNOWN. This patch does not merge or deploy either PR, enable transfers,
modify SQL or establish production acceptance. Exact-head remote CI must be
verified after the root publisher updates the PR; earlier green runs do not
validate a newer commit.
