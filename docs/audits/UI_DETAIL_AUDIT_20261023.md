# Audit giao diện chi tiết chứng từ (Gemini, 2026-10-23)

> Nguồn: audit do Gemini thực hiện trên apps/medcom-sites. Đường dẫn file:/// trong tài liệu trỏ tới máy khác (c:/Users/Tuyen/...), quy đổi về repo hiện tại.

Qua quá trình audit toàn bộ mã nguồn Frontend (`apps/medcom-sites`), dưới đây là báo cáo phân tích chi tiết nguyên nhân vì sao giao diện chi tiết chứng từ giữa các phân hệ lại không dùng chung và có sự khác biệt rõ rệt như trong 3 ảnh đã chụp.

---

### 1. Nhận diện 3 giao diện trong 3 ảnh thực tế

| Hình ảnh | Phân hệ & Chứng từ | Khung chứa (Modal Shell) | Component render nội dung | Đặc điểm nhận diện trên giao diện |
| :--- | :--- | :--- | :--- | :--- |
| **Ảnh 1** | **Mua hàng** (`purchase-orders` / `purchase-requests`)<br/>Mã: `PO_NGL_2026_04` | [`UntitledBottomSheet`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/bottom-sheet.tsx#L19-L114) | Khối generic render inline trong [`tab-erp-screen.tsx`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/tab-erp-screen.tsx#L2170-L2900) | - Tiêu đề: `Chi tiết: PO_NGL_2026_04` kèm badge `Đã khóa`<br/>- Card đơn: Mã chứng từ + Trạng thái + Nút 3 chấm (`...`)<br/>- Dòng đối tượng riêng: `ĐỐI TƯỢNG / KHÁCH HÀNG / NHÀ CUNG CẤP`<br/>- Lưới 2 cột thông tin chung (Ngày đề xuất, Bộ phận, Mục đích, Ghi chú...)<br/>- Bảng chi tiết tĩnh: `CHI TIẾT (2) Trang 1` |
| **Ảnh 2** | **Bán hàng** (`sales-orders` / `sales-order-pm` / `sales-order-sa`)<br/>Mã: `DMB1026/0050` | [`RecordDialog`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/record-dialog.tsx#L42) (dẫn xuất từ [`RequestDetailDialog`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/request-detail-dialog.tsx#L32-L170)) | [`SalesOrderForm`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/sales-order-form.tsx#L97-L442) + [`SalesOrderDetailTabs`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/sales-order-detail-tabs.tsx) | - Tiêu đề: `Chi tiết đơn hàng`, subtitle `DMB1026/0050`<br/>- Hai badge trạng thái nằm góc trên header: `Đã gửi PM`, `Chưa khóa`<br/>- Chia thành 2 Card riêng biệt: **"Thông tin đơn hàng"** & **"Khách hàng & hợp đồng"**<br/>- Thanh ngang riêng cho: **"Nội dung & ghi chú"**<br/>- Hệ thống 2 Tab: `Chi tiết hàng hóa 1` và `Lịch sử gửi / duyệt 3`<br/>- Bảng hàng hóa có nút mở rộng (`>`) từng dòng, thanh tổng tiền và dàn nút hành động nghiệp vụ cố định (`Gửi PM`, `Thu hồi để sửa`, `Sửa`...) |
| **Ảnh 3** | **Quản lý kho / Đề nghị nhập hàng** (`inbound-requests`)<br/>Mã: `DN1026/0006` | [`UntitledBottomSheet`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/bottom-sheet.tsx#L19-L114) | Khối generic render inline trong [`tab-erp-screen.tsx`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/tab-erp-screen.tsx#L2170-L2524) | - Tiêu đề: `Chi tiết: DN1026/0006`<br/>- Dùng chung khung với Ảnh 1 nhưng **dữ liệu bị đổ thô (raw dump)**:<br/>- Xuất hiện hàng loạt trường kỹ thuật chưa có nhãn tiếng Việt chuẩn: `Order Type Id`, `Total Barrel Quantity By Document`, `Send To`, `Loại in QR`, `Link Id`, `Order Type Name`...<br/>- Giá trị boolean hiển thị nguyên dạng: `Thời tiết mưa: false` |

---

### 2. Các nguyên nhân kỹ thuật cốt lõi trong mã nguồn FE

#### Nguyên nhân 1: Có sự rẽ nhánh điều kiện cứng (Hardcoded Branching) ép Bán hàng đi một hướng riêng
Trong tệp [`erp-detail-sheet.tsx`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/erp-detail-sheet.tsx#L8-L31):
```tsx
export function ErpDetailSheet({ salesOrder, documentNumber, presentationAllowed = true, ...props }: ...) {
  ...
  // Nếu KHÔNG PHẢI Bán hàng -> Dùng UntitledBottomSheet
  if (!salesOrder) return <UntitledBottomSheet {...props} open={props.open && presentationAllowed} />;
  
  // Nếu LÀ Bán hàng -> Portal ra ngoài document.body và dùng RecordDialog
  return createPortal(
    <RecordDialog open={props.open} presentationAllowed={presentationAllowed} title="Chi tiết đơn hàng" documentNumber={documentNumber} ...>
      {props.children}
    </RecordDialog>,
    host
  );
}
```

Và tại [`tab-erp-screen.tsx`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/tab-erp-screen.tsx#L2093-L2170):
```tsx
// 1. Phân luồng Dialog Shell:
<ErpDetailSheet
  presentationAllowed={isActive}
  presentation={useRecordDetail ? "document" : "sheet"}
  salesOrder={["sales-orders", "sales-order-pm", "sales-order-sa"].includes(module)}
  ...
>
  ...
  {detail ? (
    // 2. Phân luồng Body Component:
    ["sales-orders", "sales-order-pm", "sales-order-sa"].includes(module) ? (
      <SalesOrderForm ... />  // Giao diện riêng biệt của Ảnh 2
    ) : (
      <>
        {/* Giao diện generic auto-render của Ảnh 1 và Ảnh 3 */}
      </>
    )
  )}
</ErpDetailSheet>
```
> **Hệ quả**: Bất kỳ khi nào mở chứng từ thuộc nhóm Bán hàng (`sales-orders`, `sales-order-pm`, `sales-order-sa`), giao diện lập tức chuyển sang component [`SalesOrderForm`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/sales-order-form.tsx) bọc trong [`RecordDialog`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/record-dialog.tsx). Tất cả các phân hệ khác (Mua hàng, Nhập kho, Điều chuyển...) bị dồn vào nhánh `else`.

---

#### Nguyên nhân 2: Lịch sử phát triển chắp vá (Architectural Drift) theo từng đợt yêu cầu
Theo tài liệu bàn giao [`SALES_FLOW_UI_20261018.md`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/docs/SALES_FLOW_UI_20261018.md) và [`COMMERCE_DESKTOP_TABLE_TAILWIND_20261018.md`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/docs/COMMERCE_DESKTOP_TABLE_TAILWIND_20261018.md):
- **Phân hệ Bán hàng** được ưu tiên làm riêng một đợt thiết kế chi tiết: code riêng form [`SalesOrderForm`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/sales-order-form.tsx), chia lưới 2 khối `Thông tin đơn hàng` và `Khách hàng & hợp đồng`, bổ sung tab `Lịch sử gửi / duyệt` ([`sales-order-detail-tabs.tsx`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/sales-order-detail-tabs.tsx)), xử lý các nút bấm hành động theo luồng duyệt (PM/SA).
- Sau khi hoàn thành phân hệ Bán hàng, phần giao diện này **không được trừu tượng hóa (generalize) thành một component mẫu chung** cho các phân hệ khác, mà để nằm riêng độc lập.
- Các phân hệ **Mua hàng** và **Quản lý kho** vẫn giữ nguyên cơ chế màn hình tạm thời được dựng từ trước.

---

#### Nguyên nhân 3: Tồn tại 2 trường phái thiết kế UI song song trong cùng dự án
Trong mã nguồn hiện có 2 bộ component giao diện đối lập nhau:
1. **Trường phái Classic ERP (`components/erp/`):**
   - Đại diện: [`RecordDialog`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/record-dialog.tsx), [`RecordSection`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/record-dialog.tsx#L31), [`RecordActionBar`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/record-dialog.tsx#L9), [`RecordDetailStatus`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/record-dialog.tsx#L21).
   - Thiết kế theo chuẩn ứng dụng quản trị doanh nghiệp: bố cục thẻ bo góc, phân tách khu vực rõ ràng, hỗ trợ cổng portal cho action buttons và trạng thái, có tab xem lịch sử phê duyệt. (Đây là nền tảng của **Ảnh 2**).
2. **Trường phái Untitled UI Mobile-first (`components/untitledui/`):**
   - Đại diện: [`UntitledBottomSheet`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/bottom-sheet.tsx).
   - Thiết kế ban đầu là thanh kéo vuốt từ dưới lên (Bottom Sheet) cho điện thoại, sau đó được chắp thêm cờ `presentation="document"` để ép giãn rộng trên màn hình máy tính. Bên trong không có cấu trúc thẻ logic hay phân tab, mà cuộn dọc toàn bộ từ trên xuống dưới. (Đây là nền tảng của **Ảnh 1** và **Ảnh 3**).

---

#### Nguyên nhân 4: Cơ chế "Generic Auto-Render" thiếu từ điển nhãn và phân nhóm trường (Lý do Ảnh 3 bị biến dạng)
Đối với các phân hệ chạy nhánh chung (`purchase-requests`, `inbound-requests`...), [`tab-erp-screen.tsx`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/tab-erp-screen.tsx#L2342-L2506) không có layout cố định mà **tự động quét toàn bộ các trường trả về từ API backend**:
```tsx
const headerKeys = Object.keys(detail.header || {});
return keys.map((key) => {
  ...
  const displayVal = ... String(value);
  return (
    <div key={key} className="flex min-w-0 flex-col gap-1.5 py-1 border-b ...">
      <span className="text-sm text-neutral-400 font-medium">{getFieldLabel(key)}</span>
      <span className="font-semibold">{displayVal}</span>
    </div>
  );
});
```

Điều này dẫn đến:
1. **Ở phân hệ Mua hàng (Ảnh 1):** Các trường trả về (`purchaseDate`, `department`, `purposeDescOrClient`, `currencyId`, `rateExchange`) may mắn nằm đầy đủ trong từ điển [`FIELD_LABELS`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/tab-erp-screen.tsx#L145-L249), nên hiển thị được tiếng Việt tự nhiên (*Ngày đề xuất, Bộ phận, Mục đích / Khách hàng...*).
2. **Ở phân hệ Kho / Đề nghị nhập hàng (Ảnh 3):** 
   - Backend trả về các trường đặc thù của phiếu kho (`orderTypeId`, `totalBarrelQuantityByDocument`, `sendTo`, `linkId`, `isRain`...).
   - Do [`FIELD_LABELS`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/tab-erp-screen.tsx#L145-L249) không có các từ khóa này, hàm [`getFieldLabel`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/tab-erp-screen.tsx#L251-L262) buộc phải fallback sang phương thức tách từ viết hoa:
     ```tsx
     return key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase()).trim();
     ```
     Biến `orderTypeId` thành `Order Type Id`, `totalBarrelQuantityByDocument` thành `Total Barrel Quantity By Document`.
   - Thuộc tính boolean `isRain: false` được từ điển dịch thành `Thời tiết mưa`, nhưng giá trị lại in thẳng chuỗi `"false"`.
   - Không có danh sách đen (blacklist/whitelist) để loại bỏ các trường kỹ thuật backend gửi kèm (như `Send To`, `Loại in QR`, `Link Id`), khiến khung chi tiết nhìn như một bảng trích xuất dữ liệu thô.

---

### 3. Tóm tắt kết luận

Các giao diện chi tiết không dùng chung mà mỗi phân hệ lại hiển thị một kiểu xuất phát từ **3 tầng nguyên nhân**:
1. **Tầng routing/shell:** Tồn tại lệnh rẽ nhánh cứng `if (salesOrder)` trong [`erp-detail-sheet.tsx`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/erp/erp-detail-sheet.tsx#L13) và `["sales-orders", ...].includes(module)` trong [`tab-erp-screen.tsx`](file:///c:/Users/Tuyen/Projects/Medcom/apps/medcom-sites/components/untitledui/tab-erp-screen.tsx#L2096).
2. **Tầng bố cục (Layout):** Phân hệ Bán hàng được đầu tư component chuyên sâu (`SalesOrderForm` với 2 card độc lập, tab hàng hóa & tab lịch sử, thanh nút thao tác dưới chân), trong khi các phân hệ khác chỉ dùng một vòng lặp `Object.keys()` generic chắp vá.
3. **Tầng dữ liệu (Data mapping):** Cơ chế generic auto-render của các phân hệ ngoài Bán hàng không có bộ phân nhóm trường, thiếu danh mục lọc trường kỹ thuật và thiếu từ điển nhãn tiếng Việt cho các phân hệ Kho/Điều chuyển.