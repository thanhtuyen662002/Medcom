# I19 — Purchase intent lookup / bàn giao Mika

**Trạng thái: candidate source; chưa nghiệm thu implementation bằng .NET hoặc SQL thật.**

Ngày bàn giao: 2026-10-06. Repository: `thanhtuyen662002/Medcom`.
Base cố định: `b283d057615120ad9b3f96abfc1e7259cb725e09`.
PR71 chỉ được dùng làm ngữ cảnh admission; không được tính là implementation đã hoàn tất.
Checkpoint này được tạo mới vì người dùng xác nhận thiếu checkpoint và đã gửi đủ bốn file C# local.
Không có source/lịch sử nào được lấy từ laptop. HEAD của checkout local **NOT_SUPPLIED**;
không gán một SHA tự tạo cho bản local hay candidate này.

## R1 — sửa phản ví dụ Save Remove rồi Add tái sử dụng ID (2026-10-06)

Revision này tiếp nối **đúng candidate đã bàn giao**, không quay về bốn file local cũ:
`Medcom_I19_PR71_candidate_b283d057.zip`, SHA-256
`7c64fbefe3bfad9c7756f355cca993626da4447cd181901ba1d8cfe98f6e393a`.
Cả năm file trong `files/` của archive đó khớp manifest trước khi sửa.
Base repository giữ nguyên `b283d057615120ad9b3f96abfc1e7259cb725e09`.
Không có commit/HEAD mới được tạo; không coi SHA-256 archive là commit SHA.

Mika chỉ ra một false rejection trong candidate trước: Save có `Remove(L)` rồi
`Add(K)` với mapping allocator `K -> L` được writer hiện hữu chấp nhận, nhưng
lookup vừa cấm ID overlap vừa yêu cầu L phải vắng trong receipt. Hai phép kiểm tra
độc lập ấy áp nhầm trạng thái trung gian lên kết quả cuối. R1 chỉ sửa block effect
trong `LookupReceiptMatches`; toàn bộ implementation ngoài method này giữ nguyên
byte, bao gồm `Start`, `Run`, `ValidateIdentifiers`, `ValidateChanges`, `BuildDesired`,
SQL reads, key/intent, mapping guards, strict readers và authority/session fences.

Effect được xét theo đúng thứ tự writer: các ID của Update/Remove được biết là
đã tồn tại ở prestate do `ValidateChanges`; Remove giải phóng ID, Add có thể sử
dụng ID vừa giải phóng, và effect cuối cho ID ấy là values của Add. Receipt chỉ
phải khớp **effect cuối của mỗi ID bị tác động**, không phải mọi trạng thái trung
gian. Vẫn chặn Add vào ID được biết đang tồn tại, đúng kiểm tra collision của
`BuildDesired`; không tự sắp Remove lên trước Add. Không thêm quy tắc cấm tái sử
dụng ID, không đổi allocator hoặc ghi số tự chế. Preimage của dòng không đề cập
trong DTO vẫn không thể suy ngược đầy đủ từ token, như giới hạn ở mục 4.

**Regression C# mới: 13 case tính theo source, tất cả NOT_RUN.** Hai case thuận
cùng helper `WriteSaveWithReusedLineId` gọi `SaveAsync` thật của production class
trên recording provider không đổi, với `ExactTestAllocator` trả `line-1` cho
`replacement-client`. Assertion đòi writer Committed, DELETE trước INSERT cùng ID,
receipt/intent/aggregate thực nằm trong journal và dòng không sửa được bảo toàn.
Sau đó lookup phải trả receipt gốc; một case thực hiện thêm Save no-Add có chủ ý
trước lookup để kiểm tra snapshot lịch sử. Cả hai dùng `LookupWire`/allocator ném
lỗi để bắt nonquery/scalar/commit/qualification/allocation, so snapshot business/
journal/counters và chỉ cho phép các SELECT đã có. Đây là test source, chưa phải
bằng chứng production class đã thực chạy trong sandbox.

Mười case âm kiểm tra mất dòng cuối, values cũ, mapping thiếu/sai client/sai line/
trùng, KeyBytes/IntentBytes bị nối byte, mất quyền Update và logout. Một case thứ
tự ngược vừa đòi writer từ chối Add-trước-Remove, vừa tạo journal giả có intent,
aggregate và token tự khớp để lookup vẫn chặn; không dựa vào Conflict do sai intent
để che một lỗi effect. Không sửa hoặc bỏ bất kỳ test cũ nào.

