# Phase 2 security, data and failure attack review

Review date: 2026-10-01 (Asia/Bangkok). Scope: plan tabletop and future acceptance design; no live attack, database operation, application launch or runtime test was performed by this review.

**Disposition: 40 concrete attack cases specified; implementation and runtime evidence remain pending.** A mitigation written below is a proposed acceptance requirement, not a passed test. The review does not declare Phase 1 closed or make an implementation issue eligible. Authorization, dependency completion and relevant evidence/runtime gates remain separate decisions in the canonical issue graph.

## Evidence and ownership boundary

Reviewed sources:

- `AGENTS.md`, `docs/EVIDENCE_STANDARDS.md` and `docs/SOURCE_BASELINE.md`.
- Owner attachment `HUONG_DAN_BAO_TRI_ERP_WINFORMS.md`, SHA-256 `f2d2b8dff8ebdf7f67495d22a1c17966f2959222ab4c7703eda2c1d4f61cf179`; historical survey 2026-09-26, split 2026-09-30. Sanitized source descriptions and attachment locations are centralized in [WINFORMS_SOURCE_GUIDE_EVIDENCE.md](../erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md). The guide is a secondary maintenance summary; its attributed source files were not opened and its historical database does not replace the Medcom baseline.
- [Implementation master plan](../plans/PHASE2_IMPLEMENTATION_MASTER_PLAN.md), especially sections 4, 8–12, 16, 19–20 and 25; [canonical issue graph](../plans/PHASE2_IMPLEMENTATION_ISSUE_GRAPH.md).
- `docs/architecture/PHASE2_AUTH_CAPABILITY_CONTRACT.md`, `PHASE2_COMMAND_TRANSACTION_CONTRACT.md`, `PHASE2_SCREEN_DEFINITION_CONTRACT.md`, `PHASE2_TOOL_DLL_BRIDGE_CONTRACT.md`, `PHASE2_AUDIT_TRACE_CONTRACT.md`, `PHASE2_REALTIME_COEXISTENCE_RECOVERY_CONTRACT.md` and `PHASE2_PILOT_API_DTO_DEPENDENCY_CONTRACT.md`.
- [Concurrency and transaction evidence](../db/CONCURRENCY_TRANSACTION_CONTRACTS.md), [existing plan review](PHASE2_PLAN_ADVERSARIAL_REVIEW.md) and [Phase 1 risk classes](../risks/PHASE1_ADVERSARIAL_RISK_REGISTER.md).

`SEC-DATA-*` identifies test scenarios, not a second risk register or new workstreams. Each scenario has one accountable existing issue; supporting issues receive evidence or integration tests without duplicate ownership. Exact issue mappings are owned by the canonical graph. F5–F9 remain distinct pilot owners; AR invoice examples are parity investigation warnings, not authorization to expand the five pilots.

Severity is planning impact: **Critical** means cross-tenant disclosure, unauthorized executable behavior or duplicated/irrecoverable critical business effects; **High** means material integrity, authority or recovery failure; **Medium** means a bounded configuration or operational failure that can become severe when combined. Likelihood is UNKNOWN until source/runtime evidence is available.

Residual states below are explicit: **DESIGN-ONLY** means a binding design exists but is not implemented/tested; **SOURCE-BLOCKED** requires authoritative source/schema evidence; **RUNTIME-BLOCKED** requires controlled observations; **DECISION-BLOCKED** requires a bounded design/operations decision. Multiple states may apply. No case is CLOSED.

## Cases 001–012: compromised configuration administrator and legacy engineer

### SEC-DATA-001 — Duplicate form-wide key selects a different executable row

- **Severity / role / risk:** Critical; compromised config administrator; RISK-CONFIG-001, RISK-SEC-001.
- **Trigger / tiny steps:** In a synthetic `SY_FrmCfg` fixture, add two distinct `UserAutoID` rows sharing FID and executable KeyID but different SubID/SubValue; reverse read order and vary insertion order. Guide §3.3 reports `LayoutX.GetValue` takes the first matching KeyID and does not use those extra fields to disambiguate. The guide does not prove that current Medcom has such duplicates.
- **Safe behavior / mitigation:** Resolve identity by verified consumer branch. Quarantine ambiguous executable input; retain the previous-good version. Do not pick the smallest ID, latest VDate or arbitrary first row unless a reviewed compatibility decision proves that policy. Preserve candidate physical IDs and count in sanitized diagnostics; never silently add a unique constraint to the legacy table.
- **Measurable evidence:** Every permutation rejects publication with the same stable ambiguity code; published version/hash remains unchanged; zero executable dispatches; collision report references the consumer address and candidate count without row payloads.
- **Owner / residual:** R3 **#26**, supporting A7 #18 and B2 #21. **SOURCE-BLOCKED + DESIGN-ONLY**; intake §4 now records the rule, but actual duplicates, collation and ordering remain UNKNOWN.

### SEC-DATA-002 — LYS property identity collides with order and inherited defaults

- **Severity / role / risk:** High; config admin / legacy maintainer; RISK-CONFIG-001, RISK-SCHEMA-001.
- **Trigger / tiny steps:** Create LYS rows with the same FID/KeyID/SubID and distinct SubValue `FW`, `FH`, `BOL1`, `BOL2`; then edit one with a selector omitting SubValue. Test NULL, absent, empty, `0` and `1`. Guide §3.3 and §6.2 report SubValue is a property key and empty can mean False for Confirm1 but True for Confirm2.
- **Safe behavior / mitigation:** Include the actual LYS SubValue in the consumer-specific identity and expected-state predicate; retain NULL/empty/absent distinctions. Defaults come from the verified getter/setter/inheritance chain, not a common boolean converter or the 293-pair index alone.
- **Measurable evidence:** One-property update affects exactly one expected physical row; sibling properties remain byte-equivalent; a source-backed five-value truth table covers each boolean; ambiguous rows reject before any write.
- **Owner / residual:** R3 **#26**, supporting T1 #19/A7 #18. **SOURCE-BLOCKED + DESIGN-ONLY**; actual class declarations/default behavior remain unverified.

### SEC-DATA-003 — LYT delimiter, sparse fields and unknown tail are corrupted

- **Severity / role / risk:** High; legacy maintainer; RISK-CONFIG-001, RISK-SCHEMA-001.
- **Trigger / tiny steps:** Feed synthetic LYT strings with fewer than 21 positions, adjacent/trailing semicolons, Unicode combining characters, colon-bearing caption/default values, quotes at position 15, and an unknown position 21+ tail. Change only position 7; also submit a malformed numeric position. Guide §3.4 reports `On Error Resume Next` and context-specific quote/colon decoding.
- **Safe behavior / mitigation:** Parse with empty positions preserved and a source-versioned serializer. Preserve unmodified tokens and unknown tail verbatim in private fixtures; validate each known position. Do not blanket-replace colons, remove empty tokens, trim the tail or silently mimic ignored errors. Executable undecodable input fails closed.
- **Measurable evidence:** Round-trip preserves all unmodified tokens exactly, including trailing empties/tail; only the selected token changes; repeated parse/serialize is stable; malformed executable fixtures retain the previous-good publication and return a safe position-specific code.
- **Owner / residual:** R3 **#26**, supporting A7 #18. **SOURCE-BLOCKED + DESIGN-ONLY**; 21 positions reported by a summary are not a proven complete grammar for every build.

