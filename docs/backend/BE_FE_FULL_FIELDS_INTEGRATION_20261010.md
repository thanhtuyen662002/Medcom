# Tài liệu BE cho FE: đầy đủ fields trên từng page — 10/10/2026

I70 / [PR #127](https://github.com/thanhtuyen662002/Medcom/pull/127) sửa các API hiện tại để **mỗi bản ghi trong page trả đầy đủ cột nguồn**. FE không cần chuyển URL sang `/api/v2` để lấy thêm cột. `page`, `pageSize`, `hasMore` tiếp tục giới hạn số bản ghi; không có chế độ trả toàn bộ bảng. Các scalar cũ được giữ, fields đầy đủ nằm trong các object bên dưới. Phần này thay thế hướng dẫn I67–I69 yêu cầu dùng v2 để nhận đủ fields. Các bản ghi kiểm chứng trước đó vẫn giữ nguyên danh tính lịch sử.

Nguồn hợp đồng: `src/backend/Medcom.Api/{DocumentEndpoints,PurchaseRequestEndpoints,DocumentDataProjection,ApiContractCatalog}.cs`; [OpenAPI](medcom-openapi.json); [mapping 116 cột](document-field-contract.json); [đối soát tất cả 34 API](api-data-audit-current-full-20261010.json). Đối soát cột sử dụng `inventories/source/20261002/table-*.json`, source-set và extraction-integrity của vòng nguồn owner-attachment-20261002; không tuyên bố tương đương hai Library baseline lịch sử. Hướng dẫn WinForms đã đối soát tại `docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md` là bằng chứng bổ sung.

## 1. URL, phân trang và vị trí fields

| Nhóm | GET danh sách hiện tại | GET chi tiết | Header / line fields |
| --- | --- | --- | --- |
| Đơn mua hàng (PO) | `/api/documents/purchase-orders` | `/api/documents/purchase-orders/detail?documentId=...&page=1&pageSize=50` | 19 / 12 |
| Yêu cầu nhập kho | `/api/documents/inbound-requests` | `/api/documents/inbound-requests/detail?documentId=...&page=1&pageSize=50` | 37 / 25 |
| Đề nghị mua | `/api/purchase-requests` | `/api/purchase-requests/detail?documentId=...` | 14 / 9 |

| Nhóm | Header trên từng row danh sách | Header chi tiết | Các dòng chi tiết |
| --- | --- | --- | --- |
| PO | `rows[].purchaseOrderHeader` | `document.purchaseOrderHeader` | `purchaseOrderLines[].fields` |
| Nhập kho | `rows[].inboundRequestHeader` | `document.inboundRequestHeader` | `inboundRequestLines[].fields` |
| Đề nghị mua | `data.rows[].fields` | `data.sourceFields.header` | `data.sourceFields.lines[]` |

Danh sách trả đủ cột **header** của mỗi chứng từ; lấy cột **line** từ API chi tiết. Không gộp nhiều dòng chi tiết vào một row danh sách. PO/nhập kho trả `{rows,page,pageSize,hasMore}`; đề nghị mua bọc trong `{scopeKey,data}`. PO/nhập kho detail có một `document`, hai mảng `purchaseOrderLines`/`inboundRequestLines` (mảng không thuộc nhóm đang đọc rỗng), cùng `page`, `pageSize`, `hasMore`, `itemDisplayContext`. Đề nghị mua detail giữ `data.document`, `stateToken`, `commandAccess`, `statusName`, `itemDisplayContext` và thêm `sourceFields`; không đổi command DTO hay token. Bằng chứng: `src/backend/Medcom.Contracts/{Documents,PurchaseRequestWorkspace,DocumentSourceFields}.cs` và OpenAPI.

| API | Page mặc định | Page size mặc định / tối đa | `hasMore` |
| --- | --- | --- | --- |
| PO, nhập kho: list và detail | 1 | 50 / 100 | Có; detail phân trang các dòng con |
| Đề nghị mua: list | 1 | 20 / 50 | Có |
| Đề nghị mua: detail | Không có tham số page | Aggregate tối đa 500 dòng | Không có; vượt 500 trả unavailable |

Các API phân trang chấp nhận `page=1..1000`, `pageSize>=1` trong giới hạn bảng trên. BE lấy thêm một bản ghi sentinel để tính `hasMore` và chỉ trả tối đa `pageSize` bản ghi. Không có `totalCount`, không được tự coi độ dài một page là tổng số hàng. Page là offset; dữ liệu có thể thay đổi giữa hai request, không phải snapshot cố định. Giới hạn 500 của aggregate đề nghị mua là hợp đồng hiện hữu được giữ nguyên, không phải giới hạn số cột hay thay đổi trong I70. Bằng chứng: `DocumentEndpoints.cs`, `SqlDocumentReader.cs`, `PurchaseRequestQueryRules`, `SqlPurchaseRequestQueries.cs`, `PurchaseRequestCommandRules.MaxLines`.

Query list hiện tại: `page`, `pageSize`, `search`, `branchId`. Gửi tham số khác/trùng sẽ bị từ chối 400. `search` giới hạn 100 ký tự; `branchId` phải nằm trong phạm vi server cấp. Detail PO `documentId` tối đa 30 ký tự, nhập kho/đề nghị mua tối đa 50. Các alias `/api/v2/...` trả cùng fields đầy đủ; riêng **v2 list** nhận thêm `dateFrom`, `dateTo`, `statusId`, `sortBy`, `sortDirection`. Không gửi các filter này vào route hiện tại. Xem [hợp đồng filter/order](DOCUMENT_QUERY_INTEGRATION_20261010.md) và `DocumentListBinding.cs`.

Ví dụ response tổng hợp cho `GET /api/documents/purchase-orders?page=1&pageSize=1`: một row có đủ 19 header fields, không có dữ liệu ERP thật. Các key `null` vẫn hiện diện.

```json
{
  "rows": [{
    "documentId": "EXAMPLE-PO-001",
    "documentDate": "2026-10-10",
    "branchId": "EXAMPLE-BRANCH",
    "statusId": 1,
    "isLocked": false,
    "statusName": null,
    "purchaseOrderHeader": {
      "documentId": "EXAMPLE-PO-001",
      "documentDate": "2026-10-10T09:15:30.000",
      "objectId": "EXAMPLE-OBJECT",
      "memo": "Ví dụ tổng hợp",
      "notes": null,
      "deliverDate": null,
      "currencyId": "VND",
      "rateExchange": 1,
      "baseTotal": "999999999999999999",
      "searchField": null,
      "isLock": false,
      "userCreate": null,
      "userUpdate": null,
      "dateUpdate": null,
      "dateCreate": null,
      "linkId": null,
      "contractId": null,
      "statusId": 1,
      "branchId": "EXAMPLE-BRANCH"
    }
  }],
  "page": 1,
  "pageSize": 1,
  "hasMore": true
}
```

FE gọi page 2 với cùng filter/branch; không tự ghép query lấy mọi hàng. Ví dụ này tuân theo schema `purchaseordersLegacyPage` trong OpenAPI; tên schema Legacy là identifier giữ tương thích, không có nghĩa response còn bị cắt fields.

## 2. Headers, xác thực và lỗi

Thành công trên cả 12 GET list/detail hiện tại và alias v2 có:

```http
X-Medcom-Data-Projection: full
X-Medcom-Full-Data-Path: /api/documents/purchase-orders
Cache-Control: no-store
```

`X-Medcom-Full-Data-Path` là route BE đang phục vụ, không chứa query/documentId và không có prefix BFF. Scope PO/nhập kho và metadata: `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`; đề nghị mua giữ `{scopeKey,data}`. FE loại bỏ dữ liệu cũ khi scope/session/quyền/branch thay đổi. Scope marker không phải credential. Thiếu object fields bắt buộc ở bất kỳ row/line nào khiến response 503; response lỗi không quảng cáo projection `full`. Bằng chứng: `WorkspaceReadScope.cs`, `DocumentDataProjection.cs`, hai endpoint files và `DocumentDataProjectionTests.cs`.

FE gọi BE qua BFF cùng origin, ví dụ `/api/erp/api/documents/purchase-orders?page=2&pageSize=20`. Server-only `MEDCOM_API_ORIGIN` trỏ đến origin HTTPS do vận hành quản lý; origin đang được ghi nhận là `https://medcom-production.up.railway.app`. GET `/api/auth/csrf`, giữ companion cookie và gửi `X-CSRF-TOKEN` khi POST login/logout/continue. Login body là `{username,password}`; giữ secure session cookie, lấy `/api/auth/session` và `/api/workspace` cho quyền/branch. Cookie đơn lẻ không tạo quyền: BE revalidate phiên và ERP authority. Passive GET không gia hạn idle session. Bằng chứng: `ApiHost.cs`, `AuthEndpoints.cs`, `WebSessions.cs`, `apps/medcom-sites/lib/erp/{proxy-policy,proxy}.ts` (chỉ đọc); xem thêm [HTTP boundary](CURRENT_HTTP_BOUNDARY_20261009.md).

| HTTP | FE xử lý |
| --- | --- |
| 200 và đúng schema | Render fields của page; dùng `hasMore` để đi tiếp |
| 200, `rows=[]`, `hasMore=false` | Page được cấp quyền nhưng không có bản ghi |
| 400 | Query/body không hợp lệ; giữ thông báo validation |
| 401 | Phiên không hợp lệ/hết hạn; yêu cầu đăng nhập lại |
| 403 | Không có quyền/phạm vi; không dùng dữ liệu cache cũ |
| 404 ở detail | Không có chứng từ có thể xem; không phân biệt hidden với missing |
| 503 hoặc response sai schema | Giữ trạng thái unavailable/error, không biến thành page rỗng |

BE dùng ProblemDetails an toàn và `X-Correlation-ID` cho lỗi. Không đọc message thành dữ liệu nghiệp vụ, không tự retry một POST chưa rõ kết quả. HTTP 200 của facade nhập kho có thể chứa outcome `Unavailable`; POST đăng ký không chứng minh writer đã được bật. Bằng chứng: `ApiHost.cs`, `PurchaseRequestEndpoints.cs`, `InboundDraftEndpoints.cs`, OpenAPI response schemas.

## 3. Các sửa đổi FE cần thực hiện

Đây là handoff cho owner FE; I70 không sửa ứng dụng FE. Quan sát source FE ở main `2fd9779149e12ae46634de3218a2505c214244fb` (bao gồm PR #126):

1. `apps/medcom-sites/lib/erp/contracts.ts`: schema row/line PO và nhập kho chưa khai báo các object full fields nên parser bỏ qua chúng. Thêm schema cho `purchaseOrderHeader`, `inboundRequestHeader`, `lines[].fields` đúng bảng cột ở phần 6. Giữ các scalar cũ.
2. `apps/medcom-sites/lib/erp/purchase-request-api.ts`: list row và detail readback dùng `.strict()`. Nếu chưa bổ sung `fields`/`sourceFields`, response đầy đủ bị lỗi schema và BFF/FE có thể nhận `invalid_api_response`. Cần cập nhật schema trước khi dùng backend mới. Các schema command/document/header/values hiện hữu giữ nguyên.
3. `apps/medcom-sites/lib/erp/api.ts` và `purchase-request-api.ts` có thể tiếp tục gọi route hiện tại. Không cần đổi BFF allowlist chỉ để thêm cột. Nếu chọn v2 để có filter/order mới, owner FE phải bổ sung allowlist v2/metadata và schema theo tài liệu query.
4. `apps/medcom-sites/lib/erp/proxy.ts` hiện chưa chuyển tiếp hai projection headers; nếu browser cần kiểm chứng chúng, BFF phải forward giá trị đã validate cùng scope headers. Không dùng các headers này làm quyền.
5. `apps/medcom-sites/lib/erp/erp-client.ts` hiện đổi lỗi list thành page rỗng và lỗi detail thành null. Sửa consumer để phân biệt lỗi với kết quả rỗng hợp lệ.
6. Cấu hình columns từ full object thay vì chỉ các scalar summary. `objectId`, `itemId`, `branchId` là khóa nguồn; tên hiển thị chỉ dùng khi có binding/enrichment được cấp quyền. `itemDisplayContext` là dữ liệu hiển thị bổ sung, không tạo selector hay quyền viết.

Ví dụ truy cập sau khi schema đã kiểm tra đầy đủ:

```ts
const poRows = parsedPoPage.rows.map(row => ({
  ...row.purchaseOrderHeader,
  statusName: row.statusName,
}));
const inboundRows = parsedInboundPage.rows.map(row => ({
  ...row.inboundRequestHeader,
  statusName: row.statusName,
}));
const purchaseRows = parsedPurchaseResponse.data.rows.map(row => ({
  ...row.fields,
  statusName: row.statusName,
}));
const poLines = parsedPoDetail.purchaseOrderLines.map(line => line.fields);
const purchaseHeader = parsedPurchaseDetail.data.sourceFields.header;
const purchaseLines = parsedPurchaseDetail.data.sourceFields.lines;
```

`parsed*` trong ví dụ là response đã validate đúng OpenAPI; không dùng `any`, `.pick()` chỉ lấy scalar cũ hay một parser strip unknown để tuyên bố đã nhận đủ cột. Dùng các bảng dưới đây để tạo schema/columns. Quyền thao tác vẫn lấy từ server; full fields không cho phép sửa mọi cột.

## 4. Giữ nguyên kiểu và null

Một property nullable vẫn **có key** trong full object, giá trị là `null`; không phải optional/undefined. Decimal SQL gửi dưới dạng **string** để không mất độ chính xác (`"999999999999999999.12"` là ví dụ tổng hợp); không ép `Number()` cho tiền/số lượng. SQL `float` là JSON number hữu hạn, `bit` là boolean, `int` là integer. Giữ `false`, `0`, số âm và `null` riêng biệt; không dùng `value || default`. SQL datetime dùng `yyyy-MM-ddTHH:mm:ss.fff`, không có timezone; không tự nối `Z` hay chuyển UTC. Scalar ngày summary có thể chỉ có `yyyy-MM-dd`; dùng ngày trong full header khi cần thời gian chính xác. Bằng chứng: `DocumentSourceFieldReader.cs`, `DocumentSourceFields.cs`, `SqlPurchaseRequestQueries.cs`, `DocumentFullFieldTests.cs`, field mapping.

## 5. Các API còn lại và trạng thái triển khai

34 operations dưới đây được lấy từ executable OpenAPI, không phải danh sách toàn bộ ERP. `full-source-fields` áp dụng cho dữ liệu chứng từ; auth/health/metadata/lookup có hợp đồng riêng, không trả cột bí mật của bảng quyền. Tám facade nghiệp vụ dùng default unavailable providers; FE không bật toolbar chỉ vì endpoint tồn tại. Các module chưa có route, report/export, Create/Add và thực thi nghiệp vụ/SQL acceptance tiếp tục nằm trong goal #45.

| Method | Path | Hợp đồng dữ liệu | Admission |
| --- | --- | --- | --- |
| GET | `/health/live` | `contract-specific-projection` | `process-only` |
| GET | `/health/ready` | `contract-specific-projection` | `business-release-not-admitted` |
| GET | `/api/contracts/openapi.json` | `contract-specific-projection` | `static-contract` |
| GET | `/api/platform/metadata` | `contract-specific-projection` | `identity-observation` |
| GET | `/api/auth/csrf` | `contract-specific-projection` | `antiforgery-bootstrap` |
| POST | `/api/auth/login` | `contract-specific-projection` | `legacy-identity-provider-required` |
| GET | `/api/auth/session` | `contract-specific-projection` | `authenticated-session` |
| POST | `/api/auth/session/continue` | `contract-specific-projection` | `authenticated-explicit-activity` |
| POST | `/api/auth/logout` | `contract-specific-projection` | `authenticated-session` |
| GET | `/api/workspace` | `contract-specific-projection` | `authenticated-scoped-navigation` |
| GET | `/api/documents/field-contract` | `contract-specific-projection` | `module-read-capability-required` |
| GET | `/api/documents/query-contract` | `contract-specific-projection` | `module-read-capability-required` |
| GET | `/api/documents/purchase-orders` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/documents/purchase-orders/detail` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/v2/documents/purchase-orders` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/v2/documents/purchase-orders/detail` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/documents/inbound-requests` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/documents/inbound-requests/detail` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/v2/documents/inbound-requests` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/v2/documents/inbound-requests/detail` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/purchase-requests` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/purchase-requests/detail` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/v2/purchase-requests` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/v2/purchase-requests/detail` | `full-source-fields` | `qualified-read-provider-required` |
| GET | `/api/purchase-requests/workspace` | `contract-specific-projection` | `writeAvailable-forced-false` |
| GET | `/api/purchase-requests/lookup` | `contract-specific-projection` | `branches-purposes-currencies-qualified-individually;items-objects-unqualified` |
| POST | `/api/purchase-requests/save` | `business-provider-unavailable` | `default-provider-unavailable;target-runtime-acceptance-required` |
| POST | `/api/purchase-requests/save/lookup` | `business-provider-unavailable` | `default-provider-unavailable;target-runtime-acceptance-required` |
| POST | `/api/purchase-requests/submit` | `business-provider-unavailable` | `default-provider-unavailable;target-runtime-acceptance-required` |
| POST | `/api/purchase-requests/submit/lookup` | `business-provider-unavailable` | `default-provider-unavailable;target-runtime-acceptance-required` |
| GET | `/api/inbound-requests/draft` | `business-provider-unavailable` | `default-provider-unavailable;target-runtime-acceptance-required` |
| POST | `/api/inbound-requests/draft/save` | `business-provider-unavailable` | `default-provider-unavailable;target-runtime-acceptance-required` |
| POST | `/api/inbound-requests/draft/send-to-warehouse` | `business-provider-unavailable` | `default-provider-unavailable;target-runtime-acceptance-required` |
| POST | `/api/inbound-requests/draft/reconcile` | `business-provider-unavailable` | `default-provider-unavailable;target-runtime-acceptance-required` |

## 6. Danh mục đầy đủ 116 cột

Các bảng được tạo trực tiếp từ [document-field-contract.json](document-field-contract.json), đã đối soát tên/SQL type/nullability với source inventory và required JSON paths của cả route hiện tại/v2. `nullable=có` vẫn yêu cầu key trong JSON. JSON type `string` với format `decimal-string` hoặc `sql-datetime-without-timezone` tuân theo phần 4. Prefix bảng cho biết vị trí đầy đủ; tên JSON trong mỗi dòng là key bên trong object đó. Header được trả trên từng row trong list và trong detail; line fields chỉ có trong detail.

### Đơn mua hàng — header: 19 cột

Nguồn: `dbo.AP_OrderTbl`, `sourceLine=11248` trong full SQL member được định danh bởi `inventories/source/20261002/extraction-integrity.json`; metadata: `inventories/source/20261002/table-*.json`. List: `rows[].purchaseOrderHeader`. Detail: `document.purchaseOrderHeader`.

| Cột SQL | Key JSON | SQL type | JSON type | Nullable | Format |
| --- | --- | --- | --- | --- | --- |
| `DocumentID` | `documentId` | `varchar(30)` | `string` | không | — |
| `DocumentDate` | `documentDate` | `datetime` | `string` | không | `sql-datetime-without-timezone` |
| `ObjectID` | `objectId` | `varchar(100)` | `string` | không | — |
| `Memo` | `memo` | `nvarchar(200)` | `string` | có | — |
| `Notes` | `notes` | `nvarchar(200)` | `string` | có | — |
| `DeliverDate` | `deliverDate` | `datetime` | `string` | có | `sql-datetime-without-timezone` |
| `CurrencyID` | `currencyId` | `varchar(3)` | `string` | không | — |
| `RateExchange` | `rateExchange` | `float` | `number` | không | — |
| `BaseTotal` | `baseTotal` | `decimal(28, 0)` | `string` | có | `decimal-string` |
| `SearchField` | `searchField` | `nvarchar(2000)` | `string` | có | — |
| `isLock` | `isLock` | `bit` | `boolean` | không | — |
| `UserCreate` | `userCreate` | `varchar(50)` | `string` | có | — |
| `UserUpdate` | `userUpdate` | `varchar(50)` | `string` | có | — |
| `DateUpdate` | `dateUpdate` | `datetime` | `string` | có | `sql-datetime-without-timezone` |
| `DateCreate` | `dateCreate` | `datetime` | `string` | có | `sql-datetime-without-timezone` |
| `LinkID` | `linkId` | `varchar(50)` | `string` | có | — |
| `ContractID` | `contractId` | `nvarchar(100)` | `string` | có | — |
| `StatusID` | `statusId` | `int` | `integer` | có | — |
| `BranchID` | `branchId` | `varchar(50)` | `string` | không | — |

### Đơn mua hàng — lines: 12 cột

Nguồn: `dbo.AP_OrderDetailTbl`, `sourceLine=11437` trong full SQL member được định danh bởi `inventories/source/20261002/extraction-integrity.json`; metadata: `inventories/source/20261002/table-*.json`. List: `Không có; dùng detail`. Detail: `purchaseOrderLines[].fields`.

| Cột SQL | Key JSON | SQL type | JSON type | Nullable | Format |
| --- | --- | --- | --- | --- | --- |
| `UserAutoID` | `userAutoId` | `varchar(40)` | `string` | không | — |
| `DocumentID` | `documentId` | `varchar(30)` | `string` | không | — |
| `ItemID` | `itemId` | `nvarchar(50)` | `string` | không | — |
| `Quantity` | `quantity` | `decimal(28, 2)` | `string` | có | `decimal-string` |
| `UnitPrice` | `unitPrice` | `decimal(28, 4)` | `string` | có | `decimal-string` |
| `SourceAmount` | `sourceAmount` | `decimal(18, 2)` | `string` | có | `decimal-string` |
| `Amount` | `amount` | `decimal(28, 0)` | `string` | có | `decimal-string` |
| `Notes` | `notes` | `nvarchar(100)` | `string` | có | — |
| `Quantity2` | `quantity2` | `decimal(28, 4)` | `string` | có | `decimal-string` |
| `Property` | `property` | `nvarchar(50)` | `string` | có | — |
| `Property2` | `property2` | `nvarchar(50)` | `string` | có | — |
| `ParentID` | `parentId` | `varchar(50)` | `string` | có | — |

### Yêu cầu nhập kho — header: 37 cột

Nguồn: `dbo.IV_InboundRequestTbl`, `sourceLine=11370` trong full SQL member được định danh bởi `inventories/source/20261002/extraction-integrity.json`; metadata: `inventories/source/20261002/table-*.json`. List: `rows[].inboundRequestHeader`. Detail: `document.inboundRequestHeader`.

| Cột SQL | Key JSON | SQL type | JSON type | Nullable | Format |
| --- | --- | --- | --- | --- | --- |
| `DocumentID` | `documentId` | `varchar(50)` | `string` | không | — |
| `DocumentDate` | `documentDate` | `datetime` | `string` | không | `sql-datetime-without-timezone` |
| `OrderNumber` | `orderNumber` | `nvarchar(50)` | `string` | không | — |
| `BranchID` | `branchId` | `varchar(50)` | `string` | có | — |
| `InvoiceNo` | `invoiceNo` | `nvarchar(50)` | `string` | không | — |
| `DeclarationNumber` | `declarationNumber` | `varchar(50)` | `string` | có | — |
| `DeparturePoint` | `departurePoint` | `nvarchar(100)` | `string` | không | — |
| `DestinationPoint` | `destinationPoint` | `nvarchar(100)` | `string` | không | — |
| `IsRain` | `isRain` | `bit` | `boolean` | có | — |
| `OrderTypeID` | `orderTypeId` | `nvarchar(50)` | `string` | không | — |
| `ObjectID` | `objectId` | `varchar(50)` | `string` | có | — |
| `TotalPalletQuantityByDocument` | `totalPalletQuantityByDocument` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `TotalBarrelQuantityByDocument` | `totalBarrelQuantityByDocument` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `TotalPalletQuantityByReal` | `totalPalletQuantityByReal` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `TotalBarrelQuantityByReal` | `totalBarrelQuantityByReal` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `ExcessPackageQuantity` | `excessPackageQuantity` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `LackOfPackageQuantity` | `lackOfPackageQuantity` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `DamagedPackageQuantity` | `damagedPackageQuantity` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `PackageTypeID` | `packageTypeId` | `nvarchar(50)` | `string` | có | — |
| `IsDamageOutsidePackage` | `isDamageOutsidePackage` | `bit` | `boolean` | có | — |
| `DamageDescription` | `damageDescription` | `nvarchar(500)` | `string` | có | — |
| `DamageInsideStatusID` | `damageInsideStatusId` | `nvarchar(50)` | `string` | có | — |
| `LocationDamageDetectedID` | `locationDamageDetectedId` | `nvarchar(50)` | `string` | có | — |
| `LocationDamageDescription` | `locationDamageDescription` | `nvarchar(500)` | `string` | có | — |
| `ResultDesciption` | `resultDesciption` | `nvarchar(max)` | `string` | có | — |
| `TotalQuantityInboundResult` | `totalQuantityInboundResult` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `GoodAwaitingInboundResult` | `goodAwaitingInboundResult` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `ResultNote` | `resultNote` | `nvarchar(500)` | `string` | có | — |
| `DatetimeRecorded` | `datetimeRecorded` | `datetime` | `string` | có | `sql-datetime-without-timezone` |
| `StatusID` | `statusId` | `int` | `integer` | không | — |
| `CurrencyID` | `currencyId` | `varchar(3)` | `string` | có | — |
| `RateExchange` | `rateExchange` | `decimal(28, 10)` | `string` | có | `decimal-string` |
| `ImageURL` | `imageUrl` | `varchar(255)` | `string` | có | — |
| `BBKCUrl` | `bbkcUrl` | `varchar(255)` | `string` | có | — |
| `Notes` | `notes` | `nvarchar(500)` | `string` | có | — |
| `SendTo` | `sendTo` | `nvarchar(max)` | `string` | có | — |
| `QRPrintType` | `qrPrintType` | `varchar(10)` | `string` | không | — |

### Yêu cầu nhập kho — lines: 25 cột

Nguồn: `dbo.IV_InboundRequestDetailsTbl`, `sourceLine=11005` trong full SQL member được định danh bởi `inventories/source/20261002/extraction-integrity.json`; metadata: `inventories/source/20261002/table-*.json`. List: `Không có; dùng detail`. Detail: `inboundRequestLines[].fields`.

| Cột SQL | Key JSON | SQL type | JSON type | Nullable | Format |
| --- | --- | --- | --- | --- | --- |
| `UserAutoID` | `userAutoId` | `varchar(50)` | `string` | không | — |
| `DocumentID` | `documentId` | `varchar(50)` | `string` | không | — |
| `ContractID` | `contractId` | `nvarchar(100)` | `string` | có | — |
| `ItemID` | `itemId` | `varchar(50)` | `string` | không | — |
| `HangSX` | `hangSX` | `nvarchar(100)` | `string` | có | — |
| `UnitFactor` | `unitFactor` | `float` | `number` | có | — |
| `Unit2` | `unit2` | `nvarchar(50)` | `string` | có | — |
| `Additional` | `additional` | `bit` | `boolean` | có | — |
| `LotNumberByDocument` | `lotNumberByDocument` | `nvarchar(50)` | `string` | có | — |
| `SetQuantityByDocument` | `setQuantityByDocument` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `BarrelQuantityByDocument` | `barrelQuantityByDocument` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `ExpireDateByDocument` | `expireDateByDocument` | `datetime` | `string` | có | `sql-datetime-without-timezone` |
| `LotNumberByReal` | `lotNumberByReal` | `nvarchar(50)` | `string` | có | — |
| `SetQuantityByReal` | `setQuantityByReal` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `BarrelQuantityByReal` | `barrelQuantityByReal` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `ExpireDateByReal` | `expireDateByReal` | `datetime` | `string` | có | `sql-datetime-without-timezone` |
| `SourceAmount` | `sourceAmount` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `UnitPrice` | `unitPrice` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `Amount` | `amount` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `RandomTestQuantity` | `randomTestQuantity` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `TestStatus` | `testStatus` | `nvarchar(100)` | `string` | có | — |
| `NoPalletNote` | `noPalletNote` | `nvarchar(500)` | `string` | có | — |
| `PalletNote` | `palletNote` | `nvarchar(500)` | `string` | có | — |
| `CheckerNote` | `checkerNote` | `nvarchar(500)` | `string` | có | — |
| `ItemCode` | `itemCode` | `nvarchar(50)` | `string` | có | — |

### Đề nghị mua — header: 14 cột

Nguồn: `dbo.AP_PurchaseRequestTbl`, `sourceLine=23221` trong full SQL member được định danh bởi `inventories/source/20261002/extraction-integrity.json`; metadata: `inventories/source/20261002/table-*.json`. List: `data.rows[].fields`. Detail: `data.sourceFields.header`.

| Cột SQL | Key JSON | SQL type | JSON type | Nullable | Format |
| --- | --- | --- | --- | --- | --- |
| `PurchaseRequestID` | `purchaseRequestId` | `nvarchar(50)` | `string` | không | — |
| `PurchaseDate` | `purchaseDate` | `datetime` | `string` | có | `sql-datetime-without-timezone` |
| `PurposeID` | `purposeId` | `int` | `integer` | có | — |
| `PersonSuggest` | `personSuggest` | `nvarchar(500)` | `string` | không | — |
| `Department` | `department` | `nvarchar(100)` | `string` | không | — |
| `PurposeDescOrClient` | `purposeDescOrClient` | `nvarchar(max)` | `string` | có | — |
| `Price` | `price` | `decimal(18, 2)` | `string` | có | `decimal-string` |
| `Notes` | `notes` | `nvarchar(max)` | `string` | có | — |
| `StatusID` | `statusId` | `int` | `integer` | không | — |
| `isLock` | `isLock` | `bit` | `boolean` | có | — |
| `CurrencyID` | `currencyId` | `varchar(3)` | `string` | không | — |
| `ObjectID` | `objectId` | `varchar(100)` | `string` | không | — |
| `RateExchange` | `rateExchange` | `float` | `number` | không | — |
| `BranchID` | `branchId` | `varchar(50)` | `string` | không | — |

### Đề nghị mua — lines: 9 cột

Nguồn: `dbo.AP_PurchaseRequestDetailTbl`, `sourceLine=23200` trong full SQL member được định danh bởi `inventories/source/20261002/extraction-integrity.json`; metadata: `inventories/source/20261002/table-*.json`. List: `Không có; dùng detail`. Detail: `data.sourceFields.lines[]`.

| Cột SQL | Key JSON | SQL type | JSON type | Nullable | Format |
| --- | --- | --- | --- | --- | --- |
| `UserAutoID` | `userAutoId` | `varchar(50)` | `string` | không | — |
| `ItemID` | `itemId` | `varchar(50)` | `string` | không | — |
| `Budget` | `budget` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `TimeRequired` | `timeRequired` | `nvarchar(200)` | `string` | có | — |
| `Quantity` | `quantity` | `decimal(18, 0)` | `string` | không | `decimal-string` |
| `UnitPrice` | `unitPrice` | `decimal(18, 0)` | `string` | không | `decimal-string` |
| `TotalPrice` | `totalPrice` | `decimal(18, 0)` | `string` | có | `decimal-string` |
| `Model` | `model` | `varchar(50)` | `string` | có | — |
| `PurchaseRequestID` | `purchaseRequestId` | `nvarchar(50)` | `string` | có | — |

## 7. Kiểm chứng và các giới hạn đã ghi nhận

Kiểm thử actual HTTPS host + SQL-reader recording fixtures kiểm tra toàn bộ cột, null/Unicode/độ chính xác/ngày, current/v2 payload parity và từng bản ghi trên nhiều page. Bounded verifier kiểm tra cả route hiện tại và v2, chỉ POST login/logout của phiên riêng, không xuất row values/IDs/cookies/credentials:

```sh
python tools/backend/audit_api_data.py
python -m unittest discover -s tools/backend -p test_api_data_audit.py
python tools/deploy/verify_backend_api.py --origin https://medcom-production.up.railway.app
```

Nếu có tài khoản ERP được chủ sở hữu cấp quyền, operator đặt `MEDCOM_TEST_USERNAME`/`MEDCOM_TEST_PASSWORD` riêng trong environment để verifier đọc tối đa một header và một bounded detail page **trên mỗi current/v2 route** của từng module được cấp quyền. Không đặt credentials vào CLI/Git/tài liệu. Không có credentials thì authenticated reads ghi rõ NOT_RUN; kết quả rỗng không chứng minh tương thích row có dữ liệu.

Evidence kiểm thử I70: `docs/execution/I70_VALIDATION_20261010.json`; receipt CI/package/exact-head-base/merge được lưu trên PR #127 sau khi quan sát thực tế. Kiểm chứng row SQL trên target có đăng nhập, tải thực tế và FE đã render đủ cột là **NOT_RUN / UNKNOWN** tại thời điểm handoff; không suy ra từ merge hay source tests. Không có SQL/configuration writes, kích hoạt writer, sửa FE hoặc điều chỉnh schedule trong I70. Goal #45 vẫn mở theo `docs/goals/PRODUCTION_ERP_GOAL.md`.
