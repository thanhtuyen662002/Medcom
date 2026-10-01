# Phase 2 Tool.dll Adapter / Compatibility Bridge Contract

Status: reviewed planning boundary; runtime evidence pending; implementation is not authorized in this run.

## Invariants
- Browser and frontend never load, call, or receive Tool.dll credentials/objects.
- ASP.NET Core .NET 10 depends only on typed interfaces in the application boundary.
- Tool.dll is referenced only inside a dedicated compatibility worker; the .NET 10 application uses a typed private contract.
- A Windows worker compatible with the verified .NET Framework target is the conservative default. Alternative hosting requires T1 evidence for both load compatibility and authenticated-session isolation; loading successfully is not sufficient.
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
1. host compatibility, process architecture and dependencies for the statically verified .NETFramework v4.6.2 target; PE I386 with ILOnly does not prove x86-only;
2. exact login/logout/session APIs and result semantics;
3. thread-safety/reentrancy and process-global/static state;
4. credential handling and disposal;
5. permission/capability APIs if any;
6. timeout/error behavior and side effects.

Static metadata establishes only the facts recorded below. Unproven runtime behavior stays UNKNOWN/BLOCKED.

## Acceptance
- adapter can be contract-tested without Tool.dll;
- integration tests cover valid/invalid login, logout invalidation, expiry, bridge unavailable/timeout and concurrent calls;
- no Tool.dll type/reference exists in Web API/Application/Contracts/frontend;
- direct route/API authorization remains server-authoritative even if legacy capability resolution is cached;
- deployment can disable/rollback Web compatibility components without modifying committed business data or SQL Server runtime options.

## Static binary evidence now available

The owner supplied Tools.dll; sanitized metadata is recorded in docs/erp/TOOL_DLL_METADATA_EVIDENCE.md. The binary is Tools version 7.9.9767.36959, targets .NETFramework,Version=v4.6.2, has an I386 ILOnly PE shape, and references .NET Framework desktop, Janus and ActiveReports libraries. Public metadata confirms typed shapes for VerifyUserPass, GetPermission, GetPermissionWithMenuPara, CheckAdminUserGroup, user and branch context properties, and approval permission checks.

This evidence narrows the adapter design but does not close the runtime gate. No public Login, Logout, Logon or Logoff method name was found, and VerifyUserPass must not be relabeled as a complete login or session operation. PermissionType is a value type with capability-shaped fields, not proof of authorization precedence or enforcement. Direct .NET 10 loading remains unverified; a private .NET Framework bridge remains an allowed and likely compatibility path until an isolated load and behavior test succeeds.

## Authenticated-session process isolation

Static Connector.UserLogin, Connector.UserGroup and Connector.UserFullName are
mutable user identity properties. They establish a shared-state hazard, not the
complete state model. Until [T1/#19](https://github.com/thanhtuyen662002/Medcom/issues/19)
proves a safe alternative, dedicate one worker process context to one authenticated
ERP session and serialize calls inside it. Same-company users require separate
contexts. Bind the context to the server-resolved tenant, company, data source,
ERP principal and authorization/session generation; reject missing or mismatched
bindings before dispatch. Do not reassign a live context to another session.

Restoring three properties, AsyncLocal, per-method locking or a successful load
is not evidence of safe switching. Logout, expiry, revocation, context mismatch,
timeout or unrecoverable failure invalidates dispatch and retires the worker.
Fence late results by the original generation. Reauthentication creates a new
context; it does not resurrect authority or automatically replay pending work.

The durable command ledger, correlation and operation status live outside the
worker. Terminating it does not prove SQL rollback. If a call may have committed,
return OutcomeUnknown and reconcile authoritative business state before any
retry. A new worker cannot infer that the original operation failed.

T1 must record a controlled verification protocol for initialization, dependencies,
concurrent sessions, same-company distinct users, logout/revoke, late results,
resource limits, backpressure and retirement. B5/#24 and Q4/#41 own the
loss-after-possible-commit and reconciliation acceptance. These are future
verification requirements, not runtime results from the supplied binary.
