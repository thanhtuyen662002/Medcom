# BE → FE: CUD, nút nghiệp vụ và danh sách chọn của 6 nhóm màn hình

Ngày: 2026-10-10, increment I72, PR #129, goal #45. Tài liệu này bổ sung tài liệu full-fields I71. FE thuộc người triển khai riêng; I72 không sửa giao diện.

## Mức độ bàn giao

Đã có các route HTTP thật, DTO cố định, SQL gateway CUD/luồng nghiệp vụ, truy vấn dropdown, chọn/dán dữ liệu, quyền và trạng thái nút cho **7 form thuộc 6 nhóm** dưới đây. OpenAPI của toàn BE có **115 operation**; I72 thêm 81 operation vào 34 operation trước đó. Dữ liệu trả đủ trường trong mỗi bản ghi, vẫn phân trang. Nguồn kiểm đếm: `src/backend/Medcom.Api/ErpScreenEndpoints.cs`, `ApiContractCatalog.cs`, `inventories/erp/20261010/six-screen-catalog.json`; đối chiếu route thật trong `ApiContractCatalogTests`.

**I74 đã bổ sung bộ ghi SQL và cấp số cụ thể trong startup thông thường.** Cài journal và cấu hình profile DB theo [hướng dẫn vận hành ghi](ERP_WRITE_RUNTIME_SETUP_20261010.md), rồi FE gọi các route CUD/workflow/QR để ghi dữ liệu. Không còn yêu cầu tự viết implementation C# để mở command. Các kiểm tra quyền, khóa, trạng thái, reference, idempotency và schema drift vẫn được thực thi. Kiểm thử SQL/HTTP dùng dữ liệu giả lập, không phải nghiệm thu nghiệp vụ MedData; trạng thái áp dụng lên môi trường thật được ghi riêng trong PR #132. Bằng chứng: `ApiHost.cs`, `ErpWriteStartup.cs`, `ErpWriteRuntime.cs`, `SqlErpDocumentNumberAllocator.cs` và `docs/execution/I74_ERP_WRITE_RUNTIME_20261010.md`.

## Màn hình, số trường và đường dẫn

Tiền tố chung là `/api/erp/{module}`. Tên module đóng, không nhận tên bảng/procedure từ FE.

| Màn hình | module | Menu / form hiện hành | header / lines / history / comparison | Dropdown |
|---|---|---|---|---:|
| Đề nghị mua hàng | `purchase-requests` | `05011 / AP_PurposeRequestListFrm` | 14 / 9 / — / — | 10 |
| Quản lý đơn hàng | `sales-orders` | `0600201 / AR_OrderByContractFrm` | 54 / 27 / 7 / — | 6 |
| Đề nghị điều chuyển nội bộ | `internal-transfer-requests` | `07010100 / IV_InternalTransferRequestFrm` | 20 / 12 / 7 / — | 8 |
| Quét QR xuất kho | `warehouse-qr` | `0702001 / IV_Output_QRCodeFrm` | 25 / 9 / — / 26 | 15 |
| Quét QR xuất bán hàng | `sales-qr` | `0702010 / AR_Invoice_QRCodeFrm` | 71 / 9 / — / 49 | 47 |
| Phiếu di chuyển/bàn giao máy | `machine-movements` | `1207 / FA_Move2026Frm` | 18 / 23 / — / — | 14 |
| Sửa chữa/bảo hành/bảo trì máy | `machine-repairs` | `1209 / FA_Repair2026Frm` | 22 / 15 / — / — | 6 |

Tổng 417 trường, 106 binding dropdown. Danh sách từng trường, kiểu SQL, nullable, quyền nhập và từng dropdown/đầu vào phụ thuộc có trong [phụ lục](ERP_SCREEN_FIELDS_AND_LOOKUPS_20261010.md). Nguồn là catalog hiện hành được chụp SELECT-only từ `SY_Menu`, `SY_FrmCfg`, `SY_FrmDrdwTbl`, `sys.columns`; không dùng menu đơn hàng cũ `060020WA` làm baseline.

## API đọc và metadata chung

