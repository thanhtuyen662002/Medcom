# Thống nhất giao diện chi tiết chứng từ (Document Detail Unification)

- Trạng thái: **ĐÃ TRIỂN KHAI trên `ui-sync/main` (2026-10-23)** — xem `docs/ui-sync/SUMMARY_20261023.md`. Đã duyệt 2026-10-23 — chủ dự án đồng ý cả 7 đề xuất ở mục 7
- Ngày: 2026-10-23
- Phạm vi: `apps/medcom-sites` (FE). Không đổi API backend, DB, schema hay migration.
- Đầu vào: `docs/audits/UI_DETAIL_AUDIT_20261023.md` (đã kiểm chứng lại với code, xem mục 1).

---

## 1. Kiểm chứng audit với code thực tế

### 1.1 Các điểm audit nói đúng

| Kết luận audit | Bằng chứng trong code (nhánh `main` @ `cd68422`) |
|---|---|
| Rẽ nhánh shell cứng cho Bán hàng | `components/erp/erp-detail-sheet.tsx:13` (`if (!salesOrder) return <UntitledBottomSheet …>`), `:18` portal ra `RecordDialog` |
| Rẽ nhánh body cứng | `components/untitledui/tab-erp-screen.tsx:2066` (`salesOrder={[…].includes(module)}`), `:2130` (`SalesOrderForm` hoặc khối generic) |
| Generic render bằng `Object.keys(detail.header)` | `tab-erp-screen.tsx:2304-2458` |
| Nhãn fallback tách chữ hoa | `getFieldLabel` tại `tab-erp-screen.tsx:241-252` → `orderTypeId` hiện thành "Order Type Id" |
| Boolean in thô | `tab-erp-screen.tsx:2354-2357`: giá trị không phải tiền/ngày rơi vào `String(value)` → "false" |
| Thiếu danh sách ẩn trường | `isTechnicalField` (`:117-139`) chỉ lọc theo chuỗi con (token, hash, formid…), không lọc `linkId`, `sendTo`, `orderTypeId`, `qrPrintType` |
| Mặc định người dùng đi qua nhánh này | `app/page.tsx`: mặc định render `MedcomApp` → `TabErpScreen` cho cả 19 module trong `erpScreenModules` |

### 1.2 Các điểm audit sai hoặc thiếu, **có ảnh hưởng tới thiết kế**

1. **Nhánh generic không chỉ để xem.** Nó còn chứa: sửa header tại chỗ (`LookupField`, `MoneyInput`, `handleSaveHeader` `:1093`), sửa dòng (`saveLineKeys`), menu thao tác ERP (`save/submit/send-purchase-order/approve/reject/delete`, `:1236`), nút quét QR (warehouse-qr, sales-qr), và các phần phụ `detail.sections` (`costs`, `assets`, `:2909`). → Layout chung phải hỗ trợ **chế độ sửa, thanh thao tác và các section phụ**, không chỉ hiển thị.
2. **`SalesOrderForm` không chỉ là layout.** Nó tự gọi lại `getErpModuleDetail` (đọc trùng với `tab-erp-screen`), giữ `SalesCommandSession` (lệnh chờ, gửi lại idempotent, `stateToken`), close guard, chặn `beforeunload`, đọc đủ các trang dòng trước khi sửa (≤500 dòng). Phần này **phải giữ nguyên, chỉ được dời chỗ**, không viết lại.
3. **`RecordDialog` không chỉ là khung.** `request-detail-dialog.tsx` có focus trap, Esc, PageUp/PageDown, khóa scroll và 3 "host" portal (trạng thái, thao tác phụ, footer). Trên màn <768px nó đã full-screen. Đây là shell tốt nhất để dùng chung.
4. **Có hai app shell.** Ngoài `MedcomApp` còn `components/erp/workspace.tsx` (bật khi `?view=classic`, `?screen=…` hoặc `MEDCOM_LOCAL_HTTPS=1`) với `PurchaseRequestScreen`, `InboundRequestScreen`, `ConfiguredDocumentSheet` riêng. Audit không nhắc tới. **Đề xuất: đợt này chỉ làm `MedcomApp`.**
5. **"Loại in QR" không phải lỗi thiếu nhãn.** `qrPrintType` đã có nhãn trong `FIELD_LABELS`. Vấn đề là trường này không nên hiện, tức là cần danh sách hiển thị, không phải thêm nhãn.
6. **Backend đã có metadata kiểu trường nhưng chưa có nhãn trường.**
   - `src/backend/Medcom.Api/DocumentFieldCatalog.cs` cho `purchase-orders`, `inbound-requests`, `purchase-requests`: tên cột SQL, `jsonType` (`boolean`, `string`…), format (`decimal-string`, `sql-datetime-without-timezone`).
   - `ErpVisibleFields` + `ErpVisibleProjection` đã cắt các trường bị ẩn trên layout ERP trước khi trả về.
   - `inventories/erp/20261012/captions.json` chỉ có caption của **màn hình và nút**, không có caption trường.
   - → Nhãn tiếng Việt và nhóm trường **phải là config FE**. Kiểu dữ liệu trong catalog dùng làm **bằng chứng khi lập config** (đọc file, không gọi API mới).
