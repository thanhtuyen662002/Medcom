# I37: reduce repeated read authority work without caching authorization

Source baseline: `830d6c710b0fb47dd75a01dfb163ca2619bf5ea5`.

## Scope and invariant

This change optimizes read orchestration only. It does not change `ResolveAsync`, POST command validation/execution, native SQL credential/grant/branch checks, full-value DTOs, paging limits, database configuration, or enabled-provider registration. It introduces no cross-request authorization cache, TTL, schema cache, target access, or production acceptance claim.

`IWebSessions.InspectAsync` is explicitly **liveness**, not database authority. `LocalWebSessions` checks the current token entry under its existing lock, including cancellation, logout and idle/absolute expiry; it returns the current frozen identity without touching activity or advancing authority version. Other implementations conservatively default to existing full `ResolveAsync`.

For purchase queries, entry and pre-rollback checkpoints use inspection. The same serializable transaction still executes native credential, grant, branch and source-shape checks before returning any data. The full SQL-backed `ResolveAsync` **after rollback and disposal** remains mandatory. Thus a stale local identity cannot authorize a result if the final database authority has changed, and a logout/cancellation during cleanup still prevents publication.

Purchase detail uses inspection immediately before resolving command-access metadata only when its query provider is the concrete sealed SQL reader, then still performs a full revalidation afterward. Custom query providers retain the full pre-access check; a recording access-provider regression verifies it is never invoked after custom-query revocation. Command routes keep their existing full checks.

Inbound's exact built-in unavailable access/service pair may return only the existing null-scope, all-rights-closed, no-document `Unavailable` GET envelope after normal cookie authentication, provenance/query/scope validation and current token inspection. The shortcut does not apply to POST, missing/custom providers, mixed built-in/custom registrations, provider exceptions, or enabled read providers.

## Static work model, not latency measurement

On a successful enabled-pilot identity path, `SqlLegacyUserStore.FindAsync` executes:

- User/group query: 1
- General document-menu grants: 1
- Purchase read credential and grant: 2
- Native branch scope: 2 for restricted scope, 3 for native-all catalog scope

That is **6 / 7 SELECT command executions**, respectively, plus connection and transaction begin/rollback work. A query may contain multiple server-side operations; these are client command counts, not packet counts, execution plans, measured milliseconds, or guaranteed speedups. Early denial/failed qualification can execute fewer commands.

| Successful read GET | Full authority checks before | After | SELECT command model before (restricted/all) | After (restricted/all) |
| --- | ---: | ---: | ---: | ---: |
| Purchase workspace, both lookup qualifications successful | 4 | 2 | 35 / 40 | 23 / 26 |
| Purchase list | 4 | 2 | 30 / 35 | 18 / 21 |
| Purchase detail, excluding any command-access provider SQL | 6 | 3 | 43 / 50 | 25 / 29 |
| Inbound draft, exact unavailable defaults | 4 | 1 | 24 / 28 | 6 / 7 |
| Exact public GET `/health/live` or `/health/ready`, with valid cookie | 1 | 0 | 6 / 7 | 0 / 0 |

The separate generic inbound read-only detail remains independently authorized and unchanged at 15 / 18 SELECT command executions. Its unavailable-draft-plus-detail chain changes from 39 / 46 to 21 / 25, excluding list refreshes. Generic purchase-order/inbound list and detail are not rewritten here. Initial `/api/workspace` remains one full authority check. The narrowly bounded health follow-up now treats exact GET `/health/live` and `/health/ready` as anonymous even when a cookie is supplied: cookie validation rejects the request principal and disables renewal before any server-session access. It does not revoke the session; no other path, method or anonymous endpoint is bypassed. Fixed public/cached payloads remain unchanged.

The frontend currently obtains purchase workspace before its list/detail; list and detail already start together. Opening inbound can also refetch its list through a selection dependency. Those frontend costs are separate from this patch. Background workspace checks run every 60 seconds and on visible focus/online transitions; no polling cadence is changed here.

Source evidence: `ApiHost.cs` cookie validation and purchase registration; `LocalWebSessions.cs`; `SqlLegacyUserStore.cs`; `SqlLegacyBranchScope.cs`; `SqlPurchaseRequestQueries.Run`; `PurchaseRequestLookupSql.QualifyAsync`; `PurchaseRequestEndpoints.cs`; `InboundDraftEndpoints.Run/Authorize`; frontend `workspace.tsx`, `purchase-request-api.ts`, `purchase-request-screen.tsx`, `inbound-request-screen.tsx` and `inbound-request-readonly.tsx`.

## Verification

Added deterministic recording/count tests cover:

- Purchase HTTP workspace/list/detail full-authority budgets 2 / 2 / 3, retaining native credential/grant/branch SQL.
- Purchase list 6 / 7 native SELECT commands and two cheap checkpoints, with exactly one final full revalidation after transaction/connection disposal.
- A stale local observation with changed final database identity/capability/branch/credential cannot publish data.
- Local inspection performs no authority read, does not renew idle expiry, need not wait behind a blocked SQL revalidation, and cannot resurrect logout.
- Cancellation, observed rights changes and idle expiry.
- Built-in unavailable inbound GET one full authentication plus one local inspection; logout/expiry after authentication denies; mixed providers keep their existing full checks.
- Existing query tests use the explicit inspector seam, retaining native-alias, scope, precision, 101-line/full-value, late revocation and cleanup/cancellation assertions.

Observed validation with pinned .NET 10.0.401:

- `git diff --check`: passed.
- `python tools/backend/check_architecture.py`: passed.
- Locked serial solution restore: passed.
- Full solution Release build: passed, zero warnings/errors.
- Focused Session/PurchaseQuery/PurchaseEndpoint/InboundEndpoint test run: **321 passed, zero failed/skipped**. This includes actual HTTPS fixture checks for full-authority budgets and the custom-query pre-access assertion.
- The first focused run had 296 passed / 25 failed because a read-only `.git` marker in the executor temp root made the composed inbound fixture's sibling public/private directories belong to one detected repository. The approved test-only correction creates public ContentRoot under the application output and leaves synthetic private JSON in its separate temp path, preserving explicit configuration and the production guard unchanged. All 25 composed cases passed after that correction.
- Aggregate preparation runner: incomplete because historical pinned Git-object retrieval was blocked locally; not a pass.
- Full backend suite, hosted exact-head CI, real SQL performance, owner runtime and production acceptance: not established by this focused run. Separate unrelated configuration-test layout failures reported by other lanes must be resolved or independently verified by the coordinator before claiming full-suite green.

No owner SQL, private configuration or real transaction rows were accessed. The command counts above are source/recording evidence, not a measured production latency comparison.

## Exact public-health follow-up verification

A separate two-code-file delta adds the public-health guard and tests without changing the frozen original I37 patch. Locked restore and full Release build passed with zero warnings/errors. The expanded focused run passed **336/336**, zero failed/skipped, including all seven new health cases. Recording tests prove zero Resolve/Inspect/Revoke calls, anonymous principal with no resolved-session context, unchanged no-cookie/valid-cookie/revoked-cookie public payloads, no Set-Cookie renewal, and preserved subsequent protected-workspace validation and revocation denial. HEAD, trailing-slash/case variants, CSRF and session endpoints retain full cookie validation. These are deterministic orchestration assertions, not production latency measurements.
