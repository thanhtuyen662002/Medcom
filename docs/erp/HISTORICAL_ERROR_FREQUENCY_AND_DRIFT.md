# Historical error frequency and deployment-drift evidence

Source: authoritative `ERP_Medcom2026(4).zip`, historical text error logs packaged with the application. This document publishes sanitized lexical classifications only; no customer/transaction values, credentials, paths containing user identity, or sensitive source payloads are reproduced.

Evidence level: **VERIFIED for lexical presence/counting in packaged logs**. Counts below are text-match observations, **not incident counts** and must not be interpreted as unique failures or business-impact frequency.

## 1. Coverage

The authoritative package contains 39 historical text logs. A full-package lexical pass classified recurring failure signatures.

| Failure class | Lexical matches | Distinct log files with matches | Migration implication |
|---|---:|---:|---|
| Form resolution / `Form not found` | 42 | 30 | deploy/config compatibility and route-resolution gate |
| FK/reference failure | 36 | 5 | authoritative referential validation and explicit historical-reference UX |
| duplicate / PK / unique | 24 | 3 | idempotency, uniqueness conflict, retry discipline |
| invalid column / schema drift | 20 | 3 | API/schema compatibility gate and fail-closed contract parsing |
| date/time conversion | 18 | 3 | typed date/time contracts; locale semantics cannot be inferred from browser strings |
| network / DBNETLIB | 18 | 3 | outcome-unknown reconciliation; reconnect must not imply mutation failure |
| trigger-aborted transaction | 8 | 1 | server business-rule rejection remains authoritative |
| truncation | 6 | 1 | server validation must match DB limits; reject before destructive truncation |
| optimistic delete/update conflict | 5 | 2 | explicit conflict state; no silent overwrite |
| timer/automatic refresh failure | 3 | 2 | refresh failure separated from mutation state; preserve dirty edits |

## 2. Form-resolution drift is a first-class deployment risk

The broadest recurring signature is form resolution failure: 42 lexical matches across 30 of 39 logs.

The package also contains multiple dated `UpdateBK` application snapshots with executable/shared-library copies. Together these facts establish a credible **deployment/configuration drift risk class** without proving the root cause of any individual failure.

Stable risk ID: `RISK-DEPLOY-FORM-RESOLUTION`.

Required Web disposition:
1. menu/navigation configuration may reference only a deployable capability registry known to the server;
2. publication/deployment validates every configured route/screen/action target;
3. Web/API/config revisions expose compatible version identifiers;
4. an unresolved target fails safely and observably; it must not silently redirect to another business screen;
5. deployment health checks exercise configured navigation targets;
6. rollback restores a compatible Web/API/config set rather than only application binaries.

Root cause of each historical `Form not found` line remains **UNKNOWN** until direct C#/config/version correlation is available.

## 3. Refresh and mutation state must remain independent

Timer/automatic-refresh signatures prove that background refresh can fail independently of the user's current edit.

Web requirements:
- a refresh error must not convert a dirty document into a save failure;
- keep existing safe data visible with a stale/degraded indicator;
- preserve unsaved input;
- allow explicit retry/revalidation;
- mutation controls use the mutation state machine independently;
- reconnect revalidates permission, record version and freshness before a critical commit.

## 4. Error-class acceptance matrix

| Class | Detection | Mitigation | Required acceptance test |
|---|---|---|---|
| form resolution | deployment validator + route telemetry | capability registry + compatible deployment manifest | publish config containing nonexistent target → deployment/publish fails before users receive it |
| FK/reference | typed server validation + DB error correlation | preserve historical references; validate current selectable reference | edit unrelated field on record with historical invalid reference → reference is not silently cleared |
| duplicate/unique | classified DB/API conflict telemetry | idempotency key where appropriate + domain conflict response | duplicate retry produces one effect or explicit conflict |
| schema drift | contract/version telemetry | compatible DTO/API version gate | required field disappears → client fails closed with correlation ID |
| date/time conversion | typed parsing telemetry | ISO/typed transport + explicit business timezone/date semantics | locale/timezone variants preserve business date semantics |
| network | request/correlation telemetry | outcome-unknown reconciliation | drop response after commit → UI reconciles rather than blindly retrying |
| trigger abort | command rejection telemetry | preserve authoritative rule; no client bypass | trigger/business rejection is shown as rejected, not retried |
| truncation | validation telemetry | enforce known max lengths server-side | over-limit input is rejected before destructive persistence |
| concurrency | version/conflict telemetry | authoritative version check | concurrent update/delete gives recoverable conflict |
| refresh failure | freshness/refresh telemetry | stale-data state + independent retry | refresh failure while dirty preserves unsaved values |

## 5. Evidence boundary / UNKNOWNs

Current baseline does **not** prove:
- unique incident counts from lexical match counts;
- root cause for each historical failure;
- which exact executable snapshot generated every log;
- whether all logs use identical formatting;
- exact C# retry/error-handler behavior;
- exact deployment mechanism or binary/config compatibility rules.

These remain C#-round UNKNOWNs and do not justify inventing runtime behavior.

## 6. Phase 1 disposition

All observed historical error families now map to documented Web/migration risk classes or explicit C#-round UNKNOWNs. This slice has no unexplained VERIFIED capability gap.

This document closes the previously non-durable historical-error frequency/drift slice. Current ERP specification status lives in `../PROJECT_STATE.yaml` and `../workstreams/erp-analysis.yaml`; runtime/source UNKNOWNs and overall Phase 1 closure remain separately gated.
