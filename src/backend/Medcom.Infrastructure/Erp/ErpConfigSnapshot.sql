-- ERP configuration snapshot for the Web drift check (read-only).
-- The same text runs in the API (embedded resource) and, through the owner's SQL runner,
-- produces the committed baseline (tools/backend/erp_config_baseline.py).
-- Rows: Category | ItemKey | Hash (SHA-256 of the UTF-16 text; NULL when the definition is not visible).
SET NOCOUNT ON;
DECLARE @forms TABLE(FID nvarchar(100) PRIMARY KEY);
INSERT @forms VALUES
  (N'AP_ApprovePurchaseRequestListFrm'),
  (N'AP_OrderFrm'),
  (N'AP_PurposeRequestListFrm'),
  (N'AR_Invoice_QRCodeFrm'),
  (N'AR_OrderAproveFrm'),
  (N'AR_OrderByContractFrm'),
  (N'AR_OrderComfirmFrm'),
  (N'FA_Move2026Frm'),
  (N'FA_Repair2026Frm'),
  (N'IV_InboundRequestFrm'),
  (N'IV_InternalTransferAccountingFrm'),
  (N'IV_InternalTransferBatchFrm'),
  (N'IV_InternalTransferPMFrm'),
  (N'IV_InternalTransferRequestFrm'),
  (N'IV_InternalTransferSAFrm'),
  (N'IV_InternalTransferTechFrm'),
  (N'IV_InternalTransferWarehouseInFrm'),
  (N'IV_InternalTransferWarehouseOutFrm'),
  (N'IV_Output_QRCodeFrm');
DECLARE @tables TABLE(name sysname PRIMARY KEY);
INSERT @tables VALUES
  (N'AP_OrderDetailTbl'),
  (N'AP_OrderTbl'),
  (N'AP_PurchaseRequestDetailTbl'),
  (N'AP_PurchaseRequestTbl'),
  (N'AR_InvoiceDetailTbl'),
  (N'AR_InvoiceQRCodeTbl'),
  (N'AR_InvoiceTbl'),
  (N'AR_OrderDetailTbl'),
  (N'AR_OrderLogTbl'),
  (N'AR_OrderTbl'),
  (N'FA_MoveDetailTbl'),
  (N'FA_MoveTbl'),
  (N'FA_RepairDetailTbl'),
  (N'FA_RepairTbl'),
  (N'IV_InboundRequestCTCPTbl'),
  (N'IV_InboundRequestDetailsTbl'),
  (N'IV_InboundRequestLogTbl'),
  (N'IV_InboundRequestNoSuitableTbl'),
  (N'IV_InboundRequestTbl'),
  (N'IV_InternalTransferBatchAssetTbl'),
  (N'IV_InternalTransferBatchDetailTbl'),
  (N'IV_InternalTransferBatchLogTbl'),
  (N'IV_InternalTransferBatchRequestTbl'),
  (N'IV_InternalTransferBatchTbl'),
  (N'IV_InternalTransferRequestDetailTbl'),
  (N'IV_InternalTransferRequestLogTbl'),
  (N'IV_InternalTransferRequestTbl'),
  (N'IV_OutputDetailTbl'),
  (N'IV_OutputQRCodeTbl'),
  (N'IV_OutputTbl');
DECLARE @modules TABLE(name sysname PRIMARY KEY);
INSERT @modules VALUES
  (N'AP_ApproveSuggestContractOrOrderReportStp'),
  (N'AP_DiscrepancyReportStp'),
  (N'AP_GoodsDeliveryReceiptReportStp'),
  (N'AP_GoodsInspectionAndReceivingReportStp'),
  (N'AP_POInboundPartial_CancelStp'),
  (N'AP_PurchaseRequest_ApproveOrRejectStp'),
  (N'AP_PurchaseRequest_CreatePOStp'),
  (N'AP_PurposeRequestListReportStp'),
  (N'AR_ContractInfoStp'),
  (N'AR_GoodsHandoverMinutesReportStp'),
  (N'AR_InvoiceLog_Stp'),
  (N'AR_Invoice_XemHopDongStp'),
  (N'AR_OrderDetail_WarningOverQuantityStp'),
  (N'AR_OrderTbl_UpdateStatusStp'),
  (N'AR_Order_CheckBeforeUpdateStp'),
  (N'AR_Order_CheckPMBeforeUpdateStp'),
  (N'AR_Order_SalesRecallFromPMStp'),
  (N'AR_Order_UpdateBBBGStp'),
  (N'AR_PurchaseQRCodeReportStp'),
  (N'CF_QRcodeStp'),
  (N'IV_InboundRequest_ChangeWorkflowStatusStp'),
  (N'IV_InboundRequest_PrepareDetailSaveStp'),
  (N'IV_InternalTransfer_BatchAccountingConfirmStp'),
  (N'IV_InternalTransfer_BatchCheckBeforeUpdateStp'),
  (N'IV_InternalTransfer_BatchCheckDeleteStp'),
  (N'IV_InternalTransfer_BatchDispatchStp'),
  (N'IV_InternalTransfer_BatchLogStp'),
  (N'IV_InternalTransfer_BatchPMCheckEditStp'),
  (N'IV_InternalTransfer_BatchQuickRejectStp'),
  (N'IV_InternalTransfer_BatchReceiveStp'),
  (N'IV_InternalTransfer_BatchRejectCurrentStepStp'),
  (N'IV_InternalTransfer_BatchReturnToPreviousStepStp'),
  (N'IV_InternalTransfer_BatchRoleCheckEditStp'),
  (N'IV_InternalTransfer_BatchSAApproveStp'),
  (N'IV_InternalTransfer_BatchSubmitStp'),
  (N'IV_InternalTransfer_BatchSyncRequestsStp'),
  (N'IV_InternalTransfer_BatchTechCheckEditStp'),
  (N'IV_InternalTransfer_BatchTechConfirmStp'),
  (N'IV_InternalTransfer_BatchUpdateStatusStp'),
  (N'IV_InternalTransfer_RequestCheckBeforeUpdateStp'),
  (N'IV_InternalTransfer_RequestCheckDeleteStp'),
  (N'IV_InternalTransfer_RequestCheckEditStp'),
  (N'IV_InternalTransfer_RequestPMCheckBeforeUpdateStp'),
  (N'IV_InternalTransfer_RequestPMCheckEditStp'),
  (N'IV_InternalTransfer_RequestPMConfirmStp'),
  (N'IV_InternalTransfer_RequestPMReturnStp'),
  (N'IV_InternalTransfer_RequestRecallFromPMStp'),
  (N'IV_InternalTransfer_RequestSendPMStp');
