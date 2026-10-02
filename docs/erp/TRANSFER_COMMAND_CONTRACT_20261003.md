# Transfer command contract — 2026-10-03

## Verified scope

This contract reconciles the current owner ERP archive with the full SQL member recorded in
`docs/SOURCE_BASELINE.md`. It covers all 17 verified WinForms form/control action bindings and
the 28 transfer procedures extracted from the 609-procedure catalog. No SQL body, production row,
credential, or owner attachment is copied here.

The action catalog records the exact form, control, menu, entity key, source status set,
before-check procedure, command procedure, procedure SHA-256, and expected effect class. Status is authority data:
the Web request does not contain a role or source-status field.

## Admission boundary

A command is prepared only when all of these checks pass:

1. The action ID exactly matches a verified form/control binding.
2. The request or batch key and legacy actor fit the procedure `varchar(30)` / `varchar(100)`
   parameters without trimming, truncation, replacement, or code-page loss. The conservative
   portable subset is printable ASCII.
3. Tenant, company, branch, menu, capability, and assignment grants come from a database-authority
   snapshot for the same action.
4. The current database status is in the source-backed form status set.
5. A row-version token, authority version, and idempotency key are present.
6. The action has a complete typed payload contract. This first slice admits Request Send PM,
   PM Confirm, and PM Return. The other 14 catalogued bindings fail closed until their payloads
   are typed and tested.

Request Send PM requires two distinct lossless PM identifiers. PM Confirm requires a value for
every approved quantity, each represented exactly as `decimal(28,4)`, between zero and its
requested quantity, and at least one positive
line. PM Return requires a non-blank unmodified reason. Notes/reasons are bounded to 1,000 Unicode
characters by this application contract even where the legacy procedure accepts `nvarchar(max)`.

## Atomic execution contract

`ITransferAtomicGateway` is an internal implementation boundary, not an enabled API. A conforming
gateway must, in one database transaction:

- re-read tenant/company/branch/menu/capability/assignment authority;
- compare expected status and row version;
- return the prior durable receipt for a repeated idempotency key;
- execute the verified source procedure and capture its effect;
- append the durable audit record; and
- commit the effect, idempotency receipt, and audit together.

The adapter accepts a commit only when the idempotency key matches, a durable audit ID exists, and
the observed post-status agrees with the verified effect contract. Cancellation or timeout after
dispatch is `OutcomeUnknown`; it is never reported as success or safely retried without receipt
lookup.

## Remaining gates

- SQL gateway implementation, isolation behavior, and idempotency storage remain unimplemented.
- The 14 remaining payload contracts and their per-action parameter/effect validation remain open.
- API/Program wiring, public contracts, schema, credentials, and production database changes are
  intentionally outside B01 and remain disabled.
- Private synthetic SQL execution and real target-host transaction/concurrency acceptance are
  **UNKNOWN** until those environments are run and recorded separately.
