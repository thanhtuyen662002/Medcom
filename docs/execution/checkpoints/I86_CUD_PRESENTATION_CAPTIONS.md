# I86 — CUD presentation and database captions, 2026-10-12

The owner requested always-enabled CUD controls for interface testing and database-backed Vietnamese captions, with empty strings for unverified captions. The owner then explicitly selected: “Luôn bật nút; giữ kiểm tra khi ghi DB”. Scope is therefore presentation only: existing CUD controls remain clickable; actual command permission, document state/lock, target qualification, concurrency and transactional checks remain authoritative. FE source and MedData business records/schema are outside this patch.

## Verified source and implementation boundary

A SELECT-only serializable MedData audit, rolled back, observed Vietnamese captions for all 19 existing ERP screen IDs from exact `dbo.SY_FrmLstTbl.FormID` bindings and `CaptionVN`. The audit also checked each exact `dbo.SY_Menu.MenuID/FormName/VN` binding for a fallback; the form source supplied all 19 titles. Native button captions come from exact `dbo.SY_FrmCfg/FID/LYS1/SubID/BT` addresses. Of 95 existing action definitions, 42 had a verified native caption; 53 have no caption at that address and will use an empty string rather than a generated label.

Evidence: private `I86-cud-buttons-captions/Program.cs`, `captions.json` and `CaptionProbe.csproj` in the owner's private agent artifact store. Only selected technical form/control IDs, Vietnamese labels, row counts and provenance are published in `inventories/erp/20261012/captions.json`; SQL and connection settings remain private. No real document rows were selected. These observations do not establish runtime/business acceptance.

Retain the archive identities in `docs/SOURCE_BASELINE.md`. This is the separately authorized current live-data intake, not an archive-equivalence claim. The sanitized WinForms guide reconciliation remains supplementary historical evidence.

`SqlErpScreenCommands.Run` currently relies on `ErpActionRules.Evaluate` for actual command admission. The always-enabled presentation must use a separate projection, never alter that authoritative evaluation. Screen metadata presentation must use a copy when removing CUD lock expressions/native hiding. Native workflow buttons continue to reflect their existing state rules. Unknown/unsupported operations must not be added just to expose a button.

## Owned base CI audit before product changes

Source base is `a19fc301d4b7068940dad68f277d302d6e9db792` (merged #153). All seven PR checks had passed before integration, and post-merge BE/container/policy runs passed. Post-merge FE run `38219360796` failed only its Windows `request-qr-search` browser gate at the test watchdog, while the identical source tree had passed that gate before merge and the post-merge Linux job passed. The original failure was preserved; the same-head failed-job rerun (attempt 2) passed both FE jobs before product edits began. The underlying timeout cause remains UNKNOWN. No FE files or CI checks were changed to evade it. Source inventory and test planning continued while the rerun drained.

## Delivered presentation

`ErpActionRules.ForDisplay` supplies always-visible/enabled states for the 48 existing CUD controls, with no lock reason, and copies screen definitions without CUD hide/lock expressions. It does not modify `ErpActionRules.Evaluate` or `SqlErpScreenCommands.Run`, which still enforce actual command admission. The original catalog definitions, state tokens, raw locked/status data, native grants and write qualification stay intact. Workflow/read/print/paste action rules are unchanged.

Existing purchase-request read responses also enable their edit controls (`WriteAvailable`, `CanSave`, `CanAddLines`) in response copies only. Legacy command admission resolves its own provider independently, retains state/permission/qualification checks and remains separate from these display flags. No unsupported command route is added; current CUD integration uses `/api/erp/purchase-requests`, as the existing replacement-route handoff already requires.

`ErpCaptionCatalog` serves the audited labels without an extra DB request on each HTTP call. `ErpScreenCatalog` uses these captions for all descriptions and states; unknown/missing/ambiguous/invalid/unsourced captions return `""`. All 19 observed form titles are available; 14 differ from the prior generated captions. All 42 native button labels are retained from the exact observed BT source, while 53 unsourced standard/derived controls return empty. FE supplies approved business labels for empty captions. No column captions are fabricated. The FE purpose-only handoff generator now uses the same finite caption inventory.

## Acceptance

Verify always-enabled/visible CUD action responses on existing ERP modules and unchanged enforcement for command calls against locked/stale/unauthorized/unqualified cases. Check captions against the finite audited resource, unknown/ambiguous/invalid caption fallback and payload/API invariants. Retain all 243 operations and full-field/page behavior. Record current-head tests, exact head/base CI, merge and VPS deployment/handoff status on the lease before claiming completion. Canonical goal #45 remains open.

Observed local validation: Release build with analyzers and 129 targeted regressions passed. Source-catalog Python tests: 57 passed; BE Python tests: 12 passed. Static API reconciliation remains PASS with 243 operations, 118 full document columns and 1,516 ERP screen columns. Targeted tests cover all 19 modules, rejection by actual admission despite enabled controls, immutable screen definitions, authenticated/revoked screen metadata, old read flags versus actual rejected commands, exact caption bindings and empty fallback. Full-suite/current-head CI results are recorded on the PR before merge. No production CUD/DDL or VPS deployment was performed.
