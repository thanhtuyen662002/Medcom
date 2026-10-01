# Mobile Navigation + Role Quick Actions Contract

Status: **ADOPTED for Phase 2 implementation**.

Owner direction: mobile uses a persistent bottom navigation for high-frequency actions and a Menu item that opens a left-side drawer/sidebar containing the full authorized ERP navigation. Bottom navigation contents must be configurable **per role**, but only an account with administrative authority may change that configuration from the UI.

## 1. Mobile navigation anatomy

### Persistent bottom navigation
Default slots:
1. Home / Tổng quan
2. Work / task-oriented quick entry
3. Center primary action
4. Reports / lookup or another high-frequency role action
5. Menu

The exact quick-action slots are **role configuration**, not hard-coded globally.

### Menu drawer
Tapping **Menu** opens an overlay drawer/sidebar:
- full authorized module hierarchy;
- grouped ERP screens;
- active screen state;
- user/account summary;
- logout;
- independent scroll;
- tap outside / close button to dismiss.

The drawer is the comprehensive mobile navigation. Bottom navigation is only an accelerator.

## 2. Role-configurable bottom nav

Define capability **WEB-MOBILE-ROLE-NAV**.

An admin may configure, for each role:
- visible bottom-nav items;
- item order;
- icon;
- label;
- target route/action;
- one optional center/primary action;
- enabled/disabled state;
- effective version.

Pilot constraint:
- normal users cannot customize role quick actions;
- normal users cannot override the role configuration;
- only an account with verified administrative permission may change the configuration through the UI.

A bottom-nav configuration never grants business permission. It only references capabilities/routes the role already owns.

## 3. Authorization invariants

For every configured shortcut:
1. backend resolves the current authenticated user's effective role/capabilities;
2. backend removes shortcuts whose target capability is no longer authorized;
3. frontend renders only the server-resolved authorized shortcut set;
4. direct route/API access is re-authorized server-side;
5. mutation actions are re-authorized against current business state at commit time.

Therefore:
`configured shortcut` != `permission grant`.

If an administrator incorrectly configures an item that a role cannot access, the item is omitted from the effective navigation and the configuration UI should show a warning.

## 4. Admin configuration UX

Admin surface:
- select role;
- preview current mobile bottom nav;
- drag/reorder allowed actions;
- add/remove shortcut;
- select center primary action;
- preview mobile layout;
- save/publish configuration;
- show effective configuration version;
- audit who changed it and when;
- rollback to previous version/default.

Non-admin accounts:
- no edit affordance;
- admin route/API is forbidden server-side even if manually requested.

## 5. Persistence contract

Presentation configuration and authorization remain separate.

Preferred implementation boundary:
`IRoleQuickNavConfigurationStore`

The store may use an existing safe legacy configuration surface if exact semantics support role-scoped, versioned Web navigation. Otherwise use an additive Web configuration store/table after DB review proves the gap.

Minimum persisted fields:
- role identity;
- slot/order;
- capability/route stable ID;
- label/icon override where allowed;
- primary-action flag;
- configuration version;
- enabled flag;
- created/updated actor + timestamp.

Do not persist secrets or derive permission from this table.

## 6. Realtime behavior

Navigation/capability changes materially affect what a user may do, so the Web app should support near-realtime invalidation where technically reliable.

Preferred:
- backend publishes a post-commit **capability/navigation invalidation** through ASP.NET Core SignalR;
- clients receiving a matching user/role/company event immediately re-fetch authoritative navigation/capabilities;
- stale shortcuts disappear without logout/login.

Fallback:
- SWR revalidation on route/focus and at a bounded interval;
- forced revalidation before protected actions;
- if realtime is disconnected, show no false “live” guarantee.

Because WinForms may write directly to the same database without emitting Web events, SignalR is an optimization for Web-owned changes, not the sole freshness mechanism. SWR/poll/revalidation remains required during coexistence.

## 7. Frontend implementation direction

Phase 2 frontend stack:
- React + TypeScript;
- Next.js stable release;
- **shadcn/ui** for shell, drawer/sheet, dialogs, menus, inputs, forms and admin configuration surface;
- Tailwind CSS through shadcn conventions;
- TanStack Query for server state/revalidation;
- TanStack Table + virtualization for the shared ERP Grid platform.

Mobile components:
- `MobileBottomNav`
- `MobileNavDrawer`
- `RoleQuickNavProvider`
- `PermissionAwareRoute`
- `QuickActionButton`

Avoid cloning navigation per role; render a normalized server-provided descriptor.

## 8. Acceptance tests

At minimum:
- Role A sees only its configured + authorized quick actions.
- Role B sees a different bottom-nav set.
- Non-admin cannot open/save role-navigation configuration by UI, direct route or API.
- Admin can reorder/change role shortcuts and publish.
- A shortcut targeting a revoked permission disappears after authoritative revalidation.
- A stale shortcut cannot bypass route/API authorization.
- SignalR invalidation refreshes navigation after an admin publish.
- With SignalR disconnected, SWR/manual/focus revalidation still removes revoked access.
- Drawer contains the full authorized menu while bottom nav remains a small high-frequency subset.
- Mobile layout remains usable at ~390 px without horizontal page scrolling.