### Kết quả thực chạy của R1

| Kiểm tra | Kết quả |
|---|---|
| Python đối chiếu source/delta, hash predecessor, bảo toàn writer/guards/test cũ | **PASS 14/14** ở lần cuối; không phải compile/xUnit |
| Python mô hình thuần về ordered effect | **PASS 6/6**; 565 chuỗi được writer-model chấp nhận, 242 có tái sử dụng ID, 1.792 phép thay đổi effect cuối bị chặn |
| Delta apply-check/apply/so khớp byte/reverse trên snapshot candidate trước | **PASS**, log trong gói evidence R1 |
| `dotnet --info` | command not found, exit 127 |
| C# compile/analyzer/xUnit — 229 case cũ + 13 mới = 242 case tính theo source | **NOT_RUN**, không có test discovery hoặc xUnit PASS |
| SQL/allocator thật, runtime concurrency/durability, CI/HTTP/điện thoại | **NOT_RUN** |

Mô hình Python là một bản diễn giải logic độc lập, không chạy C#, SQL, journal,
allocator, quyền hoặc timing. 565 chuỗi trên là miền hữu hạn để kiểm tra lý luận,
không phải chứng minh lịch sử bất kỳ hoặc hành vi provider/allocator thật.
Lần chạy source-check trong khi đang sửa có **13 PASS / 1 FAIL** vì checkpoint chưa
được cập nhật nên tập file thay đổi mới có hai file; sau khi cập nhật checkpoint,
chạy lại cùng script đạt 14/14. Giữ cả log ban đầu và cuối, không thay assertion.
Không có kết quả FAIL/PASS C# nào được suy ra từ những log Python này.

**Không có bằng chứng allocator thật sẽ tái sử dụng ID.** Regression chỉ đặt output
synthetic hợp lệ theo contract hiện hữu để kiểm tra lookup tương thích writer.
Không kết nối DB, đọc secret config, chạy DLL, bỏ TLS, push/merge/deploy trong R1.

Gói source R1 có đúng năm file theo đường dẫn repository; Contracts/Application
không đổi byte so với candidate trước. Delta `I19-candidate-to-R1.diff` đổi ba file:
Infrastructure, test được phép và checkpoint này. Evidence/manifest không phải
file cần áp vào repo. Các đường dẫn `uploaded/`, `base/`, main/local diff và kết quả
28 source-check ở các mục lịch sử bên dưới thuộc **gói predecessor**, không phải
các lần chạy mới của R1. Áp delta theo mục 8, không áp lại main/local patch cũ.

## 1. Nguồn và phạm vi đóng băng

Bốn tệp đính kèm được giữ nguyên byte trong `uploaded/` của gói bàn giao. Chúng có
line ending trộn CRLF/LF; bản giao trong `files/` thống nhất LF. Phần I19 đã có trong
local được giữ và gia cố, không bị thay bằng marker PR71 hoặc viết lại từ main.

Đối chiếu nguồn main theo đúng phạm vi: loại riêng phần bổ sung I19 khỏi bản local,
chuẩn hóa line ending theo main và kiểm tra **Git blob SHA-1 của toàn bộ byte** với
metadata GitHub tại base cố định. Cả bốn blob đều khớp. Đây là snapshot theo phạm vi,
không phải tuyên bố đã clone/build toàn repository.

| File | Git blob trên base |
|---|---|
| `src/backend/Medcom.Contracts/PurchaseRequests.cs` | `d66dedfe49c24ef01539068f9ae10534ceacb6df` |
| `src/backend/Medcom.Application/PurchaseRequests/PurchaseRequestCommands.cs` | `a32a3401d8fd3c4b45ec8c4d6dd65fae5940be7a` |
| `src/backend/Medcom.Infrastructure/PurchaseRequests/SqlPurchaseRequestCommands.cs` | `0a9f22af234606af412ebf265292f72e26a282a1` |
| `tests/backend/Medcom.Api.Tests/PurchaseRequestCommandTests.cs` | `bcd252e71cc359d3f4c8f58a3177d0cd252e08ae` |

SHA-256 của byte local nhận được:

| File | SHA-256 |
|---|---|
| `PurchaseRequests.cs` | `820418f17a8c206db65841de84a2d7fb81834dd9694c4697e6e239e4d2da99e8` |
| `PurchaseRequestCommands.cs` | `3aae8838eb1e774e2827f17eac546d86d515834ecc698751c4576618fcdeab5b` |
| `SqlPurchaseRequestCommands.cs` | `9e44f22d7ca543586d52cd24cb41a7a3d984ec52d57f2cfebc17bbbf76615500` |
| `PurchaseRequestCommandTests.cs` | `400c96f1ba388b0c16c1b5f66fa5b60fb5510825209abe2456e450dc117532b6` |

