# Phase 2 Screen Definition and Configuration Contract

Status: implementation contract. Legacy precedence/executable grammar remain evidence-bound.

WebCore stores normalized Web presentation state, not a second copy of ERP business authorization. Existing SY_* configuration and DAT artifacts are source inputs where verified; adapters/compiler translate supported facts into stable Screen Definition IDs.

A ScreenDefinition points to one published immutable ScreenDefinitionVersion. Versions cover form/tab/label/order, grid column visibility/order/width/format, filters and saved-view descriptors, lookup/dropdown contracts, required/read-only/default presentation rules, and desktop/mobile presentation. Executable SQL/formula/hook metadata is never sent to the browser; server compatibility compiler resolves only allow-listed typed contracts.

Sync lifecycle: detect source change -> parse -> validate -> hash/compare -> classify presentation versus executable -> validate referenced typed contracts -> create immutable candidate -> publish current pointer transactionally -> audit -> post-commit invalidation. Parse/validation failure leaves the previous published version authoritative.

Overrides may be system/company/role/user where justified. Target presentation precedence is system then company then role then user, but exact legacy precedence remains UNKNOWN until verified. Overrides cannot grant capability, widen data scope, weaken required business validation or select arbitrary SQL/command identifiers.

Admin publication and rollback require server authorization, optimistic version check and audit. Rollback changes the current pointer to a previously valid immutable version; it does not destructively rewrite history or reverse business data.

ConfigSyncCheckpoint records source identity, source hash/version, last successful publication and bounded error state. SignalR announces invalidation only after publication commit; clients re-fetch effective definition through SWR/revalidation and continue safely on the last valid version if realtime is unavailable.

Acceptance: malformed source cannot replace current version; stale admin publish conflicts; rollback restores a known valid version; user override cannot grant authorization; executable metadata is absent from browser payload; legacy writer/source change is detected without requiring SignalR; config history is immutable and correlated to actor/source.

UNKNOWN: exact SY_* precedence and executable semantics, DAT grammar beyond verified fields, per-screen source binding, and whether every proposed WebCore physical table is necessary after DB reuse review.
