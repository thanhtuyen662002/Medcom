# P01 audit preparation

This opt-in journal is not registered by Program/ApiHost and does not enable commands.
The application contract stores only bounded technical IDs, a scoped HMAC actor reference,
fixed operation/outcome enums and a correlation UUID. No arbitrary payload or raw actor is accepted.
Supply server-derived scope/actor and separate operator-managed actor/integrity keys through a reviewed lead hook.

The file adapter requires an existing private directory, serializes its callers, uses exclusive
file handles across instances, writes with WriteThrough and calls Flush(true). Duplicate event UUID
with identical content is acknowledged without another frame; different content conflicts.
Partial/corrupt/key-mismatched/cross-scope frames block both append/read; no tail deletion or repair.
Reads are bounded to 100 rows with scope-derived opaque filenames. The chain detects modified frames;
it does not detect privileged rollback to an earlier valid prefix or deletion of a whole journal.
8 MiB/10,000-event capacity fails closed and needs an operator-reviewed rotation/archive design.

Acknowledged records an observed OS persistence acknowledgement, not ERP transaction commit.
This separate journal does not solve atomic DB effects/outbox/idempotency. An attempted write failure
returns OutcomeUnknown; callers must reconcile the same event ID and must not enable a business write
merely because an audit attempt was recorded. A missing store or unreadable/corrupt journal cannot
produce a successful admission. Cancellation before write throws; once write starts it completes/flushed
or returns Unknown rather than falsely promising rollback.

Synthetic local tests prove scope/redaction/restart/exclusion/error semantics only.
Real target ACLs, trusted key custody, parent-directory/ancestor-link safety, symlink races,
filesystem/power-loss durability, host contention, retention, rollback detection and recovery are UNKNOWN.
Operator root must be private and protected against replacement; root/member link rejection is not
an adversarial-filesystem sandbox. No SQL schema, startup DDL, credentials, API or production audit changed.
