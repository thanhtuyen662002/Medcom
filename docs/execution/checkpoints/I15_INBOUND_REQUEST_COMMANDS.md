# I15 fixed inbound-request commands

Refs #45 and Draft #67. Implementation candidate for independent review; production acceptance remains open. Parent is the sole publisher/integrator. The immutable ten-path admission is `docs/execution/direct-runs/I15.json`, run `9d453946-3cc9-4ab1-b0e1-40fbfe5d585c`, control/claim `3a47679f4aa5c2f57d65f75edf4ed1d0428a18d8`, control tree `4a52a480709a612129e2c946a7ae8afbd8a4c5fb`, base `f8f4b108a8441d0ada9bda9a00251a7554fcb47c`. The marker remains blob `f124572793aabf3351d5f81986e73337810e9332`.

## Delivered behavior

`SqlInboundDraftCommandService` owns fixed, parameterized SQL and each connection/transaction. Create inserts the allowlisted header with source status 0 and explicit new details, conditional on a qualified document-number allocator. Save updates the allowlisted header/detail fields in source states 0/1. Detail removal is explicit; omitted rows, cost rows and read-only children are preserved. Send-to-warehouse changes status to 2 and adds the configured legacy log. This source action is request routing, with no demonstrated stock posting, receipt, approval or status-10 effect.

T1 has fixed observed dependencies: SourceAmount follows document quantity times unit price; Amount follows that product times header exchange rate. They use source `decimal(18,0)` destinations. With unchanged dependencies, existing calculated values are preserved. Changing the header rate recalculates Amount across retained details. Metadata is never evaluated as executable SQL. Native callback order, SQL intermediate precision/null/rounding and WinForms equivalence still require qualification.

Nonempty cost changes return `UnsupportedCostEdits` before connection creation. The default allocator is unqualified and returns `NumberingUnavailable`; no DocID, MAX+1 algorithm, procedure or counter protocol is invented. Changing an existing DocumentDate also returns `NumberingUnavailable`, because source numbering depends on that date. Source defaults populate omitted QR/log identifier/time fields. The header has no UserCreate/UserUpdate/DateCreate/DateUpdate columns in the pinned schema.

## Source evidence and limits

Current technical source identity is `inventories/source/20261002/source-set.json`: complete `MedData-Data.sql`, UTF-16LE, 1,212,595,716 bytes, SHA-256 `61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`. Technical DDL/config inspection was read-only; no SQL statements were executed against a database. Public derivatives below retain object names, field/type metadata, source addresses and semantic findings, without raw private bodies or rows.

