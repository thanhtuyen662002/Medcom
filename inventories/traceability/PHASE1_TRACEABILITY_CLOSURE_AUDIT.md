# Phase 1 ERP-Web-DB traceability closure audit

Status: **PARTIAL / GATE 4 FAIL** as of 2026-10-01.

The current matrix in `PHASE1_BOUND_CONTRACTS.md` is useful and correctly
labels several unknowns, but it is a bounded join rather than an exhaustive
traceability catalog. This audit defines the closure rule and preserves the
known pilot dispositions without inventing missing bindings.

## Evidence already joined

| ERP capability/evidence | Web disposition | DB/API disposition | Confidence |
|---|---|---|---|
| Persisted DAT layouts and filter metadata | Versioned Screen Definition and typed filter descriptors; desktop/mobile schemas | Existing `SY_*` metadata as server input; additive Web config only for proven gaps | VERIFIED structure; precedence UNKNOWN |
| `ERP-FRM-AR_InvoiceRequestFrm` | Sales request pilot candidate | `AR_InvoiceRequestTbl` + `AR_InvoiceRequestDetailTbl` typed query candidate | CORROBORATED for packaged form/table names; menu/mutation UNKNOWN |
| `ERP-FRM-IV_InboundRequestFrm` | Inbound request pilot candidate | `IV_InboundRequestTbl` + `IV_InboundRequestDetailsTbl` typed query candidate | CORROBORATED for packaged form/table names; aliases/mutation UNKNOWN |
| `ERP-FRM-AP_ApprovePurchaseRequestListFrm` | Purchase approval pilot candidate | `AP_PurchaseRequestTbl` + `AP_PurchaseRequestDetailTbl` typed query candidate | CORROBORATED for filter references; transition UNKNOWN |
| `ERP-FRM-AP_OrderFrm` | Purchase order pilot candidate | `AP_OrderTbl` + `AP_OrderDetailTbl` typed query candidate | CORROBORATED for filter references; mutation UNKNOWN |
| Internal transfer workflow family | Mobile/desktop pilot slot reserved | `IV_InternalTransfer_*` procedure family proves command-oriented area, but exact form/master/detail/query binding is UNKNOWN | Static procedure evidence only |
| Candidate-current RPX files | Typed report/query adapter with reachability and export authorization gates | Existing views/procedures only after exact dependency/parameter extraction | Candidate package evidence; reachability UNKNOWN |
| `SY_Menu`, `SY_Frm*`, `SY_UserBranch`, `SY_UserStorehouse` | Authorized navigation/config resolver | Compatibility facade; server derives scope/capability | Object existence VERIFIED; enforcement semantics UNKNOWN |

## Why the join is not closed

1. The DB branch does not retain the exact object/column/dependency records
   needed to promote candidate view names such as `AR_OrderViewData`,
   `vIS_Input` and `vIS_InputDetail` to VERIFIED DB objects.
2. The ERP package proves persisted filter-field references, but not runtime
   alias joins, menu reachability, permission evaluation, mutation hooks or
   transaction ownership.
3. No row in the current matrix covers every one of the 232 DAT artifacts,
   786 candidate-current RPX files, 23 corroborated form IDs and all verified
   config/action surfaces with a stable Web and DB disposition.
4. Exact Tool.dll login/session behavior and internal-transfer form/data
   binding remain source-verification blockers by design.

## Closure acceptance

Gate 4 can move to PASS only when a generated traceability export contains, for
each VERIFIED ERP ID in scope:

- ERP source path and evidence level;
- stable Web capability/screen/report ID;
- typed API query/command/report disposition;
- exact DB object IDs or a bounded UNKNOWN reason;
- permissions and authoritative data scope;
- freshness and coexistence policy;
- owner and acceptance test for every unresolved fact.

The export must fail closed on unresolved aliases and must not treat a client
field, table/view name, procedure name or SQL fragment as execution authority.

## Pilot blockers preserved

| Blocker | Owner | Acceptance |
|---|---|---|
| `TRC-DB-001` sanitized DB catalog/dependency export | DB + Lead | Every referenced DB ID resolves to a catalog row and dependency edges are reviewable. |
| `TRC-ERP-001` exact sales-request menu/action binding | ERP + Lead | Live/package evidence maps the Vietnamese path to `ERP-FRM-AR_InvoiceRequestFrm` and records action/state contracts. |
| `TRC-ERP-002` internal-transfer form/master/detail/query binding | ERP + DB + Lead | Exact form and data objects are evidenced; no guessed route or mutation is accepted. |
| `TRC-ERP-003` purchase approval transition contract | ERP + DB | State preconditions, command/SP, transaction ownership and authoritative reread are evidenced. |
| `TRC-TOOL-001` Tool.dll runtime/API/session verification | ERP + Lead | Adapter/bridge decision and contract tests cover login, logout, validate, expiry, errors and thread safety. |
| `TRC-AUTH-001` permission/scope precedence | Architecture + ERP + DB | Server-derived capability and company/branch/storehouse scope are proven and tamper tests pass. |

Until these acceptance rows are closed, this file must retain PARTIAL status.
