# Medcom backend production checklist

Parent and durable coordination: [production goal #45](https://github.com/thanhtuyen662002/Medcom/issues/45), [global acceptance criteria](PRODUCTION_ERP_GOAL.md). This checklist creates no duplicate goal, excludes no ERP module and does not close the full product goal. Current lane: I02, Draft PR #53. Backend role does not modify the separately owned Sites/frontend.

## Acceptance chain

For each required ERP action: approved source object and evidence → versioned typed API contract → authenticated tenant/company/branch authorization → trusted SQL state reread and source-defined effects → transaction/concurrency/idempotency → durable audit/receipt → integration test → frontend consumer/UAT evidence.

The complete backend/action denominator is **UNKNOWN** until all current inventory entries are reconciled. No percentage inferred from test counts. Source inventory entry point: `inventories/source/20261002/source-set.json`; ERP/DB traceability and unresolved unknowns remain governed by `docs/PROJECT_STATE.yaml`. Approved historical Library archives remain mandatory distinct evidence; newer technical attachment verification does not silently replace them.

| Gate | Current evidence / missing work | Status |
|---|---|---|
| Full ERP module/action/report/config/permissions ledger | Reconcile existing inventories into API acceptance chain; denominator unresolved | UNKNOWN |
| Private direct SQL Server configuration | `docs/backend/SERVER_CONFIGURATION.md`; selector and server-local UI; target connection not verified | Code pending publication/review |
| Session/authentication/data authorization | Legacy authority/read paths exist; deployment, concurrent sessions and full scope verification pending | Incomplete |
| Typed domain commands | Recovered transfer catalog and three PM typed payloads; remaining actions unresolved | Incomplete |
| SQL gateway and actual effects | Transfer atomic gateway interface exists; concrete SQL transaction/authority/effects wiring missing | Incomplete |
| Durable idempotency/audit | Correlation validation exists; persisted atomic journal and restart/retry reconciliation missing | Incomplete |
| HTTP API/OpenAPI/frontend contract | Shared read contracts exist; full versioned command/error/pagination/report contracts and consumer validation missing | Incomplete |
| Reports/export/configuration | All source items require explicit API implementation and acceptance mapping | UNKNOWN |
| Release/operations | Package checks exist; target deployment, HTTPS, secrets, backup/restore/rollback, load and monitoring evidence missing | Incomplete |
| Native integration | Draft #53 requires distinct latest-push GitHub approval and exact-head checks | Pending |
| Staging SQL | Owner-authorized remote sandbox endpoint/configuration and representative fixture acceptance | UNKNOWN |
| Production | Target host/database and authorized user acceptance evidence | UNKNOWN |

Code completion, publication, main integration, staging verification and production acceptance must be reported separately. The global checkpoint records **production accepted 0 / UNKNOWN total**; it is not a backend implementation percentage.

Next: finish and publish private configuration; obtain a successful authorized remote SQL probe; complete the first source-defined transfer command with concrete gateway, HTTP authorization, transactional durable journal and receipt. Continue independent contract and source work while environment evidence is missing. All Medcom schedules remain OFF; no schedule state proves writer termination. Use positive custody handoffs and the existing I02 lease.
