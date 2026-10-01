# Phase 2 Command and Transaction Contract

Status: implementation contract; exact legacy bindings remain UNKNOWN.

ASP.NET Core .NET 10 exposes typed query and command handlers. Clients never choose arbitrary SQL objects or Tool.dll methods. Every command has a stable action ID, typed DTO, authorization and scope checks, business-state guard, and evidence-bound adapter/DB binding. Legacy workflows with stored procedures, triggers, locks or hooks are not replaced by generic CRUD.

Transaction ownership is command-specific. Preserve verified procedure locking, trigger effects and failure semantics; do not add outer transactions or change database isolation options merely to simplify Web code.

Commands with harmful duplicate effects require stable idempotency identity and request fingerprint. A lost response after dispatch is OutcomeUnknown, never permission for blind retry. Reconcile using the idempotency record plus authoritative business state before any replay. Same key with different request is rejected.

Use an authoritative version token when one is verified. Otherwise preserve existing lock/procedure semantics and keep the version gap UNKNOWN rather than inventing a token. Permission, scope and business state are revalidated at mutation time.

Correlation ID spans API, handler, adapter, SQL, audit and post-commit work. SignalR, cache invalidation and jobs occur only after authoritative commit. Return stable application result codes; sanitized diagnostics belong in bounded trace/telemetry.

Acceptance: direct SQL/procedure selection is impossible; duplicate replay cannot duplicate effects; ambiguous outcomes reconcile; stale writes cannot silently overwrite when a version contract exists; rollback emits no post-commit event; audit and trace correlate without secrets.

UNKNOWN until direct DB/C# evidence: transaction owner by procedure, lock resources/timeouts, hook ordering, version tokens and the exact retry-safe command set.
