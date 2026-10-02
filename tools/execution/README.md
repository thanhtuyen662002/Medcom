# Synthetic control protocol reference model

`control_model.py` is a local standard-library design/test double owned by L01.
It contains no credentials, network calls, Git operations, real automation/run
IDs or operational lease allocation. Its run identities, branches, heads,
clock values and resource units are synthetic. It does not admit any Medcom
lane to GitHub writer mode, implement a deployed dispatcher, prove credential
restriction or close the CAS/bootstrap/integration gate.

Normative input: `docs/plans/PHASE2_SCHEDULED_EXECUTION_PLAN.md` §3 (resource
budgets), §5 (path custody), §6 (whole-head CAS/fencing/fair admission) and §10
(review/check/source/base integration gates). Bootstrap limits remain in
`docs/execution/L01_BOOTSTRAP_PREFLIGHT_20261002.md` and the activation manifest.
The model is derived from those policy requirements, not from an observed
GitHub dispatcher or legacy runtime implementation.

Every mutating transition compares a synthetic **whole registry revision**
inside a process lock. Lane admission, epoch advancement and the full
writer/CI/heavy allocation bundle form one transaction. Snapshot reads return
copies. Rejected operations preserve the entire state, including queue order
and all resource counters. Expired custody stays reserved until an explicit
synthetic quiescence decision fences it; expiry is never permission to take over.
The lane namespace is closed to L01–L10. Path claims are canonical, unique and
minimally non-overlapping. An exact request/lane/run cancellation transition
can remove stale queued work without touching active custody or another run.

Mutation checks run/lane/epoch, TTL, heartbeat age, writer token, bounded path
membership and exact work-branch head under that same lock. An old permit
fails even after rereading a newer control or branch head. A raced branch
requires explicit owner recovery; the model does not adopt unrecognized heads.
Normal main mutation is denied; the integration transition checks L01 custody,
the source head, independently reviewed source head and passing source/base
candidate evidence, then validates the source and base atomically.
The source must differ from the base and have no queued request or active lease;
integration therefore cannot race outstanding source custody even when its
observed head is unchanged.
Integration consumes a writer token in this conservative model; metadata-only
L01 custody cannot mutate main. Control revisions and epochs require exact
integers, while all clock intervals are finite positive numbers excluding booleans.

Admission picks the oldest compatible queued request. An incompatible request
stays queued without blocking a younger compatible request. Capacity released
at a bounded quantum cannot be reacquired ahead of a compatible waiter. Writer
and heavy capacity can be released while lane/path custody and pending CI remain.
The caller is responsible for scheduling the bounded quantum and recording
starvation/reprioritization; no real scheduler or long-term fairness claim exists.

Run the deterministic counterexamples from the repository root:

```sh
python -m unittest discover -s tools/execution -p 'test_control_model.py' -v
```

Tests use barriers to race contenders for one observed control head. They cover
atomic admission/resource allocation, stale owner/run/epoch after reread,
TTL and heartbeat denial, path conflicts, lane/branch exclusivity, the four
writer/four global CI/two per lane CI/one heavy limits, transaction rollback,
oldest-compatible fairness, branch races and source/base integration races.
No product/SQL/legacy runtime acceptance is asserted by a passing model suite.

Before operational use, a separate implementation and independent review must
prove durable whole-control-head CAS, authenticated owner identity, restricted
mutation credentials with no bypass, atomic expected work-branch head plus
epoch validation, durable fair resource admission, real quiescence/recovery,
and enforceable source/base review/check policy. A local lock, caller-supplied
booleans or a metadata heartbeat is insufficient evidence for those properties.
