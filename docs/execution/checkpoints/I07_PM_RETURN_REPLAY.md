# I07 - PM Return replay checkpoint

Admission: Draft PR #59; immutable control
`bd34d244c0a5a218b4314ea5cb3580b4cc8dc5c5`, claim
`medcom-claims/g45/direct/I07`, run `d821ac64-2845-479b-81e8-51f60944ea66`,
base `978c1d2c447c7229759ab4fb393ef8fb2e23eb18`.
Claim blob `acb8ee956db92bb0e19905c3d7c6bd67f1229311` was verified unchanged.
The parent is the sole GitHub publisher. The laptop uses an isolated I07 checkout;
I05/I06, other runs and existing shared/Audit/API/DI/FE paths are preserved.

Implemented within five new owned files: immutable server journal correlation and
current-authority snapshots, stable submitted intent using I06's unchanged identity,
pure replay decision policy, adversarial synthetic offline tests and the journal
contract. The inherited sixth scope path (claim) is unchanged. All decisions deny
dispatch. A complete correlated committed receipt is returned as the original
object after current authorization; unresolved keys stay blocked, explicit absence
requires separate fresh admission, and changed intent/source policy conflicts.
Shared v1, action catalog, storage, SQL schema, registrations and readiness are unchanged.

## Verification

Portable Microsoft Windows SDK 10.0.401 uses the previously checksum-verified
workspace SDK. Locked restore passed using the workspace public NuGet configuration
and cache. Release build passed with analyzers: zero warnings, zero errors.
All 292 offline backend cases passed, zero failed/skipped, including 73 new I07
cases. The 73 policy cases also passed separately in the restricted sandbox.
The complete regression suite ran under the owner identity in two disjoint groups:
273 non-runtime/non-server-configuration cases with a synthetic disabled-Legacy
private configuration, plus all 19 server-configuration cases with that process
selector unset. No test was removed, changed or permanently excluded. I06's
separate control diagnosis established that ten existing X509/DataProtection
fixtures fail under the restricted sandbox identity; this rerun neither changes
certificate/ACL settings nor represents independent review.
Private TRX artifacts are `i07-policy.trx`, `i07-offline-core.trx` and `i07-config.trx`.
A PowerShell mirror of the repository's five project architecture/reference checks
passed. Python policy/catalog checks and GitHub CI are not claimed as run here.
Local review checked fail-closed current authorization, every correlation field,
branch immutability/bounds, non-reexecution after status change and exact file scope.
Private TRX/log artifacts stay in the laptop workspace; synthetic examples contain
no real records, credentials or submitted production reasons. Local author review
does not replace parent independent review and exact-head/base CI.

## Open acceptance

`docs/backend/PM_RETURN_JOURNAL_CONTRACT.md` records exact key/source/receipt binding,
current result visibility, dispositions and producer freshness requirements.
This is an offline contract, not durable storage or a real SQL commit receipt.
Unique reservation, schema/storage, atomic effect/log/journal commit, reconciliation,
restart and nested rollback, WinForms concurrency, monotonic/ABA policy, trusted TLS,
target authorization and full production/API acceptance remain open. No SQL connection,
owner DLL execution, secret inspection, tunnel, deployment or remote mutation occurred.
The parent receives the frozen candidate hashes and sanitized local patch only
after the local checks; publication/integration require its independent review/CI.
