# PM Return workflow (unregistered)

I10 composes the existing I06 authority/preparation/SqlClient command boundary with
the exact I09 journal probe/SQL/codec and a new **unapplied** Web SQL audit artifact.
It adds no endpoint, DI registration, readiness flag, configuration setting, schema
bootstrap, real SQL execution, FE change or deployment. Goal #45 remains open.

## Custody and transactions

`SqlPmReturnWorkflow.ExecuteAsync` owns two NEW dedicated connections and SERIALIZABLE
transactions. It rejects ambient transactions, open borrowed connections and mismatched
transaction resources. `IPmReturnWorkflowAuthority` is a trusted server dependency;
the production constructor fixes the SQL boundary to I06/SqlClient and requires a
caller-provided live-session resolver. Origin labels and supplied identities are not
HTTP authorization. The alternative dependency constructor supports recording tests;
no recording implementation is registered or selected by application configuration.

In the first transaction, the workflow resolves the current session, reads current
SQL account/stamp/menu/run+update/branch authority and head/details, validates both
schema markers, then examines the journal. An absent journal also requires absent
audit. It performs fresh I06 admission, inserts/re-reads the I09 InProgress row and
checks live session/SQL authority again. Only reservation commit ACK gives this same
invocation private in-memory custody. ACK loss/cancellation yields OutcomeUnknown
and never enters execution. There is no public custody input, restart/resume, timeout
takeover, delete, retry loop or replacement key.

The second transaction revalidates session/SQL authority, markers and the full
reservation correlation/AttemptId under locks. It requires absent audit and fresh
I06 preparation with the same submitted intent and selected state-equality token
as the first phase. It rechecks the session before dispatch, executes the existing
source command, checks transaction integrity and source-defined post-effect/log,
appends/readbacks audit and transitions journal state 2 to 1 with a typed CAS.
CAS matches binding/slot/attempt/tenant/company/actor/action/key/document/submission/
source and must affect exactly one row. Both persisted rows are re-read with strict
validation, and session/SQL authority is revalidated before committing. Only commit
ACK returns the original Committed receipt. Audit time is SQL SYSUTCDATETIME at
insertion, not a claim about the exact commit instant.

Lock order is current authority/head/details, journal marker, audit marker, journal
slot, audit slot, then source log range. Revalidation reacquires already-held
authority locks. Standalone I09 reads/reserves retain their exact resource ownership,
error/ACK and codec behavior; only its probe/lookup visibility becomes internal for
the borrowed transaction seam. They are never called to own an inner effect transaction.

The source procedure has nested transactions. Immediately after its return, the
workflow requires the same live transaction, `@@TRANCOUNT=1` and `XACT_STATE()=1`.
If the procedure invalidates/rolls back the outer transaction, no replacement or
autocommit audit/journal write occurs. A confirmed rollback leaves the previously
committed InProgress reservation; ambiguous commit/rollback yields OutcomeUnknown.
Neither result authorizes another dispatch. Retained states 2/3/4 remain Blocked.

## Source and log evidence

Authority/command signatures are verified in
`SqlPmReturnAuthorityReader.ReadAsync(SqlTransaction, AuthoritativeIdentity, string, CancellationToken)`
and `PmReturnSqlCommandPlan.CreateCommand(SqlTransaction)`; neither owns caller resources.
The command is `dbo.IV_InternalTransfer_RequestPMReturnStp`, source fingerprint
`a7225b1ed64667ca16b8edeb7216009d9b1d9ad4d8bd85c289eb8db7e802fb49`, with
`@DocumentID varchar(30)`, `@User varchar(100)` (admitted actor <=50 ASCII), and
`@Reason nvarchar(max)` (validated reason <=1000 UTF-16 units).

Source evidence is the checksum-pinned complete SQL member described by
`inventories/source/20261002/source-set.json` and the I08 finite fixture closure
`inventories/source/20261005/pm-return-fixture-closure.json`. The same full source
was rechecked for size/hash before I10 metadata inspection. Procedure/log/table
locations remain the source line references in `PM_RETURN_OFFLINE_CONTRACT.md`.
Only sanitized metadata was retained; no private body or transaction rows are added.

Source status transitions from 10 to 30; the command calls
`IV_InternalTransfer_RequestLogStp` with the reason as Notes. Log `UserAutoID` is a
generated row GUID, not the actor. Actor is `UserName` (source trimming/truncation
is bounded by the stricter lossless actor admission). Log proof counts the exact
document/actor/status30/reason correlation before and after command execution,
requires a delta of exactly one, and re-reads the unique head with poststatus30.
Typed binary/length comparisons prevent collation/padding aliases in this proof.
Raw reason stays only in transient command parameters and the source-owned log;
it is absent from Web audit, receipt, diagnostics and submission metadata.
These queries and pins do not establish that a live database has matching source
modules, schema, constraints or writer behavior: actual runtime source qualification
remains mandatory before activation.

## Web audit and replay

`schemas/backend/pm-return-audit-v1.sql` has no marker seed or ERP DDL. Its exact
UTF-8/LF artifact pin is
`06e27844cddf2080b37351cf312f9f9481d8e010334260feed8e992c3a908dc9`.
Marker version1/configured binding/hash, column types/widths/nullability/collation/
datetime scale, unique indexes, enabled/trusted check definitions, absent foreign
keys/enabled triggers/defaults, writable state/full durability and transaction
shape must pass. This is separate from source-definition fingerprints.

The full I09 length-framed Slot encodes tenant/company/actor/action/idempotency;
PK(binding,Slot) uses at most 16+871=887 bytes. Separate unique nonclustered indexes
bind attempt and audit ID to the database binding. Audit stores document/submission/
source/original execution fingerprint, before10/after30 and timestamp. Audit ID is
generated internally, persisted/read-verified and exposed only through the committed
receipt. P01 file audit is neither used nor presented as SQL atomic audit.

SQL-equal journal/audit candidates reach full-byte validation; no pre-codec slot
length filter is used. Malformed, zero-extended, duplicate, orphan, wrong-bound or
missing audit rows fail closed. Replay first revalidates current session/SQL authority,
validates the original I07 receipt, then requires its actual audit row to match full
slot/binding/AttemptId/audit/document/submission/source/execution/status correlation.
It returns that original receipt/fingerprint without ERP execution or a second audit;
authority refresh and changed historical status do not rewrite it.

## Acceptance boundaries

Recording tests execute the production orchestrator and real command plans/probes/
codecs with transactional snapshots and injected failures, including competing
invocations and ambiguous ACK. Their I06/legacy boundary is explicitly synthetic.
They do not execute the private SqlClient adapter or prove real SQL locking,
uniqueness, nested rollback, module results, crash recovery or qualified durability.

Separately authorized real-engine acceptance must cover source/version/schema
binding, exact procedure/poststate/log behavior, atomic effect+legacy log+Web audit+
journal, rollback/crash/lost ACK, concurrency/locking/deadlocks, target restore/binding,
WinForms writer compatibility, TLS and business acceptance. No missing-procedure
export prerequisite is introduced: the definitions already exist in the approved source.

`StateEqualityToken` is selected-state equality, not monotonic versioning or ABA
protection. The request has no client expected version. Stale UI/ABA business-contract
decisions remain unresolved; this implementation grants no production activation.
