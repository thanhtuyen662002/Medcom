# I96 — options and native read performance

Owner request: investigate options and other data reads taking more than two seconds. Backend-only scope; owner redeploys VPS from main, no ZIP.

Base: `2e18226755dbe6f8ab5a8abe9847fbc6d4c49749`; main Linux and Windows policy workflows succeeded before this branch. New isolated branch `codex/be-read-performance-20261016`; does not resume merged I95/#163 or take over historical leases.

Evidence under investigation: `NativeReadSession.cs`, `ApiHost.cs`, `SqlErpScreenReader.cs`, `SqlErpScreenLookups.cs`, `SqlReferenceData.cs`, `SqlLegacyUserStore.cs`. Current implementation repeats full identity resolution for read-only POST providers, queries schema per section and enumerates bounded dropdown sources before paging. Their contribution to deployed authenticated latency is UNKNOWN until measured; code inspection alone is not runtime timing.

Initial unauthenticated external probes observed responsive BE and FE origins. They cannot establish authenticated data-read latency. Private read-only current DB probes record only durations, counts and connection-option booleans; production rows and secrets remain outside the public repository. Historical approved Library sources remain identified in `docs/SOURCE_BASELINE.md`; no archive re-materialization or rehash is claimed.

Implementation, validation and integration: pending. Preserve native authorization, session expiry/logout, transaction consistency and parameterized finite SQL. No FE, DB, VPS or automation mutations are authorized by this investigation.
