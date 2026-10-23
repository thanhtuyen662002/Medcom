# P2-01 shared screen components

Scope: `docs/tasks/P2-01.md`, mandatory design §2 in
`docs/architecture/APP_SCREEN_UNIFICATION_P2.md`. Existing screens are untouched.

- `AppSheet` uses the existing shadcn `components/ui/sheet.tsx` (Radix Dialog).
  Radix supplies the modal focus trap, Escape handling and accessible title and
  description. The wrapper disables its small default close button, supplies an
  `AppButton`, and restores focus to the external opener. The older
  `UntitledBottomSheet` has no focus trap or Escape handler and forces text colors.
- `ScreenToolbar` is controlled: update `search` in `onSearchChange`; perform the
  actual search in `onSearch` (300 ms debounce, immediate Enter/clear). The owning
  screen decides how to fetch and resets pagination after search/filter changes.
  Set `--app-toolbar-top` to the height of a sticky screen header when present.
  `debounceMs={null}` delegates typing debounce to an existing screen; Enter and
  clear still invoke `onSearch`. P2-03 retains the ERP screen's 400 ms timer.
- `FilterChips` explicitly calls `onPageChange(1)`. `FilterSheet` stages edits;
  applying or clearing calls `onApply` then closes. Reopening resets the draft to
  the supplied value. Clear resets status/dates and page size to 20. The desktop
  filter is a modal popover; `--app-filter-top` controls its top offset.
  Chip counts may be omitted when the API provides no totals (the sales status
  lookup returns IDs/labels only); a current-page count must not become a total.
- Pass creation callbacks only with permission. `CreateFab` additionally requires
  `allowed` and a complete accessible label, e.g. `Tạo chứng từ kiểm thử`.
- `RecordList` maps generic rows to cards and the existing `DocumentListTable`;
  pagination wraps `DocumentListPagination` with page sizes 20/50/100. `rowCount`
  and `hasMore` retain that component's semantics; no total is inferred.
  `retainRowsOnError` keeps the last successful page and navigation below the
  error/retry card, preserving the ERP screen's existing retry behavior.
- `FormField` renders an input by default. Its render function supplies label,
  validation and size props for a select, textarea or another custom control.
  Custom controls must forward those props. Lookup integration keeps the existing
  `LookupField` with its own label/error API inside `FormSection`; it currently
  does not accept generic DOM control props. `FormSheet` uses zero-based steps;
  native form submission invokes `onNext` until the last step, then `onSubmit`.
- `StatusBadge` delegates ERP colors/contrast to `lib/erp/status-colors.ts`.
  ERP colors retain the existing helper's behavior; fallback tones support dark
  mode. `RecordCard` emits the code once and removes duplicate metadata values.
  Its status badge wraps within 55% of the first row so long labels fit at 375px.
- P1 `DocumentActionBar` is retained as specified. Migrating existing detail
  actions to `AppButton` requires a screen integration task; P2-01 does not modify
  `components/erp/**` or `components/untitledui/**`.

All fixtures in the two P2-01 tests are synthetic and stub fetch. They do not
establish backend/DB/runtime acceptance. Modal markup/prop tests verify wiring to
the real Radix-backed Sheet; native browser focus behavior remains a browser QA
check for the later integration/visual-review tickets.
