# I30: Request presentation within the existing Workspace

## Scope and evidence

The initial purchase and inbound request pass reused the existing neutral Workspace theme and UI primitives. The later owner-requested Sites pass adds a bounded visual refinement of the existing shell, global CSS, theme defaults and request surfaces. Navigation routes, purchase-order grid/detail behavior, API contracts and command authority remain unchanged. The source preparation began from exact published tree `d077a907800969548fe311ea508363291bf67681`; the reviewed serial I29 dependency was applied before presentation: Workspace `116b87eb422807f2a010b6d5a50b7eacf55d7d103285033e1f9e0c409f28e292`, PurchaseReader `be05f68132fe2eefa79f3af8cfe7c5742a720d391781a6fccb5b4e1002e881c3`, and MobileRequest `9f45f860235109d71c3fe2cee0571470b87d935be647dc20b5bff8d4a99967fa` (SHA-256).

All fixtures in the new browser suite are synthetic. Private owner screenshots were used only as visual references. No customer records, screenshots, SQL or configuration diagnostics are included.

## Presentation

- Shared, statically discoverable Tailwind classes and existing Button, Input, Textarea, Badge, Empty and Skeleton primitives provide consistent panels, cards, field groups and action bars.
- Request controls have a 44 CSS pixel minimum target; mobile text-entry controls use 16 CSS pixel text. Card layouts wrap long labels and identifiers.
- Source wall-clock dates are formatted only for display, without time-zone conversion or payload changes. Unknown numeric statuses are not assigned invented business meanings.
- Read-only availability is explained succinctly. Existing pending/unknown-result, reconciliation, exact-value, field identity and navigation-custody protections remain in place.
- Error support disclosure accepts only bounded numeric outcome status, a fixed code allowlist, and a 32-hex correlation reference. Unknown codes become `unknown_code`; arbitrary error messages, URLs, queries and other diagnostics are not rendered. The disclosure performs no requests or storage writes.

## Final Sites, disclosure and notification amendment

- The Sites-derived presentation updates spacing, hierarchy, mobile identifier wrapping and light/dark surfaces through the existing components. It adds no production demo route or synthetic transport.
- Full purchase readback uses a native disclosure with every source header and line still rendered, including exact timestamps, decimal strings, `NULL` and empty strings. Exact cell values have their own span beside aria-hidden mobile labels. Tests explicitly expand the disclosure before existing full-value assertions. The inbound editor remains mounted; only its neutral unselected placeholder is hidden when no unresolved operation or confirmed readback is pending.
- The existing Sonner surface receives fixed Vietnamese success notices only after validated command receipts, and fixed error/warning notices after definitive outcomes. A memory-only ledger deduplicates by original operation and action, fences stale scopes and dismisses scoped notices on suspension or retirement. Reads, polls, malformed acknowledgments and unknown outcomes do not announce success. Inline field validation and persistent unsaved/unknown/custody warnings remain.

## Verification required before acceptance

`tests/request-presentation.browser.mjs` bundles the actual Workspace and production request components and compiles `app/globals.css` through the installed Tailwind/PostCSS toolchain. It does not replace application styles with simplified fixture CSS. Synthetic HTTP responses drive the production clients.

Required views: 320, 390 and 1440 CSS pixels. Required evidence includes actual screenshots of both lists and read-only details, plus loading, empty, error, denied and unresolved-command views; page overflow, touch sizing, mobile text sizing, focus, precise values and no duplicate command checks. The report records compiled CSS hash and screenshot hashes. Synthetic HTTP/browser proof is not backend, SQL or owner-runtime acceptance.

The final suite requires **19 completed cases**: all 10 original presentation/state/custody/support cases, 7 notification cases (including the pure ledger contract and actual Sonner browser flows), and 2 complete-readback/disclosure/dark/keyboard-focus cases. Maximum valid unbroken identifiers are exercised at 320 and 390 pixels: purchase 100 characters, inbound 50. Full-readback checks retain all 101/500 rows and eight cells per row; keyboard focus requires the actual two-pixel outline. Light/dark, toast, maximum-identifier and complete-data screenshot pixels require review. Aborted, incomplete or failed runs cannot report PASS.

Run all existing purchase, inbound, mobile editor and Workspace regression suites explicitly, as well as typecheck, lint, aggregate tests and production build. The aggregate test runner does not include every inbound/browser suite.

At the preceding `8278e99d2729d09295c19c85bbfc5ca44f4c2676` baseline, both operating systems passed all 10 presentation cases; its later built HTTPS suite failed an exact cell-text selector. The final candidate includes the reviewed value-span repair and disclosure-opening steps while preserving all 28 built HTTPS cases, the compiled pre-fix control and existing behavioral assertions. **The amended 19-case suite and full final-head regression/runtime acceptance remain pending.** Earlier baseline results do not establish acceptance of the final Sites/toast composition.

Local preparation environment: Node 24 and Chromium are present, but full locked dependency parity is absent and Chromium IPC launch is blocked. Supplemental scoped ESLint and pure notification-ledger checks passed. Supplemental TypeScript reports the missing `jsqr` dependency; the offered PostCSS plugin is also absent, so neither full typecheck nor compiled-CSS/browser acceptance is claimed locally. The browser suite reports unavailable tooling as failure rather than skipping. Hosted exact-head validation and visual inspection of its screenshot artifacts remain required.
