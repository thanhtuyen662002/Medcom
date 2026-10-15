# Bàn giao nút và tên màn hình — cập nhật 15/10/2026

FE dùng [API quyền màn hình và thao tác](BE_FE_PERMISSIONS_20261015.md) để dựng menu, quyền Thêm/Sửa/Xóa và ẩn/hiện các nút theo người đăng nhập. Chế độ ép bật 72 nút để test đã được thay thế bằng quyền thực tế. Không bổ sung In hoặc Import/copy.

Các bước xác nhận, phê duyệt, xử lý, xuất và nhận điều chuyển chỉ dùng các nút xử lý phiếu đã có; không dựng thêm nút Thêm/Xóa tại các bước này.

FE lấy trạng thái nút trên phiếu từ `GET /api/erp/{màn hình}/actions`; `GET /api/erp/{màn hình}/detail` cũng trả cùng trạng thái. Ẩn nút khi `visible=false`; khi `visible=true`, dùng `enabled` để bật hoặc khóa nút. Quyền, khóa phiếu, trạng thái, người được giao và điều kiện thao tác được BE kết hợp. Không tự ép bật nút. BE vẫn kiểm tra lại trước khi ghi. Khi bị từ chối, giữ dữ liệu đang nhập và hiển thị thông báo tiếng Việt phù hợp.

`GET /api/erp/{màn hình}/screen` trả tên màn hình và caption nút. Caption có nguồn xác minh sẽ là tên tiếng Việt trong DB; caption không lấy được sẽ là chuỗi rỗng `""`. FE dùng nhãn nghiệp vụ cố định đã được duyệt khi caption rỗng. Không lấy tên API, mã thao tác, tên bảng hoặc mã lỗi làm nhãn giao diện. Nhãn chuẩn Thêm/Lưu/Xóa do FE đặt khi caption của các nút này rỗng.

Nhóm đọc Đề nghị mua hàng cũ không còn ép bật sửa/thêm dòng. Dùng nhóm `/api/erp/purchase-requests` cùng API quyền mới trong danh mục hiện hành để Thêm/Lưu/Xóa và thêm dòng.

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

Chi tiết từng API, thao tác và vị trí dùng ở [danh mục đủ 244 API](BE_FE_API_REFERENCE_20261011.md). Trên VPS, nối đường dẫn BE với `https://medcom.bms79.com/api/erp`; ví dụ `/api/erp/sales-orders/actions` gọi qua `https://medcom.bms79.com/api/erp/api/erp/sales-orders/actions`. Sau thao tác thành công, tải lại phiếu và các nút. Khi BE từ chối, hiển thị thông báo tiếng Việt phù hợp với thao tác, giữ dữ liệu người dùng đang nhập để sửa.