7. **Tiền lệ config đã có.** `lib/erp/sales-order-lines.ts` (`SALES_ORDER_LINE_COLUMNS/GROUPS`) đang điều khiển bảng dòng của `SalesOrderDetailTabs`. Thiết kế dưới đây mở rộng đúng kiểu này.

Số dòng trong audit lệch vài chục dòng so với `main` hiện tại. Không ảnh hưởng thiết kế.

---

## 2. Kiến trúc đích

```
TabErpScreen (giữ: list, chọn chứng từ, create sheet, QR scanner)
  └─ DocumentDetailDialog            ← shell duy nhất (RecordDialog + portal body)
       └─ DocumentDetailView         ← layout chung, nhận config + view model
            ├─ DocumentDetailStatus      (badge trạng thái + khóa, portal lên header)
            ├─ DocumentDetailNotices     (feedback, lệnh đang chờ, đang xử lý)
            ├─ DocumentModuleNotice      (vd. "Xác nhận đơn hàng · PM")
            ├─ DocumentFieldGroup ×N     (card nhóm trường, view/edit)
            ├─ DocumentNoteStrip         (dải "Nội dung & ghi chú" khi rỗng)
            ├─ DocumentDetailTabs        (Chi tiết dòng | Lịch sử | section phụ)
            ├─ slot: extra sections      (đính kèm, QR scan controls)
            └─ DocumentActionBar         (nút chính + menu "Thao tác khác")
```

Ba lớp tách bạch:

| Lớp | Vị trí | Trách nhiệm | Không được làm |
|---|---|---|---|
| **Shell** | `components/erp/document-detail/document-detail-dialog.tsx` | Mở/đóng, focus, portal ra `document.body`, `presentationAllowed`, close guard | Biết module là gì |
| **Layout** | `components/erp/document-detail/*.tsx` | Vẽ theo config + view model, giao diện lấy từ Bán hàng hiện tại | Gọi API, chứa `if (module === …)` |
| **Hành vi (controller)** | `lib/erp/document-detail/controllers/*.ts` (hook) | Đọc chi tiết, lưu, workflow, phân trang dòng | Render JSX |
| **Config** | `lib/erp/document-detail/modules/*.ts` | Nhóm trường, nhãn, ẩn, formatter, cột dòng, tab | Logic |

### 2.1 Hợp đồng config (sẽ thành `lib/erp/document-detail/types.ts`)

