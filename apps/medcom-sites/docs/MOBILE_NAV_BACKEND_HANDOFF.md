# Mobile bottom navigation: implementation and backend handoff

Owner requirement: persistent mobile bottom navigation, complete authorized menu drawer, role-specific quick actions editable/publishable only by verified administrators. Authoritative requirement: parent repository `docs/web/MOBILE_NAVIGATION_ROLE_CONFIG.md`, adopted; also `docs/plans/OWNER_WEB_IMPLEMENTATION_DIRECTIVES.md` section 7.

## Current source audit

Checked backend PR #53 at `7cc37cab99e6a75361ecd0ab06051353c7341700`:

- `src/backend/Medcom.Contracts/Authentication.cs`: WorkspaceView contains Session, Navigation and BranchIds. It has no resolved role quick-nav configuration, effective role identity or navigation configuration version.
- `src/backend/Medcom.Api/AuthEndpoints.cs`: workspace navigation contains platform-status, purchase-orders and inbound-requests according to capabilities. Published endpoints cover auth/workspace/read-only documents. No role quick-nav CRUD/publish/history endpoint exists.
- `src/backend/Medcom.Api/ApiHost.cs`: session resolution is passive (`ResolveAsync(..., false, ...)`), sliding expiration is disabled. Workspace reads may refresh navigation without extending idle lifetime.
- The prior Sites workspace had a desktop/mobile sidebar trigger but no bottom navigation or role-configuration editor.

## Implemented frontend scope

Mobile means under 768 CSS pixels, matching the shared sidebar. A fixed bottom bar includes Home, Search, Menu and Settings, with up to two business shortcuts from the current server-provided authorized menu and a total limit of five items. It preserves server ordering for available business shortcuts, caps the bar at five items and never follows returned hrefs. The current adapter requires both a returned navigation ID and any known capability. It excludes unsupported and source-disabled targets; an empty/revoked navigation set yields shell-only navigation. It is an interim adapter, NOT admin-configured role navigation.

Menu opens the existing left Sheet drawer, with independently scrolling authorized modules, active screen, account/login/logout and explicit close control. Navigation closes the drawer. Mobile Home module/recent/favorite shortcuts use the same authorized set; an unpermitted active screen returns to Home after authority resolution. Safe-area padding and content/toast offsets avoid overlap; the bar hides when an input keyboard occupies the visual viewport. Theme colors are shared with the workspace. Desktop module presentation is preserved.

Workspace authority revalidates on route change, focus/visibility and once per minute while visible, using existing passive GET. Failed refresh clears authority. Logout, expiry and newer reads fence late responses. No SignalR/live guarantee is claimed. Tests cover different authority sets, navigation/capability intersection, revocation, unsupported/source-disabled targets, untrusted hrefs, anonymous/admin-looking grants and response-generation fencing. Supported browser validation remains open.

## Frontend adapter update (2026-10-04)

`RoleNavigationEditor` now supplies the gated edit/preview/publish/conflict surface. `WorkspaceExtensions.effectiveMobileNavigation` can drive the bottom bar after intersection with current authorized screen IDs. Both remain unbound in production because the observed BE has no role DTO/API. Role catalog selection, icon overrides, actor/history and rollback remain explicit further frontend/BE work; the editor does not imply that the full administrative workflow has passed acceptance. See `UI_IMPLEMENTATION_HANDOFF.md`.

## Required Codex BE/API/SQL deliverable (OPEN)

Codex owns this boundary. Implement the full existing contract before enabling the admin editor; do not replace it with browser preferences.

1. Resolve effective role and an ordered, versioned bottom-nav descriptor for the current authenticated tenant/company/user. Backend omits targets outside effective capabilities. Supply bounded stable screen/action IDs, label/icon overrides, enabled and primary flags, and configuration version. Home/Menu shell semantics and one optional center primary action follow the adopted contract.
2. Define and verify the administrative authorization mapping for WEB-MOBILE-ROLE-NAV. The capability name alone is not assumed to be an admin flag. Publish APIs and authority DTOs for role listing, allowed target/action catalog, loading/editing/reordering/publishing configuration, history/audit and rollback/default. Non-admin direct calls must return 403.
3. Implement IRoleQuickNavConfigurationStore with tenant/company/role scope, optimistic concurrency/version checks, actor/time audit and durable persistence. First reconcile existing safe SY_* configuration surfaces; use additive Web storage only after documented SQL review. Never grant business rights through this store.
4. Resolve icons/routes through bounded stable registries; reject unknown executable targets, duplicates, malformed labels, unsafe icon/URL values, excessive slots and multiple primary actions. Return warnings for unauthorized targets omitted from effective navigation.
5. Publish post-commit scoped invalidation and retain focus/manual/bounded passive revalidation. Passive traffic must not extend idle lifetime. Revoked or stale actions remain denied at the API/commit boundary.
6. Deliver exact OpenAPI DTOs/endpoints/error and concurrency semantics, a reachable HTTPS backend origin and secure synthetic acceptance access. The frontend will then bind the admin UI, proxy allowlist and normalized RoleQuickNavProvider to the reviewed contract. No config API route is guessed by the frontend in this patch.

## Acceptance still open

Admin can select role, preview mobile nav, add/remove/reorder allowed shortcuts, choose icon/label/primary action, publish a version, inspect actor/history and rollback. Normal users have no edit controls and cannot bypass the server. Different roles resolve different configured sets. Revocation/invalidation updates clients; SignalR-disconnected revalidation works. Persistence survives devices/restarts. Test at about 390px, safe-area devices, landscape, soft keyboard, screen readers and keyboard focus. These are not closed by the frontend shell or synthetic helper tests.
