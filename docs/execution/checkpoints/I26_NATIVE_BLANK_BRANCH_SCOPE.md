# I26: native blank branch scope

## Admission and evidence

- Direct bounded admission: `docs/execution/direct-runs/I26.json`, copied unchanged from the immutable I26 admission. Root remains sole publisher.
- Admitted base: `079eb767a47cb266bed36be5a34931282835b20f`; exact source tree: `210e7b4552aa10036ac25951d7d1ad057ed82a2a`. The local candidate was exported from this tree, not the older checkout HEAD.
- Owner-confirmed semantic rule: a successfully resolved enabled canonical native `SY_User` with `BranchID` NULL or zero length has all branches. This is not inferred from a username, failed lookup, whitespace or an empty derived session array.
- Catalog evidence: `inventories/source/20261002/table-04.json`, `dbo.CF_BranchTbl`, source line 13987, masked definition SHA-256 `34314ab656dcbff2a8448bd50a7bd3b72bc29b7899b24f3edf019bd977d49e6c`.
- Catalog has 17 columns and non-null `BranchID varchar(50)`. No tenant/company/deleted/disabled/status discriminator exists in this pinned shape. `isDefault` is not interpreted as status. The connection remains bound to the configured dedicated ERP database; no broader database discovery occurs.

## Implementation

- New internal `SqlLegacyBranchScope` uses a serializable read transaction and a bounded native user/group recheck. Missing or ambiguous native users, noncanonical names, changed credentials, disabled users/groups and malformed native assignments fail closed. Native user-to-group binding is also exact by Unicode length/bytes.
- Native NULL/zero-length alone selects catalog expansion. Full catalog metadata is checked against the 17 pinned columns; unavailable metadata (including a missing type-metadata row), new/removed/changed columns, user-defined types, identity/computed changes fail closed. IDs are never invented.
- Every resolver projection requires its exact column count and CLR types even for empty results; unexpected extra result sets fail closed.
- Catalog retrieval is bounded at 201 rows; observing the 201st fails instead of returning a truncated 200. Empty catalog returns an empty explicit scope, which downstream reads deny. Null/empty/whitespace/control/overlong IDs, exact duplicates and SQL-equal catalog aliases fail closed. Alias detection uses native SQL equality, not a fabricated in-memory collation.
- Restricted primary/supplemental assignments remain restricted, use exact Unicode length/byte physical owner binding, and retain ordinal duplicate collapse. They do not require or expand from the catalog.
- `SqlLegacyUserStore` returns only explicit IDs using the shared resolver. Existing password verification, canonical identity, company binding and functional rights remain in force.
- Both document list and detail paths re-resolve native scope inside a serializable transaction retained through the actual final document query. Their parameterized branch predicates compare exact byte/length identity; the native blank predicate is backed by the validated explicit catalog and held native-user/catalog reads. Menu/form/credential/group checks, pagination and child-parent checks remain.
- Purchase read workspace/list/open/lookup paths reuse the same resolver inside their existing serializable transaction, intersect with the live explicit identity, preserve native Run/menu/form checks and retain post-read session revocation checks.
- No write implementation, `PurchaseRequestSql.cs`, public contract, dependency, registration, configuration or FE change. No DB access, DLL execution or target activation occurred.

## Regression coverage and verification

Added tests cover exact result projection types/counts (including empty readers), malformed and unexpected extra result sets; native NULL/zero-length versus missing/ambiguous/whitespace native values; malformed/duplicate/SQL-alias/unavailable/overflow catalogs; exact 200 boundary; empty catalog and empty derived arrays; restricted/all transitions and catalog changes; credential/group/native-right revocation; document SQL builders used by actual command construction; purchase query scope parameters and orchestration; identity/session scope replacement and revoked-session non-resurrection.

Recording database fixtures and generated-SQL assertions are explicitly synthetic. They are not real SQL Server, legacy DLL, ERP, browser or production-acceptance evidence.

Observed local results:

- PASS: `python tools/backend/check_architecture.py` (five project boundaries; SQL dependency confined to Infrastructure).
- PASS: `git diff --check`; exact 11-path admission, byte-identical marker and all 17 SQL shape tuples matched against the pinned source catalog.
- PASS: preparation runner's first 40 reference-model tests (16 audit/trace and 24 capability tests).
- BLOCKED: aggregate preparation runner then requires historical Git object `f9197185b624a8c3f74c99e48a69550b5a7c2a73:docs/plans/PHASE2_IMPLEMENTATION_MASTER_PLAN.md`, unavailable in this local object store. This is not a completed aggregate check.
- NOT_RUN: .NET restore/build/tests; no `dotnet`, C# compiler or Mono installation is available in this execution environment. No network installation was performed.
- NOT_RUN: real SQL/native runtime/browser acceptance, deliberately excluded from this admission.
- Independent source review found and corrected supplemental-owner physical binding, group-row physical binding, missing type-metadata handling, and strict result-schema/extra-result validation. Recording fixture assertions were tightened to require the actual physical comparison fragments. Final frozen-snapshot review is pending.
- PENDING: exact-published-head/current-base required CI. These remain mandatory before merge. Production acceptance remains open.
