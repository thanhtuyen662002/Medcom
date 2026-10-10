# I76 — Personal ERP notifications

Owner requested full notification API from `dbo.SY_NotifyMsgTbl`, recipient `ToUserID = SY_User.UserName`, and click-through with the native document key. Base main: `75edfd7099a33ca31b2912a9bc575222ab24205f`; isolated branch `codex/g45-notifications-i76-20261010`. Scope is backend/contracts/tests/sanitized evidence/handoff; the separately owned FE, previous leases/claims and OFF schedules are preserved.

## Source evidence

- Current SELECT-only MedData audit: 22 notification columns and four current notification procedure definitions. No real rows or production notification state were read/changed. Private evidence `I76-notifications/metadata.json` and `SY_Notify*.private.sql`; public names/types/nullability/hash reconciliation in `inventories/source/20261010/notification-api-source.json`, compared against existing catalog-columns/catalog-objects.
- Web list source uses recipient, ShowWeb and IsActive; its selected 17 fields omit five table fields. The API reads all 22 typed fields and preserves nulls. The native Web list does not filter ExpireAt; that behavior is preserved and explicitly documented. Native ERP popup has different channel/cursor/truncation and expiry semantics and is not substituted for the Web list.
- Native mark-read procedure hash `7af88e6dab52888ebabc92dec8cea6f63eec0c3b280fdd2225cfdfa3aba9db63`. Reads/updates are bound to the canonical session principal, current SQL user/group/credential, and fixed SQL objects. No recipient/SQL parameter from HTTP is accepted.
- Nine finite form mappings reuse the existing authorized document detail readers. No WebRoute execution, guessed dynamic form, client-supplied table/filter SQL or cross-branch document admission.

## Implementation and validation

`Notifications.cs` contracts include all columns, page/counts, typed required IsView and navigation target. `SqlNotificationQueries.cs` uses dedicated serializable connections, current identity checks, ownership/channel predicates, rollback for rejected reads/writes and a pinned native mark-read call. `NotificationNavigation` resolves only current readable detail and returns original document ID, branch and detail API; the HTTP target rereads personal notification to detect changed/lost routing data. Ordinary `ApiHost` registers the real service whenever Legacy identity is enabled; there is no feature flag for the notification provider.

Observed local build: analyzers PASS, zero warnings/errors. Final public full suite: 3,276 PASS, zero failures/skips, including 43 notification cases. Eight API-audit regressions and 54 source regressions PASS; finite source catalog validation PASS (1,527 objects/33 members). OpenAPI has 119 registered operations and is generated from the actual host contract. Private SQL/ordinary-host checks were rerun on the final implementation: 26 PASS.

Private isolated SQL Server fixture: 26 checks PASS, including native recipient paging/unread filtering, all fields/nulls, hidden/other-user denial, native mark-read/unread effects, repeated first ViewDate, logout-before-commit rollback, changed credentials/disabled user, procedure drift rejection, and ordinary HTTPS host registration with actual Tools.dll password worker and synthetic SQL user. SQL state was independently read after HTTP mark-read. Native positive click-to-document semantics reuse the existing typed readers; I76 route/mapping tests use bounded test providers, not production SQL claims. Fixture ID and exact code/SQL provenance remain private; no real MedData notification update was made.

The first ordinary fixture login failed because the standalone test host had no packaged password-worker folder; copying the already-built worker into that private host corrected the fixture packaging. It was not a product authentication change or a target SQL connection failure. The subsequent 26-check run passed without a notification-provider or identity override.

## Local quality review

Reviewed ownership and query binding, native identity/group/credential rechecks, source pin and varchar(50) truncation rejection, positive/negative recipient paths, full DTO and OpenAPI keys, source calendar timestamps, deterministic bounded paging, native first-view semantics, transaction disposal/rollback and uncertain-commit response, session change before/after commit, fixed routing and encoded document IDs, owner/asset/branch rights through existing readers, second personal read after navigation, and BFF handoff requirements. Early transaction returns were moved into a bounded observation function so cleanup failures can retire a response; invalid borrowed connections are not disposed as owned connections. No unresolved local finding is knowingly deferred.

## Target and remaining acceptance

Live source/metadata visibility was observed; no schema change/migration or refresh of the existing ERP write fingerprint is required. Existing I75 MedData journal activation and BE write profile remain intact. I75 installation/live deployment proof: PR #132 comments `6097976637` and goal #45 comment `6097976878`; those supersede the older pending-owner-decision state for that bounded operation.

I76 hosted exact-head/base CI, integration preflight, merge and deployed notification smoke are pending at source publication and must be separately checkpointed before claiming integration. Native owner account/real notification acceptance, FE BFF allowlist/renderer delivery and forms outside the nine mappings remain UNKNOWN. Global business/release goal #45 stays open.

FE handoff: `docs/backend/NOTIFICATIONS_FE_HANDOFF_20261010.md`; source contract `inventories/source/20261010/notification-api-source.json`; executable contract `docs/backend/medcom-openapi.json`.
