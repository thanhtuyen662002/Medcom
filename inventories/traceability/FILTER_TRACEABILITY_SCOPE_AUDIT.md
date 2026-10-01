# Filter traceability scope and remaining closure evidence

Audit date: 2026-10-02, Asia/Saigon. Scope: current durable repository evidence only. This audit does not claim a new read of the approved raw ERP or SQL archives. The overall decision is owned by [PHASE1_DB_TRACEABILITY_CLOSURE_DECISION_20261002.md](../../docs/reviews/PHASE1_DB_TRACEABILITY_CLOSURE_DECISION_20261002.md).

## Finite filter slice now enumerated

[FILTER_FAMILY_TRACEABILITY_REGISTER.json](FILTER_FAMILY_TRACEABILITY_REGISTER.json) preserves every explicitly enumerated member in `docs/erp/FILTER_CONFIGURATION_EVIDENCE.md` and cross-checks its row/hidden counts against `docs/erp/DAT_FILTER_QUERY_INVENTORY.md`. Per-member source paths and one-based lines, source-file hashes, aliases, owner/acceptance records and proposed Web/API IDs are retained.

| Check | Result |
|---|---:|
| Distinct filter families | 13 |
| Families with master/detail members | 11 |
| Standalone families | 2 |
| Explicitly named artifacts | 24 |
| Serialized Query rows | 600 |
| Visible / hidden rows | 526 / 74 |
| Distinct literal DB reference names | 18 |
| Alias-bearing artifacts | 10 |

The earlier count **11** is correct for paired families; it is not the total number of filter families. The total **13** includes `GJ_BalanceItemFrm` and `ItemGroupListFrm` standalone filters. Artifact/row counts are persisted-structure evidence, not runtime query counts or verified menu entries.

| Exact family basename | Members | Rows | Alias-bearing members |
|---|---:|---:|---|
| AP_ApprovePurchaseRequestListFrm | 2 | 21 | detail A |
| AP_OrderFrm | 2 | 36 | none recorded |
| AP_PurchaseFrm | 2 | 79 | none recorded |
| AP_PurposeRequestListFrm | 2 | 26 | detail A |
| AR_InvoiceRequestFrm | 2 | 44 | master A |
| AR_OrderByContractFrm | 2 | 71 | detail A |
| AR_OrderComfirmFrm | 2 | 60 | master A |
| AR_OrderShipFrm | 2 | 83 | master A/B; detail A |
| AR_StockInputFrm | 2 | 35 | none recorded |
| GJ_BalanceItemFrm | 1 | 23 | none recorded |
| IV_InboundRequestFrm | 2 | 63 | master A/B; detail A |
| IV_IncomingShipmentStatusFrm | 2 | 50 | detail A |
| ItemGroupListFrm | 1 | 9 | none recorded |
| **Total** | **24** | **600** | **10 artifacts** |

The consolidated bound table now explicitly flags three previously omitted member-level aliases: `AR_InvoiceRequestFrm_filter` A, `AR_OrderByContractFrm_filter_d` A and `IV_IncomingShipmentStatusFrm_filter_d` A. All recorded A/B targets remain UNKNOWN. “No alias recorded” does not prove a simple single-table runtime query or complete projected-column resolution.

Web/API IDs in the register are **proposed dispositions**. Literal names observed in FieldID are VERIFIED references in packaged metadata, while current DB schema/kind/column/body/dependency resolution is pending B2/#21. Existing independently verified SQL anchors keep their original evidence level; this register does not substitute for the missing complete catalog. Alias-dependent criteria are quarantined, hidden criteria are preserved, and no proposed query/action becomes executable from this document.

## Exact coverage limitations and named uncovered evidence

The filter register is complete for its explicitly listed 24 members. It is not a complete ERP inventory, report manifest or ERP ↔ Web ↔ DB join.

| Remaining inventory requirement | What current evidence retains | Missing exact membership / disposition |
|---|---|---|
| All 232 DAT artifacts | Package totals, representative layouts and the 24-member filter inventory | Complete stable-ID/source-path/grid/column manifest for the **208 other DAT artifacts**. The current files do not name all 208; missing names must come from approved package access rather than invention. |
| 23 independently corroborated form identities | Count and representative executable + DAT matches | Complete list of the 23 IDs and their two evidence paths. Neither 170 Frm-like basenames nor filter basename association establishes this membership. |
| 786 candidate-current RPX artifacts | Domain counts, structural counts and selected named reports | Complete report ID/path/hash/flags/data-call/source-span manifest, with Web/API/DB or bounded UNKNOWN disposition. Full names are not retained in the current domain summary. |
| 234 backup RPX artifacts | Backup-directory count and historical classification | Exact version/path/hash identity and exclusion reason. Backup presence does not prove business retirement; do not collapse current/backup files by basename. |
| 18 Office templates | 7 DOC, 5 DOCX, 2 XLS, 4 XLT aggregate counts | Exact template identities, format/hash, proposed generation disposition and bounded invocation/data/merge-field unknowns. Full template filenames are not available in the current summary. |
| User-layout / remembered state | Two DATA artifacts and one remember-state artifact | Exact safe identity/path/format, interpretation status and scope/precedence verification owner. Private contents stay excluded. |
| Executable navigation/permission/lookup symbols | Named metadata/resource symbols and a packaged-presence boundary | Full in-scope capability manifest or exact family membership with explicit candidate/runtime-UNKNOWN status; symbol names do not establish reachability. |
| Historical errors / deployment history | Named failure classes, 39-log lexical summary, 11 dated update snapshots | Link each verified family to a stable risk/acceptance/owner disposition in the generated join. Runtime root cause, incident counts and binary attribution can remain bounded UNKNOWN. |
| Supplied Tools.dll API shape | Static hash/framework/type/method/permission-shape evidence | Explicit API capability dispositions and T1/B4/B5 runtime/session/isolation gates. Static signature presence does not prove server-safe behavior. |
| Complete Medcom catalog and dependency records | Aggregate DDL counts and selected anchors | Sanitized per-object/column/constraint/index/parameter/body-hash/dependency/classification/reuse records; see `docs/db/PHASE1_CATALOG_COVERAGE_MATRIX.md`. |

