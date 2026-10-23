> Mỗi phiếu là một đợt hàng. “SL lấy đợt này” là lượng dự kiến của đợt; số thực nhận do Thủ kho xác nhận ở bước sau. Gửi đề nghị chưa làm tăng tồn kho.

## 1. Chọn đơn đặt hàng

Vào **Quản lý kho → Đề nghị nhập hàng → Phiếu đề nghị nhập hàng**, bấm **Thêm** rồi **Lấy từ đơn đặt hàng**. Chọn PO cần xử lý và kiểm tra các dòng còn lại. Chỉ chọn hàng thuộc đợt đang lập.

Hộp chọn có số lượng đặt, số lượng đã được lấy vào các đợt và số lượng còn lại. Phần còn lại đã trừ các đợt được phân bổ còn hiệu lực; không chỉ trừ hàng đã nhập kho.

## 2. Nhập số lượng đợt này

Nhập tại cột **SL lấy đợt này** trong hộp chọn rồi bấm **Chọn**. Số lượng phải lớn hơn 0 và không vượt phần còn lại. Không sửa cột tổng số lượng đặt để chia đợt.

| Mã hàng minh họa | Còn lại | SL lấy đợt này | Còn cho đợt sau |
| --- | --- | --- | --- |
| HH-VD-001 | 1.000 | 250 | 750 |
| HH-VD-002 | 400 | 100 | 300 |

Mã hàng, liên kết dòng PO và **Hãng sản xuất** được chuyển sang chi tiết phiếu. Hãng sản xuất lấy theo danh mục hàng; nếu danh mục chưa khai báo thì cần kiểm tra danh mục trước, không nhập đoán hãng.

## 3. Một mặt hàng có nhiều lô: copy dòng và lưu một lần

Cách này áp dụng cho **phiếu mới** và **phiếu đã lưu** còn ở trạng thái **Nháp / Yêu cầu TM xem lại**. Với phiếu đã lưu, mở đúng phiếu rồi bấm **Sửa**.

Tại **Chi tiết hàng hóa**, thực hiện:

- Nhấp phải vào dòng hàng cần chia nhiều lô, chọn **Chèn dòng / Copy dòng này (nhân bản)**.
- Nhập số dòng cần thêm rồi bấm **Copy**. Ví dụ cần 3 lô thì copy thêm **2 dòng**, cùng với dòng gốc thành 3 dòng.
- Sửa cột **SL đề nghị đợt này** ở cả dòng gốc và các dòng copy theo số lượng từng lô.
- Điền **Số lô trên chứng từ** và **Hạn sử dụng trên chứng từ** riêng cho từng dòng. Giữ đúng mã hàng và nguồn đơn đặt hàng.

Ví dụ minh họa: một dòng hàng có số lượng đợt nhập là **3.680**, được giao thành ba lô:

| Dòng hàng | Số lô minh họa | SL đề nghị đợt này | Hạn sử dụng minh họa |
| --- | --- | --- | --- |
| Dòng copy thứ nhất | LO-VD-01 | 80 | 19/05/2030 |
| Dòng copy thứ hai | LO-VD-02 | 1.600 | 01/07/2030 |
| Dòng gốc | LO-VD-03 | 2.000 | 06/07/2030 |
| **Tổng cùng dòng PO** | | **3.680** | |

Kiểm tra PO, ngày chứng từ, chi nhánh, loại nhập hàng, nơi đi/nơi đến và các trường bắt buộc trên form. Hoàn tất số lượng, lô và hạn dùng của mọi dòng rồi bấm **Lưu** một lần.

Hệ thống kiểm tra **tổng số lượng cuối cùng theo từng dòng PO**, gồm tất cả các dòng copy trên phiếu và phần đã phân bổ ở các đợt chưa hủy khác. Tổng này phải không vượt số lượng đặt. Nếu tổng vượt PO, lần lưu bị từ chối và các thay đổi của lần lưu đó không được ghi dở dang. Kiểm tra lại tổng, điều chỉnh các dòng liên quan rồi lưu lại.

