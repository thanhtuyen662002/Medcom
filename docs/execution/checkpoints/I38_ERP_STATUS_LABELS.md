# I38 — source-backed document status labels

Base: `830d6c710b0fb47dd75a01dfb163ca2619bf5ea5`.

## Source and behavior

`inventories/source/20261007/document-status-bindings.json` records exact approved archive/member integrity, technical dictionary bindings and non-personal label evidence. No raw SQL, form configuration rows, customer data or binaries are included.

Read projections use fixed live dictionary bindings: purchase requests → `AP_PurchaseStatusTbl`, purchase orders → `AP_OrderStatusTbl`, inbound requests → `IV_InboundRequestStatusTbl`. A grouped dictionary LEFT JOIN prevents duplicate status IDs from multiplying documents or changing pagination. Missing, duplicate, null, blank, overlong or control-character or invalid-Unicode labels produce nullable `StatusName`; they never produce guessed ERP names. Dictionary read/type failures retain the existing unavailable response path. There is no row-by-row database lookup and no dictionary/config execution.

Numeric `StatusId` is unchanged. `DocumentSummary` and `PurchaseRequestListRow` add nullable `StatusName`; purchase readback adds it at the envelope level. `PurchaseRequestAggregate`, write DTOs, stored command receipts, equality tokens and workflow transitions are unchanged. No new status filter is introduced.

The current Sites frontend parser accepts optional nullable names for rolling compatibility. `documentStatusLabel` preserves valid ERP text; null IDs display `Chưa có trạng thái`, unknown IDs display `Trạng thái chưa xác định (mã N)`. The old frontend's strict read schema accepts the additive field without modifying its UI. Rendering integration belongs to I36.

## Local verification

- Frontend typecheck: passed.
- Frontend lint: zero errors; existing TanStack Virtual/React compiler warning in `grid.tsx`.
- Focused status/helper/read-contract tests: 3/3 passed.
- Full frontend suite with real copied locked dependencies: 220/224 passed before the final added contract test. Four browser tests were blocked by Chromium Unix socket `EPERM`; no sandbox bypass attempted. Packaging guard passed with a physical dependency directory.
- Backend locked restore: passed with writable process-only SDK/NuGet environment. Earlier incomplete setup produced absent assets and was superseded by the successful restore.
- Backend Release build: passed, zero warnings/errors.
- Focused backend `DocumentStatusTests` + complete `PurchaseRequestQueryTests`: 99/99 passed, zero skips.
- Full backend suite: 1,745 passed, 25 failed, 3 explicitly gated source-runtime skips (1,773 total). The 25 failures occur in five `ServerConfigurationTests` and twenty composed inbound endpoint fixtures while loading harmless synthetic private configuration. The executor exposes `/tmp/.git`; a test content root under `/tmp` causes the existing repo-ancestor protection to reject sibling fixture JSON. Production safety checks were not weakened. Combined fixture correction/hosted verification belongs to the lead; full suite is not claimed green.
- Architecture boundary checker: passed.
- `git diff --check`: passed.
- No actual ERP/SQL/DLL execution or production acceptance claim.

## Integration custody

`SqlPurchaseRequestQueries.cs` overlaps I37 only as a file: I38 changes head/list SELECT shapes, projection reads and readback metadata, not live-session callback behavior. Root merges those disjoint hunks. I36 owns all screen/rendering edits and imports the helper. Root is the sole publisher. Hosted exact-head CI and combined UI verification remain required.
