# L10 local QA preparation — 2026-10-02

Status: **prepared locally only** against live-main base `f9197185b624a8c3f74c99e48a69550b5a7c2a73`. No product/runtime test, CI run, GitHub mutation, SQL action, deployment, or production operation is claimed.

PR #43 is already merged. Draft PR #44 is the L01 bootstrap branch and is not an L10 lease. There is no tested dispatcher fencing or eligible L10 lease, so this lane remains read-only/preparation.

## Twelve substantive units

| Unit / issue | Artifact | Synthetic cases | Roles and focus | Current result |
|---|---|---:|---|---|
| Q1 / #36 | `Q1_AUTH_TENANT_ATTACK_MATRIX.json` | 19 | External attacker, malicious/internal user, manager and IT; route/API/data/mutation/export, SSR/hydration, artifact reuse, side channel and queued-generation attacks. | `NOT_RUN`; blocked on A2/A4/A6 and runtime authority evidence. |
| Q2 / #37 | `Q2_FRONTEND_STRESS_MATRIX.json` | 19 | Keyboard, screen reader, low vision, mobile/touch, power user and release roles; 100,001 rows, 101 potential columns, 390 px, recycled focus, exact p95 profile and test-route isolation. | `NOT_RUN`; blocked on F1/F2/F3 and absent frontend CI harness. |
| Q3 / #38 | `Q3_FRESHNESS_CHAOS_MATRIX.json` | 16 | SRE, WinForms operator, manager, IT and malicious subscriber; dropped/duplicate/reordered events, transaction/outbox correlation, scope/build generation, kill switch and external write. | `NOT_RUN`; blocked on A2/A6/A7/F2 plus event source and disposable target. |
| Q4 / #41 | `Q4_RELEASE_GATE_LEDGER.json` | 14 | Release manager, reviewer, user, attacker, DBA/SRE and support; exact 14-node dependency ledger, owner-evidence separation, idempotency and restore-frontier release attacks. | **NOT ELIGIBLE**; every dependency remains open/unproved on an exact implementation head. |
| QX / #41 | `QX_OWNER_PREPARATION_RECHECK.json` | 12 | Independent QA review of twelve routed owner findings with pinned local artifact hashes. | Twelve local corrections prepared; zero durable or product-tested corrections. |
| Q1 supplement / #36 | `Q1_SUPPORT_LOG_LEAKAGE_MATRIX.json` | 6 | Support lookup, app/CI logs, bundles, problem-details, audit and telemetry fan-out using synthetic canaries. | `NOT_RUN`; requires isolated support/log sinks and A1/A6/T1 evidence. |
| Q2 supplement / #37 | `Q2_EXPORT_FORMULA_ACCESSIBILITY_MATRIX.json` | 6 | Formula injection, filename/header safety, worker-time scope, accessible export status, locale round-trip and ambiguous retry. | `NOT_RUN`; requires isolated export generator and disposable spreadsheet-analysis sandbox. |
| Q3 supplement / #38 | `Q3_EVENT_PAYLOAD_ABUSE_MATRIX.json` | 6 | Payload minimization, subscribe side channels, amplification, handler injection, dead-letter leakage and oversize frames. | `NOT_RUN`; requires isolated broker and bounded synthetic load profile. |
| Q4 supplement / #41 | `Q4_EVIDENCE_PROVENANCE_TAMPER_MATRIX.json` | 6 | Exact-head check/review binding, artifact digest, environment attestation, finite-catalog completeness and fresh 14-node recomputation. | **NOT ELIGIBLE**; the matrix cannot promote any dependency or Q4. |
| QX-R1 / #41 | `QX_L09_R1_GATE_REVIEW.json` | 5 | Independent mutation re-review of the L09/R1 external-write rehearsal gate. | Five original weakenings are rejected by the repaired validator; repair remains local and non-durable. |
| QX-OPS / #41 | `QX_L09_OPERATIONS_REPAIR_REVIEW.json` | 4 | Independent mutation review of L09 R2/R2J eligibility/scope, R4 rehearsal evidence and R5 recovery dependency. | Four owner-boundary weakenings are rejected; repairs remain local and non-durable. |
| QX-R2J / #41 | `QX_L09_R2J_EXECUTABLE_REVIEW.json` | 5 | Independent black-box/static review of the new L09 asynchronous export-job double. | Five fail-open design defects reproduced and routed to L09/R2; no owner code changed. |

Total: **118 synthetic/review cases**, all `NOT_RUN` for product/runtime execution.

## Independent owner recheck

