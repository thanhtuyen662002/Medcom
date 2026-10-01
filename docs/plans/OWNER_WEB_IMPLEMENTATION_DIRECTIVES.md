# Owner Web Implementation Directives

Status: **mandatory planning input / implementation guardrails**.  
Owner direction consolidated 2026-09-30.

Agents may propose and adopt a technically better solution than the structures below **only when it is demonstrably simpler, faster, safer, more reusable, or easier to operate while preserving every mandatory invariant and acceptance criterion**. Any deviation must be documented with rationale and tests; do not silently drop requirements.

## 1. Product priority order

When trade-offs are required, optimize in this order:

1. **User experience and task completion**
2. **Correctness / authorization / data integrity**
3. **Perceived and actual speed**
4. **Operational supportability / traceability**
5. **Maintainability / reuse across Medcom and future projects**
6. implementation convenience

A technically elegant implementation that makes common ERP tasks slower, harder to understand, or harder to recover from is not acceptable.

## 2. Adopted stack

Backend:
- C# / ASP.NET Core / .NET 10 LTS.
- SQL Server remains authoritative.
- Tool.dll authentication/legacy behavior is isolated behind an adapter or compatibility bridge.
- Views and stored procedures should be reused behind typed server-side query/command adapters when evidence proves the existing contract is valuable.
- Browser never chooses arbitrary table/view/procedure/SQL names.

Frontend:
- Next.js + React + TypeScript.
- shadcn/ui + Tailwind for fast, consistent implementation.
- TanStack Query for server state.
- TanStack Table + virtualization for the shared ERP Grid platform.

Realtime:
- ASP.NET Core SignalR for Web-owned post-commit invalidation where it materially improves freshness/collaboration.
- Always retain authoritative revalidation/SWR/poll/manual refresh where legacy WinForms writers can bypass the Web backend.

## 3. Dynamic screen strategy

Web must not hard-code one bespoke component for every ERP form.

Target flow:

```
ERP SQL metadata/config ─┐
                        ├─> Config Sync / Metadata Compiler
ERP local DAT layouts ──┤            │
                        │            ▼
Web/Admin overrides ────┘     Versioned Screen Registry
                                     │
                           ASP.NET API + SignalR
                                     │
                                     ▼
                            Dynamic React renderer
```

Normalized Screen Definition should be able to represent:
- screen identity/version;
- title/labels/tabs;
- desktop columns;
- mobile presentation;
- filters/search/sort/group/summary;
- lookups/dropdowns;
- actions and capability IDs;
- required/read-only/hidden rules;
- data/query contract identifiers;
- freshness policy;
- configuration provenance/effective scope.

Presentation changes such as label, column visibility/order/width, mobile fields, quick actions and layout should normally be publishable without rebuilding the FE.

Executable/business changes such as stored-procedure target, parameters, save/delete hooks, workflow or permission semantics must be validated server-side before a new definition becomes effective.

FE never receives arbitrary executable SQL.

## 4. Legacy DAT synchronization

ERP layout files are local artifacts, so Web must not assume a random workstation's layout is the global source of truth.

Planning must define:
- which machine/source owns system defaults;
- system/company/role/user scope;
- file watcher plus periodic hash verification or an equivalent robust mechanism;
- normalized parse/validation;
- versioned publish;
- audit/history;
- safe rollback.

Recommended mechanism:
- .NET config-sync worker;
- FileSystemWatcher for prompt detection;
- periodic hash reconciliation so missed filesystem events do not create drift.

A user's local personalization must never silently overwrite system or role defaults.

## 5. Presentation vs executable configuration

Treat these as separate risk classes.

### Presentation configuration
Examples:
- form/tab/label;
- grid column visibility/order/width;
- desktop/mobile presentation;
- bottom quick nav;
- saved views;
- harmless filter defaults.

Can usually auto-validate + publish + notify clients.

### Executable/business configuration
Examples:
- SP/action target;
- SP parameter map;
- configurable SQL;
- save/delete hooks;
- workflow transitions;
- permission semantics;
- business validation.

