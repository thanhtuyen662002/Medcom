# I79 — canonical API responses and business-only FE handoff

Owner request, 2026-10-11: redo all API responses without repeated record data; hand off which API supports which screen/action and forbid technical terminology on product UI.

Authoritative GitHub base: efa89df6885f7d36acb9ddf1e41855b6131983c1. Four current main workflows 38123249644 / 38123249638 / 38123249636 / 38123249651 are observed SUCCESS. Isolated branch: codex/be-response-standard-20261011; only the interactive BE lead publishes.

Scope: inventory all 243 registered operations; normalize successful business rows/header/line/dropdown and existing-document responses so each field has one canonical location; keep complete bounded paging and ID/name and raw/formatted value pairs; regenerate compiled OpenAPI and exact source-field mappings; verify HTTP contracts and source reconciliation; replace FE-facing prose with a screen/action/API purpose handoff and approved Vietnamese business labels. This is an explicitly requested read-response contract change; old duplicate wrappers are not a new compatibility mode.

Internal typed commands, identity/session/scope, database effects, journal/replay and concurrency remain source-backed. The response change does not require SQL migration or new write authorization. The separately owned FE/Sites code, its service and all Medcom schedules are not mutated. Consumers need to adopt the new read response; no finished FE acceptance is invented.

Evidence: src/backend/Medcom.Contracts/Documents.cs, ErpScreens.cs, PurchaseRequestWorkspace.cs; src/backend/Medcom.Api/DocumentEndpoints.cs, FeDisplayProjection.cs, FeDisplaySchemas.cs, ApiContractCatalog.cs; docs/backend/document-field-contract.json and inventories/erp/20261010/six-screen-catalog.json plus inventories/erp/20261011/cud-workflow-catalog.json. The current contract duplicates basic scalars inside full objects and some exact-input response snapshots inside DisplayData siblings. Full observations and tests will be recorded after implementation, not assumed here.

Mandatory historical approved Library identities and current owner-live round retain their distinct provenance in docs/SOURCE_BASELINE.md. docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md was read as supplementary evidence. Raw historical Library archives are not reopened in this transport-only run; native runtime equivalence and full Goal45 acceptance remain UNKNOWN. No new native business semantic fact is claimed without its existing source evidence.

Implementation, current-head/base CI, merge and BE release: PENDING.
