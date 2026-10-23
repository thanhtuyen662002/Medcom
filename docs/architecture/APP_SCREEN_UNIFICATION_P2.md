# P2 — Thống nhất màn hình, bộ công cụ và form (mobile-first)

- Trạng thái: **Leader quyết định theo ủy quyền của chủ dự án (2026-10-24)**
- Nhánh tích hợp: `p2/main` (từ `main` `cb85348`, đã gồm đợt P1/ui-sync)
- Phạm vi: `apps/medcom-sites`, giao diện `MedcomApp` (bỏ qua `components/erp/workspace.tsx` classic)
- Yêu cầu của chủ dự án:
  1. mọi màn đồng bộ thị giác, số cột có thể khác;
  2. tìm kiếm, bộ lọc, tạo, gửi, sửa… dùng **một style và một vị trí**;
  3. **ưu tiên điện thoại**;
  4. đẹp, không lỗi.
- Đầu vào: bản kiểm kê trong tin nhắn leader (2026-10-24) và ảnh mobile hiện trạng.

## 1. Vấn đề hiện tại

**Toolbar không thống nhất:**
- 3 kiểu ô tìm kiếm (ERP `h-11`, tab cũ `py-2.5 text-xs`, scanner `py-2 text-xs`).
- Nút làm mới chỉ có ở tab cũ.
- Bộ lọc có 3 kiểu: chip trong card ở ERP, chip trần ở tab cũ, dropdown `select` riêng cho Bán hàng.
- Nút "Tạo mới" nằm chỗ khác nhau giữa các màn.
- Chỉ màn ERP có tiêu đề màn.

**Danh sách không thống nhất:**
- Thẻ mobile có 3 kiểu (ERP mono đen, tab cũ có footer, nhập kho mã màu xanh lá và lặp mã/ngày).
- Bảng desktop chỉ có ở 8/19 module ERP; nhập kho không có bảng và không phân trang.
- Badge trạng thái có 3 kiểu.
- Lỗi hiển thị 2 kiểu (banner vàng / thẻ đỏ có "Thử lại").

**Form không thống nhất:**
- 4 form tạo có footer, nhãn nút, cỡ chữ ô nhập và cách chia bước khác nhau.
- Form generic bắt người dùng gõ mã thô.

**Tap target dưới 44px:** nút `UntitledButton` sm/md, nút làm mới, chip, bottom-nav, chuông, "Duyệt nhanh", chip mẫu ở scanner.

**Lỗi và chức năng giả:**
- Tab "Đề nghị PR" hỏng hoàn toàn trên production: schema `lib/erp/purchase-request-api.ts:87` bắt `writeAvailable:false` và `writeReason:"numbering_journal_runtime_unqualified"`, nhưng backend trả `true` / `""`.
- "Tạo mới" ở tab Đơn hàng và Nhập kho mở form PR **giả** (`QuickCreateModal`, `medcom-app.tsx:523,545`).
- "Duyệt / Từ chối" ở tab PR và "Duyệt nhanh" ở trang chủ chỉ đổi state cục bộ.
- Trang Cài đặt có hồ sơ cứng và nút "Kiểm tra kết nối" giả.
- Class không tồn tại: `py-0.2`, `xs:`, `dark:hover:bg-neutral-750`.

## 2. Hệ thống chung (đặt ở `components/app/`)

Màu brand, neutral và dark mode giữ nguyên token trong `app/globals.css`. Mọi control chạm được có kích thước **≥ 44px** (`min-h-11`); chữ nội dung tối thiểu `text-sm`, ô nhập `text-base` (iOS không zoom).

