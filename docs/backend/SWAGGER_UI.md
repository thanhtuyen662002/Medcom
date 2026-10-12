# Kiểm tra API bằng Swagger

BE có trang `/swagger` (chuyển tới `/swagger/index.html`), dùng danh mục 243
API hiện tại tại `/api/contracts/openapi.json`. Trang được đóng gói cùng BE,
không cần CDN hoặc thay đổi ứng dụng FE. Dùng bản BE đã cập nhật từ main.

1. Mở `https://<dia-chi-BE>:<cong>/swagger`. Nếu BE chỉ lắng nghe nội bộ, mở
   từ VPS hoặc qua đường truy cập quản trị tới đúng origin BE. Không mở cổng
   BE công khai chỉ để xem Swagger.
2. Nhập tên đăng nhập và mật khẩu ERP ở đầu trang, bấm **Đăng nhập**. Cookie
   và quyền của phiên do BE hiện tại xác định; mật khẩu được xóa khỏi ô nhập
   sau khi thử đăng nhập. Không nhập mật khẩu SQL vào đây.
3. Mở nhóm API cần kiểm tra, chọn API → **Try it out** → nhập tham số/body →
   **Execute**. Nhập `branchId`, `documentId` và dữ liệu nghiệp vụ theo tài
   khoản/quyền thực tế. Trang lấy CSRF token và phạm vi dữ liệu khi cần;
   browser tự gửi Origin. Không cần điền các cookie bằng nút Authorize.
4. Xem HTTP status, response và thời gian đáp ứng. Bấm **Đăng xuất** khi xong.

Các API tạo, sửa, xóa, gửi và quét ghi vào DB mà BE đang kết nối khi đầy đủ
quyền và cấu hình ghi. Chỉ Execute với dữ liệu/chứng từ đã được chọn để kiểm
tra. Trang không tự tạo idempotency key hoặc gửi lại lệnh. Giữ nguyên intent/key
và tra API `/commands/lookup` tương ứng khi chưa xác định được kết quả ghi.

HTTPS và chứng chỉ được tin cậy vẫn cần cho đăng nhập/ghi. Địa chỉ IP dùng
chứng chỉ có SAN IP đúng; thay domain chỉ thay origin/binding/chứng chỉ của
BE. Không đổi kiểm tra TLS, session, CSRF, quyền, chi nhánh hoặc trạng thái.

Trang chỉ sử dụng cùng origin BE. UI chia nhóm và thu gọn các cây schema lớn;
trong bản sao tài liệu dành cho UI, header Origin bị bỏ khỏi ô nhập và các
header do interceptor cấp được để tùy chọn để Swagger không chặn Execute
trước khi cấp token. Header do người thử nhập rõ vẫn được giữ nguyên để BE
kiểm tra. Canonical OpenAPI và yêu cầu của server không thay đổi.

Nguồn/bằng chứng: `src/backend/Medcom.Api/SwaggerDocumentation.cs`,
`Swagger/{index.html,medcom-swagger.js,medcom-swagger.css}`,
`ApiContractCatalog.cs`, `ApiHost.cs`, `AuthEndpoints.cs`,
`WorkspaceReadScope.cs`; HTTP tests ở `SwaggerDocumentationTests.cs`,
`ApiContractCatalogTests.cs`, client tests ở `tests/backend/swagger-ui.test.mjs`
và browser check ở `tests/backend/swagger-ui.browser.mjs`.

Swagger UI được pin bằng `Swashbuckle.AspNetCore.SwaggerUI` 10.3.0 và NuGet
lockfiles; middleware/UI assets được nhúng trong assembly. Giao diện đọc tài
liệu là anonymous static; gọi API vẫn đi qua các guard hiện tại.

Nghiệm thu tài khoản/dữ liệu thật trên VPS: **UNKNOWN** cho tới khi vận hành
cài artifact và thử trên môi trường đích. CI/synthetic tests không chứng minh
CUD production. Các gate nghiệp vụ còn mở của Goal #45 được giữ nguyên.

Kiểm thử local 2026-10-12: build không warning/error, 3.336 BE tests,
11 client tests và browser check đạt; kiểm tra UI assets/contract HTTP cuối
đạt 19 tests. Browser dùng host compiled unconfigured trên loopback, kiểm
tra đủ danh mục, nhóm tạo đơn hàng mua, Execute health, header được cấp tự
động và từ chối scope anonymous/ghi qua HTTP. Không chạy SQL/CUD thật.

CI đầu PR149 (run `38197496469`) vượt budget Windows 20 phút: bộ BE tests
đạt nhưng inspector tests bị hủy ngay khi bắt đầu và thiếu TRX. Budget được
đưa lên 30 phút trong `.github/workflows/ci-policy.yml`; mọi kiểm tra và yêu
cầu artifact vẫn giữ nguyên. Chỉ merge khi CI của head/base hiện tại đạt.
