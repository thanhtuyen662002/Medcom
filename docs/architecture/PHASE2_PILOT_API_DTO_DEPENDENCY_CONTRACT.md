# Phase 2 Pilot API / DTO Dependency Contract

Status: reviewed planning contract; source evidence pending; implementation is not authorized in this run.

All pilot screens use typed server-side query adapters and typed command handlers. Browser requests carry stable screen/action IDs and typed filter/sort values, never SQL object names. Server injects authoritative company/branch/storehouse scope. List and detail DTOs are separate. Commands use idempotency keys where duplicate effects are harmful and verified concurrency tokens only when evidence exists.

| Pilot | Verified/candidate evidence | Disposition |
|---|---|---|
| Đề nghị bán hàng | ERP-FRM-AR_InvoiceRequestFrm; AR_InvoiceRequestTbl + AR_InvoiceRequestDetailTbl | typed query candidate; verified catalog and scope required; exact mutation/menu binding BLOCKED |
| Đề nghị nhập hàng | ERP-FRM-IV_InboundRequestFrm; IV_InboundRequestTbl + IV_InboundRequestDetailsTbl | typed query candidate; verified catalog and scope required; exact mutation binding BLOCKED |
| Điều chuyển nội bộ | exact form/data binding UNKNOWN | BLOCKED; never guess |
| Duyệt đề nghị mua hàng | ERP-FRM-AP_ApprovePurchaseRequestListFrm; AP_PurchaseRequestTbl + AP_PurchaseRequestDetailTbl | typed query candidate; verified catalog and scope required; approval transition BLOCKED |
| Đặt mua hàng | ERP-FRM-AP_OrderFrm; AP_OrderTbl + AP_OrderDetailTbl | typed query candidate; verified catalog and scope required; exact mutation binding BLOCKED |

Table evidence permits read-contract planning, not direct table mutation.

Dependency order: auth/capability -> typed query platform -> per-screen list/detail -> Grid/mobile; exact ERP/DB command evidence -> typed command -> mutation UI/tests; idempotency/concurrency evidence -> retry/conflict UX; Screen Definition -> presentation only; audit/correlation and SignalR/SWR -> operational acceptance.

Every pilot must test allowed/denied role, direct-route/API denial, scope widening, server-side paging/filter/sort/search, business-state denial, and export/report authorization when present. Critical mutations require stale/retry/OutcomeUnknown coverage.

BLOCKED facts remain exact Tool.dll APIs, internal-transfer binding, per-screen mutation procedure/transaction ownership, permission precedence, concurrency tokens and unverified menu reachability.

## Ownership and proposed transport

The [master plan](../plans/PHASE2_IMPLEMENTATION_MASTER_PLAN.md), sections 16 and
25, defines pilot ownership and the proposed Web envelope: field types,
requiredness, bounds, versioning, safe errors and explicit command outcomes.
These are Web design decisions, not extracted SQL columns or legacy semantics.
Use separate typed list/detail/action DTOs and reject fields outside the reviewed
schema. A closed schema alone is not authorization; every operation rechecks
server-derived scope, capability and current state.

- F4/[#31](https://github.com/thanhtuyen662002/Medcom/issues/31) owns read-only
  AP Order and IV Inbound Request surfaces, after query bindings are verified.
- F5/#32, F6/#33, F7/#34 and F8/#35 own the other evidence-gated pilot slices.
- F9/[#42](https://github.com/thanhtuyen662002/Medcom/issues/42) owns the inbound
  request write slice. Its first deliverable enumerates actual source-backed
  actions. Create/edit/save/submit are hypotheses until verified; receipt,
  posting, approval, cancellation and deletion are not implied by request entry.
- Q4/[#41](https://github.com/thanhtuyen662002/Medcom/issues/41) requires verified
  outcomes for all five pilots, including F9. A successful read-only F4 screen
  cannot satisfy inbound mutation acceptance.

Future implementation requires completed dependencies, reviewed domain mappings,
applicable runtime evidence and authorization. Historical READY labels are not
start permission. Known table candidates do not establish joins, fields, keys,
permission precedence, state transitions or safe direct writes. Each command
needs a verified transaction owner, side-effect/concurrency contract, idempotency
and authoritative reread; worker loss after a possible commit remains
OutcomeUnknown until reconciled.
