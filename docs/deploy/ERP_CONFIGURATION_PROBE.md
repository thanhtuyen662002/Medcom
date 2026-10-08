# I56 — read live ERP configuration mappings

Base: `1b1ec44554cff6886ae02015baec07c650592bfc`.
Admission: PR #108, control `8bbf44c6936ae17b1bc49376265ef0e6451c597c`, tree `4a149249953415ed43291b6ef193f36437a6b757`.

## Purpose and invocation

This one-shot mode reads selected live form, button, action and dropdown configuration. It is not another connectivity-only check and does not enable a business command.

After review, exact-head CI, deployment and authorization for the target read, invoke the deployed API assembly with exactly one area:

```
dotnet Medcom.Api.dll --probe-erp-configuration purchase
dotnet Medcom.Api.dll --probe-erp-configuration inbound
```

Use the existing deployment environment connection configuration. Do not put credentials on the command line. No new connection, SSH access, private configuration file, account, certificate exception or API endpoint is needed. This mode runs before host construction, does not load private files, and cannot be combined with host arguments. I55's existing `--probe-database` contract remains unchanged.

The same server connection/TLS policy is used without changing its settings. SQL-password authentication is required; an existing explicitly scoped development TLS exception is respected but never enabled here. Connection time is bounded at ten seconds, SQL commands at five seconds, the overall read at 45 seconds; pooling and provider retries are disabled. Cleanup must succeed before reporting observations.

## Fixed source-backed selection

Only these existing configuration tables are selected:

| Group | Object | Fixed selector |
|---|---|---|
| menu | dbo.SY_Menu | MenuID |
| form | dbo.SY_FrmLstTbl | FormID |
| configuration | dbo.SY_FrmCfg | FID |
| dropdowns | dbo.SY_FrmDrdwTbl | FormID |
| buttons | dbo.SY_FrmOptBtnTbl | FormID |
| master_actions | dbo.SY_FrmMstActTbl | FormID |
| grid_actions | dbo.SY_FrmGrdActTbl | FormID |

Purchase selects menu `05011` and form `AP_PurposeRequestListFrm`; inbound selects menu `07011` and form `IV_InboundRequestFrm`. These are verified historical DB bindings, not CLR class-name guesses. Exact binary Unicode matching prevents case/padding aliases from broadening selection. If the live menu points to a different form, that group reports `binding_mismatch`. No runtime name is substituted into a SQL identifier, no broad wildcard scan occurs and no inherited or related form is followed automatically.

Before each data projection, a fixed metadata SELECT requires an actual user table and the source-backed selected column names, types, lengths, nullability and nonidentity/noncomputed shape. Missing, incompatible or invisible metadata makes that group unavailable. Extra unselected columns are not interpreted. Read methods reject malformed column names/counts, extra result sets and incompatible projected values. A failed shape check attempts a second fixed, selected-column-only metadata query: its bounded `shapeMismatches` names the affected columns and observed built-in type, length, nullability, identity/computed and custom-type flags. Custom alias names are suppressed. Missing metadata remains unavailable; no data SELECT is attempted for that group.

Source evidence:
- `inventories/source/20261002/table-07.json`: SY_Menu, source line 22558.
- `inventories/source/20261002/table-16.json`: SY_FrmCfg (30728), SY_FrmDrdwTbl (30774), SY_FrmGrdActTbl (30896).
- `inventories/source/20261002/table-17.json`: SY_FrmLstTbl (30923), SY_FrmMstActTbl (30958), SY_FrmOptBtnTbl (30987).
- `docs/execution/checkpoints/I14_PURCHASE_REQUEST_COMMANDS.md`: purchase menu/form and T0/T1 bindings; `I15_INBOUND_REQUEST_COMMANDS.md`: inbound form/menu.
- `docs/erp/PURCHASE_LOOKUP_BINDING_EVIDENCE.json`: two directly source-verified dropdown body fingerprints. Exact matching fingerprints can identify the known purposes or currency source table; unfamiliar bodies remain unresolved.

