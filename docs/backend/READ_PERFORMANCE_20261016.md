# Kiểm tra độ trễ đọc dữ liệu — 16/10/2026

## Tiếp tục tối ưu sau lần triển khai I96 — I97 / PR #166

Đợt đo I96 trên VPS sau triển khai gồm 174 request đã đăng nhập, tất cả HTTP 200: trung vị options 1295,2 ms, danh sách 1329,8 ms, chi tiết 1511,4 ms và CSRF 9,0 ms. Riêng bước xác thực khoảng 590 ms. Bằng chứng tổng hợp: [kết quả đo PR #165](https://github.com/thanhtuyen662002/Medcom/pull/165#issuecomment-6213180195); không suy ra đã đo tất cả API hoặc toàn bộ đường FE/BFF.

I97 giảm các lượt SQL nối tiếp để đọc người dùng/quyền/chi nhánh. Phần quyền Đề nghị mua hàng được lọc sớm bằng đúng mã màn hình trước khi áp dụng các điều kiện quyền cũ. Các API danh sách, chi tiết và tên tham chiếu cũng dùng chung một batch đọc người dùng/chi nhánh, tránh đọc trùng. Quyền vẫn được đọc mới từ DB; các kiểm tra tài khoản, nhóm, chi nhánh, trạng thái, concurrency và quyền khi ghi vẫn giữ nguyên. Bằng chứng mã: `SqlLegacyUserStore.FindAsync`, `SqlIdentityCapabilities`, `SqlNativeIdentity`, `ErpSqlAuthority.ReadUser`, `SqlReferenceData.Authority`.

| Đo thành phần từ máy kiểm thử tới MedData | Trước I97 | Sau I97 |
|---|---:|---:|
| Đọc thông tin người dùng, quyền và chi nhánh; trung vị 12 lượt sau lượt đầu | 639,4 ms | 172,7 ms |
| Chỉ đọc quyền chi nhánh; trung vị sáu đối chiếu | 62,8 ms | 26,6 ms |

Cả 18 đối chiếu trên sáu người dùng (ba chi nhánh cố định, ba chọn từ danh mục) trả cùng kết quả quyền/chi nhánh; 39 ca SQL với bảng tạm và dữ liệu giả lập cũng đạt. Đây là số đo thành phần, không phải thời gian API trên VPS. Không kết luận đã đạt dưới 100 ms. Chi tiết, giới hạn và định danh bằng chứng: `inventories/backend/20261016/native-auth-performance.json` và `docs/execution/checkpoints/I97_NATIVE_AUTH_BATCHING_20261016.md`.

Chỉ cần redeploy BE từ main sau khi PR #166 được merge. FE tiếp tục gọi các API hiện tại; không cần đổi route, request, response, DB schema hoặc fingerprint. Sau triển khai cần đo lại API có đăng nhập trên VPS bằng `Server-Timing` như hướng dẫn bên dưới. Các tên bước đo chỉ dùng cho vận hành, không đưa lên giao diện nghiệp vụ.

## Bằng chứng và thay đổi của I96

Yêu cầu: kiểm tra options và các API đọc mất trên hai giây; mục tiêu mới của chủ hệ thống là **mọi lần FE gọi API đều dưới 100 ms**. Mục tiêu này **chưa được nghiệm thu**. Không thay thế yêu cầu đó bằng thời gian SQL, thời gian một hàm, trung bình hoặc p95. Chưa có phép đo toàn bộ API bằng phiên đăng nhập trên VPS sau khi triển khai bản sửa này.

## Kết quả xác minh

| Phạm vi đo | Kết quả | Giới hạn |
|---|---|---|
| POST options chưa đăng nhập, gọi trực tiếp BE công khai | HTTP 401, khoảng 69 ms | Không đọc dữ liệu nghiệp vụ, không chứng minh tốc độ options khi đăng nhập |
| `/health/live`, gọi trực tiếp BE công khai | HTTP 200, khoảng 128 ms | Một mẫu gồm đường truyền/TLS; bản thân mẫu này đã vượt 100 ms |
| Trao đổi SQL đơn giản từ máy audit tới DB hiện tại | Khoảng 27–39 ms mỗi lượt | Không phải đường truyền VPS → DB |
| Metadata năm nhóm tham chiếu, hai lượt đo sau lượt đầu | Tách: 156,1 / 137,7 ms; gộp: 35,1 / 30,5 ms | Chỉ một bước trong API; giữ nguyên kết quả kiểm tra |
| Cấu trúc bắt buộc của 19 màn hình trên DB hiện tại | 19/19 qua kiểm tra sau sửa tương thích độ dài chuỗi | Không phải kiểm thử dữ liệu/role/nghiệp vụ trên VPS |

Nguồn số đo đã lược dữ liệu: `inventories/backend/20261016/read-performance.json`. Bằng chứng riêng tư gồm thời gian và metadata; không đưa dòng nghiệp vụ, credentials, nội dung file hay SQL nguồn vào kho công khai. `docs/SOURCE_BASELINE.md` giữ nguyên định danh các archive Library; không tuyên bố đã tải lại hoặc băm lại archive trong lần này.

## Các nguyên nhân xác định từ mã và phép kiểm tra

1. Cookie của POST chỉ đọc từng gọi `ResolveAsync`, nên các dropdown cùng phiên phải xếp hàng xác thực. Provider màn hình và provider lấy tên lại gọi `ResolveAsync` cho cùng request. Mỗi lượt xác thực đầy đủ đi qua `SqlLegacyUserStore.FindAsync` và truy vấn phân quyền/chi nhánh. Bằng chứng: `ApiHost.cs`, `NativeReadSession.cs`, `SqlLegacyUserStore.cs`, `LocalWebSessions.cs`.
2. Cấu trúc từng section màn hình và từng nhóm tên ID được kiểm tra bằng các lượt SQL riêng. Độ trễ mạng bị cộng vào từng lượt. Bằng chứng: `SqlErpScreenReader.SchemaMatches`, `SqlReferenceData.ReadAsync/Shape`, phép đo SQL chỉ đọc nêu trên.
3. Options hiện đọc nguồn lựa chọn có giới hạn, lọc/sắp xếp rồi mới cắt trang. Nguồn lớn hoặc procedure phức tạp vẫn có thể chậm. Chưa thay đổi cách phân trang này vì phải giữ cách lọc chi nhánh, thứ tự và lựa chọn của ERP. Bằng chứng: `SqlErpScreenLookups.Choices/OptionsAsync`, `ErpLookupSql`.
4. Chi tiết chứng từ đọc snapshot phục vụ kiểm tra trạng thái/concurrency rồi đọc trang trả về. Dữ liệu nhiều dòng làm tăng chi phí; chưa kết luận đây là nguyên nhân chính trên VPS. Bằng chứng: `SqlErpScreenService.DetailAsync`, `SqlErpScreenReader.Snapshot`.
5. FE hiện lấy CSRF bằng một HTTP GET riêng trước mỗi `erpPost`, kể cả options. GET này trước đây lại xác thực DB dù chỉ cấp token và đã là endpoint công khai. Bằng chứng đọc mã FE: `apps/medcom-sites/lib/erp/erp-screen-api.ts:getCsrfToken/erpPost`; BE: `AuthEndpoints.Map`, cookie events trong `ApiHost.cs`. Không sửa FE. Chưa đo tổng thời gian hai request này trên VPS.

DNS công khai của BE và máy DB dùng cho audit hiện trỏ tới hai địa chỉ khác nhau. Điều này không đo được RTT từ VPS tới DB và không xác nhận cấu hình kết nối của process IIS đang chạy. Cấu hình audit đang bật connection pooling; chưa có bằng chứng pooling bị tắt trên VPS.

## Thay đổi BE

- Endpoint POST chỉ đọc được đánh dấu từ lúc đăng ký route. Cookie có thể dùng chung một lần quan sát quyền đang chạy với các request đọc đồng thời; các provider tiếp tục kiểm tra quyền/chi nhánh native trong giao dịch. Không có cache quyền theo TTL. Request kế tiếp vẫn xác thực lại.
- Provider POST chỉ đọc dùng kiểm tra sống cục bộ sau lần xác thực cookie, tránh xác thực đầy đủ lặp lại. Header/body/tên đường dẫn không tự tạo được dấu đánh dấu này; các lệnh ghi tiếp tục admission riêng.
- Riêng endpoint công khai cấp CSRF được đánh dấu từ đăng ký route: chỉ kiểm tra phiên còn sống để gắn token với đúng danh tính, không hỏi DB lấy quyền. Token không cấp quyền ERP. Request dữ liệu/lệnh ghi tiếp theo vẫn xác thực DB; tài khoản bị từ chối hoặc phiên hết hạn không thể dùng token để đọc/ghi. Các endpoint `/api/auth/session`, workspace và nghiệp vụ không dùng tối ưu này.
- Gộp kiểm tra các section của một màn hình thành một SQL batch; gộp metadata các nhóm tham chiếu thành một batch khác. Vẫn kiểm tra đủ kiểu, nullability, identity/computed, độ chính xác số và số result set.
- DB hiện có `dbo.AR_OrderTbl.AddressA/AddressB` là `nvarchar(max)`, trong khi cấu trúc đã lưu là `nvarchar(200)`. Chấp nhận mở rộng độ dài `varchar/nvarchar` vì vẫn giữ hợp đồng kiểu chuỗi. Thu hẹp dung lượng, đổi kiểu và đổi độ dài kiểu cố định vẫn bị từ chối. Giới hạn input ghi và schema API giữ nguyên.
- Thêm `Server-Timing`: `auth`, `provider`, `references`, `be`. Các giá trị là millisecond. `be` đo tới lúc gửi header; thời gian FE nhận xong body còn gồm truyền dữ liệu và BFF. Các bước con không bao phủ mọi phần của `be`.
- Request BE từ hai giây có log `SlowBackendRequest` / EventId `1120`, gồm correlation, module hữu hạn, status, thời gian và các bước. Log không chứa query string, SQL, credentials, danh tính hay dòng dữ liệu.

Route, request body và response JSON hiện tại giữ nguyên. Đây là số đo cho DevTools/log vận hành, không phải nội dung hiển thị trên màn hình ERP. Không sửa FE, cấu hình VPS, schema DB hoặc automation. Không cần ZIP, migration hay cập nhật fingerprint.

## Cách kiểm tra sau redeploy

1. Redeploy BE từ main, đăng nhập và thực hiện cùng thao tác trên FE; ghi method, route, page/pageSize, số lần gọi và Duration trong Network. Không chia sẻ cookie, CSRF token, mật khẩu hoặc body dữ liệu thực.
2. Đối chiếu `X-Correlation-ID` với log BE. `auth` cao cho biết thời gian xác thực/chờ xác thực; `provider` cao cho biết xử lý dịch vụ/SQL; `references` cao cho biết tra cứu tên ID. Các số đo phải được đọc cùng nhau.
3. BFF có thể chỉ chuyển một danh sách header cho phép. Nếu Network của FE chưa có `Server-Timing`, xem request trực tiếp tới BE hoặc log IIS/BE; đội FE có thể chuyển tiếp header này trong proxy. Điều này không cần thiết để các API tiếp tục hoạt động.
4. Đo sau khởi động và khi đã chạy ổn định, từng request và nhiều dropdown đồng thời, với role/chi nhánh hợp lệ. So sánh cả BE trực tiếp và đường FE → BFF → BE. Ghi các lần vượt 100 ms; chưa đủ dữ liệu thì ghi UNKNOWN.

Để nghiệm thu toàn bộ theo yêu cầu dưới 100 ms cần số đo có đăng nhập trên chính VPS, thông tin tải/RTT tới DB, kích thước response và đường BFF. Các số đo thành phần ở trên không đủ để tuyên bố đã đạt.
