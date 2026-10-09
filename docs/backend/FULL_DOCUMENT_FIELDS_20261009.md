# Complete document read fields — 9 October 2026

Owner request: continue the backend and return every field when calling its APIs. This increment covers the complete physical header/line field sets for the three currently wired document read modules. It does not establish full ERP API delivery or admit business writes.

## Read contract version 2

Existing properties, status names, pagination, item display context, session/scope headers and purchase `{scopeKey,data}` envelopes remain. Full source fields are provided by six new versioned read routes. The unversioned routes retain their original strict-consumer wire shapes: new optional projection properties are removed at the HTTP boundary and omitted when null. Source fields themselves still include every nullable field with an explicit null. No FE source is changed.

| Module | List route | Detail route | Header field path in detail | Line field path in detail | Columns |
| --- | --- | --- | --- | --- | ---: |
| Purchase orders | `GET /api/v2/documents/purchase-orders` | `GET /api/v2/documents/purchase-orders/detail?documentId=…&page=1&pageSize=50` | `document.purchaseOrderHeader` | `purchaseOrderLines[].fields` | 19 + 12 |
| Inbound requests | `GET /api/v2/documents/inbound-requests` | `GET /api/v2/documents/inbound-requests/detail?documentId=…&page=1&pageSize=50` | `document.inboundRequestHeader` | `inboundRequestLines[].fields` | 37 + 25 |
| Purchase requests | `GET /api/v2/purchase-requests` | `GET /api/v2/purchase-requests/detail?documentId=…` | `data.sourceFields.header` | `data.sourceFields.lines[]` | 14 + 9 |

Version 2 lists include all header fields in `rows[].purchaseOrderHeader`, `rows[].inboundRequestHeader` or `data.rows[].fields`. They do not duplicate child lines. Purchase/inbound details return all fields of each line on the requested page; `hasMore` must be followed to read later pages. Purchase-request detail retains its existing bounded aggregate behavior (at most 500 qualified lines; overflow is unavailable, never a silent truncation).

The existing frontend parses the unversioned responses with strict Zod schemas (`src/frontend/lib/contracts.ts`, `apps/medcom-sites/lib/erp/{contracts,purchase-request-api}.ts`); returning extra fields there would break current consumers. To consume full fields, the separately owned FE/BFF must adopt the version 2 schemas and explicitly allow the new GET paths and the field-contract route. Its current proxy allowlist does not automatically admit them. There are no version 2 command routes.

Source metadata and a machine-readable exact column mapping are in [document-field-contract.json](document-field-contract.json). All 116 columns, including document/line IDs and child-parent links, have an explicit JSON path. The historical summary aliases (`lineId`, `itemId`, `isLocked`) remain; the full field objects use source-specific names (`userAutoId`, `isLock`, etc.). The source spelling `ResultDesciption` is intentionally preserved as `resultDesciption`.

`GET /api/documents/field-contract?kind=purchase-orders|inbound-requests|purchase-requests` returns version 2 with `header`/`lines` definitions. Each definition contains `column`, `jsonPath` for detail, `listJsonPath` for header list fields, `sqlType`, `nullable`, `jsonType` and `format`. This route requires a current session and that module's read capability, rejects duplicate/unknown queries, performs no SQL and stamps the current read/session scope. Unknown kinds return 400; missing capability returns 403; missing session returns 401. A field definition is a read contract, not write or selector admission.

## Values and compatibility

- SQL decimals are JSON strings, including prices, totals, quantities and inbound `RateExchange decimal(28,10)`. SQL `float` values remain finite JSON numbers. Zero/negative source values are not replaced with guessed defaults.
- Full SQL `datetime` fields use `yyyy-MM-ddTHH:mm:ss.fff` with no inferred timezone or `Z`. The existing summary `documentDate` stays `yyyy-MM-dd`; full headers preserve the time. Purchase dates retain the existing normalized SQL datetime representation.
  SQL Server style 126 omits the fractional part when milliseconds are zero; the full-field reader accepts both documented SQL shapes and normalizes zero to `.000`. Reference: [Microsoft CAST/CONVERT documentation](https://learn.microsoft.com/en-us/sql/t-sql/functions/cast-and-convert-transact-sql?view=sql-server-ver17).
- SQL NULL is JSON null, not zero, empty string or a dropped property. Unicode text and original source field names are retained. Missing required source projections or non-finite floats fail unavailable; a successful response must not silently masquerade as a partial field set.
- No `SELECT *`, request-provided table/column identifier, generic CRUD or extra data lookup is introduced. Full fields share the existing authorized parent selection and paged child statement. Item enrichment cannot fan out or authorize lines.
- `imageUrl`/`bbkcUrl` are stored field values only; the server does not fetch URLs or convert them into unrestricted download routes.
- The purchase command aggregate, equality-token input and receipt DTOs are unchanged. `sourceFields` is a separate read-only projection. Save/Submit/Add/Delete/report/export/transfer availability is not increased by full read fields or the contract route.

## Evidence

Clean implementation base: main `3304766ab9d63329622b5bf18b6f1d6171405a94`, tree `6e86ba33880155f61fc5c5902e96dd37caf4d17b`; Draft #122, immutable admission `docs/execution/direct-runs/I67.json`.

Current approved owner attachments were privately materialized and rehashed in this run:

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| `ERP_Medcom2026.zip` | 162176322 | `d5fe49f8e58de89fc0b9972a116a6c8f673ab9f9b326c626708d0b5d01fc5783` |
| `MedData-Data.zip` | 134249929 | `6a74eb02dc747e9c6ab679f69ca515783a8724ad767f6702fcebd28f195b1144` |
| Full `MedData-Data.sql` member | 1212595716 | `61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096` |

The full SQL member CRC32 is `16a9a7e6`. Every column/name/type/nullability and CREATE TABLE source line of the six tables was cross-checked against the actual complete member and the tracked inventories. No raw SQL definitions, ERP binary, inserts, private settings or business rows are published.

| Table | Source line | Tracked metadata |
| --- | ---: | --- |
| `IV_InboundRequestDetailsTbl` | 11005 | `inventories/source/20261002/table-02.json` |
| `AP_OrderTbl` | 11248 | `inventories/source/20261002/table-02.json` |
| `IV_InboundRequestTbl` | 11370 | `inventories/source/20261002/table-02.json` |
| `AP_OrderDetailTbl` | 11437 | `inventories/source/20261002/table-02.json` |
| `AP_PurchaseRequestDetailTbl` | 23200 | `inventories/source/20261002/table-07.json` |
| `AP_PurchaseRequestTbl` | 23221 | `inventories/source/20261002/table-07.json` |

Tests in `DocumentFullFieldTests.cs` use synthetic recording connections through the actual SQL orchestration and actual HTTPS host, and reconcile the published contract against the pinned complete table inventories. Existing branch/item/unsafe-row regressions retain their assertions and receive the added recording columns. They do not execute SQL Server or prove real-host acceptance.

Build/test/hosted CI results are recorded in `docs/execution/I67_VALIDATION_20261009.md`. Real target SQL schema/data compatibility, all business command runtime acceptance, selector bindings, missing create/delete/report/export/transfer endpoints and operational acceptance remain open under #45. No deployment, private configuration update or SQL target connection occurred in this increment.
