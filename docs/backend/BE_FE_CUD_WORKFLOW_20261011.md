# Bàn giao các nút thao tác ERP

Tài liệu hiện hành là [API theo màn hình và thao tác](BE_FE_API_REFERENCE_20261011.md), bao gồm đủ 19 màn hình và 243 API. FE tra mục màn hình cần triển khai để biết nút nào gọi API nào và kết quả phục vụ phần nào trên phiếu.

FE dùng caption tiếng Việt từ BE; nếu rỗng thì dùng nhãn cố định đã được duyệt trên ERP. Tên cột dùng nhãn ERP đã được duyệt, không tự đặt theo tên trường dữ liệu hay mã kỹ thuật. Cập nhật 15/10/2026: các nút nghiệp vụ đang có, gồm CUD, gửi, duyệt, từ chối, thu hồi và xác nhận, luôn hiện và bật để test giao diện; khi thực hiện, BE vẫn kiểm tra quyền, trạng thái phiếu và dữ liệu. FE không khóa lại nút theo trạng thái phiếu; giữ dữ liệu đang nhập khi BE từ chối. Xem [bàn giao nút và caption](BE_FE_BUTTONS_CAPTIONS_20261012.md); sau thao tác thành công tải lại phiếu và nút.

Danh sách và bảng chi tiết vẫn theo trang, mỗi bản ghi có dữ liệu đầy đủ tại một vị trí. Thêm, Lưu, Xóa và các nút gửi/duyệt/thu hồi dùng API ERP của đúng màn hình. Lần bàn giao này không bổ sung In hoặc Import/copy.

Cấu trúc dữ liệu để lập trình được mô tả trong [OpenAPI](medcom-openapi.json). Tình trạng kiểm thử, merge và triển khai được ghi tại [I79](../execution/I79_API_RESPONSE_STANDARDIZATION_20261011.md). Việc FE đã tích hợp và nghiệm thu thao tác thật vẫn UNKNOWN cho đến khi có xác nhận.
