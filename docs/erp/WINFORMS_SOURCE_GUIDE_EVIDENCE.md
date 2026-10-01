# Supplemental WinForms maintenance-guide evidence

Evidence intake: 2026-10-01. This addendum narrows Phase 1 investigation and the existing implementation issue graph. It does **not** declare Phase 1 complete, authorize a database change, or prove a runnable legacy build.

## 1. Provenance and evidence boundary

| Item | Recorded identity |
|---|---|
| Owner-supplied attachment | `HUONG_DAN_BAO_TRI_ERP_WINFORMS.md` |
| SHA-256 of exact attachment bytes | `f2d2b8dff8ebdf7f67495d22a1c17966f2959222ab4c7703eda2c1d4f61cf179` |
| Length / line count | 115,810 bytes / 1,402 lines |
| Survey snapshot | 2026-09-26 |
| Document split date | 2026-09-30 |
| Received / read for this reconciliation | 2026-10-01 |
| Artifact type | Owner-supplied maintenance summary and historical inventories; **not raw VB source, a project archive, or the Medcom SQL baseline** |

The dates and scope are stated in the attachment preface, line 5, and §9, lines 292–300. References below use the attachment filename, section and one-based line numbers. Source paths attributed to the guide identify future inspection targets; the files themselves were not opened in this intake.

Evidence treatment follows [EVIDENCE_STANDARDS.md](../EVIDENCE_STANDARDS.md):

- **VERIFIED as attachment content:** the recorded bytes/hash, text, cited tables and the extraction of 293 property/key rows from Appendix F.
- **INFERRED as legacy implementation:** source behavior, physical key addressing, defaults, historical source/build membership and historical database observations reported only by this summary. Agreement between two owner summaries alone is not independent corroboration.
- **UNKNOWN as current runtime:** exact deployed source/binary match, current Medcom values/schema, reachability, hook/transaction ordering, precedence, licenses, session behavior and business outcomes until direct evidence is retained.
- Existing independently verified package or SQL records retain their original evidence level. This guide does not lower those records or promote its own source-only claims.

The authoritative hashes in [SOURCE_BASELINE.md](../SOURCE_BASELINE.md) continue to identify `ERP_Medcom2026(4).zip` and `Medcom-Data (3)(1).zip`. This supplemental attachment does not replace either baseline. The raw guide contains private environment identifiers and full historical configuration tables; it is not copied into the public repository. This addendum and the [property index](../../inventories/erp/WINFORMS_PROPERTY_KEY_INDEX.json) retain sanitized technical metadata only.

## 2. Technology and inventory distinctions

Attachment §2, lines 24–39, and Appendix A, lines 298–389, assert:

| Assertion, **INFERRED** until direct source verification | Inspection target / limitation |
|---|---|
| Legacy application is VB.NET, WinExe, .NET Framework 4.6.2, namespace ERP | `Win_Version/ERP_2022/ERP.NET.vbproj`; `ERP.NET_2022.sln` |
| Shared framework project emits assembly Tools | `Win_Version/Tools2022/Tools2022.vbproj` |
| Application / framework Compile Include totals are 389 / 511 | Project-file membership counts; **not** 389 / 511 forms. Displayed names omit Designer, AssemblyInfo and My Project entries. |
| Files in Backup, Copy or outside Compile Include may differ from build inputs | Recompute membership, resolve duplicate classes and references, and identify source commit/build identity. |
| Dependencies include Janus, ActiveReports, Aspose and HintPath libraries | Verify exact versions, target/host, private deployment availability and licensing; the guide did not build or launch the app. |
| Dynamic forms also come from `SY_FrmLstTbl` | Dedicated source-class membership and menu/function inventory are different dimensions. |

The static .NET Framework target independently observed in [TOOL_DLL_METADATA_EVIDENCE.md](TOOL_DLL_METADATA_EVIDENCE.md) is consistent with the guide, but does not prove that this source tree produced that Tools.dll. Calling the entire legacy solution “C#” is inaccurate for the VB project described here. The proposed .NET 10 C# Web backend and the historical “C# verification round” are separate concepts; the verification round must inspect the actual language of each received source file.

