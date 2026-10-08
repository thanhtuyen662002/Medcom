# I53 authoritative branch-selection metadata

This local candidate is based on the verified public tree
`54f798e9dc6e8e58f7a52e4ead0e92d6e9952d37`, revision
`bba926f951332ffb8547850af2aa13e66da35685`. Admission is the unchanged
`docs/execution/direct-runs/I53.json` read at control commit
`80d7d03352922bdfa0619c69d0f5d4ff1c88a31c` / Draft PR 105. Its
`implementation NOT_RUN` constraint remains admission history, not a test result.
Root Mika owns GitHub integration/publication. This candidate is not production acceptance.

## Native resolution and wire semantics

`SqlLegacyBranchScope.ResolveAsync` returns the existing validated `BranchIds`
and `BranchSelection` together, from the same native-user resolution under the
existing serializable transaction. All existing SQL texts and validation checks
are unchanged. Native source assumptions are those already qualified in
`SqlLegacyBranchScope.NativeUserText`, `CatalogShapeText` and `CatalogText`:
`SY_User.BranchID` is one nullable varchar(50) literal, and the catalog is
`CF_BranchTbl`. The latter's stored evidence pointer is table-04.json line 13987,
masked SHA-256 `34314ab656dcbff2a8448bd50a7bd3b72bc29b7899b24f3edf019bd977d49e6c`.
This run did not access or reverify private ERP/DB archives.

| Successful resolution | Workspace `branchSelection` |
| --- | --- |
| Native null or zero-length, nonempty validated catalog | `{ "mode": "all", "assignedBranchId": null, "filterLocked": false }` |
| Valid nonblank native literal present in the derived native-plus-supplemental scope | `{ "mode": "assigned", "assignedBranchId": "<exact native literal>", "filterLocked": true }` |
| Empty derived scope, missing native literal in derived assigned data, older identity without metadata | `null` (unavailable) |

Missing/ambiguous/changed native user, whitespace-malformed values, failed reads,
unexpected projection/results and invalid catalogs retain the existing failure
behavior. They never construct `all`. There is no delimiter splitting, trimming,
case folding, default-branch selection or inference from the grant array.
Supplemental `SY_UserBranch` grants remain present exactly as before. The native
assignment determines selection semantics, even when a supplemental grant sorts
before it or allows another branch.

`ReadAsync` retains its existing branch-only return contract for detail, lookup
and command callers. `SqlLegacyUserStore.FindAsync` consumes the combined result
and attaches metadata only after successful transaction cleanup. `LegacyUser`
and `AuthoritativeIdentity` append optional metadata, and
`LegacyIdentityAuthority` copies the current successful observation on login and
each revalidation. Credential stamps, authority sequencing, session storage,
expiry and command fences are unchanged. The normal `LocalWebSessions` record
copy preserves metadata without a session-store change.

`AuthEndpoints` exposes the metadata on `WorkspaceView`, not `SessionView`.
`WorkspaceReadScope.Read` uses the v2 digest with selection mode, exact assigned
literal and lock flag (or explicit unavailable). Consequently all→assigned,
assignment changes and unavailable transitions retire read evidence even with
identical authorized branch IDs. The session digest stays unchanged. Authority
observation version and activity do not affect the digest. No endpoint query
rejection, detail grant or command grant was added.

## Root frontend integration

`apps/medcom-sites/lib/erp/branch-selection.ts` is a dependency-free boundary
helper for the root-owned workspace schema/UI integration. `readBranchSelection`
accepts a workspace with its authoritative metadata and branch IDs. It returns
an immutable `available` selection or explicit `unavailable`. Missing metadata,
empty/invalid branch arrays, inconsistent flags or an assigned literal absent
from the exact grant array fail closed. `branchSelectionKey` supplies stable
selection semantics for read-evidence invalidation; combine it with the existing
session/read correlation and never use it as a grant or credential.

Root must add the optional nullable metadata to shared `contracts.ts` before
passing parsed workspace data to this helper: the existing schema strips unknown
properties. Root also owns rendering/locking the filter and aggregate test-runner
wiring. None of those shared paths is changed by this candidate. Unavailable
metadata must be presented as unavailable and never unlocked as inferred all.
The helper neither edits branch arrays nor revokes supplemental permissions.

## Tests and limits

Run the standalone production helper tests with Node 24:

```sh
cd apps/medcom-sites
node --test tests/branch-selection.test.mjs
```

These executed tests cover literal delimiter preservation, supplemental grants,
immutability, backward/missing/null/empty metadata, malformed values, contradictory
metadata and selection semantic transitions with equal branch IDs.

Backend regressions are in `BranchSelectionMetadataTests`,
`SqlLegacyBranchScopeTests` and `AuthenticationHttpTests`; all prior tests and
assertions are retained. They exercise production native resolution, identity
authority, session revalidation, HTTP workspace serialization and read headers
using synthetic recording providers and fixture-only TLS. Supplemental query
dispatch remains accepted. These are not SQL Server or native DLL evidence.

```sh
dotnet test tests/backend/Medcom.Api.Tests/Medcom.Api.Tests.csproj --filter 'FullyQualifiedName!~LegacyRuntimeTests'
```

.NET is unavailable in this Work environment: backend compile/xUnit are
**NOT_RUN**. Full frontend aggregate/typecheck/browser validation is also
**NOT_RUN** because project dependencies/browser are unavailable. See the
handoff receipt for observed commands, exit codes and logs. No source-pattern
checks are counted as xUnit. Root should run hosted backend CI and the normal
frontend checks after its shared schema/UI integration.
