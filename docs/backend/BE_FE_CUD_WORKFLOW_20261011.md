# Bàn giao CUD và nút nghiệp vụ bổ sung — 11/10/2026

Phạm vi [PR 140](https://github.com/thanhtuyen662002/Medcom/pull/140): bổ sung CUD và nút nghiệp vụ cho 12 form, đưa catalog BE lên 19 form. Không bổ sung In, upload, Import hay copy/chọn từ chứng từ khác trong lần này. Các route cũ giữ contract tương thích.

BE: `https://medcom-production.up.railway.app`. [Tài liệu đầy đủ API](BE_FE_API_REFERENCE_20261011.md) liệt kê 243 operation, request/response và 890 schema; [OpenAPI](medcom-openapi.json) là contract máy đọc. Trạng thái CI/main/triển khai được ghi tại [checkpoint I78](../execution/I78_CUD_ACTIONS_20261011.md).

## Cách FE tích hợp

1. Đăng nhập bằng cookie ERP và CSRF theo tài liệu tổng hợp; lấy branch từ `/api/workspace` hoặc `/api/lookups/branches`. Không gửi username/quyền tự khai để ghi.
2. GET `/api/erp/{module}/screen` để dựng cột, biết field writable và binding dropdown; GET list với `branchId,page,pageSize`. Mỗi record có đủ field, không lấy toàn bộ record trong một lần.
3. GET `/api/erp/{module}/detail?branchId=...&documentId=...&page=1&pageSize=20`. Dùng `data.header`, `data.lines.rows[].fields`, `history` và `data.sections` theo schema module. Section có page/hasMore riêng; cùng tham số page/pageSize. `stateToken` bao gồm header, lines và section phụ như costs/assets ở các trang khác (giới hạn 500 dòng mỗi section); history chỉ đọc không tham gia token.
4. Dựng nút từ `data.actions`, hoặc GET `/api/erp/{module}/actions` cùng branch/document. Tôn trọng `visible`, `enabled`, `reason`, `requiresSavedDocument`, `route`; không tự suy quyền từ StatusID. Server kiểm tra lại quyền, branch, trạng thái, người được giao và source khi ghi.
5. POST command bằng JSON, cookie, Origin đúng BE/BFF, CSRF và scope header mới nhất theo tài liệu tổng hợp. `idempotencyKey` duy nhất cho mỗi ý định; retry giữ nguyên key và body. Sau `Committed`/`Replayed` tải lại detail để lấy token/nút mới. Khi mất response dùng `/commands/lookup` với operation và originalIntent; không đổi key để retry một thao tác chưa rõ kết quả.
6. Decimal gửi bằng chuỗi invariant như `"1234.00"`; ngày SQL gửi ISO lịch như `"2026-10-11T00:00:00.000"`. FE hiển thị các field `...Name`, `...Display`, không gửi chúng hoặc field writable=false trở lại trong body CUD. Null có nghĩa dữ liệu nguồn null, không phải thiếu key.

## Body dùng chung

Create: `{idempotencyKey,branchId,header,lines:[{clientLineKey,values}]}`. BE cấp DocumentID và LineID. Trừ đợt điều chuyển, form tạo mới cần ít nhất một dòng hợp lệ.

Save: `{idempotencyKey,branchId,documentId,expectedStateToken,header,lineChanges}`. `lineChanges` có `kind="Add"|"Update"|"Remove"`; Add dùng clientLineKey + values, Update dùng lineId + values, Remove dùng lineId. Update gửi các field input cần lưu của dòng, không phải object response full; field bỏ qua trong DTO nullable có thể trở thành null. Màn hình xử lý theo bộ phận chỉ Update dòng có sẵn và chỉ các field được giao.

Delete: `{idempotencyKey,branchId,documentId,expectedStateToken}`. Action: `{idempotencyKey,branchId,documentId,expectedStateToken,payload}`. Section save: body như Save nhưng bỏ `header`, chỉ giữ `lineChanges`.

```json
{
  "idempotencyKey": "SYNTHETIC-UNIQUE-INTENT",
  "branchId": "SYNTHETIC-BRANCH",
  "documentId": "SYNTHETIC-DOCUMENT",
  "expectedStateToken": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "payload": {"notes": "Lý do hoặc ghi chú"}
}
```

Đây là ví dụ tổng hợp; ID phải lấy từ dữ liệu/dropdown thực tế trong scope user. Payload mặc định của các nút mới là `{notes}`; `sync-requests` là `{}`; `return-step` là `{statusId,notes}`; kỹ thuật `send-sa` là `{primarySaId,supportingSaId,notes}`. Hai SA phải khác nhau, một TPAdminHN và một TPAdminHCM. Giới hạn Notes của kế toán gửi kho và kho nhận là 1.000 ký tự; các nút khác dùng giới hạn schema/runtime nguồn. Reject/return cần lý do theo procedure native; lỗi điều kiện trả Conflict và rollback.

Tên JSON giữ đúng case: `assignedPM`, `assignedSA`, `pMApprovedQty`, `pMNote`, `bBKCUrl`, `vATId`. Dùng schema module cụ thể, không tự chuyển acronym sang camelCase khác.

## Các màn hình bổ sung

### Đơn đặt mua — `purchase-orders`

Nguồn: form `AP_OrderFrm`, menu `050129`, bảng `AP_OrderTbl` / `AP_OrderDetailTbl`; `screens[id=purchase-orders]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: POST `/api/erp/purchase-orders/create`, POST `/api/erp/purchase-orders/save`, POST `/api/erp/purchase-orders/delete`.

Field input được lưu: `header`: `documentDate`, `objectId`, `memo`, `notes`, `deliverDate`, `currencyId`, `rateExchange`, `searchField`, `contractId`; `lines`: `itemId`, `quantity`, `unitPrice`, `notes`, `quantity2`, `property`, `property2`.

Trạng thái nguồn cho lưu/nút: 0. Nút vẫn chịu quyền và assignment; đơn mua cho sửa/xóa ở mọi status khi chưa isLock theo source hiện hành.

API bổ trợ: `/api/erp/purchase-orders/item-price`.

Tra giá: POST `/item-price` với `{branchId,objectId,documentDate,itemId,currencyId?}` gọi AP_OrderGetItemPriceStp, trả UnitPrice hoặc null. CurrencyId là context FE chọn, không suy tiền tệ từ procedure. BE tính SourceAmount, Amount và BaseTotal theo 5 expression source đã pin (cùng inbound/costs); không nhận giá trị tính sẵn từ FE.

### Đề nghị nhập kho — `inbound-requests`

Nguồn: form `IV_InboundRequestFrm`, menu `07011`, bảng `IV_InboundRequestTbl` / `IV_InboundRequestDetailsTbl`; `screens[id=inbound-requests]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: POST `/api/erp/inbound-requests/create`, POST `/api/erp/inbound-requests/save`, POST `/api/erp/inbound-requests/delete`.

Field input được lưu: `header`: `documentDate`, `orderNumber`, `invoiceNo`, `declarationNumber`, `departurePoint`, `destinationPoint`, `isRain`, `orderTypeId`, `objectId`, `totalPalletQuantityByDocument`, `totalBarrelQuantityByDocument`, `totalPalletQuantityByReal`, `totalBarrelQuantityByReal`, `excessPackageQuantity`, `lackOfPackageQuantity`, `damagedPackageQuantity`, `packageTypeId`, `isDamageOutsidePackage`, `damageDescription`, `damageInsideStatusId`, `locationDamageDetectedId`, `locationDamageDescription`, `resultDesciption`, `totalQuantityInboundResult`, `goodAwaitingInboundResult`, `resultNote`, `datetimeRecorded`, `currencyId`, `rateExchange`, `imageURL`, `bBKCUrl`, `notes`, `qrPrintType`; `lines`: `contractId`, `itemId`, `unit2`, `additional`, `lotNumberByDocument`, `setQuantityByDocument`, `barrelQuantityByDocument`, `expireDateByDocument`, `sourceAmount`, `unitPrice`.

Trạng thái nguồn cho lưu/nút: 0, 1. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Gửi BLĐ | `POST /api/erp/inbound-requests/actions/send-management` | `{notes}` |
| Gửi Thủ kho | `POST /api/erp/inbound-requests/actions/send-warehouse` | `{notes}` |

API bổ trợ: `/api/erp/inbound-requests/sections/costs/save`.

Chi phí: `data.sections.costs`; Add/Update/Remove qua `/sections/costs/save`; BE tính Cost = SourceAmount × RateExchange và VATAmount từ VATID nguồn. `discrepancies`/`history` chỉ đọc. Gửi BLĐ chuyển 10; Gửi Thủ kho chuyển 2 và cần LotNumberByDocument, SetQuantityByDocument, BarrelQuantityByDocument, ExpireDateByDocument của mọi dòng.

### Duyệt đề nghị mua hàng — `purchase-approvals`

Nguồn: form `AP_ApprovePurchaseRequestListFrm`, menu `05012`, bảng `AP_PurchaseRequestTbl` / `AP_PurchaseRequestDetailTbl`; `screens[id=purchase-approvals]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: form xử lý/phê duyệt dùng các action dưới đây; source không cho CRUD trực tiếp..

Trạng thái nguồn cho lưu/nút: 2. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Không duyệt | `POST /api/erp/purchase-approvals/actions/reject` | `{notes}` |
| Duyệt | `POST /api/erp/purchase-approvals/actions/approve` | `{notes}` |

### PM xử lý đơn hàng — `sales-order-pm`

Nguồn: form `AR_OrderComfirmFrm`, menu `060021`, bảng `AR_OrderTbl` / `AR_OrderDetailTbl`; `screens[id=sales-order-pm]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: form xử lý/phê duyệt dùng các action dưới đây; source không cho CRUD trực tiếp..

Trạng thái nguồn cho lưu/nút: 12, 13. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Xem thông tin hợp đồng | `GET /api/erp/sales-order-pm/contract-info` | `GET branchId/documentId` |
| Gửi SA | `POST /api/erp/sales-order-pm/actions/send-sa` | `{notes}` |
| Từ chối nhanh | `POST /api/erp/sales-order-pm/actions/reject` | `{notes}` |

### SA xử lý đơn hàng — `sales-order-sa`

Nguồn: form `AR_OrderAproveFrm`, menu `060022`, bảng `AR_OrderTbl` / `AR_OrderDetailTbl`; `screens[id=sales-order-sa]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: form xử lý/phê duyệt dùng các action dưới đây; source không cho CRUD trực tiếp..

Trạng thái nguồn cho lưu/nút: 14, 15. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Xem thông tin hợp đồng | `GET /api/erp/sales-order-sa/contract-info` | `GET branchId/documentId` |
| Gửi Kế toán | `POST /api/erp/sales-order-sa/actions/send-accounting` | `{notes}` |
| Gửi Kỹ thuật | `POST /api/erp/sales-order-sa/actions/send-tech` | `{notes}` |
| Từ chối nhanh | `POST /api/erp/sales-order-sa/actions/reject` | `{notes}` |
| Chọn bước gửi về | `POST /api/erp/sales-order-sa/actions/return-step` | `{statusId, notes}` |

API bổ trợ: `/api/erp/sales-order-sa/actions/return-step/options`.

### PM duyệt điều chuyển — `internal-transfer-pm`

Nguồn: form `IV_InternalTransferPMFrm`, menu `07010110`, bảng `IV_InternalTransferRequestTbl` / `IV_InternalTransferRequestDetailTbl`; `screens[id=internal-transfer-pm]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: POST `/api/erp/internal-transfer-pm/save`.

Field input được lưu: `header`: {}; `lines`: `pMApprovedQty`, `pMNote`.

Trạng thái nguồn cho lưu/nút: 10. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Đồng ý điều chuyển | `POST /api/erp/internal-transfer-pm/actions/pm-confirm` | `{notes}` |
| Từ chối nhanh | `POST /api/erp/internal-transfer-pm/actions/reject` | `{notes}` |

Primary AssignedPM / AssignedTechnician / AssignedSA tương ứng mới được lưu/action. Người nhận hỗ trợ không có quyền sửa thay primary.

### Đợt điều chuyển — `internal-transfer-batches`

Nguồn: form `IV_InternalTransferBatchFrm`, menu `07010120`, bảng `IV_InternalTransferBatchTbl` / `IV_InternalTransferBatchRequestTbl`; `screens[id=internal-transfer-batches]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: POST `/api/erp/internal-transfer-batches/create`, POST `/api/erp/internal-transfer-batches/save`, POST `/api/erp/internal-transfer-batches/delete`.

Field input được lưu: `header`: `batchDate`, `fromBranchId`, `toBranchId`, `fromStoreHouseId`, `toStoreHouseId`, `plannedTransferDate`, `assignedPM`, `assignedTechnician`, `assignedSA`, `transportMethod`, `carrierName`, `carrierPhone`, `vehicleNo`, `outputDocumentId`, `inputDocumentId`, `notes`; `lines`: `requestId`, `notes`.

Trạng thái nguồn cho lưu/nút: 0, 10, 25, 45. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Đồng bộ đề nghị | `POST /api/erp/internal-transfer-batches/actions/sync-requests` | `{}` |
| Gửi kỹ thuật | `POST /api/erp/internal-transfer-batches/actions/send-tech` | `{notes}` |

Create cho phép lines rỗng; lines là RequestID + Notes. Delete chỉ status 0 và không có Request link. `sync-requests` là nút nghiệp vụ đồng bộ những đề nghị đã liên kết; nó tạo detail/asset theo source, chuyển đề nghị 20→40, trả đề nghị vừa bỏ liên kết về 20 theo lịch sử của đúng đợt. Không cập nhật đề nghị của đợt khác. Gửi kỹ thuật chuyển 20 nếu có thiết bị, ngược lại 40; cần kho và người nhận đúng nguồn.

### Kỹ thuật điều chuyển — `internal-transfer-tech`

Nguồn: form `IV_InternalTransferTechFrm`, menu `07010130`, bảng `IV_InternalTransferBatchTbl` / `IV_InternalTransferBatchDetailTbl`; `screens[id=internal-transfer-tech]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: POST `/api/erp/internal-transfer-tech/save`.

Field input được lưu: `header`: {}; `lines`: `techStatus`, `techNotes`, `bBKCUrl`.

Trạng thái nguồn cho lưu/nút: 20, 21. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Gửi TP SA | `POST /api/erp/internal-transfer-tech/actions/send-sa` | `{primarySaId, supportingSaId, notes}` |
| Từ chối nhanh | `POST /api/erp/internal-transfer-tech/actions/reject` | `{notes}` |

API bổ trợ: `/api/erp/internal-transfer-tech/sections/assets/save`, `/api/erp/internal-transfer-tech/actions/send-sa/options`.

`data.sections.assets` lưu Update các field assetCondition, techStatus, bBKCUrl, techNotes qua `/sections/assets/save`. Không tạo/xóa tài sản từ form xử lý kỹ thuật. Primary technician được giao mới sửa/gửi; supporting đọc theo native scope.

Primary AssignedPM / AssignedTechnician / AssignedSA tương ứng mới được lưu/action. Người nhận hỗ trợ không có quyền sửa thay primary.

### SA duyệt điều chuyển — `internal-transfer-sa`

Nguồn: form `IV_InternalTransferSAFrm`, menu `07010140`, bảng `IV_InternalTransferBatchTbl` / `IV_InternalTransferBatchDetailTbl`; `screens[id=internal-transfer-sa]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: POST `/api/erp/internal-transfer-sa/save`.

Field input được lưu: `header`: {}; `lines`: `approvedQty`, `notes`.

Trạng thái nguồn cho lưu/nút: 40, 41. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Gửi Kế toán | `POST /api/erp/internal-transfer-sa/actions/send-accounting` | `{notes}` |
| Từ chối nhanh | `POST /api/erp/internal-transfer-sa/actions/reject` | `{notes}` |
| Chọn bước gửi về | `POST /api/erp/internal-transfer-sa/actions/return-step` | `{statusId, notes}` |

API bổ trợ: `/api/erp/internal-transfer-sa/actions/return-step/options`.

Primary AssignedPM / AssignedTechnician / AssignedSA tương ứng mới được lưu/action. Người nhận hỗ trợ không có quyền sửa thay primary.

### Kế toán điều chuyển — `internal-transfer-accounting`

Nguồn: form `IV_InternalTransferAccountingFrm`, menu `07010150`, bảng `IV_InternalTransferBatchTbl` / `IV_InternalTransferBatchDetailTbl`; `screens[id=internal-transfer-accounting]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: POST `/api/erp/internal-transfer-accounting/save`.

Field input được lưu: `header`: `outputDocumentId`; `lines`: `lot`, `expireDate`, `accountingNote`.

Trạng thái nguồn cho lưu/nút: 60, 61. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Gửi Kho nguồn | `POST /api/erp/internal-transfer-accounting/actions/send-warehouse` | `{notes}` |
| Từ chối nhanh | `POST /api/erp/internal-transfer-accounting/actions/reject` | `{notes}` |
| Chọn bước gửi về | `POST /api/erp/internal-transfer-accounting/actions/return-step` | `{statusId, notes}` |

API bổ trợ: `/api/erp/internal-transfer-accounting/actions/return-step/options`.

### Kho nguồn điều chuyển — `internal-transfer-warehouse-out`

Nguồn: form `IV_InternalTransferWarehouseOutFrm`, menu `07010160`, bảng `IV_InternalTransferBatchTbl` / `IV_InternalTransferBatchDetailTbl`; `screens[id=internal-transfer-warehouse-out]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: POST `/api/erp/internal-transfer-warehouse-out/save`.

Field input được lưu: `header`: `transportMethod`, `carrierName`, `carrierPhone`, `vehicleNo`; `lines`: `actualIssueQty`, `warehouseNote`.

Trạng thái nguồn cho lưu/nút: 70. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Xác nhận xuất / Gửi Kho đích | `POST /api/erp/internal-transfer-warehouse-out/actions/dispatch` | `{notes}` |
| Từ chối nhanh | `POST /api/erp/internal-transfer-warehouse-out/actions/reject` | `{notes}` |
| Chọn bước gửi về | `POST /api/erp/internal-transfer-warehouse-out/actions/return-step` | `{statusId, notes}` |

API bổ trợ: `/api/erp/internal-transfer-warehouse-out/actions/return-step/options`.

### Kho đích điều chuyển — `internal-transfer-warehouse-in`

Nguồn: form `IV_InternalTransferWarehouseInFrm`, menu `07010170`, bảng `IV_InternalTransferBatchTbl` / `IV_InternalTransferBatchDetailTbl`; `screens[id=internal-transfer-warehouse-in]` trong [catalog nguồn](../../inventories/erp/20261011/cud-workflow-catalog.json).

CUD: POST `/api/erp/internal-transfer-warehouse-in/save`.

Field input được lưu: `header`: `inputDocumentId`; `lines`: `actualReceiveQty`, `receiveNote`.

Trạng thái nguồn cho lưu/nút: 100, 130. Nút còn chịu quyền, assignment và điều kiện native.

| Nút ERP | Route | Payload |
|---|---|---|
| Xác nhận nhận hàng | `POST /api/erp/internal-transfer-warehouse-in/actions/receive` | `{notes}` |

## Điều kiện quy trình cần FE thể hiện

PM xác nhận đề nghị điều chuyển 10→20, reject→30. SA đợt gửi kế toán 40/41→60; kế toán gửi kho 60/61→70; kho xuất Dispatch 70→100; kho nhận Receive 100/130→120 khi đủ hoặc 130 khi có chênh lệch. Return-step chỉ chọn status từ endpoint options; BE kiểm tra native IsReject/IsActive và tập 10/21/41/61. PM đơn bán 12/13→14 gửi SA, reject→11; SA đơn bán 14/15→18 gửi kế toán, →16 gửi kỹ thuật, reject→13. Duyệt mua 2→3 khóa phiếu, từ chối→4 mở khóa. Nguồn: buttons/saveStatuses và modules của catalog; SqlErpWorkflowEffects.cs / ErpWorkflowRules.cs.

Kế toán gửi kho, Dispatch và Receive dùng phiếu xuất/nhập kho đã liên kết: OutputDocumentID loại XDC hoặc InputDocumentID loại NDC, đúng BatchID, kho, hàng, lot, expiry và số lượng. Khi thiếu hoặc sai, native kiểm tra trả Conflict; FE cho sửa thông tin/liên kết trước khi gửi. Đợt kế toán có input OutputDocumentID; kho nhận có input InputDocumentID. Scope này chưa bổ sung CUD cho các form phiếu kho gốc; QR hiện hành vẫn là quét trên phiếu có sẵn. Không giả lập phiếu kho hay bỏ điều kiện native.

Thu hồi/sửa, QR và CUD của bảy form trước được giữ theo catalog cũ, xem mục 4 của tài liệu tổng hợp. Không coi form phê duyệt chỉ có action là thiếu API CRUD: toolbar/EBE/EBD nguồn xác định có thể sửa trực tiếp hay phải dùng nút quy trình.

## Dropdown và dữ liệu hiển thị

POST `/api/erp/{module}/options` với `{branchId,lookupId,page,pageSize,search?,context?}`; lấy lookupId/value/display/context từ `/screen` hoặc mục 13 tài liệu tổng hợp. Bộ chọn static như điểm đến/phương thức vận chuyển cũng trả theo trang. Return-step và chọn SA dùng action-options riêng đã liệt kê trên màn hình tương ứng. Theo quyền phiên có thể không có lựa chọn.

ID có companion Name và referenceState; ItemID bổ sung ItemCode/ItemName/Unit; StoreHouseID bổ sung StoreHouseName; StatusID bổ sung StatusName theo đúng bảng status của module. Nếu nguồn thiếu/không rõ/ambiguous, trả null + state, không tự tạo tên. VND hiển thị `1,234 VND`, USD `1,234.00 USD`; ngày `dd/MM/yyyy` hoặc `dd/MM/yyyy HH:mm:ss`. Raw decimal/date vẫn giữ cho phép tính, sort và ghi. Snapshot tên có giá trị được giữ; tên/code/unit null có thể được bổ sung từ reference.

## Bằng chứng và giới hạn

Catalog mới: 12 form, 28 business buttons, 1.099 field (872 cột vật lý + 227 field view), 108 dropdown, 45 module SQL, 22 native defaults, 5 expression và 2 grid-action metadata pins. Cộng catalog cũ: 19 form, 1.516 source fields, 214 dropdown; module closure hợp nhất 100 object, native defaults 36. API data audit xác nhận 38 full-field read routes theo trang. Nguồn: cud-workflow-catalog.json; six-screen-catalog.json; api-data-audit.json; reference-source-reconciliation.json.

MedData qualification là SELECT-only: 19 module, journal binding/catalog và fingerprint xác minh, không ghi transaction thật. Private local fixture đã chạy concrete SQL writer và source procedure, không phải nghiệm thu user trên production. Native constraints/index/trigger của fixture không được tuyên bố đầy đủ như MedData. CI/main/deploy evidence nằm trong checkpoint.

Công thức tiền dịch vụ/sửa chữa ngoài phần CUD có trước vẫn UNKNOWN: current source không có expression đủ chứng minh; không bịa giá hoặc sửa Amount/Parts tính sẵn. Đề nghị orphan status40 thiếu lịch sử liên kết đợt không được tự đổi trạng thái bởi sync. Thông báo hiện hỗ trợ chín form trước; mapping các form bổ sung chưa được mở rộng trong scope CUD này. Goal45 và nghiệm thu nghiệp vụ trên chứng từ thật còn mở.

Historical approved Library archives giữ danh tính tại SOURCE_BASELINE.md; owner live round mới là bằng chứng riêng. Supplementary WINFORMS_SOURCE_GUIDE_EVIDENCE.md không thay approved source. Tài liệu chỉ chứa technical metadata và ví dụ tổng hợp.
