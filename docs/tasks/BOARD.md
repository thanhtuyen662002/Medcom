# BOARD — ui-sync (thống nhất giao diện chi tiết chứng từ)

Thiết kế: `docs/architecture/DOCUMENT_DETAIL_UNIFICATION.md` (đã duyệt 2026-10-23).
Nhánh tích hợp: `ui-sync/main`. Thư mục làm việc: `D:/Projects/medcom-wt/<TASK-ID>` (clone cục bộ từ T-002; T-001 dùng git worktree). Log: `.agent-runs/` (gitignored, ở repo chính `D:/Projects/Medcom`).

| Phiếu | GĐ | Nội dung | Agent | Trạng thái | Phụ thuộc | Log |
|---|---|---|---|---|---|---|
| [T-001](T-001.md) | 1 | Hợp đồng config + formatter | Codex | **Done** | — | `.agent-runs/T-001-codex-1.log` |
| [T-002](T-002.md) | 1 | Layout chung `DocumentDetail*` | Codex | **Done** | T-001 | `.agent-runs/T-002-codex-1.log`, `-2.log` |
| [T-003](T-003.md) | 1 | Config + evidence Mua hàng, Nhập kho | Codex (lần 1-2: Antigravity) | **Done** | T-001, T-002 | `.agent-runs/T-003-antigravity-1.log`, `-2.jsonl`, `T-003-codex-3.log` |
| [T-004](T-004.md) | 2 | Chuyển Bán hàng sang layout chung | Codex | **Done** | T-002 | `.agent-runs/T-004-codex-1.log`, `-2.log` |
| [T-005](T-005.md) | 2 | Config điều chuyển, máy, QR | **Codex** (đổi từ Antigravity) | **Done** | T-001, T-003 | `.agent-runs/T-005-codex-1.log` |
| [T-006A](T-006A.md) | 3 | Tách chi tiết generic ra Body riêng (dời nguyên văn), registry đủ 19 module, bỏ đọc trùng | Codex | **Done** | T-003, T-004, T-005 | `.agent-runs/T-006A-codex-1.log`, `-2.log` |
| [T-006B](T-006B.md) | 3 | Thay JSX generic cũ bằng `DocumentDetailView` + config; xóa `FIELD_LABELS`/`getFieldLabel`; gỡ ngoại lệ lint | Codex | **Done** | T-006A | `.agent-runs/T-006B-codex-1.log`, `-2.log` |
| [T-006C](T-006C.md) | 3 | Khôi phục thông tin bị mất so với giao diện cũ (dòng tổng, mã NSX, rà toàn bộ 16 module) | Codex | **Done** | T-006B | `.agent-runs/T-006C-codex-1.log` |
| [T-007](T-007.md) | 4 | Rà soát cuối, hồi quy, sửa lỗi nhỏ còn lại | Leader + Codex | **Done** | T-006C | `.agent-runs/T-007-codex-1.log` |

Trạng thái hợp lệ: Todo · Đang làm · Review · Cần sửa · Done.

## Môi trường chung

- Node 24.22.1 cài qua nvm, **không** đặt làm mặc định toàn máy. Prefix PATH: `C:\Users\Vo Thanh Tuyen\AppData\Roaming\nvm\v24.22.1`.
- pnpm 11.25.0 qua corepack (shim nằm trong thư mục Node 24 trên).

## Nhật ký

