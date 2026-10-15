# I93 — authenticated ERP presentation permissions

Owner direction, 2026-10-15: replace the I92 always-enabled UI test presentation with actual logged-in ERP permissions for screens, CRUD and business buttons. BE only; no FE, schedule, production data or deployment changes.

Base: `8747d37fc574c71a5a15076cb3b24ccd70d300c4` (PR #159). Both current-main workflows passed: Backend foundation `38669670944`, CI policy and Windows backend `38669670899`. Reused clean worktree after confirming PR #159 merged and source/base tree equality; new isolated branch, not a scheduled claim takeover.

Evidence scope: `docs/SOURCE_BASELINE.md`, `docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md`, `src/backend/Medcom.Infrastructure/SqlLegacyPolicy.cs`, `Erp/ErpSqlAuthority.cs`, `src/backend/Medcom.Application/ErpActionRules.cs`, and the finite screen/button catalogs in `inventories/erp/20261010` and `20261011`. No new raw-archive verification or live business write is claimed. Native permission objects: `SY_User`, `SY_UserGroup`, `SY_UserGroupPermisstion`, `SY_UserPermisstion`, `SY_Menu`, `SY_UserBranch`, `CF_BranchTbl`.

Scope: authenticated branch-scoped permissions manifest; actual per-document button presentation; tests and purpose-only FE handoff. Commands retain native, branch, state, transaction and target acceptance checks. Validation/integration/deployment: PENDING. Goal #45 remains open.
