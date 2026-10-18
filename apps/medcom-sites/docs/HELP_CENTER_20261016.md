> Current help content, fonts and desktop/mobile screenshot evidence: [2026-10-19 refresh](HELP_CENTER_20261019.md). The mobile-only capture record below is historical.

# Medcom /help — user guide implementation

Owner request (2026-10-16): a dedicated `/help` page with its own sidebar, starting at purchasing/inbound, no common-functions category, three documented purchase screens, Feature badges for other screens, detailed Vietnamese instructions and annotated images, with mobile as the primary layout.

## Scope and content evidence

- Route: `app/help/page.tsx`; presentation: `components/help/help-center.tsx` and `help-center.module.css`.
- Catalog/content: `lib/help/guides.ts`. Four top-level groups, 29 help entries, three available guides; 26 placeholder guides. Warehouse has three nested subgroups, without standalone inventory entries. This is a help-publication catalog, not a claim that every entry is a backend module or has passed runtime acceptance.
- UI labels and reachable actions were read from `components/untitledui/tab-erp-screen.tsx` (`getModuleTitle`, status chips, list toolbar, `menuLabel`, action prompt, detail pagination), `purchase-request-create-sheet.tsx` (fields/validation, three mobile steps, creation confirmation), and `lookup-field.tsx` (multi-select `Xong`).
- `tab-erp-screen.tsx:WRITE_GATED_MODULES` currently contains `purchase-orders`: the PO guide covers actual list/detail/refresh only and marks creation/update/deletion Feature. The presence of `purchase-order-create-sheet.tsx` is not evidence that its entry point is reachable.
- PR covers find/filter, header and lookup selection, line entry, review/create, submission, conditional send-to-order, edit/delete and troubleshooting. Approval covers find/filter, review, approve/reject confirmations and outcome checks. PO covers read/filter/detail and the current unavailable write scope.
- `TabErpScreen` renders PR/approval status chips using server status filters; PO open/locked chips filter the loaded page. Count and lock-label limitations are stated in their articles. No status transition outcome is invented.
- Current source may contain owner work in unrelated sales-order files; this help change does not modify those files, shared lookup behavior or ERP transport/write policies.

The historical archives retain the identities in repository `docs/SOURCE_BASELINE.md` and the current source set retains `inventories/source/20261002/source-set.json`. No private archive/SQL body or real record was reopened or required for this UI guide. These guides describe the observed web implementation, not direct verification of historical WinForms or real target SQL/runtime behavior. Full business acceptance and exact deployed behavior remain UNKNOWN here.

## Images

`scripts/capture-help-images.mjs` bundles the actual production screen, create form, lookup and sheet components with an offline synthetic transport. It never imports a test provider into production, contacts ERP, performs business writes or reads credentials/real records. A loopback-only HTML fixture serves compiled application CSS. Native Edge/Chromium captures at 440 × 860; red borders/number badges are DOM overlays rendered before capture, not AI-generated versions of the interface.

Eleven PNGs and their SHA-256 values are in `public/help/images/manifest.json`. Total assets are approximately 0.5 MB. Every image carries a visible synthetic-data label and a textual caption/alt description. The page loads images lazily. Native modal preview supports fit-to-screen and 660px enlargement with horizontal/vertical scrolling.

To regenerate after relevant UI changes, start the existing app preview, set `MEDCOM_BROWSER_TOOLCHAIN` to the installed browser-tool package directory and optionally `MEDCOM_EDGE_PATH`, then run with the locked Node 24 toolchain:

```text
node scripts/capture-help-images.mjs
```

`MEDCOM_HELP_PREVIEW` defaults to `http://localhost:3000` and accepts loopback HTTP only. Stop immediately on fixture failure; do not substitute production records or alter business admission to obtain screenshots.

## Navigation and accessibility

- Independent sticky desktop sidebar, article contents rail and collapsible business groups. Feature badges also label groups containing only placeholders.
- Below 768px, a 44px-or-larger menu control opens a native dialog drawer. Native modal focus trapping, Escape, close controls, scroll locking and focus return are verified.
- Local accent-insensitive Vietnamese search indexes all articles/section content, with explicit no-results and clear controls. The help route issues no ERP requests.
- `?guide=<module>` supports direct links, server-selected initial article, browser Back/Forward and fallback for unknown module IDs. Section anchors account for the sticky mobile header.
- Copy-link provides explicit success/failure feedback. FAQ uses native details. Skip link, reduced-motion styles and print styles are present.
- Entry links were added to desktop header/sidebar, mobile drawer and login; they open a separate tab so the ERP editing screen is retained.

## Verification

Run:

```text
node node_modules/typescript/bin/tsc --noEmit
node --test tests/help-center.browser.mjs
node scripts/test-erp.mjs --contracts-only
node tests/required-ui-gates.mjs
node node_modules/next/dist/bin/next build
```

The help browser harness uses the real local `/help` route. It checks 320/390/768/1440px viewports, horizontal overflow, catalog completeness, all referenced image assets, Vietnamese search, deep links, Back/Forward, native dialog behavior/focus, actual enlargement, FAQs, placeholder states, unknown IDs and absence of ERP requests. Receipts/screenshots go to ignored `.test-runtime/help-center/`; no production data belongs there or in public assets.

Observed local results on 2026-10-16: Node 24.19.0; TypeScript check passed; help catalog/browser tests 2/2 passed with native Edge 155.0.4283.45, all four widths and no ERP requests or page errors; existing ERP suite 664/664 passed; all seven required native UI gates passed; Next production build passed and includes the server-rendered `/help` route. Evidence: `.test-runtime/help-center/evidence.json`, `erp-check.log`, `ui-gates.log`, `build.log` and `.test-runtime/integrated-ui-gates/result.json`. These are local observations, not GitHub CI or deployed-server acceptance.

