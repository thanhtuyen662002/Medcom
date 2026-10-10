# I72 local quality review and verified checkpoint

Scope: PR #129, direct sole executor, base `8531b9e18c6073982a9cb8d28345cb8da89ff466`. This is a local lead review, not an invented independent GitHub approval. Publication and exact-head/base CI are verified separately in the PR checkpoint.

Integration base advanced to `c7bfa10a43ea4515b17fb105815ef7d78080e9ce` when the separate FE PR #130 merged. Its four current-main push workflows were observed successful (38030278616/620/621/626). The isolated BE branch incorporates that base without modifying the FE implementation; exact updated-base CI is still required for #129.

## Observed checks

- .NET 10.0.401 locked restore succeeded. Release solution build: zero warnings/errors. Source-free backend: **3197 passed, zero failed/skipped** (`artifacts/I72-tests/I72-publish-full.trx`, ignored local receipt).
- Source metadata/generator regression suite: **54 passed**; API data audit: **8 passed**; policy/integration/package guards: **97 passed**. Finite approved baseline: **1527 objects / 33 members** checksum verifier passed. Project boundaries and ruleset/workflow policy passed. Evidence: tools/source and tools/backend test modules, .github/scripts tests; local outputs and current-head hosted CI after publication.
- Current-form SQL fixture: **154 checks passed** with 67 current source module definitions, synthetic masters/users/documents and real SQL transaction/procedure/trigger execution. Sanitized detailed receipt: `docs/backend/erp-six-screen-synthetic-runtime-20261010.json`. Actual definitions remain private; no remote MedData DML/DDL was performed.
- Every one of **115 registered operations** reconciled. Original document contracts retain 118 fields; seven additional current-form contracts cover 417 section fields, including overlap with existing purchase-request source tables. These counts are separate contract denominators, not a deduplicated SQL-column total. Evidence: `docs/backend/api-data-audit-six-screens-20261010.json`, `ApiContractCatalogTests`, `ErpScreenEndpointTests`.

## Review findings corrected in this candidate

| Finding | Correction and verification |
|---|---|
| XACT_STATE SQL result is smallint | Explicit int conversion before typed reader; all native reads/commands exercised it |
| Native item lookup omitted EXEC when no longer first batch statement | Fixed procedure-prefix binding; portable regression plus actual sales CUD |
| Item lookup uses integer zero literals for decimal target fields | Explicit scalar normalization before readonly rehydration; actual sales create/save/line changes |
| Receipt lookup could canonicalize optional fields differently | Fixed typed normalization shared by execution and observation; actual create replay/lookup and portable property/null-order test |
| QR uses success MsgType 0, other workflow procedures use 3 | Fixed pinned procedure dialect; actual ordinary/package scans, quantity rejection, scan deletion and workflow tests |
| Draft paste was disabled merely because writer was unqualified | Treat validation as a read step; enforce save state on existing documents |
| Report buttons advertised nonexistent paths | Unqualified report route is null; no claimed printing implementation |
| Full read schemas only had extension metadata | Module-specific required full-field response schemas, fixed create/save/paste/action input variants; static/HTTP route and schema checks |
| PM popup choices absent from grid dropdown catalog | Two fixed scoped, paged action-option routes with credential-free projection; native local reads/scope rejection |
| Exact reference lookup scanned entire simple master binding | Bound exact-key derived SELECT, preserve nested ORDER BY, bounded procedure/DECLARE fallback; native CUD plus lexical regressions |
| Contract ID collation alias | Binary exact contract match plus branch fence; actual contract read and foreign-branch rejection |

## Acceptance that remains open

The concrete SQL gateway is executable and invoked by the HTTP service when trusted dependencies are registered. Ordinary startup deliberately has no target-qualified writer or qualified production numbering allocator. The private fixture implementations are never shipped as admission evidence/providers. Native PO/DMB numbering masks, complete repair monetary semantics, complete dynamic closure/full target constraint and operational acceptance remain **UNKNOWN**. Reports and additional source-document imports remain explicitly tracked in the FE guide. No bypass, automatic migration, generic caller-selected SQL CRUD or guessed authentication is introduced.

Security review scope: fixed seven-module object/field maps; strict UTF-8/JSON/owner exclusion; source/default/configuration hash fences; fresh native permission/session/branch checks; owned serializable transaction; durable binary intent journal; state tokens; current-authority receipt observation; uncertain commit handling; rollback/disposal checks; bounded bodies/pages/rows; secret filtering of dropdown/contract fields. Portable and synthetic tests cover concrete cases, not proof of all fault/concurrency/performance classes.

FE guide: `docs/backend/BE_FE_SIX_SCREEN_COMMANDS_20261010.md`; generated 417-field/106-binding appendix; OpenAPI `docs/backend/medcom-openapi.json`. FE consumer adoption and actual target acceptance remain open. Goal #45 remains open, original leases/claims and source identities remain preserved, and schedules remain OFF without administration.
