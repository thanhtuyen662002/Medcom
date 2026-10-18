# Internal BE response contract v3 — 11/10/2026

This engineering note is not a product UI vocabulary. The owner requested one location per business field and a purpose-only FE handoff. The active FE handoff is [screen/action/API purpose](BE_FE_API_REFERENCE_20261011.md); machine request/response types are in [compiled OpenAPI](medcom-openapi.json).

The [19 October calculated-value and status-color supplement](API_CALCULATED_VALUES_STATUS_COLORS_20261019.md) adds source grid summaries to seven detail responses and nullable CSS status colors to response presentation; existing routes and write inputs retain their contracts.

## Wire rules

OpenAPI info version is `3.0.0`. Successful endpoints in the BE data group stamp `X-Medcom-Response-Contract: 3`. Projection operates on a serialized response copy, after the existing authorized reference/date/money enrichment. Authentication, workspace, health and ProblemDetails keep their nonduplicated control contracts. No new envelope is added to them. `/screen` and `*-contract` remain metadata; their `fields` members describe columns, not repeated business records. Read-only `/screen` field-definition names now match the canonical returned keys; SQL provenance and writable command field names are retained.

| Read family | List record | Detail header | Detail line |
|---|---|---|---|
| `/api/erp/{module}` — 19 forms | `data.rows[]` | `data.header` | `data.lines.rows[]`; history/comparison/sections use their respective `rows[]` |
| `/api/documents/purchase-orders` and v2 alias | `rows[]` | `document` | `purchaseOrderLines[]` |
| `/api/documents/inbound-requests` and v2 alias | `rows[]` | `document` | `inboundRequestLines[]` |
| `/api/purchase-requests` and v2 alias | `data.rows[]` | `data.document.header` | `data.document.lines[]` |
| ERP dropdowns | `data.items[]` has `id`, `name` and additional selection columns | — | — |

The old `fields`, `sourceFields`, `purchaseOrderHeader`, `inboundRequestHeader`, input/display sibling copies and `itemDisplayContext` are absent from successful business responses. Presentation from item context is joined to its persisted line by identity, never by array position; manufacturer code/source survive. Detail identity/status/branch reside once in their owning header. Persisted row `userAutoId` is `lineId`; purchase-request primary key is `documentId`; source `isLock` is `isLocked`.

For batch forms, header `BatchID` is exposed as the document's canonical `documentId`. History can contain **both** its own `DocumentID` and `BatchID`: it retains `documentId` and `batchId`. Contract lookup retains the selected parent `documentId` and puts the separate contract under `contract.documentId`. Equal values in different columns are not deduplicated. Source-column annotations and the finite source-field audit verify this distinction.

Dropdowns have one `id` and `name`; native primary value/display aliases are removed using the fixed server lookup definition. PM choices remove the fixed `UserName`/`HoTen` aliases. Additional selected attributes, including item code/unit, branch and dependent-column values, survive. Legacy currency choice `currencyName` becomes `name`; exchange rate remains.

Null keys, exact decimal strings, Unicode and source dates survive. `...Name`, item code/unit and `...Display` remain next to raw values. Raw and formatted values serve different purposes: `"1234.00"` and `"1,234.00 USD"` are not duplicate fields. All paging markers and bounded SQL pagination remain. Source read response is not a writable command body.

## Command and rollout boundary

Request schemas, action-specific payloads, validation, native SQL writes, journal intent bytes/replay and concurrency tokens are unchanged. A consumer must read the new single record shape, and continue constructing an explicit writable command from request schemas. Never submit the full enriched read object as a write. Old and v2 read URLs both use the new shape; there is no old duplicate-response mode.

Existing nonoperational historical write facades remain declared in OpenAPI and are identified as replaced in the purpose handoff. The active configured ERP write routes are unchanged. No print/import/copy feature, SQL migration or production business fixture is introduced by this change.

The separately owned FE application/service is not modified. BE tests and synthetic FE CI do not prove that the actual FE consumer has adopted v3. FE parser migration and owner acceptance on real records remain UNKNOWN. Release observations are recorded in [I79](../execution/I79_API_RESPONSE_STANDARDIZATION_20261011.md).

## Evidence

Implementation: `src/backend/Medcom.Api/CanonicalResponseProjection.cs`, `CanonicalResponseSchemas.cs`, `ApiHost.cs`, `ErpScreenEndpoints.cs`, `FeDisplayProjection.cs`, `ApiContractCatalog.cs`, `DocumentFieldCatalog.cs`. Domain command definitions remain in `src/backend/Medcom.Contracts`.

Source mappings: `docs/backend/document-field-contract.json` (118 physical columns), `inventories/erp/20261010/six-screen-catalog.json` and `inventories/erp/20261011/cud-workflow-catalog.json` (1,516 columns across 19 forms); their provenance is retained in `docs/SOURCE_BASELINE.md`. No raw archive/native semantic re-verification is asserted in this transport-only run.

Verification: `tools/backend/audit_api_data.py` checks every served read property against source primitive/nullability/provenance and rejects duplicate wrappers across all registered successful business schemas. `tests/backend/Medcom.Api.Tests/CanonicalErpHttpTests.cs` exercises actual HTTPS output for all 19 forms over synthetic typed services; document facade tests use synthetic SQL providers. These are HTTP/contract observations, not production row writes.
