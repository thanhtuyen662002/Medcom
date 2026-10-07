# I42 — Shared list components, phases A and B

Base: `b30d7dbd1e05d351ac7109844297e57d76f3399f`.
Base tree: `43cfaefeacb119110c265df8b8878d071ab87e78`.

## Scope and verified evidence

Purchase Request is the visual standard. The private owner-browser comparison
of Purchase Request, Purchase Orders and Inbound toolbar/header pixels was
materialized with its verified identity and inspected. No image bytes, private
paths, real records, credentials, configuration, SQL or DLLs are included here.
The comparison is pre-change evidence; it does not establish I42 pixel acceptance.

Source inventory (`components/erp/workspace.tsx`, `lib/erp/catalog.ts`): three
live document-list paths exist. Approval/accounting are unavailable-service
shells; invoice request is source-configuration/permission blocked; transfers
has eight stage choices and unavailable service content; reports has a default
unavailable shell and an adapter-gated catalog/parameters/jobs implementation.
No fabricated grids, data, filters or permissions are added to those paths.

Only the five shared/Orders presentation sources, `app/globals.css`, the existing
presentation test file and this checkpoint change. Purchase/inbound/workspace
controllers are unchanged. The Orders controller segment from its function
entry through `title` is byte-identical to the base: hooks, query keys, effects,
read scopes, selection reset, scroll retention and submit logic are preserved.

## One grid implementation

`grid.tsx` owns the only table, row and row-action renderer. `RequestListTable`
is now a compatibility adapter, preserving its existing columns/rows/cells,
selected flag, Open callback and button-ref API. It supplies the supplied data
and actions to `ErpGrid`; it does not render another table.

- Purchase/inbound keep variable-height, labelled responsive cells. They do not
  opt into selection, layout controls or virtualization. Each request row has
  one Open button/ref across desktop and mobile, with the same React identity.
- Orders retains page-scoped checkbox/range selection, keyboard navigation,
  resize, pin, reorder, hide, required columns and session-local saved layouts.
- All three use the Purchase Request panel/table/control/identity/status skin.
- Orders now uses the shared labelled mobile cells and explicit Open action.
  The old `mobileCard` callback remains compatible as a button in the same first
  cell, rather than a separately rendered mobile row list.
- Mobile cards show the complete original column projection even if a desktop
  layout hides or reorders columns. Hidden mobile headers retain their labels;
  resize controls are neither rendered nor focusable on mobile.
- Normal/compact virtual rows use explicit 65/45px geometry: a 44px touch target,
  20/0px cell padding and a 1px border. Cell content cannot grow those rows.
  Long status content can use two lines normally and one in compact mode;
  complete source text remains in the accessibility tree and native title.
  Mobile and nonvirtual request rows keep unrestricted wrapping.
- Row/column virtualizer caches are explicitly invalidated when density or
  column geometry changes. Logical header/data/action column indices remain
  aligned through horizontal virtualization. Active coordinates are clamped
  after row/column removal, with one reachable cell in the rendered window.

The optional `ErpGrid` additions are `rowAction`, `selectable`, `customizable`
and `virtualize`. Existing required data/callback/scope props retain their
meaning; existing defaults retain the advanced grid. Fluid noncustomizable
rows are never virtually measured as fixed-height rows.

## Shared controls and state boundaries

`RequestListToolbar`, enhanced `RequestSearch`, `RequestBranch`, `RequestSelect`,
`RequestPagination`, `RequestDocumentIdentity` and existing request feedback
primitives are presentation-only. Orders consumes them now. Search supports its
existing input ref, 50-character limit and Ctrl/Cmd+F focus. Branch supports the
Orders `all` sentinel while retaining the request screens' empty-string default.

`RequestPagination` accepts explicit previous/next disabled states and exact
callbacks. It never calculates authority, resets selection, queries data or
invents totals. It supports separate visible text and accessible labels, and
optional freshness content. `RequestError` retains safe bounded support metadata
and provides support-reference copying.

`ServerQueryControls` uses the same native finite-choice/select and input/button
primitives. Typed terms, validation, draft/cancel/apply semantics, max counts and
exact string values are retained. It remains disconnected from screens whose
backend supports only search/branch/paging.

Controllers continue to own query/filter/page state, draft-versus-applied
semantics, authorization/read generations, response fencing, selection,
Open/Close focus custody, guarded navigation, dirty editors, frozen pending
intent, receipts and reconciliation. No pending editor moves inside a list
loading/empty/error conditional.

## Verification and limits

Observed locally with Node 24.19.0 and the existing locked application packages:

