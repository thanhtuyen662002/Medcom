# Database Runtime Options and Web Migration Contract

Evidence source: authoritative Library baseline `Medcom-Data (3)(1).zip` / `Medcom-Data.sql`, SHA-256 `2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`.

Evidence level: **VERIFIED** for declarations below. Runtime behavior that depends on server/connection/session state remains **UNKNOWN** until runtime/C# verification.

## Verified database options

| Contract | Dump declaration | Web migration consequence |
|---|---|---|
| Compatibility | `COMPATIBILITY_LEVEL = 130` | Do not assume semantics/features from a newer compatibility level during coexistence. Any upgrade is a controlled DB change with regression testing. |
| Read committed | `READ_COMMITTED_SNAPSHOT ON` | Ordinary READ COMMITTED readers can use row versions rather than blocking writers. Preserve this concurrency assumption during coexistence. |
| Explicit snapshot | `ALLOW_SNAPSHOT_ISOLATION OFF` | Do not design API units around explicit SNAPSHOT transactions unless a controlled DB change enables and validates them. |
| Broker | `DISABLE_BROKER` | SQL Service Broker is not an available baseline realtime/event transport. Web push/eventing needs another transport or an explicitly approved DB change. |
| Query Store | `QUERY_STORE = OFF` | Baseline has no Query Store evidence for production query-history/regression diagnosis. Observability must not depend on it unless deliberately enabled. |
| Recovery | `RECOVERY SIMPLE` | Point-in-time log restore cannot be assumed from this baseline. Migration/rollback runbooks must align with actual backup policy, which is UNKNOWN from the dump. |
| Auto shrink | `AUTO_SHRINK ON` | Treat as an operational/performance risk candidate; do not silently change it in Phase 1. Validate file-growth/shrink behavior and DBA policy before migration. |
| Statistics | `AUTO_UPDATE_STATISTICS ON`, `AUTO_UPDATE_STATISTICS_ASYNC OFF` | Automatic stats exist, but synchronous stats updates may affect request latency. Large-grid/API performance tests must include cold/stale-stat scenarios. |
| Page verification | `PAGE_VERIFY TORN_PAGE_DETECTION` | Baseline does not declare CHECKSUM page verification. Treat changing this as DBA-controlled operational hardening, not an application migration side effect. |
| Recovery target | `TARGET_RECOVERY_TIME = 0 SECONDS`; `ACCELERATED_DATABASE_RECOVERY = OFF` | Do not assume ADR rollback/recovery characteristics. Long transaction recovery remains a test/operations concern. |
| Parameterization | `PARAMETERIZATION SIMPLE` | API/query facades must parameterize explicitly; do not rely on forced parameterization for plan reuse or injection protection. |
| Durability | `DELAYED_DURABILITY = DISABLED` | Do not assume delayed-commit semantics. |
| Trust/chaining | `TRUSTWORTHY OFF`, `DB_CHAINING OFF` | Preserve server-side authorization boundaries; do not make Web compatibility depend on relaxed database trust/chaining. |

Additional VERIFIED declarations include `AUTO_CLOSE OFF`, `AUTO_UPDATE_STATISTICS_ASYNC OFF`, `MULTI_USER`, `READ_WRITE`, `FILESTREAM NON_TRANSACTED_ACCESS = OFF`, and legacy ANSI/session defaults declared at database scope.

## Architecture consequences

1. **Concurrency:** RCSI is part of the baseline. Compatibility testing must detect accidental reintroduction of reader/writer blocking through explicit lock hints, stronger isolation, or long transactions.
2. **Realtime:** because Broker is disabled, the Web architecture must not claim SQL Broker-backed realtime from current evidence. Poll/SWR, application events, or another event infrastructure remain valid dispositions.
3. **Performance:** Query Store is OFF and auto-shrink is ON. Before production migration, establish query telemetry independently and benchmark file-growth/shrink and synchronous statistics effects.
4. **Rollback/DR:** SIMPLE recovery is VERIFIED, but backup cadence, RPO/RTO and actual restore capability are UNKNOWN. Architecture must keep those as explicit operational gaps rather than infer point-in-time recovery.
5. **Schema evolution:** compatibility-level or database-option changes are controlled migrations with rollback and regression evidence, not incidental Web setup.

## UNKNOWN / C# or runtime verification queue

- Current production instance options versus the scripted dump at runtime.
- Server-level settings, trace flags, tempdb layout, MAXDOP/cost threshold, memory configuration and storage latency.
- Backup jobs, retention, restore testing, RPO and RTO.
- Connection-level isolation/session SET overrides used by the Windows ERP.
- Whether any external component relies on Broker despite the database declaration.
- Operational reason for `AUTO_SHRINK ON` and whether disabling it is safe.
- Workload impact of RCSI version-store pressure and synchronous statistics updates.
- Whether enabling Query Store/PAGE_VERIFY CHECKSUM is approved by the DBA/operator.

## Reuse disposition

Keep these settings **as baseline compatibility constraints** during Phase 1. Any change to isolation, Broker, recovery, compatibility level, Query Store, auto-shrink, page verification, or durability is a **controlled DB/operations change**, never an implicit requirement of the Web UI.
