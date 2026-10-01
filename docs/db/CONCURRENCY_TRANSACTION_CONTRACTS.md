# Concurrency and transaction contracts

Evidence level: **VERIFIED** for source observations; migration conclusions are explicitly labelled.

Source: authoritative `Medcom-Data (3)(1).zip` → `Medcom-Data.sql`, SHA-256 `2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`.

This artifact contains sanitized SQL metadata only. It does not reproduce transaction rows, credentials, or sensitive source values.

## Verified locking contracts

The dump contains explicit `UPDLOCK, HOLDLOCK` usage in these stable procedure IDs:

- `DB-PROCEDURE-dbo.AP_ImportCost_AllocateStp` locks `DB-TABLE-dbo.AP_PurchaseTbl`.
- `DB-PROCEDURE-dbo.AP_ImportCost_SelectStp` locks `DB-TABLE-dbo.AP_PurchaseTbl`.
- `DB-PROCEDURE-dbo.AP_Service_ImportInboundCostStp` locks `DB-TABLE-dbo.AP_ServiceTbl`.
- `DB-PROCEDURE-dbo.CF_QRcodeStp` locks document/package rows in `DB-TABLE-dbo.AR_InvoiceTbl`, `DB-TABLE-dbo.IV_OutputTbl`, and `DB-TABLE-dbo.CF_QRPackageTbl`.
- `DB-PROCEDURE-dbo.IV_ReturnRequestTransitionStp` locks `DB-TABLE-dbo.IV_ReturnRequestTbl`.

The three import-cost/service procedures above also call `sys.sp_getapplock`. This is direct evidence that correctness for those operations depends on more than ordinary CRUD row writes.

## Verified transaction-policy surface

The dump contains procedures explicitly enabling `XACT_ABORT ON` across import-cost/import-tax, purchase/output, sales recall, internal-transfer batch/request, and return-request transition operations. `DB-PROCEDURE-dbo.CF_QRcodeStp` and `DB-PROCEDURE-dbo.QRCodeReportStp` explicitly set `XACT_ABORT OFF`; `DB-PROCEDURE-dbo.AR_OrderDetail_ShowStockStp` also explicitly sets it OFF.

This mixed policy is a compatibility contract: a Web data layer must not impose a blanket assumption that all stored procedures have identical rollback/error semantics.

## Web reuse disposition

- Procedures with explicit application locks or update/hold locks: **compatibility facade** until their command semantics, lock resource naming, timeout/error behavior, and retry contract are fully mapped.
- Existing transaction-bearing business procedures: prefer **reuse behind typed server commands** during coexistence where behavior is verified; do not decompose them into browser-driven multi-call CRUD sequences.
- Client retries after timeout/network ambiguity: **not safe by default**. Idempotency is UNKNOWN unless a procedure-specific contract proves it.
- Do not add Web configuration tables to solve transaction semantics; this is an API/command-boundary concern.

## Risks and required verification

1. **Duplicate retry / ambiguous acknowledgement** — a committed DB transaction can outlive a lost HTTP acknowledgement. Detection: command correlation and authoritative reread. Test: disconnect after command submission and replay.
2. **Lock-order deadlock** — explicit row/application locks protect invariants but can deadlock with other write paths if acquisition order differs. Exact cross-procedure lock order is **UNKNOWN**. Test with concurrent conflicting command pairs and capture SQL deadlock graphs.
3. **Lock timeout/user experience** — application-lock timeout values and caller handling require procedure-body/API mapping; treat as **UNKNOWN** where not separately catalogued.
4. **Nested transaction/savepoint semantics** — some procedures participate in an existing transaction rather than assuming sole ownership. Exact behavior must be preserved by the server facade and tested before replacement.
5. **Mixed XACT_ABORT behavior** — error recovery and partial-work expectations must be verified per procedure; never normalize this silently in a generic repository layer.

## C# verification queue

The SQL dump cannot prove which UI actions invoke each procedure, whether callers retry, what transaction scope the application opens around calls, or how lock/error codes are translated to users. Those items remain **UNKNOWN** for the incoming C# verification round.

Workstream remains active; this is not a `complete_candidate` claim.
