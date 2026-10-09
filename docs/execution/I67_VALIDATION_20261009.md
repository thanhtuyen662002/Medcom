# I67 validation receipt — 9 October 2026

Draft: [#122](https://github.com/thanhtuyen662002/Medcom/pull/122). Clean base: `3304766ab9d63329622b5bf18b6f1d6171405a94`, tree `6e86ba33880155f61fc5c5902e96dd37caf4d17b`. Immutable admission: `24da7daa91db2fe5751b0e1260b68897795831e4`. Implementation/test source hashes and final test counters are in `I67_VALIDATION_20261009.json`.

## Local checks

| Check | Observed result |
| --- | --- |
| Approved ERP/DB archive SHA-256 and full SQL member size/CRC/SHA-256 | PASS; exact pinned identities in the full-field handoff |
| Six complete DDL column/name/type/nullability inventories and source lines | PASS; 116/116 columns against the actual full member |
| Locked solution restore, .NET SDK 10.0.401 | PASS |
| Final Release build and all non-LegacyRuntime backend tests | PASS; 3,067 passed, 0 failed, 0 skipped (including 30 full-field cases) |
| Architecture boundary verifier | PASS; SQL dependency restricted to Infrastructure |
| Source catalog verifier | PASS; 1,527 objects / 33 checksum-verified members |
| Source scanner tests | PASS; 48 tests |
| Integration/package guard regressions | PASS; 97 tests |
| Preparation reference models | PASS; 23 suites; reference models are not runtime acceptance |
| CI/ruleset policy verifier | PASS; no server policy changed |
| Existing `src/frontend` contracts and typecheck, source unchanged | PASS; 9 tests and TypeScript typecheck |
| Project state YAML / changed-file whitespace / new public content scan | PASS |

Local SDK invocation needed `MSBuildEnableWorkloadResolver=false`, `-m:1` and `-nr:false`. These are local runtime workarounds, not edits to the repository's CI, analyzers, dependency locks or test assertions.

Final source-free test command:

```sh
MSBuildEnableWorkloadResolver=false dotnet test Medcom.slnx -c Release --no-restore -m:1 -nr:false --filter 'Category!=LegacyRuntime' --logger 'trx;LogFileName=I67-final-backend.trx'
```

Actual HTTPS tests verify complete version 2 headers/lines, unchanged unversioned JSON keys, original purchase aggregate/token/access, every metadata field against all six pinned table inventories, authenticated module-capability bounds, rejected duplicate/arbitrary queries, empty child pages, incomplete providers and missing projections, NULL/Unicode/decimal fidelity, finite zero/negative floats, rejected NaN and both SQL datetime fraction shapes. Original branch/item/unsafe-row assertions are retained.

## Review and limits

Local quality review checked fixed SQL identifiers/projections, parent authorization and branch reuse, cardinality/lookahead, source nullability/precision, versioned wire compatibility, no hidden default-success on incomplete fields, unchanged command receipts/tokens/availability, no frontend source changes and no private source/settings/rows in public changes.

Hosted checks on the admission-only head passed, but they do not validate implementation. The final implementation's exact-head/base hosted Linux/Windows/container/frontend checks must be read from PR #122 after publication; this receipt does not predeclare them green. No checks or workflow policy are disabled. No merge, deployment, SQL target connection, private DLL execution or business write was performed in this increment. Native Windows/SQL/DLL, real target schema/data compatibility, end-user FE version 2/BFF adoption and full backend goal #45 acceptance remain NOT_RUN/open.