Must pass allow-list/schema/signature/authorization validation before activation. Invalid executable configuration is blocked, surfaced to admin/support and leaves the previous good version active.

## 6. CRUD, View and stored-procedure backend model

Use three server boundaries:

1. **CRUD/Form adapter** for forms proven safe for generic persisted-field operations.
2. **Query adapter** for approved Views/SP/query projections.
3. **Command registry/handler** for extended buttons, workflow actions and SP-backed business commands.

FE sends stable screen/action IDs and typed values. FE does not send an arbitrary database object name to execute.

Classify migrated forms/actions such as:
- SAFE_GENERIC_CRUD;
- CRUD_WITH_HOOKS;
- COMMAND_ONLY;
- READ_ONLY;
- SPECIAL_WORKFLOW.

Generic CRUD is allowed only when evidence proves no required legacy hook/side effect is bypassed.

After command commit:
- authoritative reread/reconciliation;
- audit/trace;
- cache invalidation;
- SignalR invalidation if applicable.

## 7. Mobile navigation

Mobile uses:
- persistent bottom quick navigation;
- Menu item opens a full authorized drawer/sidebar;
- role-specific quick-action configuration;
- only authorized admin accounts may edit/publish role quick navigation;
- role quick-nav configuration never grants permission.

Admin may configure order/items/labels/icons/primary action within the already-authorized capability set.

## 8. Reusable Web platform tables/services

The project should establish a reusable Web platform schema that can be applied to Medcom and future ERP/Web projects rather than inventing equivalent tables repeatedly.

The exact table names/schema are an implementation decision, but planning must cover reusable capabilities for:
- application/global settings;
- session policy;
- role quick navigation;
- screen definitions + versions;
- screen/config scope overrides;
- config synchronization checkpoints/hash/version;
- config change audit/history;
- idempotency/replay protection;
- durable outbox/invalidation events when required;
- business/security audit trail;
- backend diagnostic/operation trace.

Prefer a dedicated namespace/schema such as `WebCore` or equivalent rather than adding unrelated Web concerns to legacy transactional tables.

Before creating any table, reconcile existing SY_* capabilities and document why additive Web storage is necessary.

## 9. Audit and diagnostics

Two needs must not be conflated:

### Business/security audit
Durable, queryable record of meaningful actions:
- actor/user/session;
- effective company/branch/storehouse scope;
- screen/action/capability;
- business object/document identity;
- operation;
- time;
- correlation ID;
- success/rejection/conflict;
- safe before/after summary where policy allows;
- source channel/client version.

Audit records should be append-oriented and access-controlled.

### Backend diagnostic trace
Used to investigate incorrect or unexpected BE behavior:
- correlation ID / trace ID;
- request/operation/action ID;
- route/handler;
- duration;
- DB command/procedure logical ID (not arbitrary secrets);
- DB duration;
- rows/result count when safe;
- error code/type;
- retry/idempotency outcome;
- exception diagnostic details sanitized for storage;
- deployment/build version.

Do not write passwords, tokens, raw connection strings, secrets or sensitive payloads into logs.

Database trace tables may be used for durable support workflows, but high-volume technical telemetry should be structured and retention-controlled rather than allowing an unbounded SQL log table to degrade production. OpenTelemetry/structured logs may complement the durable support table.

Every user-visible error requiring support should expose a safe correlation/reference ID.

## 10. UX feedback / toast notifications

Fast feedback is mandatory.

Default notification model:
- transient **toast** for successful save/create/update/delete/action and lightweight information;
- warning/error toast for operation-level problems;
- inline validation next to invalid fields;
- conflict/recovery state remains visible and must not disappear as a transient toast only;
- destructive actions require explicit confirmation where appropriate.

Preferred toast placement:
- **top-center** by default for important ERP operation feedback;
- top-right may be used when layout/device testing proves it less obstructive;
- mobile must respect safe-area/notch/browser chrome.

Suggested behavior:
- success: concise, auto-dismiss ~3 seconds;
- information: ~4 seconds;
- warning: longer (~6 seconds);
- critical/error requiring action: do not disappear before the user can understand/recover; pair with persistent inline/panel state when needed.

