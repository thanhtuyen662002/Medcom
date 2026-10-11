# I78 — Remaining CUD and workflow actions

Owner direction (2026-10-11): implement the missing CUD and business buttons; exclude print and file import/document copy from this round. Continue BE only and retain FE handoff.

Starting main: `b8955fba7a891adbc4f07714b182339bfa47651f`. The four main workflows completed successfully (38111471803, 38111471804, 38111471785, 38111471758); this does not qualify later changes.

## Authorized implementation scope

- AP_OrderFrm purchase-order create/save/delete and its verified business actions.
- IV_InboundRequestFrm inbound-request create/save/delete and its verified business actions.
- Source-backed downstream sales PM/SA and internal-transfer PM/batch actions identified by the current owner ERP and database definitions.
- Repair-service calculation gaps where actual current source establishes the rule.
- Typed full-field reads, ID/name presentation, action visibility/enablement, dropdowns, concurrency/idempotency and updated FE contracts for the added forms.

Print execution and upload/import/document-copy implementation are excluded by this owner request. Existing routes are preserved.

## Evidence and custody

Historical approved archives retain their identities in `docs/SOURCE_BASELINE.md`. Current owner-local source and live catalog have distinct provenance in `inventories/source/20261010/source-set.json`. Supplementary maintenance evidence: `docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md`.

This direct sole writer uses a new isolated branch; existing PRs and immutable claims are preserved. No FE/Sites application or automation changes. Raw SQL bodies, config values, binaries, credentials and production business rows stay private.

Current source recovery, complete action denominator, implementation, tests, exact-head/base CI, deployment and real business acceptance: **PENDING / UNKNOWN** until observed. Missing evidence must never become guessed workflow behavior.
