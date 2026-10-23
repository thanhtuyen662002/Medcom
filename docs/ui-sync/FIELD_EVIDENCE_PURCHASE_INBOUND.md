# Bằng chứng cấu hình trường: Mua hàng và Nhập kho (T-003)

- Tài liệu tham chiếu: `docs/architecture/DOCUMENT_DETAIL_UNIFICATION.md` (mục 2.1, 2.2, 3)
- Nhiệm vụ: T-003 — Config trường cho Mua hàng và Nhập kho (kèm bằng chứng)
- Phiên bản: 2026-10-23 (Cập nhật sau Review lần 2)
- Nguyên tắc bảo mật repo public: Không chứa dữ liệu thật (tên, email cá nhân, mã chứng từ thật, giá trị giao dịch).

---

## 1. Nguồn bằng chứng kỹ thuật

Mọi quyết định đưa trường vào nhóm hiển thị (`groups`), ẩn (`hidden`), hay hiển thị trong dòng hàng (`lines.columns`, `lines.expandGroups`) đều dựa trên các nguồn kỹ thuật có thể kiểm chứng trong repo:

1. **Khóa JSON backend trả về (camelCase) và Đường API:**
   - **Đường erp-screen** (`/api/erp/{module}/detail`): Được gọi qua `erpClient.getErpModuleDetail` tại `apps/medcom-sites/lib/erp/erp-screen-api.ts:298` (dùng bởi `TabErpScreen` và màn chi tiết chứng từ). Backend ánh xạ cột DB qua quy tắc `NativeJsonName` tại `src/backend/Medcom.Infrastructure/Erp/SqlErpScreenEffects.cs:174-175`:
     ```csharp
     private static string NativeJsonName(string native)
     {
         var name = native.Replace("ID", "Id", StringComparison.Ordinal)
                          .Replace("QR", "Qr", StringComparison.Ordinal);
         return char.ToLowerInvariant(name[0]) + name[1..];
     }
     ```
     Theo quy tắc này:
     - `ImageURL` -> `imageURL`
     - `BBKCUrl` -> `bBKCUrl`
     - `QRPrintType` -> `qrPrintType`
     - `HangSX` -> `hangSX`
     - Toàn bộ cột kết thúc bằng `ID` -> `Id` (ví dụ: `PurchaseRequestID` -> `purchaseRequestId`, `ItemID` -> `itemId`, `BranchID` -> `branchId`, `OrderTypeID` -> `orderTypeId`, `DamageInsideStatusID` -> `damageInsideStatusId`, `LocationDamageDetectedID` -> `locationDamageDetectedId`).
     - Không có cột `VAT...` nào trong bảng header hoặc dòng của 4 module này.
   - **Đường /api/documents** (`DocumentFieldCatalog.cs:30-156`): Đặt tên theo camelCase thông thường hạ toàn bộ viết tắt (ví dụ `imageUrl`, `bbkcUrl`). Do màn chi tiết tích hợp theo đường `erp-screen`, các khóa phải tuân thủ chuẩn `NativeJsonName` của đường `erp-screen` (`imageURL`, `bBKCUrl`).
   - Danh mục form/workflow: `inventories/erp/20261010/six-screen-catalog.json` & `inventories/erp/20261011/cud-workflow-catalog.json`.
   - Các trường phát sinh tự động (`<x>Name` cho khóa `<x>Id`, `<x>ReferenceState`, `statusForeColor`, `statusBackColor`, `<x>Display` cho các trường ngày và tiền): `src/backend/Medcom.Api/FeDisplayProjection.cs:18-126`.
   - Các trường bị backend loại bỏ trước khi trả về theo cấu hình form ERP (`SY_FrmCfg/.../HDE`): `src/backend/Medcom.Api/ErpVisibleProjection.cs:15-58` + `inventories/erp/20261019/visible-fields.json`.
   - Chuẩn hóa FE (`cleanHeader`), luôn bổ sung `documentId` và `branchId`: `apps/medcom-sites/lib/erp/erp-screen-contracts.ts:170-237`.
2. **Kiểu cột CSDL MedData:**
   - `.agent-runs/db/q02-columns.txt`: Metadata cột lấy từ CSDL MedData (chỉ đọc, 2026-10-23) cho các bảng `AP_PurchaseRequestTbl`, `AP_PurchaseRequestDetailTbl`, `AP_OrderTbl`, `AP_OrderDetailTbl`, `IV_InboundRequestTbl`, `IV_InboundRequestDetailsTbl`.
3. **Cột thường có giá trị:**
   - `.agent-runs/db/q02-nonnull-columns.txt`: Danh sách tên cột có giá trị trong chứng từ mẫu (chỉ đọc tên cột, không lưu giá trị).
4. **Nhãn tiếng Việt chuẩn đã dùng:**
   - `components/untitledui/tab-erp-screen.tsx:141-239` (`FIELD_LABELS`).

---

## 2. Bảng bằng chứng: Đề nghị mua hàng (`purchase-requests`, `purchase-approvals`)

- Bảng nguồn header: `dbo.AP_PurchaseRequestTbl`
- Bảng nguồn dòng: `dbo.AP_PurchaseRequestDetailTbl`
- Cấu hình FE: `purchaseRequestDetailConfig` trong `apps/medcom-sites/lib/erp/document-detail/modules/purchase.ts`

### 2.1 Header fields

