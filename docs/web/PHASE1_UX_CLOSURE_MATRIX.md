# Phase 1 UX Closure Matrix

Status: **complete_candidate evidence for Web Product/UX**, 2026-09-30.

This matrix is the acceptance checkpoint for Issue #3. It does not claim that unresolved C# behavior is known. It proves that every required UX area has an implementable contract and that currently VERIFIED ERP/DB evidence is either bound or carried as an explicit bounded gap.

## 1. Required UX coverage

| Phase 1 requirement | Durable contract | Acceptance |
|---|---|---|
| Apple-inspired enterprise posture | `PRODUCT_UX_FOUNDATION.md §1` | calm hierarchy, restrained chrome/motion, enterprise density preserved |
| information architecture/navigation | `WEB-NAV-SHELL`, `WEB-NAV-TABS`; Grid/Mobile permission contract | page identity, return context, authorized navigation, work tabs/dirty state |
| grid virtualization/large data | `WEB-GRID-CORE`; `GRID_MOBILE_IMPLEMENTATION_CONTRACT.md` | bounded server windows; row/column virtualization; stable row identity |
| filter/search/group/sort | `WEB-FILTER-CONTRACT`; verified DAT bindings | typed allow-listed server query; master/detail distinction |
| resize/reorder/freeze/hide | `WEB-GRID-VIEW`; presentation config contract | persisted presentation without becoming authorization |
| saved views | `WEB-GRID-VIEW`; `WEB-CONFIG-PRESENTATION` | system/shared/personal separation; schema-evolution recovery |
| keyboard workflows | Foundation §3 | arrows, paging, Enter/Escape, Tab, save/search, range/additive selection |
| selection/bulk actions | Foundation §3 | selected scope visible; permission/state revalidation; partial results explicit |
| exports | `WEB-REPORT-RUN` + authorization contract | async large export; formula-injection defense; independent export authorization |
| forms/tabs | `WEB-FORM-STATE`, `WEB-FORM-TABS` | dirty/saving/saved/conflict/disconnected; tab-level error surfacing |
| lookup/dropdown/select | `WEB-LOOKUP`, `WEB-LOOKUP-CONTRACT` | remote/cancellable lookup, stable ID, linked-field behavior, historical invalid refs |
| validation/errors/conflicts | Foundation §§4–5, §14 | inline + summary validation; explicit conflict; outcome-unknown reconciliation |
| loading/empty states | `WEB-STATE-ASYNC` | first-load, refreshing, empty, no-permission, not-found and failure are distinct |
| reporting/printing | `WEB-REPORT-RUN` | SNAPSHOT; preview vs print/export; background jobs |
| permissions-aware UX | `WEB-AUTHZ-PRESENTATION`; Grid/Mobile §5 | menu/action clarity; server remains authoritative for route/API/data/mutation/export |
| responsive/mobile | Grid/Mobile §3 | separate semantic mobile schema; no default shrunk desktop table |
| accessibility | Foundation §10 | WCAG 2.2 AA target; keyboard/focus/name/non-color state; virtual-grid semantics |
| perceived/actual performance | Foundation §8 | explicit shell/grid/query/form/save/scroll budgets |
| slow network | `WEB-NET-DEGRADED`, `WEB-MUTATION-OUTCOME` | offline/reconnecting/slow distinction; no false success; safe reconciliation |
| dynamic controls/integrations | `DYNAMIC_CAPABILITY_UX.md` | typed commands, files, imports, devices, Office, spreadsheet, dashboard |
| configuration/executable metadata | `CONFIGURATION_LOOKUP_UX.md` | presentation separated from executable configuration; version/conflict/rollback UX |

## 2. Freshness matrix

Every reusable surface has an explicit policy. A screen may tighten a policy when later evidence proves correctness requires it; it may not silently weaken it.

| Surface/domain | Policy | Visible freshness behavior | Target |
|---|---|---|---|
| shell/menu/capabilities | SWR + authoritative revalidation before protected action | refresh/degraded state when capability version changes | on route/focus; active ≤60 s |
| transactional/master lists | SWR | last-updated + refreshing indicator | ≤30 s |
| warehouse/inbound operational lists | SWR | last-updated + manual refresh; stale badge when degraded | ≤15 s |
| reference/master lookups | authoritative on search; permitted cache SWR | lookup results reflect current query; stale historical selection explicit | search/open; cache ≤60 s |
| editable document | version-aware targeted revalidation | conflict/freshness warning; no blind live field replacement | before critical commit + after mutation |
| reports/print/export | SNAPSHOT | data-as-of + parameters + generated time | new run required for new snapshot |
| configuration admin | MANUAL/SWR | effective/config version visible; changed-version notice | ≤60 s while active + immediate after save |
| action command | authoritative mutation + targeted revalidation | submitting/outcome-unknown/reconciling/result | immediately after command |
| attachments | SWR + post-mutation revalidation | last-updated when stale | ≤30 s active |
| imports | staged SNAPSHOT | staging/version + validation counts | immutable preview until explicit restage |
| device session | realtime only inside active device session | device state, source, capture time, disconnect | active session; committed data revalidated |
| Office/template generation | SNAPSHOT/background job | data-as-of/template version/job state | per run |
| spreadsheet document | versioned SNAPSHOT | version/conflict state | explicit save/reload |
| dashboard | POLL/SWR | per-widget data age/error | ≤60 s default; ≤15 s only with operational evidence |
| realtime PUSH | not currently bound | must show reconnect/gap recovery, never socket-only “live” | no promotion until authoritative event/version source VERIFIED |

## 3. VERIFIED evidence bindings

