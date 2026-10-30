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
| DepreciationModeName | Nhãn riêng từ FA_AssetTbl.DepreciationMode |

Các nhãn hiệu lực: Chưa hiệu lực, Hết hiệu lực, Chưa khai báo thời hạn, Không giới hạn / chưa có ngày kết thúc, Còn hiệu lực. Đây là phép tính theo ngày, không phải chỉnh lại danh mục trạng thái gốc.

## Phân loại khấu hao độc lập với vòng đời

`FA_AssetListFrm` thêm hai combo tại **Thông tin chung**. Không tạo form phân loại riêng, nút lịch sử riêng hoặc bước duyệt mới. Quyền sửa vẫn dùng cấu hình hiện hữu; việc lưu phân loại không tự sinh phát sinh tài chính.

| Trường trên FA_AssetTbl | Kiểu | Ý nghĩa |
| --- | --- | --- |
| DepreciationMode | tinyint, NOT NULL | 0 = Chờ kế toán xác nhận; 1 = Chỉ theo dõi máy; 2 = Có tính khấu hao |
| DepreciationFromPeriodID | varchar(6), NULL được phép | FK đến SY_Period.PeriodID; kỳ áp dụng của lựa chọn đang lưu |

Tại thời điểm triển khai, các tài sản đã có được đặt mode 0 và kỳ rỗng, không tự suy ra phân loại từ dữ liệu máy. Tài sản mới mặc định mode 1. Việc tạo mới ở mode 1 với kỳ rỗng không tạo một quyết định lịch sử giả; khi xác nhận hoặc thay đổi phân loại phải chọn kỳ hợp lệ.

`FA_AssetDepreciationPolicyTbl` là lịch sử quyết định thực tế: `PolicyID`, `AssetID`, `FromPeriodID`, `EffectiveFrom`, `DepreciationMode`, `ChangedAt`, `ChangedBy`, `Notes`. `AssetID` nối danh mục máy, `FromPeriodID` nối kỳ kế toán; `EffectiveFrom` lấy ngày bắt đầu kỳ. Không tạo sẵn bản ghi cho các máy cũ và không dùng bảng này thay lịch sử vòng đời hoặc khấu hao.

### Lưu phân loại và bảo vệ lịch sử

`FA_Asset_DepreciationPolicyTrg` chạy AFTER INSERT/UPDATE trên `FA_AssetTbl`. Chỉ ghi lịch sử khi có thay đổi chế độ/kỳ áp dụng; sửa thông tin vòng đời hoặc vị trí đơn thuần không tạo sự kiện phân loại. Người thực hiện lấy từ `UserUpdate`, sau đó `UserCreate`, cuối cùng là tài khoản SQL gốc; không thêm bảng quyền hay tự cấp vai trò.

- Kỳ áp dụng phải tồn tại, có khoảng ngày hợp lệ và chưa khóa theo cả `isLock` lẫn `isLockData`.
- Không cho kỳ áp dụng lùi vào hoặc trước các kỳ đã khóa; không cho ghi đè giai đoạn máy đã có phát sinh khấu hao từ ngày áp dụng trở đi.
- Không chèn quyết định lùi trước một quyết định đã thiết lập cho kỳ sau. Có thể sửa cùng kỳ khi chưa có phát sinh và kỳ vẫn hợp lệ; lịch sử quyết định trước vẫn được giữ.
- Mode 2 cần `DepreDate`, `Amount` dương, thời gian `MonthUse`/`YearUse` hợp lệ và các tài khoản `AssetAccID`, `DepreAccID`, `ExpenseAccID` tồn tại trong danh mục tài khoản.
- Lưu không hợp lệ bị từ chối trong giao dịch; không ghi một phần phân loại hoặc lịch sử.

Combo kỳ chỉ hiển thị kỳ mở sau kỳ khóa cuối cùng. Trigger vẫn kiểm tra lại trên DB, gồm cả trường hợp kỳ vừa bị khóa sau lúc người dùng mở form.

### Xác định chế độ có hiệu lực và tính khấu hao

`FA_Asset_IsDepreciableFnc(AssetID, AsOfDate)` chọn quyết định có `EffectiveFrom <= AsOfDate`, mới nhất theo `EffectiveFrom DESC, PolicyID DESC`. Không đọc riêng mode hiện tại để áp dụng ngược mọi kỳ. Không có quyết định, hoặc quyết định hiệu lực là mode 0/1, thì không đủ điều kiện khấu hao.

Mode 2 chỉ đủ điều kiện theo ngày khi `DepreDate <= AsOfDate`, chưa đến `StopDate` và chưa đến `LiquidationDate`. `SY_GetAssetListFnc` giữ dữ liệu nguyên giá, hao mòn và giá trị còn lại; đặt `NextDepre=0` nếu không đủ điều kiện hoặc không còn giá trị khấu hao. Các chức năng vòng đời tiếp tục dùng danh mục và lịch sử hiện hữu.