### SEC-DATA-004 — Stale full-FID SaveConfig erases another editor's changes

- **Severity / role / risk:** High; two config admins; RISK-CONFIG-001, RISK-DATA-001.
- **Trigger / tiny steps:** Admin A loads revision X; admin B publishes one key and a child PFID change; A saves an unrelated caption using the earlier complete snapshot. Guide §3.3 reports delete-all-FID/reinsert behavior and §5.2 warns about NULL/Unicode/rowcount preservation.
- **Safe behavior / mitigation:** Web publication uses immutable versions and optimistic expected revision; stale full snapshots conflict. Legacy persistence adapters require an explicitly bounded compare-and-update transaction or a verified compatible full-save strategy. Rollback itself must compare expected state and preserve B's later edit.
- **Measurable evidence:** A receives conflict with zero destructive replacement; B's key/PFID survives; a second rollback attempt against a changed revision also conflicts; audit records both actors and revisions. No blind DELETE-FID script is accepted.
- **Owner / residual:** A7 **#18**, supporting R3 #26/R5 #40. **SOURCE-BLOCKED + DESIGN-ONLY**; legacy SaveConfig transaction/cross-writer behavior remains UNKNOWN.

### SEC-DATA-005 — Form suffix or parent prefix selects a different business variant

- **Severity / role / risk:** High; malicious user / config admin; RISK-SCHEMA-001, RISK-AUTH-001.
- **Trigger / tiny steps:** Give two synthetic menu rows the same FormName with different Para, plus an `_EXPORT` variant and a child PFID whose name has a similar prefix. Request the base stable screen with the other variant's saved view/action. Guide §3.3 attributes instance renaming to `MainFrm.MenuClick` and AR invoice code.
- **Safe behavior / mitigation:** Registry binds menu identity, Para, resolved FID, PFID, build/source and typed contract explicitly. Do not infer identity with prefix/LIKE or strip suffixes. Unknown variants cannot inherit executable mappings, rights or defaults from a convenient base screen.
- **Measurable evidence:** Each fixture resolves to its declared contract or fails unbound; swapped variant action/record references dispatch zero commands; prefix-adjacent children remain untouched; diagnostics name a safe source/version discriminator.
- **Owner / residual:** R3 **#26**, supporting B4 #23 and relevant F5–F9 owner. **SOURCE-BLOCKED + DESIGN-ONLY**; exact current pilot variant identity remains unproven.

### SEC-DATA-006 — Type30 HTML/scripts cross the browser trust boundary

- **Severity / role / risk:** Critical; compromised config admin / attacker; RISK-SEC-001, RISK-CONFIG-001.
- **Trigger / tiny steps:** Synthetic ControlType 30 content contains executable markup, an event handler, active URI and external resource; also put markup-like text into caption/tooltip fields. Guide §3.4 labels Type30 HTMLTextOrScripts; this is not evidence that all such content is harmless presentation.
- **Safe behavior / mitigation:** Classify Type30 and active sources as executable/unsafe until explicitly reviewed. Do not export legacy script to ScreenDefinition or render it unsanitized. Allow only separately defined safe text/rich-content schemas; enforce server-side validation and defense-in-depth browser policy. Admin capability does not permit arbitrary execution.
- **Measurable evidence:** Payload serialization contains no legacy script; browser fixture executes zero injected callbacks/requests; dangerous URI/content publish rejects with prior hash retained; safe Unicode text remains legible.
- **Owner / residual:** A7 **#18**, supporting R3 #26/Q1 #36. **SOURCE-BLOCKED + DESIGN-ONLY**; exact Type30 runtime consumers remain UNKNOWN.

### SEC-DATA-007 — Registered-looking Source/Action grants arbitrary SQL

- **Severity / role / risk:** Critical; config admin / attacker; RISK-SEC-001, RISK-CONFIG-001.
- **Trigger / tiny steps:** Change a dropdown Source, DefaultValueSQL, table-slot `TN`/`TV`/`TSP`, filter alias or optional-button Source to a nonregistered object or executable expression; attempt a case/Unicode-confusable spelling of a registered ID. Guide §3.2/§3.5 and Appendix F identify many executable consumers.
- **Safe behavior / mitigation:** Server compiler resolves exact stable typed contracts and reviewed parameters/side effects. Presentation publication cannot add a SQL target. Identifier normalization must be explicit and collision-detecting; values use parameters; unknown target/alias/operator is rejected before opening execution.
- **Measurable evidence:** Every nonregistered target yields zero SQL/Tool dispatches; allow-list decisions are invariant across case/collation fixtures according to the documented policy; client payloads contain no executable sources/object selectors; prior version remains active.
- **Owner / residual:** A7 **#18**, supporting B1 #20/B3 #22/R3 #26. **SOURCE-BLOCKED + DESIGN-ONLY**; allow-list contents are evidence-gated.

### SEC-DATA-008 — UserControl22/UCC hides behavior outside the generic form plan

- **Severity / role / risk:** Critical; legacy engineer / attacker; RISK-CONFIG-001, RISK-TXN-001.
- **Trigger / tiny steps:** A layout declares ControlType 22 or UCC with an unclassified concrete control. Its click/value-change handler performs SQL, external calls, approval or saves while its visible descriptor resembles an ordinary field. Test a class name copied from Backup/outside Compile Include.
- **Safe behavior / mitigation:** Resolve actual class, constructor, inherited property consumers, event subscriptions, data binding and compiled membership. Unsupported controls remain blocked; an arbitrary class name is never a browser command target. Each effect maps to a typed authorized command or a separately reviewed passive representation.
- **Measurable evidence:** Per-control call/dependency map names exact file/build and affected objects; unclassified/excluded controls create no enabled command; allowed/denied handler contract tests cover each migrated effect. A six-property summary does not satisfy the mapping.
- **Owner / residual:** T1 **#19**, supporting B3 #22/R3 #26 and relevant pilot owner. **SOURCE-BLOCKED + RUNTIME-BLOCKED**; no claim that all controls have been read.

### SEC-DATA-009 — Placeholder ordering changes identity or pre-save validation

