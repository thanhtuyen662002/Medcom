## Ranh giới nghiệp vụ

Master/detail đề nghị: `AP_PurchaseRequestTbl` / `AP_PurchaseRequestDetailTbl`, khóa PurchaseRequestID. PO: `AP_OrderTbl` / `AP_OrderDetailTbl`, khóa DocumentID. Khi tạo PO, DocumentID lấy từ PurchaseRequestID; các dòng có UserAutoID mới.

## Duyệt và tạo PO

`AP_PurchaseRequest_ApproveOrRejectStp`: chỉ nguồn StatusID=2, duyệt → 3 và khóa đề nghị; không duyệt → 4, phải có Notes. Kiểm tra tài khoản hoạt động và quyền hiệu lực từ `SY_GetUserPermissionFnc('AP_ApprovePurchaseRequestListFrm', @User)`. Không thay phân quyền hệ thống bằng danh sách vai trò viết cứng.

`AP_PurchaseRequest_CreatePOStp`: chỉ nguồn 3, kiểm tra chưa tồn tại PO, dữ liệu tiền tệ/chi tiết hợp lệ; tạo master/detail và chuyển đề nghị → 5 trong một giao dịch. Khóa ứng dụng chung theo mã đề nghị ngăn duyệt/tạo PO đồng thời hoặc tạo trùng.

## Tiến độ nhận hàng

`AP_PurchaseOrderWorkflowStatusView` trình bày trạng thái PO và tiến độ nhận hàng. Phân bổ sang các đợt không phải bút toán tồn kho. Đọc luồng nhập đợt trước khi sửa công thức còn lại.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `AP_PurposeRequestListFrm` | Đề nghị mua hàng |
| `AP_ApprovePurchaseRequestListFrm` | Duyệt đề nghị mua hàng |
| `AP_OrderFrm` | Đặt mua hàng |

## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |
| `AP_PurchaseRequest_ApproveOrRejectStp` | STP | Duyệt/từ chối theo quyền ERP hiện hữu |
| `AP_PurchaseRequest_CreatePOStp` | STP | Tạo PO duy nhất từ đề nghị đã duyệt |
| `SY_GetUserPermissionFnc` | Function | Quyền hiệu lực của người dùng trên form |
| `AP_PurchaseOrderWorkflowStatusView` | View | Nhãn trạng thái PO và tiến độ nhận |
