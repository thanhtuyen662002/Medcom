> Phân biệt ba thông tin: **tình trạng gốc theo Excel**, **hiệu lực tính theo ngày**, **tình trạng máy theo vòng đời**. Các thông tin này không thay thế cho tình trạng kỹ thuật/vận hành của máy.

> Máy được quản lý trong danh mục và theo dõi lịch sử không đồng nghĩa với việc phải khấu hao. **Chế độ khấu hao** được xác định riêng, độc lập với hiệu lực hợp đồng và tình trạng máy.

## 1. Khai báo máy và serial

Vào **Tài sản → Danh mục tài sản**. Tạo hoặc kiểm tra mã tài sản, mã hàng, tên máy, serial và thông tin theo dõi vòng đời. Dùng một mã tài sản ổn định cho một máy; tránh tạo lại tài sản khi máy chuyển nơi đặt.

Khai báo các thuộc tính sở hữu, bảo hành và thông tin kỹ thuật theo hồ sơ. Serial chưa rõ cần được xác nhận trước khi sửa liên kết, không đoán theo tên máy gần giống.

## 2. Phân loại máy chỉ theo dõi hoặc có khấu hao

Tại **Tài sản → Danh mục tài sản → Thông tin chung**, có hai trường:

| Trường | Cách sử dụng |
| --- | --- |
| Chế độ khấu hao | Chọn Chờ kế toán xác nhận, Chỉ theo dõi máy hoặc Có tính khấu hao |
| Áp dụng từ kỳ | Kỳ bắt đầu áp dụng phân loại, chọn trong danh sách kỳ đang mở |

| Chế độ | Theo dõi máy và lịch sử | Tính khấu hao |
| --- | --- | --- |
| Chờ kế toán xác nhận | Vẫn theo dõi bình thường | Chưa đưa vào tính khấu hao |
| Chỉ theo dõi máy | Vẫn theo dõi bình thường | Không tính khấu hao |
| Có tính khấu hao | Vẫn theo dõi bình thường | Tính từ kỳ áp dụng khi đủ điều kiện |

Các máy đã có tại thời điểm triển khai được giữ **Chờ kế toán xác nhận**, không tự phân loại theo giá trị, loại máy, sở hữu hay hợp đồng. Máy tạo mới mặc định **Chỉ theo dõi máy**; có thể giữ mặc định này nếu chưa cần đưa vào khấu hao.

### Kế toán xác nhận phân loại

- Chọn đúng mã tài sản/serial, bấm **Sửa** và chọn **Chế độ khấu hao** phù hợp với hồ sơ.
- Khi xác nhận hoặc thay đổi phân loại, chọn **Áp dụng từ kỳ** là kỳ đang mở, sau các kỳ đã khóa sổ. Nếu máy đã có phát sinh khấu hao, chọn kỳ sau phát sinh đã ghi nhận; không sửa hồi tố để ghi đè lịch sử.
- Nếu chọn **Có tính khấu hao**, kiểm tra ngày bắt đầu tính khấu hao, nguyên giá dương, thời gian khấu hao dương và các tài khoản tài sản, khấu hao, chi phí hợp lệ.
- Bấm **Lưu**. Hệ thống kiểm tra rồi ghi nhận phân loại, kỳ áp dụng và người cập nhật. Lưu phân loại chưa tạo bút toán khấu hao; kế toán tiếp tục tính khấu hao theo chức năng hiện có cho kỳ đang mở.

Ví dụ minh họa: một máy trước đây chỉ theo dõi, được xác nhận có khấu hao từ một kỳ đang mở. Chọn **Có tính khấu hao**, chọn kỳ đó, hoàn thiện thông tin tài chính rồi **Lưu**. Máy được xét tính khấu hao từ kỳ áp dụng và khi đã đến ngày bắt đầu tính khấu hao; các kỳ trước không tự tính bù.

Máy chờ xác nhận hoặc chỉ theo dõi không phát sinh khấu hao mới. Máy có khấu hao vẫn phải đủ điều kiện theo ngày, chưa ngừng khấu hao, chưa thanh lý và còn giá trị để khấu hao. Khi chuyển từ có khấu hao sang chỉ theo dõi ở kỳ hợp lệ, lịch sử khấu hao trước đó vẫn được giữ.

