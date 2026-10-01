# Bounded filter-register validation

`validate_filter_register.py` uses Python's standard library and the four
sanitized documents named by the filter register. Run from the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python tools/traceability/validate_filter_register.py
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s tools/traceability -p 'test_*.py' -v
```

For an independent checkout, use `--repo-root /path/to/Medcom`. `--register`
accepts an alternative JSON path; source documents remain relative to that
repository. Validation is read-only and returns exit code 1 on failure.

The validator independently parses membership from both ERP evidence tables,
joins each family to the architecture table or closure delta, and checks the
four cited document byte hashes, line counts and exact one-based row citations.
It reconciles 13 families, 24 artifacts, 600 declared serialized rows (526 visible
and 74 hidden), 18 literal DB names, and 10 alias-bearing artifacts. It rejects
omitted/duplicate members, count drift, altered literals/aliases, orphan reverse
links, malformed schema, source drift, and promotion of proposed or UNKNOWN
contracts. Expected membership comes from evidence documents, not the register's
own totals. Tests exercise tampered isolated copies of the retained evidence.

These are document-level checks. The repository does not retain the identities
and field contents of the 600 private serialized rows, so this tool cannot prove
that no individual raw-source field row was omitted by the original extraction.
It does not reopen, rehash or authenticate the ERP archive, verify current DB
objects, prove source/runtime semantics, or authorize query/mutation execution.
Hash consistency detects drift against the register; it does not authenticate
coordinated edits to a document and its recorded hash. Those edits still require
source review. The validator's strict version-1 schema and canonical safety text
intentionally require reviewed code/schema updates for later evidence resolution
or a revised acceptance policy. Narrative fields cannot negate fail-closed
behavior while retaining a superficially unchanged UNKNOWN/status label.

Gate 2, TRC-DB-001/#21 and Gate 4 remain open. Passing this tool proves only the
retained sanitized filter slice; it cannot claim exhaustive coverage of all 232
DAT artifacts, 786 candidate-current RPX identities, or the full ERP–Web–DB
population. The finite closure requirements remain in
`docs/reviews/PHASE1_DB_TRACEABILITY_CLOSURE_DECISION_20261002.md`.
