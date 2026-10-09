# Untitled UI workspace rebuild — 9 October 2026

Owner direction: rebuild the existing Medcom frontend around the selected Untitled UI design reference after the first visual refresh was rejected. Base: 06aafaa883189d9e682f696a1859d215259781d8.

Visual direction: white working surfaces, Inter typography, consistent gray borders and restrained brand color; compact desktop grids; mobile rows that prioritize identity and status; plain read-only label/value groups; distinct editable controls. Use the existing shadcn primitives and preserve Medcom branding.

Scope: frontend shell, lists, details, forms, login, home, settings, guides, responsive presentation and necessary verification. Keep existing API contracts, permission/session/branch checks, dirty and unresolved-command custody, history/focus/scroll ownership, exact source values and unknown totals. Trailing row actions remain pinned at the right; pagination stays together on the right. No backend/configuration/SQL mutation or invented action availability.

This isolated branch and Draft PR represent the interactive writer's bounded UI lease. Final changes require local quality review, exact-head/base hosted CI, browser presentation evidence and successful deployment. The purchased Untitled UI Pro source is not included; layouts are implemented against public design references with installed components.

## Candidate implementation

- White navigation and working surfaces, Inter 400/500/600 self-hosted with Vietnamese glyphs and SIL license; shared spacing, hierarchy, borders and shadcn controls.
- Flat record sections and labelled read-only values. One responsive shadcn line table is reused by purchase orders, inbound read-only fallback and full purchase readback; it retains exact item context, source quantities, internal row keys and NULL/empty presentation.
- Existing list actions stay pinned at the final right column; one grouped shadcn pager stays on the right. Preserved selection, column customization, keyboard navigation, authority masks, retained editors and request custody.
- Added a native order-detail check across 320/390/1440 px and source-value/one-surface assertions. Updated previous responsive-renderer assertions to the single shared table. Existing application workflows and business endpoints are unchanged.

Local typecheck passes. Local lint has zero errors and the existing TanStack virtualizer compiler warning. The 40 selected display/fallback/shared-UI contract tests pass. The root container cannot launch sandboxed Chromium; required native browser acceptance is supplied by exact-source Linux/Windows CI, without disabling the sandbox or weakening functional assertions. Deployment and visual acceptance remain pending for this candidate.

Browser fixtures serve the same nine explicitly named, tracked Inter WOFF2 assets as production. QR network assertions include only those exact static font URLs; arbitrary font paths and all other requests retain the original rejection behavior. This fixes the first candidate's QR guard failure without changing product logic or disabling any test.
