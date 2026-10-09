# Medcom self-hosted frontend — backend integration handoff

## Current source reconciliation — 9 October 2026

The owner supplied a new backend handover while requesting the Apple-style frontend refresh. [The current HTTP boundary](../../../docs/backend/CURRENT_HTTP_BOUNDARY_20261009.md) records all 25 registered method/path pairs at backend baseline `ce95e1750b3df8ef46a4682f5f78f94450bf2829`, including purchase Save/Submit/original-intent lookup and the default-unavailable inbound draft facade. The current BFF allows these reviewed paths. Command POST payloads have a 1 MiB bound; other POST payloads retain 16 KiB. This supersedes the earlier route/body-bound inventory below.

According to the handover, login and authorized reads work on Railway; this source review does not independently accept real ERP/SQL writes. Keep `writeAvailable`, `commandAccess`, CSRF, current scopes and exact original-intent/receipt semantics. No Create/Delete, transfer, report/export or QR business command is enabled by the visual refresh. The previous purchase pilot activation was cancelled and is not renewed by the FE/BE continuation request.

The following 4 October checkpoint is retained for provenance. Its statements about unavailable live access and the smaller route inventory describe that earlier checkpoint, not the current deployment or source.

## Historical checkpoint — 4 October 2026

Owner direction (2026-10-04): frontend and backend run on the owner-operated server. The redesigned frontend is preserved; historical src/frontend is not substituted. Existing scheduled jobs stay paused. The filename is retained for provenance, not Sites deployment.

## Observed baseline

Endpoint and DTO sources inspected from PR #52 stack, head 73f5d4200cfb53580f6df5175ad6f3662a043e38. Main was f9197185b624a8c3f74c99e48a69550b5a7c2a73 at intake. Source compatibility is not proof of deployment, SQL connectivity, or production acceptance.

Sources: src/frontend/lib/{contracts,api}.ts; src/backend/Medcom.Api/{ApiHost,AuthEndpoints,DocumentEndpoints}.cs; inventories/source/20261002/pilot-menu-bindings.json; docs/web/PRODUCT_UX_FOUNDATION.md. Display labels are frontend labels. The eight transfer stages retain separate source form IDs, not an inferred approval dependency graph. AR_InvoiceRequestFrm is disabled in the observed source.

## Hosting and connection

Native Next Node standalone runs behind the dedicated IIS frontend reverse proxy. The .NET API runs in its own IIS in-process site/pool with true HTTPS. Configure server-only MEDCOM_API_ORIGIN as a validated HTTPS DNS origin and MEDCOM_PUBLIC_ORIGIN as the public frontend HTTPS origin. Private operator DNS resolution may direct the API name to the local IIS binding; its certificate must match and be trusted by Node. No TLS bypass, browser-configurable destination or SQL connection exists in the frontend. Keep private configuration, Tools.dll and customer data at the backend outside releases. See [the IIS deployment guide](../../../docs/deployment/SELF_HOSTED_IIS.md).

Browser calls /api/erp/<backend path> on the same frontend origin. The server forwards only allowlisted API routes, rejecting redirects. No browser-configurable target/open proxy exists. Forwarded cookies are restricted to __Host-Medcom.Session (including ASP.NET chunks) and __Host-Medcom.Csrf. ChatGPT cookies and identity headers never reach ERP. Only secure HttpOnly cookies with Path=/ and no Domain are relayed. Verify this behavior against the live production backend during acceptance.

POST requires Origin exactly matching configured MEDCOM_PUBLIC_ORIGIN, enforces a 16 KiB streamed payload bound and relays the backend X-CSRF-TOKEN. ERP remains authoritative for identity, branches, data and actions. There is no Sites access perimeter; ERP authorization remains authoritative. No shared superuser, fake login or password bypass is added.

## Integrated routes

| Backend route | Method | UI |
|---|---|---|
| /health/ready | GET | diagnostics; supports existing 503 not_ready shape |
| /api/auth/csrf | GET | login/continue/logout prerequisite |
| /api/auth/login | POST | ERP login modal |
| /api/auth/session | GET | client helper |
| /api/auth/session/continue | POST | continue session |
| /api/auth/logout | POST | logout |
| /api/workspace | GET | session, branches, capabilities |
| /api/documents/purchase-orders | GET | list/filter/paging |
| /api/documents/purchase-orders/detail | GET | paged lines |
| /api/documents/inbound-requests | GET | list/filter/paging |
| /api/documents/inbound-requests/detail | GET | paged lines |

health/live and platform/metadata are also allowlisted known backend paths, not proof of business readiness. Returned navigation hrefs are not blindly rendered. Data access uses known capability names and backend enforcement.

## UI implementation update

See `UI_IMPLEMENTATION_HANDOFF.md` for the repository UX audit, delivered shared components, typed extension seams, integration dependencies and remaining runtime acceptance. Shared grid, semantic mobile cards/lines, 15/30-second passive refresh, expiry warning and top-center feedback now replace the earlier basic table behavior. Document/lookup/report/admin editor components are authored behind verified adapters; unpublished business/configuration endpoints remain disabled.

## UI behavior

Responsive shell; mobile fixed bottom navigation, authorized drawer and account controls; module navigation; command search (Ctrl/Cmd+K); favorites; local theme/density; URL/back-forward navigation; source-separated transfer stages; ERP login/continue/logout; branch/search/server pagination; column visibility; refresh; independently paged line details; unauthenticated, denied, unavailable, empty and no-results states. No synthetic transactions, balances, notifications, chart values or successful writes ship.

## Required backend handoff

Admin role quick navigation remains OPEN. The mobile shell now uses existing authoritative workspace navigation as a bounded interim adapter; it does not implement or claim admin publish/role persistence. See `MOBILE_NAV_BACKEND_HANDOFF.md` and the parent repository `docs/web/MOBILE_NAVIGATION_ROLE_CONFIG.md`. No localStorage role override, assumed admin permission or guessed config endpoint is enabled.


Purchase approvals, transfer commands, accounting configuration, invoice admission and reports need published API/permission/DTO contracts. No guessed mutation endpoint is enabled. Add proxy routes only after review; then add meaningful tests and UI. Reports need server catalog, parameters, jobs and output permission contracts. Read permission does not grant export permission.

Deliver OpenAPI, deployed staging URL, secure test access, capability names, command/concurrency/idempotency/receipt semantics, errors, decimal strings, dates/timezones and acceptance fixtures. Numeric status codes remain raw until an authoritative caption mapping exists.

## Acceptance still open

No deployed ERP origin or real SQL/Tools.dll host is available. Synthetic tests/build do not prove real integration. Verify live IIS frontend login/CSRF/cookies, expiry/logout, permission scopes, branch scopes, lists/details, denied-cache clearing and paging. Browser keyboard/mobile/accessibility testing still needs a supported context. Whole-ERP coverage and real-user production acceptance remain open.

## Read-slice verification update

`READ_SLICE_ACCEPTANCE.md` pins the current BE #53 contract inspection and the
login → workspace → PO/inbound acceptance checklist. The real proxy handler is
now covered by client-to-handler synthetic contract tests, including cookie and
CSRF lifecycle, denials, pagination, decimal fidelity and abort propagation.
The deployed origin and actual ASP.NET/SQL/browser acceptance remain pending;
contract fixtures are not evidence that a staging deployment exists.
