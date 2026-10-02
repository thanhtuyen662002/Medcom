# Server candidate — release acceptance is still open

The ZIP contains the .NET 10 API, exported Next.js/React frontend and isolated password worker. The same ASP.NET HTTPS endpoint serves the frontend and API; Node is only needed at build/test time. This package never creates or upgrades an ERP database. Owner DLLs, dumps, connection secrets and production records are not included.

## Implemented and verified

Accessible owner archives were hashed and a new source set recorded in `docs/SOURCE_BASELINE.md`. The exact Tools.dll normal stored-password subset ran successfully on Linux/.NET 10. The worker is process-isolated, pins the DLL bytes, denies wrong/malformed credentials and excludes the legacy system-password exception. The complete legacy engine is not certified by this subset.

The SQL adapter reads canonical accounts/groups, rejects disabled/missing/ambiguous matches and revokes changed credentials/groups. Two optionally enabled pilot screens list purchase orders and inbound requests through typed, scoped, parameterized queries. Explicit current menu/grants and branch assignments are checked on the server and at SQL execution; no arbitrary SQL or identifier is accepted from a browser. Fields shown are document ID/date/branch/status/lock only. Save/approve/post/delete/export/report operations are not enabled.

A real owner-DLL + disposable SQL Server + HTTPS browser test covers login, purchase-order Grid/search, other-branch denial and logout/replay. Only synthetic fixture rows were inserted, using ten source table DDLs. The data dump was not restored. Details and limitations are in `docs/erp/OWNER_SOURCE_RECOVERY_20261002.md` and `inventories/source/20261002/runtime-receipt.json`.

## Current admission

**BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE.** Default configuration keeps the legacy adapter and business pilots disabled. An unconfigured login returns 503. With the verified adapter explicitly configured, valid ERP credentials can open the read-only workspace; this still does not establish a complete ERP release for real users.

A bounded background monitor checks schema and a public synthetic pure-DLL health vector every 30 seconds. Health polling serves the cached snapshot and does not start SQL/process work or extend a session. Dependency checks can be healthy while `/health/ready` remains 503 because business release acceptance is open. There is no configuration flag that silently overrides this gate.

Seven internal-transfer edit/delete check procedures referenced by the current configuration are absent from the dump's executable schema. Their current definitions require a schema-only export or a representative staging DB. Full effects, approvals, transaction/idempotency/concurrency semantics, durable security audit, exports, operational recovery/performance, independent review and deployment-host acceptance are still required.

## Build and package

From the repository root with the SDK in `global.json`, Node 24, npm and Python:

```bash
dotnet restore Medcom.slnx --locked-mode
dotnet build Medcom.slnx -c Release --no-restore
dotnet test Medcom.slnx -c Release --no-build --filter 'Category!=LegacyRuntime'
cd src/frontend
npm ci
npm test
npm run typecheck
npm run build
cd ../..
python tools/deploy/package.py
```

`artifacts/medcom-server-candidate.zip` contains a checksummed `manifest.json` with the blocked release status. Both the API and password worker need the matching ASP.NET Core/.NET 10 runtime. Full owner-DLL tests are separate from ordinary CI because raw private DLLs/data cannot be committed to this public repository; see `tools/legacy/README.md`.

## Configure isolated staging

Extract into a dedicated directory. Use direct trusted HTTPS Kestrel or a correctly configured IIS host, an explicit `AllowedHosts` hostname and private service-account access to the DLL. The owner supplies the unchanged `Tools.dll` outside `wwwroot`; its required SHA-256 is `aa8910f3ba244fc405ccad2d322d142d40f938be3da94277ccd8d0814082dd61`. A different build is rejected and requires a new verification round.

Set these server settings through private deployment configuration, not browser JSON or command arguments:

| Setting | Meaning |
|---|---|
| `Legacy:Enabled` | Explicitly enable the verified identity adapter; default false |
| `Legacy:ConnectionString` | Dedicated ERP SQL database; encrypted connection and trusted server certificate required |
| `Legacy:ToolsPath` | Absolute private path to the pinned DLL |
| `Legacy:DotnetPath` | Trusted dotnet executable; defaults to the service PATH |
| `Legacy:TenantId`, `Legacy:CompanyId`, `Legacy:CompanyName` | Trusted deployment-to-database binding; never supplied by the login form |
| `Legacy:EnableReadOnlyPilots` | Explicitly enable the two verified query shapes; default false |
| `AllowedHosts` | Real host allow-list |

Environment-variable equivalents use double underscores (for example `Legacy__ToolsPath`). Do not commit credentials or put passwords in argv. Use a SQL login limited to SELECT on `SY_User`, `SY_UserGroup` and, for pilots, `SY_Menu`, `SY_UserGroupPermisstion`, `SY_UserPermisstion`, `SY_UserBranch`, `AP_OrderTbl`, `IV_InboundRequestTbl`, `AP_OrderDetailTbl`, `IV_InboundRequestDetailsTbl`; do not grant DDL/admin/write privileges. Table access alone is not a user grant. Users/groups/menus must be enabled and explicit permission bits/branch assignments must exist.

Start from the extracted directory with a privately managed Kestrel certificate and endpoint configuration:

```bash
dotnet Medcom.Api.dll --contentRoot .
```

The `__Host-` cookies require HTTPS. The API does not trust arbitrary forwarded headers. A proxy that terminates TLS and forwards HTTP needs reviewed trusted-proxy handling before login can work; direct HTTPS avoids that missing binding. No CORS is opened.

Data Protection keys must be privately persisted/encrypted with service-account access only. The bounded in-memory session store is single-instance: restart revokes all sessions. Multiple replicas require a reviewed distributed store and fencing. Defaults remain 1440 idle minutes, 10080 absolute minutes and 10000 sessions; accepted explicit Continue Session advances activity, passive reads/polling do not. Logout and credential/company/tenant changes fence previous sessions.

Before a production release, validate the real server OS/runtime, host/TLS/secrets, current full SQL schema and legacy definitions, all business effects, backup/restore and rollback, large-dataset behavior, auditing and exact-head independent review/CI. This candidate is suitable for controlled staging verification, not an accepted production ERP.

The configured pilots also require SELECT on the two detail tables listed above. Detail routes expose only fixed source identifiers/quantities and recheck parent scope. The HTTPS runtime flow additionally tests both detail shapes, exact quantities, other-branch/missing 404 equivalence, keyboard focus and contained mobile tables. The business release gate remains unchanged.
