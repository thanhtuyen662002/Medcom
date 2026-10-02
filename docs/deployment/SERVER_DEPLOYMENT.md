# Server candidate — not a production release

The package contains the .NET 10 API and an exported Next.js/React frontend served from the same ASP.NET process/port. SQL Server remains authoritative; no database is created or modified by this package. No Tool.dll or private archive is included.

## Current admission

**BLOCKED_SOURCE_AND_RUNTIME_ACCEPTANCE.** The login/session UI is implemented, but the default identity adapter returns `identity_unavailable` and readiness returns 503. There are no enabled business screens, SQL handlers or production ERP credentials. Installing this candidate does not provide a working ERP for real users.

The approved ERP and SQL archive file references returned `403 user_mismatch` in the current interactive account on 2026-10-02. Title search, shortened title search, owned uploaded-file listing and Shared with me listing did not resolve accessible ZIPs. The current Page contains `ERP_Medcom2026.zip` (162,176,322 bytes) and `MedData-Data.zip` (134,249,929 bytes), but the available file interface cannot download those Page references; only metadata was read. Their sizes differ from the approved archives. This is an access limitation, not proof of absent files. The owner must attach accessible copies; their SHA-256 must match `docs/SOURCE_BASELINE.md` or a new baseline must be explicitly recorded.

After access is recovered, inspect Tool.dll/Tools.dll and dependencies, exact login call path, credential verification, startup DDL and global state before runtime execution. Use a disposable isolated DB for compatibility/integration testing. Do not bypass the legacy password mechanism. The conservative host is an isolated Windows/.NET Framework worker per authenticated ERP context until safer alternatives are proven. Raw binaries, dumps and secrets remain private.

## Build and package

From the repository root, with .NET SDK selected by `global.json`, Python 3, Node 24 and npm:

```bash
dotnet restore Medcom.slnx --locked-mode
dotnet test Medcom.slnx -c Release --no-restore
cd src/frontend
npm ci
npm test
npm run typecheck
npm run build
cd ../..
python tools/deploy/package.py
```

The candidate ZIP is `artifacts/medcom-server-candidate.zip`; its file hashes and blocked release status are in `manifest.json`. It is framework-dependent: the server needs the matching ASP.NET Core .NET 10 runtime. No external Node service is needed at runtime.

## Staging start

Extract into a dedicated application directory. Set an explicit host allow-list and supply HTTPS through trusted reverse proxy/IIS or a configured Kestrel certificate. The `__Host-` cookies require HTTPS. No CORS is opened. For a private loopback upstream, start from that directory:

```bash
dotnet Medcom.Api.dll --urls http://127.0.0.1:5100 --contentRoot .
```

With TLS terminated at a proxy, trusted forwarded-header handling is required **before** enabling login; this candidate deliberately does not trust arbitrary forwarded headers. A direct HTTPS Kestrel endpoint can be configured using `Kestrel:Endpoints` and a privately managed certificate. Do not pass password secrets in command arguments or commit them to appsettings. Set `AllowedHosts` to the real site hostname through deployment configuration.

Data Protection key material must be privately persisted/encrypted with access limited to the service account. Session tokens remain in protected cookies; only hashes are indexed by the server session store. The initial bounded session store is single-instance/in-memory: restart revokes all sessions. Do not enable multiple replicas without a reviewed distributed session store and fencing. Session defaults: 1440 idle minutes, 10080 absolute minutes, 10000 concurrent sessions; deployment settings are `Session:IdleMinutes`, `Session:AbsoluteMinutes`, `Session:Capacity` and are range-checked.

## Release acceptance still required

- Verified Tool adapter, valid/invalid ERP credentials, concurrent distinct users and tenants, logout/revoke, initialization side effects and timeout isolation.
- Sanitized SQL catalog, exact DTO/query/command/effect bindings, transactions, idempotency, authorization and concurrency evidence for every enabled business screen.
- Real login → navigation → Grid → allowed save/approve/export → logout flows against a disposable representative environment; large-dataset performance and accessibility acceptance.
- Recovery, backup/restore, ledger retention, deployment/rollback rehearsal and the outstanding R2J export findings.
- Independent review and exact-head CI; server host/TLS/secrets configuration and observable ready health.

Polling never extends idle lifetime. Only the explicit, CSRF-protected Continue Session operation does. Authority revalidation happens on every authenticated HTTP request; permission versions can advance without relogin, and principal/tenant/company mismatch retires the session.
