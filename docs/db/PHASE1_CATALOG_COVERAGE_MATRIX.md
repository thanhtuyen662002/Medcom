# Phase 1 DB acceptance coverage matrix

Audit date: 2026-10-01. Source baseline: `Medcom-Data (3)(1).zip` /
`Medcom-Data.sql`, SHA-256
`2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`.

This matrix prevents aggregate scanner results from being mistaken for a
complete durable catalog. It records what the repository proves, what is
missing, and the exact acceptance needed before the DB gate can pass.

## Coverage decisions

| Acceptance dimension | Durable evidence now present | Coverage decision | Missing closure evidence |
|---|---|---|---|
| schemas | `BASELINE_INVENTORY.md`, `DECLARATION_NORMALIZATION.md` | **PARTIAL** | Complete schema identity list and object-to-schema mapping. |
| tables | 583 distinct permanent tables; stable IDs for selected/keyless/config objects | **PARTIAL** | Durable identity row for all 583 tables with classification and source location. |
| columns | 7,985 aggregate declarations; 5,610 nullable and 2,375 NOT NULL | **PARTIAL** | One sanitized row per column with ordinal, type, length/precision/scale, nullability and table ID. |
| types | Aggregate type counts | **PARTIAL** | Exact type metadata attached to every column, including user-defined/type aliases. |
| defaults | 812 default-constraint declarations | **PARTIAL** | Constraint identity, owning table/column, normalized expression and hash for every default. |
| identity/sequence | 17 identity columns; `Seq_UnitID` and `UserAutoIDSeq` names | **PARTIAL** | Exact identity seed/increment/owner and sequence usage/dependency edges. |
| primary keys | 533 tables declare a primary key | **PARTIAL** | Key columns/order, clusteredness and stable constraint IDs for every PK. |
| foreign keys | 364 FK declarations | **PARTIAL** | Referencing/referenced columns, actions, trust/disabled state and dependency edges. |
| unique constraints | 7 explicit ALTER TABLE unique declarations plus implicit PK/unique indexes | **PARTIAL** | Complete unique constraint/index ownership and column order. |
| check constraints | 558 declarations | **PARTIAL** | Owning table, normalized expression, trust/disabled state and stable IDs. |
| indexes | 125 explicit CREATE INDEX statements across 79 tables | **PARTIAL** | Full index metadata including implicit PK/unique indexes, key/include columns, filters and disabled state. |
| views | 216 declarations / 203 normalized identities | **PARTIAL** | Per-view definition hash, referenced object edges, read/write classification and active-definition rule. |
| procedures | 652 declarations / 591 normalized identities, including `zuser.SY_SystemServiceCheckStp` | **PARTIAL** | Per-procedure definition hash, parameters, referenced objects, side effects and duplicate-definition reconciliation. |
| functions | 113 declarations / 109 normalized identities | **PARTIAL** | Per-function parameter/return metadata, body hash and dependencies. |
| triggers | 5 declarations / 3 normalized identities | **PARTIAL** | Table, event, order, body hash, side effects and disabled/trust state. |
| dependencies | Selected lock/table references and config anchors | **FAIL** | Exhaustive object dependency graph from parsed bodies and dynamic-SQL flags. |
| object/domain classification | Prefix distribution and broad reuse matrix | **PARTIAL** | Per-object class with evidence and confidence, including non-prefix/UNKNOWN groups. |
| reuse disposition | Namespace-level recommendations | **PARTIAL** | Per-object reuse/facade/controlled-change/additive-config/retire decision with rationale. |
| keyless tables | Complete list of 50 keyless tables | **PASS for register** | Caller/runtime uniqueness semantics remain UNKNOWN; no Web identity may be invented. |
| configuration/security objects | Verified `SY_*` anchors and capabilities | **PARTIAL** | Complete security/config object catalog and enforcement/dependency links. |
| concurrency/locking/transactions | `XACT_ABORT`, `UPDLOCK/HOLDLOCK`, `sp_getapplock` hotspots | **PASS for static evidence; runtime UNKNOWN** | Procedure caller/outer transaction/timeout/retry semantics. |
| runtime options | RCSI, compatibility, Broker, Query Store, recovery, auto-shrink and related declarations | **PASS for scripted baseline; runtime UNKNOWN** | Live instance/session options, backups, RPO/RTO and operational policy. |
| implicit contracts | Mixed XACT_ABORT, trigger/lock risks, config metadata boundaries | **PARTIAL** | Per-command side effects, parameter contracts, output/error semantics and ownership. |
| integrity/performance hazards | Keyless register, lock hotspots, runtime options and risk notes | **PASS for identified classes; sizing UNKNOWN** | Runtime plans, cardinality, waits, fragmentation and production workload evidence. |

## Gate conclusion

The repository has strong aggregate and risk evidence, but the dimensions
marked PARTIAL or FAIL are dump-extractable. They are not allowed to become
`UNKNOWN` merely because the raw dump is excluded from the public repository.
Until a sanitized catalog and dependency export are committed, Gate 2 remains
FAIL and Phase 1 remains active.

## Required catalog shape

The next durable artifact may be CSV/JSON/Markdown generated from the
authoritative dump, but it must be reviewable and reproducible. At minimum it
needs these logical records:

- `schema`: stable schema ID, name, source span, evidence level;
- `table`: stable table ID, schema, name, source span, object class, reuse decision;
- `column`: table ID, ordinal, name, SQL type, length/precision/scale, nullable,
  default ID/expression hash, identity seed/increment, computed flag;
- `constraint`: kind, stable ID, owner, ordered columns/expression, actions,
  trust/disabled state;
- `index`: stable ID, owner, uniqueness, clusteredness, key/include columns,
  filter and disabled state;
- `programmable_object`: kind, stable ID, schema/name, definition hash,
  parameter/return metadata, read/write/transaction flags;
- `dependency`: source ID, target ID, dependency kind, dynamic/ambiguous flag,
  evidence span and confidence;
- `classification`: domain class, reuse disposition, rationale, confidence;
- `runtime_option`: option/value/source and static-vs-runtime status.

No data rows, credentials, connection strings, raw SQL dump or private license
material may be included.
