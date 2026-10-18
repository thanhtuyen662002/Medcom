# Purchase request create/edit presentation — 2026-10-16

Owner request: reuse the create form when editing a purchase request, use mobile steps
Thông tin → Chi tiết → Xem lại, support adding/updating/removing detail rows, and replace
the Dòng hàng label across frontend screens with Chi tiết.

## Contract evidence

Live `https://api-medcom.bms79.com/api/contracts/openapi.json` was read with PowerShell
Invoke-RestMethod on 2026-10-16; the browser retrieval tool could not open that URL.
The `/api/erp/purchase-requests/save` request references `Erp_purchase_requests_save`.
Its `lineChanges.items.oneOf` contains `Erp_purchase_requests_line_add`,
`Erp_purchase_requests_line_update`, and `Erp_purchase_requests_line_remove`.
Add uses a clientLineKey and values, Update uses a persisted lineId and values, and
Remove uses a persisted lineId without values. The maximum changes per save is 500.
The exact writable schemas are `ErpPurchaseRequestHeaderInput` and
`ErpPurchaseRequestLineInput`; local definitions are in
`src/backend/Medcom.Contracts/ErpDraftFields.cs`.

## Implementation evidence

- `components/untitledui/purchase-request-create-sheet.tsx`: one create/edit presentation,
  seeded edit fields, stable persisted line IDs plus separate client keys for added rows,
  full paginated read with document/branch/token/page/duplicate checks, native save grant,
  explicit Add/Update/Remove diff, fixed footer, mobile steps, and review of header/line
  fields plus added/removed counts. Unchanged source values are retained; derived totals
  are displayed as previews and are not sent as writable line fields. Uncertain saves
  retain their original body/key for explicit retry rather than allocating new additions.
- `components/untitledui/tab-erp-screen.tsx`: the purchase-request Sửa action opens that
  shared editor. Cancel returns to the retained detail; a confirmed save reloads detail/list.
- Frontend component headings, step labels, empty states, accessibility labels and help
  prose now use Chi tiết. `lib/help/guides.ts` describes the updated edit path.

The separately retained `/api/purchase-requests/*` pilot adapter and its existing-document
write restrictions are unchanged. This UI uses the active `/api/erp/purchase-requests/*`
screen contract; it does not broaden backend grants or alter SQL/business rules.

No tests, build, typecheck, authenticated saves or runtime UI validation were run, per
the owner's manual-testing instruction. Target acceptance is UNKNOWN until manual use.
