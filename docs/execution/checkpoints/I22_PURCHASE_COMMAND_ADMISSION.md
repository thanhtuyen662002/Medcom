# I22 — Dormant purchase command admission / session observation correction

**Candidate source only; .NET/xUnit and real runtime remain unverified. API is not activated.**
Date: 2026-10-06. Repository: `thanhtuyen662002/Medcom`. PR: #73 (draft admission).
Base: `b1eb57077c2112a808c7ce2e581511741fa971a1`.
Control: `f319f62fb2c0419472be272511143c07790e7523`.
Run: `62e7cfcf-089b-43d5-9b92-8f7a96c4eb22`.
The immutable marker `docs/execution/direct-runs/I22.json` is unchanged. No commit, push, merge,
deploy, database/DLL execution, private configuration read, or runtime activation occurred.

## 1. Custody and amended scope

The original I22 seven-file candidate is the exact ZIP previously handed to Mika:

- `Medcom_I22_seven_files.zip` SHA-256
  `d1456c3cc14972b5d8aa1b4fdd4594fffe559a052110537c8b93d4904e0ed0ff`.
- Original base patch SHA-256
  `f48c9a2129ae069ff15426d525303108803e1eddefe5c79a9d5ffb74f015e2bd`.

The parent amendment in PR73 comment `#issuecomment-6010402942` admits four additional
feature-specific paths while preserving the original seven and the immutable marker:

```text
src/backend/Medcom.Infrastructure/PurchaseRequests/PurchaseRequestSessionFence.cs
src/backend/Medcom.Infrastructure/PurchaseRequests/SqlPurchaseRequestCommands.cs
tests/backend/Medcom.Api.Tests/PurchaseRequestSessionFenceTests.cs
tests/backend/Medcom.Api.Tests/PurchaseRequestCommandTests.cs
```

The complete owned mutable set is therefore eleven paths. The correction delta changes nine of
them; `PurchaseRequestCommandFactory.cs` and `SqlPurchaseRequestCommandAccess.cs` remain byte-for-byte
identical to the original I22 candidate and are included only in the full-files handoff.

The two existing main files opened by the amendment use these exact base blobs:

| Base file | Git blob at `b1eb570...` |
|---|---|
| `src/backend/Medcom.Infrastructure/PurchaseRequests/SqlPurchaseRequestCommands.cs` | `dc191d4f23179d08b5394a9892ffbbfa96508e17` |
| `tests/backend/Medcom.Api.Tests/PurchaseRequestCommandTests.cs` | `fc845dc35ab6c567ea644b31f53b70e25de0db71` |

The latter includes the four xUnit2031 assertion-overload corrections already present on the
pinned base. The correction does not restore the earlier I19 test bytes.

No changes are made to `LegacyIdentityAuthority`, `LocalWebSessions`, Application authentication
contracts, `PurchaseRequestSql`, schema, I20, FE, configuration, dependencies/lockfiles, CI, ApiHost,
canonical intent/journal/receipt formats, allocator contracts, or the immutable I22 marker.

## 2. Purchase-specific observation fence

`PurchaseRequestSessionFence` is a feature-specific, in-memory tracker whose instance belongs to
one admission/command/lookup invocation. It does not alter or wrap the authority's returned
`AuthorityVersion`.

The first accepted observation freezes this security scope:

- principal ID;
- tenant ID;
- company ID;
- credential stamp;
- the complete capability set after ordinal distinct/sort canonicalization;
- the complete branch set after ordinal distinct/sort canonicalization.

Every accepted observation must have `AuthorityVersion >= 1`, the same frozen security scope, and
a version greater than or equal to the **last accepted observation**, not merely the first one.
The high-water mark advances to the actual accepted version. Equal observations are allowed;
unchanged `1 -> 2 -> 3` is allowed; `1 -> 1 -> 2 -> 1` is rejected at the final regression.
Versions are neither pinned nor rewritten.

Canonicalizing the sets makes ordering/duplicate presentation irrelevant while preserving every
actual capability/branch value. Adding, removing, or replacing any capability or branch is a
security-scope change and is rejected even when the version increases.

