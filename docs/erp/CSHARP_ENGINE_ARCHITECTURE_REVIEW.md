# C# review summary — WinForms engine architecture

Status: supplemental C# review evidence supplied by the owner on 2026-09-30.

## Provenance and evidence handling

This document is a sanitized synthesis of an owner-supplied technical review that was produced after another agent inspected the WinForms C# / VB.NET solution. The raw source package itself is not part of the current authoritative Phase 1 Library baseline, so claims in this document are not automatically promoted to `VERIFIED`.

Evidence treatment:
- `CORROBORATED` when the C# review summary agrees with independent ERP package and/or SQL evidence already in this repository.
- `INFERRED` when the review summary is the only currently available source.
- `UNKNOWN` when exact runtime behavior, precedence, scope, or source implementation has not yet been re-opened directly.

Do not treat cookbook examples in the review summary as universal production invariants.

## 1. Solution architecture

The review summary describes two main solution areas:
- `Tools2022`: framework / engine classes for form lifecycle, layout generation, data access, reusable controls, and base forms.
- `ERP_2022`: business application modules and hardcoded business forms.

It distinguishes two form styles:
1. metadata-driven forms generated through generic base forms; and
2. hardcoded forms that still attach to the shared engine and load metadata.

This is consistent with the existing database configuration evidence around `SY_FrmLstTbl`, `SY_FrmCfg`, and `SY_FrmDrdwTbl`, so the existence of a metadata-driven form engine is `CORROBORATED`.

The claimed share of forms that can be implemented with metadata alone is not yet quantified from source and remains `UNKNOWN`.

## 2. Metadata contracts reported by the C# review

### 2.1 `SY_FrmLstTbl`

The review describes a form registry carrying form identity, form type, backing table, primary key, captions, and module. This aligns with the DB configuration catalog and is `CORROBORATED` as a first-class configuration surface.

Reported form types include list, editable list, master/detail edit, report, and edit-top variants. Exact runtime dispatch rules still require direct C# verification.

### 2.2 `SY_FrmCfg`

The review describes `SY_FrmCfg` as the central layout / behavior configuration surface.

Reported table/data keys include:
- `T0`: master source;
- `T1..T19`: detail sources;
- `TN`: table name;
- `PK`: primary key;
- `SO`: default sort;
- `DCP`: detail caption;
- `SUM`: summary columns;
- `FKA1/FKB1`: master/detail link fields;
- `SAV_BFR`: before-save hook;
- `SAV`: after-save hook;
- `DEL`: after-delete hook;
- `FTX`: filter expression;
- `IJ1`: join expression;
- `SE1`: extra select fields;
- `FML`: formula configuration.

The hook/filter/join keys imply executable data behavior inside metadata. Until direct source re-verification, treat exact parsing, escaping, precedence, and transaction boundaries as `UNKNOWN`.

### 2.3 `LYT1` layout grammar

The review reports a semicolon-delimited, 21-position layout grammar used for controls. Important reported positions include:
- control type;
- width / height;
- row-break flag;
- read-only / hidden flags;
- label and label width;
- format string;
- default value;
- required flag;
- Web width hint.

The summary explicitly identifies `ControlType = 22` as a dynamic UserControl slot and a final Web-oriented width field.

Existing DAT/config evidence already proves highly configurable layouts, so the existence of a compact layout grammar is `CORROBORATED`; exact position semantics must be rechecked against direct source before becoming a migration parser contract.

### 2.4 Lookup / F4 contract

The review describes `SY_FrmDrdwTbl` as the source for dynamic dropdown / F4 behavior, including:
- source table/view;
- value/display columns;
- visible lookup columns;
- widths;
- linked-field propagation;
- source filter.

This strongly reinforces the current architecture decision that browser lookups must be implemented through a typed, server-owned lookup contract rather than exposing raw metadata SQL to the client.

## 3. Runtime engine components

### 3.1 `FormControler`

The review attributes these responsibilities to the shared controller:
- register master and detail data sources;
- track form mode and dirty state;
- attach standard toolbar actions;
- load metadata-driven layout;
- enforce locks;
- execute configured formula behavior;
- reload form data after commands.

Reported modes include normal, add-new, edit, and find.

