# Phase 1 Traceability — Bound Configuration, Filter and Report Contracts

Status: partial authoritative architecture join. This file binds only evidence already published by specialist branches. Missing behavior is explicitly UNKNOWN.

## 1. Binding rules

- A packaged ERP identifier proves only the behavior stated by its evidence; it does not prove navigation reachability or authorization.
- A DB object is never exposed as a generic browser CRUD endpoint.
- Legacy metadata containing source/filter/action/table/parameter expressions is interpreted by an allow-listed server compatibility facade.
- Web presentation hiding is not authorization.
- Until exact mutation/version contracts are VERIFIED, writes remain compatibility-facade candidates rather than direct table reuse.

## 2. Persisted grid/layout configuration

| ERP evidence | Web disposition | DB/API disposition | Reuse decision | Remaining gap |
|---|---|---|---|---|
| ERP-CFG-AR_InvoiceFrm | WEB-GRID-CORE + WEB-GRID-VIEW | typed config-read API; existing SY_* config consulted before additive storage | FACADE | exact legacy precedence; save/personalization location |
| ERP-CFG-AP_OrderFrm | WEB-GRID-CORE + WEB-GRID-VIEW | same | FACADE | same |
| ERP-CFG-FA_AssetListFrm | WEB-GRID-CORE + WEB-GRID-VIEW | same | FACADE | same |
| all 232 parseable DAT artifacts | stable surface/grid/column config contract | resolve package defaults + DB config server-side | FACADE; ADDITIVE_WEB_CONFIG only for proven missing semantics | company/role/user override precedence UNKNOWN |

Verified DAT semantics include column width, visibility, position, aggregation and wrapping. Web must preserve or explicitly supersede them. Existing DB configuration anchors include DB-TABLE-dbo.SY_FrmCfg, SY_FrmCtrTbl, SY_FrmLstTbl and related SY_* tables; their existence prevents premature invention of parallel Web config tables.

### Configuration resolution contract

Server returns a normalized immutable configuration version. Proposed resolution layers are PACKAGE_DEFAULT → DB_SYSTEM_CONFIG → COMPANY → ROLE → USER, but ordering beyond the proven sources is **architecture policy / INFERRED** until C# and configured-row semantics establish legacy precedence. Authorization is resolved separately and can only narrow available data/actions.

Browser writes saved views/personalization through stable surface/element IDs. If existing SY_* tables cannot safely represent versioned browser personalization after exact analysis, use ADDITIVE_WEB_CONFIG rather than modifying transactional tables.

## 3. Filter contracts with direct ERP→DB evidence

All rows below bind to WEB-FILTER-CONTRACT and use a server allow-list. Client legacy FieldID/operator strings are descriptive input, never raw SQL authority.

The [filter-family register](FILTER_FAMILY_TRACEABILITY_REGISTER.json) enumerates the exact **13 families / 24 artifacts / 600 serialized rows** recorded in the durable ERP evidence: 11 paired families and two standalone families. It retains 18 literal DB reference names and quarantines aliases in all 10 alias-bearing artifacts. These are proposed Web/API dispositions and verified packaged references; complete current DB object resolution, field/query semantics and deployment remain gated. This is filter-slice coverage, not an exhaustive 232-DAT or 786-RPX traceability claim. See [FILTER_TRACEABILITY_SCOPE_AUDIT.md](FILTER_TRACEABILITY_SCOPE_AUDIT.md).

| ERP form/config | VERIFIED DB reference from DAT | API disposition | DB decision | Freshness |
|---|---|---|---|---|
| ERP-FRM-AP_OrderFrm / ERP-CFG-AP_OrderFrm_filter(_d) | DB-TABLE-dbo.AP_OrderTbl; DB-TABLE-dbo.AP_OrderDetailTbl | typed order-list query with separately modeled master/detail filters | FACADE | SWR ≤30s |
| ERP-FRM-AP_PurchaseFrm / filter(_d) | DB-TABLE-dbo.AP_PurchaseTbl; DB-TABLE-dbo.AP_PurchaseDetailTbl | typed purchase query | FACADE | SWR ≤30s |
| ERP-FRM-AR_InvoiceRequestFrm / filter(_d) | DB-TABLE-dbo.AR_InvoiceRequestTbl; DB-TABLE-dbo.AR_InvoiceRequestDetailTbl; master alias A UNKNOWN | typed invoice-request query; reject unresolved alias fields until mapped | FACADE | SWR ≤30s |
| ERP-FRM-AR_OrderByContractFrm / filter(_d) | DB-VIEW-dbo.AR_OrderViewData candidate; DB-TABLE-dbo.AR_OrderDetailTbl; detail alias A UNKNOWN | typed contract-order query; reject unresolved alias fields until mapped | FACADE | SWR ≤30s |
| ERP-FRM-AR_OrderShipFrm / filter(_d) | DB-TABLE-dbo.AR_OrderTbl; DB-TABLE-dbo.AR_OrderDetailTbl; aliases A/B UNKNOWN | typed shipping-order query; reject unresolved alias fields until mapped | FACADE | SWR ≤15–30s by operational acceptance |
| ERP-FRM-AR_StockInputFrm / filter(_d) | DB-VIEW-dbo.vIS_Input candidate; DB-VIEW-dbo.vIS_InputDetail candidate | typed stock-input query | FACADE | SWR ≤15s |
| ERP-FRM-GJ_BalanceItemFrm / filter | DB-TABLE-dbo.SY_BalanceItemTbl; DB-TABLE-dbo.CF_ItemTbl | typed balance-item query | FACADE | SWR ≤30s |
| ERP-FRM-IV_InboundRequestFrm / filter(_d) | DB-TABLE-dbo.IV_InboundRequestTbl; DB-TABLE-dbo.IV_InboundRequestDetailsTbl; aliases A/B UNKNOWN | typed inbound-request query | FACADE | SWR ≤15s |
| ERP-FRM-IV_IncomingShipmentStatusFrm / filter(_d) | DB-TABLE-dbo.IV_InboundRequestTbl; DB-TABLE-dbo.IV_InboundRequestDetailsTbl; detail alias A UNKNOWN | typed incoming-shipment query; reject unresolved alias fields until mapped | FACADE | SWR ≤15s |
| ERP-FRM-ItemGroupListFrm / filter | DB-TABLE-dbo.CF_ItemGroupTbl | typed reference query | FACADE | SWR ≤60s |

