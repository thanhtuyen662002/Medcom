# Integration handoff for goal #45

Run L01 / bee09e89-5d53-41cb-8db6-89df576de9f8 owns only its immutable claim and isolated branch. Initial source base: a78e71f0852fab1edb8daf161cd49ffb1481ed04; #44 later advanced to 1cc4dd40e761e5c578c1e1ee594be283795e66a8 with owner source locators. No shared branch or main write is performed by this run.

## Implemented bounded units

1. `.github/scripts/integration_gate.py`: read-only preflight fails closed on unreadable protection, current source/base drift, absent independent exact-head review, unresolved/unknown threads, unpinned or unsuccessful required checks and missing tested-current-base provenance. CLI takes a fresh snapshot; it never merges. `PREFLIGHT_PASS` is not an atomic reservation. Expected-head merge API support is observed in the connector, but readable/enforced current-base protection is not. A JSON fixture is a regression test, not policy proof.
2. `.github/scripts/claim_scope.py`: CI compares a worker source diff with the trusted PR-base ticket registry and the fetched immutable claim. Checks role, run UUID, generation, base ancestry and exclusive path allowlist, including rename/deletion and traversal denial. No claim ref mutation, timeout takeover or restricted-credential proof is asserted.
3. `tools/deploy/package.py` and `.github/scripts/package_integrity.py`: versioned format-2 candidate manifest binds the clean source revision and exact file checksums. A standalone read-only verifier rejects corruption, unlisted/missing payload, duplicate/case-colliding names, unsafe paths/symlinks and unsupported release claims. Publish ZIP, verifier and SHA-256 sidecar together. Verify hashes from the trusted CI artifact, then run `python medcom-verify-package.py medcom-server-candidate.zip` before extraction. Checksums provide integrity, not authenticity or business acceptance. No installer or production SQL is invoked.
4. `.github/scripts/tested_receipt.py`: after all tests, PR CI verifies that the actual clean checkout is exactly the merge of the event base and source parents; publishes `tested-merge` artifact. Integration must retrieve this artifact from the matching successful GitHub run, verify its run origin/event/source/base/checkout against live PR and merge commit parents, then apply the preflight. Never manufacture the receipt from old green source CI.

## Contracts and worker review requests

- OPS_QA/O01: independently inspect **actual** #44 diff at the latest head (286 files), with auth/scope/session/precision/browser adversarial cases. Also review this lead guard/packaging PR; this run does not approve its own work. A schedule setting is not proof a review started.
- PLATFORM/P01: submit the audit append/read contract in the claimed Application/Audit namespace. Lead will wire the accepted abstraction with server-derived tenant/company/principal, safe correlation and bounded redaction; fail closed if durable append required for a mutation cannot complete. Do not add a success-returning in-memory production substitute.
- COMMANDS/B01 and PILOTS/D01: supply source-bound command/effect and form/action contracts under their exclusive prefixes. Normal-password Tools.dll/full SQL/seven transfer checks are already available; no missing-procedure blocker. Keep actor/scope/status authority server-owned, preserve exact numeric text, and declare transactions, concurrency/idempotency/OutcomeUnknown/audit requirements before API/FE writes are enabled.
- FRONTEND/F01: keep the existing shared list/detail contracts while completing scoped grid/focus tests; request only a bounded lead change for additional shared API fields/root styles.

## Integration queue and owner handoff

First #44, then this lead PR and reviewed role PRs one at a time. No merge until exact source/base, current-base tested receipt, required check identities, independent review and enforceable policy pass. `mergeable=true` alone never admits integration. Recheck integrated main after each accepted merge.

Owner-side policy evidence needed: the active connection currently receives 403 when reading main branch protection; repository rulesets enumeration returns an empty list. Provide accessible actual current-base/status/review/no-bypass policy evidence or a protected merge queue before integration. This run does not change repository protection or fabricate an approval. Real SQL/TLS/trigger-version, deployment host, restore/load/RPO/RTO and real-user acceptance remain separate release gates.

This work closes four **integration/verification tooling** units, not four business features. Full ERP acceptance remains open. No issues #12–42 are closed from tooling or historical CI. The final GitHub checkpoint supplies actual head/checks and quiescent handoff; until that record exists L01 remains owned and cannot be taken over.
