# I85 — VPS inbound screen 503, 2026-10-12

Scope: source-backed BE repair for issue [#152](https://github.com/thanhtuyen662002/Medcom/issues/152). FE source, private IIS bindings, SQL schema and production records are unchanged. Goal #45 and VPS runtime acceptance remain open.

## Evidence and cause

The owner's Antigravity log attachment reports `MedcomApi` IIS responses of 503 for `/api/erp/inbound-requests` and `/api/erp/inbound-requests/actions`, forwarded as 503 by the public FE proxy. `/api/documents/inbound-requests` returned 200. Attachment identity: `Pasted text.txt`, SHA-256 `f7a128db50cb77224d3cddb7dfcdc71cd5709b7ec2fc1af45564d9b0af2b7c39`; kept in the owner's private attachment store. The attachment's error body was reconstructed, not captured; its proposed error codes are **UNKNOWN**. Data Protection/WebRootPath warnings do not establish the failing read stage.

Independent SELECT-only MedData verification using the production reader's `SchemaMatches`, `VerifyModuleHashes`, `VerifyWorkflowMetadata` and `VerifyScreenConfiguration` reproduced failure at the screen configuration check. Physical schema, module hashes and workflow metadata passed. Exactly one of 184 `dbo.SY_FrmCfg` rows differed: `FID=IV_InboundRequestFrm`, `KeyID=LYS1`, `SubID=ExecSQLWithParaButtonCtl_1`, `SubValue=CS4`.

Private old/current source comparison showed that the “Gửi kho” check still requires status 0 or 1 and non-null lot number, set quantity and expiration date, but no longer requires non-null barrel quantity. Other changes are formatting. Source objects are `dbo.IV_InboundRequestTbl` and `dbo.IV_InboundRequestDetailsTbl`. Exact old/current identities and verification counts are recorded in [the sanitized amendment](../../../inventories/source/20261012/inbound-screen-configuration.json). Private SQL, connection settings and business rows are excluded.

`SqlErpScreenReader.Run` uses this check for screen reads, including list and actions. Its old broad catch converted the changed-config rejection into a generic 503. The successful document reader follows a separate verification path. This establishes a source/configuration mismatch in BE, with a reproduced failure against current MedData; exact post-deployment HTTP behavior still needs VPS acceptance.

The approved Library archives retain the identities in [SOURCE_BASELINE.md](../../SOURCE_BASELINE.md). This is an amendment from the separately authorized owner live-data round, not a claim of archive equivalence. [WINFORMS_SOURCE_GUIDE_EVIDENCE.md](../../erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md) remains supplementary historical evidence.

## Repair and validation

- Update only the reviewed configuration fingerprint/length and corresponding button-check fingerprint in `cud-workflow-catalog.json`. All 184 rows remain verified; arbitrary future drift is still rejected.
- Align the ERP workflow action and the existing inbound draft command's information check with the current optional barrel quantity. Status, native permissions, branch scope, transaction, state-token, journal and log rules remain in place.
- Add BE warning event `1003 / ErpReadUnavailable`: finite stage/exception kind, canonical module, provider error number, elapsed time and correlation ID. No exception object/text, SQL, credentials, user/document/branch identity or business data is logged. Diagnostic sink failures cannot change the API outcome. HTTP contracts are unchanged.

Targeted regression run: 69 passed. It covers acceptance of the current fingerprint, rejection of old/unknown/missing/extra/duplicate/null-changed configuration, bound document parameters, incomplete-information rejection, optional barrel quantity and redacted failure telemetry. Tests are `InboundScreenConfigurationTests.cs` and `InboundDraftCommandTests.cs`.

After rebuilding the production assemblies, the same private SELECT-only MedData probe passed schema, module hashes, workflow metadata and screen configuration; expected/actual rows 184/184, differences 0. The transaction was rolled back. No production CUD was attempted. Complete-suite and exact head/base CI receipts belong on the linked PR before merge.

## VPS handoff

Deploy the merged BE revision through Antigravity. The owner's attachment reports VPS ProductVersion `1.0.0+ed091d81b336b57366309192ba8219366745d355`, including local changes for internal-host configuration on top of main; binary identity is owner-reported, not independently inspected. Preserve the reviewed `api.medcom.internal:83` binding, private runtime settings, Tools.dll and local HTTPS/host configuration when replacing the BE binary. Do not deploy FE or overwrite private settings from repository defaults.

With an existing valid ERP session, verify direct internal BE and public proxy GETs for both affected routes, the native document route, branches and notifications. Record deployed source identity, actual status, aggregate duration, correlation ID and only a redacted error body if unsuccessful. Do not print cookies, credentials or business rows. No real workflow action is required for this acceptance. Keep #152 open until authenticated post-deployment checks succeed.
