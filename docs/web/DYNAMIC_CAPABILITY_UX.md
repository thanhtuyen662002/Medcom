# Dynamic capability UX contracts

Status: implementable Web UX contract based on supplemental C# review evidence published by ERP Analysis. Exact form/class bindings remain UNKNOWN until direct C# verification.

## WEB-CMD-ACTION

Conceptually binds to ERP-CFG-UC-ActionCommand.

Legacy configurable actions become allow-listed server commands with stable command IDs. The browser receives business intent and typed parameters, not executable implementation text. Server authorization is rechecked at execution. Submission uses WEB-MUTATION-OUTCOME: one command instance, correlation identity, no blind replay after ambiguous acknowledgement, and authoritative post-command refresh.

Freshness: targeted revalidation after every command plus the host-surface policy. Shared operational views are invalidated immediately. PUSH remains unclaimed until an event source is VERIFIED.

## WEB-FILE-MEDIA

Conceptually binds to ERP-CFG-UC-Attachment.

Uploads expose queued, uploading, validating, accepted, rejected and failed states. Camera capture requires explicit permission and capture/retake/confirm. Preview, download and delete are separately authorized. Multi-file operations use bounded concurrency.

Freshness: SWR on open/focus plus immediate revalidation after add/delete; active-view target <=30 s. Show last-updated when stale/degraded.

## WEB-FAST-INPUT

Conceptually binds to ERP-CFG-UC-Barcode and ERP-CFG-UC-Import.

Barcode input supports keyboard-wedge operation; scanned token and resolved object are shown separately. Duplicate, unknown and unauthorized scans are explicit and non-destructive.

Import flow is: select source -> parse/stage -> map -> validate -> preview -> commit -> result. Never commit immediately on file selection/paste. Preview shows total, valid, invalid and skipped counts. Large imports become durable background work; partial failure is explicit.

Freshness: scan resolution is on-demand authoritative lookup. Import preview is SNAPSHOT by staging/version; affected host surfaces revalidate immediately after commit.

## WEB-DEVICE-BRIDGE

Conceptually binds to ERP-CFG-UC-DeviceCOM.

The UI models unavailable, connecting, ready, reading, confirmed, disconnected and error states. A reading shows value/unit, source identity when available, capture time and commit state. Reconnect must not silently duplicate the last reading. Manual entry, if policy permits it, is visually distinct.

Freshness: realtime applies only to the active device session; committed business data still uses server revalidation. UX-GAP-DEVICE-001 keeps device models/protocol, local bridge versus browser API, calibration, override and offline policy UNKNOWN.

## WEB-OFFICE-TEMPLATE

Conceptually binds to ERP-CFG-UC-OfficeTemplate.

Template merge is server/background work. The user selects a known template/version and parameters, then sees queued/running/completed/failed state. Editable Office output and print-ready output are separate capabilities. Rich content is sanitized and lossy conversion must warn before commit.

Freshness: generated output is SNAPSHOT with data-as-of and template version. Template administration uses MANUAL/SWR after save, target <=60 s while active.

## WEB-SPREADSHEET

Conceptually binds to ERP-CFG-UC-Spreadsheet.

Do not flatten persisted workbook semantics into WEB-GRID-CORE by default. Migration must declare the supported subset for formulas, formatting, validation, named ranges, sheets, binary round-trip and export. Unsupported features are detected before edit/commit and never silently discarded.

Freshness: versioned SNAPSHOT document state with explicit save/conflict behavior. UX-GAP-SPREADSHEET-001 keeps actual workbook feature usage and required round-trip fidelity UNKNOWN.

## WEB-DASHBOARD-LINKS

Conceptually binds to ERP-CFG-UC-Dashboard and ERP-CFG-UC-ExternalIntegration.

Dashboard cards/grids show data-as-of and independent loading/error state. One failed metric must not blank the page. Document links use stable IDs and preserve return context. External links are allow-listed and clearly marked as external.

Freshness: default POLL/SWR <=60 s with visible last-updated. Operational dashboards may tighten to <=15 s only after workload/correctness evidence. No PUSH without a VERIFIED event source.

## Acceptance additions

- UX-TEST-CMD-001: tampered command identity/parameters are rejected; lost acknowledgement never causes blind duplicate execution.
- UX-TEST-IMPORT-001: 100k-row import with invalid/duplicate records keeps browser memory bounded, preview counts reconcile, and partial results are recoverable.
- UX-TEST-FILE-001: oversized/unsupported upload plus network loss creates no phantom attachment and safe retry does not duplicate.
- UX-TEST-DEVICE-001: disconnect/reconnect during reading never auto-commits a stale reading twice.
- UX-TEST-SPREADSHEET-001: unsupported workbook semantics are surfaced before destructive conversion.
- UX-TEST-DASH-001: one timed-out metric leaves healthy dashboard surfaces usable and exposes local stale age/error.

## Bounded gaps

- UX-GAP-UC-BINDING-001: exact forms using each dynamic control.
- UX-GAP-UC-LIFECYCLE-001: save/delete/change side effects.
- UX-GAP-ATTACH-001: attachment storage, limits, accepted types and content-validation contract.
- UX-GAP-WEBMETA-001: reported Web metadata migration/provider existence and production semantics.

All remain UNKNOWN until direct C#/DB verification.
