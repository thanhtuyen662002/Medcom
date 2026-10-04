# F9 inbound-request action/effect double

Status: local preparation only against main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.

`inbound_request_double.py` uses deliberately synthetic action identities to prove separation of request, receipt and stock-posting effects. Each effect requires a separately registered, evidenced contract, exact starting state, current authority generations, business-state check, version CAS and idempotency identity. A request transition records only a request; it cannot set receipt or posting flags. Effect/state pairs and record flags are validated as one bounded state machine, so an incoherent record cannot become a shortcut to a later effect.

The idempotency fingerprint covers the action, effect, contract revision, synthetic evidence identity, authority generations, full record precondition and payload. Reusing one operation identity with a different action, authority, contract, state/version or payload is rejected. An exact retry may return the immutable recorded outcome after authority changes because reconciliation does not execute a second effect.

The 47 tests reject generic Save/Approve/Cancel/Delete labels, missing or non-synthetic evidence, scalar-type confusion, stale revisions/generations/versions, incoherent records, invalid state transitions, unversioned registry changes and semantic changes under the same operation identity. Registry and operation views are read-only. Lost acknowledgement produces `OUTCOME_UNKNOWN_RECONCILE`, never a blind replay.

No action ID, workflow state or effect here is asserted to exist in Medcom. The synthetic receipt/posting specifications demonstrate separation only; they do not authorize or evidence F9 bindings. Exact source, DTO, permission, transaction and completion contracts remain `UNKNOWN/NOT_RUN`.

Run locally:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 preparations/L08/20261002/test_inbound_request_double.py
```