- TypeScript and full/scoped ESLint passed; the existing TanStack Virtual React
  Compiler warning remains (zero lint errors).
- Next production build passed with the physical approved dependency tree.
  Initial borrowed-dependency symlink verification failed; it was replaced by a
  physical copy of the same installed packages, with no dependency/lock changes.
- Aggregate FE suite: 225 checks, 221 passed, four browser-launch failures from
  the executor's `socket() failed: Operation not permitted`. No tests removed.
- Existing component/presentation/status checks: 20/20 passed.
- Standalone package safety suite: 43/43 passed after physical dependency setup.
- New actual-component SSR check passed, exercising the shared grid adapter,
  status/null/decimal strings, escaping, native controls and pagination.
- Updated presentation harness compiled with the real application/Tailwind.
  It retains all 29 prior browser cases and adds seven required cases, for 36:
  shared list/control matrix at 320/390/1440; Open node/ref continuity; Orders
  keyboard/selection/virtualization; resize/pin/order/hide/layout lifecycle;
  separately labelled actual typed-query and wide-grid component contracts.
- The earlier presentation launch attempt completed zero of its then-34 cases
  because Chromium hit the same socket restriction. The final 36-case browser
  matrix is NOT RUN locally. No screenshot, interaction or geometry pass is
  claimed from compilation or SSR.

Independent final patch review and exact composed-head hosted browser/CI runs
remain required. Synthetic fixtures are not real ERP/SQL or deployment acceptance.

## Minimal coordinator-only follow-on wiring

This base intentionally leaves purchase/inbound controller files untouched while
I40/I41 lifecycle work is integrated. Their tables already use the shared engine,
but their inline toolbar/pager markup is not yet fully migrated.

On the composed lifecycle head, the coordinator can make these bounded JSX-only
changes, preserving each existing handler expression verbatim:

1. Import `RequestListToolbar` and `RequestPagination` from request-list-shell.
   Replace each list `<form className="request-list-toolbar">` tag with
   `RequestListToolbar`, retaining its `onSubmit`, accessible label and children.
2. Purchase pager: use `label="Phân trang đề nghị"`, the existing page,
   `previousDisabled={page===1}` and
   `nextDisabled={!active?.list?.hasMore||page>=1000}`. Move the existing guarded
   previous/next callbacks unchanged into `onPrevious`/`onNext`. Default visible
   and accessible text is `Trang trước` / `Trang sau`.
3. Inbound pager: use `label="Trang danh sách phiếu"`, existing page,
   `previousDisabled={page===1}`, `nextDisabled={!currentRows?.hasMore}` and its
   existing `navigate` callbacks unchanged. Preserve current accessible labels
   through `previousLabel="Trang phiếu trước"` and
   `nextLabel="Trang phiếu tiếp"`; default visible text matches the other lists.
4. Inbound submit may adopt visible text `Tìm kiếm` with its existing specific
   accessible name retained if needed for selector compatibility. Its branch
   remains a draft until the existing submit handler applies both values.
   Do not change it to the Purchase/Orders immediate branch callback.
5. Do not invent an Inbound refresh callback by repurposing a permission or
   reconciliation retry. Add one only in a separately verified controller scope.
6. Unavailable/permission-blocked tabs may later consume the shared panel/header
   and notice presentation without changing their titles/reasons into an empty
   data state, and without creating unsupported grids.

Re-run the composed lifecycle/browser matrix after this wiring. Do not claim
all three pagers migrated or all-tab pixel acceptance from phases A and B alone.

## Coordinator composition wiring

The coordinator subsequently applied the documented JSX-only toolbar/pager
migration on the reviewed I40 and I41 lifecycle composition. Both request
screens now consume `RequestListToolbar` and `RequestPagination`; their
existing callbacks, disabled conditions, refs and draft filter semantics remain
unchanged. Visible and accessible submit/pager captions are standardized together
for label-in-name accessibility; form/navigation labels retain context. Inbound's visible submit/pager captions
now match the common controls without inventing a refresh action.

Independent structural comparison preserved all hook, state declaration,
arrow-expression, disabled-predicate and ref inventories before/after wiring.
The I40 renderer helper now resolves the accessible name rather than assuming
it equals the visible caption; an additional actual-renderer case
checks matching common captions/accessibility names, disabled states and the
next-page callback. Existing behavior cases remain mandatory. Exact combined
browser/CI and owner-runtime acceptance are still separate requirements.

A final accessibility correction makes custom pagination names include their
visible caption. Existing browser selectors are adapted to the standardized
names and native select controls without removing behavioral assertions; the
exact historical pre-fix control keeps its original interaction selectors.
