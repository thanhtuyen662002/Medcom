# Local smoke of the existing modern Medcom frontend

I28 connects `apps/medcom-sites` to the owner's existing HTTPS API. It keeps the
approved UI, production API, CSP, authentication and SQL configuration unchanged.
This is an interactive loopback smoke, not a service installation or business
release. The bundled `src/frontend` smoke is a separate interface.

## What runs

Browser `https://localhost:5187` → the small .NET TLS host → Next standalone
`http://127.0.0.1:3100` → BFF → existing API `https://localhost:5186`.

The host selects the explicitly named, already trusted ASP.NET development
certificate from the current Windows user's `My` store. It requires the localhost
SAN, development marker, server-auth usage, valid lifetime, system trust and an
accessible private key. It opens the store read-only. No key is exported, no
certificate is created/trusted, and no global trust setting is changed. Unknown
or inaccessible certificates fail with a specific `certificate_*` code.

Use the same Windows account that owns and trusts the existing development
certificate. A different user or service account is not assumed to have access.
The TLS host binds only loopback. It has one fixed Node upstream, checks exact
Host, strips supplied forwarding headers, preserves the browser Origin, filters
cookies, bounds request bodies and cancellation, and never follows redirects.
The BFF still verifies exact origin, fetch metadata, CSRF, scope, methods, paths
and original command bytes. Its API hop uses real validated HTTPS.

The new private setting `MEDCOM_LOCAL_HTTPS=1` opts into **paired exact**
`https://localhost:<explicit-port>` API/public origins. It rejects HTTP, IPs,
aliases, credentials, path/query/fragment ambiguity and mixed local/public
origins. Missing or unrecognized mode keeps the existing production DNS policy.
This is independent of `NODE_ENV`: standalone Next remains a production build.

## Prerequisites and verified downloads

Obtain the Windows x64 frontend and local-host artifacts from the same successful
reviewed source revision. Verify their outer ZIP SHA-256 against the exact CI
artifact receipts before extraction. Extract each into a separate new empty local
directory; never overlay a previous release. Keep the launcher/helper outside the
frontend root. Both manifests retain `BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE`.

The original PR78 frontend ZIP was 5,305,746 bytes (5.06 MiB), below the 20 MB
handoff cap; later artifact size must be measured again. The standalone package
contains its runtime JavaScript dependencies, not Node. No pnpm, npm install,
frontend build or source checkout is required on the owner's machine. The helper
is framework-dependent and requires the existing .NET/ASP.NET Core 10 runtime;
it requires no new NuGet packages or owner SDK.

The owner's system Node is v22.14.0 Windows x64. Preserve it. Use a dedicated
portable **Node 24.21.0 Windows x64**, passed explicitly with `-NodePath`.
Download directly on the owner machine from the official version-pinned source:

- [Windows ZIP](https://nodejs.org/download/release/v24.21.0/node-v24.21.0-win-x64.zip)
- [Official checksums](https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt)
- [Official release record and signed checksum text](https://nodejs.org/en/blog/release/v24.21.0)

The ZIP is listed at about 38 MB. Do not redistribute it through the 20 MB upload
channel or put it inside a Medcom artifact. Retrieve over normally validated
HTTPS, match exactly one `node-v24.21.0-win-x64.zip` checksum line, and require
`Get-FileHash -Algorithm SHA256` to match both that line and this pinned value:

`158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`

Extract into a dedicated new directory, without an MSI or PATH change. The
launcher also verifies official `win-x64/node.exe` SHA-256 before executing it:

`ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32`

These values were read from the official versioned SHASUMS and release page.
This checksum comparison is not a claim that a PGP signature was independently
verified. The owner reported the ZIP hash matched; executable version/path and
target smoke remain separate observations. A possible extraction is
`D:\Installers\node-v24.21.0-win-x64\node.exe`; the launcher never assumes it.

Node does not gain dev-certificate trust merely because the browser trusts it.
The launcher explicitly uses `--use-system-ca`, supported by Node 24 on Windows,
then requires that **the selected Node process** successfully fetch the existing
API's `/health/live` using full certificate/hostname validation. It clears
inherited Node options, proxy variables and extra-CA variables from its children.
No `NODE_TLS_REJECT_UNAUTHORIZED=0` or `ignoreHTTPSErrors` is supported.
See [Node system certificate behavior](https://nodejs.org/download/release/v24.21.0/docs/api/cli.html#--use-system-ca).

## Operator invocation after artifact approval

Read-only checks, with the actual portable path:

```powershell
& 'D:\Installers\node-v24.21.0-win-x64\node.exe' -p 'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch})'
dotnet --list-runtimes
Get-ChildItem Cert:\CurrentUser\My |
  Where-Object { $_.Extensions.Oid.Value -contains '1.3.6.1.4.1.311.84.1.1' } |
  Select-Object Thumbprint,Subject,NotAfter,HasPrivateKey
```

Select the existing certificate explicitly. Do not print/export private keys or
share private configuration. If there is no suitable certificate, stop and report
the exact certificate error; the launcher does not repair trust or install one.

Run the verified launcher from the separately verified helper directory. Replace
all placeholder paths, the exact 40-character tested revision and thumbprint:

```powershell
& '<helper-directory>\Start-MedcomLocalFrontend.ps1' `
  -FrontendDirectory '<verified-frontend-directory>' `
  -HostDirectory '<verified-helper-directory>' `
  -ExpectedRevision '<exact-reviewed-40-character-revision>' `
  -NodePath 'D:\Installers\node-v24.21.0-win-x64\node.exe' `
  -CertificateThumbprint '<existing-40-character-thumbprint>'
```

Ports may be explicitly selected with `-ApiPort`, `-FrontendPort`, `-NodePort`;
they must be distinct, unused for the new listeners and in 1024–65535. The API
port must identify the already authorized running API. No process is killed to
free a port. No backend restart, IIS/service registration, firewall, PATH, DNS,
machine environment or execution-policy change is performed. If local script
policy prevents execution, report it instead of bypassing it.

The launcher verifies both package inventories/hashes/revision, the exact portable
Node, certificate accessibility/trust, API TLS, available ports and frontend TLS
readiness. Keep its terminal open and visit the printed HTTPS URL. Ctrl+C or a
child failure stops only its own two frontend processes. Stopping this frontend
does not stop the API. Session expiry is still enforced by the API.

All private runtime settings are child-process-only:

| Setting | Default local value |
| --- | --- |
| `HOSTNAME` | `127.0.0.1` |
| `PORT` | `3100` |
| `NODE_ENV` | `production` |
| `NEXT_TELEMETRY_DISABLED` | `1` |
| `MEDCOM_LOCAL_HTTPS` | `1` |
| `MEDCOM_PUBLIC_ORIGIN` | `https://localhost:5187` |
| `MEDCOM_API_ORIGIN` | `https://localhost:5186` |

No browser environment variable, CORS relaxation, arbitrary forwarded host,
backend HTTP URL or private SQL/DLL setting is added to the frontend.

## Cookie/session and smoke boundaries

Browser requests remain same-origin `/api/erp/...`. Login first obtains CSRF,
then posts credentials through the BFF. The only relayed cookies are
`__Host-Medcom.Session` (including ASP.NET chunks) and `__Host-Medcom.Csrf`, with
Secure, HttpOnly, Path=/ and no Domain. The API uses SameSite=Strict. Cookie names
are **host scoped, not port scoped**: direct `https://localhost:5186` and this
frontend can share the same localhost cookies. They are not separate login jars;
logout/rotation from either tab can affect the same server session. Use the same
intended backend and avoid unrelated localhost apps reusing these cookie names.

Only after target smoke is authorized, check layout, login, permitted list/detail,
logout and error recovery. Business writes remain unavailable unless separately
implemented/admitted. `/health/ready` can remain 503 for blocked release acceptance;
do not bypass or relabel it. This loopback route supports mobile viewport testing
on the same computer; it is not a phone-accessible network deployment.

The source contains a separate possible browser-tab-return selection issue in
the purchase-order screen when authorityVersion advances. I29 owns that follow-up;
I28 neither redesigns the UI nor claims to fix hidden→visible continuity.

## Synthetic CI evidence

The existing frontend/backend checks remain mandatory. I28 additionally builds
the actual standalone app and shipping TLS relay and tests browser login,
cookie/CSRF/session/logout, mobile list/detail, security headers, malformed
Host/Origin, body limits/bytes, default-off admission and actual BFF upstream TLS
failure. It records 320/390 Workspace screenshots under the **I28** evidence name.
Earlier I21 host screenshots are not relabeled as Workspace screenshots.

The separate test-only project generates an ephemeral CA/localhost leaf. A
disposable test-key-only in-memory PFX roundtrip supports Windows Schannel; PFX bytes
are zeroed immediately and no PFX file is written. Only newly generated disposable
test material is imported; platform temporary key storage may be used, with normal
cleanup on certificate disposal. No owner certificate or trust store is changed. The
test Node child adds its public test CA to normal Node validation, and the isolated browser pins the
exact generated leaf SPKI. Neither mechanism exists in the production launcher.
The API is an explicit synthetic HTTPS double. These results establish no owner
certificate trust, real SQL/DLL qualification, physical-camera acceptance or
production/business-write activation. Those remain separately observed gates.