The review also shows lock expressions being evaluated from server/database context. Therefore Web authorization and business locks must remain server-authoritative; UI disabled/read-only state is presentation only.

### 3.2 `LayoutX`

The review describes `LayoutX` as the dynamic form-layout engine that:
- materializes controls from metadata;
- places controls using width/height and row-break information;
- can support a design mode whose changes persist back to configuration.

The exact scope of user/company/role personalization and overwrite precedence remains `UNKNOWN`.

### 3.3 `Storer` / data persistence

The review describes a shared persistence component that tracks dirty fields/rows, generates inserts/updates for changed data, and populates audit-style create/update fields.

This is architecture-significant but must not be translated into generic browser CRUD. Existing DB evidence proves procedures, triggers, locking, mixed transaction settings, and other side effects. Web commands must therefore continue to use typed compatibility contracts with authoritative post-commit reconciliation.

## 4. Navigation, permission, validation, and hooks

The review reports menu-to-form dispatch through menu metadata and a hardcoded form resolver.

It also reports permission checks and per-form actions such as view/add/edit/delete/print. The exact table names described in the review do not fully match the current DB archaeology naming (`SY_UserPermisstion`, `SY_UserGroupPermisstion`, related functions/views). Therefore:
- permission semantics are important and `CORROBORATED` at the capability level;
- exact table names, precedence, delegation, caching, and admin bypass behavior remain `UNKNOWN` until direct C# reconciliation.

Before/after save and delete hooks are especially migration-critical. Any Web implementation must preserve their semantics through server-side commands and must not execute metadata-provided SQL in the browser.

## 5. Important contradictions / non-universal cookbook claims

The source review is written as a development cookbook and contains examples that must not be mistaken for global schema invariants.

Examples:
- the statement that detail tables always use an integer identity primary key is not compatible with the DB archaeology finding that only a small subset of the 583 permanent tables use `IDENTITY`;
- the statement that master tables use one fixed document-key pattern is likewise not universal;
- example tables/forms/procedures are illustrative and are not evidence that the exact objects exist in the Medcom production baseline.

These are guidance examples, not repository facts.

## 6. Reported Web synchronization path

The review claims that migration scripts can transform WinForms metadata and hardcoded form descriptions into JSON / a Web metadata table and that a Web metadata provider can render forms from that representation.

This is useful design input but is currently `INFERRED`, not an accepted migration baseline, because:
- the migration scripts themselves are not in the current authoritative Library baseline;
- their idempotency, authorization, versioning, rollback, and schema contracts have not been directly inspected;
- the current project architecture intentionally avoids introducing new Web configuration tables unless existing schema cannot safely represent the required behavior.

Therefore the Web architecture may reuse the concept of a compiled metadata projection, but no specific `Sys_FormMetadata` schema, script, or provider is accepted as authoritative until direct source verification.

## 7. Migration implications

1. Build a typed server-side form metadata compiler/adapter; never send executable SQL hooks/filters directly to the browser.
2. Treat validation, locks, permission, save hooks, delete hooks, formulas, and lookup filters as server contracts.
3. Preserve dirty-state and command outcome reconciliation, but do not copy WinForms persistence internals blindly.
4. Model configuration precedence explicitly across system/company/role/user scopes once C# verification resolves current behavior.
5. Keep hardcoded forms as first-class migration exceptions: a generic metadata renderer alone cannot prove semantic parity.
6. Add direct-source verification tasks for metadata key grammar, permission precedence, hook transaction boundaries, dynamic-form dispatch, and the claimed Web sync scripts.

## 8. C# verification queue

Direct source review should confirm:
- exact `SY_FrmCfg` key/subkey parser;
- all supported `LYT*` / `LYS*` variants and parameter positions;
- form-type dispatch and hardcoded-form fallback;
- lock evaluation and server/user context;
- permission source, precedence, admin/delegation behavior;
- transaction ownership for `Storer` plus configured hooks;
- lookup SQL/filter sanitization and linked-field propagation;
- design-mode persistence scope;
- formula parser semantics;
- whether the reported Web sync scripts and metadata provider exist in the same source tree and are production-used.

Until those checks are completed, keep unresolved details `UNKNOWN`.
