# Danh sách mua/bán bằng Tailwind

## Phạm vi và bằng chứng source

- `components/untitledui/document-list-table.tsx`: bảng desktop dùng toàn bộ utility Tailwind. Tiêu đề cố định khi cuộn, hàng gọn, vùng cuộn riêng, nút chi tiết cố định bên phải, focus bằng bàn phím, skeleton và số bản ghi đang hiển thị.
- `components/untitledui/tab-erp-screen.tsx`: áp dụng cho purchase-requests, purchase-approvals, purchase-orders, sales-orders, sales-order-pm, sales-order-sa. Các cột lấy từ header danh sách hiện có; trường thiếu hiển thị dấu `—`. Không gọi thêm API theo từng dòng.
- `components/untitledui/tab-orders.tsx`, `tab-purchases.tsx`: danh sách PO/PR cũ dùng cùng bảng, giữ phép ánh xạ và cách định dạng dữ liệu của mỗi màn.
- `components/untitledui/medcom-app.tsx`: các màn trên dùng chiều rộng vùng làm việc, có `min-w-0` để vùng bảng cuộn trong container.

Từ 1024px hiển thị bảng; dưới 1024px giữ nội dung và kiểu thẻ mobile. Tìm kiếm, bộ lọc, quyền và hàm mở chi tiết tiếp tục do màn gốc xử lý. Không sửa file CSS, hợp đồng API hoặc lệnh ghi.

## Phân trang danh sách

- `components/untitledui/document-list-pagination.tsx`: Trước/Sau, số trang trên desktop, lựa chọn số dòng và trạng thái tải; nút cao tối thiểu 44px. Không suy diễn tổng số trang từ hasMore.
- `components/untitledui/tab-erp-screen.tsx`: gửi page/pageSize cho mỗi trang, khóa điều hướng khi tải, đưa về trang 1 khi tìm kiếm được áp dụng hoặc đổi bộ lọc/số dòng. Làm mới giữ trang hiện tại nếu tìm kiếm không đổi. STT có offset theo trang. Khóa chống phản hồi muộn và khóa gộp request có pageSize.
- `components/untitledui/tab-orders.tsx`, `tab-purchases.tsx`: chuyển số trang và số dòng xuống client hiện có; không tải tab ẩn ban đầu; bỏ phản hồi cũ khi có truy vấn mới.
- Giới hạn nguồn: `src/backend/Medcom.Application/ErpInputRules.cs#Page` cho ERP page <= 10000, size <= 100; `src/backend/Medcom.Api/DocumentEndpoints.cs` cho tài liệu cũ page <= 1000, size <= 100; `src/backend/Medcom.Application/PurchaseRequests/PurchaseRequestQueries.cs` và `lib/erp/purchase-request-api.ts` giới hạn PR cũ size <= 50. Menu dùng 20/50/100, riêng PR cũ dùng 20/50.
- Các bộ lọc khóa/mở và trạng thái cũ vẫn lọc trong trang đã tải. Thanh phân trang phân biệt số dòng trang và số hiển thị sau lọc. Chưa có tổng số bản ghi trong hợp đồng `lib/erp/erp-screen-contracts.ts#erpDocumentPageSchema`.

## Form chi tiết và chỉnh sửa

- `components/untitledui/bottom-sheet.tsx`: thêm presentation document, toàn màn hình trên mobile và tối đa 1440px trên desktop. Font Segoe UI/Roboto/Arial; tiêu đề 18–20px, nội dung 16px, nút đóng tối thiểu 44px. Theme lấy từ lớp dark hiện tại thay vì lưu bản sao trong portal.
- `components/untitledui/tab-erp-screen.tsx`, `tab-orders.tsx`, `tab-purchases.tsx`: các form chứng từ dùng presentation document; bảng chi tiết cuộn ngang riêng, tiêu đề không xuống dòng, nhãn tối thiểu 14px và nội dung 16px trong phạm vi đã sửa.
- `components/untitledui/purchase-request-create-sheet.tsx`: form tạo/sửa đề nghị mua dùng cùng kích thước. Nhãn input được liên kết bằng htmlFor/id; input cao tối thiểu 44px. Tổng hợp chia thông tin chứng từ, khách hàng, thông tin đề nghị, hàng hóa và tổng thanh toán. Hàng hóa hiển thị bảng desktop/thẻ mobile. Giữ nguyên kiểm tra và lệnh lưu hiện có.

## Chi tiết Quản lý đơn hàng — sửa tiếp theo phản hồi của chủ dự án

