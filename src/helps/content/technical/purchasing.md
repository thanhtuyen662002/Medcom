## Ranh giới nghiệp vụ

Master/detail đề nghị: `AP_PurchaseRequestTbl` / `AP_PurchaseRequestDetailTbl`, khóa PurchaseRequestID. PO: `AP_OrderTbl` / `AP_OrderDetailTbl`, khóa DocumentID. Khi tạo PO, DocumentID lấy từ PurchaseRequestID; các dòng có UserAutoID mới.

## Lưu đề nghị khi chưa có đơn giá

`AP_PurchaseRequestDetailTbl.UnitPrice` cho phép NULL. Giá chưa biết được giữ là NULL, không tự thay bằng 0. `AP_PurchaseRequest_OptionalPriceValidationFnc(@Data xml)` đọc các dòng T1 trong XML lưu, cho phép đơn giá trống và trả lỗi nếu đơn giá âm. Cấu hình EBS/EBC của `AP_PurposeRequestListFrm` và `AP_ApprovePurchaseRequestListFrm` gọi hàm kiểm tra này.

`AP_PurchaseRequestTbl.RateExchange` cho phép NULL để lưu đề nghị không nhập tỷ giá. Ô tỷ giá bị ẩn trên form đề nghị; bộ chọn loại tiền không gán tỷ giá vào đề nghị. Giữ CurrencyID và các kiểm tra dữ liệu bắt buộc khác. Đây là thay đổi ở đề nghị, không bỏ trường tỷ giá trên PO/chứng từ tài chính.

## Duyệt và tạo PO

`AP_PurchaseRequest_ApproveOrRejectStp`: chỉ nguồn StatusID=2, duyệt → 3 và khóa đề nghị; không duyệt → 4, phải có Notes. Kiểm tra tài khoản hoạt động và quyền hiệu lực từ `SY_GetUserPermissionFnc('AP_ApprovePurchaseRequestListFrm', @User)`. Không thay phân quyền hệ thống bằng danh sách vai trò viết cứng.

`AP_PurchaseRequest_CreatePOStp(@PurchaseRequestID, @User)`: chỉ nguồn 3, kiểm tra chưa tồn tại PO, ngày/loại tiền hợp lệ và có chi tiết. Số lượng phải dương, đơn giá không âm nhưng được NULL. Tạo master/detail PO và chuyển đề nghị → 5 trong một giao dịch. Khóa ứng dụng chung `PURCHASE_REQUEST_PO:` + mã đề nghị ngăn duyệt/tạo PO/xóa đồng thời hoặc tạo trùng.

STP giữ nguyên UnitPrice của từng dòng. `SourceAmount` = Quantity × UnitPrice, lưu decimal(18,2); nếu UnitPrice NULL thì SourceAmount NULL. `Amount` chỉ tính khi có tỷ giá dương và SourceAmount có giá trị. `BaseTotal` chỉ cộng khi mọi dòng đã có UnitPrice; nếu còn giá trống thì BaseTotal NULL, tránh coi tổng của riêng các dòng có giá là tổng đầy đủ.

## Tỷ giá của PO

STP không sử dụng RateExchange của đề nghị làm tỷ giá PO. `CF_Currency_GetRateOnDateFnc(@Currency, @Date)` kiểm tra loại tiền, trả 1 cho VND; ngoại tệ lấy dòng mới nhất trong `CF_CurrencyRateTbl` có RateDate trước cuối ngày chứng từ. Sắp theo RateDate, DateUpdate, UserAutoID giảm dần; không dùng dòng tương lai hoặc giá cố định từ `CF_CurrencyTbl`. Không có tỷ giá dương phù hợp thì hàm trả NULL.

