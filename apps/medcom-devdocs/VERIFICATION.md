# Verification — 2026-10-17

## Vietnamese documentation revision — 2026-10-18

- Home is now a business documentation index. Audience slogans and the marketing hero were removed.
- API descriptions, authentication/admission explanations, response descriptions, constraints and visible table labels have Vietnamese presentation text. Raw OpenAPI bytes, operation IDs, field names, error codes and schema identifiers remain unchanged.
- Reader font: `Segoe UI, Roboto, Arial, sans-serif`. Normal text is black in light mode and white in dark mode, including the API field/schema display.
- Catalog checks: 7/7 passed, including complete translation coverage for source descriptions/admission conditions and a regression check against landing-page slogans.
- Native Edge checks passed at 320, 390, 768 and 1440px for navigation, search, API filters, schema display and both themes. Computed font and text colors were asserted. No business API requests or page errors were observed. Receipt: `.test-runtime/browser-receipt.json`.
- Final production build and strict links check passed. After the final template translation, a static-preview smoke check confirmed the Vietnamese options API, Segoe UI, black text and updated template in both its page and `llms-full.txt`.
- The port 3001 preview was restarted with the production static build. The main application on port 3000 was not changed by this revision.

The observations below retain the identity and limitations of the original 2026-10-17 intake.

## Observed results

- `npm run build`: Docusaurus 3.10.2 production build passed, including strict broken-link checks. Output: `build/` (ignored).
- `node --test tests/catalog.test.mjs`: 5 tests passed. Checks operation/page coverage, all local OpenAPI references, exact sidebar mapping, contract hash/download equality, context export completeness and absence of emoji in technical pages.
- `node tests/browser.mjs`: passed against the production static preview at 320, 390, 768 and 1440px with native Edge. Verified search, method filters, request language and response tabs, field dictionary, Feature pages, schema explorer, navigation and dark theme. No page errors and no requests to the business API host. Receipt: `.test-runtime/browser-receipt.json` (ignored).
- Static downloads `/openapi.json`, `/llms.txt`, `/llms-full.txt`, `/context/modules.json`, `/context/provenance.json`: HTTP 200 in the production preview.

## Coverage

`contracts/coverage.json` records 276 operations, 1,209 schemas, 29 Help entries, 19 mapped API modules, 10 Feature entries and 1,516 source field bindings. Every operation also has its UI purpose copied from the source-backed BE/FE reference, with its exact source line retained in the generated catalog.

Exact public contract: `contracts/provenance.json`, SHA-256 `d60e5ff34888d1133e24ed9bd26b41032de406b5595c64c2a71d433610022570`.

## Limits

No login, database access, business read, mutation, deployment or GitHub publication was performed. The three anonymous metadata GET probes returned `401 authentication_required`; no authenticated runtime metadata or field values were inspected. Static metadata comes from the sanitized repository catalogs with hashes in `static/context/provenance.json`. Original Library ERP/DB archives were not available for a fresh rehash. Source and public contract do not prove current target runtime equivalence or business release admission.

The Help label “Xuất hàng theo PXK” and the source caption for `sales-qr` require owner confirmation of exact business equivalence; this UNKNOWN is called out on its module page. Unmapped Help entries do not receive guessed API routes.

Existing application code and its running port 3000 service were not changed by this documentation work.
