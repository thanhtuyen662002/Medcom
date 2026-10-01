# Phase 2 Command and Transaction Contract

Status: implementation contract; exact legacy bindings remain UNKNOWN.

ASP.NET Core .NET 10 exposes typed query and command handlers. Clients never choose arbitrary SQL objects or Tool.dll methods. Every command has a stable action ID, typed DTO, authorization and scope checks, business-state guard, and evidence-bound adapter/DB binding. Legacy workflows with stored procedures, triggers, locks or hooks are not replaced by generic CRUD.

Transaction ownership is command-specific. Preserve verified procedure locking, trigger effects and failure semantics; do not add outer transactions or change database isolation options merely to simplify Web code.

Commands with harmful duplicate effects require stable idempotency identity and request fingerprint. A lost response after dispatch is OutcomeUnknown, never permission for blind retry. Reconcile using the idempotency record plus authoritative business state before any replay. Same key with different request is rejected.

Use an authoritative version token when one is verified. Otherwise preserve existing lock/procedure semantics and keep the version gap UNKNOWN rather than inventing a token. Permission, scope and business state are revalidated at mutation time.

Correlation ID spans API, handler, adapter, SQL, audit and post-commit work. SignalR, cache invalidation and jobs occur only after authoritative commit. Return stable application result codes; sanitized diagnostics belong in bounded trace/telemetry.

Acceptance: direct SQL/procedure selection is impossible; duplicate replay cannot duplicate effects; ambiguous outcomes reconcile; stale writes cannot silently overwrite when a version contract exists; rollback emits no post-commit event; audit and trace correlate without secrets.

UNKNOWN until direct DB/legacy-source evidence: transaction owner by procedure, lock resources/timeouts, hook ordering, version tokens and the exact retry-safe command set.

## Completion and supplementary hook evidence

`../erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md` reports multiple detail slots, joined/read-only datasets, form/table-specific hooks and delayed ESS2. These are secondary verification targets, not automatically executable Medcom bindings. Each command's matrix identifies every writable dataset/field, required before/after/deferred hook, trigger, transaction owner and authoritative outcome. Confirming the first SQL commit does not prove a required deferred business effect completed. Model intermediate states explicitly; a final success response/toast follows only the reviewed completion contract.

B3/B5 test: hook failure before commit; mandatory effect after first commit; business commit before ACK; ledger reservation before dispatch; ledger update failure across databases; worker death and late ACK; duplicate same-key/same-payload versus same-key/changed-payload; WinForms competing writer; decimal scale/rounding and read-only field tamper. Do not wrap unknown transactions or silently compensate committed financial/stock effects. Without a source-backed recovery identifier and safe retry disposition, OutcomeUnknown blocks replay.

The dedupe domain binds immutable tenant/company/data-source identity, stable principal, registered action/contract and idempotency key plus semantic request fingerprint. Session/permission generation fences dispatch and result delivery separately; reauthentication must not create a fresh harmful effect for the same logical operation. Replays and outcome reads revalidate current authority; dedupe never grants another principal or revoked role access to an old result.

OutcomeUnknown/InProgress operations cannot be purged into a reusable empty slot. Retention uses the command's verified reconciliation/replay window and safe tombstone/business-dedupe contract, not diagnostic-log TTL. Reject or reconcile expired keys instead of silently treating them as new. R4/B5 test business/ledger backups restored to different points; command dispatch remains disabled until authoritative operation reconciliation establishes a safe restore frontier. No exactly-once guarantee follows from an external ledger alone.