| Component | Vai trò | Quy tắc |
|---|---|---|
| `AppButton` | Thay `UntitledButton` cho màn mới | variants: primary, secondary, ghost, danger; sizes: md (44px), lg (48px), icon (44×44). Nhãn tiếng Việt động từ ngắn. |
| `ScreenHeader` | Tiêu đề màn | `h1` `text-xl font-semibold`, dòng phụ "Chi nhánh X · N chứng từ". Desktop: nút chính (Tạo mới) bên phải. Mobile: không có nút chính trong header (dùng FAB). |
| `ScreenToolbar` | **Một** thanh công cụ cho mọi màn danh sách | Sticky ngay dưới header. Thứ tự **cố định**: `[Ô tìm kiếm flex-1] [Nút lọc (badge số bộ lọc)] [Nút làm mới]`. Desktop thêm `[Tạo mới]` ở cuối. Tìm kiếm debounce 300 ms, Enter để tìm ngay, nút ✕ xóa. |
| `FilterChips` | Lọc nhanh trạng thái | Một hàng chip cuộn ngang ngay dưới toolbar. Chip 44px, có số đếm. Chọn chip về trang 1. Dùng cho **mọi** màn (bỏ dropdown riêng của Bán hàng). |
| `FilterSheet` | Bộ lọc đầy đủ | Bottom sheet trên mobile, popover trên desktop. Chứa trạng thái, số dòng/trang và (nếu có) khoảng ngày. Nút "Áp dụng" / "Xóa lọc". |
| `CreateFab` | Tạo mới trên mobile | Nút tròn 56px, góc phải dưới, cách bottom-nav 16px + safe-area. Chỉ hiện khi được quyền tạo. Desktop ẩn (dùng nút ở header/toolbar). |
| `StatusBadge` | Badge trạng thái duy nhất | Dùng `lib/erp/status-colors.ts` khi có màu ERP, ngược lại dùng tone mặc định. `text-xs font-semibold rounded-full px-2.5 py-1`. Thay inline pill, `UntitledBadge` và badge nhập kho. |
| `RecordCard` | Thẻ dòng trên mobile | Dòng 1: mã chứng từ (`font-mono text-sm font-semibold text-brand-700`) + `StatusBadge` bên phải. Dòng 2: đối tượng chính (`text-base font-semibold`, tối đa 2 dòng). Dòng 3: meta `text-sm text-neutral-500` nối bằng " · " (ngày · người lập · số dòng/tổng tiền tùy màn). Chevron phải. Cả thẻ là một nút ≥ 64px. **Không lặp** mã/ngày. |
| `RecordTable` | Bảng desktop (`lg+`) | Dựa trên `DocumentListTable`; cột khai báo bằng config theo màn (số cột khác nhau được). Dùng cho **mọi** màn danh sách, kể cả nhập kho. |
| `RecordList` | Ghép card + table + trạng thái | Props: `rows`, `columns`, `card` (map dòng → 3 dòng của `RecordCard`), `loading`, `error`, `onRetry`, `empty`, `onOpen`, pagination. |
| `ListState` | Loading / rỗng / lỗi | Loading: skeleton card (mobile) / skeleton bảng (desktop). Rỗng: icon + câu ngắn + (nếu có quyền) "Tạo mới". Lỗi: **một** kiểu thẻ đỏ nhạt + "Thử lại". |
| `Pagination` | Phân trang | `DocumentListPagination`, cỡ trang 20/50/100 cho mọi màn. |
| `FormSheet` | Form tạo/sửa | Mobile: toàn màn hình, header (tiêu đề + ✕), thân cuộn, **footer sticky** `[Hủy] [Nút chính]` + safe-area. Nhiều bước: thanh bước trên đầu, footer `[Quay lại] [Tiếp tục / Tạo …]`. Desktop: dialog `max-w-3xl`. |
| `FormField` / `FormSection` | Trường form | Nhãn trên ô (`text-sm font-medium`), dấu `*` cho bắt buộc (không dùng "(*):"), lỗi dưới ô màu đỏ, ô nhập 44px `text-base`. Lookup dùng `LookupField`. |
| `ActionBar` | Thao tác trên chi tiết | Đã có ở P1 (`DocumentActionBar`): mobile sticky dưới, nút chính bên phải, menu "Thao tác khác". Giữ nguyên, chỉ đổi sang `AppButton` cho đồng bộ. |

**Nhãn chuẩn:**
- Tìm kiếm: placeholder "Tìm mã, đối tượng, người lập…".
- Làm mới: icon, aria-label "Làm mới".
- Lọc: "Bộ lọc".
- Tạo: "Tạo mới" (desktop), FAB có aria-label "Tạo {tên chứng từ}".
- Nút chính form: "Tạo {tên}" / "Lưu thay đổi".
- Hủy: "Hủy".

## 3. Áp dụng theo màn

