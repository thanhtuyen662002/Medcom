# Phase 2 Frontend Acceptance Contract

Status: implementation-ready acceptance contract. Unresolved ERP/C# semantics remain UNKNOWN.

## Release gates

Shared frontend and pilot PRs must prove applicable cases below, not merely render successfully.

### Grid
- Exercise 100k+ result cardinality and 100+ potential columns with sanitized/synthetic data.
- Server-side window/filter/sort/search; deterministic row identity; virtualization when required.
- Superseded queries cannot overwrite newer results.
- Saved views survive schema drift by ignoring retired fields and preserving valid preferences.
- Keyboard navigation, explicit bulk scope, and distinct loading/refreshing/stale/error/empty/no-permission states.
- Local interaction p95 <=100 ms; normal indexed filter/sort p95 <=1.0 s; first useful grid p75 <=1.5 s and p95 <=2.5 s.

### Mutation/conflict
- Prevent duplicate local submit.
- Never show success before authoritative acknowledgement.
- Lost acknowledgement enters outcome-unknown and authoritative reconciliation; do not blindly replay.
- Concurrency conflict retains input and offers reload/compare/reapply recovery.
- Confirmed mutation invalidates/refetches affected state.
- Existing SQL locking/XACT_ABORT evidence means browser retry safety is not assumed; exact idempotency remains a gap.

### Authorization/session
- Direct route/API tampering is rejected server-side.
- Export/report/download authorization is independent.
- Role revocation takes effect after authoritative revalidation.
- Quick-nav configuration never grants permission.
- Non-admin cannot use protected navigation/session-policy APIs.
- Default idle timeout is 1440 minutes unless authorized admin policy changes it.
- SignalR, polling and background refetch do not reset idle.
- Expired session never silently replays a business mutation after login.

### Freshness/realtime
- Sales/purchasing lists: SWR <=30 s.
- Inbound/warehouse: SWR <=15 s.
- Editable documents: critical pre-commit revalidation plus post-mutation reread.
- Lookups: authoritative open/search; permitted cache <=60 s.
- Reports: run snapshot.
- Push is an optimization, not the sole correctness path until commit-correlated event/version evidence is VERIFIED.
- Test dropped/reordered realtime invalidations and external WinForms writes with no Web event.
- Non-push surfaces expose manual refresh and visible data age when freshness affects decisions.

### Slow network/recovery
Test 10 s latency, disconnect after submit, stale permissions after reconnect, superseded lookups and interrupted report/export acknowledgement. Show progress after about 300 ms, preserve usable prior data during safe revalidation, expose support reference IDs, and keep critical recovery state outside transient toast.

### Mobile/accessibility
At about 390 px ordinary ERP flows use semantic mobile lists/cards without page-level horizontal scrolling. Bottom nav is a small authorized subset; drawer is full authorized navigation. Desktop actions are keyboard reachable, focus is restored after overlays, validation is field-associated, and status never relies on color alone. Target WCAG 2.2 AA unless an exception is separately approved.

### Binding safety
Safe consumed bindings:
- ERP-FRM-AP_OrderFrm -> DB-TABLE-dbo.AP_OrderTbl + DB-TABLE-dbo.AP_OrderDetailTbl.
- ERP-FRM-IV_InboundRequestFrm -> DB-TABLE-dbo.IV_InboundRequestTbl + DB-TABLE-dbo.IV_InboundRequestDetailsTbl.

Unresolved Sales request, internal transfer and purchase approval route/action/workflow descriptors fail closed while shared components proceed.

### Configuration/data safety
Verified SY_* menu/form/dropdown/action/list metadata is server-resolved compatibility input, never browser-executable query/action authority. Verified operational-looking keyless tables such as CF_ObjectAttachTbl, HR_LayDuLieuExcelTbl, SY_APILog, SY_InitSetup and SY_SynDate must not receive invented row identity or generic edit/delete semantics until a uniqueness/update contract is VERIFIED.

## CI matrix

Type/build; component state; grid stress; auth tamper/role revoke; duplicate/lost-ack/conflict mutation; SWR fallback/realtime-loss; passive-traffic idle expiry; 10 s network; desktop/mobile responsive; keyboard/accessibility; stable-ID pilot binding with fail-closed unknowns.
