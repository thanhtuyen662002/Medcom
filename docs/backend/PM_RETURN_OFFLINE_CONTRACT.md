# PM Return offline preparation — I06

Goal #45; admission `docs/execution/direct-runs/I06.json`, run
`6adc7914-17ab-4eb0-9120-f9a7f8f513af`, base `0091f9aa62e980e6d1a6b84fb616d013ac417c6b`.
These components are unregistered preparation code. No gateway, HTTP action,
capability, durable journal, migration or release/readiness transition is enabled.

## Source binding

The owner-authorized local SQL member matches the complete pinned source in
`inventories/source/20261002/source-set.json`: 1,212,595,716 bytes, SHA-256
`61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`.
Local static analysis reconciled the 1,527 declarations, 28 transfer procedures,
11 transfer tables, six stored trigger versions and all twelve command fingerprints.
Raw SQL, binaries, production rows and private machine receipts stay outside this repository.

| Binding | Verified evidence |
| --- | --- |
| Action | `IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl_1`, current `TransferActionCatalog` |
| Menu/form | `07010110` / `IV_InternalTransferPMFrm`, current source-linked catalog |
| Source/post status | 10 / 30 |
| Before-check | `IV_InternalTransfer_RequestPMCheckBeforeUpdateStp`, SQL line 858421; delegated helper line 858344 |
| Command | `IV_InternalTransfer_RequestPMReturnStp`, SQL line 858559 |
| Command definition SHA-256 | `a7225b1ed64667ca16b8edeb7216009d9b1d9ad4d8bd85c289eb8db7e802fb49` |
| Parameters | `@DocumentID varchar(30)`, `@User varchar(100)`, `@Reason nvarchar(max)` |
| Legacy log | `IV_InternalTransfer_RequestLogStp`, line 858404; request log table line 28877 |

Command fingerprints hash the raw UTF-8 definition with universal newlines;
the metadata catalog uses a separate masked-definition hash. They must not be conflated.
The source command has its own transaction/TRY-CATCH/XACT_ABORT and legacy log.
Its PM-related reads precede its own transaction, and it has no rowversion check
or explicit update/range-lock hints. That does not qualify standalone concurrent execution.

## Conservative authority boundary

`PmReturnPreparation` consumes a server identity, a database-origin observation and
an immutable state snapshot for exactly the same tenant/company/document/actor.
It denies missing/disabled/ambiguous authority, different catalog binding,
missing credential confirmation, unassigned/other PM, locked head and status other than 10.
All head branch/from/to identifiers must be present in both frozen session and
current database scopes. The menu must be enabled, have no variant parameter and
match the exact form. One actual grant row must contain both `IsRun` and `IsUpdate`;
separate rows do not synthesize a combined grant. There is no administrator or
missing-permission fallback. Existing group/user/delegated-group grant sources are
reused from `SqlLegacyPolicy`; complete WinForms precedence parity is not claimed.

This is deliberately stricter Web preparation policy. No new session capability
is issued. Single-company database binding, permission parity and target identity
remain runtime/release gates; no tenant/company columns are invented in legacy tables.
Origin/evidence records are internal server inputs, not API DTOs or client authority claims.

Canonical actor must be printable ASCII, at most 50, without trimming or truncation:
the procedure accepts 100 but the legacy request log username stores only 50.
Other actions' shared actor admission is unchanged. The reader also requires a
lossless group key fitting the actual `SY_UserGroup`/group-grant `varchar(20)`.
Legitimate incompatible actor/group encodings need separate compatibility work.
Document key is exact printable ASCII <=30 despite the head/detail `nvarchar(50)`.
Reason preserves original well-formed Unicode, is nonblank, <=1,000 UTF-16 units,
contains no NUL and undergoes no normalization/trimming. Edge whitespace is rejected,
as required by the unchanged shared admission; internal newlines remain unchanged.

## Immutable technical state and stable submission

Snapshot whitelist, directly bound to source columns:

