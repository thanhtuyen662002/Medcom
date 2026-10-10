# Tài liệu tổng hợp API backend ERP Medcom cho frontend

Tài liệu bàn giao toàn bộ **119 operation HTTP và 274 schema** hiện có của BE, đối chiếu mã trên main `d6cdb6287cfc07200a3f011bfe7b355e8d74ba39` và OpenAPI trực tiếp tại BE ngày 2026-10-10 UTC. FE dùng tài liệu này để tích hợp đăng nhập, danh sách đủ trường theo trang, chi tiết, CUD, nút nghiệp vụ, dropdown, chọn/dán dữ liệu và thông báo. Những route tương thích chưa có provider vận hành được ghi rõ trong danh mục; chúng không được dùng để thay thế route ghi hiện hành.

**Địa chỉ BE:** https://medcom-production.up.railway.app. **OpenAPI đang chạy:** https://medcom-production.up.railway.app/api/contracts/openapi.json. File contract trong repo: [medcom-openapi.json](medcom-openapi.json). Ngày đối chiếu là ngày UTC của lần chụp contract; không phải cam kết mọi màn hình ERP đã nghiệm thu production.

## Mục lục

- [Chọn đúng nhóm API và trạng thái vận hành](#chon-nhom-api)
- [Đăng nhập cookie CSRF và chi nhánh](#dang-nhap)
- [Dữ liệu đầy đủ và phân trang](#du-lieu)
- [Các màn hình và nút nghiệp vụ](#man-hinh)
- [CUD trạng thái đồng thời và tra cứu kết quả](#ghi-du-lieu)
- [Dropdown chọn dữ liệu và dán bảng](#danh-sach-chon)
- [Đọc đơn đặt hàng mua và yêu cầu nhập kho](#doc-tuong-thich)
- [Thông báo và mở chứng từ](#thong-bao)
- [Lỗi và hướng dẫn triển khai FE](#loi-va-fe)
- [Danh mục đầy đủ 119 API](#danh-muc-api)
- [Chi tiết request và response từng API](#chi-tiet-api)
- [Toàn bộ field trong 274 schema](#schema-api)
- [106 binding dropdown theo màn hình](#binding-dropdown)
- [Field hợp đồng và nguồn bằng chứng](#bang-chung)

<a id="chon-nhom-api"></a>
## 1 Chọn đúng nhóm API và trạng thái vận hành

| Nhóm | Dùng cho FE | Trạng thái thực tế và giới hạn |
|---|---|---|
| `/api/auth/*`, `/api/workspace` | Đăng nhập ERP, giữ phiên, lấy scope và chi nhánh | Provider legacy thật được cấu hình; tài khoản và quyền lấy lại từ ERP. |
| `/api/erp/{module}/*` | Bảy form hiện hành; đọc, CUD, gửi/thu hồi, QR, dropdown, chọn/dán | Bộ ghi SQL và cấp số đã có trong startup; profile ghi bảy module đã bật trên BE Medcom và hai bảng journal đã cài trên MedData theo cho phép của owner. Quyền và trạng thái từng phiếu vẫn được kiểm tra. |
| `/api/documents/*`, `/api/v2/documents/*` | Đọc đơn đặt hàng mua và yêu cầu nhập kho; metadata field/query | Đủ field cho mỗi record, giữ phân trang. Chưa có create/save/delete của hai module này trong nhóm route này. |
| `/api/purchase-requests`, `/api/v2/purchase-requests` và `/detail` | Đọc đề nghị mua hàng theo contract tương thích | Đủ field, nhưng envelope khác `/api/erp/purchase-requests`. FE triển khai màn hình mới nên dùng nhóm `/api/erp/purchase-requests`. |
| `/api/purchase-requests/workspace`, `/lookup` | Metadata và lookup tương thích | `writeAvailable=false` thuộc facade cũ. Không dùng cờ này để khóa CUD hiện hành của `/api/erp/purchase-requests`. Một số lookup cũ chưa qualified. |
| POST `/api/purchase-requests/save`, `/submit` và hai `/lookup` tương ứng | Contract command cũ | Provider command/access không được đăng ký trong startup thông thường. Không dùng các route này để ghi; dùng `/api/erp/purchase-requests/save`, `/actions/submit`, `/commands/lookup`. |
| `/api/inbound-requests/draft*` | Facade nháp nhập kho cũ | Provider mặc định unavailable; chưa bàn giao ghi nhập kho qua facade này. Dù nhận HTTP 200 vẫn phải đọc `access`/`outcome`. |
| `/api/notifications*` | Thông báo riêng và mở form | Provider SQL thật dùng SY_NotifyMsgTbl; đánh dấu đã xem bằng procedure native. Đích mở đã ánh xạ chín form; form khác trả lý do chưa hỗ trợ. |
| `/health/*`, `/api/platform/metadata`, `/api/contracts/openapi.json` | Chẩn đoán và contract | `/health/live` 200; `/health/ready` hiện 503 do business release gate. Readiness không phải API kiểm tra quyền thao tác của người dùng. `platform/metadata.status=read_only_adapter` là nhãn tương thích cố định trong mã, không phản ánh công tắc ghi bảy module. |

Các chuỗi `x-medcom-admission` của nhóm `/api/erp/*` trong OpenAPI còn mô tả thời điểm trước khi startup có writer. **Để xác định tình trạng ghi hiện tại**, dùng composition trong `ApiHost.cs`, `ErpWriteStartup.cs`, bằng chứng kích hoạt và `/actions` của user/phiếu. Schema request/response trong OpenAPI vẫn là contract của FE. Không suy ra mọi POST đều ghi: `/options`, PM options, `/selection`, `/paste/validate`, `/commands/lookup` là đọc hoặc chuẩn bị nháp.

Bằng chứng vận hành: [checkpoint main và BE của PR 134](https://github.com/thanhtuyen662002/Medcom/pull/134#issuecomment-6099096715), [kích hoạt ghi MedData của PR 132](https://github.com/thanhtuyen662002/Medcom/pull/132#issuecomment-6097976637); source: [ApiHost.cs](../../src/backend/Medcom.Api/ApiHost.cs), [ErpWriteStartup.cs](../../src/backend/Medcom.Api/ErpWriteStartup.cs), [PurchaseRequestEndpoints.cs](../../src/backend/Medcom.Api/PurchaseRequestEndpoints.cs), [InboundDraftEndpoints.cs](../../src/backend/Medcom.Api/InboundDraftEndpoints.cs). Nghiệm thu thao tác của owner trên chứng từ thật và toàn bộ business release vẫn **UNKNOWN**; [goal 45](https://github.com/thanhtuyen662002/Medcom/issues/45) còn mở.

<a id="dang-nhap"></a>
## 2 Đăng nhập cookie CSRF và chi nhánh

FE dùng tài khoản ERP; tài khoản SQL không phải username/password của màn hình đăng nhập. BE dùng cookie `__Host-Medcom.Session` và cookie CSRF `__Host-Medcom.Csrf`, HttpOnly, Secure, SameSite Strict. Không có endpoint cấp JWT/Bearer hoặc API gửi role/actor từ FE trong catalog hiện tại.

Trình tự:

1. GET `/api/auth/csrf`, giữ cookie CSRF và lấy `token` trong response.
2. POST `/api/auth/login`, JSON `{ "username": "SYNTHETIC-USER", "password": "SYNTHETIC-PASSWORD" }`, gửi `X-CSRF-TOKEN` cùng cookie CSRF. Ví dụ chỉ là dữ liệu tổng hợp; không ghi password thật vào log, Git hoặc URL.
3. GET `/api/auth/session` để biết tên hiển thị, company, capabilities, `idleExpiresAt` và `absoluteExpiresAt`. GET `/api/workspace` để lấy `branchIds`, `branchSelection`, navigation và các scope header. Navigation hiện chỉ tạo mục platform/purchase-orders/purchase-requests/inbound-requests; FE dùng catalog bảy màn hình cùng capability tương ứng, không coi navigation này là danh sách đầy đủ mọi form.
4. Chọn branch trong `branchIds`. Nếu `branchSelection.mode="assigned"` và `filterLocked=true`, hiển thị branch được gán và khóa bộ chọn. `mode="all"` cho phép lựa chọn trong scope. Metadata null là unavailable; không tự suy ra quyền toàn bộ chi nhánh. Quyền bổ sung trong branchIds không thay thế semantics bộ lọc được gán.
5. POST `/api/auth/session/continue` để gia hạn idle; absolute expiry vẫn là giới hạn. POST `/api/auth/logout` trả 204 và thu hồi phiên. BE restart có thể làm mất phiên local; xử lý 401 bằng đăng nhập lại.

| Header | FE/BFF sử dụng |
|---|---|
| `X-CSRF-TOKEN` | Bắt buộc cho POST `/api/*`, kể cả login và POST đọc. Lấy qua csrf route; không tự tạo. |
| `Origin` | Các POST ERP và command cũ kiểm tra origin. BFF gửi origin chính xác của BE, `https://medcom-production.up.railway.app`, sau khi kiểm tra origin trình duyệt. |
| `X-Medcom-Session-Scope` | Scope phiên trên response đọc có stamp. Thay đổi thì bỏ dữ liệu của phiên cũ. |
| `X-Medcom-Read-Scope` | Scope đọc trên workspace/response được stamp; POST `/api/erp/*` và đánh dấu thông báo cần giá trị mới nhất. Token này không tự cấp quyền. |
| `X-Medcom-Data-Projection` | `full` trên response đọc đầy đủ. Giữ nullable key và toàn bộ object field khi parse. |
| `X-Medcom-Full-Data-Path` | Route full cố định của nhóm document tương thích; không chứa query/identifier. |
| `X-Correlation-ID` | Mã server sinh để đối chiếu lỗi, không dùng làm idempotency key hoặc quyền. |

Hai command facade cũ có scope header riêng `X-Purchase-Scope`/`X-Inbound-Scope`; xem từng operation trong phụ lục. Không đổi chúng thành X-Medcom-Read-Scope nếu vẫn duy trì consumer cũ.

FE khác host dùng BFF cùng origin với browser. Proxy hiện tại có prefix `/api/erp/` rồi nối **toàn bộ path BE bỏ dấu `/` đầu**, ví dụ:

| Path BE | Path browser qua BFF hiện có |
|---|---|
| `/api/auth/csrf` | `/api/erp/api/auth/csrf` |
| `/api/erp/sales-orders/detail` | `/api/erp/api/erp/sales-orders/detail` |
| `/api/v2/documents/purchase-orders` | `/api/erp/api/v2/documents/purchase-orders` |
| `/api/notifications` | `/api/erp/api/notifications` |

BFF phải giữ cookie/token đúng phiên, cho phép đúng method/path/query, chuyển scope/projection/correlation và response lỗi. Bốn notification route cần thêm allowlist trong phần FE riêng nếu chưa có. Tài liệu này không thay đổi FE hoặc BFF. Nguồn: [AuthEndpoints.cs](../../src/backend/Medcom.Api/AuthEndpoints.cs), [WorkspaceReadScope.cs](../../src/backend/Medcom.Api/WorkspaceReadScope.cs), [LocalWebSessions.cs](../../src/backend/Medcom.Infrastructure/LocalWebSessions.cs), `apps/medcom-sites/lib/erp/proxy-policy.ts` và `proxy.ts` tại main nêu ở đầu tài liệu.

<a id="du-lieu"></a>
## 3 Dữ liệu đầy đủ và phân trang

**Full fields là đủ cột trong mỗi record, còn số record vẫn theo trang.** Không cần tăng pageSize để lấy thêm cột. Envelope không đồng nhất giữa các nhóm; dùng đúng response schema từng endpoint trong phụ lục.

| Nhóm đọc | Envelope và vị trí dữ liệu | Phân trang |
|---|---|---|
| Bảy `/api/erp/{module}` list | `{readScope,data}`; `data.rows[].header` | page mặc định 1, size 20; page 1–10000, size 1–100; `hasMore`, không có totalCount. |
| Bảy `/api/erp/{module}/detail` | `data.header`; `data.lines.rows[].fields`; history/comparison có ở các module tương ứng | Header toàn bộ; các section dùng cùng page/pageSize, mỗi section có hasMore riêng. |
| `/api/erp/{module}/options` và PM options | `data.items[]`: id, label, fields | page 1–1000, size 1–100, mặc định 1/20; `hasMore`. |
| Đơn đặt hàng mua/nhập kho, original và v2 | DocumentPage; `rows[].purchaseOrderHeader` hoặc `rows[].inboundRequestHeader` | page 1–1000, size 1–100, mặc định 1/50; `hasMore`. |
| Detail đặt hàng mua/nhập kho | `document.purchaseOrderHeader`/`inboundRequestHeader`; các line array có `.fields` | page/size của dòng; giữ `hasMore` ở envelope detail. |
| Đề nghị mua hàng original/v2 | `{scopeKey,data}`; list `data.rows[].fields`; detail `data.sourceFields.header/lines[]` | list size 1–50, mặc định 20, page tối đa 1000; detail toàn aggregate tối đa 500 dòng, không nhận page. |
| Notifications | `{readScope,data}`; `data.rows[]` đủ 22 key | page 1–1000, size 1–100, mặc định 30; totalRows/unreadCount, không có hasMore. |

Trang thông báo tiếp theo còn dữ liệu khi `page * pageSize < totalRows` tại lần đọc đó. Các trang offset không có snapshot chung giữa request; writer ERP hoặc notification mới có thể làm dịch chuyển dòng. Đổi branch/filter/sort/readScope phải về page 1 và bỏ selection/cache cũ. Cache key gồm module, scope, branch và query đã chuẩn hóa.

SQL decimal/numeric/money được trả **chuỗi thập phân**; dùng thư viện decimal hoặc giữ string khi tính/nhập, không ép thành JS Number rồi gửi lại. SQL float/real là number hữu hạn; bit là boolean. JSON nullable key luôn có trên full read; required trong schema response nghĩa là key phải có, **không có nghĩa giá trị khác null**. Tên field phân biệt hoa thường, ví dụ `vATPercent`; không tự đổi key viết tắt.

Datetime ERP dùng giờ lịch SQL, thường `yyyy-MM-ddTHH:mm:ss.fff`; thông báo datetime2(0) dùng `yyyy-MM-ddTHH:mm:ss`. Timezone nguồn **UNKNOWN**, không tự thêm `Z` hoặc convert UTC. Session expiry DateTimeOffset là contract khác, dùng date-time offset như API trả. Khi gửi datetime SQL, giá trị phải biểu diễn được đúng precision nguồn; `00:00:00.000` là ví dụ an toàn. Date-only dùng `yyyy-MM-dd`.

List bảy màn hình nhận branchId, page, pageSize, search, dateFrom, dateTo, statusId. Search tìm mã phiếu; dateTo gồm cả ngày cuối. Màn hình không có StatusID không nhận filter này. Không có sortBy/sortDirection trên bảy list hiện hành. Các v2 list tương thích hỗ trợ sort được trình bày ở mục 7. Query lạ, query lặp, JSON field lạ/trùng/sai casing có thể bị từ chối; chỉ gửi các field công bố.

Nguồn: [ErpScreenEndpoints.cs](../../src/backend/Medcom.Api/ErpScreenEndpoints.cs), [ErpInputRules.cs](../../src/backend/Medcom.Application/ErpInputRules.cs), [ErpSql.cs](../../src/backend/Medcom.Infrastructure/Erp/ErpSql.cs), [DocumentEndpoints.cs](../../src/backend/Medcom.Api/DocumentEndpoints.cs), [PurchaseRequestEndpoints.cs](../../src/backend/Medcom.Api/PurchaseRequestEndpoints.cs), [NotificationEndpoints.cs](../../src/backend/Medcom.Api/NotificationEndpoints.cs).

<a id="man-hinh"></a>
## 4 Các màn hình và nút nghiệp vụ

Tiền tố BE của màn hình là `/api/erp/{module}`. GET `/screen` trả field definitions, action definitions và lookup bindings; GET `/actions?branchId=...` lấy nút lúc tạo mới; thêm documentId khi mở phiếu đã lưu. Detail đã có `data.actions` và `stateToken`.

| Màn hình và module | Form ERP và menu | header / lines / history / comparison | Nút được thực thi |
|---|---|---|---|
| Đề nghị mua hàng `purchase-requests` | AP_PurposeRequestListFrm / 05011 | 14 / 9 / — / — | Thêm, Lưu, Xóa, Dán; Gửi đề nghị; Gửi đặt mua hàng. |
| Quản lý đơn hàng `sales-orders` | AR_OrderByContractFrm / 0600201 | 54 / 27 / 7 / — | Thêm, Lưu, Xóa, Dán; Gửi PM; Thu hồi để sửa; Xem thông tin hợp đồng. |
| Đề nghị điều chuyển nội bộ `internal-transfer-requests` | IV_InternalTransferRequestFrm / 07010100 | 20 / 12 / 7 / — | Thêm, Lưu, Xóa, Dán; Gửi PM; Thu hồi để sửa. |
| Quét QR xuất kho `warehouse-qr` | IV_Output_QRCodeFrm / 0702001 | 25 / 9 / — / 26 | Quét thêm, Quét xóa trên phiếu đã có. |
| Quét QR xuất bán hàng `sales-qr` | AR_Invoice_QRCodeFrm / 0702010 | 71 / 9 / — / 49 | Quét thêm, Quét xóa; Xem thông tin hợp đồng. |
| Di chuyển bàn giao máy `machine-movements` | FA_Move2026Frm / 1207 | 18 / 23 / — / — | Thêm, Lưu, Xóa, Dán. |
| Sửa chữa bảo hành bảo trì máy `machine-repairs` | FA_Repair2026Frm / 1209 | 22 / 15 / — / — | Thêm, Lưu, Xóa, Dán. |

Tổng 417 field của bảy form, 106 binding dropdown và hai PM option route. Schema full fields, SQL column/type/nullable/writable nằm trong mục 12; binding cụ thể ở mục 13. Nguồn: [six-screen-catalog.json](../../inventories/erp/20261010/six-screen-catalog.json), [ErpScreenCatalog.cs](../../src/backend/Medcom.Contracts/ErpScreenCatalog.cs).

Mỗi action state gồm `id`, `caption`, `visible`, `enabled`, `reason`, `requiresSavedDocument`, `route`. `visible=false` thì ẩn; visible=true/enabled=false thì hiện nhưng khóa và giải thích reason. **id của nút native không nhất thiết là tên operation**: dùng `route` trả về hoặc operation trong `/screen`, không tự ghép route từ action.id. Route có thể còn được trả khi nút bị disabled; chỉ gọi khi enabled=true, và BE vẫn kiểm tra lại. Các nút in chưa có report runtime qualified có route=null; không có API report/print thực thi trong 119 endpoint.

Quyền Thêm cần native Add; Lưu/gửi/thu hồi/QR cần Update; Xóa cần Delete; xem hợp đồng cần Read. Không gửi quyền, visible/enabled, actor, trạng thái hoặc khóa từ FE để cấp quyền. Các reason thường gặp: native_permission_or_hidden, save_document_first, state_or_assignment_not_allowed, contract_missing, erp_write_unqualified, document_numbering_unqualified, contract_read_unqualified, report_runtime_unqualified. Nguồn: [ErpActionRules.cs](../../src/backend/Medcom.Application/ErpActionRules.cs), [ErpSqlAuthority.cs](../../src/backend/Medcom.Infrastructure/Erp/ErpSqlAuthority.cs).

### Điều kiện nút theo phiếu

| Màn hình | Thao tác và điều kiện | Kết quả hoặc lưu ý |
|---|---|---|
| Đề nghị mua hàng | Lưu/Xóa/Gửi đề nghị khi status 1 hoặc 4, chưa khóa. POST `/actions/submit`, payload `{}`. | Gửi đề nghị → status 2, khóa phiếu. Không có nút thu hồi riêng của form này trong nguồn hiện hành. |
| Đề nghị mua hàng | POST `/actions/send-purchase-order`, payload `{}`; status 3, có dòng, chưa liên kết AP_OrderID; cần PurchaseDate. | Tạo đơn đặt hàng mua AP_Order từ đề nghị và chuyển status 5. |
| Đơn hàng | Lưu khi người tạo, chưa khóa, status -1/11; Xóa chỉ -1. Gửi PM cùng trạng thái và có dòng. POST `/actions/send-pm`, payload `{pmId,notes}`. | Gửi → status 12, ghi SendTo/log. Web tạo mới status -1; default DB 0 không được suy ra là default tạo mới WinForms tương đương. |
| Đơn hàng | Thu hồi khi người tạo, chưa khóa, status 12. POST `/actions/recall`, payload `{}`. | → status 11, xóa SendTo, ghi log. |
| Điều chuyển | Lưu/Gửi PM khi SalesUser hiện tại, chưa khóa, status 0/30; gửi cần dòng RequestedQty > 0. Payload `{primaryPmId,supportingPmId,notes}`. | Gửi → status 10, ghi PM/log. Không chọn PM hỗ trợ thì gửi chuỗi rỗng; hai PM không được giống nhau. |
| Điều chuyển | Xóa chỉ status 0, chưa có batch. Thu hồi status 10, chưa khóa và chưa có batch. Payload thu hồi `{}`. | Thu hồi → status 0, xóa phân công/xác nhận và phê duyệt dòng theo nguồn. |
| Hai QR | POST `/qr/add` hoặc `/qr/delete` với barcode; phiếu chưa khóa. | Không có create/save/delete phiếu cha trên form QR; lựa chọn phiếu đã có từ list/detail. |
| Di chuyển máy | Thêm/Lưu/Xóa/Dán; ít nhất một máy, các máy phải cùng chi nhánh đã chọn. | Header không có BranchID; scope dựa trên máy. Trigger có thể đổi sở hữu/lifecycle: sau receipt tải lại máy. Không có gửi/thu hồi riêng trong form đã quan sát. |
| Sửa chữa máy | Thêm/Lưu/Xóa/Dán; ServiceTypeID hợp lệ; xóa bị khóa khi có phụ tùng đang liên kết. | Amount/PartsAmount readonly, giữ giá trị khi sửa; công thức tiền đầy đủ vẫn UNKNOWN. ServiceStatus theo binding OPEN/IN_PROGRESS/COMPLETED/CANCELLED. Không có gửi/thu hồi riêng trong form đã quan sát. |
| Đơn hàng và QR bán | GET `/contract-info?branchId=...&documentId=...`, cần contractId cùng scope. | Trả `data.documentId`, `data.contractId`, `data.fields`. Fields hợp đồng giữ **tên cột SQL nguyên gốc**, khác header camelCase; đã bỏ tên field nhạy cảm theo bộ lọc. |

QR thường `ItemID;ItemCode;Lot`, thêm một đơn vị mỗi lần scan. Mã kiện `PKG1;<GUID>` dùng số lượng từ CF_QRPackageTbl; không thêm cùng kiện hai lần vào một phiếu. Mã thường có thể được scan lặp hợp lệ; chống double-submit bằng idempotencyKey, không tự deduplicate theo barcode. Xóa mã thường xóa một dòng khớp, xóa mã kiện theo kiện. Kiểm tra lô/hàng/số lượng theo native CF_QRcodeStp và khóa Web. Không tự thay procedure quét bằng API generic.

Năm nút in nguồn của đề nghị mua hàng: In đề xuất mua hàng; In BB giao nhận hàng hóa; In BB không phù hợp; In ĐN phê duyệt HĐ/ĐH; In BB kiểm nhập kho HH. Quét xuất kho cũng có nút in QR nguồn. FE có thể trình bày nút từ metadata nhưng phải giữ trạng thái unavailable và không tạo URL báo cáo chưa có.

Nguồn điều kiện và effects: [BE_FE_SIX_SCREEN_COMMANDS_20261010.md](BE_FE_SIX_SCREEN_COMMANDS_20261010.md), [SqlErpScreenEffects.cs](../../src/backend/Medcom.Infrastructure/Erp/SqlErpScreenEffects.cs), [SqlErpScreenContract.cs](../../src/backend/Medcom.Infrastructure/Erp/SqlErpScreenContract.cs), catalog trên; các phần cuối hướng dẫn cũ về journal chưa cài đã được thay bằng bằng chứng kích hoạt ở mục 1.

<a id="ghi-du-lieu"></a>
## 5 CUD trạng thái đồng thời và tra cứu kết quả

Create/save/delete có ở năm module không phải QR. Body phải là DTO nhập của đúng module; không gửi object GET detail nguyên xi. Giới hạn body ERP 1 MiB JSON UTF-8, depth 16; tối đa 500 dòng nghiệp vụ. BE tự cấp số phiếu/LineID, chủ sở hữu, branch nguồn, trạng thái, audit và giá trị tính. Header Save là bộ field nhập đầy đủ của form, không phải PATCH tùy ý; không bỏ field hiện có khi serialize rồi vô tình đặt nó thành null/default.

| POST suffix | Body | Kết quả |
|---|---|---|
| `/create` | `{idempotencyKey,branchId,header,lines:[{clientLineKey,values}]}` | Cấp documentId/lineId; receipt allocatedLines map draft line sang dòng DB. |
| `/save` | `{idempotencyKey,branchId,documentId,expectedStateToken,header,lineChanges}` | Lưu header và Add/Update/Remove theo đúng scope/trạng thái; receipt trả stateToken mới. |
| `/delete` | `{idempotencyKey,branchId,documentId,expectedStateToken}` | Xóa phiếu nếu được phép; receipt deleted=true. |
| `/actions/{operation}` | `{idempotencyKey,branchId,documentId,expectedStateToken,payload}` | Chuyển nghiệp vụ, payload riêng theo bảng mục 4. |
| `/qr/add` hoặc `/qr/delete` | `{idempotencyKey,branchId,documentId,expectedStateToken,barcode}` | Ghi/xóa scan, receipt như command ERP. |
| `/commands/lookup` | `{operation,originalIntent:<toàn bộ body ban đầu>}` | Chỉ quan sát: `data.outcome` Committed/Absent/Unknown, cùng receipt khi có. |

`operation` dùng create/save/delete/submit/send-purchase-order/send-pm/recall/**scan-add/scan-delete** đúng module. Với QR, operation lookup là scan-add hoặc scan-delete, không phải suffix add/delete. Idempotency key là chuỗi ASCII hợp lệ tối đa 100 ký tự; UUID do FE sinh là lựa chọn phù hợp. ClientLineKey tối đa 64 ký tự, không trùng trong command. State token là 64 hex thường; lấy từ detail mới nhất, không tự tính từ một trang FE.

Create yêu cầu ngày có giá trị: `header.purchaseDate` ở đề nghị mua hàng; `header.documentDate` ở bốn form tạo còn lại. Ví dụ tổng hợp sau mô tả đúng cấu trúc, các reference phải được thay bằng lựa chọn hợp lệ của user:

```json
{
  "idempotencyKey": "11111111-1111-4111-8111-111111111111",
  "branchId": "SYNTHETIC-BRANCH",
  "header": {
    "purchaseDate": "2026-10-10T00:00:00.000",
    "purposeId": null,
    "personSuggest": "Synthetic requester",
    "department": "Synthetic department",
    "purposeDescOrClient": null,
    "price": null,
    "notes": null,
    "currencyId": "SYN",
    "objectId": "SYNTHETIC-OBJECT",
    "rateExchange": 1
  },
  "lines": [
    {
      "clientLineKey": "draft-line-1",
      "values": {
        "itemId": "SYNTHETIC-ITEM",
        "budget": null,
        "timeRequired": null,
        "quantity": "1",
        "unitPrice": "100",
        "model": null
      }
    }
  ]
}
```

Ví dụ lineChanges của **purchase-requests**; các module khác dùng schema values riêng:

```json
[
  {"kind":"Add","clientLineKey":"draft-line-2","values":{"itemId":"SYNTHETIC-ITEM","quantity":"1","unitPrice":"100"}},
  {"kind":"Update","lineId":"SYNTHETIC-SAVED-LINE-1","values":{"itemId":"SYNTHETIC-ITEM","quantity":"2","unitPrice":"100"}},
  {"kind":"Remove","lineId":"SYNTHETIC-SAVED-LINE-2"}
]
```

Add không có lineId; Update/Remove có lineId và không có clientLineKey; Remove không có values. Một lineId không được dùng hai lần trong cùng command. `TotalPrice` đề nghị mua hàng do BE tính; đơn hàng cũng có các computed fields. Tra writable trong field schema và input DTO; writable không loại bỏ điều kiện quyền/trạng thái.

HTTP 200 command ERP chỉ dành cho `outcome="Committed"` hoặc `"Replayed"`. Response trực tiếp `{outcome,code,receipt}`, **không bọc data**. Receipt gồm module, operation, idempotencyKey, documentId, stateToken, auditId, deleted, allocatedLines. Sau thành công cập nhật draft→lineId, tải detail/actions mới. Nếu deleted=true, đóng phiếu rồi refresh list.

Mỗi thao tác mới có key mới. Retry giữ nguyên key và **toàn bộ ý định ban đầu**, kể cả expectedStateToken. Khi timeout/mất kết nối/OutcomeUnknown, tra commands/lookup trước; không tự báo thất bại chưa ghi, tạo key mới hay đổi token dưới key cũ. `Absent` không cấp quyền thay đổi intent; vẫn phải giữ quy trình quyền và kiểm tra trạng thái. `Unknown` giữ trạng thái cần đối chiếu. Với Conflict document_state_changed, đọc lại và để người dùng kiểm tra trước khi gửi ý định mới.

StateToken bao gồm header, toàn bộ dòng nghiệp vụ và comparison, không chỉ trang hiện tại; history readonly không thuộc token. Aggregate vượt 500 dòng nghiệp vụ hoặc QR vượt 10000 scan/500 comparison sẽ khóa command, không cắt dữ liệu rồi ghi. SQL effects và journal cùng transaction; schema drift/procedure hash drift làm command không khả dụng cho đến khi xử lý vận hành. Đây là kiểm tra hợp lệ, không phải yêu cầu FE tự bật writer.

Nguồn: [ErpCommandRules.cs](../../src/backend/Medcom.Application/ErpCommandRules.cs), [SqlErpScreenCommands.cs](../../src/backend/Medcom.Infrastructure/Erp/SqlErpScreenCommands.cs), [ERP_WRITE_RUNTIME_SETUP_20261010.md](ERP_WRITE_RUNTIME_SETUP_20261010.md), [ErpScreens.cs](../../src/backend/Medcom.Contracts/ErpScreens.cs). Journal đã cài theo receipt mục 1; không cần FE chạy script cài DB.

<a id="danh-sach-chon"></a>
## 6 Dropdown chọn dữ liệu và dán bảng

POST `/api/erp/{module}/options` lấy dropdown/dropselect. `lookupId` giữ exact case tên nguồn, ví dụ header.CurrencyID, lines.ItemID, lines.AssetID. `context` chỉ chứa key trong parameters/requiredParameters của binding; không gửi toàn bộ header vào context. Body ví dụ cho **sales-orders**:

```json
{"branchId":"SYNTHETIC-BRANCH","lookupId":"lines.ItemID","page":1,"pageSize":20,"search":"SYNTHETIC","context":{"ContractID":"SYNTHETIC-CONTRACT"}}
```

Response `{readScope,data:{items,page,pageSize,hasMore,requiredParameters}}`. `items[].id` là giá trị chọn; label để hiển thị; fields giữ tên cột native của kết quả lookup và linked columns. Không áp dụng camelCase header vào dictionary lookup. Khi field phụ thuộc đổi, xóa selection/linked fields không còn hợp lệ và nạp lại. Nullable label không cấp quyền dùng ID ngoài scope. Binding disabled/đổi hash/không an toàn hoặc vượt giới hạn tập lựa chọn trả unavailable, không giả một trang hết dữ liệu.

Gửi PM có hai route POST `/actions/send-pm/options`:

| Module | Body và scope |
|---|---|
| sales-orders | `{branchId,role:"primary",page:1,pageSize:20,search:null}`; chỉ role primary. |
| internal-transfer-requests | role primary hoặc supporting; PM chính thuộc branch sở hữu hoặc SY_UserBranch; PM hỗ trợ đang hoạt động. |

PM options chỉ trả UserName/HoTen/BranchID được phép, không password/token. Với điều chuyển, procedure kiểm tra PM chính theo BranchID sở hữu phiếu; dropdown WinForms phụ thuộc FromBranchID. Khi hai branch khác nhau, nghiệm thu UX/ERP còn UNKNOWN; dùng options và lỗi BE hiện hành.

POST `/selection` lấy dữ liệu nguồn sang nháp hiện tại:

```json
{"branchId":"SYNTHETIC-BRANCH","sourceId":"items","selectedKeys":["SYNTHETIC-ITEM"],"context":{}}
```

| Module | sourceId | Context |
|---|---|---|
| purchase-requests, internal-transfer-requests | items | Chỉ context được source cho phép. |
| sales-orders | contract-items | ContractID, chọn hàng thuộc hợp đồng; dữ liệu lấy lại từ WA_OrderByContract_GetItemStp. |
| machine-movements, machine-repairs | machines | Máy trong scope branch. |

Tối đa 500 key, không trùng. Response `data.lines`, `headerPatch`, `sourceEvidence`, `revalidatedOnSave=true`; FE điền giá/số lượng/reference còn thiếu rồi mới lưu. Selection không ghi chứng từ. POST `/paste/validate` nhận `{branchId,rows:[<values đúng module>]}`, kiểm tra kiểu/field và cấp clientLineKey. Đây là bước dán CSV/clipboard/Excel do FE map thành JSON, không phải upload file XLSX vào BE.

Copy phiếu có thể đọc detail, lấy toàn bộ các trang cần copy, giữ **chỉ** field writable phù hợp input DTO, bỏ document/line ID/audit/trạng thái/computed và tạo clientLineKey mới trước create. Hiện không có route copy toàn phiếu riêng, không có import XLSX server-side hay generic SQL/tên bảng. Các nút lấy chứng từ khác ngoài items/contract-items/machines còn UNKNOWN về typed nguồn/API; không suy ra selection hiện hành đã bao phủ toàn ERP. QR không có selection/paste/validate như năm form tạo.

Nguồn: [SqlErpScreenLookups.cs](../../src/backend/Medcom.Infrastructure/Erp/SqlErpScreenLookups.cs), [ErpLookupSql.cs](../../src/backend/Medcom.Infrastructure/Erp/ErpLookupSql.cs), [ErpScreenEndpoints.cs](../../src/backend/Medcom.Api/ErpScreenEndpoints.cs), binding tại mục 13.

<a id="doc-tuong-thich"></a>
## 7 Đọc đơn đặt hàng mua và yêu cầu nhập kho

Cả original và v2 hiện đều có full fields. V2 có thêm filter/sort list; giữ route/schema cặp tương ứng, không dùng parser cũ rồi bỏ object full. Có 118 field nguồn của ba nhóm tương thích: purchase-orders 19 header/12 line; inbound-requests 38 header/26 line; purchase-requests 14 header/9 line. Count đã gồm LinkID/ParentID của snapshot 2026-10-10 và có phần trùng với đề nghị mua hàng trong bảy màn hình; không cộng hai count thành tổng số cột duy nhất.

| Dữ liệu | GET list v2 | GET detail v2 |
|---|---|---|
| Đơn đặt hàng mua | `/api/v2/documents/purchase-orders` | `/api/v2/documents/purchase-orders/detail?documentId=...&page=1&pageSize=50` |
| Yêu cầu nhập kho | `/api/v2/documents/inbound-requests` | `/api/v2/documents/inbound-requests/detail?documentId=...&page=1&pageSize=50` |
| Đề nghị mua hàng tương thích | `/api/v2/purchase-requests` | `/api/v2/purchase-requests/detail?documentId=...` |

Original list chỉ page, pageSize, search, branchId. V2 list thêm dateFrom/dateTo (yyyy-MM-dd, ngày cuối bao gồm), statusId (signed int), sortBy=documentDate/documentId/statusId, sortDirection=asc/desc. Mặc định sort documentDate desc, tie ID asc; sort ID theo byte nguồn. PurchaseDate là date column của đề nghị mua hàng. Status filter không cấp quyền chuyển trạng thái. Detail purchase/inbound không nhận branchId hoặc list filter; authority được BE lấy từ phiếu. Detail đề nghị mua hàng cũ không nhận page/pageSize/branchId.

GET `/api/documents/field-contract?kind=...` trả từng SQL column, JSON path/type/nullability; GET `/api/documents/query-contract?kind=...` trả giới hạn và sort/filter. kind là purchase-orders/inbound-requests/purchase-requests, cần capability đọc tương ứng. Giữ cả compatibility scalar lẫn full object; tránh hiển thị lỗi provider/permission thành danh sách rỗng. Detail đề nghị mua hàng tương thích vượt 500 dòng trả unavailable; nhóm `/api/erp` vẫn dùng trang đọc và giới hạn command riêng.

Lookup tương thích GET `/api/purchase-requests/lookup` dùng kind cố định, page/search; các lựa chọn qualified thực tế và input chính xác ở schema/endpoint. Màn hình mới dùng `/api/erp/purchase-requests/options` cùng 10 binding đầy đủ. Các command Save/Submit facade cũ và nháp nhập kho chưa có provider vận hành như mục 1; tài liệu liệt kê để FE nhận biết consumer cũ, không ghi nhận chúng là CUD đang mở.

Nguồn: [document-field-contract.json](document-field-contract.json), [DocumentListBinding.cs](../../src/backend/Medcom.Api/DocumentListBinding.cs), [BE_FE_FULL_FIELDS_INTEGRATION_20261010.md](BE_FE_FULL_FIELDS_INTEGRATION_20261010.md), `inventories/source/20261010/source-set.json`. Các số 116/37/25 trong tài liệu lịch sử trước snapshot mới không phải count hiện hành.

<a id="thong-bao"></a>
## 8 Thông báo và mở chứng từ

GET `/api/notifications?page=1&pageSize=30&unreadOnly=false` lấy SY_NotifyMsgTbl của user đang đăng nhập: **ToUserID = UserName chuẩn của SY_User**. Chỉ IsActive=1/ShowWeb=1, thứ tự ID giảm dần; không lọc ExpireAt theo native Web list. FE không gửi recipient/username/actor. `totalRows` theo unreadOnly, `unreadCount` đếm mọi thông báo Web chưa xem của user.

Mỗi row có đủ 22 keys: id, fromUserId, toUserId, title, message, msgTime, notifyType, colorHex, sourceSystem, erpFormName, webFormName, webRoute, documentId, orderNo, statusId, isView, viewDate, isActive, showErp, showWeb, expireAt, eventKey. Null vẫn có key; render title/message thành text. Notification id là integer dương, khác khóa chứng từ documentId.

Khi bấm thông báo:

1. GET `/api/notifications/{id}` nếu cần đọc đầy đủ.
2. GET `/api/notifications/{id}/target`. Khi `data.canOpen=true`, dùng moduleId/formId chọn renderer FE, branchId chọn context, documentId lọc phiếu và tải `detailApi` qua BFF. DetailApi là path BE, không phải URL browser đã thêm BFF prefix.
3. POST `/api/notifications/{id}/read` với `{ "isView": true }`, cookie/CSRF/Origin/readScope. Response là row SQL sau cập nhật trong `{readScope,data}`. Đánh dấu chưa xem dùng false; true lặp giữ ViewDate đầu, false xóa ViewDate.
4. Reload list để cập nhật unreadCount. Timeout/outcome_unknown thì GET detail đối chiếu IsView/ViewDate, không báo đã ghi từ lỗi kết nối.

| formId | moduleId và detail |
|---|---|
| AP_PurposeRequestListFrm | purchase-requests → `/api/erp/purchase-requests/detail` |
| AR_OrderByContractFrm | sales-orders → `/api/erp/sales-orders/detail` |
| IV_InternalTransferRequestFrm | internal-transfer-requests → `/api/erp/internal-transfer-requests/detail` |
| IV_Output_QRCodeFrm | warehouse-qr → `/api/erp/warehouse-qr/detail` |
| AR_Invoice_QRCodeFrm | sales-qr → `/api/erp/sales-qr/detail` |
| FA_Move2026Frm | machine-movements → `/api/erp/machine-movements/detail` |
| FA_Repair2026Frm | machine-repairs → `/api/erp/machine-repairs/detail` |
| AP_OrderFrm | purchase-orders → `/api/documents/purchase-orders/detail` |
| IV_InboundRequestFrm | inbound-requests → `/api/documents/inbound-requests/detail` |

BE kiểm tra quyền phiếu qua detail reader, không cấp quyền chỉ vì user nhận thông báo. DocumentID truyền nguyên khóa; đề nghị mua hàng ánh xạ documentId vào PurchaseRequestID, không dùng OrderNo thay thế. Không thực thi WebRoute thô, không nối SQL/tên bảng từ notification. Form khác hoặc mapping mâu thuẫn trả canOpen=false, reason và null navigation fields.

Các reason đóng đích: notification_document_missing, notification_form_unsupported, notification_form_ambiguous, notification_document_denied, notification_document_not_found, notification_document_ambiguous, notification_document_unavailable. FE vẫn hiển thị nội dung và lý do chưa mở được. AP_BPTMShipmentsFrm chưa có typed detail API/mapping được xác nhận: [issue 135](https://github.com/thanhtuyen662002/Medcom/issues/135). Không có poll/WebSocket/SSE endpoint trong catalog; FE tự reload khi thao tác hoặc dùng chu kỳ polling sản phẩm quyết định.

Nguồn: [NotificationEndpoints.cs](../../src/backend/Medcom.Api/NotificationEndpoints.cs), [SqlNotificationQueries.cs](../../src/backend/Medcom.Infrastructure/SqlNotificationQueries.cs), [notification-api-source.json](../../inventories/source/20261010/notification-api-source.json), [NOTIFICATIONS_FE_HANDOFF_20261010.md](NOTIFICATIONS_FE_HANDOFF_20261010.md); SY_NotifyListStp/SY_NotifyMarkReadStp giữ nội dung SQL riêng.

<a id="loi-va-fe"></a>
## 9 Lỗi và hướng dẫn triển khai FE

| HTTP hoặc outcome | FE xử lý |
|---|---|
| 200 | Đọc envelope đúng route. Command chỉ ghi thành công khi Committed/Replayed và có receipt; facade cũ có thể trả outcome unavailable dưới 200. |
| 204 | Logout thành công; bỏ dữ liệu/phiên phía FE. |
| 400 | Sai query/JSON/reference/ý định; hiển thị lỗi nhập. notification_target_changed: đọc lại thông báo. |
| 401 | Chưa có hoặc hết phiên; đăng nhập lại và bỏ scope/cache cũ. |
| 403 | Thiếu quyền, csrf_invalid hoặc origin_rejected; không cố gọi nút disabled. Refresh CSRF khi thích hợp. |
| 404 | Phiếu/thông báo/reference không tồn tại hoặc ngoài scope; không suy ra người nhận khác từ thông báo này. |
| 409 erp_scope_changed | Reload session/workspace, bỏ evidence cũ rồi chuẩn bị ý định mới. |
| 409 document_state_changed | Detail/actions mới; cho user đối chiếu trước ý định mới. |
| 409 erp_command_busy | Lookup ý định gốc; nếu retry phải giữ nguyên key/body. |
| 409 document_number_exhausted | Hết dải số tháng; cần người vận hành xử lý, không tự quay về số đầu. |
| OutcomeUnknown hoặc lỗi mạng | ERP command: lookup key/intent gốc; notification: GET row để đối chiếu. |
| 413 / 415 | Body vượt giới hạn hoặc sai Content-Type; chia dữ liệu/đổi JSON đúng contract. |
| 429 | Login bị giới hạn; backoff theo UX, không retry dồn dập. |
| 503 | Provider/schema/source/dependency chưa khả dụng; giữ lỗi rõ ràng, không thay bằng trang rỗng/thành công. Readiness 503 riêng không khóa toàn giao diện. |
| 500 / proxy 502 / 504 | Ghi nhận X-Correlation-ID nếu có; đối chiếu kết quả command trước gửi lại. |

ProblemDetails thường có type/title/status/detail/instance và code/correlationId tùy boundary. Lỗi command ERP có thể trả `{outcome,code,receipt}` thay ProblemDetails; đọc cả hai. Không dựa vào SQL exception text riêng tư. Response no-store; không cache dùng chung dữ liệu giữa user/branch/scope.

Trình tự triển khai một màn hình: auth/workspace → screen → list → detail/actions → options/selection/paste → create/save/action/scan → kiểm tra receipt → detail/actions/list mới. Cần giữ toàn bộ field response trong parser; grid chọn cột hiển thị không được làm mất cột khỏi model. Dropdown theo phụ thuộc, chọn PM theo route riêng và trạng thái nút đều lấy từ BE. Khi thông báo mở phiếu, cùng renderer và detail loader của màn hình đó được sử dụng.

Phần đã bật ghi không đồng nghĩa toàn ERP hoàn tất. Report/export, màn hình duyệt PM/SA khác, toàn bộ nguồn import chứng từ, AP_BPTMShipmentsFrm, các khác biệt trạng thái/default/scope máy/khóa QR/PM branch, đầy đủ tính tiền sửa chữa, tải/concurrency writer WinForms và nghiệm thu nghiệp vụ thật còn được theo dõi trong goal 45. Không có route giả cho các mục chưa triển khai.

Các mục dưới là bảng tra cứu đầy đủ được tạo từ contract đã đối chiếu live. Schema input cần kết hợp quy tắc runtime ở mục 3–6; OpenAPI không thay thế kiểm tra quyền/reference/trạng thái. Một số dictionary như hợp đồng/lookup giữ schema động được giới hạn bởi nguồn native, và được nêu riêng để FE không đoán tên field.


<a id="danh-muc-api"></a>
## 10 Danh mục đầy đủ 119 API

Mỗi dòng là một method/path đã đăng ký. Liên kết operation mở phần tham số/body/response bên dưới. Các path được liệt kê là path BE; BFF prefix theo mục 2. Không dùng cùng body cho hai nhóm route chỉ vì tên màn hình giống nhau.

| Nhóm | Số operation |
|---|---|
| platform-auth | 10 |
| notifications | 4 |
| documents-compatible | 10 |
| purchase-requests-compatible | 10 |
| inbound-draft-compatible | 4 |
| internal-transfer-requests | 14 |
| machine-movements | 11 |
| machine-repairs | 11 |
| purchase-requests | 13 |
| sales-orders | 15 |
| sales-qr | 9 |
| warehouse-qr | 8 |
| **Tổng** | **119** |

| STT | Method | Path BE | Operation và công dụng | Tình trạng |
|---|---|---|---|---|
| 1 | GET | `/health/live` | [healthLive](#api-healthlive) — Liveness process | Provider/authority hiện hành; xem mục 1 |
| 2 | GET | `/health/ready` | [healthReady](#api-healthready) — Readiness business release | 503 business release gate |
| 3 | GET | `/api/contracts/openapi.json` | [openApiContract](#api-openapicontract) — Contract OpenAPI của BE | Provider/authority hiện hành; xem mục 1 |
| 4 | GET | `/api/notifications` | [notificationList](#api-notificationlist) — Danh sách thông báo riêng có phân trang | SQL native; đích giới hạn chín form |
| 5 | GET | `/api/notifications/{id}` | [notificationDetail](#api-notificationdetail) — Chi tiết thông báo riêng | SQL native; đích giới hạn chín form |
| 6 | GET | `/api/notifications/{id}/target` | [notificationTarget](#api-notificationtarget) — Resolve đích mở form và quyền phiếu | SQL native; đích giới hạn chín form |
| 7 | POST | `/api/notifications/{id}/read` | [notificationSetRead](#api-notificationsetread) — Ghi đã xem/chưa xem | SQL native; đích giới hạn chín form |
| 8 | GET | `/api/platform/metadata` | [platformMetadata](#api-platformmetadata) — Metadata platform tương thích | Provider/authority hiện hành; xem mục 1 |
| 9 | GET | `/api/auth/csrf` | [authCsrf](#api-authcsrf) — Lấy CSRF token/cookie | Provider/authority hiện hành; xem mục 1 |
| 10 | POST | `/api/auth/login` | [authLogin](#api-authlogin) — Đăng nhập tài khoản ERP | Provider/authority hiện hành; xem mục 1 |
| 11 | GET | `/api/auth/session` | [authSession](#api-authsession) — Đọc phiên | Provider/authority hiện hành; xem mục 1 |
| 12 | POST | `/api/auth/session/continue` | [authContinue](#api-authcontinue) — Gia hạn idle phiên | Provider/authority hiện hành; xem mục 1 |
| 13 | POST | `/api/auth/logout` | [authLogout](#api-authlogout) — Thu hồi phiên | Provider/authority hiện hành; xem mục 1 |
| 14 | GET | `/api/workspace` | [workspace](#api-workspace) — Phiên, navigation, branchIds, branchSelection | Provider/authority hiện hành; xem mục 1 |
| 15 | GET | `/api/documents/field-contract` | [documentFieldContract](#api-documentfieldcontract) — Metadata cột nguồn và JSON path | Provider/authority hiện hành; xem mục 1 |
| 16 | GET | `/api/documents/query-contract` | [documentQueryContract](#api-documentquerycontract) — Metadata filter/sort/paging list v2 | Provider/authority hiện hành; xem mục 1 |
| 17 | GET | `/api/documents/purchase-orders` | [purchaseordersLegacyList](#api-purchaseorderslegacylist) — Danh sách full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 18 | GET | `/api/documents/purchase-orders/detail` | [purchaseordersLegacyDetail](#api-purchaseorderslegacydetail) — Chi tiết full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 19 | GET | `/api/v2/documents/purchase-orders` | [purchaseordersV2List](#api-purchaseordersv2list) — Danh sách full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 20 | GET | `/api/v2/documents/purchase-orders/detail` | [purchaseordersV2Detail](#api-purchaseordersv2detail) — Chi tiết full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 21 | GET | `/api/documents/inbound-requests` | [inboundrequestsLegacyList](#api-inboundrequestslegacylist) — Danh sách full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 22 | GET | `/api/documents/inbound-requests/detail` | [inboundrequestsLegacyDetail](#api-inboundrequestslegacydetail) — Chi tiết full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 23 | GET | `/api/v2/documents/inbound-requests` | [inboundrequestsV2List](#api-inboundrequestsv2list) — Danh sách full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 24 | GET | `/api/v2/documents/inbound-requests/detail` | [inboundrequestsV2Detail](#api-inboundrequestsv2detail) — Chi tiết full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 25 | GET | `/api/purchase-requests` | [purchaseRequestListLegacy](#api-purchaserequestlistlegacy) — Danh sách full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 26 | GET | `/api/purchase-requests/detail` | [purchaseRequestDetailLegacy](#api-purchaserequestdetaillegacy) — Chi tiết full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 27 | GET | `/api/v2/purchase-requests` | [purchaseRequestListV2](#api-purchaserequestlistv2) — Danh sách full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 28 | GET | `/api/v2/purchase-requests/detail` | [purchaseRequestDetailV2](#api-purchaserequestdetailv2) — Chi tiết full field tương thích | Provider/authority hiện hành; xem mục 1 |
| 29 | GET | `/api/purchase-requests/workspace` | [purchaseRequestWorkspace](#api-purchaserequestworkspace) — Workspace đề nghị mua hàng tương thích | Provider/authority hiện hành; xem mục 1 |
| 30 | GET | `/api/purchase-requests/lookup` | [purchaseRequestLookup](#api-purchaserequestlookup) — Lookup đề nghị mua hàng tương thích | Provider/authority hiện hành; xem mục 1 |
| 31 | POST | `/api/purchase-requests/save` | [purchaseRequestsaveCommand](#api-purchaserequestsavecommand) — Command facade cũ, provider unavailable | UNAVAILABLE trong startup; xem mục 1 |
| 32 | POST | `/api/purchase-requests/save/lookup` | [purchaseRequestsaveLookup](#api-purchaserequestsavelookup) — Tra cứu command facade cũ | UNAVAILABLE trong startup; xem mục 1 |
| 33 | POST | `/api/purchase-requests/submit` | [purchaseRequestsubmitCommand](#api-purchaserequestsubmitcommand) — Command facade cũ, provider unavailable | UNAVAILABLE trong startup; xem mục 1 |
| 34 | POST | `/api/purchase-requests/submit/lookup` | [purchaseRequestsubmitLookup](#api-purchaserequestsubmitlookup) — Tra cứu command facade cũ | UNAVAILABLE trong startup; xem mục 1 |
| 35 | GET | `/api/inbound-requests/draft` | [inboundDraftRead](#api-inbounddraftread) — Facade nhập kho cũ, provider unavailable | UNAVAILABLE trong startup; xem mục 1 |
| 36 | POST | `/api/inbound-requests/draft/save` | [inboundDraftsave](#api-inbounddraftsave) — Facade nhập kho cũ, provider unavailable | UNAVAILABLE trong startup; xem mục 1 |
| 37 | POST | `/api/inbound-requests/draft/send-to-warehouse` | [inboundDraftsendtowarehouse](#api-inbounddraftsendtowarehouse) — Facade nhập kho cũ, provider unavailable | UNAVAILABLE trong startup; xem mục 1 |
| 38 | POST | `/api/inbound-requests/draft/reconcile` | [inboundDraftreconcile](#api-inbounddraftreconcile) — Facade nhập kho cũ, provider unavailable | UNAVAILABLE trong startup; xem mục 1 |
| 39 | GET | `/api/erp/internal-transfer-requests/screen` | [internal_transfer_requests_screen](#api-internal_transfer_requests_screen) — Metadata field/action/dropdown form | Reader native/profile hiện hành |
| 40 | GET | `/api/erp/internal-transfer-requests` | [internal_transfer_requests_list](#api-internal_transfer_requests_list) — Danh sách full header theo trang | Reader native/profile hiện hành |
| 41 | GET | `/api/erp/internal-transfer-requests/detail` | [internal_transfer_requests_detail](#api-internal_transfer_requests_detail) — Chi tiết full field và các trang section | Reader native/profile hiện hành |
| 42 | GET | `/api/erp/internal-transfer-requests/actions` | [internal_transfer_requests_actions](#api-internal_transfer_requests_actions) — Trạng thái nút theo user/phiếu | Reader native/profile hiện hành |
| 43 | POST | `/api/erp/internal-transfer-requests/options` | [internal_transfer_requests_options](#api-internal_transfer_requests_options) — Lựa chọn dropdown/dropselect | Reader native/profile hiện hành |
| 44 | POST | `/api/erp/internal-transfer-requests/actions/send-pm/options` | [internal_transfer_requests_pm_options](#api-internal_transfer_requests_pm_options) — Danh sách PM theo role/branch | Reader native/profile hiện hành |
| 45 | POST | `/api/erp/internal-transfer-requests/commands/lookup` | [internal_transfer_requests_command_lookup](#api-internal_transfer_requests_command_lookup) — Tra cứu receipt ý định gốc, không ghi | Reader native/profile hiện hành |
| 46 | POST | `/api/erp/internal-transfer-requests/selection` | [internal_transfer_requests_selection](#api-internal_transfer_requests_selection) — Đọc nguồn chọn sang dòng nháp | Reader native/profile hiện hành |
| 47 | POST | `/api/erp/internal-transfer-requests/paste/validate` | [internal_transfer_requests_paste_validate](#api-internal_transfer_requests_paste_validate) — Kiểm tra bảng dán, không ghi | Reader native/profile hiện hành |
| 48 | POST | `/api/erp/internal-transfer-requests/create` | [internal_transfer_requests_create](#api-internal_transfer_requests_create) — Tạo phiếu và cấp số/LineID | SQL ghi đã bật; quyền/trạng thái recheck |
| 49 | POST | `/api/erp/internal-transfer-requests/save` | [internal_transfer_requests_save](#api-internal_transfer_requests_save) — Lưu header và thay đổi dòng | SQL ghi đã bật; quyền/trạng thái recheck |
| 50 | POST | `/api/erp/internal-transfer-requests/delete` | [internal_transfer_requests_delete](#api-internal_transfer_requests_delete) — Xóa phiếu được phép | SQL ghi đã bật; quyền/trạng thái recheck |
| 51 | POST | `/api/erp/internal-transfer-requests/actions/recall` | [internal_transfer_requests_recall](#api-internal_transfer_requests_recall) — Thu hồi để sửa | SQL ghi đã bật; quyền/trạng thái recheck |
| 52 | POST | `/api/erp/internal-transfer-requests/actions/send-pm` | [internal_transfer_requests_send_pm](#api-internal_transfer_requests_send_pm) — Gửi phiếu tới PM | SQL ghi đã bật; quyền/trạng thái recheck |
| 53 | GET | `/api/erp/machine-movements/screen` | [machine_movements_screen](#api-machine_movements_screen) — Metadata field/action/dropdown form | Reader native/profile hiện hành |
| 54 | GET | `/api/erp/machine-movements` | [machine_movements_list](#api-machine_movements_list) — Danh sách full header theo trang | Reader native/profile hiện hành |
| 55 | GET | `/api/erp/machine-movements/detail` | [machine_movements_detail](#api-machine_movements_detail) — Chi tiết full field và các trang section | Reader native/profile hiện hành |
| 56 | GET | `/api/erp/machine-movements/actions` | [machine_movements_actions](#api-machine_movements_actions) — Trạng thái nút theo user/phiếu | Reader native/profile hiện hành |
| 57 | POST | `/api/erp/machine-movements/options` | [machine_movements_options](#api-machine_movements_options) — Lựa chọn dropdown/dropselect | Reader native/profile hiện hành |
| 58 | POST | `/api/erp/machine-movements/commands/lookup` | [machine_movements_command_lookup](#api-machine_movements_command_lookup) — Tra cứu receipt ý định gốc, không ghi | Reader native/profile hiện hành |
| 59 | POST | `/api/erp/machine-movements/selection` | [machine_movements_selection](#api-machine_movements_selection) — Đọc nguồn chọn sang dòng nháp | Reader native/profile hiện hành |
| 60 | POST | `/api/erp/machine-movements/paste/validate` | [machine_movements_paste_validate](#api-machine_movements_paste_validate) — Kiểm tra bảng dán, không ghi | Reader native/profile hiện hành |
| 61 | POST | `/api/erp/machine-movements/create` | [machine_movements_create](#api-machine_movements_create) — Tạo phiếu và cấp số/LineID | SQL ghi đã bật; quyền/trạng thái recheck |
| 62 | POST | `/api/erp/machine-movements/save` | [machine_movements_save](#api-machine_movements_save) — Lưu header và thay đổi dòng | SQL ghi đã bật; quyền/trạng thái recheck |
| 63 | POST | `/api/erp/machine-movements/delete` | [machine_movements_delete](#api-machine_movements_delete) — Xóa phiếu được phép | SQL ghi đã bật; quyền/trạng thái recheck |
| 64 | GET | `/api/erp/machine-repairs/screen` | [machine_repairs_screen](#api-machine_repairs_screen) — Metadata field/action/dropdown form | Reader native/profile hiện hành |
| 65 | GET | `/api/erp/machine-repairs` | [machine_repairs_list](#api-machine_repairs_list) — Danh sách full header theo trang | Reader native/profile hiện hành |
| 66 | GET | `/api/erp/machine-repairs/detail` | [machine_repairs_detail](#api-machine_repairs_detail) — Chi tiết full field và các trang section | Reader native/profile hiện hành |
| 67 | GET | `/api/erp/machine-repairs/actions` | [machine_repairs_actions](#api-machine_repairs_actions) — Trạng thái nút theo user/phiếu | Reader native/profile hiện hành |
| 68 | POST | `/api/erp/machine-repairs/options` | [machine_repairs_options](#api-machine_repairs_options) — Lựa chọn dropdown/dropselect | Reader native/profile hiện hành |
| 69 | POST | `/api/erp/machine-repairs/commands/lookup` | [machine_repairs_command_lookup](#api-machine_repairs_command_lookup) — Tra cứu receipt ý định gốc, không ghi | Reader native/profile hiện hành |
| 70 | POST | `/api/erp/machine-repairs/selection` | [machine_repairs_selection](#api-machine_repairs_selection) — Đọc nguồn chọn sang dòng nháp | Reader native/profile hiện hành |
| 71 | POST | `/api/erp/machine-repairs/paste/validate` | [machine_repairs_paste_validate](#api-machine_repairs_paste_validate) — Kiểm tra bảng dán, không ghi | Reader native/profile hiện hành |
| 72 | POST | `/api/erp/machine-repairs/create` | [machine_repairs_create](#api-machine_repairs_create) — Tạo phiếu và cấp số/LineID | SQL ghi đã bật; quyền/trạng thái recheck |
| 73 | POST | `/api/erp/machine-repairs/save` | [machine_repairs_save](#api-machine_repairs_save) — Lưu header và thay đổi dòng | SQL ghi đã bật; quyền/trạng thái recheck |
| 74 | POST | `/api/erp/machine-repairs/delete` | [machine_repairs_delete](#api-machine_repairs_delete) — Xóa phiếu được phép | SQL ghi đã bật; quyền/trạng thái recheck |
| 75 | GET | `/api/erp/purchase-requests/screen` | [purchase_requests_screen](#api-purchase_requests_screen) — Metadata field/action/dropdown form | Reader native/profile hiện hành |
| 76 | GET | `/api/erp/purchase-requests` | [purchase_requests_list](#api-purchase_requests_list) — Danh sách full header theo trang | Reader native/profile hiện hành |
| 77 | GET | `/api/erp/purchase-requests/detail` | [purchase_requests_detail](#api-purchase_requests_detail) — Chi tiết full field và các trang section | Reader native/profile hiện hành |
| 78 | GET | `/api/erp/purchase-requests/actions` | [purchase_requests_actions](#api-purchase_requests_actions) — Trạng thái nút theo user/phiếu | Reader native/profile hiện hành |
| 79 | POST | `/api/erp/purchase-requests/options` | [purchase_requests_options](#api-purchase_requests_options) — Lựa chọn dropdown/dropselect | Reader native/profile hiện hành |
| 80 | POST | `/api/erp/purchase-requests/commands/lookup` | [purchase_requests_command_lookup](#api-purchase_requests_command_lookup) — Tra cứu receipt ý định gốc, không ghi | Reader native/profile hiện hành |
| 81 | POST | `/api/erp/purchase-requests/selection` | [purchase_requests_selection](#api-purchase_requests_selection) — Đọc nguồn chọn sang dòng nháp | Reader native/profile hiện hành |
| 82 | POST | `/api/erp/purchase-requests/paste/validate` | [purchase_requests_paste_validate](#api-purchase_requests_paste_validate) — Kiểm tra bảng dán, không ghi | Reader native/profile hiện hành |
| 83 | POST | `/api/erp/purchase-requests/create` | [purchase_requests_create](#api-purchase_requests_create) — Tạo phiếu và cấp số/LineID | SQL ghi đã bật; quyền/trạng thái recheck |
| 84 | POST | `/api/erp/purchase-requests/save` | [purchase_requests_save](#api-purchase_requests_save) — Lưu header và thay đổi dòng | SQL ghi đã bật; quyền/trạng thái recheck |
| 85 | POST | `/api/erp/purchase-requests/delete` | [purchase_requests_delete](#api-purchase_requests_delete) — Xóa phiếu được phép | SQL ghi đã bật; quyền/trạng thái recheck |
| 86 | POST | `/api/erp/purchase-requests/actions/submit` | [purchase_requests_submit](#api-purchase_requests_submit) — Gửi đề nghị mua hàng | SQL ghi đã bật; quyền/trạng thái recheck |
| 87 | POST | `/api/erp/purchase-requests/actions/send-purchase-order` | [purchase_requests_send_purchase_order](#api-purchase_requests_send_purchase_order) — Tạo đặt mua hàng từ đề nghị | SQL ghi đã bật; quyền/trạng thái recheck |
| 88 | GET | `/api/erp/sales-orders/screen` | [sales_orders_screen](#api-sales_orders_screen) — Metadata field/action/dropdown form | Reader native/profile hiện hành |
| 89 | GET | `/api/erp/sales-orders` | [sales_orders_list](#api-sales_orders_list) — Danh sách full header theo trang | Reader native/profile hiện hành |
| 90 | GET | `/api/erp/sales-orders/detail` | [sales_orders_detail](#api-sales_orders_detail) — Chi tiết full field và các trang section | Reader native/profile hiện hành |
| 91 | GET | `/api/erp/sales-orders/actions` | [sales_orders_actions](#api-sales_orders_actions) — Trạng thái nút theo user/phiếu | Reader native/profile hiện hành |
| 92 | GET | `/api/erp/sales-orders/contract-info` | [sales_orders_contract_info](#api-sales_orders_contract_info) — Thông tin hợp đồng cùng scope | Reader native/profile hiện hành |
| 93 | POST | `/api/erp/sales-orders/options` | [sales_orders_options](#api-sales_orders_options) — Lựa chọn dropdown/dropselect | Reader native/profile hiện hành |
| 94 | POST | `/api/erp/sales-orders/actions/send-pm/options` | [sales_orders_pm_options](#api-sales_orders_pm_options) — Danh sách PM theo role/branch | Reader native/profile hiện hành |
| 95 | POST | `/api/erp/sales-orders/commands/lookup` | [sales_orders_command_lookup](#api-sales_orders_command_lookup) — Tra cứu receipt ý định gốc, không ghi | Reader native/profile hiện hành |
| 96 | POST | `/api/erp/sales-orders/selection` | [sales_orders_selection](#api-sales_orders_selection) — Đọc nguồn chọn sang dòng nháp | Reader native/profile hiện hành |
| 97 | POST | `/api/erp/sales-orders/paste/validate` | [sales_orders_paste_validate](#api-sales_orders_paste_validate) — Kiểm tra bảng dán, không ghi | Reader native/profile hiện hành |
| 98 | POST | `/api/erp/sales-orders/create` | [sales_orders_create](#api-sales_orders_create) — Tạo phiếu và cấp số/LineID | SQL ghi đã bật; quyền/trạng thái recheck |
| 99 | POST | `/api/erp/sales-orders/save` | [sales_orders_save](#api-sales_orders_save) — Lưu header và thay đổi dòng | SQL ghi đã bật; quyền/trạng thái recheck |
| 100 | POST | `/api/erp/sales-orders/delete` | [sales_orders_delete](#api-sales_orders_delete) — Xóa phiếu được phép | SQL ghi đã bật; quyền/trạng thái recheck |
| 101 | POST | `/api/erp/sales-orders/actions/recall` | [sales_orders_recall](#api-sales_orders_recall) — Thu hồi để sửa | SQL ghi đã bật; quyền/trạng thái recheck |
| 102 | POST | `/api/erp/sales-orders/actions/send-pm` | [sales_orders_send_pm](#api-sales_orders_send_pm) — Gửi phiếu tới PM | SQL ghi đã bật; quyền/trạng thái recheck |
| 103 | GET | `/api/erp/sales-qr/screen` | [sales_qr_screen](#api-sales_qr_screen) — Metadata field/action/dropdown form | Reader native/profile hiện hành |
| 104 | GET | `/api/erp/sales-qr` | [sales_qr_list](#api-sales_qr_list) — Danh sách full header theo trang | Reader native/profile hiện hành |
| 105 | GET | `/api/erp/sales-qr/detail` | [sales_qr_detail](#api-sales_qr_detail) — Chi tiết full field và các trang section | Reader native/profile hiện hành |
| 106 | GET | `/api/erp/sales-qr/actions` | [sales_qr_actions](#api-sales_qr_actions) — Trạng thái nút theo user/phiếu | Reader native/profile hiện hành |
| 107 | GET | `/api/erp/sales-qr/contract-info` | [sales_qr_contract_info](#api-sales_qr_contract_info) — Thông tin hợp đồng cùng scope | Reader native/profile hiện hành |
| 108 | POST | `/api/erp/sales-qr/options` | [sales_qr_options](#api-sales_qr_options) — Lựa chọn dropdown/dropselect | Reader native/profile hiện hành |
| 109 | POST | `/api/erp/sales-qr/commands/lookup` | [sales_qr_command_lookup](#api-sales_qr_command_lookup) — Tra cứu receipt ý định gốc, không ghi | Reader native/profile hiện hành |
| 110 | POST | `/api/erp/sales-qr/qr/add` | [sales_qr_scan_add](#api-sales_qr_scan_add) — Ghi scan thêm | SQL ghi đã bật; quyền/trạng thái recheck |
| 111 | POST | `/api/erp/sales-qr/qr/delete` | [sales_qr_scan_delete](#api-sales_qr_scan_delete) — Ghi scan xóa | SQL ghi đã bật; quyền/trạng thái recheck |
| 112 | GET | `/api/erp/warehouse-qr/screen` | [warehouse_qr_screen](#api-warehouse_qr_screen) — Metadata field/action/dropdown form | Reader native/profile hiện hành |
| 113 | GET | `/api/erp/warehouse-qr` | [warehouse_qr_list](#api-warehouse_qr_list) — Danh sách full header theo trang | Reader native/profile hiện hành |
| 114 | GET | `/api/erp/warehouse-qr/detail` | [warehouse_qr_detail](#api-warehouse_qr_detail) — Chi tiết full field và các trang section | Reader native/profile hiện hành |
| 115 | GET | `/api/erp/warehouse-qr/actions` | [warehouse_qr_actions](#api-warehouse_qr_actions) — Trạng thái nút theo user/phiếu | Reader native/profile hiện hành |
| 116 | POST | `/api/erp/warehouse-qr/options` | [warehouse_qr_options](#api-warehouse_qr_options) — Lựa chọn dropdown/dropselect | Reader native/profile hiện hành |
| 117 | POST | `/api/erp/warehouse-qr/commands/lookup` | [warehouse_qr_command_lookup](#api-warehouse_qr_command_lookup) — Tra cứu receipt ý định gốc, không ghi | Reader native/profile hiện hành |
| 118 | POST | `/api/erp/warehouse-qr/qr/add` | [warehouse_qr_scan_add](#api-warehouse_qr_scan_add) — Ghi scan thêm | SQL ghi đã bật; quyền/trạng thái recheck |
| 119 | POST | `/api/erp/warehouse-qr/qr/delete` | [warehouse_qr_scan_delete](#api-warehouse_qr_scan_delete) — Ghi scan xóa | SQL ghi đã bật; quyền/trạng thái recheck |

<a id="chi-tiet-api"></a>
## 11 Chi tiết request và response từng API

Security là điều kiện kết hợp trong mỗi nhóm: SessionCookie = cookie phiên, CsrfCookie = cookie CSRF, CsrfToken = X-CSRF-TOKEN. Query/path/header ở bảng là contract khai báo; các kiểm tra runtime bổ sung được nêu ngay tại endpoint. Response default có thể là ProblemDetails hoặc lỗi hạ tầng/command: xem mục 9.

<a id="api-healthlive"></a>

### API healthLive

**GET `/health/live`** — Liveness process. Provider/authority hiện hành; xem mục 1.

Security: Public, không yêu cầu phiên.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | object |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Schema response inline HTTP 200 (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "status": {
      "type": "string",
      "const": "healthy"
    }
  },
  "required": [
    "status"
  ]
}
```

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-healthready"></a>

### API healthReady

**GET `/health/ready`** — Readiness business release. 503 business release gate.

Security: Public, không yêu cầu phiên.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 503 | application/json | [PlatformHealth](#schema-platformhealth) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-openapicontract"></a>

### API openApiContract

**GET `/api/contracts/openapi.json`** — Contract OpenAPI của BE. Provider/authority hiện hành; xem mục 1.

Security: Public, không yêu cầu phiên.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | không body | — |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-notificationlist"></a>

### API notificationList

**GET `/api/notifications`** — Danh sách thông báo riêng có phân trang. SQL native; đích giới hạn chín form.

Security: SessionCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=30; minimum=1; maximum=100 |
| `unreadOnly` | query | false | boolean | default=false |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_NotificationPage](#schema-erpscopedresponse_notificationpage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-notificationdetail"></a>

### API notificationDetail

**GET `/api/notifications/{id}`** — Chi tiết thông báo riêng. SQL native; đích giới hạn chín form.

Security: SessionCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `id` | path | true | integer | minimum=1; maximum=2147483647 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_NotificationRow](#schema-erpscopedresponse_notificationrow) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-notificationtarget"></a>

### API notificationTarget

**GET `/api/notifications/{id}/target`** — Resolve đích mở form và quyền phiếu. SQL native; đích giới hạn chín form.

Security: SessionCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `id` | path | true | integer | minimum=1; maximum=2147483647 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_NotificationTarget](#schema-erpscopedresponse_notificationtarget) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-notificationsetread"></a>

### API notificationSetRead

**POST `/api/notifications/{id}/read`** — Ghi đã xem/chưa xem. SQL native; đích giới hạn chín form.

Security: SessionCookie + CsrfToken + CsrfCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `id` | path | true | integer | minimum=1; maximum=2147483647 |

Runtime bắt buộc thêm Origin đúng BE và X-Medcom-Read-Scope mới nhất (hai header chưa khai báo riêng trong operation OpenAPI này).

Body bắt buộc `application/json`: [NotificationReadRequest](#schema-notificationreadrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_NotificationRow](#schema-erpscopedresponse_notificationrow) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-platformmetadata"></a>

### API platformMetadata

**GET `/api/platform/metadata`** — Metadata platform tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `platform.status`.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | object |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Schema response inline HTTP 200 (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "contractVersion": {
      "type": "integer",
      "const": 1
    },
    "status": {
      "type": "string",
      "enum": [
        "foundation_only",
        "read_only_adapter"
      ]
    }
  },
  "required": [
    "contractVersion",
    "status"
  ]
}
```

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-authcsrf"></a>

### API authCsrf

**GET `/api/auth/csrf`** — Lấy CSRF token/cookie. Provider/authority hiện hành; xem mục 1.

Security: Public, không yêu cầu phiên.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | object |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Schema response inline HTTP 200 (application/json):

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "token": {
      "type": [
        "string",
        "null"
      ]
    }
  },
  "required": [
    "token"
  ]
}
```

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-authlogin"></a>

### API authLogin

**POST `/api/auth/login`** — Đăng nhập tài khoản ERP. Provider/authority hiện hành; xem mục 1.

Security: CsrfToken + CsrfCookie.

Không có query/path/header parameter khai báo riêng.

Body bắt buộc `application/json`: [LoginRequest](#schema-loginrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [SessionView](#schema-sessionview) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-authsession"></a>

### API authSession

**GET `/api/auth/session`** — Đọc phiên. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [SessionView](#schema-sessionview) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-authcontinue"></a>

### API authContinue

**POST `/api/auth/session/continue`** — Gia hạn idle phiên. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie + CsrfToken + CsrfCookie.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [SessionView](#schema-sessionview) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-authlogout"></a>

### API authLogout

**POST `/api/auth/logout`** — Thu hồi phiên. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie + CsrfToken + CsrfCookie.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 204 | không body | — |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-workspace"></a>

### API workspace

**GET `/api/workspace`** — Phiên, navigation, branchIds, branchSelection. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [WorkspaceView](#schema-workspaceview) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`. Các stamp runtime bổ sung theo mục 2.

<a id="api-documentfieldcontract"></a>

### API documentFieldContract

**GET `/api/documents/field-contract`** — Metadata cột nguồn và JSON path. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `kind` | query | true | string | enum=["purchase-orders","inbound-requests","purchase-requests"] |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [DocumentFieldContract](#schema-documentfieldcontract) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`. Các stamp runtime bổ sung theo mục 2.

<a id="api-documentquerycontract"></a>

### API documentQueryContract

**GET `/api/documents/query-contract`** — Metadata filter/sort/paging list v2. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `kind` | query | true | string | enum=["purchase-orders","inbound-requests","purchase-requests"] |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [DocumentQueryContract](#schema-documentquerycontract) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaseorderslegacylist"></a>

### API purchaseordersLegacyList

**GET `/api/documents/purchase-orders`** — Danh sách full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=50; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `branchId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [purchaseordersLegacyPage](#schema-purchaseorderslegacypage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/documents/purchase-orders"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaseorderslegacydetail"></a>

### API purchaseordersLegacyDetail

**GET `/api/documents/purchase-orders/detail`** — Chi tiết full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `documentId` | query | true | string | maxLength=30 |
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=50; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [purchaseordersLegacyDetail](#schema-purchaseorderslegacydetail) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/documents/purchase-orders/detail"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaseordersv2list"></a>

### API purchaseordersV2List

**GET `/api/v2/documents/purchase-orders`** — Danh sách full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=50; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `branchId` | query | false | string | maxLength=50 |
| `dateFrom` | query | false | string (date) | pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}$"; description="SQL datetime calendar date, 1753-01-01 through 9999-12-31; no timezone conversion. dateFrom <= dateTo. dateTo includes its entire day." |
| `dateTo` | query | false | string (date) | pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}$"; description="SQL datetime calendar date, 1753-01-01 through 9999-12-31; no timezone conversion. dateFrom <= dateTo. dateTo includes its entire day." |
| `statusId` | query | false | integer | minimum=-2147483648; maximum=2147483647; description="Exact source StatusID. A filter never authorizes a state change." |
| `sortBy` | query | false | string | enum=["documentDate","documentId","statusId"]; default="documentDate" |
| `sortDirection` | query | false | string | enum=["asc","desc"]; default="desc"; description="Document ID uses binary byte ordering and breaks date/status ties ascending; SQL nulls sort first ascending and last descending. Offset pages are not a cross-request snapshot." |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [purchaseordersV2Page](#schema-purchaseordersv2page) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/v2/documents/purchase-orders"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaseordersv2detail"></a>

### API purchaseordersV2Detail

**GET `/api/v2/documents/purchase-orders/detail`** — Chi tiết full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `documentId` | query | true | string | maxLength=30 |
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=50; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [purchaseordersV2Detail](#schema-purchaseordersv2detail) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/v2/documents/purchase-orders/detail"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-inboundrequestslegacylist"></a>

### API inboundrequestsLegacyList

**GET `/api/documents/inbound-requests`** — Danh sách full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `inbound-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=50; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `branchId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [inboundrequestsLegacyPage](#schema-inboundrequestslegacypage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/documents/inbound-requests"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-inboundrequestslegacydetail"></a>

### API inboundrequestsLegacyDetail

**GET `/api/documents/inbound-requests/detail`** — Chi tiết full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `inbound-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `documentId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=50; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [inboundrequestsLegacyDetail](#schema-inboundrequestslegacydetail) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/documents/inbound-requests/detail"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-inboundrequestsv2list"></a>

### API inboundrequestsV2List

**GET `/api/v2/documents/inbound-requests`** — Danh sách full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `inbound-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=50; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `branchId` | query | false | string | maxLength=50 |
| `dateFrom` | query | false | string (date) | pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}$"; description="SQL datetime calendar date, 1753-01-01 through 9999-12-31; no timezone conversion. dateFrom <= dateTo. dateTo includes its entire day." |
| `dateTo` | query | false | string (date) | pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}$"; description="SQL datetime calendar date, 1753-01-01 through 9999-12-31; no timezone conversion. dateFrom <= dateTo. dateTo includes its entire day." |
| `statusId` | query | false | integer | minimum=-2147483648; maximum=2147483647; description="Exact source StatusID. A filter never authorizes a state change." |
| `sortBy` | query | false | string | enum=["documentDate","documentId","statusId"]; default="documentDate" |
| `sortDirection` | query | false | string | enum=["asc","desc"]; default="desc"; description="Document ID uses binary byte ordering and breaks date/status ties ascending; SQL nulls sort first ascending and last descending. Offset pages are not a cross-request snapshot." |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [inboundrequestsV2Page](#schema-inboundrequestsv2page) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/v2/documents/inbound-requests"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-inboundrequestsv2detail"></a>

### API inboundrequestsV2Detail

**GET `/api/v2/documents/inbound-requests/detail`** — Chi tiết full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `inbound-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `documentId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=50; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [inboundrequestsV2Detail](#schema-inboundrequestsv2detail) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/v2/documents/inbound-requests/detail"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestlistlegacy"></a>

### API purchaseRequestListLegacy

**GET `/api/purchase-requests`** — Danh sách full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=50 |
| `search` | query | false | string | maxLength=100 |
| `branchId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestListLegacy](#schema-purchaserequestlistlegacy) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/purchase-requests"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestdetaillegacy"></a>

### API purchaseRequestDetailLegacy

**GET `/api/purchase-requests/detail`** — Chi tiết full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `documentId` | query | true | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestDetailLegacy](#schema-purchaserequestdetaillegacy) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/purchase-requests/detail"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestlistv2"></a>

### API purchaseRequestListV2

**GET `/api/v2/purchase-requests`** — Danh sách full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=50 |
| `search` | query | false | string | maxLength=100 |
| `branchId` | query | false | string | maxLength=50 |
| `dateFrom` | query | false | string (date) | pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}$"; description="SQL datetime calendar date, 1753-01-01 through 9999-12-31; no timezone conversion. dateFrom <= dateTo. dateTo includes its entire day." |
| `dateTo` | query | false | string (date) | pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}$"; description="SQL datetime calendar date, 1753-01-01 through 9999-12-31; no timezone conversion. dateFrom <= dateTo. dateTo includes its entire day." |
| `statusId` | query | false | integer | minimum=-2147483648; maximum=2147483647; description="Exact source StatusID. A filter never authorizes a state change." |
| `sortBy` | query | false | string | enum=["documentDate","documentId","statusId"]; default="documentDate" |
| `sortDirection` | query | false | string | enum=["asc","desc"]; default="desc"; description="Document ID uses binary byte ordering and breaks date/status ties ascending; SQL nulls sort first ascending and last descending. Offset pages are not a cross-request snapshot." |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestListV2](#schema-purchaserequestlistv2) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/v2/purchase-requests"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestdetailv2"></a>

### API purchaseRequestDetailV2

**GET `/api/v2/purchase-requests/detail`** — Chi tiết full field tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `documentId` | query | true | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestDetailV2](#schema-purchaserequestdetailv2) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`, `X-Medcom-Data-Projection="full"`, `X-Medcom-Full-Data-Path="/api/v2/purchase-requests/detail"`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestworkspace"></a>

### API purchaseRequestWorkspace

**GET `/api/purchase-requests/workspace`** — Workspace đề nghị mua hàng tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-requests.read`.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestScopedResponse_PurchaseRequestWorkspace](#schema-purchaserequestscopedresponse_purchaserequestworkspace) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestlookup"></a>

### API purchaseRequestLookup

**GET `/api/purchase-requests/lookup`** — Lookup đề nghị mua hàng tương thích. Provider/authority hiện hành; xem mục 1.

Security: SessionCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `kind` | query | true | string | enum=["branches","purposes","currencies","items","objects"] |
| `page` | query | false | integer | default=1; minimum=1; maximum=1000 |
| `search` | query | false | string | maxLength=100 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestScopedResponse_PurchaseRequestLookupPage](#schema-purchaserequestscopedresponse_purchaserequestlookuppage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`, `X-Medcom-Session-Scope`, `X-Medcom-Read-Scope`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestsavecommand"></a>

### API purchaseRequestsaveCommand

**POST `/api/purchase-requests/save`** — Command facade cũ, provider unavailable. UNAVAILABLE trong startup; xem mục 1.

Security: SessionCookie + CsrfToken + CsrfCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `Origin` | header | true | string | — |
| `X-Purchase-Scope` | header | true | string | — |

Body bắt buộc `application/json`: [SavePurchaseRequestDraft](#schema-savepurchaserequestdraft).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestScopedResponse_PurchaseRequestCommandResult](#schema-purchaserequestscopedresponse_purchaserequestcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestsavelookup"></a>

### API purchaseRequestsaveLookup

**POST `/api/purchase-requests/save/lookup`** — Tra cứu command facade cũ. UNAVAILABLE trong startup; xem mục 1.

Security: SessionCookie + CsrfToken + CsrfCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `Origin` | header | true | string | — |
| `X-Purchase-Scope` | header | true | string | — |

Body bắt buộc `application/json`: [SavePurchaseRequestDraft](#schema-savepurchaserequestdraft).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestScopedResponse_PurchaseRequestLookupResult](#schema-purchaserequestscopedresponse_purchaserequestlookupresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestsubmitcommand"></a>

### API purchaseRequestsubmitCommand

**POST `/api/purchase-requests/submit`** — Command facade cũ, provider unavailable. UNAVAILABLE trong startup; xem mục 1.

Security: SessionCookie + CsrfToken + CsrfCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `Origin` | header | true | string | — |
| `X-Purchase-Scope` | header | true | string | — |

Body bắt buộc `application/json`: [SubmitPurchaseRequest](#schema-submitpurchaserequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestScopedResponse_PurchaseRequestCommandResult](#schema-purchaserequestscopedresponse_purchaserequestcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchaserequestsubmitlookup"></a>

### API purchaseRequestsubmitLookup

**POST `/api/purchase-requests/submit/lookup`** — Tra cứu command facade cũ. UNAVAILABLE trong startup; xem mục 1.

Security: SessionCookie + CsrfToken + CsrfCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `Origin` | header | true | string | — |
| `X-Purchase-Scope` | header | true | string | — |

Body bắt buộc `application/json`: [SubmitPurchaseRequest](#schema-submitpurchaserequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [PurchaseRequestScopedResponse_PurchaseRequestLookupResult](#schema-purchaserequestscopedresponse_purchaserequestlookupresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-inbounddraftread"></a>

### API inboundDraftRead

**GET `/api/inbound-requests/draft`** — Facade nhập kho cũ, provider unavailable. UNAVAILABLE trong startup; xem mục 1.

Security: SessionCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `documentId` | query | true | string | maxLength=50 |
| `X-Inbound-Scope` | header | false | string | — |
| `Origin` | header | false | string | — |
| `Sec-Fetch-Site` | header | false | string | const="same-origin" |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [InboundDraftWorkspace](#schema-inbounddraftworkspace) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-inbounddraftsave"></a>

### API inboundDraftsave

**POST `/api/inbound-requests/draft/save`** — Facade nhập kho cũ, provider unavailable. UNAVAILABLE trong startup; xem mục 1.

Security: SessionCookie + CsrfToken + CsrfCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `Origin` | header | true | string | — |
| `X-Inbound-Scope` | header | true | string | — |

Body bắt buộc `application/json`: [InboundDraftSavePayload](#schema-inbounddraftsavepayload).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [InboundDraftCommandResponse](#schema-inbounddraftcommandresponse) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-inbounddraftsendtowarehouse"></a>

### API inboundDraftsendtowarehouse

**POST `/api/inbound-requests/draft/send-to-warehouse`** — Facade nhập kho cũ, provider unavailable. UNAVAILABLE trong startup; xem mục 1.

Security: SessionCookie + CsrfToken + CsrfCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `Origin` | header | true | string | — |
| `X-Inbound-Scope` | header | true | string | — |

Body bắt buộc `application/json`: [InboundDraftSendPayload](#schema-inbounddraftsendpayload).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [InboundDraftCommandResponse](#schema-inbounddraftcommandresponse) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-inbounddraftreconcile"></a>

### API inboundDraftreconcile

**POST `/api/inbound-requests/draft/reconcile`** — Facade nhập kho cũ, provider unavailable. UNAVAILABLE trong startup; xem mục 1.

Security: SessionCookie + CsrfToken + CsrfCookie.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `Origin` | header | true | string | — |
| `X-Inbound-Scope` | header | true | string | — |

Body bắt buộc `application/json`: oneOf [InboundDraftSavePayload](#schema-inbounddraftsavepayload) / [InboundDraftSendPayload](#schema-inbounddraftsendpayload).

Schema body inline:

```json
{
  "oneOf": [
    {
      "$ref": "#/components/schemas/InboundDraftSavePayload"
    },
    {
      "$ref": "#/components/schemas/InboundDraftSendPayload"
    }
  ]
}
```

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [InboundDraftCommandResponse](#schema-inbounddraftcommandresponse) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_screen"></a>

### API internal_transfer_requests_screen

**GET `/api/erp/internal-transfer-requests/screen`** — Metadata field/action/dropdown form. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `internal-transfer-requests.read`.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpScreenDescription](#schema-erpscopedresponse_erpscreendescription) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_list"></a>

### API internal_transfer_requests_list

**GET `/api/erp/internal-transfer-requests`** — Danh sách full header theo trang. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `dateFrom` | query | false | string | maxLength=10 |
| `dateTo` | query | false | string | maxLength=10 |
| `statusId` | query | false | integer | — |

Không có request body nghiệp vụ.

Full header fields: [Erp_internal_transfer_requests_header_fields](#schema-erp_internal_transfer_requests_header_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_internal_transfer_requests_list_response](#schema-erp_internal_transfer_requests_list_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_detail"></a>

### API internal_transfer_requests_detail

**GET `/api/erp/internal-transfer-requests/detail`** — Chi tiết full field và các trang section. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

Section full fields: header → [Erp_internal_transfer_requests_header_fields](#schema-erp_internal_transfer_requests_header_fields), lines → [Erp_internal_transfer_requests_lines_fields](#schema-erp_internal_transfer_requests_lines_fields), history → [Erp_internal_transfer_requests_history_fields](#schema-erp_internal_transfer_requests_history_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_internal_transfer_requests_detail_response](#schema-erp_internal_transfer_requests_detail_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_actions"></a>

### API internal_transfer_requests_actions

**GET `/api/erp/internal-transfer-requests/actions`** — Trạng thái nút theo user/phiếu. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_IReadOnlyList_ErpActionState](#schema-erpscopedresponse_ireadonlylist_erpactionstate) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_options"></a>

### API internal_transfer_requests_options

**POST `/api/erp/internal-transfer-requests/options`** — Lựa chọn dropdown/dropselect. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpLookupQuery](#schema-erplookupquery).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpChoicePage](#schema-erpscopedresponse_erpchoicepage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_pm_options"></a>

### API internal_transfer_requests_pm_options

**POST `/api/erp/internal-transfer-requests/actions/send-pm/options`** — Danh sách PM theo role/branch. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpPmLookupQuery](#schema-erppmlookupquery).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpChoicePage](#schema-erpscopedresponse_erpchoicepage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_command_lookup"></a>

### API internal_transfer_requests_command_lookup

**POST `/api/erp/internal-transfer-requests/commands/lookup`** — Tra cứu receipt ý định gốc, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpCommandLookupRequest](#schema-erpcommandlookuprequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpCommandObservation](#schema-erpscopedresponse_erpcommandobservation) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_selection"></a>

### API internal_transfer_requests_selection

**POST `/api/erp/internal-transfer-requests/selection`** — Đọc nguồn chọn sang dòng nháp. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpSelectionRequest](#schema-erpselectionrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_paste_validate"></a>

### API internal_transfer_requests_paste_validate

**POST `/api/erp/internal-transfer-requests/paste/validate`** — Kiểm tra bảng dán, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_internal_transfer_requests_paste](#schema-erp_internal_transfer_requests_paste).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_create"></a>

### API internal_transfer_requests_create

**POST `/api/erp/internal-transfer-requests/create`** — Tạo phiếu và cấp số/LineID. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_internal_transfer_requests_create](#schema-erp_internal_transfer_requests_create).

Header input module: [ErpInternalTransferRequestHeaderInput](#schema-erpinternaltransferrequestheaderinput).

Line values input module: [ErpInternalTransferRequestLineInput](#schema-erpinternaltransferrequestlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_save"></a>

### API internal_transfer_requests_save

**POST `/api/erp/internal-transfer-requests/save`** — Lưu header và thay đổi dòng. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_internal_transfer_requests_save](#schema-erp_internal_transfer_requests_save).

Header input module: [ErpInternalTransferRequestHeaderInput](#schema-erpinternaltransferrequestheaderinput).

Line values input module: [ErpInternalTransferRequestLineInput](#schema-erpinternaltransferrequestlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_delete"></a>

### API internal_transfer_requests_delete

**POST `/api/erp/internal-transfer-requests/delete`** — Xóa phiếu được phép. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpDeleteRequest](#schema-erpdeleterequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_recall"></a>

### API internal_transfer_requests_recall

**POST `/api/erp/internal-transfer-requests/actions/recall`** — Thu hồi để sửa. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_internal_transfer_requests_recall_request](#schema-erp_internal_transfer_requests_recall_request).

Payload action: object.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-internal_transfer_requests_send_pm"></a>

### API internal_transfer_requests_send_pm

**POST `/api/erp/internal-transfer-requests/actions/send-pm`** — Gửi phiếu tới PM. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `internal-transfer-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_internal_transfer_requests_send_pm_request](#schema-erp_internal_transfer_requests_send_pm_request).

Payload action: [ErpSendTransferPm](#schema-erpsendtransferpm).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_screen"></a>

### API machine_movements_screen

**GET `/api/erp/machine-movements/screen`** — Metadata field/action/dropdown form. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `machine-movements.read`.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpScreenDescription](#schema-erpscopedresponse_erpscreendescription) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_list"></a>

### API machine_movements_list

**GET `/api/erp/machine-movements`** — Danh sách full header theo trang. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `dateFrom` | query | false | string | maxLength=10 |
| `dateTo` | query | false | string | maxLength=10 |
| `statusId` | query | false | integer | — |

Không có request body nghiệp vụ.

Full header fields: [Erp_machine_movements_header_fields](#schema-erp_machine_movements_header_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_machine_movements_list_response](#schema-erp_machine_movements_list_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_detail"></a>

### API machine_movements_detail

**GET `/api/erp/machine-movements/detail`** — Chi tiết full field và các trang section. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

Section full fields: header → [Erp_machine_movements_header_fields](#schema-erp_machine_movements_header_fields), lines → [Erp_machine_movements_lines_fields](#schema-erp_machine_movements_lines_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_machine_movements_detail_response](#schema-erp_machine_movements_detail_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_actions"></a>

### API machine_movements_actions

**GET `/api/erp/machine-movements/actions`** — Trạng thái nút theo user/phiếu. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_IReadOnlyList_ErpActionState](#schema-erpscopedresponse_ireadonlylist_erpactionstate) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_options"></a>

### API machine_movements_options

**POST `/api/erp/machine-movements/options`** — Lựa chọn dropdown/dropselect. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpLookupQuery](#schema-erplookupquery).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpChoicePage](#schema-erpscopedresponse_erpchoicepage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_command_lookup"></a>

### API machine_movements_command_lookup

**POST `/api/erp/machine-movements/commands/lookup`** — Tra cứu receipt ý định gốc, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpCommandLookupRequest](#schema-erpcommandlookuprequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpCommandObservation](#schema-erpscopedresponse_erpcommandobservation) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_selection"></a>

### API machine_movements_selection

**POST `/api/erp/machine-movements/selection`** — Đọc nguồn chọn sang dòng nháp. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpSelectionRequest](#schema-erpselectionrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_paste_validate"></a>

### API machine_movements_paste_validate

**POST `/api/erp/machine-movements/paste/validate`** — Kiểm tra bảng dán, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_machine_movements_paste](#schema-erp_machine_movements_paste).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_create"></a>

### API machine_movements_create

**POST `/api/erp/machine-movements/create`** — Tạo phiếu và cấp số/LineID. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_machine_movements_create](#schema-erp_machine_movements_create).

Header input module: [ErpMachineMovementHeaderInput](#schema-erpmachinemovementheaderinput).

Line values input module: [ErpMachineMovementLineInput](#schema-erpmachinemovementlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_save"></a>

### API machine_movements_save

**POST `/api/erp/machine-movements/save`** — Lưu header và thay đổi dòng. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_machine_movements_save](#schema-erp_machine_movements_save).

Header input module: [ErpMachineMovementHeaderInput](#schema-erpmachinemovementheaderinput).

Line values input module: [ErpMachineMovementLineInput](#schema-erpmachinemovementlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_movements_delete"></a>

### API machine_movements_delete

**POST `/api/erp/machine-movements/delete`** — Xóa phiếu được phép. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-movements.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpDeleteRequest](#schema-erpdeleterequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_screen"></a>

### API machine_repairs_screen

**GET `/api/erp/machine-repairs/screen`** — Metadata field/action/dropdown form. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `machine-repairs.read`.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpScreenDescription](#schema-erpscopedresponse_erpscreendescription) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_list"></a>

### API machine_repairs_list

**GET `/api/erp/machine-repairs`** — Danh sách full header theo trang. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `dateFrom` | query | false | string | maxLength=10 |
| `dateTo` | query | false | string | maxLength=10 |
| `statusId` | query | false | integer | — |

Không có request body nghiệp vụ.

Full header fields: [Erp_machine_repairs_header_fields](#schema-erp_machine_repairs_header_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_machine_repairs_list_response](#schema-erp_machine_repairs_list_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_detail"></a>

### API machine_repairs_detail

**GET `/api/erp/machine-repairs/detail`** — Chi tiết full field và các trang section. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

Section full fields: header → [Erp_machine_repairs_header_fields](#schema-erp_machine_repairs_header_fields), lines → [Erp_machine_repairs_lines_fields](#schema-erp_machine_repairs_lines_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_machine_repairs_detail_response](#schema-erp_machine_repairs_detail_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_actions"></a>

### API machine_repairs_actions

**GET `/api/erp/machine-repairs/actions`** — Trạng thái nút theo user/phiếu. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_IReadOnlyList_ErpActionState](#schema-erpscopedresponse_ireadonlylist_erpactionstate) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_options"></a>

### API machine_repairs_options

**POST `/api/erp/machine-repairs/options`** — Lựa chọn dropdown/dropselect. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpLookupQuery](#schema-erplookupquery).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpChoicePage](#schema-erpscopedresponse_erpchoicepage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_command_lookup"></a>

### API machine_repairs_command_lookup

**POST `/api/erp/machine-repairs/commands/lookup`** — Tra cứu receipt ý định gốc, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpCommandLookupRequest](#schema-erpcommandlookuprequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpCommandObservation](#schema-erpscopedresponse_erpcommandobservation) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_selection"></a>

### API machine_repairs_selection

**POST `/api/erp/machine-repairs/selection`** — Đọc nguồn chọn sang dòng nháp. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpSelectionRequest](#schema-erpselectionrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_paste_validate"></a>

### API machine_repairs_paste_validate

**POST `/api/erp/machine-repairs/paste/validate`** — Kiểm tra bảng dán, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_machine_repairs_paste](#schema-erp_machine_repairs_paste).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_create"></a>

### API machine_repairs_create

**POST `/api/erp/machine-repairs/create`** — Tạo phiếu và cấp số/LineID. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_machine_repairs_create](#schema-erp_machine_repairs_create).

Header input module: [ErpMachineRepairHeaderInput](#schema-erpmachinerepairheaderinput).

Line values input module: [ErpMachineRepairLineInput](#schema-erpmachinerepairlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_save"></a>

### API machine_repairs_save

**POST `/api/erp/machine-repairs/save`** — Lưu header và thay đổi dòng. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_machine_repairs_save](#schema-erp_machine_repairs_save).

Header input module: [ErpMachineRepairHeaderInput](#schema-erpmachinerepairheaderinput).

Line values input module: [ErpMachineRepairLineInput](#schema-erpmachinerepairlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-machine_repairs_delete"></a>

### API machine_repairs_delete

**POST `/api/erp/machine-repairs/delete`** — Xóa phiếu được phép. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `machine-repairs.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpDeleteRequest](#schema-erpdeleterequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_screen"></a>

### API purchase_requests_screen

**GET `/api/erp/purchase-requests/screen`** — Metadata field/action/dropdown form. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `purchase-requests.read`.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpScreenDescription](#schema-erpscopedresponse_erpscreendescription) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_list"></a>

### API purchase_requests_list

**GET `/api/erp/purchase-requests`** — Danh sách full header theo trang. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `dateFrom` | query | false | string | maxLength=10 |
| `dateTo` | query | false | string | maxLength=10 |
| `statusId` | query | false | integer | — |

Không có request body nghiệp vụ.

Full header fields: [Erp_purchase_requests_header_fields](#schema-erp_purchase_requests_header_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_purchase_requests_list_response](#schema-erp_purchase_requests_list_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_detail"></a>

### API purchase_requests_detail

**GET `/api/erp/purchase-requests/detail`** — Chi tiết full field và các trang section. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

Section full fields: header → [Erp_purchase_requests_header_fields](#schema-erp_purchase_requests_header_fields), lines → [Erp_purchase_requests_lines_fields](#schema-erp_purchase_requests_lines_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_purchase_requests_detail_response](#schema-erp_purchase_requests_detail_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_actions"></a>

### API purchase_requests_actions

**GET `/api/erp/purchase-requests/actions`** — Trạng thái nút theo user/phiếu. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_IReadOnlyList_ErpActionState](#schema-erpscopedresponse_ireadonlylist_erpactionstate) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_options"></a>

### API purchase_requests_options

**POST `/api/erp/purchase-requests/options`** — Lựa chọn dropdown/dropselect. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpLookupQuery](#schema-erplookupquery).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpChoicePage](#schema-erpscopedresponse_erpchoicepage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_command_lookup"></a>

### API purchase_requests_command_lookup

**POST `/api/erp/purchase-requests/commands/lookup`** — Tra cứu receipt ý định gốc, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpCommandLookupRequest](#schema-erpcommandlookuprequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpCommandObservation](#schema-erpscopedresponse_erpcommandobservation) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_selection"></a>

### API purchase_requests_selection

**POST `/api/erp/purchase-requests/selection`** — Đọc nguồn chọn sang dòng nháp. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpSelectionRequest](#schema-erpselectionrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_paste_validate"></a>

### API purchase_requests_paste_validate

**POST `/api/erp/purchase-requests/paste/validate`** — Kiểm tra bảng dán, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_purchase_requests_paste](#schema-erp_purchase_requests_paste).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_create"></a>

### API purchase_requests_create

**POST `/api/erp/purchase-requests/create`** — Tạo phiếu và cấp số/LineID. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_purchase_requests_create](#schema-erp_purchase_requests_create).

Header input module: [ErpPurchaseRequestHeaderInput](#schema-erppurchaserequestheaderinput).

Line values input module: [ErpPurchaseRequestLineInput](#schema-erppurchaserequestlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_save"></a>

### API purchase_requests_save

**POST `/api/erp/purchase-requests/save`** — Lưu header và thay đổi dòng. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_purchase_requests_save](#schema-erp_purchase_requests_save).

Header input module: [ErpPurchaseRequestHeaderInput](#schema-erppurchaserequestheaderinput).

Line values input module: [ErpPurchaseRequestLineInput](#schema-erppurchaserequestlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_delete"></a>

### API purchase_requests_delete

**POST `/api/erp/purchase-requests/delete`** — Xóa phiếu được phép. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpDeleteRequest](#schema-erpdeleterequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_submit"></a>

### API purchase_requests_submit

**POST `/api/erp/purchase-requests/actions/submit`** — Gửi đề nghị mua hàng. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_purchase_requests_submit_request](#schema-erp_purchase_requests_submit_request).

Payload action: object.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-purchase_requests_send_purchase_order"></a>

### API purchase_requests_send_purchase_order

**POST `/api/erp/purchase-requests/actions/send-purchase-order`** — Tạo đặt mua hàng từ đề nghị. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `purchase-requests.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_purchase_requests_send_purchase_order_request](#schema-erp_purchase_requests_send_purchase_order_request).

Payload action: object.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_screen"></a>

### API sales_orders_screen

**GET `/api/erp/sales-orders/screen`** — Metadata field/action/dropdown form. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-orders.read`.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpScreenDescription](#schema-erpscopedresponse_erpscreendescription) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_list"></a>

### API sales_orders_list

**GET `/api/erp/sales-orders`** — Danh sách full header theo trang. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `dateFrom` | query | false | string | maxLength=10 |
| `dateTo` | query | false | string | maxLength=10 |
| `statusId` | query | false | integer | — |

Không có request body nghiệp vụ.

Full header fields: [Erp_sales_orders_header_fields](#schema-erp_sales_orders_header_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_sales_orders_list_response](#schema-erp_sales_orders_list_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_detail"></a>

### API sales_orders_detail

**GET `/api/erp/sales-orders/detail`** — Chi tiết full field và các trang section. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

Section full fields: header → [Erp_sales_orders_header_fields](#schema-erp_sales_orders_header_fields), lines → [Erp_sales_orders_lines_fields](#schema-erp_sales_orders_lines_fields), history → [Erp_sales_orders_history_fields](#schema-erp_sales_orders_history_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_sales_orders_detail_response](#schema-erp_sales_orders_detail_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_actions"></a>

### API sales_orders_actions

**GET `/api/erp/sales-orders/actions`** — Trạng thái nút theo user/phiếu. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_IReadOnlyList_ErpActionState](#schema-erpscopedresponse_ireadonlylist_erpactionstate) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_contract_info"></a>

### API sales_orders_contract_info

**GET `/api/erp/sales-orders/contract-info`** — Thông tin hợp đồng cùng scope. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | true | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpContractInfo](#schema-erpscopedresponse_erpcontractinfo) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_options"></a>

### API sales_orders_options

**POST `/api/erp/sales-orders/options`** — Lựa chọn dropdown/dropselect. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpLookupQuery](#schema-erplookupquery).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpChoicePage](#schema-erpscopedresponse_erpchoicepage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_pm_options"></a>

### API sales_orders_pm_options

**POST `/api/erp/sales-orders/actions/send-pm/options`** — Danh sách PM theo role/branch. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpPmLookupQuery](#schema-erppmlookupquery).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpChoicePage](#schema-erpscopedresponse_erpchoicepage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_command_lookup"></a>

### API sales_orders_command_lookup

**POST `/api/erp/sales-orders/commands/lookup`** — Tra cứu receipt ý định gốc, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpCommandLookupRequest](#schema-erpcommandlookuprequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpCommandObservation](#schema-erpscopedresponse_erpcommandobservation) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_selection"></a>

### API sales_orders_selection

**POST `/api/erp/sales-orders/selection`** — Đọc nguồn chọn sang dòng nháp. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpSelectionRequest](#schema-erpselectionrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_paste_validate"></a>

### API sales_orders_paste_validate

**POST `/api/erp/sales-orders/paste/validate`** — Kiểm tra bảng dán, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_sales_orders_paste](#schema-erp_sales_orders_paste).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpDraftSelection](#schema-erpscopedresponse_erpdraftselection) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_create"></a>

### API sales_orders_create

**POST `/api/erp/sales-orders/create`** — Tạo phiếu và cấp số/LineID. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_sales_orders_create](#schema-erp_sales_orders_create).

Header input module: [ErpSalesOrderHeaderInput](#schema-erpsalesorderheaderinput).

Line values input module: [ErpSalesOrderLineInput](#schema-erpsalesorderlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_save"></a>

### API sales_orders_save

**POST `/api/erp/sales-orders/save`** — Lưu header và thay đổi dòng. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_sales_orders_save](#schema-erp_sales_orders_save).

Header input module: [ErpSalesOrderHeaderInput](#schema-erpsalesorderheaderinput).

Line values input module: [ErpSalesOrderLineInput](#schema-erpsalesorderlineinput).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_delete"></a>

### API sales_orders_delete

**POST `/api/erp/sales-orders/delete`** — Xóa phiếu được phép. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpDeleteRequest](#schema-erpdeleterequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_recall"></a>

### API sales_orders_recall

**POST `/api/erp/sales-orders/actions/recall`** — Thu hồi để sửa. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_sales_orders_recall_request](#schema-erp_sales_orders_recall_request).

Payload action: object.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_orders_send_pm"></a>

### API sales_orders_send_pm

**POST `/api/erp/sales-orders/actions/send-pm`** — Gửi phiếu tới PM. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-orders.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [Erp_sales_orders_send_pm_request](#schema-erp_sales_orders_send_pm_request).

Payload action: [ErpSendOrderPm](#schema-erpsendorderpm).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_qr_screen"></a>

### API sales_qr_screen

**GET `/api/erp/sales-qr/screen`** — Metadata field/action/dropdown form. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-qr.read`.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpScreenDescription](#schema-erpscopedresponse_erpscreendescription) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_qr_list"></a>

### API sales_qr_list

**GET `/api/erp/sales-qr`** — Danh sách full header theo trang. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `dateFrom` | query | false | string | maxLength=10 |
| `dateTo` | query | false | string | maxLength=10 |
| `statusId` | query | false | integer | — |

Không có request body nghiệp vụ.

Full header fields: [Erp_sales_qr_header_fields](#schema-erp_sales_qr_header_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_sales_qr_list_response](#schema-erp_sales_qr_list_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_qr_detail"></a>

### API sales_qr_detail

**GET `/api/erp/sales-qr/detail`** — Chi tiết full field và các trang section. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

Section full fields: header → [Erp_sales_qr_header_fields](#schema-erp_sales_qr_header_fields), lines → [Erp_sales_qr_lines_fields](#schema-erp_sales_qr_lines_fields), comparison → [Erp_sales_qr_comparison_fields](#schema-erp_sales_qr_comparison_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_sales_qr_detail_response](#schema-erp_sales_qr_detail_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_qr_actions"></a>

### API sales_qr_actions

**GET `/api/erp/sales-qr/actions`** — Trạng thái nút theo user/phiếu. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_IReadOnlyList_ErpActionState](#schema-erpscopedresponse_ireadonlylist_erpactionstate) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_qr_contract_info"></a>

### API sales_qr_contract_info

**GET `/api/erp/sales-qr/contract-info`** — Thông tin hợp đồng cùng scope. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `sales-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | true | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpContractInfo](#schema-erpscopedresponse_erpcontractinfo) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_qr_options"></a>

### API sales_qr_options

**POST `/api/erp/sales-qr/options`** — Lựa chọn dropdown/dropselect. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpLookupQuery](#schema-erplookupquery).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpChoicePage](#schema-erpscopedresponse_erpchoicepage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_qr_command_lookup"></a>

### API sales_qr_command_lookup

**POST `/api/erp/sales-qr/commands/lookup`** — Tra cứu receipt ý định gốc, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpCommandLookupRequest](#schema-erpcommandlookuprequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpCommandObservation](#schema-erpscopedresponse_erpcommandobservation) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_qr_scan_add"></a>

### API sales_qr_scan_add

**POST `/api/erp/sales-qr/qr/add`** — Ghi scan thêm. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpScanRequest](#schema-erpscanrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-sales_qr_scan_delete"></a>

### API sales_qr_scan_delete

**POST `/api/erp/sales-qr/qr/delete`** — Ghi scan xóa. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `sales-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpScanRequest](#schema-erpscanrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-warehouse_qr_screen"></a>

### API warehouse_qr_screen

**GET `/api/erp/warehouse-qr/screen`** — Metadata field/action/dropdown form. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `warehouse-qr.read`.

Không có query/path/header parameter khai báo riêng.

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpScreenDescription](#schema-erpscopedresponse_erpscreendescription) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-warehouse_qr_list"></a>

### API warehouse_qr_list

**GET `/api/erp/warehouse-qr`** — Danh sách full header theo trang. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `warehouse-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |
| `search` | query | false | string | maxLength=100 |
| `dateFrom` | query | false | string | maxLength=10 |
| `dateTo` | query | false | string | maxLength=10 |
| `statusId` | query | false | integer | — |

Không có request body nghiệp vụ.

Full header fields: [Erp_warehouse_qr_header_fields](#schema-erp_warehouse_qr_header_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_warehouse_qr_list_response](#schema-erp_warehouse_qr_list_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-warehouse_qr_detail"></a>

### API warehouse_qr_detail

**GET `/api/erp/warehouse-qr/detail`** — Chi tiết full field và các trang section. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `warehouse-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | true | string | maxLength=50 |
| `page` | query | false | integer | default=1; minimum=1; maximum=10000 |
| `pageSize` | query | false | integer | default=20; minimum=1; maximum=100 |

Không có request body nghiệp vụ.

Section full fields: header → [Erp_warehouse_qr_header_fields](#schema-erp_warehouse_qr_header_fields), lines → [Erp_warehouse_qr_lines_fields](#schema-erp_warehouse_qr_lines_fields), comparison → [Erp_warehouse_qr_comparison_fields](#schema-erp_warehouse_qr_comparison_fields).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [Erp_warehouse_qr_detail_response](#schema-erp_warehouse_qr_detail_response) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-warehouse_qr_actions"></a>

### API warehouse_qr_actions

**GET `/api/erp/warehouse-qr/actions`** — Trạng thái nút theo user/phiếu. Reader native/profile hiện hành.

Security: SessionCookie. Capability: `warehouse-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `branchId` | query | true | string | maxLength=50 |
| `documentId` | query | false | string | maxLength=50 |

Không có request body nghiệp vụ.

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_IReadOnlyList_ErpActionState](#schema-erpscopedresponse_ireadonlylist_erpactionstate) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-warehouse_qr_options"></a>

### API warehouse_qr_options

**POST `/api/erp/warehouse-qr/options`** — Lựa chọn dropdown/dropselect. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `warehouse-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpLookupQuery](#schema-erplookupquery).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpChoicePage](#schema-erpscopedresponse_erpchoicepage) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-warehouse_qr_command_lookup"></a>

### API warehouse_qr_command_lookup

**POST `/api/erp/warehouse-qr/commands/lookup`** — Tra cứu receipt ý định gốc, không ghi. Reader native/profile hiện hành.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `warehouse-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpCommandLookupRequest](#schema-erpcommandlookuprequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpScopedResponse_ErpCommandObservation](#schema-erpscopedresponse_erpcommandobservation) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-warehouse_qr_scan_add"></a>

### API warehouse_qr_scan_add

**POST `/api/erp/warehouse-qr/qr/add`** — Ghi scan thêm. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `warehouse-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpScanRequest](#schema-erpscanrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="api-warehouse_qr_scan_delete"></a>

### API warehouse_qr_scan_delete

**POST `/api/erp/warehouse-qr/qr/delete`** — Ghi scan xóa. SQL ghi đã bật; quyền/trạng thái recheck.

Security: SessionCookie + CsrfToken + CsrfCookie. Capability: `warehouse-qr.read`.

| Tên | Vị trí | Bắt buộc | Kiểu | Giới hạn và mặc định |
|---|---|---|---|---|
| `X-Medcom-Read-Scope` | header | true | string | maxLength=64 |
| `Origin` | header | true | string | — |

Body bắt buộc `application/json`: [ErpScanRequest](#schema-erpscanrequest).

| HTTP | Content type | Schema response |
|---|---|---|
| 200 | application/json | [ErpCommandResult](#schema-erpcommandresult) |
| default | application/problem+json | [ProblemDetails](#schema-problemdetails) |

Response headers khai báo: `X-Correlation-ID`. Các stamp runtime bổ sung theo mục 2.

<a id="schema-api"></a>
## 12 Toàn bộ field trong 274 schema

Field bắt buộc là key nằm trong required của schema đó. Ở response full, key nullable vẫn bắt buộc xuất hiện. Ở request, schema create có thể bổ sung required cho ngày trên header ngoài DTO gốc; ràng buộc này được giữ trong cột giới hạn. oneOf yêu cầu đúng một nhánh, anyOf chấp nhận một hoặc nhiều nhánh, allOf phải thỏa mọi nhánh. Generic Erp* schema là model chung; khi operation có schema module cụ thể, FE dùng schema module đó.

Tên SQL và writable trong field source là metadata, không phải tên tham số SQL FE được phép gửi. additionalProperties=false từ chối field lạ. Dictionary có schema động như fields/context vẫn chịu allowlist/lookup/reference runtime; không suy ra một object JSON bất kỳ đều hợp lệ.

<a id="schema-problemdetails"></a>

### Schema ProblemDetails

Object: `{"type":"object","additionalProperties":true}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `type` | string | false | — |
| `title` | string | false | — |
| `status` | integer | false | — |
| `detail` | string | false | — |
| `instance` | string | false | — |
| `code` | string | false | — |
| `correlationId` | string | false | — |

<a id="schema-platformhealth"></a>

### Schema PlatformHealth

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `status` | string | true | — |
| `checks` | array&lt;[DependencyHealth](#schema-dependencyhealth)&gt; | true | items[0]: — |

<a id="schema-dependencyhealth"></a>

### Schema DependencyHealth

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `component` | string | true | — |
| `status` | string | true | — |

<a id="schema-erpscopedresponse_notificationpage"></a>

### Schema ErpScopedResponse_NotificationPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [NotificationPage](#schema-notificationpage) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-notificationpage"></a>

### Schema NotificationPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `totalRows` | integer (int64) | true | — |
| `unreadCount` | integer (int64) | true | — |
| `rows` | array&lt;[NotificationRow](#schema-notificationrow)&gt; | true | items[0]: — |

<a id="schema-notificationrow"></a>

### Schema NotificationRow

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `id` | integer (int32) | true | — |
| `fromUserId` | string | true | — |
| `toUserId` | string | true | — |
| `title` | string | true | — |
| `message` | string | true | — |
| `msgTime` | string | true | — |
| `notifyType` | string | true | — |
| `colorHex` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `sourceSystem` | string | true | — |
| `erpFormName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `webFormName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `webRoute` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `documentId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `orderNo` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `isView` | boolean | true | — |
| `viewDate` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `isActive` | boolean | true | — |
| `showErp` | boolean | true | — |
| `showWeb` | boolean | true | — |
| `expireAt` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `eventKey` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpscopedresponse_notificationrow"></a>

### Schema ErpScopedResponse_NotificationRow

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [NotificationRow](#schema-notificationrow) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpscopedresponse_notificationtarget"></a>

### Schema ErpScopedResponse_NotificationTarget

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [NotificationTarget](#schema-notificationtarget) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-notificationtarget"></a>

### Schema NotificationTarget

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `canOpen` | boolean | true | — |
| `reason` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `moduleId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `formId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `documentId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `branchId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `detailApi` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-notificationreadrequest"></a>

### Schema NotificationReadRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `isView` | boolean | true | — |

<a id="schema-sessionview"></a>

### Schema SessionView

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `displayName` | string | true | — |
| `tenantId` | string | true | — |
| `companyId` | string | true | — |
| `companyName` | string | true | — |
| `authorityVersion` | integer (int64) | true | — |
| `idleExpiresAt` | string (date-time) | true | — |
| `absoluteExpiresAt` | string (date-time) | true | — |
| `capabilities` | array&lt;string&gt; | true | items[0]: — |

<a id="schema-loginrequest"></a>

### Schema LoginRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `username` | string | true | — |
| `password` | string | true | — |

<a id="schema-workspaceview"></a>

### Schema WorkspaceView

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `session` | [SessionView](#schema-sessionview) | true | — |
| `navigation` | array&lt;[NavigationItem](#schema-navigationitem)&gt; | true | items[0]: — |
| `branchIds` | array&lt;string&gt; | true | items[0]: — |
| `branchSelection` | [BranchSelection](#schema-branchselection) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-navigationitem"></a>

### Schema NavigationItem

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `id` | string | true | — |
| `label` | string | true | — |
| `href` | string | true | — |

<a id="schema-branchselection"></a>

### Schema BranchSelection

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `mode` | string | true | — |
| `assignedBranchId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `filterLocked` | boolean | true | — |

<a id="schema-documentfieldcontract"></a>

### Schema DocumentFieldContract

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `contractVersion` | integer (int32) | true | — |
| `kind` | string | true | — |
| `header` | [DocumentFieldTable](#schema-documentfieldtable) | true | — |
| `lines` | [DocumentFieldTable](#schema-documentfieldtable) | true | — |

<a id="schema-documentfieldtable"></a>

### Schema DocumentFieldTable

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `table` | string | true | — |
| `fields` | array&lt;[DocumentFieldDefinition](#schema-documentfielddefinition)&gt; | true | items[0]: — |

<a id="schema-documentfielddefinition"></a>

### Schema DocumentFieldDefinition

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `column` | string | true | — |
| `jsonPath` | string | true | — |
| `sqlType` | string | true | — |
| `nullable` | boolean | true | — |
| `jsonType` | string | true | — |
| `format` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `listJsonPath` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-documentquerycontract"></a>

### Schema DocumentQueryContract

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `version` | integer (int32) | true | — |
| `kind` | string | true | — |
| `listPath` | string | true | — |
| `maximumPage` | integer (int32) | true | — |
| `maximumPageSize` | integer (int32) | true | — |
| `dateColumn` | string | true | — |
| `identifierColumn` | string | true | — |
| `sortFields` | array&lt;string&gt; | true | items[0]: — |
| `defaultSortBy` | string | true | — |
| `defaultSortDirection` | string | true | — |
| `minimumDate` | string | true | — |
| `maximumDate` | string | true | — |
| `dateFormat` | string | true | — |
| `dateToInclusive` | boolean | true | — |
| `nullableDatesIncludedWithoutBounds` | boolean | true | — |
| `statusColumn` | string | true | — |

<a id="schema-documentsummary"></a>

### Schema DocumentSummary

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `documentDate` | string | true | — |
| `branchId` | string | true | — |
| `statusId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `purchaseOrderHeader` | [PurchaseOrderHeaderFields](#schema-purchaseorderheaderfields) / null | false | anyOf[0]: —; anyOf[1]: — |
| `inboundRequestHeader` | [InboundRequestHeaderFields](#schema-inboundrequestheaderfields) / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaseorderheaderfields"></a>

### Schema PurchaseOrderHeaderFields

Object: `{"type":"object","additionalProperties":false,"x-medcom-source-table":"AP_OrderTbl"}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false |
| `documentDate` | string | true | pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"; description="sql-datetime-without-timezone"; SQL DocumentDate datetime; nullable=false |
| `objectId` | string | true | SQL ObjectID varchar(100); nullable=false |
| `memo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Memo nvarchar(200); nullable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(200); nullable=true |
| `deliverDate` | string / null | true | description="sql-datetime-without-timezone"; anyOf[0]: pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"; anyOf[1]: —; SQL DeliverDate datetime; nullable=true |
| `currencyId` | string | true | SQL CurrencyID varchar(3); nullable=false |
| `rateExchange` | number | true | SQL RateExchange float; nullable=false |
| `baseTotal` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL BaseTotal decimal(28, 0); nullable=true |
| `searchField` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SearchField nvarchar(2000); nullable=true |
| `isLock` | boolean | true | SQL isLock bit; nullable=false |
| `userCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserCreate varchar(50); nullable=true |
| `userUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserUpdate varchar(50); nullable=true |
| `dateUpdate` | string / null | true | description="sql-datetime-without-timezone"; anyOf[0]: pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"; anyOf[1]: —; SQL DateUpdate datetime; nullable=true |
| `dateCreate` | string / null | true | description="sql-datetime-without-timezone"; anyOf[0]: pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"; anyOf[1]: —; SQL DateCreate datetime; nullable=true |
| `linkId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LinkID varchar(50); nullable=true |
| `contractId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ContractID nvarchar(100); nullable=true |
| `statusId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: —; SQL StatusID int; nullable=true |
| `branchId` | string | true | SQL BranchID varchar(50); nullable=false |

<a id="schema-inboundrequestheaderfields"></a>

### Schema InboundRequestHeaderFields

Object: `{"type":"object","additionalProperties":false,"x-medcom-source-table":"IV_InboundRequestTbl"}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | SQL DocumentID varchar(50); nullable=false |
| `documentDate` | string | true | pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"; description="sql-datetime-without-timezone"; SQL DocumentDate datetime; nullable=false |
| `orderNumber` | string | true | SQL OrderNumber nvarchar(50); nullable=false |
| `branchId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL BranchID varchar(50); nullable=true |
| `invoiceNo` | string | true | SQL InvoiceNo nvarchar(50); nullable=false |
| `declarationNumber` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DeclarationNumber varchar(50); nullable=true |
| `departurePoint` | string | true | SQL DeparturePoint nvarchar(100); nullable=false |
| `destinationPoint` | string | true | SQL DestinationPoint nvarchar(100); nullable=false |
| `isRain` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL IsRain bit; nullable=true |
| `orderTypeId` | string | true | SQL OrderTypeID nvarchar(50); nullable=false |
| `objectId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ObjectID varchar(50); nullable=true |
| `totalPalletQuantityByDocument` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL TotalPalletQuantityByDocument decimal(18, 0); nullable=true |
| `totalBarrelQuantityByDocument` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL TotalBarrelQuantityByDocument decimal(18, 0); nullable=true |
| `totalPalletQuantityByReal` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL TotalPalletQuantityByReal decimal(18, 0); nullable=true |
| `totalBarrelQuantityByReal` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL TotalBarrelQuantityByReal decimal(18, 0); nullable=true |
| `excessPackageQuantity` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL ExcessPackageQuantity decimal(18, 0); nullable=true |
| `lackOfPackageQuantity` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL LackOfPackageQuantity decimal(18, 0); nullable=true |
| `damagedPackageQuantity` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL DamagedPackageQuantity decimal(18, 0); nullable=true |
| `packageTypeId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PackageTypeID nvarchar(50); nullable=true |
| `isDamageOutsidePackage` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL IsDamageOutsidePackage bit; nullable=true |
| `damageDescription` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DamageDescription nvarchar(500); nullable=true |
| `damageInsideStatusId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DamageInsideStatusID nvarchar(50); nullable=true |
| `locationDamageDetectedId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LocationDamageDetectedID nvarchar(50); nullable=true |
| `locationDamageDescription` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LocationDamageDescription nvarchar(500); nullable=true |
| `resultDesciption` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ResultDesciption nvarchar(max); nullable=true |
| `totalQuantityInboundResult` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL TotalQuantityInboundResult decimal(18, 0); nullable=true |
| `goodAwaitingInboundResult` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL GoodAwaitingInboundResult decimal(18, 0); nullable=true |
| `resultNote` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ResultNote nvarchar(500); nullable=true |
| `datetimeRecorded` | string / null | true | description="sql-datetime-without-timezone"; anyOf[0]: pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"; anyOf[1]: —; SQL DatetimeRecorded datetime; nullable=true |
| `statusId` | integer (int32) | true | SQL StatusID int; nullable=false |
| `currencyId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CurrencyID varchar(3); nullable=true |
| `rateExchange` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL RateExchange decimal(28, 10); nullable=true |
| `imageUrl` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ImageURL varchar(255); nullable=true |
| `bbkcUrl` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL BBKCUrl varchar(255); nullable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(500); nullable=true |
| `sendTo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SendTo nvarchar(max); nullable=true |
| `qrPrintType` | string | true | SQL QRPrintType varchar(10); nullable=false |
| `linkId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LinkID varchar(50); nullable=true |

<a id="schema-purchaseorderslegacysummary"></a>

### Schema purchaseordersLegacySummary

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `documentDate` | string | true | — |
| `branchId` | string | true | — |
| `statusId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `purchaseOrderHeader` | [PurchaseOrderHeaderFields](#schema-purchaseorderheaderfields) | true | — |

<a id="schema-documentpage"></a>

### Schema DocumentPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[DocumentSummary](#schema-documentsummary)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-purchaseorderslegacypage"></a>

### Schema purchaseordersLegacyPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[purchaseordersLegacySummary](#schema-purchaseorderslegacysummary)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-documentdetailpage"></a>

### Schema DocumentDetailPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `document` | [DocumentSummary](#schema-documentsummary) | true | — |
| `purchaseOrderLines` | array&lt;[PurchaseOrderLine](#schema-purchaseorderline)&gt; | true | items[0]: — |
| `inboundRequestLines` | array&lt;[InboundRequestLine](#schema-inboundrequestline)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |
| `itemDisplayContext` | [ItemDisplayContext](#schema-itemdisplaycontext) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaseorderline"></a>

### Schema PurchaseOrderLine

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `quantity2` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | [PurchaseOrderLineFields](#schema-purchaseorderlinefields) / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaseorderlinefields"></a>

### Schema PurchaseOrderLineFields

Object: `{"type":"object","additionalProperties":false,"x-medcom-source-table":"AP_OrderDetailTbl"}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(40); nullable=false |
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false |
| `itemId` | string | true | SQL ItemID nvarchar(50); nullable=false |
| `quantity` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL Quantity decimal(28, 2); nullable=true |
| `unitPrice` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL UnitPrice decimal(28, 4); nullable=true |
| `sourceAmount` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL SourceAmount decimal(18, 2); nullable=true |
| `amount` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL Amount decimal(28, 0); nullable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(100); nullable=true |
| `quantity2` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL Quantity2 decimal(28, 4); nullable=true |
| `property` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Property nvarchar(50); nullable=true |
| `property2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Property2 nvarchar(50); nullable=true |
| `parentId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ParentID varchar(50); nullable=true |

<a id="schema-inboundrequestline"></a>

### Schema InboundRequestLine

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `setQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `setQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | [InboundRequestLineFields](#schema-inboundrequestlinefields) / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inboundrequestlinefields"></a>

### Schema InboundRequestLineFields

Object: `{"type":"object","additionalProperties":false,"x-medcom-source-table":"IV_InboundRequestDetailsTbl"}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(50); nullable=false |
| `documentId` | string | true | SQL DocumentID varchar(50); nullable=false |
| `contractId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ContractID nvarchar(100); nullable=true |
| `itemId` | string | true | SQL ItemID varchar(50); nullable=false |
| `hangSX` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL HangSX nvarchar(100); nullable=true |
| `unitFactor` | number / null | true | anyOf[0]: —; anyOf[1]: —; SQL UnitFactor float; nullable=true |
| `unit2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Unit2 nvarchar(50); nullable=true |
| `additional` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL Additional bit; nullable=true |
| `lotNumberByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LotNumberByDocument nvarchar(50); nullable=true |
| `setQuantityByDocument` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL SetQuantityByDocument decimal(18, 0); nullable=true |
| `barrelQuantityByDocument` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL BarrelQuantityByDocument decimal(18, 0); nullable=true |
| `expireDateByDocument` | string / null | true | description="sql-datetime-without-timezone"; anyOf[0]: pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"; anyOf[1]: —; SQL ExpireDateByDocument datetime; nullable=true |
| `lotNumberByReal` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LotNumberByReal nvarchar(50); nullable=true |
| `setQuantityByReal` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL SetQuantityByReal decimal(18, 0); nullable=true |
| `barrelQuantityByReal` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL BarrelQuantityByReal decimal(18, 0); nullable=true |
| `expireDateByReal` | string / null | true | description="sql-datetime-without-timezone"; anyOf[0]: pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"; anyOf[1]: —; SQL ExpireDateByReal datetime; nullable=true |
| `sourceAmount` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL SourceAmount decimal(18, 0); nullable=true |
| `unitPrice` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL UnitPrice decimal(18, 0); nullable=true |
| `amount` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL Amount decimal(18, 0); nullable=true |
| `randomTestQuantity` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL RandomTestQuantity decimal(18, 0); nullable=true |
| `testStatus` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TestStatus nvarchar(100); nullable=true |
| `noPalletNote` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NoPalletNote nvarchar(500); nullable=true |
| `palletNote` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PalletNote nvarchar(500); nullable=true |
| `checkerNote` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CheckerNote nvarchar(500); nullable=true |
| `itemCode` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ItemCode nvarchar(50); nullable=true |
| `parentId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ParentID varchar(50); nullable=true |

<a id="schema-itemdisplaycontext"></a>

### Schema ItemDisplayContext

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | — |
| `documentId` | string | true | — |
| `branchId` | string | true | — |
| `stateToken` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `page` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `pageSize` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `lines` | array&lt;[ItemDisplayLine](#schema-itemdisplayline)&gt; | true | items[0]: — |

<a id="schema-itemdisplayline"></a>

### Schema ItemDisplayLine

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `manufacturerItemCode` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `manufacturerCodeSource` | string | true | — |
| `itemName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `unit` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `referenceState` | string | true | — |

<a id="schema-purchaseorderslegacydetail"></a>

### Schema purchaseordersLegacyDetail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `document` | [purchaseordersLegacySummary](#schema-purchaseorderslegacysummary) | true | — |
| `purchaseOrderLines` | array&lt;[purchaseordersLegacypurchaseOrderLines](#schema-purchaseorderslegacypurchaseorderlines)&gt; | true | items[0]: — |
| `inboundRequestLines` | array&lt;[purchaseordersLegacyinboundRequestLines](#schema-purchaseorderslegacyinboundrequestlines)&gt; | true | maxItems=0; items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |
| `itemDisplayContext` | [ItemDisplayContext](#schema-itemdisplaycontext) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaseorderslegacypurchaseorderlines"></a>

### Schema purchaseordersLegacypurchaseOrderLines

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `quantity2` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | [PurchaseOrderLineFields](#schema-purchaseorderlinefields) | true | — |

<a id="schema-purchaseorderslegacyinboundrequestlines"></a>

### Schema purchaseordersLegacyinboundRequestLines

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `setQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `setQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaseordersv2summary"></a>

### Schema purchaseordersV2Summary

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `documentDate` | string | true | — |
| `branchId` | string | true | — |
| `statusId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `purchaseOrderHeader` | [PurchaseOrderHeaderFields](#schema-purchaseorderheaderfields) | true | — |

<a id="schema-purchaseordersv2page"></a>

### Schema purchaseordersV2Page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[purchaseordersV2Summary](#schema-purchaseordersv2summary)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-purchaseordersv2detail"></a>

### Schema purchaseordersV2Detail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `document` | [purchaseordersV2Summary](#schema-purchaseordersv2summary) | true | — |
| `purchaseOrderLines` | array&lt;[purchaseordersV2purchaseOrderLines](#schema-purchaseordersv2purchaseorderlines)&gt; | true | items[0]: — |
| `inboundRequestLines` | array&lt;[purchaseordersV2inboundRequestLines](#schema-purchaseordersv2inboundrequestlines)&gt; | true | maxItems=0; items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |
| `itemDisplayContext` | [ItemDisplayContext](#schema-itemdisplaycontext) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaseordersv2purchaseorderlines"></a>

### Schema purchaseordersV2purchaseOrderLines

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `quantity2` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | [PurchaseOrderLineFields](#schema-purchaseorderlinefields) | true | — |

<a id="schema-purchaseordersv2inboundrequestlines"></a>

### Schema purchaseordersV2inboundRequestLines

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `setQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `setQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inboundrequestslegacysummary"></a>

### Schema inboundrequestsLegacySummary

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `documentDate` | string | true | — |
| `branchId` | string | true | — |
| `statusId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `inboundRequestHeader` | [InboundRequestHeaderFields](#schema-inboundrequestheaderfields) | true | — |

<a id="schema-inboundrequestslegacypage"></a>

### Schema inboundrequestsLegacyPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[inboundrequestsLegacySummary](#schema-inboundrequestslegacysummary)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-inboundrequestslegacydetail"></a>

### Schema inboundrequestsLegacyDetail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `document` | [inboundrequestsLegacySummary](#schema-inboundrequestslegacysummary) | true | — |
| `purchaseOrderLines` | array&lt;[inboundrequestsLegacypurchaseOrderLines](#schema-inboundrequestslegacypurchaseorderlines)&gt; | true | maxItems=0; items[0]: — |
| `inboundRequestLines` | array&lt;[inboundrequestsLegacyinboundRequestLines](#schema-inboundrequestslegacyinboundrequestlines)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |
| `itemDisplayContext` | [ItemDisplayContext](#schema-itemdisplaycontext) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inboundrequestslegacypurchaseorderlines"></a>

### Schema inboundrequestsLegacypurchaseOrderLines

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `quantity2` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inboundrequestslegacyinboundrequestlines"></a>

### Schema inboundrequestsLegacyinboundRequestLines

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `setQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `setQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | [InboundRequestLineFields](#schema-inboundrequestlinefields) | true | — |

<a id="schema-inboundrequestsv2summary"></a>

### Schema inboundrequestsV2Summary

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `documentDate` | string | true | — |
| `branchId` | string | true | — |
| `statusId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `inboundRequestHeader` | [InboundRequestHeaderFields](#schema-inboundrequestheaderfields) | true | — |

<a id="schema-inboundrequestsv2page"></a>

### Schema inboundrequestsV2Page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[inboundrequestsV2Summary](#schema-inboundrequestsv2summary)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-inboundrequestsv2detail"></a>

### Schema inboundrequestsV2Detail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `document` | [inboundrequestsV2Summary](#schema-inboundrequestsv2summary) | true | — |
| `purchaseOrderLines` | array&lt;[inboundrequestsV2purchaseOrderLines](#schema-inboundrequestsv2purchaseorderlines)&gt; | true | maxItems=0; items[0]: — |
| `inboundRequestLines` | array&lt;[inboundrequestsV2inboundRequestLines](#schema-inboundrequestsv2inboundrequestlines)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |
| `itemDisplayContext` | [ItemDisplayContext](#schema-itemdisplaycontext) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inboundrequestsv2purchaseorderlines"></a>

### Schema inboundrequestsV2purchaseOrderLines

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `quantity2` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inboundrequestsv2inboundrequestlines"></a>

### Schema inboundrequestsV2inboundRequestLines

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `itemId` | string | true | — |
| `setQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByDocument` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `setQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `barrelQuantityByReal` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | [InboundRequestLineFields](#schema-inboundrequestlinefields) | true | — |

<a id="schema-purchaserequestlistrow"></a>

### Schema PurchaseRequestListRow

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `purchaseDate` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `branchId` | string | true | — |
| `personSuggest` | string | true | — |
| `department` | string | true | — |
| `statusId` | integer (int32) | true | — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | [PurchaseRequestHeaderFields](#schema-purchaserequestheaderfields) / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestheaderfields"></a>

### Schema PurchaseRequestHeaderFields

Object: `{"type":"object","additionalProperties":false,"x-medcom-source-table":"AP_PurchaseRequestTbl"}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `purchaseRequestId` | string | true | SQL PurchaseRequestID nvarchar(50); nullable=false |
| `purchaseDate` | string / null | true | description="sql-datetime-without-timezone"; anyOf[0]: pattern="^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$"; anyOf[1]: —; SQL PurchaseDate datetime; nullable=true |
| `purposeId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: —; SQL PurposeID int; nullable=true |
| `personSuggest` | string | true | SQL PersonSuggest nvarchar(500); nullable=false |
| `department` | string | true | SQL Department nvarchar(100); nullable=false |
| `purposeDescOrClient` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PurposeDescOrClient nvarchar(max); nullable=true |
| `price` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL Price decimal(18, 2); nullable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(max); nullable=true |
| `statusId` | integer (int32) | true | SQL StatusID int; nullable=false |
| `isLock` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL isLock bit; nullable=true |
| `currencyId` | string | true | SQL CurrencyID varchar(3); nullable=false |
| `objectId` | string | true | SQL ObjectID varchar(100); nullable=false |
| `rateExchange` | number | true | SQL RateExchange float; nullable=false |
| `branchId` | string | true | SQL BranchID varchar(50); nullable=false |

<a id="schema-purchaserequestrowlegacy"></a>

### Schema PurchaseRequestRowLegacy

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `purchaseDate` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `branchId` | string | true | — |
| `personSuggest` | string | true | — |
| `department` | string | true | — |
| `statusId` | integer (int32) | true | — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | [PurchaseRequestHeaderFields](#schema-purchaserequestheaderfields) | true | — |

<a id="schema-purchaserequestlistpage"></a>

### Schema PurchaseRequestListPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[PurchaseRequestListRow](#schema-purchaserequestlistrow)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-purchaserequestpagelegacy"></a>

### Schema PurchaseRequestPageLegacy

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[PurchaseRequestRowLegacy](#schema-purchaserequestrowlegacy)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-purchaserequestscopedresponse_purchaserequestlistpage"></a>

### Schema PurchaseRequestScopedResponse_PurchaseRequestListPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestListPage](#schema-purchaserequestlistpage) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestlistlegacy"></a>

### Schema PurchaseRequestListLegacy

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestPageLegacy](#schema-purchaserequestpagelegacy) | true | — |

<a id="schema-purchaserequestreadback"></a>

### Schema PurchaseRequestReadback

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `document` | [PurchaseRequestAggregate](#schema-purchaserequestaggregate) | true | — |
| `stateToken` | string | true | — |
| `commandAccess` | [PurchaseRequestCommandAccessState](#schema-purchaserequestcommandaccessstate) / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `itemDisplayContext` | [ItemDisplayContext](#schema-itemdisplaycontext) / null | true | anyOf[0]: —; anyOf[1]: — |
| `sourceFields` | [PurchaseRequestSourceFields](#schema-purchaserequestsourcefields) / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestaggregate"></a>

### Schema PurchaseRequestAggregate

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `purchaseRequestId` | string | true | — |
| `branchId` | string | true | — |
| `header` | [PurchaseRequestHeaderInput](#schema-purchaserequestheaderinput) | true | — |
| `statusId` | integer (int32) | true | — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `lines` | array&lt;[PurchaseRequestPersistedLine](#schema-purchaserequestpersistedline)&gt; | true | items[0]: — |

<a id="schema-purchaserequestheaderinput"></a>

### Schema PurchaseRequestHeaderInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `purchaseDate` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `purposeId` | integer (int32) / null | true | anyOf[0]: —; anyOf[1]: — |
| `personSuggest` | string | true | — |
| `department` | string | true | — |
| `purposeDescOrClient` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `price` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `currencyId` | string | true | — |
| `objectId` | string | true | — |
| `rateExchange` | number | true | — |

<a id="schema-purchaserequestpersistedline"></a>

### Schema PurchaseRequestPersistedLine

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `values` | [PurchaseRequestLineValues](#schema-purchaserequestlinevalues) | true | — |

<a id="schema-purchaserequestlinevalues"></a>

### Schema PurchaseRequestLineValues

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `itemId` | string | true | — |
| `budget` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `timeRequired` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `quantity` | string | true | — |
| `unitPrice` | string | true | — |
| `totalPrice` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `model` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestcommandaccessstate"></a>

### Schema PurchaseRequestCommandAccessState

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `canSave` | boolean | true | — |
| `canSubmit` | boolean | true | — |
| `canLookup` | boolean | true | — |
| `canAddLines` | boolean | true | — |
| `reason` | string | true | — |

<a id="schema-purchaserequestsourcefields"></a>

### Schema PurchaseRequestSourceFields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `header` | [PurchaseRequestHeaderFields](#schema-purchaserequestheaderfields) | true | — |
| `lines` | array&lt;[PurchaseRequestLineFields](#schema-purchaserequestlinefields)&gt; | true | items[0]: — |

<a id="schema-purchaserequestlinefields"></a>

### Schema PurchaseRequestLineFields

Object: `{"type":"object","additionalProperties":false,"x-medcom-source-table":"AP_PurchaseRequestDetailTbl"}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(50); nullable=false |
| `itemId` | string | true | SQL ItemID varchar(50); nullable=false |
| `budget` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL Budget decimal(18, 0); nullable=true |
| `timeRequired` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TimeRequired nvarchar(200); nullable=true |
| `quantity` | string | true | pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; description="decimal-string"; SQL Quantity decimal(18, 0); nullable=false |
| `unitPrice` | string | true | pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; description="decimal-string"; SQL UnitPrice decimal(18, 0); nullable=false |
| `totalPrice` | string / null | true | description="decimal-string"; anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: —; SQL TotalPrice decimal(18, 0); nullable=true |
| `model` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Model varchar(50); nullable=true |
| `purchaseRequestId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PurchaseRequestID nvarchar(50); nullable=true |

<a id="schema-purchaserequestreadlegacy"></a>

### Schema PurchaseRequestReadLegacy

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `document` | [PurchaseRequestAggregate](#schema-purchaserequestaggregate) | true | — |
| `stateToken` | string | true | — |
| `commandAccess` | [PurchaseRequestCommandAccessState](#schema-purchaserequestcommandaccessstate) / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `itemDisplayContext` | [ItemDisplayContext](#schema-itemdisplaycontext) / null | true | anyOf[0]: —; anyOf[1]: — |
| `sourceFields` | [PurchaseRequestSourceFields](#schema-purchaserequestsourcefields) | true | — |

<a id="schema-purchaserequestscopedresponse_purchaserequestreadback"></a>

### Schema PurchaseRequestScopedResponse_PurchaseRequestReadback

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestReadback](#schema-purchaserequestreadback) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestdetaillegacy"></a>

### Schema PurchaseRequestDetailLegacy

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestReadLegacy](#schema-purchaserequestreadlegacy) | true | — |

<a id="schema-purchaserequestrowv2"></a>

### Schema PurchaseRequestRowV2

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `purchaseDate` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `branchId` | string | true | — |
| `personSuggest` | string | true | — |
| `department` | string | true | — |
| `statusId` | integer (int32) | true | — |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | [PurchaseRequestHeaderFields](#schema-purchaserequestheaderfields) | true | — |

<a id="schema-purchaserequestpagev2"></a>

### Schema PurchaseRequestPageV2

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[PurchaseRequestRowV2](#schema-purchaserequestrowv2)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-purchaserequestlistv2"></a>

### Schema PurchaseRequestListV2

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestPageV2](#schema-purchaserequestpagev2) | true | — |

<a id="schema-purchaserequestreadv2"></a>

### Schema PurchaseRequestReadV2

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `document` | [PurchaseRequestAggregate](#schema-purchaserequestaggregate) | true | — |
| `stateToken` | string | true | — |
| `commandAccess` | [PurchaseRequestCommandAccessState](#schema-purchaserequestcommandaccessstate) / null | true | anyOf[0]: —; anyOf[1]: — |
| `statusName` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `itemDisplayContext` | [ItemDisplayContext](#schema-itemdisplaycontext) / null | true | anyOf[0]: —; anyOf[1]: — |
| `sourceFields` | [PurchaseRequestSourceFields](#schema-purchaserequestsourcefields) | true | — |

<a id="schema-purchaserequestdetailv2"></a>

### Schema PurchaseRequestDetailV2

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestReadV2](#schema-purchaserequestreadv2) | true | — |

<a id="schema-purchaserequestscopedresponse_purchaserequestworkspace"></a>

### Schema PurchaseRequestScopedResponse_PurchaseRequestWorkspace

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestWorkspace](#schema-purchaserequestworkspace) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestworkspace"></a>

### Schema PurchaseRequestWorkspace

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchIds` | array&lt;string&gt; | true | items[0]: — |
| `writeAvailable` | boolean | true | — |
| `writeReason` | string | true | — |
| `lookups` | array&lt;[PurchaseRequestLookupState](#schema-purchaserequestlookupstate)&gt; | true | items[0]: — |

<a id="schema-purchaserequestlookupstate"></a>

### Schema PurchaseRequestLookupState

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | — |
| `available` | boolean | true | — |
| `reason` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `evidence` | string | true | — |

<a id="schema-purchaserequestscopedresponse_purchaserequestlookuppage"></a>

### Schema PurchaseRequestScopedResponse_PurchaseRequestLookupPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestLookupPage](#schema-purchaserequestlookuppage) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestlookuppage"></a>

### Schema PurchaseRequestLookupPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `available` | boolean | true | — |
| `reason` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `items` | array&lt;[PurchaseRequestChoice](#schema-purchaserequestchoice)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-purchaserequestchoice"></a>

### Schema PurchaseRequestChoice

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `id` | string | true | — |
| `label` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `currencyName` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `rateExchange` | number / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestscopedresponse_purchaserequestcommandresult"></a>

### Schema PurchaseRequestScopedResponse_PurchaseRequestCommandResult

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestCommandResult](#schema-purchaserequestcommandresult) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestcommandresult"></a>

### Schema PurchaseRequestCommandResult

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `outcome` | [PurchaseRequestCommandOutcome](#schema-purchaserequestcommandoutcome) | true | — |
| `receipt` | [PurchaseRequestCommandReceipt](#schema-purchaserequestcommandreceipt) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestcommandoutcome"></a>

### Schema PurchaseRequestCommandOutcome

Kiểu: integer.

Định nghĩa: `{"type":"integer","enum":[0,1,2,3,4,5,6,7,8]}`.

<a id="schema-purchaserequestcommandreceipt"></a>

### Schema PurchaseRequestCommandReceipt

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `actionId` | string | true | — |
| `idempotencyKey` | string | true | — |
| `document` | [PurchaseRequestAggregate](#schema-purchaserequestaggregate) | true | — |
| `stateToken` | string | true | — |
| `allocatedLines` | array&lt;[PurchaseRequestAllocatedLine](#schema-purchaserequestallocatedline)&gt; | true | items[0]: — |

<a id="schema-purchaserequestallocatedline"></a>

### Schema PurchaseRequestAllocatedLine

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `clientLineKey` | string | true | — |
| `lineId` | string | true | — |

<a id="schema-savepurchaserequestdraft"></a>

### Schema SavePurchaseRequestDraft

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `purchaseRequestId` | string | true | — |
| `expectedStateToken` | string | true | pattern="^prs1\\.[0-9A-Fa-f]{64}$" |
| `header` | [PurchaseRequestHeaderInput](#schema-purchaserequestheaderinput) | true | — |
| `lineChanges` | array&lt;[PurchaseRequestLineChange](#schema-purchaserequestlinechange)&gt; | true | maxItems=500; items[0]: — |

<a id="schema-purchaserequestlinechange"></a>

### Schema PurchaseRequestLineChange

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | enum=["Update","Remove"] |
| `lineId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `clientLineKey` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `values` | [PurchaseRequestLineValues](#schema-purchaserequestlinevalues) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestlinechangekind"></a>

### Schema PurchaseRequestLineChangeKind

Kiểu: string.

Định nghĩa: `{"type":"string","enum":["Add","Update","Remove"]}`.

<a id="schema-purchaserequestscopedresponse_purchaserequestlookupresult"></a>

### Schema PurchaseRequestScopedResponse_PurchaseRequestLookupResult

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string | true | — |
| `data` | [PurchaseRequestLookupResult](#schema-purchaserequestlookupresult) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestlookupresult"></a>

### Schema PurchaseRequestLookupResult

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `outcome` | [PurchaseRequestLookupOutcome](#schema-purchaserequestlookupoutcome) | true | — |
| `receipt` | [PurchaseRequestCommandReceipt](#schema-purchaserequestcommandreceipt) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-purchaserequestlookupoutcome"></a>

### Schema PurchaseRequestLookupOutcome

Kiểu: integer.

Định nghĩa: `{"type":"integer","enum":[0,1,2,3,4,5,6,7,8]}`.

<a id="schema-submitpurchaserequest"></a>

### Schema SubmitPurchaseRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `purchaseRequestId` | string | true | — |
| `expectedStateToken` | string | true | pattern="^prs1\\.[0-9A-Fa-f]{64}$" |

<a id="schema-inbounddraftworkspace"></a>

### Schema InboundDraftWorkspace

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `access` | [InboundDraftAccessView](#schema-inbounddraftaccessview) | true | — |
| `data` | [InboundDraftReadResult](#schema-inbounddraftreadresult) | true | — |

<a id="schema-inbounddraftaccessview"></a>

### Schema InboundDraftAccessView

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `canRead` | boolean | true | — |
| `canSave` | boolean | true | — |
| `canSend` | boolean | true | — |
| `available` | boolean | true | — |
| `maxCommandBytes` | integer (int32) | true | — |

<a id="schema-inbounddraftreadresult"></a>

### Schema InboundDraftReadResult

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `outcome` | [InboundDraftOutcome](#schema-inbounddraftoutcome) | true | — |
| `document` | [InboundDraftView](#schema-inbounddraftview) / null | true | anyOf[0]: —; anyOf[1]: — |
| `itemDisplayContext` | [ItemDisplayContext](#schema-itemdisplaycontext) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inbounddraftoutcome"></a>

### Schema InboundDraftOutcome

Kiểu: string.

Định nghĩa: `{"type":"string","enum":["Observed","Committed","Replayed","InvalidInput","Denied","NotFound","Conflict","Rejected","UnsupportedCostEdits","NumberingUnavailable","Unavailable","OutcomeUnknown"]}`.

<a id="schema-inbounddraftview"></a>

### Schema InboundDraftView

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `statusId` | integer (int32) | true | — |
| `header` | [InboundDraftHeader](#schema-inbounddraftheader) | true | — |
| `details` | array&lt;[InboundDraftDetailUpsert](#schema-inbounddraftdetailupsert)&gt; | true | items[0]: — |
| `costRowCount` | integer (int32) | true | — |
| `stateEqualityToken` | string | true | — |
| `costEditingSupported` | boolean | true | — |

<a id="schema-inbounddraftheader"></a>

### Schema InboundDraftHeader

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentDate` | string | true | description="SQL wall-clock datetime for document fields; receipt CommittedAtUtc is UTC. No inferred timezone conversion." |
| `orderNumber` | string | true | — |
| `invoiceNo` | string | true | — |
| `departurePoint` | string | true | — |
| `destinationPoint` | string | true | — |
| `orderTypeId` | string | true | — |
| `branchId` | string | true | — |
| `objectId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `currencyId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `rateExchange` | string / null | false | anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inbounddraftdetailupsert"></a>

### Schema InboundDraftDetailUpsert

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rowId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `clientLineId` | string (uuid) / null | false | anyOf[0]: —; anyOf[1]: — |
| `itemId` | string | true | — |
| `lotNumberByDocument` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `setQuantityByDocument` | string / null | false | anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: — |
| `barrelQuantityByDocument` | string / null | false | anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: — |
| `expireDateByDocument` | string / null | false | anyOf[0]: description="SQL wall-clock datetime for document fields; receipt CommittedAtUtc is UTC. No inferred timezone conversion."; anyOf[1]: — |
| `unitPrice` | string / null | false | anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: — |

<a id="schema-inbounddraftcommandresponse"></a>

### Schema InboundDraftCommandResponse

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `scopeKey` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `data` | [InboundDraftResult](#schema-inbounddraftresult) | true | — |

<a id="schema-inbounddraftresult"></a>

### Schema InboundDraftResult

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `outcome` | [InboundDraftOutcome](#schema-inbounddraftoutcome) | true | — |
| `receipt` | [InboundDraftReceipt](#schema-inbounddraftreceipt) / null | true | anyOf[0]: —; anyOf[1]: — |
| `code` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inbounddraftreceipt"></a>

### Schema InboundDraftReceipt

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `operationId` | string (uuid) | true | — |
| `documentId` | string | true | — |
| `statusId` | integer (int32) | true | — |
| `stateEqualityToken` | string | true | — |
| `auditId` | string (uuid) | true | — |
| `committedAtUtc` | string | true | description="SQL wall-clock datetime for document fields; receipt CommittedAtUtc is UTC. No inferred timezone conversion." |

<a id="schema-inbounddraftcommand"></a>

### Schema InboundDraftCommand

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `operationId` | string (uuid) | true | — |
| `action` | string | true | enum=["Save","SendToWarehouse"] |
| `documentId` | string | true | minLength=1; maxLength=50 |
| `expectedStateEqualityToken` | string | true | pattern="^[0-9A-F]{64}$" |
| `header` | [InboundDraftHeader](#schema-inbounddraftheader) / null | true | anyOf[0]: —; anyOf[1]: — |
| `detailUpserts` | array&lt;[InboundDraftDetailUpsert](#schema-inbounddraftdetailupsert)&gt; / null | false | anyOf[0]: items[0]: —; anyOf[1]: — |
| `removedDetailIds` | array&lt;string&gt; / null | false | anyOf[0]: items[0]: —; anyOf[1]: — |
| `costChanges` | ['array', 'null'] | false | maxItems=0; items[0]: — |
| `note` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inbounddraftaction"></a>

### Schema InboundDraftAction

Kiểu: string.

Định nghĩa: `{"type":"string","enum":["Create","Save","SendToWarehouse"]}`.

<a id="schema-inbounddraftcostinput"></a>

### Schema InboundDraftCostInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rowId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `objectId` | string | true | — |
| `ncc` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `memo` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `costType` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `currencyId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `rateExchange` | string / null | true | anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: — |
| `sourceAmount` | string / null | true | anyOf[0]: pattern="^-?[0-9]+(?:\\.[0-9]+)?$"; anyOf[1]: — |
| `vatId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `expenseAccountId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `invoiceNo` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `invoiceDate` | string / null | true | anyOf[0]: description="SQL wall-clock datetime for document fields; receipt CommittedAtUtc is UTC. No inferred timezone conversion."; anyOf[1]: — |
| `allocateKind` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-inbounddraftsavepayload"></a>

### Schema InboundDraftSavePayload

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `operationId` | string (uuid) | true | — |
| `action` | string | true | const="Save" |
| `documentId` | string | true | minLength=1; maxLength=50 |
| `expectedStateEqualityToken` | string | true | pattern="^[0-9A-F]{64}$" |
| `header` | [InboundDraftHeader](#schema-inbounddraftheader) | true | — |
| `detailUpserts` | ['array', 'null'] | false | maxItems=500; items[0]: — |
| `removedDetailIds` | ['array', 'null'] | false | maxItems=500; items[0]: — |
| `costChanges` | ['array', 'null'] | false | maxItems=0; items[0]: — |
| `note` | null | false | — |

<a id="schema-inbounddraftsendpayload"></a>

### Schema InboundDraftSendPayload

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `operationId` | string (uuid) | true | — |
| `action` | string | true | const="SendToWarehouse" |
| `documentId` | string | true | minLength=1; maxLength=50 |
| `expectedStateEqualityToken` | string | true | pattern="^[0-9A-F]{64}$" |
| `header` | null | true | — |
| `detailUpserts` | ['array', 'null'] | false | maxItems=0; items[0]: — |
| `removedDetailIds` | ['array', 'null'] | false | maxItems=0; items[0]: — |
| `costChanges` | ['array', 'null'] | false | maxItems=0; items[0]: — |
| `note` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpscopedresponse_erpscreendescription"></a>

### Schema ErpScopedResponse_ErpScreenDescription

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [ErpScreenDescription](#schema-erpscreendescription) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpscreendescription"></a>

### Schema ErpScreenDescription

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `id` | string | true | — |
| `caption` | string | true | — |
| `menuId` | string | true | — |
| `formId` | string | true | — |
| `fields` | dictionary&lt;array&lt;[ErpFieldDefinition](#schema-erpfielddefinition)&gt;&gt; | true | additionalProperties={"type":"array","items":{"$ref":"#/components/schemas/ErpFieldDefinition"}} |
| `actions` | array&lt;[ErpActionDefinition](#schema-erpactiondefinition)&gt; | true | items[0]: — |
| `lookups` | array&lt;[ErpLookupDefinition](#schema-erplookupdefinition)&gt; | true | items[0]: — |
| `evidence` | string | true | — |

<a id="schema-erpfielddefinition"></a>

### Schema ErpFieldDefinition

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `name` | string | true | — |
| `column` | string | true | — |
| `sqlType` | string | true | — |
| `typeArguments` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `nullable` | boolean | true | — |
| `ordinal` | integer (int32) | true | — |
| `hasDefault` | boolean | true | — |
| `writable` | boolean | true | — |

<a id="schema-erpactiondefinition"></a>

### Schema ErpActionDefinition

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `id` | string | true | — |
| `caption` | string | true | — |
| `control` | string | true | — |
| `operation` | string | true | — |
| `lockExpression` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `nativeVisible` | boolean | true | — |
| `requiresSavedDocument` | boolean | true | — |
| `evidence` | string | true | — |

<a id="schema-erplookupdefinition"></a>

### Schema ErpLookupDefinition

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `id` | string | true | — |
| `grid` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `field` | string | true | — |
| `valueField` | string | true | — |
| `displayField` | string | true | — |
| `linkedFields` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `parameters` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `requiredParameters` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `multiSelect` | boolean | true | — |
| `disabled` | boolean | true | — |
| `sourceHash` | string | true | — |

<a id="schema-erpscopedresponse_erpdocumentpage"></a>

### Schema ErpScopedResponse_ErpDocumentPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [ErpDocumentPage](#schema-erpdocumentpage) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpdocumentpage"></a>

### Schema ErpDocumentPage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[ErpDocumentRow](#schema-erpdocumentrow)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erpdocumentrow"></a>

### Schema ErpDocumentRow

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `header` | dictionary&lt;any JSON&gt; | true | additionalProperties={"description":"Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation."} |

<a id="schema-erpscopedresponse_erpdocumentdetail"></a>

### Schema ErpScopedResponse_ErpDocumentDetail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [ErpDocumentDetail](#schema-erpdocumentdetail) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpdocumentdetail"></a>

### Schema ErpDocumentDetail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `branchId` | string | true | — |
| `stateToken` | string | true | — |
| `header` | dictionary&lt;any JSON&gt; | true | additionalProperties={"description":"Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation."} |
| `lines` | [ErpLinePage](#schema-erplinepage) | true | — |
| `history` | [ErpLinePage](#schema-erplinepage) / null | true | anyOf[0]: —; anyOf[1]: — |
| `comparison` | [ErpLinePage](#schema-erplinepage) / null | true | anyOf[0]: —; anyOf[1]: — |
| `actions` | array&lt;[ErpActionState](#schema-erpactionstate)&gt; | true | items[0]: — |

<a id="schema-erplinepage"></a>

### Schema ErpLinePage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[ErpLineRow](#schema-erplinerow)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erplinerow"></a>

### Schema ErpLineRow

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | dictionary&lt;any JSON&gt; | true | additionalProperties={"description":"Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation."} |

<a id="schema-erpactionstate"></a>

### Schema ErpActionState

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `id` | string | true | — |
| `caption` | string | true | — |
| `visible` | boolean | true | — |
| `enabled` | boolean | true | — |
| `reason` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `requiresSavedDocument` | boolean | true | — |
| `route` | string / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpscopedresponse_ireadonlylist_erpactionstate"></a>

### Schema ErpScopedResponse_IReadOnlyList_ErpActionState

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | array&lt;[ErpActionState](#schema-erpactionstate)&gt; / null | true | anyOf[0]: items[0]: —; anyOf[1]: — |

<a id="schema-erpscopedresponse_erpchoicepage"></a>

### Schema ErpScopedResponse_ErpChoicePage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [ErpChoicePage](#schema-erpchoicepage) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpchoicepage"></a>

### Schema ErpChoicePage

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `items` | array&lt;[ErpChoice](#schema-erpchoice)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |
| `requiredParameters` | array&lt;string&gt; | true | items[0]: — |

<a id="schema-erpchoice"></a>

### Schema ErpChoice

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `id` | string | true | — |
| `label` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `fields` | dictionary&lt;any JSON&gt; | true | additionalProperties={"description":"Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation."} |

<a id="schema-erplookupquery"></a>

### Schema ErpLookupQuery

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchId` | string | true | — |
| `lookupId` | string | true | — |
| `page` | integer (int32) | false | — |
| `pageSize` | integer (int32) | false | — |
| `search` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `context` | dictionary&lt;string&gt; / null | false | anyOf[0]: additionalProperties={"type":"string"}; anyOf[1]: — |

<a id="schema-erppmlookupquery"></a>

### Schema ErpPmLookupQuery

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchId` | string | true | — |
| `role` | string | false | enum=["primary","supporting"]; default="primary" |
| `page` | integer (int32) | false | — |
| `pageSize` | integer (int32) | false | — |
| `search` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpscopedresponse_erpcommandobservation"></a>

### Schema ErpScopedResponse_ErpCommandObservation

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [ErpCommandObservation](#schema-erpcommandobservation) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpcommandobservation"></a>

### Schema ErpCommandObservation

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `outcome` | string | true | — |
| `receipt` | [ErpCommandReceipt](#schema-erpcommandreceipt) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpcommandreceipt"></a>

### Schema ErpCommandReceipt

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `module` | string | true | — |
| `operation` | string | true | — |
| `idempotencyKey` | string | true | — |
| `documentId` | string | true | — |
| `stateToken` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `auditId` | string | true | — |
| `deleted` | boolean | true | — |
| `allocatedLines` | array&lt;[ErpAllocatedLine](#schema-erpallocatedline)&gt; | true | items[0]: — |

<a id="schema-erpallocatedline"></a>

### Schema ErpAllocatedLine

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `clientLineKey` | string | true | — |
| `lineId` | string | true | — |

<a id="schema-erpcommandlookuprequest"></a>

### Schema ErpCommandLookupRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `operation` | string | true | — |
| `originalIntent` | any JSON | true | description="Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation." |

<a id="schema-erpscopedresponse_erpdraftselection"></a>

### Schema ErpScopedResponse_ErpDraftSelection

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [ErpDraftSelection](#schema-erpdraftselection) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpdraftselection"></a>

### Schema ErpDraftSelection

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lines` | array&lt;[ErpNewLine](#schema-erpnewline)&gt; | true | items[0]: — |
| `headerPatch` | dictionary&lt;any JSON&gt; | true | additionalProperties={"description":"Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation."} |
| `sourceEvidence` | string | true | — |
| `revalidatedOnSave` | boolean | true | — |

<a id="schema-erpnewline"></a>

### Schema ErpNewLine

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `clientLineKey` | string | true | — |
| `values` | any JSON | true | description="Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation." |

<a id="schema-erpselectionrequest"></a>

### Schema ErpSelectionRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchId` | string | true | — |
| `sourceId` | string | true | — |
| `selectedKeys` | array&lt;string&gt; | true | items[0]: — |
| `context` | dictionary&lt;string&gt; / null | false | anyOf[0]: additionalProperties={"type":"string"}; anyOf[1]: — |

<a id="schema-erppasterequest"></a>

### Schema ErpPasteRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchId` | string | true | — |
| `rows` | array&lt;any JSON&gt; | true | items[0]: description="Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation." |

<a id="schema-erpcommandresult"></a>

### Schema ErpCommandResult

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `outcome` | [ErpCommandOutcome](#schema-erpcommandoutcome) | true | — |
| `code` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `receipt` | [ErpCommandReceipt](#schema-erpcommandreceipt) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpcommandoutcome"></a>

### Schema ErpCommandOutcome

Kiểu: string.

Định nghĩa: `{"type":"string","enum":["Committed","Replayed","InvalidInput","Denied","Conflict","QualificationRequired","Unavailable","OutcomeUnknown","Cancelled"]}`.

<a id="schema-erpcreaterequest"></a>

### Schema ErpCreateRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `header` | any JSON | true | description="Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation." |
| `lines` | array&lt;[ErpNewLine](#schema-erpnewline)&gt; | true | items[0]: — |

<a id="schema-erpsaverequest"></a>

### Schema ErpSaveRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `header` | any JSON | true | description="Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation." |
| `lineChanges` | array&lt;[ErpLineChange](#schema-erplinechange)&gt; | true | items[0]: — |

<a id="schema-erplinechange"></a>

### Schema ErpLineChange

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | [ErpLineChangeKind](#schema-erplinechangekind) | true | — |
| `lineId` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `clientLineKey` | string / null | true | anyOf[0]: —; anyOf[1]: — |
| `values` | any JSON / null | true | anyOf[0]: description="Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation."; anyOf[1]: — |

<a id="schema-erplinechangekind"></a>

### Schema ErpLineChangeKind

Kiểu: string.

Định nghĩa: `{"type":"string","enum":["Add","Update","Remove"]}`.

<a id="schema-erpdeleterequest"></a>

### Schema ErpDeleteRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |

<a id="schema-erpinternaltransferrequestheaderinput"></a>

### Schema ErpInternalTransferRequestHeaderInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentDate` | string | true | — |
| `fromBranchId` | string | true | — |
| `toBranchId` | string | true | — |
| `requestedTransferDate` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `transferReason` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `transportMethod` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpinternaltransferrequestlineinput"></a>

### Schema ErpInternalTransferRequestLineInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `itemId` | string | true | — |
| `requestedQty` | string | true | — |
| `requestedLot` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `expectedObjectId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `territoryNote` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `isEquipment` | boolean | true | — |
| `requestedAssetId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erp_internal_transfer_requests_new_line"></a>

### Schema Erp_internal_transfer_requests_new_line

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `clientLineKey` | string | true | — |
| `values` | [ErpInternalTransferRequestLineInput](#schema-erpinternaltransferrequestlineinput) | true | — |

<a id="schema-erp_internal_transfer_requests_create"></a>

### Schema Erp_internal_transfer_requests_create

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `header` | [ErpInternalTransferRequestHeaderInput](#schema-erpinternaltransferrequestheaderinput) | true | required=["documentDate"]; properties={"documentDate":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$","description":"Required when creating a numbered document; ERP calendar date/time, yyyy-MM-ddTHH:mm:ss.fff."}} |
| `lines` | array&lt;[Erp_internal_transfer_requests_new_line](#schema-erp_internal_transfer_requests_new_line)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erp_internal_transfer_requests_line_add"></a>

### Schema Erp_internal_transfer_requests_line_add

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Add" |
| `lineId` | null | false | — |
| `clientLineKey` | string | true | maxLength=64 |
| `values` | [ErpInternalTransferRequestLineInput](#schema-erpinternaltransferrequestlineinput) | true | — |

<a id="schema-erp_internal_transfer_requests_line_update"></a>

### Schema Erp_internal_transfer_requests_line_update

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Update" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | [ErpInternalTransferRequestLineInput](#schema-erpinternaltransferrequestlineinput) | true | — |

<a id="schema-erp_internal_transfer_requests_line_remove"></a>

### Schema Erp_internal_transfer_requests_line_remove

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Remove" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | null | false | — |

<a id="schema-erp_internal_transfer_requests_save"></a>

### Schema Erp_internal_transfer_requests_save

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `header` | [ErpInternalTransferRequestHeaderInput](#schema-erpinternaltransferrequestheaderinput) | true | — |
| `lineChanges` | array&lt;oneOf [Erp_internal_transfer_requests_line_add](#schema-erp_internal_transfer_requests_line_add) / [Erp_internal_transfer_requests_line_update](#schema-erp_internal_transfer_requests_line_update) / [Erp_internal_transfer_requests_line_remove](#schema-erp_internal_transfer_requests_line_remove)&gt; | true | maxItems=500; items[0]: oneOf[0]: —; oneOf[1]: —; oneOf[2]: — |

<a id="schema-erp_internal_transfer_requests_paste"></a>

### Schema Erp_internal_transfer_requests_paste

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchId` | string | true | — |
| `rows` | array&lt;[ErpInternalTransferRequestLineInput](#schema-erpinternaltransferrequestlineinput)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erpactionrequest"></a>

### Schema ErpActionRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `payload` | any JSON | true | description="Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation." |

<a id="schema-erp_internal_transfer_requests_recall_request"></a>

### Schema Erp_internal_transfer_requests_recall_request

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `payload` | object | true | required=[]; properties={}; additionalProperties=false |

<a id="schema-erpsendtransferpm"></a>

### Schema ErpSendTransferPm

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `primaryPmId` | string | true | — |
| `supportingPmId` | string | true | — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erp_internal_transfer_requests_send_pm_request"></a>

### Schema Erp_internal_transfer_requests_send_pm_request

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `payload` | [ErpSendTransferPm](#schema-erpsendtransferpm) | true | — |

<a id="schema-erp_internal_transfer_requests_header_fields"></a>

### Schema Erp_internal_transfer_requests_header_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | SQL DocumentID nvarchar(50); nullable=false; writable=false |
| `documentDate` | string | true | SQL DocumentDate datetime; nullable=false; writable=true |
| `salesUser` | string | true | SQL SalesUser varchar(100); nullable=false; writable=false |
| `branchId` | string | true | SQL BranchID varchar(50); nullable=false; writable=false |
| `fromBranchId` | string | true | SQL FromBranchID varchar(50); nullable=false; writable=true |
| `toBranchId` | string | true | SQL ToBranchID varchar(50); nullable=false; writable=true |
| `requestedTransferDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RequestedTransferDate datetime; nullable=true; writable=true |
| `assignedPM` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AssignedPM varchar(100); nullable=true; writable=false |
| `statusId` | integer | true | SQL StatusID int; nullable=false; writable=false |
| `transferReason` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TransferReason nvarchar(500); nullable=true; writable=true |
| `transportMethod` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TransportMethod nvarchar(50); nullable=true; writable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(1000); nullable=true; writable=true |
| `pMConfirmedBy` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PMConfirmedBy varchar(100); nullable=true; writable=false |
| `pMConfirmedAt` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PMConfirmedAt datetime; nullable=true; writable=false |
| `isLocked` | boolean | true | SQL isLock bit; nullable=false; writable=false |
| `userCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserCreate varchar(100); nullable=true; writable=false |
| `userUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserUpdate varchar(100); nullable=true; writable=false |
| `dateCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateCreate datetime; nullable=true; writable=false |
| `dateUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateUpdate datetime; nullable=true; writable=false |
| `sendTo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SendTo nvarchar(max); nullable=true; writable=false |

<a id="schema-erp_internal_transfer_requests_lines_fields"></a>

### Schema Erp_internal_transfer_requests_lines_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID nvarchar(50); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID nvarchar(50); nullable=false; writable=false |
| `itemId` | string | true | SQL ItemID nvarchar(50); nullable=false; writable=true |
| `requestedQty` | string | true | SQL RequestedQty decimal(28, 4); nullable=false; writable=true |
| `pMApprovedQty` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PMApprovedQty decimal(28, 4); nullable=true; writable=false |
| `requestedLot` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RequestedLot nvarchar(100); nullable=true; writable=true |
| `expectedObjectId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ExpectedObjectID varchar(100); nullable=true; writable=true |
| `territoryNote` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TerritoryNote nvarchar(500); nullable=true; writable=true |
| `isEquipment` | boolean | true | SQL IsEquipment bit; nullable=false; writable=true |
| `requestedAssetId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RequestedAssetID varchar(50); nullable=true; writable=true |
| `pMNote` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PMNote nvarchar(500); nullable=true; writable=false |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(500); nullable=true; writable=true |

<a id="schema-erp_internal_transfer_requests_history_fields"></a>

### Schema Erp_internal_transfer_requests_history_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(50); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID varchar(50); nullable=false; writable=false |
| `thoiGian` | string | true | SQL ThoiGian datetime; nullable=false; writable=false |
| `userName` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserName varchar(50); nullable=true; writable=false |
| `statusId` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL StatusID int; nullable=true; writable=false |
| `sendTo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SendTo nvarchar(max); nullable=true; writable=false |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(max); nullable=true; writable=false |

<a id="schema-erp_internal_transfer_requests_document_row"></a>

### Schema Erp_internal_transfer_requests_document_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `header` | [Erp_internal_transfer_requests_header_fields](#schema-erp_internal_transfer_requests_header_fields) | true | — |

<a id="schema-erp_internal_transfer_requests_document_page"></a>

### Schema Erp_internal_transfer_requests_document_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_internal_transfer_requests_document_row](#schema-erp_internal_transfer_requests_document_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_internal_transfer_requests_list_response"></a>

### Schema Erp_internal_transfer_requests_list_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_internal_transfer_requests_document_page](#schema-erp_internal_transfer_requests_document_page) | true | — |

<a id="schema-erp_internal_transfer_requests_detail"></a>

### Schema Erp_internal_transfer_requests_detail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `branchId` | string | true | — |
| `stateToken` | string | true | — |
| `header` | [Erp_internal_transfer_requests_header_fields](#schema-erp_internal_transfer_requests_header_fields) | true | — |
| `lines` | [Erp_internal_transfer_requests_lines_page](#schema-erp_internal_transfer_requests_lines_page) | true | — |
| `history` | [Erp_internal_transfer_requests_history_page](#schema-erp_internal_transfer_requests_history_page) | true | — |
| `comparison` | null | true | — |
| `actions` | array&lt;[ErpActionState](#schema-erpactionstate)&gt; | true | items[0]: — |

<a id="schema-erp_internal_transfer_requests_lines_row"></a>

### Schema Erp_internal_transfer_requests_lines_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_internal_transfer_requests_lines_fields](#schema-erp_internal_transfer_requests_lines_fields) | true | — |

<a id="schema-erp_internal_transfer_requests_lines_page"></a>

### Schema Erp_internal_transfer_requests_lines_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_internal_transfer_requests_lines_row](#schema-erp_internal_transfer_requests_lines_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_internal_transfer_requests_history_row"></a>

### Schema Erp_internal_transfer_requests_history_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_internal_transfer_requests_history_fields](#schema-erp_internal_transfer_requests_history_fields) | true | — |

<a id="schema-erp_internal_transfer_requests_history_page"></a>

### Schema Erp_internal_transfer_requests_history_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_internal_transfer_requests_history_row](#schema-erp_internal_transfer_requests_history_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_internal_transfer_requests_detail_response"></a>

### Schema Erp_internal_transfer_requests_detail_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_internal_transfer_requests_detail](#schema-erp_internal_transfer_requests_detail) | true | — |

<a id="schema-erpmachinemovementheaderinput"></a>

### Schema ErpMachineMovementHeaderInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentDate` | string | true | — |
| `nguoiGiao` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `nguoiNhan` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `memo` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `moveTypeId` | string | true | — |
| `contractId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `effectiveFrom` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `effectiveTo` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `referenceNo` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `referenceDate` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `documentLink` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpmachinemovementlineinput"></a>

### Schema ErpMachineMovementLineInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `assetId` | string | true | — |
| `quantity` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `departmentId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `objectId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `costCenterId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `costId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `fromObjectId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `fromStoreHouseId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `toStoreHouseId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `fromLocation` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `toLocation` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `handoverDate` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `handoverComponents` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `assetCondition` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `toLocationId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `toQuanHuyen` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `toXaPhuong` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `toChuyenKhoa` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `toZoneId` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erp_machine_movements_new_line"></a>

### Schema Erp_machine_movements_new_line

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `clientLineKey` | string | true | — |
| `values` | [ErpMachineMovementLineInput](#schema-erpmachinemovementlineinput) | true | — |

<a id="schema-erp_machine_movements_create"></a>

### Schema Erp_machine_movements_create

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `header` | [ErpMachineMovementHeaderInput](#schema-erpmachinemovementheaderinput) | true | required=["documentDate"]; properties={"documentDate":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$","description":"Required when creating a numbered document; ERP calendar date/time, yyyy-MM-ddTHH:mm:ss.fff."}} |
| `lines` | array&lt;[Erp_machine_movements_new_line](#schema-erp_machine_movements_new_line)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erp_machine_movements_line_add"></a>

### Schema Erp_machine_movements_line_add

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Add" |
| `lineId` | null | false | — |
| `clientLineKey` | string | true | maxLength=64 |
| `values` | [ErpMachineMovementLineInput](#schema-erpmachinemovementlineinput) | true | — |

<a id="schema-erp_machine_movements_line_update"></a>

### Schema Erp_machine_movements_line_update

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Update" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | [ErpMachineMovementLineInput](#schema-erpmachinemovementlineinput) | true | — |

<a id="schema-erp_machine_movements_line_remove"></a>

### Schema Erp_machine_movements_line_remove

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Remove" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | null | false | — |

<a id="schema-erp_machine_movements_save"></a>

### Schema Erp_machine_movements_save

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `header` | [ErpMachineMovementHeaderInput](#schema-erpmachinemovementheaderinput) | true | — |
| `lineChanges` | array&lt;oneOf [Erp_machine_movements_line_add](#schema-erp_machine_movements_line_add) / [Erp_machine_movements_line_update](#schema-erp_machine_movements_line_update) / [Erp_machine_movements_line_remove](#schema-erp_machine_movements_line_remove)&gt; | true | maxItems=500; items[0]: oneOf[0]: —; oneOf[1]: —; oneOf[2]: — |

<a id="schema-erp_machine_movements_paste"></a>

### Schema Erp_machine_movements_paste

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchId` | string | true | — |
| `rows` | array&lt;[ErpMachineMovementLineInput](#schema-erpmachinemovementlineinput)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erp_machine_movements_header_fields"></a>

### Schema Erp_machine_movements_header_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false; writable=false |
| `documentDate` | string | true | SQL DocumentDate datetime; nullable=false; writable=true |
| `nguoiGiao` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NguoiGiao nvarchar(150); nullable=true; writable=true |
| `nguoiNhan` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NguoiNhan nvarchar(150); nullable=true; writable=true |
| `memo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Memo nvarchar(150); nullable=true; writable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(150); nullable=true; writable=true |
| `isLocked` | boolean | true | SQL isLock bit; nullable=false; writable=false |
| `userCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserCreate varchar(50); nullable=true; writable=false |
| `userUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserUpdate varchar(50); nullable=true; writable=false |
| `dateUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateUpdate datetime; nullable=true; writable=false |
| `dateCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateCreate datetime; nullable=true; writable=false |
| `moveTypeId` | string | true | SQL MoveTypeID varchar(30); nullable=false; writable=true |
| `contractId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ContractID nvarchar(100); nullable=true; writable=true |
| `effectiveFrom` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL EffectiveFrom datetime; nullable=true; writable=true |
| `effectiveTo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL EffectiveTo datetime; nullable=true; writable=true |
| `referenceNo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ReferenceNo nvarchar(100); nullable=true; writable=true |
| `referenceDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ReferenceDate datetime; nullable=true; writable=true |
| `documentLink` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DocumentLink nvarchar(1000); nullable=true; writable=true |

<a id="schema-erp_machine_movements_lines_fields"></a>

### Schema Erp_machine_movements_lines_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(40); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false; writable=false |
| `assetId` | string | true | SQL AssetID varchar(50); nullable=false; writable=true |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Quantity decimal(18, 2); nullable=true; writable=true |
| `departmentId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DepartmentID varchar(50); nullable=true; writable=true |
| `objectId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ObjectID varchar(50); nullable=true; writable=true |
| `costCenterId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostCenterID varchar(50); nullable=true; writable=true |
| `costId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostID varchar(50); nullable=true; writable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(150); nullable=true; writable=true |
| `fromObjectId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL FromObjectID varchar(100); nullable=true; writable=true |
| `fromStoreHouseId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL FromStoreHouseID varchar(50); nullable=true; writable=true |
| `toStoreHouseId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ToStoreHouseID varchar(50); nullable=true; writable=true |
| `fromLocation` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL FromLocation nvarchar(500); nullable=true; writable=true |
| `toLocation` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ToLocation nvarchar(500); nullable=true; writable=true |
| `handoverDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL HandoverDate datetime; nullable=true; writable=true |
| `handoverComponents` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL HandoverComponents nvarchar(max); nullable=true; writable=true |
| `assetCondition` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AssetCondition nvarchar(1000); nullable=true; writable=true |
| `lifecycleStatusAfter` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LifecycleStatusAfter varchar(30); nullable=true; writable=false |
| `toLocationId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ToLocationID nvarchar(50); nullable=true; writable=true |
| `toQuanHuyen` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ToQuanHuyen nvarchar(50); nullable=true; writable=true |
| `toXaPhuong` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ToXaPhuong nvarchar(50); nullable=true; writable=true |
| `toChuyenKhoa` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ToChuyenKhoa nvarchar(250); nullable=true; writable=true |
| `toZoneId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ToZoneID nvarchar(50); nullable=true; writable=true |

<a id="schema-erp_machine_movements_document_row"></a>

### Schema Erp_machine_movements_document_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `header` | [Erp_machine_movements_header_fields](#schema-erp_machine_movements_header_fields) | true | — |

<a id="schema-erp_machine_movements_document_page"></a>

### Schema Erp_machine_movements_document_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_machine_movements_document_row](#schema-erp_machine_movements_document_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_machine_movements_list_response"></a>

### Schema Erp_machine_movements_list_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_machine_movements_document_page](#schema-erp_machine_movements_document_page) | true | — |

<a id="schema-erp_machine_movements_detail"></a>

### Schema Erp_machine_movements_detail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `branchId` | string | true | — |
| `stateToken` | string | true | — |
| `header` | [Erp_machine_movements_header_fields](#schema-erp_machine_movements_header_fields) | true | — |
| `lines` | [Erp_machine_movements_lines_page](#schema-erp_machine_movements_lines_page) | true | — |
| `history` | null | true | — |
| `comparison` | null | true | — |
| `actions` | array&lt;[ErpActionState](#schema-erpactionstate)&gt; | true | items[0]: — |

<a id="schema-erp_machine_movements_lines_row"></a>

### Schema Erp_machine_movements_lines_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_machine_movements_lines_fields](#schema-erp_machine_movements_lines_fields) | true | — |

<a id="schema-erp_machine_movements_lines_page"></a>

### Schema Erp_machine_movements_lines_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_machine_movements_lines_row](#schema-erp_machine_movements_lines_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_machine_movements_detail_response"></a>

### Schema Erp_machine_movements_detail_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_machine_movements_detail](#schema-erp_machine_movements_detail) | true | — |

<a id="schema-erpmachinerepairheaderinput"></a>

### Schema ErpMachineRepairHeaderInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentDate` | string | true | — |
| `nguoiGiao` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `nguoiNhan` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `memo` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `serviceTypeId` | string | true | — |
| `objectId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `serviceLocation` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `contractId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `startDate` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `endDate` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `technician` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `serviceStatus` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `referenceNo` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `referenceDate` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `documentLink` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpmachinerepairlineinput"></a>

### Schema ErpMachineRepairLineInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `assetId` | string | true | — |
| `noiDung` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `quantity` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `problemDescription` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `actionTaken` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `resultStatus` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `warrantyCovered` | boolean / null | false | anyOf[0]: —; anyOf[1]: — |
| `nextServiceDate` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `laborAmount` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `internalAlert` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erp_machine_repairs_new_line"></a>

### Schema Erp_machine_repairs_new_line

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `clientLineKey` | string | true | — |
| `values` | [ErpMachineRepairLineInput](#schema-erpmachinerepairlineinput) | true | — |

<a id="schema-erp_machine_repairs_create"></a>

### Schema Erp_machine_repairs_create

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `header` | [ErpMachineRepairHeaderInput](#schema-erpmachinerepairheaderinput) | true | required=["documentDate"]; properties={"documentDate":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$","description":"Required when creating a numbered document; ERP calendar date/time, yyyy-MM-ddTHH:mm:ss.fff."}} |
| `lines` | array&lt;[Erp_machine_repairs_new_line](#schema-erp_machine_repairs_new_line)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erp_machine_repairs_line_add"></a>

### Schema Erp_machine_repairs_line_add

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Add" |
| `lineId` | null | false | — |
| `clientLineKey` | string | true | maxLength=64 |
| `values` | [ErpMachineRepairLineInput](#schema-erpmachinerepairlineinput) | true | — |

<a id="schema-erp_machine_repairs_line_update"></a>

### Schema Erp_machine_repairs_line_update

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Update" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | [ErpMachineRepairLineInput](#schema-erpmachinerepairlineinput) | true | — |

<a id="schema-erp_machine_repairs_line_remove"></a>

### Schema Erp_machine_repairs_line_remove

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Remove" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | null | false | — |

<a id="schema-erp_machine_repairs_save"></a>

### Schema Erp_machine_repairs_save

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `header` | [ErpMachineRepairHeaderInput](#schema-erpmachinerepairheaderinput) | true | — |
| `lineChanges` | array&lt;oneOf [Erp_machine_repairs_line_add](#schema-erp_machine_repairs_line_add) / [Erp_machine_repairs_line_update](#schema-erp_machine_repairs_line_update) / [Erp_machine_repairs_line_remove](#schema-erp_machine_repairs_line_remove)&gt; | true | maxItems=500; items[0]: oneOf[0]: —; oneOf[1]: —; oneOf[2]: — |

<a id="schema-erp_machine_repairs_paste"></a>

### Schema Erp_machine_repairs_paste

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchId` | string | true | — |
| `rows` | array&lt;[ErpMachineRepairLineInput](#schema-erpmachinerepairlineinput)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erp_machine_repairs_header_fields"></a>

### Schema Erp_machine_repairs_header_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false; writable=false |
| `documentDate` | string | true | SQL DocumentDate datetime; nullable=false; writable=true |
| `nguoiGiao` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NguoiGiao nvarchar(150); nullable=true; writable=true |
| `nguoiNhan` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NguoiNhan nvarchar(150); nullable=true; writable=true |
| `memo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Memo nvarchar(150); nullable=true; writable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(150); nullable=true; writable=true |
| `isLocked` | boolean | true | SQL isLock bit; nullable=false; writable=false |
| `userCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserCreate varchar(50); nullable=true; writable=false |
| `userUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserUpdate varchar(50); nullable=true; writable=false |
| `dateUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateUpdate datetime; nullable=true; writable=false |
| `dateCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateCreate datetime; nullable=true; writable=false |
| `serviceTypeId` | string | true | SQL ServiceTypeID varchar(30); nullable=false; writable=true |
| `objectId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ObjectID varchar(100); nullable=true; writable=true |
| `serviceLocation` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ServiceLocation nvarchar(500); nullable=true; writable=true |
| `contractId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ContractID nvarchar(100); nullable=true; writable=true |
| `startDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL StartDate datetime; nullable=true; writable=true |
| `endDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL EndDate datetime; nullable=true; writable=true |
| `technician` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Technician nvarchar(150); nullable=true; writable=true |
| `serviceStatus` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ServiceStatus varchar(30); nullable=true; writable=true |
| `referenceNo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ReferenceNo nvarchar(100); nullable=true; writable=true |
| `referenceDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ReferenceDate datetime; nullable=true; writable=true |
| `documentLink` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DocumentLink nvarchar(1000); nullable=true; writable=true |

<a id="schema-erp_machine_repairs_lines_fields"></a>

### Schema Erp_machine_repairs_lines_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(40); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false; writable=false |
| `assetId` | string | true | SQL AssetID varchar(50); nullable=false; writable=true |
| `noiDung` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NoiDung nvarchar(150); nullable=true; writable=true |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Quantity decimal(18, 2); nullable=true; writable=true |
| `amount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Amount decimal(18, 2); nullable=true; writable=false |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(150); nullable=true; writable=true |
| `problemDescription` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ProblemDescription nvarchar(max); nullable=true; writable=true |
| `actionTaken` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ActionTaken nvarchar(max); nullable=true; writable=true |
| `resultStatus` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ResultStatus nvarchar(500); nullable=true; writable=true |
| `warrantyCovered` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL WarrantyCovered bit; nullable=true; writable=true |
| `nextServiceDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NextServiceDate datetime; nullable=true; writable=true |
| `laborAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LaborAmount decimal(28, 0); nullable=true; writable=true |
| `partsAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PartsAmount decimal(28, 0); nullable=true; writable=false |
| `internalAlert` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL InternalAlert nvarchar(1000); nullable=true; writable=true |

<a id="schema-erp_machine_repairs_document_row"></a>

### Schema Erp_machine_repairs_document_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `header` | [Erp_machine_repairs_header_fields](#schema-erp_machine_repairs_header_fields) | true | — |

<a id="schema-erp_machine_repairs_document_page"></a>

### Schema Erp_machine_repairs_document_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_machine_repairs_document_row](#schema-erp_machine_repairs_document_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_machine_repairs_list_response"></a>

### Schema Erp_machine_repairs_list_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_machine_repairs_document_page](#schema-erp_machine_repairs_document_page) | true | — |

<a id="schema-erp_machine_repairs_detail"></a>

### Schema Erp_machine_repairs_detail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `branchId` | string | true | — |
| `stateToken` | string | true | — |
| `header` | [Erp_machine_repairs_header_fields](#schema-erp_machine_repairs_header_fields) | true | — |
| `lines` | [Erp_machine_repairs_lines_page](#schema-erp_machine_repairs_lines_page) | true | — |
| `history` | null | true | — |
| `comparison` | null | true | — |
| `actions` | array&lt;[ErpActionState](#schema-erpactionstate)&gt; | true | items[0]: — |

<a id="schema-erp_machine_repairs_lines_row"></a>

### Schema Erp_machine_repairs_lines_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_machine_repairs_lines_fields](#schema-erp_machine_repairs_lines_fields) | true | — |

<a id="schema-erp_machine_repairs_lines_page"></a>

### Schema Erp_machine_repairs_lines_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_machine_repairs_lines_row](#schema-erp_machine_repairs_lines_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_machine_repairs_detail_response"></a>

### Schema Erp_machine_repairs_detail_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_machine_repairs_detail](#schema-erp_machine_repairs_detail) | true | — |

<a id="schema-erppurchaserequestheaderinput"></a>

### Schema ErpPurchaseRequestHeaderInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `purchaseDate` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `purposeId` | integer (int32) / null | false | anyOf[0]: —; anyOf[1]: — |
| `personSuggest` | string | true | — |
| `department` | string | true | — |
| `purposeDescOrClient` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `price` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `currencyId` | string | true | — |
| `objectId` | string | true | — |
| `rateExchange` | number | true | — |

<a id="schema-erppurchaserequestlineinput"></a>

### Schema ErpPurchaseRequestLineInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `itemId` | string | true | — |
| `budget` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `timeRequired` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `quantity` | string | true | — |
| `unitPrice` | string | true | — |
| `model` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erp_purchase_requests_new_line"></a>

### Schema Erp_purchase_requests_new_line

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `clientLineKey` | string | true | — |
| `values` | [ErpPurchaseRequestLineInput](#schema-erppurchaserequestlineinput) | true | — |

<a id="schema-erp_purchase_requests_create"></a>

### Schema Erp_purchase_requests_create

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `header` | [ErpPurchaseRequestHeaderInput](#schema-erppurchaserequestheaderinput) | true | required=["purchaseDate"]; properties={"purchaseDate":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$","description":"Required when creating a numbered document; ERP calendar date/time, yyyy-MM-ddTHH:mm:ss.fff."}} |
| `lines` | array&lt;[Erp_purchase_requests_new_line](#schema-erp_purchase_requests_new_line)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erp_purchase_requests_line_add"></a>

### Schema Erp_purchase_requests_line_add

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Add" |
| `lineId` | null | false | — |
| `clientLineKey` | string | true | maxLength=64 |
| `values` | [ErpPurchaseRequestLineInput](#schema-erppurchaserequestlineinput) | true | — |

<a id="schema-erp_purchase_requests_line_update"></a>

### Schema Erp_purchase_requests_line_update

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Update" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | [ErpPurchaseRequestLineInput](#schema-erppurchaserequestlineinput) | true | — |

<a id="schema-erp_purchase_requests_line_remove"></a>

### Schema Erp_purchase_requests_line_remove

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Remove" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | null | false | — |

<a id="schema-erp_purchase_requests_save"></a>

### Schema Erp_purchase_requests_save

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `header` | [ErpPurchaseRequestHeaderInput](#schema-erppurchaserequestheaderinput) | true | — |
| `lineChanges` | array&lt;oneOf [Erp_purchase_requests_line_add](#schema-erp_purchase_requests_line_add) / [Erp_purchase_requests_line_update](#schema-erp_purchase_requests_line_update) / [Erp_purchase_requests_line_remove](#schema-erp_purchase_requests_line_remove)&gt; | true | maxItems=500; items[0]: oneOf[0]: —; oneOf[1]: —; oneOf[2]: — |

<a id="schema-erp_purchase_requests_paste"></a>

### Schema Erp_purchase_requests_paste

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchId` | string | true | — |
| `rows` | array&lt;[ErpPurchaseRequestLineInput](#schema-erppurchaserequestlineinput)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erp_purchase_requests_submit_request"></a>

### Schema Erp_purchase_requests_submit_request

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `payload` | object | true | required=[]; properties={}; additionalProperties=false |

<a id="schema-erp_purchase_requests_send_purchase_order_request"></a>

### Schema Erp_purchase_requests_send_purchase_order_request

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `payload` | object | true | required=[]; properties={}; additionalProperties=false |

<a id="schema-erp_purchase_requests_header_fields"></a>

### Schema Erp_purchase_requests_header_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `purchaseRequestId` | string | true | SQL PurchaseRequestID nvarchar(50); nullable=false; writable=false |
| `purchaseDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PurchaseDate datetime; nullable=true; writable=true |
| `purposeId` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL PurposeID int; nullable=true; writable=true |
| `personSuggest` | string | true | SQL PersonSuggest nvarchar(500); nullable=false; writable=true |
| `department` | string | true | SQL Department nvarchar(100); nullable=false; writable=true |
| `purposeDescOrClient` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PurposeDescOrClient nvarchar(max); nullable=true; writable=true |
| `price` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Price decimal(18, 2); nullable=true; writable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(max); nullable=true; writable=true |
| `statusId` | integer | true | SQL StatusID int; nullable=false; writable=false |
| `isLocked` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL isLock bit; nullable=true; writable=false |
| `currencyId` | string | true | SQL CurrencyID varchar(3); nullable=false; writable=true |
| `objectId` | string | true | SQL ObjectID varchar(100); nullable=false; writable=true |
| `rateExchange` | number | true | SQL RateExchange float; nullable=false; writable=true |
| `branchId` | string | true | SQL BranchID varchar(50); nullable=false; writable=false |

<a id="schema-erp_purchase_requests_lines_fields"></a>

### Schema Erp_purchase_requests_lines_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(50); nullable=false; writable=false |
| `itemId` | string | true | SQL ItemID varchar(50); nullable=false; writable=true |
| `budget` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Budget decimal(18, 0); nullable=true; writable=true |
| `timeRequired` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TimeRequired nvarchar(200); nullable=true; writable=true |
| `quantity` | string | true | SQL Quantity decimal(18, 0); nullable=false; writable=true |
| `unitPrice` | string | true | SQL UnitPrice decimal(18, 0); nullable=false; writable=true |
| `totalPrice` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TotalPrice decimal(18, 0); nullable=true; writable=false |
| `model` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Model varchar(50); nullable=true; writable=true |
| `purchaseRequestId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PurchaseRequestID nvarchar(50); nullable=true; writable=false |

<a id="schema-erp_purchase_requests_document_row"></a>

### Schema Erp_purchase_requests_document_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `header` | [Erp_purchase_requests_header_fields](#schema-erp_purchase_requests_header_fields) | true | — |

<a id="schema-erp_purchase_requests_document_page"></a>

### Schema Erp_purchase_requests_document_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_purchase_requests_document_row](#schema-erp_purchase_requests_document_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_purchase_requests_list_response"></a>

### Schema Erp_purchase_requests_list_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_purchase_requests_document_page](#schema-erp_purchase_requests_document_page) | true | — |

<a id="schema-erp_purchase_requests_detail"></a>

### Schema Erp_purchase_requests_detail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `branchId` | string | true | — |
| `stateToken` | string | true | — |
| `header` | [Erp_purchase_requests_header_fields](#schema-erp_purchase_requests_header_fields) | true | — |
| `lines` | [Erp_purchase_requests_lines_page](#schema-erp_purchase_requests_lines_page) | true | — |
| `history` | null | true | — |
| `comparison` | null | true | — |
| `actions` | array&lt;[ErpActionState](#schema-erpactionstate)&gt; | true | items[0]: — |

<a id="schema-erp_purchase_requests_lines_row"></a>

### Schema Erp_purchase_requests_lines_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_purchase_requests_lines_fields](#schema-erp_purchase_requests_lines_fields) | true | — |

<a id="schema-erp_purchase_requests_lines_page"></a>

### Schema Erp_purchase_requests_lines_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_purchase_requests_lines_row](#schema-erp_purchase_requests_lines_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_purchase_requests_detail_response"></a>

### Schema Erp_purchase_requests_detail_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_purchase_requests_detail](#schema-erp_purchase_requests_detail) | true | — |

<a id="schema-erpscopedresponse_erpcontractinfo"></a>

### Schema ErpScopedResponse_ErpContractInfo

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [ErpContractInfo](#schema-erpcontractinfo) / null | true | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpcontractinfo"></a>

### Schema ErpContractInfo

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `contractId` | string | true | — |
| `fields` | dictionary&lt;any JSON&gt; | true | additionalProperties={"description":"Fixed module field or action input; see x-medcom-typed-header, x-medcom-typed-line, x-medcom-typed-payload and x-medcom-full-field-sections on its operation."} |

<a id="schema-erpsalesorderheaderinput"></a>

### Schema ErpSalesOrderHeaderInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentDate` | string | true | — |
| `objectId` | string | true | — |
| `contractId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `memo` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `deliverDate` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `baseTotal` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `employeeId` | string | true | — |
| `managerId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `phone` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `taxCode` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `depositAmount` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `agencyId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `isVAT` | boolean / null | false | anyOf[0]: —; anyOf[1]: — |
| `isOrder` | boolean | true | — |
| `currencyId` | string | true | — |
| `rateExchange` | number | true | — |
| `linkId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `ghiChuDonHang` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `paymentTermId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `ceoId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `thamGiaHopDongBan` | boolean / null | false | anyOf[0]: —; anyOf[1]: — |
| `bBKCUrl` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `beforeOutStockUrl` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `bBBGUrl` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `documentUrl` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `handoverLocation` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `representedByA` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `positionA` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `addressA` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `representedByB` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `positionB` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `addressB` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `conclude` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `minutesNumber` | integer (int32) / null | false | anyOf[0]: —; anyOf[1]: — |
| `partyAKeep` | integer (int32) / null | false | anyOf[0]: —; anyOf[1]: — |
| `partyBKeep` | integer (int32) / null | false | anyOf[0]: —; anyOf[1]: — |
| `deliveryStatusId` | integer (int32) / null | false | anyOf[0]: —; anyOf[1]: — |
| `deliveryEmployeeId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `deliveryEmployeeSubId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `vehicle` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `soPhieu` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `soHoaDon` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `ngayPhieu` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `ngayHoaDon` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erpsalesorderlineinput"></a>

### Schema ErpSalesOrderLineInput

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `itemId` | string | true | — |
| `quantity` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `unitPrice` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `discountPercent` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `vATPercent` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `vATQuantity` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `dienGiai` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `property` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `property2` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `parentId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `notes2` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `costId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `storeHouseId` | string / null | false | anyOf[0]: —; anyOf[1]: — |
| `vATId` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erp_sales_orders_new_line"></a>

### Schema Erp_sales_orders_new_line

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `clientLineKey` | string | true | — |
| `values` | [ErpSalesOrderLineInput](#schema-erpsalesorderlineinput) | true | — |

<a id="schema-erp_sales_orders_create"></a>

### Schema Erp_sales_orders_create

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `header` | [ErpSalesOrderHeaderInput](#schema-erpsalesorderheaderinput) | true | required=["documentDate"]; properties={"documentDate":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}$","description":"Required when creating a numbered document; ERP calendar date/time, yyyy-MM-ddTHH:mm:ss.fff."}} |
| `lines` | array&lt;[Erp_sales_orders_new_line](#schema-erp_sales_orders_new_line)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erp_sales_orders_line_add"></a>

### Schema Erp_sales_orders_line_add

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Add" |
| `lineId` | null | false | — |
| `clientLineKey` | string | true | maxLength=64 |
| `values` | [ErpSalesOrderLineInput](#schema-erpsalesorderlineinput) | true | — |

<a id="schema-erp_sales_orders_line_update"></a>

### Schema Erp_sales_orders_line_update

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Update" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | [ErpSalesOrderLineInput](#schema-erpsalesorderlineinput) | true | — |

<a id="schema-erp_sales_orders_line_remove"></a>

### Schema Erp_sales_orders_line_remove

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `kind` | string | true | const="Remove" |
| `lineId` | string | true | maxLength=50 |
| `clientLineKey` | null | false | — |
| `values` | null | false | — |

<a id="schema-erp_sales_orders_save"></a>

### Schema Erp_sales_orders_save

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `header` | [ErpSalesOrderHeaderInput](#schema-erpsalesorderheaderinput) | true | — |
| `lineChanges` | array&lt;oneOf [Erp_sales_orders_line_add](#schema-erp_sales_orders_line_add) / [Erp_sales_orders_line_update](#schema-erp_sales_orders_line_update) / [Erp_sales_orders_line_remove](#schema-erp_sales_orders_line_remove)&gt; | true | maxItems=500; items[0]: oneOf[0]: —; oneOf[1]: —; oneOf[2]: — |

<a id="schema-erp_sales_orders_paste"></a>

### Schema Erp_sales_orders_paste

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `branchId` | string | true | — |
| `rows` | array&lt;[ErpSalesOrderLineInput](#schema-erpsalesorderlineinput)&gt; | true | minItems=1; maxItems=500; items[0]: — |

<a id="schema-erp_sales_orders_recall_request"></a>

### Schema Erp_sales_orders_recall_request

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `payload` | object | true | required=[]; properties={}; additionalProperties=false |

<a id="schema-erpsendorderpm"></a>

### Schema ErpSendOrderPm

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `pmId` | string | true | — |
| `notes` | string / null | false | anyOf[0]: —; anyOf[1]: — |

<a id="schema-erp_sales_orders_send_pm_request"></a>

### Schema Erp_sales_orders_send_pm_request

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `payload` | [ErpSendOrderPm](#schema-erpsendorderpm) | true | — |

<a id="schema-erp_sales_orders_header_fields"></a>

### Schema Erp_sales_orders_header_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | SQL DocumentID varchar(50); nullable=false; writable=false |
| `documentDate` | string | true | SQL DocumentDate datetime; nullable=false; writable=true |
| `objectId` | string | true | SQL ObjectID varchar(100); nullable=false; writable=true |
| `contractId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ContractID nvarchar(250); nullable=true; writable=true |
| `memo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Memo nvarchar(max); nullable=true; writable=true |
| `deliverDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DeliverDate datetime; nullable=true; writable=true |
| `baseTotal` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL BaseTotal decimal(28, 0); nullable=true; writable=true |
| `statusId` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL StatusID int; nullable=true; writable=false |
| `employeeId` | string | true | SQL EmployeeID varchar(50); nullable=false; writable=true |
| `managerId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ManagerID varchar(50); nullable=true; writable=true |
| `phone` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Phone varchar(150); nullable=true; writable=true |
| `branchId` | string | true | SQL BranchID varchar(50); nullable=false; writable=false |
| `taxCode` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TaxCode varchar(50); nullable=true; writable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(max); nullable=true; writable=true |
| `depositAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DepositAmount decimal(28, 0); nullable=true; writable=true |
| `isLocked` | boolean | true | SQL isLock bit; nullable=false; writable=false |
| `agencyId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AgencyID varchar(50); nullable=true; writable=true |
| `isVAT` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL isVAT bit; nullable=true; writable=true |
| `isOrder` | boolean | true | SQL isOrder bit; nullable=false; writable=true |
| `currencyId` | string | true | SQL CurrencyID varchar(3); nullable=false; writable=true |
| `rateExchange` | number | true | SQL RateExchange float; nullable=false; writable=true |
| `linkId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LinkID varchar(50); nullable=true; writable=true |
| `userCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserCreate varchar(50); nullable=true; writable=false |
| `userUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserUpdate varchar(50); nullable=true; writable=false |
| `dateUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateUpdate datetime; nullable=true; writable=false |
| `dateCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateCreate datetime; nullable=true; writable=false |
| `ghiChuDonHang` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL GhiChuDonHang nvarchar(250); nullable=true; writable=true |
| `paymentTermId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PaymentTermID varchar(50); nullable=true; writable=true |
| `ceoId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CeoID varchar(50); nullable=true; writable=true |
| `thamGiaHopDongBan` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL ThamGiaHopDongBan bit; nullable=true; writable=true |
| `sendTo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SendTo nvarchar(max); nullable=true; writable=false |
| `bBKCUrl` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL BBKCUrl varchar(500); nullable=true; writable=true |
| `beforeOutStockUrl` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL BeforeOutStockUrl varchar(500); nullable=true; writable=true |
| `bBBGUrl` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL BBBGUrl varchar(500); nullable=true; writable=true |
| `documentUrl` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DocumentUrl nvarchar(500); nullable=true; writable=true |
| `handoverLocation` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL HandoverLocation nvarchar(200); nullable=true; writable=true |
| `representedByA` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RepresentedByA nvarchar(100); nullable=true; writable=true |
| `positionA` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PositionA nvarchar(100); nullable=true; writable=true |
| `addressA` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AddressA nvarchar(200); nullable=true; writable=true |
| `representedByB` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RepresentedByB nvarchar(100); nullable=true; writable=true |
| `positionB` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PositionB nvarchar(100); nullable=true; writable=true |
| `addressB` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AddressB nvarchar(200); nullable=true; writable=true |
| `conclude` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Conclude nvarchar(500); nullable=true; writable=true |
| `minutesNumber` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL MinutesNumber int; nullable=true; writable=true |
| `partyAKeep` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL PartyAKeep int; nullable=true; writable=true |
| `partyBKeep` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL PartyBKeep int; nullable=true; writable=true |
| `deliveryStatusId` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL DeliveryStatusID int; nullable=true; writable=true |
| `deliveryEmployeeId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DeliveryEmployeeID nvarchar(200); nullable=true; writable=true |
| `deliveryEmployeeSubId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DeliveryEmployeeSubID nvarchar(200); nullable=true; writable=true |
| `vehicle` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Vehicle nvarchar(200); nullable=true; writable=true |
| `soPhieu` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SoPhieu nvarchar(100); nullable=true; writable=true |
| `soHoaDon` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SoHoaDon nvarchar(100); nullable=true; writable=true |
| `ngayPhieu` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NgayPhieu datetime; nullable=true; writable=true |
| `ngayHoaDon` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NgayHoaDon datetime; nullable=true; writable=true |

<a id="schema-erp_sales_orders_lines_fields"></a>

### Schema Erp_sales_orders_lines_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(40); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID varchar(50); nullable=false; writable=false |
| `itemId` | string | true | SQL ItemID nvarchar(50); nullable=false; writable=true |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Quantity decimal(18, 0); nullable=true; writable=true |
| `unitFactor` | number / null | true | anyOf[0]: —; anyOf[1]: —; SQL UnitFactor float; nullable=true; writable=false |
| `unit2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Unit2 nvarchar(50); nullable=true; writable=false |
| `quantity2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Quantity2 decimal(18, 0); nullable=true; writable=false |
| `unitPrice` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UnitPrice decimal(28, 0); nullable=true; writable=true |
| `tonKhoHienTai` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TonKhoHienTai decimal(18, 0); nullable=true; writable=false |
| `deliveryQuantity` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DeliveryQuantity decimal(18, 0); nullable=true; writable=false |
| `soLuongHopDong` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SoLuongHopDong decimal(18, 0); nullable=true; writable=false |
| `amount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Amount decimal(28, 0); nullable=true; writable=false |
| `discountPercent` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DiscountPercent decimal(18, 2); nullable=true; writable=true |
| `discountAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DiscountAmount decimal(18, 0); nullable=true; writable=false |
| `vATPercent` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATPercent decimal(18, 2); nullable=true; writable=true |
| `vATAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATAmount decimal(18, 0); nullable=true; writable=false |
| `totalAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TotalAmount decimal(18, 0); nullable=true; writable=false |
| `vATQuantity` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATQuantity decimal(18, 2); nullable=true; writable=true |
| `dienGiai` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DienGiai nvarchar(max); nullable=true; writable=true |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(max); nullable=true; writable=true |
| `property` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Property nvarchar(50); nullable=true; writable=true |
| `property2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Property2 nvarchar(50); nullable=true; writable=true |
| `parentId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ParentID varchar(50); nullable=true; writable=true |
| `notes2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes2 nvarchar(200); nullable=true; writable=true |
| `costId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostID varchar(50); nullable=true; writable=true |
| `storeHouseId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL StoreHouseID varchar(50); nullable=true; writable=true |
| `vATId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATID varchar(50); nullable=true; writable=true |

<a id="schema-erp_sales_orders_history_fields"></a>

### Schema Erp_sales_orders_history_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(50); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID varchar(50); nullable=false; writable=false |
| `thoiGian` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ThoiGian datetime; nullable=true; writable=false |
| `userName` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserName nvarchar(50); nullable=true; writable=false |
| `statusId` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL StatusID int; nullable=true; writable=false |
| `sendTo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SendTo nvarchar(max); nullable=true; writable=false |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(max); nullable=true; writable=false |

<a id="schema-erp_sales_orders_document_row"></a>

### Schema Erp_sales_orders_document_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `header` | [Erp_sales_orders_header_fields](#schema-erp_sales_orders_header_fields) | true | — |

<a id="schema-erp_sales_orders_document_page"></a>

### Schema Erp_sales_orders_document_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_sales_orders_document_row](#schema-erp_sales_orders_document_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_sales_orders_list_response"></a>

### Schema Erp_sales_orders_list_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_sales_orders_document_page](#schema-erp_sales_orders_document_page) | true | — |

<a id="schema-erp_sales_orders_detail"></a>

### Schema Erp_sales_orders_detail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `branchId` | string | true | — |
| `stateToken` | string | true | — |
| `header` | [Erp_sales_orders_header_fields](#schema-erp_sales_orders_header_fields) | true | — |
| `lines` | [Erp_sales_orders_lines_page](#schema-erp_sales_orders_lines_page) | true | — |
| `history` | [Erp_sales_orders_history_page](#schema-erp_sales_orders_history_page) | true | — |
| `comparison` | null | true | — |
| `actions` | array&lt;[ErpActionState](#schema-erpactionstate)&gt; | true | items[0]: — |

<a id="schema-erp_sales_orders_lines_row"></a>

### Schema Erp_sales_orders_lines_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_sales_orders_lines_fields](#schema-erp_sales_orders_lines_fields) | true | — |

<a id="schema-erp_sales_orders_lines_page"></a>

### Schema Erp_sales_orders_lines_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_sales_orders_lines_row](#schema-erp_sales_orders_lines_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_sales_orders_history_row"></a>

### Schema Erp_sales_orders_history_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_sales_orders_history_fields](#schema-erp_sales_orders_history_fields) | true | — |

<a id="schema-erp_sales_orders_history_page"></a>

### Schema Erp_sales_orders_history_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_sales_orders_history_row](#schema-erp_sales_orders_history_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_sales_orders_detail_response"></a>

### Schema Erp_sales_orders_detail_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_sales_orders_detail](#schema-erp_sales_orders_detail) | true | — |

<a id="schema-erpscanrequest"></a>

### Schema ErpScanRequest

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `idempotencyKey` | string | true | — |
| `branchId` | string | true | — |
| `documentId` | string | true | — |
| `expectedStateToken` | string | true | — |
| `barcode` | string | true | — |

<a id="schema-erp_sales_qr_header_fields"></a>

### Schema Erp_sales_qr_header_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false; writable=false |
| `documentDate` | string | true | SQL DocumentDate datetime; nullable=false; writable=false |
| `objectId` | string | true | SQL ObjectID varchar(100); nullable=false; writable=false |
| `employeeId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL EmployeeID varchar(50); nullable=true; writable=false |
| `managerId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ManagerID varchar(50); nullable=true; writable=false |
| `memo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Memo nvarchar(250); nullable=true; writable=false |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(200); nullable=true; writable=false |
| `receiver` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Receiver nvarchar(100); nullable=true; writable=false |
| `currencyId` | string | true | SQL CurrencyID varchar(3); nullable=false; writable=false |
| `rateExchange` | number | true | SQL RateExchange float; nullable=false; writable=false |
| `paymentTypeId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PaymentTypeID varchar(50); nullable=true; writable=false |
| `paymentTermId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PaymentTermID varchar(50); nullable=true; writable=false |
| `dueDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DueDate datetime; nullable=true; writable=false |
| `debtDueDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DebtDueDate datetime; nullable=true; writable=false |
| `pONo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PONo varchar(50); nullable=true; writable=false |
| `contractId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ContractID nvarchar(100); nullable=true; writable=false |
| `refDoc` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RefDoc varchar(50); nullable=true; writable=false |
| `baseTotal` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL BaseTotal decimal(18, 0); nullable=true; writable=false |
| `revAccId` | string | true | SQL RevAccID varchar(50); nullable=false; writable=false |
| `vATAccId` | string | true | SQL VATAccID varchar(50); nullable=false; writable=false |
| `isLocked` | boolean | true | SQL isLock bit; nullable=false; writable=false |
| `invoiceNo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL InvoiceNo varchar(50); nullable=true; writable=false |
| `searchField` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SearchField nvarchar(2000); nullable=true; writable=false |
| `userCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserCreate varchar(50); nullable=true; writable=false |
| `userUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserUpdate varchar(50); nullable=true; writable=false |
| `dateUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateUpdate datetime; nullable=true; writable=false |
| `dateCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateCreate datetime; nullable=true; writable=false |
| `status` | integer | true | SQL Status int; nullable=false; writable=false |
| `linkId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LinkID varchar(50); nullable=true; writable=false |
| `vATAccId2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATAccID2 varchar(50); nullable=true; writable=false |
| `amountTotal` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AmountTotal decimal(28, 0); nullable=true; writable=false |
| `vATAmountTotal` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATAmountTotal decimal(28, 0); nullable=true; writable=false |
| `impExpId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ImpExpID varchar(10); nullable=true; writable=false |
| `isExport` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL isExport bit; nullable=true; writable=false |
| `costCenterId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostCenterID varchar(50); nullable=true; writable=false |
| `costId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostID varchar(50); nullable=true; writable=false |
| `vATAccExId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATAccExID varchar(50); nullable=true; writable=false |
| `docBatch` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DocBatch varchar(50); nullable=true; writable=false |
| `couponAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CouponAmount decimal(18, 0); nullable=true; writable=false |
| `lanIn` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL LanIn int; nullable=true; writable=false |
| `locationId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LocationID nvarchar(50); nullable=true; writable=false |
| `attach` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Attach nvarchar(100); nullable=true; writable=false |
| `attachDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AttachDate datetime; nullable=true; writable=false |
| `noiDungHoaDon` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NoiDungHoaDon nvarchar(500); nullable=true; writable=false |
| `nguoiMuaHangHD` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NguoiMuaHangHD nvarchar(250); nullable=true; writable=false |
| `tenKhachLe` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TenKhachLe nvarchar(250); nullable=true; writable=false |
| `mSTKhachLe` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL MSTKhachLe nvarchar(50); nullable=true; writable=false |
| `branchId` | string | true | SQL BranchID varchar(50); nullable=false; writable=false |
| `statusId` | integer / null | true | anyOf[0]: —; anyOf[1]: —; SQL StatusID int; nullable=true; writable=false |
| `isLocal` | boolean | true | SQL isLocal bit; nullable=false; writable=false |
| `invoiceKey` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL InvoiceKey varchar(50); nullable=true; writable=false |
| `refInvoiceKey` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RefInvoiceKey varchar(50); nullable=true; writable=false |
| `objectNameHD` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ObjectNameHD nvarchar(250); nullable=true; writable=false |
| `addressHD` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AddressHD nvarchar(250); nullable=true; writable=false |
| `taxCodeHD` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TaxCodeHD nvarchar(50); nullable=true; writable=false |
| `uId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UID varchar(50); nullable=true; writable=false |
| `ghiChuHoaDon` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL GhiChuHoaDon nvarchar(250); nullable=true; writable=false |
| `thuHo` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL ThuHo bit; nullable=true; writable=false |
| `agencyId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AgencyID varchar(50); nullable=true; writable=false |
| `ceoId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CeoID varchar(50); nullable=true; writable=false |
| `ngayGiaoLai` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NgayGiaoLai datetime; nullable=true; writable=false |
| `hinhThucGiaoHang` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL HinhThucGiaoHang nvarchar(100); nullable=true; writable=false |
| `thamGiaHopDongBan` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL ThamGiaHopDongBan bit; nullable=true; writable=false |
| `cTKM` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CTKM varchar(50); nullable=true; writable=false |
| `soTienKM` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SoTienKM decimal(18, 0); nullable=true; writable=false |
| `maVanDon` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL MaVanDon nvarchar(50); nullable=true; writable=false |
| `phiVanChuyen` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PhiVanChuyen decimal(18, 0); nullable=true; writable=false |
| `phiKhacTotal` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PhiKhacTotal decimal(18, 0); nullable=true; writable=false |
| `maHopDong` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL MaHopDong nvarchar(50); nullable=true; writable=false |
| `discountTotal` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DiscountTotal decimal(18, 0); nullable=true; writable=false |
| `isScanQrCode` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL isScanQRCode bit; nullable=true; writable=false |

<a id="schema-erp_sales_qr_lines_fields"></a>

### Schema Erp_sales_qr_lines_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID nvarchar(50); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID nvarchar(50); nullable=false; writable=false |
| `qrCode` | string | true | SQL QRCode nvarchar(200); nullable=false; writable=false |
| `itemId` | string | true | SQL ItemID nvarchar(50); nullable=false; writable=false |
| `itemCode` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ItemCode nvarchar(50); nullable=true; writable=false |
| `lot` | string | true | SQL Lot nvarchar(50); nullable=false; writable=false |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Quantity decimal(38, 10); nullable=true; writable=false |
| `qrPackageId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL QRPackageID nvarchar(200); nullable=true; writable=false |
| `quyCach` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL QuyCach nvarchar(50); nullable=true; writable=false |

<a id="schema-erp_sales_qr_comparison_fields"></a>

### Schema Erp_sales_qr_comparison_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(40); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false; writable=false |
| `itemId` | string | true | SQL ItemID nvarchar(50); nullable=false; writable=false |
| `lot` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Lot varchar(50); nullable=true; writable=false |
| `expireDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ExpireDate datetime; nullable=true; writable=false |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(500); nullable=true; writable=false |
| `storeHouseId` | string | true | SQL StoreHouseID varchar(50); nullable=false; writable=false |
| `quantity` | string | true | SQL Quantity decimal(28, 4); nullable=false; writable=false |
| `unitPrice` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UnitPrice decimal(28, 4); nullable=true; writable=false |
| `sourceAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SourceAmount decimal(28, 2); nullable=true; writable=false |
| `amount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Amount decimal(28, 0); nullable=true; writable=false |
| `vATId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATID varchar(50); nullable=true; writable=false |
| `vATPercent` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATPercent decimal(18, 2); nullable=true; writable=false |
| `vATAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL VATAmount decimal(28, 0); nullable=true; writable=false |
| `discountPercentTT` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DiscountPercentTT decimal(18, 2); nullable=true; writable=false |
| `discountAmountTT` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DiscountAmountTT decimal(28, 0); nullable=true; writable=false |
| `discountPercent` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DiscountPercent decimal(18, 2); nullable=true; writable=false |
| `discountAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DiscountAmount decimal(28, 0); nullable=true; writable=false |
| `totalAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TotalAmount decimal(28, 0); nullable=true; writable=false |
| `costCenterId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostCenterID varchar(50); nullable=true; writable=false |
| `costId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostID varchar(50); nullable=true; writable=false |
| `incomeAccId` | string | true | SQL IncomeAccID varchar(50); nullable=false; writable=false |
| `invAccId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL InvAccID varchar(50); nullable=true; writable=false |
| `costOfSaleAccId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostOfSaleAccID varchar(50); nullable=true; writable=false |
| `discountAcctId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DiscountAcctID varchar(50); nullable=true; writable=false |
| `discountAmount2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DiscountAmount2 decimal(18, 0); nullable=true; writable=false |
| `unitCost` | number / null | true | anyOf[0]: —; anyOf[1]: —; SQL UnitCost float; nullable=true; writable=false |
| `amountCost` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AmountCost decimal(28, 0); nullable=true; writable=false |
| `quantity2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Quantity2 decimal(28, 4); nullable=true; writable=false |
| `property` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Property nvarchar(50); nullable=true; writable=false |
| `property2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Property2 nvarchar(50); nullable=true; writable=false |
| `objectId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ObjectID varchar(50); nullable=true; writable=false |
| `parentId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ParentID varchar(50); nullable=true; writable=false |
| `unitPriceV` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UnitPriceV decimal(28, 2); nullable=true; writable=false |
| `unitFactor` | number / null | true | anyOf[0]: —; anyOf[1]: —; SQL UnitFactor float; nullable=true; writable=false |
| `exportPercent` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ExportPercent decimal(18, 2); nullable=true; writable=false |
| `exportAmount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ExportAmount decimal(28, 2); nullable=true; writable=false |
| `dienGiai` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DienGiai nvarchar(250); nullable=true; writable=false |
| `stockQuantity` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL StockQuantity decimal(28, 4); nullable=true; writable=false |
| `isKM` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL isKM bit; nullable=true; writable=false |
| `employeeId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL EmployeeID varchar(50); nullable=true; writable=false |
| `managerId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ManagerID varchar(50); nullable=true; writable=false |
| `cTKM` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CTKM varchar(50); nullable=true; writable=false |
| `tongTienNhom1` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TongTienNhom1 decimal(18, 0); nullable=true; writable=false |
| `tongTienNhom2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TongTienNhom2 decimal(18, 0); nullable=true; writable=false |
| `phiKhac` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PhiKhac decimal(18, 0); nullable=true; writable=false |
| `tongTienNhomFyto` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL TongTienNhomFyto decimal(18, 0); nullable=true; writable=false |
| `quyCach` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL QuyCach nvarchar(50); nullable=true; writable=false |
| `sLTheoQuyCach` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SLTheoQuyCach decimal(18, 2); nullable=true; writable=false |

<a id="schema-erp_sales_qr_document_row"></a>

### Schema Erp_sales_qr_document_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `header` | [Erp_sales_qr_header_fields](#schema-erp_sales_qr_header_fields) | true | — |

<a id="schema-erp_sales_qr_document_page"></a>

### Schema Erp_sales_qr_document_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_sales_qr_document_row](#schema-erp_sales_qr_document_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_sales_qr_list_response"></a>

### Schema Erp_sales_qr_list_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_sales_qr_document_page](#schema-erp_sales_qr_document_page) | true | — |

<a id="schema-erp_sales_qr_detail"></a>

### Schema Erp_sales_qr_detail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `branchId` | string | true | — |
| `stateToken` | string | true | — |
| `header` | [Erp_sales_qr_header_fields](#schema-erp_sales_qr_header_fields) | true | — |
| `lines` | [Erp_sales_qr_lines_page](#schema-erp_sales_qr_lines_page) | true | — |
| `history` | null | true | — |
| `comparison` | [Erp_sales_qr_comparison_page](#schema-erp_sales_qr_comparison_page) | true | — |
| `actions` | array&lt;[ErpActionState](#schema-erpactionstate)&gt; | true | items[0]: — |

<a id="schema-erp_sales_qr_lines_row"></a>

### Schema Erp_sales_qr_lines_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_sales_qr_lines_fields](#schema-erp_sales_qr_lines_fields) | true | — |

<a id="schema-erp_sales_qr_lines_page"></a>

### Schema Erp_sales_qr_lines_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_sales_qr_lines_row](#schema-erp_sales_qr_lines_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_sales_qr_comparison_row"></a>

### Schema Erp_sales_qr_comparison_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_sales_qr_comparison_fields](#schema-erp_sales_qr_comparison_fields) | true | — |

<a id="schema-erp_sales_qr_comparison_page"></a>

### Schema Erp_sales_qr_comparison_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_sales_qr_comparison_row](#schema-erp_sales_qr_comparison_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_sales_qr_detail_response"></a>

### Schema Erp_sales_qr_detail_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_sales_qr_detail](#schema-erp_sales_qr_detail) | true | — |

<a id="schema-erp_warehouse_qr_header_fields"></a>

### Schema Erp_warehouse_qr_header_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false; writable=false |
| `documentDate` | string | true | SQL DocumentDate datetime; nullable=false; writable=false |
| `objectId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ObjectID varchar(100); nullable=true; writable=false |
| `memo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Memo nvarchar(200); nullable=true; writable=false |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(200); nullable=true; writable=false |
| `isLocked` | boolean | true | SQL isLock bit; nullable=false; writable=false |
| `outputType` | string | true | SQL OutputType varchar(20); nullable=false; writable=false |
| `searchField` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SearchField nvarchar(2000); nullable=true; writable=false |
| `userCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserCreate varchar(50); nullable=true; writable=false |
| `userUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UserUpdate varchar(50); nullable=true; writable=false |
| `dateUpdate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateUpdate datetime; nullable=true; writable=false |
| `dateCreate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DateCreate datetime; nullable=true; writable=false |
| `status` | integer | true | SQL Status int; nullable=false; writable=false |
| `calPrice` | boolean | true | SQL CalPrice bit; nullable=false; writable=false |
| `calCost` | boolean | true | SQL CalCost bit; nullable=false; writable=false |
| `linkId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL LinkID varchar(50); nullable=true; writable=false |
| `isPacket` | boolean | true | SQL isPacket bit; nullable=false; writable=false |
| `baseTotal` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL BaseTotal decimal(28, 0); nullable=true; writable=false |
| `docBatch` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL DocBatch varchar(50); nullable=true; writable=false |
| `nguoiNhan` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NguoiNhan nvarchar(100); nullable=true; writable=false |
| `productOrderId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ProductOrderID varchar(50); nullable=true; writable=false |
| `branchId` | string | true | SQL BranchID varchar(50); nullable=false; writable=false |
| `nguoiGiao` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL NguoiGiao nvarchar(100); nullable=true; writable=false |
| `isScanQrCode` | boolean / null | true | anyOf[0]: —; anyOf[1]: —; SQL isScanQRCode bit; nullable=true; writable=false |
| `internalTransferBatchId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL InternalTransferBatchID varchar(30); nullable=true; writable=false |

<a id="schema-erp_warehouse_qr_lines_fields"></a>

### Schema Erp_warehouse_qr_lines_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID nvarchar(50); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID nvarchar(50); nullable=false; writable=false |
| `qrCode` | string | true | SQL QRCode nvarchar(200); nullable=false; writable=false |
| `itemId` | string | true | SQL ItemID nvarchar(50); nullable=false; writable=false |
| `itemCode` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ItemCode nvarchar(50); nullable=true; writable=false |
| `lot` | string | true | SQL Lot nvarchar(50); nullable=false; writable=false |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Quantity decimal(38, 10); nullable=true; writable=false |
| `qrPackageId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL QRPackageID nvarchar(200); nullable=true; writable=false |
| `quyCach` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL QuyCach nvarchar(50); nullable=true; writable=false |

<a id="schema-erp_warehouse_qr_comparison_fields"></a>

### Schema Erp_warehouse_qr_comparison_fields

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `userAutoId` | string | true | SQL UserAutoID varchar(40); nullable=false; writable=false |
| `documentId` | string | true | SQL DocumentID varchar(30); nullable=false; writable=false |
| `itemId` | string | true | SQL ItemID nvarchar(50); nullable=false; writable=false |
| `lot` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Lot varchar(50); nullable=true; writable=false |
| `expireDate` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ExpireDate datetime; nullable=true; writable=false |
| `storeHouseId` | string | true | SQL StoreHouseID varchar(50); nullable=false; writable=false |
| `quantity` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Quantity decimal(28, 4); nullable=true; writable=false |
| `unitPrice` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL UnitPrice decimal(28, 2); nullable=true; writable=false |
| `amount` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Amount decimal(28, 0); nullable=true; writable=false |
| `invAccId` | string | true | SQL InvAccID varchar(50); nullable=false; writable=false |
| `accountId2` | string | true | SQL AccountID2 varchar(50); nullable=false; writable=false |
| `costCenterId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostCenterID varchar(50); nullable=true; writable=false |
| `costId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL CostID varchar(50); nullable=true; writable=false |
| `notes` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Notes nvarchar(100); nullable=true; writable=false |
| `quantity2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Quantity2 decimal(28, 4); nullable=true; writable=false |
| `property` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Property nvarchar(50); nullable=true; writable=false |
| `property2` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL Property2 nvarchar(50); nullable=true; writable=false |
| `parentId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL ParentID varchar(50); nullable=true; writable=false |
| `packetGroup` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PacketGroup varchar(50); nullable=true; writable=false |
| `unitFactor` | number / null | true | anyOf[0]: —; anyOf[1]: —; SQL UnitFactor float; nullable=true; writable=false |
| `refDoc` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RefDoc varchar(50); nullable=true; writable=false |
| `assetId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL AssetID varchar(50); nullable=true; writable=false |
| `repairDocumentId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RepairDocumentID varchar(30); nullable=true; writable=false |
| `repairDetailId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL RepairDetailID varchar(40); nullable=true; writable=false |
| `sourceInputDetailId` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL SourceInputDetailID varchar(40); nullable=true; writable=false |
| `partSerialNo` | string / null | true | anyOf[0]: —; anyOf[1]: —; SQL PartSerialNo nvarchar(100); nullable=true; writable=false |

<a id="schema-erp_warehouse_qr_document_row"></a>

### Schema Erp_warehouse_qr_document_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `header` | [Erp_warehouse_qr_header_fields](#schema-erp_warehouse_qr_header_fields) | true | — |

<a id="schema-erp_warehouse_qr_document_page"></a>

### Schema Erp_warehouse_qr_document_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_warehouse_qr_document_row](#schema-erp_warehouse_qr_document_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_warehouse_qr_list_response"></a>

### Schema Erp_warehouse_qr_list_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_warehouse_qr_document_page](#schema-erp_warehouse_qr_document_page) | true | — |

<a id="schema-erp_warehouse_qr_detail"></a>

### Schema Erp_warehouse_qr_detail

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `documentId` | string | true | — |
| `branchId` | string | true | — |
| `stateToken` | string | true | — |
| `header` | [Erp_warehouse_qr_header_fields](#schema-erp_warehouse_qr_header_fields) | true | — |
| `lines` | [Erp_warehouse_qr_lines_page](#schema-erp_warehouse_qr_lines_page) | true | — |
| `history` | null | true | — |
| `comparison` | [Erp_warehouse_qr_comparison_page](#schema-erp_warehouse_qr_comparison_page) | true | — |
| `actions` | array&lt;[ErpActionState](#schema-erpactionstate)&gt; | true | items[0]: — |

<a id="schema-erp_warehouse_qr_lines_row"></a>

### Schema Erp_warehouse_qr_lines_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_warehouse_qr_lines_fields](#schema-erp_warehouse_qr_lines_fields) | true | — |

<a id="schema-erp_warehouse_qr_lines_page"></a>

### Schema Erp_warehouse_qr_lines_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_warehouse_qr_lines_row](#schema-erp_warehouse_qr_lines_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_warehouse_qr_comparison_row"></a>

### Schema Erp_warehouse_qr_comparison_row

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `lineId` | string | true | — |
| `fields` | [Erp_warehouse_qr_comparison_fields](#schema-erp_warehouse_qr_comparison_fields) | true | — |

<a id="schema-erp_warehouse_qr_comparison_page"></a>

### Schema Erp_warehouse_qr_comparison_page

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `rows` | array&lt;[Erp_warehouse_qr_comparison_row](#schema-erp_warehouse_qr_comparison_row)&gt; | true | items[0]: — |
| `page` | integer (int32) | true | — |
| `pageSize` | integer (int32) | true | — |
| `hasMore` | boolean | true | — |

<a id="schema-erp_warehouse_qr_detail_response"></a>

### Schema Erp_warehouse_qr_detail_response

Object: `{"type":"object","additionalProperties":false}`.

| Field | Kiểu JSON hoặc schema | Bắt buộc | Giới hạn mô tả và nguồn SQL |
|---|---|---|---|
| `readScope` | string | true | — |
| `data` | [Erp_warehouse_qr_detail](#schema-erp_warehouse_qr_detail) | true | — |

<a id="binding-dropdown"></a>
## 13 Các binding dropdown theo màn hình

106 binding native; giá trị Multi/Disabled mô tả binding nguồn. API options vẫn kiểm tra user/branch/context và source hash. lookupId giữ nguyên case; tham số ngăn cách bằng dấu chấm phẩy là tên context exact. Nếu không có context thì bỏ hoặc gửi object rỗng. PM options là hai API riêng, không cộng vào 106 binding.

### Dropdown purchase-requests

Nguồn: `screens[id=purchase-requests]`, form `AP_PurposeRequestListFrm` trong [six-screen-catalog.json](../../inventories/erp/20261010/six-screen-catalog.json).

| lookupId | Value column | Label column | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.BranchID | BranchID | BranchID | — | — | — | false | false |
| header.CurrencyID | CurrencyID | CurrencyID | — | — | RateExchange | false | false |
| header.Department | Department | Department | — | — | Department | false | false |
| header.ObjectID | ObjectID | ObjectName | — | — | ObjectID;ObjectName;Address | false | false |
| header.PersonSuggest | PersonSuggest | PersonSuggest | — | — | PersonSuggest | false | false |
| header.PurposeID | PurposeID | PurposeName | — | — | PurposeID;PurposeName | false | false |
| header.StatusID | StatusID | StatusName | — | — | StatusID;StatusName | false | false |
| lines.ItemID | ItemID | ItemID | — | — | ItemID;ItemName;Unit;HangSX | false | false |
| list.PurposeID | PurposeID | PurposeName | — | — | PurposeID | false | false |
| list.StatusID | StatusID | StatusName | — | — | StatusID;StatusName | true | false |

### Dropdown sales-orders

Nguồn: `screens[id=sales-orders]`, form `AR_OrderByContractFrm` trong [six-screen-catalog.json](../../inventories/erp/20261010/six-screen-catalog.json).

| lookupId | Value column | Label column | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.ContractID | ContractID | ContractID | ObjectID | — | ObjectID;ObjectName;EmployeeID | false | false |
| header.EmployeeID | EmployeeID | EmployeeID | — | — | — | false | false |
| header.ManagerID | ManagerID | ManagerID | — | — | — | false | false |
| header.ObjectID | ObjectID | ObjectID | ContractID | — | ObjectName;Address | false | false |
| header.StatusID | StatusID | StatusName | — | — | — | false | false |
| lines.ItemID | ItemID | ItemID | Master.ContractID;UserAutoID | — | ItemCode;ItemName;SoLuongHopDong;DeliveryQuantity;VATPercent;UnitPrice;DienGiai;UnitFactor;Unit2;Unit | true | false |

### Dropdown internal-transfer-requests

Nguồn: `screens[id=internal-transfer-requests]`, form `IV_InternalTransferRequestFrm` trong [six-screen-catalog.json](../../inventories/erp/20261010/six-screen-catalog.json).

| lookupId | Value column | Label column | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.AssignedPM | UserName | HoTen | FromBranchID | FromBranchID | — | false | false |
| header.BranchID | BranchID | BranchID | — | — | — | false | false |
| header.FromBranchID | BranchID | BranchName | — | — | — | false | false |
| header.ToBranchID | BranchID | BranchName | — | — | — | false | false |
| header.TransportMethod | ID | Name | — | — | — | false | false |
| lines.ExpectedObjectID | ObjectID | ObjectID | — | — | ExpectedObjectName | false | false |
| lines.ItemID | ItemID | ItemID | — | — | ItemCode;ItemName;Unit;HangSX;isLot | false | false |
| lines.RequestedAssetID | AssetID | AssetID | ItemID | ItemID | RequestedAssetName;RequestedAssetSerial | false | false |

### Dropdown warehouse-qr

Nguồn: `screens[id=warehouse-qr]`, form `IV_Output_QRCodeFrm` trong [six-screen-catalog.json](../../inventories/erp/20261010/six-screen-catalog.json).

| lookupId | Value column | Label column | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.BranchID | BranchID | BranchID | — | — | — | false | false |
| header.FldObjectID | ObjectID | ObjectID | — | — | ObjectID;ObjectName;Address | false | false |
| header.FldOutputType | OutputType | OutputType | — | — | CalPrice;CalCost;isPacket | false | false |
| grdChitiet2.AccountID2 | AccountID2 | AccountID2 | — | — | — | false | false |
| grdChitiet2.CostCenterID | CostCenterID | CostCenterID | — | — | — | false | false |
| grdChitiet2.CostID | CostID | CostID | — | — | — | false | false |
| grdChitiet2.InvAccID | InvAccID | InvAccID | — | — | — | false | false |
| grdChitiet2.ItemID | ItemID | ItemID | — | — | ItemID;ItemName;Unit;InvAccID | false | false |
| grdChitiet2.ItemName | ItemName | ItemName | Master.DocumentDate | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;Lot;Quantity2;Quantity;Property;Property2 | true | false |
| grdChitiet2.Lot | Lot | Lot | Master.DocumentDate;ItemID;StoreHouseID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;Lot;ExpireDate;Property;Property2;Quantity2;Quantity;UnitPrice;Amount | true | false |
| grdChitiet2.Property | Property | Property | Master.DocumentDate;ItemID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;AccountID2;Lot;Property;Property2;Quantity2;Quantity;UnitPrice;Amount | true | false |
| grdChitiet2.Property2 | Property2 | Property2 | Master.DocumentDate;ItemID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;AccountID2;Lot;Property;Property2;Quantity2;Quantity;UnitPrice;Amount | true | false |
| grdChitiet2.RefDoc | RefDoc | RefDoc | Master.DocumentDate;Master.ObjectID;AccountID2 | ObjectID;DocumentDate | — | true | false |
| grdChitiet2.StoreHouseID | StoreHouseID | StoreHouseID | — | — | — | false | false |
| grdPhieuMuaHang.CouponSeri | CouponSeri | CouponSeri | — | — | TriGia | true | true |

### Dropdown sales-qr

Nguồn: `screens[id=sales-qr]`, form `AR_Invoice_QRCodeFrm` trong [six-screen-catalog.json](../../inventories/erp/20261010/six-screen-catalog.json).

| lookupId | Value column | Label column | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.AgencyID | AgencyID | AgencyID | — | — | — | false | false |
| header.BranchID | BranchID | BranchID | — | — | — | false | false |
| header.CeoID | CeoID | CeoID | — | — | CeoName | false | false |
| header.ChietKhau1AccID | ChietKhau1AccID | ChietKhau1AccID | — | — | — | false | true |
| header.ChietKhau2AccID | ChietKhau2AccID | ChietKhau2AccID | — | — | — | false | true |
| header.ChietKhau3AccID | ChietKhau3AccID | ChietKhau3AccID | — | — | — | false | true |
| header.ChietKhau4AccID | ChietKhau4AccID | ChietKhau4AccID | — | — | — | false | true |
| header.ContractID | ContractID | ContractID | — | — | ContractID | false | false |
| header.CostCenterID | CostCenterID | CostCenterID | — | — | CostCenterID | false | false |
| header.CostID | CostID | CostID | — | — | CostID | false | false |
| header.CTKM | CTKM | CTKM | BranchID | — | — | false | false |
| header.CurrencyID | CurrencyID | CurrencyID | — | — | RateExchange | false | false |
| header.EmployeeID | EmployeeID | EmployeeID | — | — | — | false | false |
| header.FldRefDoc | RefDoc | RefDoc | ObjectID;RevAccID;DocumentDate | — | RefDoc | false | false |
| header.HinhThucGiaoHang | HinhThucGiaoHang | HinhThucGiaoHang | — | — | — | false | false |
| header.LocationID | LocationID | LocationName | — | — | — | false | false |
| header.MaHopDong | MaHopDong | MaHopDong | — | — | — | false | true |
| header.ManagerID | ManagerID | ManagerID | — | — | — | false | false |
| header.ObjectID | ObjectID | ObjectID | BranchID | — | ObjectID;ObjectName;Address;RevAccID;Phone;LocationID;NguoiMuaHangHD;ChietKhau2AccID;ChietKhau4AccID;CostCenterID;Phone;HinhThucGiaoHang;PhanLoai | false | false |
| header.PaymentTermID | PaymentTermID | PaymentTermName | — | — | — | false | false |
| header.PaymentTypeID | PaymentTypeID | PaymentTypeName | — | — | — | false | false |
| header.RevAccID | RevAccID | RevAccID | — | — | — | false | false |
| header.VATAccID | VATAccID | VATAccID | — | — | — | false | false |
| header.VATAccID2 | VATAccID2 | VATAccID2 | — | — | — | false | false |
| grdChitiet2.CostCenterID | CostCenterID | CostCenterID | — | — | — | false | false |
| grdChitiet2.CostID | CostID | CostID | — | — | — | false | false |
| grdChitiet2.CostOfSaleAccID | CostOfSaleAccID | CostOfSaleAccID | — | — | — | false | false |
| grdChitiet2.CTKM | CTKM | CTKM | Master.BranchID | — | — | false | false |
| grdChitiet2.DiscountAcctID | DiscountAcctID | DiscountAcctID | — | — | — | false | false |
| grdChitiet2.EmployeeID | EmployeeID | EmployeeID | — | — | — | false | false |
| grdChitiet2.IncomeAccID | IncomeAccID | IncomeAccID | — | — | — | false | false |
| grdChitiet2.InvAccID | InvAccID | InvAccID | — | — | — | false | false |
| grdChitiet2.ItemID | ItemID | ItemID | — | — | ItemID;ItemName;Unit;InvAccID;VATID;VATPercent;IncomeAccID;CostOfSaleAccID;DiscountAcctID;DienGiai | false | false |
| grdChitiet2.ItemName | ItemName | ItemName | — | — | ItemID;ItemName;Unit;InvAccID;VATID;VATPercent;IncomeAccID;CostOfSaleAccID;DiscountAcctID;DienGiai | true | false |
| grdChitiet2.Lot | Lot | Lot | Master.DocumentDate;ItemID | — | StoreHouseID;InvAccID;IncomeAccID;CostOfSaleAccID;Lot;ExpireDate;Property;Property2;UnitCost | true | false |
| grdChitiet2.ManagerID | ManagerID | ManagerID | — | — | — | false | false |
| grdChitiet2.ObjectID | ObjectID | ObjectName | — | — | — | false | false |
| grdChitiet2.Property | Property | Property | Master.DocumentDate;ItemID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;IncomeAccID;CostOfSaleAccID;Lot;Property;Property2;Quantity2;Quantity;UnitCost | true | false |
| grdChitiet2.Property2 | Property2 | Property2 | Master.DocumentDate;ItemID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;IncomeAccID;CostOfSaleAccID;Lot;Property;Property2;Quantity2;Quantity;UnitCost | true | false |
| grdChitiet2.StoreHouseID | StoreHouseID | StoreHouseID | Master.BranchID | Master.BranchID | — | false | false |
| grdChitiet2.VATID | VATID | VATID | — | — | VATPercent | false | false |
| grdChitietKM.ItemID | ItemID | ItemID | — | — | ItemID;ItemName;Unit;InvAccID;VATID;VATPercent;IncomeAccID;CostOfSaleAccID;DiscountAcctID | false | true |
| grdChitietKM.Lot | Lot | Lot | Master.DocumentDate;ItemID;StoreHouseID | — | StoreHouseID;ItemID;ItemName;Unit;InvAccID;IncomeAccID;CostOfSaleAccID;Lot;ExpireDate;Property;Property2;UnitCost | true | true |
| grdChitietKM.StoreHouseID | StoreHouseID | StoreHouseID | — | — | — | false | true |
| grdHoaDon.ItemName | ItemName | ItemName | — | — | ItemName;VATID;VATPercent | false | true |
| grdHoaDon.ObjectName | ObjectName | ObjectName | — | — | Address;TaxCode | false | true |
| grdHoaDon.VATID | VATID | VATID | — | — | VATPercent | false | true |

### Dropdown machine-movements

Nguồn: `screens[id=machine-movements]`, form `FA_Move2026Frm` trong [six-screen-catalog.json](../../inventories/erp/20261010/six-screen-catalog.json).

| lookupId | Value column | Label column | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.ContractID | ContractID | ContractID | — | — | — | false | false |
| header.MoveTypeID | MoveTypeID | MoveTypeName | — | — | — | false | false |
| lines.AssetID | AssetID | AssetID | — | — | AssetID;AssetName;Unit | false | false |
| lines.AssetName | AssetName | AssetName | — | — | AssetID;AssetName;Unit | true | true |
| lines.CostCenterID | CostCenterID | CostCenterID | — | — | — | false | false |
| lines.CostID | CostID | CostID | — | — | — | false | false |
| lines.DepartmentID | DepartmentID | DepartmentName | — | — | — | false | false |
| lines.FromObjectID | ObjectID | ObjectID | — | — | — | false | false |
| lines.FromStoreHouseID | StoreHouseID | StoreHouseID | — | — | — | false | false |
| lines.ObjectID | ObjectID | ObjectName | — | — | ObjectID;ToLocationID;ToQuanHuyen;ToXaPhuong;ToChuyenKhoa;ToZoneID;ToLocation | false | false |
| lines.ToChuyenKhoa | ChuyenKhoa | ChuyenKhoa | — | — | — | false | false |
| lines.ToLocationID | LocationID | LocationID | — | — | — | false | false |
| lines.ToStoreHouseID | StoreHouseID | StoreHouseID | — | — | — | false | false |
| lines.ToZoneID | ZoneID | ZoneID | — | — | — | false | false |

### Dropdown machine-repairs

Nguồn: `screens[id=machine-repairs]`, form `FA_Repair2026Frm` trong [six-screen-catalog.json](../../inventories/erp/20261010/six-screen-catalog.json).

| lookupId | Value column | Label column | Context parameters | Required context | Linked columns | Multi | Disabled |
|---|---|---|---|---|---|---|---|
| header.ContractID | ContractID | ContractID | — | — | — | false | false |
| header.ObjectID | ObjectID | ObjectID | — | — | ServiceLocation | false | false |
| header.ServiceStatus | ServiceStatus | ServiceStatusName | — | — | — | false | false |
| header.ServiceTypeID | ServiceTypeID | ServiceTypeName | — | — | — | false | false |
| lines.AssetID | AssetID | AssetID | — | — | AssetID;AssetName;Unit | false | false |
| lines.AssetName | AssetName | AssetName | — | — | AssetID;AssetName;Unit | true | true |

<a id="bang-chung"></a>
## 14 Field hợp đồng và nguồn bằng chứng

Hai contract-info endpoint trả các cột của `dbo.CF_ContractTbl` trong `data.fields` với tên native. Bảng dưới là metadata snapshot SELECT-only 2026-10-10, không phải row hợp đồng thật. Không có schema typed riêng liệt kê từng key của dictionary hợp đồng trong OpenAPI; reader lấy cột hiện hành và bỏ tên nhạy cảm. Vì vậy field đổi ở DB cần đối chiếu response/metadata trước khi FE đặt cột bắt buộc. Quyền/scope giữ theo phiếu và branch của contract.

| Field trong data.fields | Kiểu SQL | Nullable |
|---|---|---|
| `ContractID` | nvarchar(100) | false |
| `ObjectID` | varchar(50) | false |
| `ContractDate` | datetime | true |
| `ExpireContrachDate` | datetime | true |
| `ContractName` | nvarchar(100) | false |
| `ContractName2` | nvarchar(100) | true |
| `ContractAmount` | decimal(18, 2) | true |
| `EmployeeID` | varchar(50) | true |
| `SupportEmployeeID` | varchar(50) | true |
| `PaymentTermID` | varchar(50) | true |
| `DueDate` | datetime | true |
| `CreditLimit` | decimal(18, 2) | true |
| `CurrentBalance` | decimal(18, 2) | true |
| `BranchID` | varchar(50) | false |
| `CurrencyID` | varchar(3) | true |
| `UserCreate` | varchar(50) | true |
| `UserUpdate` | varchar(50) | true |
| `DateUpdate` | datetime | true |
| `DateCreate` | datetime | true |
| `StatusID` | int | true |
| `RecordRevenue` | nvarchar(50) | true |
| `DocumentUrl` | nvarchar(500) | true |

| Nội dung | Bằng chứng chính |
|---|---|
| Method/path/body/schema của 119 operation | `src/backend/Medcom.Api/ApiContractCatalog.cs`; `docs/backend/medcom-openapi.json`; các *Endpoints.cs cùng thư mục; live OpenAPI khớp JSON committed khi tạo bản này. |
| Schema field và kiểu/null | `src/backend/Medcom.Contracts/*`; `inventories/erp/20261010/six-screen-catalog.json`; `inventories/source/20261010/document-read-tables.json`; `docs/backend/document-field-contract.json`. |
| Dropdown và context | `ErpScreenCatalog.cs`, `ErpLookupSql.cs`, `SqlErpScreenLookups.cs`; các binding SY_FrmDrdwTbl trong catalog. |
| CUD và native effects | `ErpCommandRules.cs`, `ErpActionRules.cs`, `SqlErpScreenCommands.cs`, `SqlErpScreenEffects.cs`, `SqlErpDocumentNumberAllocator.cs`; journal schema v1. |
| Writer đang bật trên MedData | PR 132 comment 6097976637; PR 134 comment 6099096715. Bảng `dbo.MedcomErpCommandSchema`/`dbo.MedcomErpCommandJournal`; SQL secrets giữ riêng. |
| Thông báo | `SY_NotifyMsgTbl`, `SY_User`, `SY_NotifyListStp`, `SY_NotifyMarkReadStp`; `notification-api-source.json`; `SqlNotificationQueries.cs`. |
| Field hợp đồng | `catalog-columns.json` object dbo.CF_ContractTbl; `SqlErpScreenContract.cs`; sensitive-name filter `ErpLookupSql.Sensitive`. |
| Kiểm thử đã quan sát của baseline | PR 134 checkpoint: 3276 public backend cases, 333 inspector cases và current-head/base CI pass; 28 private SQL/ordinary HTTPS notification checks dùng dữ liệu tổng hợp. Chúng không chứng minh nghiệp vụ owner trên row thật. |
| Baseline nguồn và giới hạn | `docs/SOURCE_BASELINE.md`; `inventories/source/20261002/source-set.json` cùng extraction-integrity/manifest; `inventories/source/20261010/source-set.json`. Các snapshot khác danh tính. |

Library baseline `ERP_Medcom2026(4).zip` và `Medcom-Data (3)(1).zip` giữ hash/danh tính lịch sử trong [SOURCE_BASELINE.md](../SOURCE_BASELINE.md). Không mở lại raw archive ở lần tổng hợp tài liệu này; source round 2026-10-10 và nguồn approved lịch sử không được tuyên bố tương đương. [WINFORMS_SOURCE_GUIDE_EVIDENCE.md](../erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md) là reconciliation guide cũ bổ sung, không chứng minh runtime hiện hành.

Tài liệu chỉ gồm technical metadata, tên object và ví dụ tổng hợp. Không chứa password thật, connection string có secret, SQL body riêng tư, thông báo/hợp đồng hoặc transaction row thật. Hành vi chưa được xác nhận được ghi UNKNOWN và tiếp tục theo [goal 45](../goals/PRODUCTION_ERP_GOAL.md).

SHA-256 Git blob OpenAPI tại main nêu ở đầu tài liệu: `8560dda89e38347be540a466d70190f91f890f0db8e5118f1d8586e28402456b`. Checkout Windows dùng CRLF có SHA-256 `6a5d910208b6282c7ac5601f08f91fe4c8b6f00a95143b1bfa5b47c41e1f1f1e`; hai bản chỉ khác kết thúc dòng. So sánh contract live thực hiện trên JSON đã parse, không suy ra byte HTTP giống Git blob.
