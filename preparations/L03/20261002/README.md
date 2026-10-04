# L03 DB/query local preparation — 2026-10-02

Status: **prepared locally only** against live `main` `f9197185b624a8c3f74c99e48a69550b5a7c2a73`. L03 has no dispatcher fencing proof, writer lease, resource token or accessible authoritative SQL bytes. No GitHub mutation, SQL execution, product/runtime test, deployment or production operation is claimed.

## Six substantive units

| Unit / issue | Artifact | Cases | Prepared boundary | Current result |
|---|---|---:|---|---|
| B1 / #20 | `B1_TYPED_QUERY_BOUNDARY_FIXTURES.json` | 16 | Registered query IDs, server-derived authority, typed filter/sort/page allow-lists, deterministic paging, cancellation, shape revision and safe errors. | `NOT_RUN`; exact bindings and B2 catalog remain unavailable. |
| B2 / #21 | `B2_CATALOG_SCHEMA_ACCEPTANCE.json` | 18 | Exact sanitized record shapes, row-level ownership, aggregate reconciliation and closure-failure cases. | `NOT_RUN`; authoritative SQL archive bytes are inaccessible. |
| B2 extraction manifest | `B2_EXTRACTION_MANIFEST_ACCEPTANCE.json` | 14 | Archive hash/materialization, exact member set, encoding, spans, batch/include coverage, sanitization, tool identity and bidirectional reconciliation. | `NOT_RUN`; source bytes remain inaccessible and the source-set state is `NOT_MATERIALIZED`. |
| B2 normalization | `B2_DEFINITION_NORMALIZATION_FIXTURES.json` | 16 | CREATE/ALTER/drop/recreate, conditional DDL, dynamic DDL, batch/schema context and script-effective versus deployed facts. | `NOT_RUN`; no parser or source bytes executed. |
| B2 dependencies | `B2_DEPENDENCY_QUARANTINE_FIXTURES.json` | 19 | Dynamic, ambiguous, unresolved, unsupported, external/cross-database and local/non-catalog classifications. Six synthetic cases carry concrete spans/reasons/owners; zero false catalog edges. | `NOT_RUN`; dependency graph remains absent. |
| B2 filter queue | `B2_FILTER_LITERAL_RESOLUTION_QUEUE.json` | 18 | Exact equality with the 18 persisted FieldID literal names in the bounded filter register. | Every row remains `PENDING_B2`; no schema/kind/column/binding is guessed. |

Total: **101 synthetic/review cases** and **60 exact Git-object source pins** across the six artifacts.

## Bounded dependency repair

L01 granted a local preparation sublease for this repair; L03 remains primary owner of B2. `QA-ROUTE-L03-001` is addressed by classifying CTE names, table variables, temporary tables, `inserted`/`deleted`, and comment/ordinary-string tokens as `LOCAL_OR_NON_CATALOG`. Lexical context and local scope are checked before catalog resolution. These covered exclusions emit zero catalog edges; dynamic SQL remains `DYNAMIC`.

`QA-ROUTE-L03-002` is addressed by B2D-19: an explicitly synthetic qualified reference has no match in an explicitly empty synthetic catalog. Its exact character span, checksum, reason and L03/B2 owner are retained; target ID stays null and both binding and closure acceptance are `BLOCKED_UNRESOLVED`. All six detailed fixture inputs are synthetic test design, not source extraction. The metadata checks do not implement or prove a SQL parser. Actual extraction, parser execution, independent review and durable integration remain pending.

## Guardrails retained

- The 13-family/24-artifact/600-row filter register is complete only for that bounded slice. It does not represent all 232 DAT or 786 candidate-current RPX artifacts.
- The literal suffix `Tbl` does not prove a table; a `v*` prefix does not prove a view. Every exact catalog identity, requested field and dependency remains pending authoritative extraction.
- Declaration counts remain separate from normalized identities and deployed runtime facts. For example, 652 procedure declarations do not become 652 normalized/live procedures; the durable baseline records 591 normalized procedure identities.
- Static catalog closure must cover every parser body region as parsed or explicitly quarantined. Unsupported text cannot disappear silently.
- TRC-DB-001/#21, Gate 2 and exhaustive Gate 4 remain open.

## Verification

```bash
PYTHONDONTWRITEBYTECODE=1 python preparations/L03/20261002/validate_preparation.py
PYTHONDONTWRITEBYTECODE=1 python preparations/L03/20261002/test_preparation.py
```

The validator checks six exact fixture sets, 101 unique IDs, live-main Git-object hashes, the fail-closed extraction-manifest contract, canonical aggregate vocabulary, all nine required catalog record types, every dependency disposition, synthetic source identity/checksum/spans/scope context, local exclusions with zero catalog edges, unresolved fail-closed acceptance, and exact equality with the current 18-literal filter queue. The metadata suite contains one passing baseline and 33 expected-failure mutations, including false source materialization, weakened member/body coverage, promotion of each local symbol class, lost unresolved evidence, fabricated provenance/targets, out-of-trigger pseudo-table context and premature binding/closure acceptance.

## Handoff

When the approved SQL archive becomes accessible, first verify its bytes against SHA-256 `2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`. A different hash requires an explicit baseline decision. Extraction must produce sanitized catalogs/manifests only; never publish the raw SQL, data rows or connection material. L03 remains the sole catalog owner, while L01 owns the later total ERP–Web–DB join.

## New B1 behavior preparation

`typed_query_double.py`, `test_typed_query_double.py` and
[B1_TYPED_QUERY_DOUBLE.md](B1_TYPED_QUERY_DOUBLE.md) add one substantive
adapter-independent query-planning model. Thirty-one tests cover registered IDs,
server-derived scope, typed filter/sort/page validation including actual value
types and exact scalar checks, deterministic paging, validated immutable registry
input, generation/shape fencing, read-only registration and safe errors. It emits no
SQL and does not prove cancellation, snapshot, catalog or runtime behavior.