Phân loại không làm mất lịch sử đặt máy, demo, cho mượn, điều chuyển, sửa chữa hoặc linh kiện. Các kỳ đã chốt và quyền hiện có được giữ nguyên; không thêm bước gửi duyệt hay cấp quyền mới. Người chưa có quyền sửa cần chuyển hồ sơ cho kế toán/người có quyền hiện hữu xử lý.

## 3. Đọc hợp đồng và ba trường trạng thái

Tại tab **Hợp đồng và hiệu lực**, đọc từng trường theo đúng ý nghĩa:

| Trường | Cách hiểu |
| --- | --- |
| Tình trạng gốc theo Excel | Nội dung nguồn khách đã cung cấp, giữ riêng để đối chiếu |
| Hiệu lực tính theo ngày | Tính từ ngày bắt đầu/kết thúc của hợp đồng hiện tại |
| Tình trạng máy | Trạng thái vòng đời như Trong kho, Demo, Cho mượn, Đã bán… |

Ngày bắt đầu ở tương lai là **Chưa hiệu lực**; ngày kết thúc trước hôm nay là **Hết hiệu lực**. Không khai báo cả hai ngày là **Chưa khai báo thời hạn**. Không có ngày kết thúc được hiển thị riêng, không tự gán thành hết hạn.

Thông tin bảo hành, tình trạng đã nhập và tình trạng kỹ thuật là các trường riêng. Hợp đồng hết hạn không tự chứng minh máy hỏng hoặc đã thu hồi.

## 4. Ghi nhận đặt máy, demo, cho mượn hoặc thu hồi

Mở **Tài sản → Phiếu di chuyển / bàn giao máy**, khai báo ngày, loại nghiệp vụ và chi tiết máy; chọn nơi đi, nơi đến, khách hàng/vị trí và hợp đồng khi áp dụng. Chỉ định đúng trạng thái vòng đời sau biến động.

Kiểm tra hồ sơ bàn giao rồi **lưu và khóa chứng từ** theo quyền được cấp. Vòng đời hiện tại lấy biến động đã khóa, có ngày không ở tương lai; chỉ lưu nháp chưa làm cập nhật vị trí hiện tại.

Khi máy đổi từ nơi đặt này sang nơi đặt khác, tạo biến động tiếp theo cho cùng tài sản. Khi thu hồi, ghi nhận về đúng kho; không chỉ sửa tên khách trên danh mục để thay lịch sử.

## 5. Sửa chữa và thay linh kiện

Mở **Tài sản → Phiếu sửa chữa / bảo hành / bảo trì máy**, chọn đúng máy/serial, ghi hiện tượng, chẩn đoán, công việc, thời gian và linh kiện liên quan. Nếu linh kiện được quản lý QR, thực hiện xuất lắp/thu hồi theo [hướng dẫn QR](#qr-parts), liên kết đúng máy và chứng từ.

Linh kiện mới phải có tồn hợp lệ trước khi xuất lắp. Ghi tên linh kiện vào ghi chú sửa chữa không thay thế chứng từ kho và lịch sử QR.

## 6. Rã máy và thu hồi linh kiện

Lập biến động rã máy, chọn tài sản nguồn, ngày và trạng thái sau rã; hoàn thiện và khóa. Kho tạo phiếu nhập thu hồi, chọn phiếu rã và quét từng linh kiện, ghi tình trạng sau thu hồi rồi chốt chứng từ.

Nếu dùng linh kiện thu hồi cho máy khác, tiếp tục lập chứng từ xuất lắp cho máy nhận; giữ được chuỗi máy nguồn → linh kiện → máy nhận.

## 7. Tra cứu và đối chiếu

Từ menu Tài sản, dùng **Machine 360**, **Lịch sử vòng đời máy**, **Máy cần chăm sóc** và **Nguồn gốc linh kiện** theo nhu cầu. Tra bằng mã tài sản hoặc serial, kiểm tra vị trí hiện tại, hợp đồng, biến động và sửa chữa.

Nếu vị trí chưa đổi, kiểm tra chứng từ đã khóa chưa, ngày hiệu lực có ở tương lai không và có biến động mới hơn không. Không sửa trực tiếp kết quả tra cứu để làm khớp hồ sơ.
