# Parity chi tiết generic — T-006C

Ngày đối chiếu tĩnh: 2026-10-23. Phạm vi: 16 module generic của MedcomApp; Bán hàng chỉ thêm rowNoun. Đây là parity trình bày và kiểm thử bằng dữ liệu tổng hợp, không phải nghiệm thu runtime ERP/DB.

## Nguồn đối chiếu và giới hạn

- Bản cũ chính xác: commit `536701c1d8c3b747b91c1b9ea1ce3a5271086381`, object `apps/medcom-sites/components/erp/erp-document-detail-body.tsx`. Đã đọc bằng `git show 536701c:apps/medcom-sites/components/erp/erp-document-detail-body.tsx`. Các khối “Chi tiết thuộc tính Header”, “Lines Table”, “QR Comparison Table” và “Extra Sections” là tập thông tin cũ được đối chiếu.
- Quy tắc tiền gốc: cùng commit, `lib/erp/document-detail/controllers/erp-detail-rules.ts#sumLineTotals,lineTotalDisplay,docCurrencyId`. Test mới bundle trực tiếp object Git này rồi so sánh kết quả, không sửa Body/controllers.
- Khóa response sau decode FE: `apps/medcom-sites/tests/fixtures/document-detail-header-keys.json` (4 module mua/nhập) và `document-detail-header-keys-ops.json` (12 module Điều chuyển/Máy/QR). Mọi khóa dùng trong bản vá đã có nguồn trong hai fixture; không cần thêm khóa.
- Nguồn tên/mã hàng: `src/backend/Medcom.Api/FeDisplayProjection.cs#Apply` (itemCode/unit), `CanonicalResponseProjection.cs#Walk` (manufacturerItemCode/manufacturerCodeSource từ context), `apps/medcom-sites/lib/erp/item-display.ts#itemDisplayFor,itemDisplayValue` (giá trị chưa có thông tin không trở thành mã hàng giả). Body cũ ưu tiên itemCode → itemId → assetId. Bản vá giữ itemCode trước; khi rỗng mới dùng manufacturerItemCode nếu fixture cho phép, cuối cùng itemId. Không coi manufacturerCodeSource là mã hàng. Điều chuyển/QR không thêm alias manufacturer chưa có nguồn; Máy dùng assetId.
- Catalog, SQL casing, visibility và ngoại lệ: `inventories/erp/20261010/six-screen-catalog.json#screens[id]`, `inventories/erp/20261011/cud-workflow-catalog.json#screens[id]`, `inventories/erp/20261019/visible-fields.json#screens[module].sections[section]`, `src/backend/Medcom.Api/ErpVisibleFields.cs` và `ErpVisibleProjection.cs`. Giải thích từng khóa ở [FIELD_EVIDENCE_PURCHASE_INBOUND.md](FIELD_EVIDENCE_PURCHASE_INBOUND.md) và [FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md](FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md), gồm các bảng trường bị backend cắt theo module/section.
- Baseline Library được nhận diện theo [SOURCE_BASELINE.md](../SOURCE_BASELINE.md): `ERP_Medcom2026(4).zip` và `Medcom-Data (3)(1).zip`. UNKNOWN: truy cập/rehash archive gốc không được kiểm chứng trong phiên này; chỉ dùng metadata đã lưu và object Git cho phiếu UI. [WINFORMS_SOURCE_GUIDE_EVIDENCE.md](../erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md) là nguồn bổ sung về snapshot cũ, không chứng minh runtime. Không mở DB, không gọi API ERP, không dùng dòng chứng từ thật.

## Quy tắc parity

- Header: các khóa “phải hiện” bên dưới nằm ở group, hoặc tên tham chiếu kèm mã phụ. Mã chứng từ do heading hiện; trạng thái/khóa do badge của model hiện. Tên object/purpose được ưu tiên đúng điều kiện Body cũ; mã contract/object/chứng từ liên kết được giữ ở dòng phụ khi có tên; mã loại kỹ thuật (branch, currency, moveType, serviceType, orderType, packageType, paymentType, paymentTerm) chỉ hiện khi ERP không trả tên (UX-09: người dùng đọc nhầm mã như `WAREHOUSE_IN` là nội dung). Trường rỗng vẫn ẩn như chế độ xem cũ. URL được giữ qua href của “Mở tài liệu”.
- Dòng: mọi khóa ở hàng “Dòng” phải có ở bảng/thẻ hoặc phần “Xem đầy đủ thông tin” trên cả desktop và mobile. Model/budget/timeRequired vẫn có cho cả đề nghị và duyệt mua; Body cũ chỉ thêm cột riêng khi module là purchase-requests. Không mất khả năng xem ở duyệt mua.
- Section: bản cũ hiện row.lineId và mọi giá trị rData không kỹ thuật. Bổ sung mã dòng, tên đề nghị, mã người đề nghị dòng, thông tin mặt hàng trong assets/details còn thiếu. Các alias documentId, documentName, lineName chỉ định danh lại chứng từ cha/dòng; coi là transport kỹ thuật trùng heading/mã dòng. Display companions dùng formatter của khóa gốc; ReferenceState/token/màu không hiện. Không bỏ trường nghiệp vụ section chỉ vì đã có ở bảng chính.
- Footer giữ `amount ?? sourceAmount`, sau đó `quantity × unitPrice` và `sumMoney`. Chỉ khai báo nguồn còn trong fixture. Không có dòng hoặc không có số hợp lệ thì không hiện; có một phần hợp lệ thì cộng phần đó như cũ. Tổng chỉ tính các dòng đã tải, kể cả khi còn hasMore. Server 0 vẫn ưu tiên; server rỗng/sai không tự thay bằng phép nhân. Không đi qua Number.
- Tổng từng dòng khác footer: Body cũ ưu tiên totalPrice → amount → sourceAmount, rồi totalPriceDisplay/amountDisplay, rồi quantity × unitPrice. PR giữ totalPrice/display và thêm fallback nhân. PO có cột Tổng giá tính từ quantity/unitPrice; không đọc amount/sourceAmount bị backend cắt. Nhập kho dùng amount/display; không nhân setQuantityByDocument thay quantity. Máy sửa chữa dùng amount. Không lấy totalPrice của PR để thay cách tính footer cũ.
- Comparison QR giữ adapter `controllers/erp-detail-model.ts#editableDetailConfig.comparison`: itemId (fallback itemCode), lot, expireDate, storeHouseId, quantity. Không tạo sections.comparison, không cộng tiền comparison. Hành vi editor/lookup/action/phân trang và Body/controllers không đổi.

