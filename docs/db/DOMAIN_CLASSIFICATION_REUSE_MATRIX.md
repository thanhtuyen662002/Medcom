# Domain classification and Web reuse matrix

Evidence basis: authoritative object names plus verified configuration/locking/trigger artifacts. Prefix counts are VERIFIED; semantic classification is INFERRED where names/dependencies cannot prove runtime meaning.

| Namespace | Tables | Primary class | Web disposition |
|---|---:|---|---|
| AR | 100 | transaction/reporting | compatibility facade for writes; read facade for proven reports |
| AP | 20 | transaction/master | compatibility facade for transactions; reuse stable masters |
| IV | 52 | transaction/master/audit | compatibility facade; preserve transfer/return locking/workflow |
| GJ | 54 | transaction/reporting | compatibility facade; preserve accounting invariants |
| CS | 19 | transaction | compatibility facade |
| PC | 18 | transaction/reporting | compatibility facade |
| FA | 23 | master/transaction/audit | compatibility facade; preserve trigger lifecycle side effects |
| CF | 65 | master/config/integration | reuse stable masters; server facade for executable metadata |
| SY | 79 | config/security/audit/integration | reconcile existing config first; additive Web config only for proven gaps |
| HR | 28 | master/transaction | compatibility facade pending caller/permission mapping |
| EQ | 12 | master/transaction | compatibility facade pending workflow mapping |
| EI | 5 | integration | server integration facade; never browser authority |
| ZZ | 35 | repair/history | retire/replace candidate unless active dependency proves otherwise |
| Temp/Temp2/Temp3 | 9 | repair/staging | retire/replace candidate; never auto-expose |
| Other prefixes | 64 | mixed/UNKNOWN | classify by dependencies/callers before migration |

Complete verified prefix distribution: AR 100, SY 79, CF 65, GJ 54, IV 52, ZZ 35, HR 28, FA 23, AP 20, CS 19, PC 18, EQ 12, WA 10, KD 9, AG 8, SL 8, OF 6, PL 6, EI 5, CC 4, EP 4, AD 3, Temp 3, Temp2 3, Temp3 3, IS 2, EL 2, and two unprefixed names.

## Cross-cutting rules

Master tables may be reused as-is only when key, authorization and write contracts are verified. Transaction tables default to compatibility facade; browser-driven multi-table CRUD is prohibited where procedures/triggers/locks carry invariants. Existing SY metadata is the first configuration source; new Web tables are additive only for proven gaps. Integration/query/action metadata is resolved and allow-listed server-side. Views/report procedures remain compatibility surfaces. Server authorization is authoritative; hidden UI/configuration never grants access.

## Reuse vocabulary

1. reuse as-is — proven stable master/read contract.
2. compatibility facade — default for transactional, executable-config, integration and side-effecting contracts.
3. controlled schema change — only for a proven integrity/performance gap.
4. additive Web configuration — only after reconciliation proves existing SY metadata insufficient.
5. retire/replace — repair/backup/temp artifacts after dependency review proves no active contract.

Runtime usage that static SQL cannot prove remains UNKNOWN for C# verification; dump-extractable structure is not relabeled UNKNOWN.
