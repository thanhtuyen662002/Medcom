# I86 — CUD presentation and database captions, 2026-10-12

The owner requested always-enabled CUD controls for interface testing and database-backed Vietnamese captions, with empty strings for unverified captions. The owner then explicitly selected: “Luôn bật nút; giữ kiểm tra khi ghi DB”. Scope is therefore presentation only: existing CUD controls remain clickable; actual command permission, document state/lock, target qualification, concurrency and transactional checks remain authoritative. FE source and MedData business records/schema are outside this patch.

## Verified source and implementation boundary

A SELECT-only serializable MedData audit, rolled back, observed Vietnamese captions for all 19 existing ERP screen IDs from exact `dbo.SY_FrmLstTbl.FormID` bindings and `CaptionVN`. The audit also checked each exact `dbo.SY_Menu.MenuID/FormName/VN` binding for a fallback; the form source supplied all 19 titles. Native button captions come from exact `dbo.SY_FrmCfg/FID/LYS1/SubID/BT` addresses. Of 95 existing action definitions, 42 had a verified native caption; 53 have no caption at that address and will use an empty string rather than a generated label.

Evidence: private `I86-cud-buttons-captions/Program.cs`, `captions.json` and `CaptionProbe.csproj` in the owner's private agent artifact store. Only selected technical form/control IDs, Vietnamese labels, row counts and provenance are published in `inventories/erp/20261012/captions.json`; SQL and connection settings remain private. No real document rows were selected. These observations do not establish runtime/business acceptance.

Retain the archive identities in `docs/SOURCE_BASELINE.md`. This is the separately authorized current live-data intake, not an archive-equivalence claim. The sanitized WinForms guide reconciliation remains supplementary historical evidence.

`SqlErpScreenCommands.Run` currently relies on `ErpActionRules.Evaluate` for actual command admission. The always-enabled presentation must use a separate projection, never alter that authoritative evaluation. Screen metadata presentation must use a copy when removing CUD lock expressions/native hiding. Native workflow buttons continue to reflect their existing state rules. Unknown/unsupported operations must not be added just to expose a button.

## Owned base CI audit before product changes

Source base is `a19fc301d4b7068940dad68f277d302d6e9db792` (merged #153). All seven PR checks had passed before integration, and post-merge BE/container/policy runs passed. Post-merge FE run `38219360796` failed only its Windows `request-qr-search` browser gate at the test watchdog, while the identical source tree had passed that gate before merge and the post-merge Linux job passed. The failure remains unclassified until the preserved same-head failed-job rerun completes; do not call it repaired while pending. No FE files or CI checks are changed to evade it. Source inventory and test planning continue while this rerun drains; product mutations wait for the CI result.

## Acceptance

Verify always-enabled/visible CUD action responses on existing ERP modules and unchanged enforcement for command calls against locked/stale/unauthorized/unqualified cases. Check captions against the finite audited resource, unknown/ambiguous/invalid caption fallback and payload/API invariants. Retain all 243 operations and full-field/page behavior. Record current-head tests, exact head/base CI, merge and VPS deployment/handoff status on the lease before claiming completion. Canonical goal #45 remains open.
