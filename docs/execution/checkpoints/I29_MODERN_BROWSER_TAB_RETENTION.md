# I29 — modern Workspace tab-return regression

## Bounded change

The existing modern UI is preserved. The generic purchase-order read view no
longer treats the authority observation counter as its selection/grid identity.
Only its in-memory controls survive a temporary visibility/authority/read block.
Rows and details require fresh verified responses before redisplay. Real session
or rights changes retire controls; late/canceled replies cannot restore them.

Two response-only, noncredential session/read markers bind generic workspace,
list and detail replies without changing public JSON or cookie/CSRF/native
authorization. Their hashes include the server-generated high-entropy session
token with distinct domain labels; raw credentials and principal identifiers
are never exposed. They are not accepted as request grants. I24 login custody
rotates for actual session replacement and stays separate from read generations.

## Verification at source handoff

- PASS: 11 actual navigation/helper Node tests.
- PASS: 15 focused production BFF Node tests, including exact marker relay,
  malformed/missing/unrelated/error suppression and request-header isolation.
  Two API-integrated proxy flows require the locked frontend dependencies and
  were not part of this focused run; no full-suite pass is asserted.
- PASS: JavaScript syntax checks for changed browser/integration tests and
  Node TypeScript stripping for dependency-free helper/proxy code.
- NOT_RUN: full frontend typecheck, lint, build, API/Zod suite and actual React
  browser gate locally; installed locked TypeScript/esbuild/Tailwind dependencies
  are unavailable. The browser command explicitly fails with this prerequisite
  rather than installing or skipping.
- NOT_RUN: C# compilation and HTTPS backend/relay tests locally; .NET SDK is not
  available. Hosted exact-head Linux/Windows CI is required.
- Existing I20/I21/I24 tests are retained, with synthetic read-marker fixtures
  updated. The composed Workspace browser gate and real local HTTPS relay/BFF
  marker assertion are required in hosted CI. No runtime/SQL acceptance claim.

## Custody

Historical admitted base: `2c80c4fb886c52550a0532d47a00d9e783d3e969`.
The lead owns publication and serial composition with I28. Shared relay/BFF,
fixture and workflow edits are separate I29 deltas over the explicitly handed-off
I28 bytes, including its subsequent CI repairs; they must not overwrite a moving
I28 author branch. No database/configuration/credential/install/publication work
was performed by the local implementation worker.
