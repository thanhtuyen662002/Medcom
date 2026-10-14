# Bàn giao API BE cho FE — màn hình và thao tác

Danh mục đủ 243 API hiện có, phục vụ 19 màn hình ERP. Cập nhật 14/10/2026. Trên VPS, FE gọi qua proxy tại https://medcom.bms79.com/api/erp; nối đường dẫn BE trong các bảng dưới đây vào địa chỉ đó.

## Quy định giao diện

Dùng caption tiếng Việt BE trả về từ DB. Khi caption rỗng, FE dùng nhãn nghiệp vụ cố định đã được duyệt trên ERP; không suy ra nhãn từ tên trường, đường dẫn API, tên bảng, mã lỗi hoặc thông tin kỹ thuật BE. Không đưa các từ như fields, stateToken, readScope, ReferenceState, schema hay tên thao tác nội bộ lên giao diện. Tên cột dùng nhãn nghiệp vụ đã được duyệt.

Trong đợt thử giao diện này, các nút Thêm/Lưu/Xóa, lưu chi phí/lưu danh sách máy và thêm/xóa QR luôn hiện và cho phép bấm khi đã truy cập được màn hình. Trạng thái khóa của phiếu vẫn là dữ liệu thật; FE không dùng nó để khóa các nút CUD này. Khi gửi thao tác, BE vẫn kiểm tra quyền, trạng thái chứng từ và điều kiện ghi DB. Các nút gửi/duyệt/thu hồi vẫn hiện và bật theo kết quả BE. Sau thao tác thành công, tải lại phiếu và nút. Lỗi hiển thị bằng câu tiếng Việt theo thao tác đang làm; thông tin chẩn đoán giữ cho đội triển khai.

Mỗi bản ghi đã trả đủ dữ liệu tại một vị trí, danh sách và chi tiết vẫn lấy theo trang. Hàng hóa đi kèm mã hàng, tên hàng, đơn vị; kho, chi nhánh và trạng thái đi kèm tên. Tiền và ngày có dữ liệu hiển thị phù hợp Việt Nam. Những mã thuộc các chứng từ khác nhau được giữ riêng.

Lần bàn giao này không bổ sung In hoặc Import/copy. Các API chọn/dán đã tồn tại được ghi trong danh mục để nhận diện, không yêu cầu dựng thêm các nút đó.

## API dùng chung

| Dùng ở đâu / thao tác | API | Làm gì |
|---|---|---|
| Hỗ trợ vận hành | `GET /health/live` | Kiểm tra BE còn hoạt động; không đưa lên giao diện nghiệp vụ. |
| Hỗ trợ vận hành | `GET /health/ready` | Kiểm tra điều kiện vận hành; không dùng để khóa các nút của người dùng. |
| Hỗ trợ tích hợp | `GET /api/contracts/openapi.json` | Tài liệu cấu trúc dữ liệu dành cho lập trình viên; không hiển thị cho người dùng ERP. |
| Thông báo | `GET /api/notifications` | Lấy thông báo gửi riêng cho người đang đăng nhập, theo trang. |
| Thông báo | `GET /api/notifications/{id}` | Đọc nội dung một thông báo của người dùng. |
| Mở phiếu từ thông báo | `GET /api/notifications/{id}/target` | Lấy màn hình đích và mã phiếu để mở đúng chứng từ. |
| Đánh dấu đã xem | `POST /api/notifications/{id}/read` | Ghi nhận người dùng đã xem thông báo. |
| Hỗ trợ tích hợp | `GET /api/platform/metadata` | Thông tin hệ thống dành cho đội triển khai; không dùng làm nội dung giao diện nghiệp vụ. |
| Đăng nhập và các thao tác | `GET /api/auth/csrf` | Chuẩn bị bảo vệ phiên trước khi đăng nhập hoặc thao tác; không tạo nút hay nhãn trên giao diện. |
| Đăng nhập | `POST /api/auth/login` | Đăng nhập bằng tài khoản ERP. |
| Thông tin người dùng | `GET /api/auth/session` | Lấy người đang đăng nhập và quyền truy cập. |
| Duy trì phiên | `POST /api/auth/session/continue` | Tiếp tục phiên đang sử dụng. |
| Đăng xuất | `POST /api/auth/logout` | Kết thúc phiên người dùng. |
| Không gian làm việc | `GET /api/workspace` | Lấy chi nhánh và màn hình người dùng được truy cập. |
| Chọn chi nhánh | `GET /api/lookups/branches` | Lấy mã và tên chi nhánh được phép dùng, có tìm kiếm và phân trang. |
| Hỗ trợ tích hợp | `GET /api/documents/field-contract` | Mô tả dữ liệu chứng từ dành cho đội triển khai. |
| Hỗ trợ tích hợp | `GET /api/documents/query-contract` | Mô tả bộ lọc và phân trang dành cho đội triển khai. |

