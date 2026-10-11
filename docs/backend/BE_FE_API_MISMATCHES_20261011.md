# Đối chiếu API BE và FE đang triển khai — 11/10/2026

Đội FE cần ưu tiên sửa thời gian chờ, các bộ đọc dữ liệu cũ, đường dẫn của nút Lưu và nội dung gửi khi tạo phiếu. BE và FE cùng triển khai commit `84932715b5d78bcd00ef44bf6b90a0a328d62ee6`; sai lệch được tìm thấy trong cách tích hợp trên FE. Danh sách dưới đây bàn giao cho lập trình viên; tên trường, đường dẫn, mã lỗi và các cấu trúc nội bộ không phải nhãn hiển thị cho người dùng.

## Phạm vi và bằng chứng

Đối chiếu lúc 22:33 ngày 11/10/2026, giờ Việt Nam. Đây là kiểm tra hợp đồng, mã FE tại đúng commit triển khai, thử bộ đọc FE bằng dữ liệu tổng hợp và đối chiếu log HTTP đã loại bỏ thông tin riêng tư. Không sửa mã FE, không ghi dữ liệu nghiệp vụ, không dùng tài khoản giả để truy cập hệ thống.

| Mã | Bằng chứng |
|---|---|
| E1 | Railway BE deployment `f9c2fa21-5300-41d1-b13f-649217ca92f3`, FE deployment `84bcb632-0345-4f02-b408-287a33c7e3ed`, cùng commit trên, trạng thái SUCCESS khi kiểm tra. |
| E2 | `GET https://medcom-production.up.railway.app/api/contracts/openapi.json`: phiên bản `3.0.0`, 243 operation; JSON bằng [medcom-openapi.json](medcom-openapi.json) tại commit trên. SHA-256 của nội dung tải về: `94691c22a3369352ca8766266f2b3007995fc69757085e34b3b76e9009f0ccc0`. |
| E3 | Các kết quả tái hiện tổng hợp và bằng chứng HTTP đã rút gọn: [api-fe-deployment-audit.json](../../inventories/backend/20261011/api-fe-deployment-audit.json). Không chứa cookie, tài khoản, IP người dùng hay dòng giao dịch thật. |
| E4 | Mã FE: `apps/medcom-sites/lib/erp/` và `apps/medcom-sites/components/untitledui/` tại commit đã triển khai; đường dẫn và vị trí cụ thể nằm trong từng mục dưới. |
| E5 | Mã BE: `CanonicalResponseProjection.cs`, `ErpScreenEndpoints.cs`, `ErpInputRules.cs`, `ErpCommandRules.cs`, `NotificationEndpoints.cs`, `SqlNotificationQueries.cs`, `SqlReferenceData.cs`; hợp đồng và dữ liệu mô tả nằm trong `docs/backend/medcom-openapi.json`. |

Toàn bộ 243 operation trong E2 được FE proxy cho phép khi dùng **đúng** phương thức và đường dẫn. Không tìm thấy một endpoint đúng nào trong hợp đồng bị thiếu trong danh sách cho phép của FE. Các đường dẫn sai do bộ xử lý nút FE tự ghép được chỉ rõ ở FE-05. Việc cho phép đường dẫn không chứng minh mọi API đã được giao diện sử dụng hoặc hoạt động đúng với dữ liệu thật.

Trang FE mặc định dùng `MedcomApp`; `?view=classic` hoặc `?screen=...` dùng `Workspace`. Các bộ đọc cũ vẫn được trang mặc định gọi ở tab Đơn đặt mua, Đề nghị mua và Đề nghị nhập kho, đồng thời được dùng để tải số lượng trên đầu trang. Bằng chứng: `apps/medcom-sites/app/page.tsx`, `components/untitledui/medcom-app.tsx`, `tab-orders.tsx`, `tab-purchases.tsx`, `tab-inbound.tsx`.

## P0 — sửa gấp để đọc và thao tác được

### FE-01 — Chi nhánh và thông báo trả 503 tại FE sau 20 giây