- **Severity / role / risk:** Critical; attacker / legacy engineer; RISK-SEC-001, RISK-AUTH-001, RISK-TXN-001.
- **Trigger / tiny steps:** Use two positional parameters with equal-looking values, a missing optional slot, and `{0}`/`{@User}`/`{BranchID}` tokens in a synthetic hook. Supply browser values resembling those tokens; reverse ParaArr order. Guide §3.5 attributes expansion to Storer/SystemPara, not a verified parameter contract.
- **Safe behavior / mitigation:** Recover source-backed parameter names/types/origins and ordering. Bind user/branch from server authority and pass typed values; reject unresolved/duplicate parameter identity. Do not mechanically replace brace text with `@SqlParameter` or rely on hidden/read-only UI flags for trusted values.
- **Measurable evidence:** Tests capture only sanitized parameter metadata and demonstrate exact positional/named binding; injected tokens cannot change actor/scope/query shape; missing/extra slot rejects before side effects; validation remains server-enforced with hidden fields.
- **Owner / residual:** B3 **#22**, supporting B4 #23/R3 #26. **SOURCE-BLOCKED + DESIGN-ONLY**.

### SEC-DATA-010 — ESS2 delayed hook breaks commit/success and duplicate semantics

- **Severity / role / risk:** Critical; SRE / accounting operator; RISK-TXN-001, RISK-JOB-001, RISK-RETRY-001.
- **Trigger / tiny steps:** For each enabled source-backed command, crash or disconnect at ESDB/ESDP, EBS, table DBS/S10, ESS and delayed ESS2 boundaries; separately select OK/Cancel branch ES2/ES4. Guide §3.5 lists these phases without proving call order/transaction ownership.
- **Safe behavior / mitigation:** Record a per-command sequence diagram and completion boundary. Pre-save writes must be enclosed or compensated according to verified semantics. Required delayed effects need durable uniquely keyed intent and a replay-safe consumer, or completion stays pending/unknown; UI OK/Cancel is not proof of commit. Post-commit event policy alone does not prove ESS2 completed.
- **Measurable evidence:** Boundary fault matrix proves one coherent business outcome, no success for missing required effects, zero rollback invalidations and at most one delayed effect; audit/reread records the same completion definition.
- **Owner / residual:** B3 **#22**, supporting B5 #24/A6 #17/Q4 #41. **SOURCE-BLOCKED + RUNTIME-BLOCKED**; hook existence does not prove invocation or total order.

### SEC-DATA-011 — Exploratory legacy startup performs automatic DDL

- **Severity / role / risk:** Critical; legacy engineer / DBA; RISK-ROLL-001, RISK-SCHEMA-001.
- **Trigger / tiny steps:** A verifier launches ERP/Connector against a convenient configured database just to inspect a default or log in. The owner guide §1 explicitly warns that Connector has automatic DDL paths; those bodies/conditions are not verified here.
- **Safe behavior / mitigation:** Inspect startup/source initialization before launching. Runtime tests use a positively identified disposable nonproduction copy, constrained credentials and an approved DDL observation policy. If required startup DDL is denied or unmapped, report a blocked test rather than escalate credentials or move to production. Capture sanctioned metadata changes privately.
- **Measurable evidence:** Test-run record includes resolved target/build and before/after schema hashes; production connections are never opened; every observed DDL statement is classified and expected or stops the run. Initialization requiring unexpected DDL fails closed.
- **Owner / residual:** T1 **#19**, supporting B2 #21/R5 #40. **SOURCE-BLOCKED + RUNTIME-BLOCKED**; no startup was executed by this review.

### SEC-DATA-012 — Source membership/build mismatch creates false parity evidence

- **Severity / role / risk:** High; auditor / legacy engineer; RISK-SCHEMA-001, RISK-SUPPORT-001.
- **Trigger / tiny steps:** Inspect a same-named VB file in Copy/Backup or a source tree whose Tools project does not match the supplied DLL; infer 389/511 Compile Include counts are forms; use a successful Web build as WinForms verification. Guide §2/§7/Appendix A explicitly separates membership, dependencies and build/runtime.
- **Safe behavior / mitigation:** Evidence manifest identifies source commit/archive hash, project membership, declared classes, target framework, private dependency/HintPath versions, binary hash and build output. Missing licenses/dependencies or unverifiable source-to-binary provenance remain explicit blockers. Static summary, compile success and runtime parity are separate results.
- **Measurable evidence:** Every migrated handler reference resolves to a member of the verified project; excluded duplicates are flagged; repeatable controlled build produces an identified artifact or a bounded failure report; no dependency/license material enters public Git.
- **Owner / residual:** T1 **#19**, supporting A1 #12/B2 #21/Q4 #41. **SOURCE-BLOCKED + RUNTIME-BLOCKED**; guide membership is historical secondary evidence.

## Cases 013–020: hostile tenant, Tool worker failure and idempotency

### SEC-DATA-013 — Same-company users share static Tools identity/cache

- **Severity / role / risk:** Critical; hostile tenant user; RISK-AUTH-001, RISK-CACHE-001.
- **Trigger / tiny steps:** Interleave two distinct users with the same company and identical record IDs; pause user A after permission resolution, process B, then resume A. Include user-specific Forever1Day caches and branch context. Static Connector.UserLogin/UserGroup/UserFullName evidence proves a hazard, not the complete state model.
- **Safe behavior / mitigation:** Until T1 proves an alternative, dedicate one process context per authenticated ERP session and serialize it. Immutable tenant/company/data-source/principal/generation binding must match before dispatch. No three-property reset, AsyncLocal or lock-only multiplexing is accepted as proof.
- **Measurable evidence:** Controlled concurrent-session matrix demonstrates zero data/permission/actor crossover; each call records a safe worker/session binding; a deliberately mismatched envelope is rejected before Tool invocation; logout retires its context.
- **Owner / residual:** T1 **#19**, supporting A2 #13/B4 #23/Q1 #36. **RUNTIME-BLOCKED + DESIGN-ONLY**; process isolation is a conservative requirement, not tested behavior.

### SEC-DATA-014 — Late result resurrects a revoked session generation

- **Severity / role / risk:** Critical; revoked user / SRE; RISK-AUTH-001, RISK-BROWSER-001, RISK-RETRY-001.
- **Trigger / tiny steps:** Dispatch a call, then logout/revoke/expire and reauthenticate the same username; deliver the old worker response after the new context exists. Also repeat while company context switches.
- **Safe behavior / mitigation:** Fence delivery and future dispatch by original authorization/session generation and immutable scope. Late result cannot restore old authority, attach to the new session, populate its cache or publish protected browser data. Possible committed business effect remains recorded/reconciled; suppressing browser delivery is not rollback.
- **Measurable evidence:** Every old-generation delivery denies protected result exposure and leaves the new session unchanged; original operation retains a traceable terminal/unknown status; reauthentication performs zero automatic replay; operation status itself reauthorizes current scope.
- **Owner / residual:** T1 **#19**, supporting A3 #14/B5 #24/Q1 #36. **RUNTIME-BLOCKED + DESIGN-ONLY**.

### SEC-DATA-015 — Session-specific workers exhaust bridge capacity