-- One level of what the watched procedures call (e.g. *_ExecuteStp, SY_Workflow_RequireUserRoleStp).
INSERT @modules(name)
SELECT DISTINCT d.referenced_entity_name FROM sys.sql_expression_dependencies d
JOIN sys.objects o ON o.object_id=d.referencing_id JOIN @modules m ON m.name=o.name
JOIN sys.objects r ON r.name=d.referenced_entity_name AND r.type IN ('P','FN','IF','TF','SN')
WHERE d.referenced_entity_name NOT IN (SELECT name FROM @modules);

SELECT Category, ItemKey, Hash FROM (
 -- Buttons, hooks and toolbar flags the Web mirrors.
 SELECT 'form' AS Category,
  c.FID+N'|'+c.KeyID+N'|'+ISNULL(c.SubID,N'')+N'|'+ISNULL(c.SubValue,N'') AS ItemKey,
  CONVERT(char(64),HASHBYTES('SHA2_256',STRING_AGG(CONVERT(nvarchar(max),ISNULL(c.KeyValue,N'')),NCHAR(1)) WITHIN GROUP (ORDER BY CONVERT(nvarchar(max),ISNULL(c.KeyValue,N'')))),2) AS Hash
 FROM dbo.SY_FrmCfg c JOIN @forms f ON f.FID=c.FID
 WHERE (c.KeyID=N'LYS1' AND (c.SubID LIKE N'ExecSQLWithParaButtonCtl%' OR c.SubID LIKE N'CommandButtonCtl%' OR c.SubID LIKE N'PrintButtonCtl%' OR c.SubID LIKE N'BarcodeInputCtl%')
        AND c.SubValue IN (N'BT',N'C1',N'C2',N'C4',N'CS4',N'LBEX',N'22',N'P1'))
    OR c.KeyID IN (N'EBN',N'EBE',N'EBD',N'EBS',N'EBC',N'ESS',N'ESD',N'ESDB',N'HBA',N'HBC',N'HBD',N'HBE',N'HBP',N'DMK')
 GROUP BY c.FID,c.KeyID,c.SubID,c.SubValue
 UNION ALL
 -- Every control on a watched form, to notice new buttons or attachments.
 SELECT DISTINCT 'control', c.FID+N'|'+c.SubID, NULL
 FROM dbo.SY_FrmCfg c JOIN @forms f ON f.FID=c.FID WHERE c.KeyID=N'LYS1' AND c.SubID IS NOT NULL
 UNION ALL
 -- Procedures/functions the Web or the watched buttons call; synonyms by their target.
 SELECT 'module', m.name,
  CASE WHEN o.object_id IS NULL THEN 'MISSING'
       WHEN o.type='SN' THEN CONVERT(char(64),HASHBYTES('SHA2_256',CONVERT(nvarchar(max),N'SYNONYM '+s.base_object_name)),2)
       ELSE CONVERT(char(64),HASHBYTES('SHA2_256',CONVERT(nvarchar(max),q.definition)),2) END
 FROM @modules m LEFT JOIN sys.objects o ON o.name=m.name AND SCHEMA_NAME(o.schema_id)=N'dbo'
 LEFT JOIN sys.synonyms s ON s.object_id=o.object_id LEFT JOIN sys.sql_modules q ON q.object_id=o.object_id
 UNION ALL
 -- Triggers on tables the Web writes (an INSTEAD OF trigger changed row counts on 2026-10-23).
 SELECT 'trigger', t.name+N'|'+g.name,
  CONVERT(char(64),HASHBYTES('SHA2_256',CONVERT(nvarchar(max),CASE WHEN g.is_disabled=1 THEN N'DISABLED ' ELSE N'' END+ISNULL(q.definition,N''))),2)
 FROM @tables t JOIN sys.triggers g ON g.parent_id=OBJECT_ID(N'dbo.'+t.name) LEFT JOIN sys.sql_modules q ON q.object_id=g.object_id
) x
ORDER BY Category, ItemKey;
