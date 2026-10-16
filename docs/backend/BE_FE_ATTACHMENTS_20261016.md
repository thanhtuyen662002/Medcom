# Ảnh đính kèm — bàn giao cho FE

BE bổ sung nhận file ảnh và lưu vào các bảng đính kèm hiện có của ERP. Không thay đổi request Thêm/Lưu phiếu đang dùng. Không cần cập nhật DB hoặc refresh fingerprint; chủ hệ thống redeploy BE từ main và khởi động lại ứng dụng.

## Dùng trên màn hình nào

| Màn hình | Vị trí / thao tác |
|---|---|
| Quản lý đơn hàng (`sales-orders`) | Tài liệu đính kèm: thêm/thay ảnh, xem, tải và xóa ảnh khi được phép sửa phiếu. |
| Đơn hàng — PM (`sales-order-pm`) | Cùng ảnh của đơn hàng; cho sửa theo người được giao, quyền và trạng thái PM. |
| Đơn hàng — SA (`sales-order-sa`) | Cùng ảnh của đơn hàng. Cấu hình ERP hiện ẩn thao tác sửa ở màn hình này; FE dùng quyền trả về để hiển thị đúng. |
| Đề nghị nhập kho (`inbound-requests`) | Ảnh chụp hư hỏng (vị trí 2), ảnh trước khi dỡ hàng (4), ảnh sau khi dỡ hàng (6). Caption ảnh trả đúng theo cấu hình DB hiện tại. |
| Đặt mua hàng / PO (`purchase-orders`) | Ảnh của PO, cho phép nhiều ảnh. Dùng bảng đính kèm đã có liên kết đến PO; caption vị trí trả rỗng để FE đặt tên phù hợp. Chưa xác minh có nút tương ứng trong ERP desktop. |

BE đã rà đủ 19 màn hình hiện có. Với các màn hình còn lại, API danh sách ảnh trả `supported=false`; FE ẩn phần đính kèm. Chưa có bằng chứng liên kết ảnh theo chứng từ tại các form Đề nghị mua hàng, điều chuyển, QR, di chuyển máy hoặc sửa chữa máy; không tự dùng ảnh hồ sơ tài sản thay cho ảnh của phiếu. Các bảng Attach của hợp đồng, khách hàng, nhân sự, thiết bị và tài sản thuộc những form chưa có trong 19 API màn hình này. Chi tiết đối soát nằm trong [metadata nguồn](../../inventories/backend/20261016/attachment-bindings.json).

## API và cách tích hợp

Tiền tố: `/api/erp/{module}/attachments`.

| Thao tác | API | Dùng ở đâu |
|---|---|---|
| Danh sách ảnh | `GET /api/erp/{module}/attachments` | Khi mở phiếu hoặc đổi trang ảnh. Gửi `branchId`, `documentId`, `page`, `pageSize`. Trả danh sách theo trang, vị trí ảnh và quyền thêm/xóa. Có ở cả 19 module để FE biết màn hình nào hỗ trợ. |
| Xem/tải ảnh | `GET /api/erp/{module}/attachments/content` | Gửi `branchId`, `documentId`, `attachmentId`; thêm `preview=true` để lấy ảnh xem trước. Kết quả là file nhị phân. Có ở năm module hỗ trợ; dùng `contentUrl`/`previewUrl` qua proxy FE. |
| Thêm/thay ảnh | `POST /api/erp/{module}/attachments/upload` | Gửi `multipart/form-data`, trường `file` là ảnh gốc; `preview` là ảnh nhỏ tùy chọn. Khi thay ảnh, gửi mã và phiên bản ảnh đang mở. |
| Xóa ảnh | `POST /api/erp/{module}/attachments/delete` | Xóa ảnh đang chọn bằng mã ảnh và phiên bản đã đọc; không xóa phiếu. |

Hai API POST có ở bốn module được sửa ảnh: `purchase-orders`, `sales-orders`, `sales-order-pm`, `inbound-requests`. Màn hình `sales-order-sa` chỉ có danh sách và xem/tải ảnh theo cấu hình hiện hành; không đăng ký API ghi cho một nút luôn bị ẩn. Tổng BE hiện có 276 API, gồm 32 API ảnh mới.

Danh sách có `canUpload`, `canDelete`, `slots`, `documentStateToken`; từng ảnh có `attachmentId`, `attachmentName`, `slotId`/`slotName`, `fileTypeId`/`fileTypeName`, dung lượng, phiên bản ảnh và địa chỉ xem ảnh. Không có lớp `fields` lặp dữ liệu. FE dùng quyền ảnh này, không suy ra từ quyền Xóa phiếu; xóa ảnh là chỉnh sửa phần đính kèm của phiếu. Cả BE và API ảnh kiểm tra lại quyền/chi nhánh/người xử lý/trạng thái khi ghi.

Phiếu mới: người dùng có thể chọn ảnh trước, FE giữ file trong trình duyệt. Sau khi API tạo phiếu trả thành công, lấy mã phiếu thật rồi tải ảnh lên. Nếu tải ảnh chưa thành công, giữ file để thử lại; không tự báo cả phiếu và ảnh đã được lưu. Với phiếu đã có, tải danh sách ảnh trước thao tác và đọc lại sau mỗi lần thay đổi.

Upload nhận `idempotencyKey`, `branchId`, `documentId`, `expectedStateToken` (lấy nguyên `documentStateToken`), `slotId` cho các vị trí ảnh ERP, cùng `file`; PO để trống `slotId`. Khi thay ảnh, bổ sung `attachmentId`, `expectedAttachmentToken` (lấy nguyên `stateToken` của ảnh). Tên ảnh lấy từ tên file, không gửi đường dẫn trên máy người dùng. Xóa nhận JSON gồm `idempotencyKey`, `branchId`, `documentId`, `expectedStateToken`, `attachmentId`, `expectedAttachmentToken`. Đầy đủ schema và ô chọn file đã có trên [Swagger/OpenAPI](medcom-openapi.json).