- 2026-10-23: Thiết kế được duyệt. Tạo `ui-sync/main`. Giao T-001 cho Codex.
- 2026-10-23: T-001 review lần 1 Đạt, merge `8e015e2`. Codex không tự commit được do sandbox; từ T-002 dùng clone cục bộ.
- 2026-10-23: Audit DB MedData (chỉ đọc, q02) → bằng chứng cho T-003. Giao T-002 (Codex) ∥ T-003 (Antigravity). Cả hai không sửa `scripts/test-erp.mjs`; leader đăng ký test khi merge.
- 2026-10-23: T-002 review lần 1 Cần sửa (3 lỗi; chặn: phần mở rộng dòng). Cho phép thêm 2 trường tùy chọn vào `types.ts`. Codex không ghi được `.git` kể cả trong clone, nên từ nay leader commit thay cho Codex sau khi review.
- 2026-10-23: T-002 review lần 2 Đạt, merge `1bb1b6a`; `ui-sync/main` sau tích hợp: 678 test / 665 pass / 13 fail (trùng baseline). T-003 review lần 1 Cần sửa (khóa viết tắt theo đường erp-screen; nhãn cho trường mở rộng dòng). T-004 mở khóa được (phụ thuộc T-002).
- 2026-10-23: Giao T-004 (Codex) song song với T-003 lần 2. Hai phiếu không chung file.
- 2026-10-23: T-003 review lần 2 Cần sửa: fixture/config dùng trường dòng PO mà backend cắt (`amount`…). Antigravity hết quota (reset sau ~167 giờ), chờ chủ dự án quyết định giao lại.
- 2026-10-23: Chủ dự án chuyển T-003 (sửa lần 3) và T-005 sang Codex vì Antigravity hết quota. T-005 đợi T-003 merge do dùng chung `tests/fixtures/document-detail-header-keys.json` và `tests/document-detail-config.test.mjs`.
- 2026-10-23: T-004 review lần 1 Cần sửa (2 lỗi nhỏ: test T-002 so class với file đã xóa; manifest help trỏ file đã xóa). Phần lõi đạt: logic dời nguyên văn 156/158 dòng, test cũ chỉ đổi mock, build pass.
- 2026-10-23: T-003 review lần 3 Đạt, merge `deb4d14`. `ui-sync/main`: 688 test / 675 pass / 13 fail (trùng baseline). T-005 mở khóa được.
- 2026-10-23: T-004 review lần 2 đạt mọi kiểm tra tự động (kể cả build) trên bản gộp với T-003; chưa merge vì chưa chụp được giao diện (chưa có môi trường).
- 2026-10-23: Giao T-005 cho Codex (fixture và test riêng `-ops` để không đụng file T-003). Chủ dự án cho phép chạy dev server T-004 với backend production để chụp ảnh, chỉ xem, chủ dự án tự đăng nhập.
- 2026-10-23: T-004 kiểm tra giao diện đạt trên backend VPS (chỉ xem); merge `8d421bd`. `ui-sync/main`: 702 test / 689 pass / 13 fail (trùng baseline), lint 2 lỗi + 1 cảnh báo, build pass.
- 2026-10-23: Mốc cho T-006: màn đề nghị mua hàng `PO_NGL_2026_04` (generic) hiện cả trường kỹ thuật "Status Fore Color #000000" / "Status Back Color #00FFFF" (ngoài danh sách của audit). `apps/medcom-sites/.env.local` vẫn trỏ Railway đã chết; chủ dự án nên tự cập nhật sang VPS.
- 2026-10-23: T-005 review lần 1 Đạt, merge `d09d71f`. `ui-sync/main`: 716 test / 703 pass / 13 fail (trùng baseline), lint 2 lỗi + 1 cảnh báo, build pass. T-006 mở khóa (T-003, T-004, T-005 đều Done).
- 2026-10-23: Leader tách T-006 thành T-006A (dời nguyên văn, đổi khung) và T-006B (đổi giao diện) để diff review được. Giao T-006A cho Codex. Baseline `ui-sync/main`: 716/703/13, lint 2+1.

## TẠM DỪNG — 2026-10-23 (theo yêu cầu chủ dự án)

Trạng thái khi dừng, để tiếp tục sau:
- **Done, đã merge vào `ui-sync/main`:** T-001, T-002, T-003, T-004, T-005. `ui-sync/main` có 716 test / 703 pass / 13 fail (trùng baseline), lint 2 lỗi + 1 cảnh báo, build pass. **Chưa push, chưa merge vào `main`.**
- **T-006A:** lượt Codex 1 bị leader dừng giữa chừng (tiến trình đã kết thúc). Working tree của `D:/Projects/medcom-wt/T-006A` còn thay đổi dở, chưa commit, chưa kiểm tra: xóa `erp-detail-sheet.tsx`; sửa `tab-erp-screen.tsx`, `registry.ts` và 2 test cũ; tạo mới `erp-document-detail-body.tsx`, `controllers/erp-detail-rules.ts`, `tests/erp-document-detail-body.test.mjs`.
  - **Khi tiếp tục:** không tin phần dở này. Cách 1: giao lại cho Codex tiếp tục trên working tree hiện có, yêu cầu chạy lại toàn bộ kiểm tra. Cách 2: `git checkout -- . && git clean -fd` trong clone rồi giao lại từ đầu. Leader chọn cách khi tiếp tục.