- `components/erp/erp-detail-sheet.tsx`: Sales Order dùng body portal để không bị containing block của animation giữ transform tại `app/untitledui.css#uui-fade-in` và `components/untitledui/tab-erp-screen.tsx` chi phối. Giữ RecordDialog và các React context/host hiện có; presentationAllowed đi theo isActive để dialog portal không xuất hiện trên tab ẩn.
- `components/erp/request-detail-dialog.tsx`: thêm className để giới hạn Tailwind của Sales Order trong đúng khung này; dùng SVG X cho nút đóng. Không đổi xử lý focus, Escape, quyền hoặc command.
- `components/erp/sales-order-form.tsx`: bố cục thông tin chung/khách hàng/người phụ trách theo grid trên desktop; các section có viền, nền và nhãn rõ. Nội dung 16px, nhãn 14px, input/textarea 16px. Bảng tổng quan hàng hóa desktop lấy các field đã có trong `lib/erp/sales-order-lines.ts#SALES_ORDER_LINE_COLUMNS`; phần mở rộng vẫn giữ toàn bộ field và lịch sử. Không tính lại tiền hoặc sửa payload lưu.
- Kiểm tra trình duyệt cho lần sửa Sales Order cuối: KHÔNG CHẠY theo yêu cầu trực tiếp của chủ dự án. Hiển thị thực tế của portal/layout mới: UNKNOWN, chủ dự án tự kiểm tra. Kết quả browser bên dưới thuộc bản phân trang trước lần sửa Sales Order này.

## Tab chi tiết và lịch sử gửi/duyệt — phản hồi tiếp theo

- `components/erp/sales-order-detail-tabs.tsx`: tách phần trình bày ra khỏi SalesOrderForm. Hai tab có biểu tượng SVG, số dòng, trạng thái aria-selected, liên kết tabpanel và điều hướng ArrowLeft/ArrowRight/Home/End.
- Tab hàng hóa: bảng desktop có nút mở rộng trong từng dòng, thẻ mobile có tóm tắt và nút mở đầy đủ; thay cấu trúc bảng cộng danh sách chi tiết lặp bên dưới. Phần mở rộng in đủ field theo đúng thứ tự cột của `lib/erp/sales-order-lines.ts#SALES_ORDER_LINE_COLUMNS` (khớp lưới ERP) và giữ ánh xạ field cũ; không tính lại số tiền.
- Tab lịch sử: dòng thời gian giữ nguyên thứ tự trả về; người gửi, thời gian, người nhận, mã trạng thái và ghi chú lấy đúng các key đã dùng trước đó (userName/thoiGian/sendTo/statusId/notes). Không suy đoán trạng thái từ mã, không tạo sự kiện mới.
- `components/erp/sales-order-form.tsx`: truyền lines/history từ ErpDocumentDetail sang component trình bày; không thêm request hoặc đổi lệnh lưu.
- TypeScript `tsc --noEmit --project apps/medcom-sites/tsconfig.json`: PASS sau lần thay tab này. Trình duyệt: KHÔNG CHẠY theo yêu cầu của chủ dự án; kết quả hiển thị thực tế: UNKNOWN.

### Tên trạng thái lịch sử đơn hàng

`components/erp/sales-order-detail-tabs.tsx` trước đó hiển thị trực tiếp fields.statusId. Đã đổi sang fields.statusName qua `lib/erp/document-status.ts#documentStatusLabel`, mã chỉ ở tooltip; nếu thiếu tên hợp lệ thì hiển thị trạng thái chưa xác định kèm mã. Không hardcode tên của snapshot hoặc dùng từ điển của phân hệ khác. `src/backend/Medcom.Api/FeDisplayProjection.cs#Rows/Apply` duyệt cả history và bổ sung statusName; `inventories/backend/20261011/api-reference-bindings.json#status:sales-orders` trỏ tới dbo.AR_OrderStatusTbl.StatusID/StatusName. Zod `lib/erp/erp-screen-contracts.ts#erpLineRowSchema` giữ các trường bổ sung này trong fields.

