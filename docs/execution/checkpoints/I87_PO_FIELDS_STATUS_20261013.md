# I87 — Vietnamese Swagger groups and PO lock/status verification, 2026-10-13

Latest owner scope: “Bạn chỉnh lại tên trên swagger thôi không chỉnh api nữa, kiểm tra lại isLock và statusID trả về name là được”. This supersedes the earlier PO field-change request for this PR. Only Swagger documentation grouping changes; existing business routes, request/response properties, SQL readers and command enforcement stay unchanged. Backend only; no FE mutation. Canonical goal #45 remains open.

## Verified source and current questions

Source base `b5e234af5e4af9bdeb33eb214808830c4674a915` has all four post-merge workflow runs successful. No competing PO Draft lease was observed. The approved historical Library identities remain in `docs/SOURCE_BASELINE.md`; `WINFORMS_SOURCE_GUIDE_EVIDENCE.md` is supplementary. The privately accessible full SQL member at the owner ERP directory was rehashed: 1,212,595,716 bytes, SHA-256 `61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`, matching the established complete technical member. No raw SQL is published.

The previously used private connection file was absent on intake; the owner restored `D:\Config\appsettings.Private.json`. A fresh SELECT-only serializable MedData audit, rolled back, verified 10 selected object shapes and the 45 `SY_FrmCfg` rows for `AP_OrderFrm`. Private evidence: `I87-po-fields-status/Program.cs`, `metadata.json`, `po-configuration.private.json`, `AP_POOverviewView.private.sql`, `AP_POControlView.private.sql` in the owner's private artifact store. Settings and SQL bodies remain private.

Current physical `dbo.AP_OrderTbl` has 19 columns; `isLock` is a required bit and `StatusID` is a nullable int. `dbo.AP_OrderDetailTbl` has 12 columns and has no Model/Budget/TimeRequired. Those three columns are physical fields of `dbo.AP_PurchaseRequestDetailTbl`: `Model varchar(50)`, `Budget decimal(18,0)`, `TimeRequired nvarchar(200)`, all nullable. The current PO configuration's T1 TN/TN1 binds `AP_OrderDetailTbl`/`CF_ItemTbl`, and its T1 SE1 selects item labels. No current stored SQL module references both the PO-detail and purchase-request-detail tables. A private aggregate-only relation audit found no current PO line linked through `ParentID` or a same-ID purchase-request line. An arbitrary item-only match cannot establish the source request.

The owner previously chose to read the three values only through a real source-request link. The newer narrowed request stops that implementation and the proposed PO response-field removal in this PR. No physical PO columns, lineage backfill or extension-status API changes are made.

## Independent status meanings

- `dbo.AP_OrderTbl.StatusID` uses `dbo.AP_OrderStatusTbl.StatusID/StatusName`: existing production lifecycle (four observed dictionary entries).
- `dbo.AP_POExtTbl.POStatusCode` uses `dbo.AP_POProcessStatusTbl.StatusCode/StatusName`: PO process status (five observed entries).
- `dbo.AP_POExtTbl.PaymentStatusCode` uses `dbo.AP_POPaymentStatusTbl.PaymentStatusCode/PaymentStatusName`: payment status (four observed entries).

These are separate values. Do not overwrite the native `StatusID` with a PO/payment code, infer the lock from display-enabled controls, or manufacture a default when an extension row is absent. IDs/codes must keep their corresponding names. Source view `AP_POOverviewView` also explicitly calls the original status `LegacyStatusID`; this is provenance, not a command-admission change.

Current read verification: `SqlDocumentReader.ListSql/DetailSql` select `AP_OrderTbl.isLock` and `StatusID` directly, join `AP_OrderStatusTbl` through `DocumentStatusSql.PurchaseOrders`, and preserve nulls. ERP list/detail use the pinned header projection in `ErpSqlPlan`/`SqlErpScreenService`; `api-reference-bindings.json#status:purchase-orders` resolves `StatusName` from the same native dictionary. `CanonicalResponseProjection` aliases `isLock` to the existing public `isLocked`, preserving its boolean value. Display-enabled CUD controls do not alter the source lock. The independent extension dictionaries above are evidence only, not a new public response in this change.

Swagger group titles use `ErpScreenCatalog.Get(module).Caption`, sourced from `inventories/erp/20261012/captions.json` / `dbo.SY_FrmLstTbl.CaptionVN`. `ApiContractCatalog` adds documentation-only `tags` to ERP operations; `medcom-swagger.js` preserves those tags. Unknown labels use “Màn hình ERP”, never a generated module slug. No additional SQL query is introduced by Swagger.

## Validation and handoff

Validation covers all 19 captioned ERP groups, preservation of all 243 registered operations/security/payload schemas, Swagger browser dispatch, and existing PO/native dictionary and canonical response regressions. Record concrete current-head tests, exact head/base CI, tested merge receipts, merge and deployment status on the Draft lease. No production CUD/DDL or deployment is performed in this change.

Observed local results: Release solution build succeeded with zero warnings/errors; 109 targeted .NET tests passed (`ApiContractCatalogTests`, `SwaggerDocumentationTests`, `DocumentStatusTests`, `DocumentFullFieldTests`, `CanonicalResponseTests`, `CanonicalErpHttpTests`, `FeDisplayTests`), 11 Swagger client tests passed, API reconciliation passed (243 operations, 118 native source columns, 1,516 ERP source columns), and its nine scanner regressions passed. The compiled, unconfigured loopback browser check passed using installed Edge with the bundled Playwright runtime: all 19 exact caption links, all 243 operations, health Execute and unchanged anonymous-scope/HTTP-write rejection. No ERP credentials or production SQL were used by these tests. The exported OpenAPI was compared with base after removing the 204 new operation `tags`: the remaining document is identical. Test TRX remains private under `I87-po-fields-status/test-results`.

VPS deployment of this change and authenticated current-VPS PO output comparison: **UNKNOWN**. Local/synthetic checks and direct DB metadata evidence do not assert that the new binary is already running on the VPS.
