# I78 — CUD and native workflow buttons

Owner direction 2026-10-11: implement remaining CUD/business buttons; exclude print, upload, import and document-copy additions. BE only, sole GitHub writer; existing FE/Sites, schedules, PRs and immutable claims are preserved. Draft lease: [PR140](https://github.com/thanhtuyen662002/Medcom/pull/140), branch codex/be-cud-actions-20261011, starting main b8955fba7a891adbc4f07714b182339bfa47651f.

## Implemented scope

- Purchase orders, inbound requests and internal-transfer batches: native typed create/save/delete and document numbering. Inbound costs have Add/Update/Remove; transfer tech assets support owned Update only.
- Purchase approval, sales PM/SA, transfer PM/tech/SA/accounting/warehouse-out/warehouse-in: source-backed commands and per-user action state. Unsupported direct toolbar CUD is not exposed on approval-only forms. Department forms cannot add/delete primary business lines or overwrite source keys.
- 28 native business buttons, including contract-info; return-step/SA dropdowns and source purchase-price lookup. Generic callers cannot choose tables/procedures/SQL.
- 19 forms / 1,516 source fields / 214 dropdowns; 243 HTTP operations / 890 schemas / 7,821 schema properties. Extra sections remain paged and participate in stateToken except readonly history. All source fields occur on the 38 ERP list/detail routes; native Item/Store/Status presentation includes qualified names and money/calendar displays.
- Serial command transaction, native checks, physical affected-row checks, source hashes, permission/branch/assignment revalidation, shared journal v1 and replay/concurrency behavior remain active. Historical base catalog bytes/hash are retained, avoiding a journal reset.

Evidence: inventories/erp/20261011/cud-workflow-catalog.json (12 additional forms, 28 buttons, 1,099 fields, 108 lookups, 45 module pins, 22 defaults, 5 expressions, 2 grid-action metadata pins); inventories/erp/20261010/six-screen-catalog.json (7 forms, 417 fields, 106 lookups, 67 modules, 15 defaults). Union: 100 unique native modules and 36 defaults. Native source definitions stay private. Source metadata, inputs, actions and concrete SQL effects are in ErpScreenCatalog.cs, ErpWorkflowInputs.cs, ErpWorkflowRules.cs, SqlErpWorkflowEffects.cs, SqlErpTransferSync.cs and ErpScreenEndpoints.cs.

## Bounded compatibility corrections

The native sync procedure contains a global orphan-request status update. SqlErpTransferSync.cs implements its finite batch/detail/asset/log effects while restricting removed-request restoration to the most recent exact batch-association history, matching from/to branches and no current association. Unrelated orphan status40 requests remain unchanged. Missing ownership history is not guessed.

Read-only native views enrich computed grid columns. Detail/asset/history view projections join by UserAutoID, rather than joining every sibling through BatchID; duplicate row identities are rejected. Native static-list dropdowns are supported, and only the pinned readonly IV_GetItemByContractIDStp is admitted as a procedure lookup. Existing batch RequestID associations remain editable even though the ready-for-batch popup excludes already-linked requests.

## Observed validation

- .NET 10.0.401 Release build: PASS, 0 warnings/errors. Focused API/contract/action/display tests: 104/104 PASS (private i78-focused-final.trx). Full current suite and current-head/base CI are pending publication; earlier interrupted local suites and loopback TLS timeouts are not passes.
- Source metadata/scanner tests: 57 PASS. API data audit: PASS for 243 operations and 1,516 ERP fields; its eight regression tests PASS. Architecture boundary check PASS.
- Full FE reference verified against every exported operation/schema/property, JSON examples and local links, rendered through GitHub Markdown in five parts: 1,373 tables, 1,885 fragment links, no missing anchors. Receipt: inventories/backend/20261011/cud-document-validation.json.
- MedData SELECT-only preparation: PASS for all 19 modules, existing journal binding/catalog and complete schema fingerprint; runtime verifier PASS for an added module. No DDL or production business writes. Sanitized receipt: inventories/backend/20261011/cud-target-qualification.json.
- Concrete private SQL fixture validation is being finalized; prior successful checks do not qualify a later revision. Fixture uses actual source procedure bodies, selected native defaults and expression config, 627 synthetic tables and the observed 100-module closure. It is not a full native constraint/index/trigger clone. Local checks do not prove real production user acceptance.

## FE handoff and remaining bounds

[Complete API reference](../backend/BE_FE_API_REFERENCE_20261011.md); [new CUD/action integration](../backend/BE_FE_CUD_WORKFLOW_20261011.md); docs/backend/medcom-openapi.json.

Accounting/dispatch/receive require existing source-valid linked XDC output/NDC input vouchers. This round does not add stock-parent form CUD; QR operates on existing vouchers. Repair monetary calculations beyond previous CUD remain UNKNOWN because current expression evidence does not establish them. Notifications retain nine existing form mappings; added workflow mappings are outside this CUD round. Goal45 and real owner business/release acceptance remain open.

Historical approved Library baseline identities: ERP_Medcom2026(4).zip and Medcom-Data (3)(1).zip in docs/SOURCE_BASELINE.md. Current owner-local ERP/live source round is distinct: inventories/source/20261010/source-set.json and current catalog observation 2026-10-11. Supplementary docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md was read and is not runtime proof. Raw archives, binaries, SQL definitions, credentials and production transaction rows are not committed.

Integration, protected BE profile expansion to 19 modules and live deployment verification: PENDING. Do not interpret the registered new routes as already deployed before the observed release checkpoint.