| Binding or rule | Evidence address | Finding |
|---|---|---|
| Current menu | `pilot-menu-bindings.json`, SY_Menu source line 319992 | Enabled menu 07011, IV_InboundRequestFrm, no variant parameter; distinct from historical/disabled AP_InputRequestFrm |
| T0/T1/T2/T3/T4 bindings | SY_FrmCfg, IV_InboundRequestFrm, lines 299802 onward; `detail-read-bindings.json` | IV_InboundRequestTbl/DocumentID, IV_InboundRequestDetailsTbl/UserAutoID, IV_InboundRequestCTCPTbl/UserAutoID, IV_InboundRequestNoSuitableTbl/UserAutoID, IV_InboundRequestLogTbl/UserAutoID |
| Header DDL | `table-02.json`, IV_InboundRequestTbl, line 11370 | 37 columns; required DocumentID/date/order/invoice/departure/destination/order type/status/QR print type; nullable branch is conservatively required by this Web write scope |
| Detail DDL | `table-02.json`, IV_InboundRequestDetailsTbl, line 11005 | Required varchar(50) row/document/item IDs; quantities, unit price and both amounts decimal(18,0); lot nvarchar(50); expiry datetime |
| Cost DDL | `table-01.json`, IV_InboundRequestCTCPTbl, line 9677 | Preserved; distinct decimal(28,4)/(28,10)/(18,2) types and nvarchar row ID; no guessed write/calculation profile |
| Read-only/log DDL | `table-14.json`, IV_InboundRequestNoSuitableTbl/IV_InboundRequestLogTbl, lines 28814/28795 | Read-only children preserved; log Notes nvarchar(200), username varchar(50), required generated ID/time |
| Status/default | SY_FrmCfg LYT1 line 300588 | Initial StatusID 0 |
| Source numbering | SY_FrmCfg lines 300599, 300600, 301393, 301394 | Prefix DN, mask `{P}{MM}{YY}/{4}`, date field DocumentDate; SP=9 is document-filter metadata, not an allocator type |
| Detail locks | SY_FrmCfg T1 LCK line 300566 | PalletNote/NoPalletNote and real/inspection/amount fields cannot be payload edits |
| Configured send | SY_FrmCfg C4 ExecSQLWithParaButtonCtl_1, line 303587 | Sets status 2 and inserts the legacy status log; this alone does not prove a native transaction boundary |
| Configured validation | SY_FrmCfg CS4, line 304951 | State must be 0/1, details must exist, and lot/document set quantity/barrel quantity/expiry must be non-NULL; no observed positivity or empty-string predicate |
| Detail expressions | SY_FrmCfg Detail lines 309228/309229 | Two fixed mathematical dependencies described above |
| Cost expressions | SY_FrmCfg Detail2 lines 309350/309371 | Cost/VAT dependencies observed, but complete callback profile remains unqualified; cost editing explicitly unsupported |
| Log defaults | Additional source statements, lines 819536/819538 | NEWID and GETDATE defaults; command omits identifier/time |

The 184 inspected form configuration records contain no form-specific EBS/EBC/ESS/ESS2/ESDB/ESDP/EBN/EON or table DBS/S10/S11 overrides. Their absence in that source set does not prove absence of global hooks or deployed configuration drift. Header/detail save follows the generic source store binding rather than an invented dedicated STP. `docs/erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md` and `inventories/erp/WINFORMS_PROPERTY_KEY_INDEX.json` corroborate framework targets/default concepts, but their historical summary does not establish current runtime behavior. Tools.dll was not executed in this implementation.

## Stable typed handoff

Namespace `Medcom.Contracts.Inbound` supplies:

```text
InboundDraftCommand(
  Guid OperationId, InboundDraftAction Action,
  string? DocumentId, string? ExpectedStateEqualityToken,
  InboundDraftHeader? Header,
  IReadOnlyList<InboundDraftDetailUpsert>? DetailUpserts = null,
  IReadOnlyList<string>? RemovedDetailIds = null,
  IReadOnlyList<InboundDraftCostInput>? CostChanges = null,
  string? Note = null)

InboundDraftHeader(DocumentDate, OrderNumber, InvoiceNo, DeparturePoint,
  DestinationPoint, OrderTypeId, BranchId, ObjectId?, CurrencyId?, RateExchange?, Notes?)

InboundDraftDetailUpsert(RowId?, ClientLineId?, ItemId, LotNumberByDocument?,
  SetQuantityByDocument?, BarrelQuantityByDocument?, ExpireDateByDocument?, UnitPrice?)
```

Actions are `Create`, `Save`, `SendToWarehouse`. Application namespace `Medcom.Application.Inbound` exposes `IInboundDraftCommandService.ExecuteAsync(command, token)`, `ReconcileAsync(originalCommand, token)` and `ReadAsync(documentId, token)`.

Existing Save supplies DocumentId, a required 64-character uppercase state-equality token, and the complete allowlisted header. New detail rows supply a nonempty unique ClientLineId and null RowId; existing rows supply their observed RowId and null ClientLineId. Every removal is an explicit observed row ID. Create supplies neither DocumentId nor expected token. Send supplies the existing document/token, no header or detail mutations, and an optional 200-character Note. Actor, tenant/company, database binding, authority, status and locked values are server-derived. Unknown payload properties are rejected.