| Khóa JSON | Cột DB | Kiểu DB | Nguồn (file:dòng) | Đường API | Quyết định | Nhãn | Format | Lý do |
|---|---|---|---|---|---|---|---|---|
| `purchaseDate` | `PurchaseDate` | `datetime` | `DocumentFieldCatalog.cs:134`, `q02-columns.txt:45` | `erp-screen` | Nhóm Thông tin đề nghị | Ngày đề xuất | `date` | Ngày lập đề xuất mua hàng |
| `branchId` | `BranchID` | `varchar(50)` | `DocumentFieldCatalog.cs:146`, `q02-columns.txt:57` | `erp-screen` | Nhóm Thông tin đề nghị | Chi nhánh | `text` (kèm `displayKey`) | Mã chi nhánh lập đề xuất |
| `branchName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Thông tin đề nghị | (displayKey của `branchId`) | `text` | Tên hiển thị chi nhánh |
| `personSuggest` | `PersonSuggest` | `nvarchar(500)` | `DocumentFieldCatalog.cs:136`, `q02-columns.txt:47` | `erp-screen` | Nhóm Thông tin đề nghị | Người đề nghị | `text` | Họ tên người đề xuất mua |
| `department` | `Department` | `nvarchar(100)` | `DocumentFieldCatalog.cs:137`, `q02-columns.txt:48` | `erp-screen` | Nhóm Thông tin đề nghị | Bộ phận | `text` | Phòng ban/bộ phận người đề nghị |
| `purposeId` | `PurposeID` | `int` | `DocumentFieldCatalog.cs:135`, `q02-columns.txt:46` | `erp-screen` | Nhóm Mục đích & tiền tệ | Mục đích | `text` (kèm `displayKey`) | Mã mục đích mua hàng |
| `purposeName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Mục đích & tiền tệ | (displayKey của `purposeId`) | `text` | Tên mục đích mua hàng |
| `purposeDescOrClient` | `PurposeDescOrClient` | `nvarchar(max)` | `DocumentFieldCatalog.cs:138`, `q02-columns.txt:49` | `erp-screen` | Nhóm Mục đích & tiền tệ | Mục đích / Khách hàng | `text` | Diễn giải mục đích hoặc tên khách hàng |
| `objectId` | `ObjectID` | `varchar(100)` | `DocumentFieldCatalog.cs:144`, `q02-columns.txt:55` | `erp-screen` | Nhóm Mục đích & tiền tệ | Đối tượng liên quan | `text` (kèm `displayKey`) | Mã đối tượng/khách hàng/nhà cung cấp liên quan |
| `objectName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Mục đích & tiền tệ | (displayKey của `objectId`) | `text` | Tên đối tượng liên quan |
| `currencyId` | `CurrencyID` | `varchar(3)` | `DocumentFieldCatalog.cs:143`, `q02-columns.txt:54` | `erp-screen` | Nhóm Mục đích & tiền tệ | Loại tiền | `text` (kèm `displayKey`) | Mã nguyên tệ (VND, USD...) |
| `currencyName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Mục đích & tiền tệ | (displayKey của `currencyId`) | `text` | Tên loại tiền |
| `rateExchange` | `RateExchange` | `float` | `DocumentFieldCatalog.cs:145`, `q02-columns.txt:56` | `erp-screen` | Nhóm Mục đích & tiền tệ | Tỷ giá | `number` | Tỷ giá quy đổi tiền tệ |
| `price` | `Price` | `decimal(18, 2)` | `DocumentFieldCatalog.cs:139`, `q02-columns.txt:50` | `erp-screen` | Nhóm Mục đích & tiền tệ | Giá bán | `money` | Giá trị đề nghị / dự toán |
| `notes` | `Notes` | `nvarchar(max)` | `DocumentFieldCatalog.cs:140`, `q02-columns.txt:51` | `erp-screen` | Nhóm Nội dung & ghi chú | Ghi chú | `multiline` | Ghi chú nội dung đề nghị (strip khi rỗng) |
| `documentId` | — (FE cleanHeader) | — | `erp-screen-contracts.ts:227` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị trên thanh tiêu đề dialog |
| `purchaseRequestId` | `PurchaseRequestID` | `nvarchar(50)` | `DocumentFieldCatalog.cs:133`, `q02-columns.txt:44` | `erp-screen` | Ẩn (`hidden`) | — | — | Mã đề nghị gốc, đồng nhất với documentId ở header dialog |
| `purchaseDateDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn (`hidden`) | — | — | Chuỗi format sẵn, FE tự định dạng bằng format: date |
| `priceDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn (`hidden`) | — | — | Chuỗi format sẵn, FE tự định dạng bằng format: money |
| `branchReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu kỹ thuật của chi nhánh |
| `purposeReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu kỹ thuật của mục đích |
| `objectReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu kỹ thuật của đối tượng |
| `currencyReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu kỹ thuật của loại tiền |
| `statusId` | `StatusID` | `int` | `DocumentFieldCatalog.cs:141`, `q02-columns.txt:52` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị bằng badge trạng thái ở header |
| `statusName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị bằng badge trạng thái ở header |
| `statusReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu kỹ thuật của trạng thái |
| `statusForeColor` | — (phát sinh) | — | `FeDisplayProjection.cs:110` | `erp-screen` | Ẩn (`hidden`) | — | — | Mã màu chữ trạng thái kỹ thuật |
| `statusBackColor` | — (phát sinh) | — | `FeDisplayProjection.cs:111` | `erp-screen` | Ẩn (`hidden`) | — | — | Mã màu nền trạng thái kỹ thuật |
| `isLocked` | `isLock` | `bit` | `six-screen-catalog.json:purchase-requests`, `q02-columns.txt:53` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị bằng badge khóa ở header |
| `isLock` | `isLock` | `bit` | `DocumentFieldCatalog.cs:142`, `q02-columns.txt:53` | `erp-screen` | Ẩn (`hidden`) | — | — | Bản tên gốc DB của cờ khóa, đã alias sang isLocked |

### 2.2 Lines fields

| Khóa JSON | Cột DB | Kiểu DB | Nguồn (file:dòng) | Đường API | Vị trí | Nhãn | Format | Lý do |
|---|---|---|---|---|---|---|---|---|
| `itemId` | `ItemID` | `varchar(50)` | `DocumentFieldCatalog.cs:149`, `q02-columns.txt:36` | `erp-screen` | `columns` (bảng) | Mã hàng | `text` | Khóa xác định mặt hàng |
| `itemName` | — (phát sinh) | — | `FeDisplayProjection.cs:105`, `ItemDisplayContextReader.cs` | `erp-screen` | `columns` (bảng) | Tên hàng | `text` | Tên mặt hàng hiển thị chính (`role: primary`) |
| `unit` | — (phát sinh) | — | `FeDisplayProjection.cs:118` | `erp-screen` | `columns` (bảng) | ĐVT | `text` | Đơn vị tính mặt hàng |
| `quantity` | `Quantity` | `decimal(18, 0)` | `DocumentFieldCatalog.cs:152`, `q02-columns.txt:39` | `erp-screen` | `columns` (bảng) | Số lượng | `number` | Số lượng yêu cầu |
| `unitPrice` | `UnitPrice` | `decimal(18, 0)` | `DocumentFieldCatalog.cs:153`, `q02-columns.txt:40` | `erp-screen` | `columns` (bảng) | Đơn giá | `money` | Đơn giá dự kiến |
| `totalPrice` | `TotalPrice` | `decimal(18, 0)` | `DocumentFieldCatalog.cs:154`, `q02-columns.txt:41` | `erp-screen` | `columns` (bảng) | Tổng giá | `money` | Thành tiền dự kiến (`role: total`) |
| `model` | `Model` | `varchar(50)` | `DocumentFieldCatalog.cs:155`, `q02-columns.txt:42` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Model | `text` | Quy cách/model của mặt hàng |
| `timeRequired` | `TimeRequired` | `nvarchar(200)` | `DocumentFieldCatalog.cs:151`, `q02-columns.txt:38` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Thời gian yêu cầu | `text` | Thời hạn cần hàng |
| `budget` | `Budget` | `decimal(18, 0)` | `DocumentFieldCatalog.cs:150`, `q02-columns.txt:37` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Ngân sách | `money` | Hạn mức ngân sách phê duyệt |
| `userAutoId` | `UserAutoID` | `varchar(50)` | `DocumentFieldCatalog.cs:148`, `q02-columns.txt:35` | `erp-screen` | Ẩn dòng | — | — | Khóa tự tăng nội bộ CSDL |
| `lineId` | — (alias) | — | `CanonicalResponseProjection.cs:151` | `erp-screen` | Ẩn dòng | — | — | Khóa định danh dòng phía web |
| `purchaseRequestId` | `PurchaseRequestID` | `nvarchar(50)` | `DocumentFieldCatalog.cs:156`, `q02-columns.txt:43` | `erp-screen` | Ẩn dòng | — | — | Khóa ngoại trỏ về chứng từ cha |
| `itemCode` | — (phát sinh) | — | `FeDisplayProjection.cs:117` | `erp-screen` | Dự phòng | — | — | Mã hàng dạng hiển thị |
| `itemReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn dòng | — | — | Trạng thái kỹ thuật |
| `manufacturerItemCode` | — (phát sinh) | — | `CanonicalResponseProjection.cs:186` | `erp-screen` | Dự phòng | — | — | Mã nhà sản xuất |
| `manufacturerCodeSource`| — (phát sinh) | — | `CanonicalResponseProjection.cs:186` | `erp-screen` | Ẩn dòng | — | — | Nguồn mã nhà sản xuất |
| `budgetDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn dòng | — | — | Bản format sẵn |
| `unitPriceDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn dòng | — | — | Bản format sẵn |
| `totalPriceDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn dòng | — | — | Bản format sẵn |

