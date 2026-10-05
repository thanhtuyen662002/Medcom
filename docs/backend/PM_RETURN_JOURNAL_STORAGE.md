# PM Return journal storage (I09)

I09 implements an **unregistered** SQL Server reservation/read store for the I07
journal contract. `SqlPmReturnJournalStore` executes typed `DbCommand` operations
inside an owned SERIALIZABLE transaction. Its only write inserts InProgress (2).
The new schema artifact is **UNAPPLIED**. No API, DI registration, capability,
readiness flag, legacy procedure or Committed writer is introduced.

## Evidence and ownership

- Lease: Draft [PR #61](https://github.com/thanhtuyen662002/Medcom/pull/61), run
  `e846ad60-9571-4c31-b49d-234c6ddf9ae7`; immutable admission
  `57c3a418161e627c09bf4371f50206ee61481c40`, base
  `f8c41ee5e6e873c86205a133719257bb861d2fa7`.
- Scope: `docs/execution/direct-runs/I09.json`; that inherited claim is unchanged.
- Contracts: `src/backend/Medcom.Application/Transfers/PmReturnJournalRecord.cs`,
  `PmReturnReplayPolicy.cs`, `PmReturnPreparation.cs`, `TransferSubmissionIdentity.cs`.
- Implementation: `src/backend/Medcom.Infrastructure/Execution/PmReturn/`.
- Schema: `schemas/backend/pm-return-journal-v1.sql`, UTF-8/LF SHA-256
  `c7a777578470d1bc4b150503eb4fad7e7497386643c1cf2225e10e916e00f2ce`.
- Recording-double evidence: `tests/backend/Medcom.Api.Tests/ExecutionPmReturnJournalTests.cs`.

All new artifacts are authored Web infrastructure. They contain no private ERP
SQL bodies, extracted rows, credentials or connection strings. Existing B01/P01,
I06/I07 and v1 files are not edited. Parent remains the sole GitHub publisher.

## Stable slot and exact string semantics

The primary key is `(DatabaseBindingId, Slot)`. `Slot` stores the complete validated
tenant/company/actor/action/idempotency tuple: byte version 1, then each field's
four-byte little-endian UTF-8 byte length and strict UTF-8 bytes, in that order.
It is not a digest. Document, submission identity and source SHA are correlation
fields checked inside that stable slot; they do not create a new slot on retries.

Tenant/company retain I07's NFC Unicode and 100 UTF-16-unit limits, excluding
control/format characters and edge whitespace. Actor and idempotency retain the
lossless printable ASCII bounds; action equals the pinned I06 action. Invalid
UTF-16, trimming, normalization on input, case folding and ANSI substitution are
rejected. Case, internal spaces, supplementary Unicode and field boundaries remain
distinct. Strings are explicitly sized typed parameters, never SQL interpolation.

String columns use explicit `Latin1_General_100_BIN2`; tenant/company are nvarchar.
Uniqueness does not depend on string collation or SQL's string padding behavior.
The binary frame ends in a nonzero printable ASCII idempotency byte, so two valid
frames cannot differ solely by trailing zero extension. An invalid stored frame
can have trailing zero bytes: the schema's nonempty-slot CHECK does not prevent
that corruption. Lookup fetches binding/SQL-equal candidates without filtering
their lengths, then decoding compares full bytes and every textual correlation
ordinally. A padded SQL-equal row reaches the codec and fails as Unavailable;
it cannot be hidden as Absent by a length predicate. The recording query model
uses actual .NET `SqlBinary` comparison, whose source treats a trailing all-zero
extension as equal. [Official .NET source](https://github.com/dotnet/runtime/blob/main/src/libraries/System.Data.Common/src/System/Data/SQLTypes/SQLBinary.cs).
This is model evidence. SQL comparison behavior and concurrent uniqueness still
must be qualified on the actual target engine.

`varbinary(871)` plus the 16-byte GUID is conservatively at most 887 bytes.
This fits SQL Server's documented 900-byte clustered-key limit.
[Microsoft capacity specifications](https://learn.microsoft.com/en-us/sql/sql-server/maximum-capacity-specifications-for-sql-server).

## Probe and observation

Every operation probes the schema in its own transaction before lookup. It requires
exactly one version-1 marker with the configured binding and artifact SHA, the
expected 4/15 columns, SQL types, lengths, nullability and collations, and the
named clustered unique primary keys in the expected order. The four named CHECKs
must be enabled/trusted. Their actual definitions are parsed using a bounded
allowlisted grammar with AND/OR precedence and compared over all distinguishable
values against singleton, state, nonempty slot and receipt-phase predicates.
Constraint names alone do not suffice. Unexpected foreign keys or enabled table
triggers, extra indexes, non-writable/offline database, delayed durability, an
ambient transaction or unexpected local transaction depth are rejected.

Missing tables, denied metadata access, provider errors, malformed/duplicate rows,
unknown states, extra result sets and invalid schema are **Unavailable**, never
Absent. Read returns explicit Absent only after a successful probe, zero-row
lookup and acknowledged transaction commit. All lookups use UPDLOCK/HOLDLOCK and
the exact primary-key index inside SERIALIZABLE. The shared marker lock also
serializes admitted store transactions; throughput and deadlocks need real-engine
qualification. These are SQL implementation choices, not measured lock guarantees.
[Microsoft locking guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide).

Rows 2/3/4 (InProgress/OutcomeUnknown/Tombstone) must have null execution fingerprint,
audit ID and receipt JSON. They block a matching retry without ownership or timeout
takeover. Changed document/intent/source returns Conflict. A valid Committed row
contains all three fields; receipt JSON has exactly 15 unique named properties,
version 1, canonical binding GUID, every matching correlation, Committed outcome,
post-status 30 and null rejection. Unknown/duplicate/missing properties, wrong
types, depth, correlations or bounds are rejected. The decoder maps a validated
stored receipt to I07; I09 never writes or invents a Committed receipt.

## Reservation, acknowledgment and authority

The caller must freshly revalidate server identity, tenant/company binding and
current action/document/branch authority before calling the store or disclosing
its result. A constructed `DatabaseAuthority` label is not proof of freshness or
cryptographic provenance. I09 validates that supplied snapshots satisfy I07's
existing scope/authority policy, without replacing the authoritative reader.

A future retry coordinator must read the journal **before fresh admission**.
Committed replay uses the original I07 receipt even after status/assignment/lock
or policy-version changes, subject to current authorization. It must not compare
that original execution fingerprint against a newly prepared execution using the
shared atomic adapter. When Absent is explicit, the caller prepares I06 under fresh
authoritative state; reservation rechecks the slot atomically to handle races.

Reservation checks prepared scope/action/source/document/submission/key, generates
a server attempt GUID, inserts only InProgress, rereads the actual stored row and
then commits. The internal acknowledgment object is returned only after successful
CommitAsync and a final cancellation check. Every result and acknowledgment has
`PermitsDispatch=false`; acknowledged custody alone grants no ERP execution.

Any commit exception or concurrent cancellation after the commit attempt returns
OutcomeUnknown with no observation or acknowledgment. Pre-commit errors return
Unavailable; pre-I/O cancellation touches no connection. Duplicate-key/deadlock
errors have no hidden retry. Cleanup cannot grant ownership or disclose provider
exception text. No delete, expiry, key reuse, automatic takeover or Committed update
exists. Unresolved reservations require a separately designed reconciliation path.

The connection factory must supply a NEW dedicated closed SqlConnection to the
qualified bound database. I09 owns/disposes that connection and transaction; an
already-open connection is rejected without closing another owner's resource.
DbConnection abstraction supports recording doubles in tests, not a substitute
production database. A future integration must ensure trusted TLS, explicit
server/database selection and compatible SqlClient behavior; I09 stores no secrets.

## Deployment and unresolved acceptance

No startup DDL or marker bootstrap exists. A separately authorized operator must
apply the exact artifact and provision one immutable version/binding/artifact
marker in the qualified database. This document does not authorize that action.
Marker/hash/shape checks detect configured mismatch; they do not authenticate a
database, attest a DBA, verify deployed bytes cryptographically or discover a
restored database's physical identity.

Binding custody must be managed outside the database and connection secrets.
Restore, clone, rollback, failover or backup loss can resurrect a marker while
removing acknowledged slots. Such a target must remain disabled until journal/ERP
history continuity and client-key reconciliation are established. Blind marker
rotation or reuse of old keys is not a recovery procedure. Storage/log durability,
availability/failover RPO, catalog visibility, exclusive writer/schema custody and
absence of extra security policies/features require operational qualification.
Concurrent DDL or durability-setting changes are outside I09's trust model.

The probe requires database delayed durability DISABLED, rejecting ALLOWED/FORCED.
Microsoft documents that FORCED ignores a transaction's requested fully durable
commit and can acknowledge before log flush; recording doubles cannot establish
crash durability. [Microsoft durability guidance](https://learn.microsoft.com/en-us/sql/relational-databases/logs/control-transaction-durability).

A later executor must atomically validate the acknowledged attempt, revalidate
current authority/state and commit ERP effects, legacy log, Web audit, original
execution fingerprint and receipt in the same qualified SQL transaction. The
source command's nested rollback behavior must be exercised on an authorized
disposable database. I09 performs none of these steps. File audit storage and SQL
equality snapshots do not prove atomic receipt persistence, ABA detection or a
monotonic version. Legacy DLL, WinForms concurrency, runtime SQL, HTTP dispatch,
API-to-Sites connectivity and production acceptance remain separate open gates.
