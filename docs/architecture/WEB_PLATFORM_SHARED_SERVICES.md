# Reusable Web Platform Services and Tables

Status: **reference platform contract** for Phase 2 planning. Exact physical schema may be improved by the implementation team if all invariants remain covered.

## 1. Goal

Create a small reusable Web platform layer that can be reused across Medcom and future ERP-to-Web projects without duplicating session/config/navigation/audit/idempotency infrastructure.

Keep this layer separate from legacy business transaction tables.

## 2. Suggested SQL Server namespace

Preferred logical namespace: `WebCore` (or an equivalently explicit schema).

Candidate reusable tables:

| Capability | Candidate table | Purpose |
|---|---|---|
| settings | `WebCore.AppSetting` | versioned application/runtime settings that are not secrets |
| session policy | `WebCore.SessionPolicy` | idle timeout and session behavior policy |
| screen definition | `WebCore.ScreenDefinition` | stable screen identity + current effective version |
| screen versions | `WebCore.ScreenDefinitionVersion` | immutable normalized screen-definition versions |
| scoped overrides | `WebCore.ScreenOverride` | company/role/user presentation overrides where justified |
| role quick nav | `WebCore.RoleQuickNav` | role-based mobile shortcut configuration |
| sync state | `WebCore.ConfigSyncCheckpoint` | source/hash/version/last-success/error state for DB/DAT sync |
| config audit | `WebCore.ConfigChangeAudit` | admin/config publication and rollback history |
| idempotency | `WebCore.IdempotencyRecord` | replay protection / prior command outcome |
| outbox | `WebCore.OutboxEvent` | durable post-commit invalidation/job intent where required |
| business audit | `WebCore.AuditEvent` | security/business action trace |
| support trace | `WebCore.OperationTrace` | bounded backend diagnostic/correlation support records |

This is a reference set, not an instruction to blindly create every table. DB/Architecture must eliminate tables already safely covered by existing Medcom schema and justify additive storage.

## 3. Common columns/conventions

Where applicable use:
- surrogate technical key;
- stable public logical ID separate from display label;
- `CompanyId` / scope fields only where the capability is truly scoped;
- `Version` or immutable version row;
- `CreatedAtUtc`, `CreatedBy`;
- `UpdatedAtUtc`, `UpdatedBy`;
- enabled/active flag where needed;
- correlation ID / source channel for changes.

Use UTC for platform timestamps; convert for display only.

Do not use user-editable display text as a relational identity.

## 4. Session policy

`SessionPolicy` must support at minimum:
- default idle timeout minutes = 1440;
- effective version;
- admin-updated actor/time.

Optional architecture-selected fields:
- warning-before-expiry minutes;
- absolute maximum session duration;
- simultaneous-session policy.

The server remains authoritative. Background refresh and SignalR messages cannot count as user activity.

## 5. AuditEvent

Purpose: durable security/business trace, not verbose debug logging.

Minimum conceptual fields:
- AuditEventId;
- OccurredAtUtc;
- CorrelationId / TraceId;
- UserId;
- SessionId/reference;
- Company/Branch/Storehouse scope where applicable;
- ScreenId;
- ActionId / CapabilityId;
- BusinessObjectType;
- BusinessObjectId/document ID;
- Outcome (Success/Rejected/Conflict/Unknown/Reconciled);
- ResultCode;
- safe summary metadata;
- client/app/build version.

No secrets/raw credentials. Sensitive before/after values need explicit policy and redaction.

## 6. OperationTrace

Purpose: support/debug when BE behavior is wrong or unexpected.

Minimum conceptual fields:
- OperationTraceId;
- OccurredAtUtc;
- CorrelationId;
- TraceId / ParentTraceId;
- UserId when available;
- ScreenId / ActionId;
- route/handler;
- logical DB contract ID;
- duration ms;
- DB duration ms;
- result/row count when safe;
- retry count;
- idempotency outcome;
- status/error code;
- sanitized exception type/message fingerprint;
- application/build/deployment version.

Retention MUST be bounded. Index for time + correlation ID + action/document identity as appropriate.

High-volume spans/metrics should also flow to structured telemetry/OpenTelemetry rather than forcing every internal event into SQL Server.

## 7. IdempotencyRecord

Needed for retry-safe commands where duplicate execution is harmful.

Concept:
- IdempotencyKey;
- command/action ID;
- user/scope;
- request fingerprint;
- status (InProgress/Committed/Rejected/Unknown);
- authoritative result reference;
- timestamps/expiry.

Must be transactionally coordinated with the business effect where required.

## 8. OutboxEvent

Use only where durable post-commit event/job intent is needed.

Examples:
- SignalR invalidation after config publish;
- notification/job dispatch;
- cache invalidation fan-out.

Publishers must be idempotent and consumers deduplicate.

## 9. Screen metadata + DAT sync

`ScreenDefinitionVersion` stores a normalized projection, not raw executable legacy configuration.

Sync pipeline:
1. detect DB/DAT changes;
2. parse;
3. validate;
4. compare hash/version;
5. classify presentation vs executable change;
6. validate executable contracts;
7. publish immutable version;
8. update current pointer;
9. audit;
10. emit post-commit invalidation.

Previous valid version remains available for rollback.

## 10. Configuration precedence

Presentation precedence policy remains subject to legacy verification, but the target model supports:
- system;
- company;
- role;
- user.

Authorization is separate and can only narrow actions/data, never be granted by presentation configuration.

## 11. Indexing/retention requirements

Before migrations are accepted:
- define primary/unique keys;
- define hot-query indexes;
- define retention for OperationTrace/Idempotency/Outbox;
- define archival/purge jobs;
- measure write amplification;
- ensure logs cannot grow without bound;
- ensure audit retention aligns with business/legal policy.

## 12. Better implementation alternatives

A team may choose fewer tables, JSON version documents, a dedicated logging sink, or another normalized design if it provides stronger reuse/operations and preserves:
- versioned config;
- safe rollback;
- role-scoped presentation;
- server-owned session policy;
- idempotency;
- durable business audit;
- support correlation;
- bounded telemetry retention.