A mutation success toast is shown only after authoritative server confirmation, never merely after click/submission.

## 11. Session inactivity policy

Default idle logout policy:
- **1440 minutes (24 hours) of no real user interaction**.

Admin must be able to change the idle timeout in minutes from an authorized administration UI.

Security rules:
- only authorized admin can read/change/publish this policy;
- server owns enforcement;
- background polling, SWR refreshes, SignalR traffic and passive browser activity MUST NOT keep a genuinely idle user session alive;
- logout invalidates the server session/cookie;
- expired sessions redirect to login while preserving a safe return URL when appropriate;
- dirty local form data should receive a warning/recovery path before expiry when feasible and safe.

Implementation should track explicit user activity, throttle activity updates, and evaluate idle timeout server-side.

Recommended UX:
- configurable warning shortly before expiry (for example 5 minutes when the timeout is long enough);
- “Continue session” requires authoritative session refresh;
- admin policy changes should apply predictably to existing sessions on the next server validation.

Exact minimum/maximum policy bounds may be selected by architecture/security review; the owner requirement is that the default is 24h and admin can configure the number of idle minutes.

## 12. Performance and perceived speed

UX-first means the system must feel responsive even when DB operations are not instantaneous.

Required patterns:
- immediate visual acknowledgment for taps/clicks;
- non-blocking progress after ~300 ms where an operation is still running;
- preserve usable stale data during safe revalidation;
- skeletons only when structure is known;
- server-side grid filtering/sort/page;
- virtualization for large/wide grids;
- async background jobs for long exports/reports;
- cancel superseded search/lookup requests;
- no duplicate submits;
- optimistic UI only when rollback/conflict semantics are proven safe.

Every pilot screen must carry measurable latency targets and be tested on realistic dataset sizes and slower office/mobile networks.

## 13. Better alternatives are allowed

Agents are explicitly allowed to improve the proposed design when they can demonstrate a better approach.

Conditions:
- preserve UX priority, permissions, auditability, traceability, dynamic configuration and rollback;
- preserve or improve performance;
- preserve public-repo/source safety;
- document the alternative, trade-off and evidence;
- add acceptance tests;
- do not replace a known legacy business behavior with a guess.

“Different” is not automatically better; changes need an engineering rationale.

## 14. Planning gate

The Phase 2 plan must explicitly reference and disposition every section above.

Before coding, Red Team must attack at minimum:
- dynamic metadata drift;
- DAT sync missed events/wrong source machine;
- executable metadata injection;
- SP signature change;
- stale FE Screen Definition;
- admin misconfiguration;
- role/permission revocation;
- idle-session bypass via background refresh;
- log leakage;
- unbounded log growth;
- toast claiming success too early;
- lost/reordered SignalR events;
- WinForms changes without Web event;
- config rollback;
- supportability using correlation IDs.

Any unresolved safety-critical item becomes a bounded blocker; ordinary implementation improvements can proceed independently.

## 15. Single-port multi-customer backend

Backend implementation must prioritize a **shared single-port multi-customer service**.

Mandatory outcome:
- one ASP.NET Core backend service/endpoint can serve many customers/companies concurrently;
- onboarding another customer does not require a dedicated backend port or code fork;
- customer/company context is resolved server-side from authenticated authority;
- each customer can map to its own SQL Server/database/configuration/legacy-adapter profile;
- one customer may map to multiple databases when required;
- shared-database and database-per-customer models are both supportable by the abstraction;
- cache, SignalR, background jobs, audit, logs and DB connections are correctly tenant-scoped.

Preferred stack remains ASP.NET Core/.NET 10. Classic ASPX is permitted only when a verified legacy compatibility dependency provides a stronger reason, not as the default architecture.

A browser-provided CompanyId/database/server identifier is untrusted input. The server must validate membership/scope and resolve the effective data source internally.

Required tests:
- cross-customer access attempts fail closed;
- same port serves multiple customers simultaneously;
- tenant-scoped connection/cache/realtime/job/audit behavior is isolated;
- a newly configured customer can be activated without changing the listening port.