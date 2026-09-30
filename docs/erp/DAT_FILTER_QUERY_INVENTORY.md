# DAT filter-query inventory

Source: authoritative ERP package, SHA-256 `801cccb871fedce049ec3c446aeff819d7661ec94641a891d6013d4b86a0bd52`.

Evidence level: VERIFIED for serialized DAT structure. Runtime construction, precedence and authorization remain UNKNOWN pending direct source verification.

## Structural findings

A parse of all 232 DAT artifacts found 24 filter DAT files containing 600 serialized Query rows.

Every observed row has: ID, FieldID, Operator, Value, Operator2, Value2, AndOr, DataType, STT and isVisible.

Datatype counts:
- IsText: 364
- IsNumber: 164
- IsDate: 45
- IsBoolean: 27

Primary operator counts:
- Like: 364
- equals: 191
- greater-than-or-equal: 45

Visibility counts:
- visible: 526
- hidden: 74

Stable capability ID: `ERP-CFG-DAT-FilterQuery`.

## Surface inventory

| Artifact | Rows | Hidden |
|---|---:|---:|
| AP_ApprovePurchaseRequestListFrm_filter | 10 | 1 |
| AP_ApprovePurchaseRequestListFrm_filter_d | 11 | 1 |
| AP_OrderFrm_filter | 22 | 6 |
| AP_OrderFrm_filter_d | 14 | 1 |
| AP_PurchaseFrm_filter | 41 | 7 |
| AP_PurchaseFrm_filter_d | 38 | 1 |
| AP_PurposeRequestListFrm_filter | 14 | 1 |
| AP_PurposeRequestListFrm_filter_d | 12 | 1 |
| AR_InvoiceRequestFrm_filter | 31 | 7 |
| AR_InvoiceRequestFrm_filter_d | 13 | 1 |
| AR_OrderByContractFrm_filter | 42 | 8 |
| AR_OrderByContractFrm_filter_d | 29 | 1 |
| AR_OrderComfirmFrm_filter | 34 | 8 |
| AR_OrderComfirmFrm_filter_d | 26 | 1 |
| AR_OrderShipFrm_filter | 53 | 8 |
| AR_OrderShipFrm_filter_d | 30 | 1 |
| AR_StockInputFrm_filter | 22 | 4 |
| AR_StockInputFrm_filter_d | 13 | 1 |
| GJ_BalanceItemFrm_filter | 23 | 3 |
| ItemGroupListFrm_filter | 9 | 5 |
| IV_InboundRequestFrm_filter | 38 | 2 |
| IV_InboundRequestFrm_filter_d | 25 | 2 |
| IV_IncomingShipmentStatusFrm_filter | 35 | 2 |
| IV_IncomingShipmentStatusFrm_filter_d | 15 | 1 |

Eleven form families have separate master and detail filter artifacts. GJ_BalanceItemFrm and ItemGroupListFrm have only a non-detail filter artifact in this package.

FieldID values include both table-qualified identifiers and projected/unqualified aliases. Therefore a filter cannot safely be assumed to map one-to-one to a physical database column. Alias resolution remains UNKNOWN.

## Web disposition

Initial disposition: compatibility facade.

The Web filter contract should publish server-owned typed filter descriptors. The client sends stable field IDs and typed values; the server resolves legacy aliases, joins, authorization and data scope. Master and detail filters remain separate where the package persists them separately. Unknown aliases fail closed.

Hidden rows must be classified before migration rather than discarded: direct source/runtime verification must determine whether each hidden row is an enforced scope, a hidden available criterion, or another legacy state.

## Acceptance checks

- Preserve all 600 serialized rows including 74 hidden rows.
- Round-trip master and detail definitions independently for paired families.
- Verify typed text, number, date and boolean behavior.
- Resolve projected aliases to an authoritative server contract or retain UNKNOWN.
- Verify hidden authoritative constraints cannot be bypassed by client requests.
- Compare representative WinForms and Web result sets for identical criteria.

## UNKNOWN queue

- boolean operator behavior;
- empty-value behavior;
- AndOr grouping and precedence;
- STT execution versus display meaning;
- per-form meaning of hidden rows;
- wildcard/escaping behavior;
- alias/join resolution;
- permission/data-scope interaction;
- user/company override precedence.
