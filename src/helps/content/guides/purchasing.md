> Đề nghị mua hàng và đơn đặt hàng là hai bước liên kết. Đề nghị đã duyệt mới được tạo PO; một đề nghị không tạo lặp nhiều PO bằng thao tác gửi lại.

## 1. Lập đề nghị mua hàng

Vào **Mua hàng → Đề nghị mua hàng**, bấm **Thêm**. Khai báo ngày đề nghị, người đề nghị, bộ phận, chi nhánh, loại tiền, mục đích/khách hàng và thời gian cần hàng theo hồ sơ. Thêm các mã hàng và số lượng cần mua.

**Đơn giá không bắt buộc nhập.** Nếu Sales, PM/PS hoặc Kỹ thuật chưa có báo giá, để trống đơn giá rồi bấm **Lưu**. Khi đã có giá dự kiến thì có thể nhập, nhưng không nhập giá âm. Không cần nhập 0 để thay cho giá chưa biết.

**Phiếu đề nghị không có ô tỷ giá.** Vẫn chọn loại tiền phù hợp; tỷ giá được xử lý ở PO và các chứng từ tài chính liên quan. Việc bỏ tỷ giá trên đề nghị không có nghĩa bỏ tỷ giá trên các chứng từ đó.

Số lượng phải lớn hơn 0. Kiểm tra mã hàng, đơn vị tính và thời gian cần hàng trước khi bấm **Gửi đề nghị**. Hồ sơ gửi phải có ít nhất một dòng hàng; để trống đơn giá không làm thay đổi luồng duyệt hay quyền xử lý hiện có.

## 2. Duyệt hoặc không duyệt

Người được phân quyền mở **Mua hàng → Duyệt đề nghị mua hàng**, chọn đề nghị đang chờ duyệt, xem thông tin và chi tiết rồi bấm **Duyệt** hoặc **Không duyệt**. Khi không duyệt phải ghi rõ lý do.

Sau khi duyệt, đề nghị chuyển sang **Đã duyệt**. Nút duyệt không dùng lại cho đề nghị đã xử lý hoặc đã có PO. Nếu người khác vừa xử lý, tải lại trước khi thao tác tiếp.

## 3. Tạo đơn đặt hàng

Từ đề nghị đã duyệt, bấm **Gửi đặt mua hàng**. Hệ thống tạo PO và các dòng hàng tương ứng. Kiểm tra tại **Mua hàng → Đặt mua hàng**: mã chứng từ, nhà cung cấp, loại tiền, số lượng, đơn giá, tỷ giá và tổng tiền.

Dòng đề nghị chưa có đơn giá sẽ được chuyển sang PO với đơn giá còn trống để người phụ trách bổ sung theo báo giá. PO ngoại tệ lấy tỷ giá trong danh mục tỷ giá theo ngày, tại hoặc trước ngày chứng từ. Nếu chưa có tỷ giá phù hợp, PO nháp vẫn được tạo nhưng phải bổ sung tỷ giá hợp lệ khi xử lý PO; không dùng tỷ giá cố định cũ trong danh mục loại tiền. Với VND, tỷ giá là 1.

Chưa đủ đơn giá hoặc tỷ giá thì chưa coi tổng tiền là giá trị tài chính hoàn chỉnh. Nếu phát hiện sai, xử lý điều chỉnh ở đúng chứng từ và đúng quyền, không tạo thêm một PO trùng để thay thế.

## 4. Theo dõi đặt hàng và hàng về

Trên danh sách PO, phân biệt **trạng thái đơn đặt hàng** với **tiến độ nhận hàng**. Có PO không đồng nghĩa đã nhập kho. Một PO có thể được chia nhiều đợt và nhận từng phần.

Khi lập [đề nghị nhập hàng](#inbound), lấy số lượng cho đợt từ phần còn lại của từng dòng PO. Lượng hàng từng đợt, hạn thanh toán, thuế và thanh toán được theo dõi ở [Bộ phận Thương mại](#bptm).

## 5. Xóa đề nghị mua hàng còn nháp

Chọn đúng đề nghị cần bỏ trong danh sách, kiểm tra mã đề xuất rồi bấm **Xóa**. Đọc lại mã phiếu trong hộp xác nhận trước khi chọn **Có**.

Chỉ xóa được phiếu còn **Nháp**, chưa khóa và chưa có PO liên kết, theo quyền xóa hiện hữu của tài khoản. Khi xóa hợp lệ, hệ thống xóa cả đầu phiếu và các dòng hàng trong cùng một lần xử lý. Nếu có lỗi, toàn bộ thao tác được hoàn tác.

Phiếu đã gửi duyệt, đã duyệt, không duyệt, đã gửi đặt mua hàng hoặc đã khóa phải xử lý theo quy trình hiện có; không xóa trực tiếp. Phiếu đã có PO cũng bị chặn xóa. Không xóa thủ công từng dòng hoặc gỡ liên kết để vượt thông báo.

## 6. Xử lý quyền và thông tin thay đổi

Quyền duyệt sử dụng phân quyền sẵn có của ERP, gồm quyền cá nhân/nhóm và quyền hiệu lực được hệ thống tính. Nếu tài khoản không thao tác được, quản trị viên kiểm tra quyền trên **Duyệt đề nghị mua hàng** và trạng thái đề nghị; không tự thêm một vai trò mới chỉ để vượt thông báo.