Chỉ năm đường dẫn sau có thay đổi trong patch chính; bản sao/evidence nằm ngoài
các đường dẫn cần áp vào repository:

```text
src/backend/Medcom.Contracts/PurchaseRequests.cs
src/backend/Medcom.Application/PurchaseRequests/PurchaseRequestCommands.cs
src/backend/Medcom.Infrastructure/PurchaseRequests/SqlPurchaseRequestCommands.cs
tests/backend/Medcom.Api.Tests/PurchaseRequestCommandTests.cs
docs/execution/checkpoints/I19_PURCHASE_INTENT_LOOKUP.md
```

Không sửa `docs/execution/direct-runs/I19.json`, `PurchaseRequestSql.cs`,
`PurchaseRequestSqlTests.cs`, schema, route, DI, BFF, FE, cấu hình hay workflow.
Các dependency SQL/recording fixture và project properties đã được đọc ở base
cố định qua GitHub chỉ để đối chiếu; không thay chúng trong candidate.

## 2. Contract lookup giữ nguyên ý định gốc

Ba overload của `IPurchaseRequestCommands` và implementation nhận đúng DTO gốc:

```csharp
Task<PurchaseRequestLookupResult> LookupAsync(CreatePurchaseRequestDraft originalIntent, CancellationToken token = default);
Task<PurchaseRequestLookupResult> LookupAsync(SavePurchaseRequestDraft originalIntent, CancellationToken token = default);
Task<PurchaseRequestLookupResult> LookupAsync(SubmitPurchaseRequest originalIntent, CancellationToken token = default);
```

`PurchaseRequestLookupOutcome` / `PurchaseRequestLookupResult` tách biệt với
outcome/result ghi. Các DTO ghi, `Freeze`, `IntentBytes`, `Normalize`, `EqualityToken`
được giữ nguyên so với main. Toàn bộ body `Start` và `Run` của writer cũng giữ nguyên.
Helpers đọc có thêm tham số `strict=false`; chỉ lookup bật `strict:true`, không
đổi mặc định của luồng ghi I14. Không thêm endpoint HTTP.

`StartLookup` freeze/copy collection trước await, dùng chính canonicalization của
lần ghi. `Submitted.Create/Save/Submit` ở đây chỉ là builder thuần tạo giá trị
canonical, không phải command ghi. Không gọi `CreateAsync`, `SaveAsync`,
`SubmitAsync`, `Start`, `Run`, allocator hay đường reserve/complete từ lookup.
So sánh intent là **toàn bộ canonical bytes của DTO đã Freeze**, không phải raw
JSON trên mạng và không phải tự dựng DTO từ phiếu hiện tại. Ví dụ `15` và `15.00`
được xử lý theo quy tắc decimal I14; `null` và chuỗi rỗng không bị tự đồng nhất.

## 3. Đường đọc và các cổng bảo vệ

Luồng `Observe` từ chối ambient transaction, đòi connection thuộc quyền sở hữu ở
trạng thái Closed rồi mới mở transaction SERIALIZABLE của riêng lookup. Transaction
chỉ được nhận sở hữu khi báo đúng connection; transaction thuộc owner khác không
bị rollback/dispose bởi lookup. Connection đã Open từ trước cũng không bị đóng.
Luồng kiểm
tra live identity, tenant/company, credential stamp, authority version, chi nhánh,
quyền native tương ứng action ban đầu, runtime qualification, schema/database
binding và tình trạng transaction. Lookup không hỏi cả `IsQualified` của allocator.

Key tiếp tục là toàn bộ tuple length-framed I14 gồm binding, tenant, company,
actor, branch, action và idempotency key. SHA-256 chỉ định vị slot; hàng đọc về
vẫn phải khớp toàn bộ binding, slot và KeyBytes. IntentBytes được so sánh đầy đủ;
không dùng digest thay thế cho kiểm tra nội dung hay bỏ phần byte đuôi.

Các SQL selector có thể tới được từ lookup chỉ là các selector đọc có sẵn:
`CredentialText`, `GrantsText`, `BranchesText`, `ProbeText`, `TransactionText`,
`LookupText`, `HeadText`, `DetailsText`. Không tạo GUID attempt, giữ custody,
reserve/complete journal, gọi allocator, DML, EXEC hay COMMIT trong lookup.
Transaction chỉ ROLLBACK và dispose để giải phóng tài nguyên.

