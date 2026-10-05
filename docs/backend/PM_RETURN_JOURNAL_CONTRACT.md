# PM Return journal and replay decision contract - I07

Goal #45; admission `docs/execution/direct-runs/I07.json`, run
`d821ac64-2845-479b-81e8-51f60944ea66`, base
`978c1d2c447c7229759ab4fb393ef8fb2e23eb18`. This leaf provides pure server-side
observation validation and receipt selection. It defines no storage, SQL schema,
gateway, HTTP endpoint, DI registration, capability or production acceptance.

## Source and ownership

The action is exactly `IV_InternalTransferPMFrm:ExecSQLWithParaButtonCtl_1`,
menu `07010110`, form `IV_InternalTransferPMFrm`; the source command changes
status 10 to 30. `PmReturnPreparation` and the shared catalog remain unchanged.
I06's source binding and conservative Web authority policy are documented in
`PM_RETURN_OFFLINE_CONTRACT.md`. The local SQL member has 1,212,595,716 bytes and
SHA-256 `61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`.
The command `IV_InternalTransfer_RequestPMReturnStp`, SQL line 858559, has
definition SHA-256 `a7225b1ed64667ca16b8edeb7216009d9b1d9ad4d8bd85c289eb8db7e802fb49`.
These are static source facts, not observed runtime effects.

The source procedure owns a nested transaction and rollback path. The legacy
`IV_InternalTransfer_RequestLogStp` at line 858404 does not return a durable audit
identity; the log table at line 28877 is not a Web idempotency journal. No new
identity, DDL or atomicity guarantee is inferred. P01's `FileAuditJournal` and
B01's shared execution fingerprint/adapter remain untouched. A filesystem journal
does not prove atomic commitment of ERP effect, log and receipt.

## Stable key, intent and original receipt

`PmReturnJournalKey` comprises configured database binding GUID, tenant, company,
canonical actor, fixed action and idempotency key. The binding must be an opaque,
nonempty operator-configured identity resolved by the trusted server. It must not
come from an HTTP request, hash of a connection string, password, credential stamp
or other secret. This leaf does not configure or authenticate the binding.
Tenant/company are validated exact NFC identifiers <=100; actor is lossless
printable ASCII <=50, respecting the actual legacy log width. The key is exact
printable ASCII 16..100 and uses ordinal equality; values are not trimmed or folded.
The future storage owner must preserve equivalent exact comparison semantics.

Document and submitted payload do not participate in lookup-key partitioning:
changing them under the same key must conflict rather than create another slot.
`PmReturnSubmittedIntent.TryCreate` validates the I06 action, document (ASCII <=30),
key and unchanged exact Unicode reason boundary, then uses `pmr-submission-v1`.
It retains no reason or credential. This stable submission identity includes the
source policy fingerprint and excludes status, technical state and volatile
`AuthorityVersion`. Shared v1 execution fingerprint is never recomputed for replay.

A committed record and its receipt envelope repeat key, document, stable submission,
source SHA-256, original execution SHA-256 and audit identifier. Each SHA-256 is
exactly 64 lowercase hexadecimal characters; audit identity is lossless ASCII
1..100. The original shared `TransferGatewayReceipt` must match action, document,
key, original execution fingerprint and audit ID, say `Committed`, have no rejection,
and report the catalog's PM Return post-status 30. A validly shaped changed document,
submission or source binding conflicts. Broken correlation is invalid observation.
Hashes, an audit-shaped string and an origin label alone do not prove a real commit.

## Current result authorization

`PmReturnReplayAuthority.TryCapture` snapshots current server identity, immutable
technical head and database-origin evidence for the same tenant/company/actor/document.
It copies and bounds each session/current branch list to 200 lossless ASCII keys.
Enumeration failures deny capture and later caller mutations cannot expand the grant.
It stores neither credential/stamp nor old/current authority version; it retains
only whether a nonblank stamp and positive current version were supplied.

Before examining observation state, policy requires current enabled account,
credential match, enabled exact menu/form, run and update grants, matching configured
database binding and exact tenant/company/actor/document. Every current head
branch/from/to must be in both frozen session and freshly read current branch scopes.
Revoked or cross-scope callers receive `Denied`, with no receipt, for every state
including missing or corrupt observations.

Current result visibility intentionally does not require the old status 10,
assignment, unlocked head, old state equality token or old authority version.
For example a verified original status-30 receipt can be selected after revalidation
advances the authority version; fresh dispatch admission would reject status 30.
Later status/assignment/lock changes do not alter that historical receipt. Current
document scope and grants must still pass. No new session capability is issued.

These types are server inputs, not API DTOs or cryptographic attestations. The
future producer must revalidate the live session/credentials/grants and read the
correct bound database and current head before use. No public constructor or
`DatabaseAuthority` enum value establishes freshness or trust on its own. Lookup
must precede fresh dispatch admission for an authorized retry, so status 10->30
does not cause execution again or destroy the original execution correlation.

## Decisions

After current authorization, observation origin, exact key and defined state are
validated before the following decisions. Null observation is never explicit absence.

| Observation | Decision | Receipt | Dispatch |
| --- | --- | --- | --- |
| Explicit `Absent`, no record | `NeedsFreshAdmission` | None | Never permitted by this policy |
| `Absent` with a record | `InvalidObservation` | None | Blocked |
| `Committed`, complete matching original envelope | `ReplayOriginalReceipt` | Same original shared receipt object | Blocked |
| `Committed`, valid correlation but changed intent/source policy | `Conflict` | None | Blocked |
| `Committed`, missing/malformed/mismatched record or receipt | `InvalidObservation` | None | Blocked |
| `InProgress`, `OutcomeUnknown`, `Tombstone`, `Unavailable` | `Blocked` | None | Blocked |
| Missing, client-origin, unknown state or wrong key | `InvalidObservation` | None | Blocked |

All decisions have `PermitsDispatch == false`. Even explicit absence merely asks
the future executor to perform fresh I06 admission and an atomic reservation.
It is not a reservation, authorization token or command. An unresolved state stays
blocked even if it carries a committed-looking record; neither timeout nor current
status 30 is proof of absence, ownership or the original successful submission.

## Remaining storage and runtime gates

The future storage/executor owner must establish unique stable-key reservation,
exact collation, complete immutable receipt serialization/versioning, durable
atomic effect/log/journal commit, restart recovery and uncertain-commit reconciliation.
Retained unresolved/tombstone keys must not be purged or reused as absent. A lookup
observation can become stale; this pure policy is not a concurrency fence and must
never drive dispatch outside an atomic transaction/reservation protocol. The current
shared adapter checks a newly prepared fingerprint; feeding replay through that
path would be incorrect and is not implemented here.

Real source nested rollback, two-connection locks/phantoms/deadlocks, ordinary
WinForms writers, failure injection and duplicate/restart/revalidation behavior
need authorized SQL fixture evidence. `pmr-state-v1` remains equality only, with
no monotonic/ABA or stale-UI guarantee. Live trigger behavior, complete original
WinForms hooks, target binding, permission parity and target SQL TLS remain UNKNOWN.
No TLS bypass, SQL execution, raw source publication, migration or deployment is
part of this leaf. Trusted HTTPS/auth and frontend integration remain separate gates.
