# Vận hành API ghi ERP từ FE

Cập nhật 15/10/2026: chủ hệ thống đã yêu cầu bỏ khóa fingerprint khỏi API. Hướng dẫn hiện hành ở [Ghi ERP không khóa fingerprint](ERP_WRITES_WITHOUT_FINGERPRINT_20261015.md); phần dưới đã được cập nhật tương ứng. Không dùng lại hướng dẫn refresh fingerprint cũ.

I74 bổ sung bộ ghi và cấp số cụ thể vào startup thông thường. Sau khi cài journal và cấu hình DB đích, các route CUD/workflow/QR của [hướng dẫn FE](BE_FE_SIX_SCREEN_COMMANDS_20261010.md) thực hiện transaction SQL và trả receipt `Committed`/`Replayed`. Không cần viết thêm implementation C# hoặc chạy chế độ purchase pilot. Bằng chứng: `ApiHost.cs`, `ErpWriteStartup.cs`, `ErpWriteRuntime.cs`, `SqlErpScreenCommands.cs`, `SqlErpDocumentNumberAllocator.cs`; kiểm thử và giới hạn ở `docs/execution/I74_ERP_WRITE_RUNTIME_20261010.md`.

## Chuẩn bị server

Giữ cấu hình kết nối SQL và đăng nhập ERP hiện có. SQL account cần quyền đọc metadata các bảng đang dùng, đọc phân quyền và quyền ghi/EXECUTE trên các đối tượng nghiệp vụ của phạm vi. API không đọc định nghĩa toàn bộ DB hoặc yêu cầu VIEW DEFINITION để so hash; công cụ kiểm kê riêng vẫn có thể cần quyền đó. Công cụ cài đặt cần quyền tạo hai bảng Web. Không cấp quyền SQL từ trình duyệt và không đặt password trong URL, argv hoặc Git.

Thêm vào file private nằm ngoài repository, ví dụ `D:\Config\appsettings.Private.json`, phần sau. Chỉ khi cài mới, tạo GUID bằng `New-Guid`; khi cập nhật giữ nguyên GUID đang dùng. `Database` phải khớp chính xác Initial Catalog. Không cần khai báo `SchemaFingerprint`; giá trị cũ được bỏ qua.

```json
{
  "Medcom": {
    "ErpWrites": {
      "DatabaseBindingId": "GUID_MOI_CUA_DB",
      "Database": "TEN_DB_ERP",
      "Modules": "purchase-requests;sales-orders;internal-transfer-requests;warehouse-qr;sales-qr;machine-movements;machine-repairs"
    }
  }
}
```

Cài trên môi trường đã được chủ hệ thống chọn và cho phép. Cần kế hoạch backup/rollback của môi trường đó trước khi người dùng bắt đầu ghi nghiệp vụ.

```powershell
dotnet Medcom.Api.dll --install-erp-writes --Medcom:PrivateConfigPath D:\Config\appsettings.Private.json
```

Lệnh kiểm tra DB đích và các cột bắt buộc của API, rồi tạo `dbo.MedcomErpCommandSchema` và `dbo.MedcomErpCommandJournal` trong một transaction. Nó không chạy host và không thay đổi các bảng/procedure/configuration nghiệp vụ ERP. Nếu đã có journal, lệnh từ chối ghi đè; dùng kiểm tra chỉ đọc:

```powershell
dotnet Medcom.Api.dll --prepare-erp-writes --Medcom:PrivateConfigPath D:\Config\appsettings.Private.json
```

Kết quả thành công có `status=prepared`, `schemaFingerprint=null`, `catalogHash`, `installed` và danh sách modules. `catalogHash` chỉ là thông tin nguồn lịch sử, không khóa quyền ghi. Không ghi/refresh fingerprint vào cấu hình; khởi động BE như thông thường. Startup có profile ghi sẽ tự bật reader cần thiết; không cần bật `Legacy:EnableReadOnlyPilots` riêng. `Legacy:Enabled`, tenant/company, Tools.dll và cơ chế đăng nhập ERP vẫn cần cấu hình đúng. Lệnh prepare là kiểm tra kỹ thuật, không phải giấy nghiệm thu production.

Container có thể dùng ba biến môi trường do người vận hành quản lý thay cho phần `ErpWrites` trong file:

```text
Medcom__ErpWrites__DatabaseBindingId=<GUID>
Medcom__ErpWrites__Database=<TEN_DB>
Medcom__ErpWrites__Modules=purchase-requests;sales-orders;internal-transfer-requests;warehouse-qr;sales-qr;machine-movements;machine-repairs
```

