# F2 query freshness coordinator double

Status: local preparation only against main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.

`query_freshness_double.py` is a synthetic coordinator for browser-side acceptance design. It assigns monotonic request sequences, binds requests and cursors to session/permission/scope generations, scopes cache entries by authority/query/filter/revision, rejects superseded responses, and treats transport events only as prompts for authoritative revalidation.

The 27 tests cover reverse-order responses, company/permission/session changes with cache purge, authoritative data-as-of age distinct from request latency, scoped `not-modified`, coordinator-owned cursor generation checks, cursor replay/substitution, typed scope/generation/revision keys, passive activity and invalid clocks. The model never fetches data, renders a Grid, contacts a backend, or proves browser performance/accessibility. It consumes the intended A4/B1 contract boundaries but does not certify those implementations.

Run locally:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 preparations/L06/20261002/test_query_freshness_double.py
```