- **Severity / role / risk:** High; hostile user / SRE; RISK-JOB-001, RISK-OBS-001.
- **Trigger / tiny steps:** Repeatedly open/authenticate sessions, disconnect without logout, and submit calls longer than the bridge timeout. Fill the queue while valid sessions require logout/revocation or reconciliation. Dedicated workers make this a real capacity design question.
- **Safe behavior / mitigation:** Define measured global/tenant/session process and queue budgets, admission limits, bounded timeouts, retirement/disposal and reserved control/reconciliation capacity. Fail unavailable rather than share live user contexts. No unbounded worker creation, queue or implicit fallback to multiplexing.
- **Measurable evidence:** Capacity fixture stays within declared process/memory/queue limits; excessive admission receives a stable bounded rejection; cleanup returns resources within the measured target; revocation remains effective under saturation and no tenant starves others.
- **Owner / residual:** T1 **#19**, supporting A2 #13/A6 #17. **RUNTIME-BLOCKED + DECISION-BLOCKED**; numerical capacity budgets require deployment evidence.

### SEC-DATA-016 — Worker dies after possible SQL commit

- **Severity / role / risk:** Critical; SRE / operator; RISK-RETRY-001, RISK-JOB-001.
- **Trigger / tiny steps:** Kill the process after dispatch but before acknowledgment, at both pre-commit and post-commit points; restart a different worker and press Save again. Termination does not prove rollback, as master §12 already states.
- **Safe behavior / mitigation:** Keep durable operation/correlation ledger outside the worker; return OutcomeUnknown when commit is not disproven. Reconcile a command-specific authoritative business identity/result before replay. New worker state, timeout, cancellation or missing acknowledgment never authorizes blind retry.
- **Measurable evidence:** All kill points leave one operation record; post-commit cases have exactly one business effect; unknown cases emit no success/automatic retry and can be queried safely after restart; recovery evidence ties ledger to authoritative rows without leaking them.
- **Owner / residual:** B5 **#24**, supporting T1 #19/B3 #22/Q4 #41. **SOURCE-BLOCKED + RUNTIME-BLOCKED + DESIGN-ONLY**.

### SEC-DATA-017 — Idempotency key collides across tenants, actions or principals

- **Severity / role / risk:** Critical; hostile tenant user; RISK-RETRY-001, RISK-AUTH-001.
- **Trigger / tiny steps:** Reuse exactly the same idempotency key and record ID in tenants A/B, companies on different data sources, two actions, and two distinct users in the same company. Retry the original operation after reauthentication and after a role revoke.
- **Safe behavior / mitigation:** Define the command's unique ledger domain explicitly: immutable server-resolved tenant/company/data-source + action/contract + intended authenticated principal or documented delegation domain. Fence session generation separately so reauthentication cannot evade dedupe or inherit authority. Never expose a foreign ledger result. Reauthorization governs replay/result access; dedupe does not grant permission.
- **Measurable evidence:** Matrix proves zero cross-scope/key result collisions or disclosures; valid same-operation recovery maps to one effect across reconnect; foreign principal/action/key lookup denies; role revoke prevents replay/status leakage.
- **Owner / residual:** B5 **#24**, supporting A2 #13/A4 #15/Q1 #36. **DECISION-BLOCKED + DESIGN-ONLY**; “authenticated context” alone is underspecified without a reviewed key schema.

### SEC-DATA-018 — Changed payload retry bypasses or falsely trips the fingerprint

- **Severity / role / risk:** Critical; attacker / ordinary user; RISK-RETRY-001, RISK-DATA-001.
- **Trigger / tiny steps:** Reuse one key with changed quantity, detail membership, recordRef, action or expected state; also vary JSON property order, decimal representation, absent versus null, date offset and Unicode normalization without intending a business change.
- **Safe behavior / mitigation:** Canonical fingerprint includes reviewed semantic command identity, closed typed DTO and effect-bearing preconditions. Define decimal/date/null/Unicode equivalence per domain; avoid raw-JSON hashing and implicit lossy normalization. Different effect-bearing payload is rejected before dispatch. A stale revision or lost ACK is reconciled, not turned into a new key by the client.
- **Measurable evidence:** Source-backed equivalence fixtures yield one fingerprint for equivalent intent; each material change yields deterministic conflict and zero second dispatch; tests cover reordered detail arrays according to whether line order is semantically meaningful.
- **Owner / residual:** B5 **#24**, supporting B3 #22/B1 #20. **SOURCE-BLOCKED + DECISION-BLOCKED + DESIGN-ONLY**.

### SEC-DATA-019 — External ledger and business DB commits are not atomic

- **Severity / role / risk:** Critical; DBA / SRE; RISK-TXN-001, RISK-RETRY-001.
- **Trigger / tiny steps:** Reserve the external ledger, then fail before dispatch; commit the business DB then fail before ledger completion; fail ledger storage while business DB remains reachable. Repeat with per-company or multi-DB profiles and a command whose existing SP owns its transaction.
- **Safe behavior / mitigation:** B3/B5 document the ledger/business transaction relationship per command. If atomic participation or legacy dedupe cannot be proven, reservation is not proof of commit or safe retry. Model Dispatched/OutcomeUnknown and reconcile by verified unique business identity; ambiguous identity requires manual resolution and blocks retry enablement. Do not add an outer/distributed transaction merely to conceal the gap.
- **Measurable evidence:** Faults at every boundary never report false failure/success or duplicate an effect; reconciliation either proves a unique outcome or preserves an actionable unknown; enabled retry set contains only commands with tested proof.
- **Owner / residual:** B5 **#24**, supporting B3 #22/A5 #16. **SOURCE-BLOCKED + DECISION-BLOCKED + RUNTIME-BLOCKED**; external persistence alone is insufficient.

### SEC-DATA-020 — Purge removes an unresolved operation and enables replay

- **Severity / role / risk:** High; SRE / delayed user retry; RISK-RETRY-001, RISK-JOB-001.
- **Trigger / tiny steps:** Advance time across the proposed ledger retention boundary while an operation is OutcomeUnknown; replay a saved key just after purge and after a backup restore. Include a job whose lease outlives the nominal API timeout.
- **Safe behavior / mitigation:** Define command retry/retention windows, nonpurgeable unresolved states, tombstone/business dedupe behavior and restored-ledger reconciliation. Expired keys cannot silently become fresh harmful commands. Retention/purge is constrained by longest outstanding business reconciliation, not a common trace TTL.
- **Measurable evidence:** Boundary-time tests preserve unresolved references; expired replay is rejected/reconciled under the documented contract with zero new harmful effect; purge metrics expose held records; restore rehearsal cannot reset dedupe unnoticed.
- **Owner / residual:** B5 **#24**, supporting A5 #16/A6 #17/R4 #27. **DECISION-BLOCKED + RUNTIME-BLOCKED**; exact retention periods are UNKNOWN.

## Cases 021–025: DBA, concurrent legacy writer and approver

### SEC-DATA-021 — Opposite lock order and application-lock scope deadlock