The `DB-VIEW` type for AR_OrderViewData/vIS_* is a candidate classification based on naming in ERP evidence and must be reconciled against the DB catalog before promotion to VERIFIED DB object type.

Query contract requirements: authorized scope first; allow-listed fields/operators; typed values; deterministic sort with stable tie-breaker; bounded page/window; separate master/detail semantics; query timeout/telemetry; no dynamic identifier accepted from browser.

## 4. Existing DB configuration compatibility boundary

VERIFIED DB tables: DB-TABLE-dbo.SY_Menu, SY_FrmCfg, SY_FrmCtrTbl, SY_FrmDrdwTbl, SY_FrmExpTbl, SY_FrmFltTbl, SY_FrmGrdActTbl, SY_FrmLstTbl, SY_FrmMstActTbl, SY_FrmOptBtnTbl, SY_FrmParTbl, SY_UserBranch and SY_UserStorehouse.

Disposition: **FACADE**, not REUSE-AS-BROWSER-CONTRACT.

The facade may expose normalized menu/form/control/dropdown/filter/action/list metadata only after validating configured sources/actions/parameters against server-known contracts. SY_UserBranch/SY_UserStorehouse are evidence that scope metadata exists, not proof of complete authorization enforcement.

Mutation authorization contract: authenticated identity + company/branch/storehouse scope + business permission + current record state are revalidated server-side immediately before commit. Client capability metadata is advisory presentation only.

## 5. Reporting architecture bindings

ERP report package has 786 candidate-current RPX layouts; 119 contain embedded scripts, 8 parent families contain packaged subreports, 7 contain barcode controls, 74 contain images and one contains a chart.

Disposition:
- RPX is migration evidence/template input, never browser executable code.
- Embedded C#/VB script is classified per report as presentation transform vs business/data behavior. Business/data behavior moves behind the server/report boundary.
- Parent + subreport dependency sets migrate and test atomically.
- Reports use WEB-REPORT-RUN and SNAPSHOT freshness unless later evidence requires another policy.
- Long execution/export is a durable background job, not a held browser request.
- Barcode/QR acceptance includes machine decode against expected sanitized payload semantics.
- Image retrieval is separately authorized; generated artifacts inherit the report-run authorization scope.

### Direct report binding

`ERP-RPT-AP_GoodsInspectionAndReceivingReport` package metadata exposes data-call identifier `IV_GetInboundRequestDetailsByDocumentIDStp` and parameter `DocumentID`.

Architecture disposition: create a typed report-query adapter whose input contains the authorized document identity, validates document visibility, invokes the existing procedure only after DB Analysis verifies its exact schema/body/side effects, and maps a versioned result DTO to the report renderer. Current status is **FACADE / DB verification pending**, not direct procedure exposure.

## 6. Transaction, retry and event boundary

For every future write mapping:
1. authorize and validate scope/state;
2. resolve stable idempotency key for retryable command;
3. begin transaction at the server-owned business boundary;
4. apply compatible procedure/table operation;
5. capture trigger/procedure side effects;
6. persist audit and durable post-commit intent where required;
7. commit once;
8. only then invalidate cache/publish event/run asynchronous follow-up.

Until row-version or equivalent version semantics are VERIFIED, critical concurrent edits must not claim optimistic-concurrency parity. This remains ARCH-GAP-CONCURRENCY-001.

Realtime PUSH is prohibited as a binding merely because WebSocket infrastructure exists. A surface can move from SWR/POLL to PUSH only when commit-correlated version/order, authorization-safe event scope, deduplication and gap recovery are defined and tested.

## 7. Bounded gap / UNKNOWN register

- ARCH-GAP-NAV-001 — menu hierarchy, reachability and runtime captions/order.
- ARCH-GAP-AUTH-001 — exact permission enforcement path and company/branch/storehouse semantics.
- ARCH-GAP-CONFIG-001 — package vs DB vs company/role/user precedence and write persistence.
- ARCH-GAP-FILTER-001 — A/B alias resolution and runtime filter transformation semantics.
- ARCH-GAP-WRITE-001 — per-form commands, validation, transaction boundaries and side effects.
- ARCH-GAP-CONCURRENCY-001 — version tokens/locking behavior and retry safety.
- ARCH-GAP-LOOKUP-001 — dropdown/lookup source dependencies and authorization.
- ARCH-GAP-REPORT-001 — report reachability, parameters, print defaults and exact DB procedure/result contracts.
- ARCH-GAP-REALTIME-001 — authoritative event/version source; no surface is yet VERIFIED for PUSH.
- ARCH-GAP-JOBS-001 — background/integration job inventory and recovery semantics.
- ARCH-GAP-FILES-001 — file/template storage, validation, authorization and retention.
- ARCH-GAP-OBS-001 — operational SLO baselines and legacy failure/recovery behavior.

None of these gaps blocks independent traceability expansion. Each newly VERIFIED ERP capability must be appended with Web + API/DB disposition or an explicit bounded gap.

Status remains active; this is not yet complete_candidate.
