# Locking and transaction hotspots

Evidence level: **VERIFIED textual occurrence in authoritative SQL baseline**, with runtime reachability/active-version semantics **UNKNOWN** until C# / live-catalog verification.

Source: `Medcom-Data (3)(1).zip` → `Medcom-Data.sql`, SHA-256 `2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`.

## Verified procedure-local hotspots

Static definition scan binds explicit lock/transaction constructs to these procedure identities:

| Stable ID | Verified construct | Direct table/resource evidence | Web disposition |
|---|---|---|---|
| DB-PROC-dbo.AP_ImportCost_AllocateStp | `XACT_ABORT ON`, `sp_getapplock`, `UPDLOCK,HOLDLOCK` | `AP_PurchaseTbl` | compatibility facade |
| DB-PROC-dbo.AP_ImportCost_SelectStp | `XACT_ABORT ON`, `sp_getapplock`, `UPDLOCK,HOLDLOCK` | `AP_PurchaseTbl` | compatibility facade |
| DB-PROC-dbo.AP_Service_ImportInboundCostStp | `XACT_ABORT ON`, `sp_getapplock`, `UPDLOCK,HOLDLOCK` | `AP_ServiceTbl` | compatibility facade |
| DB-PROC-dbo.CF_QRcodeStp | `XACT_ABORT OFF`, repeated `UPDLOCK,HOLDLOCK` | `AR_InvoiceTbl`, `IV_OutputTbl`, `CF_QRPackageTbl` | compatibility facade; exact transaction/error semantics require verification |
| DB-PROC-dbo.IV_ReturnRequestTransitionStp | `XACT_ABORT ON`, `UPDLOCK,HOLDLOCK` | `IV_ReturnRequestTbl` | compatibility facade |

The baseline also contains multiple `IV_InternalTransfer_*` procedures with `XACT_ABORT ON`, including batch submit/dispatch/receive/approval/accounting/status/sync and request PM send/confirm/return operations. This is direct evidence that internal-transfer behavior is command/workflow-oriented rather than generic table CRUD.

## Architecture implications

1. Browser code must never reproduce these lock patterns or choose lock hints.
2. The API owns the transaction boundary and calls typed compatibility commands.
3. Retry policy must be command-specific. A transport timeout is not proof that a locked transaction failed.
4. Application-lock resource naming, timeout and lock ownership are part of the implicit DB contract and must be extracted before replacing the corresponding procedure.
5. `XACT_ABORT OFF` on `CF_QRcodeStp` is materially different from the surrounding `XACT_ABORT ON` command family; do not normalize error handling without proving rollback/partial-effect behavior.
6. Internal-transfer Web planning should bind to the existing command family before proposing direct mutations.

## Acceptance tests for Web migration

- concurrent commands against the same purchase/service/return-request business identity;
- deadlock/lock-timeout behavior and user-visible retry guidance;
- network loss after server receipt but before acknowledgement;
- duplicate command replay;
- partial-failure behavior for the QR-code path;
- internal-transfer state transition attempted concurrently by two authorized users;
- permission/state revalidation immediately before transaction commit.

## Bounded UNKNOWNs

- Which textual definition is the deployed/live version where historical definitions coexist in the dump.
- Exact `sp_getapplock` resource strings, timeout, owner and release behavior.
- Complete mutation/side-effect set of each procedure.
- Runtime execution frequency, row cardinality, wait statistics and deadlock history.
- Whether C# wraps any of these procedures in an outer transaction.

No schema/index/locking change is proposed from static evidence alone.