Attachment §4.1, lines 127–133, reports dispatch through `ERP_2022/MainFrm.vb:MenuClick`, `GetFormAcc`, then `Tools.App.GetFormByName`, with generic forms resolved by `Tools2022/Modules/App.vb:GetFormFromSQL`. Reported supported types are LIST, LISTEDIT, LISTEDIT2, EDIT, EDITTOP, POS, CALENDAR, TIMELINE and TREE. A historical database containing only four types does not limit all engine capabilities. Conversely, a supported engine type does not prove a reachable current Medcom feature.

## 3. Historical counts must remain separate from Medcom

Attachment §3.1–3.2, lines 43–73, explicitly describes an older database snapshot, whose private host/database identity is omitted here. Its environment was not established as production, staging or a copy. The guide says connection configuration changed after the snapshot and these counts were not rechecked. They are **INFERRED historical observations**, not replacement Medcom counts.

| Kind | Historical guide snapshot | Authoritative Medcom normalized identities |
|---|---:|---:|
| Tables | 403 | 583 |
| Views | 117 | 203 |
| Procedures | 346 SQL procedures | 591 |
| Functions | 100: 13 inline table, 77 table, 10 scalar | 109 |
| Triggers | 75 SQL triggers | 3 distinct identities |
| Foreign keys | 260 | 364 declaration lines; full per-object ownership still requires B2 catalog records |

Medcom figures above are retained from [DECLARATION_COUNT_CORRECTION.md](../db/DECLARATION_COUNT_CORRECTION.md) and [BASELINE_INVENTORY.md](../db/BASELINE_INVENTORY.md), which cite `Medcom-Data.sql`. Counts use different snapshots and, for some kinds, different measurement rules. Declaration totals, distinct identities, live enabled objects and row counts must not be compared as interchangeable quantities.

Additional historical inventory signals retained without publishing production rows:

| Historical assertion | Interpretation and present verification need |
|---|---|
| `SY_Menu`: 353 rows; 148 disabled rows | Subtracting 148 does not prove 205 visible functions; parent disable state and permission matter. |
| `SY_FrmLstTbl`: 173 definitions; 124 LIST, 33 EDIT, 13 LISTEDIT, 3 LISTEDIT2 | Declared form types, not a tested capability count. |
| `SY_FrmCfg`: 3,147 rows; 106 FIDs | FIDs include variants and child/group configuration; not 106 independent screens. |
| `SY_RpFTbl`: 916 rows | Versioned report rows do not imply 916 unique templates. |
| `SY_ApproveSetupTbl`, `SY_ApproveDocumentTbl`, `SY_ApproveCountTbl`: zero rows | Historical emptiness does not prove the current purchase approval pilot is absent or unused. |

Attachment §3.2 attributes configuration consumers to menus, form registry, form layout, dropdowns, expressions, filters, grid/master actions, optional buttons, formatting/languages, numbering, reports, imports, dashboards and permissions. Table existence is a useful architecture anchor; exact field schema, current row values, read/write dependencies and reuse disposition still belong to B2. Preserve literal legacy spellings such as `Oderby`, `MaterAction`, `SY_UserPermisstion` and `SY_UserGroupPermisstion` until authoritative schema resolves them.

## 4. Reported `SY_FrmCfg` addressing contract

All implementation semantics in this section are **INFERRED** from attachment §3.3, lines 77–92, §3.5, lines 115–123, and Appendix F, lines 1044–1402. Schema compatibility with current Medcom remains **UNKNOWN**.

Reported schema: `UserAutoID varchar(50)` primary key, `FID varchar(250)`, `KeyID varchar(50)`, `SubID varchar(50)`, `KeyValue nvarchar(max)`, `SubValue nvarchar(max)`, `VDate datetime`, `PFID varchar(250)`; a non-unique FID index; no default constraint and no tuple uniqueness constraint.