---

## 3. Bảng bằng chứng: Đơn mua hàng (`purchase-orders`)

- Bảng nguồn header: `dbo.AP_OrderTbl`
- Bảng nguồn dòng: `dbo.AP_OrderDetailTbl`
- Cấu hình FE: `purchaseOrderDetailConfig` trong `apps/medcom-sites/lib/erp/document-detail/modules/purchase.ts`

### 3.1 Header fields

| Khóa JSON | Cột DB | Kiểu DB | Nguồn (file:dòng) | Đường API | Quyết định | Nhãn | Format | Lý do |
|---|---|---|---|---|---|---|---|---|
| `documentDate` | `DocumentDate` | `datetime` | `DocumentFieldCatalog.cs:33`, `q02-columns.txt:17` | `erp-screen` | Nhóm Thông tin đơn mua | Ngày chứng từ | `date` | Ngày ký/lập đơn mua |
| `deliverDate` | `DeliverDate` | `datetime` | `DocumentFieldCatalog.cs:37`, `q02-columns.txt:21` | `erp-screen` | Nhóm Thông tin đơn mua | Ngày giao hàng | `date` | Ngày hẹn giao hàng của nhà cung cấp |
| `branchId` | `BranchID` | `varchar(50)` | `DocumentFieldCatalog.cs:50`, `q02-columns.txt:34` | `erp-screen` | Nhóm Thông tin đơn mua | Chi nhánh | `text` (kèm `displayKey`) | Chi nhánh đặt mua |
| `branchName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Thông tin đơn mua | (displayKey của `branchId`) | `text` | Tên chi nhánh đặt mua |
| `contractId` | `ContractID` | `nvarchar(100)` | `DocumentFieldCatalog.cs:48`, `q02-columns.txt:32` | `erp-screen` | Nhóm Thông tin đơn mua | Hợp đồng | `text` (kèm `displayKey`) | Số/mã hợp đồng mua |
| `contractName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Thông tin đơn mua | (displayKey của `contractId`) | `text` | Tên/trích yếu hợp đồng |
| `objectId` | `ObjectID` | `varchar(100)` | `DocumentFieldCatalog.cs:34`, `q02-columns.txt:18` | `erp-screen` | Nhóm Nhà cung cấp & tiền tệ | Nhà cung cấp | `text` (kèm `displayKey`) | Mã nhà cung cấp |
| `objectName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Nhà cung cấp & tiền tệ | (displayKey của `objectId`) | `text` | Tên nhà cung cấp |
| `currencyId` | `CurrencyID` | `varchar(3)` | `DocumentFieldCatalog.cs:38`, `q02-columns.txt:22` | `erp-screen` | Nhóm Nhà cung cấp & tiền tệ | Loại tiền | `text` (kèm `displayKey`) | Mã nguyên tệ |
| `currencyName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Nhà cung cấp & tiền tệ | (displayKey của `currencyId`) | `text` | Tên loại tiền |
| `rateExchange` | `RateExchange` | `float` | `DocumentFieldCatalog.cs:39`, `q02-columns.txt:23` | `erp-screen` | Nhóm Nhà cung cấp & tiền tệ | Tỷ giá | `number` | Tỷ giá giao dịch |
| `baseTotal` | `BaseTotal` | `decimal(28, 0)` | `DocumentFieldCatalog.cs:40`, `q02-columns.txt:24` | `erp-screen` | Nhóm Nhà cung cấp & tiền tệ | Tổng tiền gốc | `money` | Tổng giá trị đơn mua quy đổi về tiền gốc |
| `memo` | `Memo` | `nvarchar(200)` | `DocumentFieldCatalog.cs:35`, `q02-columns.txt:19` | `erp-screen` | Nhóm Nội dung & ghi chú | Nội dung | `text` | Diễn giải tóm tắt đơn mua |
| `notes` | `Notes` | `nvarchar(200)` | `DocumentFieldCatalog.cs:36`, `q02-columns.txt:20` | `erp-screen` | Nhóm Nội dung & ghi chú | Ghi chú | `multiline` | Ghi chú chi tiết đơn mua |
| `documentId` | `DocumentID` | `varchar(30)` | `DocumentFieldCatalog.cs:32`, `q02-columns.txt:16` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị trên thanh tiêu đề dialog |
| `documentDateDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã dùng `documentDate` với `format: date` |
| `deliverDateDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã dùng `deliverDate` với `format: date` |
| `baseTotalDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã dùng `baseTotal` với `format: money` |
| `branchReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu chi nhánh |
| `contractReferenceState`| — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu hợp đồng |
| `objectReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu đối tượng |
| `currencyReferenceState`| — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu tiền tệ |
| `linkId` | `LinkID` | `varchar(50)` | `DocumentFieldCatalog.cs:47`, `q02-columns.txt:31` | `erp-screen` | Ẩn (`hidden`) | — | — | Mã liên kết nội bộ chứng từ ERP (nằm trong `TechnicalIds:33`, không phải URL) |
| `linkName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Ẩn (`hidden`) | — | — | Tên liên kết nội bộ |
| `linkReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu liên kết |
| `searchField` | `SearchField` | `nvarchar(2000)` | `DocumentFieldCatalog.cs:41`, `q02-columns.txt:25`, `visible-fields.json:386`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `isLocked` | `isLock` | `bit` | `cud-workflow-catalog.json`, `q02-columns.txt:26` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị bằng badge khóa ở header |
| `isLock` | `isLock` | `bit` | `DocumentFieldCatalog.cs:42`, `q02-columns.txt:26` | `erp-screen` | Ẩn (`hidden`) | — | — | Bản tên cột gốc CSDL |
| `statusId` | `StatusID` | `int` | `DocumentFieldCatalog.cs:49`, `q02-columns.txt:33` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị bằng badge trạng thái ở header |
| `statusName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị bằng badge trạng thái ở header |
| `statusReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu của trạng thái |
| `statusForeColor` | — (phát sinh) | — | `FeDisplayProjection.cs:110` | `erp-screen` | Ẩn (`hidden`) | — | — | Màu chữ trạng thái |
| `statusBackColor` | — (phát sinh) | — | `FeDisplayProjection.cs:111` | `erp-screen` | Ẩn (`hidden`) | — | — | Màu nền trạng thái |
| `userCreate` | `UserCreate` | `varchar(50)` | `DocumentFieldCatalog.cs:43`, `q02-columns.txt:27` | `erp-screen` | Ẩn (`hidden`) | — | — | Người tạo chứng từ (audit kỹ thuật) |
| `userUpdate` | `UserUpdate` | `varchar(50)` | `DocumentFieldCatalog.cs:44`, `q02-columns.txt:28` | `erp-screen` | Ẩn (`hidden`) | — | — | Người cập nhật cuối (audit kỹ thuật) |
| `dateCreate` | `DateCreate` | `datetime` | `DocumentFieldCatalog.cs:46`, `q02-columns.txt:30` | `erp-screen` | Ẩn (`hidden`) | — | — | Thời điểm tạo bản ghi (audit kỹ thuật) |
| `dateCreateDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn (`hidden`) | — | — | Bản format sẵn của dateCreate |
| `dateUpdate` | `DateUpdate` | `datetime` | `DocumentFieldCatalog.cs:45`, `q02-columns.txt:29` | `erp-screen` | Ẩn (`hidden`) | — | — | Thời điểm cập nhật bản ghi (audit kỹ thuật) |
| `dateUpdateDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn (`hidden`) | — | — | Bản format sẵn của dateUpdate |

### 3.2 Lines fields

| Khóa JSON | Cột DB | Kiểu DB | Nguồn (file:dòng) | Đường API | Vị trí | Nhãn | Format | Lý do |
|---|---|---|---|---|---|---|---|---|
| `itemId` | `ItemID` | `nvarchar(50)` | `DocumentFieldCatalog.cs:54`, `q02-columns.txt:6` | `erp-screen` | `columns` (bảng) | Mã hàng | `text` | Khóa mặt hàng |
| `itemName` | — (phát sinh) | — | `FeDisplayProjection.cs:105`, `ItemDisplayContextReader.cs` | `erp-screen` | `columns` (bảng) | Tên hàng | `text` | Tên mặt hàng (`role: primary`) |
| `unit` | — (phát sinh) | — | `FeDisplayProjection.cs:118` | `erp-screen` | `columns` (bảng) | ĐVT | `text` | Đơn vị tính |
| `quantity` | `Quantity` | `decimal(28, 2)` | `DocumentFieldCatalog.cs:55`, `q02-columns.txt:7` | `erp-screen` | `columns` (bảng) | Số lượng | `number` | Số lượng đặt mua |
| `unitPrice` | `UnitPrice` | `decimal(28, 4)` | `DocumentFieldCatalog.cs:56`, `q02-columns.txt:8` | `erp-screen` | `columns` (bảng) | Đơn giá | `money` | Đơn giá mua |
| `amount` | `Amount` | `decimal(28, 0)` | `DocumentFieldCatalog.cs:58`, `q02-columns.txt:10`, `ErpVisibleFields.cs:23-25`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `sourceAmount` | `SourceAmount` | `decimal(18, 2)` | `DocumentFieldCatalog.cs:57`, `q02-columns.txt:9`, `ErpVisibleFields.cs:23-25`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `notes` | `Notes` | `nvarchar(100)` | `DocumentFieldCatalog.cs:59`, `q02-columns.txt:11` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Ghi chú | `text` | Ghi chú chi tiết dòng hàng |
| `userAutoId` | `UserAutoID` | `varchar(40)` | `DocumentFieldCatalog.cs:52`, `q02-columns.txt:4` | `erp-screen` | Ẩn dòng | — | — | Khóa tự tăng nội bộ CSDL |
| `lineId` | — (alias) | — | `CanonicalResponseProjection.cs:151` | `erp-screen` | Ẩn dòng | — | — | Khóa định danh dòng phía web |
| `documentId` | `DocumentID` | `varchar(30)` | `DocumentFieldCatalog.cs:53`, `q02-columns.txt:5` | `erp-screen` | Ẩn dòng | — | — | Khóa ngoại đơn hàng |
| `parentId` | `ParentID` | `varchar(50)` | `DocumentFieldCatalog.cs:63`, `q02-columns.txt:15`, `ErpVisibleFields.cs:23-25`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `quantity2` | `Quantity2` | `decimal(28, 4)` | `DocumentFieldCatalog.cs:60`, `q02-columns.txt:12`, `ErpVisibleFields.cs:23-25`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `property` | `Property` | `nvarchar(50)` | `DocumentFieldCatalog.cs:61`, `q02-columns.txt:13`, `ErpVisibleFields.cs:23-25`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `property2` | `Property2` | `nvarchar(50)` | `DocumentFieldCatalog.cs:62`, `q02-columns.txt:14`, `ErpVisibleFields.cs:23-25`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `itemCode` | — (phát sinh) | — | `FeDisplayProjection.cs:117` | `erp-screen` | Dự phòng | — | — | Mã hàng hiển thị |
| `itemReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106`, `ErpVisibleFields.cs:23-25`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `manufacturerItemCode` | — (phát sinh) | — | `CanonicalResponseProjection.cs:186` | `erp-screen` | Dự phòng | — | — | Mã nhà sản xuất |
| `manufacturerCodeSource`| — (phát sinh) | — | `CanonicalResponseProjection.cs:186` | `erp-screen` | Ẩn dòng | — | — | Nguồn mã nhà sản xuất |
| `unitPriceDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn dòng | — | — | Bản format sẵn |
| `amountDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124`, `ErpVisibleFields.cs:23-25`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `sourceAmountDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124`, `ErpVisibleFields.cs:23-25`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |

