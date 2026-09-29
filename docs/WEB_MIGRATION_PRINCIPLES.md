# Web migration principles

1. Preserve business semantics before visual parity. Reproduce intentional behavior, not Windows implementation accidents.
2. Every migrated screen must trace to its data source, permissions, validations, workflow transitions, reports and side effects.
3. Configuration is a product capability: labels, tab names/order, column visibility/order/width, formatting, filters, dropdowns, defaults, saved views, required/read-only rules and role/company overrides need explicit ownership and persistence.
4. Prefer reuse of proven DB contracts, but do not force Web-only presentation state into unsuitable transactional tables. Add versioned config tables when separation improves safety and maintainability.
5. Server authorization is authoritative. UI hiding is convenience, never security.
6. Design for concurrency and auditability: optimistic concurrency/version checks where needed, idempotent commands, immutable audit trails for critical operations, and clear conflict UX.
7. Dense data-grid productivity is first-class: virtualized rendering, fast filters/search, keyboard navigation, bulk edit/action safeguards, frozen columns, saved layouts and export parity.
8. Apple-inspired means calm hierarchy, clarity, spacing, motion restraint and consistency; it does not mean sacrificing information density or professional keyboard workflows.
9. Realtime is use-case driven. Use push/eventing where stale data harms decisions or multi-user coordination. Otherwise expose last-updated time, manual refresh and a documented refresh SLA.
10. Measure performance budgets end-to-end: first useful render, grid interaction, query latency, export/report latency, background operations and large-data behavior.
