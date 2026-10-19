# Bàn giao luồng Bán hàng — 18/10/2026

Phạm vi: frontend `apps/medcom-sites`, `/help` và tài liệu `apps/medcom-devdocs`. Không sửa backend, SQL, dữ liệu ERP hay cấu hình triển khai.

## Các màn hình đã nối

| Module | Giao diện và thao tác |
|---|---|
| `sales-orders` | Giữ luồng tạo đơn ba bước trên mobile; chi tiết và sửa đơn cùng bố cục. Thêm/sửa/xóa dòng hàng, lưu, xác nhận xóa đơn, gửi PM có lựa chọn người nhận theo trang, thu hồi và thông tin hợp đồng. |
| `sales-order-pm` | Dùng form chi tiết chung; xem hàng hóa/lịch sử/ảnh theo đúng module; xác nhận gửi SA hoặc trả lại kèm lý do. Không cấp quyền sửa header/dòng hàng của Sales. |
| `sales-order-sa` | Dùng form chi tiết chung; gửi Kế toán/Kỹ thuật, trả lại hoặc gửi về bước chọn từ options API. |
| `sales-qr` | Giữ màn hình chọn chứng từ và quét/đối chiếu đã có; bổ sung giữ lần quét chưa rõ kết quả, lookup và gửi lại cùng ý định. Chặn đóng/chuyển phiếu khi lần quét chưa được xác nhận. |
| `sales-goods-status` | Feature; không có route module trong đặc tả đã kiểm tra. |
| `sales-dispatch-invoices` | Feature; không có route module trong đặc tả đã kiểm tra. |

Nguồn giao diện: `components/untitledui/tab-erp-screen.tsx`, `components/erp/sales-order-form.tsx`, `components/erp/sales-order-action-dialog.tsx`, `components/erp/sales-order-detail-tabs.tsx`, `components/erp/sales-feature-links.tsx`. Các đường dẫn frontend trong tài liệu này tương đối với `apps/medcom-sites`.

Danh sách desktop tiếp tục dùng bảng/phân trang hiện có; mobile dùng thẻ. Form có dữ liệu chính 16px, nhãn 14px, nền/tương phản theo theme và vùng chạm tối thiểu 44px. Panel “Quy trình Bán hàng” sáu ô (`components/erp/sales-flow-overview.tsx`) đã bị gỡ bỏ theo yêu cầu chủ dự án ngày 18/10/2026; danh sách bán hàng giờ chỉ còn banner module, thanh tìm kiếm và bộ lọc trạng thái. Bố cục thực tế trên thiết bị: **UNKNOWN**, chưa chạy trình duyệt theo yêu cầu của chủ dự án.

## Hợp đồng ghi và đọc

- Quyền thao tác lấy từ `actions.visible/enabled`; backend kiểm tra lại. PM/SA không gọi save của Sales.
- `lib/erp/sales-order-edit-lines.ts` giữ lineId, tạo Add/Update/Remove và chỉ truyền các field writable. Trước khi sửa, đọc đủ trang cùng stateToken; từ chối trộn phiên bản, định danh trùng hoặc vượt 500 dòng.
- Lookup hợp đồng khi sửa có `ObjectID`; đổi khách hàng/hợp đồng xóa lựa chọn hàng không còn phù hợp. Chi tiết số/tiền/ngày ưu tiên companion Display; dữ liệu ghi giữ giá trị raw.
- `lib/erp/sales-order-workflow.ts#SalesCommandSession` giữ một intent bất biến, khóa idempotency và phiên bản gốc. Kết quả chưa rõ sẽ khóa thao tác mới; lookup và gửi lại dùng đúng operation/originalIntent. Receipt phải khớp module, operation, documentId, idempotencyKey và deleted.
- `scan-delete` chỉ xóa mã quét; không đánh dấu chứng từ bị xóa. Receipt deleted chỉ đúng với operation `delete`.
- Trạng thái lỗi xác định giữ nguyên nội dung hộp xác nhận để người dùng bổ sung. Nháp đang sửa yêu cầu Lưu/Hủy sửa trước khi đóng. Intent chỉ ở bộ nhớ trang; phục hồi sau đóng hẳn trình duyệt hoặc đăng xuất chưa được bổ sung.
- Ảnh Sales/PM/SA được đọc qua route của đúng module, có phân trang. Upload ảnh khi tạo Sales giữ luồng hiện có. Quản lý upload/delete ảnh riêng tại PM/SA chưa có UI trong thay đổi này.

Nguồn backend trong repository: `src/backend/Medcom.Application/ErpActionRules.cs`, `ErpWorkflowRules.cs`, `ErpInputRules.cs`; `src/backend/Medcom.Contracts/ErpScreens.cs`; `src/backend/Medcom.Infrastructure/Erp/SqlErpScreenCommands.cs`, `SqlErpScreenLookups.cs`. Đối chiếu mô tả trường tại `apps/medcom-devdocs/docs/modules/sales-orders-fields.mdx`, `sales-order-pm-fields.mdx`, `sales-order-sa-fields.mdx`, `sales-qr-fields.mdx`.

## Tài liệu và giới hạn nghiệp vụ

