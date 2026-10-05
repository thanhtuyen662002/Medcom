# I10 local checkpoint

Admission: Draft PR62; immutable control/claim
`a1b48f9857979f635b33607957dc0e558efd7fe2`, base
`af859552f1e8122ac65e834f401baeeb0eb67c97`, control tree
`fa42fc2bca20ae5a1dec484cc6bbc7e4a510160b`, run
`0baac731-e9ac-43f1-ad8a-2b21035d963b`.
Live work and claim refs were checked before a NEW isolated checkout. B01 PR50
head `81bbc9160debaa4f6469128bfe552554fe46e1d6` and P01 PR49 head
`f24673ae3046fbb31a70cf175da4e463cd2f5465` remained open Draft; their claims/paths
were preserved. The I10 control marker is unchanged. Parent alone publishes/integrates.

One concrete feature: unregistered two-phase PM Return workflow with new unapplied
SQL audit, exact I09 borrowed probe/lookup seam, typed plans and strict readbacks.
`docs/backend/PM_RETURN_WORKFLOW.md` records custody, rollback/unknown/replay,
source/log metadata, schema/version pins and remaining gates.

Source metadata inspection first verified the complete approved member's
1,212,595,716 bytes and SHA-256
`61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`.
Log schema/procedure metadata confirmed generated UserAutoID, UserName actor,
status and Notes parameter mapping. No private SQL body/data/path is included.
Previously denied private fixture directories were not accessed or bypassed.

Local observed checks:
- Release build: zero warnings/errors.
- 470/470 disjoint offline backend tests: 451 with legacy runtime/configuration
  cases excluded, plus 19 configuration cases with process-only test selector unset.
  75 new I10 cases execute production orchestration; 395 inherited cases include I09.
- Architecture: five project boundaries, PASS.
- Finite catalog: 1,527 objects and 33 checksum-verified members, PASS.
- Source scanner: 48 tests PASS. Integration/package guard: 97 tests PASS.
- Native Windows reference runner encountered inherited shebang WinError193.
  An external explicit-interpreter adapter then passed all 23 reference suites.
  It verified reference scripts/validators against the immutable admission, changed
  no assertions/repository scripts and wrapped only known Python shebang invocations.
  This is observed Windows interpreter-equivalent validation, not a native shebang
  success or hosted Linux CI claim.

Code/test checkpoint `2037217dea5565711d37f8bf742c71ffe4b83865`, tree
`3900614757328fe04ec2c648943b350141b6e9df`, has six implementation/test changes.
Documentation is added separately; the tested code/schema/test bytes are unchanged.
Fresh detached checkouts of that exact code commit with process-only
`core.autocrlf=true` and `false` both preserved 1,628 UTF-8/LF audit artifact bytes,
SHA-256 `06e27844cddf2080b37351cf312f9f9481d8e010334260feed8e992c3a908dc9`, no CR.
Both ran the existing exact-byte/typed-correlation production-workflow test: 1/1 PASS
each; builds had no warnings/errors. No global Git EOL setting or hash normalization
was changed. Original I09 artifact SHA-256 remains
`c7a777578470d1bc4b150503eb4fad7e7497386643c1cf2225e10e916e00f2ce`.
I09 store diff consists only of two private-to-internal visibility changes; public
standalone methods, SQL plans, codec and ACK behavior are unchanged. Immutable I10
marker remains blob `0c69577ab4daae02d7ece9d6744e25459b126b53`.

No real SQL connection, schema application, private fixture execution, API/DI/
readiness/FE activation, security/service change, GitHub publication or upload occurred.
Recorded concurrency is synthetic; actual engine/source/WinForms/crash/durability,
live session integration, stale-state/ABA and business/release gates remain open.
Independent review and hosted exact-head/base CI are pending parent handoff.
