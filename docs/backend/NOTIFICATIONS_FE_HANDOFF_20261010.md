# Thông báo ERP cho FE

Nguồn: `dbo.SY_NotifyMsgTbl`, `dbo.SY_User`, `dbo.SY_NotifyListStp` và `dbo.SY_NotifyMarkReadStp` của vòng `owner-live-meddata-20261010`. Đối chiếu SELECT metadata mới nhất giữ đủ 22 cột và khớp catalog hiện có; tên cột, kiểu, nullable và hash procedure ở [notification-api-source.json](../../inventories/source/20261010/notification-api-source.json). SQL bodies và dữ liệu người dùng được giữ riêng, không đưa vào repository. Hai archive Library lịch sử giữ danh tính ở `docs/SOURCE_BASELINE.md`; không suy ra tương đương nguồn mới.

BE lấy UserName chuẩn từ phiên ERP và kiểm tra lại user/group/credential trong SQL. Điều kiện người nhận là `SY_NotifyMsgTbl.ToUserID = SY_User.UserName` của user đó. FE không gửi `ToUserID`, username, actor, tên bảng hoặc SQL. Cấu hình `Legacy:Enabled` hiện có đăng ký bộ SQL thật; tính năng không cần một cờ bật riêng hoặc tạo bảng mới.

| API | Công dụng |
|---|---|
| `GET /api/notifications?page=1&pageSize=30&unreadOnly=false` | Danh sách riêng, đủ 22 fields của mỗi dòng |
| `GET /api/notifications/{id}` | Nội dung đầy đủ của một thông báo thuộc user |
| `GET /api/notifications/{id}/target` | Kiểm tra quyền chứng từ và trả thông tin mở form |
| `POST /api/notifications/{id}/read` | Ghi `IsView/ViewDate` bằng native procedure |

Tất cả cần cookie phiên ERP. `{id}` là ID số nguyên dương của **thông báo**, không phải DocumentID. Query list chỉ nhận page 1–1000, pageSize 1–100 (mặc định 30) và unreadOnly `true/false`. Query lạ/trùng bị từ chối. ID giảm dần là thứ tự cố định. Mỗi request có snapshot riêng; thông báo mới hoặc đánh dấu đã xem có thể làm dịch chuyển offset ở request sau.

List trả `{ readScope, data: { page, pageSize, totalRows, unreadCount, rows } }`. `totalRows` theo filter unreadOnly; `unreadCount` đếm tất cả thông báo Web chưa xem của user. Cùng native Web list, chỉ lấy `ShowWeb=1, IsActive=1`. Procedure Web hiện không lọc ExpireAt; API giữ hành vi này và trả nguyên field ExpireAt. Không lấy popup ERP của `SY_NotifyCheckStp` làm danh sách Web vì procedure đó dùng channel/cursor/giới hạn nội dung khác.

Mỗi row luôn có đủ các keys, kể cả giá trị null:

```json
{
  "id": 1,
  "fromUserId": "synthetic-sender",
  "toUserId": "synthetic-user",
  "title": "Thông báo tổng hợp",
  "message": "Mở chứng từ tổng hợp để xem chi tiết.",
  "msgTime": "2026-10-10T12:00:00",
  "notifyType": "Info",
  "colorHex": null,
  "sourceSystem": "ERP",
  "erpFormName": "AP_PurposeRequestListFrm",
  "webFormName": null,
  "webRoute": null,
  "documentId": "SYNTHETIC-DOC",
  "orderNo": null,
  "statusId": null,
  "isView": false,
  "viewDate": null,
  "isActive": true,
  "showErp": true,
  "showWeb": true,
  "expireAt": null,
  "eventKey": null
}
```

Timestamp giữ lịch SQL `yyyy-MM-ddTHH:mm:ss`; timezone nguồn là UNKNOWN, không tự thêm `Z`. Render title/message dưới dạng text. Nếu colorHex null, FE có thể dùng palette Info/Warning/Error/Success đã thống nhất; API giữ nguyên giá trị DB để không mất field. `WebRoute` là metadata nguyên gốc, không phải URL được BE cấp quyền để điều hướng.

## Khi người dùng bấm thông báo

Gọi `/api/notifications/{id}/target`. Response dùng envelope `{readScope,data}`. Ví dụ data tổng hợp:

```json
{
  "canOpen": true,
  "reason": null,
  "moduleId": "purchase-requests",
  "formId": "AP_PurposeRequestListFrm",
  "documentId": "SYNTHETIC-DOC",
  "branchId": "SYNTHETIC-BRANCH",
  "detailApi": "/api/erp/purchase-requests/detail?branchId=SYNTHETIC-BRANCH&documentId=SYNTHETIC-DOC"
}
```