| Method | Hậu tố | Đầu vào | Kết quả |
|---|---|---|---|
| GET | `/screen` | không query | Form, toàn bộ field, action definition và dropdown binding |
| GET | không hậu tố | `branchId`, `page`, `pageSize`, tùy chọn `search`, `dateFrom`, `dateTo`, `statusId` | Danh sách đủ header, `hasMore` |
| GET | `/detail` | `branchId`, `documentId`, `page`, `pageSize` | Header đầy đủ, trang lines/history/comparison, `stateToken`, trạng thái nút |
| GET | `/actions` | `branchId`, tùy chọn `documentId` | Trạng thái nút theo người dùng/quyền/phiếu; bỏ documentId khi tạo mới |
| POST | `/options` | `ErpLookupQuery` | Trang lựa chọn và các field liên kết |
| POST | `/commands/lookup` | operation + toàn bộ originalIntent | Quan sát receipt, không thực hiện lại command |

GET thành công và POST đọc thành công trả `{ "readScope": "…", "data": … }`. Header `X-Medcom-Data-Projection: full`. List: `data.rows[].header`. Detail: `data.header`, `data.lines.rows[].fields`, `data.history.rows[].fields` và `data.comparison.rows[].fields` nếu có. `lineId` định danh dòng đã lưu. Null vẫn có key, không bị bỏ khỏi object. Header không phân trang; các section dòng dùng cùng page/pageSize trong một lần gọi. `page=1`, `pageSize=20` mặc định; size 1–100, page 1–10000. Không có totalCount; dùng hasMore. Search danh sách tìm mã chứng từ; ngày `yyyy-MM-dd`, dateTo bao gồm cả ngày. Màn hình không có StatusID không nhận lọc statusId.

SQL decimal trả **string**, không ép qua JS Number. Datetime là giờ lịch SQL `yyyy-MM-ddTHH:mm:ss.fff`, không tự chuyển timezone. Tên field phân biệt hoa/thường, kể cả `vATPercent` và các tên nguồn viết tắt. Dùng schema module cụ thể trong [OpenAPI](medcom-openapi.json), không cắt các field nullable hoặc chưa hiển thị khỏi parser FE. Bằng chứng: `ErpSql.cs`, `ErpInputRules.cs`, `ApiContractCatalog.cs`.

Detail tạo token từ header, dòng nghiệp vụ và dòng đối chiếu, không chỉ trang FE đang thấy; lịch sử readonly không thuộc token này. Phiếu nghiệp vụ tối đa 500 dòng để thực hiện command; QR tối đa 10000 scan và 500 dòng đối chiếu. Vượt giới hạn sẽ khóa command, không cắt bớt dữ liệu để ghi. List/detail vẫn trả phân trang. Snapshot giữa các lần gọi không được đảm bảo là cùng một thời điểm.

## Quyền, hiện/ẩn và khóa nút

FE lấy `detail.data.actions` hoặc `/actions`, mỗi nút có `id`, `caption`, `visible`, `enabled`, `reason`, `requiresSavedDocument`, `route`.

- `visible=false`: ẩn nút. `visible=true, enabled=false`: hiện nhưng khóa, giải thích bằng reason.
- `route=null`: không gọi; các nút in chưa có report runtime được nghiệm thu luôn không có route trong I72.
- Quyền menu/form và chi nhánh được BE đọc lại trong SQL. Cờ của FE không cấp quyền; trạng thái có thể đổi sau khi đọc, BE kiểm tra lại khi thực hiện.
- Lý do thường gặp: `native_permission_or_hidden`, `save_document_first`, `state_or_assignment_not_allowed`, `contract_missing`, `erp_write_unqualified`, `document_numbering_unqualified`, `contract_read_unqualified`, `report_runtime_unqualified`.

Thêm cần native Add; Lưu/lệnh gửi/thu hồi/quét cần Update; Xóa cần Delete; đọc hợp đồng cần Read. Lưu/Xóa/lệnh nghiệp vụ cần phiếu đã lưu. Dán là bước chuẩn bị đọc, có thể dùng trước khi writer được mở; với phiếu đã lưu chỉ bật khi phiếu được sửa. Nguồn: `ErpActionRules.cs`, `ErpSqlAuthority.cs`, các hash của `SY_FrmCfg` trong catalog. Đây là quyền/nút của các form được nêu; không phải cam kết toàn bộ form duyệt của PM/SA đã hoàn thành.

