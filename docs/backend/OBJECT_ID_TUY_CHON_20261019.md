# Phiếu chưa chọn đối tượng

Áp dụng cho Đề nghị mua hàng, Duyệt đề nghị mua, Đặt mua hàng, Quản lý đơn hàng, PM xử lý đơn hàng và SA xử lý đơn hàng.

API danh sách và chi tiết trả `objectId: null` khi phiếu chưa chọn đối tượng. FE hiển thị trống tại ô đối tượng. Khi người dùng chọn một đối tượng, FE gửi mã được chọn như trước. Khi chưa chọn hoặc muốn xóa lựa chọn, gửi `objectId: null` ở phần thông tin phiếu; giá trị khoảng trắng không hợp lệ.

Các đường dẫn API, phân trang và cấu trúc phản hồi hiện tại được giữ nguyên. Swagger cập nhật trường này cho phép trống. Quyền thao tác, trạng thái phiếu và kiểm tra lựa chọn khi có mã vẫn được xử lý tại BE.
