# UX Runtime Feedback, Performance and Session Contract

Status: **ADOPTED Phase 2 UX requirement**.

## 1. UX is the primary product constraint

The Web migration succeeds only if users can perform daily work faster and with less uncertainty than in the Windows ERP.

Every implementation review asks:
- Is the next action obvious?
- Did the UI acknowledge the interaction immediately?
- Can the user tell whether data is fresh?
- Can the user tell whether save/action succeeded?
- Can the user recover from errors/conflicts without losing work?
- Is the screen efficient with keyboard and touch?
- Does mobile prioritize the few fields/actions that matter?

## 2. Toast / operation feedback

Use shadcn-compatible toast/notification implementation (for example Sonner).

Default preferred position: **top-center**. A top-right placement is acceptable if usability testing demonstrates less obstruction.

Patterns:
- Save/create/update/delete success -> success toast after authoritative server acknowledgment.
- Workflow action accepted -> toast with resulting state when known.
- Background job started -> toast plus persistent job/status affordance.
- Warning -> longer-lived toast plus inline context if action is required.
- Error -> toast may announce the error, but recoverable/critical context must remain visible in the screen.
- Validation -> inline field errors, not toast-only.

Do not:
- toast “Đã lưu” before commit;
- hide a conflict only inside a disappearing toast;
- spam multiple identical toasts from polling/realtime refresh;
- expose stack traces/SQL/server internals to users.

Every support-worthy error includes a safe reference/correlation ID with a copy affordance.

## 3. Timing

Recommended defaults:
- success: ~3 seconds;
- info: ~4 seconds;
- warning: ~6 seconds;
- critical error requiring user action: persistent enough to act on, with durable inline state.

Exact timings may be tuned by UX testing.

## 4. Perceived speed

Target:
- interaction acknowledgment <= 100 ms;
- if network action remains pending > ~300 ms, show non-blocking progress;
- preserve existing usable data during safe revalidation;
- cancel superseded lookups/search;
- prevent duplicate submit;
- async long report/export instead of blocking the page.

Never use artificial delay merely to make animations visible.

## 5. Idle logout

Default inactivity timeout: **1440 minutes / 24 hours of no real user interaction**.

Admin can edit idle-timeout minutes through a protected admin UI.

### What resets idle
User-originated interaction/operation, for example:
- pointer/touch/key interaction that results in meaningful app activity;
- explicit navigation/action;
- explicit session continuation.

### What must NOT reset idle by itself
- SignalR traffic;
- periodic polling;
- SWR/background refetch;
- automatic cache invalidation;
- background report/job updates;
- a tab merely remaining open.

Implementation may use a throttled activity signal to the server rather than transmitting every mouse/key event.

Server is authoritative for expiry.

## 6. Session expiry UX

When feasible:
- show a warning shortly before expiry;
- offer “Tiếp tục phiên”;
- continuation requires server confirmation;
- on expiry, redirect to login;
- preserve safe return route;
- protect dirty edits with a recoverable warning/draft strategy where business/security policy allows it.

Never silently extend an expired session only because the client claims it was active.

## 7. Admin session-policy UX

Admin-only:
- current timeout minutes;
- edit + validation;
- publish;
- effective version/time;
- changed by;
- audit history.

Non-admin:
- no configuration controls;
- direct route/API forbidden.

## 8. Realtime UX

SignalR status is not a decorative “live” badge unless end-to-end freshness is actually guaranteed.

When realtime is degraded:
- continue SWR/poll/manual refresh as defined;
- indicate stale/degraded state only where material to decisions;
- revalidate after reconnect;
- never replace dirty form fields blindly from a live event.

## 9. Acceptance

Test:
- 24h default policy loads correctly;
- admin can change minutes;
- non-admin cannot change it;
- background polling cannot prevent logout;
- session expiration invalidates backend operations;
- warning/continue flow works;
- success toast only occurs after server confirmation;
- lost acknowledgment enters reconciliation rather than showing false failure/success;
- correlation ID is visible for support-worthy failures;
- repeated SignalR/poll events do not spam toast.
