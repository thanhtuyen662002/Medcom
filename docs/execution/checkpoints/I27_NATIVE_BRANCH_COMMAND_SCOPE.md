# I27: native branch scope in purchase commands

## Admission and provenance

- Immutable admission: `docs/execution/direct-runs/I27.json`, preserved byte-for-byte. Root is sole publisher; this is a source-only amendment to Draft PR #79.
- Admitted base: `2c80c4fb886c52550a0532d47a00d9e783d3e969`; exact verified input tree: `136ce01b7534c703c12fa799fe37b210e557a3ba`. The isolated candidate was exported from this tree, not the stale local checkout HEAD. The PR control commit supplied to the worker is `b794acf0950aa70b0b47886eb07140f8ab1b3e2b`; its commit object is not present locally, so parent must reconcile control-head publication separately.
- The owner-confirmed native NULL/empty BranchID semantics and reviewed catalog qualification are recorded in `I26_NATIVE_BLANK_BRANCH_SCOPE.md`. I27 reuses the unchanged `SqlLegacyBranchScope`; it does not re-derive or broaden that rule.

## Bounded implementation

Only the two former production `PurchaseRequestSql.BranchesText` consumers change: purchase command admission and purchase writer/lookup authority. Both resolve fresh native scope through `SqlLegacyBranchScope.ReadAsync` inside the existing serializable authority transaction, then require ordinal target membership. Live identity exact branch membership remains independently required.

Canonical credential stamp, enabled user/group, native Run + Update checks, action-specific Add checks, session fences, document checks and transaction ownership are unchanged. Native blank does not grant a function, make an empty live identity authoritative, or grant Add. The SQL constants, shared resolver, journal/intent/receipt/effect/allocator algorithms, runtime attestation, default-off DI/factory, API contracts, dependencies, workflows, FE and configuration are unchanged.

Strict receipt lookup retains its previous Denied outcome for malformed branch-authority projections through a narrow `InvalidOperationException` catch around only the resolver. Non-strict writer validation and admission failures remain Unavailable through their existing outer handling. Timeout/provider I/O and cancellation propagation are tested separately. No write outcome algorithm is changed; a denied lookup does not replace or release unresolved original intent.

## Synthetic regression coverage

All existing tests and assertions are retained; recording SQL mappings and allowlists now recognize native-user, restricted-branch, catalog-shape and catalog SELECTs. The existing `branches` fault stage maps to the restricted resolver plan so its old injections remain exercised. Existing branch denial fixtures still exclude the requested branch. New recording fields are confined to tests. Recording commands initialize `CommandType.Text`, matching the real SqlCommand default used by the unchanged shared resolver; the independent review identified and corrected the former enum-zero recording default.

Added coverage includes:

- Native NULL and zero-length with qualified explicit catalogs, independent live-scope and native Run/Update denials, fresh unique canonical native-user binding, malformed/missing/ambiguous users and catalogs, empty/missing/case-only scopes, whitespace/control IDs, aliases, duplicate and excessive catalogs.
- Projection/extra-result/provider-failure/cancellation checks at each new read seam, preserving transaction cleanup and read-only admission/lookup behavior.
- Blank-to-restricted transitions at reservation and write authority fences, replay and absent/pending/committed lookup fences, retaining original pending intent and preventing new effects or allocation.
- No-Add Save and Submit with zero allocator qualification/allocation, original-receipt replay, request-scoped composition and post-submit lookup with native restriction/restoration.
- Non-strict phase-zero/phase-one resolver I/O and malformed catalog failures: no allocation/business effects, with the original phase-one Pending journal retained.
- Uncertain business commit acknowledgment, later native restriction denial, then restored blank-scope replay of the original receipt without reallocation.

These are query-aware recording tests, not SQL Server, legacy DLL, browser, locking or runtime acceptance evidence. No DB, DLL or private configuration was accessed.

## Observed verification

- PASS: `python tools/backend/check_architecture.py` (five project boundaries).
- PASS: `python tools/execution/test_control_model.py` (35 tests).
- PASS: `python tools/traceability/test_filter_register.py` (40 tests).
- PASS: preparation runner's first 40 reference tests (16 audit/trace and 24 capability).
- BLOCKED: aggregate preparation runner requires unavailable historical Git object `f9197185b624a8c3f74c99e48a69550b5a7c2a73:docs/plans/PHASE2_IMPLEMENTATION_MASTER_PLAN.md`; aggregate is not a pass.
- PASS: whitespace diff validation, exact eight-path scope, byte-identical admission marker; only two production branch blocks differ from the input tree.
- NOT_RUN: .NET restore/build/C# tests, because the SDK is absent. No installation attempted. Full hosted CI on the exact final head/current base is mandatory before integration.
- Independent source/privacy review is required before parent publication/integration; this checkpoint does not assert runtime readiness or production acceptance.