## Nút từng màn hình

### Đề nghị mua hàng

Các nút chuẩn: Thêm, Lưu, Xóa, Dán dữ liệu. Nút nghiệp vụ:

| Nút / actionId | Route POST | Điều kiện nghiệp vụ | Kết quả |
|---|---|---|---|
| Gửi đề nghị / `submit` | `/actions/submit` | StatusID 1 hoặc 4, chưa khóa | StatusID 2, khóa phiếu |
| Gửi đặt mua hàng / `send-purchase-order` | `/actions/send-purchase-order` | StatusID 3, có dòng, chưa liên kết AP_OrderID | Tạo AP_Order từ phiếu, chuyển StatusID 5 |

Hai payload là `{}` trong envelope ErpActionRequest. `PurchaseDate` cần có để gửi đặt mua hàng. Không thêm nút Thu hồi vào form này nếu chưa có nguồn bổ sung: hiện source form chỉ có hai nút nghiệp vụ trên. Lưu/Xóa chỉ ở 1/4 và chưa khóa. Source: `AP_PurchaseRequestTbl`, `AP_PurchaseRequestDetailTbl`, `AP_PurposeRequestListFrm` cấu hình nút `CommandButtonCtl` và `_1`.

Năm nút in hiện có: **In đề xuất mua hàng; In BB giao nhận hàng hóa; In BB không phù hợp; In ĐN phê duyệt HĐ/ĐH; In BB kiểm nhập kho HH**. Catalog có caption/id để FE thể hiện nhưng I72 chưa thực thi báo cáo. `TotalPrice` dòng do BE tính Quantity × UnitPrice; FE không gửi field này. Chọn sang dòng: `sourceId="items"`.

### Quản lý đơn hàng

Các nút chuẩn: Thêm, Lưu, Xóa, Dán. Nút riêng:

| Nút / actionId | Route | Điều kiện | Kết quả |
|---|---|---|---|
| Gửi PM / `send-pm` | POST `/actions/send-pm` | người tạo; chưa khóa; StatusID -1 hoặc 11; có dòng; PM hợp lệ | StatusID 12, lưu SendTo/log |
| Thu hồi để sửa / `recall` | POST `/actions/recall` | người tạo; chưa khóa; StatusID 12 | StatusID 11, xóa SendTo, lưu log |
| Xem thông tin hợp đồng / `contract-info` | GET `/contract-info?branchId=…&documentId=…` | quyền đọc; phiếu có ContractID hợp lệ cùng scope | Thông tin hợp đồng đầy đủ thuộc CF_ContractTbl |

Payload gửi PM `{ "pmId": "<id lựa chọn>", "notes": null }`; thu hồi `{}`. Lưu ở -1/11; Xóa chỉ -1; không tự xóa phiếu đã gửi. Tạo Web mới chủ động bắt đầu **-1**, là chính sách Web để vào bước nhập/gửi; default hiện hành của `AR_OrderTbl.StatusID` là **0**, chưa chứng minh default của WinForms tạo phiếu mới tương đương -1.

Nạp PM qua POST `/actions/send-pm/options` với `{branchId,role:"primary",page,pageSize,search}`. Chỉ trả UserName/HoTen/BranchID của PM đang hoạt động, không có password/token. Đơn hàng chỉ dùng role primary. Điều chuyển dùng primary giới hạn chi nhánh sở hữu phiếu hoặc SY_UserBranch, supporting chọn PM hoạt động; không cần writer được mở để đọc lựa chọn. Source: SY_User/SY_UserBranch và kiểm tra PM của command.

Chọn sang dòng `sourceId="contract-items"`, context `ContractID`. BE lấy lại Item/UnitFactor/Unit2/số lượng hợp đồng/giao hàng từ `WA_OrderByContract_GetItemStp`; FE không gửi các field readonly. Amount, VATAmount, TotalAmount, Quantity2 tính theo các expression hiện đang bật. Discount/ContractAmount không được tự tính từ expression đang tắt. `AR_Order_UpdateBBBGStp` hiện chứa UPDATE không giới hạn phiếu; Web dùng SQL cố định giới hạn đúng DocumentID cho hook tương ứng. Source: `AR_OrderByContractFrm`, `AR_OrderTbl_UpdateStatusStp`, `AR_Order_SalesRecallFromPMStp` và các hash module trong catalog.

