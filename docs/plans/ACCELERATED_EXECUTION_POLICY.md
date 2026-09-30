# Accelerated Multi-Unit Execution Policy

Owner directive: maximize throughput per automation run while preserving lease safety, evidence quality, security and reviewability.

## Objective

A scheduled run is not a single-task slot. Each run should complete as many independent, bounded work units as tool/runtime budget safely permits.

Workers must not stop after:
- one document edit;
- one commit;
- one issue;
- one successful CI run;
- one resolved blocker;
- one status update.

If executable work remains and the current lease is still valid, continue within the same run.

## Per-run execution loop

Repeat until runtime/tool budget is nearly exhausted or no safe executable work remains:

1. Re-read live lease/head and dependency state.
2. Select the highest-priority bounded work unit with no conflicting owner.
3. Implement/analyze it fully.
4. Verify the result.
5. Commit durable progress.
6. Re-check live branch/PR state and dependencies.
7. Immediately take the next compatible unit.

Prefer several small reviewable commits over one oversized commit.

## Minimum throughput target

When the source/tool state permits, a run should aim for **4–8 bounded work units for analysis/planning lanes** and **3–6 bounded work units for implementation/code lanes**, for example:
- multiple DB catalog shards;
- catalog + dependency extraction + reuse classification;
- several screen bindings;
- several Phase 2 issue definitions;
- implementation + tests + CI repair;
- review + fix + next independent task.

This is a throughput target, not permission to fabricate work or skip verification.

A work unit should be small enough to verify independently but large enough to produce useful durable progress. Examples:
- one DB catalog shard;
- one dependency/classification shard;
- one screen binding or screen schema;
- one API/DTO/command contract;
- one implementation slice plus its focused tests;
- one CI failure diagnosis/fix;
- one red-team finding plus plan correction.

Do not inflate the count by splitting trivial edits.

## Parallelism rules

Within one workstream:
- sequential commits on the same live branch are allowed;
- continue across independent files/domains;
- do not wait for another workstream when independent tasks exist.

Across workstreams:
- never overwrite another live lease;
- use stable contracts and comments/handoffs for cross-stream coordination;
- Lead may redirect complete-candidate lanes to non-conflicting Phase 2 planning/review work before the formal transition if that protects deadlines.

## CI behavior

Do not stop merely because CI is running.

While CI runs:
- continue non-conflicting tests/docs/contracts;
- prepare the next bounded implementation unit;
- inspect another independent file/domain;
- create/review acceptance tests.

When CI completes:
- repair actionable failures immediately on the same PR;
- if green and acceptance remains, continue to the next unit in the same run.

## Phase 1 acceleration

Until 2026-10-01 01:00:
- DB lane prioritizes multiple catalog/dependency/classification/reuse shards per run.
- ERP complete-candidate lane verifies unresolved pilot mappings and source facts needed by Phase 2 without reopening broad archaeology.
- UX complete-candidate lane prepares concrete pilot screen schemas and role/action matrices from VERIFIED evidence.
- Architecture complete-candidate lane prepares API/authorization/data-contract skeletons and joins any new DB evidence immediately.
- Lead continuously integrates closure evidence, attacks gaps and builds the Phase 2 execution graph in parallel.

## Phase 2 acceleration

After Phase 1 closure, reuse five lanes:
1. Backend/Auth.
2. Backend/Data.
3. Frontend.
4. Integration/QA.
5. Lead/Integrator/Red Team.

Each implementation run should continue beyond the first completed issue when another READY issue can be safely claimed without overlap.

## Non-negotiable safety

Acceleration never permits:
- guessing Tool.dll APIs;
- guessing ERP form mappings;
- weakening authorization;
- bypassing CI/review;
- merging red code;
- exposing sensitive source/data;
- creating duplicate leases;
- relabeling executable gaps as UNKNOWN merely to hit a deadline.


## Adaptive workload and budget guard

Workers should maximize useful work per run without risking an uncheckpointed timeout.

Use this adaptive rule:

- **Analysis/planning lanes:** target 4–8 bounded units/run when evidence/tool access is available.
- **Implementation/code lanes:** target 3–6 bounded units/run, including tests/verification.
- **Lead/Integrator:** target 4–8 units/run across audit, unblock, integration, plan correction and review.
- **Heavy/fragile unit:** a single expensive extraction/migration/CI-repair can count as multiple ordinary units when it consumes comparable effort and produces a meaningful closure artifact.

Continue until:
1. no safe executable work remains;
2. an external human-only blocker is reached; or
3. remaining runtime/tool budget appears low enough that another unit risks losing an uncommitted checkpoint.

Before stopping for budget, commit/checkpoint the current coherent unit and write a precise next action.

Do not optimize for unit count at the expense of correctness or reviewability.

## Automatic bottleneck recovery ladder

A worker encountering a blocker must try to remove it in the same run before declaring itself blocked.

### Level 1 — local recovery
- re-read current branch/PR/head;
- retry a transient read/write once when safe;
- inspect exact error/CI log;
- repair local doc/code/schema/test issue;
- re-run focused verification.

### Level 2 — dependency bypass
If the current item depends on another lane:
- record the dependency durably;
- notify/link the owning PR/issue when useful;
- immediately switch to the next independent READY unit in the same lane.

Waiting for another lane is not a valid reason to end the run if independent work exists.

### Level 3 — lease/merge recovery
If a PR is stale, closed, behind, non-mergeable or conflicted:
- verify live GitHub truth;
- follow lease recovery rules;
- reconcile current base when owned and safe;
- repair merge/review conflicts on the owning lane;
- re-run exact-head verification.

A worker must not continue building on a stale/invalid lease.

### Level 4 — CI recovery
- actionable RED: inspect and fix in the same run when safe;
- infrastructure/zero-step noise: retry once only;
- CI running: continue another non-conflicting unit;
- green CI with remaining acceptance: continue work, do not stop.

### Level 5 — tool/write-path recovery
When a GitHub mutation is blocked:
- attempt one smaller/sequential safe mutation;
- if write remains blocked, preserve the exact prepared content/checkpoint and continue read-only analysis or another independent executable task;
- never spam retries or claim durable progress that did not land.

### Level 6 — Lead escalation
If the same critical blocker survives a full specialist run or threatens a deadline:
- Lead inspects the exact live evidence;
- narrows the missing acceptance item;
- repairs shared state/traceability/plan itself when ownership permits;
- otherwise redirects the specialist to the smallest closure unit and continues other integration work.

Lead must treat persistent non-mergeable PRs, dependency cycles, duplicated ownership, blocked writes and status-only workers as active incidents, not passive report items.

## Work queue fallback order

Each run should maintain a local queue and consume it in this order:

1. security/data-integrity/authorization blocker;
2. current critical-path acceptance blocker;
3. actionable CI/merge/review blocker;
4. current live issue/PR acceptance work;
5. independent downstream-unblocking contract/test;
6. next READY non-overlapping work unit;
7. red-team/review/verification work.

When one queue item blocks, move immediately to the next safe item.

## Continuity rule

A scheduled worker should leave the repository in a state another run can resume without chat memory:
- current branch/head;
- what was completed;
- exact verification performed;
- remaining acceptance;
- next highest-priority unit;
- blocker owner/dependency if any.

No run should end with only “waiting” when a useful independent unit exists.
