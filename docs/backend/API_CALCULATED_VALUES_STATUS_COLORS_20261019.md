# Bàn giao số liệu và màu trạng thái cho FE — 19/10/2026

Áp dụng cho các API hiện có trong [danh mục tích hợp](BE_FE_API_REFERENCE_20261011.md); đường dẫn và dữ liệu gửi khi lưu giữ nguyên. Cấu trúc chính xác nằm trong [OpenAPI](medcom-openapi.json). Các tên trường dưới đây dành cho lập trình viên tích hợp, không dùng làm nhãn trên giao diện ERP.

Khi đọc danh sách, chi tiết, dropdown hoặc thông báo có mã trạng thái, BE bổ sung hai trường cạnh tên trạng thái:

```json
{
  "statusId": 1,
  "statusName": "Nháp",
  "statusForeColor": "#000000",
  "statusBackColor": "#FFFFFF"
}
```

Đây là ví dụ giả lập. FE dùng `statusForeColor` cho màu chữ, `statusBackColor` cho màu nền của trạng thái. Giá trị là mã CSS `#RRGGBB`, hoặc `#RRGGBBAA` nếu có độ trong suốt; lấy từ cấu hình `ForeColor`/`BackColor` của đúng loại chứng từ. Thiếu màu, không có danh mục tương ứng hoặc mã trạng thái không xác định duy nhất thì trả `null`; FE dùng màu mặc định của giao diện. Một trạng thái phụ như `deliveryStatusId` có các trường tương ứng `deliveryStatusForeColor`/`deliveryStatusBackColor`, có thể `null` nếu danh mục không có màu. Quyền và khả năng bấm nút vẫn lấy từ API quyền/thao tác của màn hình.

Chi tiết chứng từ tại `GET /api/erp/{module}/detail` bổ sung `data.summary` trên những màn hình có tổng ở lưới ERP:

| Màn hình / module | Số liệu trong `data.summary` |
|---|---|
| Quản lý đơn hàng: `sales-orders`, tab PM `sales-order-pm`, tab SA `sales-order-sa` | `rowCount`, `amount`, `vATAmount`, `totalAmount` |
| Quét QR xuất kho `warehouse-qr`, quét QR xuất bán `sales-qr`, di chuyển bàn giao máy `machine-movements` | `rowCount`, `quantity` |
| Sửa chữa, bảo hành, bảo trì máy `machine-repairs` | `rowCount`, `quantity`, `laborAmount`, `partsAmount`, `amount` |

`rowCount` là số dòng toàn chứng từ. Các tổng lấy toàn bộ dòng thuộc chứng từ đang được phép xem, không phụ thuộc `page`/`pageSize`; phần dòng vẫn phân trang như trước. Số thập phân trả chuỗi để giữ độ chính xác. Không có giá trị để cộng thì tổng là `null`; chứng từ không có dòng trả `rowCount: 0`. Tổng tiền có trường `...Display` theo tiền tệ chứng từ khi xác định được VND/USD. Giữ nguyên cách viết `vATAmount` đang có trong API. Những màn hình chưa có cấu hình tổng trong ERP không được tự suy ra tổng mới.

Khi tạo/sửa đề nghị mua hàng, BE tính thành tiền dòng bằng số lượng × đơn giá theo công thức ERP. Khi sửa tỷ giá trên đơn đặt mua hoặc đề nghị nhập kho, BE tính lại số tiền phụ thuộc tỷ giá của cả các dòng không chỉnh sửa. Đọc chứng từ lịch sử vẫn trả số đã lưu và các số liệu từ view nguồn; không tự ghi sửa dữ liệu trong lúc GET. Các trường dòng PO mà chủ dự án đã yêu cầu bỏ tiếp tục được bỏ.

Bản này gom các nhóm tra tên/màu tham chiếu thành một lượt SQL và tận dụng dữ liệu chi tiết đã đọc trong cùng giao dịch. Đo thực tế bản VPS trước khi triển khai thay đổi này: 175 lượt đọc đều 200, trung vị dropdown 1.239 ms, danh sách 1.285 ms, chi tiết 1.403 ms. Chưa đạt yêu cầu dưới 100 ms. Thời gian của bản mới cần đo lại sau khi chủ dự án redeploy; số đo thành phần trên máy phát triển không phải kết quả của VPS.

Nguồn đối chiếu: [công thức và tổng ERP](../../inventories/backend/20261018/calculated-data-audit.json), [kiểm tra thành phần SQL và màu](../../inventories/backend/20261018/calculated-read-component-validation.json), [đợt đo VPS](../../inventories/backend/20261018/vps-read-latency.json). Không có dữ liệu chứng từ hoặc tài khoản thật trong các tài liệu này.