Decimals are serialized as strings and accept exact decimal strings on input. Quantity/unit-price precision is 18,0, rate 28,10; unsupported precision/overflow and datetime coercion are rejected. Varchar write identities use the existing conservative lossless ASCII profile; this is a bounded Web profile, not proof that every source value is ASCII. Unicode nvarchar edits validate well-formed UTF-16 and width. Source send NULL checks remain separate from draft field completeness.

`ReadAsync` returns `Observed` plus `InboundDraftView(DocumentId, StatusId, Header, Details, CostRowCount, StateEqualityToken, CostEditingSupported=false)`. It currently requires the same trusted run/update grant as Save. A receipt contains OperationId, assigned DocumentId, authoritative StatusId/StateEqualityToken, AuditId and CommittedAtUtc. Only `Committed` or `Replayed` includes a success receipt. Other outcomes are `InvalidInput`, `Denied`, `NotFound`, `Conflict`, `Rejected`, `UnsupportedCostEdits`, `NumberingUnavailable`, `Unavailable`, `OutcomeUnknown`.

Production integration must use the SqlClient constructor with a trusted server company/binding, a fresh session resolver, and an optional qualified allocator. The DbConnection/authority seam supports recording tests and must not become a production test-provider fallback. This worker supplies no API/DI/BFF/navigation registration; the parent owns those separate paths.

## Transaction, permission and operation-key semantics

1. Freeze/validate intent, resolve current identity and server scope, own a fresh closed connection and SERIALIZABLE transaction, read current user/group credential stamp, fixed enabled menu/form and explicit run/add-or-update grants plus branch membership. Probe the feature journal and observe the scoped operation key.
2. A previously committed matching intent replays its original receipt after current document branch/session/rights verification. A different intent conflicts. Any existing pending key, or an unobserved key during reconciliation, returns `OutcomeUnknown` without dispatch.
3. A new operation reserves its actor-scoped key in phase 0 and commits that reservation. Only the original in-memory stack with an acknowledged reservation enters phase 1; there is no restart, timeout takeover or resumed dispatch.
4. Phase 1 rechecks identity/rights, locks the full current aggregate, verifies editable status, client state equality, exact document/branch and child membership, then executes fixed SQL. Header/detail/source log and the completed journal/audit record commit in this one effect transaction. Authoritative readback must verify editable fields, preserved hidden/omitted fields, costs, read-only children and all prior logs.
5. Reread the recorded audit receipt, recheck current session/branch authority immediately before commit, and return success only after COMMIT ACK. Commit/rollback ambiguity retains the same key. No exception text or private SQL is exposed in result codes.

The journal key is `(DatabaseBindingId, TenantId, CompanyId, Actor, OperationId)`, with ordinal identity collation. Intent includes server scope, action, document/token, all submitted header/detail/removal/note data, canonical decimal values and stable row ordering. Binding identity must stay stable for the actual database. Attempt ID ties execution to the original reserved stack.

`schemas/backend/inbound-request-command-journal-v1.sql` is UNAPPLIED. Its completed row is the feature audit: actor/action/intent, document/branch, before/after tokens, status, audit ID and UTC commit observation. This is not P01's file-journal integration, a general audit feed, a tamper-proof database-admin boundary, or a separate transaction/outbox guarantee.

Pending rows can remain after process death, lost reservation ACK, or a phase-1 rejection/confirmed rollback. This candidate intentionally has no recovery/abandon API. Clients retain the original operation/intent and use reconciliation after an unknown outcome; they must not automatically replace the key, retry business dispatch, or infer safety from a missing observation. A corrected command following an observed rejection/conflict requires an explicit new user intent and fresh document read; the old pending row is not restarted. Operational resolution of permanently pending rows needs a separately admitted procedure.