### Đề nghị điều chuyển nội bộ

Các nút chuẩn: Thêm, Lưu, Xóa, Dán; Gửi PM và Thu hồi để sửa:

| actionId | Route POST | Điều kiện | Kết quả |
|---|---|---|---|
| `send-pm` | `/actions/send-pm` | SalesUser hiện tại; chưa khóa; status 0/30; có dòng RequestedQty > 0 | status 10, ghi PM/log |
| `recall` | `/actions/recall` | SalesUser hiện tại; chưa khóa; status 10; chưa có batch điều chuyển | status 0, xóa phân công/xác nhận và phê duyệt dòng |

Payload `{ "primaryPmId": "<PM>", "supportingPmId": "", "notes": null }`; PM hỗ trợ tùy chọn, dùng chuỗi rỗng nếu không chọn; nếu chọn phải khác PM chính. PM chính thuộc BranchID của phiếu theo procedure; dropdown WinForms lại phụ thuộc FromBranchID, khác biệt này vẫn cần nghiệm thu UX/ERP khi hai chi nhánh khác nhau. Lưu ở 0/30; Xóa chỉ 0 và chưa có batch. FromBranchID/ToBranchID có thể là chi nhánh nguồn/đích khác nhau; BranchID sở hữu phiếu vẫn do server kiểm soát. TransportMethod ROAD/AIR/OTHER. Chọn `sourceId="items"`. Source: `IV_InternalTransferRequestFrm`, `IV_InternalTransfer_RequestSendPMStp`, `IV_InternalTransfer_RequestRecallFromPMStp`, `IV_InternalTransfer_RequestLogStp`.

### Quét QR xuất kho và xuất bán hàng

Hai form có Quét thêm / `scan-add` và Quét xóa / `scan-delete`: POST `/qr/add`, `/qr/delete`. Envelope ErpScanRequest gồm idempotencyKey, branchId, documentId, expectedStateToken, barcode. **Không có API tạo/sửa/xóa phiếu cha trên form quét QR**, phù hợp nút Add/Copy/Delete bị ẩn của ERP. Chọn phiếu hiện có qua GET list/detail, xem dòng hàng ở comparison và dòng đã quét ở lines.

Barcode thường `ItemID;ItemCode;Lot`; mỗi lần quét hợp lệ thêm một đơn vị. Quét lặp mã thường là hành vi nguồn, không tự deduplicate bằng barcode; deduplicate việc gửi lại request bằng idempotencyKey. Mã kiện `PKG1;<GUID>` dùng số lượng từ CF_QRPackageTbl, không được thêm cùng kiện hai lần vào một phiếu. Xóa mã thường xóa một dòng khớp; xóa mã kiện xóa dòng theo kiện. Procedure kiểm tra lô, hàng cần xuất, số lượng yêu cầu với tolerance 0.0001; BE khóa thao tác khi phiếu isLock=true. Chính sách khóa này chặt hơn procedure `CF_QRcodeStp` hiện không tự kiểm tra isLock. 154 kiểm tra cục bộ bao gồm thêm/xóa và chặn trùng mã kiện; các nhánh dữ liệu/môi trường đích vẫn cần nghiệm thu riêng.

Xuất bán hàng có thêm **Xem thông tin hợp đồng**, GET `/contract-info`. Xuất kho có nút in QR nguồn; dịch vụ in chưa nghiệm thu. Procedure chạy thật của hai form là `CF_QRcodeStp`, target `IV_OUTPUT` / `AR_INVOICE`, không thay bằng procedure barcode cũ. Nguồn: hai form hiện hành, `IV_Output*Tbl`, `AR_Invoice*Tbl`, module hash `CF_QRcodeStp`.

### Phiếu di chuyển/bàn giao máy

Thêm, Lưu, Xóa, Dán; current form `FA_Move2026Frm` không có nút gửi/thu hồi trong cấu hình đã quan sát. `sourceId="machines"` để chọn máy sang dòng. MoveTypeID cần hợp lệ; BE yêu cầu ít nhất một dòng và mọi máy cùng chi nhánh đang chọn vì header FA_MoveTbl không có BranchID. Đây là giới hạn scope Web cần nghiệm thu đối với phiếu đa chi nhánh.

