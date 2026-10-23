# T-006B — inherited generic editor fields, review 2

Scope: presentation in the default MedcomApp. The leader's option C in `docs/tasks/T-006B.md`, “Review lần 1” / “Phạm vi cho lượt sửa 2”, supersedes the earlier instruction to add every editable key to static config. Baseline: local `ui-sync/main` at `57618a79ab8258c0e01119a4ecee4d8d4138e774`; reviewed revision-1 WIP: `20293cd`, merged into the current `cf63c0b` head. Revision 2 performs no commit, push, merge, deployment or DB connection.

Historical approved archive identities remain in `docs/SOURCE_BASELINE.md`; the supplementary guide is reconciled in `docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md`. Archive access/rehashing and real ERP/DB runtime acceptance in this task are UNKNOWN. This document records repository code and synthetic tests, not new ERP/DB facts.

## API config and inherited editor boundary

`apps/medcom-sites/lib/erp/document-detail/controllers/erp-detail-rules.ts`, declarations `DEFAULT_EDITABLE_HEADER_KEYS`, `EDITABLE_HEADER_BY_MODULE`, `editableHeaderKeys`, `requiredEditKeys`, `editLookupId` and `SAVE_HEADER_BY_MODULE`, remain the source of existing edit/save behavior. Baseline `components/erp/erp-document-detail-body.tsx:startEditing` / `handleSaveHeader` initialize and save every editable key even when absent from the response. Revision 2 does not change those functions or rules.

All unsupported revision-1 additions were removed from `modules/{purchase,inbound,transfer,machine,qr}.ts`. Both `tests/fixtures/document-detail-header-keys*.json` files are restored exactly to `ui-sync/main`, including removal of every `editorHeader` array. Static config/fixture test assertions are unchanged; the proposed `provenance.patch` is discarded. Compared with `ui-sync/main`, the only remaining module-config additions are `slots: ["lines-editor"]` on `purchaseRequestDetailConfig` and `purchaseOrderDetailConfig`, because `saveLineKeys` is nonempty. Purchase-request external editing and purchase-order write gating remain in place. **No header fields are added to static config in the final implementation.**

`controllers/erp-detail-model.ts:editableDetailConfig` projects edits onto configured fields/subgroup fields and collects editable keys absent from all groups. Only while `editing`, it appends the runtime group `legacy-edit`, titled **“Trường sửa kế thừa”**. It does not modify the registry config or add API provenance. View mode and discard contain no such group. Inputs still use `editLookupId`, the existing date/money/text rule and `requiredEditKeys`.

The fixed table `erp-detail-rules.ts:LEGACY_EDIT_LABELS` contains only `documentDate` → “Ngày chứng từ”, `objectId` → “Khách hàng”, `deliverDate` → “Ngày giao hàng”, `contractId` → “Mã hợp đồng”, `memo` → “Nội dung”, and `notes` → “Ghi chú”, as required by option C. An unlabelled missing key is omitted; generic tests assert label coverage and fail with the module/key when a required presentation label is missing. There is no English fallback.

| Modules | Keys shown only in the runtime inherited edit group | Evidence |
|---|---|---|
| purchase-approvals | documentDate, deliverDate, contractId, memo | `modules/purchase.ts:purchaseRequestDetailConfig`; default edit keys |
| inbound-requests | deliverDate, contractId, memo | `modules/inbound.ts:inboundRequestDetailConfig` |
| internal-transfer-requests, internal-transfer-pm | objectId, deliverDate, contractId, memo | `modules/transfer.ts:transferRequestDetailConfig`, `transferPmDetailConfig` |
| internal-transfer-batches, internal-transfer-tech, internal-transfer-sa, internal-transfer-accounting, internal-transfer-warehouse-out, internal-transfer-warehouse-in | documentDate, objectId, deliverDate, contractId, memo | Corresponding configs in `modules/transfer.ts`; native batch dates stay separate |
| machine-movements | objectId, deliverDate | `modules/machine.ts:machineMovementDetailConfig`; documentDate already belongs to the normal movement group |
| machine-repairs | deliverDate | `modules/machine.ts:machineRepairDetailConfig` |
| warehouse-qr | deliverDate, contractId | `modules/qr.ts:warehouseQrDetailConfig` |
| sales-qr | deliverDate | `modules/qr.ts:salesQrDetailConfig` |

