# Sales-order creation field reconciliation — 2026-10-16

Owner-requested frontend changes only. No backend schema/SQL, deployment or production data changes.
Latest owner direction: manual form testing by the owner; no further automated tests/builds were run for this change.

## Header

`components/untitledui/tab-erp-screen.tsx` now separates `memo` (Diễn giải) and
`ghiChuDonHang` (Ghi chú đơn hàng), adds the manager lookup and attachment link,
and displays customer Address/TaxCode from the selected customer. The owner subsequently
removed the separate customer-name, phone and image/document-link fields.

Contract selection links ObjectID/ObjectName/EmployeeID and resolves the exact customer
through the scoped customer options query; customer selection loads all bounded pages
of that customer's contract options. Item options carry `Master.ContractID` and `UserAutoID`.
Changing contract/customer clears incompatible draft lines; stale customer/lookup responses are ignored.

Evidence: `inventories/erp/20261010/six-screen-catalog.json` (repository root,
`screens[id=sales-orders].lookups`: ContractID, ObjectID and grdChitiet.ItemID).
The raw approved archives were not re-opened in this UI change; no new legacy-runtime claim is made.

## Detail columns

The shared `lib/erp/sales-order-lines.ts` field list follows the owner's supplied grid,
with the later explicit removal of the separate Tên hàng / dịch vụ field and (owner
direction, 2026-10-18) the removal of ĐVT2, Hệ số ĐVT and Số lượng 2 so the list matches
the supplied ERP grid image:
Mã hàng, Mã hàng NSX, ĐVT, Số lượng, Đơn giá, Số tiền, % Chiết khấu, Tiền CK, % Thuế,
Tiền thuế, Tổng tiền, Tổng số lượng HĐ, Đã XUẤT hàng, Số lượng VAT, Diễn giải, Ghi chú.

`components/erp/sales-order-line-editor.tsx` renders these columns in creation.
`components/erp/sales-order-form.tsx` reuses exactly the same columns for saved detail.
The owner's correction removes the previous extra Qui cách / Qui cách 2 columns;
only fields in the supplied image are shown. Mã hàng NSX reads ItemCode / manufacturerItemCode.

The latest UI direction replaces horizontal tables with per-line cards, following
`components/untitledui/purchase-request-create-sheet.tsx`. The 16 fields render in one
flat responsive grid in the exact ERP column order (Mã hàng … Ghi chú), so field
positions match the supplied grid image and no group leaves empty cells.
Every draft line has its own item picker, which already displays the item name.
The picker spans two columns; the Diễn giải / Ghi chú textareas span the full row.
Saved details and send/approval history also wrap into cards. No fields were added.

On mobile (under 768px), creation follows Thông tin → Dòng hàng → Xem lại with
fixed bottom navigation. Header requirements are checked before entering lines;
each line is checked before review. Switching steps preserves the parent-owned draft,
and a write is dispatched only from final confirmation. Desktop retains the single form.

Choosing an item copies only that selection's source values; missing companions clear
the previous item's values. Quantity uses the returned Quantity, otherwise the existing
new-line default of 1. SoLuongHopDong and DeliveryQuantity remain separate reference values.
Absent API fields remain blank/“—”; their availability in the owner's authenticated runtime is UNKNOWN.

Editable submitted line fields: itemId, quantity, unitPrice, discountPercent,
vATPercent, vATQuantity, dienGiai, notes. Display companions/computed values are not submitted.
Evidence: `src/backend/Medcom.Contracts/ErpDraftFields.cs`, ErpSalesOrderLineInput.

Preview expressions follow `src/backend/Medcom.Infrastructure/Erp/SqlErpScreenEffects.cs`,
Calculate's sales-orders branch: amount = quantity × unitPrice; VAT amount = amount × VATPercent / 100;
total = amount + VAT amount; quantity2 = quantity × unitFactor. Decimal string arithmetic
avoids binary floating-point money conversion and applies no invented rounding.
That backend explicitly leaves disabled discount expressions unimplemented: Tiền CK therefore
uses the supplied ERP value and becomes unknown after an unsupported discount change.
Only a successful backend result establishes saved values; previews are labeled provisional.

## Attachment API update — 2026-10-16

Evidence: live `https://api-medcom.bms79.com/api/contracts/openapi.json`, paths
`/api/erp/sales-orders/attachments` (GET), `/attachments/upload` (POST multipart)
and `/attachments/content` (GET), schemas ErpAttachmentPage/Result/Receipt/Row.
The full upload path is `/api/erp/sales-orders/attachments/upload`.
The contract admits JPG/PNG originals up to 10 MiB, slotId 2, and requires an existing
documentId and expectedStateToken. PDF/Office uploads are not admitted by this contract.

The create UI now offers file selection/camera capture and transient previews. Image
signature, extension and size are checked locally; the server remains authoritative.
After a confirmed create receipt, uploads run sequentially, reading current attachment
permission/state before each new operation. Each uncertain upload retains its original
idempotency key/file/state token for an explicit retry. Confirmed uploaded files are skipped.
If attachment processing fails, the UI retains the created document ID and retries only
its attachments; it does not create another order. A create with an uncertain response
also retains its exact original request/key for explicit continuation.

The BFF admits only these specific sales-order attachment routes. Multipart image bytes
and the browser boundary are preserved; JSON-only handling for existing commands remains.
The upload body budget is 12 MiB (original/optional preview plus form overhead); per-file
limits and native grants are still checked by the backend. Origin, CSRF, cookies and read
scope are retained. Saved detail reads authenticated attachment metadata/preview content
instead of presenting a local-only image as an uploaded document.

Owner requested manual form testing: no automated tests/build/typecheck or authenticated
upload/write was executed in this change. Actual target upload acceptance remains UNKNOWN.

## Saved-detail UI alignment — 2026-10-16

Presentation references: `components/erp/purchase-request-screen.tsx`,
`components/erp/mobile-request.tsx`, `components/erp/record-dialog.tsx`,
`components/erp/request-detail-dialog.tsx`, and `components/erp/request-presentation.tsx`.
Sales-order saved detail now reuses that record shell, header/status/secondary-action
hosts, sections, field controls and fixed action footer. Existing non-sales sheets keep
their previous presentation through `components/erp/erp-detail-sheet.tsx`.

The saved order groups general dates/branch, customer/contract, responsible employees,
notes, line/history cards and authenticated attachments. The redundant customer-name
box and narrow image sidebar are removed. Each line keeps the current 19 fields in
paired rows; item names appear in collapsible row headings.

Owner refinement: saved detail opens in view mode with label/value pairs, not inputs or
lookups. The header contains only document identity, status and dismissal. The footer has
Sửa (subject to the native save grant) and a compact secondary-action button. That button
opens a separate sheet for contract information, send-PM, recall and refresh, preserving
native action visibility/enabled states. In edit mode the footer shows Hủy sửa / Lưu thay đổi;
cancel restores the loaded header/clears selected choices, and a successful save reloads
the saved record in view mode. Failed saves retain the editable draft. Save requires an
explicit edit mode and a positively visible/enabled save action; missing actions grant no
edit mode. Workflow mutations are blocked while editing. Internal document search was
removed; document selection stays in the outer list. The host keys each order editor by
branch/document identity so switching records starts a fresh view.
No new domain/SQL operation was introduced. No tests/build/runtime UI validation was run,
as requested by the owner; visual/runtime acceptance remains UNKNOWN pending manual use.
