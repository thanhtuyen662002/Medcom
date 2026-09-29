# Medcom ERP → Web Modernization

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