| Consumer branch | Reported logical row selector | Meaning of value/subvalue |
|---|---|---|
| Form-wide `LayoutX` and ordinary wrappers | `FID + KeyID=literal` | Getter takes the first matching KeyID row; missing/empty falls back to the property default. SubID/SubValue do not resolve this branch. |
| `TableInfoX` | `FID + initialized KeyID=table slot + SubID=literal` | KeyValue holds the property; bind the actual slot before interpreting it. |
| `LayoutItemX` placement | `FID + KeyID=LYT{LayoutID} + SubID=field/control` | KeyValue is positional grammar; SubValue is display order. |
| `PropertiesX.vb` extended property consumer | `FID + KeyID=LYS{LayoutID} + SubID=field/control + SubValue=literal` | KeyValue holds the property; SubValue is the **property key**, not display order. Declared class name must be read directly. |
| `CopyDataOnAddNew` | `FID + initialized KeyID=CD + SubID=literal` | Appendix F says LayoutX initializes CD; verify each Init call rather than assuming every instance uses CD. |
| `AutoNumberSetting` | `FID + KeyID=literal + '-' + initialized ID` | ID is reported as 1 or 2. `ADT-1` and `ADT` are different addresses. |
| Child/group configuration | Resolved child FID, `LYTX/LYSX`, parent `PFID` relationship | Read `LayoutItemX.Load/Save`; a guessed prefix/LIKE expression is not a valid identity resolver. |

There are 20 reported table slots: `T0` master; `T1`–`T9` details 1–9; `TA`–`TJ` details 10–19. Earlier review text `T1..T19` describes a conceptual detail range; it does **not** establish physical literal keys `T10`–`T19`. Host registration/binding still decides which slots a particular form uses.

The lack of a tuple uniqueness constraint is a risk, not proof that duplicate tuples exist. Duplicate tuple prevalence, nullable/empty distinctions, collation/case equivalence and ordering are **UNKNOWN**. Preserve physical UserAutoID row identity, inspect all candidates and reject ambiguity for executable configuration. Do not deduplicate by arbitrary first row, silently impose a new unique constraint or convert historical “first row” behavior into deterministic business policy without a verified compatibility decision.

`MainFrm.MenuClick` may produce `FormName_Para`; a form may also rename itself, with `AR_InvoiceFrm_EXPORT` reported as an example. FormName, Para, resolved FID and PFID must be separately recorded. A suffix alone does not prove the same data contract, rights or save behavior.

The guide reports `LayoutX.SaveConfig` deleting **all rows for an FID**, reinserting non-empty configuration and updating PFID. Transaction boundaries and concurrent-writer handling are **UNKNOWN**. A stale full-form save may lose another editor's changes. This is a compatibility investigation target, not an approved maintenance script. Typed Web configuration must use explicit versions, expected-state checks and a bounded conflict-aware publish/rollback contract.

## 5. Reported 21-position `LYT` grammar

Source attribution: attachment §3.4, lines 94–113; `Win_Version/Tools2022/FormLayout/LayoutItemX.vb:SetConfig` (reported source vicinity 217) and `GetConfig`. Each position below is **INFERRED** until those implementations are directly inspected.