```ts
export type FieldFormat =
  | "text" | "multiline" | "date" | "datetime" | "number" | "money"
  | "boolean" | "status" | "url" | "reference";

export interface DetailFieldConfig {
  key: string;                 // khóa trong detail.header (camelCase như API trả)
  label: string;               // nhãn tiếng Việt, bắt buộc
  format?: FieldFormat;        // mặc định "text"
  displayKey?: string;         // hiện giá trị này thay cho key (vd. objectId → objectName)
  secondaryKey?: string;       // dòng phụ nhỏ dưới giá trị (vd. mã khách hàng)
  span?: "full" | "half";
  hideWhenEmpty?: boolean;     // mặc định true ở chế độ xem
  edit?: {                     // có mặt = được sửa (khi action "save" cho phép)
    input: "date" | "text" | "textarea" | "money" | "lookup";
    lookupId?: string;         // bắt buộc khi input = "lookup"
    required?: boolean;
    multiple?: boolean;
    maxLength?: number;
  };
}

export interface DetailGroupConfig {
  id: string;
  title: string;                       // "Thông tin đơn hàng", "Khách hàng & hợp đồng"…
  fields: DetailFieldConfig[];
  columns?: 1 | 2 | 3;
  emptyStrip?: string;                 // khi mọi trường rỗng: hiện dải gọn thay card
  subgroups?: { title: string; fields: DetailFieldConfig[] }[]; // vd. "Người phụ trách"
}

export interface LineColumnConfig {
  key: string; label: string; format?: FieldFormat;
  align?: "start" | "end"; role?: "primary" | "secondary" | "total";
}

export interface DocumentDetailConfig {
  modules: readonly ErpScreenModule[];   // các module dùng chung config
  title: string;                          // "Chi tiết đơn hàng", "Chi tiết đề nghị nhập kho"…
  closeLabel: string;
  notice?: Partial<Record<ErpScreenModule, { title: string; body: string }>>;
  groups: DetailGroupConfig[];
  hidden: readonly string[];             // khóa biết là có nhưng cố ý ẩn (có lý do trong evidence)
  lines: { title: string; columns: LineColumnConfig[];
           expandGroups?: { label: string; keys: string[]; fullWidth?: string[] }[];
           emptyText: string };
  history?: { title: string };           // tab Lịch sử gửi / duyệt
  sections?: Record<string, { title: string; columns: LineColumnConfig[] }>; // costs, assets…
  slots?: readonly DetailSlotId[];       // xem 2.3
}
```

**Nguyên tắc hiển thị: danh sách trắng.** Chỉ trường có trong `groups` mới được vẽ. Trường API trả về mà không nằm trong `groups` lẫn `hidden` thì **không hiện** trên giao diện. Ở môi trường dev có `console.warn` một lần, và có test hoàn chỉnh (mục 4) bắt lỗi khi lập config. Hậu quả: hàm `getFieldLabel` và nhánh tách chữ hoa bị xóa hoàn toàn. Nhờ vậy không thể còn nhãn kiểu "Order Type Id".

### 2.2 Formatter (`lib/erp/document-detail/format.ts`)

| format | Kết quả | Nguồn |
|---|---|---|
| `boolean` | `true/1/"1"` → **Có**, `false/0/"0"` → **Không**, null → "—" | mới |
| `date` / `datetime` | `dd/MM/yyyy` / `dd/MM/yyyy HH:mm` | chuyển `formatVietnamDate` từ `tab-erp-screen.tsx:254` |
| `money` | `formatMoney` | `lib/erp/money.ts` (giữ nguyên) |
| `number` | `Intl.NumberFormat("vi-VN")` | chuyển `formatVietnamNumber` |
| `status` | `documentStatusLabel` | `lib/erp/document-status.ts` |
| `url` | link "Mở tài liệu" khi `^https?://`, ngược lại hiện chữ | logic hiện có trong `SalesOrderForm` |
| `reference` | `displayKey` nếu có, rồi tới `key`, kèm `secondaryKey` | mới |

Giá trị rỗng luôn hiện "—" (chế độ xem chỉ hiện khi `hideWhenEmpty: false`).

