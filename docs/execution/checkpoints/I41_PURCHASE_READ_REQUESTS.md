# I41: separate purchase list and selected-detail reads

## Baseline and bounded ownership

- Source base: `b30d7dbd1e05d351ac7109844297e57d76f3399f`.
- Exact base tree: `43cfaefeacb119110c265df8b8878d071ab87e78`.
- Provisional test-only dependency: reviewed I40 `8f5dcec3`, tree `904dd2f7`, which pins `react-test-renderer@19.2.6` beside `react@19.2.6`. The coordinator must integrate that dependency before the composed I41 tests are a supported CI gate. This patch does not edit package files, lockfiles or workflows.
- Owned paths: `purchase-request-screen.tsx`, its existing integration test and this checkpoint only.
- No backend, session policy, permission, SQL, DTO, command adapter, locking, configuration or deployment changes. No owner database, private configuration, raw ERP archive/DLL or production record access.

## Observed issue and static call map

The coordinator reported actual Chrome observations on the owner's b30 preview: closing a purchase detail removes list rows while ERP reloads; a light search took approximately 3.9–4.5 seconds. A prior reload took more than 25 and less than 48 seconds. The browser tools did not provide a Network/HAR waterfall. These observations do not identify a measured backend bottleneck.

The exact base source couples `selected` to the list effect:

1. Initial page load: parent `/api/workspace`, then purchase `/workspace`, then purchase list.
2. Open/change selection: purchase `/workspace`, then purchase list and detail together.
3. Close: purchase `/workspace`, then purchase list.
4. Each BFF request independently permits up to 20 seconds upstream; this is not a whole-operation deadline. The 60-second parent workspace polling and focus/visibility checks are separate.

I37 is already present. Enabled SQL purchase workspace/list/detail GETs retain respectively 2/2/3 full authority resolutions; a full resolution executes 6/7 SELECT commands for restricted/native-all branch scope. Source-level totals, not packet counts or measured latency:

| Action | Base purchase HTTP requests | I41 purchase HTTP requests | Base full resolves | I41 full resolves |
| --- | --- | --- | ---: | ---: |
| Accepted Open or another document | Workspace + list + detail | Detail | 7 | 3 |
| Accepted Close | Workspace + list | None | 4 | 0 |
| Explicit refresh with selection | Workspace, then list + detail | Same | 7 | 7 |
| Initial purchase list | Workspace + list | Same | 4 | 4 |

The initial parent workspace adds one full resolve. These counts exclude overlapping parent polling and any custom command-access provider. Actual elapsed-time improvement remains unmeasured.

Evidence: `apps/medcom-sites/components/erp/workspace.tsx`; `lib/erp/purchase-request-api.ts`; `lib/erp/proxy.ts`; backend `ApiHost.cs`, `LocalWebSessions.cs`, `SqlLegacyUserStore.cs`, `SqlPurchaseRequestQueries.cs`, `PurchaseRequestEndpoints.cs`; `I37_READ_LATENCY.md`.

## Implementation and invariants

- List criteria exclude selected identity. Accepted Open invokes the existing detail API only; accepted Close retires that editor without issuing another list/workspace read.
- Bootstrap produces a current read binding before awaiting list completion. The independent detail effect can therefore run alongside the list on explicit refresh, preserving the previous parallel shape.
- Filter/page/branch/scope changes have an incarnated criteria key. Returning to identical values cannot resurrect an earlier list or bootstrap.
- Each parent workspace observation has a separate generation, even when the same object is supplied again after an unverified interval. Continuously visible, unchanged-scope observations retain accepted read-only content while disabling actions; a hidden/unverified return still waits for fresh proof.
- Selection carries its own incarnation, including a batched A→B→A transition. Cleanup, abort and generation checks fence both success and denial responses.
- A current 401/403/409 or malformed detail response invalidates both read paths. It cannot be overwritten by a concurrently delayed list success. Superseded responses cannot clear newer data or notify parent authority.
- A current 404/503 detail failure retains the independently verified list and masks the detail. Close remains local.
- Current 401 retires the command bridge immediately. Nonterminal failures keep the one mounted editor and its exact pending/unknown original intent; they do not grant permission to resend it.
- Fresh detail responses cannot replace a pending command or dirty editor. A GET predating dispatch/ACK is discarded using the unchanged adapter read epoch and retried as detail only. Confirmed receipt custody stays intact.
- Explicit refresh, search/page/branch changes and parent authority rechecks retain their existing fresh-read behavior. No TTL or cross-request authorization cache was added.
- The existing browser fixture's I36 table-row selectors are retained. Open/Close HTTP-count assertions were added without replacing its real browser gate.

## Validation

Environment: Node `v24.19.0`; installed locked application toolchain with the coordinator-approved I40 renderer dependency overlaid locally. Both React and renderer versions were asserted to be `19.2.6`. No dependency file changes are included.

Observed:

- `git diff --check`: passed.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- Focused ESLint on the screen and integration test: passed.
- Full `node node_modules/eslint/bin/eslint.js .`: exit 0, no errors; one pre-existing TanStack Virtual incompatible-library warning in unchanged `grid.tsx`.
- `node node_modules/next/dist/bin/next build`: passed production compilation, TypeScript and static-page generation.
- Focused production-source/API/adapter/React test command: **159 passed, 0 failed, 0 skipped**.
- Full `node scripts/test-erp.mjs`: **300 passed, 4 failed, 0 skipped**. All four failures are browser-launch gates: installed Chromium exits at `socket() failed: Operation not permitted` before test interactions. This is not a full-suite pass.
- No browser restriction workaround, owner-machine execution, live SQL measurement, deployment or production acceptance was performed by this author.