The token hashes all five observed tables, column/type metadata and values under locks. It means **state equality only**. A source writer can perform A-to-B-to-A, or delete/recreate an identical aggregate, between client read and command execution. No monotonic source revision exists here. ABA protection would require a qualified aggregate revision maintained by every writer (including WinForms and background/direct SQL paths), or an accepted database mechanism covering every constituent change. Optional tokens, header-only rowversion, hashes and Web-only counters cannot close that gate.

The bounded profile accepts at most 500 rows in each child table and 256 columns per result set, limits retained snapshot values to 8 MiB and individual text/binary values, and fails closed on unsupported/ill-formed representations. These guards do not prove SqlClient network buffering, lock performance, all large existing documents or native decimal engine behavior.

## Offline validation and remaining acceptance

The pinned .NET 10.0.401 SDK and an existing package cache supported locked restore with package sources disabled. Restore used process-only isolated NuGet/CLI paths; no package/SDK installation, project/lockfile update, credential or OS change. Release build passed with analyzers and warnings-as-errors. The two new test files exercise actual command orchestration/fixed SQL on transactional recording doubles, including loss of reservation/business ACK, failure before commit, rollback failure, equality conflicts, foreign rows, current identity/branch revocation, unknown-key reconciliation, decimal canonicalization, explicit row changes, readback corruption and preservation, default numbering/cost rejection, and a synthetic qualified allocator. A disconnected real SqlClient parameter test checks precision/scale without connecting.

Final Release build: zero warnings/errors. Focused inbound tests: 43 passed, zero failed/skipped. The broader backend run before the final bounded snapshot additions observed 494 passes and 17 failures out of 511 non-LegacyRuntime tests. The 17 failures were in unchanged HTTP fixture setup: nine Windows certificate private-key imports and eight private-configuration loads. No full-suite pass is claimed; there was no baseline execution proving those failures inherited. No shared fixture/security changes or real private configuration/SQL workaround was attempted. On the final source, the explicitly filtered non-HTTP/non-LegacyRuntime run passed 496 tests with zero failures/skips. This excludes the two affected HTTP classes and does not close their acceptance. Artifact hashes are supplied in the local technical receipt.

The pinned architecture checker could not run because Python is unavailable here. Equivalent PowerShell checks passed for all five project-reference directions, SQL-only Infrastructure dependency and prohibited platform coupling in Contracts/Application. No shared project/lockfiles changed. The exact nine implementation/test/checkpoint additions are within the ten-path lease; the marker is unchanged. Whitespace and public-artifact pattern review passed; the SQL MAX occurrence is the explicit permission-bit aggregate, with no document-number allocation query.

| Gate | What can close offline | Required external evidence/action |
|---|---|---|
| Owned fixed code/intent/rollback/readback | Build, recording tests, scope/marker checks, independent review | Parent-reviewed publication and CI on exact candidate/base |
| Journal availability/atomic SQL effects | UNAPPLIED schema and fixed transaction design | Explicit operator application on an authorized isolated target; real SqlClient persisted-effects, constraints/defaults/triggers, rollback, deadlock and lost-ACK/crash tests |
| Create/document-date numbering | Explicit unavailable behavior; allocator seam/transaction test | Qualified source allocator and collision/date/period behavior shared with WinForms, inside the same effect transaction; no invented ID protocol |
| Existing draft concurrency | Required aggregate state equality under locks | Owner acceptance of equality semantics or separately admitted all-writer revision/ABA mechanism and real interleaving tests |
| Current permissions/config | Fixed conservative credential/run/action/branch reads; synthetic revocation | Current schema/config/rights binding and precedence qualification, including ancestor/deny/admin/delegation behavior and concurrent revocation; no claim of complete legacy parity |
| T1 computed values/costs/hooks | Source addresses, exact typed plans, cost unsupported | SQL precision/null/rounding and native WinForms callback/hidden-hook/default comparison; separately admit cost edits if needed |
| API/BFF/mobile end-to-end write | Stable DTO and safe outcome handoff | Parent-owned auth/CSRF/DI/BFF/UI mapping and reviewed capability activation, then deployed phone acceptance with real committed readback/reconciliation |
| Customer operation/release | Honest open-gate record | Owner-authorized target, accepted connectivity/trust, rollout/rollback and actual operator workflow; this worker made no customer DB connection or schema change |