### 2.3 Slot: ngoại lệ có kiểm soát cho "không viết JSX riêng"

Giữ nguyên hành vi Bán hàng nghĩa là không thể biến mọi thứ thành config. Đề xuất một **danh sách slot cố định**, khai báo trong registry. Không có slot tự do theo module:

| Slot | Dùng cho | Component (đã có) |
|---|---|---|
| `lines-editor` | Sửa dòng hàng Bán hàng | `SalesOrderLineEditor` |
| `attachments` | Tài liệu đính kèm | `SalesOrderAttachmentList` |
| `qr-scan` | warehouse-qr, sales-qr | khối nút quét đang ở `tab-erp-screen.tsx:2145-2183` (tách ra) |
| `contract-info` | Thông tin hợp đồng (menu) | modal hiện có trong `SalesOrderForm` |

### 2.4 Controller (hành vi)

Hai controller, cùng trả một view model chung `DocumentDetailModel` (`detail`, `draft`, `editing`, `dirty`, `busy`, `pending`, `feedback`, `actions: DetailAction[]`, `loadMore(section)`, `beginEdit/discard/save`, `runAction(id)`):

- `useSalesOrderDetail(module, branchId, documentId)`: **cắt nguyên văn** state và logic từ `SalesOrderForm` (`load`, `send`, `recover`, `handleSave`, `beginEdit`, `more`, `openContract`, close guard, `beforeunload`). Không đổi thuật toán.
- `useErpDocumentDetail(module, branchId, documentId)`: cắt từ `tab-erp-screen.tsx` (`handleSaveHeader`, `editHeader/editLines`, `menuActs`, `handleMenuClick`, `SAVE_HEADER_BY_MODULE`, `editLookupId`, `saveLineKeys`).

Hai controller dùng chung layout. Tên nút, icon và thứ tự nút do `DetailAction[]` quyết định (bản đồ nhãn lấy từ `salesActionLabels` và `menuLabel` hiện có), không hardcode trong layout.

### 2.5 Registry

`lib/erp/document-detail/registry.ts` export `getDocumentDetailConfig(module)` và `getDocumentDetailController(module)`. Toàn bộ quyết định "module nào dùng gì" nằm ở đây. Sau Giai đoạn 3, `tab-erp-screen.tsx` chỉ còn:

```tsx
<DocumentDetailDialog module={module} branchId={currentBranch} documentId={selectedDocId}
  open={…} presentationAllowed={isActive} onClose={handleCloseDetail} onChanged={…} />
```

---

## 3. Module bị ảnh hưởng (19 module trong `erpScreenModules`)

| Nhóm config | Module | Controller | Ghi chú |
|---|---|---|---|
| `sales` | sales-orders, sales-order-pm, sales-order-sa | sales | notice khác nhau cho PM/SA; slot lines-editor, attachments, contract-info |
| `purchase-request` | purchase-requests, purchase-approvals | erp | sửa PR vẫn dùng `PurchaseRequestCreateSheet` (`prEditId`), giữ nguyên |
| `purchase-order` | purchase-orders | erp | đang bị `WRITE_GATED_MODULES` chặn ghi, giữ nguyên |
| `inbound` | inbound-requests | erp | ví dụ lỗi "Order Type Id", "Thời tiết mưa: false" |
| `transfer` | internal-transfer-requests, -pm, -batches, -tech, -sa, -accounting, -warehouse-out, -warehouse-in | erp | 1 config gốc + biến thể theo bước; batches có trường riêng |
| `machine` | machine-movements, machine-repairs | erp | section `assets`, `costs` |
| `qr` | warehouse-qr, sales-qr | erp | slot qr-scan |

Ngoài phạm vi: `components/erp/workspace.tsx` (classic) và các màn `PurchaseRequestScreen`, `InboundRequestScreen`, `ConfiguredDocumentSheet` của nó. Màn tạo mới (`UntitledBottomSheet` create/QR/menu) cũng ngoài phạm vi.

