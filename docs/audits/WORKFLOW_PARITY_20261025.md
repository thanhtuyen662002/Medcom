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

## Bổ sung 26/10 — trigger ERP làm hỏng tạo/lưu đề nghị nhập trên Web
- Thử tạo đề nghị nhập trên production (00:22, ghi chú "Test web"): `Unavailable` `unexpected_affected_rows`, giao dịch hủy, không có dòng nào được lưu.
- Nguyên nhân: `IV_InboundRequest_SaveBatchAdapterTrg` (INSTEAD OF INSERT trên `IV_InboundRequestDetailsTbl`, thêm 20–23/10) chèn lại dòng với `SET NOCOUNT OFF`; client nhận tổng 2 cho 1 dòng. Web yêu cầu đúng 1.
- Thử trên tempdb: `@@ROWCOUNT` ngay sau câu lệnh luôn là số dòng của chính câu lệnh, kể cả khi trigger INSTEAD OF ghi thêm nhiều dòng.
- Sửa: kiểm số dòng ghi/xóa bằng `SET @affected=@@ROWCOUNT` (tham số đầu ra).
- Đã kiểm 26/10 (PR #200, có sự đồng ý của chủ dự án): "Gửi đặt mua hàng" PO1026/0006 tạo PO đủ `SourceAmount`/`Amount`/`BaseTotal` (100.000 VND).

## Đối chiếu lại 27/10 — sau các màn nhập hàng #204–#213
- Báo cáo lệch cấu hình trên production (10:55Z): `healthy`, 730 mục, không mục nào khác mốc 26/10.
- 15 nút quy trình nhập hàng (TM, Thủ kho, TP SA, Kỹ thuật, PM, BLĐ) và "Hủy đợt nháp": cùng thủ tục, mã `@Action`, trạng thái trước/sau và danh sách "Chọn bước gửi về" như ERP. Nút in bỏ theo quyết định chủ dự án (#210).
- Đã sửa 2 chỗ lệch:
  - Danh sách PM nhập hàng: trước đây Web hiện cả chứng từ từng giao cho PM (theo `SendTo` trong lịch sử). Nay theo T0 TN3 + FTR của `IV_GoodsQualityControlConfirmFrm`: đã qua bước PM (lịch sử 6/7) và `SendTo` hiện tại là người dùng.
  - Đợt điều chuyển: thêm nút "Gửi TP SA" (`ExecSQLWithParaButtonCtl_2`, `send-sa`). "Gửi kỹ thuật" chỉ bật khi đợt có thiết bị, "Gửi TP SA" chỉ bật khi không có (LBEX), và kiểm lại như CS4/C4 của ERP trước khi chạy `IV_InternalTransfer_BatchSubmitStp`.
- Còn chưa có trên Web: đơn bán sau SA, trả hàng, thu chi, `AR_ObjectNewRequireFrm`, `AP_Purchase2Frm`, `AP_PurchaseNKFrm`, `AP_ServiceFrm`, `PeriodLockDataFrm`, quét QR Viettel Post.