Đây là SELECT-only theo call path, **không có nghĩa là không lấy lock**. SQL I14
hiện hữu vẫn chứa `UPDLOCK/HOLDLOCK` và có thể chờ/chặn cạnh tranh. Không thay lock
hint, timeout 5 giây của command factory hay isolation trong phạm vi này. Hành vi
blocking/range-lock thực tế cần kiểm chứng trên SQL Server được cấp phép riêng.

Chế độ strict kiểm tra field count/type và không chấp nhận result set dư của các
reader dùng bởi lookup. Reader trống nhưng sai shape/extra result không được xem
là `Absent`. Binding/probe không hợp lệ trả `QualificationRequired`; lỗi đọc,
provider timeout hoặc dữ liệu journal hỏng không biến thành `Absent`.

Authority và transaction được kiểm tra lại cả đối với các quan sát âm tính.
Sau rollback/dispose, live session còn được resolve lại trước khi trả một quan
sát, nhằm chặn logout/cancel xảy ra trong await cleanup. Cleanup lỗi không phát
receipt hoặc `Absent`. Session resolver đang chờ được bọc `WaitAsync(token)`;
việc hủy chờ không phải bằng chứng invocation ghi gốc bị hủy.

Quyền SQL chỉ được xác minh tại native-authority fence trước khi đóng transaction;
đây **không phải lease quyền đến lúc điện thoại nhận response**. Thu hồi quyền
sau fence/cuối response vẫn là giới hạn điểm-thời-gian, không được tuyên bố đã
loại bỏ hoàn toàn race authorization với việc chuyển giao qua mạng.

## 4. Receipt lịch sử hợp lệ và dữ liệu hỏng

`Committed` chỉ được tạo với receipt từ journal đã qua toàn bộ cổng lookup:
key/intent/action/document/branch khớp, state/attempt hợp lệ, StateToken tự khớp
receipt, và AggregateBytes khớp đúng canonical document của receipt.

Bổ sung so với bản local nhận được:

- JSON phải có đầy đủ, duy nhất, đúng tên property ở mọi cấp; chặn trường thiếu,
  lặp, alias khác hoa/thường, kiểu sai, null document và shape không hợp lệ.
- Kiểm tra đầy đủ `AllocatedLines`: không null, đúng tập ClientLineKey yêu cầu,
  không trùng client key/line ID, ID hợp lệ. Mapping được đưa vào mô phỏng effect
  theo thứ tự writer; receipt phải chứa đúng values cuối của mỗi ID còn lại.
- Kiểm tra status/lock/header và các effect có thể chứng minh từ DTO: toàn bộ dòng
  của Create, Update/Remove/Add của Save, không có allocation của Submit; Submit
  còn đối chiếu prestate token với draft lock false/null trước transition.
- Receipt có aggregate/token được tính lại nhưng effect sai intent vẫn bị chặn.
  Không âm thầm normalize để sửa một receipt hỏng thành receipt hợp lệ.

Sau đó đọc phiếu hiện tại trong scope cho phép để xác minh physical master identity,
branch và các physical FK relation; giữ nguyên các guard chống alias I14. Phiếu
không còn đọc được/sai scope hoặc dữ liệu hiện tại hỏng thì không tiết lộ receipt.
**Không so trạng thái hiện tại với ExpectedStateToken cũ hoặc receipt cũ.** Một
lần sửa tiếp hợp lệ không xóa bằng chứng của commit ban đầu; lookup trả snapshot
receipt gốc, không dựng receipt mới từ dữ liệu hiện tại.

Các cổng này kiểm tra tính nhất quán trong journal tin cậy; journal không được
biến thành chữ ký mật mã chống người có quyền sửa đồng bộ journal. Với Save,
preimage của mọi trường không được lưu trong DTO/journal hiện hữu, nên không thể
chứng minh độc lập toàn bộ lịch sử từ hash/token. Không thêm schema hay hứa
phát hiện delete/reinsert ABA hoặc monotonic history; EqualityToken vẫn chỉ là
state equality như I14.

## 5. Numbering: giữ phân biệt có/không thêm dòng

