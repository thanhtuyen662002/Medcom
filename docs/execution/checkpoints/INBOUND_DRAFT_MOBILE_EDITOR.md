# I18 / PR70 — Mobile inbound draft editor: local handoff to Mika

Date: 2026-10-06
Repository: `thanhtuyen662002/Medcom`
Pinned source/base SHA: `b283d057615120ad9b3f96abfc1e7259cb725e09`
Status: **R2_PATCH_PREPARED / NOT_READY_FOR_INTEGRATION**
Current revision: **R2 — Mika's narrow Send-note/navigation correction**.
The current diff is against `Medcom_I18_PR70_Mika_four_files.zip`, not the original laptop uploads or main. See section 7 for R2 provenance and actual results. Sections 1–5 record R1 history only; their PASS statements are not evidence of a current React run.

This is a bounded local editor patch, not a mounted workspace feature or a complete product. No GitHub write, push, merge, deployment, production transport, real database, DLL execution, secret read, package/runner/BFF/API edit or new dependency was performed. The checkpoint did not exist on the owner's laptop; this file is newly created, not reconstructed from an alleged prior report.

## 1. R1 input provenance and patch baseline (historical)

The owner supplied these three in-progress files. Their exact received UTF-8 bytes (LF, no BOM) were preserved separately and hashed before modification:

| Repository path | Received SHA-256 |
| --- | --- |
| `apps/medcom-sites/components/erp/mobile-inbound-request.tsx` | `d0acf624bfb6366f7d714c7f7df8cf8d9a5d62df86355205413d22277d4bd08b` |
| `apps/medcom-sites/lib/erp/inbound-draft.ts` | `10240e67ba7a93bda095077c2e600e00d4966b5b278f8d3b9d2048604e694e28` |
| `apps/medcom-sites/tests/mobile-inbound-request.test.mjs` | `05f2a5a8e8a1d26f04867cca274e37cee130fc101d8eb5b28220ebfad43b2cb2` |

The laptop's local HEAD and unpublished differences outside these files are **UNKNOWN**. No C:/D: access is assumed. The R1 accompanying unified diff was **against these three uploads plus an absent checkpoint**, not a claim that the uploads equal the pinned main tree. Use the full-file archive when reviewing placement against another worktree. Do not discard unrelated local work, overwrite another worker's changes, or treat this patch as a PR update.

Only the three paths above and this checkpoint are in the four-file source archive. Evidence logs/scripts are separate handoff artifacts, not additional repository changes.

## 2. Direct source checks at the pinned SHA

GitHub was readable through the connector. The pinned tree was returned with the requested SHA. The following source files were read without executing the backend:

| Source path | Git blob SHA | Scope of evidence |
| --- | --- | --- |
| `src/backend/Medcom.Contracts/Inbound/InboundDraftContracts.cs` | `a3d711f01749efedb6efa85ac75ae09117873dd1` | DTO properties, nullable fields, decimal string serialization, actions, outcomes, receipt and view |
| `src/backend/Medcom.Application/Inbound/InboundDraftCommandService.cs` | `9bc7b8bed425bd52eba99372ceb36327aab8a863` | Validation; decimal(18,0)/(28,10); SQL DateTime; 500-detail bound; distinct Save/Send payloads; unsupported cost edits |
| `src/backend/Medcom.Infrastructure/Inbound/SqlInboundDraftCommandService.cs` | `597d060d27002ebb761130b92da5176fafa42d73` | Lines 1–260 and 350–485: execute/reconcile/read flow, source Send predicates, real server row IDs, equality token, read bounds and server-owned field preservation |
| `apps/medcom-sites/components/erp/navigation-guard.tsx` | `10feafff474fa3732d5b44bc0025e15f6f7a0a20` | Existing provider/hook and non-discardable unresolved-operation guard |
| `apps/medcom-sites/package.json` | `88d07a96f79447a3eae39f2e876eb65441465e84` | Node >=24 <25; React/React DOM 19.2.6; esbuild 0.28.0; zod ^3.25.76; TypeScript 5.9.3; existing scripts |