### ERP package → Web
- 232 parseable DAT artifacts with persisted grid/layout semantics → `WEB-GRID-CORE`, `WEB-GRID-VIEW`, `WEB-CONFIG-PRESENTATION`.
- 24 VERIFIED filter artifacts / 11 paired master-detail families → `WEB-FILTER-CONTRACT`.
- `ERP-FRM-AP_OrderFrm` → `AP_OrderTbl/AP_OrderDetailTbl` → typed order list/document UX, SWR ≤30 s.
- `ERP-FRM-AP_PurchaseFrm` → `AP_PurchaseTbl/AP_PurchaseDetailTbl` → typed purchase UX, SWR ≤30 s.
- `ERP-FRM-AR_InvoiceRequestFrm` → `AR_InvoiceRequestTbl/AR_InvoiceRequestDetailTbl` → typed request UX, SWR ≤30 s.
- `ERP-FRM-AR_OrderShipFrm` → `AR_OrderTbl/AR_OrderDetailTbl` + unresolved aliases → operational list UX; unresolved alias fields fail closed.
- `ERP-FRM-AR_StockInputFrm` → `vIS_Input/vIS_InputDetail` candidate DB classification → warehouse UX, SWR ≤15 s.
- `ERP-FRM-IV_InboundRequestFrm` and `ERP-FRM-IV_IncomingShipmentStatusFrm` → inbound request master/detail objects → warehouse UX, SWR ≤15 s.
- `ERP-FRM-GJ_BalanceItemFrm` → balance/item references → typed reference/filter UX.
- `ERP-FRM-ItemGroupListFrm` → item-group reference UX, SWR ≤60 s.
- 786 candidate-current RPX layouts, including script/subreport/barcode/image cases → `WEB-REPORT-RUN`; browser never executes RPX script.
- historical failure classes → `WEB-MUTATION-OUTCOME`, `WEB-CONFLICT-EDIT`, `WEB-NET-DEGRADED`.

### VERIFIED DB configuration → Web
- `DB-TABLE-dbo.SY_Menu` → normalized authorized navigation descriptor, not direct browser execution.
- `SY_FrmCfg`, `SY_FrmCtrTbl`, `SY_FrmLstTbl` → normalized form/grid configuration.
- `SY_FrmDrdwTbl` → `WEB-LOOKUP-CONTRACT`.
- `SY_FrmFltTbl` → typed filter descriptor.
- `SY_FrmGrdActTbl`, `SY_FrmMstActTbl`, `SY_FrmOptBtnTbl`, `SY_FrmParTbl` → safe capability/command descriptors; never raw SQL authority.
- `SY_UserBranch`, `SY_UserStorehouse` → evidence that scope metadata exists; UX explicitly does **not** infer complete authorization from these tables.

### Supplemental C# review
The C# summaries corroborate a metadata-driven engine and describe `FormControler`, `LayoutX`, `Storer`, `LYT/LYS`, ControlType 22, dynamic UserControls and executable hooks. Their exact runtime semantics remain INFERRED/UNKNOWN. They bind only to safe reusable UX boundaries in `DYNAMIC_CAPABILITY_UX.md` and `CONFIGURATION_LOOKUP_UX.md`; no C#-only assertion is promoted to VERIFIED.

## 4. Bounded UNKNOWN register for C# round

These are verification reservations, not missing reusable UX design:

- `UX-GAP-NAV-001` exact menu reachability/caption/order.
- `UX-GAP-AUTH-001` exact permission source, precedence, admin/delegation and data-scope enforcement.
- `UX-GAP-CONFIG-PRECEDENCE-001` package/DB/company/role/user precedence and persistence.
- `UX-GAP-FILTER-001` runtime Like semantics and A/B alias resolution.
- `UX-GAP-WORKFLOW-001` per-form commands, status transitions and side effects.
- `UX-GAP-LOOKUP-RUNTIME-001` exact lookup query/filter/linked-field execution.
- `UX-GAP-REPORT-001` runtime report reachability, parameters and print defaults.
- `UX-GAP-IDEMPOTENCY-001` exact command replay/correlation keys.
- `UX-GAP-VERSION-001` exact document concurrency tokens.
- `UX-GAP-REALTIME-001` authoritative event/version source; PUSH remains unbound.
- `UX-GAP-UC-BINDING-001` exact form → dynamic UserControl bindings.
- `UX-GAP-UC-LIFECYCLE-001` dynamic-control save/delete/change side effects.
- `UX-GAP-ATTACH-001` file storage/limits/content-validation details.
- `UX-GAP-DEVICE-001` device models/protocol/local bridge/calibration/override.
- `UX-GAP-SPREADSHEET-001` actual workbook feature usage/round-trip fidelity.
- `UX-GAP-WEBMETA-001` reported Web metadata migration/provider existence.
- `UX-GAP-RESPONSIVE-001` exact mobile field/action priority per form.
- `UX-GAP-SCHEMA-001` API compatibility/version negotiation.

No gap above justifies inventing behavior. Phase 2 screen implementation must bind these when direct C# evidence arrives or mark the affected issue blocked where the unknown is safety-critical.

## 5. Closure acceptance

Web Product/UX has an implementable contract for every category required by Issue #3 and AGENTS.md gate 3, with measurable performance and explicit freshness behavior.

Current VERIFIED ERP/DB evidence has a Web disposition. Remaining unknowns are bounded and reserved for direct C# verification rather than silently omitted.

Therefore the Web Product/UX workstream is **complete_candidate**. Until Lead closes Phase 1, subsequent runs should validate newly landed ERP/DB bindings and only reopen product design if new evidence creates a genuinely new interaction/failure class rather than a variant of the contracts above.
