# ERP package archaeology — baseline inventory

Evidence source: `ERP_Medcom2026(4).zip`, SHA-256 `801cccb871fedce049ec3c446aeff819d7661ec94641a891d6013d4b86a0bd52`.

This document records only behavior/configuration directly observable from the packaged artifacts. Runtime behavior that requires C# or a running ERP remains UNKNOWN.

## 1. Package surface

**VERIFIED**

- Archive contains 1,397 ZIP entries including directory entries; 1,375 are files, matching the project baseline.
- File types include 1,020 ActiveReports `.rpx`, 232 Janus-style `.dat` layout files, 40 DLLs, 39 historical error TXT files and 12 packaged EXE copies/entries.
- Runtime libraries include Janus GridEX/UI/Ribbon/Schedule/Timeline components and ActiveReports 6 plus PDF/XLS/RTF/Text/TIFF/HTML export libraries.
- Spreadsheet/document libraries include EPPlus and Aspose.Cells.
- `settings.config` exists, but secrets/connection values are not reproduced in this public repository.

**INFERRED**

- The Windows client is strongly dependent on Janus controls for grid-heavy interaction and ActiveReports for reporting/export. Exact application-side invocation remains UNKNOWN until C# verification.

## 2. Persisted layout/configuration surface

Stable artifact ID rule: `ERP-CFG-<basename>`.

All 232 `Layout/Medcom/*.dat` files parsed successfully as XML. They contain 13,362 persisted rows across layout/list structures.

Observed layout fields include `GridName`, `ColumnName`, `Width`, `Visible`, `Position`, `Sum`, `Wrap` and `Tag`.

Across rows where visibility is persisted:
- 7,695 rows are `Visible=true`.
- 1,880 rows are `Visible=false`.
- 686 rows use `Sum` aggregation; 8,889 explicitly use `None`.

Frequently represented grids include `grdList`, `grdChitiet`, `grdListDoc`, `gridEX1`, multiple detail grids, invoice grids, accounting-entry grids and dropdown grids.

There are 24 files whose name includes `_filter`; paired `_filter` / `_filter_d` artifacts are present for multiple operational forms.

Examples:
- `ERP-CFG-AR_InvoiceFrm`: 198 persisted layout rows spanning `gridEX1`, `grdChitiet`, `grdHoaDon`, and `grdDinhKhoan`; 140 rows explicitly visible and 25 explicitly hidden.
- `ERP-CFG-AP_OrderFrm`: 52 rows across `grdListDoc` and `grdChitiet`; 27 explicitly visible and 9 explicitly hidden.
- `ERP-CFG-FA_AssetListFrm`: 125 rows across the primary list plus detail/depreciation/use grids; 81 explicitly visible and 12 explicitly hidden.

These observations are **VERIFIED persisted layout evidence**, not proof that every saved field is honored at runtime.

## 3. Candidate form/report surface from layout names

Stable form IDs use `ERP-FRM-<basename>` only when the artifact name clearly denotes a form. These IDs identify packaged configuration surfaces, not yet confirmed navigation entries.

Of the 232 layout artifacts, 170 basenames contain `Frm`; 38 contain `Report`. Prefix distribution is dominated by AR (54), IV (32), AP (31), CF (13), FA (13), CS (11), HR (6), GJ (5), WA (5), plus smaller groups and unprefixed/shared artifacts.

Representative packaged form/config surfaces include:
- `ERP-FRM-AR_InvoiceFrm`
- `ERP-FRM-AR_InvoiceRequestFrm`
- `ERP-FRM-AR_OrderByContractFrm`
- `ERP-FRM-AR_OrderShipFrm`
- `ERP-FRM-AP_OrderFrm`
- `ERP-FRM-AP_PurchaseFrm`
- `ERP-FRM-CF_ContractTbl`
- `ERP-FRM-FA_AssetListFrm`

**UNKNOWN:** exact menu hierarchy, captions, tabs, toolbar commands, permissions, validation, lookup data sources, workflow transitions and form-to-form navigation cannot be declared from filenames/layout alone.

## 4. Reporting surface

Stable report ID rule: `ERP-RPT-<basename>`.

The archive contains 1,020 RPX files. 234 reside under backup report directories; 786 are outside those backup directories and are treated as **candidate current packaged reports**, not automatically as user-visible/active reports.

Candidate-current RPX prefix counts include AR 219, GJ 102, CS 92, IV 73, AP 49, HR 37, ER 27, GL 26, FA 19 and EM 18, with additional smaller domains.

RPX files are ActiveReports XML layouts and visibly contain report presentation/data-binding metadata. The package also contains ActiveReports export assemblies for PDF, XLS, RTF, text, TIFF and HTML.

**UNKNOWN:** which RPX files are reachable in current navigation, exact stored-procedure/data-source bindings, parameter contracts, subreport runtime wiring, authorization, printer defaults and export options exposed to users require C# and/or runtime evidence.

## 5. Historical error evidence

There are 39 packaged historical error TXT files dated from April through September 2026.

Without publishing customer or transaction content, signature-only scanning found:
- `Invalid column` in 3 history files.
- `Conversion failed` in 2 history files.
- an object-reference/null-style message in 1 history file.

This is **VERIFIED existence evidence only**. Root causes and affected workflows are UNKNOWN until each sanitized stack/context is reviewed.

## 6. Web migration implications

1. Column visibility/order/width and aggregation are existing ERP configuration semantics, not optional Web polish. The Web configuration model must preserve or deliberately supersede them.
2. Multiple grids per form are common; a one-grid-per-screen migration model is insufficient.
3. Filter artifacts indicate persisted filtering/configuration behavior exists and needs explicit Web disposition.
4. Backup RPX files must not be mistaken for active reports. Migration inventory needs active/candidate/backup status.
5. Report parity must cover layout, binding, parameters, authorization, printing/export and subreports rather than merely matching report names.
6. Packaged error history is useful for a sanitized failure-class register but cannot establish business rules by itself.

## 7. Evidence gaps / next independent work

- Generate reviewable inventories for all 232 layout artifacts with stable IDs, grid counts and persisted column semantics.
- Generate candidate-current vs backup RPX inventory with stable report IDs and structural metadata.
- Sanitize and classify historical error signatures without copying business/customer values.
- Inspect safe assembly metadata/resources for form/menu/report names while avoiding decompilation claims that cannot be evidenced.
- Bind ERP IDs to DB/Web IDs only after those workstreams publish VERIFIED identifiers.

Status remains `active`; this is not yet a complete ERP inventory.
