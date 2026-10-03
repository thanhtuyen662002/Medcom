# Phase 2 Auth and Capability Contract

Status: implementation contract; exact legacy bindings remain UNKNOWN.

ASP.NET Core .NET 10 owns Web session and authorization. Tool.dll stays behind the isolated adapter/bridge. Browser code never calls Tool.dll or SQL Server directly.

Default idle timeout is 1440 minutes and is admin-configurable. Only accepted user interaction advances idle activity; SignalR, polling, SWR and background refresh do not. Logout/expiry invalidates the server session.

Authorization is server-authoritative and independently enforced for navigation, route, query/data scope, mutation plus business state, and report/export/file. UI visibility and role quick-nav configuration never grant permission. Company/branch/storehouse scope comes from server authority and client input cannot widen it. Permission changes must take effect after authoritative revalidation without requiring relogin; SignalR is only an invalidation hint with SWR/revalidation fallback.

FE sends stable screen/action IDs and typed values, never arbitrary table/view/procedure names. Query adapters allow-list filters/sorts and inject scope. Commands revalidate capability, scope and business state at the mutation boundary. Export/file endpoints reauthorize independently.

Required tests: direct-route/API bypass; crafted scope widening; role revocation during session; non-admin config mutation; unauthorized quick-nav omission; background traffic not extending idle expiry; logout/expiry invalidation; export/file reauthorization; denial without out-of-scope existence/count leakage.

UNKNOWN until direct verification: Tool.dll login/logout signatures and result semantics; legacy permission/admin precedence; exact company/branch/storehouse scope sources; legacy concurrent/absolute-session rules. These block only dependent bindings and never weaken the server contract.

Multi-tab logout, revocation, company switch and browser back/forward-cache restore must fence the previous session/permission generation. Revalidate before revealing restored protected data or dispatching a command; passive traffic cannot revive idle activity. Client caches and recoverable drafts are scoped by authenticated principal/company/variant, never transferred silently to a new login. A dirty draft is local input, not authority or permission to replay a previously submitted command. A3/F3/Q1 cover offline return, stale tabs, policy change and expired Continue Session with persistent safe recovery.

## Direct adapter checkpoint — 2026-10-02

Normal stored-password composition, canonical SY_User/SY_UserGroup fields, enabled pilot menu IDs and the group/user/delegated permission union are directly inspected and tested; see `docs/erp/OWNER_SOURCE_RECOVERY_20261002.md`. The Web adapter uses explicit grants, enabled users/groups/menus and conservative explicit branch scopes, with no legacy missing/error/admin-name fallback. Credential/group changes revoke sessions; permission versions advance on authoritative revalidation. A cached bounded dependency monitor probes schema and a public synthetic pure-DLL vector; it never creates a database account or Web identity. Full company/branch/admin equivalence and enabled mutation/effect bindings remain UNKNOWN.