Concrete named records outside this filter register include `ERP-CFG-AR_InvoiceFrm`, `ERP-CFG-AP_OrderFrm` (the ordinary layout, separate from its filter members), `ERP-CFG-FA_AssetListFrm`, `ERP-CFG-OfficeTemplateSurface`, `ERP-CFG-UserLayoutState` and `ERP-CFG-ClientUpdateHistory`. Their broader Web family policies already exist, but their individual artifact manifests and a generated whole-inventory join are still needed.

The following 19 primary report IDs are individually named in `docs/erp/RPX_STRUCTURAL_EVIDENCE.md` and are **outside this filter slice**. They are named examples requiring report dispositions, not the complete 786-report manifest:

- `ERP-RPT-AP_GoodsDeliveryReceiptReport`, `ERP-RPT-AP_GoodsInspectionAndReceivingReport`, `ERP-RPT-AP_PurposeRequestListReport`.
- `ERP-RPT-AR_InvoiceQRCodeReport`, `ERP-RPT-AR_PurchaseQRCodeReport`, `ERP-RPT-AR_SaleByMonthReport`.
- `ERP-RPT-CT_BaoCaoTamTinhReport`, `ERP-RPT-EQ_AllocateSummary2Report`, `ERP-RPT-FA_DepreciateYearReport`, `ERP-RPT-GJ_AllocateSummaryTHReport`.
- `ERP-RPT-GL_FinanceInterpretation48Report`, `ERP-RPT-GL_FinanceInterpretationReport`.
- `ERP-RPT-IV_BarcodePrintReport`, `ERP-RPT-IV_ProductFinishReport`, `ERP-RPT-IV_ProductOrderReport`.
- `ERP-RPT-PR_BarcodeItemLogoReport`, `ERP-RPT-Phieuban2Report`, `ERP-RPT-PhieubanReport`, `ERP-RPT-QRCodeReport`.

Also retain the exact packaged parent/subreport references from that report evidence. Its 31 subreport **controls** across eight parents must not be treated as 31 unique reports or an inferred current menu set. The one directly recorded procedure-call identifier `IV_GetInboundRequestDetailsByDocumentIDStp` / DocumentID is a report-reference lead awaiting B2 identity/signature/dependency resolution, not permission to execute a procedure.

The owner maintenance guide's 293 property/key pairs and six additional defaults remain secondary INFERRED source descriptions. They belong in their supplemental evidence/index; they cannot enlarge the VERIFIED baseline universe or fill missing current package/DB identities by assumption.

## Finite gate decision matrix

| Closure question | Acceptable completion evidence | Current result |
|---|---|---|
| Are all members of the known filter slice represented exactly once? | Both durable tables agree on 24 members, counts and 13 family groupings; every source line resolves. | **PASS for this slice** |
| Are proposed Web/API policies explicit, with remaining facts owned? | WEB-FILTER-CONTRACT, typed query/facade proposal, freshness, preserved hidden/master/detail semantics, B2/R3/B4/B1 acceptance and safe blocked behavior per family/member. | **PASS as proposed disposition**; no implemented query or runtime parity claim |
| Does every ERP literal reference resolve to a current DB catalog row and fields? | All 18 names matched by authoritative schema/kind/identity and field/dependency evidence; ambiguous/absent candidates explicitly blocked. | **PENDING B2**; register is not catalog closure |
| Is TRC-DB-001 / Gate 2 closed? | Every baseline schema/object/column/constraint/index/programmable identity and dependency/classification/reuse record is durable; repeated definitions reconciled; dynamic/unresolved dependencies explicitly flagged with spans/owners. | **FAIL / remains open** |
| Does Gate 4 cover the entire verified inventory? | Complete artifact/member manifests; each verified in-scope ID maps to stable Web/API disposition plus exact DB IDs or a bounded legitimate UNKNOWN, scope/freshness/coexistence, owner and acceptance. A family row may share policy only if exact membership is retained. | **FAIL / remains partial** |
| Can unsupported runtime semantics be bounded rather than guessed? | Explicit unsupported/blocked state, evidence limitation, owner, test and dependency/reentry condition for every affected member; no silent feature omission or unproved retirement. | **YES**, once membership and extractable joins are complete; runtime parity stays unproved |
| Can missing manifests or dump-extractable fields/dependencies be excluded to declare closure? | No; these are actual deliverables under the existing acceptance criteria. A narrower implementation release does not silently narrow Phase 1 inventory scope. | **NO** |

Gate 4 can truthfully close **coverage** with bounded unsupported/runtime-UNKNOWN dispositions when every in-scope verified ID is accounted for and the DB-side extractable evidence is retained. Such a pass would not unblock a mutation, establish permission enforcement or claim full runtime ERP parity. Unknown current reachability is a reason to gate a feature, not proof that it may be retired.

This correction leaves TRC-DB-001, Gates 2/4 and overall Phase 1 closure unchanged. The next finite work is approved-source manifest/catalog extraction, conservative generated joining and independent Lead review of coverage. No raw exports, real filter values, connection material or historical customer-specific menu rows are introduced by this audit.
