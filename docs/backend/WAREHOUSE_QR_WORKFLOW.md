# I52 warehouse QR candidate contracts

This slice provides pure C# and TypeScript syntax projections and a separately named
`ascii-canonical-no-truncation-v1` transport guardrail. It has no execution capability.
A `candidate` status describes the offline grammar projection; it is not exact ERP
acceptance, document eligibility, authorization, package existence or command success.
`RuntimeEquivalence` / `runtimeEquivalence` remains `UNKNOWN`, even when the proposed
profile reports `Supported` / `supported`. No production consumer is registered.

## Evidence and placement

The complete sanitized owner contract is retained in
`docs/erp/WAREHOUSE_QR_WORKFLOW_EVIDENCE.json`, with implementation metadata and shared
synthetic fixtures appended. Its original input SHA-256 is
`272242b7147e76afa9e88315b7a64ffbaedee4e2e05821af8c0e5943a1257b6d`.
The original JSON is source-audited technical evidence supplied by the owner; this
slice verified its bytes, not the private ERP/SQL archive bodies. Those archives
were not supplied here and were not executed. Engine documentation references are
attributed contract evidence, not newly executed SQL parity checks.

| Source binding | Evidence in MedData-Data.sql | Consequence |
| --- | --- | --- |
| Warehouse 07 → QR group 07020 | 319981, 320000 | Dedicated warehouse QR workflows, distinct from QR-to-search |
| 0702001 / IV_Output_QRCodeFrm | 320001, registry 309918, ADD 304150, DELETE 301377 | Fixed IV_OUTPUT target and selected DocumentID |
| 0702010 / AR_Invoice_QRCodeFrm | 320002, registry 309706, ADD 301341, DELETE 301373 | Fixed AR_INVOICE target and selected DocumentID |
| CF_QRcodeStp | 838817–839267 | Scanner ADD/DELETE mutate target-specific QR rows and parent isScanQRCode |
| Normalization / ordinary parsing | 838818–838854 / 838899–838938 | Global barcode CR/LF removal; U+0020-only trim; three components |
| Package parsing and lookup | 838863–838896 | Canonical GUID subset; content and quantity require CF_QRPackageTbl lookup |

Literal control metadata includes BarcodeInputCtl (ADD), BarcodeInputCtl_1 (DELETE),
DocumentID, SaveContinue, Inx=2 and RL=1. Callback ordering, configuration precedence,
host effects, branch/warehouse/menu/action/lock policy and runtime behavior are UNKNOWN.
These parsers accept only barcode text; no target, procedure name, action or operation
key parameter can be supplied. Text that resembles a target remains ordinary item text.

## Lossless syntax projection and narrower profile

`Parse` / `parseWarehouseQr` retains the normalized barcode independently of fields:
remove all CR and LF anywhere, then trim only U+0020 at the whole-string edges.
Each ordinary component also receives U+0020-only trimming. Internal spaces, spelling,
case, Unicode and even unpaired UTF-16 surrogates are preserved in the diagnostic
projection. General Unicode Trim, transliteration and normalization are absent.
Unicode/code-page/collation interpretation is unqualified; the separate profile
rejects controls other than barcode CR/LF and all non-ASCII input.

Ordinary syntax requires exactly two ASCII semicolons: ItemID;ItemCode;Lot. ItemID
and Lot must be nonempty after space trimming; ItemCode may be empty. The candidate
carries the source-defined unit quantity 1, not inventory availability or a posted
quantity. Oversize fields are preserved and rejected by the transport profile;
this does not simulate SQL assignment truncation or prove a legacy rejection.

ASCII PKG1; prefix casing is recognized explicitly. Package text must have 41 UTF-16
code units and a canonical 36-character hex GUID. GUID case may differ; its identity
is emitted as lowercase canonical text while normalized barcode spelling is retained.
Zero GUID and arbitrary version/variant bits remain possible. Package results carry
only kind, packageId and needsLookup=true. They provide no BaseQuantity, item/lot,
QuyCach or active state. Other package lengths/formats return `unqualified`, with no
candidate; this conservative outcome does not claim every SQL TRY_CONVERT outcome.
ADD requires an active resolved package; DELETE may resolve an inactive existing
package. Neither lookup occurs here.