- **Severity / role / risk:** High; DBA / two operators; RISK-DB-001, RISK-DATA-001.
- **Trigger / tiny steps:** In disposable fixtures reproduce a Web command holding a document lock then acquiring a shared resource while a legacy-like writer does the opposite. Include `sp_getapplock` resource reuse across two companies, lock timeout and deadlock victim after ledger reservation. Verified dump observations exist for named procedures in CONCURRENCY_TRANSACTION_CONTRACTS; exact cross-procedure ordering remains UNKNOWN.
- **Safe behavior / mitigation:** Preserve evidenced procedure/application-lock ownership, resource naming and acquisition order; measure cross-writer contention. Retry only the proven rolled-back, idempotent command unit under bounded policy; timeouts remain unknown where commit is possible. Never “fix” contention by removing legacy locks.
- **Measurable evidence:** Capture sanitized deadlock graphs/lock resources; verify no orphan ledger/success/event, bounded victim resolution and invariant preservation; cross-company interference is either proven necessary compatibility or eliminated by reviewed safe scoping.
- **Owner / residual:** B5 **#24**, supporting B3 #22/B2 #21/R4 #27. **SOURCE-BLOCKED + RUNTIME-BLOCKED**.

### SEC-DATA-022 — Mixed XACT_ABORT and nested transactions leave partial state

- **Severity / role / risk:** Critical; DBA / reliability reviewer; RISK-TXN-001.
- **Trigger / tiny steps:** Inject constraint/trigger/timeout errors into one verified XACT_ABORT ON procedure and one OFF procedure; exercise entry with and without an existing transaction and with a savepoint. CONCURRENCY_TRANSACTION_CONTRACTS names CF_QRcodeStp/QRCodeReportStp/AR_OrderDetail_ShowStockStp as OFF observations, not a generic failure contract.
- **Safe behavior / mitigation:** Each command records transaction owner, nesting, error/state handling and effects. Do not blanket-set XACT_ABORT or wrap every SP in an outer transaction. Authoritative result follows XACT_STATE/transaction evidence and reread; unclear effects remain unknown, with no post-commit event on rollback.
- **Measurable evidence:** Boundary tests cover initial/final transaction state, header/detail/trigger effects, audit and outbox; no open transaction leaks to pool; unsupported nested context rejects before execution; success matches the verified completion rule.
- **Owner / residual:** B3 **#22**, supporting B2 #21/B5 #24. **SOURCE-BLOCKED + RUNTIME-BLOCKED**.

### SEC-DATA-023 — WinForms writer bypasses invented optimistic concurrency

- **Severity / role / risk:** High; legacy operator / attacker; RISK-DATA-001, RISK-DATA-002, RISK-RT-001.
- **Trigger / tiny steps:** Web loads master/detail; a legacy-like direct writer changes state/detail without Web event or invented version increment; Web submits stale edits. Also change detail after master reread but before the mutation lock is acquired.
- **Safe behavior / mitigation:** Use only a verified concurrency mechanism shared by all relevant writers, or preserve source-backed pessimistic/compatibility locks/state guard. Presentation timestamp/hash is not automatically a safe version token. Reread and mutation checking must form the reviewed protected unit; freshness does not replace concurrency.
- **Measurable evidence:** Cross-writer interleavings preserve invariants and produce deterministic conflict/rejection or safe serialized result; no stale detail silently overwrites; external changes converge within the separately declared freshness budget.
- **Owner / residual:** B5 **#24**, supporting B3 #22/Q3 #38. **SOURCE-BLOCKED + RUNTIME-BLOCKED**; shared version support remains UNKNOWN.

### SEC-DATA-024 — Approval authority/state changes between check and mutation

- **Severity / role / risk:** Critical; approver / malicious user; RISK-AUTH-001, RISK-TXN-001.
- **Trigger / tiny steps:** Pause after capability check; a second actor revokes permission/delegation or advances/returns the request; resume approve. Repeat approve/reject/return with stale metadata/permission revision and with identical IDs in another branch.
- **Safe behavior / mitigation:** Exact F7 transition graph, approver/delegation scope and state rules must be verified. Reject stale revisions and revalidate current authority/state at the protected command boundary; retries never manufacture a second approval. State locks and permission-generation policy require a reviewed race boundary rather than UI assumptions.
- **Measurable evidence:** Controlled interleavings show no transition accepted from a prohibited state/scope; stale generation conflicts/denies before harmful dispatch; one eligible transition/audit effect survives repeated submission; an exact race policy is documented.
- **Owner / residual:** F7 **#34**, supporting B3 #22/B4 #23/B5 #24/Q1 #36. **SOURCE-BLOCKED + RUNTIME-BLOCKED**; historical empty approval tables do not close this gate.

### SEC-DATA-025 — Child record reference is authorized against the wrong parent

- **Severity / role / risk:** Critical; hostile user; RISK-AUTH-001, RISK-DATA-002.
- **Trigger / tiny steps:** Submit an allowed parent recordRef with a detailRef from a foreign tenant/company/document, a duplicate detailRef, a removed line, and a lookup value from a disallowed warehouse. Preserve valid-looking opaque reference syntax.
- **Safe behavior / mitigation:** Reauthorize each reference and verify ownership/link, slot identity, current state and allowed lookup scope inside the command contract. Opacity and primary-key existence are not authority. Reject the whole harmful operation before partial writes; no errors reveal which foreign row exists.
- **Measurable evidence:** Every forged/duplicate/unlinked fixture dispatches zero harmful effects or atomically rolls back under the contract; error shape contains no foreign identity/count; allowed detail update affects exactly the intended authorized lines.
- **Owner / residual:** B3 **#22**, supporting A4 #15/B4 #23/Q1 #36 and pilot owner. **SOURCE-BLOCKED + DESIGN-ONLY**.

## Cases 026–031: hostile user, exports, realtime and scoped infrastructure

### SEC-DATA-026 — Count, lookup, error and timing expose out-of-scope existence

- **Severity / role / risk:** Critical; hostile tenant user; RISK-AUTH-001, RISK-QUERY-001.
- **Trigger / tiny steps:** Query totalCount/group counts/summary, typeahead, distinct filter values and report parameters using a foreign record ID; compare missing versus foreign IDs, mixed allowed/foreign `in` filters and empty result pages. Toggle HideAmount while keeping aggregate totals available.
- **Safe behavior / mitigation:** Server scope applies before joins, lookups, counts/sums and errors. Hidden monetary data must not reappear in totals/export if policy forbids it. Return stable safe denial/missing behavior under the documented contract; avoid a systematically distinguishing response path. Do not claim complete timing indistinguishability without measurement.
- **Measurable evidence:** Fixture values from foreign scopes appear zero times in payloads/headers/errors/aggregates; identical authorized IDs do not collide; tested response/status shapes do not reveal foreign existence; measured latency artifacts record any unresolved distinguishing behavior.
- **Owner / residual:** A4 **#15**, supporting B1 #20/B4 #23/Q1 #36. **SOURCE-BLOCKED + DESIGN-ONLY**.

### SEC-DATA-027 — Enabled child or similar caption bypasses disabled parent

