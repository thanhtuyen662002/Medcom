# I40 — inbound list read lifecycle (adversarial review revision)

## Verified source and bounded scope

- Repository: `https://github.com/thanhtuyen662002/Medcom`.
- Exact detached base: `830d6c710b0fb47dd75a01dfb163ca2619bf5ea5`.
- Owner attachment: `Medcom-UI-speed-status-source-20261007.zip`, SHA-256 `81b5e33d1941d8f7c5005cde20d7f97c0f86fcd12572ae5e949ffc1cf2e682b7`.
- Attachment `manifest.json`: SHA-256 `db6dcaeafe087975c4114d0d28ac29457373556ecdc6d4f538709734895e3720`. All 45 source members matched their manifest SHA-256 values before application.
- Attachment `Medcom-UI-speed-status-from-830d.patch`: SHA-256 `bec8c68027e9a9301b12842f657df4acf925ef1de4dda68ac4cbba430c61e556`.
- `git apply --check` passed before applying that patch. Staging the attachment reconstructed exactly `e1403e8dd6452375d042d392fc2b6a44f2e98ba8` (`git write-tree`). This is the review baseline, not a published commit.
- One isolated local coding repository. No push, merge, publication, SQL, native DLL, private configuration or runtime activation.

I40 paths (including the admitted mandatory-test bootstrap amendment):

1. `apps/medcom-sites/components/erp/inbound-request-screen.tsx`
2. `apps/medcom-sites/tests/inbound-request-integration.test.mjs`
3. `docs/execution/checkpoints/I40_INBOUND_READ_REQUESTS.md`
4. `apps/medcom-sites/package.json`
5. `apps/medcom-sites/pnpm-lock.yaml`
6. `.github/workflows/medcom-selfhost.yml`

The external three-path review preserved the other 44 attachment source members. This amended handoff additionally changes only the app manifest and lockfile for mandatory renderer coverage; its separate manifest records the exact six-path result.

## Behavior and fencing

The list request no longer depends on selected detail or the workspace object's allocation identity. It retains dependencies on committed list admission, login/tenant/company/authority/capabilities/branches, validated read-scope markers, API/list identity, applied filter, page and explicit refresh. Branch response validation uses a value-stable snapshot of the authorized branch IDs. A scope identity is included in the rows binding. A separate presentation instance binds both rows and failure state across read identity, filter/page and authority presence; returning to earlier values after an intervening transition cannot revive that retired snapshot. It stays stable across Open/Close, explicit refresh and healthy same-scope authority observations.

The list generation still retires at layout commit before passive cleanup on authority/scope/API/list boundaries. Abort and generation checks reject superseded success/error responses. A separate object ticket changes synchronously in the existing selection action, including Close and batched A→B→A. List 401/403/409 responses captured before that selection cannot change rows, bridge authority or session state; selection itself neither aborts nor restarts the authorized list. A current denial retains the existing terminal-401 / suspended-403-or-409 behavior. An authorized late list success remains useful across selection when its list authority is unchanged. There is no cache that grants rights or automatically retries a denial.

Detail revalidation, read observation bindings, bridge selection, login-key retirement, original intent/receipt custody, frozen DTO/key/JSON, one retained editor and navigation guards are unchanged. No UI or API contract change and no permission relaxation. No runtime timing or production performance claim.

## Tests and reproducibility

Observed toolchain: Node `v24.19.0`, pnpm `11.25.0`, locked application React `19.2.6`, TypeScript `5.9.3`, esbuild `0.28.0`, Next `16.3.4`. Application manifest pins pnpm and requires Node >=24 <25. `pnpm install --frozen-lockfile` passed. The earlier offline attempt failed for missing offline registry metadata; it was not bypassed. Dependency manifests/lockfiles were unchanged in that external review; the independent mandatory-test amendment below changes only the renderer devDependency and its generated lock records.

