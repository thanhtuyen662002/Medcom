# Historical ERP error evidence

## Scope and safety
Source: authoritative `ERP_Medcom2026(4).zip`, SHA-256 `801cccb871fedce049ec3c446aeff819d7661ec94641a891d6013d4b86a0bd52`, `Histories/Error*.txt`.

This document records sanitized technical failure classes only. Customer/person values, transaction rows, credentials, license material, connection secrets and sensitive payloads are intentionally omitted.

## Verified failure classes

| Stable ID | Evidence | Sanitized observation | Web migration contract |
|---|---|---|---|
| ERP-ERR-OBJECT-RESOLUTION | VERIFIED | Historical log records an invalid-object failure. | Deployment/schema compatibility must be gated; missing server objects fail closed rather than degrading silently. |
| ERP-ERR-TRUNCATION | VERIFIED | Historical log records string/binary truncation. | API must expose field length constraints and return field-level validation; DB truncation is not normal control flow. |
| ERP-ERR-REFERENTIAL-INTEGRITY | VERIFIED | Historical logs record INSERT/DELETE failures caused by FK/reference constraints, including purchase/request and configuration/master relationships. | Server remains authoritative for referential integrity; destructive UI actions require dependency-aware preflight where practical and must handle authoritative rejection. |
| ERP-ERR-CONCURRENT-DELETE | VERIFIED | `Error20260513.txt` and another historical log record `DeleteCommand affected 0 of the expected 1 records` concurrency violations. | Update/delete commands need explicit conflict UX. Never silently overwrite/recreate after a zero-row optimistic conflict. Preserve user intent and authoritative-reread before resolution. |
| ERP-ERR-DUPLICATE-KEY | VERIFIED | Historical logs record unique-index and primary-key duplicate failures. | Create/import/retry paths require idempotency or duplicate-aware reconciliation; generated IDs do not by themselves prove replay safety. |
| ERP-ERR-DATETIME-CONVERSION | VERIFIED | Historical logs record date/time conversion failures and a typed-column cast mismatch. | Web/API contracts use typed date/time values and locale-independent serialization; no presentation-string round trip into DB commands. |
| ERP-ERR-NETWORK-WRITE | VERIFIED | `Error20260527.txt`, `Error20260528.txt` and `Error20260605.txt` record DBNETLIB connection-write failures. | A lost acknowledgement after mutation is outcome-unknown, not proof of failure. Reconcile authoritative state before retry unless command idempotency is VERIFIED. |
| ERP-ERR-SCHEMA-DRIFT | VERIFIED | Historical logs record invalid-column failures on multiple dates. | API/result contracts must be versioned/validated. Missing expected fields fail closed and become observable compatibility faults. |
| ERP-ERR-TRIGGER-ABORT | VERIFIED | `Error20260916.txt` records transaction termination inside a trigger. | Trigger/business-rule rejection is authoritative semantics until an evidence-backed replacement exists. Command facade must preserve atomicity and surface a safe business/error outcome. |

## Functional implications

1. **Concurrency is a proven ERP concern, not a theoretical Web requirement.** The package contains direct optimistic-delete conflict evidence.
2. **Ambiguous mutation outcomes are proven operationally relevant.** Network-write failure means the client cannot infer whether the server committed from transport status alone.
3. **Schema/result drift has occurred historically.** Web migration needs compatibility checks between Windows coexistence, API contracts and DB schema.
4. **Database constraints and triggers are part of observed behavior.** A Web rewrite must not bypass them with generic browser CRUD.
5. **Typed validation belongs before persistence.** Historical truncation/date/cast failures justify explicit API metadata and field-level validation.

## UNKNOWN / C# verification register

The package logs do **not** prove the following and they remain UNKNOWN:

- exact form/action/user workflow that produced each historical error unless separately bound by another authoritative artifact;
- whether every observed DB rejection was shown to users, swallowed, retried or logged only;
- exact optimistic-concurrency predicate/token used by each affected adapter;
- whether failed network writes committed server-side in the recorded incidents;
- caller transaction boundaries around trigger-aborted commands;
- retry policy, if any, implemented in C#;
- which invalid-column events were caused by deployment skew versus dynamic SQL/result-set shape changes.

These items must be bound during the incoming C# verification round rather than guessed from stack traces.