FE dùng moduleId/formId chọn renderer Web của mình, dùng branchId làm context và documentId làm khóa lọc; tải detail từ detailApi qua BFF. Khóa đề nghị mua hàng thực tế là `AP_PurchaseRequestTbl.PurchaseRequestID`; API detail đã ánh xạ tham số documentId vào đúng khóa, không cần FE tự viết WHERE. Không dùng OrderNo thay DocumentID và không ghép tên bảng/SQL từ thông báo.

| ERP form đã ánh xạ | moduleId Web |
|---|---|
| AP_PurposeRequestListFrm | purchase-requests |
| AR_OrderByContractFrm | sales-orders |
| IV_InternalTransferRequestFrm | internal-transfer-requests |
| IV_Output_QRCodeFrm | warehouse-qr |
| AR_Invoice_QRCodeFrm | sales-qr |
| FA_Move2026Frm | machine-movements |
| FA_Repair2026Frm | machine-repairs |
| AP_OrderFrm | purchase-orders |
| IV_InboundRequestFrm | inbound-requests |

Nguồn bảy form: `inventories/erp/20261010/six-screen-catalog.json`. Hai form đọc trước đó: `SqlDocumentReader.cs`/`DocumentEndpoints.cs`. Resolver chấp nhận tên form này hoặc đúng moduleId trong ERPFormName/WebFormName. Nếu hai field ánh xạ vào hai module khác nhau, từ chối mở; không tự thực thi WebRoute hoặc dynamic form chưa được triển khai.

Đích chỉ có `canOpen=true` sau khi native detail reader xác nhận chứng từ và scope, gồm quyền menu, user/group, chi nhánh, owner hoặc asset scope tương ứng. API kiểm tra lại thông báo riêng sau khi resolve. Thông báo thuộc user không tự cấp quyền xem chứng từ. CanOpen false trả reason và các field điều hướng null: `notification_document_missing`, `notification_form_unsupported`, `notification_form_ambiguous`, `notification_document_denied`, `notification_document_not_found`, `notification_document_ambiguous` hoặc `notification_document_unavailable`. FE vẫn hiển thị nội dung và giải thích lý do chưa mở được. Form ngoài chín ánh xạ còn UNKNOWN về renderer/typed API; không gọi generic SQL.

## Đã xem, chưa xem và BFF

Sau khi mở, FE có thể POST body `{ "isView": true }`; đánh dấu chưa xem dùng false. IsView bắt buộc là boolean, không nhận recipient hoặc owner fields. Gửi CSRF token/cookie, Origin cố định của BE và `X-Medcom-Read-Scope` từ list/detail/workspace. Procedure native chỉ cập nhật thông báo của user hiện tại với ShowWeb/IsActive, giữ ViewDate lần đầu khi lặp true, xóa ViewDate khi false. Transaction rollback khi phiên bị thu hồi trước commit. Response 200 là row SQL sau cập nhật, không phải giá trị FE tự suy ra. Sau cập nhật reload list để cập nhật unreadCount.

BFF do nhóm FE sở hữu cần thêm bốn route trên vào allowlist, giữ cookies/CSRF/Origin/readScope, và phân tích ID theo int32 dương. Route hiện tại của proxy dùng prefix `/api/erp/` cho đường dẫn BE; ví dụ list là `/api/erp/api/notifications`. Thay đổi FE/BFF chưa được thực hiện trong increment BE này.

401: phiên chưa có/hết hạn. 403: native identity/Origin/CSRF bị từ chối. 404: thông báo mất, ẩn hoặc thuộc user khác, cùng một phản hồi. 409 `erp_scope_changed`: refresh phiên/workspace trước khi ghi. 400 `notification_target_changed`: nội dung điều hướng đã đổi, đọc lại trước khi mở. 503 `notification_source_changed`: procedure ghi không còn khớp nguồn đã rà soát. Với timeout hoặc `notification_outcome_unknown`, GET detail để đối chiếu IsView/ViewDate; không báo đã ghi thành công từ lỗi kết nối.

OpenAPI tải ở `/api/contracts/openapi.json` và `docs/backend/medcom-openapi.json`. Kiểm thử: `NotificationTests.cs`, private I76 SQL/ordinary HTTPS fixture receipt; giới hạn và review ở `docs/execution/I76_NOTIFICATIONS_20261010.md`. Chứng từ/thông báo thật của owner chưa được dùng để nghiệm thu; UI renderer ngoài phạm vi BE và toàn bộ goal #45 vẫn chưa được tuyên bố hoàn tất.
