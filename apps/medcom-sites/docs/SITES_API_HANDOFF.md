# Medcom Sites frontend — backend integration handoff

Owner direction (2026-10-04 Asia/Saigon): Codex owns BE/API/SQL; ChatGPT owns Sites frontend. Existing scheduled jobs stay paused. This is an independent frontend; it does not overwrite src/frontend, backend branches, or immutable claims.

## Observed baseline

Endpoint and DTO sources inspected from PR #52 stack, head 73f5d4200cfb53580f6df5175ad6f3662a043e38. Main was f9197185b624a8c3f74c99e48a69550b5a7c2a73 at intake. Source compatibility is not proof of deployment, SQL connectivity, or production acceptance.

Sources: src/frontend/lib/{contracts,api}.ts; src/backend/Medcom.Api/{ApiHost,AuthEndpoints,DocumentEndpoints}.cs; inventories/source/20261002/pilot-menu-bindings.json; docs/web/PRODUCT_UX_FOUNDATION.md. Display labels are frontend labels. The eight transfer stages retain separate source form IDs, not an inferred approval dependency graph. AR_InvoiceRequestFrm is disabled in the observed source.

## Hosting and connection

Sites hosts a private Cloudflare Worker. .NET/SQL runs separately; Sites has no raw TCP SQL access. Set runtime MEDCOM_API_ORIGIN to an authorized, externally reachable HTTPS DNS origin without a path/query through Sites environment settings, then redeploy. Keep SQL credentials, Tools.dll, raw source and customer data at the backend. .env.example records the same local key. No backend origin has been supplied.

Browser calls /api/erp/<backend path> on the same Site. The server forwards only allowlisted API routes, rejecting redirects. No browser-configurable target/open proxy exists. Forwarded cookies are restricted to __Host-Medcom.Session (including ASP.NET chunks) and __Host-Medcom.Csrf. ChatGPT cookies and identity headers never reach ERP. Only secure HttpOnly cookies with Path=/ and no Domain are relayed. Verify this behavior against the live production backend during acceptance.

POST requires same-origin Origin, enforces a 16 KiB streamed payload bound and relays the backend X-CSRF-TOKEN. ERP remains authoritative for identity, branches, data and actions. Site access is separate from ERP authorization. No shared superuser, fake login or password bypass is added.

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

## UI behavior

Responsive shell; module navigation; command search (Ctrl/Cmd+K); favorites; local theme/density; URL/back-forward navigation; source-separated transfer stages; ERP login/continue/logout; branch/search/server pagination; column visibility; refresh; independently paged line details; unauthenticated, denied, unavailable, empty and no-results states. No synthetic transactions, balances, notifications, chart values or successful writes ship.

## Required backend handoff

Purchase approvals, transfer commands, accounting configuration, invoice admission and reports need published API/permission/DTO contracts. No guessed mutation endpoint is enabled. Add proxy routes only after review; then add meaningful tests and UI. Reports need server catalog, parameters, jobs and output permission contracts. Read permission does not grant export permission.

Deliver OpenAPI, deployed staging URL, secure test access, capability names, command/concurrency/idempotency/receipt semantics, errors, decimal strings, dates/timezones and acceptance fixtures. Numeric status codes remain raw until an authoritative caption mapping exists.

## Acceptance still open

No deployed ERP origin or real SQL/Tools.dll host is available. Synthetic tests/build do not prove real integration. Verify live Site login/CSRF/cookies, expiry/logout, permission scopes, branch scopes, lists/details, denied-cache clearing and paging. Browser keyboard/mobile/accessibility testing still needs a supported context. Whole-ERP coverage and real-user production acceptance remain open.