Deployment to the owner-managed server and real-device/real-role business acceptance are separate from this local UI delivery. No Site identity, hosted deployment, production database operation or automation configuration is changed.

## Owner navigation correction — 2026-10-16

Owner reference: attached screenshot `codex-clipboard-b14877c2-487d-42a2-acdb-0fcd70df694c.png` (six-item sales menu). Purchase and inbound now have separate help groups. Warehouse export is outside Sales, in its own group. Sales follows the screenshot order/captions exactly: Quản lý đơn hàng; Xác nhận đơn hàng; Duyệt đơn hàng; Xác nhận tình trạng hàng hoá; Duyệt, PXK và hoá đơn; Xuất hàng theo PXK.

`sales-goods-status` and `sales-dispatch-invoices` are help-only placeholder IDs, both Feature. Their API/module mapping is UNKNOWN; no new ERP route, grant or business behavior is inferred from menu labels. The existing help entry `sales-qr` is captioned Xuất hàng theo PXK as requested; it remains Feature, with no new user instructions or runtime equivalence claim. All three existing purchase articles and screenshots are retained.

## Owner warehouse hierarchy — 2026-10-16 (supersedes the separate warehouse groups above)

Evidence: owner screenshots `codex-clipboard-8aa3e942-4060-4d38-b512-607d9791debe.png`, `codex-clipboard-59410780-dba1-4769-ab9c-cdb79b21e4a3.png`, `codex-clipboard-1799b9e2-1cbd-4512-963f-b805580954b4.png`, `codex-clipboard-b3a07b63-a8d3-4528-9046-b086de26a507.png`. The help sidebar has Quản lý kho with nested Đề nghị nhập hàng (7 items), Đề nghị điều chuyển nội bộ (8, with role names) and Quét QR-Code (Xuất kho and Xuất bán hàng). The six standalone inventory entries initially added from surrounding menu context have been removed after the owner's correction below.

Sales keeps its six previously requested menu entries. `warehouse-sales-qr` is a separate help-only Feature entry for the screenshot's QR export label; it does not repurpose `sales-qr` or establish an API binding. New warehouse menu labels have UNKNOWN backend mapping until verified. Existing entry IDs are retained for old help links. All warehouse entries remain Feature and no business requests, permissions or writes are changed. Native nested disclosures auto-open the active subgroup for direct links; breadcrumbs include both group and subgroup and wrap on small screens.

## Scope correction after owner feedback

The owner challenged the six standalone entries in `codex-clipboard-e6ab252a-db0d-4a50-8db2-c49d55d37833.png`. Their labels appeared in surrounding portions of earlier screenshots, but adding them as planned web Features was an inference outside the three detailed warehouse branches, not verified feature admission. Removed all six help entries (internal receipts/issues, consignment transfer, assembly/disassembly, stocktaking and return requests) from navigation, search and direct article lookup. Keep only the three warehouse branches explicitly shown with their submenu contents. Do not infer a planned web feature from incidental legacy menu visibility.

## Owner asset menu — 2026-10-16

Reference: `codex-clipboard-1dae75e2-4c3e-426d-951f-84a9985008ab.png`; explicit selection: first two and last entries, excluding the third. Renamed Quản lý máy to Tài sản, retaining the existing movement and repair entry IDs, and added the help-only Feature placeholder `asset-component-registration` captioned Đăng ký QR / Serial linh kiện. The asset group contains exactly these three entries; Thanh lý tài sản is excluded. Registration API/runtime binding remains UNKNOWN; no business route or functionality is added.

## Theme inherited from the main application — 2026-10-16

Evidence: `components/untitledui/medcom-app.tsx` preference initialization and `handleToggleDarkMode` use `medcom.theme.dark`, with system color scheme as fallback when no value is saved. `lib/help/use-inherited-theme.ts` reads the same key, updates the same root/body `dark` classes and listens for native cross-tab storage, system-color, focus, pageshow and visibility changes. Help does not write a second preference or change the main app's controls.

Screen-specific dark styles in `components/help/help-center.module.css` cover articles, sidebar, nested navigation, search, badges, callouts, FAQ, native mobile drawer and image viewer. Instructional screenshot pixels remain unchanged. `tests/help-center.browser.mjs` additionally checks persisted dark and light, new-tab inheritance, native cross-tab updates, system fallback, explicit-choice precedence and open dialogs at mobile/desktop widths; evidence is `.test-runtime/help-center/theme-evidence.json`.

The owner's next request adds a visible Sun/Moon button to `/help`: desktop header and mobile menu bar, with a 44px minimum target and an accessible action label. `use-inherited-theme.ts` now also saves deliberate toggles to the same `medcom.theme.dark` key. `MedcomApp` listens for shared preference changes and focus so a toggle from Help updates the already-open main tab as well. The browser harness clicks the real button, verifies reload persistence and observes the actual main page with only its unauthenticated ERP transport intercepted; no real ERP session or records are used.

The subsequent visual correction is limited to that button: a compact rounded track, persistent Sun/Moon icons, warm active Sun, blue active Moon and sliding selection. A transparent 84 × 44px button preserves the touch target around the 78 × 36px visual track. Existing action labels, keyboard focus, theme persistence and cross-tab behavior remain. The existing reduced-motion rule disables the added transitions when requested; the help layout and articles are unchanged.