---

## 4. Lộ trình và phiếu việc (đã điều chỉnh sau khi đọc code)

`tab-erp-screen.tsx` (3 623 dòng) là điểm nóng xung đột. **Mỗi lúc chỉ một phiếu được sửa file này.**

| Phiếu | GĐ | Agent | Nội dung | Phụ thuộc | Song song với |
|---|---|---|---|---|---|
| T-001 | 1 | Codex | Tạo `lib/erp/document-detail/types.ts` + `format.ts` + unit test formatter. Chỉ file mới. | duyệt thiết kế | — (nhỏ, chạy trước) |
| T-002 | 1 | Codex | Layout chung `components/erp/document-detail/*` tách từ giao diện `SalesOrderForm`/`SalesOrderDetailTabs`; fixture browser test với config giả. Chưa nối vào màn nào. | T-001 | T-003 |
| T-003 | 1 | Antigravity | Config + evidence cho purchase-requests/approvals, purchase-orders, inbound-requests (`modules/purchase.ts`, `modules/inbound.ts`, `docs/ui-sync/FIELD_EVIDENCE_PURCHASE_INBOUND.md`) + test hoàn chỉnh trường. | T-001 | T-002 |
| T-004 | 2 | Codex | `useSalesOrderDetail` + config `sales` + `DocumentDetailDialog`; chuyển Bán hàng sang layout chung; `SalesOrderForm` thành vỏ mỏng hoặc bị xóa. Sửa `tab-erp-screen.tsx`, `erp-detail-sheet.tsx`. | T-002 | T-005 |
| T-005 | 2 | Antigravity | Config + evidence cho transfer (8), machine (2), qr (2). Chỉ file config. | T-001 | T-004 |
| T-006 | 3 | Codex | `useErpDocumentDetail`; chuyển purchase + inbound, rồi mọi module còn lại; xóa `salesOrder` prop, `getFieldLabel`, `FIELD_LABELS`, `isTechnicalField`, khối generic `:2186-2955`, `ErpDetailSheet`. | T-003, T-004, T-005 | — |
| T-007 | 4 | Leader + Codex (review) | Rà soát cuối, hồi quy, chụp màn hình trước/sau toàn bộ module. | T-006 | — |

Đợt song song đầu tiên là **T-002 ∥ T-003** (không chung file), sau đó **T-004 ∥ T-005**.

---

## 5. Tiêu chí nghiệm thu đo được (toàn đợt)