Purchase-request custom keys and all purchase-order default edit keys already have group definitions in `modules/purchase.ts`. Their external-edit/write gates remain unchanged; this projection does not admit editing. No sales config/controller is changed.

## F-03 — review inherited default edit/save rules with backend later

Source: `erp-detail-rules.ts:editableHeaderKeys`, `requiredEditKeys`, `SAVE_HEADER_BY_MODULE`; `ErpDocumentDetailBody.startEditing` / `handleSaveHeader`; ticket option C, item 4. Modules without a custom list inherit six editable keys and require `documentDate` / `objectId`. The generic save fallback merges the original response header and all edited keys, including nulls for empty inherited fields. Some keys lack static response provenance. This existing behavior remains unchanged; backend write acceptance and the appropriate per-module replacement are UNKNOWN. A later coordinated backend/frontend change must establish each module's edit, required-field and payload contract. Revision 2 only separates the existing inputs visually.

## Tests and actual baseline comparison

File: `apps/medcom-sites/tests/erp-document-detail-view-generic.test.mjs`. All data and API doubles are synthetic.

| New revision-2 test | Assertions |
|---|---|
| `default editors show missing keys only in the legacy edit group, and hide it again on discard` | Mounts machine-movements and internal-transfer-batches; view has no inherited group; edit has Vietnamese labels and required inputs; cancel removes the group and leaves registry config intact. Batches verifies both documentDate/objectId in that group. Movement verifies objectId there and exactly one existing documentDate in its normal group. |
| `default editor saveDocument headers match the ui-sync/main baseline, including required and null fields` | Both modules block save with missing required data; filling only the date still blocks on customer; filling customer calls saveDocument once with exactly the baseline header, trimmed notes, normalized date, preserved base keys and null optional inherited values. lineChanges stays empty. |

Local proof: `.test-runtime/T-006B-round2/compare-main.mjs` bundles the actual baseline body and baseline rules read via `git show` at the pinned SHA, alongside the current body. Both run the same inputs/interactions. Result: **PASS**, exact equality of headers passed to mocked `saveDocument` and the same required-field guards for both modules. Output: `.test-runtime/T-006B-round2/compare-main.log`. These artifacts are gitignored. The regression test uses explicit golden headers so CI does not require historical Git objects.

The two existing generic assertions changed as follows; config-test assertions were not relaxed:

```diff
- every inherited editable key exists in static config groups
+ every inherited editable key has an editable runtime projection; registry is unchanged
- fixture.editorHeader equals inherited draft keys absent from API headers
+ fixture has no editorHeader; every static field has API provenance
+ runtime legacy group equals editable keys absent from configured groups
+ every legacy key has a fixed Vietnamese label; view mode has no legacy group
```

## Handler review and lint

Revision 2 leaves `components/erp/erp-document-detail-body.tsx` unchanged from the reviewed revision-1 head. The required/edit/save rules are unchanged; `LEGACY_EDIT_LABELS` is the only addition to `erp-detail-rules.ts`.

