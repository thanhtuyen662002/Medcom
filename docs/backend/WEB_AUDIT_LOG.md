# Nhật ký thao tác web (Web activity log)

Ghi lại người dùng đã làm gì trên ERP web, để truy vết khi có sự cố dữ liệu: ai, lúc nào, từ IP/thiết bị nào, trên màn hình và chứng từ nào, gửi dữ liệu gì lên và kết quả ra sao.

## Ghi những gì

| Loại (`Category`) | Nguồn | Nội dung |
| --- | --- | --- |
| `auth` | máy chủ | Đăng nhập thành công/thất bại (tên đăng nhập đã gõ, **không bao giờ lưu mật khẩu**), đăng xuất |
| `command` | máy chủ | Mọi lệnh ERP: tạo, lưu, xóa, gửi/duyệt/từ chối/trả lại, lưu mục chi phí/tài sản, quét QR, đánh dấu thông báo. Lưu **toàn bộ dữ liệu gửi lên** và kết quả (Committed/Denied/Conflict…, mã lỗi, số chứng từ, `AuditId` của journal lệnh) |
| `import` | máy chủ | Dán từ Excel (`paste/validate`) và chọn hàng từ chứng từ nguồn (`selection`), kèm dữ liệu dán/chọn |
| `read` | máy chủ | Mở danh sách (kèm từ khóa tìm/lọc), xem chi tiết chứng từ, xem thông tin hợp đồng, mở thông báo. Đọc lặp lại giống hệt trong 2 phút (màn hình tự làm mới) chỉ ghi 1 lần |
| `file` | máy chủ | Tải file đính kèm lên (tên, dung lượng — không lưu nội dung file), tải xuống, xóa |
| `ui` | trình duyệt | Chuyển màn hình, bấm nút/menu (nhãn nút, hộp thoại đang mở), mở chứng từ, in, dán (chỉ số ký tự/dòng), đổi chi nhánh, lỗi JavaScript |
| `audit` | máy chủ | Ai đã tra cứu nhật ký này |

Không ghi: kiểm tra phiên, CSRF, danh sách dropdown, quyền màn hình, đếm trạng thái và các request tự động khác. Trường có tên chứa `password`, `secret`, `token`… luôn bị thay bằng `***`. Dữ liệu một dòng tối đa 256 KB (quá thì cắt và đánh dấu `truncated`).

Người dùng, phiên, IP và giờ luôn do **máy chủ** gắn vào; trình duyệt không thể khai thay người khác. `SessionRef` là mã băm một chiều của phiên (không phải token). `CorrelationId` trùng với header `X-Correlation-ID` mà người dùng thấy khi báo lỗi.

## Lưu ở đâu

Bảng mới `dbo.MedcomWebAuditLog` trong MedData ([schema](../../schemas/backend/web-audit-log-v1.sql)). Không sửa bảng/thủ tục gốc nào của ERP. API ghi bất đồng bộ theo lô (~1 giây/lần) nên không làm chậm thao tác. Nếu SQL lỗi hoặc bảng chưa cài, log được ghi tạm ra file trong thư mục riêng (`audit-spool` cạnh file phiên, hoặc `Audit:SpoolPath`) và tự đẩy vào DB khi có thể. Bản ghi cũ hơn `Audit:RetentionMonths` (mặc định 12) tự xóa mỗi ngày.

## Triển khai

1. Cài bảng (một lần, chạy trên máy API bằng tài khoản có quyền CREATE TABLE trên MedData):

   ```powershell
   dotnet Medcom.Api.dll --install-web-audit --Medcom:PrivateConfigPath D:\Config\appsettings.Private.json
   dotnet Medcom.Api.dll --check-web-audit   --Medcom:PrivateConfigPath D:\Config\appsettings.Private.json
   ```

   Kết quả `{"status":"created"}` hoặc `{"status":"already_installed"}`. Login SQL của API cần thêm quyền INSERT/SELECT/DELETE trên bảng này (thường đã có nếu dùng cùng login ghi ERP).

2. Cấu hình riêng (`appsettings.Private.json`, không commit):

   ```json
   "Audit": {
     "Enabled": true,
     "RetentionMonths": 12,
     "ViewerUsers": ["<tên đăng nhập ERP được xem nhật ký>"],
     "ViewerGroups": ["<UserGroupID hoặc tên nhóm>"],
     "RelayKey": "<chuỗi ngẫu nhiên ≥ 32 ký tự>"
   }
   ```

   - Chỉ tài khoản trong `ViewerUsers`/`ViewerGroups` thấy menu **Hệ thống → Nhật ký thao tác** (quyền `audit.read`). Mặc định không ai.
   - `RelayKey`: đặt **cùng giá trị** vào biến môi trường `MEDCOM_AUDIT_RELAY_KEY` của site Next (frontend). Có khóa này thì log ghi đúng IP và trình duyệt của người dùng; không có thì IP là của máy chủ frontend.

3. Khởi động lại API và frontend. Người dùng cần đăng nhập lại để nhận quyền `audit.read`.

## Tra cứu

- Trên web: lọc theo khoảng ngày, người dùng, số chứng từ, loại, màn hình, kết quả, hoặc tìm trong nội dung (mã hàng, IP, mã lỗi…). Bấm một dòng để xem đầy đủ dữ liệu gửi lên/kết quả.
- API: `GET /api/audit/logs`, `GET /api/audit/logs/detail?id=` (cần `audit.read`); trình duyệt gửi sự kiện qua `POST /api/audit/events`.
- SQL ví dụ — ai đã sửa một chứng từ:

  ```sql
  SELECT OccurredAtUtc, UserName, DisplayName, Category, Action, Outcome, ErrorCode, ClientAddress, RequestData
  FROM dbo.MedcomWebAuditLog
  WHERE DocumentId = N'DMB0926/0030'
  ORDER BY OccurredAtUtc;
  ```

  Thời gian lưu theo UTC (giờ Việt Nam = UTC + 7).