| Width | Source type/unit | Separate guardrail |
| --- | --- | --- |
| Raw Barcode argument | varchar(250), encoded bytes before body normalization | At most 250 raw ASCII code units, including CR/LF and edge spaces |
| Normalized stored QRCode | nvarchar(200), UTF-16 code units | At most 200 normalized units |
| ItemID / ItemCode / Lot variables and storage | nvarchar(50) | At most 50 trimmed component units each |
| Raw DocumentID argument | varchar(50), encoded bytes | Optional helper: at most 50 raw ASCII units; nonempty after U+0020 trim |
| Target / Action parameters | nvarchar(100) / nvarchar(50) | No parameter acceptance in parser; fixed server workflow and explicit intent belong to a future owner |
| Stored QRPackageID / lookup key | nvarchar(200) / uniqueidentifier | No storage conversion; canonical GUID identity only |
| Quantity | decimal(38,10) | Ordinary unit 1 only; no package quantity fabrication |

Profile issues describe unsupported/outside-profile input, not proven legacy rejection.
For non-ASCII input a host code-unit count is diagnostic only, not a qualified varchar
byte measurement. The document helper trims U+0020 but does not remove CR/LF and does
not default a document, target or action. SQL argument binding/conversion happens
before procedure normalization; the raw-width guard prevents reliance on truncation.
Effective code page, SQL UPPER/comparison/accent/width/trailing-space behavior and
all noncanonical GUID conversion forms remain UNKNOWN.

## Future source-specific workflow gates

A future separately authorized read path must establish the selected existing parent,
current menu/action/branch/warehouse/lock rights, qualified QR row identity and current
readback. A future writer must own one explicit ADD or DELETE intent with a fixed
IV_OUTPUT or AR_INVOICE target. It must qualify document detail, item/lot balance,
quantity limits (RequiredQuantity + 0.0001), package resolution and document-scoped
package duplication under the real transaction/lock/host policy. No generic SQL
adapter, route or writable UI is provided by I52.

Ordinary repeated ADD scans legitimately insert separate quantity-1 rows. Ordinary
DELETE removes TOP(1) matching document+QRCode without a specified row order; equality
is collation-sensitive. Package duplication/deletion is scoped to target document
and package identity. QR text is not an operation/idempotency key. A future command
owner needs independent original-intent custody and uncertain-acknowledgement
reconciliation; no automatic replay, retry or invented durable receipt is permitted.
The source returns MsgType 0/1 and text; MsgType=0 may precede outer transaction commit.
It is not durable success evidence. Source reads document detail and balance but does
not directly post stock or define serial/location fields; host/trigger effects remain
unqualified. The parser infers none of these business outcomes.

## Printing remains unimplemented

IV_Output_QRCodeFrm's PrintButtonCtl is bound to AR_PurchaseQRCodeReportStp
(config 299319, 302882, 303043, 303888; procedure 835875–835892). It reads
AP_PurchaseDetailTbl and emits ItemID;Lot, conflicting with both warehouse context
and the current three-part grammar. Do not substitute a similarly named report or
guess print behavior. This is a verified static incompatibility in the supplied
contract; there is no print implementation in this slice.

## Running the actual parser tests

From the repository root with Node 24:

```bash
node --test apps/medcom-sites/tests/warehouse-qr.test.mjs
```

Node executes the actual erasable TypeScript directly, without installing dependencies.
Root owns central test-runner registration. Both languages consume the same 60 barcode
and 10 document fixtures in the evidence JSON, encoded as UTF-16 units to preserve
unpaired surrogates exactly. Expectations are synthetic, hand-authored grammar/profile
outcomes, not customer rows or engine results. The tests compare actual parser fields,
normalized spelling, issue order and candidate-only shapes. They cover CR/LF anywhere,
spaces vs tabs/NBSP, delimiters, required fields, width boundaries, Unicode/surrogates,
GUID formats/case/zero/arbitrary bits, and lack of package content/authority/receipts.

With the pinned .NET SDK and restored test dependencies:

```bash
dotnet test tests/backend/Medcom.Api.Tests/Medcom.Api.Tests.csproj --configuration Release --filter FullyQualifiedName~WarehouseQrParserTests
```

Run within the source repository so the C# fixture locator can find the evidence JSON.
No project/runner registration is changed. This handoff observed 73 Node tests PASS;
.NET compile/tests and executed cross-language parity are NOT_RUN (dotnet unavailable).
SQL/runtime/browser/business/production acceptance is NOT_RUN. Shared fixtures are
runnable parity checks, not an executed C# parity claim.