## Bảng parity rút gọn (đủ 16 module)

| Module | Header | Dòng / mã hàng | Section | Tổng footer |
|---|---|---|---|---|
| `purchase-requests` | 11 trường/group | 10 cột + mở rộng | — | Σ(quantity × unitPrice); currencyId |
| `purchase-approvals` | 11 trường/group | 10 cột + mở rộng | — | Σ(quantity × unitPrice); currencyId |
| `purchase-orders` | 10 trường/group | 7 cột + tổng tính + mở rộng | — | Σ(quantity × unitPrice); currencyId |
| `inbound-requests` | 19 trường/group | 24 cột + mở rộng | — | Σ(amount); currencyId |
| `internal-transfer-requests` | 6 trường/group | 11 cột + mở rộng | — | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `internal-transfer-pm` | 10 trường/group | 13 cột + mở rộng | — | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `internal-transfer-batches` | 17 trường/group | 6 cột + mở rộng | details, assets | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `internal-transfer-tech` | 11 trường/group | 12 cột + mở rộng | requests, assets | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `internal-transfer-sa` | 11 trường/group | 12 cột + mở rộng | requests, assets | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `internal-transfer-accounting` | 10 trường/group | 13 cột + mở rộng | requests, assets | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `internal-transfer-warehouse-out` | 12 trường/group | 13 cột + mở rộng | requests, assets | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `internal-transfer-warehouse-in` | 12 trường/group | 15 cột + mở rộng | requests, assets | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `machine-movements` | 12 trường/group | 22 cột + mở rộng | — | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `machine-repairs` | 16 trường/group | 14 cột + mở rộng | — | Σ(amount); không có currencyId |
| `warehouse-qr` | 11 trường/group | 8 cột + mở rộng | — | Không hiện: hàm cũ trả null với các khóa response hiện tại |
| `sales-qr` | 25 trường/group | 8 cột + mở rộng | — | Không hiện: hàm cũ trả null với các khóa response hiện tại |

## Danh mục phải hiện và ngoại lệ theo module

Test `tests/document-detail-parity.test.mjs` đọc các hàng Header/Dòng/Section dưới đây làm manifest hữu hạn: render giá trị tổng hợp từ fixture, mở phần mở rộng và từng tab section, kiểm tra riêng bảng desktop và thẻ mobile. Đây là danh mục cố định để review, không tái sinh trong test từ config đang chạy.

