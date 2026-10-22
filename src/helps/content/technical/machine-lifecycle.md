## Nguồn sự thật theo từng trục

`FA_AssetTbl` là danh mục máy. Biến động dùng `FA_MoveTbl` / `FA_MoveDetailTbl`, nối DocumentID và AssetID. Sửa chữa là chứng từ riêng, không thay toàn bộ lịch sử biến động.

`FA_AssetCurrentLifecycleView` chọn biến động có `H.isLock=1` và ngày nghiệp vụ không sau ngày hiện tại; thứ tự ngày và khóa bổ sung xác định bản ghi hiện hành. Không lấy bản nháp làm trạng thái hiện tại.

## Hợp đồng và trạng thái hiển thị

`FA_AssetCurrentContractView` chọn hợp đồng liên quan biến động đã khóa, theo vị trí/đối tượng hiện tại và hiệu lực. Tài sản trong kho được xử lý khác tài sản đang đặt ngoài kho. Không chọn tùy ý hợp đồng có ngày kết thúc lớn nhất của toàn bộ tài sản.

`FA_AssetStatusDisplayView` tổng hợp:

| Trường hiển thị | Nguồn |
| --- | --- |
| ExcelOriginalStatus | FA_AssetStatusSourceTbl.SourceStatus |
| DateEffectiveStatus | FA_AssetCurrentContractView.CurrentEffectiveStatus |
| AssetMachineStatus | Nhãn của CurrentLifecycleStatus |

Các nhãn hiệu lực: Chưa hiệu lực, Hết hiệu lực, Chưa khai báo thời hạn, Không giới hạn / chưa có ngày kết thúc, Còn hiệu lực. Đây là phép tính theo ngày, không phải chỉnh lại danh mục trạng thái gốc.

## Liên kết điều chuyển và linh kiện

Khi đợt điều chuyển thiết bị nhận đủ, luồng nhận có thể sinh `FA_MoveTbl.InternalTransferBatchID` để cập nhật vị trí. Mã tài sản/serial phải khớp dòng hàng của đợt. Luồng QR giữ liên kết máy nguồn/đích và chứng từ kho, phục vụ truy ngược nguồn gốc.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `FA_AssetListFrm` | Danh mục tài sản |
| `FA_Move2026Frm` | Phiếu di chuyển / bàn giao máy |
| `FA_Repair2026Frm` | Phiếu sửa chữa / bảo hành / bảo trì máy |

## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |
| `FA_AssetCurrentLifecycleView` | View | Vòng đời và vị trí từ biến động đã khóa |
| `FA_AssetCurrentContractView` | View | Hợp đồng hiện tại và hiệu lực theo ngày |
| `FA_AssetStatusDisplayView` | View | Tách tình trạng Excel, hiệu lực ngày, tình trạng máy |
| `FA_PartGenealogyReportStp` | STP báo cáo | Truy nguồn và lịch sử linh kiện |
