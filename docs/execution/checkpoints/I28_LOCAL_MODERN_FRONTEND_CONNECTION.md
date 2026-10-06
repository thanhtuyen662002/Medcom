# I28 local modern frontend connection

Control: `e5e7dc8818f5dd2356e2e08e373febda93986fff`; base main
`2c80c4fb886c52550a0532d47a00d9e783d3e969`, tree
`136ce01b7534c703c12fa799fe37b210e557a3ba`.
The immutable I28 marker is preserved. Root is the sole publisher.

The modern frontend is already the owner-approved visual design. The accepted
standalone artifact could not be connected to the existing localhost API by
configuration alone: its production BFF deliberately rejected localhost and
required HTTPS public provenance. I28 adds a strict explicit local mode and a
separate loopback TLS host, preserving deployed-DNS defaults and all BFF guards.
Production API/CSP/authentication/SQL and UI/state files remain unchanged.

Implementation:

- Only literal `MEDCOM_LOCAL_HTTPS=1` admits paired canonical HTTPS localhost
  origins with explicit ports; invalid/mixed/ambiguous forms fail closed.
- The .NET 10 helper selects an explicit existing trusted CurrentUser devcert
  without export or store changes. It has one fixed Node loopback target,
  exact Host/method/path checks, bounded bytes/cancellation, controlled header
  and cookie relay, and no proxy discovery, cookie jar or redirect following.
- The Windows launcher requires explicit `-NodePath` to official portable
  24.21.0 Windows x64, verifies executable/package hashes, clears unsafe inherited
  child settings, proves Node system-CA API TLS and owns only its child processes.
- The separate fixture runs the built modern app, real shipping relay and BFF
  against a synthetic HTTPS API. It is never uploaded with the operator host.
- Existing aggregate gates remain. New .NET projects use only framework/project
  references. Root's [PR80 scope amendment](https://github.com/thanhtuyen662002/Medcom/pull/80#issuecomment-6016677717)
  permits the three project-graph lockfiles; all external package versions and
  content hashes remain unchanged and locked restore is retained.

Source-only validation at preparation time:

- 26 focused BFF/policy/runtime-route tests PASS.
- 2,520 production-mode differential comparisons against control PASS.
- JavaScript syntax, architecture, CI policy and policy regressions PASS.
- C# build/xUnit, built-app browser gate and Windows PowerShell launcher checks:
  **NOT_RUN locally** because the required SDK/application toolchain is absent.
  Hosted current-head/base CI and independent source/security review are required.
  Source-derived xUnit/browser counts are not execution results.

Official Node provenance: [24.21.0 SHASUMS](https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt)
and [release record](https://nodejs.org/en/blog/release/v24.21.0) agree on ZIP
`158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541`
and Windows node.exe
`ba4e6d110e8c1592a1ecd390f6b05f3da124b13871a5be62b341a07a853c6c32`.
The owner reported the ZIP checksum matched. Global Node22 and PATH are retained;
actual owner execution/trust/login are not claimed by this implementation.

Synthetic certificates are freshly generated test material only. Root separately
approved a memory-only PFX normalization for Windows Schannel, matching existing
fixtures; exported bytes are immediately zeroed. Production certificate selection
never exports a key. No PFX file is written; default import may use platform
temporary key storage, normally cleaned on certificate disposal. No owner
certificate/trust-store mutation or validation bypass is introduced.

Runtime/business admission remains blocked. No real owner execution, SQL access,
credential handling, device-camera acceptance, deployment or business write is
performed in this lane. Cookie host/port sharing and the separate I29 browser
tab-return investigation are recorded in the deployment guide.

## Observed CI repairs through R4 preparation

R1 resolved an actual ambiguous C# catch type. R2 fenced hosting URLs/preferences
captured before configuration clearing and corrected protocol-specific fixture
expectations without dropping cases. R3 supplied an empty writable configuration
provider after clearing inherited sources. Both OS then executed 1,547 backend
cases: 1,546 passed, one exact-limit chunked upload failed because Kestrel also
counts HTTP chunk framing. The listener/forwarding regressions passed on that run.

Root approved R4's finite HTTP/1.1 chunked transport allowance: route decoded
limit plus 64 KiB. The decoded 16 KiB/1 MiB limits, exact streamed positive,
decoded-overflow refusal and no-upstream assertions remain. New raw excessive
chunk-extension proof checks the finite envelope independently. The application
buffer reads at most decoded limit+1; no global/unlimited limit is introduced.

R3 Linux built-app evidence passed actual HTTPS login/cookies and both 320/390
Workspace list/detail scenarios. Its following hostile HTTP-Host test was stopped
by Node's own TLS hostname check, because Node inferred SNI from that Host. R4
keeps CA/hostname verification and explicitly authenticates localhost TLS for
that negative HTTP test, retaining the relay400 assertion. No production TLS
bypass is added. R4 full runtime results remain pending the next exact-head CI.
