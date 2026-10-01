# Persisted filter configuration evidence

Authoritative source: `ERP_Medcom2026(4).zip`, `Layout/Medcom/*.dat`. This document records structured metadata only; no production filter values or customer/transaction rows are published.

## 1. Filter artifact model

**VERIFIED**

24 packaged DAT artifacts contain `_filter` in the basename. Eleven form families have a paired `_filter` and `_filter_d` artifact, consistent with separate master/detail filter configuration surfaces. Two standalone filter artifacts are also packaged: `GJ_BalanceItemFrm_filter` and `ItemGroupListFrm_filter`.

Filter rows directly persist fields including:
- `FieldID`
- `Operator`
- `Value`
- `Operator2`
- `Value2`
- `AndOr`
- `DataType`
- `STT`
- `isVisible`

Observed operator values are `Like`, `=`, `>=`, and `<=`. Observed data-type markers are `IsText`, `IsNumber`, `IsDate`, and `IsBoolean`.

Across the 24 artifacts the parser observed 600 filter-definition rows. Operator occurrences across primary/secondary operator slots are: `Like` 728, `=` 382, `>=` 45, `<=` 45. Data-type markers occur as `IsText` 364, `IsNumber` 164, `IsDate` 45, and `IsBoolean` 27.

These counts describe persisted configuration slots, not runtime query executions.

## 2. Stable filter-config inventory

| Stable ID | Rows | Visible | Hidden | Direct object/view identifiers observed in FieldID | Alias markers |
|---|---:|---:|---:|---|---|
| ERP-CFG-AP_ApprovePurchaseRequestListFrm_filter | 10 | 9 | 1 | AP_PurchaseRequestTbl | none observed |
| ERP-CFG-AP_ApprovePurchaseRequestListFrm_filter_d | 11 | 10 | 1 | AP_PurchaseRequestDetailTbl | A |
| ERP-CFG-AP_OrderFrm_filter | 22 | 16 | 6 | AP_OrderTbl | none observed |
| ERP-CFG-AP_OrderFrm_filter_d | 14 | 13 | 1 | AP_OrderDetailTbl | none observed |
| ERP-CFG-AP_PurchaseFrm_filter | 41 | 34 | 7 | AP_PurchaseTbl | none observed |
| ERP-CFG-AP_PurchaseFrm_filter_d | 38 | 37 | 1 | AP_PurchaseDetailTbl | none observed |
| ERP-CFG-AP_PurposeRequestListFrm_filter | 14 | 13 | 1 | AP_PurchaseRequestTbl | none observed |
| ERP-CFG-AP_PurposeRequestListFrm_filter_d | 12 | 11 | 1 | AP_PurchaseRequestDetailTbl | A |
| ERP-CFG-AR_InvoiceRequestFrm_filter | 31 | 24 | 7 | AR_InvoiceRequestTbl | A |
| ERP-CFG-AR_InvoiceRequestFrm_filter_d | 13 | 12 | 1 | AR_InvoiceRequestDetailTbl | none observed |
| ERP-CFG-AR_OrderByContractFrm_filter | 42 | 34 | 8 | AR_OrderViewData | none observed |
| ERP-CFG-AR_OrderByContractFrm_filter_d | 29 | 28 | 1 | AR_OrderDetailTbl | A |
| ERP-CFG-AR_OrderComfirmFrm_filter | 34 | 26 | 8 | AR_OrderTbl | A |
| ERP-CFG-AR_OrderComfirmFrm_filter_d | 26 | 25 | 1 | AR_OrderDetailTbl | none observed |
| ERP-CFG-AR_OrderShipFrm_filter | 53 | 45 | 8 | AR_OrderTbl | A, B |
| ERP-CFG-AR_OrderShipFrm_filter_d | 30 | 29 | 1 | AR_OrderDetailTbl | A |
| ERP-CFG-AR_StockInputFrm_filter | 22 | 18 | 4 | vIS_Input | none observed |
| ERP-CFG-AR_StockInputFrm_filter_d | 13 | 12 | 1 | vIS_InputDetail | none observed |
| ERP-CFG-GJ_BalanceItemFrm_filter | 23 | 20 | 3 | SY_BalanceItemTbl, CF_ItemTbl | none observed |
| ERP-CFG-IV_InboundRequestFrm_filter | 38 | 36 | 2 | IV_InboundRequestTbl | A, B |
| ERP-CFG-IV_InboundRequestFrm_filter_d | 25 | 23 | 2 | IV_InboundRequestDetailsTbl | A |
| ERP-CFG-IV_IncomingShipmentStatusFrm_filter | 35 | 33 | 2 | IV_InboundRequestTbl | none observed |
| ERP-CFG-IV_IncomingShipmentStatusFrm_filter_d | 15 | 14 | 1 | IV_InboundRequestDetailsTbl | A |
| ERP-CFG-ItemGroupListFrm_filter | 9 | 4 | 5 | CF_ItemGroupTbl | none observed |

