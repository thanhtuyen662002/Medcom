# L09 local preparation — 2026-10-02

Status: **prepared locally only** on live-main base `f9197185b624a8c3f74c99e48a69550b5a7c2a73`. No GitHub mutation, product implementation, CI execution, runtime connection, backup/restore, deployment, or production operation is represented here.

PR #43 is already merged. Draft PR #44 belongs to L01 bootstrap and is not an L09 lease. The current control state does not prove tested dispatcher fencing or an eligible L09 lease, so the lane remains read-only/preparation.

## Six substantive prepared units

| Unit / issue | Artifact | Cases | Preserved boundary | Remaining gate |
|---|---|---:|---|---|
| R2 / #25 | `R2_REPORT_EXPORT_EVIDENCE_FIXTURES.json` | 16 | Packaged RPX is only candidate-current; report reachability, invocation and authority are separate. Job dispatch/status/download reauthorize independently. | Complete 786-member manifest, reachable menu/runtime chain, typed parameters/subreports, B2 binding, storage/retention and authorization evidence. |
| R2 job / #25 | `R2_ASYNC_JOB_SCOPE_FIXTURES.json` | 12 | Browser supplies only a registered report and typed inputs. Server freezes scope/fingerprint/revisions; worker, status, notification and download reauthorize separately. | Durable job storage, dispatcher fencing, exact report contracts and execution/retention evidence. |
| R1 / #39 | `R1_REALTIME_EVENT_LOSS_FIXTURES.json` | 16 | SignalR is a post-commit invalidation accelerator. Authoritative reread remains required, including legacy writes with no event. | A2/A4/A6, current event/commit source, scope-derived groups, freshness bounds and measured topology/backplane decision. |
| R1 external writer / #39 | `R1_EXTERNAL_WRITE_FRESHNESS_GATE.json` | 10 | WinForms-direct writes must converge through bounded SWR/poll/focus/manual revalidation without inventing Broker, a watermark or a polling interval. | Disposable target, authoritative version/change detector, controlled writer, scope/revoke tests, measured bounds and independent review. |
| R4 / #27 | `R4_ISOLATED_RECOVERY_CHECKLIST.json` | 14 | SIMPLE recovery does not require or prove a transaction-log chain/PITR. Recovery frontier covers business DB, ledger, audit, outbox, jobs/artifacts and build/config. | DBA/SRE access, disposable isolated target, approved targets, backup provenance, actual restore/integrity/application evidence and sign-off. |
| R5 / #40 | `R5_COEXISTENCE_ROLLBACK_FIXTURES.json` | 16 | Kill-switch/build/config rollback preserves committed business data, fences stale builds/workers and reconciles accepted work; disaster recovery is separate. | A1/A5/A7/Q3/R4, compatibility manifests, exact build/config checks, coexistence rehearsal and owner sign-off. |

Total: **84 synthetic cases**, all `NOT_RUN`. The external-writer gate also carries 12 mandatory requirements and remains `BLOCKED_NO_DISPOSABLE_EXTERNAL_WRITER_REHEARSAL`. They are implementation and operation acceptance inputs, not passing product tests.

## Verification

Run from the repository root:

```bash
PYTHONDONTWRITEBYTECODE=1 python preparations/L09/20261002/validate_preparation.py
PYTHONDONTWRITEBYTECODE=1 python preparations/L09/20261002/test_preparation.py
```

The validator pins 13 source contracts to exact `git show` blob hashes at the base commit, verifies six unit/issue/status boundaries, exact case counts, the R2/R2J scope and blocked-eligibility rules, R1 authority boundary and external-writer admission gate, SIMPLE-compatible R4 backup/rehearsal evidence and cross-store restore frontier, and R5 non-destructive rollback plus bounded dependency rules. The metadata test suite contains one baseline and twenty-seven negative mutations.

The L10 independent review identified five fail-open mutations in the R1 external-writer gate. This local owner repair now pins the exact text of all 12 requirements, the exact case-ID/evidence-obligation map, and the exact admission/drift rules. The resulting validator hash change intentionally requires a fresh L10 independent review; this README does not claim that review, durable progress, or runtime evidence.

## Executable R2J preparation

`async_export_job_double.py`, `test_async_export_job_double.py` and
`R2_ASYNC_EXPORT_JOB_DOUBLE.md` add a synthetic executable reference model for
the existing R2J fixtures. Thirty-three tests enforce typed reservation,
semantic idempotency, scope-only narrowing, exact report/release/config and
worker fencing, restore-frontier quarantine, and indistinguishable
unknown/unauthorized status or download denial. The double performs no report,
SQL, artifact, runtime or production operation and does not change R2
eligibility.

## Completion accounting

- Prepared: six independently reviewable L09 fallback units.
- Product/runtime completed: zero.
- Blocked: R2, R1 and R4 remain graph-blocked; R5 cannot operate until its dependencies and operation scope pass.
- Durable GitHub progress: none; these files are an L01-reviewable local handoff only.
- Phase 1 gates: TRC-DB-001/#21 and exhaustive Gate 4 remain open. This package does not enumerate all RPX members and cannot close either gate.
