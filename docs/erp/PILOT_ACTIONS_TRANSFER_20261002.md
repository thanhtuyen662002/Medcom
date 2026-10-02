# Transfer action configuration, D01 source preparation

Current source set: owner-attachment-20261002. ERP archive SHA256 d5fe49f8e58de89fc0b9972a116a6c8f673ab9f9b326c626708d0b5d01fc5783; SQL archive SHA256 6a74eb02dc747e9c6ab679f69ca515783a8724ad767f6702fcebd28f195b1144. Full SQL member 1,212,595,716 bytes, CRC32 16a9a7e6, SHA256 61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096. Materialized owner files, recomputed archive hashes and used full member verifier before analysis. Private artifacts remain outside the checkout.

SY_Menu, SY_FrmLstTbl and SY_FrmCfg are direct source configuration evidence. These associations are not inferred from procedure names. Eight DAT members were decompressed with ZIP CRC verification; their grdListDoc identity columns match request DocumentID and batch BatchID. Runtime interpretation/precedence of SaveContinue and generic control flags is UNKNOWN; their configuration strings are recorded without claiming execution.

| Form | Menu | Table/key | SQL binding line |
|---|---|---|---|
| IV_InternalTransferAccountingFrm | 07010150 | IV_InternalTransferBatchTbl.BatchID | 309909 |
| IV_InternalTransferBatchFrm | 07010120 | IV_InternalTransferBatchTbl.BatchID | 309910 |
| IV_InternalTransferPMFrm | 07010110 | IV_InternalTransferRequestTbl.DocumentID | 309911 |
| IV_InternalTransferRequestFrm | 07010100 | IV_InternalTransferRequestTbl.DocumentID | 309912 |
| IV_InternalTransferSAFrm | 07010140 | IV_InternalTransferBatchTbl.BatchID | 309913 |
| IV_InternalTransferTechFrm | 07010130 | IV_InternalTransferBatchTbl.BatchID | 309914 |
| IV_InternalTransferWarehouseInFrm | 07010170 | IV_InternalTransferBatchTbl.BatchID | 309915 |
| IV_InternalTransferWarehouseOutFrm | 07010160 | IV_InternalTransferBatchTbl.BatchID | 309916 |

