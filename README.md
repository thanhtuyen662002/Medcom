# Medcom ERP → Web Modernization

> Activation checkpoint — 2026-10-02: PR #43 is reviewed/merged and ten hourly schedules are enabled in bootstrap/preparation mode. Read `docs/execution/SCHEDULE_ACTIVATION_20261002.md` and current `docs/PROJECT_STATE.yaml`. These supersede the original planned-only/future activation statements below. L01 alone writes GitHub until minimum preflight and proved dispatcher admission; other lanes remain read-only/preparation. Source/runtime/CI gates and truthful 4–6 unit accounting remain mandatory.

This repository is the durable engineering source of truth for analyzing the current Windows ERP, reusing the Medcom SQL Server database, and planning a complete migration to a Web ERP.

## Phase 1 baseline
- ERP source: `ERP_Medcom2026(4).zip`
- Database source: `Medcom-Data (3)(1).zip` containing `Medcom-Data.sql`
- Baseline date: 2026-09-28
- Analysis start: 2026-09-29
- Target experience: Apple-inspired visual language adapted for dense enterprise data work.
- Realtime preferred; where realtime is not justified or possible, every surface must define explicit refresh behavior and freshness indication.

## Mission
1. Reverse-engineer every ERP module, form, report, permission, configuration and user flow.
2. Reverse-engineer the complete database and dependency graph.
3. Produce an evidence-backed ERP ↔ Web ↔ DB traceability model.
4. Define migration architecture, Web configuration model, APIs and UX behavior.
5. Stress-test the plan until new failures are only variants of documented failure classes.

See `AGENTS.md`, `docs/PROJECT_STATE.yaml`, `docs/SOURCE_BASELINE.md`, `docs/ROADMAP.md`, and `docs/PARALLEL_EXECUTION.md`.

## Current reconciliation and execution handoff

The 2026-10-01 preparation integrates the owner-supplied WinForms maintenance guide without replacing the approved raw-source baselines or claiming Phase 1 closure. Legacy VB.NET source grammar, historical menu/data context and unresolved runtime facts remain explicit.

- [Supplementary guide evidence](docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md) and [293 contextual property/key pairs](inventories/erp/WINFORMS_PROPERTY_KEY_INDEX.json).
- [Document consistency audit](docs/reviews/DOCUMENT_CONSISTENCY_AUDIT_20261001.md).
- [Security/data attack cases](docs/reviews/PHASE2_SECURITY_DATA_ATTACK_REVIEW.md) and [user/operations attack cases](docs/reviews/PHASE2_USER_OPERATIONS_ATTACK_REVIEW.md): 92 planned cases, not executed runtime tests.
- [Ten-lane scheduled execution plan](docs/plans/PHASE2_SCHEDULED_EXECUTION_PLAN.md): one owner per 31 issues, 4–6 meaningful tasks/session, same-session CI repair, fenced leases and a single integration queue. Schedules are planned only; none is activated by this preparation.

Current gates are in `docs/PROJECT_STATE.yaml`; the master plan's section 26 joins the handoff and adversarial dispositions. A historical READY label or a guide snapshot is not implementation or release evidence.
