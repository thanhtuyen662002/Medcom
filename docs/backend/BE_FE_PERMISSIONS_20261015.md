# Quyền màn hình và thao tác cho FE

FE lấy quyền của người đang đăng nhập bằng `GET /api/erp/permissions?branchId={chi nhánh đã chọn}`. API trả đủ 19 màn hình, bao gồm màn hình không được xem. Dùng kết quả này để dựng menu và quyền Thêm/Sửa/Xóa. Không truyền tên người dùng hay role; BE xác định từ phiên ERP và phân quyền hiện tại.

Trên VPS, FE nối đường dẫn BE vào proxy `https://medcom.bms79.com/api/erp`, ví dụ `https://medcom.bms79.com/api/erp/api/erp/permissions?branchId=MB`. Khi gọi trực tiếp BE, dùng `https://api-medcom.bms79.com/api/erp/permissions?branchId=MB`.

| Kết quả API trong `data.screens` | FE dùng ở đâu |
|---|---|
| `module`, `caption` | Xác định màn hình và tên tiếng Việt. Caption rỗng thì dùng tên ERP cố định đã duyệt. |
| `canView` | Chỉ hiện menu và cho mở màn hình khi là `true`. |
| `crud.canRead` | Cho xem dữ liệu của màn hình. |
| `crud.canCreate` | Cho lập phiếu mới khi màn hình hỗ trợ Thêm. |
| `crud.canUpdate` | Cho mở phần sửa của màn hình có Lưu, lưu bảng con hoặc quét QR. Trên phiếu cụ thể vẫn theo trạng thái nút. |
| `crud.canDelete` | Cho xóa cả phiếu khi màn hình có nút Xóa. Xóa một mã QR là thao tác riêng trong `actions`. |
| `actions[].id`, `caption`, `visible`, `requiresSavedDocument`, `route` | Nhận diện và ẩn/hiện từng nút theo quyền tài khoản. Nút không được phép có `visible=false`, `route=null`. Không dùng kết quả này để quyết định nút đã đủ điều kiện bấm trên phiếu. |

Khi mở hoặc chuyển phiếu, gọi `GET /api/erp/{module}/actions?branchId=...&documentId=...`, hoặc dùng `actions` trong kết quả `detail`. Khi đang tạo mới, bỏ `documentId` ở API actions. Ẩn nút có `visible=false`; nếu `visible=true` thì dùng `enabled` để bật/khóa nút. Người có quyền vẫn có thể bị khóa thao tác khi phiếu đã khóa, sai trạng thái, chưa lưu, chưa được giao xử lý hoặc chưa đủ điều kiện thực hiện. Nút Duyệt/Không duyệt chỉ bật trên đề nghị đang chờ duyệt và đủ điều kiện. Không tiếp tục ép bật như đợt test trước.

Màn hình chỉ duyệt/xử lý sẽ không được báo có quyền lập/xóa phiếu nếu ERP không có thao tác đó. Không thêm nút In hoặc Import/copy trong lần tích hợp này. `/screen` cung cấp mô tả màn hình; không dùng `nativeVisible` trong mô tả tĩnh làm quyền của người dùng. `/api/workspace` đang phục vụ nhóm điều hướng cũ; dựng đủ 19 màn hình từ API permissions.

Tải lại quyền sau đăng nhập, đổi chi nhánh và khi quyền/phiên thay đổi; tải lại phiếu và nút sau thao tác. Nếu trả 401 thì đăng nhập lại; 403 thì không mở thao tác bị từ chối. Nếu không tải được quyền, giữ màn hình chờ hoặc cho thử lại, không mặc định có quyền và không dùng quyền của tài khoản trước. BE không lưu cache quyền của API này và luôn kiểm tra lại quyền, chi nhánh, dữ liệu và trạng thái trước khi ghi.

Nhãn giao diện dùng tiếng Việt nghiệp vụ. Không đưa tên trường, route, mã lỗi, lý do nội bộ, `readScope` hoặc token lên giao diện người dùng. Các cờ trên chỉ dành cho đội FE tích hợp; thông báo bị từ chối cần diễn đạt tiếng Việt phù hợp và giữ dữ liệu đang nhập.

Đối chiếu BE: `ErpScreenEndpoints.cs`, `ErpScreens.cs`, `ErpActionRules.cs`, `ErpSqlAuthority.cs`, `SqlErpPermissionsReader.cs`, `SqlLegacyPolicy.cs`. Nguồn quyền: `SY_UserGroupPermisstion`, `SY_UserPermisstion` và ủy quyền `SY_User.UserAuthority`; quyền chi nhánh qua `SqlLegacyBranchScope`. Kiểm thử bằng dữ liệu tổng hợp tại `ErpPermissionsTests.cs` và `ErpCudPresentationTests.cs`. Triển khai VPS và FE nhận thay đổi: UNKNOWN cho đến khi cập nhật và nghiệm thu.
