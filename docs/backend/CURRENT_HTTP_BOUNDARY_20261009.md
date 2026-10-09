# Current backend HTTP boundary — 9 October 2026

This source review reconciles the owner-supplied backend handover with the frontend refresh. Backend sources were inspected at main `ce95e1750b3df8ef46a4682f5f78f94450bf2829`. The frontend refresh changes presentation, not the API or business providers. This document is a source contract, not SQL, private DLL, live write or production acceptance evidence.

## Registered routes

`src/backend/Medcom.Api/ApiHost.cs` originally mapped the 25 method/path pairs below through `AuthEndpoints.cs`, `DocumentEndpoints.cs`, `PurchaseRequestEndpoints.cs` and `InboundDraftEndpoints.cs`. I67 adds seven read-only mappings, for **32 method/path pairs**. A registered path is not a grant or an available operation.

| Method | Path | Source behavior / admission |
| --- | --- | --- |
| GET | `/health/live` | Process liveness, anonymous. |
| GET | `/health/ready` | Deliberate 503; dependency observations do not admit production. |
| GET | `/api/platform/metadata` | Current session and `platform.status` capability. |
| GET | `/api/auth/csrf` | Secure anti-CSRF cookie and request token. |
| POST | `/api/auth/login` | HTTPS, CSRF, bounded login admission; default identity unavailable. |
| GET | `/api/auth/session` | Server session inspection/revalidation. |
| POST | `/api/auth/session/continue` | Explicit activity with CSRF; passive GET is not renewal. |
| POST | `/api/auth/logout` | Retire session and clear cookie. |
| GET | `/api/workspace` | Current identity, branches, capabilities and filtered navigation. |
| GET | `/api/documents/purchase-orders` | Authorized PO list through the configured reader. |
| GET | `/api/documents/purchase-orders/detail` | Independently paged PO lines. |
| GET | `/api/documents/inbound-requests` | Authorized inbound list through the configured reader. |
| GET | `/api/documents/inbound-requests/detail` | Independently paged inbound lines; separate from draft commands. |
| GET | `/api/documents/field-contract` | Current session and module read capability; `kind` selects the static version 2 field contract. |
| GET | `/api/v2/documents/purchase-orders` | Complete 19-field source headers; same authorization and list pagination. |
| GET | `/api/v2/documents/purchase-orders/detail` | Complete source header and 12-field lines on the requested page. |
| GET | `/api/v2/documents/inbound-requests` | Complete 37-field source headers; same authorization and list pagination. |
| GET | `/api/v2/documents/inbound-requests/detail` | Complete source header and 25-field lines on the requested page. |
| GET | `/api/v2/purchase-requests` | Scoped complete 14-field source headers. |
| GET | `/api/v2/purchase-requests/detail` | Scoped complete 14-field header/9-field lines alongside the unchanged command aggregate/token/access. |
| GET | `/api/purchase-requests/workspace` | Purchase workspace; boundary forces `writeAvailable=false`. |
| GET | `/api/purchase-requests` | Purchase-request list, distinct from purchase orders. |
| GET | `/api/purchase-requests/detail` | Full purchase read and currently resolved `commandAccess`. |
| GET | `/api/purchase-requests/lookup` | Typed lookup; a registered route does not prove every kind is available. |
| POST | `/api/purchase-requests/save` | Existing Save boundary; default access/command providers unavailable. |
| POST | `/api/purchase-requests/submit` | Existing Submit boundary; default access/command providers unavailable. |
| POST | `/api/purchase-requests/save/lookup` | Observe the original Save intent; does not execute it again. |
| POST | `/api/purchase-requests/submit/lookup` | Observe the original Submit intent; does not execute it again. |
| GET | `/api/inbound-requests/draft` | Draft facade; default response is closed `Unavailable`, not document success. |
| POST | `/api/inbound-requests/draft/save` | Facade with existing auth/CSRF/scope fences; default unavailable. |
| POST | `/api/inbound-requests/draft/send-to-warehouse` | Facade; default unavailable. |
| POST | `/api/inbound-requests/draft/reconcile` | Resolve an original command's uncertainty; default unavailable. |

