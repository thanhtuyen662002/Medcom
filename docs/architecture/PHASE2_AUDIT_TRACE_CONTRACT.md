# Phase 2 Audit and Trace Contract

Status: implementation contract.

Business/security audit and diagnostic trace are separate. AuditEvent is durable business/security evidence. OperationTrace is bounded support/debug data; high-volume spans and metrics use structured telemetry.

A server-issued correlation ID flows from API through handler, Tool.dll adapter or typed SQL contract, audit/trace, and post-commit work. It never grants identity, scope, permission, idempotency, or record access.

Audit stores safe actor/scope, screen/action, business reference when permitted, outcome/result code, build/source, and correlation. Trace stores route/handler, logical DB contract, duration, retry/idempotency state, and sanitized error fingerprint. Never log credentials, tokens, connection strings, secrets, raw executable configuration, or unrestricted payloads.

Ambiguous dispatched commands remain Unknown until idempotency state and authoritative business state reconcile them. Unknown never permits blind replay.

Trace/support APIs require separate server authorization, redaction, scope limits, and bounded time windows. Diagnostic trace failure does not fabricate business failure. Audit atomicity follows verified command transaction semantics; unverified atomicity remains UNKNOWN.

Before production define retention/purge for diagnostic trace, idempotency and outbox; business/legal audit retention; hot-path indexes; write-amplification limits; and pipeline-failure alerts.

Acceptance: correlation spans layers; support access cannot bypass authorization; secrets are absent; ambiguous outcomes reconcile without duplicate effect; diagnostic retention is bounded; audit outcome matches authoritative command result.

UNKNOWN: exact retention periods, telemetry sink, legal retention policy, commands requiring transactionally atomic audit, support-role permission, and legacy audit bindings.