---

## 4. Bảng bằng chứng: Đề nghị nhập kho (`inbound-requests`)

- Bảng nguồn header: `dbo.IV_InboundRequestTbl`
- Bảng nguồn dòng: `dbo.IV_InboundRequestDetailsTbl`
- Cấu hình FE: `inboundRequestDetailConfig` trong `apps/medcom-sites/lib/erp/document-detail/modules/inbound.ts`

### 4.1 Header fields

| Khóa JSON | Cột DB | Kiểu DB | Nguồn (file:dòng) | Đường API | Quyết định | Nhãn | Format | Lý do |
|---|---|---|---|---|---|---|---|---|
| `documentDate` | `DocumentDate` | `datetime` | `DocumentFieldCatalog.cs:67`, `q02-columns.txt:326` | `erp-screen` | Nhóm Thông tin chứng từ | Ngày chứng từ | `date` | Ngày lập phiếu đề nghị nhập |
| `orderNumber` | `OrderNumber` | `nvarchar(50)` | `DocumentFieldCatalog.cs:68`, `q02-columns.txt:327` | `erp-screen` | Nhóm Thông tin chứng từ | Số đơn hàng | `text` | Số PO hoặc đơn hàng nhà cung cấp |
| `invoiceNo` | `InvoiceNo` | `nvarchar(50)` | `DocumentFieldCatalog.cs:70`, `q02-columns.txt:329` | `erp-screen` | Nhóm Thông tin chứng từ | Số hóa đơn | `text` | Số hóa đơn tài chính/vận chuyển |
| `declarationNumber` | `DeclarationNumber` | `varchar(50)` | `DocumentFieldCatalog.cs:71`, `q02-columns.txt:330` | `erp-screen` | Nhóm Thông tin chứng từ | Số tờ khai | `text` | Số tờ khai hải quan (hàng nhập khẩu) |
| `branchId` | `BranchID` | `varchar(50)` | `DocumentFieldCatalog.cs:69`, `q02-columns.txt:328` | `erp-screen` | Nhóm Thông tin chứng từ | Chi nhánh | `text` (kèm `displayKey`) | Chi nhánh kho nhận hàng |
| `branchName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Thông tin chứng từ | (displayKey của `branchId`) | `text` | Tên chi nhánh |
| `objectId` | `ObjectID` | `varchar(50)` | `DocumentFieldCatalog.cs:76`, `q02-columns.txt:335` | `erp-screen` | Nhóm Thông tin chứng từ | Đối tượng | `text` (kèm `displayKey`) | Nhà cung cấp hoặc đối tác giao hàng |
| `objectName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Thông tin chứng từ | (displayKey của `objectId`) | `text` | Tên đối tác |
| `orderTypeId` | `OrderTypeID` | `nvarchar(50)` | `DocumentFieldCatalog.cs:75`, `q02-columns.txt:334` | `erp-screen` | Nhóm Thông tin chứng từ | Loại đơn hàng | `text` (kèm `displayKey`) | Khóa loại đơn hàng (audit: cần dùng `displayKey`) |
| `orderTypeName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Thông tin chứng từ | (displayKey của `orderTypeId`) | `text` | Tên loại đơn hàng tiếng Việt |
| `currencyId` | `CurrencyID` | `varchar(3)` | `DocumentFieldCatalog.cs:96`, `q02-columns.txt:355` | `erp-screen` | Nhóm Thông tin chứng từ | Loại tiền | `text` (kèm `displayKey`) | Mã nguyên tệ |
| `currencyName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Thông tin chứng từ | (displayKey của `currencyId`) | `text` | Tên loại tiền |
| `rateExchange` | `RateExchange` | `decimal(28, 10)`| `DocumentFieldCatalog.cs:97`, `q02-columns.txt:356` | `erp-screen` | Nhóm Thông tin chứng từ | Tỷ giá | `number` | Tỷ giá quy đổi ngoại tệ |
| `departurePoint` | `DeparturePoint` | `nvarchar(100)` | `DocumentFieldCatalog.cs:72`, `q02-columns.txt:331` | `erp-screen` | Nhóm Vận chuyển | Điểm đi | `text` | Địa điểm xuất phát |
| `destinationPoint` | `DestinationPoint` | `nvarchar(100)` | `DocumentFieldCatalog.cs:73`, `q02-columns.txt:332` | `erp-screen` | Nhóm Vận chuyển | Điểm đến | `text` | Địa điểm kho tiếp nhận |
| `datetimeRecorded` | `DatetimeRecorded` | `datetime` | `DocumentFieldCatalog.cs:94`, `q02-columns.txt:353`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `isRain` | `IsRain` | `bit` | `DocumentFieldCatalog.cs:74`, `q02-columns.txt:333` | `erp-screen` | Nhóm Vận chuyển | Thời tiết mưa | `boolean` | Điều kiện thời tiết lúc dỡ hàng (Có/Không) |
| `totalPalletQuantityByDocument`| `TotalPalletQuantityByDocument`| `decimal(18, 0)`| `DocumentFieldCatalog.cs:77`, `q02-columns.txt:336` | `erp-screen` | Nhóm Kiện hàng | Tổng pallet theo chứng từ | `number` | Số pallet trên chứng từ vận chuyển |
| `totalBarrelQuantityByDocument`| `TotalBarrelQuantityByDocument`| `decimal(18, 0)`| `DocumentFieldCatalog.cs:78`, `q02-columns.txt:337` | `erp-screen` | Nhóm Kiện hàng | Tổng thùng theo chứng từ | `number` | Số thùng trên chứng từ vận chuyển |
| `totalPalletQuantityByReal` | `TotalPalletQuantityByReal` | `decimal(18, 0)`| `DocumentFieldCatalog.cs:79`, `q02-columns.txt:338`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `totalBarrelQuantityByReal` | `TotalBarrelQuantityByReal` | `decimal(18, 0)`| `DocumentFieldCatalog.cs:80`, `q02-columns.txt:339`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `excessPackageQuantity` | `ExcessPackageQuantity` | `decimal(18, 0)`| `DocumentFieldCatalog.cs:81`, `q02-columns.txt:340`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `lackOfPackageQuantity` | `LackOfPackageQuantity` | `decimal(18, 0)`| `DocumentFieldCatalog.cs:82`, `q02-columns.txt:341`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `damagedPackageQuantity`| `DamagedPackageQuantity`| `decimal(18, 0)`| `DocumentFieldCatalog.cs:83`, `q02-columns.txt:342` | `erp-screen` | Nhóm Kiện hàng | Số kiện hỏng | `number` | Số lượng kiện bị hư hỏng |
| `packageTypeId` | `PackageTypeID` | `nvarchar(50)` | `DocumentFieldCatalog.cs:84`, `q02-columns.txt:343` | `erp-screen` | Nhóm Kiện hàng | Loại bao bì | `text` (kèm `displayKey`) | Mã quy cách đóng gói bao bì |
| `packageTypeName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Nhóm Kiện hàng | (displayKey của `packageTypeId`) | `text` | Tên quy cách bao bì |
| `isDamageOutsidePackage`| `IsDamageOutsidePackage`| `bit` | `DocumentFieldCatalog.cs:85`, `q02-columns.txt:344`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `damageDescription` | `DamageDescription` | `nvarchar(500)` | `DocumentFieldCatalog.cs:86`, `q02-columns.txt:345`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `damageInsideStatusId` | `DamageInsideStatusID` | `nvarchar(50)` | `DocumentFieldCatalog.cs:87`, `q02-columns.txt:346`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `damageInsideStatusName`| — (phát sinh) | — | `FeDisplayProjection.cs:105`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `locationDamageDetectedId`| `LocationDamageDetectedID`| `nvarchar(50)` | `DocumentFieldCatalog.cs:88`, `q02-columns.txt:347`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `locationDamageDetectedName`| — (phát sinh) | — | `FeDisplayProjection.cs:105`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `locationDamageDescription`| `LocationDamageDescription`| `nvarchar(500)` | `DocumentFieldCatalog.cs:89`, `q02-columns.txt:348`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `resultDesciption` | `ResultDesciption` | `nvarchar(max)` | `DocumentFieldCatalog.cs:90`, `q02-columns.txt:349`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `totalQuantityInboundResult`| `TotalQuantityInboundResult`| `decimal(18, 0)`| `DocumentFieldCatalog.cs:91`, `q02-columns.txt:350`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `goodAwaitingInboundResult`| `GoodAwaitingInboundResult`| `decimal(18, 0)`| `DocumentFieldCatalog.cs:92`, `q02-columns.txt:351`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `resultNote` | `ResultNote` | `nvarchar(500)` | `DocumentFieldCatalog.cs:93`, `q02-columns.txt:352`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `notes` | `Notes` | `nvarchar(500)` | `DocumentFieldCatalog.cs:100`, `q02-columns.txt:359` | `erp-screen` | Nhóm Kiểm tra & kết quả | Ghi chú chung | `multiline` | Ghi chú chung cho phiếu nhập kho |
| `imageURL` | `ImageURL` | `varchar(255)` | `q02-columns.txt:357`, `SqlErpScreenEffects.cs:174`, `ErpWorkflowInputs.cs:46` | `erp-screen` (khác `/api/documents: imageUrl`) | Nhóm Tài liệu | Hình ảnh đính kèm | `url` | Đường dẫn ảnh chụp hiện trạng nhập kho |
| `bBKCUrl` | `BBKCUrl` | `varchar(255)` | `q02-columns.txt:358`, `SqlErpScreenEffects.cs:174`, `ErpDraftFields.cs:34` | `erp-screen` (khác `/api/documents: bbkcUrl`) | Nhóm Tài liệu | Biên bản kiểm nghiệm | `url` | Đường dẫn file biên bản kiểm tra chất lượng (BBKC) |
| `documentId` | `DocumentID` | `varchar(50)` | `DocumentFieldCatalog.cs:66`, `q02-columns.txt:325` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị trên thanh tiêu đề dialog |
| `documentDateDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã dùng `documentDate` với `format: date` |
| `datetimeRecordedDisplay`| — (phát sinh) | — | `FeDisplayProjection.cs:124`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `branchReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu chi nhánh |
| `objectReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu đối tượng |
| `orderTypeReferenceState`| — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu loại đơn hàng |
| `currencyReferenceState`| — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu tiền tệ |
| `packageTypeReferenceState`| — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu loại bao bì |
| `damageInsideStatusReferenceState`| — (phát sinh) | — | `FeDisplayProjection.cs:106`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `damageInsideStatusForeColor`| — (phát sinh) | — | `FeDisplayProjection.cs:110`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `damageInsideStatusBackColor`| — (phát sinh) | — | `FeDisplayProjection.cs:111`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `locationDamageDetectedReferenceState`| — (phát sinh) | — | `FeDisplayProjection.cs:106`, `visible-fields.json:434-448`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `statusId` | `StatusID` | `int` | `DocumentFieldCatalog.cs:95`, `q02-columns.txt:354` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị bằng badge trạng thái ở header |
| `statusName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Ẩn (`hidden`) | — | — | Đã hiển thị bằng badge trạng thái ở header |
| `statusReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu trạng thái |
| `statusForeColor` | — (phát sinh) | — | `FeDisplayProjection.cs:110` | `erp-screen` | Ẩn (`hidden`) | — | — | Màu chữ trạng thái |
| `statusBackColor` | — (phát sinh) | — | `FeDisplayProjection.cs:111` | `erp-screen` | Ẩn (`hidden`) | — | — | Màu nền trạng thái |
| `sendTo` | `SendTo` | `nvarchar(max)` | `DocumentFieldCatalog.cs:101`, `q02-columns.txt:360`| `erp-screen` | Ẩn (`hidden`) | — | — | Danh sách người/hệ thống nhận thông báo (trường kỹ thuật audit) |
| `qrPrintType` | `QRPrintType` | `varchar(10)` | `DocumentFieldCatalog.cs:102`, `q02-columns.txt:361`, `SqlErpScreenEffects.cs:174` | `erp-screen` | Ẩn (`hidden`) | — | — | Cờ loại in QR nội bộ của máy in/kho (trường kỹ thuật audit) |
| `linkId` | `LinkID` | `varchar(50)` | `DocumentFieldCatalog.cs:103`, `q02-columns.txt:362`| `erp-screen` | Ẩn (`hidden`) | — | — | Khóa liên kết chứng từ nội bộ (không phải URL) |
| `linkName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | Ẩn (`hidden`) | — | — | Tên liên kết nội bộ |
| `linkReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn (`hidden`) | — | — | Trạng thái tham chiếu liên kết |
| `detailSaveToken` | `DetailSaveToken` | `varchar(36)` | `q02-columns.txt:363` | `erp-screen` | Ẩn (`hidden`) | — | — | Token kiểm soát đồng thời CUD của backend (trường kỹ thuật audit) |

