# Parallel execution and anti-bottleneck protocol

> Activation checkpoint — 2026-10-02: PR #43 is reviewed/merged and ten hourly schedules are enabled in bootstrap/preparation mode. Read `docs/execution/SCHEDULE_ACTIVATION_20261002.md` and current `docs/PROJECT_STATE.yaml`. These supersede the original planned-only/future activation statements below. L01 alone writes GitHub until minimum preflight and proved dispatcher admission; other lanes remain read-only/preparation. Source/runtime/CI gates and truthful 4–6 unit accounting remain mandatory.

The five Phase 1 workstreams are historical analysis roles. The owner's 2026-10-01 request plans at most ten future coding lanes, defined in `plans/PHASE2_SCHEDULED_EXECUTION_PLAN.md`. No automation is created, repurposed, stopped or enabled by this preparation run. That plan governs future lane ownership, admission, lease fencing and CI drain; this file retains the underlying anti-bottleneck principles.

## Core rule: never idle on a dependency
A worker blocked on one artifact must immediately choose the next independent item in its backlog: inventory, evidence verification, gap analysis, risk tests, cross-reference, documentation or remediation design. Waiting is not a valid end state while independent work exists.

## Lease rules
- Draft PR = preferred distributed lease for a bounded work package.
- Earliest valid active lease wins; later duplicate claims must close/rebase to non-overlapping work.
- Stale/closed/merged PR references are not live leases.
- Keep PRs small enough for review; split huge inventories into generated indexes plus human-readable summaries.
- A Draft PR is a discoverable lease record, not an atomic lock by itself. Use the scheduled plan's unique issue/path owner, generation/source-head fencing and re-read-before-write protocol; only the coordinator admits a contested lease. A TTL expiry alone never authorizes stealing another worker's branch.
- Lead may take over a stale lease only after proving inactivity/invalidity and documenting why.

### Connector-resilient fallback lease
GitHub connector write operations must be attempted sequentially, not as a burst of multiple independent mutations.

If `create_pull_request` is rejected by the connector safety/mutation layer while branch writes still work:
1. Do not stop the workstream.
2. Do not create a second branch.
3. The canonical workstream branch `agent/<workstream>-issue-<n>` plus its latest durable commit becomes the temporary fallback lease.
4. Continue making small, reviewable commits on that same branch.
5. Record the missing-PR condition in the workstream's next durable checkpoint when possible.
6. Lead/Watchdog retries converting that exact branch into a Draft PR on a later cycle, one PR mutation at a time.
7. Once a Draft PR exists, it supersedes the fallback branch lease immediately.

A connector rejection is therefore a process degradation, not a project blocker, unless both branch writes and PR creation are unavailable. If all GitHub mutations fail, workers continue source analysis locally for the run, clearly report that the result is not yet durable, and retry persistence on the next cycle without duplicating work.

## Cross-workstream contracts
- ERP Analysis publishes stable IDs for screens/forms/reports/config artifacts.
- DB Analysis publishes stable IDs for DB objects and dependencies.
- Web Product/UX publishes Web capability IDs and interaction contracts.
- Migration Architecture joins those IDs into traceability matrices.
- Lead/Watchdog verifies referential completeness and creates bounded gap issues rather than blocking all work.

## Bottleneck detection
Lead checks: stale leases, duplicate work, oversized PRs, unreviewable generated files, source-access failures, CI/tool failures, contradictory docs, unresolved UNKNOWNs, cross-workstream dependency cycles, missing evidence, security leakage, and tasks that repeatedly report status without adding knowledge.

## Recovery
When a bottleneck is found, Lead must perform the smallest safe corrective action: fix state/docs, split work, reassign a gap, repair a PR, create a bounded issue, unblock dependency or move a worker to an independent backlog. Reporting alone is insufficient when correction is possible.

## Phase stop
Specialists mark their stream `complete_candidate` only after acceptance is evidenced. Lead independently audits all five outputs. Once complete, Lead records `phase_status: awaiting_csharp_round` and disables all Phase 1 schedules.
