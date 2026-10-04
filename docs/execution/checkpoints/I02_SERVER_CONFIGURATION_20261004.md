# I02 server configuration checkpoint

Goal #45; active Draft PR #53; parent/control head `7cc37cab99e6a75361ecd0ab06051353c7341700`. Scope: `I02_SERVER_CONFIG_SCOPE_20261004.json`. Read live PR head for publication/CI.

Implemented: `ApiHost` private loader, shared validated `ConnectionStrings:Medcom`, legacy compatibility, default `D:\Config\appsettings.Private.json`, selectable server-local directory via non-secret ProgramData bootstrap, masked-password setup UI, protected atomic persistence. Existing authentication/write gates remain unchanged. No Sites/frontend edits.

Source paths: `src/backend/Medcom.Api/ServerConfiguration.cs`, `ApiHost.cs`, `tools/deploy/Configure-MedcomServer.ps1`, its persistence test, `tests/backend/Medcom.Api.Tests/ServerConfigurationTests.cs`, and `docs/backend/SERVER_CONFIGURATION.md`.

Verified locally: SDK 10.0.401 build 0 warnings/errors; 162 non-LegacyRuntime backend tests; 61 Python guards; PowerShell 5.1 and 7 suites; diff check. Independent agent review found no remaining blockers after selector/path/ownership/ancestor fixes. Agent review is not native GitHub approval. Owner-policy test uses an ACL view; unsafe-parent test uses actual synthetic ACLs. Fixtures use a restricted UserProfile directory because local Temp has sandbox writers.

Private placeholder file exists outside checkout; no real secret/connection is published. SQL target/runtime UNKNOWN. Main integration pending native latest-push approval. Production accepted: 0 / UNKNOWN full-scope denominator; no exclusions. Transfer SQL gateway, durable transaction audit/idempotency, HTTP commands, complete API contract and deployment/UAT remain incomplete.

Schedules remain owner-required OFF; no automation mutation and live readback UNKNOWN. Predecessor claims/handoffs preserved. Next: exact-head CI; package setup tool; verify authorized remote SQL when configured; complete source-backed transfer gateway/API. Goal stays active.
