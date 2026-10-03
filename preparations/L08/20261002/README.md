# L08 five-pilot evidence-gate preparation — 2026-10-02

This local handoff contains five independent pilot gate packages for F5/#32, F6/#33, F7/#34, F8/#35 and F9/#42. Each package records the requested business intent separately from observed form/table candidates, lists source/runtime facts still missing, forbids unsafe equivalence and defines twelve synthetic fail-closed cases.

The 60 cases preserve these critical distinctions:

- F5: `AR_InvoiceRequestFrm` and its historical “Yêu cầu xuất hóa đơn” caption do not yet prove the owner's “Đề nghị bán hàng” menu/action equivalence.
- F6: `IV_StockTranferFrm` is an investigation candidate only; incoming/status and inbound-request surfaces cannot satisfy internal-transfer acceptance.
- F7: an approval-list candidate does not prove approve/reject/return transitions, separation of duties, locks or completion effects.
- F8: F4's AP Order read candidate and a historical generic `EDIT` definition do not authorize save/submit/cancel/delete; historical menu enablement remains unresolved.
- F9: inbound request entry never implies receipt, stock posting, approval, cancellation or deletion. Actual actions must be enumerated from approved source before any write UI/API exists.

All eight source references are pinned to merged main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`. Every package is `prepared_local_only`, `NOT_RUN` and `eligible_to_code: false`. No raw archive, SQL, binary, customer data, browser/API/database test, product code, CI run or GitHub mutation occurred.

Run locally:

```text
python3 preparations/L08/20261002/validate_preparation.py --repo .
python3 preparations/L08/20261002/test_preparation.py
```

A passing preparation validator does not close F5–F9, TRC-DB-001, exhaustive traceability or Q4. Binding begins only after the exact per-pilot evidence and all dependency/review/CI gates actually pass.

## New F9 behavior preparation

`inbound_request_double.py`, `test_inbound_request_double.py` and
[F9_INBOUND_REQUEST_DOUBLE.md](F9_INBOUND_REQUEST_DOUBLE.md) add one bounded
action/effect state model. Forty-seven tests make request, receipt and stock
posting separate synthetic contracts; enforce exact scalar, state and effect
types; freeze registry/operation views; and bind idempotency to action,
authority, full precondition and payload. Generic or unproved actions, stale
authority/state, CAS conflicts and semantic operation-ID reuse fail closed. No
synthetic action is a claim about an actual Medcom binding.
