# Phase 2 Pilot API / DTO Dependency Contract

Status: implementation skeleton; unverified source bindings stay BLOCKED.

All pilot screens use typed server-side query adapters and typed command handlers. Browser requests carry stable screen/action IDs and typed filter/sort values, never SQL object names. Server injects authoritative company/branch/storehouse scope. List and detail DTOs are separate. Commands use idempotency keys where duplicate effects are harmful and verified concurrency tokens only when evidence exists.

| Pilot | Verified/candidate evidence | Disposition |
|---|---|---|
| Đề nghị bán hàng | ERP-FRM-AR_InvoiceRequestFrm; AR_InvoiceRequestTbl + AR_InvoiceRequestDetailTbl | typed query READY; exact mutation/menu binding BLOCKED |
| Đề nghị nhập hàng | ERP-FRM-IV_InboundRequestFrm; IV_InboundRequestTbl + IV_InboundRequestDetailsTbl | typed query READY; exact mutation binding BLOCKED |
| Điều chuyển nội bộ | exact form/data binding UNKNOWN | BLOCKED; never guess |
| Duyệt đề nghị mua hàng | ERP-FRM-AP_ApprovePurchaseRequestListFrm; AP_PurchaseRequestTbl + AP_PurchaseRequestDetailTbl | typed query READY; approval transition BLOCKED |
| Đặt mua hàng | ERP-FRM-AP_OrderFrm; AP_OrderTbl + AP_OrderDetailTbl | typed query READY; exact mutation binding BLOCKED |

Table evidence permits read-contract planning, not direct table mutation.

Dependency order: auth/capability -> typed query platform -> per-screen list/detail -> Grid/mobile; exact ERP/DB command evidence -> typed command -> mutation UI/tests; idempotency/concurrency evidence -> retry/conflict UX; Screen Definition -> presentation only; audit/correlation and SignalR/SWR -> operational acceptance.

Every pilot must test allowed/denied role, direct-route/API denial, scope widening, server-side paging/filter/sort/search, business-state denial, and export/report authorization when present. Critical mutations require stale/retry/OutcomeUnknown coverage.

BLOCKED facts remain exact Tool.dll APIs, internal-transfer binding, per-screen mutation procedure/transaction ownership, permission precedence, concurrency tokens and unverified menu reachability.
