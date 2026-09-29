# ActiveReports RPX structural evidence

Authoritative source: `ERP_Medcom2026(4).zip`, SHA-256 `801cccb871fedce049ec3c446aeff819d7661ec94641a891d6013d4b86a0bd52`.

Scope: the 786 RPX files directly under `Reports/` (candidate-current packaged reports). The 234 files under `Reports/BackupRpt` and `Reports/BackupLast` are excluded from the candidate-current statistics below. This is packaged-artifact evidence, not proof that every report is reachable by a current user.

## 1. Parser and format facts

**VERIFIED**

- All 786 candidate-current RPX artifacts can be parsed as ActiveReports XML after removing NUL bytes used as a packaging terminator/encoding artifact in 123 files.
- Root `ScriptLang` is `C#` on 709 reports and `VB.NET` on 77 reports.
- The 786 layouts contain 28,194 `Control` nodes in total.
- 11,830 control-level `DataField` bindings are present.
- 777 of 786 candidate-current reports contain at least one `DataField`; 9 have no control-level `DataField` binding.
- Page-setting orientation codes observed are `1` on 503 reports and `2` on 244 reports; 39 have no orientation value in a `PageSettings` node. The meaning of those numeric codes is not promoted to a business label here without runtime/library verification.

Stable IDs continue to use `ERP-RPT-<basename>`.

## 2. Embedded report code is a migration surface

**VERIFIED**

119 candidate-current RPX files contain a non-empty embedded `Script` block:
- 71 use C# script.
- 48 use VB.NET script.

This means RPX migration cannot be treated as XML/layout conversion only. Some reports contain report-local behavior that must be catalogued and either reproduced, moved to the backend/report service, or deliberately retired.

Observed script behavior includes format-event handlers and runtime mutation of report controls. For example, `ERP-RPT-AP_GoodsDeliveryReceiptReport` contains C# format logic that reads bound values and changes checkbox/text state. The exact business semantics remain subject to C# and data-contract verification; the existence of executable report-local behavior is VERIFIED.

The largest non-empty script blocks observed by character count include:
- `ERP-RPT-AP_GoodsInspectionAndReceivingReport`
- `ERP-RPT-AP_GoodsDeliveryReceiptReport`
- `ERP-RPT-GJ_AllocateSummaryTHReport`
- `ERP-RPT-FA_DepreciateYearReport`
- `ERP-RPT-EQ_AllocateSummary2Report`
- `ERP-RPT-AP_PurposeRequestListReport`

These are priority manual-review candidates because a visual-only report rewrite has elevated parity risk.

## 3. Subreport dependency evidence

**VERIFIED**

31 `AR.Subreport` controls occur across 8 parent RPX files. Every referenced `ReportName` has a matching candidate-current RPX basename in the package.

Parent → packaged subreport references:

- `ERP-RPT-AP_GoodsInspectionAndReceivingReport` → `AP_GoodsInspectionAndReceivingReport_SubReport_588`
- `ERP-RPT-CT_BaoCaoTamTinhReport` → `CT_BaoCaoTamTinhSubReport`
- `ERP-RPT-GL_FinanceInterpretation48Report` → `GL_FinanceInterpretation48Phan01` through `GL_FinanceInterpretation48Phan08`
- `ERP-RPT-GL_FinanceInterpretationReport` → `GL_FinanceInterpretationPhan01` through `GL_FinanceInterpretationPhan16`
- `ERP-RPT-IV_ProductFinishReport` → `IV_ProductFinishReport_SubReport_954`, `IV_ProductFinishReport_SubReport_228`
- `ERP-RPT-IV_ProductOrderReport` → `IV_ProductOrderSub`
- `ERP-RPT-Phieuban2Report` → `PhieubanSubReport`
- `ERP-RPT-PhieubanReport` → `PhieubanSubReport`

Migration implication: report inventory and acceptance must preserve the dependency graph, not merely the parent report name.

## 4. Specialized control surface

**VERIFIED**

- 74 candidate-current reports contain `AR.Image` controls.
- 7 contain barcode controls:
  - `ERP-RPT-AP_GoodsDeliveryReceiptReport`
  - `ERP-RPT-AP_GoodsInspectionAndReceivingReport`
  - `ERP-RPT-AR_InvoiceQRCodeReport`
  - `ERP-RPT-AR_PurchaseQRCodeReport`
  - `ERP-RPT-IV_BarcodePrintReport`
  - `ERP-RPT-PR_BarcodeItemLogoReport`
  - `ERP-RPT-QRCodeReport`
- `ERP-RPT-AR_SaleByMonthReport` contains an `AR.ChartControl`.

These controls require explicit Web/report-engine disposition. Screenshot/PDF parity alone is insufficient where barcode, image or chart generation is operationally consumed downstream.

## 5. Direct technical binding recovered from RPX metadata

**VERIFIED**

A base64/UTF-16 encoded RPX `Tag` metadata block in `ERP-RPT-AP_GoodsInspectionAndReceivingReport` and its packaged subreport exposes the technical data-call identifier `IV_GetInboundRequestDetailsByDocumentIDStp` and parameter identifier `DocumentID`.

Only identifiers are recorded here; no runtime values or transaction data are published.

This narrows the previous blanket UNKNOWN around report-to-database binding: at least this report family carries a DB procedure binding in packaged RPX metadata. It does **not** prove that all RPX files encode their data source this way, nor that this is the only runtime query used by the report.

## 6. Migration rules derived from this evidence

1. Report parity inventory must include: parent/subreport graph, DataField contract, embedded script behavior, specialized controls, parameters/data-call identifiers, page settings, authorization, output formats and printer/export behavior.
2. Embedded RPX script must not be executed in a Web client. Business/data rules belong behind a server boundary; presentation-only transformations need an explicit report-engine/Web implementation.
3. Subreports must be migrated atomically with their parent dependency set or the parent remains incomplete.
4. Barcode/QR outputs require machine-readable acceptance tests, not visual inspection only.
5. Image-bearing reports require source, access-control, missing-image and export behavior tests.
6. Candidate-current packaging is not reachability. Navigation, permission and runtime invocation remain UNKNOWN until C#/runtime evidence proves them.
7. Report-to-DB bindings should be extracted conservatively from structured metadata and corroborated with DB objects; never infer a stored procedure from report naming alone.

## 7. Remaining independent ERP work

- Split the 786 candidate-current reports into reviewable domain indexes with structural flags: script, subreport, image, barcode/chart, DataField count and candidate data-call identifiers.
- Catalog the 232 DAT artifacts by stable ID, grid count, persisted column count, visibility/order/width/sum semantics and filter pairing.
- Cross-check candidate form identifiers between root executable metadata and DAT layout names to classify executable+layout, executable-only and layout-only surfaces.
- Sanitize historical error signatures into failure classes.
- Await C# only for behavior that packaged artifacts cannot establish; do not block the independent inventories above.

Workstream status remains `active`.
