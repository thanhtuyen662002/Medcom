# Grid + Mobile Implementation Contract

Status: **ADOPTED product contract** for Medcom Web implementation planning.

Source direction: owner-supplied `MEDCOM_WEB_GRID_UI_GUIDELINES.md`, reviewed 2026-09-30. This document adopts the architecture that is consistent with the existing Web Product/UX foundation and tightens it for implementation.

## 1. Decision

Medcom Web uses:

**ONE SHARED GRID PLATFORM + MANY SCREEN CONFIGURATIONS + SEPARATE DESKTOP/MOBILE PRESENTATIONS**

It explicitly rejects:
- one custom Grid implementation per ERP screen;
- one universal Grid configuration for every screen;
- desktop tables shrunk into horizontal-scroll mobile UX;
- business actions hard-coded inside Grid Core;
- treating database columns as the UI schema.

## 2. Three-layer UI architecture

### Layer A — shared Grid Core
Technical capabilities only:
- server-side paging/filter/sort/search/group/summary;
- row/column virtualization when cardinality/width requires it;
- resize/reorder/hide/show/freeze/pin;
- selection and multi-selection;
- loading/empty/error states;
- saved views and column preferences;
- keyboard navigation;
- export hooks;
- sticky headers;
- row click/double-click/context-menu plumbing;
- responsive breakpoints.

Grid Core MUST NOT know domain-specific rules such as “approve purchase request”, “move warehouse”, “delete only in Draft”, or form-specific stored procedure names.

### Layer B — ERP field primitives
Reusable semantic field types:
- Text, Number, Money, Quantity, Percent;
- Date, DateTime, Boolean;
- Status;
- Employee, Customer, Supplier, Warehouse, Item, Serial;
- DocumentLink;
- Lookup / Enum.

Formatting, accessibility, empty-state behavior, tooltip/preview behavior, and semantic status styling belong here.

### Layer C — screen configuration
Every ERP screen owns its own:
- columns and default visibility;
- column order/width/pinning;
- filters and quick filters;
- default sort/group/summary;
- toolbar/row actions;
- permission/capability requirements;
- business-state enable/disable rules;
- detail/master-detail behavior;
- desktop presentation;
- mobile presentation;
- freshness policy;
- data adapter/query contract.

A different screen configuration is NOT a different Grid engine.

## 3. Desktop vs mobile

Desktop is the dense-data work surface and may expose wide virtualized grids, advanced filters, column personalization, keyboard workflows, master/detail panels and bulk actions.

Mobile MUST use a separate semantic list/card schema for ordinary ERP lists. A record should normally show only 4–6 high-value items before drill-down:
1. identity;
2. status;
3. primary business value;
4. context;
5. primary action.

Mobile list configuration is allowed to use a different field subset and action set from desktop.

Horizontal scrolling on mobile is reserved for true spreadsheet/matrix cases, not the default document-list experience.

## 4. Query/data adapter boundary

UI Grid → Screen Data Adapter → typed API/Query Service → verified DB view/procedure/query.

The browser never:
- receives arbitrary SQL;
- constructs identifiers from legacy FieldID;
- downloads a huge dataset just to filter locally;
- assumes a stored procedure is equivalent to generic CRUD.

Minimum list query contract:
- page / cursor;
- pageSize / bounded window;
- deterministic sort + stable tie-breaker;
- allow-listed typed filters;
- search;
- optional group/summary/quickFilter/savedView.

## 5. Action and permission contract

Permission and business state are distinct:

`authorized action` != `action allowed for current record state`.

For every screen/action:
- backend computes/validates the user's capability and data scope;
- navigation/menu response contains only authorized screens;
- frontend may hide unavailable navigation/actions for clarity;
- direct URL/API calls MUST be rejected server-side when unauthorized;
- mutation time revalidates permission + company/branch/storehouse scope + record state;
- export/report/download has its own authorization;
- role changes during a session must take effect on revalidation, not only next login.

Action configuration therefore carries presentation rules such as `visibleWhen` and `enabledWhen`, but these are never the security boundary.