Ý nghĩa luồng được kiểm tra tại `src/backend/Medcom.Infrastructure/Erp/SqlErpScreenEffects.cs` (send-pm gọi AR_OrderTbl_UpdateStatusStp với 12), `SqlErpWorkflowEffects.cs` (PM reject đưa về 11) và `docs/backend/BE_FE_SIX_SCREEN_COMMANDS_20261010.md` (recall đưa về 11). Tên/caption hiện hành phải lấy từ API; ý nghĩa sự kiện riêng của mỗi row thực tế chưa được xác minh ngoài ảnh người dùng. `inventories/source/20261007/document-status-bindings.json` thuộc các từ điển AP/IV, không được dùng nghĩa 11/12 của nhập kho cho đơn hàng bán. Không đọc DB, gọi lệnh nghiệp vụ hay chạy trình duyệt trong lần sửa này.

## Kiểm tra tại source hiện tại

### Bố cục tóm tắt đơn hàng sau phản hồi về khoảng trống

`components/erp/sales-order-form.tsx#data-sales-order-overview`: bỏ cấu trúc 12 cột/row-span cũ; dùng hai cột bằng nhau từ lg, một cột trên mobile. Khối trái gộp ngày chứng từ/ngày giao/chi nhánh với người phụ trách; khối phải trình bày tên/mã khách hàng, địa chỉ và hợp đồng. Khi diễn giải và ghi chú đều trống ở chế độ xem, hiển thị thanh tóm tắt gọn. Chế độ sửa vẫn hiển thị đủ các field cũ, handler và payload không đổi. TypeScript đã PASS sau thay đổi JSX chính; lần điều chỉnh breakpoint tiếp theo chỉ đổi utility class. Không chạy trình duyệt theo yêu cầu của chủ dự án; hiển thị thực tế: UNKNOWN.

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` — PASS.
- `node --test tests/erp-screen-list-load.test.mjs tests/sales-order-form.test.mjs` — 9/9 PASS tại bản phân trang/khung Sales Order trước lần thay tab. Bao gồm trang đầu/cuối, pageSize, tìm kiếm/lọc, lỗi không làm nhảy trang, phản hồi cũ/đổi chi nhánh và cả hai danh sách cũ; không phải kiểm chứng giao diện tab mới.
- `node --test tests/commerce-list.browser.mjs` — PASS trên trang Next thực với Edge. Toàn bộ request ERP được chặn và trả dữ liệu tổng hợp, chỉ có GET.
- 72 cấu hình: 6 màn × 2 theme × 320/390/768/1024/1440/1920px. Kiểm tra bảng/thẻ đúng breakpoint, không tràn ngang trang, tiêu đề giữ một dòng và cố định khi cuộn, nút mở chi tiết, tìm kiếm, bộ lọc và mở chứng từ trên desktop/mobile.
- 12 cấu hình chi tiết và 10 cấu hình chỉnh sửa/Tổng hợp: kiểm tra kích thước form, font, tương phản hai theme, header bảng, không tràn ngang trang, giữ bản nháp khi đổi kích thước/theme và đóng form trở về chi tiết. Không gửi lệnh lưu.
- Trước lần sửa Sales Order cuối: kiểm tra 6 màn với 55 dòng tổng hợp, 3 trang và pageSize 20/50/100; chuyển trang, số thứ tự, trang cuối, reset tìm kiếm/lọc, danh sách rỗng, lỗi trang và thử lại. Thanh phân trang kiểm tra ở 320/390/768/1440px, hai theme. Ảnh `pagination-390-light.png`, `pagination-1440-light.png` và dark tương ứng.
- Bằng chứng cục bộ: `.test-runtime/commerce-table-tailwind/evidence.json`, `desktop.png`, `mobile.png`, `detail-390-light.png`, `detail-1440-light.png`, `review-390-light.png`, `review-1440-light.png` và các ảnh dark tương ứng. Không chứa dữ liệu ERP thực. Không dùng kết quả kiểm tra từ các lần sửa trước để thay thế lần kiểm tra này. Chấp nhận trên dữ liệu/phiên ERP thực: UNKNOWN.

## Giải thích request CSRF

`lib/erp/erp-screen-api.ts`: getErpOptions và các action options gọi erpPost; erpPost gọi getCsrfToken trước từng POST. getCsrfToken luôn fetch với cache no-store, không giữ token trong bộ nhớ nên mỗi options request có thêm một GET `/api/erp/api/auth/csrf`. `src/backend/Medcom.Api/AuthEndpoints.cs` cấp token qua GetAndStoreTokens; `src/backend/Medcom.Api/ApiHost.cs` kiểm tra antiforgery cho request API không phải GET/HEAD/OPTIONS và trả 403 csrf_invalid khi kiểm tra thất bại. Chưa thay đổi cơ chế lấy hoặc tái sử dụng token trong lần sửa UI này.