### `purchase-requests`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `purchaseDate`, `branchName`, `personSuggest`, `department`, `purposeName`, `purposeDescOrClient`, `objectName`, `currencyName`, `rateExchange`, `price`, `notes` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `quantity`, `unitPrice`, `totalPrice`, `model`, `timeRequired`, `budget` |
| Tổng | Σ(quantity × unitPrice); currencyId. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `purchaseRequestId`, `purchaseDateDisplay`, `branchReferenceState`, `purposeReferenceState`, `objectReferenceState`, `currencyReferenceState`, `priceDisplay`, `statusId`, `statusName`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `isLocked`, `isLock`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_PURCHASE_INBOUND.md, mục purchase-requests. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount trong response PR; footer dùng phép nhân cũ, không dùng totalPrice. Các HDE còn lại và alias đi kèm: visible-fields.json#purchase-requests, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `purchase-approvals`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `purchaseDate`, `branchName`, `personSuggest`, `department`, `purposeName`, `purposeDescOrClient`, `objectName`, `currencyName`, `rateExchange`, `price`, `notes` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `quantity`, `unitPrice`, `totalPrice`, `model`, `timeRequired`, `budget` |
| Tổng | Σ(quantity × unitPrice); currencyId. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `purchaseRequestId`, `purchaseDateDisplay`, `branchReferenceState`, `purposeReferenceState`, `objectReferenceState`, `currencyReferenceState`, `priceDisplay`, `statusId`, `statusName`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `isLocked`, `isLock`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_PURCHASE_INBOUND.md, mục purchase-approvals. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount trong response PR; footer dùng phép nhân cũ, không dùng totalPrice. Các HDE còn lại và alias đi kèm: visible-fields.json#purchase-approvals, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `purchase-orders`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `deliverDate`, `branchName`, `contractName`, `contractId`, `objectName`, `currencyName`, `rateExchange`, `baseTotal`, `memo`, `notes` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `quantity`, `unitPrice`, `notes` |
| Tổng | Σ(quantity × unitPrice); currencyId. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `documentDateDisplay`, `deliverDateDisplay`, `branchReferenceState`, `contractReferenceState`, `objectReferenceState`, `currencyReferenceState`, `baseTotalDisplay`, `linkId`, `linkName`, `linkReferenceState`, `isLocked`, `isLock`, `statusId`, `statusName`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `userCreate`, `userUpdate`, `dateCreate`, `dateCreateDisplay`, `dateUpdate`, `dateUpdateDisplay`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_PURCHASE_INBOUND.md, mục purchase-orders. |
| Không có nguồn / backend cắt | Backend cắt amount/sourceAmount, amountDisplay/sourceAmountDisplay, property/property2/parentId/quantity2 và alias tham chiếu đi kèm; cột và footer chỉ nhân quantity/unitPrice. Các HDE còn lại và alias đi kèm: visible-fields.json#purchase-orders, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `inbound-requests`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `orderNumber`, `invoiceNo`, `declarationNumber`, `branchName`, `objectName`, `orderTypeName`, `currencyName`, `rateExchange`, `departurePoint`, `destinationPoint`, `isRain`, `totalPalletQuantityByDocument`, `totalBarrelQuantityByDocument`, `damagedPackageQuantity`, `packageTypeName`, `notes`, `imageURL`, `bBKCUrl` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `hangSX`, `lotNumberByDocument`, `expireDateByDocument`, `lotNumberByReal`, `expireDateByReal`, `setQuantityByDocument`, `barrelQuantityByDocument`, `setQuantityByReal`, `barrelQuantityByReal`, `randomTestQuantity`, `testStatus`, `checkerNote`, `noPalletNote`, `palletNote`, `unit2`, `unitFactor`, `additional`, `contractId`, `unitPrice`, `amount` |
| Tổng | Σ(amount); currencyId. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `documentDateDisplay`, `branchReferenceState`, `objectReferenceState`, `orderTypeReferenceState`, `currencyReferenceState`, `packageTypeReferenceState`, `statusId`, `statusName`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `sendTo`, `qrPrintType`, `linkId`, `linkName`, `linkReferenceState`, `detailSaveToken`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_PURCHASE_INBOUND.md, mục inbound-requests. |
| Không có nguồn / backend cắt | sourceAmount bị backend cắt, quantity không có trong response; footer chỉ dùng amount, không thay bằng số bộ. Các HDE còn lại và alias đi kèm: visible-fields.json#inbound-requests, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `inbound-costs`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `orderNumber`, `invoiceNo`, `declarationNumber`, `branchName`, `objectName`, `orderTypeName`, `currencyName`, `rateExchange`, `departurePoint`, `destinationPoint`, `isRain`, `totalPalletQuantityByDocument`, `totalBarrelQuantityByDocument`, `damagedPackageQuantity`, `packageTypeName`, `notes`, `imageURL`, `bBKCUrl` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `hangSX`, `lotNumberByDocument`, `expireDateByDocument`, `lotNumberByReal`, `expireDateByReal`, `setQuantityByDocument`, `barrelQuantityByDocument`, `setQuantityByReal`, `barrelQuantityByReal`, `randomTestQuantity`, `testStatus`, `checkerNote`, `noPalletNote`, `palletNote`, `unit2`, `unitFactor`, `additional`, `contractId`, `unitPrice`, `amount` |
| Tổng | Σ(amount); currencyId. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `documentDateDisplay`, `branchReferenceState`, `objectReferenceState`, `orderTypeReferenceState`, `currencyReferenceState`, `packageTypeReferenceState`, `statusId`, `statusName`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `sendTo`, `qrPrintType`, `linkId`, `linkName`, `linkReferenceState`, `detailSaveToken`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_PURCHASE_INBOUND.md, mục inbound-requests. |
| Không có nguồn / backend cắt | sourceAmount bị backend cắt, quantity không có trong response; footer chỉ dùng amount, không thay bằng số bộ. Các HDE còn lại và alias đi kèm: visible-fields.json#inbound-requests, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `inbound-warehouse`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `orderNumber`, `invoiceNo`, `objectName`, `orderTypeName`, `packageTypeName`, `departurePoint`, `destinationPoint`, `isRain`, `totalPalletQuantityByDocument`, `totalBarrelQuantityByDocument`, `totalPalletQuantityByReal`, `totalBarrelQuantityByReal`, `excessPackageQuantity`, `lackOfPackageQuantity`, `damagedPackageQuantity`, `isDamageOutsidePackage`, `damageInsideStatusName`, `damageDescription`, `locationDamageDetectedName`, `locationDamageDescription`, `imageURL`, `resultDesciption`, `totalQuantityInboundResult`, `goodAwaitingInboundResult`, `resultNote`, `datetimeRecorded`, `notes` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `hangSX`, `lotNumberByDocument`, `expireDateByDocument`, `setQuantityByDocument`, `barrelQuantityByDocument`, `lotNumberByReal`, `expireDateByReal`, `setQuantityByReal`, `barrelQuantityByReal`, `randomTestQuantity`, `testStatus`, `checkerNote`, `noPalletNote`, `palletNote`, `additional` |
| Header ẩn / đã có chỗ khác | Như `inbound-requests`, thêm `currencyId`, `rateExchange`, `declarationNumber`, `bBKCUrl`, `branchId`: form Thủ kho (IV_IncomingShipmentStatusFrm LYT1) không bày các trường này. |
| Không có nguồn / backend cắt | Đơn giá/thành tiền: form Thủ kho ẩn (T1 HDE Amount;UnitPrice;SourceAmount). |