B01 Draft #50 transfer admission and P01 Draft #49 audit journal are separate open leases; their code paths were not borrowed or modified. I14 purchase, I12 mobile editor, I16 camera and preserved paused I11 SQL-harness paths remain separately owned. The live PR/claim check still showed #67 at the control commit before local freeze. No payload transfer, push, claim mutation, schedule operation or publication occurs in this worker turn.

## Narrow collation safety follow-up

The original candidate `77c16a23b1178001406755e8a5c20965dbace9f6` and its technical/baseline-comparison receipts are preserved. The parent requested this bounded follow-up after a cross-lane query-aware safety finding. Public DTOs, service signatures, feature schema, numbering/cost/ABA limitations and activation gates are unchanged.

Aggregate reads already use source SQL equality (`WHERE DocumentID=@document`) for every constituent table, then reject any returned row whose physical DocumentID differs ordinally from the requested parent. They do not binary-filter children out of the aggregate. Eight new synthetic case/trailing-space child-alias tests cover all four child tables and observe `Unavailable` with no token or business write. This is a fail-closed bounded profile; it does not silently repair source references or establish their incidence on an actual database.

The authority reader was affected by mixed identity/reference collations. Its shared grant CTE and branch-owner predicates could admit another physical actor/group through source case-insensitive or padded reference comparisons. Seven isolated pre-fix recording cases returned `Observed` for alias-based direct/group/delegated-actor/menu/branch grants. One additional initial delegation fixture also granted the actor's own group and was corrected to separate that legitimate source; it is not counted as independent pre-fix reproduction evidence.

The feature-specific fixed authority queries now compare actor, group, delegation, permission-menu and branch-owner references as Unicode converted before `Latin1_General_100_BIN2`, with equal DATALENGTH to reject padded trailing spaces. This avoids forcing varchar data through a different code page before comparison. Direct parameter predicates retain source equality as a coarse filter, followed by these exact guards. The user/group read also returns and verifies the physical group key. Unresolved/noncanonical bindings fail closed; this is a conservative Web policy, not a claim of complete legacy precedence. Source metadata in table-02/table-04/table-07 establishes the relevant varchar identities; deployed schema/collation/layout compatibility and query plans remain runtime qualification gates. No shared SQL policy, credentials, schema collation or framework is modified.

The new recording model explicitly distinguishes case-sensitive physical user keys from case-insensitive, SQL-padded permission/delegation/branch references and evaluates the comparison guards present in the actual fixed queries. Tests invoke the production authority reader through the existing DbConnection seam; reflection avoids a production-visibility change. Positive direct, group and canonical delegated grants execute the concrete workflow, while alias grants and noncanonical user/group bindings are denied. These are bounded comparison models, not a SQL engine or evidence of customer data/layouts.

Focused validation reached 64/64 inbound tests (43 original plus 21 comparison cases), with zero failed/skipped and a zero-warning/error Release build. Exact-source full-suite/control comparison evidence is supplied separately in the successor technical receipt. The built admission control has 470 cases, 453 passes and 17 setup failures. The original frozen candidate has 513 cases, 496 passes and those same 17 names/messages; its earlier 511-case run preceded the two hidden-value cases. The follow-up has 534 cases and still requires the 17 shared HTTP setup failures to be resolved in an authorized test environment before full-suite acceptance. No certificate/config permission bypass, private-file inspection, SQL connection, transfer or publication is authorized by this follow-up.

