# I60 — bounded purchase-read diagnostics

## Source and scope

- Accepted source: `884be183160d0ea1e5c2a8d8ce5e20431dd55d6f`.
- The isolated candidate baseline was reconstructed from the accepted GitHub tree and all 844 tracked file blobs were verified; baseline tree: `070b46760f043cc04d9f48b341802c8c163c7f44`.
- Scope: purchase-request read observability, its API logging composition, the existing safe support-code presentation, and focused regressions. No SQL definitions, command admission, production settings, deployment, database, or validation rules changed.

## Verified incident boundary

Production purchase workspace/list reads returned 200 while a detail read returned 503. The deployed backend and frontend both identified the accepted source above. `PurchaseRequestEndpoints` awaits `OpenAsync` before resolving command access. Command access being default-off therefore does not explain this read failure.

`SqlPurchaseRequestQueries.Run` previously converted read exceptions into `Unavailable` without diagnostics. The endpoint continues to return the unchanged 503 `purchase_read_unavailable` response. The precise failing production qualification remains **UNKNOWN** until a new authorized request is observed with this instrumentation deployed. A successful synthetic test is not production data qualification.

The shared error component omitted `purchase_read_unavailable` from its fixed safe-code set and displayed `unknown_code`. This candidate adds only that known public response code; arbitrary codes and malformed support references remain masked.

## Diagnostic contract

- One local observation object per read invocation; operation and stage cannot bleed between concurrent calls.
- Operation, stage, failure reason, and exception category are finite enums. The only provider field is numeric `SqlException.Number`; other exception types do not supply arbitrary provider text.
- Elapsed milliseconds measure the read invocation, not individual SQL statements or browser latency.
- API event 1002 (`PurchaseReadUnavailable`) carries the existing server-generated request correlation and the bounded diagnostic fields.
- No exception object, message, stack, SQL text, parameter, document identifier, record value, credential, connection string, or user identity is passed to the sink or event.
- A throwing diagnostic sink is contained and cannot change the existing result. Cancellation still propagates; normal success, denial, and not-found outcomes do not generate unavailable events.
- Existing fail-closed validation, authorization, cleanup, read-only transaction behavior, response masking, and command default-off behavior remain intact. There is no new public diagnostics endpoint or response field.

Stages distinguish connection/transaction setup, credentials, grants, branches, schema, workspace lookups, list, detail header, detail lines, normalization, state-token generation, item display, lookup reads, cleanup, and final authority revalidation. These identify the failing phase without exposing the source values; a phase alone must not be represented as a proven business-data cause.

## Verification

- .NET SDK 10.0.401; locked restore and Release solution build with analyzers: PASS, zero warnings/errors.
- Focused purchase query/HTTPS endpoint suites: **149 passed**.
- Aggregate backend suite excluding explicitly private `LegacyRuntime` tests: **2,813 passed**, zero failures/skips.
- Backend architecture boundary check and patch whitespace check: PASS.
- Real component SSR/shared-screen suite: **11 passed**, including the new safe-code/masking case.
- Frontend TypeScript no-emit check and targeted ESLint: PASS.

The first aggregate backend run had five existing private-configuration fixture failures because this cloud harness has `.git` ancestors at its default temporary location. Repeating the unchanged suite with a synthetic temporary directory outside any Git tree passed all 2,813 tests. No production privacy-path check or test was weakened.

The broader frontend runner was attempted. Its four existing browser-backed cases (mobile interactions plus three purchase cases) could not launch their browser under the cloud execution sandbox; an initially symlinked dependency directory also failed the existing physical-directory packaging check. The dependencies were copied into a real isolated directory and the physical-directory check passed on retry. The retry recorded 557 passes and four browser-launch failures out of 561 tests. The browser-backed aggregate remains **NOT PASSED** in this candidate environment; focused SSR/type/lint results are not a native-browser pass.

Regressions cover fixed-stage failures, explicit schema rejection without exceptions, normalization failure while list reads still succeed, numeric SQL-provider errors, synthetic sensitive exception text/data masking, failed diagnostic sinks, cancellation, cleanup versus post-cleanup failures, unchanged real HTTPS 503 before command access, default-off commands with successful full reads, and safe UI support-code display.

## Remaining acceptance

Independent review, exact composed-head CI, authorized publication/deployment, a correlated reproduction against the real target, and any source-backed repair for the observed read failure remain separate steps. This change improves observability; it does not claim that the original detail-read defect is repaired or that other document-read routes are instrumented.