Khi hàm trả NULL, STP vẫn tạo PO nháp với RateExchange = 0 làm dấu chưa có tỷ giá và Amount NULL. Giá trị 0 này không phải tỷ giá hợp lệ để xử lý tài chính. Người phụ trách phải bổ sung tỷ giá dương trên PO/chứng từ liên quan. `CF_Document_ExchangeRateValidationFnc(@Data xml)` kiểm tra tỷ giá trong XML lưu của các form tài chính đã được cấu hình: có trường RateExchange thì phải dương, VND phải bằng 1; form không serialize trường này thì hàm bỏ qua. Không dùng hàm kiểm tra tỷ giá tài chính để bắt nhập tỷ giá lại trên đề nghị.

## Xóa phiếu nháp: master và detail

Khóa ngoại `FK_AP_PurchaseRequestDetailTbl_AP_PurchaseRequestTbl` nối PurchaseRequestID của chi tiết với đầu phiếu, vẫn bật, được tin cậy và giữ `NO_ACTION`. Lỗi “Thiếu dữ liệu liên kết. (AP_PurchaseRequestDetailTbl).” trước đây phát sinh do ERP DELETE master khi vẫn còn detail, không phải thiếu khóa liên kết.

`AP_PurchaseRequest_DeleteDraftTrg` là trigger INSTEAD OF DELETE trên `AP_PurchaseRequestTbl`, chạy trong giao dịch của lệnh DELETE từ ERP:

- Lấy khóa ứng dụng độc quyền `PURCHASE_REQUEST_PO:` theo từng mã đề nghị, theo thứ tự mã tăng dần, dùng cùng tài nguyên khóa với duyệt/tạo PO.
- Chặn nếu `AP_OrderTbl.DocumentID` đã tham chiếu mã đề nghị; chặn nếu StatusID khác 1 hoặc chưa xác định, hay isLock = 1. Chỉ cho xóa Nháp chưa khóa và chưa có PO.
- Xóa `AP_PurchaseRequestDetailTbl` theo đúng PurchaseRequestID, rồi xóa master cùng mã. Không xóa PO và không tắt khóa ngoại.
- Bật NOCOUNT OFF tại lệnh xóa master để ERP nhận số dòng đầu phiếu thực sự bị xóa. Khi lỗi ở bất kỳ bước nào, hoàn tác cả master/detail; lệnh xóa nhiều phiếu cũng không được ghi dở dang.

| Tình huống | Kết quả |
| --- | --- |
| Nháp (1), chưa khóa, chưa có PO | Xóa đầu phiếu và chi tiết trong cùng giao dịch |
| Chờ duyệt (2), đã duyệt (3), không duyệt (4), đã gửi đặt mua hàng (5), trạng thái NULL hoặc phiếu đã khóa | Chặn; xử lý theo luồng hiện hữu |
| Có PO cùng mã, dù đầu phiếu còn Nháp | Chặn xóa, giữ nguyên liên kết |
| Không có mã phiếu khớp lệnh DELETE | Không xóa dữ liệu khác |

Lỗi 65990 báo không lấy được khóa xử lý; 65991 báo đã có PO; 65992 báo không đáp ứng điều kiện Nháp và chưa khóa. Quyền xóa trên giao diện vẫn theo cấu hình ERP hiện hữu; trigger bảo vệ tính toàn vẹn dữ liệu, không cấp thêm quyền. Luồng duyệt/từ chối và phân quyền không đổi.

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
| `AP_PurchaseRequest_OptionalPriceValidationFnc` | Function | Cho phép đơn giá trống, chặn giá âm khi lưu đề nghị |
| `CF_Currency_GetRateOnDateFnc` | Function | Lấy tỷ giá hợp lệ theo loại tiền và ngày chứng từ |
| `CF_Document_ExchangeRateValidationFnc` | Function | Kiểm tra tỷ giá trên chứng từ tài chính đã cấu hình |
| `AP_PurchaseRequest_DeleteDraftTrg` | Trigger | Xóa master/detail phiếu nháp trong cùng giao dịch, chặn phiếu đã xử lý/có PO |
| `SY_GetUserPermissionFnc` | Function | Quyền hiệu lực của người dùng trên form |
| `AP_PurchaseOrderWorkflowStatusView` | View | Nhãn trạng thái PO và tiến độ nhận |
