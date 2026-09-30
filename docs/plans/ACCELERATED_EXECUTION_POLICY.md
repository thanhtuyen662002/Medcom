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

When the source/tool state permits, a run should aim for **2–4 concrete work units**, for example:
- multiple DB catalog shards;
- catalog + dependency extraction + reuse classification;
- several screen bindings;
- several Phase 2 issue definitions;
- implementation + tests + CI repair;
- review + fix + next independent task.

This is a throughput target, not permission to fabricate work or skip verification.

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