- **T-006B, T-007:** chưa giao.
- **Môi trường đã tắt:** dev server cổng 3000 đã tắt, không còn tiến trình agent nào chạy. Antigravity hết quota (reset khoảng 7 ngày sau 2026-10-23).
- **Việc chủ dự án cần quyết sau:**
  - (1) cập nhật `apps/medcom-sites/.env.local` từ Railway sang VPS (`api-medcom.bms79.com`);
  - (2) dòng PO có cần cột tổng tiền không (backend đang cắt `amount` theo `ErpVisibleFields.cs`);
  - (3) cân nhắc dùng login DB chỉ đọc cho việc audit (login hiện dùng có quyền rộng hơn mức cần).

## TIẾP TỤC — sau tạm dừng

- Chủ dự án yêu cầu tiếp tục. Repo không đổi trong lúc dừng. Leader chọn cách 1: commit phần dở T-006A làm mốc WIP, giao Codex lượt 2 làm tiếp và tự rà lại toàn bộ.
- Quyết định của chủ dự án (sau tạm dừng):
  1. `.env.local` đã được chủ dự án cập nhật sang VPS (leader xác nhận host: `api-medcom.bms79.com` / `medcom.bms79.com`).
  2. **Cột hiển thị phụ thuộc cấu hình ẩn/hiện trên ERP** (`SY_FrmCfg` trong MedData). Leader đối chiếu cấu hình hiện tại trong DB (q03, chỉ đọc) với ảnh chụp `inventories/erp/20261019/visible-fields.json` mà backend đang dùng; kết quả quyết định có cần đề xuất sửa backend hay không.
  3. Không tạo login DB riêng; tiếp tục dùng login hiện có, chỉ chạy truy vấn đọc trong transaction rollback.
- T-006A review lần 1 Cần sửa: phần dời code đạt (2.204 dòng, chỉ đổi đúng chỗ được phép). Còn 2 điểm do phiếu tự mâu thuẫn: assert `null` của T-004 và mất ngoại lệ ESLint khi dời file. Leader cho phép sửa đúng 2 assert và thêm ngoại lệ lint **tạm thời** (T-006B phải gỡ).
- T-006A review lần 2 Đạt (kể cả kiểm tra giao diện trên VPS và đếm request ở bản production), merge `536701c`. `ui-sync/main`: 731 test / 718 pass / 13 fail (trùng baseline), lint 2 lỗi + 2 cảnh báo, build pass. Đọc trùng chi tiết đã hết cho mọi module. T-006B mở khóa.
- **Phát hiện phạm vi:** `tab-inbound.tsx`, `tab-purchases.tsx`, `tab-orders.tsx` có màn chi tiết riêng qua `/api/documents` (ngoài audit và thiết kế). Module ERP `inbound-requests` không có trong menu. Chờ chủ dự án quyết.

## Ủy quyền — 2026-10-23

Chủ dự án giao toàn quyền quyết định cho leader. Leader quyết rồi báo lại; ghi lý do ở đây và trong phiếu. Giới hạn cũ giữ nguyên:
- không bao giờ chạy `deploy-production.ps1`;
- không đổi schema hay migration của DB dùng chung với ERP;
- DB chỉ đọc, chủ dự án gõ mật khẩu mỗi lượt;
- báo trước một dòng khi push hoặc merge vào `main`.

