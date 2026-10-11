# Bàn giao các nút thao tác ERP

Tài liệu hiện hành là [API theo màn hình và thao tác](BE_FE_API_REFERENCE_20261011.md), bao gồm đủ 19 màn hình và 243 API. FE tra mục màn hình cần triển khai để biết nút nào gọi API nào và kết quả phục vụ phần nào trên phiếu.

FE dùng đúng tên màn hình/nút nghiệp vụ trong tài liệu. Tên cột dùng nhãn ERP đã được duyệt, không tự đặt theo tên trường dữ liệu hay mã kỹ thuật. Các nút phải hiện và cho phép bấm theo kết quả BE; sau thao tác thành công tải lại phiếu và nút.

Danh sách và bảng chi tiết vẫn theo trang, mỗi bản ghi có dữ liệu đầy đủ tại một vị trí. Thêm, Lưu, Xóa và các nút gửi/duyệt/thu hồi dùng API ERP của đúng màn hình. Lần bàn giao này không bổ sung In hoặc Import/copy.

Cấu trúc dữ liệu để lập trình được mô tả trong [OpenAPI](medcom-openapi.json). Tình trạng kiểm thử, merge và triển khai được ghi tại [I79](../execution/I79_API_RESPONSE_STANDARDIZATION_20261011.md). Việc FE đã tích hợp và nghiệm thu thao tác thật vẫn UNKNOWN cho đến khi có xác nhận.