Ảnh tải lên hỗ trợ JPEG/PNG, tối đa 10 MiB/ảnh; ảnh nhỏ tùy chọn tối đa 1 MiB. BE kiểm tra tên, phần mở rộng, cấu trúc header/kích thước raster và giới hạn byte; không giải nén pixel hoặc tự resize ảnh. Nếu không gửi ảnh nhỏ, BE lưu bản gốc vào cả hai cột để ERP có dữ liệu xem trước. Dữ liệu ảnh cũ vẫn có thể đọc/tải trong giới hạn; file cũ không nhận diện là JPEG/PNG được tải xuống dạng tệp. API nội dung không trả Base64 trong JSON.

Nếu mất phản hồi khi tải/xóa ảnh, gửi lại đúng nội dung và cùng `idempotencyKey`; BE trả kết quả lần trước và không tạo bản sao. Không đổi key để tự gửi lại một thao tác chưa biết kết quả. Nếu phiếu hoặc ảnh đã đổi, đọc lại trước khi lưu tiếp.

FE BFF cần cho phép đúng các route trên, truyền nguyên multipart/binary cùng cookie phiên, CSRF token và scope như các API ghi hiện tại. Khi dùng `FormData`, để trình duyệt tự đặt `Content-Type` và boundary; không `JSON.stringify` file. Bản bàn giao này không sửa FE hoặc proxy. Nếu proxy/IIS đang giới hạn body dưới khoảng 12 MiB, đội vận hành điều chỉnh riêng đường tải ảnh. BE chỉ tăng giới hạn cho endpoint ảnh; JSON vẫn giữ giới hạn cũ. Không đưa tên bảng, mã phiên bản, thuật ngữ HTTP hoặc tên kỹ thuật nội bộ lên nhãn giao diện nghiệp vụ.

Đối chiếu FE tại base `f730ed5` cho thấy đội FE cần cập nhật các điểm sau trước khi thử qua giao diện:

- `apps/medcom-sites/lib/erp/proxy-policy.ts`: danh sách route hiện chưa có các API ảnh; thêm GET danh sách cho 19 module, GET nội dung cho năm module và POST tải/xóa cho bốn module được sửa ảnh. Đặt giới hạn multipart riêng; hàm `requestBodyLimit` hiện trả 1 MiB cho lệnh ERP và 16 KiB cho các POST còn lại.
- `apps/medcom-sites/lib/erp/proxy.ts`: nhánh POST hiện luôn giải mã UTF-8 và yêu cầu JSON. Tách nhánh upload để truyền nguyên byte và `Content-Type` có boundary, không qua `TextDecoder`/`JSON.parse`. Giữ các kiểm tra phiên/CSRF/Origin/scope. GET đã trả stream; bổ sung chuyển tiếp `Content-Disposition` để tải file cũ đúng tên.
- `apps/medcom-sites/lib/erp/erp-screen-api.ts`: dùng cách dựng địa chỉ BFF hiện có. Ví dụ BE `/api/erp/sales-orders/attachments` tương ứng trình duyệt `/api/erp/api/erp/sales-orders/attachments`; đổi `contentUrl`/`previewUrl` theo cùng quy tắc trước khi gán cho ảnh hoặc nút tải.

Đây là danh sách bàn giao cho đội FE, không phải thay đổi FE trong PR BE. Kiểm tra trực tiếp trên Swagger BE sẽ dùng endpoint và file picker mới; proxy FE cần hoàn tất các điểm trên để giao diện dùng được.

## Ghi chú cho BE và vận hành

Ba bảng được dùng: `AR_OrderAttachTbl` (ba màn hình đơn hàng), `IV_InboundRequestAttachTbl` (nhập kho), `AP_POAttachTbl` (PO). Khóa cha là `DocumentID`; mã file là `UserAutoID`; dữ liệu gốc/nhỏ là `Content`/`Content2`, ảnh có `FileType=1`. Không lưu file lâu dài trên ổ đĩa hoặc tự tải URL bên ngoài. Không cần bảng/schema mới. Cột Base64/FileSize tùy chọn được giữ nguyên; dung lượng trả về lấy từ byte thực tế. Mỗi vị trí ảnh của ERP chỉ nhận một ảnh mới; thay ảnh phải chỉ định đúng ảnh hiện có. PO không có vị trí cố định nên thêm được nhiều ảnh.

Ảnh và kết quả thao tác được commit trong cùng transaction. Gửi trùng dùng journal hiện có với phạm vi riêng cho ảnh; journal lưu metadata/digest của nội dung, không nhân đôi file trong intent. Khóa transaction dùng cùng thứ tự với CUD phiếu; khi xóa phiếu, BE dọn ảnh liên kết trong cùng transaction, bao gồm FK PO không tự cascade. Các mã trạng thái của dữ liệu/ảnh không phải schema fingerprint đã bỏ. Log lỗi vận hành có stage, loại lỗi và correlation, không ghi file, SQL, tên file, mã phiếu hay mật khẩu.

Nguồn và giới hạn kiểm chứng: [I95](../execution/checkpoints/I95_ERP_DB_ATTACHMENTS_20261016.md). Audit DB hiện tại chỉ đọc metadata/cấu hình. SQL lưu ảnh được kiểm thử bằng bảng tạm và ảnh giả; không chèn vào chứng từ thật. Việc FE đã cập nhật và nghiệm thu trên VPS/tài khoản thật vẫn UNKNOWN cho đến khi owner redeploy và kiểm tra.