## 6. Saved views and configuration scope

Grid personalization key should be modeled as at least:
`User + Company/Tenant + Screen`.

Candidate user preferences:
- column order;
- visibility;
- width;
- sort;
- filters;
- page size;
- pinned columns.

Personal preference must never mutate the system/company default.

Existing legacy configuration is consulted first. Add a Web-specific persistence table only if Phase 1/C# verification proves legacy storage cannot safely support versioned browser personalization.

## 7. Status semantics

Individual screens do not invent arbitrary colors. Business states map to shared semantic statuses:
- neutral;
- info;
- pending;
- warning;
- success;
- error;
- cancelled.

Status text remains visible; color alone is never the only signal.

## 8. Screen archetypes

Standardize behavior by archetype rather than by individual screen component:
- Simple List;
- Document List;
- Master–Detail Document;
- Inventory / Stock Grid;
- Status / Workflow List;
- Analytical Grid.

Custom Grid code is reserved for genuinely different interaction models such as pivot/matrix, spreadsheet, timeline, Gantt, scheduling, Kanban, deep tree-grid or financial-statement layout.

## 9. Acceptance for every migrated screen

Data:
- correct business dataset and authoritative scope;
- no unnecessary technical fields;
- search/filter/sort/paging/virtualization verified.

Desktop:
- main identity/status/value obvious;
- numeric/date semantics consistent;
- actions contextual;
- dense but readable.

Mobile:
- separate mobile schema;
- semantic list/card;
- touch-usable filters/actions;
- no default horizontal-scroll table.

Business:
- navigation visibility obeys permission;
- direct route/API authorization is enforced server-side;
- permission + business-state tests cover view/edit/delete/approve/export;
- unauthorized users cannot infer hidden data through count/export/detail endpoints.

Reuse:
- no duplicate Grid engine;
- shared field primitives reused;
- domain behavior stays outside Grid Core.

## 10. Initial pilot screens

The implementation pilot after Phase 1 will exercise different archetypes with these owner-prioritized workflows:

| Business path | Current candidate ERP binding | Pilot archetype |
|---|---|---|
| Bán hàng → Đề nghị bán hàng | `ERP-FRM-AR_InvoiceRequestFrm` → `AR_InvoiceRequestTbl` / `AR_InvoiceRequestDetailTbl` (current VERIFIED filter binding; exact menu-caption equivalence to be confirmed) | Master–Detail / Workflow |
| Quản lý kho → Đề nghị nhập hàng | `ERP-FRM-IV_InboundRequestFrm` → `IV_InboundRequestTbl` / `IV_InboundRequestDetailsTbl` | Master–Detail / Workflow |
| Quản lý kho → Đề nghị điều chuyển nội bộ | exact ERP form binding **UNKNOWN**; resolve from metadata/C# before coding | Master–Detail / Workflow |
| Mua hàng → Duyệt đề nghị mua hàng | `ERP-FRM-AP_ApprovePurchaseRequestListFrm` → `AP_PurchaseRequestTbl` / `AP_PurchaseRequestDetailTbl` | Status / Workflow List |
| Mua hàng → Đặt mua hàng | `ERP-FRM-AP_OrderFrm` → `AP_OrderTbl` / `AP_OrderDetailTbl` | Master–Detail Document |

The pilot must prove the shared Grid platform and separate desktop/mobile screen schemas before scaling to the rest of Medcom.


## 11. Mobile shell and role quick navigation

Mobile shell behavior is defined by `docs/web/MOBILE_NAVIGATION_ROLE_CONFIG.md`.

Normative additions:
- persistent bottom navigation for high-frequency actions;
- Menu item opens the full authorized drawer/sidebar;
- bottom-nav quick actions are configurable per role;
- only verified admin accounts may modify role quick-nav configuration from the UI;
- quick-nav configuration is presentation only and cannot grant permission;
- revoked capabilities disappear after authoritative revalidation;
- realtime invalidation may use SignalR, with SWR/revalidation fallback during WinForms coexistence.