API: `GET /api/lookups/branches`, `GET /api/notifications`; trên trình duyệt, tiền tố proxy là `/api/erp`.

FE đặt `AbortSignal.timeout(20000)` rồi chuyển mọi lỗi kết nối/hủy yêu cầu thành `503 backend_unavailable`. Bằng chứng: `apps/medcom-sites/lib/erp/proxy.ts`, `proxy.ts`; thử mô phỏng lỗi TimeoutError tái hiện chính xác phản hồi này, E3.

Log ngày 11/10, lúc 22:16:09 giờ Việt Nam:

| API | FE | BE tương ứng |
|---|---|---|
| Thông báo | 503 sau 20.252 giây | 499 sau 19.909 giây |
| Chi nhánh | 503 sau 20.269 giây | 499 sau 19.910 giây |

Hai API cũng có các lần BE trả 200, mất 11.253–13.883 giây trong mẫu log E3. Đối chiếu cùng thời điểm, cùng đường dẫn và mã nguồn timeout cho thấy các **lần lỗi trong bảng này** phát sinh ở proxy FE khi hết thời gian chờ. Log đã rút gọn không có định danh yêu cầu xuyên hai hệ thống; không suy rộng kết luận này cho mọi lỗi 503 khác.

FE cần phân biệt hết thời gian chờ với mã lỗi thực sự do BE trả, giữ mã tương quan khi có, gộp các lượt đọc trùng và tránh tải lại cả cụm dữ liệu khi đổi chi nhánh. Ngân sách thời gian chờ phải được thống nhất với BE; tăng thời gian chờ đơn thuần chưa giải quyết được độ trễ. BE còn phải đo các bước truy cập SQL, kiểm tra phiên và bổ sung tên tham chiếu để giảm thời gian xử lý. Nguyên nhân SQL cụ thể: **UNKNOWN**. Lỗi này chưa được tuyên bố đã sửa trên production.

### FE-02 — Đơn đặt mua và đề nghị nhập kho bị bộ đọc FE từ chối

API:

- `GET /api/documents/purchase-orders`
- `GET /api/documents/purchase-orders/detail`
- `GET /api/documents/inbound-requests`
- `GET /api/documents/inbound-requests/detail`

BE trả ngày đầy đủ dạng `yyyy-MM-ddTHH:mm:ss.fff`, có thêm trường hiển thị ngày Việt Nam. `rowSchema` trên FE vẫn bắt buộc `yyyy-MM-dd`. Thử cả bốn phản hồi theo hợp đồng hiện tại đều bị từ chối ở `documentDate`; người dùng thấy không tải được dữ liệu dù upstream trả 200. Bằng chứng: `apps/medcom-sites/lib/erp/contracts.ts`, E2, E3.

Các trường đầy đủ nằm trực tiếp trên bản ghi và dòng chi tiết. FE vẫn tìm `purchaseOrderHeader`, `inboundRequestHeader` và `line.fields`; nhiều schema còn loại bỏ các thuộc tính ngoài tập cũ. Khi chỉ sửa biểu thức ngày, tên đối tượng, đơn giá, thành tiền và tên hàng vẫn có thể mất. Bằng chứng: `contracts.ts`, `contracts.ts`, `tab-orders.tsx`, `tab-orders.tsx`, `tab-inbound.tsx`.

Sửa cả schema và phần chuyển dữ liệu sang giao diện; lấy trực tiếp các trường hiện tại, dùng các trường `...Display` để hiển thị. Các route `/api/v2/documents/...` cũng thuộc hợp đồng mới; chuyển riêng URL sang v2 không thay thế việc sửa bộ đọc.

### FE-03 — Bộ đọc đề nghị mua cũ vẫn bắt buộc cấu trúc trước v3

API: `GET /api/purchase-requests`, `GET /api/purchase-requests/detail`, `GET /api/purchase-requests/lookup`.