1. `rg -n "salesOrder=|\"sales-orders\", \"sales-order-pm\", \"sales-order-sa\"\]\.includes" apps/medcom-sites/components` → **0 kết quả** (ngoài phần tạo mới đơn hàng, nếu còn, phải chỉ rõ trong phiếu).
2. `rg -n "getFieldLabel|FIELD_LABELS|replace\(/\(\[A-Z\]\)/g" apps/medcom-sites/components` → **0 kết quả**.
3. Test hoàn chỉnh: với mỗi module, mỗi khóa header trong fixture (lấy từ `DocumentFieldCatalog` + `ErpScreenCatalog`, đã chuẩn hóa camelCase) phải nằm trong `groups` hoặc `hidden`. Mỗi `label` không rỗng và không trùng khóa.
4. Unit test formatter: boolean → "Có"/"Không"; ngày `2026-10-23T00:00:00` → `23/10/2026`; tiền đúng `formatMoney`.
5. Playwright quét text trong dialog chi tiết của `PO_NGL_2026_04`, `DMB1026/0050`, `DN1026/0006`: không có `\btrue\b|\bfalse\b`, không có nhãn dạng `^[A-Z][a-z]+( [A-Z][a-z]+){1,}$`, không có khóa camelCase thô.
6. Bán hàng giữ hành vi: `tests/sales-order-form.test.mjs`, `tests/sales-workflow.test.mjs`, `tests/erp-sales-order-*.test.mjs`, `tests/record-dialog.browser.mjs`, `tests/request-detail-*.browser.mjs` **pass mà không sửa test** (chỉ sửa đường dẫn import nếu bắt buộc, phải ghi lý do). Kiểm tra tay: Gửi PM, Thu hồi để sửa, Sửa → Lưu, Hủy sửa, tab Lịch sử, Tải thêm, Xóa (menu), Thông tin hợp đồng.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` trong `apps/medcom-sites` đều pass. Không có `any`, `@ts-ignore`, `eslint-disable` mới.

---

## 6. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Refactor `SalesOrderForm` làm hỏng lệnh chờ / idempotency / close guard | Cao | Controller là **dời code, không viết lại**; review diff theo khối; test hiện có phải pass không sửa |
| Đổi shell sang `RecordDialog` làm hỏng modal lồng nhau (QR scanner, `PurchaseRequestCreateSheet`, menu) do focus trap | Trung bình | `RecordDialog` đã nhường focus cho dialog lớp cao hơn (`guard()`); thêm browser test mở QR scanner trong chi tiết |
| `tab-erp-screen` có transform animation, `position: fixed` bị giam | Trung bình | Giữ portal ra `document.body` như `erp-detail-sheet.tsx:15-17` |
| Mobile: kho/QR hiện dùng bottom sheet, chuyển sang full-screen dialog | Trung bình (UX) | **Cần chủ dự án quyết định** (mục 7) |
| Danh sách trắng che mất trường mới backend thêm sau này | Thấp | `console.warn` ở dev + test hoàn chỉnh chạy trong CI |
| Xung đột merge ở `tab-erp-screen.tsx` | Cao nếu song song | Chỉ T-004 rồi T-006 sửa, tuần tự |
| Ảnh chụp chứng từ thật chứa dữ liệu khách hàng (repo public) | Cao | Lưu ở `artifacts/ui-sync/` (đã nằm trong `.gitignore`), **không commit** |
| Môi trường: máy đang dùng Node v22.14 trong khi `package.json` yêu cầu `>=24 <25`; không có `pnpm` trên PATH; browser test cần `MEDCOM_EDGE_PATH` | Chặn review | Cần chuẩn bị trước T-002 (mục 7) |

---

## 7. Cần chủ dự án quyết định trước khi giao việc

1. **AGENTS.md gốc (mục 2026-10-04) ghi "do not mutate that FE/Sites application".** Yêu cầu đợt này là sửa chính `apps/medcom-sites`. Xác nhận yêu cầu mới thay thế điều khoản đó cho đợt ui-sync (đề xuất ghi một dòng vào `AGENTS.md`).
2. **Phạm vi:** chỉ `MedcomApp` (mặc định), bỏ qua giao diện classic `workspace.tsx`?
3. **Mobile:** dùng dialog full-screen (giống Bán hàng hiện nay) cho mọi module, thay cho bottom sheet?
4. **Danh sách trắng:** trường không khai báo bị ẩn hẳn (đề xuất), hay hiện trong nhóm "Thông tin khác" với nhãn bắt buộc từ config?
5. **Slot cho Bán hàng** (mục 2.3) được chấp nhận là ngoại lệ có kiểm soát?
6. **Môi trường:** cho phép cài Node 24 qua nvm và bật `pnpm` qua corepack trên máy này?
7. **Quyền chạy agent headless:**
   - Codex: `codex exec -C ../medcom-wt/<TASK> -s workspace-write --add-dir D:/Projects/Medcom/.git` (cần `--add-dir` vì worktree commit vào `.git` của repo chính).
   - Antigravity: `agy -p "<prompt>" --dangerously-skip-permissions` chạy trong thư mục worktree (agy không có cờ chọn thư mục làm việc). Cờ này tự duyệt mọi lệnh; phạm vi được giới hạn bằng worktree riêng và review diff.
