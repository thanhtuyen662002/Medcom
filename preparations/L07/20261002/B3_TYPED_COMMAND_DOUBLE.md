# B3 typed-command admission double

Status: local preparation only against main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.

`typed_command_double.py` models the fail-closed boundary before handler dispatch. The browser supplies only a registered action, contract version, metadata hint, typed payload, business reference, idempotency key and correlation ID. The server derives authority, generations, defaults, resolved metadata revision and semantic fingerprint. Exact scalar types prevent booleans or truthy strings from impersonating revisions and gate results; each payload field has a reviewed primitive type and must be finite canonical JSON.

Registry, authority, payload and defaults are defensively copied and exposed read-only. Controlled registry replacement requires a higher registry revision for every semantic change. Dispatch rechecks the complete contract/metadata/registry tuple, authority generations, typed payload, server defaults, reference/state gates and a fingerprint that includes the business reference and all server-resolved semantics.

The 43 tests cover dynamic handler names, schema/mass-assignment and scalar-confusion attacks, authority injection, malformed envelopes, immutable snapshots, retired/unverified bindings, state/ownership changes, registry and generation races, deterministic server fingerprints, dispatch tampering, and transport ambiguity. No handler, transaction, SQL procedure, audit hook, outbox or product runtime is executed. Exact command signatures and effects remain blocked on B2/T1/B4 evidence.

Run locally:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 preparations/L07/20261002/test_typed_command_double.py
```
