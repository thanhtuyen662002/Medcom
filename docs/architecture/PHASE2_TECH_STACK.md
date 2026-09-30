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
1. If Tool.dll is loadable/supported in the .NET 10 process without unsafe runtime coupling, reference it only inside the isolated adapter project.
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
