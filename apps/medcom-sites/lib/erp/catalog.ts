export type ScreenId="home"|"purchase-orders"|"purchase-approval"|"inbound-requests"|"transfers"|"sales"|"accounting"|"reports"|"settings";
export const screens=[
 {id:"home",label:"Không gian làm việc",group:"Tổng quan",description:"Truy cập nhanh các công việc và phân hệ."},
 {id:"purchase-orders",label:"Đơn đặt hàng mua",group:"Mua hàng",description:"Tra cứu đơn hàng và theo dõi chi tiết hàng hóa.",form:"AP_OrderFrm",menu:"050129",capability:"purchase-orders.read"},
 {id:"purchase-approval",label:"Duyệt yêu cầu mua",group:"Mua hàng",description:"Kiểm tra và phê duyệt yêu cầu mua hàng.",form:"AP_ApprovePurchaseRequestListFrm",menu:"05012"},
 {id:"inbound-requests",label:"Yêu cầu nhập kho",group:"Kho hàng",description:"Tra cứu yêu cầu nhập và số lượng theo chứng từ.",form:"IV_InboundRequestFrm",menu:"07011",capability:"inbound-requests.read"},
 {id:"transfers",label:"Điều chuyển nội bộ",group:"Kho hàng",description:"Theo dõi từng giai đoạn của quy trình điều chuyển.",form:"IV_InternalTransferRequestFrm",menu:"07010100"},
 {id:"sales",label:"Yêu cầu hóa đơn",group:"Bán hàng",description:"Yêu cầu lập hóa đơn bán hàng.",form:"AR_InvoiceRequestFrm",menu:"06023",sourceDisabled:true},
 {id:"accounting",label:"Thiết lập kết chuyển",group:"Kế toán",description:"Quản lý cấu hình kết chuyển kế toán.",form:"GJ_TransferSetupFrm",menu:"166401"},
 {id:"reports",label:"Báo cáo",group:"Phân tích",description:"Báo cáo được cấp quyền từ hệ thống ERP."},
 {id:"settings",label:"Thiết lập",group:"Hệ thống",description:"Tùy chỉnh không gian làm việc và kiểm tra kết nối."},
] as const;
export const transferStages=[
 {label:"Yêu cầu",form:"IV_InternalTransferRequestFrm",menu:"07010100"},
 {label:"Quản lý dự án",form:"IV_InternalTransferPMFrm",menu:"07010110"},
 {label:"Lô điều chuyển",form:"IV_InternalTransferBatchFrm",menu:"07010120"},
 {label:"Kỹ thuật",form:"IV_InternalTransferTechFrm",menu:"07010130"},
 {label:"SA",form:"IV_InternalTransferSAFrm",menu:"07010140"},
 {label:"Kế toán",form:"IV_InternalTransferAccountingFrm",menu:"07010150"},
 {label:"Kho xuất",form:"IV_InternalTransferWarehouseOutFrm",menu:"07010160"},
 {label:"Kho nhập",form:"IV_InternalTransferWarehouseInFrm",menu:"07010170"},
];
export function isScreen(value:string|null):value is ScreenId{return screens.some(s=>s.id===value);}