### 4.2 Lines fields

| Khóa JSON | Cột DB | Kiểu DB | Nguồn (file:dòng) | Đường API | Vị trí | Nhãn | Format | Lý do |
|---|---|---|---|---|---|---|---|---|
| `itemId` | `ItemID` | `varchar(50)` | `DocumentFieldCatalog.cs:108`, `q02-columns.txt:301` | `erp-screen` | `columns` (bảng) | Mã hàng | `text` | Khóa mặt hàng |
| `itemName` | — (phát sinh) | — | `FeDisplayProjection.cs:105`, `ItemDisplayContextReader.cs` | `erp-screen` | `columns` (bảng) | Tên hàng | `text` | Tên hàng hóa (`role: primary`) |
| `hangSX` | `HangSX` | `nvarchar(100)` | `DocumentFieldCatalog.cs:109`, `q02-columns.txt:302`, `SqlErpScreenEffects.cs:174` | `erp-screen` | `columns` (bảng) | Hãng sản xuất | `text` | Nhà sản xuất của lô hàng |
| `lotNumberByDocument` | `LotNumberByDocument` | `nvarchar(50)` | `DocumentFieldCatalog.cs:113`, `q02-columns.txt:306` | `erp-screen` | `columns` (bảng) | Số lô theo CT | `text` | Số lô ghi trên chứng từ giao nhận |
| `expireDateByDocument` | `ExpireDateByDocument`| `datetime` | `DocumentFieldCatalog.cs:116`, `q02-columns.txt:309` | `erp-screen` | `columns` (bảng) | Hạn dùng theo CT | `date` | Hạn dùng ghi trên chứng từ |
| `lotNumberByReal` | `LotNumberByReal` | `nvarchar(50)` | `DocumentFieldCatalog.cs:117`, `q02-columns.txt:310` | `erp-screen` | `columns` (bảng) | Số lô thực tế | `text` | Số lô in trên bao bì thực tế kiểm đếm |
| `expireDateByReal` | `ExpireDateByReal` | `datetime` | `DocumentFieldCatalog.cs:120`, `q02-columns.txt:313` | `erp-screen` | `columns` (bảng) | Hạn dùng thực tế | `date` | Hạn dùng thực tế kiểm đếm trên bao bì |
| `setQuantityByDocument`| `SetQuantityByDocument`| `decimal(18, 0)`| `DocumentFieldCatalog.cs:114`, `q02-columns.txt:307` | `erp-screen` | `columns` (bảng) | Số bộ theo CT | `number` | Số bộ trên chứng từ |
| `barrelQuantityByDocument`| `BarrelQuantityByDocument`| `decimal(18, 0)`| `DocumentFieldCatalog.cs:115`, `q02-columns.txt:308` | `erp-screen` | `columns` (bảng) | Số thùng theo CT | `number` | Số thùng trên chứng từ |
| `setQuantityByReal` | `SetQuantityByReal` | `decimal(18, 0)`| `DocumentFieldCatalog.cs:118`, `q02-columns.txt:311` | `erp-screen` | `columns` (bảng) | Số bộ thực tế | `number` | Số bộ đếm thực tế |
| `barrelQuantityByReal` | `BarrelQuantityByReal` | `decimal(18, 0)`| `DocumentFieldCatalog.cs:119`, `q02-columns.txt:312` | `erp-screen` | `columns` (bảng) | Số thùng thực tế | `number` | Số thùng đếm thực tế |
| `randomTestQuantity` | `RandomTestQuantity` | `decimal(18, 0)`| `DocumentFieldCatalog.cs:124`, `q02-columns.txt:317` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Số lượng kiểm nghiệm | `number` | Số lượng mẫu kiểm tra chất lượng |
| `testStatus` | `TestStatus` | `nvarchar(100)` | `DocumentFieldCatalog.cs:125`, `q02-columns.txt:318` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Tình trạng kiểm nghiệm | `text` | Kết quả thử nghiệm/kiểm nghiệm |
| `checkerNote` | `CheckerNote` | `nvarchar(500)` | `DocumentFieldCatalog.cs:128`, `q02-columns.txt:321` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Ghi chú kiểm nghiệm | `text` | Ý kiến nhân viên kiểm tra chất lượng |
| `noPalletNote` | `NoPalletNote` | `nvarchar(500)` | `DocumentFieldCatalog.cs:126`, `q02-columns.txt:319` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Ghi chú kiện không pallet | `text` | Ghi chú đối với các kiện không đóng pallet |
| `palletNote` | `PalletNote` | `nvarchar(500)` | `DocumentFieldCatalog.cs:127`, `q02-columns.txt:320` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Ghi chú kiện có pallet | `text` | Ghi chú quy cách xếp pallet |
| `unit2` | `Unit2` | `nvarchar(50)` | `DocumentFieldCatalog.cs:111`, `q02-columns.txt:304` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Đơn vị quy đổi | `text` | Tên đơn vị thứ hai |
| `unitFactor` | `UnitFactor` | `float` | `DocumentFieldCatalog.cs:110`, `q02-columns.txt:303` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Hệ số quy đổi | `number` | Tỷ lệ quy đổi giữa hai đơn vị tính |
| `additional` | `Additional` | `bit` | `DocumentFieldCatalog.cs:112`, `q02-columns.txt:305` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Hàng phát sinh bổ sung | `boolean` | Cờ đánh dấu hàng bổ sung ngoài đơn |
| `contractId` | `ContractID` | `nvarchar(100)` | `DocumentFieldCatalog.cs:107`, `q02-columns.txt:300` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Hợp đồng liên quan | `text` | Số hợp đồng tương ứng dòng hàng |
| `unitPrice` | `UnitPrice` | `decimal(18, 0)` | `DocumentFieldCatalog.cs:122`, `q02-columns.txt:315` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Đơn giá | `money` | Đơn giá hàng nhập |
| `amount` | `Amount` | `decimal(18, 0)` | `DocumentFieldCatalog.cs:123`, `q02-columns.txt:316` | `erp-screen` | `columns` (`inTable: false`) & `expandGroups` | Thành tiền | `money` | Tổng tiền hàng nhập |
| `sourceAmount` | `SourceAmount` | `decimal(18, 0)` | `DocumentFieldCatalog.cs:121`, `q02-columns.txt:314`, `visible-fields.json:462-464`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |
| `userAutoId` | `UserAutoID` | `varchar(50)` | `DocumentFieldCatalog.cs:105`, `q02-columns.txt:298` | `erp-screen` | Ẩn dòng | — | — | Khóa tự tăng nội bộ CSDL |
| `lineId` | — (alias) | — | `CanonicalResponseProjection.cs:151` | `erp-screen` | Ẩn dòng | — | — | Khóa định danh dòng phía web |
| `documentId` | `DocumentID` | `varchar(50)` | `DocumentFieldCatalog.cs:106`, `q02-columns.txt:299` | `erp-screen` | Ẩn dòng | — | — | Khóa ngoại chứng từ cha |
| `parentId` | `ParentID` | `varchar(50)` | `DocumentFieldCatalog.cs:130`, `q02-columns.txt:323` | `erp-screen` | Ẩn dòng | — | — | Khóa phân cấp cha con nội bộ |
| `orderDetailId` | `OrderDetailID` | `varchar(50)` | `q02-columns.txt:324` | `erp-screen` | Ẩn dòng | — | — | Khóa dòng đơn đặt hàng liên kết |
| `itemCode` | `ItemCode` | `nvarchar(50)` | `DocumentFieldCatalog.cs:129`, `q02-columns.txt:322` | `erp-screen` | Dự phòng | — | — | Mã hàng dạng hiển thị |
| `itemName` | — (phát sinh) | — | `FeDisplayProjection.cs:105` | `erp-screen` | `columns` (bảng) | Tên hàng | `text` | Đã dùng trong cột hiển thị |
| `unit` | — (phát sinh) | — | `FeDisplayProjection.cs:118` | `erp-screen` | Dự phòng | — | — | Đơn vị tính chính |
| `itemReferenceState` | — (phát sinh) | — | `FeDisplayProjection.cs:106` | `erp-screen` | Ẩn dòng | — | — | Trạng thái tham chiếu mặt hàng |
| `manufacturerItemCode` | — (phát sinh) | — | `CanonicalResponseProjection.cs:186` | `erp-screen` | Dự phòng | — | — | Mã nhà sản xuất |
| `manufacturerCodeSource`| — (phát sinh) | — | `CanonicalResponseProjection.cs:186` | `erp-screen` | Ẩn dòng | — | — | Nguồn mã nhà sản xuất |
| `expireDateByDocumentDisplay`| — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn dòng | — | — | Bản format sẵn |
| `expireDateByRealDisplay`| — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn dòng | — | — | Bản format sẵn |
| `unitPriceDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn dòng | — | — | Bản format sẵn |
| `amountDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124` | `erp-screen` | Ẩn dòng | — | — | Bản format sẵn |
| `sourceAmountDisplay` | — (phát sinh) | — | `FeDisplayProjection.cs:124`, `visible-fields.json:462-464`, `ErpVisibleProjection.cs:15-35` | `erp-screen` | Backend đã cắt (không khai báo) | — | — | Không có trong payload erp-screen sau lọc; bỏ khỏi fixture/config (xem mục 5) |

---

## 5. Danh mục trường backend đã cắt (`ErpVisibleProjection` / `visible-fields.json`)

Backend áp dụng bộ lọc `ErpVisibleProjection.Apply` dựa trên cấu hình layout WinForms gốc (`SY_FrmCfg/.../HDE`):

1. **`purchase-orders` lines:**
   - Cột SQL bị cắt: `Property`, `Property2`, `ParentID`, `SourceAmount`, `Quantity2`, `Amount` (cắt theo chính sách PO lines tại `ErpVisibleFields.cs:23-25`).
   - Đã bỏ khỏi fixture: `property`, `property2`, `parentId`, `sourceAmount`, `sourceAmountDisplay`, `quantity2`, `amount`, `amountDisplay`, `itemReferenceState` (9 khóa).
   - Khóa phát sinh bị cắt: `lineName`, `lineReferenceState`, `documentReferenceState`, `itemReferenceState`, `documentName`, `parentName`, `parentReferenceState` (`ErpVisibleProjection.cs:17-18`); `sourceAmountDisplay`, `amountDisplay` bị cắt theo `ErpVisibleProjection.cs:32` và `FeDisplayProjection.cs:18-23`. Các khóa chưa từng có trong fixture vẫn bị test 10 cấm đưa vào.
   - Config bỏ cột `amount`, cột mở rộng `sourceAmount` và tham chiếu `sourceAmount` trong `expandGroups`; giữ nguyên cột/nhãn còn lại. **UNKNOWN:** chưa có khóa tổng tiền dòng PO được backend cho phép trả về để thay `amount`. Đề xuất leader xác minh hợp đồng hiển thị tổng dòng nếu nghiệp vụ cần; không tự tính tổng, không đổi backend trong T-003.
2. **`purchase-orders` header:**
   - Cột SQL bị cắt: `SearchField` (`visible-fields.json:376-388`, `ErpVisibleFields.cs:14-25`). Đã bỏ `searchField` khỏi fixture và `hidden` của config, vì backend không trả khóa này.
3. **`inbound-requests` lines:**
   - Cột SQL bị cắt: `SourceAmount` (`visible-fields.json:464`); khóa phát sinh `sourceAmountDisplay` cũng bị cắt (`ErpVisibleProjection.cs:32`). Đã bỏ cả 2 khỏi fixture; config không có tham chiếu cần bỏ.
4. **`inbound-requests` header:**
   - 14 khóa gốc bị cắt theo `visible-fields.json:434-448`: `totalPalletQuantityByReal`, `totalBarrelQuantityByReal`, `excessPackageQuantity`, `lackOfPackageQuantity`, `isDamageOutsidePackage`, `damageDescription`, `damageInsideStatusId`, `locationDamageDetectedId`, `locationDamageDescription`, `resultDesciption`, `totalQuantityInboundResult`, `goodAwaitingInboundResult`, `resultNote`, `datetimeRecorded`.
   - 7 khóa phát sinh bị cắt theo `ErpVisibleProjection.cs:23-35`: `damageInsideStatusName`, `damageInsideStatusReferenceState`, `damageInsideStatusForeColor`, `damageInsideStatusBackColor`, `locationDamageDetectedName`, `locationDamageDetectedReferenceState`, `datetimeRecordedDisplay`. Không có cột tên độc lập được chọn hiển thị để hưởng ngoại lệ giữ tên (`inventories/erp/20261010/six-screen-catalog.json#inbound-requests.fields.header`, `ErpVisibleProjection.cs:27-29`).
   - Đã bỏ toàn bộ 21 khóa trên khỏi fixture và các tham chiếu tương ứng trong `groups` / `displayKey` / `hidden`; không chuyển chúng sang `hidden` ở FE. Giữ nguyên nhóm, nhãn và các trường còn lại. Test 4 giữ kiểm tra `isRain` dạng boolean và đổi kỳ vọng `isDamageOutsidePackage` thành không được khai báo, vì khóa này đã bị backend cắt.