There is no global/static tracker. `SqlPurchaseRequestCommands` constructs a fresh fence in each
`Start`/`StartLookup` call and carries that same object through phase 0 reservation, phase 1 write,
replay fences, and lookup cleanup/post-cleanup observation. `SqlPurchaseRequestCommandAuthorityReader`
constructs one fence per `ReadAsync`. Reusing either service object across independent invocations
does not share high-water state.

## 3. Existing I14/I19 gates remain authoritative

Only session-observation comparison is replaced. Existing writer/lookup behavior remains in the
pinned I14/I19 implementation:

- runtime qualification and database binding/schema/transaction probes;
- fresh native SQL credential/group/menu/form/parent/branch authority checks at every existing fence;
- journal key, slot, full canonical intent bytes, receipt and effect validation;
- current physical document/branch/FK scope checks before receipt disclosure;
- reservation/custody, allocator qualification/allocation, transaction and commit behavior;
- no-Add Save/Submit numbering distinction;
- read-only original-intent lookup and its cleanup behavior.

The correction does not weaken EDIT to `purchase-requests.read`. Admission still requires native
Run+Update for menu `05011`, form `AP_PurposeRequestListFrm`, parent `05`, active actor/group and
exact branch/document/binding. Lookup continues to recheck the action's native authority and all
journal/intent/receipt gates. No SQL text or schema was changed.

The two inherited regression meanings are explicit:

- the writer fixture driven by `VersionChangeAt=3` observes `1 -> 1 -> 2 -> 1`; the increase is
  valid, but the later decrease below the last accepted observation must deny before business write;
- a lookup-only monotone version increase with unchanged scope is **not revocation** and must still
  return the original committed receipt. Late lookup denial cases now use concrete logout,
  principal/tenant/company/credential/branch/native-grant changes or cancellation.

## 4. Request-scope composition keeps the original server token

`PurchaseRequestCommandRegistration` still captures the server-authenticated session token from
`AuthEndpoints.ResolvedKey` plus the single matching session claim. It does not accept a token from
DTOs, headers, query strings, or the I20 supplied view.

Every admission/Save/Submit/Lookup invocation creates its own request-scope
`PurchaseRequestSessionFence`, seeded with the authenticated server anchor solely as the frozen
scope/high-water baseline. Every subsequent step calls `IWebSessions.ResolveAsync(anchor.Token,
false, ...)` again. A resolved identity is returned only after the per-invocation fence accepts its
actual version and complete security scope. No live identity result is cached and no version is
coerced to the anchor.

`RequestCommands` now creates a fresh composed command service per public invocation. This prevents
a request-scoped wrapper from accidentally sharing observation high-water state between overlapping
Save/Submit/Lookup calls. The inner `SqlPurchaseRequestCommands` also has its own per-invocation
fence, so its phase 0 -> phase 1/replay lifecycle remains continuous.

The admission reader uses equivalent semantics: its own invocation fence spans first session
observation, native SQL/document reads, second native authority check, cleanup, and the post-cleanup
session observation. Cleanup fault still cannot release `Admitted`.

Runtime acceptance remains default-off. Missing/mismatched acceptance returns unavailable before
calling a session resolver or opening SQL. No config/static-test shortcut manufactures
`runtimeQualified=true`; `AddDormantPurchaseRequestCommands` remains uncalled by `ApiHost`.

## 5. Existing-document behavior and allocator boundary

I22 still dispatches only no-Add Save and Submit. Its allocator is a deny-all tripwire. Create and
Save-with-Add remain blocked before writer dispatch. No-Add Save and Submit must never consult an
allocator. Original-intent Save/Submit lookup remains available after the document has been
submitted/locked; the admission reader intentionally does not require current draft status.

A Submit's own status/lock transition therefore does not invalidate the post-dispatch receipt solely
because the document is now submitted. Current authority, branch/document scope and all I19 receipt
checks still apply.

## 6. Composed test source added for the real session contract

New/updated tests cover both the fence itself and the existing real authentication/session classes
without modifying those shared classes.

`PurchaseRequestSessionFenceTests` covers:

- canonical capability/branch sets and monotone `1 -> 2 -> 3` acceptance;
- zero/negative versions rejected;
- regression checked against the last accepted observation;
- principal/tenant/company/credential/capability/branch changes rejected;
- independent fence instances carrying independent high-water marks.

