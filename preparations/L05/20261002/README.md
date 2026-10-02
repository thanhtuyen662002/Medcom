# L05 configuration preparation — 2026-10-02

Seven bounded local packages prepare A5/#16, A7/#18 and R3/#26:

1. SY_* versus WebCore reuse/gap matrix.
2. Presentation-only immutable Screen Definition fixtures.
3. DAT/SY/user/admin source and precedence register.
4. Contextual compiler fail-closed fixtures.
5. Hash reconciliation, publish conflict and rollback state machine.
6. Legacy configuration write-back gate for delete/reinsert, concurrency, cache and recovery evidence.
7. Executable DAT admission gate binding exact source-set, compiler/build,
   authority, CAS publication and previous-good recovery evidence.

The hardened package adds six machine-checked `SY_*` reconciliation criteria,
14 Screen Definition fixtures, six explicit source-precedence conflicts, 20
compiler adversarial fixtures and 16 sync/rollback cases. New coverage includes
absent-versus-null override semantics, Unicode/case collisions, complete
source-set manifests, XXE/resource-amplification/path-escape denial, fenced
publisher epochs, mixed-generation scans and lost-acknowledgement recovery.
The write-back gate adds 12 mandatory evidence requirements and ten adversarial
cases. It stays `DISABLED_BLOCKED_UNKNOWN`; no source-free fixture can enable it.
Every unit is explicitly `NOT_RUN`; the validator rejects an execution claim.
The executable-DAT gate adds 12 mandatory requirements and ten adversarial
cases. It stays `BLOCKED_NO_EXECUTABLE_DAT_ADMISSION`: metadata compilation is
not runtime authority, and configuration never grants capability.

All source references pin merged main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`. Live readback found Draft #44 at remote head `8cea825ab9f8169e5dfe4543b7d315972f13971a`, owned by the L01 activation/bootstrap lane; it is not an L05 lease. A5/#16 and A7/#18 are waiting dependencies. R3/#26 is waiting evidence. L05 does not mutate those issues.

These files are local preparation only. No raw archive, customer/user configuration value, executable hook/SQL body, database connection, migration, compiler execution, GitHub mutation or CI run occurred. Existing evidence proves 13 named SY_* object identities, 232 DAT XML artifacts, a bounded 24-filter/600-row subset and an owner-guide index of 293 pairs. It does not prove current rows, complete precedence, executable grammar, per-screen runtime binding or additive storage gaps.

Every proposed physical WebCore record remains gated by the full B2 catalog, exact existing keys/indexes/dependencies and an explicit missing semantic. Presentation overrides cannot grant capability or widen data scope. Malformed, ambiguous or executable configuration retains the previous-good version. Legacy cache convergence remains separate Q3/A7 acceptance.

Validation commands:

```text
python3 preparations/L05/20261002/validate_preparation.py --repo .
python3 preparations/L05/20261002/test_preparation.py
```

## New A7 behavior preparation

`config_publish_double.py`, `test_config_publish_double.py` and
[A7_CONFIG_PUBLISH_DOUBLE.md](A7_CONFIG_PUBLISH_DOUBLE.md) add one substantive
publication/rollback coordinator. Thirty-one tests cover immutable typed
versions, complete manifests, expected-pointer and publisher-epoch CAS,
read-only store views, semantic operation-ID reconciliation, quarantine,
stable failed decisions, lost-ack reconciliation and previous-good pointer rollback. It performs no
compiler, DAT, database, cache or runtime operation.
