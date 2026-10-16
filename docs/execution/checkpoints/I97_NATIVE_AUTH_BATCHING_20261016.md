# I97 — fresh native identity and authority batching

Owner direction: continue BE optimization after the I96 redeploy measurement. New isolated branch `codex/be-native-auth-batching-20261016`, base `113650b79cf07da82993e5aed99f541cd140bd77`; do not resume merged PR #165 or historical leases. Backend-only; owner redeploys from main; no ZIP or automation changes.

Observed I96 postdeploy baseline: [174 authenticated reads](https://github.com/thanhtuyen662002/Medcom/pull/165#issuecomment-6213180195), all HTTP 200, 57 CSRF calls under 100 ms, 117 other calls above. Median authentication is approximately 590 ms, options 1295.2 ms, list 1329.8 ms and detail 1511.4 ms. Exact deployed binary/DB binding is UNKNOWN; Server-Timing gives the measured stage boundary.

Bounded scope: replace sequential identity/grant/branch SQL exchanges with fresh read-only batches; share the native identity/branch parser in modern authority readers; retain native credential stamps, disabled/group checks, delegated/group/user permissions, strict purchase-request parent/Run semantics, branch selection, serializable transaction ownership, final native authority/liveness fences and conservative legacy callers. No TTL authorization cache, skipped data/command authorization, DB migration or API contract change.

Evidence targets: `SqlLegacyUserStore.FindAsync`, `SqlLegacyPolicy.GrantsCte`, `SqlLegacyBranchScope`, `SqlPurchaseRequestQueries.GrantsText/HasNativeReadGrantAsync`, `ErpSqlAuthority.Read/ReadAll`, `SqlReferenceData.Authority`. Approved Library/source identities remain in `docs/SOURCE_BASELINE.md`; no historical archive re-materialization or rehash is claimed. Real DB validation is read-only and retains only timings/equivalence counts, never user data, credentials, SQL source bodies or business rows.

Implementation, native semantic equivalence, focused/full/exact-head-base CI and integration: pending. Every-FE-call-under-100-ms acceptance remains open and cannot be inferred from component timings or offline tests.
