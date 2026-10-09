# I66 — Shared record detail composition

## Scope and dependency

Bounded presentation-only follow-on to I65, admitted through the immutable I66 direct-run marker. The lead authorized one additional test-double repair in PR #118 comment 6073503201: `tests/list-view-state.test.mjs` receives only inert shared-presentation exports; the original marker is unchanged. Base commit `cbb1c8acf718c251944ba132c943ac54631a351e`, tree `8224f8d805c1a85798eedd65e6d7ea376be8d225`.

I65 R3 dependency: full patch SHA-256 `20dc09f4e0eba2c33747ef264d9032f03c3546e158db25f16bd72fe6d3c7015c`; overlay `14d7de0322b26e3e1fa33bad0df9c68679ae93f0f0710dc9c4acd1e065309ecb`. The exact R1-to-R3 delta `adbd183e72e3aae2e38afca00f8ab0c545ef1a50df6df6d5fb44ec37cf1199b9` was applied without overwriting this composition work. Qualified item metadata, editable generic lookup and post-receipt freshness remain intact.

## Presentation change

- A record has one visible X. Its accessible name retains the caller's descriptive `closeLabel`; its title is “Đóng hộp thoại”. It delegates only the existing `onRequestClose`. Escape and backdrop use that same existing route.
- The redundant inbound inner Close is removed. Canonical inbound `requestBack` retains dirty/unknown/history custody and invokes `onBack` once after acceptance. The optional `onClose` API remains source-compatible but is not dispatched by the production detail UI.
- The header owns document identity, status and one secondary-action group. Presentation-only status/read-action portals have explicit current presentation gates; hidden editor ancestors cannot accidentally expose their portal content.
- Shared sections group general information, items and notes across purchase, inbound read-only, inbound editors and order details. Configured editor sections use the same surface. Unsupported read-only notes are described as unavailable from the service, never fabricated as empty ERP values.
- Missing/loading/read-error views keep the same grouping. Existing error/recovery text, exact quantities, field identifiers, validation, form ownership and primary footer actions remain intact.
- No command DTO, API, SQL, permission, state-fencing, save/review/send sequence or original-intent changes belong to I66.

## Local verification

- TypeScript: PASS.
- Focused item-display, actual screen controls and shared SSR/CSS tests: 94 passed. Includes new single-X dirty cancellation, accepted close, exact inbound callback count, idempotence, notes form owner and hidden portal checks.
- Selected actual React I40/I41 host lifecycles: 169 passed, including pending/unknown custody and scope/presentation transitions.
- Selected editor/schema/fallback tests: 26 passed.
- List-state/denial regression tests: 21 passed after repairing the existing record-dialog module double to export the three new presentation primitives. Original denial assertions are unchanged; the initial missing-export failure is retained in private verification evidence.
- Actual purchase/inbound Workspace fixture compilation with emitted CSS: 2 passed.
- Shared record browser fixture: compiled only; no native interaction acceptance claimed.
- Full ESLint: PASS with the existing `grid.tsx` TanStack incompatible-library warning; no new lint errors.
- Production Next.js build: PASS using the existing installed dependency versions copied within the isolated checkout. An initial cross-root dependency symlink was unsuitable for Turbopack; no package or configuration changes were needed.
- `git diff --check`: PASS.

## Required follow-through

Native browser/layout/history/focus evidence is NOT_RUN locally. Existing executor Chromium singleton socket restrictions are not retried or bypassed. A broad editor suite also encountered unavailable Windows Edge / Playwright executable preflights; these are not passing browser runs. Required aggregate/native gates and actual desktop/mobile pixels must be evaluated on the hosted runner against the final integrated head before acceptance. Updated native assertions separately mask header children while the shell remains open, measure compact body content fit and no scrollbar, and cover the single X, status/action header placement, body groups, touch-target fit, stationary header/footer, retained inputs, nested modal guards and existing history/custody postconditions. No production data, live writes, publishing, deployment or feature activation was performed in this local task.

## R2 — Fixture-only composition repair

The lead authorized this amendment in PR #118 comment 6073622598, adding only `tests/local-https-frontend.test.mjs` to the bounded scope; the other amended tests were already owned. The immutable admission marker and all production files remain unchanged from I66 R1.

- History recovery now waits for the exact document-qualified shared dialog. Its actual React fixture supplies `documentNumber`, and the locator transport models the title's separate text/document-number segments. It still proves reviewed recovery, the exact original Notes value in its shared Notes group, disabled stage actions, wrong-document/value rejection, unbound inbound recovery and original command object/JSON retention.
- The packaged HTTPS identity fixture and helper qualify the single exact document number in the selected dialog's shared header. The historical baseline-control selector remains unchanged. The actual production SSR assertion verifies one header identity and a real purchase form instead of requiring the intentionally removed duplicate inner heading.
- Inbound native focus checks locate the single X by its inspected `Đóng hộp thoại` title; its caller-specific accessible name is unchanged.
- The 101-line purchase native fixture now verifies the item cell's four exact `dt`/`dd` fields, including the source row ItemID and three unavailable metadata values. Its 101-row, eight-cell, ordinal, raw 18-digit quantity, NULL and hidden internal-ID assertions are preserved.

The original composed failures and passing I65-only controls are retained in private evidence. Hosted I65 run `37878338072` failed both OS jobs at the obsolete direct-span item assertion; the original merge checkout was `c97ad4befdde36fec6bdf13c8d6a45d911172b37`. This historical failure is not replaced by a local pass.

R2 local verification: 84 targeted non-native fixture/host tests passed; 25 item-display tests passed; the actual purchase Workspace browser fixture compiled with real CSS (one test). The two previously failing identity/readiness tests pass within those 84 tests. All four amended scripts pass syntax validation; diff checks pass. No production code or semantic guard changed. Native browser, full aggregate and final combined-head hosted acceptance remain pending.
