# L06 frontend preparation — 2026-10-02

Six local preparation units cover F1/#28 through F4/#31: authorized shell/mobile behavior, shared Grid accessibility/stress, query race/freshness, form/session recovery, a fail-closed recoverable-draft storage gate, and strictly read-only AP Order/inbound surfaces.

All source references pin merged main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`. Live GitHub shows Draft #44 at remote head `8cea825ab9f8169e5dfe4543b7d315972f13971a` as the L01 activation/bootstrap Draft, not an L06 lease. F1–F4 remain open with `waiting_dependencies`; actual A/B/platform/source dependencies remain incomplete. L06 performs no issue mutation.

The packages contain 93 synthetic cases: 16 shell, 19 Grid, 14 query race/freshness, 18 form/session recovery, ten recoverable-draft storage cases and 16 read-surface cases. The draft gate also requires 12 independent acceptance items and remains `NO_PERSISTENT_SENSITIVE_DRAFT_BY_DEFAULT`. The Grid fixture uses 100,001 rows so it exercises the normative 100k+ boundary, and its structured budget matches the adopted local-interaction target of p95 <=100 ms. Exact references to `PHASE2_FRONTEND_ACCEPTANCE.md` and `UX_STRESS_ACCEPTANCE.md` are pinned on merged main. Additional cases cover protected-content hydration, cross-tab scope changes, N+1 enrichment, recycled virtual focus, query cache scope, pagination snapshot changes, duplicate submit, scoped drafts and read-surface export/method injection.

They are contract fixtures only. No Next.js tree, component, browser test, product API, accessibility scan, performance result, CI check or GitHub write exists from this run. Every package remains explicitly `NOT_RUN`.

The additional F2 query-freshness behavior double has 27 local tests. It purges cached versions on any authority generation change, compares cursors only with the coordinator's current generation, and computes data age from an explicit authoritative data-as-of timestamp rather than request latency. This remains a synthetic boundary model, not a browser/API/runtime result.

F4 remains read-only. AP Order and inbound request object names are candidate filter evidence, not verified field/join/permission contracts. No route, DTO field or mutation is invented. Inbound mutations remain F9/#42; request entry does not imply receipt, stock posting, approval, cancellation or deletion. Mock rendering cannot close F4, F9, TRC-DB-001 or exhaustive traceability.
