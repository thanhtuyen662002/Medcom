# Private PM Return execution fixture - I08

This prepares source DDL for a future disposable SQL test database. It never connects
to SQL, restores data, applies a schema, runs the owner DLL, or enables an API action.
Successful extraction proves the pinned bytes and finite static closure only.

## Source and finite closure

`tools/source/prepare_pm_return_execution_fixture.py` has no source-pin override.
Its public `prepare`/CLI verifies the technical inventory by canonical JSON SHA-256,
then requires the full source member to be exactly 1,212,595,716 bytes, SHA-256
`61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`, UTF-16LE with BOM,
and 874,083 source lines. The second full hash/stat check detects changes during scanning.
Output is produced only after every selected definition/batch hash and range agrees.
The internal specification argument supports synthetic unit tests; it is not a CLI
configuration option or permission to change production pins.

`inventories/source/20261005/pm-return-fixture-closure.json` contains only technical
names, types, ranges, dependency edges and hashes. Canonical JSON (sorted keys,
ASCII escapes, compact separators, UTF-8) hashes to
`bc4dbbe83c3262a69ce330803dcf1979805bdf1e921b83f1809163ffd5cb3a88`.
Definition hashes cover exact CREATE/ALTER/index text converted to UTF-8 with universal
LF and final LF, excluding GO and preceding SSMS comments/SET batches. They are distinct
from the old masked-catalog hashes and from the full UTF-16 input-member hash.

Independent token-aware scanning closes ten explicit runtime roots over actual module
references and complete supplemental DDL, including foreign-key references on later lines.
The resulting fixture has 26 objects: 21 tables, one function and four procedures,
plus 116 supplemental batches: nine indexes, 71 defaults, 16 foreign keys,
19 check/validation statements and one other ALTER. Incoming references from unrelated
tables are not part of this outgoing closure. No unresolved required dependency remains
in this dump; deployment/runtime dependencies remain separate.

The command/check call chain is `IV_InternalTransfer_RequestPMReturnStp` ->
`IV_InternalTransfer_RequestLogStp` and `IV_InternalTransfer_RequestPMCheckBeforeUpdateStp`
-> `IV_InternalTransfer_RequestCheckBeforeUpdateStp`; the log/checks also use
`SY_String2TableFnc`. Six SY authority tables and request/head/detail/log/status tables
are accompanied by the source CF/FA master tables required by the actual foreign keys.
All 142 batch pins are recorded individually. New/missing/changed dependencies,
supplemental batches, duplicate declarations and mixed table/data batches fail closed.
Quoted GO/CREATE tokens in dump rows never become executable source definitions.

## Private output contract

Use Python 3.12+ with the existing source-tool modules beside the script:

```text
python -B tools/source/prepare_pm_return_execution_fixture.py <authorized-full-sql-member> <new-absolute-private-output-directory>
```

The caller supplies an existing protected private parent and a new leaf directory.
The tool rejects trailing dots/spaces, reserved device names (including superscript
COM/LPT variants), ADS/invalid characters before filesystem normalization. It checks
both supplied and resolved paths and every ancestor before applying repository/public
rules, so Windows aliases cannot hide a protected parent. The tool also refuses
relative/traversal/device/UNC paths, links/reparse points on the path,
hard-linked input, existing outputs, repository ancestors (including .git files),
Site markers and public/artifact directory names. POSIX writes are anchored to directory
descriptors with exclusive/no-follow creation; Windows holds checked directories with
delete sharing disabled while reading/writing. These controls do not qualify an untrusted
or concurrently hostile filesystem. Parent ACL/key custody, public exposure and operator
directory protection must be established outside this tool; none is modified here.
Alias/device restrictions follow the
[Win32 naming rules](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).

