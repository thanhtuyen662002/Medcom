## Đường đi của chi phí

`IV_InboundRequestCTCPTbl.DocumentID` nối đề nghị nhập. `AP_ServiceTbl.RequestDocumentID` giữ đề nghị nguồn. Dòng dịch vụ tham chiếu chi phí đã lấy, phục vụ ngăn sử dụng lặp. `AP_PurchaseTbl.RequestDocumentID` nối chứng từ nhập khẩu với cùng đề nghị.

Candidate chi phí yêu cầu đề nghị StatusID=13, dòng chưa hủy và chưa bị chứng từ dịch vụ còn hiệu lực sử dụng. Chứng từ dịch vụ phải chốt trước khi đủ điều kiện lấy sang nhập khẩu.

## Nhóm và tiêu thức phân bổ

CostType: PRE_CUSTOMS, TO_WAREHOUSE, NONE. AllocateKind: VALUE, QUANTITY. View chi phí trước cửa khẩu và chi phí về kho đóng vai trò riêng; view tổng hợp phục vụ đối chiếu. Không đồng nhất trị giá hải quan với toàn bộ giá trị nhập kho.

## Kiểm tra trước chốt

`AP_Service_ValidateInboundCostStp` và hàm validation dịch vụ kiểm tra nguồn, hóa đơn, đối tượng và tiền tệ. Luồng nhập khẩu kiểm tra liên kết, phân bổ và chênh lệch trước post. Không bỏ validation để khắc phục cảnh báo dữ liệu chưa hoàn chỉnh.

Các công thức thuế và cấu hình mã thuế phải được kế toán xác nhận theo hồ sơ thực tế; nội dung này mô tả xử lý phần mềm, không thiết lập chính sách thuế.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `AP_PurchaseNKFrm` | Mua hàng nhập khẩu |

## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |
| `AP_ServiceInboundCostCandidateView` | View | Các dòng chi phí đề nghị đủ điều kiện lấy |
| `AP_Service_ImportInboundCostStp` | STP | Lấy chi phí vào dịch vụ |
| `AP_Service_ValidateInboundCostStp` | STP | Kiểm tra liên kết và dòng chi phí |
| `AP_ServiceInboundValidationFnc` | Function | Tổng hợp kiểm tra dịch vụ |
| `AP_ImportPurchaseValidationFnc` | Function | Kiểm tra nhập khẩu trước hoàn tất |
| `AP_ImportPurchase_PrePostStp` | STP | Kiểm tra trước chốt nhập khẩu |
| `AP_PurchasePreCustomsCostView` | View | Chi phí trước cửa khẩu |
| `AP_PurchaseWarehouseCostView` | View | Chi phí đưa hàng về kho |
| `AP_PurchaseCostSummaryView` | View | Tổng hợp chi phí để đối chiếu |
| `AP_PurchaseImportTaxView` | View | Trị giá và thuế nhập khẩu |
| `AP_PurchaseInventoryValueView` | View | Giá trị nhập kho |
