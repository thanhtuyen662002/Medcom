# A4 capability behavior double

Status: local preparation only against main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.

`capability_double.py` is an adapter-independent fail-closed reference model for server-authoritative authorization. It keeps route, query, mutation, export and configuration grants independent; injects the complete server scope; fences stale session, permission and scope generations; rechecks business state; and binds generated artifacts to the current principal, scope and generations.

The 18 synthetic tests cover direct-route bypass, menu/grant separation, route-to-query escalation, scope widening, uniform public denials, mutation TOCTOU, lost invalidation hints, export reuse after revocation, cross-principal artifact reuse, scope/session fencing and explicit admin configuration grants.

This model does not prove ASP.NET middleware behavior, Tool login/permission semantics, exact company/branch/storehouse sources, database row-level enforcement, transport timing indistinguishability, or production behavior. Those remain `NOT_RUN` and exact legacy bindings remain `UNKNOWN`. A product implementation must also measure denial timing residuals rather than infer perfect indistinguishability from the uniform response object used here.

Run locally:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest preparations/L02/20261002/test_capability_double.py
```
