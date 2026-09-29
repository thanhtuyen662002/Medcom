# SQL declaration normalization

VERIFIED against the authoritative database baseline.

Normalized DDL discovery must accept bracketed and unbracketed identifiers and deduplicate by schema plus object name.

| Kind | declarations | distinct names |
|---|---:|---:|
| tables | 583 | 583 |
| views | 216 | 203 |
| procedures | 652 | 603 |
| functions | 113 | 109 |
| triggers | 5 | 3 |

The three distinct trigger stable IDs are `DB-TRIGGER-dbo.TR_FA_MoveDetail_LifecycleSync`, `DB-TRIGGER-dbo.TR_FA_MoveTbl_LifecycleSync`, and `DB-TRIGGER-dbo.AR_Invoice_DebtDueDateGuard`.

Earlier aggregate counts came from a narrower scanner and are not distinct-object cardinalities. Architecture coverage must use normalized stable IDs. Exact trigger events and body side effects remain UNKNOWN pending the body-level pass.

Workstream remains active.
