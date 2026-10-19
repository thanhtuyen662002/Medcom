# Màu trạng thái do backend trả và cách FE áp dụng — 19/10/2026

Phạm vi lần sửa: frontend `apps/medcom-sites`. Không sửa `src/backend`. Giữ nguyên cách lấy quyền và khả năng bấm nút từ API quyền/thao tác của màn hình; màu chỉ là trình bày.

## Kiểm chứng OpenAPI đang chạy

`GET https://api-medcom.bms79.com/api/contracts/openapi.json` trả `200`, OpenAPI `3.1.1`, `info.version` `3.0.0`, 276 đường dẫn. Đây là bản hợp đồng đã triển khai, không phải tài liệu dự kiến.

Đã có trong hợp đồng:

- `statusForeColor`/`statusBackColor` trên dòng danh sách của mọi module ERP (`..._document_rowFeDisplayCanonicalV3_...`), trên `data.header` của chi tiết ở các màn có `statusId`/`statusName` (đơn hàng, PM, SA, quét QR bán/xuất, đặt mua, đề nghị mua, duyệt mua, nhập kho), trên dòng lịch sử và trên dòng thông báo (`NotificationRowFeDisplay`).
- `deliveryStatusForeColor`/`deliveryStatusBackColor` trên các màn đơn hàng (`sales-orders`, `sales-order-pm`, `sales-order-sa`).
- Mô tả trường đúng như bàn giao: mã CSS `#RRGGBB`, bỏ kênh alpha của số nguyên nguồn, `null` khi thiếu/không phân giải được, `readOnly`.
- `data.summary` đúng các màn được liệt kê: `sales-orders`/`sales-order-pm`/`sales-order-sa` có `rowCount`, `amount`, `vATAmount`, `totalAmount` kèm `...Display`; `warehouse-qr`/`sales-qr`/`machine-movements` có `rowCount`, `quantity`; `machine-repairs` có `rowCount`, `quantity`, `laborAmount`, `partsAmount`, `amount`.

Chưa có trong hợp đồng:

- `POST /api/erp/{module}/options` và `POST /api/erp/{module}/commands/lookup` trả `ErpChoice` chỉ gồm `id`, `label`, `fields`, `name`, `referenceState`; không khai báo trường màu. Vì vậy dropdown trạng thái hiện không nhận màu từ hợp đồng.
- Các header chi tiết không có `statusId` (ví dụ `warehouse-qr`, `machine-movements`, `machine-repairs`) cũng không có trường màu; đúng quy tắc "chỉ bổ sung khi có mã trạng thái".
- Danh sách `/api/documents/purchase-orders`, `/api/documents/inbound-requests` dùng schema `purchaseordersLegacySummaryFeDisplay...`/`inboundrequestsLegacySummaryFeDisplay...` và **có** `statusForeColor`/`statusBackColor`; nhập kho còn có thêm `damageInsideStatusForeColor`/`damageInsideStatusBackColor`.

## FE áp dụng

- `lib/erp/status-colors.ts` (mới): `statusColorStyle(foreColor, backColor)` và `statusColorsFrom(nguồn, foreKey?, backKey?)`. Chỉ nhận `#RRGGBB` hợp lệ; thiếu một kênh thì chỉ đặt kênh còn lại; cả hai không hợp lệ trả `undefined` để giao diện dùng màu mặc định. Không suy đoán từ mã trạng thái, không tự sinh màu.
- Danh sách ERP `components/untitledui/tab-erp-screen.tsx`: ô "Trạng thái" trong bảng desktop, nhãn trạng thái trên thẻ mobile và badge trạng thái ở chi tiết đều lấy màu từ `row.header`/`detail.header`. Badge chi tiết vẫn giữ `statusBadgeClass` làm nền dự phòng khi BE không trả màu.
- `components/erp/request-presentation.tsx#RequestStatus` nhận thêm `foreColor`/`backColor` tùy chọn và áp `style`. Đã nối màu tại `documents.tsx`, `purchase-request-screen.tsx`, `inbound-request-screen.tsx`, `inbound-request-readonly.tsx`, `workspace.tsx`.
- `components/erp/sales-order-form.tsx` (nhãn trạng thái đầu đơn) và `components/erp/sales-order-detail-tabs.tsx` (trạng thái dòng lịch sử) áp màu từ `header`/`fields`.
- `components/untitledui/tab-orders.tsx` và `tab-purchases.tsx`: thêm `statusForeColor`/`statusBackColor` vào mô hình dòng, truyền `style` cho `UntitledBadge` trong bảng, thẻ mobile và phần chi tiết đang chọn.
- Chưa áp dụng: `deliveryStatusForeColor`/`deliveryStatusBackColor` vì FE chưa có badge riêng cho trạng thái giao hàng (`deliveryStatusId` đang hiển thị như trường số trong chi tiết); `damageInsideStatusForeColor`/`statusBackColor` của nhập kho; `data.summary` chưa được đọc ở FE. Dropdown trạng thái chưa có màu do hợp đồng options không trả màu.

## Kiểm chứng

- `npx tsc --noEmit` và ESLint trên đúng các tệp đã sửa: sạch.
- `tests/status-colors.test.mjs` (mới, đã thêm vào danh sách của `scripts/test-erp.mjs`): 4/4 PASS — cặp màu, một kênh, giá trị thiếu/sai định dạng (kể cả `#000`, `#GGGGGG`, `rgb(...)`, số `0`), và đọc theo tên trường BE.
- Bộ kiểm tra đơn vị đầy đủ: 644 bài, 13 bài lỗi. 13 bài lỗi này nằm trong `mobile-request.test.mjs`, `purchase-request-integration.test.mjs`, `request-screen-controls.test.mjs`, `shared-screen-ui.test.mjs` và **đã tái hiện nguyên trạng khi tạm bỏ toàn bộ thay đổi của lần sửa này** (cùng 13 bài, cùng tệp) — không do lần sửa màu trạng thái gây ra.
- Không mở trình duyệt, không dùng tài khoản thật. Màu thực tế từ ERP thật, độ tương phản trên thiết bị và theme tối: UNKNOWN cho tới khi chủ dự án tải lại `localhost:3000`.

## Ảnh hưởng giao diện

Khi BE không trả màu (bản cũ hoặc trạng thái không có danh mục màu), mọi chỗ giữ nguyên màu mặc định như trước. Khi BE trả màu, màu chữ/nền của badge theo `statusForeColor`/`statusBackColor`, còn viền và các lớp khác giữ nguyên.
