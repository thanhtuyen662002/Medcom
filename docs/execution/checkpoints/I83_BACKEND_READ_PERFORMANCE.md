# I83 — Backend read performance, 2026-10-12

Owner scope: fix BE first. FE/Sites source and configuration, SQL schema and production records are outside this patch. Canonical goal #45 remains open.

## Problem and evidence

The successful Railway HTTP sample in [the I82 audit](https://github.com/thanhtuyen662002/Medcom/issues/45#issuecomment-6117809946) observed median branch lookup 17,900 ms, notifications 19,871 ms, purchase orders 12,772 ms and purchase requests 16,358 ms. These are historical samples, not a controlled load test. Anonymous 401 response speed cannot establish authenticated data speed.

Evidence objects: private `I82-api-latency/production-metrics.json`, `LATENCY_AUDIT.md` and `local-profile.log` under the owner's private artifact directory. Only aggregate timings/counts are recorded here. Current source base: `5c6eb00e2b0115b5286bfd0fb1262634d969e64f`.

`ApiHost.cs` previously requested full `LocalWebSessions.ResolveAsync` at cookie validation and again for native reference, notification and ERP reads. `LocalWebSessions.cs` serialized every database authority observation per session. `FeDisplayFilter` in `FeDisplayProjection.cs` queried branch names again after `SqlReferenceData.BranchesAsync` had already validated and returned them.

## Changes and retained checks

- `IWebSessions.ResolveReadAsync` and `LocalWebSessions.Revalidate`: overlapping passive requests share a successful authority observation completed since their invocation began. Immutable entry replacement proves that observation; there is no TTL or cache for later requests. The per-session gate still prevents out-of-order SQL snapshots. Invalid authority, logout, expiry and cancellation remain fenced. Writes and explicit activity always use independent full resolution.
- `ApiHost.cs` / `NativeReadSession.cs`: GET reference, notification and ERP providers inspect the already-authenticated session. `SqlReferenceData.Run`, `SqlNotificationQueries.Run` and `SqlErpScreenReader.Run` still validate native credentials and the applicable branch/menu rights before and after data access, with cleanup/liveness checks. Non-GET provider admission still fully resolves. `SqlErpScreenCommands` and write registration are unchanged.
- Purchase-request queries retain their full `ResolveAsync` callback after SQL cleanup. This reader has a different authorization lifecycle (`SqlPurchaseRequestQueries.Run`), so its final authority check is not replaced by inspection.
- Only the typed `ErpScopedResponse<BranchChoicePage>` from GET `/api/lookups/branches` supplies already-authorized branch names to the display filter. Arbitrary existing `Name` fields never bypass reference queries. Final logout/read-scope inspection remains. Branch IDs, names, reference state and paging are preserved.
- Routes, canonical v3/full-field responses, money/date displays, document state tokens, CSRF, origin and mutation/concurrency rules are unchanged. FE integration requires no payload migration for this patch.

## Observed private MedData comparison

Diagnostic process: read-only SQL, no production HTTP login/cookie, no accepted password verifier and no database changes. Evidence objects `I82-api-latency/Program.before.txt`, `Program.cs`, `local-profile.log`, `local-profile-after.log`; connection settings remain private. The same code paths run with the original full resolution versus the new passive/read admission. Times include real network/DB variation.

| Measurement | Before | After |
|---|---:|---:|
| 19 overlapping session authority requests, total | 16,535 ms / 19 observations / 152 SQL commands | 900 ms / 1 observation / 8 SQL commands |
| Branch lookup, start identity + native core + name enrichment | 48 SQL commands; 2,860–3,100 ms in earlier samples | 20 SQL commands; 1,246–1,799 ms in two samples |
| Branch core alone | 20 SQL commands; 1,081–1,248 ms | 12 SQL commands; 423–583 ms |
| Notification core alone, empty page for diagnostic principal | 14 SQL commands; 946–1,054 ms | 6 SQL commands; 520–700 ms |

The 19-request comparison measures session authority only, not full API latency. Branch/notification comparisons use direct production reader classes; they are not authenticated Railway HTTP measurements. Nonempty notifications, all document routes, different user grants/filters, VPS latency and production component timings remain **UNKNOWN** until observed. This patch does not claim every API is below any fixed latency threshold.

## Validation and completion receipts

Regression evidence lives in `tests/backend/Medcom.Api.Tests/SessionTests.cs`, `NativeReadSessionTests.cs`, `FeDisplayTests.cs` and the existing native SQL/session/command suites. New cases cover 19 overlapping reads, a later permission change, default session fallback, full write validation, logout/expiry/password/disabled-user rejection, canceled leaders/waiters and branch paging/name/logout behavior.

Exact published-head build, complete .NET results, required Linux/Windows checks, tested base/merge receipts, merge and Railway deployment results must be recorded on the linked PR and canonical issue before claiming completion. No GitHub approval, source archive equivalence, runtime acceptance for unmeasured routes, or full goal closure is inferred.
