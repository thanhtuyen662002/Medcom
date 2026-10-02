# B5 synthetic OutcomeUnknown reconciliation model

`outcome_reconciliation_double.py` makes the narrow reconciliation boundary of
the existing B5 state-machine fixture executable without simulating SQL,
transactions, external effects or dispatch.

The model starts with one already-unknown synthetic operation. It requires an
expected state version plus a newer reconciler epoch to claim the operation.
Only the same fenced owner/epoch may resolve it with one of three explicit
proof classes: completed, no effect and safe to retry, or still ambiguous.
Direct unknown-to-success/retry transitions do not exist. Success disclosure
and retry reservation independently require current authorization; retry also
requires a fresh attempt identity while retaining lineage.

The 18 behavior tests cover stale state versions, boolean version/epoch inputs,
owner and epoch fencing, malformed proof values, all three proof outcomes,
authorization changes, duplicate attempt identities, immutable snapshots and
concurrent claimant exclusion.

This is local preparation only. It proves neither transaction rollback nor
commit, mandatory-effect completion, exactly-once delivery, current permission,
retention windows or restore-frontier behavior. B5/#24 remains blocked on its
source, dependency, isolated-runtime and durable lease gates.
