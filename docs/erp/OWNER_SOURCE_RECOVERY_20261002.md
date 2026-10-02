# Owner attachment verification — 2026-10-02

The current findings below use the full size/CRC/hash-verified SQL archive member. Earlier conclusions based on a truncated extraction are superseded. This is a new technical verification round authorized by the owner's handover and full-stack continuation request. It preserves the historical Phase 1 archives; it does not establish equivalence to them. Exact byte hashes, sizes and archive identity are in `inventories/source/20261002/source-set.json`.

## Direct evidence

- `ERP_Medcom2026.zip`: 162,176,322 bytes; 1,425 archive members. Root `ERP_Medcom2026/Tools.dll` is byte-identical to the standalone `Tools.dll` (8,258,049 bytes, SHA-256 `aa8910f3ba244fc405ccad2d322d142d40f938be3da94277ccd8d0814082dd61`). The requested DLL exists; no archive password bypass was needed.
- `MedData-Data.zip`: 134,249,929 bytes; contains UTF-16LE `MedData-Data.sql`, 1,212,595,716 bytes. Stream analysis exports metadata only, never transaction rows, user hashes, tokens or SQL bodies.
- Finite catalog: **596 tables, 211 views, 109 functions, 609 procedures, 2 sequences**. All 1,527 declarations reconcile with their SSMS headers; no duplicate objects or missing header members. Column/type/nullability/identity metadata and syntactic reference candidates are split into checksum-verified members under `inventories/source/20261002/`.
- The full member contains 609 executable procedure declarations, including all seven internal-transfer check procedures previously reported missing. A separate scan catalogs 188 stored module declarations (160 distinct module names), including six trigger records for three trigger names. Trigger bodies occur in INSERT data fields such as PreviousDefinition/DeployedDefinition/Definition; the outer executable DDL catalog contains no CREATE TRIGGER declarations. Those definitions are available for analysis; their version roles are preserved rather than conflated with live deployment.
- Index/constraint/dependency resolution, dynamic SQL and exhaustive ERP-to-Web traceability remain separate open work. This catalog does not silently close TRC-DB-001 for the historical baseline.

## Password boundary

Static IL identifies `Tools.Utils.Functions.VerifyUserPass` delegating to the instance `Tools.MD5.VerifyUserPass`. That method includes a system-password exception before the normal stored-password check. Its recipe and special identities are intentionally not exported. The Web worker **never calls either system-password verification entry point**.

The pinned normal path uses the DLL's own string decoder and `Tools.MD5.Verify`, preserving the composition observed in `EncryptUserPass`; no guessed hash algorithm or alternative password is introduced. Each check runs in a fresh .NET 10 process, with a byte-hash gate, bounded input/output, timeout/process-tree termination and no secrets in argv or diagnostics. No `Connector`, database initialization, UI, licensing workflow or ERP startup is executed by this password subset. Compatibility was observed on Linux/.NET 10 with synthetic credentials; this is not proof that the full legacy engine is portable or Windows-certified.

Actual owner DLL tests accept its generated synthetic stored hash, deny a wrong password, deny a different username, deny malformed hashes and reject a changed DLL. The health vector is explicitly synthetic and never a database account or Web identity.

## Identity and read-only bindings

`dbo.SY_User` and `dbo.SY_UserGroup` column definitions directly support parameterized canonical-username/password/disable/group reads. Missing, disabled or ambiguous matches deny login. Password/group changes retire a session. Company/tenant are trusted server deployment bindings, never login JSON.

Decoded `Tools.Utils.Functions.GetPermission` SQL shows a union of group, explicit user and delegated-group grants; explicit action bits imply view. Legacy missing/query-error fallbacks can grant broad rights. The Web adapter requires explicit enabled menu/grant matches and rejects missing/error/disabled cases. There is no administrator-name, machine-name, missing-permission or `isNotCheckPermission` shortcut.

`pilot-menu-bindings.json` records only technical SY_Menu fields and source lines. AP order `050129`/`AP_OrderFrm` and inbound request `07011`/`IV_InboundRequestFrm` are enabled, with no variant parameter. Sales request `06023`/`AR_InvoiceRequestFrm` is disabled in this new source. The eight internal-transfer stages are distinct; they are not the old stock transfer operation.

The implemented pilot list queries select only document ID/date/branch/status/lock fields from `AP_OrderTbl` and `IV_InboundRequestTbl`. No amount, customer/patient field, generic CRUD, approval, stock effect, export or report endpoint is enabled. Scope is the intersection of the frozen server session, current user/default and explicit SY_UserBranch assignments; the SQL query also checks current account/group/credential/menu/grants/scope at execution. These are conservative Web scope rules, not proof of all legacy administrator/branch precedence.