`AGENTS.md` was also read. This bounded owner instruction controls the local scope; historical repository directions do not authorize publication or broader edits here. A full main checkout and locked application dependency tree were **not** mounted in the test runtime.

The editor preserves the accepted I15 contract. `canSend` checks only prerequisites visible in the DTO: status 0/1, at least one detail, and non-NULL lot/quantities/expiry. The source service additionally checks authorization, legacy-log capacity and other server-owned state; the UI does not pretend to know these missing fields. Sending changes request status to 2, not inventory receipt/stock posting.

## 3. Changes prepared

### Existing-document editing and exact data

All supplied header fields and all detail rows remain in memory; the UI paginates 25 rows without truncating the aggregate. Save builds a complete header plus explicit detail upserts/removals. Existing row IDs remain server IDs; newly added rows carry client GUIDs only until readback returns real IDs. Server and client identity namespaces are distinct, including DOM IDs; client GUID comparison is case-insensitive.

Decimal and domain timestamp values remain strings. NULL and empty strings are distinct controls/values. No numeric conversion, trimming, timezone normalization, date-only projection or automatic branch/date rebinding is performed. Free-text fields use textareas so multiline source text is not silently hidden by single-line input sanitization. Unedited source spellings remain in state/commands.

Draft equality and upsert comparison use field values rather than object property insertion order. The complete source DTO remains strict; malformed, partial, oversized or unexpectedly expanded views are rejected, not trimmed. Unknown server-managed fields are not added to writes. I15 supplies only a cost-row count; no cost amount/detail table is invented, and cost changes remain empty. Create and QR mapping are not exposed.

### Save and Send remain separate

Send cannot combine unsaved header/detail changes with submission. It performs a fresh full read/preflight and compares the visible snapshot plus equality token before building the Send-only command. Save emits `note: null`; an invalid Send-only note no longer blocks a separate Save. The Send note still requires validation before Send.

After a valid Committed/Replayed receipt, the editor freezes and retains the evidence, clears unresolved execution custody, and enters an acknowledged-readback barrier. A fresh strictly validated snapshot must match the receipt's document, status and equality token before any later command is admitted. This also requires real source row identities (non-null rowId and null clientLineId). When a different document is selected, acknowledged readback of the original document completes first; old fields are never shown as the newly selected document.

A failed or mismatching readback is a **readback problem after acknowledged success**, not a failed Save. It preserves operation ID, audit ID, status and committed UTC time. Retry invokes only `read`; it does not execute or reconcile an already acknowledged command. Parent callback exceptions or attempts to mutate the frozen receipt cannot erase this evidence or trigger a replacement dispatch.

**Conservative limitation:** equality tokens are not ordered versions. A mismatch can be an old cache or a genuinely newer concurrent change. This patch does not guess which; it keeps subsequent commands disabled. Recovery for a permanently superseded receipt needs an explicitly reviewed application workflow or authoritative freshness/read-after-write guarantee. There is no automatic override, Save retry, backend change or claim of database-level ABA prevention here.

### Async custody and session/selection fencing

A synchronous ref latch blocks repeated Execute/Reconcile taps and duplicate reload gestures. The exact deep-frozen command object and operation ID are retained on a lost/malformed/unknown acknowledgment. Reconciliation passes that original object to `adapter.reconcile`; it never calls execute, invents a new key or substitutes a current draft.

A committed selection/permission/adapter change creates a new render binding. Old fields fail the binding gate before commit, including A→B→A. The previous transport is aborted and every late response/callback is fenced even when the adapter ignores cancellation. If an operation may have reached ERP, its original command survives in the same login scope and requires a new explicit reconciliation. The earlier test that accepted a late pending ACK after A→B→A now deliberately expects retirement and reconciliation instead.

Logout/account/login-incarnation changes remount by an opaque scope identity, retire old custody and hide old data. A literal scope string cannot alias the null/anonymous key. The host must never reuse a scopeKey across login incarnations or put secrets in it.

When only permissions/adapter change in the same document and session, an unsaved draft is retained during revalidation. An unchanged snapshot preserves it; a changed server snapshot leaves it intact but locked in conflict until an explicit discard/reload. Switching to another document after a terminal failed/conflict operation can start that document's read instead of inheriting an indefinitely blocked phase.

