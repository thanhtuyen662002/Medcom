# I65: qualified item identity presentation

## Baseline and scope

- Deployed main: `cbb1c8acf718c251944ba132c943ac54631a351e`.
- Exact source tree: `8224f8d805c1a85798eedd65e6d7ea376be8d225`.
- Presentation-only integration of the existing qualified `ItemDisplayContext` and `ItemIdentity` renderer.
- Production paths: `components/erp/purchase-request-screen.tsx`, `mobile-request.tsx`, `mobile-request-lines.tsx`, `inbound-request-readonly.tsx`, `workspace.tsx`, and `lib/erp/item-display.ts`, under `apps/medcom-sites/`.
- Regression additions extend the already registered `apps/medcom-sites/tests/item-display-context.test.mjs`; no runner changes.

## Source-backed diagnosis

`src/backend/Medcom.Infrastructure/PurchaseRequests/SqlPurchaseRequestQueries.cs` returns `ItemDisplayContextReader.ReadAsync` output beside the original aggregate and state token. `src/backend/Medcom.Contracts/PurchaseRequestWorkspace.cs` and `src/backend/Medcom.Api/PurchaseRequestEndpoints.cs` preserve that sibling context. `apps/medcom-sites/lib/erp/purchase-request-api.ts` validates exact document, branch, state token, status, lock and ordered line/item bindings before retaining the context. The purchase host already retains the complete decoded readback.

Before this slice, production purchase cards received only a command snapshot, and the full-read table rendered only raw aggregate fields. The paged inbound reader and workspace detail likewise rendered only `itemId`. The existing `components/erp/item-identity.tsx` had no production callers. Therefore even qualified, populated display metadata could not appear on these surfaces. This diagnosis does not establish the availability of any particular live master-data row. No real document data, database access or credential access was used here.

The field mappings remain those recorded in `docs/erp/ITEM_DISPLAY_BINDING_EVIDENCE.json`: raw document ItemID, qualified purchase master ItemCode or inbound document ItemCode, master ItemName, and master base Unit. No manufacturer name, Model, alternate unit or dropdown value is substituted.

## Changes and invariants

- Purchase existing-line cards (including review/read-only presentation) and the full-read item cell show the same four labelled identity fields together.
- Inbound paged read-only cards and workspace paged desktop/mobile details use that same renderer and exact qualification helper.
- Shared binding factories derive expected context bindings from the current readback, not from the metadata being qualified.
- Purchase display metadata travels through a separate presentation prop. The retained editor baseline must match its scope, document, state token, branch and status; the shared qualifier checks all context fields and exact line/item identity.
- The existing command adapter still drops read-only context after a confirmed command. A separate presentation freshness flag blocks old display props after every accepted receipt, including canonical no-op Saves whose state token is unchanged. Only the existing adopted read revision or a different document load clears that flag. A fresh authorized read supplies the display context.
- Existing parent read/presentation fences remain in control. Purchase identity groups are also omitted when presentation is masked. Current page/selection/authority checks in the paged readers are unchanged.
- Missing, null, unavailable, missing-reference, ambiguous or invalid metadata yields explicit unavailable text. Empty source strings remain distinct and display as `Trống`.
- Raw ItemID, internal row identities, decimal strings, NULL values, equality tokens, command snapshots, dirty state, frozen command DTO/body bytes and reconciliation custody are unchanged. Internal line IDs remain absent from identity presentation.
- No additional requests, item lookups, writable fields, dropdown choices, DTO fields, backend changes or database operations. Generic unlocked editable callers retain their existing `RemoteLookup` beside any supplied read-only identity group; display metadata does not remove editing capability.
- Inbound editable draft presentation is outside this slice: its command bridge does not yet expose a proved read-only metadata presentation contract. Its existing command/read custody is unchanged.

## Verification

Observed locally with Node `v24.19.0` and the baseline locked dependencies:

- `node --test tests/item-display-context.test.mjs`: **25 passed**, 0 failed, 0 skipped. Existing strict decoder/binding/NULL/precision/byte-invariance coverage is retained. Eight added tests execute real purchase editor/full-read rendering, the actual purchase host, the actual command adapter receipt transition, the inbound paged reader, and the workspace detail's desktop/mobile identity groups. Synthetic React transport exercises stale document/token/branch/status/lock/page/line/item/scope inputs, rights/presentation masks, page/selection transitions and explicit unavailable/empty text.
- `node --test tests/request-screen-controls.test.mjs`: **54 passed**, 0 failed, 0 skipped. Existing editor, rights, navigation, command custody and customization regressions remain green.
- `tsc --noEmit --incremental false`: **passed**.
- Targeted ESLint for all seven changed application/test files: **passed**.
- Full `eslint .`: **passed**, with the existing `grid.tsx:86` TanStack Virtual React Compiler compatibility warning (0 errors).

The added tests double only DOM primitives and the focus hook; production screen, editor, adapter, decoder, binding and identity rendering execute. They are synthetic React integration tests, not browser-layout, real ERP, SQL, deployment or physical-device acceptance. Full browser/required aggregate and production visual acceptance were not run in this worker; the coordinator retains those gates. No publication, merge or deployment was performed.

## R2 independent-review correction

The initial presentation branch selected `ItemIdentity` instead of `RemoteLookup` whenever the optional metadata prop was supplied. Existing-only purchase hosts were unaffected because their items are locked, but a generic editable/unlocked caller would have lost its existing selector. R2 makes the qualified identity group additive and preserves the original lookup whenever both `readOnly` and `lockItem` are false. Locked/review callers continue to show identity without lookup.

The actual-component regression mounts production `MobileRequestLines` and `RemoteLookup`, verifies the enabled selector and clear-button callback, exercises the selected-value callback, checks disabled/locked/review states and confirms metadata alone does not invoke the catalog adapter. It preserves the unchanged item-change patch and does not add metadata to draft or command values. R2 changes only `mobile-request-lines.tsx`, the already registered item-display test, and this checkpoint relative to the initial frozen I65 overlay.

## R3 same-token receipt freshness correction

Independent review reproduced a canonical no-op Save (`1` edited to `01`) whose validated receipt retained the same state token. The adapter correctly cleared metadata and required a fresh read, but token comparison alone could allow a standalone editor's old display props to remain visible. R3 adds a display-only freshness fence set when the editor adopts any confirmed receipt and cleared by its existing adopted read-revision/document-load path. Snapshot shape, values, command state, adapter serialization and receipt handling are not changed.

The added actual-adapter/editor test confirms an empty canonical `lineChanges` array and unchanged receipt token, verifies old metadata and a replacement metadata object both stay unavailable without an adopted read revision, then proves the fresh read restores identity without making the draft dirty or sending another command. R3 includes the R2 generic-lookup correction. Relative to frozen R1, only `mobile-request.tsx`, `mobile-request-lines.tsx`, the existing item-display test and this checkpoint change.