| Table | Columns | SQL declaration |
| --- | --- | --- |
| `IV_InternalTransferRequestTbl` | `DocumentID`, `BranchID`, `FromBranchID`, `ToBranchID`, `SalesUser`, `AssignedPM`, `StatusID`, `isLock`, `DateUpdate` | line 14472 |
| `IV_InternalTransferRequestDetailTbl` | `UserAutoID`, `DocumentID`, `ItemID`, `RequestedQty`, `PMApprovedQty` | line 15056 |

Credential values/stamps, free-text notes/reasons, recipient lists and other raw fields
are absent from state-token inputs. Details are copied, bounded to 1,000, sorted by
exact detail ID and exposed read-only; ambiguous case aliases, cross-document rows,
invalid identifiers and nonrepresentable `decimal(28,4)` values deny construction.
Token framing preserves null/empty distinctions and culture-independent numeric values.
SQL datetime ticks are preserved without inventing a timezone. Tenant/company scope
is included. This only compares the selected technical state, not every ERP field.

`pmr-state-v1` is **state equality**, not a monotonic version, ABA detection or stale-UI proof.
Changes restored to the same selected state restore the token. Unselected-field changes
may also remain invisible. The existing request has no client expected-token field.
Those limits are tested and block runtime gateway qualification.

`pmr-submission-v1` binds stable actor/scope, exact action policy/source fingerprint,
document, idempotency key and submitted reason. It excludes observed state and volatile
`AuthorityVersion`. Shared execution fingerprint v1 remains untouched and continues
to bind the original authority/concurrency observation. No durable receipt storage,
replay lookup or successful idempotency behavior is implemented by this hash.

## SQL resource and execution boundary

`SqlPmReturnAuthorityReader` requires an existing live caller-owned `SqlTransaction`
at `SERIALIZABLE`, uses its connection, and never opens/commits/rolls back/disposes
either caller resource. Only its own commands/readers are disposed. Request and
complete bounded detail reads use `UPDLOCK,HOLDLOCK`; user/group/menu reads also
use explicit lock hints, while other authority reads inherit SERIALIZABLE.
The reader revalidates the private credential with the existing stamp boundary;
no credential material enters a result or new fingerprint. It returns technical
state/observation only, with generic authority-unavailable failures.

`PmReturnSqlCommandFactory` produces immutable parameter metadata and can bind it
to the same concrete caller transaction. It uses `CommandType.StoredProcedure`,
the pinned qualified procedure and explicit `varchar(30)`/`varchar(100)`/
`nvarchar(max)` types. It performs no SQL execution. A plan alone is not authorization
to dispatch, and no in-memory provider or feature flag makes it a production gateway.

The future caller must keep authority, state re-read, source procedure, post-effect,
durable journal/audit and commit in one transaction. A Web-only semaphore or
application lock does not coordinate an ordinary WinForms writer. Actual database
lock footprint, index coverage, writer behavior, timeouts/deadlocks and source
nested rollback must be tested before enabling writes. SERIALIZABLE's documented
row/range protection is a design basis, not Medcom runtime evidence:
[Microsoft isolation documentation](https://learn.microsoft.com/en-us/sql/t-sql/statements/set-transaction-isolation-level-transact-sql?view=sql-server-ver17).

## Remaining acceptance

- Durable storage/schema and stable-intent/original-execution replay contract.
  Lookup after current authorization must precede new admission for repeats after status 10->30.
- Complete concurrency policy covering WinForms and any required monotonic/ABA behavior.
- Client expected-token/API contract, action capabilities and eventual gateway registration.
- Authorized private SQL fixture tests with two connections, stale/conflicting writer,
  detail phantom/deletion, nested rollback, failure injection, atomic effect/log/journal,
  duplicate replay across revalidation/restart and uncertain commit reconciliation.
- Trusted SQL TLS, service identity, target permissions/performance and HTTPS/API acceptance.

Offline tests validate policy, immutable data, stable fingerprints and command-plan
types/null-transaction rejection. A successful live transaction binding and real locks
are explicitly untested here. Raw SQL/DLL execution and SQL schema/data changes were not performed.
