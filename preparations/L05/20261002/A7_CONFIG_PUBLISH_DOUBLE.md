# A7 configuration publication double

Status: local preparation only against main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.

`config_publish_double.py` models immutable candidate versions and transactional current-pointer decisions without a database, compiler, DAT file, cache or runtime. Publication and rollback compare both the expected current pointer and publisher epoch. A complete manifest, valid/compatible candidate and non-authoritative presentation definition are mandatory. Lost acknowledgements reconcile through immutable operation identity instead of blind replay.

The 31 tests cover typed candidate/epoch/request identity, read-only store views, quarantine, incomplete source sets, configuration-based capability escalation, version-ID collisions, pointer/epoch races, semantic operation-ID conflicts, stable replay of both successful and failed decisions, post-commit invalidation, lost ACK and previous-good rollback. Rollback changes only the configuration pointer; the model contains no business data and cannot reverse any business transaction.

This does not prove compiler correctness, legacy precedence, SY_* storage compatibility, DAT execution, cache convergence or product/runtime behavior. Those remain `UNKNOWN/NOT_RUN`.

Run locally:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 preparations/L05/20261002/test_config_publish_double.py
```
