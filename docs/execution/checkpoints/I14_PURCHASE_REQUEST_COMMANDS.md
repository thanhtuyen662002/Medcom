# I14 fixed purchase-request command handoff

I14 implements the first fixed mobile purchase-request write slice: create draft, save an existing draft with explicit detail changes, submit an existing draft, and create plus submit. This is unregistered backend implementation with offline evidence. It does not establish target SQL or production acceptance.

Admission: Draft PR #66, control/immutable claim `bcc1a00056a351d78fb9c110ed649813bf4aba70`, base `f8f4b108a8441d0ada9bda9a00251a7554fcb47c`, run `148b5a19-e55a-4811-9b65-b5b90dd8f35d`. The admitted marker is [direct-runs/I14.json](../direct-runs/I14.json), blob `7d1664042c1a539a5b67daa2a76b0bcd084639f3`; it is unchanged. Parent owns GitHub publication, review, current-head/base CI and API integration. No API, DI, BFF, navigation, shared project or lockfile was edited here.

## Source identity and finite evidence

Historical approved Library baselines `ERP_Medcom2026(4).zip` and `Medcom-Data (3)(1).zip` retain the identities in [SOURCE_BASELINE.md](../../SOURCE_BASELINE.md). This continuation uses the distinct owner-recovered round and exact full SQL member recorded by `inventories/source/20261002/source-set.json` and the extraction-integrity manifest; archive equivalence is not asserted. The SQL member was rehashed for the narrow source investigation: 1,212,595,716 bytes, CRC32 `16a9a7e6`, SHA-256 `61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096`. Private bodies and transaction rows are not included in this handoff.

All source line references below address that exact full SQL member. Table definitions are also indexed in `inventories/source/20261002/table-07.json`; object names and source positions are the durable lookup identities.

| Verified static fact | Evidence object / source position |
|---|---|
| Menu `05011`, parent `05`, reachable form `AP_PurposeRequestListFrm`; selected menu and parent are not disabled in the supplied snapshot | `dbo.SY_Menu`, lines 319873 / 319877; `dbo.SY_FrmLstTbl`, line 309696 |
| Master `AP_PurchaseRequestTbl` / `PurchaseRequestID`; detail `AP_PurchaseRequestDetailTbl` / `UserAutoID` | `dbo.SY_FrmCfg`, T0/T1 mappings at 299356-299357 / 299365-299366 |
| Master has 14 columns; detail has 9 columns; keys are server supplied, not identity columns | `dbo.AP_PurchaseRequestTbl`, definition starts 23221, masked definition SHA-256 `6aa566ebf0f9a23234c07ef0ff946c14cfb66a36a10bb2c32f70e36791cadc7f`; `dbo.AP_PurchaseRequestDetailTbl`, starts 23200, SHA-256 `5a988f1ea32f4ac929f5dd7483f3446402aeeaf8270eb052957c76623f55b0a6` |
| Header `Price` is nullable decimal(18,2); detail `Budget`/`TotalPrice` nullable and `Quantity`/`UnitPrice` required decimal(18,0); `TimeRequired` is nullable nvarchar(200), not a timestamp | Same two table definitions and their catalog column records |
| Draft defaults are `StatusID=1`, nullable `isLock` default 0 | `DF_AP_PurchaseRequestTbl_StatusID`, 818528; `DF_AP_PurchaseRequestTbl_isLock`, 818530 |
| Detail master FK is `PurchaseRequestID` to master `PurchaseRequestID` | `FK_AP_PurchaseRequestDetailTbl_AP_PurchaseRequestTbl`, 820320-820323 |
| Configured submit changes the master to status 2 and lock 1; it does not insert a purchase order | `dbo.SY_FrmCfg` action effect 299451-299453; selected statement SHA-256 `d53f46bdcf425001498b9d35bab7094e9110d7817a4b96cfede7bb5c68820315` |
| Legacy checks are separate from the effect: selection check mentions states 1/4; another check rejects states 2/3 | `dbo.SY_FrmCfg`, 299456 and 300955-300968. I14 explicitly admits existing draft state 1 only; rejected/reopened state 4 remains a separate transition |
| Purchase-order conversion is a distinct action that inserts `AP_OrderTbl`/`AP_OrderDetailTbl` and changes status to 5 | `dbo.SY_FrmCfg`, 299490-299504; outside I14 |
| The 80 direct form config rows have empty PFID; none of the 29 indexed form ExecSQL hook keys or selected T0/T1 save overrides is present | Exhaustive exact-FID scan of `dbo.SY_FrmCfg`; property-key interpretation uses `inventories/erp/WINFORMS_PROPERTY_KEY_INDEX.json` and the supplemental guide reconciliation |
| Matching PO prefix is not purchase-request allocation proof | `dbo.SY_DocSetup`, 44 supplied rows, no purchase-request binding; PO row 291230 binds `AP_OrderTbl`/`AP_OrderDetailTbl`. `dbo.SY_GetDocumentID` exists at 866779, but its purchase-request caller binding is UNKNOWN |