### `inbound-sa`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `orderNumber`, `invoiceNo`, `objectName`, `orderTypeName`, `packageTypeName`, `departurePoint`, `destinationPoint`, `isRain`, `totalPalletQuantityByDocument`, `totalBarrelQuantityByDocument`, `totalPalletQuantityByReal`, `totalBarrelQuantityByReal`, `excessPackageQuantity`, `lackOfPackageQuantity`, `damagedPackageQuantity`, `isDamageOutsidePackage`, `damageInsideStatusName`, `damageDescription`, `locationDamageDetectedName`, `locationDamageDescription`, `imageURL`, `resultDesciption`, `totalQuantityInboundResult`, `goodAwaitingInboundResult`, `resultNote`, `datetimeRecorded`, `notes` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `hangSX`, `lotNumberByDocument`, `expireDateByDocument`, `setQuantityByDocument`, `barrelQuantityByDocument`, `lotNumberByReal`, `expireDateByReal`, `setQuantityByReal`, `barrelQuantityByReal`, `randomTestQuantity`, `testStatus`, `checkerNote`, `noPalletNote`, `palletNote`, `additional` |
| Header ẩn / đã có chỗ khác | Như `inbound-requests`, thêm `currencyId`, `rateExchange`, `declarationNumber`, `bBKCUrl`, `branchId`: form TP SA (IV_GoodsInfoControlFrm LYT1) không bày các trường này. |
| Không có nguồn / backend cắt | Đơn giá/thành tiền: form TP ẩn (T1 HDE Amount;UnitPrice;SourceAmount). |

### `inbound-tech`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `orderNumber`, `invoiceNo`, `objectName`, `orderTypeName`, `packageTypeName`, `departurePoint`, `destinationPoint`, `isRain`, `totalPalletQuantityByDocument`, `totalBarrelQuantityByDocument`, `totalPalletQuantityByReal`, `totalBarrelQuantityByReal`, `excessPackageQuantity`, `lackOfPackageQuantity`, `damagedPackageQuantity`, `isDamageOutsidePackage`, `damageInsideStatusName`, `damageDescription`, `locationDamageDetectedName`, `locationDamageDescription`, `imageURL`, `bBKCUrl`, `resultDesciption`, `totalQuantityInboundResult`, `goodAwaitingInboundResult`, `resultNote`, `datetimeRecorded`, `notes` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `hangSX`, `lotNumberByDocument`, `expireDateByDocument`, `setQuantityByDocument`, `barrelQuantityByDocument`, `lotNumberByReal`, `expireDateByReal`, `setQuantityByReal`, `barrelQuantityByReal`, `randomTestQuantity`, `testStatus`, `checkerNote`, `noPalletNote`, `palletNote`, `additional` |
| Header ẩn / đã có chỗ khác | Như `inbound-requests`, thêm `currencyId`, `rateExchange`, `declarationNumber`, `branchId`: form Kỹ thuật (IV_GoodsStatusConfirmFrm LYT1) không bày các trường này. |
| Không có nguồn / backend cắt | Đơn giá/thành tiền: form Kỹ ẩn (T1 HDE Amount;UnitPrice;SourceAmount). |

### `inbound-pm`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `orderNumber`, `invoiceNo`, `objectName`, `orderTypeName`, `packageTypeName`, `departurePoint`, `destinationPoint`, `isRain`, `totalPalletQuantityByDocument`, `totalBarrelQuantityByDocument`, `totalPalletQuantityByReal`, `totalBarrelQuantityByReal`, `excessPackageQuantity`, `lackOfPackageQuantity`, `damagedPackageQuantity`, `isDamageOutsidePackage`, `damageInsideStatusName`, `damageDescription`, `locationDamageDetectedName`, `locationDamageDescription`, `imageURL`, `resultDesciption`, `totalQuantityInboundResult`, `goodAwaitingInboundResult`, `resultNote`, `datetimeRecorded`, `notes` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `hangSX`, `lotNumberByDocument`, `expireDateByDocument`, `setQuantityByDocument`, `barrelQuantityByDocument`, `lotNumberByReal`, `expireDateByReal`, `setQuantityByReal`, `barrelQuantityByReal`, `randomTestQuantity`, `testStatus`, `checkerNote`, `noPalletNote`, `palletNote`, `additional` |
| Header ẩn / đã có chỗ khác | Như `inbound-requests`, thêm `currencyId`, `rateExchange`, `declarationNumber`, `bBKCUrl`, `branchId`: form PM (IV_GoodsQualityControlConfirmFrm LYT1) không bày các trường này. |
| Không có nguồn / backend cắt | Đơn giá/thành tiền: form PM ẩn (T1 HDE Amount;UnitPrice;SourceAmount). |

