# I62 table customization custody

## Scope and baseline

- Exact source baseline: `884be183160d0ea1e5c2a8d8ce5e20431dd55d6f`, tree `070b46760f043cc04d9f48b341802c8c163c7f44`.
- Admission: draft PR #114, `docs/execution/direct-runs/I62.json`.
- This change concerns the two request-list customization dialogs, shared grid ownership, and focused component regressions. It changes no API, SQL, command grants, login handling, or persistent storage.

## Verified cause

`components/erp/grid.tsx` previously cleared its `settings` state whenever `presentationAllowed` became false. A healthy same-scope workspace observation can temporarily lower that flag without replacing the grid:

- Inbound `workspaceContext` includes the authority observation version. The bridge catches up in a layout effect while retained, independently scoped list rows keep the same grid mounted (`components/erp/inbound-request-screen.tsx`).
- Purchase refreshes its read grant for each new workspace observation. Its retained same-scope rows keep the grid mounted while `busy` or `verifying` disables presentation (`components/erp/purchase-request-screen.tsx`).
- Authority versions are observation sequences, not new login identities (`src/backend/Medcom.Infrastructure/LegacyIdentityAuthority.cs`, `RevalidateAsync`).

An actual-component baseline probe reproduced permanent closure on an advancing inbound observation and on an equal-value purchase observation. The `ErpGrid` instance stayed identical. An equal-version inbound observation did not close it. This is a dialog-intent reset, not the hypothesized healthy-poll table unmount.

## Repair

`ErpGrid` accepts an optional memory-only `customizationScopeKey`, forwarded by `RequestListTable`. The request screens supply their existing verified login/read/list scope. A scoped owner retains only the user's open intent during temporary presentation masking. A memoized owner identity fences captured callbacks across committed A → B → A transitions.

- Dialog visibility still requires current `presentationAllowed`, desktop presentation, and matching ownership.
- Protected portal `hidden`, `inert`, `aria-hidden`, display masking, and current-authority checks remain in place.
- An explicit Close/Escape callback retires only its own intent. A stale opener or stale close callback cannot affect a later owner.
- A different or null owner retires the intent. Current negative reads, lost rights, read-scope changes, missing workspace evidence, logout, and session changes continue to tear down/reset request-grid custody.
- Generic grids without an explicit owner keep their previous close-on-suspend behavior.
- Layouts and unfinished view names remain in the existing mounted-grid memory. Nothing new is written to localStorage, sessionStorage, URLs, history, the API, or the database.

## Verification

On Node 24.19.0:

- Independent review of the revised five-file code/test candidate: no remaining P0/P1/P2 findings. Captured opener and stale Dialog callbacks were independently re-probed after the owner-identity repair.
- TypeScript: passed.
- Targeted ESLint: passed, with the existing TanStack virtualizer compiler warning and no errors.
- `node --test tests/request-screen-controls.test.mjs`: 54 passed, zero failed or skipped.
- Seventeen new focused cases cover both request lists, equal/advancing observations, masked dialog controls, queued opener rejection, retained layout/name, explicit dismissal, current 401/403/409 results, rights/read-scope/workspace-null/logout boundaries, same-grid owner retirement, stale A → B → A callbacks, and the generic-grid default.
- Replacing the four lifecycle production files with the pristine baseline while retaining the new regression tests caused the two healthy-observation cases to fail as expected; the other fifteen passed.
- `MEDCOM_EDGE_PATH=/usr/bin/chromium node scripts/test-erp.mjs --contracts-only`: 573 passed, four failed before browser/UI execution. Chromium could not create its process-singleton socket in this executor (`Operation not permitted`). This is not an aggregate pass.

The regression harness runs the real readers, grid, adapter, and authority logic with synthetic GET responses and DOM primitive doubles. Radix focus/caret/animation behavior, the full required browser matrix, and deployed ERP runtime acceptance remain unverified here. Re-run the required exact-head CI/browser gates after composition, then verify a real background refresh while customization is open. No deployment or production data change was performed by this work.
