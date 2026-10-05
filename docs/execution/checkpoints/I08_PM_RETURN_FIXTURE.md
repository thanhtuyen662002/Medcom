# I08 - private PM Return fixture preparation checkpoint

Admission: Draft PR #60; control/immutable claim
`2716a783810814abce37572bd115e7e39967b739`, base
`5db981098fef10ff8c201b4c7fffe607986e0c0b`, run
`5b1c3a96-0a41-4e2c-912e-7854097cf628`.
Claim branch `medcom-claims/g45/direct/I08`; work branch
`codex/g45-pm-return-i08-20261005`. Parent is the sole publisher.
Live claim/PR/head/tree were verified before a new isolated laptop checkout.
I05/I06/I07 and B01/P01 remain preserved; inherited I08 claim is unchanged.

Five new files implement the pinned private source extractor, adversarial synthetic
tests, technical-only finite closure inventory, source/seed documentation and this
checkpoint. Existing extractors, shared v1, Audit, API/DI/capabilities/readiness,
package locks, SQL databases and machine/service/TLS settings are unchanged.

The initial read-only Node analysis found 14 direct objects, then included whole
supplemental DDL and outgoing foreign keys to close 26 objects and 116 batches.
The new Python scanner independently reproduced that set from the full authorized
dump and matched all 142 exact definition/batch hashes/ranges. Inventory contains
only schema/types/names/dependencies/hashes, never SQL bodies or original row values.
The complete source member hash/size were checked before extraction and again after
scan. Actual SQL output remains outside every checkout/publication path.

## Verification

Python 3.12.10 was already installed under the owner identity; no interpreter or
global package was installed. Restricted sandbox execution of that existing binary
was denied; tests/extraction ran with the authorized owner identity. To close the
initial policy-parser gap, the parent explicitly authorized a separate test venv
outside every checkout with only project-pinned PyYAML==6.0.3 from HTTPS PyPI.

- All source-tool tests after privacy correction: 48 passed, including 37 new
  synthetic extractor tests.
  An actual Windows parent-rename test found that zero-access directory handles did
  not fence renames; FILE_LIST_DIRECTORY handles fixed it and the revised test passed.
- Architecture verification: all five boundaries passed. Finite catalog verification:
  1,527 objects and 33 raw-byte checksum-verified members passed.
- With that isolated venv, CI-script unittest discovery: all 97 tests passed;
  CI policy validation passed. The original global Python remains unchanged.
- The unmodified preparation runner fails identically on frozen 1819b3 and exact
  control 2716a783 with WinError 193 when directly launching a Python validator.
  An external allowlisted wrapper supplies an explicit interpreter; Windows CP1252
  then fails identically in L08, so Python UTF-8 mode supplies the hosted-platform
  encoding equivalent. No shared script/assertion or permission check is changed.
  The local-only helper is `i08-validation-support/explicit_preparation_interpreter.py`
  outside the checkout. Invocation: `<venv-python> -I -B -X utf8 <helper> --all <checkout>`.
  It verifies the admitted head and exact-control validation sources, supplies an
  interpreter only to four allowlisted direct-validator calls, and preserves arguments,
  cwd, environment, result codes and all positive/negative assertions. Python children
  use UTF-8 mode; no shell, executable association or machine encoding is changed.
  All 23 reference suites passed with this equivalent on both the corrected checkout
  and exact control. This is not a native-Windows aggregate or product/runtime PASS;
  the unmodified aggregate still has its original Windows invocation incompatibility.
- Final actual private extraction independently matched all 26 objects/116 DDL batches,
  with full input hash checks before and after scan. Output: 40,072 bytes, SHA-256
  `52b156ddb42329dfbf01f0c9f2523e3d6912b576717a831855210e5f3e190fa5`.
  Receipt flags originalRowsCopied/sqlExecuted/compileTransactionDurabilityAccepted
  are all false. Raw schema stays outside the checkout and handoff package.

Windows Git CRLF conversion caused the inherited catalog raw-byte checksum check
to fail initially; exact HEAD blob bytes were restored in this new checkout without
changing catalog Git blobs or validator behavior. No inherited source diff is accepted.
The preserved old 1819b3 checkout also fails the L10 reviewed-artifact checksum under
the interpreter/UTF-8 equivalent: its L09 freshness JSON contains 232 CRLF lines.
Its raw hash differs, but universal-LF bytes match the expected exact Git blob
`ab5074c1e462e4abe3794a973eba6448cb82274c5020209e8722127ba77a0b85`.
The new control/fix worktrees use exact LF blob bytes; no checksum gate is weakened
and the old frozen checkout is not rewritten.

## Independent review correction

The parent blocked frozen candidate `1819b3adaa4b9a19d2aacec27ce1d64ddd48f22b`:
Windows normalizes a `public.` component, allowing private output under real `public`.
That candidate/checkout and its evidence remain preserved and are not for publication.
A direct synthetic-only negative control confirms the old code writes the normalized
public schema file and the corrected code refuses before creating any output.
The corrected guard rejects trailing dots/spaces, ADS/invalid characters and reserved
device aliases before filesystem lookup, then validates the supplied and resolved
destination/source chains and every ancestor before repository/public admission.
Five added regressions cover real Windows normalization, lexical fail-closed behavior,
source aliases, canonical public/repository parents and resolved reparse metadata.
Source pins/closure inventory remain unchanged. Documentation now correctly names
six SY authority tables and excludes generated identity STT columns from seed inputs.

## Remaining acceptance

`docs/backend/PM_RETURN_EXECUTION_FIXTURE.md` records the private path contract,
finite dependencies, synthetic-only seed design and future test-runtime needs.
Extraction output is never treated as SQL compile/transaction/durability acceptance.
Owner-selected disposable instance, trusted SQL TLS and bounded test-database
authorization remain pending; no SQL connection/create/drop/DDL application,
owner DLL execution, service/system-install/grant/certificate/network change occurred.
Complete WinForms/live-trigger/concurrency/ABA/recovery/business acceptance remain open.
Candidate is handed to the parent only after local checks; its independent review,
exact-head/base CI and publication remain separate gates.
