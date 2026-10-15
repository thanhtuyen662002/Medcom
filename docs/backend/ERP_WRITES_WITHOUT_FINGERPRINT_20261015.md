# Cập nhật BE — ghi ERP không khóa fingerprint

Theo yêu cầu chủ hệ thống ngày 15/10/2026, API ERP đang hoạt động đã bỏ việc khóa đọc/Thêm/Sửa/Xóa/các nút nghiệp vụ do so sánh fingerprint DB, hash danh mục BE, hash thủ tục/default/expression/cấu hình form và hash nguồn danh sách chọn. Cập nhật FE/BE không cần chạy quy trình refresh fingerprint. Đây là hướng dẫn triển khai và tích hợp, không đưa các thuật ngữ/mã chẩn đoán dưới đây lên giao diện nghiệp vụ.

## Cập nhật bản đang chạy

1. Triển khai gói BE của PR #161 vào ứng dụng BE hiện có rồi khởi động lại đúng ứng dụng đó. FE dùng các API hiện tại; không đổi route hoặc payload.
2. Giữ nguyên file private, kết nối DB, `DatabaseBindingId`, journal, cấu hình đăng nhập và danh sách `Modules` đang sử dụng. Không tạo GUID mới hoặc xóa/tạo lại journal khi cập nhật.
3. `Medcom:ErpWrites:SchemaFingerprint` và biến môi trường tương ứng đã hết hiệu lực. Có thể để nguyên giá trị cũ; thiếu, rỗng, sai định dạng hoặc lệch giữa môi trường/file đều không khóa ghi. Không chạy lại các script Refresh-ErpWrites/Refresh-VpsErpWrites cũ để sửa hash.
4. Không cần đổi DB/schema hoặc lưu lại hash. `--prepare-erp-writes` chỉ dùng khi cần kiểm tra target/journal/cột đang dùng; kết quả `schemaFingerprint=null` là bình thường. Hash danh mục còn lưu trong journal là lịch sử, không còn được so để cho phép ghi.
5. Đăng nhập lại để kiểm tra trên FE. Dùng tài khoản được cấp quyền và một phiếu được phép sửa; đối chiếu kết quả lưu/xóa/thêm với chi tiết phiếu. Kiểm thử ghi thật cần phiếu do nghiệp vụ chọn, không tự ghi thử vào chứng từ sản xuất.

## Hành vi còn được kiểm tra

API vẫn kiểm tra tài khoản, quyền menu/Thêm/Sửa/Xóa/từng nút, chi nhánh, trạng thái/khóa phiếu, người được giao xử lý và dữ liệu hợp lệ. Token trạng thái phiếu và khóa gửi trùng vẫn giữ để tránh ghi đè hoặc ghi hai lần. Các kiểm tra này độc lập với fingerprint đã bỏ.

API kiểm tra trực tiếp những cột của bảng mà nó dùng. Thêm cột phụ hoặc thay đổi thứ tự vật lý không còn làm bảng mất tương thích; cột bắt buộc bị xóa, đổi kiểu/độ dài hoặc đổi tính chất đọc/ghi thật sự vẫn cần BE tương ứng. DB constraints, transaction và kiểm tra số dòng tác động vẫn có hiệu lực. Không nuốt lỗi SQL hoặc trả thành công khi chưa commit.

`target_acceptance_changed` do khóa fingerprint đã được loại khỏi pipeline này. Nếu còn thấy mã cũ sau cập nhật, kiểm tra phiên bản/đúng ứng dụng BE đang nhận request. Các lỗi hiện hành có nguyên nhân cụ thể:

| Mã dành cho đội triển khai | Kiểm tra |
|---|---|
| `erp_write_target_mismatch` | Cấu hình đang trỏ sai DB hoặc module không thuộc phạm vi bộ ghi. |
| `erp_journal_binding_mismatch` | DB/journal không khớp binding hoặc phiên bản journal đang dùng. Không tạo binding mới để bỏ qua. |
| `erp_source_schema_changed` | Cột bắt buộc của màn hình thực sự không khớp kiểu dữ liệu BE. |
| `erp_write_or_numbering_unqualified` | Thiếu cấu hình ghi/module hoặc bộ cấp số của màn hình. |
| `native_scope_denied`, `action_state_or_permission_denied` | Tài khoản/chi nhánh/quyền/trạng thái không cho phép thao tác. FE dùng thông báo nghiệp vụ tiếng Việt phù hợp. |
| `document_state_changed`, `idempotency_conflict` | Phiếu đã đổi hoặc khóa gửi trùng bị dùng cho nội dung khác. Đọc lại phiếu/tra kết quả yêu cầu cũ. |

Danh sách chọn vẫn kiểm tra cột/context, cấu hình enabled, tham số hợp lệ và giới hạn đọc; SQL do HTTP gửi lên không được chấp nhận. Chỉ SQL đọc và các thủ tục chọn cố định được binder cho phép. Công cụ kiểm kê nguồn và kiểm tra package/CI vẫn giữ hash phục vụ kiểm chứng; chúng không khóa CUD trên API.

Nguồn thay đổi/kiểm chứng: [checkpoint I94](../execution/checkpoints/I94_RETIRE_RUNTIME_FINGERPRINT_GATES_20261015.md), `ErpWriteRuntime`, `ErpWriteStartup`, `SqlErpScreenCommands`, `SqlErpScreenReader`, `ErpLookupSql` và `ErpRuntimeCompatibilityTests`. Nghiệm thu ghi trên VPS/tài khoản thật vẫn UNKNOWN cho đến khi cập nhật và kiểm tra; gói mã mới không chứng minh bản đang chạy trên VPS đã đổi.