## Đề nghị mua hàng

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/purchase-requests/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/purchase-requests` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/purchase-requests/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/purchase-requests/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/purchase-requests/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/purchase-requests/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Chọn dữ liệu có sẵn | `POST /api/erp/purchase-requests/selection` | API chọn dữ liệu đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Dán dữ liệu | `POST /api/erp/purchase-requests/paste/validate` | API kiểm tra dữ liệu dán đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Thêm | `POST /api/erp/purchase-requests/create` | Tạo phiếu mới và ghi các dòng chi tiết vào cơ sở dữ liệu. |
| Lưu | `POST /api/erp/purchase-requests/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xóa | `POST /api/erp/purchase-requests/delete` | Xóa phiếu khi người dùng và trạng thái cho phép. |
| Gửi đề nghị | `POST /api/erp/purchase-requests/actions/submit` | Thực hiện nút “Gửi đề nghị” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Gửi đặt mua hàng | `POST /api/erp/purchase-requests/actions/send-purchase-order` | Thực hiện nút “Gửi đặt mua hàng” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |

## Quản lý đơn hàng

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/sales-orders/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/sales-orders` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/sales-orders/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/sales-orders/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Xem thông tin hợp đồng | `GET /api/erp/sales-orders/contract-info` | Mở thông tin hợp đồng liên quan đến phiếu. |
| Danh sách chọn | `POST /api/erp/sales-orders/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Lựa chọn khi Gửi PM | `POST /api/erp/sales-orders/actions/send-pm/options` | Lấy danh sách người nhận hoặc bước xử lý để người dùng chọn trước khi gửi. |
| Kiểm tra kết quả thao tác | `POST /api/erp/sales-orders/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Chọn dữ liệu có sẵn | `POST /api/erp/sales-orders/selection` | API chọn dữ liệu đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Dán dữ liệu | `POST /api/erp/sales-orders/paste/validate` | API kiểm tra dữ liệu dán đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Thêm | `POST /api/erp/sales-orders/create` | Tạo phiếu mới và ghi các dòng chi tiết vào cơ sở dữ liệu. |
| Lưu | `POST /api/erp/sales-orders/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xóa | `POST /api/erp/sales-orders/delete` | Xóa phiếu khi người dùng và trạng thái cho phép. |
| Thu hồi để sửa | `POST /api/erp/sales-orders/actions/recall` | Thực hiện nút “Thu hồi để sửa” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Gửi PM | `POST /api/erp/sales-orders/actions/send-pm` | Thực hiện nút “Gửi PM” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |

## Phiếu đề nghị điều chuyển nội bộ

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/internal-transfer-requests/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/internal-transfer-requests` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/internal-transfer-requests/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/internal-transfer-requests/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/internal-transfer-requests/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Lựa chọn khi Gửi PM | `POST /api/erp/internal-transfer-requests/actions/send-pm/options` | Lấy danh sách người nhận hoặc bước xử lý để người dùng chọn trước khi gửi. |
| Kiểm tra kết quả thao tác | `POST /api/erp/internal-transfer-requests/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Chọn dữ liệu có sẵn | `POST /api/erp/internal-transfer-requests/selection` | API chọn dữ liệu đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Dán dữ liệu | `POST /api/erp/internal-transfer-requests/paste/validate` | API kiểm tra dữ liệu dán đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Thêm | `POST /api/erp/internal-transfer-requests/create` | Tạo phiếu mới và ghi các dòng chi tiết vào cơ sở dữ liệu. |
| Lưu | `POST /api/erp/internal-transfer-requests/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xóa | `POST /api/erp/internal-transfer-requests/delete` | Xóa phiếu khi người dùng và trạng thái cho phép. |
| Thu hồi để sửa | `POST /api/erp/internal-transfer-requests/actions/recall` | Thực hiện nút “Thu hồi để sửa” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Gửi PM | `POST /api/erp/internal-transfer-requests/actions/send-pm` | Thực hiện nút “Gửi PM” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |

## Xuất kho

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/warehouse-qr/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/warehouse-qr` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/warehouse-qr/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/warehouse-qr/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/warehouse-qr/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/warehouse-qr/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Quét thêm mã QR | `POST /api/erp/warehouse-qr/qr/add` | Ghi mã QR quét vào phiếu đang mở. |
| Quét xóa mã QR | `POST /api/erp/warehouse-qr/qr/delete` | Xóa mã QR quét khỏi phiếu đang mở. |

## Xuất bán hàng

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/sales-qr/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/sales-qr` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/sales-qr/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/sales-qr/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Xem thông tin hợp đồng | `GET /api/erp/sales-qr/contract-info` | Mở thông tin hợp đồng liên quan đến phiếu. |
| Danh sách chọn | `POST /api/erp/sales-qr/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/sales-qr/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Quét thêm mã QR | `POST /api/erp/sales-qr/qr/add` | Ghi mã QR quét vào phiếu đang mở. |
| Quét xóa mã QR | `POST /api/erp/sales-qr/qr/delete` | Xóa mã QR quét khỏi phiếu đang mở. |

## Phiếu di chuyển / bàn giao máy

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/machine-movements/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/machine-movements` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/machine-movements/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/machine-movements/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/machine-movements/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/machine-movements/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Chọn dữ liệu có sẵn | `POST /api/erp/machine-movements/selection` | API chọn dữ liệu đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Dán dữ liệu | `POST /api/erp/machine-movements/paste/validate` | API kiểm tra dữ liệu dán đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Thêm | `POST /api/erp/machine-movements/create` | Tạo phiếu mới và ghi các dòng chi tiết vào cơ sở dữ liệu. |
| Lưu | `POST /api/erp/machine-movements/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xóa | `POST /api/erp/machine-movements/delete` | Xóa phiếu khi người dùng và trạng thái cho phép. |

## Phiếu sửa chữa / bảo hành / bảo trì máy

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/machine-repairs/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/machine-repairs` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/machine-repairs/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/machine-repairs/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/machine-repairs/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/machine-repairs/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Chọn dữ liệu có sẵn | `POST /api/erp/machine-repairs/selection` | API chọn dữ liệu đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Dán dữ liệu | `POST /api/erp/machine-repairs/paste/validate` | API kiểm tra dữ liệu dán đã có; ngoài phạm vi triển khai mới theo yêu cầu bỏ Import/copy. |
| Thêm | `POST /api/erp/machine-repairs/create` | Tạo phiếu mới và ghi các dòng chi tiết vào cơ sở dữ liệu. |
| Lưu | `POST /api/erp/machine-repairs/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xóa | `POST /api/erp/machine-repairs/delete` | Xóa phiếu khi người dùng và trạng thái cho phép. |