Writer vẫn dùng `NeedsAllocation = Creates || có LineChangeKind.Add`.
Save chỉ sửa header/Update/Remove và Submit không hỏi allocator, không cấp ID mới.
Create (kể cả không có dòng) hoặc Save Add vẫn cần allocator qualified và phải dùng
đúng ID trả về. Không tự chế số chứng từ, chuỗi PO, số detail hay suy đoán thuật toán ERP.

Test local no-Add được tăng cường bằng allocator ném lỗi ở cả `IsQualified` lẫn
`AllocateAsync`. Test mới cho Create/Add dùng ID synthetic được trả nguyên vẹn từ
allocator test để phát hiện việc tự dựng lại ID. Đây là source test, **NOT_RUN**;
không phải chứng cứ numbering/durability/uniqueness thật.

## 6. Bằng chứng lượt predecessor (lịch sử; kết quả R1 ở đầu checkpoint)

| Kiểm tra | Kết quả lịch sử của predecessor |
|---|---|
| 28 kiểm tra Python về source/provenance/scope/guards | **PASS: 28/28**, FAIL: 0 ở lần cuối |
| Đối chiếu 4 Git blob main, bảo toàn 4 byte upload gốc | **PASS**, nằm trong 28 kiểm tra trên |
| Bảo toàn body các test main, body Start/Run, DTO ghi và canonicalization | **PASS** ở mức đối chiếu source, nằm trong 28 kiểm tra |
| Main/local patch apply-check, apply, so byte và reverse trên snapshot sandbox | **PASS**, xem `evidence/patch-checks.txt` |
| .NET SDK availability | `dotnet --info` không chạy được: command not found, exit 127 |
| C# compile, analyzer và xUnit `PurchaseRequestCommandTests` | **NOT_RUN** |
| Full backend regression / exact-head-base CI / independent review | **NOT_RUN** |
| SQL thật, schema apply, allocator thật, concurrency/durability thật | **NOT_RUN** |
| HTTP/API/BFF/FE/điện thoại / production acceptance | **NOT_RUN** |

Lần kiểm tra tĩnh đầu tiên: **27 PASS / 1 FAIL** do harness đếm nhầm phải có 8
call site `strict:true`; code có đúng 7 call site (bao gồm TransactionValid hai
lần). Harness được sửa thành kiểm tra danh sách chính xác từng call site, không
bỏ kiểm tra. Log đầu được giữ ở `evidence/source-checks-initial.txt`; log cuối ở
`evidence/source-checks.txt`. Không có kết quả C# FAIL/PASS nào được suy ra từ log này.

Python checks là kiểm tra source-policy và delimiter, **không phải C# compiler**,
không chạy business logic, không chứng minh race/authorization/SQL bằng runtime.
File xUnit của predecessor có 229 test case tính theo source (25 Fact, 149 InlineData,
40 reader MemberData và 15 cleanup MemberData): 51 case main, 76 case I19 local
đã nhận, thêm 102 case ở candidate. Đây không phải số case được test runner discover
hay thực thi. Toàn bộ **229 case xUnit của predecessor: NOT_RUN** trong lượt trước; R1 có thêm 13 case, cũng NOT_RUN.

Nhóm assertion xUnit đã có trong source: receipt gốc sau sửa tiếp; lost commit ACK;
zero business writes/allocator qualification/allocation/reservation/completion/commit;
hai race Absent rồi invocation gốc reserve (Pending hoặc commit tiếp); key/intent
bytes hỏng; malformed receipt và allocated mappings; native/physical alias;
tenant/company/actor/branch/binding đổi; revoke/logout trước/sau đọc và trong
cleanup; cancel trước IO, giữa read, resolver chờ; timeout ở từng SELECT; extra
result/malformed empty reader; no-Add/Submit và Create/Add numbering.

Để nghiệm thu runtime, Mika cần dùng checkout đầy đủ tại base đã chốt + patch,
SDK/dependency cache đã được xác minh, và review fixture/build hooks trước khi chạy.
Project base dùng `net10.0` và TreatWarningsAsErrors. Lệnh mục tiêu trên môi trường
synthetic được cô lập, không nạp private configuration hoặc legacy DLL:

```sh
dotnet build tests/backend/Medcom.Api.Tests/Medcom.Api.Tests.csproj --no-restore -c Release
dotnet test tests/backend/Medcom.Api.Tests/Medcom.Api.Tests.csproj --no-build --no-restore -c Release --filter 'FullyQualifiedName~Medcom.Api.Tests.PurchaseRequestCommandTests' --logger 'trx;LogFileName=I19-purchase-lookup.trx'
```

