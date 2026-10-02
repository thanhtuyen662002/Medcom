> Historical bootstrap checkpoint. The current owner direction and .NET SDK verification supersede the missing-SDK/scheduled-only observations below. Read `DIRECT_EXECUTION_20261002.md`. Source/runtime/review/CI gates remain.

# L01 bootstrap preflight — 2026-10-02

Scope: authorized single-writer planning/control/preflight exception, before a dispatcher exists. This is an investigation result, not a passed bootstrap, CAS implementation, backend build or completed product issue.

## Actual repository and custody

- Read the selected Page, current AGENTS, source/evidence rules, plan, issue graph, finite DB/traceability decision and filter scope audit. The Page contains no applicable agent-instruction block. It was preserved.
- Live `main` is `f9197185b624a8c3f74c99e48a69550b5a7c2a73`, the merged PR #43 plan; tree `4ecf710a7730f18fa774e78775f217f9d7dd6df1`. Do not resume that closed PR.
- Open-PR census was empty before bootstrap. Existing owner-created branch `medcom-schedule-activation-20261002` at that main was resumed. The reviewed ten-file activation tree `d855b06f83824ad373af038ac8095101e4ab228b` was published normally at `8aa76dd1306b4d77a29a24d5ae70b18b1ee621cf`, then opened as the sole [Draft #44](https://github.com/thanhtuyen662002/Medcom/pull/44). This is the current L01 bootstrap lease; no second Draft, force push or main write was used.
- No operational CAS token, owner/run/epoch enforcement or takeover exists. This Draft is visible custody under the explicit single-writer exception, not an atomic mutex. L02–L10 retain primary product ownership and GitHub read-only preparation mode; local in-session bounded handoffs do not grant GitHub writes.

## Minimum environment findings

| Check | Direct result | Decision / owner |
| --- | --- | --- |
| Connected GitHub read/write | Current branches/issues/workflow census read; normal branch FF write and exact tree readback available through connector | PASS for bounded metadata/control branch work; L01 |
| Coherent reviewed plan | PR #43 merged; source tree equals independently reviewed plan; 31-node graph with unique owners | PASS for plan integration, not product completion |
| .NET SDK | `shutil.which("dotnet")` returned null | **BLOCKED A1**; L02/L01 need an authorized .NET 10 SDK environment and restore/build/analyzer verification |
| Available local tools | Node v24.19.0, npm 11.9.0, Python 3.12.14, Git 2.51.1 | Source-free stdlib metadata validation is executable; frontend/backend package installs/builds have not been proven |
| Backend/product tree and workflows | No existing tracked `.github/`, `src/`, `apps/` or product tests at reviewed main; Actions run census returned zero | No backend CI success/failure exists to repair or certify; A1 must introduce scoped build/CI after eligibility |
| Docker / GH CLI | Not installed; anonymous git reads work, authenticated git push is unavailable | Do not claim container/SQL/Windows environment; use connected GitHub API for authorized sanitized branch writes |
| Authoritative source | No newly authorized raw ERP/SQL bytes available; earlier access failure boundary retained, no inaccessible-ID retry | B2/#21, T1 and total manifest gates remain; L03/L04/L05/L09 own their evidence |
| Single writer | Explicit owner authorization permits L01 alone; children prepare only bounded local files | Preserves conservative mode; does not prove machine-enforced exclusion |

The local npm command emitted an inherited environment-option deprecation warning; no npm project or failing application check was run. No actionable current-head code CI failure was observed. Environment absence is disclosed rather than replaced by a fake green check.

## Concrete enforcement bottlenecks

1. The exposed normal `update_ref` operation accepts branch, SHA and force flag, but no expected old head. Non-fast-forward rejection is useful; it does not enforce owner/run/epoch or atomically allocate all global resources. A cooperative local wrapper is bypassable through existing direct GitHub credentials/tools. Until a credential-restricted authorized dispatcher and actual contention/stale-writer/fair-admission tests are visible, parallel writer admission and takeover remain blocked. Do not install or expose an unauthenticated dispatcher merely to satisfy a checkbox.
2. Main is currently unprotected, with no required status contexts. `merge_pull_request(expected_head_sha=...)` pins source head but does not pin base head. A pre-merge main read cannot prevent a base race. Section 10 requires an enforceable current-base candidate/queue gate. No such protected queue/policy is observed through available capabilities, so **keep Draft #44 unmerged**. User authorization to operate does not waive the actual integration acceptance. The prior PR #43 merge is an observed historical fact, not proof of this enforcement.
3. Missing .NET runtime/tooling prevents a meaningful A1 compilation/restore/analyzer acceptance. Do not write a claimed buildable scaffold or mark its preflight passed. The next eligible product unit needs that environment; source-free Python validators and current-state reconciliations can proceed now.

## Bounded work and acceptance

- Activation registry and state reconciliation is published to one Draft; independent reviewer checked ten unique enabled/attached lanes, JSON/YAML/time agreement, unchanged Phase 1 gates, Markdown references and no private conversation/account identity. It remains proposed integration.
- The live 31 implementation issue bodies must supersede waiting-plan-integration with actual preflight/dependency/evidence status, retaining owners, objectives and acceptance. #2/#5/#21 remain open under the merged finite closure decision; no static metadata edit is a code completion.
- A filter-register validator may validate the existing 24-member sanitized subset against repository source hashes and table membership. It cannot supply missing raw package membership, resolve all DB IDs or claim exhaustive Gate 4.
- Read back exact remote head and relevant checks before session end. Keep pending integration and missing acceptance explicit; do not pad four meaningful tasks by splitting commit/push/check bookkeeping.

No production data, legacy runtime call, schema change, deployment or automation alteration is part of this preflight. Recovery next: obtain an authorized build environment; implement/prove dispatcher enforcement before admitting writers; establish enforceable current-base integration policy; obtain approved raw source access for finite catalog/total export.
