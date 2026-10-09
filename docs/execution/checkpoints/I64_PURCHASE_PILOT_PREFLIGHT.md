# I64 — Read-only purchase pilot preflight

Status: isolated local candidate. No target execution, deployment, pilot activation or production acceptance.

## Admission and scope

- Exact base: `884be183160d0ea1e5c2a8d8ce5e20431dd55d6f`, tree `070b46760f043cc04d9f48b341802c8c163c7f44`.
- Admission: [PR #116](https://github.com/thanhtuyen662002/Medcom/pull/116), control `c65f424eddc8a6f4ca36728764d3fbe6972cba8c`.
- The immutable marker is `docs/execution/direct-runs/I64.json`. Four mutable paths cover the one Program branch, new preflight, dedicated tests and this checkpoint. Root is sole publisher.
- This candidate is independent of the concurrent I60–I63 release and changes no existing SQL, authentication, session, command, frontend, configuration, deployment or dependency implementation.

## Invocation and input boundary

`--probe-purchase-pilot --actor <literal-login-input> --document <literal-document-id> --branch <literal-branch-id>` is one explicit diagnostic invocation. It terminates before ordinary API startup. The exact seven arguments and their order are mandatory. Duplicate, unknown, alternate-case, suffixed or missing switches, padded/empty/control/wildcard/invalid-UTF16 values and over-budget identifiers are rejected before configuration or SQL access. The actor limit is 100 UTF-16 code units; document and branch limits are 50. This CLI accepts an intentionally narrower, already-trimmed subset of ordinary login inputs. It offers no arbitrary SQL, connection string, database selector or private-file argument. Mixed diagnostic/pilot invocation fails closed.

Configuration uses only the already-provisioned environment through the unchanged `ServerConfiguration.ResolveConnectionString` policy, following the existing Railway diagnostics. Connection credentials are used internally by SqlClient, never exported or placed on argv. Existing target/TLS settings are retained; the preflight does not turn on a development exception or read a private file. Integrated/interactive authentication, missing/placeholder SQL passwords and failover/read-only routing are refused. Pooling, automatic reconnect and ambient enlistment are disabled. Connect timeout is 10 seconds, commands are 5 seconds and database work has a 30-second cancellation budget.

## Fixed read plan

1. Own one newly created closed connection. Check its literal server/database before and after opening; reject ambient transactions. Observe transaction count/state 0/0 before beginning an owned Serializable transaction, then 1/1.
2. Read at most two rows from the entire `dbo.MedcomPurchaseRequestCommandSchema`: `SingletonId`, `SchemaVersion`, `DatabaseBindingId`. Require exactly one row, singleton 1, version 1 and a nonempty installed GUID. Do not filter away unexpected control rows, generate a replacement GUID or reinstall anything.
3. Run the unchanged fixed `PurchaseRequestSql.ProbeText`. Require the same version/binding and exact boolean-shaped durability/schema values. Those booleans report this existing command probe's predicates, including named checks; they do not certify constraint definitions or complete runtime semantics. A false flag remains false in the observation and never becomes an admission decision.
4. Resolve `SY_User.UserName` by the same native-collation user/group join and `VarChar(100)` parameter used by ordinary login, retaining its at-most-two ambiguity detection. Read only stored username, disable flag, group identifier and group disable flag. Require a unique structurally valid active row/group. Emit the exact stored username spelling. Do not assume typed login casing is canonical. No password, hash, credential stamp, display name, vendor DLL, password verifier, session or permission resolver is used. This read does not prove successful authentication or native Run + Update permission.
5. Read at most two exact document/branch matches from `AP_PurchaseRequestTbl`, selecting only `PurchaseRequestID`, `BranchID`, `StatusID` and nullable `isLock`. Both predicates use Unicode byte and length equality. IDs are compared again ordinally in managed code. Return the actual status integer and preserve null/false/true lock values; do not coerce draft/unlocked state or read header business values, details, notes or journal contents.
6. Recheck transaction count/state 1/1, then rollback/dispose the owned transaction and dispose the connection before emitting an observation. Foreign/preopened resources are not adopted. Extra result sets, duplicate/missing rows, malformed types/nulls, target mismatch, cancellation or cleanup failure cannot emit a successful observation.

Identifier projections are bounded one code unit beyond the admitted field maximum, so a malformed oversized source cannot return a large value or be silently accepted after truncation. No data modification, procedure, COMMIT, command reservation, allocator, permit or command-service construction exists in this path. The existing metadata probe can acquire update/serializable locks; short bounded reads plus rollback release them.

## Output and limits

One bounded JSON object identifies `read_only_preflight_not_write_authorization` and `qualification: not_established`. Its successful observation contains only the canonical principal identifier, exact document/branch, status/nullable lock, installed GUID/singleton/version and the two existing probe flags. Group identifiers, target connection strings and credentials are never emitted. Failures emit only fixed stage/code, with null observation; raw exception messages and provider text are never serialized. Failed output is attempted once and returns nonzero without an exception echo.

Exit 0 means these observations were read and cleaned up, not that a writer is admitted. Exit 2 is invalid invocation; 3 is configuration/query/shape/cancellation/cleanup failure; 4 is unavailable output. A status other than 1, lock true, or false schema/durability flag remains a blocker for later pilot work even if the read itself returns 0.

Ordinary browser `/api/workspace` remains the source for the current session's tenant/company/branch scope. After the detail repair, fresh authenticated detail readback must supply the real current document token and exact existing line set. Native Run + Update and current session fences are still independently enforced by the existing authority reader/writer. No preflight result fabricates those facts, authenticates an account, grants a scope or supplies production runtime acceptance.

## Verification

All candidate tests use synthetic identifiers and recording providers. No real target, ERP user, private file or vendor DLL is exercised.

Observed local validation on the final source:

- Locked restore and architecture boundary check pass.
- Release analyzer build passes with zero warnings/errors.
- Dedicated preflight recording tests pass **217/217**, zero skipped.
- Full non-`LegacyRuntime` backend regression passes **3,014/3,014**, zero skipped.
- An initial aggregate, before compiling the new tests, passed 2,792 and failed the five existing private-path configuration cases because the managed executor mounts a `.git` ancestor over its default temporary directory. The final run uses an isolated synthetic `/dev/shm` temporary directory; the existing product path guard and tests are unchanged. Initial failed evidence is retained in the handoff.
- `git diff --check` passes; the immutable marker matches the admission copy.

Exact local commands, logs and test receipts are recorded in the handoff; fresh independent review and exact-head/base CI remain integration gates. Target runtime execution, its evidence, the protected pilot permit, exact launch/stop authorization, one server/browser scope, separate approved Save/Submit and supervised effects remain separate work.
