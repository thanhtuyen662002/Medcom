# L07 command-safety preparation — 2026-10-02

Six local units prepare B3/#22 and B5/#24: typed command envelope fixtures, a transaction/effect audit template, idempotency fingerprint fixtures, an OutcomeUnknown state machine, concurrency/lock fault fixtures, and a ledger retention/restore-frontier gate.

All references pin merged main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`. Live GitHub shows Draft #44 at remote head `8cea825ab9f8169e5dfe4543b7d315972f13971a` as L01's activation/bootstrap Draft, not an L07 lease. B3 and B5 remain open with `waiting_dependencies`; their actual A4/A5/A6/B2/B4/T1 dependencies and source/runtime gates remain unfinished.

The packages contain 87 synthetic/template cases or sections: 16 command-envelope, 10 audit sections, 16 idempotency, 16 uncertain-outcome, 19 concurrency and ten retention/restore cases. They also define five completion phases, 16 guarded state transitions and 12 mandatory retention/restore requirements. The new gate stays `BLOCKED_WINDOWS_AND_RESTORE_FRONTIER_UNKNOWN`; it invents neither retention durations nor an RPO/RTO.

The retention/restore artifact was completed as a bounded repair by L01 under an explicit L07→L01 preparation sublease after the L07 validator and tests had already declared the file mandatory. Primary ownership remains L07/B5; this repair grants no L07 writer lease and no product/runtime authority.

The hardened contracts make four previously implicit safety requirements machine-checkable: the ledger lookup key uses stable scope/action/contract/idempotency identity and compares the server-derived fingerprint as an immutable field on the record found; browser `metadataRevision` is only a compatibility hint while the resolved server revision controls dispatch; `OutcomeUnknown` may move only through fenced, versioned reconciliation transitions; and a core transaction commit is not final success while mandatory hooks/outbox/external effects remain unconfirmed.

The idempotency correction closes the local design defect `QA-ROUTE-L07-001`: `semantic_request_fingerprint` is not part of lookup uniqueness. A repeated stable key with changed payload must find the existing record and fail the immutable-fingerprint comparison before dispatch; it must never look like a new reservation. This is still local preparation and requires independent L10 re-review, durable integration and product/runtime evidence.

The five named SQL hotspots are static evidence examples only. No fixture binds them to a current pilot/UI action or deployed procedure version.

No SQL/SP endpoint, generic CRUD, rowversion, retry-safe set, transaction owner, compensation, hook order or exactly-once guarantee is invented. No database/runtime call, lock test, product code, CI run or GitHub mutation occurred. These artifacts cannot close B3/B5, TRC-DB-001 or any pilot gate.

## New executable preparation boundary

`outcome_reconciliation_double.py`, `test_outcome_reconciliation_double.py`
and [OUTCOME_RECONCILIATION_DOUBLE.md](OUTCOME_RECONCILIATION_DOUBLE.md) add a
standard-library-only B5 reference model. Its 18 synthetic behavior tests make
state-version CAS, reconciler owner/epoch fencing, authoritative proof classes,
current-authorization checks and fresh retry lineage executable. This is not a
database/runtime test and does not prove commit, rollback, effects or exactly
once behavior.

`typed_command_double.py`, `test_typed_command_double.py` and
[B3_TYPED_COMMAND_DOUBLE.md](B3_TYPED_COMMAND_DOUBLE.md) add one independent
B3 admission model. Forty-three tests keep browser fields separate from
server-derived authority/fingerprint, enforce exact scalar and payload types,
freeze admission snapshots, reject unversioned registry changes, reject
unverified or retired bindings, and revalidate complete command semantics
immediately before dispatch. The model never invokes a handler or database.
