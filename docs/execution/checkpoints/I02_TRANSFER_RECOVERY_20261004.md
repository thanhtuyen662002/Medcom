# Goal #45 / I02: verified transfer handoff recovery

Date: 2026-10-04. Draft lease: PR #53; parent control/ref unchanged.
Previous publication: `6cb69451107a2561c2ccfbe1ec634ccf0a92318a`.

## Custody and immutable input evidence

Recovered six transfer files from immutable PR #50 head
`81bbc9160debaa4f6469128bfe552554fe46e1d6`, without writing that branch or its claim.
The public terminal handoff supplies the bounded patch and local verification receipt:

- Implementation: https://github.com/thanhtuyen662002/Medcom/issues/45#issuecomment-5970259898;
  exact LF diff SHA256 `451b04b847280776b16086d1ee747b2c7ef974ecd1917368a02df8e1d09051d8`.
- Tests: https://github.com/thanhtuyen662002/Medcom/issues/45#issuecomment-5970264804;
  exact LF diff SHA256 `516d1b689c83517b48c68ee7bd9da4a48f2944ada31be808304e13219641679d`.

Implementation preimage Git blobs match the immutable head. Patches were applied sequentially;
all six resulting LF file SHA256 values match the supplied terminal receipts. Windows checkout
newlines and an incorrectly transcribed local test-patch hash caused recovery to stop; they were
resolved by consulting the immutable Git bytes and original public receipt. No failed assertion
was bypassed, and implementation was not applied twice after detection of its completed state.

| File | Final LF SHA256 |
| --- | --- |
| `docs/erp/TRANSFER_COMMAND_CONTRACT_20261003.md` | `681e22ce2fa72e8d9eaa989d246f8f37848f657d8b6181d73adffecdc9527ff6` |
| `src/backend/Medcom.Application/Transfers/TransferActionCatalog.cs` | `eb9457b8b0fc3fc2edecccd80b48fd0f9dbb0e4292615da36a12e0e2c492e774` |
| `src/backend/Medcom.Application/Transfers/TransferAtomicExecution.cs` | `20b4e77bb82a3a51ecdee2243b44680723caafa00227344bee276b7190ef6c3c` |
| `src/backend/Medcom.Application/Transfers/TransferCommandValidation.cs` | `d1e6e2a1c095702dea6182a0c22550961532e006fb8b6d6fe1b06b62d0e210fe` |
| `src/backend/Medcom.Infrastructure/Transfers/TransferAtomicCommandAdapter.cs` | `2d14702e361df3114d57caca61f23d714ad69c90df5dfa344b77762b0f5e2580` |
| `tests/backend/Medcom.Api.Tests/TransferCommandTests.cs` | `07b13fa0d2d671f550d53d365613605ac12c5f1ec332ebfb164d09ae95e0a890` |

## Fresh verification and limits

Windows SDK 10.0.401 Release solution build: PASS, zero warnings/errors.
Backend tests excluding `Category=LegacyRuntime`: 143/143 PASS.
Local result object: `tests/backend/Medcom.Api.Tests/TestResults/i02-transfer-recovery.trx`
(ignored test output; synthetic fixtures, no production rows). `git diff --check`: PASS.

Predecessor publication `6cb6945...` CI is green: backend workflow run 37154941675;
policy/Windows workflow run 37154941654, including `tested-policy-merge` success.
These runs do not prove the new transfer publication; fresh exact-head CI remains required.

Recovered code defines source-linked action catalog, typed admission and receipt correlation;
the atomic gateway remains an interface. There is no SQL provider or transfer API/UI registration
in this publication. No domain write is enabled and no transfer capability is accepted as complete.
Database concurrency evidence, authority reread, detail persistence before procedure execution,
transactional audit/idempotency, actual SQL effect and UI roundtrip remain required work.

Source declarations come from the predecessor/public source metadata; direct verification of the
private ERP/SQL/Tools files by this worker remains UNKNOWN pending exact accessible evidence.
Authorized SQL environment/host and business signoff remain UNKNOWN. Full ERP scope denominator
and production acceptance remain unclosed; Goal #45/native Goal stays active. No automations
were created/enabled and no deployment or SQL mutation occurred.