`SY_Create_FixAssetDepreciateStp(@PeriodID, @DeleteOnly=0, @User)` xử lý kỳ trong giao dịch, dùng khóa ứng dụng theo kỳ và khóa dữ liệu tài sản/kỳ để giữ ổn định phân loại trong lần tính. Đường tính hiện hữu gọi `SY_GetAssetFnc`, dùng kết quả danh sách đã lọc điều kiện khấu hao.

- Chặn kỳ không hợp lệ, `isLock=1` hoặc `isLockData=1`, kể cả yêu cầu xóa khấu hao.
- Trước khi tính lại, nếu kỳ đã có khấu hao của máy nay chưa xác nhận/không đủ điều kiện, báo kế toán đối chiếu và giữ nguyên phát sinh; không tự xóa để làm khớp phân loại.
- Kiểm tra thông tin tài chính trước khi xóa/tạo lại kết quả; chỉ lấy dòng `NextDepre > 0` vào `FA_AssetDepreTbl`.
- Thiết lập phân bổ riêng tại `FA_AssetPeriodSetupTbl` chỉ áp dụng cho máy thực sự có kết quả tính của kỳ; không đưa máy chỉ theo dõi trở lại danh sách khấu hao.
- Bút toán dùng `GJ_EntryTbl` / `GJ_EntryDetailTbl`, nối `DocumentID`. Chỉ xử lý chứng từ khấu hao do thủ tục tạo theo kỳ và ngày tương ứng; giữ các bút toán FA khác. Đầu bút toán mới chỉ sinh từ phát sinh khác 0 của đúng kỳ đang tính.
- Lỗi hoàn tác toàn bộ lần xử lý. Chế độ xóa tường minh `@DeleteOnly=1` chỉ được dùng cho kỳ mở theo chức năng/quyền hiện hữu; thay đổi phân loại không tự gọi chế độ này.

Chuỗi liên kết: **danh mục máy → quyết định phân loại theo kỳ → kiểm tra điều kiện tại ngày tính → phát sinh khấu hao → bút toán**. Nhánh vòng đời **danh mục máy → biến động/sửa chữa/linh kiện** vẫn độc lập. Không sửa lịch sử, kỳ đã chốt hoặc phân quyền để đưa máy vào khấu hao.

## Liên kết điều chuyển và linh kiện

Khi đợt điều chuyển thiết bị nhận đủ, luồng nhận có thể sinh `FA_MoveTbl.InternalTransferBatchID` để cập nhật vị trí. Mã tài sản/serial phải khớp dòng hàng của đợt. Luồng QR giữ liên kết máy nguồn/đích và chứng từ kho, phục vụ truy ngược nguồn gốc.

## Màn hình liên quan

| Form | Tên trên ERP |
| --- | --- |
| `FA_AssetListFrm` | Danh mục tài sản; phân loại tại Thông tin chung qua Chế độ khấu hao và Áp dụng từ kỳ |
| `FA_Move2026Frm` | Phiếu di chuyển / bàn giao máy |
| `FA_Repair2026Frm` | Phiếu sửa chữa / bảo hành / bảo trì máy |

## Đối tượng xử lý

| Đối tượng DB | Loại | Trách nhiệm |
| --- | --- | --- |
| `FA_AssetCurrentLifecycleView` | View | Vòng đời và vị trí từ biến động đã khóa |
| `FA_AssetCurrentContractView` | View | Hợp đồng hiện tại và hiệu lực theo ngày |
| `FA_AssetStatusDisplayView` | View | Tách tình trạng Excel, hiệu lực ngày, tình trạng máy và nhãn chế độ khấu hao riêng |
| `FA_PartGenealogyReportStp` | STP báo cáo | Truy nguồn và lịch sử linh kiện |
| `FA_AssetDepreciationPolicyTbl` | Bảng | Lịch sử phân loại thực tế theo AssetID và kỳ áp dụng |
| `FA_Asset_IsDepreciableFnc` | Function | Chọn quyết định hiệu lực và kiểm tra điều kiện khấu hao theo ngày |
| `FA_Asset_DepreciationPolicyTrg` | Trigger | Kiểm tra thay đổi chế độ/kỳ, bảo vệ lịch sử và ghi nhận người cập nhật |
| `SY_GetAssetListFnc` | Function | Giữ thông tin tài sản, chỉ trả NextDepre cho máy đủ điều kiện |
| `SY_Create_FixAssetDepreciateStp` | STP | Tính/xóa khấu hao kỳ mở trong giao dịch, chỉ sinh bút toán cho phát sinh của kỳ |