### `inbound-bld`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `orderNumber`, `invoiceNo`, `objectName`, `orderTypeName`, `packageTypeName`, `departurePoint`, `destinationPoint`, `isRain`, `totalPalletQuantityByDocument`, `totalBarrelQuantityByDocument`, `totalPalletQuantityByReal`, `totalBarrelQuantityByReal`, `excessPackageQuantity`, `lackOfPackageQuantity`, `damagedPackageQuantity`, `isDamageOutsidePackage`, `damageInsideStatusName`, `damageDescription`, `locationDamageDetectedName`, `locationDamageDescription`, `imageURL`, `resultDesciption`, `totalQuantityInboundResult`, `goodAwaitingInboundResult`, `resultNote`, `datetimeRecorded`, `notes` |
| Dòng | `itemId`, `itemCode`, `itemName`, `unit`, `hangSX`, `lotNumberByDocument`, `expireDateByDocument`, `setQuantityByDocument`, `barrelQuantityByDocument`, `lotNumberByReal`, `expireDateByReal`, `setQuantityByReal`, `barrelQuantityByReal`, `randomTestQuantity`, `testStatus`, `checkerNote`, `noPalletNote`, `palletNote`, `additional` |
| Header ẩn / đã có chỗ khác | Như `inbound-requests`, thêm `currencyId`, `rateExchange`, `declarationNumber`, `bBKCUrl`, `branchId`: form BLĐ (IV_CargoHandlingPlanApprovalFrm LYT1) không bày các trường này. |
| Không có nguồn / backend cắt | Đơn giá/thành tiền: form TP ẩn (T1 HDE Amount;UnitPrice;SourceAmount). |

