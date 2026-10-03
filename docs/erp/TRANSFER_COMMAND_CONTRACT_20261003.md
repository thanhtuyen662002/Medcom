# Transfer command contract — 2026-10-03

## Verified scope

This contract reconciles the current owner ERP archive with the full SQL member recorded in
`docs/SOURCE_BASELINE.md`. It covers all 17 verified WinForms form/control action bindings and
the 28 transfer procedures extracted from the 609-procedure catalog. No SQL body, production row,
credential, or owner attachment is copied here.

The action catalog records the exact form, control, menu, entity key, source status set,
before-check procedure, command procedure, procedure SHA-256, and expected effect class. Status is authority data:
the Web request does not contain a role or source-status field.
The catalog exposes its action list through a read-only collection and source/post-effect status
policies through immutable frozen sets; callers cannot cast the read-only interfaces back to
mutable collections and replace actions or widen admission/receipt acceptance for the lifetime of
the process.

## Admission boundary

A command is prepared only when all of these checks pass:

1. The action ID exactly matches a verified form/control binding.
2. The request or batch key and legacy actor fit the procedure `varchar(30)` / `varchar(100)`
   parameters without trimming, truncation, replacement, or code-page loss. The conservative
   portable subset is printable ASCII.
3. Tenant, company, branch, menu, capability, and assignment grants come from a database-authority
   snapshot for the same action and exact document key. The trusted snapshot now carries its
   own required `DocumentKey`; missing, differently cased, or mismatched keys fail as
   `untrusted_snapshot` before preparation. Scope identifiers must be bounded, unmodified,
   well-formed NFC Unicode without control or format characters; row/authority versions must be
   bounded printable-ASCII tokens.
4. The current database status is in the source-backed form status set.
5. A row-version token, authority version, and idempotency key are present.
6. The action has a complete typed payload contract. This first slice admits Request Send PM,
   PM Confirm, and PM Return. The other 14 catalogued bindings fail closed until their payloads
   are typed and tested.

Request Send PM requires two distinct lossless PM identifiers. PM Confirm binds every approved
quantity to the source `IV_InternalTransferRequestDetailTbl.UserAutoID` (`nvarchar(50)`). Detail
identifiers must be non-blank, unmodified, well-formed NFC Unicode without control or format
characters, and unique under a conservative case-insensitive comparison. Unicode category checks
operate on complete scalar values, so supplementary format characters (language/tag markers) are
rejected while visible supplementary text remains eligible. Each quantity is
represented exactly as `decimal(28,4)`, between zero and its
re-read requested quantity, with at least one positive line. Redundant decimal trailing zeros do not
change representability or the fingerprint: `1.00000` is exactly representable, while `1.00001` is
rejected. Admission compares rounded and original values for equality without changing or rounding
the accepted payload. PM Return requires a non-blank
unmodified reason. Notes/reasons are bounded to 1,000 Unicode
characters by this application contract even where the legacy procedure accepts `nvarchar(max)`.
Embedded NUL and ill-formed surrogate sequences fail closed rather than crossing JSON/SQL/log
boundaries with replacement or truncation ambiguity.
The admitted approval collection is copied before the prepared command is returned, so later caller
mutation cannot replace validated detail identities or quantities. The untrusted collection
count is read once, checked within 1–1,000 before allocation, and must exactly match its bounded
enumeration. Shorter, longer, or changing collections fail closed. PM identities also compare
case-insensitively to avoid assigning the same legacy account twice through casing aliases.
If a supplied approval collection cannot be enumerated into that snapshot, admission returns
`invalid_payload` instead of exposing a collection/runtime exception.

## Atomic execution contract

`ITransferAtomicGateway` is an internal implementation boundary, not an enabled API. A conforming
gateway must, in one database transaction:

- re-read tenant/company/branch/menu/capability/assignment authority;
- compare expected status and row version, re-read the identified detail set and requested quantities;
- atomically persist the admitted `PMApprovedQty` values before invoking PM confirmation;
- return the prior durable receipt for a repeated idempotency key;
- execute the verified source procedure and capture its effect;
- append the durable audit record; and
- commit the effect, idempotency receipt, and audit together.

The adapter accepts a terminal receipt only when its action ID, document key and idempotency key all
match the prepared command, its versioned SHA-256 fingerprint matches, and a bounded printable-ASCII
durable audit ID exists. The fingerprint binds the complete verified action contract (form/control/menu,
entity, procedure name and SHA-256, before-check, source/effect statuses and atomic-log policy), trusted
scope/concurrency evidence, actor, payload and idempotency key. This prevents a durable receipt from an
older/different catalog policy being accepted for a newly mapped command. The adapter also rejects a
missing gateway dependency at construction. Together these checks prevent
control-character/log injection and unbounded technical identifiers from crossing the gateway
boundary. Confirm-line fields are hashed in stable detail-ID order, so replaying the same approved
detail set with a different enumeration order resolves to the same idempotency fingerprint. A commit must not carry a rejection code
and additionally requires an observed post-status agreeing with the verified effect contract.
Conflict/rejected receipts require a bounded lossless technical rejection code. Cancellation or
timeout after dispatch is `OutcomeUnknown`; it is never reported as success or safely retried without
receipt lookup. Missing request/snapshot inputs fail closed at admission rather than escaping as an
unclassified null-reference failure.

## Remaining gates

- Lead must align the database-authority producer with the required document binding; no
  client field or default document key can substitute for the server read. The command
  fingerprint remains v1 because the validated request key was already hashed; its known-answer
  digest is unchanged.
- SQL gateway implementation, isolation behavior, and idempotency storage remain unimplemented.
- The 14 remaining payload contracts and their per-action parameter/effect validation remain open.
- API/Program wiring, public contracts, schema, credentials, and production database changes are
  intentionally outside B01 and remain disabled.
- Private synthetic SQL execution and real target-host transaction/concurrency acceptance are
  **UNKNOWN** until those environments are run and recorded separately.
