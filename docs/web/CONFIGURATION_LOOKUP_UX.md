# Configuration, lookup and executable-metadata UX contract

Status: implementable Web UX contract. This document binds VERIFIED DB configuration objects and CORROBORATED packaged layout/filter evidence while keeping runtime precedence and C#-only execution semantics explicit UNKNOWNs.

## Evidence bindings

The current DB archaeology verifies these configuration anchors: `DB-TABLE-dbo.SY_Menu`, `SY_FrmCfg`, `SY_FrmCtrTbl`, `SY_FrmDrdwTbl`, `SY_FrmExpTbl`, `SY_FrmFltTbl`, `SY_FrmGrdActTbl`, `SY_FrmLstTbl`, `SY_FrmMstActTbl`, `SY_FrmOptBtnTbl`, `SY_FrmParTbl`, `SY_UserBranch` and `SY_UserStorehouse`.

ERP Analysis independently publishes `ERP-CFG-*` DAT/layout evidence and filter families. Supplemental C# review describes executable metadata and LYT/LYS behavior, but C#-only semantics remain INFERRED until direct source verification.

## WEB-CONFIG-PRESENTATION

Presentation configuration includes labels, tab/control order, grid-column visibility/order/width/format, wrapping, frozen identity columns, filter presets and saved views.

The browser consumes a normalized immutable configuration version. A customization panel must separate:
- **My view** — non-executable user presentation preferences;
- **Shared view** — privileged shared presentation configuration;
- **Business configuration** — executable/validation/lookup/action behavior, never edited through the ordinary personalization UI.

The UI must not imply that a hidden field/action is unauthorized. Server authorization is authoritative and may remove or disable capabilities independently of presentation configuration.

### Conflict behavior

When a saved view references removed/renamed elements, restore all still-valid settings, show a non-blocking recovery summary, and offer reset/review. Never blank the surface or silently remap an unknown stable ID.

Concurrent configuration edits use explicit configuration versions. A stale editor receives compare/reload/reapply rather than last-write-wins.

Freshness: SWR on route open/focus, target <=60 s for presentation configuration; immediate targeted revalidation after a successful configuration save. Show a "configuration changed" affordance when a newer version would materially alter the active surface.

## WEB-LOOKUP-CONTRACT

Binds conceptually to `DB-TABLE-dbo.SY_FrmDrdwTbl` and `WEB-FILTER-CONTRACT`.

A lookup descriptor sent to the browser contains stable lookup/field IDs, display schema and allowed interaction semantics. It never grants raw source/table/filter/query authority.

Interaction contract:
- type-ahead is debounced/cancellable;
- stale responses cannot replace newer search results;
- keyboard navigation is first-class;
- selected value and display text remain distinct;
- linked-field propagation is shown as a derived change before commit when it changes editable business fields;
- deleted/inaccessible historical references remain visibly unresolved rather than being silently cleared;
- multiselect, if enabled by the resolved contract, exposes count and exact selected items.

Freshness: authoritative on open/search; cached reference results may use SWR <=60 s only when the lookup contract permits it. A critical commit revalidates selected references server-side.

## WEB-EXECUTABLE-CONFIG

Binds to the VERIFIED existence of action/parameter configuration tables and the supplemental C# evidence for save/delete hooks, formulas, joins and LYS action properties.

Executable metadata is not a normal Web customization surface. The browser receives a safe declarative capability descriptor or stable command ID; it never receives executable SQL as authority.

If administration of executable configuration is retained, it is a separately authorized expert workflow with:
1. draft version;
2. structural validation;
3. dependency/impact preview;
4. test/dry-run where technically possible;
5. privileged publish;
6. immutable actor/time/version audit;
7. rollback to a known version.

Unknown/unresolved command, formula, join, hook or parameter semantics fail closed. Presentation personalization cannot modify executable metadata.

Freshness: MANUAL/SWR <=60 s for admin listings; runtime command resolution is server-authoritative at execution and cannot rely on a stale browser descriptor.

## WEB-CONFIG-SCOPE

The product must display the effective scope of an edited setting: system/shared/company/role/user only after that scope is proven and supported by the backend contract.

The proposed system → company → role → user precedence remains architecture policy, not legacy fact. Until direct C# verification resolves legacy precedence, UX must not expose a misleading precedence editor. It may expose only scopes whose persistence and conflict rules are proven.

`SY_UserBranch` and `SY_UserStorehouse` prove scope metadata exists; they do not prove authorization semantics. Branch/storehouse selection is never treated as permission by itself.

## Acceptance scenarios

**UX-TEST-CONFIG-001 — schema evolution.** Restore a saved view after a column is removed and another added. Valid preferences survive; unknown stable IDs are reported/recoverable; no silent remap occurs.

**UX-TEST-CONFIG-002 — concurrent editors.** Two admins edit the same shared configuration version. The second publish cannot silently overwrite the first; compare/reload/reapply is offered.

**UX-TEST-CONFIG-003 — presentation cannot escalate.** A user who can edit a personal layout cannot reveal unauthorized data or enable an unauthorized server action by changing visibility, URL state or request payload.

**UX-TEST-LOOKUP-002 — historical invalid reference.** Edit an unrelated field on a record whose legacy reference is deleted/inaccessible. The unresolved reference remains explicit and is not silently cleared/replaced.

**UX-TEST-LOOKUP-003 — linked propagation.** A lookup that derives additional fields shows the resulting changes and server validation outcome; a superseded lookup response cannot mutate the current form.

**UX-TEST-EXECMETA-001 — tampered executable descriptor.** Alter a command/source/filter/parameter identifier in the browser. Server resolution rejects unknown or unauthorized metadata and records a safe diagnostic without executing arbitrary SQL.

**UX-TEST-EXECMETA-002 — rollback.** Publish a bad executable configuration in a controlled test environment. The previous known version can be restored without requiring manual database edits, and runtime instances resolve a single explicit version.

**UX-TEST-SCOPE-001 — scope ambiguity.** If effective company/role/user precedence is not proven, the UI does not invent or imply it. Unsupported scope editing is unavailable while effective resolved configuration remains inspectable.

## Bounded gaps

- `UX-GAP-CONFIG-PRECEDENCE-001` — exact package/DB/company/role/user resolution and write persistence.
- `UX-GAP-CONFIG-DESIGNER-001` — which legacy users can edit layout/business configuration and at what scope.
- `UX-GAP-LOOKUP-RUNTIME-001` — exact lookup source/filter/linked-field execution semantics and authorization.
- `UX-GAP-EXECMETA-LIFECYCLE-001` — validation/lock/before-save/mutation/after-save/delete ordering and transaction ownership.
- `UX-GAP-EXECMETA-ADMIN-001` — whether executable metadata is edited in production, by whom, and required approval/rollback behavior.
- `UX-GAP-SCOPE-001` — exact company/branch/storehouse/role/user authorization versus presentation-scope semantics.

These gaps are reserved as UNKNOWN until direct C#/DB evidence resolves them; they do not block implementation of the safe reusable UX boundaries above.
