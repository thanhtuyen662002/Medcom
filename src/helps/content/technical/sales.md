## Chuỗi màn hình và dữ liệu

Đơn bán hàng dùng `AR_OrderTbl` / `AR_OrderDetailTbl`, lịch sử `AR_OrderLogTbl`. Các form NVKD → PM → SA → Kỹ thuật → Kế toán → Kho cùng xử lý đơn, không phải sáu master độc lập.

## Trạng thái chuyển việc

| ID | Ý nghĩa |
| --- | --- |
| 11 / 12 | Yêu cầu NVKD xem lại / Đã gửi PM |
| 13 / 14 | Yêu cầu PM xem lại / Đã gửi SA |
| 15 / 16 | Yêu cầu SA xem lại / Đã gửi Kỹ thuật |
| 17 / 18 | Yêu cầu Kỹ thuật xem lại / Đã gửi Kế toán |
| 19 / 20 | Yêu cầu Kế toán xem lại / Đã gửi Thủ kho |

Danh mục vẫn có mã trạng thái cũ; không suy diễn mã tăng dần thành mức hoàn tất giao hàng. Tiến độ giao là trục riêng.

## Thu hồi và chứng từ xuất

`AR_Order_SalesRecallFromPMStp` chỉ cho người tạo thu hồi nguồn 12 → 11, xóa SendTo và ghi lịch sử trong giao dịch. Không cho thu hồi đơn đã được PM chuyển tiếp.

`AR_OrderTbl_UpdateRefDoc` là trigger khi đổi DocumentID của đơn: đổi `AR_InvoiceOrderDetailTbl.OrderNo` tương ứng. Liên kết dòng hóa đơn/đơn cần đối chiếu qua bảng này. Cấu hình nút Kế toán kiểm tra chứng từ xuất trước khi gửi Kho; không chỉ đọc trạng thái AR_OrderTbl.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `AR_OrderByContractFrm` | Quản lý đơn hàng |
| `AR_OrderComfirmFrm` | Xác nhận đơn hàng |
| `AR_OrderAproveFrm` | Duyệt đơn hàng |
| `AR_OrderConfirmConditionFrm` | Xác nhận tình trạng hàng hoá |
| `AR_OrderApproveShipBillFrm` | Duyệt, PXK và hoá đơn |
| `AR_OrderShipFrm` | Xuất hàng theo PXK |

## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |
| `AR_Order_SalesRecallFromPMStp` | STP | Người tạo thu hồi từ PM khi chưa chuyển tiếp |
| `AR_Order_CheckSaveStp` | STP | Kiểm tra dữ liệu đơn khi lưu |
| `AR_OrderTbl_UpdateRefDoc` | Trigger | Cập nhật liên kết chứng từ của đơn |
| `AR_OrderLog_Stp` | STP | Ghi lịch sử gửi và xử lý đơn |