| Zero-based index | Reported property | Interpretation that must be verified |
|---:|---|---|
| 0 | ControlType | 1 EditX; 2 ComboX; 3 ComboCheckX; 4 DateX; 5 NumberX; 6 CheckX; 7 ColorPickerX; 20 RadioX; 22 UserControl; 23 GroupBox; 24 ButtonMenuX; 26 ButtonX; 28 LabelCaption; 30 HTMLTextOrScripts. |
| 1 | SizeX | Layout units/enums, not automatically pixels. |
| 2 | SizeY | Layout units/enums, not automatically pixels. |
| 3 | isFirstPos | `1` means enabled. |
| 4 | isReadOnly | `1` means enabled; presentation is not data authorization. |
| 5 | CaptionWidth | Exact unit/default unresolved. |
| 6 | DisplayName2 | Separate from CaptionText. |
| 7 | CaptionText | Reported encoding replaces `;` with `:`. |
| 8 | EditPermiss | Reported enum: 0 AllUser; 2–5 default-dependent; 7 Manager; 9 Admin. |
| 9 | VisiblePermiss | Same reported enum, independently evaluated. |
| 10 | DefaultValue | System tokens; reported `:` decoding to `;`. |
| 11 | ComboWidth2 | Consumer-specific width semantics unresolved. |
| 12 | ToolTipDataCheck | Enum must be read from exact source. |
| 13 | ToolTipDataHint | Boolean representation must be read from exact source. |
| 14 | EnableType / `_LockType` | 0 NotUse; 1 NoneOrNormal; 2 EditOrNew; 3 AddNewOnly; 4 EditOnly; 7 Manager; 9 Admin. |
| 15 | DefaultValueSQL | Reported decoding: double quote to single quote; colon to semicolon. Do not infer a secure parameterization contract. |
| 16 | AnchorType | Reported empty fallback 5. |
| 17 | RequireValue | `1` means enabled; server validation is separate. |
| 18 | isDisableOrHidden | `1` means enabled; hidden is separate from forbidden. |
| 19 | SizeP | Padding-related legacy property. |
| 20 | SizeWebM | Legacy mobile width hint; not the proposed Web JSON schema. |

Historical SQL samples can contain fewer positions than the current reported implementation. The guide reports `On Error Resume Next`, so malformed data can be ignored silently. Future direct-source fixtures must cover short/empty/trailing-empty strings, unknown trailing positions, Unicode, reserved delimiters and malformed values, preserving raw bytes in private evidence and emitting safe diagnostics. No whole-string REPLACE, silent truncation or blind colon substitution is accepted as a Web compiler.

## 6. Complete Appendix F lookup index

[WINFORMS_PROPERTY_KEY_INDEX.json](../../inventories/erp/WINFORMS_PROPERTY_KEY_INDEX.json) extracts all 293 literal property/key pairs from attachment Appendix F. Every record carries a consumer class hint, attributed source path, attachment line, evidence level and a row-address semantic reference. It contains no database row values, SQL hook bodies or defaults.

| Attributed source consumer | Pairs | Attachment lines | Row-address semantic |
|---|---:|---|---|
| `LayoutX.vb` | 24 | 1048–1077 | Form KeyID |
| `LayoutX/AutoNumberSetting.vb` | 12 | 1079–1096 | Form KeyID with `-ID` suffix |
| `LayoutX/CommonDocumentSetting.vb` | 14 | 1098–1117 | Form KeyID |
| `LayoutX/CopyDataOnAddNew.vb` | 34 | 1119–1158 | CD KeyID plus literal SubID |
| `LayoutX/ExecSQLCommand.vb` | 29 | 1160–1194 | Form KeyID |
| `LayoutX/SearchAndSumSetting.vb` | 11 | 1196–1212 | Form KeyID |
| `LayoutX/ToolBarSetting.vb` | 16 | 1214–1235 | Form KeyID |
| `PropertiesX.vb` | 12 | 1237–1254 | LYS KeyID + field/control SubID + literal SubValue |
| `TableInfoX/TableInfoX.vb` | 141 | 1256–1402 | Initialized table KeyID plus literal SubID |
| **Total** | **293** | **Appendix F** | Nine consumers; not every control schema |

The reported class hint is taken from the file stem and must not be confused with a verified namespace or declared class. In particular, attachment §6.2 uses the base type `PropertyX`, while Appendix F names source file `PropertiesX.vb`; exact declarations remain UNKNOWN.

Collision examples explain why the index cannot be treated as a flat dictionary:

