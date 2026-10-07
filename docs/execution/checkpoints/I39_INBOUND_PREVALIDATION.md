# I39 — inbound existing-document prevalidation

Source base: `830d6c710b0fb47dd75a01dfb163ca2619bf5ea5`.
Root admission: Draft PR #90, immutable control `10f0e9e86db9a26772cc80580b027968c7b3fd85`, tree `4d45c31d39a822de14e8347646c36557844d6ec2`. The implementation remains an exact-base delta; the root-owned immutable marker is not rewritten by this candidate.
This bounded local candidate changes the inbound orchestrator and its existing recording-test file only, plus this checkpoint. Root owns admission, review, publication and exact-head CI. No GitHub write, database operation, private configuration read, native DLL execution, activation or RuntimeAcceptance was performed or supplied.

## Functional change

For a new existing-document Save or Send intent, phase 0 first retains the original journal lookup/replay/pending logic. Only an absent operation proceeds to a fresh, locked aggregate read and the existing status, state-equality, header branch/date, child ownership, detail-count, Send and exact-calculation predicates. An observable rejection returns before the reservation INSERT and its commit.

The same existing-document helper runs again in phase 1, in a different serializable transaction. Neither the snapshot nor a positive preflight result crosses the transaction boundary. The phase-1 reservation branch and live authority fences, business effects, readback, receipt write and commit remain required. An inter-phase change can still leave the genuinely committed pending slot; this candidate neither clears nor takes it over.

Create still does not enter this existing-document preflight. Its allocator and two-phase dispatch are retained. Unsupported Create calculations can therefore still leave the original pending reservation. No numbering, log-default or schema qualification is introduced.

Completed receipt replay and original pending reconciliation are evaluated before current draft validation. In particular, an original Send receipt remains readable after status 2. Lookup/reconcile never calls this new preflight or dispatches an effect.

## Regression source

Eighteen added regression cases cover:

- Ten observable existing-document rejections: stale equality token, nondraft status, changed date, header branch mismatch, foreign upsert/remove, aggregate detail limit, empty Send details, Send NULL lot and unsupported rounding. Each asserts no journal row, reservation, commit or business write.
- Valid Save and Send each use a pre-reservation snapshot plus a distinct phase-1 snapshot, retain two acknowledged commits, and replay/reconcile the original receipt before draft validation without new snapshots or writes.
- Five inter-phase token/status/scope changes reject before business effects, preserve exactly the original genuinely committed pending operation and never reserve or dispatch again on retry/reconcile.
- A distinct phase-1 snapshot exception retains genuine pending custody and performs no business dispatch. This preserves the former snapshot-fault boundary after phase 0 gains its own snapshot.

The existing rounding/range test now distinguishes existing-document early rejection from the intentionally unchanged Create pending behavior. Existing lost-reservation-ACK, lost-business-ACK, rollback, replay and authority tests remain present. Composition/admission recording files are unchanged; source review found no required recorder-plan additions.

The ten new early-rejection cases were also executed in an isolated exact-830d worktree with unchanged production code: all ten failed because the journal contained a pending row. The changed candidate passes those cases. This is synthetic recording evidence, not real target acceptance.

## Observed local validation

- PASS: `git diff --check`.
- PASS: `python tools/backend/check_architecture.py` (five project boundaries).
- PASS: `python tools/execution/test_control_model.py` (35 tests).
- PASS: `python tools/traceability/test_filter_register.py` (40 tests).
- PASS: exact eight-project solution locked restore with .NET 10.0.401; Release analyzer build with zero warnings/errors. Shared verified SDK and process-only writable CLI/NuGet caches resolved the initial missing-SDK/cache-path obstacles; no repository dependency pins or persistent settings changed.
- PASS: final targeted command, derived-readback, collation, composition, admission, session-fence and SQL suite: 245 passed, zero failed/skipped. The final phase-1 snapshot-fault addition is included.
- EXPECTED FAIL: ten new early-rejection tests on unchanged 830d production source: ten failed, zero passed/skipped, each on the unwanted nonempty journal assertion. This demonstrates the regression rather than a passing baseline.
- INCOMPLETE BROADER RUN: before the final additional snapshot-fault test, the broader inbound filter produced 397 passed and 20 failed. All 20 failures were ApiHost endpoint fixtures throwing `Private server configuration could not be loaded` at startup. The fixture source creates synthetic JSON, and its temp-directory layout encounters external-path safety policy. This candidate does not change that fixture or weaken the guard. The observed failures are not labelled inherited without an exact unchanged control; full exact-head CI remains required. No actual private configuration was inspected or changed.
- NOT_RUN: actual SQL Server locking, metadata, authority, rollback/commit durability, native behavior and runtime acceptance.

Root must independently review the final delta and run all inbound tests and full required exact-head/base hosted checks before integration, including resolution or controlled comparison of the broader startup failures. These local synthetic results do not prove real target behavior or production readiness.