### `internal-transfer-requests`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `requestedTransferDate`, `salesUser`, `transferReason`, `transportMethod`, `notes` |
| Dòng | `itemCode`, `itemName`, `unit`, `requestedQty`, `requestedLot`, `isEquipment`, `itemId`, `requestedAssetId`, `requestedAssetName`, `territoryNote`, `notes` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `branchId`, `statusId`, `isLocked`, `userCreate`, `userUpdate`, `dateCreate`, `dateUpdate`, `documentDateDisplay`, `requestedTransferDateDisplay`, `statusName`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `dateCreateDisplay`, `dateUpdateDisplay`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục internal-transfer-requests. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#internal-transfer-requests, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `internal-transfer-pm`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `requestedTransferDate`, `salesName`, `salesUser`, `pMName`, `fromBranchName`, `toBranchName`, `batchName`, `batchId`, `transferReason`, `transportMethod`, `notes` |
| Dòng | `itemCode`, `itemName`, `unit`, `requestedQty`, `pMApprovedQty`, `requestedLot`, `isEquipment`, `itemId`, `requestedAssetId`, `requestedAssetName`, `territoryNote`, `pMNote`, `notes` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `branchId`, `statusId`, `isLocked`, `statusCode`, `statusName`, `documentDateDisplay`, `requestedTransferDateDisplay`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `batchReferenceState`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục internal-transfer-pm. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#internal-transfer-pm, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `internal-transfer-batches`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `batchDate`, `plannedTransferDate`, `fromBranchName`, `toBranchName`, `fromStoreHouseName`, `toStoreHouseName`, `hasEquipment`, `requestCount`, `lineCount`, `pMName`, `technicianName`, `sAName`, `transportMethod`, `carrierName`, `carrierPhone`, `vehicleNo`, `notes` |
| Dòng | `requestId`, `documentDate`, `requestedTransferDate`, `salesName`, `requestStatusName`, `notes` |
| Section details | `lineId`, `itemCode`, `itemName`, `unit`, `requestId`, `requestName`, `approvedQty`, `requestedQty`, `requestedLot`, `isEquipment`, `salesName`, `notes`, `itemId`, `salesUser` |
| Section assets | `lineId`, `assetId`, `assetName`, `itemId`, `itemCode`, `itemName`, `unit`, `serialNo` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `statusId`, `isLocked`, `statusCode`, `statusName`, `batchDateDisplay`, `plannedTransferDateDisplay`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `documentId`, `branchId`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục internal-transfer-batches. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#internal-transfer-batches, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `internal-transfer-tech`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `batchDate`, `plannedTransferDate`, `fromBranchName`, `toBranchName`, `fromStoreHouseName`, `toStoreHouseName`, `pMName`, `technicianName`, `sAName`, `transportMethod`, `notes` |
| Dòng | `itemCode`, `itemName`, `unit`, `requestId`, `approvedQty`, `requestedLot`, `isEquipment`, `techStatus`, `techNotes`, `bBKCUrl`, `salesName`, `notes` |
| Section requests | `lineId`, `requestId`, `requestName`, `documentDate`, `requestedTransferDate`, `salesName`, `requestStatusName`, `notes` |
| Section assets | `lineId`, `assetId`, `assetName`, `itemId`, `itemCode`, `itemName`, `unit`, `serialNo`, `assetCondition`, `techStatus`, `bBKCUrl`, `techNotes`, `technician`, `checkedAt` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `statusId`, `isLocked`, `statusCode`, `statusName`, `batchDateDisplay`, `plannedTransferDateDisplay`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `documentId`, `branchId`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục internal-transfer-tech. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#internal-transfer-tech, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `internal-transfer-sa`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `batchDate`, `plannedTransferDate`, `fromBranchName`, `toBranchName`, `fromStoreHouseName`, `toStoreHouseName`, `pMName`, `technicianName`, `sAName`, `transportMethod`, `notes` |
| Dòng | `itemCode`, `itemName`, `unit`, `requestId`, `approvedQty`, `requestedLot`, `isEquipment`, `techStatus`, `techNotes`, `bBKCUrl`, `salesName`, `notes` |
| Section requests | `lineId`, `requestId`, `requestName`, `documentDate`, `requestedTransferDate`, `salesName`, `requestStatusName`, `notes` |
| Section assets | `lineId`, `assetId`, `assetName`, `itemId`, `itemCode`, `itemName`, `unit`, `serialNo`, `assetCondition`, `techStatus`, `bBKCUrl`, `techNotes`, `technician`, `checkedAt` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `statusId`, `isLocked`, `statusCode`, `statusName`, `batchDateDisplay`, `plannedTransferDateDisplay`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `documentId`, `branchId`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục internal-transfer-sa. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#internal-transfer-sa, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `internal-transfer-accounting`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `batchDate`, `plannedTransferDate`, `fromBranchName`, `toBranchName`, `fromStoreHouseName`, `toStoreHouseName`, `pMName`, `sAName`, `outputDocumentName`, `outputDocumentId`, `notes` |
| Dòng | `itemCode`, `itemName`, `unit`, `requestId`, `approvedQty`, `requestedLot`, `lot`, `expireDate`, `isEquipment`, `techStatus`, `accountingNote`, `salesName`, `notes` |
| Section requests | `lineId`, `requestId`, `requestName`, `documentDate`, `requestedTransferDate`, `salesName`, `requestStatusName`, `notes` |
| Section assets | `lineId`, `assetId`, `assetName`, `itemId`, `itemCode`, `itemName`, `unit`, `serialNo` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `statusId`, `isLocked`, `statusCode`, `statusName`, `batchDateDisplay`, `plannedTransferDateDisplay`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `outputDocumentReferenceState`, `documentId`, `branchId`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục internal-transfer-accounting. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#internal-transfer-accounting, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `internal-transfer-warehouse-out`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `batchDate`, `plannedTransferDate`, `fromBranchName`, `toBranchName`, `fromStoreHouseName`, `toStoreHouseName`, `transportMethod`, `carrierName`, `carrierPhone`, `vehicleNo`, `outputDocumentName`, `outputDocumentId`, `notes` |
| Dòng | `itemCode`, `itemName`, `unit`, `requestId`, `approvedQty`, `lot`, `expireDate`, `actualIssueQty`, `isEquipment`, `warehouseNote`, `salesName`, `qtyNotIssued`, `notes` |
| Section requests | `lineId`, `requestId`, `requestName`, `documentDate`, `requestedTransferDate`, `salesName`, `notes` |
| Section assets | `lineId`, `assetId`, `assetName`, `itemId`, `itemCode`, `itemName`, `unit`, `serialNo`, `isDispatched` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `statusId`, `isLocked`, `statusCode`, `statusName`, `batchDateDisplay`, `plannedTransferDateDisplay`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `outputDocumentReferenceState`, `documentId`, `branchId`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục internal-transfer-warehouse-out. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#internal-transfer-warehouse-out, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `internal-transfer-warehouse-in`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `batchDate`, `plannedTransferDate`, `fromBranchName`, `toBranchName`, `fromStoreHouseName`, `toStoreHouseName`, `transportMethod`, `carrierName`, `vehicleNo`, `outputDocumentName`, `outputDocumentId`, `inputDocumentName`, `inputDocumentId`, `notes` |
| Dòng | `itemCode`, `itemName`, `unit`, `requestId`, `approvedQty`, `lot`, `expireDate`, `actualIssueQty`, `actualReceiveQty`, `isEquipment`, `warehouseNote`, `receiveNote`, `salesName`, `qtyInTransit`, `notes` |
| Section requests | `lineId`, `requestId`, `requestName`, `documentDate`, `requestedTransferDate`, `salesName`, `notes` |
| Section assets | `lineId`, `assetId`, `assetName`, `itemId`, `itemCode`, `itemName`, `unit`, `serialNo`, `isDispatched`, `isReceived` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `statusId`, `isLocked`, `statusCode`, `statusName`, `batchDateDisplay`, `plannedTransferDateDisplay`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `outputDocumentReferenceState`, `inputDocumentReferenceState`, `documentId`, `branchId`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục internal-transfer-warehouse-in. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#internal-transfer-warehouse-in, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `machine-movements`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `moveTypeName`, `nguoiGiao`, `nguoiNhan`, `contractName`, `contractId`, `effectiveFrom`, `effectiveTo`, `referenceNo`, `referenceDate`, `documentLink`, `memo`, `notes` |
| Dòng | `assetId`, `assetName`, `quantity`, `fromObjectName`, `objectName`, `fromStoreHouseName`, `toStoreHouseName`, `handoverDate`, `departmentName`, `costCenterName`, `costName`, `fromLocation`, `toLocation`, `handoverComponents`, `assetCondition`, `lifecycleStatusAfter`, `toLocationName`, `toQuanHuyen`, `toXaPhuong`, `toChuyenKhoa`, `toZoneName`, `notes` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `isLocked`, `userCreate`, `userUpdate`, `dateUpdate`, `dateCreate`, `documentDateDisplay`, `dateUpdateDisplay`, `dateCreateDisplay`, `moveTypeReferenceState`, `contractReferenceState`, `effectiveFromDisplay`, `effectiveToDisplay`, `referenceDateDisplay`, `branchId`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục machine-movements. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#machine-movements, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `machine-repairs`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `serviceTypeName`, `objectName`, `objectId`, `serviceLocation`, `nguoiGiao`, `nguoiNhan`, `contractName`, `contractId`, `startDate`, `endDate`, `technician`, `serviceStatus`, `referenceNo`, `referenceDate`, `documentLink`, `memo`, `notes` |
| Dòng | `assetId`, `assetName`, `noiDung`, `quantity`, `amount`, `resultStatus`, `warrantyCovered`, `nextServiceDate`, `problemDescription`, `actionTaken`, `laborAmount`, `partsAmount`, `internalAlert`, `notes` |
| Tổng | Σ(amount); không có currencyId. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `isLocked`, `userCreate`, `userUpdate`, `dateUpdate`, `dateCreate`, `documentDateDisplay`, `dateUpdateDisplay`, `dateCreateDisplay`, `serviceTypeReferenceState`, `objectReferenceState`, `contractReferenceState`, `startDateDisplay`, `endDateDisplay`, `referenceDateDisplay`, `branchId`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục machine-repairs. |
| Không có nguồn / backend cắt | Không có unitPrice/currencyId; dùng amount, không suy ra loại tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#machine-repairs, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `warehouse-qr`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `objectName`, `objectId`, `outputType`, `baseTotal`, `nguoiGiao`, `nguoiNhan`, `isScanQrCode`, `isPacket`, `internalTransferBatchName`, `internalTransferBatchId`, `memo`, `notes` |
| Dòng | `qrCode`, `itemCode`, `itemName`, `unit`, `lot`, `quantity`, `quyCach`, `qrPackageId` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `isLocked`, `searchField`, `userCreate`, `userUpdate`, `dateUpdate`, `dateCreate`, `status`, `calPrice`, `calCost`, `linkId`, `docBatch`, `productOrderId`, `branchId`, `documentDateDisplay`, `objectReferenceState`, `dateUpdateDisplay`, `dateCreateDisplay`, `linkName`, `linkReferenceState`, `baseTotalDisplay`, `productOrderName`, `productOrderReferenceState`, `internalTransferBatchReferenceState`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục warehouse-qr. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#warehouse-qr, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