| Handler / rule | Revision-2 disposition |
|---|---|
| handleOpenDetail | Unchanged loading, resets, sequencing and late-response handling |
| handleLoadMoreLines | Unchanged paging, append and error/finally behavior |
| startEditing | Unchanged external purchase-request handoff and draft initialization |
| patchEditLine | Unchanged line-draft updates |
| handleSaveHeader | Unchanged required checks, validation, serialization, payload, idempotency and outcomes; baseline comparison above |
| handleDeleteDocument | Unchanged two-step delete and command handling |
| handleMenuClick | Unchanged edit/delete/workflow routing |
| handleCommandOutcome | Unchanged feedback, refresh and notifications |
| handleExecuteQrScan, recoverQr | Unchanged scan/lookup/retry custody and pending intent |
| handleConfirmPromptAction | Unchanged generic action confirmation |
| handleConfirmReturnStep | Unchanged return-step confirmation |
| handleConfirmSendSa | Unchanged SA confirmation |
| handleConfirmSendPm | Unchanged PM confirmation |
| handleCloseDetail, open/close guards | Unchanged callback and pending/busy sales-QR guard |
| handlers.onAction, onFieldChange, onLookupSelect, onLookupMultiSelect | Unchanged adapter dispatch and draft updates |

No new lint issue was introduced or suppressed in revision 2. Revision-1 fixes remain: clock/random key creation in event-only `editCommandKey` (purity); asynchronous loader subscription and effect-event camera feedback (set-state-in-effect); complete callback/effect dependencies (exhaustive-deps); removal of unused presentation helpers/imports and replacement of never-set PM/SA/return-step option/loading states with initial constants (no-unused-vars). Evidence: body diff against `ui-sync/main` and removal of its exception from `eslint.config.mjs`.

The optional comparison config in `erp-detail-model.ts` still retains the old QR comparison columns from `536701c:apps/medcom-sites/components/erp/erp-document-detail-body.tsx` (“QR Comparison Table”): itemId (“Mã VT”, with itemCode/line identity fallback), lot (“Lô SX”), expireDate (“Hạn dùng”), storeHouseId (“Kho”), quantity (“Số lượng”). It is separate from API detail.sections; only detail.comparison supplies rows. Revision 2 does not change it.

## Validation — 2026-10-23

Commands ran in `apps/medcom-sites` with Node **v24.22.1**. Generated log paths below are relative to that directory.

| Check | Observed result / evidence |
|---|---|
| node -v | v24.22.1 |
| pnpm typecheck | PASS, exit 0 |
| pnpm lint | Baseline: 2 errors (tests/commerce-list.browser.mjs:37, tests/proxy-policy.test.ts:6) and 1 warning (components/erp/grid.tsx:88), exit 1 |
| All nine ticket test files, node --experimental-strip-types --test ... | **133 tests / 133 pass / 0 fail**, exit 0; `.test-runtime/T-006B-round2/focused-tests.log` |
| node scripts/test-erp.mjs --contracts-only | **731 tests / 718 pass / 13 fail**, exit 1; `.test-runtime/T-006B-round2/contracts.log`. All 13 unique failure names match `D:/Projects/Medcom/.agent-runs/baseline/contracts-failures.txt` exactly, with no additions or omissions. |
| pnpm build | PASS, exit 0; `.test-runtime/T-006B-round2/build.log` |
| Actual baseline/current payload comparison | PASS for both modules; `.test-runtime/T-006B-round2/compare-main.log` |
| Static cleanup / diff checks | `git diff --check` passes; removed-helper and body lint-exception searches return 0 matches; added code contains no any/TS suppression/eslint-disable. Module/fixture diff against ui-sync/main contains only the two lines-editor slots. |

The 13 contract failures and lint baseline remain disclosed failures. No tests, build configuration, package files, backend, schema or database settings were changed to bypass them.

File-scope boundary: `git diff HEAD --name-only` contains only the 11 permitted revision-2 files. The requested committed-branch comparison `git diff --name-only ui-sync/main...ui-sync/T-006B` still includes the leader's pre-existing `docs/tasks/BOARD.md` / `docs/tasks/T-006B.md` changes; neither was edited in this run. Because this handoff is uncommitted, that three-dot comparison also continues to describe the revision-1 WIP rather than the revised working tree.
