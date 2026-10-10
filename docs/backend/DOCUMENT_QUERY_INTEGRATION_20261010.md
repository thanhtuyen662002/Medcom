# Document list integration — I69 / 10 October 2026

FE can filter and sort the three complete v2 lists on the backend. These are fixed Web query semantics over verified ERP columns, not new legacy workflow/state authority. No FE implementation or configuration was changed. Canonical full backend goal [#45](https://github.com/thanhtuyen662002/Medcom/issues/45) stays open.

| List | Date / ID source columns | Capability | Maximum page size |
| --- | --- | --- | --- |
| `/api/v2/documents/purchase-orders` | `dbo.AP_OrderTbl.DocumentDate / DocumentID` | `purchase-orders.read` | 100 |
| `/api/v2/documents/inbound-requests` | `dbo.IV_InboundRequestTbl.DocumentDate / DocumentID` | `inbound-requests.read` | 100 |
| `/api/v2/purchase-requests` | `dbo.AP_PurchaseRequestTbl.PurchaseDate / PurchaseRequestID` | `purchase-requests.read` | 50 |

Evidence: `inventories/source/20261002/table-02.json` (`AP_OrderTbl`, source line 11248; `IV_InboundRequestTbl`, line 11370) and `table-07.json` (`AP_PurchaseRequestTbl`, line 23221), `source-set.json`, `extraction-integrity.json`; exact field mapping in `document-field-contract.json`. I69 rehashed the owner-authorized current ERP/DB ZIPs and verified the full SQL member at 1,212,595,716 bytes, CRC32 `16a9a7e6`, SHA-256 `61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`. The historical approved `ERP_Medcom2026(4).zip` and `Medcom-Data (3)(1).zip` were not present at the local Downloads locator; they were not reopened or equated with this current technical round. Their historical identity/evidence remains in `docs/SOURCE_BASELINE.md`.

## Requests and errors

Existing `page`, `pageSize`, literal document-ID `search`, and `branchId` keep their bounds and scope rules. New v2-only parameters are optional and may occur once:

| Parameter | Contract |
| --- | --- |
| `dateFrom` | Calendar day `yyyy-MM-dd`, inclusive at midnight of the stored SQL date. |
| `dateTo` | Same format; includes the entire final day. Must be >= `dateFrom` when both exist. |
| `statusId` | One exact signed SQL int `StatusID`, including zero; it does not grant any action or imply a valid transition. |
| `sortBy` | Exactly `documentDate`, `documentId`, or `statusId`; default `documentDate`. `documentDate` maps to `PurchaseDate` for purchase requests. |
| `sortDirection` | Exactly `asc` or `desc`; default `desc`, including ID sorting. |

Dates range from `1753-01-01` through `9999-12-31`, matching the qualified source `datetime` type and [Microsoft's datetime definition](https://learn.microsoft.com/en-us/sql/t-sql/data-types/datetime-transact-sql). Dates are stored wall-clock values: no UTC/local timezone conversion is inferred. The SQL predicate uses a next-day exclusive upper bound. The maximum final day omits that upper bound without overflow; a separate bounded-date predicate still excludes null dates. Nullable purchase dates are included when both date bounds are absent. [SQL ORDER BY](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-order-by-clause-transact-sql) places nulls first ascending and last descending.

ID ordering uses binary source bytes; date/status ties use ID ascending. This deterministic order does not freeze rows across requests: offset pagination can change under concurrent ERP writers. Restart at page 1 when filters, sorting, authority or branch scope changes. Preserve all query parameters on subsequent pages; include the normalized query in the FE cache key alongside the current scope. Keep `hasMore`, the module's original envelope and all full source fields. Purchase responses remain `{scopeKey,data}`; the other two remain `DocumentPage`.

Sanitized examples:

```text
GET /api/v2/documents/purchase-orders?page=1&pageSize=50&dateFrom=2026-10-01&dateTo=2026-10-10&statusId=0&sortBy=documentDate&sortDirection=desc
GET /api/v2/documents/inbound-requests?page=1&sortBy=documentId&sortDirection=asc
GET /api/v2/purchase-requests?page=1&pageSize=20&dateTo=2026-10-10&sortBy=statusId&sortDirection=asc
```

Malformed dates, inverted ranges, duplicate/unknown fields, out-of-range integers, unknown sort fields/directions or SQL fragments return HTTP 400 before the document provider. Authentication remains 401; missing module authority or a foreign requested branch remains 403. Dependency/projection failures remain 503. A successful read has current `X-Medcom-Session-Scope` and `X-Medcom-Read-Scope`, no-store/security headers and server correlation. Filtering never bypasses credential/menu/group/current branch checks or creates write authority. Source evidence: `DocumentListBinding`, `DocumentSelectionRules`, `DocumentSelectionSql`, both real SQL readers and `DocumentSelectionTests`.

Unversioned list routes accept only their original four fields and preserve their original projection/default order. Detail routes retain their current query contract; list filters are not detail parameters. There is no caller-selected table, column, SQL, offset, action or role.

## Discoverable contract and FE handoff

`GET /api/documents/query-contract?kind=purchase-orders|inbound-requests|purchase-requests` returns the version, exact list path, source date/ID/status columns, date bounds/inclusivity, nullable-date behavior, allowed sort fields/defaults and page limits. It requires that kind's revalidated read capability and stamps current scope. It reads no database/settings/rows and never invents status choices, grants or runtime qualification. Omitted/unknown/repeated kind or other query fields return 400. API evidence: `DocumentEndpoints.cs`, `DocumentListBinding.Contract`, `DocumentQueryContract.cs`.

The executable [OpenAPI](medcom-openapi.json) now covers **34 registered operations / 99 schemas**. FE's separately owned BFF must explicitly allow the query-metadata path and new v2 parameters, adopt the schema and clear cached selections when scope changes. Existing strict FE allowlists do not adopt this automatically. No CORS relaxation or cross-origin cookie workaround is introduced; follow [the integration handoff](FE_INTEGRATION_20261010.md).

Successful document responses identify `full` or `summary` in `X-Medcom-Data-Projection` and provide the fixed full route in `X-Medcom-Full-Data-Path`. The original body projection stays compatible. See the [all-API data audit](API_FULL_DATA_AUDIT_20261010.md) for actual FE route/parser gaps and remaining non-full/unavailable surfaces.

The bounded HTTPS verifier `tools/deploy/verify_backend_api.py` now verifies the exact typed query metadata before reading ERP rows and requests the v2 list ordered by ID ascending. Its public report records only technical contract/order observations and field counts. It still permits only login/logout POSTs, retires its own session, rejects redirects and never exports credentials, scope tokens, identifiers or row values. Date/status predicates have source-free HTTP/SQL-plan tests; actual target date/status query-result acceptance remains separate.

I69 validates actual HTTPS boundaries and the real SQL-reader command plans/typed parameters using isolated recording inputs. These tests are not a SQL-engine execution, authenticated deployed ERP acceptance, performance/load result or business write receipt. `MEDCOM_TEST_SQL` is absent in this run; actual authorized target row compatibility/query-plan/index/load acceptance and FE/BFF adoption remain NOT_RUN. No production database connection/mutation, private setting change, command activation or deployment operation was performed. Private sources, credentials and ERP rows remain outside Git.

Remaining full-goal work includes source-backed transfer/PM HTTP completion and other modules/actions, reports/exports, complete scope traceability, admitted real SQL transactions/idempotency/audit/recovery and target operations/business acceptance. None is silently excluded by this increment. See `docs/goals/PRODUCTION_ERP_GOAL.md` and the delivery ledger.