`PurchaseRequestCommandCompositionTests` now composes the actual `LegacyIdentityAuthority` and
`LocalWebSessions` with an in-memory `ILegacyUserStore`, fake accepted password verifier and the
existing recording SQL provider. No legacy DLL or actual SQL is involved. Source assertions cover:

- no-Add Save, Submit, interleaved ordinary polling, and original-intent post-Submit Lookup while
  authority observation versions increase monotonically with unchanged scope;
- lookup snapshot/journal/commit/allocator invariance and no reservation/DML/commit during lookup;
- logout, idle expiry, branch/capability/credential changes and native Update grant loss;
- nonpositive and decreasing versions in request-scope synthetic observations;
- the retained two-wrapper purchase-invocation test uses synchronous doubles and separate
  recording databases; `Task.WhenAll` alone does not establish overlapping invocations;
- a deterministic same-request-wrapper Lookup test uses asynchronous delivery gates around real
  `LocalWebSessions` snapshots: both calls reach their first snapshot, a passive poll advances the
  authority, the second lookup completes, and only then is the older first snapshot delivered.
  Both calls must return controlled `Absent` with no receipt and strictly increasing own observation
  sequences, while every observation uses the original server token. A shared high-water tracker
  would reject the delayed snapshot. The gates prove overlap and keep SQL recording access serial;
  bounded waits/cancellation drain both calls on failure. Snapshot/journal/commit/allocator checks
  and the fixed read-only SQL allowlist reject reservation, DML or commit effects.

`PurchaseRequestCommandAdmissionTests` now treats a pure version increase as valid when security
scope is unchanged, while logout/stamp/branch/principal/capability changes remain denials.
`PurchaseRequestCommandTests` retains the inherited `1 -> 1 -> 2 -> 1` regression test under a name
that states its real meaning and adds successful monotone lookup coverage.

These are **source tests only until a .NET test runner executes them**.

## 7. Point-in-time limitation; no new ABA claim

This fence only compares observations that the invocation actually receives. It cannot prove an
unobserved authority sequence such as `A -> B -> A` that changes and restores the security scope
entirely between two observations. No historical authority revision store, monotonic security-policy
revision, or new persistence mechanism exists in I22, and this correction does not claim ABA
protection. Native SQL/session rechecks are point-in-time observations, not a lease lasting through
network delivery.

## 8. Verification status

`dotnet` is not installed in this sandbox. Therefore **C# tests executed: 0** and every .NET build,
analyzer and xUnit status below is **NOT_RUN**. Static/source checks are reported separately and are
never labeled xUnit PASS.

| Check | Status |
|---|---|
| Source/provenance/scope/static guard script | **PASS 83/83 static/source checks** — not C# execution |
| Delta apply/reverse/byte-equality on isolated path snapshot | **PASS** |
| Full-files ZIP CRC/hash verification | **PASS** |
| `dotnet --info` | **NOT_RUN — executable absent** |
| I22 admission/composition/session-fence xUnit | **NOT_RUN** |
| Session/Auth/Purchase/Inbound regressions | **NOT_RUN** |
| Full backend suite | **NOT_RUN** |
| Actual SQL/DLL/private runtime/allocator acceptance | **NOT_RUN** |
| HTTP/FE/phone/production acceptance | **NOT_RUN** |

When a reviewed full checkout and accepted I20 are available, the intended verification includes the
I22 composed tests plus inherited Session/Auth/Purchase/Inbound suites and then the full backend
suite. This handoff does not invent PASS results for those commands.

## 9. Remaining integration gates

Before activation Mika still needs: compile/analyzer/xUnit on the exact integrated candidate,
accepted corrected I20 compatibility, independent code/privacy review, exact-head/base CI, actual
target runtime acceptance, and authorized disposable SQL qualification of locking/cancellation/
cleanup/binding/durability behavior. Real allocator behavior remains outside I22; I22 deliberately
admits no Create/Add allocation.

The original FE reconciliation rule remains unchanged: a valid `Committed` lookup receipt resolves
the original unknown write; `Pending`, `Absent`, `Unavailable`, timeout or cancellation never grants
permission to replace the intent, change its key, or resend the write.
