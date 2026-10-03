# R2J asynchronous export-job double

Status: local preparation only against main `f9197185b624a8c3f74c99e48a69550b5a7c2a73`.

`async_export_job_double.py` is a standard-library-only synthetic reference model for the already documented R2J job-envelope boundary. It never loads RPX, queries SQL, renders a report, stores an artifact or returns bytes.

The model makes four boundaries executable:

1. Only an explicitly synthetic registered report, exact contract revision, closed typed parameters and allow-listed format can reserve a job. Authority, scope, generations and projection are server inputs; any browser authority field is rejected.
2. Idempotency binds report/release/config fences, scope, projection, typed parameters and format. Reusing a key with changed semantics is not a second hidden job.
3. Worker dispatch rechecks the current registry and authority, permits only explicit scope/projection narrowing, and fences stale release/config/contract or worker epochs.
4. Status and download independently reauthorize. Unknown and unauthorized jobs return the same denial; artifact readiness additionally requires an aligned restore frontier and the exact worker owner/epoch.

The 33 behavior tests use synthetic data only. They do not prove a complete 786-report catalog, reachable ERP invocation, actual parameters/subreports, durable storage, retention, renderer behavior, export safety, database snapshot semantics or runtime authorization. R2/#25 remains blocked on B2, exact report reachability/export authority, dispatcher fencing and an eligible L09 lease.

Run locally:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 preparations/L09/20261002/test_async_export_job_double.py
```
