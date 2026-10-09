# I61 — Header shortcut and shared detail-action layout

## Boundary and exact source

- Upstream base: `884be183160d0ea1e5c2a8d8ce5e20431dd55d6f`.
- Exact baseline tree: `070b46760f043cc04d9f48b341802c8c163c7f44` (844 reconstructed file blobs checked against the published tree by the source-verification worker; independently confirmed with local `git write-tree`).
- Bounded I61 admission: Draft PR #113, control commit `7916e8e28690871fd80808e5bb599c15566dd469`.
- This candidate changes shared presentation and its tests only. It does not change API requests, business permissions, SQL, command construction, authority evidence, navigation guards, original-intent custody or reconciliation.
- The separately owned I60 error-code allowlist and I62 customization lifetime changes are not included. Their edits to shared files must be composed and verified by the sole integrator.

## Observed problem and repair

The owner's current cloud-browser captures were inspected directly. At a 1180px viewport, the search badge protruded beyond its button. In the inbound detail, Close and Verify were adjacent ungrouped controls. These captures support the layout diagnosis, not acceptance of this unpublished candidate.

- `WorkspaceSearch` owns the reusable trigger presentation. Its label can shrink/ellipsize while the icon and complete shortcut remain inside the button. Windows and Linux show `Ctrl+K`; Apple platforms show `Cmd+K`. The accessible name remains available when the mobile label is hidden. The footer uses the same platform hint.
- The existing Workspace keyboard listener, presentation guard, detail exclusion, command modal and focus restoration are unchanged. Both Control+K and Meta+K continue to route through that guarded listener. The lead separately observed Control+K opening the screen finder in the current live application; this is baseline evidence, not candidate acceptance.
- `RecordDetailToolbar` groups existing read/recovery controls with an 8px wrapping gap. Inbound and purchase use the same primitive; action callbacks and their eligibility conditions are preserved.
- The shared dialog header groups its existing navigation/close controls. Short desktop dialogs fit their content subject to the previous maximum height; mobile retains the full viewport. All shared purchase, inbound and order detail surfaces inherit the same body spacing and header rules. Write actions retain their footer portal, explicit form owners and existing callbacks.
- Inbound Back and Close remain separate because their existing host callbacks are distinct. This patch does not silently substitute one navigation intent for the other.

## Verification observed on this candidate

Toolchain: Node `v24.19.0`, checked-in Next `16.3.4`, TypeScript `5.9.3`, esbuild `0.28.0`; existing locked dependencies copied into a physical candidate-local `node_modules`. Package manifests, lockfiles, test runner and workflows are unchanged.

- `node node_modules/typescript/bin/tsc --noEmit`: PASS.
- Scoped ESLint on all changed TSX and test files: PASS, no output.
- `node --test tests/shared-screen-ui.test.mjs`: 11/11 PASS, including platform labels, accessible trigger metadata, shared grouping and CSS contracts.
- Six selected non-native `request-presentation.browser.mjs` cases: 6/6 PASS, including the actual composed Workspace fixture with Tailwind/CSS-module compilation and existing focus-hook regressions.
- `node node_modules/next/dist/bin/next build`: PASS, including TypeScript and prerendering.
- `node scripts/test-erp.mjs --contracts-only`, with the installed Chromium and locked browser toolchain explicitly selected: 561 executions, 557 PASS, 4 FAIL, zero skips. All four failures stop at Chromium startup (`process_singleton_posix.cc`, `socket() failed: Operation not permitted`) before a page is created. No product assertion failed in those four cases. This is not a passing aggregate.
- Focused `record-dialog.browser.mjs`: fixture compilation succeeded; native execution is blocked by the same browser startup restriction. No browser workaround or sandbox disabling was used.

The initial aggregate also found that reused dependencies were a symlink rather than a physical root. The dependencies were copied into this isolated candidate and the aggregate was rerun; that packaging assertion now passes. Earlier intermediate logs are not final acceptance.

## Required native acceptance

Enhanced native tests are present but NOT RUN successfully here:

- Header icon/text/badge separation and screenshots at 1024, 1180 and 1440px.
- Actual Control+K and Meta+K opening/focus/dismissal restoration through Workspace.
- Detail action separation, wrapping and 44px controls at 320/390px.
- Compact desktop height; short and long mobile fullscreen at both 320 and 390px; positive body viewport and actual scrolling for long content while header/footer remain visible and stationary; awaited restoration of the long fixture; footer form ownership, authority masking, dirty-close and nested-modal behavior.

Exact-head hosted browser gates and after-screenshot inspection remain required. No production deployment, live after-image, Windows runtime, SQL/runtime acceptance, publication or merge is claimed by this preparation.