Lưu/Xóa có thể làm trigger thay đổi sở hữu/lifecycle của máy theo ngày bàn giao, ngày phiếu, mã phiếu và dòng mới nhất. Xóa chuyển động cuối cùng mà không có dòng cũ hơn có thể giữ trạng thái hiện tại của máy theo trigger nguồn, không tự suy ra phải khôi phục. FE cần tải lại thông tin máy sau receipt. Nguồn: `FA_MoveTbl`, `FA_MoveDetailTbl`, `TR_FA_MoveTbl_LifecycleSync`, `TR_FA_MoveDetail_LifecycleSync`.

### Sửa chữa/bảo hành/bảo trì máy

Thêm, Lưu, Xóa, Dán; sourceId `machines`. Chọn ServiceTypeID đang hoạt động để phân loại dịch vụ theo dropdown, không hard-code toàn bộ loại nghiệp vụ chỉ từ tên màn hình. ServiceStatus: OPEN / IN_PROGRESS / COMPLETED / CANCELLED theo binding hiện hành.

Không có nút gửi/thu hồi riêng trong current `FA_Repair2026Frm` đã quan sát. Xóa bị khóa nếu có liên kết phụ tùng đang hoạt động; sửa/xóa dòng bị chặn nếu có liên kết dòng. Amount/PartsAmount readonly; giữ giá trị đang có khi sửa, không nhận giá trị FE ghi đè. **Công thức tiền dịch vụ đầy đủ vẫn UNKNOWN**, chưa có expression hiện hành đủ để chứng minh tiền tạo mới; cần hoàn tất trước nghiệm thu ghi thật. Nguồn: `FA_RepairTbl`, `FA_RepairDetailTbl`, `FA_PartServiceMutationGuardStp`, `FA_PartServiceLinkTbl`, `FA_PartReplacementTbl`.

## CUD và định dạng gửi

POST `/create`, `/save`, `/delete` có ở năm module không phải QR.

Create: `{idempotencyKey, branchId, header, lines:[{clientLineKey, values}]}`. BE cấp DocumentID và LineID, chủ sở hữu, chi nhánh, trạng thái, audit, giá trị readonly; không gửi các field đó vào header/values. Tối thiểu một dòng, tối đa 500. Header và values dùng DTO của đúng module trong OpenAPI, không dùng object của GET detail nguyên xi.

Save: `{idempotencyKey, branchId, documentId, expectedStateToken, header, lineChanges}`. Header là toàn bộ field nhập của form; **không phải patch tùy ý**. `lineChanges` gồm:

```json
[
  {"kind":"Add","clientLineKey":"draft-line-2","values":{"itemId":"SYNTHETIC-ITEM","quantity":"1","unitPrice":"100"}},
  {"kind":"Update","lineId":"<lineId đã lưu>","values":{"itemId":"SYNTHETIC-ITEM","quantity":"2","unitPrice":"100"}},
  {"kind":"Remove","lineId":"<lineId đã lưu khác>"}
]
```

Ví dụ values trên chỉ dành cho **purchase-requests**. Không gửi cùng LineID hai lần trong một command. Delete: `{idempotencyKey, branchId, documentId, expectedStateToken}`. Action: cùng bốn field này và `payload`. Mỗi thao tác mới dùng một idempotencyKey mới; retry phải giữ nguyên key **và toàn bộ ý định ban đầu**. Không tự đổi expectedStateToken trong retry rồi giữ key cũ.

Committed/Replayed trả `ErpCommandResult` với receipt: module, operation, key, documentId, stateToken, auditId, deleted và allocatedLines `{clientLineKey,lineId}`. Sau thành công FE cập nhật ánh xạ dòng, tải detail/actions mới. Toàn bộ hiệu ứng và journal trong một transaction serializable; không báo thành công nếu commit chưa rõ.