## P1 derived-readback follow-up

Independent review of `a79a39abc310f4af8182c4d54fbc496b558e0ad4` found `I15-REVIEW-P1-001`: changed calculated fields were allowlisted without an expected-value check, and new aggregates returned before checking calculated fields. Five recording probes replaced exact expected SourceAmount/Amount values 9, 6 or 2 with 999 and still obtained a completed journal and acknowledged business commit. That candidate is blocked by this finding. Both earlier candidates, patches and receipts remain preserved; the present successor requires independent review before publication.

The verifier now compares affected calculated values before the completed audit/journal record and business COMMIT. New Create/Save details and changed document quantity or unit price require exact SourceAmount and Amount readback. A changed header exchange rate requires exact Amount readback for every retained detail, including omitted details; its unchanged SourceAmount remains subject to preservation checks. Metadata-only changes preserve existing calculated values without normalizing them. A mismatch returns `Unavailable`, with no receipt or completed audit record, and rolls back the effect transaction while leaving the acknowledged reservation pending.

The supported calculation subset uses the two pinned source expressions only. Integer quantity/price products and the rational decimal exchange rate are evaluated with BigInteger, avoiding host decimal intermediate rounding. Source product and final Amount must each fit decimal(18,0), and Amount must be integral; NULL quantity/price yields NULL for both fields, and NULL rate yields NULL Amount. Zero, signed and fractional rates are supported when the result is exact within those bounds. Nonintegral results, out-of-range products or amounts, or unsupported input precision return `Unavailable` with code `derived_calculation_not_qualified` before business DML. This deliberately conservative check also bounds the source product during a rate-only update, even though that update preserves stored SourceAmount.

SQL multiplication can reduce intermediate scale at its precision limit. The exact bounded subset avoids requiring a rounding rule; it does not establish native WinForms callback order, deployed type compatibility, SQL NULL/overflow behavior or equivalence for values requiring rounding. Those remain isolated SQL/native qualification gates. See [Microsoft SQL Server precision and scale rules](https://learn.microsoft.com/en-us/sql/t-sql/data-types/precision-scale-and-length-transact-sql?view=sql-server-ver17).

The successor adds 24 focused regression cases: corrupt derived values after quantity/price changes, Create and Save insertion, rate changes on omitted rows, NULL results/corruption, unsupported rounding/range and near-midpoint inputs, exact fractional/signed/zero/ten-place rates, and the decimal(18,0) boundary. The permitted full offline comparison excludes `LegacyRuntime`, `ApiBoundaryTests` and `AuthenticationHttpTests`; the latter two fixtures can access private configuration or certificate setup. Their 17 prior control/candidate failures remain preserved as historical evidence, but are not rerun or represented as a current successor full-suite result. All new SDK invocations disable first-run ASP.NET certificate generation before execution, use the existing offline cache and make no configuration/security workaround.

The ten-place regression also exposed an existing normalization parser defect: G29 emits `1E-10`, but the parser did not accept the exponent and threw before command execution. Intermediate local candidate `90d7bfca4d0dec1ff0ceca3f0f3f2325f27a9693` and its 87/88 focused, 540/541 permitted-suite results are preserved as failed evidence. The owned service now parses its canonical G29 representation with NumberStyles.Float. Equivalent trailing-zero decimal representations replay the original receipt, including the ten-place rate; this changes no public converter or DTO.

Only the owned Infrastructure service, command tests and this checkpoint change in this follow-up. SQL plans, feature schema, DTO/application interfaces, immutable marker and API/DI/BFF/UI activation remain unchanged. The schema is UNAPPLIED. Numbering, costs, all-writer ABA protection, pending-key operational resolution, real SQL/native behavior, full HTTP acceptance and parent integration/release remain open. Exact frozen successor/tree, patches and test/baseline hashes are recorded in a separate local technical receipt; no payload transfer or publication occurs here.
