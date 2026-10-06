# Kiểm tra Medcom chỉ đọc

Dùng gói đã biên dịch `medcom-target-inspector-windows` từ đúng phiên bản CI đã được
kiểm tra. Đối chiếu SHA-256 của ZIP với mã được cung cấp riêng, rồi giải nén vào thư
mục mới, trống. Không chép cấu hình riêng, nhật ký hoặc tệp khác vào gói.

## Chạy một lệnh

Thay đường dẫn `dotnet.exe` bên dưới bằng đường dẫn .NET 10 đã có trên máy:

```powershell
& 'C:/duong-dan-dotnet-da-co/dotnet.exe' 'D:/Config/Medcom-TargetInspect/Medcom.TargetInspect.dll' inspect --config 'D:/Config/appsettings.Private.json'
```

Không cần cài Python/Node, khôi phục NuGet, biên dịch, quyền quản trị, đổi execution
policy hay sửa chứng chỉ. Công cụ tự kiểm tra đủ tệp và mã băm trước khi đọc cấu hình.
Cấu hình giữ nguyên, phải nằm ngoài gói và ngoài Git; đường dẫn tuyệt đối, không qua
symlink/junction. Không đưa mật khẩu hoặc chuỗi kết nối vào lệnh.

Chỉ gửi lại JSON kết quả cuối cùng. Không gửi cấu hình, GUID, định nghĩa SQL, ảnh chứa
thiết lập hoặc thông báo lỗi đầy đủ. Công cụ không ghi nhật ký riêng và không tải lên.

## Đọc kết quả

- PASS: riêng phép kiểm tra được nêu đã đạt. `connection=PASS` chỉ xác nhận mở kết nối.
- FAIL: quan sát được điều kiện không khớp; dừng kiểm định, không tự sửa cơ sở dữ liệu.
- BLOCKED: thiếu đầu vào, thiếu khả năng thấy đầy đủ metadata hoặc chưa chứng minh
  được ngữ nghĩa. Không đồng nghĩa với lỗi kết nối.
- NOT_RUN: chưa chạy hoặc nằm ngoài phạm vi công cụ.

`ReleaseStillBlocked` luôn là true. Đăng nhập/quyền native, session, chứng từ, ghi dữ
liệu, biên nhận, khóa đồng thời, độ bền COMMIT/crash, đánh số và quyền Send vẫn NOT_RUN.
PASS kết nối/catalog không cấp quyền ghi và không tạo RuntimeAcceptance.

Mã thoát: 1 nếu có FAIL; 2 nếu có BLOCKED; 0 chỉ khi các phép đã chạy không còn chặn.
Hiện còn ngữ nghĩa chưa đủ bằng chứng nên kết nối thành công vẫn có thể trả mã 2.

## Thiếu binding hoặc journal?

- `EXPECTED_BINDING_NOT_SUPPLIED`: tùy chọn cung cấp **GUID binding hiện có** từ lần
  cài control đã duyệt trong tệp riêng ngoài gói, dạng
  `{"ExpectedBindingId":"GUID-binding-hien-co"}`. Thêm `--options 'D:/Config/inspect-options.json'`
  vào cuối lệnh. Không tạo GUID mới. Bỏ tùy chọn vẫn kiểm tra catalog; chỉ so khớp
  binding bị BLOCKED. Tệp tùy chọn không nhận SQL, máy chủ, bảng hoặc khóa khác.
- Journal inbound thiếu/không thấy được: kiểm tra mục
  `catalog.columns.WebInboundRequestCommandJournalV1` và quyền xem metadata với chủ
  hệ thống/DBA. Không suy ra “không tồn tại” từ metadata bị ẩn. Công cụ không cài hay
  sửa journal; mọi thay đổi schema cần quyết định riêng.
- `PREDICATE_EQUIVALENCE_UNPROVED`, `DEFAULT_SEMANTICS_UNPROVED` hoặc
  `SOURCE_EXPECTATION_UNAVAILABLE`: cần đối chiếu nguồn và metadata riêng. Không đổi
  constraint/default/trigger/quyền chỉ để nhận PASS.

## Giới hạn an toàn và bằng chứng

Chỉ dùng endpoint phát triển đã có `zmc.bms79.com,17456` / `MedData`. Hai tệp policy
`ServerConfiguration.cs` và `SqlDevelopmentTestTlsTarget.cs` hiện hành được liên kết
biên dịch nguyên trạng; SqlClient khóa phiên bản 7.0.3. Chỉ tái sử dụng ngoại lệ TLS
đúng đích nếu chủ hệ thống **đã bật rõ ràng** trong cấu hình. Không tự bật hoặc mở rộng
ngoại lệ; TLS lỗi thì dừng. Từ chối đích thay thế, failover/read-only routing và biến
môi trường ghi đè Medcom/Legacy/connection strings.

Kiểm tra cố định 161 cột trên 10 bảng purchase/inbound, gồm đủ 17 cột journal inbound,
PK năm phần, BIN2, CreatedAtUtc, key/FK, check/default, trigger/RLS và thiết lập durability.
Chỉ đọc catalog; ngoại lệ duy nhất là tối đa hai hàng control để so binding, không xuất
GUID. Không đọc chứng từ/dữ liệu khách hàng, Tools.dll hay mật khẩu SQL; không tạo web
session, chạy writer, DML/DDL, reservation, allocator hoặc COMMIT.

So predicate là đối chiếu văn bản bảo thủ, không phải bộ chứng minh SQL tương đương.
Ngoặc, toán tử và literal được giữ; chuẩn hóa khác chưa nhận diện vẫn BLOCKED. Catalog
nguồn chưa chứng minh đầy đủ FK/check/default native và các constraint bổ sung purchase.
Riêng default sinh UserAutoID/ThoiGian của log inbound vẫn chưa được kiểm định.

Timeout kết nối/lệnh là 5 giây; ngân sách hủy toàn lượt 60 giây, có thể phụ thuộc phản
hồi của provider/mạng. Không mở transaction hoặc dùng UPDLOCK/HOLDLOCK. Luôn đóng tài
nguyên do công cụ tạo; lỗi đóng có mục riêng. Không đổi quyền để lấy metadata đầy đủ.

Gói framework-dependent chứa DLL đã build, dependency, README và manifest đủ inventory.
Manifest ghi commit/tree **thực sự đã build** và SHA-256 hai policy nguồn, không gắn nhãn
lại thành commit khác. Manifest không phải chữ ký; mã ZIP được xác minh độc lập mới là
mốc tin cậy. Kiểm thử recording/config/package không chứng minh SQL thật hoặc runtime.

Chi tiết kỹ thuật và kết quả chuẩn bị: checkpoint I34 trong repository. CI giữ nguyên
các gate cũ và chạy bộ test inspector riêng; không ghi đè biên nhận test backend.