Validation can move to the page containing an invalid detail before focusing it. The test fixture now captures delayed read data **before** waiting, preventing an allegedly stale response from quietly becoming a fresh snapshot in the test.

## 4. R1 validation results (historical; R2 results are in section 7)

The old “52 focused tests PASS” report is **not** carried forward.

| Check | Result | Observed evidence / limit |
| --- | --- | --- |
| Pinned DTO/service/navigation/package source comparison | PASS (static review) | Direct GitHub reads listed above; no backend execution |
| Received test command on Node 24.11.1 | FAIL — bootstrap | Exit 1: `ERR_MODULE_NOT_FOUND: Cannot find package 'esbuild'`; suite cases did not execute |
| Revised test command on Node 24.11.1 | FAIL — bootstrap | Same missing esbuild; TAP records 1 file-level failure, 0 passes, not a failed business assertion |
| Revised `.mjs` `node --check` | PASS | Actual parse command exit 0 |
| TSX/library and embedded React fixture syntax/transpile | PASS — syntax only | Existing TypeScript 5.8.3; no syntactic diagnostics. This is not the repo's 5.9.3 typecheck/build |
| Supplemental isolated pure-helper checks | PASS — 6 groups | Actual Node tests on functions extracted verbatim from the revised library's AST. Schema property-name lists come from that same source. The full zod module and React are NOT loaded; these checks do not replace the focused suite |
| Full focused unit suite | NOT_RUN | esbuild import failed before registration/execution |
| Actual React/browser mobile scenarios (320/360/390 px) | NOT_RUN | Test code prepared, but the suite could not bootstrap. No UI result is inferred from syntax or helper checks |
| Full app typecheck, lint and `next build` | NOT_RUN | Complete pinned app/dependency tree unavailable in the runtime; no package/runner modifications or dependency installation used to bypass this |
| UI screenshot | NOT_RUN / none | No React screen was rendered; no mock screenshot is represented as browser evidence |

Runtime availability: Node 24.11.1 was actually invoked from the existing Playwright Python installation; normal `node` was 22.16.0 and was not used to claim Node 24 results. Chromium 144.0.7559.96 and an existing Playwright driver were present, but esbuild/React/React DOM/zod were not available as an application dependency tree. No package installation succeeded or was used. No production connection or DLL was attempted.

The separate evidence archive includes received/final test output, exit code, syntax report, and the six-group isolated-helper harness/output. Its scripts describe their narrowed scope; there is no claim that extracting pure helpers validates the component lifecycle.

## 5. R1 browser tests prepared (NOT_RUN; retained in R2)

The existing actual-React synthetic-adapter suite is retained and extended for stale post-Save snapshots, old A→B→A reads, cancelled Send preflight, capability changes that leave canRead true, adapter replacement, retained dirty conflicts, terminal A failure followed by B selection, double-tap and retired reconcile responses, independent Save/Send permissions, invalid Send-only notes, callback evidence mutation, multiline fields, cross-page validation and 320/360/390 px overflow.

Existing scenarios still cover exact 18-digit values/rates/timestamps, NULL/empty distinctions, 500-detail pagination, explicit add/update/remove, real server IDs on readback, source Send NULL predicates, structured outcomes, malformed receipt binding, lost ACK, explicit original reconciliation, logout, navigation guard and bounded command bytes.

The fixture uses only synthetic documents and injected adapters, blocks service workers, and allows browser network requests only to its own local fixture origin. It does not connect the editor to an API or database. Browser location is explicit through `I18_TEST_BROWSER`, or an already-installed Playwright-managed browser; no hard-coded laptop C:/D: path remains. Per-case evidence records PASS/FAIL instead of blindly counting each scheduled test name as passed.

## 6. Required before application integration / acceptance

