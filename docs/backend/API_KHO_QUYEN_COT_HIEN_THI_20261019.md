# Bàn giao API kho — 19/10/2026

Áp dụng sau khi triển khai BE chứa PR #169. Dùng [OpenAPI hiện hành](medcom-openapi.json) để lấy cấu trúc request/response. Các tên trường và đường dẫn dưới đây dành cho lập trình viên tích hợp; nhãn giao diện dùng tên nghiệp vụ tiếng Việt, không đưa mã lỗi, tên trường hoặc thuật ngữ vận hành vào màn hình cho người dùng.

Gọi `GET /api/erp/permissions?branchId=...` sau đăng nhập và khi đổi chi nhánh. `canView` quyết định màn hình được xem; `crud` và `actions[].visible` quyết định nút theo quyền ERP của tài khoản hiện tại. Dùng `actions[].route` làm đường dẫn thao tác, không tự ghép đường dẫn từ cờ quyền. BE đã sửa việc bắt buộc thêm `IsRun` vào quyền Thêm/Sửa/Xóa: mỗi quyền CUD lấy đúng cờ nghiệp vụ tương ứng. Cờ Admin riêng lẻ không tự cấp các quyền còn thiếu.

Với nút CUD có quyền và có thao tác được hỗ trợ, `GET /api/erp/{module}/actions?branchId=...&documentId=...` và chi tiết trả `visible=true`, `enabled=true` để thử giao diện. Quyền tài khoản, chi nhánh, chứng từ bị khóa, trạng thái và cập nhật đồng thời vẫn được BE kiểm tra lúc ghi. Nút cần chứng từ đã lưu được nhận biết bằng `requiresSavedDocument`; mở trang tạo mới không cung cấp mã phiếu hoặc mã dòng giả.

| Màn hình | Module | Thêm / sửa / xóa | Nút nghiệp vụ |
|---|---|---|---|
| Phiếu đề nghị nhập hàng | `inbound-requests` | `POST /api/erp/inbound-requests/create`, `/save`, `/delete`; chi phí dùng `/sections/costs/save` | `/actions/send-management`, `/actions/send-warehouse` |
| Đề nghị điều chuyển nội bộ | `internal-transfer-requests` | `POST /api/erp/internal-transfer-requests/create`, `/save`, `/delete` | `/actions/send-pm`, `/actions/recall` |
| Lập đợt điều chuyển | `internal-transfer-batches` | `POST /api/erp/internal-transfer-batches/create`, `/save`, `/delete` | `/actions/sync-requests`, `/actions/send-tech` |
| Điều chuyển – kỹ thuật | `internal-transfer-tech` | `POST /api/erp/internal-transfer-tech/save`; máy dùng `/sections/assets/save` | `/actions/send-sa`, `/actions/reject` |
| Điều chuyển – PM | `internal-transfer-pm` | `POST /api/erp/internal-transfer-pm/save` | `/actions/pm-confirm`, `/actions/reject` |
| Điều chuyển – SA | `internal-transfer-sa` | `POST /api/erp/internal-transfer-sa/save` | `/actions/send-accounting`, `/actions/reject`, `/actions/return-step` |
| Điều chuyển – kế toán | `internal-transfer-accounting` | `POST /api/erp/internal-transfer-accounting/save` | `/actions/send-warehouse`, `/actions/reject`, `/actions/return-step` |
| Điều chuyển – kho xuất | `internal-transfer-warehouse-out` | `POST /api/erp/internal-transfer-warehouse-out/save` | `/actions/dispatch`, `/actions/reject`, `/actions/return-step` |
| Điều chuyển – kho nhập | `internal-transfer-warehouse-in` | `POST /api/erp/internal-transfer-warehouse-in/save` | `/actions/receive` |
| Quét QR xuất kho / xuất bán hàng | `warehouse-qr`, `sales-qr` | `POST /api/erp/{module}/qr/add`, `/qr/delete` để thêm/xóa mã quét | `scan-add`, `scan-delete` trong danh sách quyền/nút |

Các đường dẫn rút gọn trong cùng ô tiếp tục dùng tiền tố `/api/erp/{module}` của ô đó. Các bước kho xuất/kho nhập sửa phiếu đã đi đến bước tương ứng; tạo/xóa cả đợt thực hiện ở **Lập đợt điều chuyển**. Quét QR thêm/xóa dòng quét trên phiếu có sẵn; không tạo/xóa cả chứng từ xuất kho. Với QR, `crud.canCreate/canDelete` thể hiện khả năng thêm/xóa mã quét và dùng quyền Sửa của ERP; phải gọi hai route QR đã trả trong `actions`.

Tiền giữ giá trị gốc để gửi khi lưu, kèm trường `...Display` để hiển thị trực tiếp: `1234567` → `1,234,567 VND`; `1234.5` → `1,234.50 USD`. Dòng kế thừa tiền tệ của phiếu, dòng có mã tiền tệ riêng dùng mã riêng. Theo xác nhận của chủ hệ thống, thiếu mã tiền tệ thì hiển thị VND; mã tiền tệ khác VND/USD chưa được hỗ trợ sẽ để chuỗi hiển thị rỗng (`null`). Giá trị tiền rỗng vẫn rỗng. Không gửi chuỗi đã định dạng vào trường tiền khi lưu. Màu và tên trạng thái vẫn đi cùng mã trạng thái.

Danh sách, chi tiết của 19 màn hình ERP và các API chứng từ tương ứng đã bỏ cột nghiệp vụ ẩn theo cấu hình ERP được kiểm tra ngày 19/10. `/screen` và `/api/documents/field-contract` trả metadata phù hợp. BE vẫn giữ mã phiếu/dòng, chi nhánh hiện tại, mã/tên/màu trạng thái, cờ khóa và thông tin phân trang/quyền cần thiết. Cột tên được ERP hiển thị riêng vẫn được giữ khi mã tham chiếu của nó bị ẩn. Các trường dòng PO đã yêu cầu bỏ tiếp tục được bỏ.

Khi **sửa** bằng `/api/erp/{module}/save` hoặc `/sections/{section}/save`, FE bỏ qua trường ẩn không có trong dữ liệu đọc; BE giữ giá trị hiện tại trong DB. Gửi một trường với `null` vẫn mang nghĩa chủ động xóa giá trị nếu trường cho phép rỗng. Khi **thêm**, các giá trị bắt buộc của request vẫn phải được lấy từ lựa chọn/ngữ cảnh tạo phiếu theo OpenAPI. Không lấy bản chi tiết đã rút gọn để thay toàn bộ bản ghi hoặc tự dựng số liệu/cột kỹ thuật.

Đợt thay đổi này không triển khai lên VPS hoặc sửa FE. Kiểm tra sau redeploy: đăng nhập lại, chọn chi nhánh, đọc quyền, thêm/sửa/xóa phiếu nháp hợp lệ và quét thêm/xóa QR trên chứng từ thử nghiệm. Không dùng phiếu đã gửi/khóa để đánh giá quyền nút CUD.
