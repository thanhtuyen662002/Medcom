# I87 — PO fields and independent statuses, 2026-10-13

Owner scope: correct PO read responses, add the screenshot's Model/Ngân sách/Thời gian yêu cầu columns, remove the named surplus properties, preserve the actual lock/status values and expose both independent status types. Backend only; no FE mutation. Canonical goal #45 remains open.

## Verified source and current questions

Source base `b5e234af5e4af9bdeb33eb214808830c4674a915` has all four post-merge workflow runs successful. No competing PO Draft lease was observed. The approved historical Library identities remain in `docs/SOURCE_BASELINE.md`; `WINFORMS_SOURCE_GUIDE_EVIDENCE.md` is supplementary. The privately accessible full SQL member at the owner ERP directory was rehashed: 1,212,595,716 bytes, SHA-256 `61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`, matching the established complete technical member. No raw SQL is published.

The previously used private connection file was absent on intake; the owner restored `D:\Config\appsettings.Private.json`. A fresh SELECT-only serializable MedData audit, rolled back, verified 10 selected object shapes and the 45 `SY_FrmCfg` rows for `AP_OrderFrm`. Private evidence: `I87-po-fields-status/Program.cs`, `metadata.json`, `po-configuration.private.json`, `AP_POOverviewView.private.sql`, `AP_POControlView.private.sql` in the owner's private artifact store. Settings and SQL bodies remain private.

Current physical `dbo.AP_OrderTbl` has 19 columns; `isLock` is a required bit and `StatusID` is a nullable int. `dbo.AP_OrderDetailTbl` has 12 columns and has no Model/Budget/TimeRequired. Those three columns are physical fields of `dbo.AP_PurchaseRequestDetailTbl`: `Model varchar(50)`, `Budget decimal(18,0)`, `TimeRequired nvarchar(200)`, all nullable. The current PO configuration's T1 TN/TN1 binds `AP_OrderDetailTbl`/`CF_ItemTbl`, and its T1 SE1 selects item labels. No current stored SQL module references both the PO-detail and purchase-request-detail tables. A private aggregate-only relation audit found no current PO line linked through `ParentID` or a same-ID purchase-request line. An arbitrary item-only match cannot establish the source request.

The owner is being asked whether the three values should be independently stored/editable on PO or read only through a real source-request link. Do not invent a relationship, fabricate non-null values, or alter production schema while this preference is pending. Continue the independent response/status work.

## Independent status meanings

- `dbo.AP_OrderTbl.StatusID` uses `dbo.AP_OrderStatusTbl.StatusID/StatusName`: existing production lifecycle (four observed dictionary entries).
- `dbo.AP_POExtTbl.POStatusCode` uses `dbo.AP_POProcessStatusTbl.StatusCode/StatusName`: PO process status (five observed entries).
- `dbo.AP_POExtTbl.PaymentStatusCode` uses `dbo.AP_POPaymentStatusTbl.PaymentStatusCode/PaymentStatusName`: payment status (four observed entries).

These are separate values. Do not overwrite the native `StatusID` with a PO/payment code, infer the lock from display-enabled controls, or manufacture a default when an extension row is absent. IDs/codes must keep their corresponding names. Source view `AP_POOverviewView` also explicitly calls the original status `LegacyStatusID`; this is provenance, not a command-admission change.

The surplus-field request applies to PO responses only: `lineName`, `lineReferenceState`, `documentReferenceState`, `itemReferenceState`, `documentName`, `parentName`, `parentReferenceState`, `parentId`, `property`, `property2`, `sourceAmount`, `quantity2`, `amount`, `amountDisplay`. Preserve itemId/itemCode/itemName/unit, field pagination and current CUD/authority/concurrency rules. Document any intentional PO response exclusions explicitly in the contract/audit rather than claiming every physical column remains public.

## Validation and handoff

Regression tests must cover PO-only field exclusion across current/v2/ERP routes, correct raw lock/null/native status, independent process/payment code/name pairs, absent/ambiguous source data, schema and paging stability, and unchanged other modules/command admission. Record concrete current-head tests, exact head/base CI, tested merge receipts, merge and deployment status on the Draft lease. No production CUD/DDL is authorized by this evidence intake.
