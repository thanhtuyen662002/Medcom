# Đối chiếu quy trình Web ↔ ERP (25/10/2026)

Nguồn ERP: `SY_FrmCfg` (LYS1 nút: BT/C4/CS4/LBEX; hook EBE/EBD/EBS/ESS; ẩn nút HBA/HBC/HBD/HBE/HBP) và định nghĩa thủ tục trong `sys.sql_modules`, đọc chỉ-đọc trên MedData ngày 25/10. Nguồn Web: `ErpScreenCatalog` (bản chụp cấu hình 10–11/10), `ErpActionRules`, `ErpWorkflowRules`, `SqlErpScreenEffects`, `SqlErpWorkflowEffects`.

## Phạm vi
- ERP có khoảng 48 form có nút quy trình; Web có 19.
- Chưa có trên Web: đơn bán sau SA (`AR_OrderConfirmConditionFrm`, `AR_OrderApproveShipBillFrm`, `AR_OrderShipFrm`); nhập hàng sau TM (`IV_GoodsStatusConfirmFrm`, `IV_GoodsInfoControlFrm`, `IV_GoodsQualityControlConfirmFrm`, `IV_IncomingShipmentStatusFrm`, `IV_CargoHandlingPlanApprovalFrm`); trả hàng (`IV_ReturnRequest_*`, `IV_StockReturnRequestFrm`); thu chi (`CS_PaymentPlan*`, `CS_ReceiptPlan*`); `AR_ObjectNewRequireFrm`, `AP_Purchase2Frm`, `AP_PurchaseNKFrm`, `AP_ServiceFrm`, `PeriodLockDataFrm`.

## Khớp
- 8 bước điều chuyển nội bộ: gọi đúng thủ tục ERP. `IV_InternalTransfer_BatchQuickRejectStp` và `IV_InternalTransfer_BatchUpdateStatusStp` là synonym (21/10) trỏ tới `BatchRejectCurrentStepStp` / `BatchReturnToPreviousStepStp`; Web truyền tham số theo vị trí nên khớp chữ ký mới.
- Đơn bán NVKD/PM/SA và thu hồi: cùng `AR_OrderTbl_UpdateStatusStp` / `AR_Order_*Check*`; sau lưu cập nhật `AddressA` và `BaseTotal` như `AR_Order_UpdateBBBGStp`.

## Lệch logic — đã sửa (PR này)
| Màn / nút | Trước | Sau |
|---|---|---|
| Đề nghị mua — Gửi đặt mua hàng | Web tự INSERT PO, bỏ trống `SourceAmount`, `Amount`, `BaseTotal`, không kiểm tỷ giá/số lượng | `AP_PurchaseRequest_CreatePOStp` |
| Đề nghị nhập — Gửi BLĐ / Gửi Thủ kho | UPDATE trạng thái + log trực tiếp | `IV_InboundRequest_ChangeWorkflowStatusStp` (`TM_SENDBLD` / `TM_SENDWH`): vai trò TM theo chi nhánh, lô/hạn/số lượng > 0, khóa đồng thời |
| Duyệt đề nghị mua — Duyệt / Không duyệt | UPDATE trực tiếp | `AP_PurchaseRequest_ApproveOrRejectStp`: quyền màn hình, bắt buộc lý do khi không duyệt, chặn khi đã có PO |
| Đơn bán — Lưu | Không kiểm số lượng hợp đồng | Hook EBS `AR_OrderDetail_WarningOverQuantityStp` trên dòng đã ghi; có dòng vượt → từ chối `sales_quantity_exceeds_contract` (MsgType 1 = từ chối theo quy ước ERP; ERP chưa có bằng chứng EBS chỉ cảnh báo) |
| Mọi lệnh | THROW của thủ tục ERP → `erp_command_unavailable`, mất câu báo | `Conflict` + `native_action_rejected` + `message` là câu ERP; frontend hiển thị nguyên câu |

Dữ liệu: 8/10 PO tạo từ đề nghị mua có dòng thiếu thành tiền, 7/10 thiếu `BaseTotal` (ngày 13/05–13/10; không phải tất cả do Web). Chưa sửa dữ liệu cũ — cần chủ dự án quyết định.

## Còn thiếu trên 19 màn hiện có
- Đợt điều chuyển: nút "Gửi TP SA" riêng cho đợt không thiết bị (Web gộp vào "Gửi kỹ thuật").
- Đề nghị nhập: "Hủy đợt nháp" (`AP_POInboundPartial_CancelStp`), 2 nút in, ảnh hư hỏng (webcam) và link ảnh.
- Duyệt đơn bán (SA): "In Biên bản bàn giao". Quét QR bán hàng: Viettel Post.