**Quyết định của leader:**
- **D1 — Ba màn chi tiết riêng của `tab-inbound.tsx`, `tab-purchases.tsx`, `tab-orders.tsx`: ngoài đợt này.** Đề xuất thành đợt sau (F-01). Lý do:
  - đọc qua `/api/documents` (đặt tên khóa khác đường erp-screen);
  - có thao tác ghi riêng không có trong API erp-screen (ví dụ "Xác nhận vào kệ kho");
  - là màn xem nhanh cho mobile, không phải module ERP.
- **D2 — q03 không chặn T-006B.** Config FE lập từ cùng ảnh chụp `visible-fields.json` mà backend áp dụng, nên FE/backend luôn khớp. q03 chỉ để phát hiện ảnh chụp bị cũ so với ERP hiện tại (theo quyết định của chủ dự án: cột theo cấu hình ẩn/hiện ERP); làm khi chủ dự án tiện gõ mật khẩu.
- **D3 — Module `inbound-requests` không có trong menu:** vấn đề điều hướng, ngoài phạm vi. Ghi thành đề xuất F-02.
- **D4 — Giao T-006B cho Codex** ngay.
- T-006B review lần 1 Cần sửa: 3 test config đỏ do thêm khóa không có trong API để giữ ô sửa mặc định cũ. **D5 (leader):** phương án C. Config chỉ chứa khóa API thật; khóa sửa kế thừa hiện ở nhóm riêng "Trường sửa kế thừa" chỉ khi sửa; không đổi logic lưu. Lỗi gốc của `DEFAULT_EDITABLE_HEADER_KEYS` ghi thành đề xuất **F-03**.
- T-006B review lần 2 Đạt, merge `bf48541`. `ui-sync/main`: 759 test / 746 pass / 13 fail (trùng baseline), lint về đúng baseline gốc 2+1, build pass. `FIELD_LABELS`/`getFieldLabel`/nhánh hardcode Bán hàng đã hết. **D6 (leader):** mở T-006C để khôi phục dòng tổng tiền và mã nhà sản xuất bị mất, và rà mọi module xem có thông tin nào bị mất tương tự.
- T-006C Đạt, merge `1da1db4`: dòng tổng và mã NSX đã về, bảng parity cho 16 module. `ui-sync/main`: 782 test / 769 pass / 13 fail (trùng baseline), lint 2+1, build pass. Bắt đầu T-007.
- T-007 Đạt, merge `52316a4`. `ui-sync/main` cuối: 787 test / 774 pass / 13 fail (trùng baseline), lint 2+1 (baseline trước đợt), build pass. Hồi quy giao diện cuối đạt (đề nghị mua, điều chuyển).

## HOÀN TẤT ĐỢT — 2026-10-23

Mọi phiếu T-001…T-007 Done trên `ui-sync/main`. Tổng kết: `docs/ui-sync/SUMMARY_20261023.md`. **Chưa push, chưa merge vào `main`.** Đề xuất đợt sau: F-01…F-04 (xem tổng kết).

## Tích hợp trước khi mở PR