### `sales-qr`

| Phạm vi | Phải hiện / lý do không hiện |
|---|---|
| Header | `documentDate`, `invoiceNo`, `objectName`, `objectId`, `contractName`, `contractId`, `pONo`, `noiDungHoaDon`, `currencyName`, `rateExchange`, `paymentTypeName`, `paymentTermName`, `dueDate`, `debtDueDate`, `baseTotal`, `amountTotal`, `vATAmountTotal`, `discountTotal`, `receiver`, `hinhThucGiaoHang`, `ngayGiaoLai`, `maVanDon`, `phiVanChuyen`, `phiKhacTotal`, `isScanQrCode`, `memo`, `notes` |
| Dòng | `qrCode`, `itemCode`, `itemName`, `unit`, `lot`, `quantity`, `quyCach`, `qrPackageId` |
| Tổng | Không hiện: hàm cũ trả null với các khóa response hiện tại. Chỉ hiện khi hàm tính tổng trả khác null. |
| Header ẩn / đã có chỗ khác | `documentId`, `employeeId`, `managerId`, `refDoc`, `revAccId`, `vATAccId`, `isLocked`, `searchField`, `userCreate`, `userUpdate`, `dateUpdate`, `dateCreate`, `status`, `linkId`, `vATAccId2`, `impExpId`, `isExport`, `costCenterId`, `costId`, `vATAccExId`, `docBatch`, `couponAmount`, `lanIn`, `locationId`, `attach`, `attachDate`, `nguoiMuaHangHD`, `tenKhachLe`, `mSTKhachLe`, `branchId`, `statusId`, `isLocal`, `invoiceKey`, `refInvoiceKey`, `objectNameHD`, `addressHD`, `taxCodeHD`, `uId`, `ghiChuHoaDon`, `thuHo`, `agencyId`, `ceoId`, `thamGiaHopDongBan`, `cTKM`, `soTienKM`, `maHopDong`, `documentDateDisplay`, `objectReferenceState`, `employeeName`, `employeeReferenceState`, `managerName`, `managerReferenceState`, `currencyReferenceState`, `paymentTypeReferenceState`, `paymentTermReferenceState`, `dueDateDisplay`, `debtDueDateDisplay`, `contractReferenceState`, `baseTotalDisplay`, `revAccName`, `revAccReferenceState`, `vATAccName`, `vATAccReferenceState`, `dateUpdateDisplay`, `dateCreateDisplay`, `linkName`, `linkReferenceState`, `amountTotalDisplay`, `vATAmountTotalDisplay`, `impExpName`, `impExpReferenceState`, `costCenterName`, `costCenterReferenceState`, `costName`, `costReferenceState`, `vATAccExName`, `vATAccExReferenceState`, `couponAmountDisplay`, `locationName`, `locationReferenceState`, `attachDateDisplay`, `statusName`, `statusReferenceState`, `statusForeColor`, `statusBackColor`, `uName`, `uReferenceState`, `agencyName`, `agencyReferenceState`, `ceoName`, `ceoReferenceState`, `ngayGiaoLaiDisplay`, `soTienKMDisplay`, `phiVanChuyenDisplay`, `phiKhacTotalDisplay`, `discountTotalDisplay`. Giữ nguyên allowlist hidden có chủ đích của T-005/T-006B; trạng thái/khóa/mã chứng từ đã có badge/heading, Display/ReferenceState/màu và audit/link/routing là metadata kỹ thuật. Lý do từng khóa: FIELD_EVIDENCE_TRANSFER_MACHINE_QR.md, mục sales-qr. |
| Không có nguồn / backend cắt | Không có amount/sourceAmount và không có cặp quantity/unitPrice hợp lệ trong fixture; cột tiền trống của Body cũ không mang thông tin. Không coi requestedQty/approvedQty hay số mã QR là tiền. Các HDE còn lại và alias đi kèm: visible-fields.json#sales-qr, bảng “bị backend cắt” trong evidence nêu trên. Không khôi phục các khóa này vào config/fixture. |

