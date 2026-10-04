# I05 Windows UI hardening handoff

## Ownership and source boundary

- Direct claim: `docs/execution/direct-runs/I05.json`, run
  `f6cca578-4c3a-4ff9-9cc2-329f1f82af98`, Draft PR #57.
- Worker base: `576a66ac86a69033cc05034b6dbfa19ad873c58f`; isolated
  `medcom-laptop-review` clone, local branch `local/medcom-i05-laptop`.
- Parent remains the sole GitHub publisher. This handoff does not authorize
  push, merge, Sites publication, server configuration, deployment or SQL access.
- No backend, shared lockfile, workflow or schedule changes. No private source
  archives, real accounts, credentials or production business rows used.

## Reproduced defects and resulting behavior

1. A higher backend authority observation version with identical effective
   authorization remounted Documents and the grid, losing search and personal
   column settings. UI state now follows the canonical effective identity,
   fixed session lifetime, capability/branch/screen sets and a successful local
   login boundary. Query keys retain `authorityVersion`; changed query data
   never substitutes old rows. The mounted grid is hidden with empty rows while
   new data is pending. Selection/detail fences still react to query scope.
2. Arbitrary session expiry strings passed response validation and crashed
   Settings with `Invalid time value`. Both timestamps now require a valid
   ISO datetime with explicit timezone and finite JavaScript date parsing.
   Malformed responses take the existing `502 / invalid_api_response` path.

The DTO has no immutable principal/session ID. Observable identity plus the
fixed absolute expiry and local successful-login boundary are conservative
state boundaries, not proof of globally unique users. A cross-tab identity
switch returning an entirely identical DTO cannot be distinguished without a
backend contract extension. No backend version semantics were changed.

## Validation

- Windows x64; runtime Node 24.21.0; installed Edge 154.0.4258.53, headless.
- Original test runner: **97 passed, 0 failed, 0 skipped**. Includes real
  component bundles, malformed/timezone-free expiry responses across workspace,
  session, login and continue, and effective scope/late response fences.
- Typecheck passed. Native Next build passed. Lint: 0 errors, 1 existing
  TanStack Virtual incompatible-library warning. `git diff --check` passed.
- Browser harness: **16 passed, 0 failed, no uncaught/hydration errors** on the
  modified local build. Scope matrix covers user display identity, tenant,
  company, branch set, capabilities and authorized menu. Preserved search,
  saved view, 260px date column and hidden status column after version refresh.
  Checked repeated login submit, password removal on close, exact decimal detail,
  grid keyboard navigation, paging/search boundaries, detail close/reopen,
  continue/logout/relogin, delayed detail after revocation, and 390x844 mobile
  detail/shortcut revocation. Invalid expiry while Settings is open safely
  clears authority without an error boundary.
- External laptop evidence: `browser-harness/evidence-i05/results.json`,
  `view-before-revalidation.png`, `view-after-revalidation.png`,
  `invalid-session-settings.png`, `synthetic-mobile-detail.png` and
  `synthetic-mobile-revoked.png`. Reproducer: `browser-harness/run-browser.mjs`
  with `fixture-upstream.mjs`. These reside beside the isolated clone and are
  not application dependencies or a hosted production endpoint.
- The first modified-build browser attempt failed on an ambiguous harness
  selector (separator and numeric input shared an accessible label), cascading
  through an open dialog. Selecting the numeric spinbutton corrected the
  harness; the complete rerun passed. No product assertion was weakened.
- The tested local assembly explicitly carries `UNVERIFIED_LOCAL` and the
  base SHA, not a false clean-commit claim. Final source-fenced assembly and
  exact-revision verification are separate handoff checks after local commit.

## Remaining acceptance gates

Browser requests use an intercepted synthetic HTTPS origin routed to a
loopback Next BFF, with upstream fetch mocked outside the application. The
browser enforces its secure cookie rules and the real BFF enforces CSRF and
route/header policy, but this does not verify a TLS handshake, real ASP.NET
legacy authentication, SQL, IIS/reverse proxy or Sites reachability.

An approved real `MEDCOM_API_ORIGIN` and server-side `MEDCOM_PUBLIC_ORIGIN`,
trusted HTTPS chain, authorized runtime/accounts and business acceptance remain
required. Keep TLS verification enabled. Independent review and exact-head
remote CI remain parent integration gates. Production admission remains
`BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE`.
