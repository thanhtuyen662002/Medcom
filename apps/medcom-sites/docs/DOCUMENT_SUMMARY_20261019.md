# Tổng toàn chứng từ từ `data.summary` trên màn chi tiết — 19/10/2026

Phạm vi lần sửa: frontend `apps/medcom-sites`. Không sửa `src/backend`. Đọc thêm `STATUS_COLORS_20261019.md` cho phần màu trạng thái trong cùng đợt bàn giao.

## Dữ liệu BE cung cấp

`GET /api/erp/{module}/detail` trả thêm `data.summary` trên các màn có tổng trong ERP:

| Màn hình | Trường trong `data.summary` |
|---|---|
| `sales-orders`, `sales-order-pm`, `sales-order-sa` | `rowCount`, `amount`, `vATAmount`, `totalAmount` |
| `warehouse-qr`, `sales-qr`, `machine-movements` | `rowCount`, `quantity` |
| `machine-repairs` | `rowCount`, `quantity`, `laborAmount`, `partsAmount`, `amount` |

`rowCount` là số dòng toàn chứng từ; các tổng cũng lấy toàn bộ dòng được phép xem, **không phụ thuộc `page`/`pageSize`** — trong khi `data.lines` vẫn phân trang như trước. Số thập phân trả dạng chuỗi; tổng tiền có thêm `...Display` theo tiền tệ chứng từ khi xác định được VND/USD. Giữ nguyên cách viết `vATAmount`.

## FE đọc như thế nào

- `lib/erp/document-summary.ts` (mới): `readDocumentSummary(summary)` chuẩn hóa số liệu, `summaryDisplay(entry, currencyId)` ghép tiền tệ khi cần.
  - Chỉ nhận `rowCount` là số nguyên không âm, và các tổng là chuỗi/số thập phân hợp lệ (`^-?\d+(?:\.\d+)?$`). Giá trị như `"1,234"`, `"1e5"`, `true` bị bỏ qua. Số thập phân dài **không** đi qua `Number`.
  - Ưu tiên `...Display` của BE (đã kèm tiền tệ); thiếu mới tự định dạng và nối tiền tệ chứng từ.
  - Tổng hiển thị riêng: chọn `totalAmount`, nếu không có thì `amount`. Khóa này bị loại khỏi lưới số liệu để không lặp lại.
  - Không đọc được số liệu nào (kể cả `{}`) thì trả `null` để giao diện dùng cách tính tại chỗ như trước.
- `components/untitledui/tab-erp-screen.tsx`: khối cuối phần chi tiết dòng hiển thị lưới số liệu (Số tiền, Tiền thuế, Tiền công, Tiền vật tư, Tổng số lượng tuỳ màn) và dòng `Tổng cộng (N dòng)` lấy `rowCount` toàn chứng từ. Vì `data.lines` phân trang, trước đây dòng "Tổng cộng" chỉ cộng các dòng đang tải; khi BE trả `summary` thì số dòng và tổng tiền đúng cho cả chứng từ. Khi BE chưa trả `summary` (bản cũ), giao diện giữ nguyên cách cộng tại chỗ.
- `components/erp/sales-order-detail-tabs.tsx`: nhận thêm prop tuỳ chọn `summary`, hiển thị khối `data-document-summary` phía trên dòng "N dòng hàng đã tải" — nêu rõ số dòng toàn chứng từ so với số dòng đang tải.
- `lib/erp/erp-screen-contracts.ts`: khai báo `summary` trong `erpDocumentDetailSchema` dạng record permissive (không ép kiểu từng trường) để việc đọc chi tiết không hỏng nếu BE đổi kiểu số/chuỗi của một trường tổng.

## Kiểm chứng

- `npx tsc --noEmit` và ESLint trên đúng các tệp đã sửa: sạch. `git diff --check`: sạch.
- `tests/document-summary.test.mjs` (mới, đã thêm vào `scripts/test-erp.mjs`): 5/5 PASS — đơn hàng bán dùng `...Display`, phiếu sửa chữa lấy `amount` làm tổng, màn QR không có tổng tiền, số thập phân 24 chữ số giữ nguyên độ chính xác, và các giá trị rác trả `null`.
- `tests/sales-order-detail-summary.test.mjs` (mới, render thật `SalesOrderDetailTabs` qua esbuild + react-test-renderer): 2/2 PASS — có `data.summary` thì khối `data-document-summary` hiển thị tổng và số dòng toàn chứng từ, không lặp lại tổng trong lưới; không có `data.summary` thì thẻ chi tiết giữ nguyên như trước.
- `tests/status-colors.test.mjs`: 4/4 PASS.
- Bộ kiểm tra đơn vị đầy đủ: 651 bài, 13 bài lỗi — đúng 13 bài lỗi có sẵn ở `mobile-request.test.mjs`, `purchase-request-integration.test.mjs`, `request-screen-controls.test.mjs`, `shared-screen-ui.test.mjs` (đã tái hiện nguyên trạng khi tạm bỏ thay đổi của đợt này), không phát sinh lỗi mới.
- Không mở trình duyệt, không dùng tài khoản thật. Bố cục thực tế trên thiết bị và giá trị tổng từ ERP thật: UNKNOWN cho tới khi chủ dự án tải lại `localhost:3000`.

## Ghi chú

- Chưa đọc `summary` ở các màn danh sách (`data.rows` không có `summary`) và chưa tự suy ra tổng cho màn không được BE cấu hình tổng.
- Màn xuất bán / quét QR hiển thị `Tổng số lượng` + `Tổng cộng (N dòng)`; không thêm tổng tiền cho các màn này vì BE không trả.