| Disposition | Count | Meaning |
|---|---:|---|
| `PREPARED_LOCAL_CORRECTION_NOT_DURABLE` | 12 | The owner preparation addresses the finding and its local validator passes, but it is not committed, product-executed, or green on an exact remote head. |
| `OPEN_DESIGN_DEFECT` | 0 | The two prior L03/B2 design findings were corrected locally and independently rechecked in this run. |
| Durable corrections | 0 | No L10 GitHub write or owner branch integration is authorized. |
| Product/runtime tests passed | 0 | These are sanitized preparation artifacts only. |

L07/B5 now uses the stable lookup identity `[tenant, company, authoritative_data_source, stable_principal, registered_action_id, contract_version, idempotency_key]`. The request fingerprint is immutable data on the record found by that key, and a mismatch is rejected before dispatch. Independent local recheck passes; the correction remains release-blocking until it is durable, reviewed, product-tested, and green on its exact remote head.

L03/B2 now treats CTE names, table variables, temporary tables, trigger pseudo-tables, and comment/string tokens as `LOCAL_OR_NON_CATALOG`, producing no catalog edge. It also includes one sourced `UNRESOLVED` fixture with reason, owner, and fail-closed acceptance. Independent recheck passes; both corrections remain release-blocking until durable, reviewed, product-tested where applicable, and green on an exact remote head.

The other ten prepared corrections cover mandatory deferred effects after commit, 100,001-row and canonical p95 grid acceptance, cross-store restore frontiers, SIMPLE-compatible recovery evidence, browser/server authority separation with `metadataRevision`, explicit `OutcomeUnknown` transitions, worker-time reauthorization with immutable job scope, and exact git-object provenance.

The R1 repair now pins every exact requirement, admission/drift rule, case identity and evidence obligation. Independent L10 reruns reject all five original weakenings at their intended invariants. Separate independent mutations also reject false R2 readiness, removal of the registered-report input, incomplete R4 rehearsal evidence and removal of the R4 dependency from R5. These are prepared-local review results only: they do not establish durable integration, runtime behavior, CI health or Q4 eligibility.

The new R2J executable review runs the owner's 33 tests, then independently
reproduces five gaps: completion after registry/evidence drift, self-asserted
worker owner/epoch, unscoped artifact reference, independent config-generation
regression, and absence of a cancel/kill-switch fence. All five are routed to
L09/R2/#25 as open design defects. L10 did not modify the owner implementation.

## Verification

```bash
PYTHONDONTWRITEBYTECODE=1 python preparations/L03/20261002/validate_preparation.py
PYTHONDONTWRITEBYTECODE=1 python preparations/L03/20261002/test_preparation.py
PYTHONDONTWRITEBYTECODE=1 python preparations/L07/20261002/validate_preparation.py --repo .
PYTHONDONTWRITEBYTECODE=1 python preparations/L07/20261002/test_preparation.py
PYTHONDONTWRITEBYTECODE=1 python preparations/L10/20261002/validate_preparation.py
PYTHONDONTWRITEBYTECODE=1 python preparations/L10/20261002/test_preparation.py
PYTHONDONTWRITEBYTECODE=1 python preparations/L10/20261002/review_l09_repairs.py
PYTHONDONTWRITEBYTECODE=1 python preparations/L10/20261002/review_l09_async_export_double.py
```

The L10 validator pins 15 exact main-source hashes in each core unit, three exact relevant hashes in each supplement, and exact hashes for the reviewed L09 artifacts. It verifies 113 unique cases, checks Q1 scope/generation coverage, Q2 boundary and performance contracts, Q3 external-write/freshness gates, Q4's exact 14 dependencies, all twelve previously routed findings, and both L09 repair reviews. The suite contains one passing baseline and 25 expected-failure mutations, including source/artifact drift, false durable claims, regression of either corrected L03 disposition, incorrect L07 regression disposition, supplement-parent drift, false execution, case omission, false L09 review disposition, and altered owner routing. The separate review runner independently copies the L09 fixtures, reapplies all nine routed weakenings and requires each exact fail-closed diagnostic.

## Completion accounting

- Prepared: twelve independently reviewable Q1–Q4/QX units, including bounded mutation re-reviews of L09 gates and the new R2J executable model.
- Open routed design defects: five, all owned by L09/R2/#25; none is claimed fixed.
- Product/runtime completed: zero.
- Durable GitHub progress: none; this is a local handoff for L01/owner-lane review.
- CI: none on this local preparation; Draft PR #44 had no status checks or workflow runs in the last verified remote read.
- Phase 1: TRC-DB-001/#21 and exhaustive Gate 4 stay open. Synthetic QA cannot replace the finite catalog/manifest/export validators.
