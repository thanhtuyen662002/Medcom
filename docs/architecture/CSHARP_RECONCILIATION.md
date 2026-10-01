# Supplemental C# Architecture Reconciliation

Status: architecture addendum. The owner-supplied C# review summaries are secondary evidence and do not replace the authoritative Phase 1 package/database baselines.

## Purpose

The C# review summaries sharpen boundaries already indicated by ERP package and DB evidence. Claims that depend only on those summaries remain INFERRED until direct source verification.

## Metadata compiler boundary

The review reports form configuration keys for master/detail sources, before/after save and delete hooks, filters, joins, extra selects and formulas, plus LYT1/LYS1 dynamic-control configuration.

Architecture decision:
- the browser receives normalized declarative descriptors only;
- executable/filter/join/formula/hook configuration is resolved by a server-owned compatibility compiler;
- unresolved executable metadata fails closed;
- executable configuration changes are privileged, versioned, audited and rollback-capable;
- presentation personalization is separate from executable business configuration and from authorization.

The reported Web metadata migration/provider path is INFERRED and is not selected as an authoritative persistence design until its source/schema/idempotency/rollback behavior is verified.

## Dynamic UserControl dispositions

| Supplemental capability | Web/API disposition | Backend/integration disposition |
|---|---|---|
| ERP-CFG-UC-ActionCommand | allow-listed typed command IDs; schema-validated parameters; server reauthorization | compatibility facade; per-command transaction, idempotency and audit |
| ERP-CFG-UC-Attachment | authorized upload/list/download/delete | server-owned file contract; content/size validation, retention and audit |
| ERP-CFG-UC-Barcode | scanner input is presentation; lookup/insert is a typed command | duplicate/reconnect-safe compatibility facade |
| ERP-CFG-UC-Import | stage, validate, preview, bounded commit | durable job for large imports; idempotent batch identity and row errors |
| ERP-CFG-UC-DeviceCOM | device-adapter contract; browser does not assume raw COM access | verified local bridge/device path; device identity and duplicate-read controls |
| ERP-CFG-UC-OfficeTemplate | template-run API / durable generation job | versioned template, authorized data snapshot, auditable artifact |
| ERP-CFG-UC-Spreadsheet | explicit spreadsheet contract, not generic grid | preserve verified formulas/format/binary semantics or controlled replacement |
| ERP-CFG-UC-Dashboard | typed read model with explicit freshness | query facade; PUSH only after authoritative event/version semantics exist |
| ERP-CFG-UC-ExternalIntegration | server integration adapter | timeout/retry/circuit breaker/audit; secrets stay server-side |

Form-specific bindings remain UNKNOWN until direct source/authoritative metadata proves them.

## Lifecycle and transaction boundary

The reported FormControler/Storer lifecycle combined with existing DB evidence for procedures/triggers means save parity cannot be implemented as generic browser CRUD. Each migrated command must identify validation, lock, before-save, mutation, after-save/delete, trigger and asynchronous effects. Unknown ordering remains a direct-source verification gap. After an ambiguous network outcome, reconcile authoritative state using correlation/idempotency identity before retry.

## Configuration scope

The reported compact layout grammar corroborates configurable labels, sizing, read-only/required/default behavior. Package DAT evidence independently proves grid layout and filter persistence.

The normalized Web configuration contract therefore covers stable form/tab/control/grid-column/filter/lookup IDs, immutable configuration versions, and explicit scopes. Proposed system → company → role → user presentation precedence remains architecture policy until C# verification proves legacy precedence. Authorization remains independent and may only narrow data/actions.

## Direct C# verification gaps

- ARCH-GAP-CSHARP-001: exact form-config key grammar and LYT/LYS parser semantics.
- ARCH-GAP-CSHARP-002: metadata-driven versus hardcoded form dispatch/fallback.
- ARCH-GAP-CSHARP-003: validation, lock, persistence hook and transaction ordering.
- ARCH-GAP-CSHARP-004: permission source/precedence/admin/delegation behavior.
- ARCH-GAP-CSHARP-005: every dynamic UserControl class to form/data/procedure/file/device/integration binding.
- ARCH-GAP-CSHARP-006: reported Web metadata migration/provider schema, idempotency, authorization and rollback.

None of these gaps blocks continued package/DB traceability work.