Run from `apps/medcom-sites`:

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
MEDCOM_BROWSER_TOOLCHAIN=/absolute/path/to/installed/browser-tools \
I21_REACT_REQUIRED=1 node --test --test-reporter=tap tests/inbound-request-integration.test.mjs
```

The external review originally used a separate scratch React tool directory. The independently admitted bootstrap amendment pins `react-test-renderer` 19.2.6 as an application devDependency and resolves both React and the renderer from the application lockfile. Missing dependencies or version mismatches now fail the fixture; no `I40_REACT_TOOLCHAIN` override is needed. The fixture bundles the full production host and bridge with installed esbuild, uses actual React effects, and labels navigation/focus/child components plus transports as doubles. It intentionally does not prove the actual editor, DOM focus, guards, HTTP server, BFF, SQL or owner runtime. React test renderer emits its deprecation notice. The existing required inbound CI step rejects every skipped test, so the original optional-tool skip would have failed CI. The mandatory application-local loader fixes that setup defect; browser gates remain intact.

The added full browser-host cases count list requests across Open/Close, A/B selection, equivalent parent observations, explicit verification/list refresh, filter, page, branch and authority changes. They exercise ignored-cancellation 401/403/409 responses across selection/A→B→A/Close/authority/API/account/scope changes, and hide old-scope rows before replacement. These added browser cases have NOT_RUN status here.

| Check | Observed result | Evidence in review package |
| --- | --- | --- |
| Attachment manifest/hash verification and reconstructed tree | PASS, 45/45; exact candidate tree | `evidence/verification.json` |
| `pnpm typecheck` | PASS, exit 0 | `evidence/i40-review-typecheck.log` |
| `pnpm lint` | PASS, exit 0; existing TanStack incompatible-library warning in `grid.tsx` | `evidence/i40-review-lint.log` |
| `pnpm build` | PASS, exit 0 | `evidence/i40-review-build.log` |
| Focused I40 headless React suite | PASS, 54 tests, 0 failed, 0 skipped | `evidence/i40-review-regressions.log` |
| Original I40 headless tests against unchanged attached screen (prior run) | Expected FAIL, 21 passed / 18 failed; detects refetch and old-scope row exposure | `evidence/i40-control.log` |
| Six new retirement regressions against the previously returned I40 screen | Expected FAIL: all six fail before the fix; runner 38 passed / 7 failed including enclosing suite | `evidence/i40-review-before-fix.log` |
| Full inbound integration command | FAIL, exit 1; 105 passed / 2 failed / 0 skipped. Two browser gates fail before tests launch | `evidence/i40-review-inbound-tap.log` |
| Existing `pnpm test` | FAIL, exit 1; 221 passed / 4 failed / 0 skipped. Four browser gates fail at launch | `evidence/i40-review-erp.log` |
| Actual browser coverage | NOT_RUN: no installed Chromium/Edge executable; Chromium download returned invalid ZIPs | Browser launch errors in the preceding logs; `evidence/browser-limit.txt` |
| Focused diff whitespace/application and other-path preservation | PASS | `evidence/verification.json` |

Headless regressions include exact request counts and requested read scope, current denials, late 401/403/409 under 11 boundaries each (including batched A→B→A, logout, scope, filter and page), authority loss/recovery, unchanged parent observations, and a late authorized success across Open/Close. Existing tests were retained: removing only the additive I40 blocks and restoring the relocated `readMarkers` constant reconstructs the attached candidate test file byte-for-byte. The full inbound count consists of the original 51 passing non-browser cases plus the 54 headless tests; neither full command is represented as green.

## Independent adversarial review

The review re-read the production screen, `lib/erp/inbound-request-command-adapter.ts`, `lib/erp/api.ts`, `lib/erp/inbound-draft.ts`, `mobile-inbound-request.tsx`, `inbound-request-readonly.tsx`, `request-selection-focus.ts`, `navigation-guard.tsx`, parent `workspace.tsx`, and source-only `src/backend/Medcom.Api/WorkspaceReadScope.cs`. It did not treat the earlier answer or green headless tests as proof. This was a fresh adversarial pass by the same agent, not a separate human or second-agent approval.

**Blocking finding found and fixed:** the prior screen hid a row snapshot while authority/scope/filter/page values differed, but retained the snapshot in state and compared serialized values. A committed A→B→A return could therefore show the first A snapshot before A's new request completed. This is meaningful for restored rights: the source read-scope digest is derived from the session and canonical rights/branches, so returning rights can return the same digest. Six actual-screen regression cases reproduced the failure for workspace absence, capability loss, branch change, read-scope change, filter change and page change. The underlying value-only retention behavior was present in the attached candidate and remained in the first I40 patch.

The fix stamps row successes/failures with a presentation object identity. Scope/view/loss transitions create a new object, even when earlier serialized values return. Both current and retained rendering, failure focus state and the list request generation require the current object. No editor or intent store is keyed by that object.

| Re-derived invariant | Source mechanism and review evidence |
| --- | --- |
| Open/Close must not cause list HTTP reads | Selection fences the bridge/detail but leaves its context key and list admission unchanged. No selected value is a list-effect dependency. Actual screen callbacks show stable list counts. |
| Authority/filter/page refresh must still fetch | List effect retains context, scope, transport, filter/page and retry dependencies; branch values use a stable snapshot. The new presentation object changes only on semantic view/loss boundaries. |
| Current versus late denial | Abort plus layout generation is checked before row/authority mutation. A separate selection ticket rejects older-selection 401/403/409, including synchronous batched A→B→A. A current 401 remains terminal; current 403/409 suspends authority and supports explicit same-login verification. |
| Old successes and old cached snapshots must not reappear | A current success can cross detail selection when list authority is unchanged. Superseded list requests cannot commit. New regressions release an old distinct payload after newer authority/branch/scope/login/page rows and check it cannot replace them; the six retirement regressions cover cached snapshots independently. |
| Healthy same-scope observation can retain rows | Presentation identity excludes authority observation counters and retry. A held same-scope authority refresh retains its rows; its current 403 still hides them when released. |
| Login retirement must fence prior callbacks | Host key belongs to the parent login incarnation. Layout cleanup retires list generations; bridge disposal occurs only at real host retirement. The parent rotates login identity on a different server session scope. |
| Pending/unknown intent must survive list fencing | Navigation's host callback checks `bridge.hasUnresolved()` and pending receipt before selecting. Bridge `configure` fences requests without clearing its intent map. `execute` records the original object and JSON once; reconciliation requires the same object and reuses stored bytes. No adapter/DTO/key/body code changed. New actual-host/bridge tests cover pending list 401/403/409, blocked Close, no second execute, unknown outcome, and byte-identical same-scope reconciliation for 403/409. |

The added fixture bundles the **actual screen and actual bridge**, mounts them with React, invokes the rendered production buttons/form callbacks, delays injected transports, inspects rendered row visibility and observes adapter calls. It does not duplicate the production effect predicates or generation algorithm. The positive/negative control runs fail the real screen rather than a copied model. Its child editor, focus and navigation hooks are explicit doubles; therefore the headless pending-write checks establish host/bridge custody, not the real editor's DOM state or navigation dialog behavior. The unchanged full browser fixture uses the actual editor and provider but could not launch here.

The prior patch SHA-256 `ed258e0164a3591ae663b0bcd876a989a993c8ff1f7ec75c62284130e60ba719` still identifies the unchanged prior artifact, but is **superseded and must not be used as this reviewed result**. The replacement package contains a complete focused diff against `e1403e8dd6452375d042d392fc2b6a44f2e98ba8`, not a delta against the prior patch. Its hash and reconstructed tree are recorded in `SHA256SUMS.txt` and `evidence/verification.json`.

No additional blocking defect was found in the reviewed I40 paths after this correction. This is a source/React-effect conclusion under the supplied login-incarnation contract, not proof of all schedules, browser event ordering, deployed authority propagation or runtime acceptance.

## Remaining acceptance

Full browser regressions, actual editor/navigation/focus interaction, production BFF/server, owner account/branch authority and real target runtime require an authorized environment. No tests or browser security were disabled to obtain a pass. Existing synthetic fixtures' certificate-specific handling was not modified. No DB or legacy binary was executed. This handoff is source for Mika's review/integration, not runtime or production acceptance.

## Independent mandatory-test bootstrap amendment

The original external package and its hashes above remain provenance for the three-path review. The amended handoff has six paths and a separate manifest. Its only additional behavior is requiring the React-effect regression fixture through exact locked app development dependencies. No production component, browser gate, runner inclusion, security setting or application dependency version was changed by this amendment. `pnpm test` still runs its existing suite; `.github/workflows/medcom-selfhost.yml` separately requires the complete inbound integration file and rejects skips. The independent verification results accompany the amended patch.

Independent amendment checks: a clean `pnpm install --frozen-lockfile` passed supply-chain/integrity verification without changing the lock hash. Normal regeneration attempted to rebind the existing Recharts `react-is` peer; the three unrelated lines were restored to their exact base values before the final clean install. The final lock diff only adds 19 lines for the renderer and its `react-is` dependency. Installed resolution confirms Recharts still uses `react-is` 16.13.1, while the renderer uses 19.3.0 and the existing scheduler 0.27.0. React and renderer are exactly 19.2.6. With no toolchain environment override, all 105 focused tests passed (54 new React-effect tests including their parent, plus 51 original non-browser tests), zero skipped. Typecheck and full ESLint passed (existing grid warning only). Temporarily withholding the renderer produced the expected `MODULE_NOT_FOUND` failure, not a skip; the dependency link was restored afterward. Actual browser tests remain blocked locally by Chromium socket EPERM, without bypass.

The amended candidate also passed an independent optimized Next.js production build. This does not replace the pending actual-browser or real target-runtime gates.

## Historical lifecycle control dependency isolation

The fixed Linux control remains commit `2712d00532cd76b0cc4eae44ede04314f38e812f`. Its own source and dependency manifests must match that exact commit, checked across the entire tracked tree before dependency installation and after packaging. Requiring its manifest and lockfile to equal the current application would incorrectly reject a current test-only dependency addition. The control now uses its own `pnpm install --frozen-lockfile`, with integrity/supply-chain defaults retained. Removing `--offline` is intentional: installing current dependencies need not warm every historical dependency. No current manifest is copied into the control. The exact revision assertion, full lifecycle negative-test harness, required failure evidence, artifact upload and corrected-build/browser gates are unchanged.

The independent local probe fetched only that exact historical commit, checked out a detached control, passed its own frozen installation with all 602 lock entries passing supply-chain verification, rebuilt and packaged it successfully, and verified the package against the exact control revision. Full tracked-tree comparison remained clean after installation/build, and SHA-256 checks for its package manifest, lock and `.npmrc` were unchanged. Workflow YAML and Bash syntax plus the CI policy checker and four policy tests passed. The full historical lifecycle negative browser proof still requires browser-capable CI; successful installation/build is not represented as that proof.

## Windows ESM fixture portability correction

Windows CI on published head `0b8ea07bdc8ec86134c7138899c67292718065f1` exposed `ERR_UNSUPPORTED_ESM_URL_SCHEME` before the new renderer fixture could run: the esbuild external resolver emitted native drive paths into ESM imports. The outer dynamic bundle import already used a file URL. The resolver now emits file URLs for ESM imports and retains native resolved paths for bundled CommonJS `require` calls; converting those CommonJS arguments to URLs would also fail. Both forms retain the exact locked React instance.

A new mandatory subtest inspects actual esbuild output metadata, requires both ESM imports and bundled CommonJS calls, checks file-URL/native-path resolution against the locked React files, and directly asserts renderer/CommonJS/ESM React object identity. It detects the original raw-path resolver on Linux as well: the negative control fails the new assertion, while the 53 existing behavior subtests still pass. The fixed renderer suite has 55 checks including its parent; together with the 51 original non-browser checks, all 106 pass without a toolchain override. Typecheck and scoped lint pass. No production source, dependency, required/browser gate or historical-control behavior changed. Windows execution still requires exact-head CI confirmation; the portable Linux regression is not a claimed Windows run.
