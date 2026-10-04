# Windows backend candidate: owner-operated updates

This workflow supports preparation for a Windows 11 x64 desktop host. Windows
Server, ARM64, IIS and Windows-service operation are not certified by these
package tests. Hosting choice and its stop/start controls still require a
reviewed host-specific setup. This document performs no installation, service
change, SQL operation or deployment.

The frontend is separately hosted. Use the **backend** package profile below;
there is no bundled frontend and no Node/npm requirement for this build. The
legacy combined profile is retained for existing regression checks only.

## Separate source, releases and private settings

Keep the Git checkout, immutable release directories and private data separate.
Example layout (choose suitable local paths with trusted operator permissions):

- `C:\MedcomSource`: Git checkout, never a live application's content root.
- `C:\MedcomReleases\<revision>-<archive-hash-prefix>`: one new directory per candidate.
- `D:\Config\appsettings.Private.json`: existing private configuration outside both.
- `%ProgramData%\Medcom\backend\config-location.json`: existing private-path selector.
- Owner DLL, Data Protection keys, certificates and diagnostic logs: separately
  protected directories outside checkout/releases and served content.

Do not commit private files, embed them in candidate ZIPs, or place them under
`wwwroot`. A Git update must never copy over the private config or selector.
See [server configuration](../backend/SERVER_CONFIGURATION.md). Running its GUI
is a separate operator action; the update planner does not launch it. Existing
configuration is reused; updating application code does not require entering
credentials again. Verify the actual chosen host identity can read required
private files without granting broad access.

## 1. Prepare a candidate from a reviewed commit

Use the SDK version pinned in `global.json` and Python 3.10 or newer on a build
machine. A runtime-only host needs the appropriate trusted x64 .NET 10 and
ASP.NET Core 10 runtime, not Node. Runtime installation is a separate explicit
setup action. Check `dotnet --info` and `dotnet --list-runtimes` on the target;
SDK presence on the build machine does not prove target compatibility.

In the separate checkout, inspect `git status --short`; if it has user changes,
stop and preserve them. Fetch the current approved branch and update only with
`git pull --ff-only origin main`. Do not use `reset --hard`, `clean` or force
updates to resolve a conflict. Record `git rev-parse HEAD` and compare it to the
reviewed/CI-tested commit before building. A pull alone does not update a running
application.

From that clean committed source tree:

```powershell
dotnet restore Medcom.slnx --locked-mode
dotnet build Medcom.slnx -c Release --no-restore
dotnet test Medcom.slnx -c Release --no-build --filter 'Category!=LegacyRuntime'
python tools/deploy/package.py --profile backend
```

Do not proceed past failed tests or changed source. Source-free tests and
packaging integrity do not establish actual SQL/DLL, host or business acceptance.
The backend profile publishes framework-dependent DLLs with no platform apphost;
it does not select or install a Windows service, IIS host, certificate or runtime.
The API and isolated password worker both need compatible runtimes. Build in a
trusted operator-only workspace with no concurrent writers. Packaging rejects
links (including Windows reparse points/junctions), multiply linked files and
nonregular files in public inputs and publish output, and checks file identity
while reading. These checks do not create an atomic filesystem snapshot or
protect an actively hostile shared workspace; use isolated trusted builds.

Outputs are separate from the legacy combined candidate:

- `artifacts/medcom-backend-candidate.zip`
- `artifacts/medcom-backend-verify-package.py`
- `artifacts/medcom-backend-candidate.sha256`

The manifest is format 3 with `packageProfile: backend` and the exact source
revision. Release status remains `BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE`.
The default combined package still uses format 2. A successful checksum detects
changes; it does not prove who supplied the package. Obtain the ZIP, verifier
and expected hashes from the trusted reviewed publication, not an arbitrary
message or an unverified script extracted from a ZIP.

## 2. Verify without changing the host

First verify the standalone verifier's hash against the trusted published
checksum, then run it. The planner can run from a trusted checkout or a
previously verified extracted package. Substitute the approved full commit SHA
and archive SHA-256 below, not invented placeholders:

```powershell
Get-FileHash artifacts/medcom-backend-verify-package.py -Algorithm SHA256
python artifacts/medcom-backend-verify-package.py artifacts/medcom-backend-candidate.zip
python tools/deploy/plan_update.py artifacts/medcom-backend-candidate.zip --expected-revision <40-character-commit> --expected-sha256 <64-character-archive-hash>
```

The planner is always dry-run-only. It hashes and inspects the archive and prints
an ordered plan. It does not extract, read secret configuration, contact SQL or
HTTP endpoints, execute a shell, stop/start processes or write any deployment
files. `plan_valid: true` means the plan's package/revision checks passed;
`production_accepted` remains false.

## 3. Controlled staging switch and rollback

These are review steps, not executable service commands. Confirm the exact host
and account, binding controls and maintenance window before applying them:

1. Reverify the selected archive/revision. Extract with a trusted tool into a
   fresh, unique release directory. Reject an existing destination or any linked
   path; do not overlay the running application. Keep this directory immutable
   after extraction. Record its revision/hash privately.
2. Record the exact previous host binding and release path. Confirm private
   configuration, selector, DLL, certificates and keys remain outside the
   release; do not copy, rewrite or delete them. No database migration belongs
   to this update workflow.
3. Stop only the confirmed application's host using its reviewed controls and
   wait for confirmed stop. Never kill every `dotnet` process by name. Point the
   approved host to the new release, preserve its private environment and
   content-root settings, then start it once. Do not overwrite running binaries.
4. Check trusted HTTPS at the configured API hostname, for example
   `https://api.example.invalid/health/live`. This is process health only. The
   current `/health/ready` returns 503 while business release acceptance remains
   blocked, even if dependencies are healthy. Do not turn 503 into a pass, skip
   the gate or claim production release. Authorized SQL/schema/DLL checks and
   actual application smoke tests remain separate.
5. If startup or approved smoke tests fail, stop the candidate, restore the exact
   recorded previous binding, and start that previous release. Verify recovery.
   Preserve private diagnostics. Application rollback does not undo database
   writes, migrations or external effects; this workflow performs none.
6. Keep the previous release until the operator approves retention/removal. No
   automatic cleanup is provided. Restarts revoke this application's in-memory
   sessions, including when rolling back; users must sign in again.

Trusted HTTPS is required for `__Host-` cookies. Do not disable certificate
validation, SQL encryption or hostname checks to make setup pass. Proxy/TLS,
DNS/firewall and separate frontend-to-API integration require their own reviewed
configuration. This package does not enable CORS or supply production access.
