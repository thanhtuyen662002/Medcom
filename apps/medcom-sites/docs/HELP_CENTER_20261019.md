# Help center refresh — 2026-10-19

Owner scope: update `/help` to match the implemented UI, replace old screenshots with current desktop/mobile captures, use SVG icons/images instead of emoji, remove the “Đọc ngay khi thao tác” block, and improve readable typography. The owner temporarily paused this work for Sales status badges, then explicitly resumed it. The Sales status change is recorded separately in `SALES_STATUS_FILTER_20261019.md`.

## Content and presentation

Seven ready guides cover purchase requests, purchase approvals, purchase orders, Sales order management, PM confirmation, SA approval and Sales QR. The owner-defined 29-entry navigation remains intact; the other 22 entries retain Feature status. No new workflow or API is inferred from legacy menu labels. In particular, Sales goods-status and dispatch/invoice preparation remain Feature entries. PO creation/editing remain hidden by the existing `WRITE_GATED_MODULES` policy and are not presented as usable steps.

`lib/help/guides.ts` updates purchase list pagination, desktop tables/mobile cards, money entry and the request edit flow. `lib/help/sales-guides.ts` documents current status filters, customer-scoped contracts, line editing, file selection/upload recovery, Sales-to-PM, PM-to-SA, SA routing/return, history, and QR/manual entry. It clarifies that PM visibility follows the selected recipient account and branch; the owner confirmed that the reported missing PM record was checked while still signed in as Admin. No permission scope is broadened. CK/tax formulas remain unchanged as previously requested by the owner.

Presentation sources: `components/help/help-center.tsx`, `components/help/help-center.module.css`, `lib/help/images.ts`, and `app/help/page.tsx`. Body copy and field descriptions use 16px Segoe UI, Roboto, Arial, sans-serif; secondary information uses 14px. Light/dark body text is black/white. Existing main-app theme preference, logo selection and cross-tab theme updates are retained. Each illustrated step offers desktop/mobile image selection, SVG device/zoom controls, and an accessible native zoom dialog. Default image selection follows viewport width. The removed sidebar callout has no remaining render or CSS rule. Ready-guide count is derived from the catalog.

## Screenshot evidence

`public/help/images/manifest.json` records **58 current lossless WebP images**, 29 scenes with one desktop and one mobile capture per scene. It includes each image path, device, actual dimensions, red annotation count and SHA-256. `lib/help/image-dimensions.json` provides the same dimensions to image rendering. Source viewports are 1440×1000 and 390×844; list captures can include the full page. The 11 superseded PNG files were deleted after verifying the new image checksums.

Reproduction uses `scripts/capture-help-images.mjs` and `scripts/fixtures/help-scenes.mjs`. Actual production React components and compiled application CSS are rendered on a temporary loopback fixture. `scripts/fixtures/help-transport.mjs` replaces transport only in that capture bundle; its identities, records and status labels are illustrative, not a canonical enumeration of production data. It is not imported by the application. All command methods reject writes. Browser requests to backend/external paths are rejected and counted. Camera captures use Chromium's synthetic media device, without opening a real camera. Red borders/number markers are DOM overlays captured with the UI, not invented UI controls.

The observed capture receipts report zero page errors, backend requests and business writes. No session cookies, real customer/employee identifiers, actual transactions, attachments, raw ERP binaries or SQL dumps were used in these images. Historical archive identities remain in repository `docs/SOURCE_BASELINE.md` and `inventories/source/20261002/source-set.json`; those archives were not reopened or rehashed in this UI-only refresh. No fresh legacy-source/runtime verification or production acceptance is claimed.

To reproduce, start the existing local app preview and run the capture script with the locked Node 24 runtime, `MEDCOM_BROWSER_TOOLCHAIN` pointing at the installed Playwright package parent, and `MEDCOM_CAPTURE_DEVICE=mobile` then `desktop`. `MEDCOM_HELP_PREVIEW` accepts only an explicit localhost/127.0.0.1 origin. Optional `MEDCOM_CAPTURE_GROUP=purchase|sales` limits a run. The fixture is temporary and closes at the end. No package installation or ERP write is required.

## Validation

- TypeScript and ESLint on changed source/scripts/tests pass.
- `tests/help-catalog.test.mjs` verifies 29 entries/seven ready guides, all 58 evidence-backed desktop/mobile assets, exact image hashes/dimensions, no obsolete/orphan images, no emoji in help sources, and absence of the removed callout.
- `tests/help-center.browser.mjs` exercises the real help route at 320, 390, 768 and 1440px: navigation, owner sidebar hierarchy, search, history/deep links, device switching, native zoom/keyboard focus, no horizontal overflow, 44px device buttons, font stack/16px text, and no ERP requests. Theme checks at 390/1440px cover black/white text, light/dark logos, main-page/cross-tab synchronization, persisted preference and system fallback.
- Local screenshots and test receipts are in ignored `.test-runtime/help-center/`; only sanitized product images and their manifest are durable public assets.

The earlier mobile-only screenshot description in `HELP_CENTER_20261016.md` is historical and superseded by this refresh. API contracts, backend/SQL, authentication, CK/tax computation and production deployment were not changed.
