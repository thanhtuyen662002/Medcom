> Chọn đúng nhánh theo hàng của đợt: có thiết bị thì qua Kỹ thuật; không có thiết bị thì PM gửi trực tiếp TP SA. Kho đích ghi số thực nhận trên phiếu nhập kho, không sửa tổng nhận trên đợt.

## 1. NVKD lập đề nghị, PM xác nhận

Vào **Quản lý kho → Đề nghị điều chuyển nội bộ**, mở **Phiếu đề nghị điều chuyển nội bộ (Sales / NVKD)**. Chọn chi nhánh/kho nguồn, chi nhánh/kho đích, ngày cần điều chuyển và người phụ trách; thêm hàng, số lượng, yêu cầu lô và ghi chú. Lưu rồi gửi PM.

PM kiểm tra đề nghị tại màn hình dành cho PM, xác nhận hoặc trả lại có lý do. Chỉ gom các đề nghị đủ điều kiện vào đợt; không gom nhầm các tuyến kho khác nhau.

## 2. Lập đợt và đồng bộ đề nghị

Mở **Đợt điều chuyển nội bộ (PM / Điều phối)**. Khai báo kho nguồn/kho đích khác nhau, PM, TP SA, ngày dự kiến và vận chuyển. Tại **Các đề nghị trong đợt**, chọn đủ **Mã yêu cầu** ở từng dòng rồi bấm **Đồng bộ đề nghị**.

Nếu chưa có đề nghị, hoặc bất kỳ dòng nào bị trống mã, hệ thống phải báo lỗi và không đồng bộ. Sau đồng bộ, kiểm tra **Chi tiết điều chuyển** và **Thiết bị / Tài sản**; các dòng tổng hợp phải đúng đề nghị nguồn.

## 3. Gửi đúng nhánh phê duyệt

| Loại đợt | PM thao tác | Bước tiếp theo |
| --- | --- | --- |
| Có thiết bị | Chọn Kỹ thuật phụ trách, bấm **Gửi kỹ thuật** | Kỹ thuật kiểm tra rồi **Gửi TP SA** |
| Không có thiết bị | Bấm **Gửi TP SA** | TP SA duyệt trực tiếp |

Nút không phù hợp loại đợt hoặc trạng thái sẽ bị khóa. Nếu loại hàng vừa thay đổi, đồng bộ và kiểm tra lại trước khi gửi. Kỹ thuật phải xác định thiết bị/serial đúng mã hàng, đủ số lượng thực xuất trước khi hoàn tất đợt thiết bị.

## 4. TP SA và Kế toán xử lý

TP SA phê duyệt, chuyển Kế toán hoặc trả lại bước trước kèm lý do. Kế toán kiểm tra số lượng được duyệt, lô và hạn dùng, tạo/liên kết **PXK điều chuyển nội bộ**, sau đó chuyển Kho nguồn.

PXK phải thuộc đúng đợt và kho nguồn. Không dùng một phiếu xuất của giao dịch khác rồi điền lại mã đợt.

## 5. Kho nguồn xác nhận xuất

Kho nguồn kiểm tra hàng, lô, hạn dùng, lượng xuất và serial thiết bị theo PXK liên kết. Xác nhận xuất thực tế bằng chức năng của luồng điều chuyển. Đợt chuyển sang **Đang điều chuyển** để Kho đích tiếp nhận.

## 6. Kho đích nhận từng phần hoặc nhận đủ

Mở bước nhận điều chuyển, lập **PNK điều chuyển** cho đợt. Trên chi tiết PNK, nhập đúng **số lượng thực nhận**, mã hàng, lô, hạn dùng và kho đích; lưu PNK nháp rồi thực hiện xác nhận nhận hàng của luồng.

Hệ thống kiểm tra số nhận không vượt số đã xuất còn lại. PNK được chốt và tổng số nhận trên đợt tự cập nhật. **Không nhập tay ActualReceiveQty trên bảng đợt để thay thế PNK**.

Nếu nhận thiếu, đợt ở **Đã nhận một phần / nhận thiếu** và có thể lập PNK tiếp cho phần còn lại. Nhận đủ thì **Hoàn tất**; với thiết bị, các serial phải khớp trước khi cập nhật bàn giao/vị trí tài sản.

## 7. Theo dõi trả lại và liên kết

Xem **Lịch sử gửi / duyệt** để biết người giữ bước và lý do trả lại. Đối chiếu đủ chuỗi: đề nghị nguồn → đợt → PXK → một hoặc nhiều PNK. Một phiếu lưu nháp hoặc gửi qua vai trò chưa làm hoàn tất điều chuyển.
