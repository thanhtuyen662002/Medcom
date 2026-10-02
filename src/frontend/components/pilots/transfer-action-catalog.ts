// Sanitized exact-source configuration projection; no SQL execution or Web authorization.
export const transferActions = [
  {
    "id": "IV_InternalTransferAccountingFrm:ExecSQLWithParaButtonCtl",
    "formId": "IV_InternalTransferAccountingFrm",
    "controlId": "ExecSQLWithParaButtonCtl",
    "label": "Gửi Kho nguồn",
    "menu": {
      "menuId": "07010150",
      "sourceLine": 319989
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309909
    },
    "procedure": "IV_InternalTransfer_BatchAccountingConfirmStp",
    "procedureSha256": "7dc5691b93ae5df73db326da515cb327164eb824c066f5296748b7239ca6274c",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      60,
      61
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 295746,
      "C4": 305823,
      "CS4": 306003,
      "C2": 304113,
      "C3": 302040
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferAccountingFrm:ExecSQLWithParaButtonCtl_1",
    "formId": "IV_InternalTransferAccountingFrm",
    "controlId": "ExecSQLWithParaButtonCtl_1",
    "label": "Từ chối nhanh",
    "menu": {
      "menuId": "07010150",
      "sourceLine": 319989
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309909
    },
    "procedure": "IV_InternalTransfer_BatchQuickRejectStp",
    "procedureSha256": "7ba4627386c6b271030faf102cb50428457321033670ef05a1aafc4cd891fb17",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      60,
      61
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 302501,
      "C4": 304219,
      "CS4": 304455,
      "C2": 296403,
      "C3": 306188
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferAccountingFrm:ExecSQLWithParaButtonCtl_2",
    "formId": "IV_InternalTransferAccountingFrm",
    "controlId": "ExecSQLWithParaButtonCtl_2",
    "label": "Chọn bước gửi về",
    "menu": {
      "menuId": "07010150",
      "sourceLine": 319989
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309909
    },
    "procedure": "IV_InternalTransfer_BatchUpdateStatusStp",
    "procedureSha256": "23c92e14134ec6f9bed2810d13e8ddb65222ff7f972b71d9e160c573875a6c3b",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      60,
      61
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 298006,
      "C4": 304256,
      "CS4": 303984,
      "C2": 297983,
      "C3": 299136
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferBatchFrm:ExecSQLWithParaButtonCtl",
    "formId": "IV_InternalTransferBatchFrm",
    "controlId": "ExecSQLWithParaButtonCtl",
    "label": "Đồng bộ đề nghị",
    "menu": {
      "menuId": "07010120",
      "sourceLine": 319986
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309910
    },
    "procedure": "IV_InternalTransfer_BatchSyncRequestsStp",
    "procedureSha256": "fde4d476d04e6f3533c63dafd769ab80c3c425b4dc33bc4d316cffbe39162a51",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      0,
      10,
      25,
      45
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 304284,
      "C4": 305932,
      "CS4": 295877,
      "C2": 304026,
      "C3": 303335
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferBatchFrm:ExecSQLWithParaButtonCtl_1",
    "formId": "IV_InternalTransferBatchFrm",
    "controlId": "ExecSQLWithParaButtonCtl_1",
    "label": "Gửi kỹ thuật",
    "menu": {
      "menuId": "07010120",
      "sourceLine": 319986
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309910
    },
    "procedure": "IV_InternalTransfer_BatchSubmitStp",
    "procedureSha256": "425597ca604f57dcf18e8be03a288ec946e892c620a60e372e085bf985fccde6",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      0,
      10,
      25,
      45
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 306104,
      "C4": 302593,
      "CS4": 295629,
      "C2": 299132,
      "C3": 303905
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl",
    "formId": "IV_InternalTransferPMFrm",
    "controlId": "ExecSQLWithParaButtonCtl",
    "label": "Đồng ý điều chuyển",
    "menu": {
      "menuId": "07010110",
      "sourceLine": 319985
    },
    "binding": {
      "table": "IV_InternalTransferRequestTbl",
      "key": "DocumentID",
      "sourceLine": 309911
    },
    "procedure": "IV_InternalTransfer_RequestPMConfirmStp",
    "procedureSha256": "6ed96f40bb53ec1ba950b21040e01bff6536d004e30ede93b988a91d783321da",
    "beforeCheck": "IV_InternalTransfer_RequestPMCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      10
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 302000,
      "C4": 306290,
      "CS4": 301841,
      "C2": 305967,
      "C3": 305974
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl_1",
    "formId": "IV_InternalTransferPMFrm",
    "controlId": "ExecSQLWithParaButtonCtl_1",
    "label": "Từ chối nhanh",
    "menu": {
      "menuId": "07010110",
      "sourceLine": 319985
    },
    "binding": {
      "table": "IV_InternalTransferRequestTbl",
      "key": "DocumentID",
      "sourceLine": 309911
    },
    "procedure": "IV_InternalTransfer_RequestPMReturnStp",
    "procedureSha256": "a7225b1ed64667ca16b8edeb7216009d9b1d9ad4d8bd85c289eb8db7e802fb49",
    "beforeCheck": "IV_InternalTransfer_RequestPMCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      10
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 302161,
      "C4": 305217,
      "CS4": 305403,
      "C2": 303198,
      "C3": 305202
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferRequestFrm:ExecSQLWithParaButtonCtl",
    "formId": "IV_InternalTransferRequestFrm",
    "controlId": "ExecSQLWithParaButtonCtl",
    "label": "Gửi PM",
    "menu": {
      "menuId": "07010100",
      "sourceLine": 319984
    },
    "binding": {
      "table": "IV_InternalTransferRequestTbl",
      "key": "DocumentID",
      "sourceLine": 309912
    },
    "procedure": "IV_InternalTransfer_RequestSendPMStp",
    "procedureSha256": "a1f9a927c556de3fb81b0711de794487d2af22def3ce136afac78bf38bb6573d",
    "beforeCheck": "IV_InternalTransfer_RequestCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      0,
      30
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 299125,
      "C4": 302962,
      "CS4": 301808,
      "C2": 304079,
      "C3": 302978
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferSAFrm:ExecSQLWithParaButtonCtl",
    "formId": "IV_InternalTransferSAFrm",
    "controlId": "ExecSQLWithParaButtonCtl",
    "label": "Gửi Kế toán",
    "menu": {
      "menuId": "07010140",
      "sourceLine": 319988
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309913
    },
    "procedure": "IV_InternalTransfer_BatchSAApproveStp",
    "procedureSha256": "cff101d5a9c4c8140c8ab1105311d6f39e3a0248dd6385053a563e0dcad0c5be",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      40,
      41
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 305395,
      "C4": 301728,
      "CS4": 304097,
      "C2": 304868,
      "C3": 305532
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferSAFrm:ExecSQLWithParaButtonCtl_1",
    "formId": "IV_InternalTransferSAFrm",
    "controlId": "ExecSQLWithParaButtonCtl_1",
    "label": "Từ chối nhanh",
    "menu": {
      "menuId": "07010140",
      "sourceLine": 319988
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309913
    },
    "procedure": "IV_InternalTransfer_BatchQuickRejectStp",
    "procedureSha256": "7ba4627386c6b271030faf102cb50428457321033670ef05a1aafc4cd891fb17",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      40,
      41
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 302900,
      "C4": 304178,
      "CS4": 304425,
      "C2": 295778,
      "C3": 303753
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferSAFrm:ExecSQLWithParaButtonCtl_2",
    "formId": "IV_InternalTransferSAFrm",
    "controlId": "ExecSQLWithParaButtonCtl_2",
    "label": "Chọn bước gửi về",
    "menu": {
      "menuId": "07010140",
      "sourceLine": 319988
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309913
    },
    "procedure": "IV_InternalTransfer_BatchUpdateStatusStp",
    "procedureSha256": "23c92e14134ec6f9bed2810d13e8ddb65222ff7f972b71d9e160c573875a6c3b",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      40,
      41
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 297970,
      "C4": 299124,
      "CS4": 305421,
      "C2": 303251,
      "C3": 305837
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferTechFrm:ExecSQLWithParaButtonCtl",
    "formId": "IV_InternalTransferTechFrm",
    "controlId": "ExecSQLWithParaButtonCtl",
    "label": "Gửi TP SA",
    "menu": {
      "menuId": "07010130",
      "sourceLine": 319987
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309914
    },
    "procedure": "IV_InternalTransfer_BatchTechConfirmStp",
    "procedureSha256": "c118013ba92ba5e3249b4fa679a78d86b57449d55aad05bc556899c6ba655239",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      20,
      21
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 303364,
      "C4": 296402,
      "CS4": 295566,
      "C2": 295610,
      "C3": 306291
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferTechFrm:ExecSQLWithParaButtonCtl_1",
    "formId": "IV_InternalTransferTechFrm",
    "controlId": "ExecSQLWithParaButtonCtl_1",
    "label": "Từ chối nhanh",
    "menu": {
      "menuId": "07010130",
      "sourceLine": 319987
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309914
    },
    "procedure": "IV_InternalTransfer_BatchQuickRejectStp",
    "procedureSha256": "7ba4627386c6b271030faf102cb50428457321033670ef05a1aafc4cd891fb17",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      20,
      21
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 302372,
      "C4": 303487,
      "CS4": 297501,
      "C2": 295893,
      "C3": 305662
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferWarehouseInFrm:ExecSQLWithParaButtonCtl",
    "formId": "IV_InternalTransferWarehouseInFrm",
    "controlId": "ExecSQLWithParaButtonCtl",
    "label": "Xác nhận nhận hàng",
    "menu": {
      "menuId": "07010170",
      "sourceLine": 319991
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309915
    },
    "procedure": "IV_InternalTransfer_BatchReceiveStp",
    "procedureSha256": "3514fa7d2f090fb44c0516d0d0cb808a439d89fd962b6999c42b432c76983392",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      100,
      130
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 302382,
      "C4": 302934,
      "CS4": 304358,
      "C2": 303009,
      "C3": 305946
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferWarehouseOutFrm:ExecSQLWithParaButtonCtl",
    "formId": "IV_InternalTransferWarehouseOutFrm",
    "controlId": "ExecSQLWithParaButtonCtl",
    "label": "Xác nhận xuất / Gửi Kho đích",
    "menu": {
      "menuId": "07010160",
      "sourceLine": 319990
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309916
    },
    "procedure": "IV_InternalTransfer_BatchDispatchStp",
    "procedureSha256": "dc44a89aa84561dcc3e62233d1ba6c1cceba11586d5ce0806ce9902a6d128381",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      70
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 302409,
      "C4": 305703,
      "CS4": 303400,
      "C2": 304380,
      "C3": 304547
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferWarehouseOutFrm:ExecSQLWithParaButtonCtl_1",
    "formId": "IV_InternalTransferWarehouseOutFrm",
    "controlId": "ExecSQLWithParaButtonCtl_1",
    "label": "Từ chối nhanh",
    "menu": {
      "menuId": "07010160",
      "sourceLine": 319990
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309916
    },
    "procedure": "IV_InternalTransfer_BatchQuickRejectStp",
    "procedureSha256": "7ba4627386c6b271030faf102cb50428457321033670ef05a1aafc4cd891fb17",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      70
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 305101,
      "C4": 298950,
      "CS4": 302506,
      "C2": 304917,
      "C3": 298007
    },
    "uiOnly": true,
    "writeEnabled": false
  },
  {
    "id": "IV_InternalTransferWarehouseOutFrm:ExecSQLWithParaButtonCtl_2",
    "formId": "IV_InternalTransferWarehouseOutFrm",
    "controlId": "ExecSQLWithParaButtonCtl_2",
    "label": "Chọn bước gửi về",
    "menu": {
      "menuId": "07010160",
      "sourceLine": 319990
    },
    "binding": {
      "table": "IV_InternalTransferBatchTbl",
      "key": "BatchID",
      "sourceLine": 309916
    },
    "procedure": "IV_InternalTransfer_BatchUpdateStatusStp",
    "procedureSha256": "23c92e14134ec6f9bed2810d13e8ddb65222ff7f972b71d9e160c573875a6c3b",
    "beforeCheck": "IV_InternalTransfer_BatchCheckBeforeUpdateStp",
    "allowedSourceStatuses": [
      70
    ],
    "preAction": "SaveContinue",
    "postAction": "Reload",
    "sourceLines": {
      "BT": 303270,
      "C4": 305588,
      "CS4": 302905,
      "C2": 305772,
      "C3": 304201
    },
    "uiOnly": true,
    "writeEnabled": false
  }
] as const;

export type TransferAction = (typeof transferActions)[number];
export function sourceActionsForForm(formId: string): readonly TransferAction[] {
  return transferActions.filter(action => action.formId === formId);
}