## Đặt mua hàng

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/purchase-orders/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/purchase-orders` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/purchase-orders/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/purchase-orders/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/purchase-orders/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Chọn hàng | `POST /api/erp/purchase-orders/item-price` | Lấy giá mua áp dụng cho hàng được chọn. |
| Kiểm tra kết quả thao tác | `POST /api/erp/purchase-orders/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Thêm | `POST /api/erp/purchase-orders/create` | Tạo phiếu mới và ghi các dòng chi tiết vào cơ sở dữ liệu. |
| Lưu | `POST /api/erp/purchase-orders/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xóa | `POST /api/erp/purchase-orders/delete` | Xóa phiếu khi người dùng và trạng thái cho phép. |

## Phiếu đề nghị nhập hàng

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/inbound-requests/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/inbound-requests` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/inbound-requests/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/inbound-requests/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/inbound-requests/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/inbound-requests/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Thêm | `POST /api/erp/inbound-requests/create` | Tạo phiếu mới và ghi các dòng chi tiết vào cơ sở dữ liệu. |
| Lưu | `POST /api/erp/inbound-requests/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xóa | `POST /api/erp/inbound-requests/delete` | Xóa phiếu khi người dùng và trạng thái cho phép. |
| Gửi BLĐ | `POST /api/erp/inbound-requests/actions/send-management` | Thực hiện nút “Gửi BLĐ” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Gửi Thủ kho | `POST /api/erp/inbound-requests/actions/send-warehouse` | Thực hiện nút “Gửi Thủ kho” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Lưu chi phí | `POST /api/erp/inbound-requests/sections/costs/save` | Ghi các dòng chi phí của đề nghị nhập kho. |

## Duyệt đề nghị mua hàng

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/purchase-approvals/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/purchase-approvals` | Tải danh sách đề nghị ở mọi trạng thái trong chi nhánh được phép, theo trang; có thể lọc trạng thái khi cần. Nút Duyệt/Không duyệt vẫn theo quyền và trạng thái phiếu. |
| Mở phiếu | `GET /api/erp/purchase-approvals/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/purchase-approvals/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/purchase-approvals/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/purchase-approvals/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Không duyệt | `POST /api/erp/purchase-approvals/actions/reject` | Thực hiện nút “Không duyệt” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Duyệt | `POST /api/erp/purchase-approvals/actions/approve` | Thực hiện nút “Duyệt” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |

## Xác nhận đơn hàng

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/sales-order-pm/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/sales-order-pm` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/sales-order-pm/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/sales-order-pm/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Xem thông tin hợp đồng | `GET /api/erp/sales-order-pm/contract-info` | Mở thông tin hợp đồng liên quan đến phiếu. |
| Danh sách chọn | `POST /api/erp/sales-order-pm/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/sales-order-pm/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Gửi SA | `POST /api/erp/sales-order-pm/actions/send-sa` | Thực hiện nút “Gửi SA” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Từ chối nhanh | `POST /api/erp/sales-order-pm/actions/reject` | Thực hiện nút “Từ chối nhanh” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |

## Duyệt đơn hàng

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/sales-order-sa/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/sales-order-sa` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/sales-order-sa/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/sales-order-sa/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Xem thông tin hợp đồng | `GET /api/erp/sales-order-sa/contract-info` | Mở thông tin hợp đồng liên quan đến phiếu. |
| Danh sách chọn | `POST /api/erp/sales-order-sa/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/sales-order-sa/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Gửi Kế toán | `POST /api/erp/sales-order-sa/actions/send-accounting` | Thực hiện nút “Gửi Kế toán” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Gửi Kỹ thuật | `POST /api/erp/sales-order-sa/actions/send-tech` | Thực hiện nút “Gửi Kỹ thuật” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Từ chối nhanh | `POST /api/erp/sales-order-sa/actions/reject` | Thực hiện nút “Từ chối nhanh” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Chọn bước gửi về | `POST /api/erp/sales-order-sa/actions/return-step` | Thực hiện nút “Chọn bước gửi về” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Lựa chọn khi Chọn bước gửi về | `POST /api/erp/sales-order-sa/actions/return-step/options` | Lấy danh sách người nhận hoặc bước xử lý để người dùng chọn trước khi gửi. |

## Xác nhận đề nghị điều chuyển

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/internal-transfer-pm/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/internal-transfer-pm` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/internal-transfer-pm/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/internal-transfer-pm/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/internal-transfer-pm/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/internal-transfer-pm/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Lưu | `POST /api/erp/internal-transfer-pm/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Đồng ý điều chuyển | `POST /api/erp/internal-transfer-pm/actions/pm-confirm` | Thực hiện nút “Đồng ý điều chuyển” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Từ chối nhanh | `POST /api/erp/internal-transfer-pm/actions/reject` | Thực hiện nút “Từ chối nhanh” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |

## Đợt điều chuyển nội bộ

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/internal-transfer-batches/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/internal-transfer-batches` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/internal-transfer-batches/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/internal-transfer-batches/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/internal-transfer-batches/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/internal-transfer-batches/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Thêm | `POST /api/erp/internal-transfer-batches/create` | Tạo phiếu mới và ghi các dòng chi tiết vào cơ sở dữ liệu. |
| Lưu | `POST /api/erp/internal-transfer-batches/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xóa | `POST /api/erp/internal-transfer-batches/delete` | Xóa phiếu khi người dùng và trạng thái cho phép. |
| Đồng bộ đề nghị | `POST /api/erp/internal-transfer-batches/actions/sync-requests` | Thực hiện nút “Đồng bộ đề nghị” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Gửi kỹ thuật | `POST /api/erp/internal-transfer-batches/actions/send-tech` | Thực hiện nút “Gửi kỹ thuật” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |

## Xác nhận thiết bị điều chuyển

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/internal-transfer-tech/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/internal-transfer-tech` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/internal-transfer-tech/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/internal-transfer-tech/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/internal-transfer-tech/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/internal-transfer-tech/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Lưu | `POST /api/erp/internal-transfer-tech/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Gửi TP SA | `POST /api/erp/internal-transfer-tech/actions/send-sa` | Thực hiện nút “Gửi TP SA” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Từ chối nhanh | `POST /api/erp/internal-transfer-tech/actions/reject` | Thực hiện nút “Từ chối nhanh” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Lưu danh sách máy | `POST /api/erp/internal-transfer-tech/sections/assets/save` | Ghi các máy đã chọn trên phiếu kỹ thuật điều chuyển. |
| Lựa chọn khi Gửi TP SA | `POST /api/erp/internal-transfer-tech/actions/send-sa/options` | Lấy danh sách người nhận hoặc bước xử lý để người dùng chọn trước khi gửi. |

## Phê duyệt điều chuyển nội bộ

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/internal-transfer-sa/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/internal-transfer-sa` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/internal-transfer-sa/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/internal-transfer-sa/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/internal-transfer-sa/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/internal-transfer-sa/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Lưu | `POST /api/erp/internal-transfer-sa/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Gửi Kế toán | `POST /api/erp/internal-transfer-sa/actions/send-accounting` | Thực hiện nút “Gửi Kế toán” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Từ chối nhanh | `POST /api/erp/internal-transfer-sa/actions/reject` | Thực hiện nút “Từ chối nhanh” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Chọn bước gửi về | `POST /api/erp/internal-transfer-sa/actions/return-step` | Thực hiện nút “Chọn bước gửi về” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Lựa chọn khi Chọn bước gửi về | `POST /api/erp/internal-transfer-sa/actions/return-step/options` | Lấy danh sách người nhận hoặc bước xử lý để người dùng chọn trước khi gửi. |

## Xử lý điều chuyển nội bộ

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/internal-transfer-accounting/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/internal-transfer-accounting` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/internal-transfer-accounting/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/internal-transfer-accounting/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/internal-transfer-accounting/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/internal-transfer-accounting/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Lưu | `POST /api/erp/internal-transfer-accounting/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Gửi Kho nguồn | `POST /api/erp/internal-transfer-accounting/actions/send-warehouse` | Thực hiện nút “Gửi Kho nguồn” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Từ chối nhanh | `POST /api/erp/internal-transfer-accounting/actions/reject` | Thực hiện nút “Từ chối nhanh” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Chọn bước gửi về | `POST /api/erp/internal-transfer-accounting/actions/return-step` | Thực hiện nút “Chọn bước gửi về” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Lựa chọn khi Chọn bước gửi về | `POST /api/erp/internal-transfer-accounting/actions/return-step/options` | Lấy danh sách người nhận hoặc bước xử lý để người dùng chọn trước khi gửi. |

## Xác nhận xuất điều chuyển

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/internal-transfer-warehouse-out/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/internal-transfer-warehouse-out` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/internal-transfer-warehouse-out/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/internal-transfer-warehouse-out/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/internal-transfer-warehouse-out/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/internal-transfer-warehouse-out/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Lưu | `POST /api/erp/internal-transfer-warehouse-out/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xác nhận xuất / Gửi Kho đích | `POST /api/erp/internal-transfer-warehouse-out/actions/dispatch` | Thực hiện nút “Xác nhận xuất / Gửi Kho đích” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Từ chối nhanh | `POST /api/erp/internal-transfer-warehouse-out/actions/reject` | Thực hiện nút “Từ chối nhanh” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Chọn bước gửi về | `POST /api/erp/internal-transfer-warehouse-out/actions/return-step` | Thực hiện nút “Chọn bước gửi về” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |
| Lựa chọn khi Chọn bước gửi về | `POST /api/erp/internal-transfer-warehouse-out/actions/return-step/options` | Lấy danh sách người nhận hoặc bước xử lý để người dùng chọn trước khi gửi. |

## Xác nhận nhận điều chuyển

| Thao tác / vị trí | API | Làm gì |
|---|---|---|
| Chuẩn bị màn hình | `GET /api/erp/internal-transfer-warehouse-in/screen` | Lấy mô tả các cột, lựa chọn và nút của màn hình; không hiển thị thông tin nội bộ này cho người dùng. |
| Danh sách | `GET /api/erp/internal-transfer-warehouse-in` | Tải danh sách phiếu theo trang, tìm kiếm và bộ lọc của màn hình. |
| Mở phiếu | `GET /api/erp/internal-transfer-warehouse-in/detail` | Lấy đầy đủ thông tin phiếu và các bảng chi tiết theo trang. |
| Các nút trên phiếu | `GET /api/erp/internal-transfer-warehouse-in/actions` | Lấy trạng thái nút; các nút thêm/lưu/xóa luôn bật để thử giao diện, các nút gửi/duyệt/thu hồi vẫn theo quyền và trạng thái phiếu. |
| Danh sách chọn | `POST /api/erp/internal-transfer-warehouse-in/options` | Lấy danh sách cho các ô chọn trên phiếu, có tìm kiếm và phân trang. |
| Kiểm tra kết quả thao tác | `POST /api/erp/internal-transfer-warehouse-in/commands/lookup` | Kiểm tra lần lưu/gửi trước khi chưa nhận được kết quả; không dựng thành nút nghiệp vụ riêng. |
| Lưu | `POST /api/erp/internal-transfer-warehouse-in/save` | Ghi thay đổi của phiếu và các dòng chi tiết. |
| Xác nhận nhận hàng | `POST /api/erp/internal-transfer-warehouse-in/actions/receive` | Thực hiện nút “Xác nhận nhận hàng” trên phiếu đang mở, khi người dùng và trạng thái cho phép. |

## Các API đọc đã có ở nhóm chứng từ

Màn hình mới dùng API trong từng mục ERP phía trên. Nhóm dưới đây phục vụ phần đọc đang tích hợp từ trước.

| Dùng ở đâu / thao tác | API | Làm gì |
|---|---|---|
| Đặt mua hàng | `GET /api/documents/purchase-orders` | Đọc danh sách phiếu theo trang. |
| Đặt mua hàng | `GET /api/documents/purchase-orders/detail` | Đọc chi tiết phiếu theo trang. |
| Đặt mua hàng | `GET /api/v2/documents/purchase-orders` | Đọc danh sách phiếu theo trang. |
| Đặt mua hàng | `GET /api/v2/documents/purchase-orders/detail` | Đọc chi tiết phiếu theo trang. |
| Phiếu đề nghị nhập hàng | `GET /api/documents/inbound-requests` | Đọc danh sách phiếu theo trang. |
| Phiếu đề nghị nhập hàng | `GET /api/documents/inbound-requests/detail` | Đọc chi tiết phiếu theo trang. |
| Phiếu đề nghị nhập hàng | `GET /api/v2/documents/inbound-requests` | Đọc danh sách phiếu theo trang. |
| Phiếu đề nghị nhập hàng | `GET /api/v2/documents/inbound-requests/detail` | Đọc chi tiết phiếu theo trang. |
| Đề nghị mua hàng | `GET /api/purchase-requests` | Đọc danh sách phiếu theo trang. |
| Đề nghị mua hàng | `GET /api/purchase-requests/detail` | Đọc chi tiết phiếu theo trang. |
| Đề nghị mua hàng | `GET /api/v2/purchase-requests` | Đọc danh sách phiếu theo trang. |
| Đề nghị mua hàng | `GET /api/v2/purchase-requests/detail` | Đọc chi tiết phiếu theo trang. |
| Đề nghị mua hàng | `GET /api/purchase-requests/workspace` | Lấy thông tin lựa chọn trước khi mở phiếu. |
| Đề nghị mua hàng | `GET /api/purchase-requests/lookup` | Lấy danh sách chọn của phiếu. |

## Các API cũ đã được thay thế khi ghi phiếu

Không nối nút thêm/lưu/gửi vào các API dưới đây. Dùng API ERP của đúng màn hình ở trên để ghi dữ liệu.

| Dùng ở đâu | API cũ | API đang dùng |
|---|---|---|
| Đề nghị mua hàng | `POST /api/purchase-requests/save` | Dùng nhóm `/api/erp/purchase-requests` ở mục màn hình tương ứng. |
| Đề nghị mua hàng | `POST /api/purchase-requests/save/lookup` | Dùng nhóm `/api/erp/purchase-requests` ở mục màn hình tương ứng. |
| Đề nghị mua hàng | `POST /api/purchase-requests/submit` | Dùng nhóm `/api/erp/purchase-requests` ở mục màn hình tương ứng. |
| Đề nghị mua hàng | `POST /api/purchase-requests/submit/lookup` | Dùng nhóm `/api/erp/purchase-requests` ở mục màn hình tương ứng. |
| Phiếu đề nghị nhập hàng | `GET /api/inbound-requests/draft` | Dùng nhóm `/api/erp/inbound-requests` ở mục màn hình tương ứng. |
| Phiếu đề nghị nhập hàng | `POST /api/inbound-requests/draft/save` | Dùng nhóm `/api/erp/inbound-requests` ở mục màn hình tương ứng. |
| Phiếu đề nghị nhập hàng | `POST /api/inbound-requests/draft/send-to-warehouse` | Dùng nhóm `/api/erp/inbound-requests` ở mục màn hình tương ứng. |
| Phiếu đề nghị nhập hàng | `POST /api/inbound-requests/draft/reconcile` | Dùng nhóm `/api/erp/inbound-requests` ở mục màn hình tương ứng. |

## Tài liệu cho đội triển khai

Cấu trúc dữ liệu được mô tả trong [OpenAPI](medcom-openapi.json). Quy tắc chuyển đổi dữ liệu trả về nằm trong [ghi chú nội bộ BE](API_RESPONSE_CONTRACT_V3_20261011.md); không lấy các thuật ngữ của tài liệu đó làm nhãn giao diện.

Danh mục đối chiếu từ API đã build và catalog màn hình; tên màn hình/nút lấy từ đợt kiểm tra DB ngày 12/10/2026. Quy tắc nút trong đợt thử và nguồn caption được ghi tại [bàn giao nút và tên màn hình](BE_FE_BUTTONS_CAPTIONS_20261012.md). Việc FE đã cập nhật và nghiệm thu thao tác trên phiếu thật vẫn cần đội FE/owner xác nhận.
