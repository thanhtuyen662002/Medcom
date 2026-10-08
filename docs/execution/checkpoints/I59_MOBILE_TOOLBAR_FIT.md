# I59: shared mobile toolbar fit

Status: local source, compiled-CSS and actual React contract admission passed. Exact-head hosted native CI and screenshot review remain required; this is not runtime or production acceptance.

## Admission and scope

- Accepted source base: `43acecad934f074464426a292d33180a0c131243`; tree: `cd0d8bc70e78eae860cb09418533bcfc6da350b4`.
- Control head: `06e7634971b4d4bbf98b0d52b1e33472bfe9b72a`; immutable I59 marker is preserved. Root remains sole publisher.
- The isolated candidate was archived from a local Git baseline whose tree exactly matched the accepted source tree. No modified I58 working files were copied.
- Eight admitted mutable paths cover CSS, shared list controls, the three hosts, two presentation tests and this checkpoint. A [root-authorized narrow amendment](https://github.com/thanhtuyen662002/Medcom/pull/111#issuecomment-6070853881) adds `apps/medcom-sites/tests/list-view-state.test.mjs` only to export `RequestRefresh` from its existing visual doubles, forwarding caller props and retaining every assertion.
- Amendment preimage: Git blob `d52574c01c479b7c54d0918851d56ea3193be0ce`; SHA-256 `fc34051cf306903cfa5e9a7979940648ff870a12590bd0f59e23fd3a708b840f`.
- No backend, API, database, configuration, dependency, workflow or runtime-activation changes. No branch ID aliases, value normalization or new branch authority are introduced.

## Inspected evidence and repair

Actual pixels were inspected before editing from accepted CI run `37852764854`, Windows presentation artifact `11582759580`:

- `i42-purchase-orders-shared-320.png`, SHA-256 `4cac388f64db691b235042375f4d2fae4a16498bbdbb2a90ee7d29a806ec18ee`: search icon and desktop shortcut badge collide in the narrow Orders input.
- `i42-purchase-requests-shared-390.png`, SHA-256 `ce0e1eb5bc7fca58f1a515c845dcbbf89ff205ad4f11b1e9d4cb01f29a6b4b42`: branch text is reduced to a fragment and the dropdown chevron is absent.

The desktop `.request-list-branch .request-select` padding selector outranked the former mobile tag selector. With the former 84px allocation, the 36px/32px padding and borders left only about 14px of text space. The mobile icon rule also hid both icons, including the chevron.

The shared mobile toolbar now uses two compact rows: a full-width search input above a native branch select and a 44px refresh button. Mobile hides only the branch building icon, keeps the dropdown chevron and uses a matching-specificity `12px 36px` select-padding override. The desktop shortcut badge and its 48px reservation are removed together on mobile. Desktop padding, shortcut, grid customization and refresh text remain.

`RequestRefresh` gives all three hosts the same decorative icon and accessible name, `Làm mới`, while forwarding each host's exact original disabled condition and click callback. Orders retains its fetching spin. No querying, selection/custody, source option values, assigned-branch locking, native select semantics, sticky positioning or modal layers are changed.

## Verification

Passed on the final candidate:

- Explicit non-browser suites: `list-view-state`, `request-screen-controls`, `branch-selection`, `shared-screen-ui`: **72/72**.
- Positive-name-selected presentation contracts: **6/6**, including real Workspace/React compilation, emitted CSS modules and compiled Tailwind CSS. The native parent test was excluded by a positive allowlist.
- Scoped ESLint: passed. Full ESLint also passed with the existing unrelated TanStack virtualizer warning.
- TypeScript `tsc --noEmit`: passed.
- `git diff --check`: passed.

New actual React checks verify shared refresh handler/ref/disabled forwarding, accessible name/icon, unchanged native source IDs and explicit assigned locking. Compiled CSS checks verify the equal-specificity mobile overrides against desktop declarations and preserve the chevron.

The existing native I42 scenarios retain all their original assertions and gain 360px coverage alongside 320/390/1440px. Each of the three real list hosts now measures computed padding and borders, actual text-content width, canvas text width in the computed font, icon/chevron separation, hit-test reachability and both 44px touch dimensions. Mobile checks require a fully readable selected synthetic branch and a useful-length typed search. Desktop checks require the Orders shortcut badge to stay visible outside the text area and require Requests/Inbound to have no invented badge. New screenshot names are `i59-{screen}-toolbar-{width}.png`; the existing screenshot set remains. The synthetic draft is restored before the original resize/open/close tests continue.

### Local limitations and failed attempts

An initial negative test-name filter unintentionally selected the native parent through nested tests. Chromium failed at the already-known OS socket restriction (`socket() failed: Operation not permitted`). No workaround or subsequent native retry was used. The attempted unchanged `--contracts-only` aggregate unexpectedly included legacy native Edge tests; those reported missing Windows Edge. That aggregate also exposed the missing refresh mock export, now repaired under the narrow amendment, and the physical-node_modules gate against the initial dependency symlink. It is not a passing aggregate.

A local Next build failed because its initial node_modules symlink pointed outside Turbopack's project root. Matching manifest/lockfile dependencies were subsequently materialized as physical local files for the final positive checks, without dependency changes. The Next build was not rerun and is not claimed as passed.

No local native geometry or new screenshot acceptance is claimed. Hosted native Linux/Windows checks, exact-head build/package gates and review of the new screenshots must pass before acceptance. The browser-test delta is supplied separately so Root can compose it with I58's existing OnlyRemove case without replacing that work.
