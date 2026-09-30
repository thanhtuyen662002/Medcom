# Declaration count correction checkpoint

Source: authoritative `Medcom-Data.sql` from baseline SHA-256 `2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c`.

A full streaming UTF-16LE scan produces the following normalized counts:

| Kind | declarations | distinct schema+name identities |
|---|---:|---:|
| tables | 583 | 583 |
| views | 216 | 203 |
| procedures | 633 | 587 |
| functions | 113 | 109 |
| triggers | 6 | 3 |

The procedure identities are 586 in `dbo` plus `zuser.SY_SystemServiceCheckStp`.

This checkpoint supersedes the earlier procedure values 652/603 and trigger declaration value 5 in `DECLARATION_NORMALIZATION.md`; those earlier values came from a narrower scanner. Consumers must use this checkpoint for Phase 1 coverage until the older file can be corrected safely.

Repeated definitions in a dump do not prove which version is deployed. Active-version semantics remain UNKNOWN pending live catalog/C# verification.
