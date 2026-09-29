# Phase 1 roadmap

## A. Windows ERP archaeology
Build a complete inventory from application packaging and runtime configuration: modules, forms, tabs, controls, grids, hidden/visible/order rules, filters, dropdown/select sources, validation, commands, reports, exports, print behavior, permissions, workflows, navigation, remembered layouts, error evidence and integration points.

## B. Database archaeology
Inventory every SQL object and relationship. Separate transactional/master/config/audit/integration/reporting concerns. Map keys, indexes, constraints, defaults, identity/sequence behavior, triggers, procedures, functions, views and dependencies. Identify implicit contracts, unsafe coupling and Web reuse candidates.

## C. Web product & UX
Define an Apple-inspired but enterprise-productive design system. Optimize for dense data grids, keyboard workflows, fast search/filter/group/sort, column personalization, saved views, bulk actions, drill-down, tab ergonomics, validation, optimistic/pessimistic state where appropriate, accessibility and low-latency perceived performance. Specify realtime per use case; otherwise define refresh cadence/manual refresh and visible data age.

## D. Migration architecture
Create a screen-by-screen and capability-by-capability ERP ↔ Web ↔ DB mapping. Decide reuse vs compatibility facade vs additive config tables vs controlled schema evolution. Define API boundaries, authorization, audit, concurrency, reporting, file handling, background jobs, caching, realtime/eventing, observability and rollback.

## E. Adversarial closure
Attack the plan from developer, DBA, BA, project manager, end user, security, performance, reliability and operations perspectives. Record failure classes, mitigations, detection and test evidence. Continue until newly found failures are only variants of documented classes or explicitly unresolved source unknowns.

## Next phase
Owner will provide C# source on the morning after Phase 1. Treat that as a second technical verification round against all Phase 1 conclusions.
