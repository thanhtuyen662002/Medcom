# B1 typed-query boundary double

Status: local preparation only against main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.

`typed_query_double.py` is a synthetic planner that never produces or executes SQL. It accepts only registered query IDs, uses server-supplied scope, validates the entire filter/sort/page request against a versioned specification, appends a stable ordering key, and rejects stale query/catalog/shape generations. A successful plan carries an explicit consistency token, bounded timeout, cancellation obligation and null semantics.

The 31 tests cover raw/unregistered query IDs, client scope widening, filter/operator/declared-value-type rejection, non-finite numerics, exact integer/boolean scalars, all-or-nothing filter validation, hidden/duplicate/malformed sorts, page bounds and overflow, stable tie-breaking, registry validation/copying, nonempty server scope/data version, mixed generations, shape drift, mutation-capable registration and sanitized errors.

This does not implement a SQL parser, query adapter, cancellation provider, snapshot transaction, catalog binding or product error path. Exact object/field/alias bindings remain blocked on B2. All runtime/product outcomes remain `NOT_RUN`.

Run locally:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 preparations/L03/20261002/test_typed_query_double.py
```