The source catalog's unusual `FID`, `MaterAction` and `Oderby` spellings are not corrected by guesswork. The new ERP archive's CLR class names do not prove live FormID values. Historical schema expectations are checked against the live target rather than declared current merely from the archive.

## Privacy and bounded output

Output is one JSON object containing closed report fields and seven named groups. Technical slots such as FormID, ColumnID, ValueColumn, DisplayColumn, Action, TableName and PrimaryKey use a bounded closed ASCII identifier alphabet. Invalid values are suppressed and make the projection invalid. Nullable booleans preserve null rather than inventing defaults. Captions, business records, accounts, user/group grants, customer records and transaction rows are not selected.

Free-form Source, Para, Filter, KeyValue, SubValue, default expressions and similar fields are never returned raw. The SQL projection returns only byte length and SHA-256. Bodies larger than 65,536 bytes are marked oversized without a fingerprint. Fingerprints describe bytes, not SQL semantics, and are never evaluated as SQL. For `Source` only, a strict unquoted two-part ASCII `schema.object` identifier may be resolved by exact binary joins to `sys.schemas` and `sys.objects`. Each component must be nonempty, at most 128 characters and begin with a letter or underscore. Whitespace, brackets, quotes, empty parts, temp names, extra database/server parts and expressions are excluded before parsing. Only table, view, procedure and function object types are admitted; synonyms and other object kinds remain unresolved. Output is the canonical catalog schema/name/type, labelled `resolved_identifier`, never a claim that a call executed. Other values are explicitly `unresolved`. No source-defined query, procedure, expression, action or callback executes.

Each group uses a 129th-row sentinel for a 128-row output cap. A sentinel yields `truncated` with no arbitrary subset. Missing groups, duplicate primary menu/form rows, scope mismatch, malformed results, invalid identifiers and read failures are explicit. Total JSON is capped at two million UTF-8 bytes. Errors, connection information, provider messages and sensitive exception data are never printed. A broken output sink is not retried.

## Interpretation and next step

`projectionValid` means only that a returned technical projection passed its closed shape rules. It is not mapping completeness or action authorization. `mappingComplete`, `inheritanceResolved` and `runtimeAccepted` remain false. Successful projection reads return `observed_unresolved`, because inheritance, arbitrary expressions and full workflow semantics remain unresolved. Reads are separate point-in-time observations, not a transactionally consistent graph.

Exit codes: 0 = all fixed groups observed with valid projections; 2 = invalid arguments or unsupported authentication input; 3 = unavailable/partial/truncated/malformed observations or timeout/cleanup/output-size failure; 4 = output sink failure. Missing optional action groups are reported conservatively as partial rather than silently treated as an absent function.

The practical follow-up is to compare the observed form/table keys, button actions and dropdown fields to current Web behavior. Unrecognized hashes require further explicitly scoped interpretation, not executing stored SQL. These observations do not establish native rights, transaction locking, commit/ACK durability, numbering or business-write acceptance. Existing purchase Save/Submit activation and an actual Test Web write pilot remain separately authorized and qualified.

## Preparation verification

The implementation and synthetic tests make no live database call. The pinned .NET 10.0.401 SDK was acquired from the official Microsoft release URL and its official SHA-512 verified before execution. Locked eight-project restore and Release analyzer build passed with zero warnings/errors. The initial focused I56 plus unchanged I55 probe suite passed 59/59. The source-reference revision then passed 73/73 with no failures or skips. Final diagnostic-revision validation is recorded in the handoff. Architecture, 35 execution-control tests and 40 traceability tests passed. All 153 existing backend/project input blobs match the pinned source except the admitted Program change. An initial full non-LegacyRuntime run passed 2,609 tests and failed seven: two missing local QR fixture materializations (subsequently restored from the exact public base) and five synthetic ServerConfigurationTests path-policy failures. These are disclosed, not called inherited or a full pass without an exact unchanged control. Final full-suite and independent-review receipts are supplied separately in the root handoff; hosted current-head/base checks remain required. No schema, command factory, ApiHost defaults, authentication/session behavior, frontend, dependency or workflow is changed by I56.
