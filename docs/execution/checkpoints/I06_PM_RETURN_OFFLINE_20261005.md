# I06 — PM Return offline checkpoint

Admission: Draft PR #58; immutable control `8d3e81997455a593f32e0d98af44ffba8d2fe713`,
claim `medcom-claims/g45/direct/I06`, run `6adc7914-17ab-4eb0-9120-f9a7f8f513af`,
base `0091f9aa62e980e6d1a6b84fb616d013ac417c6b`. Parent is the sole publisher.
The live claim/run/base/PR head were read before an isolated laptop checkout.
I05 remains frozen and its working tree is preserved.

Implemented within the exact new-file scope: conservative PM Return preparation,
immutable technical state-equality snapshot, separate stable submission identity,
transaction-bound SQL authority reader and parameterized source command plan/factory.
The shared execution fingerprint v1, action catalog, API/DI/capabilities/readiness,
FE, package locks and SQL schema are unchanged. No concrete journal/gateway is registered.

Direct static local SQL/DLL hashes match the owner source round. Complete SQL
declaration counts, 39 selected transfer definitions, six stored trigger versions
and all twelve command fingerprints reconcile. No full original ERP source-code
or ZIP hash equivalence is inferred from the extracted folder. Technical source
bindings and stricter-policy limits are recorded in `docs/backend/PM_RETURN_OFFLINE_CONTRACT.md`.

## Verification

SDK: portable Microsoft Windows SDK 10.0.401, SHA-512 verified against official
release metadata before extraction. No system SDK installation was performed.
Observed locked restore PASS using a workspace-only public NuGet configuration/cache;
Release build PASS with analyzers, zero warnings and zero errors. All 219 offline
backend tests PASS, zero failed/skipped, including 57 new I06 cases. They ran as two
complete disjoint groups: 200 non-runtime/non-server-configuration cases with a
synthetic disabled-Legacy private config, and all 19 server-configuration cases
without the process-wide private-path selector. That selector otherwise overrides
one test's deliberately supplied path; no existing test or product configuration was changed.
The initial run exposed reason-edge-whitespace and malformed-UTF16 test-transport
issues; owned fixtures/validation were corrected without changing shared admission v1.
TRX evidence remains private in the laptop workspace (`i06-offline-core.trx`,
`i06-config.trx`). A PowerShell mirror of the five project architecture checks PASS;
the Python policy/reference/catalog checks and remote CI are not claimed as run here.
Local review checked exact scope, source types, bounded immutable inputs, resource
ownership, failure paths and absence of gateway registration. This is the author's
local review, not the parent's independent review.
SDK first-run printed a development-certificate message; a subsequent read-only
current-user ASP.NET certificate lookup found none. Further commands disabled
automatic certificate generation. No certificate trust/install action was requested.
No private SQL connection/execution, owner Tools.dll execution, migration or deployment occurred.

## Handoff gates

Candidate source/tree hashes and sanitized patch are handed to the parent after
local checks. Parent independent review and exact-head/base CI remain required
before publication/integration. No production acceptance or deadline is claimed.
Durable journal/replay, complete concurrency/ABA policy, actual SQL transaction/lock
evidence and target/API acceptance remain open. Reader/factory isolation/type checks
are offline contracts; successful live transaction binding is not yet proved.