Nếu timeout/mất kết nối/OutcomeUnknown, POST `/commands/lookup` với `{ "operation": "save", "originalIntent": <toàn bộ body save ban đầu> }`. Lookup không ghi và không lấy quyền thực thi từ receipt; có thể trả Committed/Absent/Unknown. Absent không tự cấp phép gửi một ý định khác. Nguồn: `ErpCommandRules.cs`, `SqlErpScreenCommands.cs`, schema journal v1.

## Dropdown, dropselect và chọn/dán/copy

POST `/options`:

```json
{"branchId":"B1","lookupId":"lines.ItemID","page":1,"pageSize":20,"search":"SYNTHETIC","context":{"ContractID":"SYNTHETIC-CONTRACT"}}
```

Ví dụ trên dành cho đơn hàng. Các màn hình khác phải gửi đúng context của lookup; tra `screen.data.lookups[].parameters`, `requiredParameters` và phụ lục. lookupId giữ nguyên chữ hoa tên SQL, ví dụ `header.CurrencyID`, `lines.AssetID`. Context chỉ nhận các tên trong ParaArr; không gửi tùy ý tất cả field của header. Nếu đổi field phụ thuộc, xóa lựa chọn/dòng phụ thuộc cũ và nạp lại. `items[].id` là value, label dùng để hiển thị; fields có các cột liên kết từ binding nguồn. Danh sách vẫn phân trang; lọc tìm kiếm trước khi cắt trang. Binding không an toàn, thay đổi hash hoặc vượt 100000 lựa chọn trả 503, không trả trang thiếu giả là hết dữ liệu. Giới hạn page của options là 1000.

POST `/selection`: `{branchId, sourceId, selectedKeys:[...], context}`. Dùng `items` cho đề nghị mua/điều chuyển; `contract-items` cho đơn hàng; `machines` cho hai phiếu máy. Chọn nhiều tối đa 500 key, không trùng. Response `data.lines`, `data.headerPatch`, `sourceEvidence`, `revalidatedOnSave=true`. Đây là dữ liệu nháp: FE điền field bắt buộc/số lượng/giá còn thiếu trước validate hoặc create/save. Các giá trị tham chiếu được đọc lại khi lưu; selection không tự nhập vào DB.

POST `/paste/validate`: `{branchId, rows:[<values dòng đúng module>]}` kiểm tra field/kiểu và cấp clientLineKey cho nháp, không tạo chứng từ. FE map CSV/Excel/clipboard vào đúng DTO rồi gọi route này; route không đọc file/tùy ý tên bảng. Copy chứng từ có thể dùng GET detail rồi chỉ lấy các field có writable=true, bỏ tất cả ID/audit/trạng thái/readonly, cấp clientLineKey mới và POST create. **I72 không có route copy toàn phiếu riêng, không có import file XLSX server-side, và chưa chứng minh mọi nút chuyển từ chứng từ khác trong toàn ERP**; các nguồn lựa chọn được nêu rõ ở trên là phạm vi đã thực hiện.

## Session và xử lý lỗi

Giữ cookie phiên BE. Lấy CSRF qua GET `/api/auth/csrf`, giữ companion cookie, gửi `X-CSRF-TOKEN`. Mỗi POST cần HTTPS, `Origin` đúng origin BE, CSRF token và header `X-Medcom-Read-Scope` mới nhất lấy từ session/response đọc. Triển khai FE khác origin cần proxy cùng origin theo cấu hình được hỗ trợ; không tự mở CORS hay bỏ CSRF. Body application/json UTF-8, tối đa 1 MiB, depth 16; cấm field lạ, JSON key trùng, đổi casing và SQL/roles/branch authority do client cấp.

| HTTP | Ý nghĩa và xử lý FE |
|---|---|
| 200 | Đọc thành công hoặc command Committed/Replayed; vẫn kiểm tra outcome |
| 400 | Field/context/kiểu/ý định không hợp lệ; hiển thị lỗi nhập |
| 401 | Phiên hết hạn; đăng nhập lại, bỏ scope cũ |
| 403 | Không có quyền hoặc sai origin; không cố gọi nút bị khóa |
| 404 | Phiếu/lựa chọn không thuộc scope hoặc không tồn tại |
| 409 | Phiếu/scope/ý định đã đổi, nghiệp vụ từ chối hoặc outcome chưa rõ; tải lại hay lookup ý định gốc |
| 503 | Provider/nguồn/năng lực chưa được nghiệm thu hoặc không khả dụng; không hiển thị thành công |

