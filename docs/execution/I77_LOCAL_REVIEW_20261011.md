# I77 local review — reference names and FE presentation

Scope: PR 139, base `d7f901584b56a8620cc6ec68f59a9cc21bcf9b23`. The interactive lead reviewed the local patch; this is not a fabricated independent GitHub approval. Goal #45 remains open.

## Reviewed boundaries

- `ApiReferenceCatalog.cs` embeds a finite catalog; `SqlReferenceData.cs` accepts keys only, batches parameters and rejects caller SQL identifiers. Catalog source columns/types are pinned in `inventories/backend/20261011/api-reference-bindings.json`, reconciled with MedData metadata and TOP(0) in `reference-source-reconciliation.json`. No business rows or private SQL bodies are published.
- Native reads own their serializable transaction, verify credential stamp and branch scope before/after, roll back, dispose and recheck the session. Duplicate keys never choose an arbitrary name or multiply parent rows. Null ItemName retains ItemCode/Unit. Branch options only come from native grants, with deterministic paging/search.
- `FeDisplayProjection.cs` enriches a serialized business-read copy. Existing source name/code/unit values, including null snapshots, remain unchanged. Strict input objects stay exact; sibling DisplayData copies carry presentation. Commands, journal intent hashes and state tokens are unchanged. Source-bound status tables are module-specific. Technical/unknown IDs have null Name and explicit state rather than invented business names.
- Exact decimal/exponent arithmetic retains large amounts and adds grouped VND/USD display strings; percentages/rates/quantities remain raw. SQL calendar dates use Vietnamese day/month order without inventing an offset. Unresolved currency/date values produce null display.
- `FeDisplaySchemas.cs` creates response variants and preserves input schemas. Contract audit negative tests mutate active response schemas. The readable pilot client accepts additive response metadata; strict command DTO parsing is retained. No separately owned FE code is changed.

## Observed validation

- Release build: zero warnings/errors. Public solution suite: **3,298 passed, zero failed**; three explicitly private LegacyRuntime cases were skipped. Evidence: private test receipt `I77-display/tests/i77-final-public.trx`; no private path content is committed.
- Focused repair suite: 250 passed, including draft read/save, source fields and session authority. Nine real local synthetic SQL checks passed for name/code/unit, exact key matching, branch grants/paging, scope changes and capacity. These reads rolled back and created no MedData business transactions.
- API audit: 120 operations; all 118 compatible document source fields and all 417 finite screen-section fields reconciled; eight audit regressions passed. OpenAPI export: 423 schemas / 3,450 schema properties. Full FE reference: 660 tables, 888 fragment links, zero missing anchors, valid JSON examples/local links and three GitHub Markdown render parts.
- Required hosted checks and tested merge/package provenance must pass on the final source/base before merge. Their exact receipts and live deployment verification are recorded on PR 139; earlier doc-only checks do not prove this implementation.
- Hosted container run 38110091830 exposed a missing build-context COPY for the new embedded reference catalog. Dockerfile and the exact .dockerignore allowlist now include that sanitized file; context tests also deny neighboring audit/private files and directory-shaped impostors. This owned failure must be green on the repaired source before integration. No broad inventory/raw-source inclusion was added.

## Remaining acceptance

`docs/backend/API_DISPLAY_AUDIT_20261011.md` records current CUD/buttons and explicit gaps: purchase-order/inbound CUD, source report execution, additional import/copy effects, downstream approvals, repair amount formulas and the tracked notification shipment target. No full ERP or production business acceptance is claimed. Optional names can be unavailable when a source is missing, ambiguous or changed; original authorized raw reads remain usable. New branch BFF adoption belongs to the separately owned FE. No production schema/configuration change or actual-user CUD acceptance was performed in I77.
