# Goal #45: direct I02 integration repair checkpoint

Date: 2026-10-04. Lease: Draft PR #53, branch `codex/g45-production-i02-20261004`.
Control preimage: `12ffa215681aa85cc818fe7b90394773c6747cdc`.
Immutable claim: `medcom-claims/g45/direct/I02`; package/Windows scope addendum:
`medcom-scope/g45/direct/I02/package-windows`.

## Published handoffs recovered

- I01 writer termination: https://github.com/thanhtuyen662002/Medcom/pull/52#issuecomment-5970076949.
- Cumulative gate patch: https://github.com/thanhtuyen662002/Medcom/issues/45#issuecomment-5965508142.
- Incremental gate patch: https://github.com/thanhtuyen662002/Medcom/issues/45#issuecomment-5970559066.
- Applied only `.github/scripts/integration_gate.py` and `test_integration_gate.py`, in preimage order. Final LF SHA256 respectively:
  `b25a3046670e28d61b6543103c7c182bef8342c39fd10bf6cc2d9e00e0c056e1` and
  `6dff5bc7361cb19d3c222e808e2bae075ea9d82fa2ebd96355cbc08824cf8c9d`.
- Existing branches/claims remain preserved. Schedule state was not used as writer-release evidence.

## Repairs and verification

- Windows ZIP inspection validates original entry names and rejects normalization, traversal and NUL truncation; synthetic malicious ZIP tests preserve raw directory entry names.
- Windows required CI now runs the full Python guard suite. Required checks remain unconditional and failing checks remain blocking.
- `ci-policy.yml` adds a tested merge receipt after both required jobs succeed, using full Git history and the same `tested_receipt.py` helper as backend CI. Independent code review found a missing `TEST_EVENT`; it is now supplied. Native GitHub approval remains required.
- Local Windows verification: 61/61 guard tests, 9/9 source tests, architecture check and CI policy checker PASS; `git diff --check` PASS.
- SDK 10.0.401: locked solution restore and Release build PASS (zero warnings/errors); 43/43 backend tests PASS with `Category!=LegacyRuntime`. Result object: `tests/backend/Medcom.Api.Tests/TestResults/i02-local-backend.trx` (local ignored output, not published).
- `tools/source/validate_catalog.py`: 1,527 declared objects and 33 checksum-verified members PASS. Windows autocrlf changed working-copy bytes; every member was checked against its Git HEAD bytes and manifest SHA256 before canonical checkout bytes were restored. No manifest hashes or catalog semantics changed.

## Acceptance boundaries and next work

These are integration/build results, not SQL, staging or production acceptance. Fresh CI on the publication commit is pending at checkpoint creation. Full cumulative review against main is required for PR #53; old PR #52 CI does not prove this patch.

Next: inspect exact publication head CI and receipt artifacts; repair actionable failures before product code. Then recover and review typed transfer work from PR #50, retaining its source provenance and custody; wire API/UI/SQL/audit only with verified command semantics and runtime prerequisites.

UNKNOWN: authorized Medcom SQL test/target identity and credentials; direct private source access for this worker; complete Tools.dll runtime evidence; production host/HTTPS/secret provisioning; authorized business signoff and full ERP acceptance denominator. No source runtime, transaction, release or production completion is claimed. No raw archives, raw SQL, real rows or secrets were published.

Medcom schedules remain subject to the owner's OFF instruction; this run made no automation mutation. Goal #45 and the native production Goal stay open.