`lib/help/sales-guides.ts` bổ sung bốn hướng dẫn; `/help` giữ nguyên tổng 29 mục, có 7 hướng dẫn sẵn sàng. Hai mục chưa có API vẫn Feature. Devdocs có `/docs/foundation/sales-flow`; bộ sinh liên kết trang này từ cả sáu mục Bán hàng và đưa vào sidebar, search index, `llms-full.txt`.

Đặc tả công khai tải từ `https://api-medcom.bms79.com/api/contracts/openapi.json` ngày 18/10/2026; SHA-256 `d60e5ff34888d1133e24ed9bd26b41032de406b5595c64c2a71d433610022570`. Bản đọc tạm trong `.test-runtime/sales-flow/openapi.json` bị Git bỏ qua. Có 56 path thuộc bốn module được nối; không có route cho hai mục Feature. Snapshot devdocs được giữ nguyên, không thay nguồn contract toàn hệ thống trong lần sửa này.

Tên menu “Xuất hàng theo PXK” theo `/help`; mức tương đương chính xác với quy trình PXK cũ vẫn **UNKNOWN** như ghi tại `apps/medcom-devdocs/docs/modules/sales-qr.mdx`. API QR xử lý chứng từ đã có, không thay bước lập/duyệt PXK/hóa đơn. Do đó không tuyên bố đã hoàn tất đầy đủ sáu bước nghiệp vụ.

Không mở lại hoặc rehash archive ERP/DB trong thay đổi giao diện này. Chỉ dùng contract, catalog và mã nguồn đã lưu trong repository; không có tuyên bố mới về hành vi WinForms, dữ liệu hoặc giao dịch môi trường thật.

## Kiểm chứng

- TypeScript `tsc --noEmit`: PASS.
- ESLint các file TypeScript/TSX đã sửa và mới thêm: PASS.
- Bộ kiểm tra tập trung: 36/36 PASS (`sales-workflow`, `help-catalog`, `erp-sales-order-create`, `erp-screen-list-load`, `proxy-policy`). Dùng dữ liệu tổng hợp và transport giả lập; không ghi ERP thật.
- Devdocs: sinh tài liệu PASS, catalog 7/7 PASS, build Docusaurus PASS.
- `git diff --check`: PASS.
- Bộ tổng `scripts/test-erp.mjs --contracts-only`: **615/628 PASS, 13 FAIL**. Tên cờ không loại hết bài có yêu cầu trình duyệt. Bốn bài trong `mobile-request.test.mjs`/`purchase-request-integration.test.mjs` dừng vì thiếu Playwright, chưa mở trình duyệt. Chín bài còn lại ở `mobile-request.test.mjs`, `request-screen-controls.test.mjs`, `shared-screen-ui.test.mjs` vẫn tìm nút “Thêm dòng hàng”/ký tự × trong giao diện Mua hàng hiện đã thay đổi. Các file component/test gây các assertion này không được sửa trong lần làm Bán hàng. Không coi bộ tổng là đã qua và không bỏ/disable các bài lỗi.

Log tạm: `.test-runtime/sales-flow/checks.log`, `regression.log`, `lint.log`; log build docs ở `apps/medcom-devdocs/.test-runtime/sales-flow-build.log`. Các file runtime/log không được đưa vào Git.

Nghiệm thu thủ công còn lại: thử trên mobile/desktop và hai theme; tạo/sửa/gửi PM; PM gửi SA/trả lại; SA chuyển bộ phận/gửi về; quét thêm/xóa QR; kiểm tra quyền tài khoản khác nhau, xung đột phiên bản và mất kết nối. Kết quả thao tác trên ERP thật: **UNKNOWN**.

## Điều chỉnh lookup Hợp đồng trong form sửa

Ô Hợp đồng trước đó bật `preloadAll`, nên tải khi vào chế độ Sửa và dùng lại kết quả đã tải khi mở dropdown. Nếu kết quả đó trống, thao tác mở không tạo một request mới. Đã bỏ preload riêng tại form sửa: mở ô sẽ gọi `POST /api/erp/sales-orders/options` với `lookupId=header.ContractID`, chi nhánh hiện tại và `context.ObjectID` của khách hàng; mở lại sẽ tải lại. Tìm kiếm và tải thêm trang dùng cơ chế LookupField hiện có. Form tạo giữ cơ chế preload đã có.

Nguồn: `components/erp/sales-order-form.tsx`, `components/untitledui/lookup-field.tsx` (`enabled`, `queryKey` và effect tải options), `lib/erp/erp-screen-api.ts#getErpOptions`. Test `tests/erp-sales-order-edit-lookup.test.mjs` dùng form sửa và LookupField thật, chỉ thay transport: tái hiện lỗi trước sửa; sau sửa xác nhận request khi mở/mở lại, bộ lọc khách hàng và chọn hợp đồng cập nhật nháp. Bộ kiểm tra tập trung cho lần sửa này: 18/18 PASS (`erp-sales-order-edit-lookup`, `erp-sales-order-create`, `sales-workflow`). Không chạy trình duyệt hoặc truy vấn dữ liệu ERP thật; chưa kết luận khách hàng trong ảnh có hợp đồng nào được API cấp.
