# I34 — bounded read-only target inspector

Admitted by immutable root control `8404a1d46094545c41f352b0d8f3476598325e28`
(tree `78b81308b158eed783dd8d67bca1015496b53120`), PR #86. Exact 17-path scope
is preserved in `docs/execution/direct-runs/I34.json`.

## Baseline and unchanged inputs

Root verified remote main `04a4730d3ede03dfa4147fc89c9e557ef2735eb0`, tree
`7abc42c542b2df509b9da2a203072c330c7ac335`. The local preparation checkout was
materialized from that exact tree. Local synthetic baseline commit
`f7318dc8b6aee09dfcdf8ebca118dab15e4a1c07` is NOT the remote main commit.
I33 remains a separate unmerged change and is not silently included in this baseline.

The executable compile-links only these unchanged current policy inputs:
- `src/backend/Medcom.Api/ServerConfiguration.cs`: SHA-256 `bb771b364a86f983b36c36de4ffe279650b3cb1ecbcf1822e4ef61794531076d`
- `src/backend/Medcom.Infrastructure/SqlDevelopmentTestTlsTarget.cs`: SHA-256 `55294533890d9b3545f207ca5b3dde546efdb1836cf0ac97172f02b990538540`

No production source, solution, application/writer registration, authentication,
RuntimeAcceptance, runtimeQualified, schema, private configuration or Tools.dll is changed.

## Evidence and reuse

- `src/backend/Medcom.Infrastructure/PurchaseRequests/PurchaseRequestSql.cs` supplies
  the 35 purchase column expectations and required keys/FK. Its original locked query
  is NOT executed wholesale.
- `inventories/source/20261002/table-01.json`, `table-02.json`, `table-14.json` supply
  the 109 native inbound column definitions. The inspector's key expectations express
  command-addressing prerequisites; they do not assert independently verified archive
  PK equivalence. Raw approved ERP/DB archives were not reopened in this preparation.
- `schemas/backend/inbound-request-command-journal-v1.sql` supplies all 17 journal
  columns, ordered five-part PK, BIN2 requirements, CreatedAtUtc default and predicates.
  The existing TOP(0) probe omits CreatedAtUtc and is not accepted as sufficient evidence.
- `schemas/backend/purchase-request-command-journal-v1.sql` supplies expected control
  predicates. Conservative comparison never upgrades a name/trust flag to semantic proof.
- Existing owner-preflight purchase catalog/visibility/binding assets informed the fixed
  runner. The old SqlClient10 probe's stale policy verdict is replaced by compile-linking
  current server policy. No old private inputs or live target outputs were read.

## Outcomes and honest limits

Implemented one executable, fixed read-only plans, owner-local optional binding input,
allowlisted PASS/FAIL/BLOCKED/NOT_RUN reporting with fixed next-step guidance, cleanup/cancellation handling, package
inventory verification and 177 isolated synthetic cases (16 facts plus 161 theory rows). A deterministic compiled
artifact is produced only by a verified-source package build; an unbuilt source ZIP is
not called ready-to-run. CI paths and result names are separate from existing backend
receipts, with all earlier checks and permissions retained.

The source baseline lacks complete native FK/check/default and additional purchase
constraint semantics. Those checks stay BLOCKED. SQL Server-normalized predicates not
recognized exactly stay BLOCKED. Native log omitted-field defaults are not qualified
merely because definitions exist. Authentication/session/grants/documents, real locking,
commit/crash durability, receipts, numbering, Send rights and runtime acceptance remain
NOT_RUN. No business row is read. No DML/DDL/reservation/allocator/COMMIT or real SQL is
executed in preparation or CI. `ReleaseStillBlocked=true` is unconditional.

## Preparation verification

Local static/source/manifest/workflow regressions are recorded in the handoff receipt.
Observed locally: fixed-plan/161-column verifier plus 10 synthetic packaging regressions,
97 existing integration/package guards, CI-policy and architecture checks pass. Finite
catalog validation passes 1,527 objects/33 members. The existing 48-case source suite
reports 20 failures and four errors because this cloud environment mounts `/tmp/.git`;
the private-fixture guard correctly rejects these synthetic outputs as
`repository_or_site_output`. This is the known inherited environment boundary, not a
claimed source-suite pass or a reason to weaken that guard.
The cloud workspace has no verified .NET SDK; local restore/build/.NET tests and compiled
packaging are NOT_RUN, not passes. Exact-source Linux/Windows hosted CI must perform
locked restore, analyzer builds, all existing backend checks, the isolated inspector suite
and compiled packaging before delivery/merge. Real SQL compilation/target observation is
NOT_RUN and must be performed by the owner later with the verified artifact.

Owner instructions: `tools/inspect/README.md`. No Python install, source build, execution
policy change, certificate bypass or configuration rewrite is required on the owner machine.