- `FW` / `FH`: form width/height in LayoutX versus per-control FixWidth/FixHeight through LYS.
- `ADT`: LayoutX AutoDoc0Type and CommonDocumentSetting AutoDocumentType versus AutoNumberSetting `ADT-1` / `ADT-2`.
- `SUM`, `TN`, `PK`: literal **SubID** in a bound table slot, not universal form KeyID.
- `01`: master-copy setting under CD; it is not a global action identifier.
- `GD2` / `GD4D`: grid column ordering / grid sort properties; neither is automatically the SQL query ORDER BY contract.

## 7. Hooks, ordering and cache implications

Attachment §3.5, lines 117–123, Appendix F lines 1160–1194, and §5.2, lines 183–190, report the following **INFERRED** hook phases. This is an investigation checklist, **not** a proven total order or transaction boundary:

| Reported hook phase | Keys / attributed consumers | Required direct evidence |
|---|---|---|
| Form load / close | ESL / ESC; `ExecSQLCommand.vb` | Caller, identity/scope resolution, cache timing and writes. |
| Before data load / row load | ESLD / ESLR | Query ordering, parameter binding, authorization and linked-row effects. |
| Before add / edit / delete / save | EBN / EBE / EBD / EBS | Which forms call each handler; whether reject/exception prevents all writes. |
| Save-continue / new / copy | EBC / EON / EONC, EONC2, EONC3 | Generated IDs, source links, state transition and partial-copy rollback. |
| Update before final save check | ESDB / ESDP | Whether side effects precede validation; transaction owner and failure cleanup. |
| After save / delayed save | ESS / ESS2 | Commit relation, duplicate delivery, process crash, delayed effects and authoritative reread. |
| OK / Cancel branch and reload switches | ES2 / ES4 / ES6 / ES7 | Distinguish UI result branch from transaction success; preserve exact reload scope. |
| After delete / cancel | ESD / ESCA | Trigger and control callback ordering; no false cancelled/saved state. |
| Table checks / after effects | DBS / DBD / DBE / S10 / S11; `TableInfoX.vb` | Table-slot-specific invocation and composition with form hooks. |
| Edit/new locks | ESLOS / ESLOP / ESLOS2 / ESLOP2 | Lock lifetime, exception/logout cleanup and interaction with SQL locks. |

Earlier secondary review labels `SAV_BFR`, `SAV`, `DEL` and `FML` are not literal aliases proven by this guide. Keep those examples unverified; do not substitute them for EBS/ESS/ESD or invent compatibility mappings. The source-specific call graph must settle every actual key before an executable adapter accepts it.

Placeholder forms such as `{0}`, `{@User}` and `{BranchID}` are reported as processed by `Storer` / `SystemPara`; context, order, escaping and trusted origin remain UNKNOWN. Parameterization must be designed from typed semantics, not a string replacement from braces to `@SqlParameter`. Toolbar hide flags HBA/HBC/HBE/HBD/HBP/HFB/HBO cannot grant or revoke backend rights.

The guide reports cache type Forever1Day, `Cache.Clear(True)` in `LayoutSettingFrm.vb` (reported source lines 235 and 1674), and default `Clear()` preserving Forever1Day. Different clients may retain different configuration snapshots. Verify cache key identity, TTL, scope, inherited defaults, invalidation and version observation for each process/session; an invalidation method name does not establish cross-client freshness. This also belongs to R3 configuration provenance and T1/B4 user isolation.

## 8. Six UserControl defaults omitted from the 293-pair index

Attachment §6.1–6.3, lines 234–265, attributes these **INFERRED** defaults to `Win_Version/Tools2022/FormLayout/PropertyUserControlX.vb`, reported as inheriting `PropertyX`. These six are deliberately separate from the preserved 293 Appendix F pairs.

| Property | Literal key | Reported empty/default behavior | Reported setter encoding |
|---|---|---|---|
| Text1 | TXT | Empty string | Stores string. |
| Text2 | TXT2 | Empty string | Stores string. |
| Confirm1 | BOL1 | Default 0; 1 is True | True stores 1; False stores empty. |
| Confirm2 | BOL2 | Default 1; 1 is True | True stores empty; False stores 0. |
| Number | NUM | Default 0 | Stores numeric value; exact numeric type/culture handling unresolved. |
| Number2 | NUM2 | Default 0 | Stores numeric value; exact numeric type/culture handling unresolved. |

