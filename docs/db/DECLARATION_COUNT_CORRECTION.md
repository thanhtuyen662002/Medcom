# Declaration count correction checkpoint

Source: authoritative Medcom-Data.sql baseline SHA-256 2d809c2e0d4c80700a1e8946c8f09db45a5840ec6735413bd46c3bd1d1ee1e0c.

Reproducible UTF-16LE declaration scan accepts bracketed/unbracketed identifiers, optional schema, CREATE/ALTER and CREATE OR ALTER, then deduplicates case-insensitive schema.name.

| Kind | declarations | distinct identities |
|---|---:|---:|
| tables | 583 | 583 |
| views | 216 | 203 |
| procedures | 652 | 591 |
| functions | 113 | 109 |
| triggers | 5 | 3 |

Procedures: 590 dbo identities plus zuser.SY_SystemServiceCheckStp.

These values supersede 633/587 procedures and 6/3 triggers. The discrepancy is scanner grammar, not a baseline change. Repeated declarations do not prove the deployed definition; active-version semantics remain UNKNOWN pending live catalog/C# verification.
