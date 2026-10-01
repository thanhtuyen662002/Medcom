# Medcom schedule activation — 2026-10-02

The owner explicitly requested schedule activation and review/merge of PR #43. The plan was independently reviewed, corrected and merged to `main` at `f9197185b624a8c3f74c99e48a69550b5a7c2a73`, source head `bf4224703f8acda6a3e25e8eb61f8c6e02e87f0c`. Full main-to-head diff, metadata/source hashes, source-table membership, links and dependency checks passed. No application/workflow code was present; no CI/check/status success is claimed.

## Observed activation

- Ten hosted automations were created, enabled and attached as independent tasks to the selected writable Page. Readback confirmed ten enabled tasks and ten active attachments, matching the intended prompts and `Asia/Saigon` timezone.
- Cadence is hourly; L01–L10 use minutes 00, 05, 10, 15, 20, 25, 30, 35, 40 and 45. Configured initial cycle is **2026-10-02 02:00–02:45 local time (UTC+07:00)**. No run completion was observed during setup.
- The exact IDs and service-reported configuration are in [SCHEDULE_ACTIVATION_20261002.json](SCHEDULE_ACTIVATION_20261002.json). This is an inventory of real configuration, not an implemented lock registry or proof of dispatcher enforcement. Private run conversation IDs and account identities are omitted.
- No prior automation existed at the initial account/Page census. Existing plus newly active Medcom schedules now total ten; do not create duplicates or exceed the cap.

## Bootstrap and authorization

The latest owner action authorizes this gated workflow. It supersedes the earlier `planned_only` configuration and original planning-run authorization notes; it does not erase source, dependency, runtime, review or CI acceptance.

**L01 is the sole authorized GitHub writer while hard fencing is unproved.** It performs minimum single-writer bootstrap preflight and maintains a valid Draft/branch for its current bounded package; merged/closed PR #43 is context, not a resumable lease. A1 may proceed after that minimum preflight because the reviewed plan integration is complete. A1 remains primarily owned by L02; an L01-applied preparation is recorded as an explicit L02→L01 sublease.

L02–L10 are active in read-only GitHub/preparation mode until a tested dispatcher release and their exact eligibility/path/resource lease are visible. They may review, design fixtures/contracts and prepare local proposals; they must report prepared versus completed honestly and must not claim local work as durable GitHub progress. Do not infer cross-chat filesystem or private-conversation access. L01 may use in-session subagents with bounded local paths and direct handoffs, then review/apply eligible patches under its single writer; subagents perform no GitHub mutations.

Parallel writers/takeover require proved atomic whole-head CAS with owner/run/epoch enforcement, global resource admission and stale-writer rejection. Metadata heartbeats or per-file SHAs are insufficient. Keep parallel admission blocked until tests demonstrate those invariants; no task's activation proves them.

Each session targets **4–6 substantive verified units**, chooses independent work while CI waits and repairs every actionable failure on the owned current head within that session before starting new product code. Inherited failures are included. Preserve exact-head checks and same-session repair/drain budget; report external incidents and unavoidable shortfalls honestly. Never pad units, publish repeated status-only artifacts, weaken tests or merge pending/red work. L01 remains the sole reviewed integration queue.

## Closure decisions and next units

The finite decision is [PHASE1_DB_TRACEABILITY_CLOSURE_DECISION_20261002.md](../reviews/PHASE1_DB_TRACEABILITY_CLOSURE_DECISION_20261002.md):

- **TRC-DB-001 / B2 / #21 stays open.** L03 owns approved-source access, sanitized per-object/per-column catalog, constraints/indexes, script-effective/candidate definitions, complete parsed-or-quarantined body coverage, dependencies and per-object reuse. Static validators and independent review close this evidence node; T1/B3 runtime investigation must not create a circular prerequisite.
- **Exhaustive Gate 4 coverage stays partial.** L01 owns the total disposition export against actual source manifests and the L03 catalog. The published filter seed covers 13 families/24 members/600 rows/18 literal names only. Missing manifest membership cannot become a bounded UNKNOWN.
- Coverage can pass with owned, testable, fail-closed runtime UNKNOWNs after the complete finite export passes; enabled pilot/runtime behavior remains separately gated. Phase 1 #2/#5 retain their broader acceptance and are not automatically closed with one slice.
- Current authorized source lookup exposed only the maintenance guide, with no raw approved ERP/SQL archive available. Recheck new authorized references when supplied; do not retry inaccessible account IDs or invent source bytes. A different hash is a separate baseline decision.

Run priority is: correct current-head failure or integrity issue; minimum bootstrap/control proof; eligible source-free foundation; finite catalog/manifest/traceability closure; downstream approved slices. New discoveries get specific source, owner and acceptance. Ten enabled timers are neither ten concurrent writers nor proof that any code, source gate or runtime acceptance has completed.
