# I31 — dormant existing-document inbound command admission

## Admission and source provenance

- Draft PR #83, immutable control `547000d2d20a8ebc4110fe025c7978e2323ce626`, historical admission base `3a2a4e90cbbb66e4b4f4caca47ff37859cb397e9`. `docs/execution/direct-runs/I31.json` is copied byte-for-byte from the immutable admission marker; its historical base is not rewritten.
- Current composed input is main `bf2a58000319de6ad64bd3ce98e42bdbbf38dea7`, exact tree `2ebea8f576c001d1bb6004a5dc4e8f7cf5755727`. The candidate was exported from that explicit tree, not a stale checkout HEAD. Root verified the remote commit/tree mapping and remains the only GitHub publisher/integrator.
- The twelve-path maximum admits six production files, four test files, this checkpoint and the immutable marker. No ApiHost/default activation, FE, purchase, shared session authority, SQL plan/schema, settings, secrets, dependency, workflow or legacy-DLL file changes are included.
- Source semantics are those already retained in `I15_INBOUND_REQUEST_COMMANDS.md` and the reviewed I26/I27 branch-scope checkpoints. Relevant preserved evidence: source-set `inventories/source/20261002/source-set.json`; menu 07011 / IV_InboundRequestFrm at SY_Menu source line 319992; C4 Send statement at form-config line 303587; configured validation at line 304951; fixed T1 expressions at lines 309228/309229. The I15 checkpoint retains the exact approved source hashes and sanitized DDL/config object addresses. The older maintenance-guide reconciliation remains supplementary evidence, not deployed-runtime proof. This composition does not re-execute private source, SQL or Tools.dll.

## Bound composition

`AddDormantInboundDraftCommands` is an opt-in helper that ApiHost does not call. The unchanged facade remains registered/mapped with unavailable defaults. A factory without a matching `InboundDraftCommandRuntimeAcceptance` returns unavailable before invoking the live session resolver, connection delegate, allocator qualification or SQL. Acceptance binds the supplied database-binding GUID and exact tenant/company and requires an external evidence reference. These typed values are inputs; they do not verify their own truth, create an acceptance artifact or qualify the target. No real acceptance instance is supplied.

The integrator must bind the connection delegate to the accepted physical target and obtain real journal/transaction/business acceptance separately. I15's existing journal column projection is explicitly insufficient for that purpose. `schemas/backend/inbound-request-command-journal-v1.sql` remains an **UNAPPLIED target design**. No schema is installed, probed as qualification, changed or inferred present by I31.

The request scope captures only the original server-authenticated `ResolvedSession` whose sole session claim exactly matches its token. It never reads a caller identity/token header or query parameter and never follows later HttpContextAccessor changes. Each access/read/execute/reconcile invocation creates independent session fences. Actual `IWebSessions.ResolveAsync` observations must preserve token, principal, tenant, company, credential stamp and canonical complete capability/branch sets, and carry a positive version no lower than that invocation's last accepted observation. Frozen copies prevent mutable source collections changing earlier scope. Versions are neither pinned nor rewritten; shared authority/session implementations are untouched.

The factory calls the actual `SqlInboundDraftCommandService`. Its internal seam reuses I15's existing native credential/menu/grant implementation, including native Run AND Update for menu 07011, exact form/parameter identity, enabled principal/group and matching credential stamp. There is no new or copied permission SQL. The former native branch query consumer now calls unchanged `SqlLegacyBranchScope.ReadAsync` within the existing serializable transaction, then intersects its result with the current live identity branch set. Native NULL/empty expands only to the qualified explicit catalog; restrictive assignments, malformed/ambiguous catalogs and physical aliases stay fenced.

The separate read-only authority reader reuses that native grant seam and I15's complete aggregate physical-document/child checks. It reads fresh grants again before returning, rolls back and disposes its owned transaction/connection, then re-resolves the session after cleanup before releasing positive access. Failed cleanup, cancellation or a changed final session closes admission. It never commits, allocates, reserves an operation or changes a business row.

