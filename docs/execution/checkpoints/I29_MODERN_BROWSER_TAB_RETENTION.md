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


## Live-preview lifecycle correction

The initial synthetic success did not cover continuously advancing native
observations in the actual compiled purchase-request reader. Source inspection
identified two distinct defects: every healthy background timer masked generic
read data and replaced its query generation; purchase-request reads bypassed the
parent's blocked context, allowing a current403 to amplify into repeated parent
workspace/read cycles. The original reason for any owner-side403 remains UNKNOWN.
No private owner row, identity or configuration value is part of this evidence.

The correction preserves the periodic authority/data/document-grant checks.
Same-scope healthy background reads retain the verified read-only list/editor
DOM and local controls, while an explicit verifying flag blocks new commands
throughout the parent-to-document pipeline. It does not retire an already
in-flight intent solely because a check starts. Changed grants, denied authority,
known read errors, logout and expiry keep their masking/custody fences. A GET
superseded by an accepted command receipt is discarded before publishing data
or grants, then refreshed without replacing the receipt with a false failure.

A Linux-only compiled negative control builds exact pre-fix
`2712d00532cd76b0cc4eae44ede04314f38e812f` using the identical locked dependencies
and the same current synthetic HTTPS fixture. It must observe specific broken
behavior, not merely any failure. Corrected compiled regression runs on Linux
and Windows, including monotonic observations, held authority/grant reads,
dirty/pending intent, ACK/read order, persistent403, recovery and revocation.
Missing browser/bootstrap/transport prerequisites must fail the harness.
At local source freeze these new compiled checks remain NOT_RUN; hosted results
are required. This correction does not establish real ERP/business acceptance
and does not alter backend authorization, cookies, CSRF or scope generation.