`ApiHost.cs` registers unavailable purchase access/command providers and `AddInboundDraftFacade()` registers unavailable inbound providers. Explicit `Legacy:Enabled` and `Legacy:EnableReadOnlyPilots` can bind identity and typed SQL reads; these settings do not bind the purchase or inbound writer. This review did not read or change private configuration.

There are no registered Create, master Delete, transfer/PM-return business, QR business, export or report endpoints in these mapping sources. Core implementations and offline tests elsewhere do not create HTTP delivery. Do not add a second Save/Submit facade or enable toolbar actions because a path or enum exists.

## Frontend integration

Use the same-origin Next BFF, `/api/erp/<backend path>`. Its allowlist, method checks, destination validation and cookie filtering are defined in `apps/medcom-sites/lib/erp/{proxy-policy,proxy}.ts`. `MEDCOM_API_ORIGIN` and `MEDCOM_PUBLIC_ORIGIN` are server-only HTTPS origins; ordinary deployments require validated DNS names and trusted certificates. The explicit paired localhost HTTPS mode belongs to the separately tested local relay. No browser SQL/DLL configuration, TLS bypass or open proxy is admitted.

The existing unversioned responses retain their wire shape for strict frontend schemas. For all source fields, adopt the six `/api/v2` reads and the [version 2 field mapping](document-field-contract.json), described in [the full field handoff](FULL_DOCUMENT_FIELDS_20261009.md). The separately owned FE/BFF must explicitly permit these new GET routes and parse their full-field extensions; its current allowlist does not automatically include them. There is no version 2 write route.

For POST, obtain `/api/auth/csrf`, retain the companion cookie and send `X-CSRF-TOKEN`. The BFF validates the browser Origin against the public FE origin; for purchase/inbound commands it sends the fixed backend Origin. ERP cookies use `__Host-`, Secure, HttpOnly, Path `/` and SameSite Strict. Current session, capability and branch checks remain authoritative. No API CORS integration is added by this refresh.

The BFF's decoded body bound is **1,048,576 bytes for the seven purchase/inbound command POST paths** and **16,384 bytes for other POST paths** (`requestBodyLimit` in `proxy-policy.ts`). Backend command boundaries also enforce their own finite bounds. An upstream transport allowance is not permission to send a larger application command.

Workspace/document reads stamp `X-Medcom-Session-Scope` and `X-Medcom-Read-Scope`; purchase reads use `{scopeKey,data}`. Purchase commands require `X-Purchase-Scope`, inbound commands require `X-Inbound-Scope`. Keep the current scope, exact DTO and original command identity across uncertainty recovery. Do not reuse old responses after a session, authority or scope boundary.

Use `writeAvailable`, `commandAccess` and validated backend outcomes. HTTP 200 can carry inbound `Unavailable`. Purchase command and lookup outcomes are distinct **numeric enums**; `PurchaseRequestLineChangeKind` is a **string enum**. Inbound outcomes are **string enums**. Exact schemas/nullability/decimal strings/receipt fields come from `Medcom.Contracts/PurchaseRequests.cs`, `Medcom.Contracts/Inbound/InboundDraftContracts.cs` and the corresponding endpoint parsers, rather than button labels. Add is rejected by the purchase HTTP boundary even though its enum includes Add.

Keep the original DTO and idempotency key for purchase receipt lookup. Pending, Absent, Unavailable and other non-Committed observations do not authorize a fresh Save/Submit intent. A validated original receipt resolves uncertainty; a status toast or a fresh display read does not prove a write committed.

## Next backend work

The handover identifies source-backed Create/Add allocation, currently unavailable item/object selectors, remaining HTTP delivery, and actual authorization/transaction/concurrency/idempotency/audit/crash acceptance as distinct gaps. Investigate each against the approved source baseline; display enrichment is not selector qualification. Do not reuse the PO numbering branch as purchase-request allocation evidence.

The prior purchase pilot activation was cancelled according to the handover. No deployment switch, permit, SQL migration, target probe or business write was applied in this refresh. Windows/IIS operator acceptance and real ERP/SQL write acceptance remain separate from the frontend CI and Railway presentation deployment.

The historical 4 October handoffs describe an earlier read-only candidate. Use this current route inventory and actual source when coordinating FE/BE. The canonical production goal remains #45; completing the interface does not close its business/runtime gates.