FE còn bắt buộc `purchaseRequestId` bên ngoài header, `line.values`, `sourceFields`, các bản ghi strict cũ và dropdown có `label`. BE hiện trả định danh trong header, dòng đầy đủ trực tiếp và dropdown `id` đi với `name`. Tái hiện list, detail và lookup chi nhánh đều nhận `502 invalid_api_response` từ bộ đọc FE. Bằng chứng: `apps/medcom-sites/lib/erp/purchase-request-api.ts`; E2, E3.

Sửa cả adapter và tab Đề nghị mua, không chỉ nới schema. `tab-purchases.tsx` còn lấy `sourceFields`; `` còn tự đặt tên hàng theo ID tự đặt đơn vị. Dùng `itemCode`, `itemName`, `unit`, tên trạng thái và giá hiển thị BE trả.

`GET /api/purchase-requests/workspace` vẫn là facade cũ có `writeAvailable=false`, đúng với mã BE tại `PurchaseRequestEndpoints.cs`; không đổi thành true ở FE. Tạo/sửa/xóa đầy đủ nằm trong nhóm `/api/erp/purchase-requests/...` và trạng thái nút của nhóm này. Thử đọc workspace cũ vẫn thành công; không ghi nhầm nó vào danh sách API bị lỗi schema.

### FE-04 — Nội dung tạo mới không khớp cả 8 API tạo phiếu

Bằng chứng FE: `apps/medcom-sites/components/untitledui/tab-erp-screen.tsx`. Bằng chứng BE: request schema E2, `ErpInputRules.Normalize`, `ErpCommandRules.Freeze`. Tám nội dung tổng hợp dựng theo đúng các nhánh hiện tại của form FE đều sai hợp đồng. Chưa gửi lệnh tạo thật để thử.

| API `POST /api/erp/<màn hình>/create` | Sai lệch chính trong form FE | FE cần sửa |
|---|---|---|
| `purchase-requests` | Thiếu `department`, `currencyId`, `objectId`, `rateExchange`. | Thu thập đủ thông tin đề nghị; chọn giá trị danh mục hợp lệ. |
| `sales-orders` | Thiếu `objectId`, `employeeId`, `isOrder`, `currencyId`, `rateExchange`; gửi `objectName` ngoài hợp đồng ghi. | Tạo nội dung riêng cho đơn hàng; gửi ID đã chọn, không gửi tên vào trường ID. |
| `internal-transfer-requests` | Thiếu chi nhánh gửi/nhận; dùng `quantity`, `unitPrice` thay cho cấu trúc dòng có `requestedQty`, `isEquipment`. | Dùng mẫu đề nghị điều chuyển và dòng yêu cầu tương ứng. |
| `machine-movements` | Thiếu `moveTypeId`, dòng thiếu `assetId`; gửi các trường ngoài hợp đồng. | Chọn loại di chuyển và máy; gửi `assetId`. |
| `machine-repairs` | Thiếu `serviceTypeId`, dòng thiếu `assetId`; gửi các trường ngoài hợp đồng. | Chọn loại dịch vụ và máy cần sửa/bảo trì. |
| `purchase-orders` | Gửi `rateExchange: "1.00"` dạng chuỗi trong khi hợp đồng yêu cầu number. | Gửi tỷ giá đúng kiểu; lấy nhà cung cấp từ danh mục thay cho giá trị dự phòng tự đặt. |
| `inbound-requests` | Thiếu `invoiceNo`, `departurePoint`, `destinationPoint`, `orderTypeId`, `qrPrintType`; dòng gửi `quantity` ngoài hợp đồng. | Thu thập thông tin nhập kho; dùng các số lượng theo chứng từ của dòng nhập. |
| `internal-transfer-batches` | Dòng dùng `itemId`, `quantity`, `unitPrice`; hợp đồng yêu cầu `requestId`. | Chọn đề nghị điều chuyển để đưa vào đợt. |

Các trường hiển thị tên, mã định dạng tiền/ngày và tên trạng thái không được tự động sao chép vào nội dung ghi. Hợp đồng đọc và hợp đồng ghi có mục đích khác nhau.

### FE-05 — Nút Lưu, Lưu chi phí, Lưu danh sách máy và một số nút QR ghép sai URL

`handleAction` xử lý riêng vài nút rồi chuyển các nút còn lại sang `executeWorkflowAction(module, action.id, ...)`. Vì vậy các nút dưới đây có thể đi vào đường dẫn `/actions/...` không tồn tại, bị proxy FE trả 404 trước khi đến BE. Bằng chứng: `tab-erp-screen.tsx`; `erp-screen-api.ts`; E3.

| Nút | Đường dẫn đúng | Đường dẫn sai FE có thể ghép |
|---|---|---|
| Lưu phiếu | `POST /api/erp/{module}/save` | `/api/erp/{module}/actions/save` |
| Thêm từ thanh nút chi tiết | `POST /api/erp/{module}/create` | `/api/erp/{module}/actions/create` |
| Lưu chi phí nhập kho | `POST /api/erp/inbound-requests/sections/costs/save` | `/api/erp/inbound-requests/actions/save-costs` |
| Lưu danh sách máy điều chuyển | `POST /api/erp/internal-transfer-tech/sections/assets/save` | `/api/erp/internal-transfer-tech/actions/save-assets` |
| Quét thêm | `POST /api/erp/{warehouse-qr hoặc sales-qr}/qr/add` | `/api/erp/{module}/actions/scan-add` |
| Quét xóa | `POST /api/erp/{warehouse-qr hoặc sales-qr}/qr/delete` | `/api/erp/{module}/actions/scan-delete` |

Các nút camera riêng có gọi đúng `/qr/add` và `/qr/delete`; sai lệch nằm ở bộ xử lý thanh nút chung. FE cần dispatch đúng loại thao tác, dùng route BE trả và tạo nội dung đúng theo từng API. Nút Lưu phải có header và danh sách thay đổi dòng; gửi một payload ghi chú không thay thế được lưu phiếu. Hiện `saveDocument`, `saveSection`, `getLookupOptions` và `getItemPrice` chỉ xuất hiện ở lớp API, chưa được các component gọi: kiểm tra `rg` trên toàn bộ `apps/medcom-sites/components`, E4.

### FE-06 — “Xem thông tin hợp đồng” bị ẩn nhầm

API: `GET /api/erp/{sales-orders|sales-qr|sales-order-pm|sales-order-sa}/contract-info`.

FE lọc `!act.caption.toLowerCase().includes("in")`. Caption “Xem thông tin hợp đồng” chứa “in” trong chữ “tin”, nên cả bốn màn hình mất nút dù API và trạng thái nút đã có. Bằng chứng: `tab-erp-screen.tsx`; `ErpScreenCatalog.cs`, `inventories/erp/20261010/six-screen-catalog.json`, `inventories/erp/20261011/cud-workflow-catalog.json`.

Lọc nút in bằng loại thao tác xác định, giữ nút xem hợp đồng nếu BE trả `visible=true`. Đọc đối tượng `contract` riêng; không trộn định danh hợp đồng với định danh phiếu. Tên/cột hợp đồng gốc có thể giữ cách viết hoa từ nguồn: `SqlErpScreenContract.cs`, `CanonicalResponseProjection.cs`.

### FE-07 — Bấm thông báo chỉ đổi tab, bỏ mất chứng từ cần mở

API: `GET /api/notifications/{id}/target`, sau đó GET detail của màn hình được BE xác định.

`NotificationsSheet` chuyển đủ `branchId`, `documentId`; callback ở `medcom-app.tsx` đặt tên `_documentId` rồi bỏ qua. Kết quả chỉ đổi tab, chưa mở đúng phiếu hoặc lọc theo DocumentID như yêu cầu. Bằng chứng: `notifications-sheet.tsx`, `medcom-app.tsx`, `tab-erp-screen.tsx`.

FE cần giữ `moduleId`, `branchId`, `documentId`, chỉ mở khi `canOpen=true`, rồi gọi detail với đúng chi nhánh/phiếu. Bảng ánh xạ tab hiện chỉ có chín module và còn chuyển các module mua/nhập sang tab cũ; cần bổ sung các màn hình xử lý PM, SA, kế toán và kho nếu target thuộc màn hình đã được BE hỗ trợ. Bằng chứng: `notifications-sheet.tsx`, `Medcom.Application/Notifications.cs`.

## P1 — sửa ngay sau P0 để dữ liệu đầy đủ, nút đúng trạng thái

| Mã | API / màn hình | Sai lệch đã xác minh | FE cần thực hiện và bằng chứng |
|---|---|---|---|
| FE-08 | Chi nhánh, thông báo và chi tiết các màn hình | Chi nhánh chỉ tải trang 1/50; thông báo luôn trang 1/30; detail chỉ trang 1/50. Giao diện chưa đọc các trang chi tiết tiếp theo. Số lượng trên đầu trang lấy `rows.length` của trang đầu. | Tôn trọng `hasMore`/`totalRows`; bổ sung điều khiển phân trang cho dòng, lịch sử, đối chiếu và từng phần. Không gọi số dòng một trang là tổng số chứng từ. `erp-client.ts`, `notifications-sheet.tsx`, `tab-erp-screen.tsx`, `medcom-app.tsx`. |
| FE-09 | `GET /api/notifications`, `GET /api/notifications/{id}`, `POST /api/notifications/{id}/read`; `POST /api/erp/purchase-orders/item-price` | Schema FE loại bỏ tên người gửi/nhận, tên trạng thái, ngày hiển thị của thông báo; schema đơn giá bỏ `itemCode`, `itemName`, `unit`, `unitPriceDisplay`. | Giữ và sử dụng các trường đầy đủ BE trả. `notifications-contracts.ts`, `erp-screen-contracts.ts`; tái hiện mất trường E3. API chi nhánh chuẩn trả `branchId`, `branchName` và bộ đọc hiện tại đọc đúng, không đổi sang cặp `id/name` của dropdown khác. |
| FE-10 | `GET /api/erp/{module}/detail`, list, options | Adapter đưa cả `lines`, `actions`, `sections`, `header`, `stateToken` vào header. Trang chi tiết duyệt mọi thuộc tính; schema list còn chấp nhận object sai thành trang rỗng do giá trị mặc định. | Chỉ giữ trường nghiệp vụ trong header; kiểm tra cấu trúc phản hồi bắt buộc; lập nhãn tiếng Việt theo màn hình, không sinh nhãn từ tên thuộc tính và không hiển thị object nội bộ. `erp-screen-contracts.ts`, `tab-erp-screen.tsx`; tái hiện E3. |
| FE-11 | Đơn đặt mua, đề nghị mua, nhập kho; list các module ERP | Các tab cũ còn tự đặt tên hàng/đơn vị, tự định dạng tiền, có chỗ cố định VND; danh sách ERP dùng `dateStr.slice(0,10)` dù BE đã trả ngày hiển thị. | Dùng tên/mã/đơn vị thực và `...Display`. VND hiển thị `#,##0 VND`, USD `#,##0.00 USD`; không thêm lần nữa hậu tố tiền tệ. `tab-purchases.tsx`, `tab-inbound.tsx`, `tab-orders.tsx`, `tab-erp-screen.tsx`; trường hiện có E2. |
| FE-12 | `POST /api/erp/{module}/options`, `/item-price` và các API `/save` | Giao diện đã có các hàm gọi nhưng chưa nối form sửa phiếu/dropdown tương ứng. Một form tạo chung không đáp ứng cấu trúc từng màn hình. | Nối danh mục theo `lookupId` và ngữ cảnh BE yêu cầu; dùng chọn hàng/kho/đối tượng/máy, nối lưu thay đổi dòng và các phần chi phí/máy. `erp-client.ts`; tìm callsite component E4; FE-04/05. Không bổ sung in, import hoặc copy. |
| FE-13 | Toàn bộ CUD/nút; `POST /api/erp/{module}/commands/lookup` | Giao diện phát sinh khóa thao tác mới ở mỗi lần xác nhận; hàm đối chiếu kết quả lệnh có trong lớp API nhưng màn hình hiện chưa sử dụng. | Giữ nội dung và khóa của cùng một ý định khi đối chiếu kết quả chưa rõ; phân biệt thành công, xung đột và chưa xác định. Không tự tạo lệnh mới để thay cho tra cứu kết quả. `tab-erp-screen.tsx`, `erp-screen-api.ts`, `erp-client.ts` danh sách import. |
| FE-14 | `GET /api/erp/{module}/actions`, trạng thái nút trong detail | Tạo mới hiện dựa vào danh sách module cố định; các nút camera riêng không dựa vào trạng thái action trả về. `reason` kỹ thuật được dùng trực tiếp làm tooltip/thông báo. | Lấy trạng thái thêm khi chưa chọn phiếu; dùng `visible/enabled/requiresSavedDocument` cho mọi nút, dịch lý do khóa thành thông báo nghiệp vụ. `tab-erp-screen.tsx`; `ErpActionRules.cs`. Khi chi nhánh/phiếu đổi, hủy lượt đọc cũ và chỉ áp dụng phản hồi cho đúng phiếu hiện tại. |

FE-08 còn áp dụng cho lịch sử đơn hàng/điều chuyển và bảng đối chiếu QR. Bảng QR hiện tìm `requiredQuantity`, `scannedQuantity`, trong khi cột nguồn đối chiếu có `quantity` và các thông tin hàng/lô/kho. Không tạo số lượng “đã quét” bằng một trường chưa có trong hợp đồng. Bằng chứng: `tab-erp-screen.tsx`, `six-screen-catalog.json` phần `fields.comparison` của `warehouse-qr`/`sales-qr`, E2.

## Thứ tự bàn giao

1. Sửa proxy và gộp đọc trùng; kiểm tra phân biệt lỗi FE/BE cho chi nhánh, thông báo.
2. Sửa các bộ đọc facade còn cũ, giữ tên và trường hiển thị, hoặc chuyển màn hình sang nhóm ERP thống nhất với đầy đủ adapter.
3. Sửa dispatch của nút và nội dung tạo/lưu theo từng màn hình; tích hợp dropdown cần thiết.
4. Khôi phục xem hợp đồng; mở đúng chứng từ từ thông báo.
5. Hoàn tất phân trang, trạng thái nút, hiển thị nghiệp vụ và đối chiếu kết quả lệnh.

Tài liệu công dụng/nút theo màn hình vẫn là [BE_FE_API_REFERENCE_20261011.md](BE_FE_API_REFERENCE_20261011.md). Hợp đồng chi tiết là [medcom-openapi.json](medcom-openapi.json). Bản đối chiếu này là danh sách sửa tích hợp, không yêu cầu đưa thuật ngữ lập trình lên giao diện.

## Giới hạn còn mở

- Chưa quan sát một vòng CUD thật trên FE rồi đọc lại dữ liệu production trong lần audit này; kết quả nghiệp vụ và thời gian xử lý sau khi FE sửa là **UNKNOWN**.
- BE cần điều tra độ trễ của SQL/kiểm tra phiên/bổ sung tên. Các lần 401/403 đồng loạt khoảng 10 giây có trong log, nhưng nguyên nhân gốc chưa được chứng minh; không kết luận tự động là người dùng sai mật khẩu hoặc thiếu quyền.
- Nhánh giao diện classic còn bộ đọc inbound draft yêu cầu tập thuộc tính cũ đúng tuyệt đối; phản hồi canonical bổ sung tên/chuyển trạng thái vào header bị từ chối. Bằng chứng: `inbound-request-api.ts`, E3. Đây là việc sửa tương thích FE; không phải lý do đổi hợp đồng ghi hoặc vượt kiểm tra quyền ở BE.
- Đây là snapshot của E1/E2. Khi FE có deployment mới, cần chạy lại đối chiếu với đúng commit và xác nhận từng mục đã sửa.