- **Severity / role / risk:** High; hostile user / manager; RISK-AUTH-001, RISK-CONFIG-001.
- **Trigger / tiny steps:** Synthetic child is enabled under a disabled ancestor; replay its direct route, quick-nav and API. Compare historical captions: AR_InvoiceRequestFrm “Yêu cầu xuất hóa đơn” versus planned sales request; AP_InputRequestFrm versus IV_InboundRequestFrm; IV_StockTranferFrm transfer/consignment versus internal transfer. Guide Appendix B also historically disables AP_OrderFrm.
- **Safe behavior / mitigation:** Current menu/ancestor policy and each typed operation are separately bound/authorized. Do not infer 205 visible items from 353−148, reenable a disabled pilot automatically, or equate captions/absent historical names. Domain owner must resolve business equivalence and current reachability before slice enablement.
- **Measurable evidence:** Ancestor-disable/permission matrix determines menu and direct execution outcomes under the verified contract; each pilot has exact current menu/FID/Para/business meaning evidence; lookalike captions map zero guessed commands.
- **Owner / residual:** B4 **#23**, supporting F1 #28 and F5/F6/F8/F9. **SOURCE-BLOCKED + DESIGN-ONLY**.

### SEC-DATA-028 — Revoked user downloads an existing export job artifact

- **Severity / role / risk:** Critical; revoked user / attacker; RISK-REPORT-001, RISK-FILE-001, RISK-AUTH-001.
- **Trigger / tiny steps:** Start export while authorized; revoke scope before execution and again between artifact completion and download. Replay job/artifact URL from another user/tenant; test subreport parameters, large queue retries and untrusted spreadsheet cells.
- **Safe behavior / mitigation:** Restore immutable server-resolved job scope and reauthorize execution/status/download independently. Artifact ownership/storage identifiers do not grant access; bounded scoped download handling and reviewed lifetime apply. Report parameters/subreports use typed allow-lists; neutralize formula injection under the export format contract.
- **Measurable evidence:** Revoked/foreign status/download reveals zero artifact bytes or unauthorized metadata; report output contains only current authorized scope according to the reviewed policy; formula fixtures do not execute as active formulas; browser disconnect does not duplicate work.
- **Owner / residual:** R2 **#25**, supporting A4 #15/A2 #13/Q1 #36. **SOURCE-BLOCKED + DESIGN-ONLY**; actual report reachability/storage/retention remain UNKNOWN.

### SEC-DATA-029 — Import/template reaches a writable SQL path or unsafe file

- **Severity / role / risk:** Critical; attacker / compromised admin; RISK-FILE-001, RISK-SEC-001, RISK-TXN-001.
- **Trigger / tiny steps:** A synthetic SY_ImDatTbl template includes ImportSQL/DeleteSQL/ImportLocalSQL, an unexpected mapping target and a file with inconsistent extension/content, oversized decompression or active spreadsheet formulas. Guide §3.2 says import SQL can write; no current pilot import is implied.
- **Safe behavior / mitigation:** Import remains disabled unless separately enumerated and authorized within its slice. Enabled imports require bounded type/size/content validation, isolated staging, typed mapping and a verified all-or-nothing or explicitly recoverable business contract. Config admin cannot introduce arbitrary delete SQL. Public fixtures are synthetic.
- **Measurable evidence:** Unenabled/import targets reject before writes; malicious/oversized content is bounded/rejected; injected SQL/formula/path material never changes command shape or storage scope; failure test proves the declared partial-state policy.
- **Owner / residual:** B3 **#22**, supporting R2 #25/A7 #18/Q1 #36. **SOURCE-BLOCKED + DESIGN-ONLY**; this case is a compatibility gate, not new import scope.

### SEC-DATA-030 — Hub hints leak identifiers or stale membership after revoke

- **Severity / role / risk:** Critical; hostile user / reliability reviewer; RISK-RT-001, RISK-AUTH-001.
- **Trigger / tiny steps:** Forge a group name, revoke branch scope while a hub remains connected, then deliver duplicate/reordered events carrying a foreign document ID/count. Drop all events while a legacy-like writer commits; reconnect to a second instance.
- **Safe behavior / mitigation:** Groups and event metadata use live server-authorized scope, not client strings; revoked subscriptions lose protected hints. Hints minimize data and never provide business authority. Authorized SWR/poll/focus/manual reread converges despite event loss and across instances; freshness target is independently measured.
- **Measurable evidence:** Foreign/revoked client receives zero protected IDs/counts/hints; group forgery fails; dropped/reordered fixture converges to authoritative state within the declared bound; no event is emitted for rolled-back writes and background traffic does not extend idle.
- **Owner / residual:** R1 **#39**, supporting A4 #15/Q3 #38. **SOURCE-BLOCKED + DECISION-BLOCKED + DESIGN-ONLY**.

### SEC-DATA-031 — Pool, cache or job resumes with another tenant's scope

- **Severity / role / risk:** Critical; hostile tenant / SRE; RISK-CACHE-001, RISK-JOB-001, RISK-AUTH-001.
- **Trigger / tiny steps:** Cancel/throw during connection context setup and reset, return the connection, then reuse it for another tenant with the same IDs. Retry a job with missing/changed envelope; poison a cache key omitting branch, role revision, data source or screen version.
- **Safe behavior / mitigation:** Checkout sets and verifies the server scope; failed reset disposes/quarantines the connection rather than returning it. Scope-bearing immutable job envelopes are validated/reauthorized on restore. Cache keys include relevant source/scope/revisions and cannot act as permission authority.
- **Measurable evidence:** Fault matrix captures context before/after each checkout and zero cross-scope results; poisoned/incomplete envelopes fail before dispatch; scope-key collision suite covers identical IDs, multi-DB company and revoked role; poisoned caches cannot restore permission.
- **Owner / residual:** A2 **#13**, supporting A4 #15/A5 #16/Q1 #36. **DECISION-BLOCKED + DESIGN-ONLY**; exact DB session-context compatibility requires evidence.

## Cases 032–035: accounting, warehouse and numbering parity

### SEC-DATA-032 — Rounding/order changes amount, tax or stock valuation

- **Severity / role / risk:** Critical; accounting operator / DBA; RISK-TXN-001, RISK-DATA-001.
- **Trigger / tiny steps:** Use synthetic half-unit/near-half decimals, negative return lines, zero quantity, foreign-currency rates, multiple discounts/fees and many tiny lines; vary expression `Oderby`, LevelLoop, RoundType/RoundPara and account/cost-center requirement. Guide §3.2/§4.3 reports these controls/checks, not verified Medcom numeric contracts.
- **Safe behavior / mitigation:** Each applicable command defines decimal precision/scale, rounding mode/stage, formula order, tax/fee/discount bases, null/negative rules and server-derived totals from source/SQL. Do not reuse an invoice variant's math for a request or compute authoritative finance with browser floating point.
- **Measurable evidence:** Private approved parity fixtures match header/detail/tax/entry totals exactly under declared tolerances and stages; changed expression order rejects/versions safely; overflow/coercion fails before partial writes; accounting owner signs off on source-backed expected results.
- **Owner / residual:** B3 **#22**, supporting B2 #21 and applicable pilot owner. **SOURCE-BLOCKED + RUNTIME-BLOCKED**; financial defaults are not guessed from guide names.