The owner guide is supplementary: [WINFORMS_SOURCE_GUIDE_EVIDENCE.md](../../erp/WINFORMS_SOURCE_GUIDE_EVIDENCE.md), owner attachment SHA-256 `f2d2b8dff8ebdf7f67495d22a1c17966f2959222ab4c7703eda2c1d4f61cf179`. Its `SY_DocSetup` pointer at attachment line 65 prompted the finite scan. Reported generic Storer/controller behavior is an implementation clue from the older snapshot, not observed Medcom runtime. Current VB source/project files were unavailable in the staged recovered ERP input; the incomplete archive/binary metadata does not prove current legacy runtime order or engine behavior. No Tools.dll runtime was invoked.

## Stable integration contract

Contract: [PurchaseRequests.cs](../../../src/backend/Medcom.Contracts/PurchaseRequests.cs). Application interface and validation: [PurchaseRequestCommands.cs](../../../src/backend/Medcom.Application/PurchaseRequests/PurchaseRequestCommands.cs).

| Service method | Input / behavior |
|---|---|
| `CreateAsync` | `CreatePurchaseRequestDraft`: key, branch, typed header, client-correlated new lines, optional `SubmitAfterCreate`. Document/detail ERP identifiers, actor, status and lock are server owned |
| `SaveAsync` | `SavePurchaseRequestDraft`: key, branch, document ID, `ExpectedStateToken`, typed header and explicit Add/Update/Remove detail delta. Omitted lines are preserved |
| `SubmitAsync` | `SubmitPurchaseRequest`: key, branch, document ID, `ExpectedStateToken`; configured status/lock effect only |

Inputs reject unmapped JSON fields. Decimal values are invariant decimal strings and retain the source precision; no quantity/price multiplication, positivity rule, field coercion or financial total is invented. `PurchaseDate` is a nullable SQL datetime wall-clock string `yyyy-MM-ddTHH:mm:ss.fff`, with no offset or timezone inferred. Nonrepresentable milliseconds and the maximum-date rounding overflow return `InvalidInput`. Source `RateExchange` remains a finite double. Nulls are retained, including an existing draft's null lock during save.

The receipt includes the persisted typed aggregate, client-line-to-server-ID mapping and `StateToken`. The token is `prs1.` plus the SHA-256 of the normalized complete aggregate; lines are ordered by ordinal server ID. It expresses aggregate state equality under locks. It is not a monotonically increasing version and does not detect identical delete/reinsert ABA. This is the admitted comparison policy, not a new broad source blocker.

The result outcomes are `Committed`, `Replayed`, `InvalidInput`, `Denied`, `Conflict`, `QualificationRequired`, `Unavailable`, `OutcomeUnknown`, `Cancelled`. Integration must retain the original operation key on uncertainty; it must not generate a replacement key or interpret an HTTP retry as permission to redispatch a pending intent. Only acknowledged commit or authorized persisted receipt replay returns a receipt.

## Concrete SQL and transaction behavior

Implementation: [SqlPurchaseRequestCommands.cs](../../../src/backend/Medcom.Infrastructure/PurchaseRequests/SqlPurchaseRequestCommands.cs) and [PurchaseRequestSql.cs](../../../src/backend/Medcom.Infrastructure/PurchaseRequests/PurchaseRequestSql.cs). All SQL is new fixed Web SQL with typed parameters and closed table/column plans. It does not execute owner metadata SQL or expose table selectors.

The service owns a fresh connection and SERIALIZABLE transaction. Phase 0 authenticates the live tenant/company/actor/credential version, checks native menu/action/branch rights and target schema/binding, checks existing draft state where applicable, then durably reserves the exact scoped intent. Only this invocation's acknowledged reservation grants phase-1 custody. Phase 1 repeats the authority/schema/state checks, allocates qualified server IDs in the caller transaction, writes master/detail and optional submit effect, compares authoritative persisted readback, completes and rereads the journal receipt, rechecks transaction and live authority, then requires COMMIT ACK before success.

The journal identity includes database binding, tenant, company, actor, branch, action and client key. Hash lookup also compares complete key bytes; completed-slot CAS compares key/intent byte lengths and values, avoiding SQL binary zero-padding equivalence. Same scoped key with different canonical intent conflicts. A completed slot replays the original receipt only after fresh native rights and current document branch checks; the receipt does not claim to represent subsequent document edits. A pending slot is never taken over or automatically resumed, regardless of age. Lost reservation ACK, lost business ACK or cancellation during commit yields `OutcomeUnknown` and retains the key. No cleanup, expiry, dispatcher or generic worker is introduced.

Known precommit failures roll back the owned business transaction and withhold the receipt. If phase 0 already committed, the pending slot remains even after an observed business rollback; later calls cannot blindly redispatch it. Operator reconciliation of that conservative pending state is a remaining integration/operational task, not implemented as a key reset. Cleanup errors do not replace an already decided commit-ACK result or expose provider details.