Toàn bộ profile phải đến từ file private hoặc môi trường server; không trộn hai nguồn, không đặt profile trong public appsettings hoặc command-line host. Thiếu/sai profile được báo ngay khi startup. SchemaFingerprint cũ được bỏ qua, kể cả khi biến môi trường fingerprint khác giá trị trong file. Các trường cấu hình còn hiệu lực vẫn phải thống nhất. Cập nhật FE/BE hoặc thay đổi hash schema/procedure/form không cần chạy prepare hay refresh fingerprint. API kiểm tra quyền, dữ liệu và các cột nó thực sự dùng; lỗi tương thích thật vẫn được xử lý trên thao tác/màn hình liên quan.

## FE gọi API

Đăng nhập bằng tài khoản ERP, lấy CSRF token và `readScope`. BFF chuyển cookie, CSRF, Origin cố định của BE và `X-Medcom-Read-Scope` như hướng dẫn FE. Tạo chứng từ phải truyền ngày: `header.purchaseDate` ở đề nghị mua hàng, `header.documentDate` ở bốn form tạo còn lại; định dạng `yyyy-MM-ddTHH:mm:ss.fff`. Thiếu ngày trả 400: `document_date_required` ở đề nghị mua hàng; `invalid_erp_intent` khi thiếu field required của bốn DTO khác. API trả đầy đủ fields; các phần danh sách/lines/history/comparison vẫn phân trang.

Khi trả `200 Committed`/`Replayed`, dùng documentId/allocatedLines trong receipt và GET detail/actions để cập nhật giao diện. Không gửi actor, trạng thái, khóa, số chứng từ hay computed fields trong payload ghi. Server cấp số và xác định quyền/trạng thái từ DB.

Nguồn hiện tại có định dạng `{P}{MM}{YY}/{4}`; prefix PO/DMB/DCNB/MLI/MLRP tương ứng năm form tạo. PO và DMB lấy mask từ `SY_Setup.DocumentMask` khi form không có DMK; ba form còn lại có DMK riêng cùng định dạng. Bằng chứng: catalog hiện tại, SELECT-only `SY_Setup` 2026-10-10 và `Tools.Layout.AutoDocNumberSetting`, `Tools.Data.DefaultValueSQL` của Tools.dll hash `7019a26a5129edf44716601678ea1aadaebde5082defebd195ff47a7452d7ec8`. Các nguồn giữ danh tính riêng, không suy ra tương đương archive.

BE giữ khóa transaction trong DB cho các commands, cấp số từ header/journal bền vững và khóa bảng header đến commit. Receipt giữ số đã dùng cả sau delete; không tái sử dụng số Web đã ghi. Kiểm tra collision không phụ thuộc process/replica. Đây là tăng cường Web so với cơ chế đếm của WinForms; không khẳng định tất cả phiên bản WinForms có cùng cơ chế lock.

`409 erp_command_busy`: một command khác đang giữ khóa quá thời gian chờ; giữ nguyên intent/idempotency key và tra `/commands/lookup` trước khi thử lại. `409 document_number_exhausted`: đã hết 9999 số trong tháng; không tự cuộn số. `409 document_state_changed`: đọc lại trạng thái rồi cho người dùng kiểm tra thay đổi. `OutcomeUnknown`: lookup intent gốc, không báo thành công hoặc tự tạo key mới. Lỗi quyền/khóa/trạng thái/reference vẫn là kiểm tra nghiệp vụ cần thiết.

## Đối chiếu vận hành và rollback

Kiểm tra user/branch thực tế, GET actions cho phép thao tác, POST một chứng từ được nghiệp vụ chấp thuận, rồi đối chiếu detail và journal/audit. Các màn hình QR sử dụng chứng từ đã có và API scan add/delete; không có parent create/delete như ERP hiện tại. Giữ các print/report và import mở rộng trong danh sách chưa nghiệm thu của hướng dẫn FE.

Muốn dừng ghi, gỡ profile và restart BE; giữ journal cùng dữ liệu ERP. Chỉ xóa hai bảng Web mới khi chưa có receipt và có quyết định rollback môi trường. Đã phát sinh nghiệp vụ thì phục hồi theo backup/reconciliation của môi trường, không xóa journal để làm lại. Schema v1 gốc: `schemas/backend/erp-screen-command-journal-v1.sql`; phần cài đặt tương ứng nằm trong `SqlErpWritePreparation.InstallSql`.

Tools.dll 2026-10-10 đã được kiểm chứng cho stored-password subset trên Windows/.NET 10: tạo hash tổng hợp bằng DLL thật, kiểm tra đúng/sai/khác user và đăng nhập HTTP qua worker. Worker vẫn hỗ trợ pin 2026-10-02 đã có, từ chối binary khác và không dùng system-password fallback. Linux của binary mới, dữ liệu/tài khoản thật của owner, capacity của DB đích, full dynamic closure, đầy đủ giá trị tiền sửa chữa, reports và nghiệm thu release còn UNKNOWN cho tới khi có receipt riêng. Goal #45 vẫn mở.