| Form/control | Caption | Command | Config C4 / CS4 lines | Trusted config status list | Before/after |
|---|---|---|---|---|---|
| IV_InternalTransferAccountingFrm:ExecSQLWithParaButtonCtl | Gửi Kho nguồn | IV_InternalTransfer_BatchAccountingConfirmStp | 305823 / 306003 | [60, 61] | SaveContinue / Reload |
| IV_InternalTransferAccountingFrm:ExecSQLWithParaButtonCtl_1 | Từ chối nhanh | IV_InternalTransfer_BatchQuickRejectStp | 304219 / 304455 | [60, 61] | SaveContinue / Reload |
| IV_InternalTransferAccountingFrm:ExecSQLWithParaButtonCtl_2 | Chọn bước gửi về | IV_InternalTransfer_BatchUpdateStatusStp | 304256 / 303984 | [60, 61] | SaveContinue / Reload |
| IV_InternalTransferBatchFrm:ExecSQLWithParaButtonCtl | Đồng bộ đề nghị | IV_InternalTransfer_BatchSyncRequestsStp | 305932 / 295877 | [0, 10, 25, 45] | SaveContinue / Reload |
| IV_InternalTransferBatchFrm:ExecSQLWithParaButtonCtl_1 | Gửi kỹ thuật | IV_InternalTransfer_BatchSubmitStp | 302593 / 295629 | [0, 10, 25, 45] | SaveContinue / Reload |
| IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl | Đồng ý điều chuyển | IV_InternalTransfer_RequestPMConfirmStp | 306290 / 301841 | [10] | SaveContinue / Reload |
| IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl_1 | Từ chối nhanh | IV_InternalTransfer_RequestPMReturnStp | 305217 / 305403 | [10] | SaveContinue / Reload |
| IV_InternalTransferRequestFrm:ExecSQLWithParaButtonCtl | Gửi PM | IV_InternalTransfer_RequestSendPMStp | 302962 / 301808 | [0, 30] | SaveContinue / Reload |
| IV_InternalTransferSAFrm:ExecSQLWithParaButtonCtl | Gửi Kế toán | IV_InternalTransfer_BatchSAApproveStp | 301728 / 304097 | [40, 41] | SaveContinue / Reload |
| IV_InternalTransferSAFrm:ExecSQLWithParaButtonCtl_1 | Từ chối nhanh | IV_InternalTransfer_BatchQuickRejectStp | 304178 / 304425 | [40, 41] | SaveContinue / Reload |
| IV_InternalTransferSAFrm:ExecSQLWithParaButtonCtl_2 | Chọn bước gửi về | IV_InternalTransfer_BatchUpdateStatusStp | 299124 / 305421 | [40, 41] | SaveContinue / Reload |
| IV_InternalTransferTechFrm:ExecSQLWithParaButtonCtl | Gửi TP SA | IV_InternalTransfer_BatchTechConfirmStp | 296402 / 295566 | [20, 21] | SaveContinue / Reload |
| IV_InternalTransferTechFrm:ExecSQLWithParaButtonCtl_1 | Từ chối nhanh | IV_InternalTransfer_BatchQuickRejectStp | 303487 / 297501 | [20, 21] | SaveContinue / Reload |
| IV_InternalTransferWarehouseInFrm:ExecSQLWithParaButtonCtl | Xác nhận nhận hàng | IV_InternalTransfer_BatchReceiveStp | 302934 / 304358 | [100, 130] | SaveContinue / Reload |
| IV_InternalTransferWarehouseOutFrm:ExecSQLWithParaButtonCtl | Xác nhận xuất / Gửi Kho đích | IV_InternalTransfer_BatchDispatchStp | 305703 / 303400 | [70] | SaveContinue / Reload |
| IV_InternalTransferWarehouseOutFrm:ExecSQLWithParaButtonCtl_1 | Từ chối nhanh | IV_InternalTransfer_BatchQuickRejectStp | 298950 / 302506 | [70] | SaveContinue / Reload |
| IV_InternalTransferWarehouseOutFrm:ExecSQLWithParaButtonCtl_2 | Chọn bước gửi về | IV_InternalTransfer_BatchUpdateStatusStp | 305588 / 302905 | [70] | SaveContinue / Reload |

`transfer-action-catalog.ts` contains stable form/control IDs, direct source-line evidence and checksummed UTF-8 procedure extracts, never command text or real transaction rows. The 17 source groups all project writeEnabled=false. This is a pure mapping unit, not an integrated action API/UI. Menu isDisable=0 and isNotCheckPermission=NULL are observed source values, not Web grants. Never ship permission bypass, arbitrary client status strings or interpolation into SQL.

All 28 transfer procedure definitions were extracted from the verified full member. Selected request and batch workflows were inspected directly. PM confirm/return use IF @Old<>10 without IS NULL denial after assignment-filtered reads; missing/nonassigned observations must fail closed at the BE boundary. Status/assignment validation outside transaction and UPDATE by key without an observed status/version comparison leave a concurrency gap. Server-authoritative atomic authorization, effects and idempotent receipts remain prerequisites. Request nvarchar(50) cannot safely be coerced into varchar(30) without length/encoding round-trip proof.

Another source discrepancy: request PM1 lookup uses primary BranchID equality and PM2 lookup excludes that primary branch; RequestSendPMStp also accepts SY_UserBranch membership for PM1 and permits any enabled PM for PM2. Record the divergence; do not silently choose client lookup over procedure/server policy. BatchReceiveStp replaces input-document parameter with the linked/latest NDC document, compares input quantities against actual issued quantity, and derives status 120 vs 130 from actual received/issued differences. It is not generic CRUD or a direct input-document override.

One meaningful D01 unit completed (source-backed typed action projection + regressions), below the 4–6 target because the owner steered the session back to BE Commands. No live actions, UI validators or outcome reducer were claimed complete. The successor needs accepted command/admission/outcome contracts, reviewed server-side effect/authorization/concurrency rules, form wiring and end-to-end real-host tests. Complete five-pilot and remaining ERP coverage remain open.

The new pilot-actions*.json inventory path needs lead registration in the exact source-directory validator; it is intentionally not added to a directory that would fail CI. Existing finite manifest/source members were preserved; lead request is in goal #45. Real-host, deployed trigger version and legacy form runtime acceptance: UNKNOWN.