Native rights require enabled actor/group, matching credential stamp, exact form/menu/parent, branch intersection and `IsRun` plus `IsAdd` for create or `IsUpdate` for save/submit; create-and-submit requires both. I14-local grant SQL retains the source group/direct/delegated-group routes with Unicode byte and length equality for physical actor/group/delegation/menu bindings. Credential-group and branch-actor joins use the same identity discipline; differing SQL collations cannot silently borrow another physical principal's rights. No manager/admin bypass is added. Current master/detail state is read under locks; the detail query first fetches the whole source SQL-equal FK relation, then rejects noncanonical FK aliases ordinally. It never omits case/accent/space-related children from the state token or receipt. Stale tokens, foreign detail IDs, unsupported state, foreign branch and row-count mismatches cannot silently overwrite the aggregate.

The schema probe checks fixed ERP/control column shapes, primary keys, trusted enabled detail FK and journal checks, binding/schema marker, writable fully durable database and absence of unqualified triggers on the four affected objects. These are fail-closed metadata checks, not an observed SQL engine test. Existing ERP constraints remain authoritative; I14 does not alter them.

Server number allocation is the narrow explicit `IPurchaseRequestIdentifierAllocator` dependency. Qualification must cover the concrete database binding and caller-transaction-safe allocation/uniqueness. Missing qualification returns `QualificationRequired` before reservation or ERP DML. No production allocator or PO-format guess is supplied. Replaying a completed receipt does not need to allocate again.

[purchase-request-command-journal-v1.sql](../../../schemas/backend/purchase-request-command-journal-v1.sql) is an UNAPPLIED, feature-specific schema artifact requiring an owner-supplied binding parameter. It is not application startup DDL, a legacy ERP alteration or a migration run.

## Observed validation and remaining gates

Observed on the approved .NET 10.0.401 Windows SDK, locked package restore with normal NuGet vulnerability audit, isolated workspace cache/profile/temp:

- Release build: PASS, 0 warnings/errors.
- Corrected-candidate backend CI filter `Category!=LegacyRuntime`: PASS 578/578, 0 skipped. This includes 108 I14 tests in `PurchaseRequestCommandTests.cs` and `PurchaseRequestSqlTests.cs` and the unchanged 470 baseline tests. Earlier freeze `22a0dd81264ca91340f12517e5c4c6742931e10d` remains preserved with its separate 554/554 evidence.
- Tests exercise the actual concrete orchestrator and fixed SQL builder with a test-only recording database/allocator, plus actual SqlClient parameter objects without connections. Covered: scope/rights/revocation, state conflict, explicit delta/null preservation, create-and-submit atomicity, master/detail/save/receipt faults, mismatched affected counts and readback, pending custody, altered/padded key, lost ACK replay, invalid allocator, closed JSON, decimal/date/float boundaries and input freeze.
- Project architecture: PASS. Public guard regressions: PASS 97/97. Finite catalog: PASS 1,527 objects / 33 checksum-verified members. Source scanner regressions: PASS 48/48.
- Native preparation runner on this Windows environment stops at the unchanged direct `.py` launch in `preparations/L02/20261002/test_preparation.py:4` with `WinError 193`. The external interpreter launcher also exposed Windows default CP1252 decoding of UTF-8 reference data at `preparations/L08/20261002/test_preparation.py:8`. Combined interpreter-equivalent runs completed all 23 reference suites, using process-local Python UTF-8 mode for the remaining six suites. Repository scripts were unchanged; this does not erase the native limitation or imply hosted CI proof.

The parent receives frozen exact commit/tree/diff and local test-evidence hashes separately; this checkpoint cannot self-reference its containing commit. No files outside the eight mutable claim paths or the immutable marker are part of the candidate.

## Independent-review correction round

Independent review of preserved freeze `22a0dd81264ca91340f12517e5c4c6742931e10d` found two P1 defects: I14-R1 filtered SQL-related detail aliases out before constructing the aggregate; I14-R2 imported collated permission principal comparisons that could borrow another physical actor's rights on a compatible mixed-collation schema. These findings are parameter-aware synthetic SQL-comparison evidence, not an actual customer-engine reproduction or a claim that such rows exist in the target.

New query-aware regressions were first run against the unchanged frozen production source: all 19 alias safety cases returned the wrong `Committed` outcome, and three canonical-route checks caught ANSI identity parameters (84 prior tests still passed). The corrected code now fetches then rejects SQL-owned case/accent/space aliases, including changes between reservation/business phases and replay; it preserves canonical actor/group/delegated grants and rejects physical principal/group/menu aliases including binary zero-padding cases. All 24 added tests pass in the 578-test corrected suite. DTOs, application command signatures, allocator interface, immutable marker, source field types/defaults/submit effect, transaction boundaries and unapplied schema artifact are unchanged. The correction delta touches only the two admitted Infrastructure files, the admitted SQL test file and this checkpoint; shared `SqlLegacyPolicy` is unchanged. Focused independent re-review remains pending.

UNKNOWN / remaining acceptance: qualified purchase-request numbering binding; actual target schema/probe/constraints/collation/locking/commit durability; live authority resolver integration; concurrent ERP/Web writers and crash/ACK acceptance; separately owned API/DI/BFF/phone integration; operator pending-state reconciliation; current-head/base hosted checks and independent review. No customer SQL connection, DDL apply, fixture seed, private archive/SQL upload, GitHub mutation or production activation occurred in this worker.
