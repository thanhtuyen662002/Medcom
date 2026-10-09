# Backend integration handoff — 10 October 2026 (Asia/Saigon)

Backend origin: **https://medcom-production.up.railway.app**. FE uses this server-only origin through its same-origin BFF. No FE source or configuration was changed by I68.

I69 / PR #125 adds typed date/status filtering, fixed server sorting and a scoped query-metadata endpoint for the three v2 lists. The current executable artifact has 34 operations / 99 schemas; the I68 counts below describe that historical delivery. See [document query integration](DOCUMENT_QUERY_INTEGRATION_20261010.md) for exact parameters, semantics, FE adoption and acceptance limits. I69 publication/integration evidence is recorded separately; this paragraph does not assert deployed adoption.

I67 / PR #122 is merged at `b9a5c61b3f9e819f8a28442d48e5e21566cb5c9a`. Railway deployment `db529fb9-dbdf-4064-93e7-ae2ed2bda189` reached SUCCESS at `2026-10-09T17:18:33.308Z` (10 October local time). This verifies deployment, not full ERP business acceptance.

## Contracts

- `GET /api/contracts/openapi.json`: public cached technical contract. No identity/SQL resolution, even with a session cookie; no settings, credentials or business rows. Existing no-store/security headers remain.
- [medcom-openapi.json](medcom-openapi.json): OpenAPI 3.1.1 with **33 actual method/path pairs and 98 schemas**, cookie/CSRF security, bounds, DTO nullability, original/v2 projections, numeric purchase outcomes, string inbound outcomes and admission limits. Tests reconcile every route against the actual host and compare the artifact with the compiled backend.
- [document-field-contract.json](document-field-contract.json): all 116 source columns, SQL types, nullability and list/detail JSON paths. Authenticated `/api/documents/field-contract?kind=...` requires that module's read capability.
- [FULL_DOCUMENT_FIELDS_20261009.md](FULL_DOCUMENT_FIELDS_20261009.md): six v2 reads. Source nulls remain explicit, decimals are strings and full SQL datetimes retain milliseconds without an inferred timezone.

Export the same contract without starting the host or reading private configuration:

```sh
dotnet Medcom.Api.dll --print-api-contract
```

The switch must be the only argument; otherwise exit 64 before configuration loading. Business validators remain authoritative beyond schema validation, including state/line equality, decimal representability and live authority.

## FE sequence

1. Configure server-only `MEDCOM_API_ORIGIN=https://medcom-production.up.railway.app` and FE's validated HTTPS `MEDCOM_PUBLIC_ORIGIN`. Retain the same-origin BFF, cookies, no-store and redirect rejection.
2. FE/BFF owner explicitly admits the six GET `/api/v2/...` paths, `/api/documents/field-contract` and optionally `/api/contracts/openapi.json`. Existing strict schemas and allowlists do not automatically adopt them. Example: `/api/erp/api/v2/documents/purchase-orders`.
3. Get `/api/auth/csrf`, keep its secure cookie and send `X-CSRF-TOKEN` with login. Keep the session cookie; `/api/auth/session` and `/api/workspace` establish capability/branch scope.
4. Parse the v2 schema. Lists contain complete headers; details contain complete fields of the returned line page. Follow `hasMore`; purchase aggregate overflow is unavailable, never silently truncated.
5. Keep scope headers and purchase `{scopeKey,data}`. Invalidate stale state on identity/authority/branch/scope change. Preserve original command DTO/idempotency keys across uncertainty; Pending/Absent/Unavailable/OutcomeUnknown never authorize redispatch.
6. Toolbar availability follows fresh validated `commandAccess`/`access` and available provider behavior. No business command is admitted by this deployment. Inbound GET needs a validated Origin or `Sec-Fetch-Site: same-origin`; POST needs Origin, CSRF and the current scope header.

## Delivery matrix

| Capability | HTTP implementation | Acceptance / availability |
| --- | --- | --- |
| Login/session/workspace | Existing secure APIs | CSRF observed 200; unauthenticated session 401. I68 real authenticated acceptance NOT_RUN. |
| Purchase orders | Compatible reads + complete v2, 19 header / 12 line fields | Typed SQL and synthetic HTTPS verified; actual authenticated target read NOT_RUN. |
| Inbound requests | Compatible reads + complete v2, 37 / 25 fields | Same read limits; separate from disabled draft command facade. |
| Purchase requests | Compatible reads + complete v2, 14 / 9 fields | Same read limits; aggregate/token/receipt unchanged. |
| Lookups | Branches; qualified purpose/currency bindings | Each live binding/authority/scope still checked. Items/objects remain unqualified. |
| Purchase Save/Submit/original lookup | Existing typed boundaries and complete wire schemas | Default access/command providers unavailable; real transaction/journal/audit acceptance required. Add rejected. |
| Inbound Save/Send/reconcile | Existing typed boundaries and route-specific schemas | Default providers unavailable; HTTP 200 with Unavailable is closed. Costs/Create unadmitted. |
| Create/master Delete | No registered endpoint | Source-compatible allocation/delete qualification and implementation required. |
| Transfer/PM return | Source action catalog and bounded core/adapter work | No delivered HTTP route; concrete gateway and remaining typed actions incomplete. |
| Reports/export/other ERP modules | Full ERP API surface incomplete | Still required under #45; no silent exclusion. |

I67 deployment readiness was 503: process, database and legacy adapter healthy; business_release unavailable. First liveness during rollout returned edge 502; subsequent dependency/CSRF/protected responses came from the service. Fresh settled smoke follows I68 deployment. These observations do not prove target persisted-field compatibility or command effects. Railway OAuth withholds variable values: read-only pilot flag UNKNOWN in this inspection. No private setting was recreated or changed.

## Safe HTTPS verifier

```sh
python tools/deploy/verify_backend_api.py --origin https://medcom-production.up.railway.app
```

Without credentials: liveness/public contract checked; authenticated reads explicitly NOT_RUN. To verify real permitted reads, supply `MEDCOM_TEST_USERNAME` and `MEDCOM_TEST_PASSWORD` privately in the operator environment, never command arguments/Git/public receipts. Ordinary TLS is mandatory; redirects rejected. At most one header and one bounded detail page per permitted module; every field/type/null/decimal/date checked. The verifier retires its own session. Empty authorized results are explicit and do not prove non-empty row compatibility.

Reports contain technical counts/statuses only, never usernames, passwords, cookies, scope tokens, document identifiers or field values. Only login/logout POSTs are allowed; no business command mode. Passing reads do not assert ERP release acceptance.

## Open acceptance

**Complete ERP backend is not finished.** #45 still requires finite requested module/action/report scope, remaining source-compatible implementation, actual authorized transaction/concurrency/idempotency/audit/recovery acceptance, Windows/IIS operations and production recovery evidence. `PurchaseRequestCommandFactory` / `InboundDraftCommandFactory` require observed target-specific acceptance; settings, constructors and synthetic tests cannot manufacture it. I68 changes no command composition, SQL schema or writer switch. Evidence: `ApiHost.cs`, both command registrations/factories and `docs/erp/TRANSFER_COMMAND_CONTRACT_20261003.md`.

Local source hashes/tests: [I68_VALIDATION_20261010.json](../execution/I68_VALIDATION_20261010.json). Final hosted CI/deployment receipts live on PR #123; admission-only checks are distinct. This file does not predeclare later results green.

OpenAPI reference: https://spec.openapis.org/oas/v3.1.1.html. Generated document passed the official 3.1 meta-schema and all 98 JSON Schema structural checks locally.
