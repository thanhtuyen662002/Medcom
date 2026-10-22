## Định danh lô và áp dụng nghiệp vụ

Các phiếu nhập hạn thanh toán/thuế tham chiếu PO + ShipmentNo. Lưu master nhập liệu không tự thay thế bước apply. Các STP `AP_BPTMUI_Apply...Stp` kiểm tra quyền, người tạo phiếu và IsApplied trước khi gọi phần xử lý nghiệp vụ của đợt rồi ghi dấu đã áp dụng.

## Kiểm tra quyền và lặp thao tác

ApplyDue kiểm tra tài khoản, quyền màn hình hiệu lực, bản ghi thuộc người nhập, IsApplied=0, PO không trống và ShipmentNo hợp lệ. Bản ghi đã áp dụng phải tạo bản điều chỉnh thay vì bỏ cờ IsApplied để chạy lại.

Cấu hình nhóm/người dùng là cấu hình ERP hiện hữu; trang tài liệu không cấp hoặc thay đổi quyền. Lịch gửi cảnh báo là phần vận hành cần kiểm chứng riêng với tác vụ đang chạy, không suy ra từ việc view tồn tại.

## Liên kết

Đợt được theo dõi trong `AP_POShipmentTbl`; `AP_POShipment_SetDeliveryDueStp` cập nhật **hạn thanh toán nhà cung cấp**, dù tên có DeliveryDue. DELIVERY_DOC_DATE = ngày chứng từ giao hàng + số ngày công nợ; MANUAL cần ngày hạn và lý do. Đợt hủy không được đổi hạn. Kế hoạch/đã nộp thuế và lịch sử thanh toán phải giữ đúng ShipmentID để tránh gộp sai các chuyến của cùng PO.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `AP_BPTMShipmentsFrm` | BPTM - Theo dõi đợt hàng |
| `AP_BPTMDueEntryFrm` | BPTM - Nhập hạn thanh toán |
| `AP_BPTMTaxPlanEntryFrm` | BPTM - Dự kiến nộp thuế |
| `AP_BPTMTaxPaidEntryFrm` | BPTM - Xác nhận nộp thuế |
| `AP_BPTMAlertsFrm` | BPTM - Cảnh báo đến hạn |
| `AP_BPTMPaymentsFrm` | BPTM - Lịch sử thanh toán |
| `AP_BPTMNotifySettingsFrm` | BPTM - Cấu hình người nhận thông báo |

## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |
| `AP_BPTMUI_ApplyDueStp` | STP | Áp dụng phiếu nhập hạn thanh toán |
| `AP_BPTMUI_ApplyTaxPlanStp` | STP | Áp dụng kế hoạch thuế |
| `AP_BPTMUI_ApplyTaxPaidStp` | STP | Áp dụng ghi nhận nộp thuế |
| `AP_POShipment_SetDeliveryDueStp` | STP | Cập nhật hạn thanh toán NCC cho đúng đợt |
| `AP_POShipmentBPTMAlertView` | View | Công nợ và kế hoạch thuế đến hạn trong 7 ngày |
