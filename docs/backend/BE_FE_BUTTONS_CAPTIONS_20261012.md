# Bàn giao nút và tên màn hình — cập nhật 15/10/2026

Trong đợt thử giao diện, 72 nút nghiệp vụ đang có trên 19 màn hình luôn hiện và bật: Thêm, Lưu, Xóa, lưu chi phí, lưu danh sách máy, thêm/xóa QR, Duyệt/Không duyệt/Từ chối, Gửi, Thu hồi, Xác nhận, chọn bước gửi về, đồng bộ đề nghị và xem thông tin hợp đồng. Màn hình giữ đúng các nút đang có của nó. Không bổ sung nút In hoặc Import/copy.

Các bước xác nhận, phê duyệt, xử lý, xuất và nhận điều chuyển chỉ dùng các nút xử lý phiếu đã có; không dựng thêm nút Thêm/Xóa tại các bước này.

FE lấy các nút từ `GET /api/erp/{màn hình}/actions`; khi mở phiếu, `GET /api/erp/{màn hình}/detail` cũng trả các nút của phiếu. Dùng `visible=true` và `enabled=true` BE trả về để cho người dùng bấm thử. Không dùng trạng thái khóa hoặc trạng thái phiếu để khóa lại các nút nghiệp vụ này trên giao diện. Phiếu cần lưu vẫn phải lưu trước khi gửi thao tác. BE kiểm tra quyền, chi nhánh, trạng thái phiếu, dữ liệu và phiên khi thực hiện; nút bật không bảo đảm yêu cầu sẽ được chấp nhận. Khi BE từ chối, giữ dữ liệu đang nhập và hiển thị thông báo tiếng Việt phù hợp.

`GET /api/erp/{màn hình}/screen` trả tên màn hình và caption nút. Caption có nguồn xác minh sẽ là tên tiếng Việt trong DB; caption không lấy được sẽ là chuỗi rỗng `""`. FE dùng nhãn nghiệp vụ cố định đã được duyệt khi caption rỗng. Không lấy tên API, mã thao tác, tên bảng hoặc mã lỗi làm nhãn giao diện. Nhãn chuẩn Thêm/Lưu/Xóa do FE đặt khi caption của các nút này rỗng.

Các API đọc đề nghị mua hàng cũ cũng trả cờ mở giao diện chỉnh sửa; dùng nhóm `/api/erp/purchase-requests` trong danh mục hiện hành để Thêm/Lưu/Xóa và thêm dòng. Các cờ này giúp mở giao diện thử, không thay thế kết quả kiểm tra khi thực hiện thao tác.

| Tên màn hình từ DB | Nhóm API BE | Dùng ở đâu |
|---|---|---|
| Đề nghị mua hàng | `/api/erp/purchase-requests` | Lập và chỉnh sửa đề nghị mua hàng |
| Quản lý đơn hàng | `/api/erp/sales-orders` | Lập và chỉnh sửa đơn hàng |
| Phiếu đề nghị điều chuyển nội bộ | `/api/erp/internal-transfer-requests` | Lập đề nghị điều chuyển |
| Xuất kho | `/api/erp/warehouse-qr` | Thêm/xóa mã QR xuất kho |
| Xuất bán hàng | `/api/erp/sales-qr` | Thêm/xóa mã QR xuất bán hàng |
| Phiếu di chuyển / bàn giao máy | `/api/erp/machine-movements` | Di chuyển và bàn giao máy |
| Phiếu sửa chữa / bảo hành / bảo trì máy | `/api/erp/machine-repairs` | Sửa chữa, bảo hành, bảo trì máy |
| Đặt mua hàng | `/api/erp/purchase-orders` | Lập và chỉnh sửa đặt mua |
| Phiếu đề nghị nhập hàng | `/api/erp/inbound-requests` | Lập đề nghị nhập và lưu chi phí |
| Duyệt đề nghị mua hàng | `/api/erp/purchase-approvals` | Duyệt đề nghị |
| Xác nhận đơn hàng | `/api/erp/sales-order-pm` | Xác nhận đơn hàng |
| Duyệt đơn hàng | `/api/erp/sales-order-sa` | Duyệt đơn hàng |
| Xác nhận đề nghị điều chuyển | `/api/erp/internal-transfer-pm` | Xác nhận đề nghị điều chuyển |
| Đợt điều chuyển nội bộ | `/api/erp/internal-transfer-batches` | Lập và xử lý đợt điều chuyển |
| Xác nhận thiết bị điều chuyển | `/api/erp/internal-transfer-tech` | Xác nhận và lưu danh sách máy |
| Phê duyệt điều chuyển nội bộ | `/api/erp/internal-transfer-sa` | Phê duyệt điều chuyển |
| Xử lý điều chuyển nội bộ | `/api/erp/internal-transfer-accounting` | Xử lý điều chuyển |
| Xác nhận xuất điều chuyển | `/api/erp/internal-transfer-warehouse-out` | Xuất từ kho nguồn |
| Xác nhận nhận điều chuyển | `/api/erp/internal-transfer-warehouse-in` | Nhận tại kho đích |

Chi tiết từng API, thao tác và vị trí dùng ở [danh mục đủ 243 API](BE_FE_API_REFERENCE_20261011.md). Trên VPS, nối đường dẫn BE với `https://medcom.bms79.com/api/erp`; ví dụ `/api/erp/sales-orders/actions` gọi qua `https://medcom.bms79.com/api/erp/api/erp/sales-orders/actions`. Sau thao tác thành công, tải lại phiếu và các nút. Khi BE từ chối, hiển thị thông báo tiếng Việt phù hợp với thao tác, giữ dữ liệu người dùng đang nhập để sửa.
