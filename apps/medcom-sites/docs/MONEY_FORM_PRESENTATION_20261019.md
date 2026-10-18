# Cỡ chữ và định dạng tiền trên form — 19/10/2026

Phạm vi lần sửa: frontend. Chủ dự án yêu cầu giữ nguyên hai phần tự tính chiết khấu/thuế để làm tiếp khi backend đầy đủ. Không sửa `src/backend` hoặc công thức tại `lib/erp/sales-order-lines.ts`.

## Hiển thị và nhập tiền

- `lib/erp/money.ts#formatMoney` định dạng chuỗi decimal theo tiếng Việt: `1234567.89` thành `1.234.567,89`. Không chuyển chuỗi tiền qua Number hoặc làm tròn để hiển thị; chuỗi decimal dài vẫn giữ đúng giá trị.
- `components/erp/money-input.tsx` hiển thị phân cách khi ô không được sửa; khi focus dùng chuỗi decimal gốc. Focus/blur không phát sinh thay đổi nháp. Khi nhập hoặc paste, callback trả chuỗi canonical cho form/API.
- Copy số hiển thị `1.234` rồi paste được hiểu là `1234`; số thập phân tiếng Việt `1,234` thành `1.234`. Paste cũng kiểm tra maxLength, không tự cắt bớt số tiền vượt giới hạn.
- Áp dụng cho đơn giá, ngân sách, giá bán và các trường tiền của form tạo/sửa Mua hàng, Bán hàng, các form dùng DocumentEditor, MobileRequestLines, MobileInboundRequest và phần đọc chi tiết tương ứng. Nhận diện trường tiền qua danh sách khóa cụ thể trong `isMoneyField`; không định dạng mã chứng từ, ID, số lượng hay % thành tiền.
- Phần xem lại/chi tiết ưu tiên raw money để dùng chung cách định dạng; vẫn dùng chuỗi hiển thị của máy chủ nếu không có raw value. Đơn vị tiền được giữ ở phần thông tin phiếu hoặc hiển thị riêng trong chi tiết hàng hóa Bán hàng.
- Tổng tạm tính Mua hàng và các tổng dòng hiện có dùng số học decimal chính xác thay cho Number; giữ công thức nhân/cộng hiện tại và không thêm công thức CK/thuế mới.

Nguồn triển khai: `components/untitledui/purchase-request-create-sheet.tsx`, `purchase-order-create-sheet.tsx`, `tab-erp-screen.tsx`, `tab-orders.tsx`, `tab-purchases.tsx`, `tab-inbound.tsx`; `components/erp/document-editor.tsx`, `mobile-request-lines.tsx`, `mobile-inbound-request.tsx`, `purchase-request-screen.tsx`, `sales-order-line-editor.tsx`, `sales-order-detail-tabs.tsx`, `sales-order-form.tsx`. Các đường dẫn tương đối với `apps/medcom-sites`.

## Cỡ chữ và tương phản

- Ô nhập/giá trị chính dùng 16px; nhãn và nội dung phụ dùng 14px. Các form tạo dùng font Segoe UI, Roboto, Arial, sans-serif; chữ thường màu đen ở theme sáng và trắng ở theme tối, giữ màu chức năng cho lỗi/trạng thái.
- Sửa trực tiếp `components/untitledui/lookup-field.tsx`: ô chọn, tìm kiếm và lựa chọn chính dùng cỡ chữ 16px; mã/thông tin phụ 14px. Các lớp text-xs 12px trước đây khiến ô Khách hàng/Nhân viên/Hợp đồng trông nhỏ hơn các ô còn lại. Không chỉ tăng cỡ chữ ở khung bên ngoài.
- `bottom-sheet.tsx`, `request-presentation.tsx`, form tạo và `sales-order-attachment-picker.tsx` thống nhất cỡ chữ và tương phản; các vùng bấm lựa chọn chính tối thiểu 44px.

## Kiểm chứng

- 23/23 kiểm tra tập trung PASS: `money.test.mjs`, `erp-sales-order-create.test.mjs`, `erp-sales-order-edit-lookup.test.mjs`, `sales-workflow.test.mjs`. Bao gồm chuỗi tiền lớn, số lẻ, copy/paste, giới hạn nhập, focus/blur không đổi nháp và payload vẫn là giá trị raw.
- 5/5 kiểm tra chọn lọc trong `request-screen-controls.test.mjs` PASS: tham chiếu chỉ đọc, giữ nháp khi xác minh, navigation khi readback chưa khớp và unmount/remount Mua hàng/Nhập hàng.
- TypeScript, ESLint phạm vi sửa, biên dịch Tailwind và `git diff --check` được chạy riêng; log tạm nằm trong `.test-runtime/money/` và không đưa vào Git.
- Không mở trình duyệt theo yêu cầu của chủ dự án. Hiển thị thực tế trên thiết bị và kết quả thao tác với ERP thật: UNKNOWN. Các bài lỗi đã ghi ở bộ tổng trong `SALES_FLOW_UI_20261018.md` chưa được xác nhận đã sửa bởi lần thay đổi này.

Không đọc lại ZIP ERP/DB hoặc tuyên bố xác minh hành vi WinForms trong lần sửa trình bày này. Công thức nguồn hiện có tham chiếu tại `src/backend/Medcom.Infrastructure/Erp/SqlErpScreenEffects.cs#Calculate` được giữ nguyên.
