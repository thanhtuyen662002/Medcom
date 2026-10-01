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

## Maintenance-guide reconciliation and compiler acceptance

The guide supplement `../erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md` and its 293-pair index are asserted historical grammar, not a directly verified Medcom parser. A7/R3 must establish source/build identity and consumer-specific addressing before activation.

- Config row identity includes source/build, tenant/company scope, exact FID/variant/PFID, KeyID, SubID and SubValue plus persisted row ID/version. Never collapse LYT order and LYS property-key meanings of SubValue. Prefix matching cannot resolve a variant.
- The guide reports non-unique configuration tuples and first-row lookups. Detect collisions before compilation; quarantine ambiguous executable rows and retain the prior good version. Do not silently select an arbitrary row or add a unique index to the legacy database without a separately reviewed cleanup/migration.
- LYT parsing preserves empty positions, sparse legacy arrays, encoding rules and unknown trailing fields. Test the reported positions 0–20, caption/default delimiter escaping and malformed input. A canonical Web projection may omit unsupported fields with an explicit disposition; legacy write-back must preserve them and is disabled until round-trip evidence is available.
- Resolve each property default/empty value by its actual getter/setter and class inheritance. TXT/BOL defaults cannot be generalized across controls; ControlType 22 does not establish its executable class. ControlType 30 never permits arbitrary browser HTML/script execution.
- Map hooks per consumer and event order; form EBS/ESS/ESS2 and table DBS/S10 are not aliases. Deferred hooks, triggers and joined/read-only details need separate transaction/completion contracts. No generic CRUD is enabled by metadata presence alone.
- Config publication does not flush every WinForms client. Q3 verifies legacy Forever1Day cache invalidation and defined client refresh/restart before claiming convergence. Clear(), Clear(True), Web publication and SignalR are distinct operations.

Required acceptance includes duplicate tuple quarantine, wrong variant denial, missing/extra/empty LYT fields, malformed encoded values, LYS full identity, stale concurrent publication, unsupported executable key refusal, user override permission denial and old-cache/new-schema coexistence. Planned cases are enumerated in the two Phase 2 attack reviews; they are not executed results.

A previous-good config is eligible for rollback only if its source/compiler/action contracts and current build/schema still admit it. Validate compatibility and the expected current pointer before rollback; an incompatible historical version remains quarantined and cannot re-enable retired/unauthorized commands. R5/A7 exercise current-build/old-schema and old-config/current-schema cases as well as concurrent pointer changes.
