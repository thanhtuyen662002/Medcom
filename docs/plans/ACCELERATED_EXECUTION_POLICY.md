# Accelerated Multi-Unit Execution Policy

Owner directive: maximize throughput per automation run while preserving lease safety, evidence quality, security and reviewability.

Current owner direction (2026-10-01): **4–6 meaningful tasks per working session** and **at most 10 planned scheduled lanes**, with same-session repair of owned CI failures. `PHASE2_SCHEDULED_EXECUTION_PLAN.md` is the canonical lane/lease/session protocol. Past deadlines and the five-role analysis structure below are historical; this run does not activate automations.

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

Every lane plans **4–6 meaningful, bounded tasks per working session**, including its required verification, for example:
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
- repair every actionable failure on the owned current head, introduced now or inherited, immediately on the same PR **within that session**, then rerun appropriate checks for the latest pushed head;
- if green and acceptance remains, continue to the next unit in the same run.

Reserve a repair/drain phase before the session budget is exhausted. Stop admitting new code while failing checks are being repaired; switch to disjoint work while checks are queued/running. Before closing, account for every actionable failure on the owned current head and verify the current head; no pending/red head is DONE or mergeable. Do not weaken gates, delete required tests or count a rerun as a repair. A CI provider outage, unavailable runner or missing authorized environment is recorded as an external block with run/job/head/error, attempted recovery and a preserved checkpoint. It is never reported as fixed. The task target cannot override emergency CI repair.

## Phase 1 acceleration

Until 2026-10-01 01:00:
- DB lane prioritizes multiple catalog/dependency/classification/reuse shards per run.
- ERP complete-candidate lane verifies unresolved pilot mappings and source facts needed by Phase 2 without reopening broad archaeology.
- UX complete-candidate lane prepares concrete pilot screen schemas and role/action matrices from VERIFIED evidence.
- Architecture complete-candidate lane prepares API/authorization/data-contract skeletons and joins any new DB evidence immediately.
- Lead continuously integrates closure evidence, attacks gaps and builds the Phase 2 execution graph in parallel.

## Phase 2 acceleration

Use the at-most-ten lane ownership table in `PHASE2_SCHEDULED_EXECUTION_PLAN.md`. Independent source-free platform preparation is not automatically blocked by unresolved domain evidence; enabling legacy authentication, business writes and release still requires their individual gates. Reuse an existing suitable lease instead of creating a duplicate; schedules themselves remain planned until explicitly instantiated.

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

- **All lanes, including Lead:** plan 4–6 meaningful tasks/session, each with an artifact, acceptance and verification.
- **Heavy/fragile task:** remains one task. Rebalance the queue and reserve CI recovery budget; never inflate its count.
- **Blocked shortfall:** record actual completed count, missing source/environment/lease, attempted recovery and next independent work. Do not claim four tasks when fewer completed.

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
- actionable RED on the owned current head, introduced now or inherited: inspect, fix and rerun in the same session; keep the owning PR open and non-mergeable until proved green;
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


## GitHub mutation safety-layer protocol

The GitHub connector may intermittently reject otherwise-valid mutation operations through its safety layer. This is an external write-path condition, not evidence that analysis/code is invalid.

Workers must NOT attempt to bypass or disable the safety layer.

### Mutation discipline
For every GitHub write:
1. fetch live branch/PR state first;
2. fetch the current file SHA when updating an existing file;
3. perform **one mutation at a time**;
4. prefer small, reviewable, single-purpose commits;
5. avoid batching unrelated files/comments into one write burst;
6. verify the new commit/head after success before issuing the next dependent mutation.

### When a safety-layer rejection occurs
1. Do not spam retries.
2. Re-read live head/file SHA.
3. Retry once with the smallest equivalent mutation:
   - one file instead of several;
   - shorter/single-purpose content;
   - one comment instead of a burst;
   - update an existing durable artifact instead of creating several new artifacts when semantically equivalent.
4. If the second mutation is also blocked, mark the write path unavailable for the rest of that run and continue read-only analysis, tests, planning, review, or another independent executable unit.
5. Preserve the exact pending durable change in the run's resumable checkpoint when any write path remains available. If no GitHub mutation is available at all, report the precise pending file/change in the final run report so the next run can retry it once.
6. On the next scheduled run, retry the pending smallest mutation once after refreshing live state.

### Lead recovery
Lead treats repeated safety-layer blocks as a write-path incident:
- compare chat/run-reported progress against actual durable GitHub head;
- never count uncommitted/uncommented work as durable completion;
- when mutations recover, flush the smallest highest-priority pending closure artifacts first;
- avoid duplicate writes that another run may already have landed;
- if a closure deadline is threatened, continue producing verified analysis and a precise pending-write manifest rather than fabricating closure.

### What the user does NOT need to do
No repository setting, permission toggle, branch-protection weakening or safety bypass should be requested from the owner solely for this condition. Ask the owner only if GitHub itself reports a genuine permission/credential/repository-policy blocker that cannot be resolved by the existing authorized connector.
