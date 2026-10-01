# Phase 2 Realtime, Coexistence and Recovery Contract

Status: implementation-ready architecture contract. Exact legacy writer hooks remain UNKNOWN until directly evidenced.

## Authority and freshness
- SQL Server/business services remain authoritative; SignalR is an invalidation accelerator, never an authorization or commit authority.
- Publish Web-originated invalidation only after authoritative commit. Events carry stable resource/scope/version hints, not trusted business payloads.
- On event, reconnect, focus-return, stale-age threshold, or suspected gap, clients re-fetch through authorized APIs.
- WinForms/legacy writers may bypass Web and emit no event. Every migrated screen therefore retains SWR plus bounded polling/manual refresh according to its freshness class. No aggressive DB polling merely to simulate push.
- Background refresh, polling and SignalR traffic never extend the user idle session.

## Scope and authorization
- Hub connection requires an authenticated live server session.
- Subscription groups are server-derived from effective user/company/branch/storehouse/capability scope; clients cannot widen them.
- Permission/scope changes invalidate relevant navigation/data caches and force authoritative revalidation. A previously subscribed connection cannot preserve revoked access.
- Event names/metadata must not leak unauthorized record existence, counts, document identifiers or sensitive state.

## Cache contract
- Cache only typed query results or normalized screen/config definitions with explicit scope + version/freshness identity.
- Authorization decisions and mutable business state are revalidated server-side at protected operations; cached UI state is never proof of permission.
- Mutation success invalidates affected keys after commit. Ambiguous outcomes follow the command/idempotency reconciliation contract before UI declares success or retries.

## Coexistence
During Web/WinForms coexistence:
1. both clients use existing proven DB contracts behind typed adapters;
2. Web must preserve procedure locking/transaction semantics and must not replace workflow commands with generic table CRUD;
3. Web-originated config versions are rollbackable without mutating legacy transactional history;
4. legacy-originated changes become visible through authoritative re-fetch even when no SignalR event exists;
5. source channel and correlation are recorded where available without inventing correlation for legacy writes.

## Recovery
- SignalR outage: degrade to SWR/poll/manual refresh; mutations continue only if authoritative API/DB path is healthy.
- Cache outage/corruption: bypass/rebuild cache from authoritative APIs; never restore permissions from stale cache.
- Web deployment rollback: route users to last known-good Web build/config version while preserving committed business data.
- Screen-definition failure: fail closed to the previous validated published version; publication is audited.
- Lost mutation response: expose outcome-unknown and reconcile by idempotency/business identity; never blind retry harmful commands.
- SQL/Tool adapter outage: return stable unavailable/error semantics with correlation ID; do not partially emulate legacy behavior.

Rollback must not automatically reverse committed business transactions, alter SQL isolation/recovery options, or destructively reverse shared legacy schema.

## Observability
Measure API/query/command latency, DB duration, SignalR connect/reconnect/gap recovery, cache hit/staleness, fallback refresh age, config version, adapter health and reconciliation outcomes. Durable business/security audit is separate from bounded diagnostic telemetry. Current DB evidence does not justify dependence on Query Store or Service Broker.

## Evidence-bound constraints
Current DB evidence establishes RCSI ON, explicit SNAPSHOT isolation OFF, Service Broker OFF, Query Store OFF and SIMPLE recovery. Architecture therefore does not assume broker-backed change events, snapshot transactions, Query Store diagnostics, or point-in-time recovery.

UNKNOWN until direct evidence:
- exact legacy writer notification hooks;
- per-screen freshness SLA/poll interval;
- deployment topology and SignalR backplane need;
- cache product/topology;
- backup RPO/RTO and restore runbook;
- Tool.dll/legacy process health contract.

## Acceptance
- revoked scope cannot receive or retrieve protected data after authoritative revalidation;
- reconnect/gap path re-fetches authoritative state;
- legacy DB changes become visible without requiring SignalR;
- SignalR/cache failure has a tested fallback;
- outcome-unknown mutation is reconciled without duplicate execution;
- rollback preserves committed business data and previous valid screen config;
- telemetry is bounded/redacted and correlation links support investigation.
