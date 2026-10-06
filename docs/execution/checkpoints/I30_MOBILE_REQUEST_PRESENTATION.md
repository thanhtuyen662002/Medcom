# I30: Request presentation within the existing Workspace

## Scope and evidence

The purchase and inbound request bodies reuse the existing neutral Workspace theme and UI primitives. The shell, navigation, purchase-order grid/detail, shared global CSS, API and command contracts are not redesigned. The source preparation began from exact published tree `d077a907800969548fe311ea508363291bf67681`; the reviewed serial I29 dependency was applied before presentation: Workspace `116b87eb422807f2a010b6d5a50b7eacf55d7d103285033e1f9e0c409f28e292`, PurchaseReader `be05f68132fe2eefa79f3af8cfe7c5742a720d391781a6fccb5b4e1002e881c3`, and MobileRequest `9f45f860235109d71c3fe2cee0571470b87d935be647dc20b5bff8d4a99967fa` (SHA-256).

All fixtures in the new browser suite are synthetic. Private owner screenshots were used only as visual references. No customer records, screenshots, SQL or configuration diagnostics are included.

## Presentation

- Shared, statically discoverable Tailwind classes and existing Button, Input, Textarea, Badge, Empty and Skeleton primitives provide consistent panels, cards, field groups and action bars.
- Request controls have a 44 CSS pixel minimum target; mobile text-entry controls use 16 CSS pixel text. Card layouts wrap long labels and identifiers.
- Source wall-clock dates are formatted only for display, without time-zone conversion or payload changes. Unknown numeric statuses are not assigned invented business meanings.
- Read-only availability is explained succinctly. Existing pending/unknown-result, reconciliation, exact-value, field identity and navigation-custody protections remain in place.
- Error support disclosure accepts only bounded numeric outcome status, a fixed code allowlist, and a 32-hex correlation reference. Unknown codes become `unknown_code`; arbitrary error messages, URLs, queries and other diagnostics are not rendered. The disclosure performs no requests or storage writes.

## Verification required before acceptance

`tests/request-presentation.browser.mjs` bundles the actual Workspace and production request components and compiles `app/globals.css` through the installed Tailwind/PostCSS toolchain. It does not replace application styles with simplified fixture CSS. Synthetic HTTP responses drive the production clients.

Required views: 320, 390 and 1440 CSS pixels. Required evidence includes actual screenshots of both lists and read-only details, plus loading, empty, error, denied and unresolved-command views; page overflow, touch sizing, mobile text sizing, focus, precise values and no duplicate command checks. The report records compiled CSS hash and screenshot hashes. Synthetic HTTP/browser proof is not backend, SQL or owner-runtime acceptance.

Run all existing purchase, inbound, mobile editor and Workspace regression suites explicitly, as well as typecheck, lint, aggregate tests and production build. The aggregate test runner does not include every inbound/browser suite.

Local preparation environment: Node 24 and Chromium are present, but the full locked application development dependency tree is absent. The new suite reports `NOT_RUN` as a failure rather than skipping or claiming a pass. Hosted exact-head validation and visual inspection of its screenshot artifacts remain required.
