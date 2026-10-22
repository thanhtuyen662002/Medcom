## Bản đồ liên kết

| Quy trình | Chứng từ nguồn | Điểm nối chính |
| --- | --- | --- |
| Mua hàng | AP_PurchaseRequestTbl | PurchaseRequestID → AP_OrderTbl.DocumentID |
| Nhập theo đợt | AP_OrderDetailTbl | OrderDetailID → đợt PO → đề nghị nhập |
| Chi phí nhập khẩu | IV_InboundRequestCTCPTbl | Đề nghị → dịch vụ → chứng từ mua nhập khẩu |
| Bán hàng | AR_OrderTbl | Đơn theo hợp đồng → hóa đơn/PXK → giao hàng |
| Điều chuyển | IV_InternalTransferRequestTbl | RequestID → BatchID → PXK → nhiều PNK |
| Máy | FA_AssetTbl | AssetID → biến động, sửa chữa, bàn giao |
| QR linh kiện | Yêu cầu đăng ký Serial | QR → dòng nhập/xuất → máy nguồn/đích |

## Nguyên tắc đọc mã

Form là màn hình; Tbl là bảng; View là lớp truy vấn; Stp là stored procedure; Fnc là function; Trg/đối tượng loại Trigger phản ứng theo thay đổi dữ liệu. Mã nội bộ và số trạng thái được giải thích tại từng quy trình, không dùng làm tên nghiệp vụ cho người đọc.

## Ranh giới web

Web tĩnh này không kết nối MedData, không chuyển trạng thái, không cấp quyền và không chứa thông tin đăng nhập. Nội dung được cập nhật từ nguồn Markdown trong repo, xây lại và triển khai bản mới. Ngày đối chiếu là ngày kiểm tra tài liệu/cấu hình, không khẳng định mọi vai trò đã được kiểm thử thực tế.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |


## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |

