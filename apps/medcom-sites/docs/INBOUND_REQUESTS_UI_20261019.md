# Đề nghị nhập hàng — màn kho dùng chung lưới mua/bán (19/10/2026)

Phạm vi: frontend `apps/medcom-sites`. Không sửa backend, SQL, dữ liệu ERP hay cấu hình triển khai.

## Vấn đề ghi nhận

- Màn `inbound-requests` đã có trong `lib/erp/proxy-policy.ts#erpScreenModules` và đã được `MedcomApp` dựng sẵn (`ERP_MODULES` → `TabErpScreen`), nhưng **không có mục nào trong sidebar desktop hoặc drawer mobile** trỏ tới nó, nên trên giao diện mới màn "Đề nghị nhập hàng" không mở được. Chỉ còn tab `inbound` cũ trong thanh điều hướng đáy của điện thoại (`components/untitledui/tab-inbound.tsx`) — cùng kiểu tồn tại với tab `orders`/`purchases` cũ.
- Tab này không nằm trong nhóm màn dùng bảng desktop (`useDesktopTable`), nên trên máy tính chỉ hiện lưới thẻ; và `sales-qr`, `inbound-requests` bị giới hạn bề rộng `max-w-7xl` trong `MedcomApp` trong khi các màn có bảng khác dùng toàn bộ bề rộng.

## Thay đổi

- `components/untitledui/desktop-sidebar.tsx`: thêm nhóm **"Quản lý kho"** với mục **"Đề nghị nhập hàng"** (`id: inbound-requests`, icon `PackagePlus`), đặt giữa nhóm Bán hàng và Điều chuyển nội bộ.
- `components/untitledui/sidebar-drawer.tsx`: cùng nhóm/mục cho drawer mobile, mô tả `Menu 07011 • IV_InboundRequestFrm` theo `lib/erp/catalog.ts`.
- `components/untitledui/tab-erp-screen.tsx`: thêm `inbound-requests` vào `useDesktopTable` → **≥1024px dùng bảng chứng từ dùng chung** (`DocumentListTable`) như các màn mua/bán, **<1024px vẫn là thẻ**. Chi tiết mở ở khung bản ghi rộng (`presentation="document"`, toàn màn hình trên điện thoại) như các màn mua/bán; màn `sales-qr` vẫn giữ khung chi tiết cũ như ghi ở `SALES_FLOW_UI_20261018.md`.
- `components/untitledui/tab-erp-screen.tsx`: ẩn dòng mã `damageInsideStatusId` khi đã có `damageInsideStatusName` — cùng quy tắc "ưu tiên tên đã giải mã" đang dùng cho `statusId`/`deliveryStatusId`.
- `components/untitledui/medcom-app.tsx`: `sales-qr` và `inbound-requests` được dùng toàn bộ bề rộng (`max-w-none`) như các màn có bảng; các màn chỉ có biểu mẫu/thẻ giữ `max-w-7xl`.
- Mục nav tự ẩn nếu `/api/erp/permissions` không trả `inbound-requests` với `canView` — đúng cơ chế `tabAccess` sẵn có, không thêm cổng quyền mới và không nới quyền.

## Đối chiếu nguồn

OpenAPI công khai `https://api-medcom.bms79.com/api/contracts/openapi.json` (đọc lại ngày 19/10/2026), `info.version` = `3.0.0`, 276 path. Nhóm đường dẫn của màn này:

- Đọc: `/api/erp/inbound-requests`, `/screen`, `/detail`, `/actions`; `/api/documents/inbound-requests(+/detail)`; `/api/v2/documents/inbound-requests(+/detail)`; `/api/inbound-requests/draft`.
- Ghi: `/api/erp/inbound-requests/create|save|delete`, `/sections/costs/save`, `/actions/send-management`, `/actions/send-warehouse`, `/options`, `/commands/lookup`, `/attachments/*`; `/api/inbound-requests/draft/save|send-to-warehouse|reconcile`.
- Schema danh sách `Erp_inbound_requests_list_responseFeDisplayCanonicalV3_documentId` (64 trường/dòng) có `documentId`, `documentDateDisplay`, `datetimeRecordedDisplay`, `objectName`, `statusId`/`statusName`, `statusForeColor`/`statusBackColor`, `damageInsideStatusName` + `damageInsideStatusForeColor`/`damageInsideStatusBackColor`, `orderNumber`, `notes`, `branchName` — đủ cho các cột dùng chung (Mã chứng từ · Ngày chứng từ · Đối tượng / Mục đích · Trạng thái · Nội dung). Dòng nhập hàng **không có** `personSuggest`/`userCreate` nên cột "Người lập / Đề nghị" tự ẩn, không hiện cột trống.
- Proxy đã cho phép sẵn các đường dẫn này (`lib/erp/proxy-policy.ts`: `erpScreenModules` cho GET, `fullCudModules` + các route `sections/costs/save`, `actions/send-*` cho POST) — không phải mở thêm route.

Trang help: `lib/help/guides.ts` đã có nhóm **"Quản lý kho"** với mục **"Đề nghị nhập hàng"** (guide id `inbound-requests`, tiêu đề "Phiếu đề nghị nhập hàng") — khớp tên nhóm/mục mới thêm vào điều hướng. Danh mục nội bộ `lib/erp/catalog.ts` ghi `inbound-requests`: form `IV_InboundRequestFrm`, menu `07011`, capability `inbound-requests.read`.

## Kiểm chứng

- `npx tsc --noEmit` và ESLint trên các tệp đã sửa: sạch.
- `tests/erp-screen-list-load.test.mjs`: thêm 2 bài render thật `TabErpScreen` với dữ liệu tổng hợp — màn `inbound-requests` dựng đúng 1 bảng với đủ tiêu đề cột, đúng dữ liệu (mã, ngày, đối tượng, trạng thái, ghi chú), **không** có cột "Người lập / Đề nghị", và giữ nguyên cặp màu BE khi đủ tương phản (`#FFFFFF` trên `#00695C`); màn `sales-qr` dựng bảng và đổi chữ sang màu đọc được khi cặp màu lệch; màn `warehouse-qr` vẫn không dựng bảng. Tệp: 12/12 PASS.
- Bộ kiểm tra đơn vị đầy đủ: 655 bài, 642 PASS, 13 lỗi. 13 lỗi nằm trong `mobile-request.test.mjs`, `purchase-request-integration.test.mjs`, `request-screen-controls.test.mjs`, `shared-screen-ui.test.mjs` và đã tái hiện nguyên trạng khi tạm bỏ thay đổi này — không do lần sửa này.

## Còn lại / UNKNOWN

- Chưa xác minh tài khoản thật có `inbound-requests` trong `/api/erp/permissions` hay không, và chưa xem bố cục thật trên máy tính/điện thoại: **UNKNOWN** cho tới khi chủ dự án tải lại `localhost:3000` bằng phiên ERP thật. Nếu backend không trả quyền, mục "Đề nghị nhập hàng" sẽ ẩn — đó là hành vi đúng, không phải lỗi giao diện.
- Hướng dẫn `/help` cho `inbound-requests` vẫn `available: false` nên vẫn ghi "Hướng dẫn sẽ được bổ sung khi giao diện chức năng sẵn sàng". Nội dung hướng dẫn và ảnh chụp cần phiên ERP thật; chưa viết trong lần này.
- Badge cho `damageInsideStatusName` (tình trạng hư hỏng bên trong) chưa có; hiện chỉ hiện dòng tên đã giải mã trong chi tiết. Cặp màu `damageInsideStatusForeColor`/`BackColor` vì vậy vẫn chưa dùng tới.
- Tab `inbound` cũ trong thanh điều hướng đáy của điện thoại vẫn trỏ màn cũ, giống tab `orders`/`purchases` cũ; chưa gộp trong lần này.
