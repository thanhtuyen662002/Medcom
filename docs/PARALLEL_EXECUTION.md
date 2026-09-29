# Parallel execution and anti-bottleneck protocol

Five scheduled workstreams operate with staggered hourly starts.

## Core rule: never idle on a dependency
A worker blocked on one artifact must immediately choose the next independent item in its backlog: inventory, evidence verification, gap analysis, risk tests, cross-reference, documentation or remediation design. Waiting is not a valid end state while independent work exists.

## Lease rules
- Draft PR = distributed lease for a bounded work package.
- Earliest valid active lease wins; later duplicate claims must close/rebase to non-overlapping work.
- Stale/closed/merged PR references are not live leases.
- Keep PRs small enough for review; split huge inventories into generated indexes plus human-readable summaries.
- Lead may take over a stale lease only after proving inactivity/invalidity and documenting why.

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