5. **Ngoại lệ protocol và module đề nghị mua:**
   - `ErpVisibleFields.cs:20-21` giữ các khóa điều khiển/định danh: `documentId`, `purchaseRequestId`, `batchId`, `userAutoId`, `lineId`, `branchId`, `statusId`, `isLock`, `isLocked`. Vì vậy không bỏ `statusId` của PO header hay `userAutoId` của inbound lines chỉ vì chúng có trong HDE; các khóa phái sinh từ chúng cũng không tự động bị cắt.
   - `purchase-requests` và `purchase-approvals`: không có khóa header/lines bị cắt trong metadata hiện tại (`visible-fields.json:8-29`, `visible-fields.json:520-540`); không thay đổi fixture/config hai module này.
6. **`inbound-requests` costs / discrepancies:**
   - Section phụ không nằm trong phạm vi header/lines tab chính của đợt 1.

- **Nhật ký sửa 2 (Codex), 2026-10-23:** Tiếp nhận HEAD `c50c5ef`, chỉ sửa lỗi chặn Review lần 2 trong 5 file được phép; bỏ 33 khóa fixture bị backend cắt và mọi tham chiếu config tương ứng. Thêm test 10 đối chiếu `ErpVisibleFields.IsHidden` + `ErpVisibleProjection.HiddenNames` với metadata catalog/HDE, gồm ngoại lệ protocol, các khóa phái sinh và tham chiếu mở rộng; test đã phát hiện lỗi trước khi sửa và bộ T-003 đạt 10/10 sau sửa. Test 9 chỉ bắt buộc cột DB còn được backend trả về; vẫn kiểm tra casing mọi khóa fixture có cột DB. Không kết nối DB/gọi API, không đổi backend/types/T-004, không commit/push/merge.
- **Kiểm tra lần sửa 2:** Node `v24.22.1`; `pnpm typecheck` đạt (exit 0); `pnpm lint` còn đúng baseline 3 lỗi + 1 cảnh báo (exit 1), không có lỗi trong file T-003; lệnh test T-003 đạt 10/10 (exit 0); `node scripts/test-erp.mjs --contracts-only` đạt 665/678, 13 fail (exit 1), tập tên lỗi trùng hoàn toàn `D:/Projects/Medcom/.agent-runs/baseline/contracts-failures.txt`. PowerShell chặn shim `pnpm.ps1`, nên hai lệnh pnpm được chạy qua shim `pnpm.cmd` trong `cmd.exe`, không đổi execution policy. Log cục bộ gitignored: `.agent-runs/T-003-codex-review2/{typecheck,lint,document-detail,contracts}.log`, đối chiếu lỗi: `contracts-comparison.json` cùng thư mục. Quét mẫu dữ liệu nhạy cảm theo phiếu trên `lib`, `tests/fixtures`, `docs/ui-sync`: 0 kết quả; quét kiểu/chỉ thị né kiểm tra bị cấm trong 5 file: 0 kết quả; `git diff --check` đạt. Diff phiên sửa so với HEAD chỉ có 5 file được phép; lệnh `git diff --name-only ui-sync/main...ui-sync/T-003` có 22 file ngay từ HEAD tiếp nhận (gồm thay đổi tích hợp T-002 và phiếu công việc), nên tiêu chí 5 file của phép so nhánh chưa đạt do lịch sử nhánh có sẵn; không sửa hay viết lại lịch sử để thu hẹp diff.

---

## 6. Đề xuất về `types.ts`

- **Đánh giá:** Không cần sửa `apps/medcom-sites/lib/erp/document-detail/types.ts`.
- **Lý do:** Các interface hiện có (`DocumentDetailConfig`, `DetailGroupConfig`, `DetailFieldConfig`, `LineColumnConfig`, `FieldFormat`) đã cung cấp đầy đủ các thuộc tính cần thiết: `displayKey`, `secondaryKey`, `format` (`date`, `datetime`, `number`, `money`, `boolean`, `url`, `status`), `span: "full"`, `emptyStrip`, `expandGroups`, `role`, `inTable: false`, `width: "half" | "full"`.
- Không phát sinh yêu cầu đổi kiểu hoặc bổ sung slot mới trong phạm vi T-003.
