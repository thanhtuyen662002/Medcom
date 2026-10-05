# I09 PM Return journal storage checkpoint

Status: corrected local implementation tested; independent rereview, parent
publication and exact-head/base CI remain pending. Production acceptance remains
false. The earlier candidate is preserved and is not accepted for publication.

## Immutable admission and custody

- Draft lease: [PR #61](https://github.com/thanhtuyen662002/Medcom/pull/61).
- Run: `e846ad60-9571-4c31-b49d-234c6ddf9ae7`.
- Base: `f8c41ee5e6e873c86205a133719257bb861d2fa7`.
- Control/immutable admission: `57c3a418161e627c09bf4371f50206ee61481c40`.
- Work branch: `codex/g45-pm-return-i09-20261005`.
- Claim: `medcom-claims/g45/direct/I09`; claim blob
  `86cd7a520499746ba8798e93232a34ee509509e2`.
- PR metadata and immutable claim were reread before local freeze; Draft remains
  open at the control head. Parent is sole publisher. The claim is unchanged.
- Seven new worker paths exactly match the eight-path claim after excluding its
  inherited claim file. B01/P01 and shared I06/I07/API/DI/v1 files are preserved.

## Delivered behavior

`SqlPmReturnJournalStore` runs real parameterized command plans through an owned
SERIALIZABLE transaction. It probes marker/version/binding/schema/index/CHECK and
database durability assumptions, reads the exact stable slot and optionally
inserts/rereads InProgress. Ownership is returned only after commit acknowledgment;
all results keep `PermitsDispatch=false`. Failed lookup/schema never implies
Absent, and ambiguous ACK, cancellation, duplicate/deadlock or retained rows never
grant ownership, automatic retry or timeout takeover.

`PmReturnJournalCodec` uses a complete versioned length-framed binary tuple to
preserve I07 ordinal Unicode/ASCII semantics, and strictly maps stored observations
and receipts back to I07. Document/submission/source changes conflict inside the
stable slot. `PmReturnJournalSql` binds explicit parameter types/sizes without
interpolating values and probes actual enabled/trusted CHECK definitions using a
bounded semantic parser. Its singleton truth domain includes 3/4 to reject widened
checks, not only the common 0/1/2 cases.

`schemas/backend/pm-return-journal-v1.sql` is authored, new and **UNAPPLIED**.
Artifact SHA-256:
`c7a777578470d1bc4b150503eb4fad7e7497386643c1cf2225e10e916e00f2ce`.
It does not bootstrap a binding marker, contain private source bodies/rows or run
at startup. Storage semantics and operational gates are documented in
`docs/backend/PM_RETURN_JOURNAL_STORAGE.md`.

## Observed validation

Independent review found that the old lookup's pre-codec DATALENGTH predicate
could hide a SQL-equal malformed zero-extended slot. The schema only checks that
Slot is nonempty, so it does not prevent that row. Old candidate
`3fa9ecf4b61d649c480f0c9e0d73c4061066fe5c` and its evidence remain frozen.
The bounded correction changes only the SQL plan, owned test file and two I09
documents; the claim, schema/its hash, store and codec remain unchanged.

Lookup now selects all binding/SQL-equal candidates so full-byte decoding rejects
padding before Absent or INSERT. Twenty added query-aware cases use actual
System.Data.SqlTypes.SqlBinary equality and evaluate the lookup WHERE predicates
and TOP limit; the recording model also rejects SQL-equal duplicate INSERTs and
retains unrelated rows. Six negative cases cover read/reserve with one zero,
four zeros and extension to the schema bound. Fourteen positive cases cover exact
Committed/retained rows and empty/different-binding/different-slot scope, including
acknowledged reservation. Existing raw-reader shape tests retain their distinct
purpose. The new six-case regression failed with the old lookup: three false
Absent reads and three attempted INSERTs. This is recording/model evidence,
never actual SQL engine evidence.

- Locked restore with existing checksum-verified .NET 10.0.401 SDK/cache: PASS.
- Release `dotnet build Medcom.slnx --no-restore`: PASS, zero warnings/errors.
- Offline .NET regression: **395/395 PASS**, zero skipped. This is 292 inherited
  cases plus **103 I09 cases**. The disjoint runs are 376 non-ServerConfiguration
  cases with process-only synthetic disabled-legacy private configuration, then
  all 19 ServerConfiguration cases with that selector unset. LegacyRuntime cases
  are not run. No assertions, filters in repository workflows or machine settings
  were changed.
- I09 cases execute production store control flow through recording DbConnection,
  DbCommand and transaction doubles. They cover acknowledged ownership/absence,
  retained states, correlation conflicts, original receipt replay, authority and
  cancellation before I/O, schema/marker/constraint mismatch, malformed rows/JSON,
  duplicate/deadlock/provider failure, uncertain ACK, cleanup failure, ambient/wrong
  isolation rejection, typed parameters, ordinal Unicode/framing and artifact pin.
- An initial broad run aborted because the new recording double threw a synthetic
  disposal fault on its finalizer thread. The owned test fixture now confines that
  fault to explicit disposal; the complete corrected run passed without a host
  crash. No product error was hidden or inherited assertion weakened.
- Architecture: PASS, five project boundaries, SQL dependency only Infrastructure.
- Finite catalog: PASS, 1,527 objects and 33 checksum-verified members.
- Source/scanner regressions: **48/48 PASS**.
- CI policy and integration/package guards: PASS, **97/97** guard cases.
- Prepared references: **23 suites PASS** using an external Windows invocation
  equivalent. It inserts the explicit Python interpreter for four inherited direct
  `.py` validator launches and UTF-8 for child Python processes, retaining all
  assertions. Before execution it verifies all reference test/validator/runner
  files are unchanged from control `2716a783810814abce37572bd115e7e39967b739`.
  The original Windows launch limitation was previously reproduced on inherited
  control; original direct-launch execution was not rerun as I09 acceptance.

Local test reports are held privately outside checkouts. They are not runtime SQL,
production durability, independent review or exact remote-head CI evidence.

## Windows CI exact-byte checkout repair

Parent published the independently reviewed storage tree at
`1d3cf9e3741738119a839497542f225d3941ffbc` (tree
`c5595fc09fc92454fc00a47fd74fc13ce51e7968`). Hosted Windows run 37290726988
reported 394/395 with the unchanged `Artifact_pin_matches_exact_unapplied_SQL_bytes`
test failing. The repair is isolated from that published head; reviewed candidate
`3980ecef0802f5da29ed07b444c07a997e8bcf20`, rejected candidate and immutable claim
remain preserved.

The [explicit scope amendment](https://github.com/thanhtuyen662002/Medcom/pull/61#issuecomment-5991875189)
admits `.gitattributes` solely for the exact schema path. The file was absent at
the published head; the repair adds exactly one rule:

```gitattributes
/schemas/backend/pm-return-journal-v1.sql text eol=lf
```

Git documents that `text` enables index LF normalization and `eol=lf` fixes the
working-tree line endings for that path.
[Official Git attribute documentation](https://git-scm.com/docs/gitattributes).
No wildcard/global policy or global/repository Git configuration is changed.
The original schema bytes, compiled artifact SHA and exact-byte test are unchanged;
no test-time normalization is introduced. `check-attr` reports text=set/eol=lf for
the schema and unspecified values for an unrelated schema path.

Four fresh detached disposable worktrees reproduce the checkout behavior using
only per-command `core.autocrlf` settings:

| Snapshot | autocrlf | Schema bytes | Schema SHA-256 | Exact-byte test |
| --- | --- | ---: | --- | --- |
| Published control | true | 2335 | `649c3b2c850d571843ce5de6db021c65eaeea8c3bfcd0609edfd79508971f54b` | Expected FAIL, same expected/actual as CI |
| Published control | false | 2298 | `c7a777578470d1bc4b150503eb4fad7e7497386643c1cf2225e10e916e00f2ce` | PASS |
| Attribute fix | true | 2298 | `c7a777578470d1bc4b150503eb4fad7e7497386643c1cf2225e10e916e00f2ce` | PASS within full regression |
| Attribute fix | false | 2298 | `c7a777578470d1bc4b150503eb4fad7e7497386643c1cf2225e10e916e00f2ce` | PASS within full regression |

All four locked restores/builds passed with zero warnings/errors. Both corrected
fresh worktrees passed **395/395 offline tests** (376 plus all 19 configuration
cases, same process-only synthetic configuration method as above); no tests were
skipped in those runs. The existing exact-byte test is included in each corrected
run. Architecture, catalog 1527/33, source/scanner 48, CI policy and guards 97 were
rerun and passed. The preparation scripts/assertions are unchanged; the earlier
23-suite result remains inherited evidence, not a newly rerun repair check.

The tested validation tree differs from published code only by this attribute.
The final repair adds this checkpoint evidence; its schema/product/test blobs
must match the tested tree. Independent rereview and fresh exact-head/base hosted
Windows/Linux CI remain required before integration. This fixes source checkout
bytes and grants no SQL/runtime or production acceptance.

## Open gates and next bounded work

No actual SQL connection, schema apply, service/network/TLS/permission change,
ERP EXEC, Committed writer, API/DI activation, readiness change, schedule mutation
or GitHub publication occurred. Recording doubles prove control flow and codec
behavior; they cannot prove SQL syntax/catalog rendering, unique/range locks,
concurrent races, crash durability, transaction cancellation or restore continuity.

Parent can review this frozen local patch without touching B01/P01 and publish
only after independent review. Remote exact-head/base CI must pass before merging.
A subsequent separately claimed executor can consume the reservation and I07
receipt contracts, but requires an authorized qualified database, trusted TLS,
binding/schema custody and atomic ERP/log/audit/receipt transaction acceptance.
Restore/clone reconciliation, delayed durability DISABLED, source nested rollback,
ABA/monotonic state, private runtime fixture and WinForms behavior remain gates.
Sites integration still needs an authenticated reachable HTTPS API origin and
the backend's accepted authentication contract; I09 does not enable that runtime.