- **D7 (leader):** trước khi push, đã che dữ liệu thật trong tài liệu phiếu (mảnh email nhân viên, tên đối tác, mã sản phẩm và số tiền của một chứng từ thật, chi tiết login DB). Vì lịch sử commit vẫn còn bản cũ, PR sẽ dùng **một commit squash sạch** từ `origin/main`, không push lịch sử `ui-sync/main`.
- `origin/main` đã tiến tới `11b9981` (PR #171–#174, ~20 commit), có thay đổi FE vào đúng vùng ui-sync viết lại (`status-colors`, `document-summary`, `sales-order-lines`, `tab-erp-screen.tsx`, `sales-order-form.tsx`, `sales-order-detail-tabs.tsx`). Mở [T-008](T-008.md) để tích hợp và chuyển tính năng mới sang kiến trúc mới.
- T-008 Đạt, merge `96c1186`: `ui-sync/main` đã chứa `origin/main` `11b9981`; 811 test / 798 pass / 13 fail (trùng baseline), build pass. Tiếp theo: nhánh squash sạch `ui-sync/document-detail` từ `origin/main`, push và mở PR (chưa merge).

## Đợt F — đề xuất sau ui-sync (2026-10-24)

- F-02 đã xong trong P2-05 (menu có "Đề nghị nhập hàng").
- Chủ dự án giao thêm Muse (chat MCP) làm coder bên cạnh Codex. Leader giao F-04 cho Muse làm lượt thử.
- Chủ dự án mở runner chỉ đọc MedData (`.agent-runs/db/sql-runner.ps1`, nhập mật khẩu 1 lần). q04 đọc `SY_FrmDrdwTbl`.
- [F-04](F-04.md) Đạt: nhãn enum ERP cho `transportMethod`/`serviceStatus`; mở PR vào `main`.

## Đợt UX — rà soát production (2026-10-24)

- Leader rà toàn bộ giao diện https://medcom.bms79.com (chỉ xem; mobile 375px + desktop 1280px), ghi 18 vấn đề theo 4 mức.
- F-04 Đạt, merge PR #179 (`79af7c1`, 10:18).
- Chủ dự án mở runner chỉ đọc MedData (nhập mật khẩu 1 lần). q05/q06 xác nhận bảng trạng thái PR/Nhập kho/Đơn mua.
- [UX-01](UX-01.md) (vấn đề 1–3) Đạt, merge PR #180 (`27caa6f`, 10:44): trạng thái, bộ lọc và tổng tiền khớp ERP.
- Chủ dự án: CD trên VPS cập nhật `main` mỗi 2 phút; leader tự merge khi CI xanh và kiểm tra lại trên production, không chờ duyệt.
- [UX-02](UX-02.md) (4, 8, 11, 15, 16, 17) → PR #181; [UX-03](UX-03.md) (5, 9) → PR #182; [UX-04](UX-04.md) (14, 17 sót; đóng 18) → PR #183. Chuỗi PR xếp chồng, merge theo thứ tự.
- **Phát hiện CI:** PR CI (`backend`, `backend-windows`) chạy test của `src/frontend`, không chạy `apps/medcom-sites`; workflow `medcom-selfhost` chỉ chạy tay. Cổng chất lượng FE thực tế là kiểm tra local của leader (tsc, `npm test`, eslint, build, giao diện trên dữ liệu VPS).
- **Còn lại, cần quyết định riêng:** F-01 (vấn đề 6 + 13: tab PR/Nhập kho/Đơn hàng trùng màn ERP, chi tiết kiểu cũ); vấn đề 7 (màn vai trò điều chuyển chưa có lọc "chờ tôi"); 12 (19 chip trạng thái đơn hàng là bộ lọc phía server, chưa có số đếm); 10 (người tạo hiện email/tài khoản import — cần ánh xạ ở backend).
- 12:00–12:54: frontend production 500 sau deploy (VPS); `main` build/chạy tốt ở local. Mở revert #184 rồi đóng khi production tự lên lại. UX-02/03/04 đã kiểm trên production.
- [F-01](F-01.md) (vấn đề 6 + 13) qua phiên riêng, merge PR #185 (`44d0dd9`, 16:07), kiểm trên production 16:09.
- [UX-05](UX-05.md) (vấn đề 7 + 12): chủ dự án duyệt bảng "Chờ tôi xử lý"; mở PR.
- [UX-06](UX-06.md) (màn Quét QR rõ mục đích, camera, sidebar, cỡ chữ điện thoại) merge PR #187 (`d10f1aa`); [BE-01](BE-01.md) (tên người thay tài khoản, `GET /api/erp/{module}/status-counts`, số chờ xử lý trên menu) merge PR #188 (`ba47ab9`), 18:11; kiểm trên production 18:13.
- Chủ dự án: sự cố 12:00–12:54 do agent CD trên VPS bị chặn quyền, đã khắc phục.
- [UX-07](UX-07.md): test `apps/medcom-sites` vào job CI `backend`; số đếm cho bảng lọc đơn bán; báo khi hàng việc vượt 100 phiếu/trạng thái.
- [UX-09](UX-09.md): giữ phiên qua deploy (file băm token), tương phản nhãn/giá trị, ẩn mã kỹ thuật, tiêu đề màn, khung tải có hiệu ứng.
