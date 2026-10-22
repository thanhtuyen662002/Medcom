> Đề nghị mua hàng và đơn đặt hàng là hai bước liên kết. Đề nghị đã duyệt mới được tạo PO; một đề nghị không tạo lặp nhiều PO bằng thao tác gửi lại.

## 1. Lập đề nghị mua hàng

Vào **Mua hàng**, mở màn hình đề nghị mua hàng, bấm **Thêm**. Khai báo ngày đề nghị, chi nhánh, nhà cung cấp, loại tiền, tỷ giá, mục đích và thời gian cần hàng. Thêm các mã hàng, số lượng và đơn giá dự kiến rồi lưu.

Số lượng phải lớn hơn 0, đơn giá không âm và tỷ giá phải lớn hơn 0. Kiểm tra đơn vị tính trước khi gửi duyệt. Hồ sơ gửi phải có ít nhất một dòng hàng.

## 2. Duyệt hoặc không duyệt

Người được phân quyền mở **Mua hàng → Duyệt đề nghị mua hàng**, chọn đề nghị đang chờ duyệt, xem thông tin và chi tiết rồi bấm **Duyệt** hoặc **Không duyệt**. Khi không duyệt phải ghi rõ lý do.

Sau khi duyệt, đề nghị chuyển sang **Đã duyệt**. Nút duyệt không dùng lại cho đề nghị đã xử lý hoặc đã có PO. Nếu người khác vừa xử lý, tải lại trước khi thao tác tiếp.

## 3. Tạo đơn đặt hàng

Từ đề nghị đã duyệt, thực hiện thao tác gửi đặt mua hàng của màn hình. Hệ thống tạo PO và các dòng hàng tương ứng. Kiểm tra tại **Mua hàng → Đặt mua hàng**: mã chứng từ, nhà cung cấp, loại tiền, tỷ giá, số lượng, đơn giá và tổng tiền.

Thông tin tiền tệ và tổng tiền được lấy từ đề nghị tại thời điểm tạo PO. Nếu phát hiện sai, xử lý điều chỉnh ở đúng chứng từ và đúng quyền, không tạo thêm một PO trùng để thay thế.

## 4. Theo dõi đặt hàng và hàng về

Trên danh sách PO, phân biệt **trạng thái đơn đặt hàng** với **tiến độ nhận hàng**. Có PO không đồng nghĩa đã nhập kho. Một PO có thể được chia nhiều đợt và nhận từng phần.

Khi lập [đề nghị nhập hàng](#inbound), lấy số lượng cho đợt từ phần còn lại của từng dòng PO. Lượng hàng từng đợt, hạn thanh toán, thuế và thanh toán được theo dõi ở [Bộ phận Thương mại](#bptm).

## 5. Xử lý quyền và thông tin thay đổi

Quyền duyệt sử dụng phân quyền sẵn có của ERP, gồm quyền cá nhân/nhóm và quyền hiệu lực được hệ thống tính. Nếu tài khoản không thao tác được, quản trị viên kiểm tra quyền trên **Duyệt đề nghị mua hàng** và trạng thái đề nghị; không tự thêm một vai trò mới chỉ để vượt thông báo.