Commands from `apps/medcom-sites`:

```text
node --test --test-name-pattern='^I41|^I33|^fixed|^typed|^detail failures|^production session|^Workspace deadline|^I20 actual command|^healthy' tests/purchase-request-integration.test.mjs
MEDCOM_BROWSER_TOOLCHAIN=/opt/codex/runtimes/codex-primary-runtime/dependencies/node MEDCOM_EDGE_PATH=/usr/bin/chromium node scripts/test-erp.mjs
```

The new headless suite executes the actual React screen, existing API parsers and unchanged command adapter. Only child editor rendering, focus and navigation confirmation are explicit doubles; fetch responses are synthetic. It covers request budgets, stable rows, explicit refresh parallelism, current versus late success/401/403/409, filter/page/branch/scope and session boundaries, hidden return, batched A→B→A, detail-only failures, exact unknown-command bytes, single adapter custody and stale-GET/confirmed-ACK races. It does not substitute for the existing composed browser/real MobileRequest checks.

## Independent review and remaining gates

An independent request-budget control, using numeric request counts before renderer-instance assertions, passed on the I41 screen and failed on exact b30. After one accepted Open, I41 retained workspace/list/detail counts of 1/1/1; b30 produced 2/2/1. The current-screen Close control also passed with no additional reads. This is synthetic orchestration evidence, not measured ERP latency.

The coordinator owns independent exact-file review, integration with I40's dependency, publication and composed exact-head CI. Browser interaction/focus/real MobileRequest custody checks still require a supported installed browser runtime. Recheck the composed result after any shared request-list presentation changes. Keep real owner runtime and production acceptance separate from these deterministic source/React observations.

## Shipping HTTPS request-budget reconciliation

Follow-up base: `6429c6292c33a434f5776845634cce0b02dfa12e`, tree `5647414d50f840692850ce9c7eebf2783b39ffc9`.

Linux and Windows shipping HTTPS runs reached the final count assertion in scenario 15, “ACK before stale background GET preserves the receipt and requests one fresh read.” The old loop required two requests for every purchase child route. Its first assertion failed because purchase workspace had one request. Before that assertion, the actual built/TLS test had already verified the stale token-1 response, a new detail request, fresh token 2, preserved receipt/note, disabled actions until fresh proof, and one unchanged original write/effect with no lookup. The full request map was not printed by those failed runs, so their diagnostic response tails are corroboration rather than a complete request-count record.

An isolated exact-base reproduction executed the actual React purchase screen, actual parent/purchase API parsers and unchanged command adapter with explicit synthetic transport. Save was already pending before the parent observation; list and token-1 detail were held; the token-2 ACK was accepted before releasing those bodies. It observed:

- Parent workspace: 1
- Purchase workspace: 1
- Purchase list: 1
- Purchase detail: 2, the stale token-1 read followed by the fresh token-2 read
- Save: 1; lookup: 0; original serialized command unchanged
- Receipt, confirmed note and adapter retained; editing blocked until the fresh read completed

An independent reproduction additionally held the list through the fresh detail and verified both list-first and list-last completion orders. Neither order exposed editing before both current reads completed. These synthetic reproductions are not another shipping TLS run. Removing only the detail-refresh retry in an audit-only negative control made both ACK-order cases fail; the required fresh-read safety check remains exercised.

The bounded correction changes only the obsolete scenario-15 budget to the exact 1/1/1/2 map and logs that fixed-route map immediately before asserting it. Existing token, receipt, note, action-verification, original-body, write/effect and lookup assertions are unchanged. No production code changes are warranted by this failure.

The rest of this file's request-budget checks were reviewed individually. Normal background observations, branch-exclusion denial cycles, explicit recovery and retired-expiry silence retain their existing expectations; none uses the obsolete all-child-routes-retry-twice assumption.

A separate ordering hazard was reproduced in the persistent purchase-list403 periodic case. An immediate list denial can invalidate the new binding before React starts selected detail, producing child counts 1/1/0. Holding that same denial until the detail has started produces 1/1/1. Both paths mask the protected list/detail and notify denial once. The shipping in-flight case now explicitly holds list and detail, waits for both to start, releases list403, confirms masking, then releases the held detail. Its existing exact count of one detail, two parent checks, one bootstrap and one list is unchanged; the fixed-route map is logged before assertions. A separate actual-React/API regression requires exactly zero new detail reads for the early-denial ordering and verifies masking and absence of delayed retries.

No production changes, range, skip, blanket loop replacement or authority-budget relaxation are included. Composed exact-head shipping HTTPS CI remains required after this correction.

Correction validation: focused production-source/React/API/adapter suite **160/160 passed**, zero skipped; isolated shipping-order reproduction **2/2 passed**; Node syntax check, scoped ESLint and diff whitespace check passed. The exact amended route-map assertion accepted the observed 1/1/1/2 map and rejected four controls, independently changing each route count; its diagnostic ran before every assertion. Shipping TLS/browser CI was not rerun in this author environment.