1. Review/apply the full files against the actual local worktree; reconcile with other unpublished edits and the declared base. The diff's input identity is the received SHA-256 list, not an invented laptop HEAD.
2. Run the direct focused test on the real pinned application dependency tree with Node 24 and an existing Playwright browser/toolchain. Then run existing app typecheck, lint and final build. Resolve actual failures without weakening tests or changing unowned package/runner paths. Capture real mobile screenshots and preserve their test evidence.
3. Supply a stable injected adapter implementing the exact existing I15 read/execute/reconcile operations. `read` must return a complete, live-scope, non-cached snapshot preserving string decimals, NULL/empty and timestamps. Transport serialization must preserve the frozen original command and operation ID, enforce the supplied body-byte limit, use authoritative authentication, and never implement reconcile by calling execute. No such adapter/BFF wiring was added here.
4. Supply authoritative access flags and a positive bounded `maxCommandBytes`, plus a stable non-secret scopeKey covering tenant/company/database, principal and login incarnation. Rotate it on logout/relogin/account switch. UI flags do not replace backend authorization. Do not derive identity from the selected document/equality token or reuse it across sessions.
5. Mount only in a reviewed host workflow with the existing NavigationGuardProvider. Route document selection, route changes, workspace unmount and other discardable navigation through its request guard. Keep the editor instance alive while an original command is unresolved; do not key it by document, token or refreshed choices. Logout must retire the session regardless of unsaved work. This component cannot intercept a parent that forcibly changes props/unmounts without consulting the guard.
6. Keep Create closed until numbering is qualified; keep QR detached from data until mapping is approved. Expose no invented cost rows/calculated values or server-managed write fields. Resolve permanently mismatching receipt/snapshot cases explicitly; do not silently release the barrier or manufacture token ordering.

Unresolved command custody is memory-only. Browser refresh/tab close/crash can lose it despite navigation warnings. Cross-reload secure recovery, application mounting, real transport admission, integration QA and production acceptance remain outside these four files and unverified. This checkpoint grants no push/merge/deploy authorization.


## 7. R2 — Mika narrow correction, 2026-10-06 (current handoff)

### Exact input and scope

This follow-up starts from the bytes inside the previously delivered `Medcom_I18_PR70_Mika_four_files.zip`, SHA-256 `ba30a9e4dabf34dbf252dd666a3b987b40e0fcfa03be206ae40fd917a03a0e0c`. Its four members, not the older loose laptop uploads, are the R2 diff baseline:

| Baseline member | R1 delivered SHA-256 |
| --- | --- |
| `apps/medcom-sites/components/erp/mobile-inbound-request.tsx` | `51a29d659892ffc0379d58e907cd376997288dc6bff5346fa0a9074c56473a31` |
| `apps/medcom-sites/lib/erp/inbound-draft.ts` | `5438721674089d95e0a8113b789d8ccb8f0997a4b433fe6a0ec18331834a1724` |
| `apps/medcom-sites/tests/mobile-inbound-request.test.mjs` | `8d6bab7064e3cb37734af9f0825dd0786192d1ed7cc1809133c0e26c30c76e6f` |
| `docs/execution/checkpoints/INBOUND_DRAFT_MOBILE_EDITOR.md` | `11f15a787069f64012284036d3a10371b9b9febc9fcaeebfb1c025dd619cbd51` |

Pinned source/base SHA remains `b283d057615120ad9b3f96abfc1e7259cb725e09`; this follow-up does not assert a newly verified current main/PR head. Only the editor, its existing test file and this checkpoint change. `lib/erp/inbound-draft.ts` is included byte-for-byte unchanged, preserving all DTO, serialization, command and adapter contracts. The four-member archive contains no other repository path. No API/BFF/runner/package/lockfile/navigation-provider edit or dependency installation was attempted; no database permission, connection, secret, DLL, push, merge or deployment was used.

### Correction

A non-NULL Send note, including the explicit empty string, now guards navigation independently of the form's binding or phase. Same-document/same-session permission or adapter revalidation can hide the snapshot but cannot silently remove this guard. It remains active in empty/loading/readFailed and during Send preflight. An ordinary reload after failed revalidation asks before discarding that note, even while the old form is hidden. A retry of an already acknowledged Save readback preserves the unsent note instead of silently clearing it.

