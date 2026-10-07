# I36 — Unified request presentation

Base: `830d6c710b0fb47dd75a01dfb163ca2619bf5ea5`.

## Scope and evidence

Seven owner-provided desktop/mobile reference images were inspected privately. No
image bytes, real record identifiers, people, departments or customer rows are
included. Orders provide the compact panel/table reference. This patch changes
presentation only; it is not target ERP/SQL or deployment acceptance.

- Shared `request-list-shell.tsx` supplies compact headers, search and branch
  controls, and a semantic table that becomes compact cards on phones. Each row
  has exactly one Open button/ref across viewport sizes, preserving focus custody.
- Purchase/inbound list controllers retain their existing read/authority,
  cancellation, guarded navigation, dirty-state and unresolved-command logic.
- Sticky topbar is opaque. Orders grid fills its viewport by assigning surplus
  width to an aria-hidden trailing fill cell, keeping data-column custom widths,
  resize behavior and pinned-column offsets intact.
- Command search has an explicit labeled close button, Radix modal focus
  containment, initial input focus, exact-opener focus restoration on dismissal
  (suppressed after committed navigation), 44px result rows and bounded dynamic
  viewport height.
- Bottom navigation uses consistent icon sizes and single-line labels; full
  accessible labels remain available.
- I38 supplies optional source-backed status metadata and the shared
  `documentStatusLabel` helper. Rendering consumes those names without guessing
  numeric semantics; null and unknown codes have explicit fallbacks. Detail
  metadata is presentation-only and matched to document/status identity. No
  command aggregate, canonical bytes, state token or receipt is mutated.
- Native branch selection semantics and existing request guards are retained.
  The controls are styled consistently; this does not introduce a custom popup
  with different keyboard behavior.

## Verification observed locally

Node 24.19.0; pnpm 11.25.0; frozen lockfile install succeeded, including the
602-entry supply-chain policy check. The initial offline install lacked required
metadata; a normal frozen online install succeeded without changing policies.

- TypeScript: passed with I38 FE metadata/helper composed for verification.
- ESLint: 0 errors, one pre-existing TanStack Virtual compiler warning.
- Next production build: compiled, TypeScript and static-page generation passed.
- Existing generic FE suite: 222 tests; 218 passed, four failed at Chromium launch
  due to executor `socket() failed: Operation not permitted`. No case was skipped
  or removed to make the suite green.
- Presentation suite: actual React and Tailwind bundle compiled; Chromium launch
  blocked before scenarios. Existing 26 scenarios remain; three I36 scenarios
  add 320/390/1440 command-dialog geometry/focus/close, list semantic/focus target,
  opaque header, mobile nav, orders full width and status fallback coverage.
- The supported execution escalation was attempted for the synthetic localhost
  presentation suite with Chromium sandbox enabled. It returned the same socket
  restriction. That route was stopped; no security settings were changed.

Actual screenshots and browser scenario acceptance are **NOT RUN / BLOCKED**
locally. Hosted CI must run the full composed suites and inspect newly generated
synthetic 320/390/1440 screenshots before acceptance. A successful build is not a
substitute for visual/browser validation.

## Remaining boundary

I36 deliberately does not remove `selected` from inbound list effects. That is
an independent generation/cancellation-fencing change requiring dedicated late
response/denial tests. No backend, contracts, locks, workflows, immutable markers,
private configuration, TLS or runtime activation are changed in this patch.

Root integrates I38 helper/contracts with this patch, owns exact-head CI,
independent review and all GitHub publication. The local verification copy of
I38 FE files is excluded from the I36 patch/source manifest.