Only `pm-return-schema.sql` and `fixture-receipt.json` are created in the private leaf.
Schema output explicitly selects the pinned DDL/function/procedures and session SET
header; no original INSERT seed rows, stored module backups, unrelated source objects,
USE/GRANT scripts, database-create/drop scripts or configuration files are copied.
Source procedure DML remains part of its pinned private definition. Tables are created
before function/procedures, followed by supplemental batches in source order.
The tool does not execute that output or claim it compiles on SQL Server.

Files are exclusively created; nothing is overwritten or repaired. A late I/O failure
may leave an incomplete private leaf, with no successful return/CLI receipt. It is not
automatically deleted, recursively cleaned or reusable; the operator must inspect it
privately. Receipt/stdout contain bounded technical hashes/counts and explicit false
runtime-acceptance flags, never SQL text, rows, credentials, source paths or exception
contents. Never commit/upload/package/log the schema file or the private source member.

## Synthetic-only seed design

No source rows are needed. Construct synthetic identifiers and values explicitly from
the pinned column types, preserve all source constraints/defaults, and seed parents
before children. The 16 outgoing foreign-key edges are acyclic. No constraint disabling
or schema rewrite is proposed as a shortcut. The new Web operation journal is not in
this source fixture and requires its own reviewed schema/executor slice later.

| Seed group | Required design |
| --- | --- |
| CF/FA master tables | Synthetic branches, item/category and optional object/asset parents. Keep optional FK columns NULL when the case does not need them. Source tables remain present even if empty. |
| Request status | Explicit synthetic status rows for 10 and 30, with bounded code/name/sort and boolean flags. Do not copy production lookup rows. |
| SY_User/SY_UserGroup | Synthetic canonical ASCII actor <=50, enabled synthetic group, required names and nonblank synthetic stored-hash text for credential-stamp tests. This does not test normal-password/DLL verification. |
| SY_Menu/grants | Exact source menu/form binding; one synthetic grant row has both run and update. Group/user/delegation variants and revocation are separate cases; no admin fallback. |
| SY_UserBranch | Synthetic head/from/to branch membership, inserted after the user. Test missing/removed branches independently. |
| Request head | Synthetic ASCII document <=30, explicit date, sales actor, three existing branch IDs, assigned PM, status 10 and unlocked state. |
| Request detail | Synthetic detail/item keys, exact decimal(28,4) quantities and equipment flag. Include complete detail sets; test phantom/delete and invalid quantity constraint cases. |
| Request log | Initially empty; let the actual source command insert it. No fabricated committed audit/receipt and no original notes/recipients are seeded. |

Reasons are synthetic well-formed Unicode using the unchanged I06 boundary, including
length/newline cases. Never reuse actual notes, names, recipients, stored passwords or
rows. Required NOT NULL columns are listed in the technical inventory, excluding
generated identity STT columns in CF_ObjectGroupTbl and CF_LocationTbl; callers must
let SQL generate those identities. Defaults and
checks still need SQL execution evidence. The design is statically viable, not an
observed successful insert/compile/command result.

## Runtime remains gated

The existing optional transfer fixture prepares only three tables/eight checks; it
does not contain this complete command/authority/FK closure. This new extractor leaves
that code and its callers unchanged. P01 Audit and B01 shared Transfers are untouched.

The owner must separately select a disposable loopback SQL instance with trusted TLS,
authorize a unique test database lifecycle and provide private connection configuration.
No existing named instance is assumed disposable. No service start/install, certificate
store, TLS bypass, SQL grant, network or firewall change occurs here. The PM Return-only
SQL fixture should have a separate opt-in harness; do not silently bypass the existing
DLL-based runtime attribute or claim normal-password acceptance from synthetic stamps.

Actual module compile/result sets, nested rollback/outer ownership, unique durable
reservation, atomic effect/log/journal commit, uncertain ACK/restart/reconciliation,
two-connection locks/phantoms/deadlocks, ordinary WinForms writers and permission parity
remain untested. Stored trigger versions are not applied or declared current; live
triggers and complete original WinForms hooks are UNKNOWN. State equality remains
without monotonic/ABA/stale-UI proof. Extraction closes none of these runtime/business gates.
