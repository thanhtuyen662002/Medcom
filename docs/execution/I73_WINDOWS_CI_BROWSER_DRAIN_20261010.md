# I73 Windows browser CI repair admission

Base/main: `5f9dc076437a7d0d2d221484af4c15bb80559640` (merged I72, PR #129). This direct sole-writer increment is confined to CI runtime selection and its evidence; no separately owned FE application/test source is changed, and no new backend product code starts while current-main CI is failing. Historical Draft #53 and immutable claims remain preserved. Schedules are not administered.

## Observed failure and bounded repair

- Main backend, Windows backend/policy and container workflows passed: runs 38033361632, 38033361599 and 38033361591. Both backend TRX receipts have 3197 passed, zero failed/skipped. I72 main candidate integrity passed; SHA-256 `da3f290a583fc8a2eb4cec29adc33fd1d622991d68503bd2425205e6ffbcc113`, sourceRevision exactly the base above. Production admission remains blocked.
- Main FE run 38033361666 attempt 1: Ubuntu succeeded, Windows job 114158680781 timed out waiting for the confirmation button in `apps/medcom-sites/tests/request-qr-search.browser.mjs`, malformed-Unicode case. Its same-head bounded rerun retained all assertions.
- Attempt 2: Ubuntu remained successful, Windows job 114161041312 failed earlier with a 10-second CDP timeout in `tests/qr-scanner.browser.mjs:93`. Missing later presentation/integrated-UI artifacts are downstream failures, not success evidence. These failures are preserved in GitHub; their root cause is **UNKNOWN**.
- Supplementary unchanged-source local Windows tests: request QR 7/7 and scanner QR 10/10 passed using Edge 155.0.4283.45 / Node 24.19.0. These are synthetic-camera tests, not physical-camera or hosted-runner acceptance. Receipts are ignored under `artifacts/I72-main-qr-local` and captured terminal output.
- `.github/workflows/medcom-selfhost.yml` currently resolves a locked Playwright driver but chooses a preinstalled system browser. `src/frontend/package.json` / package-lock pin Playwright 1.56.1. The proposed repair installs that locked driver's Chromium revision and selects its exact executable on both OS jobs. It retains every test, assertion, required artifact and timeout; no green result is assumed from changing the runtime.

## Required verification before integration

Observe locked-browser installation, unchanged local QR cases on the selected executable, workflow policy checks, both hosted FE platform jobs and all backend/container checks on the exact source/base. Re-read current main/source/reviews/protection, verify package/tested-merge provenance and merge through the PR gate only after all checks succeed. Fresh integrated-main CI/package evidence is a separate receipt. Source and package integrity do not close ERP numbering, writer, target SQL, business or FE consumer acceptance. Goal #45 stays OPEN.