During note-bearing Send preflight, navigation keeps the note and does not offer discard: a dialog opened at that time must not retain a stale discard permission if the read then advances to execute. The local **Hủy kiểm tra trước khi gửi** control cancels only the preflight read, retains the note, retires the response generation and returns to editing without building a command or operation key. The user can then request guarded navigation and explicitly confirm discarding. This handler refuses to act once the active request is execute/reconcile, an original command exists, or the binding is retired. It is not an operation-cancellation endpoint or a replacement command.

The non-discardable unresolved-original rule remains in pending, unknown and reconciling. The existing `dispatch`, `reconcile`, `confirmed` and `stillCurrent` function texts are unchanged (AST text comparison recorded in evidence). No original command, key, receipt or acknowledgment/readback mechanism is redesigned.

### React navigation tests prepared — NOT_RUN

The shared test helper now requires a visible `alertdialog`, its actual warning title, and `qaLeft === false` before and after the navigation request. It then checks whether discard is present and verifies that choosing **Tiếp tục làm việc** still leaves `qaLeft === false`. The fixture initializes/resets `qaLeft` and makes a successful leave callback really select DOC-B. A clean-navigation positive control verifies that the callback is functional; it cannot pass simply because the fixture never navigates.

Cases cover pending Save and Send, held reconciliation with the exact frozen original, Send-only empty/text notes during permission and adapter revalidation, hidden data during read-right revocation/restoration, failed revalidation and declined reload, explicit discard during a held revalidation read, held Send preflight, a dialog kept open across preflight-to-pending, cancelling only preflight before confirmed discard, and preserving the unsent note on acknowledged Save readback retry. Late read responses are resolved explicitly and checked for no execute/no note leakage. Deliberate raw prop changes remain only for adversarial stale-response tests; the normal note-navigation case now uses the real provider request path.

### R2 actual execution results

| Check | Result | Observed limit/evidence |
| --- | --- | --- |
| Direct suite command against R1 archive baseline | **FAIL — bootstrap** | Node 24.11.1, exit 1, missing `esbuild`; no suite case ran |
| Direct suite command against final R2 files | **FAIL — bootstrap** | Same missing `esbuild` import; this is not a business/UI assertion failure |
| Full focused case execution, including actual React/mobile dialogs | **NOT_RUN** | Bootstrap fails before registration/execution; no browser result or screenshot exists |
| `node --check` on final test file | **PASS** | Actual command exit 0 |
| TSX/library and embedded fixture syntax/transpile | **PASS — syntax only** | Existing TypeScript 5.8.3; no diagnostics; not the repo's semantic typecheck or build |
| Supplemental extracted guard/reload/cancel policy checks | **PASS — 9/9** | Actual Node tests execute source expressions/handlers with stub state collaborators; do not load React, call its guard hook or render a dialog |
| The same supplemental acceptance checks on R1 | **FAIL — expected contrast** | 2 passed / 7 failed; includes both previous policy gaps and the absent new read-cancel handler, not seven separately proven UI defects |
| Command-handler/library scope comparison | **PASS — static** | Four command/custody function texts unchanged; library bytes identical |
| Full app typecheck, lint, final build and UI screenshot | **NOT_RUN** | Full pinned application/dependency tree unavailable; no installation or scope bypass used |

Supplemental policy tests are explicitly not substitutes for the NOT_RUN React cases. The evidence archive includes runnable check scripts, stdout/stderr, exit codes, final tested source hashes, and the baseline identity. Diff application/byte-match verification is recorded separately after packaging. No R1 “52 PASS”, old six-helper result, or syntax-only check is promoted to a current React PASS.

### Still required before integration

Run `node --test --test-reporter=tap tests/mobile-inbound-request.test.mjs` in the actual application worktree with its already-approved dependency tree, Node 24 and an existing browser/toolchain. Then run the existing typecheck/lint/build commands. Keep the integration requirements in section 6: the host must route ordinary document navigation/unmount through `NavigationGuardProvider`, keep unresolved custody mounted, rotate login scope on logout/account changes, and supply the verified I15 adapter. Forced prop changes/unmount that bypass the provider and cross-reload command persistence remain host concerns. This is a review handoff of an independent editor, not an integrated or production-complete feature.
