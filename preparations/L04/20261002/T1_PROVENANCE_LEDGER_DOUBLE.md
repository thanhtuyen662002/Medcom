# T1 provenance-ledger behavior double

Status: local preparation only against main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.

`provenance_ledger_double.py` models the fail-closed source/build/runtime chain without loading a DLL, reading raw source, calling Tool/SQL, or contacting any runtime. The immutable sanitized fingerprint identifies the observed assembly named `Tools`; `Tool.dll` is accepted only as shorthand for that same fingerprint and never manufactures a second binary.

The five links—source archive, source project, reproducible build, binary match and current deployment—start `UNKNOWN`, must be verified in order with complete evidence identity, and use a version check to reject stale updates. Every link map is replay-derived from an immutable typed event history; direct construction cannot fabricate verified state. Version must equal history length, event state must match the transition, evidence digests use exact uppercase SHA-256 shape, and an exact prior observation cannot be replayed as new evidence. Any observation clears downstream conclusions. Candidate binding becomes possible only when all five links are verified; this still does not authorize runtime loading or establish session/effective-scope behavior.

The 35 tests cover exact SHA-256 identity shape, typed versions/states/evidence, replay-derived immutable link maps, direct-constructor forgery, version/history mismatch, evidence-state mismatch, digest and structured-field canonicalization, duplicate evidence replay, evidence promotion, out-of-order/stale updates, aliases, second-binary claims, partial chains, upstream revalidation invalidation and mismatch propagation. Exact verification procedures, source access, private dependencies, isolated Windows/database runtime, startup behavior and deployment identity remain `UNKNOWN/NOT_RUN`.

Run locally:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 preparations/L04/20261002/test_provenance_ledger_double.py
```
