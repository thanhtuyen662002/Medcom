# A3 synthetic session acceptance model

One new local preparation unit for A3/#14. `session_double.py` is an adapter-independent in-memory Python model for acceptance design. It is not ASP.NET implementation, authentication, cookie/CSRF protection, a legacy session adapter or a production login provider. No Tool, SQL, network or credential access occurs.

## Contract basis

Pinned reviewed main: `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.

- `docs/architecture/PHASE2_AUTH_CAPABILITY_CONTRACT.md`: accepted meaningful activity alone advances idle; default 1,440 minutes; logout/expiry invalidate; cross-tab/result delivery is generation-fenced.
- `docs/architecture/PHASE2_TOOL_DLL_BRIDGE_CONTRACT.md`: browser Web session policy is separate from unknown actual Tool session/login/logout semantics.
- `docs/plans/PHASE2_SCHEDULED_EXECUTION_PLAN.md`, L02 fallback: adapter-agnostic session test doubles are eligible local preparation before executable backend admission.

The model uses fake server integer seconds and a synthetic principal/company/variant tuple. `Traffic` is a server-classified fixture signal; `accepted` and `csrf_valid` are explicit test-double attestations, not client fields or implemented validation. No cookie, permission result, token or secret is generated. The 300-second warning interval is a test parameter, not a verified Medcom warning requirement.

## Proposed race decisions requiring implementation review

At `now >= last_accepted_activity + idle_seconds`, expiry happens before Continue, activity or policy replacement. An expired generation never revives. Policy replacement first evaluates the old deadline; shortening can expire immediately, while stale revisions cannot overwrite current policy. This conservative policy is proposed for review because the current contract leaves the exact policy-update race unresolved.

Logout serializes with Continue and fences all old result tickets. A same-principal authoritative scope change also fences old work, but does not itself extend idle activity. Reauthentication, actual concurrent/absolute legacy-session rules, dirty-draft persistence, HTTP authority and distributed-store atomicity remain outside this model.

## Reproduction

```sh
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s preparations/L02/20261002 -p 'test_session_double.py' -v
```

18 behavior tests cover the exact deadline, every passive traffic class, accepted/rejected interaction, late Continue, CSRF/boolean attestation rejection, cross-tab logout, late result delivery, company/principal scope boundaries, policy revision/races, warning observation, malformed/rollback clocks and a barrier-controlled Continue/logout race.

Passing these tests proves the local model's behavior only. It does not satisfy .NET restore/build/analyzers, backend CI, T1, B4, product UX, distributed session invalidation or issue completion. A1/#12 remains blocked on the missing authorized .NET 10 SDK environment; A3/#14 remains waiting on A1. No L02 lease or operational dispatcher release is visible.

L01 can inspect these accessible local artifacts, request independent review and translate the acceptance into the eligible .NET foundation after preflight and a bounded sublease. There is no new GitHub commit for this unit.
