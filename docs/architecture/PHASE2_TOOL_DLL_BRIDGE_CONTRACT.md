# Phase 2 Tool.dll Adapter / Compatibility Bridge Contract

Status: implementation-ready boundary; exact legacy APIs remain source-verification blockers.

## Invariants
- Browser and frontend never load, call, or receive Tool.dll credentials/objects.
- ASP.NET Core .NET 10 depends only on typed interfaces in the application boundary.
- Tool.dll is referenced only by `Medcom.Legacy.ToolAdapter` when direct loading is proven safe.
- If direct loading is incompatible, a Windows compatibility bridge owns Tool.dll and exposes a private authenticated contract to the .NET 10 backend.
- No guessed Tool.dll class, method, return-code, permission, logout, or session semantics may enter production code.

## Typed boundary
Minimum conceptual interfaces:
- `ILegacyAuthenticationAdapter.LoginAsync(LoginRequest)`
- `ILegacyAuthenticationAdapter.LogoutAsync(LegacySessionRef)`
- `ILegacyAuthenticationAdapter.ValidateAsync(LegacySessionRef)`
- `ILegacyPermissionAdapter.ResolveCapabilitiesAsync(UserScope)` only when direct legacy permission behavior must be reused.

DTOs must contain normalized values only. Tool.dll types must not escape the adapter/bridge boundary.

## Session ownership
The Web backend owns the browser session, Secure/HttpOnly cookie, 1440-minute default idle policy, CSRF protection, expiry and revocation. A legacy session/token/reference is server-side state only. Background polling, SWR and SignalR do not extend user inactivity.

## Bridge security and operations
When a bridge is required:
- private network/host boundary; never Internet/browser reachable;
- service authentication plus least privilege;
- strict request schema and size/time limits;
- correlation ID propagation without treating correlation as authorization;
- secrets supplied through deployment secret storage, never repo/config payload/browser;
- health/readiness separated from login success;
- bounded concurrency/backpressure; no unbounded request queue;
- sanitized diagnostics; no passwords, reusable credentials or sensitive Tool payloads in logs.

## Failure semantics
Classify adapter results as Success, Rejected, Expired, Forbidden, Unavailable, Timeout or Unknown. Transport timeout after a state-changing legacy call is not proof of failure. Logout/permission operations with ambiguous outcome require authoritative revalidation; do not blind-retry unsafe legacy operations.

## Verification gate before implementation binding
Direct source/runtime inspection must establish:
1. Tool.dll target runtime/architecture and load dependencies;
2. exact login/logout/session APIs and result semantics;
3. thread-safety/reentrancy and process-global/static state;
4. credential handling and disposal;
5. permission/capability APIs if any;
6. timeout/error behavior and side effects.

Until proven, each item is UNKNOWN/BLOCKED rather than inferred.

## Acceptance
- adapter can be contract-tested without Tool.dll;
- integration tests cover valid/invalid login, logout invalidation, expiry, bridge unavailable/timeout and concurrent calls;
- no Tool.dll type/reference exists in Web API/Application/Contracts/frontend;
- direct route/API authorization remains server-authoritative even if legacy capability resolution is cached;
- deployment can disable/rollback Web compatibility components without modifying committed business data or SQL Server runtime options.