### SEC-DATA-033 — One-detail generic JSON omits invoice stock/tax/entry effects

- **Severity / role / risk:** Critical; warehouse / accounting operator; RISK-TXN-001, RISK-SCHEMA-001.
- **Trigger / tiny steps:** Compare a reported AR_InvoiceFrm variant with master AR_InvoiceTbl/detail AR_InvoiceDetailTbl, VAT binding, read-only account view and conditional detail slots 5/6/7; apply a hypothetical one-detail generic save and crash a trigger path. Guide §4.3 names historical stock/entry/reference triggers whose bodies/current presence are unverified.
- **Safe behavior / mitigation:** Treat this as evidence warning and classify complex forms through compatibility commands, never generic CRUD from a cookbook. B2 inventories current triggers and dynamic dependencies; B3 maps all effects. The five-pilot request slices must explicitly demonstrate whether effects apply; request entry never implies posting. Different baseline trigger counts remain separate.
- **Measurable evidence:** Per-enabled command effect map and invariant fixtures cover header/detail/VAT/stock/ledger/reference outcomes; unsupported extra slots/variants reject; zero assumed historical trigger mappings become current Medcom facts. Invoice implementation is not added by this test.
- **Owner / residual:** B3 **#22**, supporting B2 #21/T1 #19/Q4 #41. **SOURCE-BLOCKED + RUNTIME-BLOCKED**.

### SEC-DATA-034 — Document numbering duplicates under branch/date race

- **Severity / role / risk:** Critical; operator / DBA; RISK-DATA-001, RISK-RETRY-001.
- **Trigger / tiny steps:** Two sessions create in the same sequence concurrently; change branch, document date/period or source prefix immediately before save; retry after lost ACK. Mix `ADT` with `ADT-1`/`ADT-2` and similarly named DMK/DPR consumers. Guide §3.3/Appendix F reports different address scopes and rebuild triggers.
- **Safe behavior / mitigation:** Verify numbering owner, unique domain, allocation/lock and rebuild behavior per command. Do not flatten same-named keys or allocate via count+1 in C#. Harmful retries return the original verified identity; consumed numbers/gaps follow the source-backed policy rather than guessed rollback rules.
- **Measurable evidence:** Concurrent/branch/date/retry fixtures create one unique business identity per intended operation, no duplicates or wrong branch prefix; a configuration identity mismatch blocks before allocation; any permitted gaps are explicit and reconciled.
- **Owner / residual:** B3 **#22**, supporting B2 #21/B5 #24/R3 #26 and pilot owner. **SOURCE-BLOCKED + RUNTIME-BLOCKED**.

### SEC-DATA-035 — Period, owner, stock/lot or issued-invoice lock is bypassed

- **Severity / role / risk:** Critical; malicious operator / manager; RISK-AUTH-001, RISK-TXN-001.
- **Trigger / tiny steps:** Reopen an old tab after period closes, source owner changes, stock/lot expires or an e-invoice is issued; submit via hidden Save/Copy/Delete endpoint with an old revision. Guide §4.3 reports invoice owner/isLock/period/e-invoice locks and credit/stock checks, without proving request-pilot applicability.
- **Safe behavior / mitigation:** Each enabled pilot command classifies applicable authoritative checks and their current source. Revalidate them at the protected write boundary; no admin/manager bypass is invented. External irreversible issuance/integration is a separately verified capability with durable intent/idempotency/reconciliation if in scope; it is never smuggled into a generic save.
- **Measurable evidence:** Applicable state matrix demonstrates allowed/denied/revoked outcomes with zero prohibited effects; absent/not-applicable checks have cited rationale; repeated/cancelled issued-state operation cannot create an untracked external effect.
- **Owner / residual:** B3 **#22**, supporting B4 #23/B5 #24 and relevant pilot owner. **SOURCE-BLOCKED + RUNTIME-BLOCKED**.

## Cases 036–040: auditor, SRE, rollout and CI

### SEC-DATA-036 — Logs, build diagnostics or support bundle expose secrets/license

- **Severity / role / risk:** Critical; support insider / public repository reader; RISK-AUDIT-001, RISK-SUPPORT-001, RISK-FILE-001.
- **Trigger / tiny steps:** Cause login/connection/bridge/dependency failures whose exceptions contain passwords, token-like values, license paths/material, raw config/hook SQL or sensitive rows. Request a support bundle as a different tenant; attach verbose WinForms build logs to CI.
- **Safe behavior / mitigation:** Allow-listed safe trace fields and redaction apply before persistence/response/artifact emission. Support APIs require separate scoped capability and bounded windows. Private dependency/license/source data never enters public commits or CI fixtures. Preserve safe hashes/object metadata rather than raw confidential attachment content.
- **Measurable evidence:** Synthetic canaries appear zero times across response/log/audit/trace/build/CI artifacts; scoped support tests deny foreign data; safe correlation/build/object references remain sufficient to diagnose the injected failure; secret scanning includes error paths.
- **Owner / residual:** A6 **#17**, supporting T1 #19/A1 #12/Q1 #36. **DECISION-BLOCKED + DESIGN-ONLY**; actual retention/sink/support roles remain UNKNOWN.

### SEC-DATA-037 — Audit or telemetry outage fabricates command outcome

- **Severity / role / risk:** High; auditor / SRE; RISK-AUDIT-001, RISK-TXN-001, RISK-OBS-001.
- **Trigger / tiny steps:** Fail diagnostic trace storage before/after commit; independently fail a required business audit/outbox write; deliver a forged correlation ID matching another tenant. Reconcile after business commit and audit acknowledgment loss.
- **Safe behavior / mitigation:** Correlation is server-issued linkage, never authority. Trace failure cannot turn committed success into rejection or encourage replay. Business audit atomicity is per-command verified policy: required atomic audit participates in the protected unit or a justified durable recovery contract; unknown audit guarantees block critical enablement.
- **Measurable evidence:** Fault matrix shows authoritative outcome and one effect regardless of optional trace outage; audit-required failures follow the documented rollback/unknown policy; support references never grant foreign operation access; missing required audit emits a bounded actionable alert.
- **Owner / residual:** A6 **#17**, supporting B3 #22/B5 #24/A5 #16. **SOURCE-BLOCKED + DECISION-BLOCKED + DESIGN-ONLY**.

### SEC-DATA-038 — Rollback or backup restore breaks coexistence/dedupe

