## Đăng ký và xử lý yêu cầu

Form `FA_PartRegFrm` dùng bảng yêu cầu `FA_PartRegistrationFrmTbl`. `FA_PartRegistrationRequestProcessStp` kiểm tra chính sách SERIAL, chế độ, tình trạng và danh sách; có trạng thái PROCESSING/SUCCESS/ERROR. Lưu yêu cầu không đồng nghĩa số mã đã tạo đúng kỳ vọng; đọc kết quả và số lượng sau xử lý.

## Quét chứng từ

Các router nhập/xuất phân tuyến mã PRT1. `FA_PartScanLinkInputStp`, `FA_PartScanLinkOutputStp` và `FA_PartScanRecoverInputStp` giữ liên kết từng QR với dòng chứng từ. Kiểm tra mã hàng, kho hiện tại, máy nguồn/đích, trùng mã và mức bao phủ số lượng.

Trước khi khóa chứng từ phải đủ mã tương ứng với số lượng theo chính sách. Tồn và lịch sử sử dụng được xác lập qua chứng từ đã hoàn tất; dữ liệu đăng ký không thay cho tồn.

## Thu hồi và thay thế

Thu hồi cần phiếu rã đã khóa và mã đang lắp trên đúng máy nguồn. Tình trạng NEW/USED/REPAIRED/DAMAGED/SCRAP biểu diễn chất lượng linh kiện sau thu hồi, không phải trạng thái vị trí.

`FA_PartReplacementExecuteStp` là xử lý thay thế có liên kết nghiệp vụ. Không gọi trực tiếp từ trình duyệt tài liệu; web này chỉ mô tả, không giữ kết nối DB hay chạy nghiệp vụ.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `FA_PartRegFrm` | Đăng ký QR / Serial linh kiện |
| `FA_PartManagementFrm` | Quản lý linh kiện |
| `FA_PartBarcodeHistoryFrm` | Lịch sử QR linh kiện |

## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |
| `FA_PartRegistrationRequestProcessStp` | STP | Xử lý yêu cầu đăng ký và kết quả |
| `FA_PartAutoRegisterSerialBatchStp` | STP | Tạo lô serial tự động |
| `FA_PartBarcodeLabelReportStp` | STP báo cáo | Dữ liệu in tem QR |
| `FA_PartScanLinkInputStp` | STP | Quét mã vào nhập kho |
| `FA_PartScanLinkOutputStp` | STP | Quét mã xuất lắp |
| `FA_PartScanRecoverInputStp` | STP | Quét thu hồi từ máy |
| `FA_PartReplacementExecuteStp` | STP | Xử lý thay thế linh kiện có liên kết |
| `FA_PartGenealogyReportStp` | STP báo cáo | Truy nguồn linh kiện |