## Observed runtime and remaining release gate

A checksum-verified SQL Server 2025 Developer engine (17.0.4065.4) ran locally against an automatically created/dropped disposable database containing eight source-derived table DDLs and synthetic rows only. The raw data dump was never restored. Actual DLL + SQL integration verifies canonical login, wrong password, credential/group/permission revocation, SQL-injection rejection, scoped pagination and literal wildcard search.

A real HTTPS browser flow uses this adapter and database: login, purchase-order navigation/Grid/search, crafted other-branch request (403), logout and retired-session API request (401). Screenshots contain synthetic rows only. This is representative adapter evidence, not complete ERP or server acceptance.

The pilot configuration scan records 1,243 technical configuration keys and five action metadata records without SQL bodies or literal values. The seven EBE/EBD internal-transfer check candidates are now matched to actual executable definitions at lines 857523, 857605, 857815, 858045, 858372, 858387 and 858458. The complete catalog includes 28 internal-transfer procedures. `recovered-transfer-checks.json` records the seven checks plus the delegated status-check helper, typed signatures and source rules. The missing-definition blocker is resolved; no replacement schema export is needed to obtain these definitions from this archive.

Full mutation/approval/transfer/posting/report/export semantics, full legacy worker context, durable security audit, deployment-host validation, operational recovery/performance and independent review remain open. The package remains `BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE`; readiness remains 503 until release acceptance is established.

## Detail read continuation

`detail-read-bindings.json` records source table/column metadata and exact SY_FrmCfg lines. AP_OrderFrm T0/T1 TN binds AP_OrderTbl/AP_OrderDetailTbl (296417/296419); T0/T1 PK is DocumentID/UserAutoID (296416/296418). IV_InboundRequestFrm binds IV_InboundRequestTbl/IV_InboundRequestDetailsTbl (299803/299805), with the same key names (299802/299804). Both detail tables contain DocumentID; the conservative Web query joins it to the primary-key parent in one statement. This does not claim the full ERP load-hook pipeline or resolved foreign-key traceability.

AP T1/ACP identifies UnitPrice/SourceAmount/Amount at 297074; these stay absent. Inbound T1/HDE hides technical/source fields at 299817 and T1/LCK lists locked fields at 300566; the Web surface exposes no edit controls. Selected source quantities preserve their exact decimal scale as JSON strings. Quantity2 retains a technical label because unit/conversion equivalence is unresolved. Inbound set/barrel quantities distinguish by-document from actual columns. No item/customer lookup, money, lot, note, report or mutation is added.

The detail endpoint rechecks current identity/grants and frozen/current branches, and checks the parent, credential, enabled menu and branch in its final line-read statement. Hidden/missing parents share a 404; child/orphan existence does not make a parent visible. A visible parent with no lines returns an empty page. Lines sort by UserAutoID with bounded pages and a hasMore sentinel. Credential comparison in the final list/detail statement uses a binary collation.

## Extraction correction and verified check execution

The earlier local SQL extraction was 1,015,021,568 bytes (hash 93184a552b674a1cedd88c73b1f3b661465c6b4302134f65b78c75fe29350c3a), shorter than the ZIP member. It ended before the procedure section. The current member is 1,212,595,716 bytes, CRC32 16a9a7e6, SHA-256 61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096. `extraction-integrity.json` records the correction; the old zero-procedure/absence claim is withdrawn. The 918-object catalog only described that incomplete extraction. The current manifest has 1,527 declarations and 33 checksum members. The 596 table/211 view/109 function/two sequence identities remain unchanged; the complete tail adds 609 procedures.

`verify_source_archive.py` checks the pinned archive hash, exact member name/size, complete decompression and CRC before atomically replacing a private SQL file. Catalog/CI checks tie the source size/hash to the manifest. Tests cover corrupt/short members and preservation of an existing file on failure. Stored-definition extraction preserves versions and rejects fake declarations inside comments/nested SQL literals without exporting bodies or unrelated row values.

Three private runtime tests now pass. The new test creates three actual transfer tables and eight actual check procedures in a separate disposable SQL database, then inserts synthetic rows. It verifies owner/PM/technician assignments, allowed/denied statuses, missing IDs, linked-request deletion denial, the source's null-PM behavior and the role wrapper's status-list delegation. Source procedures may allow an unassigned PM or take a status list from their caller; Web menu/action/branch authorization and trusted role configuration remain mandatory. No Web mutation endpoint is enabled by this test. The request key is nvarchar(50), but check @DocumentID is varchar(30); typed command work must prevent truncation/encoding loss.