An empty value can therefore mean False for Confirm1 and True for Confirm2. Empty, NULL, absent row and explicit zero require separate source-backed fixtures. A getter default does not prove a persisted current value. `ControlType=22` does not identify the actual UserControl; resolve class, constructor/binding, inheritance, event subscriptions and configured field/control identity. No claim that these six or the 293 pairs exhaust every dynamic control is accepted.

## 9. Five-pilot reconciliation and naming gaps

The five pilots and their candidate bindings remain governed by [PHASE2_PILOT_API_DTO_DEPENDENCY_CONTRACT.md](../architecture/PHASE2_PILOT_API_DTO_DEPENDENCY_CONTRACT.md) and [PHASE1_TRACEABILITY_CLOSURE_AUDIT.md](../../inventories/traceability/PHASE1_TRACEABILITY_CLOSURE_AUDIT.md). Historical guide observations below are supplemental and **INFERRED**.

| Planned pilot / owner | Historical guide observation | Resolution required before coding dependent behavior |
|---|---|---|
| Đề nghị bán hàng / F5 [#32](https://github.com/thanhtuyen662002/Medcom/issues/32) | `AR_InvoiceRequestFrm` historical menu caption **Yêu cầu xuất hóa đơn**, Appendix B line 516; SQL EDIT caption matches, Appendix C line 765; FID and variants listed in D lines 954–957. | Do not equate invoice issuance request with sales request from name alone. Record current Medcom menu path/caption/Para, target resolved FID, data fields, exact actions and owner-approved business meaning. Historical enabled row alone does not prove current visibility or reachability. |
| Điều chuyển nội bộ / F6 [#33](https://github.com/thanhtuyen662002/Medcom/issues/33) | `IV_StockTranferFrm` menu caption **Chuyển kho - ký gởi**, B line 558; source variants in A line 331; one FID row in D line 1034. | Candidate only; identify transfer versus consignment mode, source/destination scope, posting/state/stock effects and exact table/action binding. Preserve spelling `Tranfer`. A one-row config inventory is not a full behavior contract. |
| Duyệt đề nghị mua hàng / F7 [#34](https://github.com/thanhtuyen662002/Medcom/issues/34) | No exact `AP_ApprovePurchaseRequestListFrm` entry in historical B/C/D; historical approval-table emptiness in §3.2 line 70. | Do not conclude absence. Current packaged filter references in `PHASE1_FILTER_CLOSURE_DELTA.md` remain candidates. Verify transition/state/procedure signatures, approver scope, locks, reject/return behavior and retries from current source/SQL. |
| Đơn mua hàng / F8 [#35](https://github.com/thanhtuyen662002/Medcom/issues/35) | `AP_OrderFrm` menu row is historically **disabled**, B line 467; generic EDIT definition C line 758; FID config D line 937. | A disabled historical menu or absence of a same-named dedicated source class does not prove current feature absence. Verify generic versus business-class resolution, current menu/permission state, master/detail binding and every mutation. F4 remains the separate bounded read surface. |
| Đề nghị nhập hàng / F9 [#42](https://github.com/thanhtuyen662002/Medcom/issues/42) | No exact `IV_InboundRequestFrm` entry in historical B/C/D. A different `AP_InputRequestFrm` historical caption is **Phiếu đề nghị nhập hàng**, B line 468. | Do not alias the AP form to the IV pilot by caption. Preserve current Medcom `IV_InboundRequestTbl` / `IV_InboundRequestDetailsTbl` and packaged filter candidates. Enumerate actual request actions; no inferred receipt, stock posting, approval or deletion. |

Historical lists cover a different snapshot. Missing names are negative **text-list searches**, not proof of missing application capability. Existing Medcom SQL/package evidence takes priority for Medcom objects, while actual Web behavior still requires verified menu/action/scope contracts.

## 10. `AR_InvoiceFrm` is a separate parity warning

Attachment §4.3, lines 156–164, attributes deeper behavior to `Win_Version/ERP_2022/AccountReceivable/AR_InvoiceFrm.vb` (reported source vicinity 1037–1124 and Data_Action 1657–1808). These **INFERRED** details are not automatically requirements for a distinct sales-request pilot:

- Master `AR_InvoiceTbl` keyed by DocumentID; detail `AR_InvoiceDetailTbl` keyed by UserAutoID; joins to `CF_ObjectTbl` and `CF_ItemTbl`.
- Additional binding to `AR_VATInvoiceTbl` by InvoiceID, read-only `AR_InvoiceAcc2View` and conditional detail slots 5/6/7. A reported one-detail `AR_INVOICE` JSON example cannot establish parity.
- Checks for document/invoice date, money/tax/fees/discount totals, duplicate invoice, stock, account/cost center, overdue debt/credit limit, lot/expiry; document owner, isLock, period, permissions and issued e-invoice lock effects.
- Reported historical trigger names include `AR_InvoiceTbl_UpdateStockTrans`, `AR_InvoiceDetailTbl_UpdateStockTrans`, `AR_Invoice_UpdateEntryTrans`, `AR_InvoiceDetailTbl_UpdateEntryTrans` and `AR_InvoiceTbl_UpdateRefDoc`. Historical name/enabled-state inspection does not reveal full trigger logic, and does not establish that these triggers exist in the Medcom baseline with its three distinct trigger identities.
- Reported procedures `AR_InvoiceBeforeSaveStp` and `AR_InvoiceAfterSaveStp` require exact current signatures/body/dependencies. Demo names such as `sp_AR_Invoice_Save` are not accepted baseline contracts merely because a cookbook uses them.

B2 must resolve current AR invoice read/write objects and all trigger/hook dependencies; T1/B4 must resolve controller and permission behavior; command implementation remains gated on B3/B5. Opening this risk does not expand the five pilots into invoice implementation.

## 11. Concrete verification work mapped to existing issues

These are evidence deliverables owned by existing nodes, not new competing workstreams or automatic permission to write a live database. Retain sanitized paths/object IDs/hashes; keep source binaries, production rows, hook bodies with sensitive values and connection material private.

| Owner node | Verification tasks | Required durable acceptance |
|---|---|---|
| B2 [#21](https://github.com/thanhtuyen662002/Medcom/issues/21) | Re-extract current Medcom per-object columns/PK/FK/index/constraint catalog; compare `SY_FrmCfg` physical addressing/nullable/collation; count duplicate candidate tuples without publishing row values; map views/procs/functions/triggers and dynamic-SQL UNKNOWN edges; classify read/write/reuse for every pilot and invoice dependency. | Complete sanitized object records and explicit unresolved-edge register; historical counts remain separate. Guide text alone never closes TRC-DB-001. |
| T1 [#19](https://github.com/thanhtuyen662002/Medcom/issues/19) | Obtain identified private source/build inputs; recompute Compile Include; inspect `LayoutX`, `LayoutItemX`, `PropertiesX/PropertyX`, `TableInfoX`, `FormControler`, `Storer`, `Connector`, `Cache`; correlate source commit and assembly hash; perform isolated non-production host/runtime checks after inspecting automatic DDL paths. | Source-backed getter/setter/caller evidence, framework/dependency/host decision, safe session lifecycle/isolation and build/runtime limits. Do not launch ERP merely to inspect defaults. |
| B4 [#23](https://github.com/thanhtuyen662002/Medcom/issues/23) | Resolve menu+Para/form/role/company/branch/storehouse precedence, ancestor disabled state, admin/manager bypass and HideAmount/export; inspect cache keys/revocation; test same-company users, direct route/API/command and hidden-button bypass. | Effective permission/scope contract derived on server with allowed/denied/revoked and cross-scope outcomes. UI hide/read-only flags do not constitute enforcement. |
| R3 [#26](https://github.com/thanhtuyen662002/Medcom/issues/26) | Identify configuration source machine/build/DB/version and DAT/SQL precedence; verify all LYT/LYS/LYTX/LYSX consumers; cover short/empty/extended/malformed delimiter fixtures and 20 slot keys; verify full-FID SaveConfig and cross-client cache invalidation; distinguish executable versus presentation fields. | Versioned source identity and parser/precedence contract; ambiguous executable records rejected; no lossy grammar conversion. Source-proved fixtures become implementation gates. |
| F5 [#32](https://github.com/thanhtuyen662002/Medcom/issues/32) | Resolve current “Đề nghị bán hàng” versus historical “Yêu cầu xuất hóa đơn”; map exact menu/FID/Para, master/detail, input/derived/read-only fields, actions/states, hooks, permissions, export and command reread. | Pilot-specific trace row and action acceptance with B2/T1/B4/B3/B5 gates satisfied. |
| F6 [#33](https://github.com/thanhtuyen662002/Medcom/issues/33) | Resolve internal-transfer form/variant rather than assuming IV_StockTranferFrm; trace two warehouses/branches, stock/lot posting, submit/cancel states, transaction and dual-session conflicts. | Exact binding and invariant-preserving allowed/denied/concurrent outcomes; no double posting or guessed transfer command. |
| F7 [#34](https://github.com/thanhtuyen662002/Medcom/issues/34) | Correlate current approval filter and query to source transition; inspect approve/reject/return, approver/level/ownership, locks, target procedures, delegation, repeat/late execution and ambiguous ACK. | Verified transition graph and allowed/denied/idempotency/reconciliation outcomes; historical zero rows do not satisfy this gate. |
| F8 [#35](https://github.com/thanhtuyen662002/Medcom/issues/35) | Resolve current AP_OrderFrm generic/business dispatch and enablement; verify table-slot bindings, required/derived values, save/submit/cancel, numbering, hooks/trigger composition, rollback and reread. | Source/SQL-backed mutation contract distinct from F4 read acceptance; disabled old menu neither grants nor denies current scope. |
| F9 [#42](https://github.com/thanhtuyen662002/Medcom/issues/42) | Resolve actual IV_InboundRequestFrm menu/config; enumerate enabled actions and fields before implementing; verify rights, state/hook/transaction, request links, duplicates/lost ACK, idempotency and authoritative reread. | Bounded request mutation acceptance; stock receipt/posting remains a distinct verified capability if later requested. |

## 12. Documentation ownership and remaining gates

This addendum owns supplemental guide provenance and the lookup index. [SOURCE_BASELINE.md](../SOURCE_BASELINE.md) owns baseline identity; DB catalog artifacts own Medcom schema; existing ERP package artifacts own packaged presence; traceability owns ERP ↔ Web ↔ DB bindings; the architecture contracts own accepted Web boundaries; the issue graph owns dependencies/status. Updates should link to this addendum rather than copy competing grammar tables into each plan.

The earlier C# review summaries remain historical secondary evidence. Their conceptual T1..T19 and hook examples must be read with the literal-key cautions above. Neither the newer guide nor an older cookbook may overwrite a directly observed baseline fact. Conflicts require a recorded source/build/snapshot discriminator and an UNKNOWN until resolved.

The guide adds useful leads on layout positions, 20 table slots, key addressing, defaults, hook families, destructive configuration persistence, caches and pilot naming. It does not provide the missing exhaustive Medcom catalog, full dependency/reuse disposition or complete capability traceability. Phase 1 remains subject to the seven gates in AGENTS.md and [PHASE1_CLOSURE_AUDIT_20261001.md](../reviews/PHASE1_CLOSURE_AUDIT_20261001.md). No closure or implementation-readiness status is promoted by this document alone.
