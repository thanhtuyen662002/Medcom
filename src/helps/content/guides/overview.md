> Chọn quy trình ở thanh bên để xem các bước thao tác, sơ đồ và cách xử lý lỗi. Chuyển sang **Tài liệu kỹ thuật** khi cần tên form, bảng, STP, view và trigger liên quan.

## 1. Mua hàng nối với nhập hàng theo đợt

[Mua hàng](#purchasing) bắt đầu bằng đề nghị và quyết định duyệt. Đề nghị đã duyệt tạo PO. [Nhập hàng](#inbound) lấy số lượng từ các dòng PO thành nhiều đợt; mỗi đợt chuyển qua các vai trò trước khi phát sinh chứng từ kho và mua hàng tương ứng.

PO theo dõi lượng đặt; đề nghị theo dõi một đợt xử lý; phiếu nhập kho ghi nhận nhập thực tế. Ba loại chứng từ không thay thế nhau.

## 2. Chi phí và BPTM chạy theo lô hàng

[Chi phí nhập khẩu](#import-costs) nối từ chi phí của đề nghị sang dịch vụ và phân bổ vào chứng từ nhập khẩu. [BPTM](#bptm) theo dõi đợt hàng, hạn thanh toán, kế hoạch thuế, khoản đã nộp và thanh toán. Các nhánh cùng liên kết PO/đợt, không bắt buộc chờ đủ chi phí mới gửi Thủ kho.

## 3. Bán hàng đi đến xuất giao

[Bán hàng](#sales) đi từ NVKD qua PM, SA và Kỹ thuật khi cần, đến Kế toán lập hóa đơn/PXK và Kho xuất giao. Trạng thái gửi công việc cho Kho khác với tiến độ giao hàng thực tế.

## 4. Điều chuyển nối hai kho

[Điều chuyển nội bộ](#internal-transfer) gom nhiều đề nghị thành đợt, duyệt theo loại hàng, xuất kho nguồn rồi nhập kho đích. Một đợt có thể nhận qua nhiều PNK. Chỉ khi nhận đủ và khớp serial thiết bị mới hoàn tất cập nhật bàn giao tài sản.

## 5. Máy và linh kiện giữ lịch sử riêng

[Vòng đời máy](#machine-lifecycle) theo dõi một tài sản/serial qua nhiều nơi đặt và nghiệp vụ. [QR linh kiện](#qr-parts) theo dõi từng linh kiện từ kho đến máy và thu hồi. Biến động đã khóa và chứng từ kho hoàn tất tạo căn cứ cho vị trí hiện tại; ghi chú hoặc bản nháp không thay thế các căn cứ đó.

## 6. Cách đọc hướng dẫn

- **Hướng dẫn:** điều kiện, màn hình, nút bấm và kết quả cần kiểm tra.
- **Sơ đồ:** đường đi chính, nhánh lựa chọn và điểm nối với quy trình khác.
- **Xử lý lỗi:** cách đối chiếu khi thao tác bị chặn.

Ví dụ dùng mã giả để minh họa. Nút hiển thị còn phụ thuộc trạng thái chứng từ và quyền đã thiết lập trên ERP. Khi khác màn hình thực tế, ghi lại tên màn hình, bước thao tác và thông báo để người phụ trách kiểm tra.