Các lệnh trên **chưa chạy** trong lượt này. Không tự tải package/SDK không xác minh,
bật runtime, thay assertion để qua test, bỏ kiểm tra TLS hoặc dùng DB thật để bù
cho môi trường thiếu SDK. Chưa có bằng chứng build cho các thay đổi helper strict.

## 7. Hợp đồng FE sử dụng lookup (không triển khai FE trong I19)

FE giữ bất biến DTO ban đầu, idempotency key, action và ngữ cảnh gốc được xác thực
(actor/tenant/company/branch/database binding); không dựng lookup từ form đã sửa.
Không thêm actor/binding tùy ý vào DTO: các giá trị này phải tiếp tục đến từ ngữ
cảnh server tin cậy. Một lookup dưới tài khoản/action/key khác không đối soát thay
cho invocation gốc, dù nó nhận `Absent`.

| Kết quả | Quy tắc FE |
|---|---|
| `Committed` + receipt gốc hợp lệ | Xác nhận ý định ban đầu đã commit. Snapshot receipt có thể cũ; đọc lại phiếu hiện tại trước một ý định chỉnh sửa mới có chủ ý. |
| `Pending` | Giữ trạng thái kết quả chưa biết và DTO/key gốc. Không resume/takeover invocation. |
| `Absent` | Chỉ biết lần đọc không thấy slot. Invocation gốc có thể chưa reserve rồi reserve sau. Không kết luận thất bại. |
| `Unavailable`, `QualificationRequired` | Không xác định được kết quả. Không coi lỗi hạ tầng/cổng qualification là cho phép ghi lại. |
| `Cancelled`, timeout/mất phản hồi lookup | Hủy/hỏng lần kiểm tra, không chứng minh đã hủy lần ghi ban đầu. |
| `Denied`, `Conflict`, `InvalidInput` | Chặn, không nhận receipt. Giữ trạng thái chưa đối soát; giải quyết quyền/ngữ cảnh/input thay vì tự sửa DTO/key rồi gửi ghi lại. |

**Mọi trạng thái không phải Committed hợp lệ đều không cấp quyền gửi lại thao tác
ghi, tạo intent mới thay thế hay đổi idempotency key.** FE có thể kiểm tra lại bằng
lookup đúng DTO/ngữ cảnh sau khi khôi phục kết nối/quyền; các lần đó vẫn chỉ đọc.
Logout phải bỏ receipt khỏi màn hình/ngữ cảnh cũ và giữ unresolved intent theo ranh
giới phiên/người dùng an toàn; không mang receipt sang tài khoản mới.

API/BFF route chưa thay đổi: các overload C# không có nghĩa điện thoại đã gọi được
endpoint. Wiring HTTP và tích hợp FE cần phạm vi được duyệt riêng.

## 8. Cách áp gói và các cổng còn mở

`I19-candidate-to-R1.diff` là delta từ năm byte file trong `files/` của candidate
archive có hash ở đầu checkpoint, **không phải patch trực tiếp từ main**. Dùng
`git apply --check I19-candidate-to-R1.diff` trước khi áp. Diff dùng chính các đường
dẫn repository, không có prefix `files/`. Không áp delta này lên bốn file local
ban đầu hoặc worktree đã thay đổi khác mà chưa đối chiếu. Gói source R1 chứa đủ
năm file, trong đó hai file contract/application được giữ nguyên để bàn giao trọn
bộ. Manifest có SHA-256 predecessor và R1 cho từng file để kiểm tra byte.

Các main/local patch nêu trong lịch sử predecessor không được áp nối tiếp lên
candidate đã có I19. Evidence/scripts/log nằm ngoài năm đường dẫn repo và không
được copy vào repo như implementation. R1 chưa được commit hoặc gán HEAD mới.

Mika giữ quyền review/xuất bản. Candidate chưa được push, merge, deploy, chạy CI
hay gán HEAD mới. Không đọc secret config, kết nối DB thật, chạy DLL, áp schema,
đổi TLS/chứng chỉ/quyền mạng hoặc thay lịch automation trong lượt này.

Các cổng còn mở: compile/analyzer/xUnit .NET thực; independent review; exact
candidate/main CI; qualification database/numbering; SQL catalog rendering và
query syntax thực; unique/range lock và contention; provider timeout/cancel/cleanup;
crash durability/commit ACK; restore/clone binding; native permission revocation
và session integration; API/điện thoại. Không có tuyên bố nghiệm thu SQL thật hoặc
production. Hash/manifest và source-only PASS không thay thế những cổng đó.