Single-letter `A`/`B` prefixes are treated as query aliases, not database object names. Their target objects remain UNKNOWN until the corresponding query/runtime configuration is recovered.

## 3. Concrete ERP → DB traceability recovered from package configuration

The filter metadata provides direct packaged evidence for at least these relationships:

- `ERP-FRM-AP_OrderFrm` / `ERP-CFG-AP_OrderFrm_filter` → `AP_OrderTbl`
- `ERP-FRM-AP_OrderFrm` / detail filter → `AP_OrderDetailTbl`
- `ERP-FRM-AP_PurchaseFrm` / master-detail filters → `AP_PurchaseTbl`, `AP_PurchaseDetailTbl`
- `ERP-FRM-AR_InvoiceRequestFrm` / master-detail filters → `AR_InvoiceRequestTbl`, `AR_InvoiceRequestDetailTbl`
- `ERP-FRM-AR_OrderByContractFrm` filter → `AR_OrderViewData`; detail filter → `AR_OrderDetailTbl`
- `ERP-FRM-AR_OrderShipFrm` filters → `AR_OrderTbl`, `AR_OrderDetailTbl` plus unresolved aliases
- `ERP-FRM-AR_StockInputFrm` filters → `vIS_Input`, `vIS_InputDetail`
- `ERP-FRM-GJ_BalanceItemFrm` filter → `SY_BalanceItemTbl`, `CF_ItemTbl`
- `ERP-FRM-IV_InboundRequestFrm` filters → `IV_InboundRequestTbl`, `IV_InboundRequestDetailsTbl` plus unresolved aliases
- `ERP-FRM-IV_IncomingShipmentStatusFrm` filters → `IV_InboundRequestTbl`, `IV_InboundRequestDetailsTbl`
- `ERP-FRM-ItemGroupListFrm` filter → `CF_ItemGroupTbl`

These links prove persisted filter-field references. They do **not** prove that each named object is the sole runtime source for the form, that the client builds SQL directly, or that the filter is authorization-safe.

## 4. Web migration implications

1. Filter configuration is an existing ERP capability and needs explicit migration, not a generic Web search box replacement.
2. Master/detail filtering is packaged as separate configurations for multiple forms; Web query contracts must preserve the distinction where business behavior depends on it.
3. `isVisible` proves that filter-field visibility itself is configurable/persisted.
4. `STT` provides persisted ordering evidence for filter controls.
5. Operator and data-type metadata can seed Web filter control types, but the backend must validate all fields/operators against an allow-listed query contract; client-supplied `FieldID` must never become raw SQL authority.
6. Date-range defaults and other persisted `Value` fields exist in the source artifacts, but literal values are intentionally not published here. Their migration semantics should be reviewed separately to distinguish harmless UI defaults from business-sensitive behavior.
7. Alias-prefixed fields require query binding recovery before Web migration. Guessing alias targets from neighboring fields is prohibited.

## 5. Remaining UNKNOWNs

- Whether these DAT filter definitions are loaded for every user/company or overridden elsewhere.
- Exact precedence between packaged defaults and user/role/company personalization.
- Exact SQL/query-builder implementation and alias resolution.
- Whether all configured operators are accepted identically at runtime.
- Permission checks applied before/after filtering.
- Validation and transformation of literal filter values.
- Whether some forms use additional non-DAT filters.

These should be verified from C#, database configuration and runtime evidence in the next passes.

Current workstream status is recorded in `../PROJECT_STATE.yaml` and `../workstreams/erp-analysis.yaml`; this evidence slice does not independently set phase or stream completion.