- **Severity / role / risk:** Critical; SRE / DBA; RISK-ROLL-001, RISK-SCHEMA-001, RISK-RETRY-001.
- **Trigger / tiny steps:** Old WinForms client remains connected while a Web migration/config version deploys; revert build/bridge only; restore an older DB/ledger independently after a newer acknowledged command. Treat baseline SIMPLE recovery as permission to promise point-in-time recovery.
- **Safe behavior / mitigation:** Additive reviewed schema and old/new compatibility tests; independent slice kill switch plus compatible build/config pointers preserve business data. Live recovery mode/backup/restore/RPO/RTO require operational evidence. Restore reconciles business/ledger/audit/outbox watermarks before writes resume; do not destructively reverse transactions or claim PITR from SIMPLE.
- **Measurable evidence:** Disposable restore rehearsal measures achieved RPO/RTO and cross-store consistency; old/new clients satisfy mapped contracts; disabling/reverting Web preserves committed effects and prevents duplicate replay; schema/config incompatibility rejects unsafe commands.
- **Owner / residual:** R5 **#40**, supporting R4 #27/B5 #24/A7 #18. **RUNTIME-BLOCKED + DECISION-BLOCKED**.

### SEC-DATA-039 — Reviewed config becomes unsafe under a different build/schema

- **Severity / role / risk:** High; compromised admin / release manager; RISK-SCHEMA-001, RISK-CONFIG-001.
- **Trigger / tiny steps:** Validate a candidate against contract/build X, deploy changed handler/schema Y, then publish the old candidate or roll back to an old pointer. Drop a watcher event and switch DAT source machine/DB while keeping the same filename; change a required field after an editor loads it.
- **Safe behavior / mitigation:** Immutable version binds source identity/hash plus compiler/contract compatibility identity; publication and rollback validate current admissibility and expected pointer revision. Hash reconciliation checks the approved source, not merely filenames. Stale metadata commands reject before effects. Previous-good means currently compatible, not any historical pointer.
- **Measurable evidence:** Incompatible build/schema/source candidates cannot publish or enable mutation; current pointer remains compatible; missed events converge through hash reconciliation; audit ties actor/source/contract/build and conflict to one safe reference.
- **Owner / residual:** A7 **#18**, supporting R3 #26/R5 #40/B3 #22. **SOURCE-BLOCKED + DESIGN-ONLY**.

### SEC-DATA-040 — Green CI hides unbound contracts, raw fixtures or stale head

- **Severity / role / risk:** High; auditor / release manager / malicious contributor; RISK-SCHEMA-001, RISK-SUPPORT-001, RISK-ROLL-001.
- **Trigger / tiny steps:** Mark a source-blocked pilot complete because mock tests pass; reuse CI from a previous head after changing code/config; commit raw SQL/ERP/license/production rows as fixtures; omit changed dependency/contract tests or weaken a failing check to fit a session quota.
- **Safe behavior / mitigation:** Required checks bind the exact reviewed implementation commit and changed contracts; test reports distinguish mocks, source verification, runtime integration and deployment evidence. Synthetic/sanitized fixtures obey AGENTS public-repo policy. Blocking tests are fixed within the working session or reported unresolved; no merge/enablement/DONE claim on red or stale checks. The 4–6-task session goal never overrides prerequisites or CI integrity.
- **Measurable evidence:** Head/check attestation names the exact SHA, required jobs and fixture provenance; absent runtime/source gate leaves the issue blocked despite unit green; secret/data scan has zero prohibited artifacts; failure triage includes reproduction, fix and green required rerun on the same reviewed head.
- **Owner / residual:** Q4 **#41**, supporting A1 #12 and all contributing owner issues. **DESIGN-ONLY + SOURCE-BLOCKED + RUNTIME-BLOCKED**; no CI/build/test pass is claimed in this review.

## Required plan clarifications before corresponding enablement

These are acceptance additions under existing owners, not separate implementation tasks competing with the canonical graph:

| Clarification / highest-priority gap | Scenario IDs | Accountable issue | Required decision/evidence |
|---|---|---|---|
| Consumer-specific configuration identity, ambiguous executable collision quarantine and lossless grammar | 001–005, 009 | R3 #26 | Source-backed selectors/serializer fixtures; per-snapshot collision report; no arbitrary dedupe. Intake §§4–8 already narrows documentation; runtime/source proof remains pending. |
| Type30/user-control executable reachability and arbitrary SQL boundary | 006–009 | A7 #18 for compiler admission; T1 #19 for source/runtime control map | Typed allow-list and actual compiled consumer evidence; unsupported executable inputs blocked. These are separate deliverables, not two owners for one test artifact. |
| Full hook/control/trigger ordering and ESS2 completion definition | 010, 022, 032–035 | B3 #22 | Command-specific sequence/transaction/effect map and accepted completion/durable delayed-intent policy. |
| Safe legacy verification target and source-to-binary evidence | 011–015 | T1 #19 | Disposable identified target; startup DDL audit; compiled-source/dependency provenance; measured worker isolation/capacity. |
| Idempotency domain, semantic fingerprint and cross-store reconciliation | 016–020 | B5 #24 | Explicit key schema; separate generation fencing; ledger/business transaction relationship; safe retry set, retention and manual unknown resolution. |
| Cross-writer locks/version/state and authoritative scope | 021–027, 031 | B5 #24 for concurrency; B4 #23 for authority | Shared-writer contract, lock graph and current permission/menu/ancestor precedence evidence; pilot owner resolves exact business meaning. |
| Export status/artifact and hub hints remain independently scoped | 028–030 | R2 #25 for exports; R1 #39 for hubs | Current-scope checks at each stage; safe event metadata; measured fallback freshness. |
| Restore/rollback compatibility, audit and exact-head CI proof | 036–040 | Existing A6 #17, R4 #27, R5 #40, Q4 #41 | Safe diagnostics, coherent restored stores, compatible pointer admission and exact reviewed head green with evidence gates retained. |

No sentence that a plan is “strong” can guarantee future CI success, eliminate unknown legacy behavior or prove recovery. A corresponding issue may become DONE only with its required source/runtime evidence, reviewed implementation, exact-head green checks and accepted residual disposition. Unknowns must remain visible at enablement/release boundaries; selecting an independent task while CI runs must not abandon a failing check or bypass dependencies.

## Acceptance handoff and closure record

Each owning issue adopts its scenario IDs into acceptance, referencing this file rather than copying a competing plan. Future evidence records contain: scenario ID; source/build/database/contract identities; synthetic/private fixture provenance; expected versus observed invariant; exact implementation SHA; required CI job/run references; controlled runtime artifact references where applicable; accountable reviewer; unresolved residual and decision. Sanitized public evidence retains technical object/path/hash identities and safe outcomes, never customer rows, credentials, hook bodies with secrets or license material.

At implementation start, select cases applicable to the enabled command/surface and prove explicit nonapplicability for others. At release, Q4 #41 checks that no critical applicable case is merely DESIGN-ONLY or lacks its stated evidence. This review adds concrete variants to existing risk classes; it neither duplicates their ownership nor supplies the remaining Phase 1 catalog/traceability proofs.
