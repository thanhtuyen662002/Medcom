## Master/detail và chứng từ kho

`IV_InternalTransferRequestTbl` / detail đề nghị → `IV_InternalTransferBatchRequestTbl` theo BatchID, RequestID. Đợt có `IV_InternalTransferBatchTbl`, `IV_InternalTransferBatchDetailTbl`, `IV_InternalTransferBatchAssetTbl` và lịch sử. Detail có UserAutoID; danh sách tài sản nối bằng BatchDetailID.

PXK và PNK dùng InternalTransferBatchID để ràng buộc đúng đợt. Nhận từng phần dùng `IV_InternalTransferReceiptTbl` và `IV_InternalTransferReceiptLineTbl`; dòng nhận tham chiếu BatchDetailID, không cập nhật tổng nhận độc lập.

## Đồng bộ và phân nhánh

Nút Đồng bộ kiểm tra có dòng đề nghị và không có RequestID rỗng, kể cả chỉ có ký tự trắng. Core STP cũng kiểm tra trước khi thay đổi dữ liệu; thất bại không xóa chi tiết hiện có.

BatchSubmit chỉ cho bước PM 0/10/25/45, có chi tiết, hai kho khác nhau và AssignedSA. HasEquipment=1 yêu cầu AssignedTechnician, đích 20; không thiết bị đích 40. Nút Gửi TP SA kiểm tra cả header và detail không có IsEquipment=1.

## Bước kho và nhận từng phần

| Trạng thái | Ý nghĩa |
| --- | --- |
| 20 / 40 / 60 | Chờ Kỹ thuật / TP SA / Kế toán |
| 70 | Đã liên kết PXK, chờ Kho nguồn |
| 100 | Đang điều chuyển |
| 130 | Đã nhận một phần, còn số lượng |
| 120 | Đã nhận đủ / hoàn tất |

BatchReceive chỉ nguồn 100/130, đọc PNK nháp NDC đúng đợt, kiểm tra kho đích và lượng dương. So sánh theo mã hàng + lô + hạn dùng với ReceiptBalanceView; phân bổ số nhận vào dòng đợt và chốt PNK trong cùng giao dịch. Còn lượng → 130; hết lượng → 120. Khi hoàn tất thiết bị: đếm serial khớp lượng xuất, đúng ItemID, không trùng AssetID, tạo FA_Move có InternalTransferBatchID và đánh dấu nhận.

Wrapper dùng khóa ứng dụng và giao dịch; các `_ExecuteStp` là phần thực thi bên trong. Tích hợp mới gọi entry point có bảo vệ, không gọi thẳng Execute để vượt khóa.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `IV_InternalTransferRequestFrm` | Phiếu đề nghị điều chuyển nội bộ |
| `IV_InternalTransferPMFrm` | Xác nhận đề nghị điều chuyển |
| `IV_InternalTransferBatchFrm` | Đợt điều chuyển nội bộ |
| `IV_InternalTransferTechFrm` | Xác nhận thiết bị điều chuyển |
| `IV_InternalTransferSAFrm` | Phê duyệt điều chuyển nội bộ |
| `IV_InternalTransferAccountingFrm` | Xử lý điều chuyển nội bộ |
| `IV_InternalTransferWarehouseOutFrm` | Xác nhận xuất điều chuyển |
| `IV_InternalTransferWarehouseInFrm` | Xác nhận nhận điều chuyển |

## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |
| `IV_InternalTransfer_BatchSyncRequestsStp` | STP | Kiểm tra và đồng bộ đề nghị vào đợt |
| `IV_InternalTransfer_BatchSubmitStp` | STP | Entry point gửi Kỹ thuật hoặc TP SA |
| `IV_InternalTransfer_BatchSubmit_ExecuteStp` | STP nội bộ | Phân nhánh thiết bị, kiểm tra người phụ trách |
| `IV_InternalTransfer_BatchSAApproveStp` | STP | TP SA phê duyệt |
| `IV_InternalTransfer_BatchAccountingConfirmStp` | STP | Kế toán xác nhận |
| `IV_InternalTransfer_BatchDispatchStp` | STP | Chốt xuất Kho nguồn |
| `IV_InternalTransfer_BatchReceiveStp` | STP | Chốt PNK và cộng dồn số nhận |
| `IV_InternalTransferReceiptBalanceView` | View | Đã xuất, đã nhận, còn lại theo dòng |
| `IV_InternalTransfer_ValidateActionUserStp` | STP | Kiểm tra người được xử lý bước hiện tại |