Nguồn HTTP: `ErpScreenEndpoints.cs`, middleware auth/CSRF hiện có. Có thể nhận ProblemDetails `{code, correlationId, ...}` hoặc ErpCommandResult tùy boundary; FE đọc cả hai, không phụ thuộc vào SQL error text riêng tư.

## Tích hợp proxy FE hiện có

FE đã tích hợp các route mới trong PR #133, main `1a61b07d7cbf5557d1acd6d6a644781df4358222`. Đã đối chiếu `apps/medcom-sites/lib/erp/proxy-policy.ts`, `proxy.ts`, `erp-screen-api.ts` và `erp-screen-contracts.ts`: allowlist route/method, giới hạn 1 MiB, chuyển readScope/CSRF/Origin và parser giữ các field. I74 giữ nguyên phần FE của chủ triển khai riêng. Với catchall BFF hiện có, ví dụ BE `/api/erp/sales-orders/screen` tương ứng URL trình duyệt `/api/erp/api/erp/sales-orders/screen`. Đối chiếu source này không phải bằng chứng đã nghiệm thu thao tác từ trình duyệt tới MedData.

Duy trì allowlist **đúng từng route và method cố định** từ OpenAPI, kiểm tra browser Origin và relay scope/projection/correlation. Khi tạo mới, FE phải truyền `header.purchaseDate` ở đề nghị mua hàng và `header.documentDate` ở bốn form tạo khác theo `yyyy-MM-ddTHH:mm:ss.fff`; I74 công bố yêu cầu này trong schema create. Gọi `/actions` để hiển thị nút và `/actions/send-pm/options` cho hộp chọn PM. Việc đọc/ghi trực tiếp BE và việc BFF đã tích hợp là hai nghiệm thu khác nhau.

## Việc còn lại trước khi mở ghi thật

1. Nghiệm thu riêng DB đích: full constraints/index/trigger/default/hook/dynamic dependency, các nhánh nghiệp vụ và rollback. 67 module hash là static closure của phạm vi, không khẳng định exhaustive dynamic SQL closure.
2. Bộ cấp số thật đã có: PO/DMB dùng mask mặc định hệ thống `{P}{MM}{YY}/{4}` đã đọc trên MedData và đối chiếu Tools.dll hiện tại; DCNB/MLI/MLRP dùng DMK riêng cùng mask. Đã kiểm thử đồng thời/double-submit/rollback trong SQL và HTTP giả lập. Xác minh các writer WinForms cùng chạy và tải thực tế ở DB đích trước nghiệm thu vận hành.
3. Hoàn tất tiền sửa chữa và khác biệt trạng thái mặc định đơn hàng; kiểm chứng các policy Web chặt hơn nguồn (scope máy, khóa QR, giới hạn/scale và hợp đồng).
4. Chuẩn bị backup/rollback và áp dụng journal v1 sau khi có quyết định môi trường; file `schemas/backend/erp-screen-command-journal-v1.sql` **chưa áp dụng trên MedData**. Không startup auto-migrate.
5. Cấu hình writer theo [hướng dẫn vận hành ghi](ERP_WRITE_RUNTIME_SETUP_20261010.md); server đã có implementation cụ thể và công cụ install/prepare, không dùng provider giả lập. Tools.dll hiện tại đã vượt qua stored-password và HTTP login trên Windows/.NET 10 với SQL user giả lập; quyền/chi nhánh/tài khoản thật và Linux của binary mới vẫn cần receipt.
6. Nghiệm thu QR kiện, report/print và các nguồn import chứng từ bổ sung, test FE tiêu thụ schema và target HTTPS. Goal #45 vẫn mở cho đến khi các acceptance thực tế hoàn tất.

Bằng chứng nguồn: source-set I71 hiện hành `inventories/source/20261010/source-set.json`; catalog I72; `docs/SOURCE_BASELINE.md` giữ danh tính Library archives và snapshot khác nhau; hướng dẫn WinForms cũ chỉ bổ sung. Mọi dữ liệu thử là giả lập, không kèm SQL body riêng tư/credential/dòng giao dịch thật trong tài liệu công khai.
