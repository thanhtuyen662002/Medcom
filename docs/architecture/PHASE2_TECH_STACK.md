# Phase 2 Technology Stack and Runtime Architecture

Status: **ADOPTED implementation direction**, subject only to direct Tool.dll compatibility verification.

## 1. Backend

Required language/runtime:
- **C#**
- **ASP.NET Core on .NET 10 LTS** for the Web API/application backend.

Core backend responsibilities:
- authentication/session;
- Tool.dll compatibility boundary;
- authorization/capabilities;
- menu/navigation resolution;
- role quick-nav configuration;
- typed query/command adapters;
- SQL Server access;
- transaction/idempotency/concurrency;
- audit/correlation;
- reporting/export/jobs;
- SignalR realtime invalidation.

Recommended solution boundaries:
- `Medcom.Web.Api`
- `Medcom.Application`
- `Medcom.Domain`
- `Medcom.Infrastructure.SqlServer`
- `Medcom.Legacy.ToolAdapter`
- `Medcom.Contracts`
- test projects by layer plus end-to-end authorization tests.

## 2. Tool.dll compatibility

The browser never loads or calls Tool.dll.

Expose an internal abstraction such as:
- `ILegacyAuthenticationAdapter`
- `ILegacyPermissionAdapter` when direct legacy permission behavior must be reused.

Compatibility decision after direct inspection:
The dedicated compatibility-worker/session-isolation rules in `PHASE2_TOOL_DLL_BRIDGE_CONTRACT.md` govern this decision. A successful load alone cannot permit in-process multi-user reuse; T1 must also prove authenticated-session isolation, side effects and lifecycle safety.
1. An alternative host may be proposed only after T1 proves load compatibility **and** authenticated-session isolation; preserve the typed private boundary and dedicated worker context until that evidence exists.
2. If Tool.dll requires .NET Framework/Windows-only APIs that cannot safely load in .NET 10, run an isolated Windows compatibility bridge/service and call it from ASP.NET Core through an internal authenticated IPC/HTTP contract.
3. Never rewrite or guess Tool.dll method semantics merely to remove the bridge.

This keeps the main backend modern while preserving exact legacy behavior where required.

## 3. Web session and security

Default Web authentication shape:
- server-owned session;
- Secure + HttpOnly cookie;
- SameSite policy appropriate to deployment;
- anti-CSRF protection for cookie-authenticated mutations;
- session invalidation on logout;
- authoritative permission revalidation before protected operations.

Do not store legacy database passwords or reusable Tool.dll credentials in browser storage.

Authorization layers:
1. menu/navigation;
2. route;
3. query/data scope;
4. mutation/action;
5. report/export/file.

UI visibility is not authorization.

## 4. Frontend

Implementation direction:
- **Next.js + React + TypeScript**;
- **shadcn/ui** as the component foundation;
- Tailwind CSS;
- TanStack Query for API/server state;
- TanStack Table + TanStack Virtual for shared dense ERP grids;
- schema validation for API/form boundaries;
- generated/shared TypeScript contracts where practical from backend OpenAPI.

UX architecture remains:
- one Grid platform;
- per-screen configuration;
- separate desktop and mobile presentation schemas;
- bottom quick nav + drawer on mobile;
- role-configurable quick actions administered only by authorized admins.

## 5. Realtime

Use **ASP.NET Core SignalR** when freshness materially improves correctness or collaboration.

Event model:
- publish only after authoritative transaction commit;
- emit invalidation/version-oriented events rather than trusting browser state;
- scope events by user/role/company/branch/storehouse as required;
- client re-fetches authoritative data after the event;
- reconnect performs gap recovery/revalidation.

Initial realtime candidates:
- permission/capability/navigation changes;
- shared workflow/status queues;
- Web-owned document status changes;
- operational warehouse/inbound queues when evidence supports it.

Important coexistence limitation:
WinForms/legacy writers may update SQL Server without traversing the Web backend, so they may not emit SignalR events. Therefore realtime is **not** the only freshness mechanism during migration. Retain SWR/poll/manual refresh according to the UX freshness matrix.

Do not enable database polling at aggressive frequency merely to simulate realtime.

## 6. Data access

The browser never connects to SQL Server.

Backend uses typed query/command services and validates:
- authenticated identity;
- company/branch/storehouse scope;
- allowed filters/sorts;
- record business state;
- command parameters;
- concurrency/version;
- idempotency key where needed.

