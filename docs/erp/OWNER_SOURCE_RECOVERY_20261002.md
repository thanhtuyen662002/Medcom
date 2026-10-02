# Owner attachment verification — 2026-10-02

This is a new technical verification round authorized by the owner's handover and full-stack continuation request. It preserves the historical Phase 1 archives; it does not establish equivalence to them. Exact byte hashes, sizes and archive identity are in `inventories/source/20261002/source-set.json`.

## Direct evidence

- `ERP_Medcom2026.zip`: 162,176,322 bytes; 1,425 archive members. Root `ERP_Medcom2026/Tools.dll` is byte-identical to the standalone `Tools.dll` (8,258,049 bytes, SHA-256 `aa8910f3ba244fc405ccad2d322d142d40f938be3da94277ccd8d0814082dd61`). The requested DLL exists; no archive password bypass was needed.
- `MedData-Data.zip`: 134,249,929 bytes; contains UTF-16LE `MedData-Data.sql`, 1,212,595,716 bytes. Stream analysis exports metadata only, never transaction rows, user hashes, tokens or SQL bodies.
- Finite catalog: **596 tables, 211 views, 109 functions, 2 sequences**. All 918 declarations reconcile with their SSMS headers; no duplicate objects or missing header members. Column/type/nullability/identity metadata and syntactic reference candidates are split into checksum-verified members under `inventories/source/20261002/`.
- **No executable CREATE PROCEDURE or CREATE TRIGGER declarations are present in this dump.** Apparent declarations inside multiline INSERT literals belong to backup data. The scanner tracks quote/comment state across lines and GO boundaries; its regression tests prove backup rows cannot invent schema or leak literals. This says what the dump contains, not what exists on a live ERP server.
- Index/constraint/dependency resolution, dynamic SQL and exhaustive ERP-to-Web traceability remain separate open work. This catalog does not silently close TRC-DB-001 for the historical baseline.

## Password boundary

Static IL identifies `Tools.Utils.Functions.VerifyUserPass` delegating to the instance `Tools.MD5.VerifyUserPass`. That method includes a system-password exception before the normal stored-password check. Its recipe and special identities are intentionally not exported. The Web worker **never calls either system-password verification entry point**.

The pinned normal path uses the DLL's own string decoder and `Tools.MD5.Verify`, preserving the composition observed in `EncryptUserPass`; no guessed hash algorithm or alternative password is introduced. Each check runs in a fresh .NET 10 process, with a byte-hash gate, bounded input/output, timeout/process-tree termination and no secrets in argv or diagnostics. No `Connector`, database initialization, UI, licensing workflow or ERP startup is executed by this password subset. Compatibility was observed on Linux/.NET 10 with synthetic credentials; this is not proof that the full legacy engine is portable or Windows-certified.

Actual owner DLL tests accept its generated synthetic stored hash, deny a wrong password, deny a different username, deny malformed hashes and reject a changed DLL. The health vector is explicitly synthetic and never a database account or Web identity.

## Identity and read-only bindings

`dbo.SY_User` and `dbo.SY_UserGroup` column definitions directly support parameterized canonical-username/password/disable/group reads. Missing, disabled or ambiguous matches deny login. Password/group changes retire a session. Company/tenant are trusted server deployment bindings, never login JSON.

Decoded `Tools.Utils.Functions.GetPermission` SQL shows a union of group, explicit user and delegated-group grants; explicit action bits imply view. Legacy missing/query-error fallbacks can grant broad rights. The Web adapter requires explicit enabled menu/grant matches and rejects missing/error/disabled cases. There is no administrator-name, machine-name, missing-permission or `isNotCheckPermission` shortcut.

`pilot-menu-bindings.json` records only technical SY_Menu fields and source lines. AP order `050129`/`AP_OrderFrm` and inbound request `07011`/`IV_InboundRequestFrm` are enabled, with no variant parameter. Sales request `06023`/`AR_InvoiceRequestFrm` is disabled in this new source. The eight internal-transfer stages are distinct; they are not the old stock transfer operation.

The implemented pilot queries list only document ID/date/branch/status/lock fields from `AP_OrderTbl` and `IV_InboundRequestTbl`. No amount, customer/patient field, generic CRUD, approval, stock effect, export or report endpoint is enabled. Scope is the intersection of the frozen server session, current user/default and explicit SY_UserBranch assignments; the SQL query also checks current account/group/credential/menu/grants/scope at execution. These are conservative Web scope rules, not proof of all legacy administrator/branch precedence.

## Observed runtime and remaining release gate

A checksum-verified SQL Server 2025 Developer engine (17.0.4065.4) ran locally against an automatically created/dropped disposable database containing eight source-derived table DDLs and synthetic rows only. The raw data dump was never restored. Actual DLL + SQL integration verifies canonical login, wrong password, credential/group/permission revocation, SQL-injection rejection, scoped pagination and literal wildcard search.

A real HTTPS browser flow uses this adapter and database: login, purchase-order navigation/Grid/search, crafted other-branch request (403), logout and retired-session API request (401). Screenshots contain synthetic rows only. This is representative adapter evidence, not complete ERP or server acceptance.

The pilot configuration scan records 1,243 technical configuration keys and five action metadata records without SQL bodies or literal values. Seven explicit procedure candidates in EBE/EBD hooks have no executable definition in the dump: `IV_InternalTransfer_BatchTechCheckEditStp`, `IV_InternalTransfer_BatchRoleCheckEditStp`, `IV_InternalTransfer_RequestPMCheckEditStp`, `IV_InternalTransfer_BatchPMCheckEditStp`, `IV_InternalTransfer_BatchCheckDeleteStp`, `IV_InternalTransfer_RequestCheckDeleteStp`, `IV_InternalTransfer_RequestCheckEditStp` (dbo). Exact source lines are in `pilot-action-metadata.json`. Their current definitions and effects require a schema-only procedure/trigger export or an authorized representative staging DB; backup copies do not establish current truth.

Full mutation/approval/transfer/posting/report/export semantics, full legacy worker context, durable security audit, deployment-host validation, operational recovery/performance and independent review remain open. A missing procedure export cannot be replaced with backup-row SQL without verifying current definitions. The package remains `BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE`; readiness remains 503 until release acceptance is established.
