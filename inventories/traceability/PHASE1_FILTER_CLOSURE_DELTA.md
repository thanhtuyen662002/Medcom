# Phase 1 Filter Traceability Closure Delta

Status: architecture reconciliation against VERIFIED ERP filter evidence.

This delta closes the three VERIFIED paired filter families that were absent from the current `PHASE1_BOUND_CONTRACTS.md` table. It is additive and reviewable independently while the consolidated matrix is updated.

| ERP form/config | VERIFIED DB reference from ERP DAT | Web/API disposition | Reuse decision | Freshness | Remaining gap |
|---|---|---|---|---|---|
| ERP-FRM-AP_ApprovePurchaseRequestListFrm / ERP-CFG-AP_ApprovePurchaseRequestListFrm_filter(_d) | DB-TABLE-dbo.AP_PurchaseRequestTbl; DB-TABLE-dbo.AP_PurchaseRequestDetailTbl | WEB-FILTER-CONTRACT; typed purchase-request approval query; master/detail filters remain distinct | FACADE | SWR <=30s | detail alias A target UNKNOWN; reject unresolved alias field |
| ERP-FRM-AP_PurposeRequestListFrm / ERP-CFG-AP_PurposeRequestListFrm_filter(_d) | DB-TABLE-dbo.AP_PurchaseRequestTbl; DB-TABLE-dbo.AP_PurchaseRequestDetailTbl | WEB-FILTER-CONTRACT; typed purchase-request query; master/detail filters remain distinct | FACADE | SWR <=30s | detail alias A target UNKNOWN; reject unresolved alias field |
| ERP-FRM-AR_OrderComfirmFrm / ERP-CFG-AR_OrderComfirmFrm_filter(_d) | DB-TABLE-dbo.AR_OrderTbl; DB-TABLE-dbo.AR_OrderDetailTbl | WEB-FILTER-CONTRACT; typed order-confirmation query | FACADE | SWR <=30s initially | master alias A target UNKNOWN; reject unresolved alias field |

## Contract

These bindings prove persisted filter-field references only. They do not prove that the named tables are the sole runtime sources, that navigation reaches the forms, or that filtering is authorization-safe.

For all three families:
- authorize user/company/branch/storehouse scope before query execution;
- accept only server allow-listed field IDs and operators;
- parse typed values server-side;
- use deterministic sort with a stable tie-breaker and bounded result window;
- never interpolate browser-provided table, alias or column identifiers into SQL;
- preserve master/detail filter distinction where present;
- expose visible last-updated/freshness state under SWR;
- fail closed on unresolved alias-prefixed fields.

The alias gaps are bounded C# / runtime-query verification work and do not justify inventing alias targets.

## Architecture acceptance effect

The current authoritative consolidated matrix should be read together with this delta until it is folded in. With this delta, every VERIFIED paired filter family currently published in `docs/erp/FILTER_CONFIGURATION_EVIDENCE.md` has an explicit Web + DB/API disposition.

This does not by itself make the architecture workstream complete_candidate. Other VERIFIED ERP capability inventories must still be checked for disposition completeness, and the direct C# gaps remain explicitly reserved for the next verification round.