Legacy stored procedures/views may be reused behind compatibility facades after exact evidence review. No generic “table CRUD API”.

## 7. Admin role-navigation configuration

Provide backend APIs such as conceptual contracts:
- GET effective mobile navigation for current user;
- GET role quick-nav configuration (admin);
- PUT/PUBLISH role quick-nav configuration (admin);
- GET configuration history/version (admin);
- POST rollback configuration version (admin, if implemented in pilot).

Names/URLs are implementation choices, but authorization behavior is mandatory.

Changing quick-nav presentation never changes underlying role permissions.

## 8. Deployment implication

Because Tool.dll may be Windows/.NET-Framework dependent, backend deployment must support Windows for the compatibility component. The frontend remains independently deployable as a Web application.

Do not hard-lock the entire application to the legacy runtime if an isolated adapter/bridge can contain that dependency safely.

## 9. Phase 2 acceptance additions

- backend is C#/.NET;
- Tool.dll is isolated behind a testable adapter/bridge;
- frontend uses shadcn/ui foundation;
- role quick nav is admin-configurable and server-authorized;
- SignalR path has reconnect/revalidation fallback;
- permission changes propagate without relying solely on user relogin;
- WinForms coexistence freshness remains safe without assuming all writes emit events.


## 10. Shared platform services, audit and session policy

Implementation planning must read `docs/architecture/WEB_PLATFORM_SHARED_SERVICES.md`.

Required outcomes:
- reusable Web platform schema/services suitable for Medcom and future projects;
- separate durable business/security audit from high-volume diagnostic telemetry;
- safe correlation IDs across FE → API → handler → DB/SP;
- retention/purge/indexing strategy for diagnostic records;
- default idle timeout 1440 minutes, admin-configurable in minutes;
- background refresh/SignalR must not keep an idle user session alive;
- dynamic Screen Definition/DAT sync must be versioned, auditable and rollback-safe.

The suggested `WebCore.*` table set is a reference architecture, not a mandatory physical naming scheme. A better design is allowed when it preserves all invariants and is documented/tested.

## 11. Single-port multi-customer backend hosting

Owner priority: the backend must be deployable as **one shared Web/API service on one listening port for multiple customers/companies**, rather than requiring a separate process/port per customer.

Preferred implementation:
- ASP.NET Core / .NET 10 LTS;
- one Kestrel/ASP.NET Core application instance (or a horizontally scaled pool behind one reverse-proxy endpoint);
- one public/internal port per deployed service environment;
- customer/company/tenant resolution happens inside the application from authoritative authenticated server-side context;
- each customer may map to a different SQL Server, database, config profile, Tool.dll/legacy adapter profile, feature set or storage endpoint.

Conceptual flow: Clients A/B/C -> one HTTPS endpoint/port -> ASP.NET Core -> TenantResolver + Auth/Session -> CompanyDataSourceResolver -> DB A | DB B | DB C.

The browser may carry a requested company/context selector only as presentation input. It cannot authoritatively choose an arbitrary tenant/database/connection string. The server validates the authenticated user's allowed company memberships and resolves the effective data source from server configuration.

Required reusable boundaries should cover tenant context, tenant resolution, company data-source resolution, connection creation, legacy-adapter resolution and company feature resolution. Exact interface names are implementation choices.

The data-source model must support one DB shared by several companies, one DB per company, and multiple DBs for one company where the existing ERP requires it. Local or remote SQL Server endpoints remain server-side configuration.

Isolation requirements:
- every request resolves an immutable authoritative tenant/company context before business handlers execute;
- query/command/cache/audit/realtime keys include required tenant/company scope;
- client-supplied CompanyId/DatabaseName/ServerName never widens authority;
- background jobs persist and restore tenant scope explicitly;
- connection pooling cannot leak prior tenant context.

Classic ASPX can technically serve many customers behind one IIS site/port, but ASP.NET Core is preferred because middleware/DI, SignalR, async APIs, health checks, observability and future scaling are cleaner. Use classic ASPX only when a verified legacy dependency creates a compelling compatibility requirement that cannot be isolated behind the legacy bridge.

Preferred external surface is HTTPS 443 through IIS/Nginx/reverse proxy to one backend service URL. Hostname/path routing may improve deployment organization but is not an authorization boundary.

Acceptance:
- multiple test customers use the same service/port concurrently;
- each resolves the correct DB/config/permissions;
- onboarding another configured customer does not require a new backend port or code fork;
- tenant-isolation tests are green.
