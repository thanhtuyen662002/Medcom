# Purchase (mua hàng) create-form field changes — 2026-10-19

Owner-requested frontend changes only. No backend schema/SQL, deployment or production data changes.

Owner request (verbatim): *"Bỏ khách hàng* / Tỷ giá: ko fix (được phép sửa) / Mục đích: bỏ /
Phần mã hàng: hiển thị thêm mã hãng sx / khách nhớ sửa phần này ở mua hàng"*.

## Applied to `components/untitledui/purchase-request-create-sheet.tsx`

This sheet is the module `purchase-requests` create **and** edit form
(`tab-erp-screen.tsx` renders it for `prCreateOpen` and `prEditId`). It is reached from
"Mua hàng → Đề nghị mua hàng (PR)" and was the only form in the app that showed all four
fields named by the owner (`header.ObjectID` labelled "Khách hàng", `header.PurposeID`
labelled "Mục đích", `header.RateExchange` rendered read-only, line `Mã hàng`).

1. **"Khách hàng" removed.** The `LookupField` (`header.ObjectID`) and its ObjectName/Address
   preview paragraph were deleted; the section title changed from "Đối tượng & tiền tệ" to
   "Tiền tệ & giá bán".
   * Kept: `objectId` state is still loaded from the saved document and re-sent unchanged on
     edit, so an existing PR does not lose its stored counterparty when re-saved
     (it stays in the `["personSuggest", …, "objectId"]` preserve loop).
   * New PRs send `objectId: ""` because the BE create contract marks `objectId` required and
     `dbo` `ObjectID` is `NOT NULL` (`inventories/erp/20261010/six-screen-catalog.json`
     purchase-requests `objectId`, nullable: false; openapi `Erp_purchase_requests_create`
     `header.required` includes `objectId`). Whether the ERP accepts an empty string for a new
     PR is **UNKNOWN** — it was not exercised against the live ERP (no credentials, no write
     authorization). If the ERP rejects it, the alternative is an explicit default counterparty
     rather than silently inventing one.
2. **"Mục đích" removed.** The `LookupField` (`header.PurposeID`) was deleted from the header
   grid and from the review ("Xem lại") summary. `purposeId` state is still loaded from the
   saved document and re-sent, so an edited PR keeps its stored purpose. Create sends
   `purposeId: null` (optional in the BE contract, nullable in the DB).
   The free-text field **"Mục đích / Khách hàng"** (`header.PurposeDescOrClient`) was kept —
   only the dropdown named exactly "Mục đích" was removed.
3. **"Tỷ giá" is now editable.** The read-only `<p title="Tự động theo loại tiền, không sửa tay">`
   block was replaced by the shared `TextField` (inputMode `decimal`). Selecting a currency
   still pre-fills the suggested rate (`c.fields.RateExchange`) but no longer locks it. The
   existing validation (`> 0`, numeric) and the red error message are unchanged, and the review
   step shows the edited value.
4. **Line "Mã hàng" now also shows the manufacturer code.** Under the item lookup the line shows
   a labelled `Mã hãng SX:` value read from the selected item's `HangSX` field with `ItemCode`
   as fallback, and the lookup now requests `secondaryFields={["ItemName","Unit","HangSX","ItemCode"]}`
   so the picker rows show them too.
   * Evidence for the field name: the PR item lookup columns are
     `ItemID;ItemName;Unit;HangSX` (`inventories/erp/20261010/six-screen-catalog.json` line 1059-1060);
     sales lines use `ItemCode` for the same "Mã hàng NSX" concept
     (`lib/erp/sales-order-lines.ts`: `itemCode: field("ItemCode") || field("manufacturerItemCode")`).
   * For a **saved** line the stored line values only carry `itemId / model / budget /
     timeRequired / quantity / unitPrice`, so the manufacturer code shows "—" until the item is
     re-picked from the lookup. Documented limitation, not hidden.

## Mirror changes in `components/untitledui/purchase-order-create-sheet.tsx`

The owner asked for the same handling across "mua hàng". The purchase-order sheet
("Đặt mua hàng", `purchase-orders`) has no "Khách hàng"/"Mục đích" fields, so only the two
applicable items were mirrored:

* "Tỷ giá" read-only block → editable `TextField` (same rules as above); currency selection still
  suggests a rate.
* Line "Mã hàng" also shows `Mã hãng SX:` and requests the same `secondaryFields`.

Its required "Nhà cung cấp" (`header.ObjectID`) was deliberately **not** removed: the owner named
"Khách hàng", and a purchase order cannot be stored without a supplier
(`purchase-orders` `objectId` is required by both the create contract and the DB).

## Help content kept consistent

`lib/help/guides.ts` (guide `purchase-requests`) described the old form. Updated: dropped the
"Mục đích" and "Khách hàng *" entries, noted that tỷ giá is suggested but editable, added
"mã hãng sản xuất" to the line step, and removed the customer mentions from the review step and
the "vẫn ở bước Thông tin?" answer. Guide id/count unchanged (`tests/help-catalog.test.mjs` 2/2 pass).

## Verification performed

* `npx tsc --noEmit` — clean.
* `npx eslint components/untitledui/purchase-request-create-sheet.tsx components/untitledui/purchase-order-create-sheet.tsx` — clean.
* `node --experimental-strip-types --test tests/help-catalog.test.mjs` — 2/2 pass.
* `node --experimental-strip-types --test tests/erp-screen-list-load.test.mjs` — 12/12 pass.
* No unit test asserted the removed controls (the create sheets are stubbed in the tab-level tests).

Not verified (owner must reload `http://localhost:3000`): real rendering, a real PR/PO save, and
the empty-`objectId` create behaviour above. No credentials were used and no write was performed
against the ERP.