## Bán hàng và phạm vi bản vá

`modules/sales.ts` chỉ thêm `lines.rowNoun: "dòng hàng"` để hiện “1 dòng hàng đã tải”; mặc định generic vẫn là “dòng”. Các sửa đổi khác nằm ở types/format/layout/config generic và test/report của phiếu. Không thay Body/controllers, editor, money.ts, item-display.ts, API/backend/schema, lockfile, test cũ hay tasks. Không commit, push, merge hoặc triển khai.

## Kiểm tra

Đã chạy trong `apps/medcom-sites`, Node `v24.22.1`, pnpm `11.25.0`; trước mỗi lệnh thêm đường Node 24 theo phiếu vào PATH. Các log dưới đây ở thư mục gitignored `apps/medcom-sites/.test-runtime/`, chỉ chứa dữ liệu kiểm thử tổng hợp.

| Lệnh / kiểm tra | Kết quả quan sát |
|---|---|
| `pnpm typecheck` | PASS, exit 0 (`tsc --noEmit`). |
| `pnpm lint` | Exit 1 đúng baseline: 2 lỗi `@next/next/no-assign-module-variable` ở `tests/commerce-list.browser.mjs:37` và `tests/proxy-policy.test.ts:6`; 1 cảnh báo `react-hooks/incompatible-library` ở `components/erp/grid.tsx:88`. Không có lỗi/cảnh báo mới. Log: `T-006C-lint.log`. |
| Lệnh test gồm 9 file trong phiếu | PASS 149/149, exit 0; gồm 23 test mới trong `tests/document-detail-parity.test.mjs` và 126 test cũ, không sửa assert cũ. Log: `T-006C-targeted.log`. |
| `node --experimental-strip-types --test tests/document-detail-format.test.mjs` | PASS 14/14, exit 0; helper tổng mới được kiểm tra trong parity test. |
| `node scripts/test-erp.mjs --contracts-only` | Exit 1 đúng baseline: 759 test / 746 pass / 13 fail. Tập 13 tên lỗi khớp `D:/Projects/Medcom/.agent-runs/baseline/contracts-failures.txt`, không có tên lỗi mới hoặc lỗi baseline biến mất. Log: `T-006C-contracts.log`. Không sửa các file gây lỗi ngoài phiếu. |
| `pnpm build` | PASS, exit 0: Next.js `16.3.4`/Turbopack compile, TypeScript và tạo đủ 4/4 trang; không triển khai. Log: `T-006C-build.log`. |
| Phạm vi / chất lượng diff | 11 file đều thuộc allowlist phiếu; không thay Body/controllers/test cũ/backend/lockfile/tasks. `git diff --check` PASS; không có kiểu `any`, `@ts-ignore`, `eslint-disable` trong file code của bản vá. |

Giới hạn: kiểm thử React/SSR và contract dùng fixture/transport double; kết quả không khẳng định kết nối DB hay parity runtime trên dữ liệu thật. Bản vá để nguyên working tree cho leader review, không commit/push/merge.
