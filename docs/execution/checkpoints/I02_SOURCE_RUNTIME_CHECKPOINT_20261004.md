# Goal #45 / I02: direct source verification and runtime boundary

Date: 2026-10-04. Draft lease: PR #53. Scope control commit:
`4496656ff848200c2652b824cbb9b7f07268ac33` at immutable
`medcom-scope/g45/direct/I02/source-fixture-encoding`.

## Directly read source evidence

The worker read each complete owner Downloads file and compared its SHA256 with
`inventories/source/20261002/source-set.json`, not merely with a predecessor report:

- `ERP_Medcom2026.zip`: `d5fe49f8e58de89fc0b9972a116a6c8f673ab9f9b326c626708d0b5d01fc5783`.
- `MedData-Data.zip`: `6a74eb02dc747e9c6ab679f69ca515783a8724ad767f6702fcebd28f195b1144`.
- `Tools.dll`: `aa8910f3ba244fc405ccad2d322d142d40f938be3da94277ccd8d0814082dd61`.
- SQL ZIP member `MedData-Data.sql`: all 1,212,595,716 bytes read; SHA256
  `61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`, CRC `16a9a7e6`.

This is the existing `owner-attachment-20261002` technical round; the historical
approved Library archives remain separate baseline evidence. Current private Library access
to `ERP_Medcom2026(4).zip` and `Medcom-Data (3)(1).zip` remains UNKNOWN for this worker.
Hash verification does not prove complete ERP interpretation, SQL effects or production operation.

## Verified repair

Actual full-source extraction failed on Windows with `UnicodeEncodeError` in the output
`write_text` call. Default cp1252 could not represent the Vietnamese procedure definitions.
Explicit UTF-8 now applies to the schema output and private settings read/write; the exact
production size/SHA gate and private-only output guard remain intact.

- 11/11 source tests PASS, including Vietnamese DDL roundtrip under simulated cp1252 defaults
  and rejection of changed source before output.
- 61/61 Python guards PASS; `git diff --check` PASS.
- Full-source extraction rerun PASS: three selected source tables and eight original check
  procedures prepared outside the public checkout. Local artifact: private runtime workspace
  `transfer-check-schema.sql`, with `transfer-prepare-utf8.log` terminal success.
- Existing base preparation produced ten source table DDLs and a synthetic-only Tools.dll
  credential fixture in the same private workspace. No real transaction rows were restored.
- No source archive, DLL, raw SQL, extracted procedure body, credential or private path was
  staged or published. Only this sanitized receipt and code/tests are durable public artifacts.

## Runtime is not accepted

A read-only loopback SQL probe using Windows integrated authentication, database `master`,
encrypted transport and sandbox-only certificate trust failed before a query result with
`SqlException.Number=0`. Listener presence is not authenticated connectivity. No database
was created, no domain write ran, and no schema or access permissions were changed.
SQL integration/LegacyRuntime tests therefore have no new acceptance result.

Required: an authorized disposable SQL endpoint with working authentication/transport, then
actual fixture execution, command effects/transaction/trigger evidence and API/UI roundtrip.
Production host/SQL identity, HTTPS/secret provisioning and business signoff remain UNKNOWN.
Main ruleset was read live: one approving review, latest push approval, stale review dismissal
and resolved conversations required. Agent review and CI green do not replace native approval.

The entire ERP goal stays open. Code prepared / main integrated / staging verified / production
accepted are separate states; production remains 0 accepted capabilities over an UNKNOWN total.
No automation creation or enablement occurred; historical schedule-enabling directions in the
goal document were superseded by the current owner OFF instruction.
