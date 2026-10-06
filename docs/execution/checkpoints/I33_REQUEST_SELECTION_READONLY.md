# I33: Request selection focus and read-only fallback

## Baseline and ordering

The immutable admission is `docs/execution/direct-runs/I33.json`, rooted at main `4a791d10404b28ede59c51912b0f07fee7a3bd36` (tree `993819b7ec70d56835eeefcc994b5f1ad53df231`). I30 remains frozen. Root composes only reviewed path deltas onto current main; the historical admission is not rewritten for later unrelated merges.

Two independently reviewed steps are required. Step 1 was published at `8b7a35288d0d1d829581a3dbedd0985bb4e70383` (tree `f4efa6f96901592eacf39e8a50a1a8a262e7c9ae`) over the later accepted I32 main. Its exact-head hosted Linux and Windows checks passed, including 22 compiled-CSS cases and 28 built HTTPS lifecycle cases per OS. The 140 screenshot hashes were verified and focus viewport captures inspected. This checkpoint now records **Step 2 source preparation**; its new runtime gates remain pending.

## Step 1: explicit Open and Close

- A one-use interaction ticket is created only by an accepted explicit action. Current authority, selection, list identity and committed read readiness must still match before focus moves.
- Open focuses a labelled non-input detail region below fixed chrome; Close restores the current originating row or authorized list fallback. Recreated rows are resolved through current refs. No mobile keyboard is opened by focusing an input.
- Dirty same-document refocus changes no draft or navigation guard. Different-document Open and Close retain the existing guards, including unresolved-command and confirmed-readback barriers.
- Failed/superseded reads, authority/API loss, unmount and later user interaction retire pending movement. Background observation, explicit refresh and ACK never create focus tickets. Closing guard-dialog animation is coordinated without using DOM presence as read or permission proof.
- Inbound readiness is an optional, exception-isolated presentation notification after the editor has committed its current bound full-DTO validation. Bootstrap access and transport completion alone cannot trigger successful-detail focus. Existing read, command, intent and receipt logic is preserved.

## Required validation

The focus stage retained all 20 I30 cases and added two focus cases, for **22 completed cases per OS**. Step 2 retains those cases and adds four separately accounted readonly cases, for **26 required completed cases** on its future exact head. Full lists contain 20 purchase and 50 inbound rows. Pointer/keyboard first/middle/same-document Open, approved Close, active-element identity and unobscured viewport placement are checked at 320, 390 and 1440 CSS pixels. Focus evidence uses viewport screenshots that preserve focus; ordinary screenshots intentionally blur and scroll to the top and are not focus proof.

Purchase/inbound integration and mobile-editor suites add guard, late/failed read, authority, callback and no-focus-theft coverage while preserving their original cases. The 28 existing built HTTPS lifecycle cases remain mandatory. Preserve exact values, full line/paging behavior, no-write/one-write assertions and original DTO/key custody. No skip or partial run is acceptance.

Supplemental preparation checks use the offered toolchain, not complete lock parity: scoped ESLint and selected Node tests pass; the production browser entry bundles with the missing `jsqr` dependency externalized. Whole-app TypeScript is blocked by that missing package. Local browser execution remains NOT_RUN because Chromium IPC launch is unavailable. Exact-head hosted checks and independent source and pixel review are required before acceptance.

## Step 2: separately authorized inbound read-only fallback

Step 1 source review and exact-head browser gates passed. The separate panel now observes only the exact typed `Unavailable` envelope with null document and all four access booleans false. This is eligibility to attempt READ, not permission to show data.

Source correction: `InboundDraftEndpoints.cs:114–122,276–289` returns Closed/Unavailable for missing command authority/provider or unavailable service. Its command scope may be null or a valid scope. With an available service and missing EDIT, the actual response is **Denied with available=true**, not Unavailable. That case remains blocked and has an explicit regression. An inconsistent Unavailable+available=true envelope is also rejected; the earlier synthetic readable-but-noneditable draft fixture does not cover either real gate.

The implementation uses only the existing scoped inbound document-detail READ endpoint, in a separate honestly labelled paginated summary/line panel. Current workspace READ capability and valid session/read markers are required before the attempt. The production default list and the existing Workspace list callback both compare response markers to those expected scopes before rows can support retained presentation. The returned scope, document, page, allowed branch and existing projection schema are independently checked. Initial reads, changed scope and actual authority loss display no old values; current failures clear them. Healthy observations within the same independently verified READ scope retain the authorized panel and list geometry while paging/focus are fenced and fresh reads complete. Superseded success or denial cannot restore a retired panel or focus ticket. Entering or leaving verification changes the layout generation, so a late HTTP denial cannot be delivered through a newer callback during the passive-cleanup gap. Exact quantities, NULLs, source IDs and dates remain available without converting the partial result into a draft. The returned page size must equal the requested 50; even a short tail with a different size is rejected rather than misnumbered.

The retained host keeps the readonly line-page control for the same document/login/session/read scope. Healthy same-scope observation-version changes retain panel, controls and full-list DOM without whole-screen blanking or scroll jumps. Temporary unknown/lost authority still masks the panel; recovery requires fresh Closed/Unavailable eligibility and a fresh scoped GET for the remembered page before redisplay. True selection or verified read-scope boundaries reset page 1; control retention never supplies permission.

The editor stays mounted behind the separate panel, retaining dirty fields and its guards. An unresolved operation or confirmed receipt awaiting full readback prevents the fallback. READ projection data cannot acknowledge an operation, release custody, grant Save/Send or generate a success toast. The API observation forwards all original command arguments unchanged. Explicit Open may wait for the committed readonly view; background reads, page changes and retries never create focus tickets.

A small presentation-only focus-target change adds rounded, explicit 2px palette-ring outlines; no focus algorithm or palette preference changes.

The partial READ DTO must never enter the draft editor, become command authority or release pending intent/receipt custody. No fallback across 401/403/404/409, malformed data, stale scope or network failure. No backend, API, BFF, SQL, configuration or dependency changes are admitted.


### Step 2 pending validation

The 26-case compiled-CSS suite requires both real Closed/Unavailable shapes at 320/390/1440, full 50-row selection and Close restoration, independently held READ proof, exact paginated values, page-2 retention through real Workspace observation/focus handling, exact panel/paging-button/50-row node identity and scroll stability during healthy refresh, denied/malformed/scope failure matrices and unresolved/receipt custody. Persistent READ403 must remain bounded under an advancing authority observation version with stable session/read markers, including timer/focus revalidation; no denial-driven parent refresh loop is allowed. Fifteen added host subtests separately exercise positive admission, scope rejection, missing READ/markers, stale A→B→A, workspace/API/read-scope changes, dirty restoration, original command/receipt custody, default-list scope checks and layout-phase stale denials. One separately labelled direct-component prop test proves that A→B→A cannot reuse an earlier retained result while healthy same-selection read revisions retain presentation. Every prior case and all 28 built HTTPS cases remain required. Synthetic HTTP fixtures prove frontend behavior only; no ERP database or production business acceptance is inferred.

Source-stage supplemental checks are not full lock parity: scoped lint, syntax, both actual fixture entry bundles, production fixture-contract parsing and 51 selected Node/BFF cases pass. Whole-app TypeScript currently reports only the unavailable `jsqr` package. Local Chromium remains unavailable. Step 2 hosted execution and independent source/pixel acceptance are **PENDING**; no new runtime PASS is claimed here.