Các dòng phải còn liên kết đúng dòng PO. Không đổi sang PO khác khi phiếu đã có phân bổ; hãy dùng phiếu nháp mới nếu chọn nhầm nguồn. Sau khi gửi xử lý, không sửa trực tiếp số lượng để thay đổi kế hoạch của đợt.

## 4. Gửi Thủ kho

Bấm **Gửi Thủ kho**, nhập ghi chú khi cần và xác nhận. Thao tác hợp lệ chuyển phiếu từ **Nháp / Yêu cầu TM xem lại** sang **Đã gửi thủ kho**. Kiểm tra trạng thái và tab **Lịch sử gởi / duyệt** sau khi gửi.

Không cần chờ đủ hóa đơn chi phí mới gửi Thủ kho. Chi phí được bổ sung theo [luồng phân bổ chi phí](#import-costs).

## 5. Xác nhận hàng thực tế và chuyển tiếp

Thủ kho mở **Xác nhận tình trạng hàng về**, kiểm đếm và ghi **lô thực tế, số lượng thực tế, hạn dùng thực tế**, kèm các thông tin kiểm nhận. Sau đó **Gửi TP SA**; nếu cần TM làm lại thì chọn **Từ chối** và ghi rõ lý do.

Các màn hình tiếp theo nằm cùng menu **Quản lý kho → Đề nghị nhập hàng**:

| Vai trò | Màn hình | Thao tác chính |
| --- | --- | --- |
| TP SA | Kiểm soát thông tin hàng hóa | Đối chiếu chứng từ/kiểm nhận; **Gửi PM**, chọn PM nhận việc |
| PM | Kiểm soát và xác nhận chất lượng hàng hóa | Kiểm tra hàng không phù hợp, kết luận; **Gửi kỹ thuật** hoặc **Gửi kế toán** |
| Kỹ thuật | Xác nhận tình trạng hàng hóa | Ghi kết quả kiểm tra theo phân công; **Gửi kế toán** khi đủ điều kiện |
| BLĐ | Phê duyệt phương án hàng hóa | **Phê duyệt** hoặc **Hủy/PA khác** đối với phương án được gửi |

Khi phát hiện hàng không phù hợp, ghi từng dòng tại **Hàng hóa không phù hợp**: hàng/lô, lượng đã kiểm, lượng không phù hợp, tình trạng, cách giải quyết, kết luận và ý kiến đề nghị theo hồ sơ kiểm nhận. Đính kèm ảnh/BBKC khi cần. Không giảm số nhận chỉ để che phần hàng hỏng hoặc thiếu; phải giữ thông tin kiểm nhận và kết luận xử lý.

Khi trả lại, ghi rõ lý do; người nhận sửa tại đúng bước được yêu cầu rồi gửi lại. Không tạo phiếu trùng để bỏ qua bước trả lại.

Trường hợp lập phương án cần BLĐ, TM dùng **Gửi BLĐ**. Đây là nhánh duyệt phương án; không mặc định mọi phiếu đều qua BLĐ.

## 6. Nhập kho và xử lý đợt nháp

Phiếu đề nghị, chứng từ mua hàng và phiếu nhập kho là các chứng từ liên kết riêng. Chỉ kiểm nhận/gửi đề nghị không thay thế việc lập và chốt phiếu nhập kho theo nghiệp vụ.

Nếu không tiếp tục đợt còn nháp, dùng **Hủy đợt nháp**, ghi lý do. Lượng của đợt hủy được trả lại cho PO. Nút **Xóa** chỉ áp dụng phiếu Nháp/Yêu cầu TM xem lại và chưa có liên kết nhập kho, mua hàng, dịch vụ hoặc chi phí; phiếu đã chuyển xử lý phải hoàn trả theo luồng.