There is no independently proven native Send permission column. New Send needs a separate `NewSendEvidenceReference` within the same bound acceptance input. This admission gates Execute only; it is not inferred from a list/read capability. Historical reconciliation of an original Send requires current native Run+Update and branch scope, not qualification for a new Send. Read and authority checks have no draft-status predicate, so authorized status-2 observations and original receipts remain eligible. I15 retains its own state-0/1 dispatch rules and exact status-2/log effects.

Create is rejected before session/SQL/allocation/reservation, with a throwing allocator tripwire behind the unreachable dispatch path. Existing-document Save may add detail rows under unchanged I15 rules; no purchase no-Add policy is imported. Original DTO/intent/operation/receipt/equality and journal algorithms are retained. Reconcile calls only I15 Reconcile; pending/unobserved operations remain unknown and never authorize a takeover, new key or writer redispatch. Successful data/receipts receive another real session fence after I15 cleanup. Losing that final fence suppresses Read data or returns an unknown command outcome without a receipt; this is not a rollback claim and retains original-intent custody.

## Synthetic regression coverage

All existing inbound cases and assertions remain. The added source declares 139 cases: 65 admission, 46 composition and 28 session-fence cases. This is a source-derived inventory, not an executed test count. Query-aware recording fixtures recognize the unchanged shared native-user/restricted/catalog plans, expose bounded failure/cleanup hooks and model native per-grant Run/Update rather than an always-granted authority. Tests exercise the actual I15 service through the production factory and request DI composition; no business service is substituted.

New cases cover missing/mismatched acceptance with zero session/factory/SQL work; authenticated anchor and claim matching; monotone versions and complete frozen scope; native Run/Update loss; malformed, duplicate, excessive, missing, case-only and aliased catalogs; live/native scope intersection; physical child aliases; cancellation and I/O/cleanup failures; native blank-to-restricted changes at reservation, phase-one, pre-effect and pre-commit checks; original pending custody; lost commit acknowledgement; restored-scope original-receipt reconciliation and read after status 2; separate new-Send qualification; and blocked Create with no side effects.

Composed tests use real `LegacyIdentityAuthority` and `LocalWebSessions` with synthetic user-store/password-verifier/clock dependencies, recording connections and the actual DI helper. The supported flow reads, saves including a new detail row, sends to status 2 with one log, then reconciles original receipts without extra writes. These recordings establish neither SQL Server locking/collation/driver behavior nor native callback equivalence, actual permissions, real target binding, browser behavior or production readiness.

## Verification and honest limits

Observed locally:

- PASS: twelve-path scope validation, original inbound test-method preservation, immutable marker byte comparison and whitespace diff validation.
- PASS: exact archived input tree equals `2ebea8f576c001d1bb6004a5dc4e8f7cf5755727`.
- PASS: `python tools/backend/check_architecture.py` (five project boundaries).
- PASS: `python tools/execution/test_control_model.py` (35 tests).
- PASS: `python tools/traceability/test_filter_register.py` (40 tests).
- PASS: first two preparation suites (16 audit/trace and 24 capability cases).
- BLOCKED: aggregate preparation run needs unavailable historical Git object `f9197185b624a8c3f74c99e48a69550b5a7c2a73:docs/plans/PHASE2_IMPLEMENTATION_MASTER_PLAN.md`; it is not a full aggregate pass.
- NOT_RUN: .NET restore/build/analyzers/C# tests, because this local environment has no .NET SDK. No SDK/dependency install, alternate owner-laptop execution, usage-limit evasion, private configuration, DB/DLL execution or test suppression was attempted.

Root must independently review the frozen source and privacy/scope, run all required tests and full exact-current-head/base hosted CI, verify the marker and positive shared-path custody, and publish only the reviewed bounded delta. No merge, enabled runtime, real acceptance, deployment or production outcome is claimed by this checkpoint.
