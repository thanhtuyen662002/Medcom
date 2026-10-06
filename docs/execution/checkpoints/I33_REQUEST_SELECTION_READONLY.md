# I33: Request selection focus and read-only fallback

## Baseline and ordering

The immutable admission is `docs/execution/direct-runs/I33.json`, rooted at main `4a791d10404b28ede59c51912b0f07fee7a3bd36` (tree `993819b7ec70d56835eeefcc994b5f1ad53df231`). I30 remains frozen. Root composes only reviewed path deltas onto current main; the historical admission is not rewritten for later unrelated merges.

Two independently reviewed steps are required. This checkpoint records **focus-only source preparation**, not runtime acceptance. The inbound read-only fallback is **not implemented** in this step.

## Step 1: explicit Open and Close

- A one-use interaction ticket is created only by an accepted explicit action. Current authority, selection, list identity and committed read readiness must still match before focus moves.
- Open focuses a labelled non-input detail region below fixed chrome; Close restores the current originating row or authorized list fallback. Recreated rows are resolved through current refs. No mobile keyboard is opened by focusing an input.
- Dirty same-document refocus changes no draft or navigation guard. Different-document Open and Close retain the existing guards, including unresolved-command and confirmed-readback barriers.
- Failed/superseded reads, authority/API loss, unmount and later user interaction retire pending movement. Background observation, explicit refresh and ACK never create focus tickets. Closing guard-dialog animation is coordinated without using DOM presence as read or permission proof.
- Inbound readiness is an optional, exception-isolated presentation notification after the editor has committed its current bound full-DTO validation. Bootstrap access and transport completion alone cannot trigger successful-detail focus. Existing read, command, intent and receipt logic is preserved.

## Required validation

The compiled-application CSS suite retains all 20 I30 cases and adds two focus cases, for **22 completed cases**. Full lists contain 20 purchase and 50 inbound rows. Pointer/keyboard first/middle/same-document Open, approved Close, active-element identity and unobscured viewport placement are checked at 320, 390 and 1440 CSS pixels. Focus evidence uses viewport screenshots that preserve focus; ordinary screenshots intentionally blur and scroll to the top and are not focus proof.

Purchase/inbound integration and mobile-editor suites add guard, late/failed read, authority, callback and no-focus-theft coverage while preserving their original cases. The 28 existing built HTTPS lifecycle cases remain mandatory. Preserve exact values, full line/paging behavior, no-write/one-write assertions and original DTO/key custody. No skip or partial run is acceptance.

Supplemental preparation checks use the offered toolchain, not complete lock parity: scoped ESLint and selected Node tests pass; the production browser entry bundles with the missing `jsqr` dependency externalized. Whole-app TypeScript is blocked by that missing package. Local browser execution remains NOT_RUN because Chromium IPC launch is unavailable. Exact-head hosted checks and independent source and pixel review are required before acceptance.

## Step 2: separately authorized inbound read-only fallback

Pending Step 1 review. The real inbound draft endpoint ties read access to UpdateGranted and command-service availability. Its Closed/Unavailable response is distinct from the synthetic readable-but-noneditable draft fixture.

The admitted next step may use only the existing scoped inbound document-detail READ endpoint, in a separate honestly labelled paginated summary/line panel. Its partial DTO must never enter the draft editor, become command authority or release pending intent/receipt custody. No fallback across 401/403/404/409, malformed data, stale scope or network failure. No backend, API, BFF, SQL, configuration or dependency changes are admitted.