| Màn | Thay đổi |
|---|---|
| ERP list (`tab-erp-screen.tsx`, 19 module) | `ScreenHeader` + `ScreenToolbar` + `FilterChips` + `RecordList`. Bảng desktop cho cả 19 module, cột theo config màn. Bán hàng dùng chip thay dropdown. |
| Tab Đơn hàng PO (`tab-orders.tsx`) | Như trên. Tạo mới mở `PurchaseOrderCreateSheet` thật. |
| Tab Đề nghị PR (`tab-purchases.tsx`) | **Sửa lỗi schema** (chấp nhận `writeAvailable` boolean, `writeReason` chuỗi). Tìm kiếm phía server nếu API hỗ trợ (ngược lại giữ client nhưng ghi rõ). Bỏ "Duyệt/Từ chối" giả. Tạo mới mở `PurchaseRequestCreateSheet` thật. |
| Tab Nhập kho (`tab-inbound.tsx`) | Như trên, thêm bảng desktop và phân trang. Tạo mới mở luồng tạo nhập kho thật nếu có; nếu không có thì ẩn nút (không mở form giả). |
| Trang chủ (`tab-home.tsx`) | Giữ hero và metric. Thao tác nhanh dùng cùng tone brand (không 4 màu tùy ý). Bỏ "Duyệt nhanh" giả; "Chi tiết" mở chứng từ thật. |
| Cài đặt (`tab-settings.tsx`) | Hồ sơ lấy từ phiên thật. Bỏ kiểm tra kết nối giả (hoặc gọi health thật). Switch có `role="switch"`. |
| Quét QR (`qr-scanner-view.tsx`) | Ô nhập thủ công dùng ô chuẩn; chip mẫu 44px; nút dùng `AppButton`. |
| Form tạo (PR, PO, Bán hàng, generic, QuickCreate) | Chuyển sang `FormSheet`/`FormField`. Xóa `QuickCreateModal` (giả). Gộp hook `matchMedia(max-width:767px)` thành một `useIsMobile`. |
| Khung điều hướng | Bottom-nav và chuông ≥ 44px; sửa class không tồn tại; header desktop dạng "top" có liên kết module (hoặc mặc định layout sidebar); tiêu đề màn thống nhất. |

## 4. Phiếu (Codex), thứ tự và song song

| Phiếu | Nội dung | Phụ thuộc | File chính |
|---|---|---|---|
| P2-01 | Thư viện `components/app/*` + test render; sửa lỗi schema tab PR | — | `components/app/**`, `lib/erp/purchase-request-api.ts`, test mới |
| P2-02 | Áp dụng cho tab Đơn hàng, Đề nghị PR, Nhập kho, Trang chủ, Cài đặt, Scanner; bỏ chức năng giả; nối Tạo mới đúng form thật | P2-01 | `tab-orders/purchases/inbound/home/settings.tsx`, `qr-scanner-view.tsx`, `medcom-app.tsx`, xóa `quick-create-modal.tsx` |
| P2-03 | Áp dụng cho danh sách ERP 19 module | P2-01 | `tab-erp-screen.tsx` (vùng danh sách), `components/erp/sales-order-status-filter.tsx` |
| P2-04 | Form: PR/PO sheet, form tạo trong `tab-erp-screen` → `FormSheet`/`FormField` | P2-03 | `purchase-*-create-sheet.tsx`, `tab-erp-screen.tsx` (vùng tạo) |
| P2-05 | Khung điều hướng: header, bottom-nav, drawer, sidebar | P2-02 | `mobile-header`, `bottom-nav`, `desktop-header`, `desktop-sidebar`, `sidebar-drawer` |
| P2-06 | Rà soát thị giác cuối mobile + desktop, sáng/tối, sửa lỗi còn lại | tất cả | — |

P2-02 ∥ P2-03 (không chung file). P2-04 sau P2-03. P2-05 sau P2-02.

## 5. Tiêu chí nghiệm thu chung

1. Ở 375×812 (mobile) và 1280×860 (desktop), mọi màn danh sách có **cùng** thứ tự toolbar, cùng thẻ, cùng badge, cùng trạng thái loading/rỗng/lỗi, cùng vị trí Tạo mới (FAB trên mobile, nút phải trên desktop).
2. Không còn control chạm được < 44px trên mobile (test quét DOM lúc render).
3. Không còn `QuickCreateModal` và không còn hành động giả (duyệt/từ chối/kiểm tra kết nối chỉ đổi state).
4. Tab "Đề nghị PR" tải được danh sách thật.
5. typecheck, lint (không lỗi mới), build pass; contracts không có fail mới; logic ghi (lưu, gửi, xóa, workflow) không đổi.
6. Không đổi backend trừ khi bắt buộc và có lý do; **không đổi DB/schema/migration; không deploy**.
