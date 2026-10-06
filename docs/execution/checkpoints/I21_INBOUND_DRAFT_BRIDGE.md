# I21 — Existing inbound draft HTTP bridge and retained mobile host

Date: 2026-10-06

Repository: `thanhtuyen662002/Medcom`

Base: `b1eb57077c2112a808c7ce2e581511741fa971a1`

Admission control / PR74 head observed: `17bfa843e9630732761a47353a0429c221878baa`

Run: `9e3159d4-9f05-4c5e-8f75-067f6f587882`

Status: **LOCAL_CANDIDATE / NOT_READY_FOR_INTEGRATION / NOT_MOUNTED**

This is a nine-file local candidate, not a deployed or working application feature. ASP.NET and React/browser execution remain NOT_RUN in this environment. The Node transport/controller tests below do not establish server authorization, real navigation behavior, SQL qualification or production acceptance.

## 1. Ownership and provenance

The immutable marker is `docs/execution/direct-runs/I21.json`, Git blob `31817fe56f2c1e1f4d9023563a6c952ef3d387d0` at the admission control above. It is excluded from this patch and source archive; there is no marker mutation. PR74 was observed as an open draft, one commit / one changed file, with admission-only text. No publication or GitHub mutation was made.

The nine new paths in this candidate are exactly:

```text
apps/medcom-sites/components/erp/inbound-request-screen.tsx
apps/medcom-sites/lib/erp/inbound-request-api.ts
apps/medcom-sites/lib/erp/inbound-request-command-adapter.ts
apps/medcom-sites/tests/inbound-request-integration.test.mjs
src/backend/Medcom.Api/InboundDraftEndpoints.cs
src/backend/Medcom.Api/InboundDraftCommandAccess.cs
src/backend/Medcom.Contracts/Inbound/InboundDraftWorkspace.cs
tests/backend/Medcom.Api.Tests/InboundDraftEndpointTests.cs
docs/execution/checkpoints/I21_INBOUND_DRAFT_BRIDGE.md
```

All nine exact paths were queried at the pinned base through the readable GitHub connector and returned Not Found. The patch therefore consists of nine additions, against that base, not against the laptop uploads or an earlier I18 handoff. It also applies without altering the admission marker already present on control. Do not apply over an independently created same-name file without reconciling that work.

Source evidence read at the pinned base:

| Source | Git blob / relevant facts |
| --- | --- |
| `src/backend/Medcom.Contracts/Inbound/InboundDraftContracts.cs` | `a3d711f01749efedb6efa85ac75ae09117873dd1`; existing DTOs, nullable fields, decimal string attributes, string enums |
| `src/backend/Medcom.Application/Inbound/InboundDraftCommandService.cs` | `9bc7b8bed425bd52eba99372ceb36327aab8a863`; existing service interface, validation, menu/form, exact SQL datetime, 500-line bound |
| `src/backend/Medcom.Infrastructure/Inbound/SqlInboundDraftCommandService.cs` | `597d060d27002ebb761130b92da5176fafa42d73`; current Update/branch authority, original-only reconciliation, receipt UTC kind; no implementation copied or executed |
| `apps/medcom-sites/components/erp/mobile-inbound-request.tsx` | `cc0912bfe8f88be156056a75cc7480df198390dd`; accepted R2 editor, receipt barrier, note guard, original-command custody |
| `apps/medcom-sites/lib/erp/inbound-draft.ts` | `02f6333974c890f6c45a80adeabaf3d31818ad61`; existing adapter/access/DTO types and final I18 validation |
| `apps/medcom-sites/lib/erp/api.ts` | `e722ee0067d4734b274964b2f8889f38f78f714d`; existing BFF prefix, CSRF route and inbound list loader |
| `apps/medcom-sites/lib/erp/contracts.ts` | `a58e2a1154eb775a4d7dbe623e797bc6b0d31bce`; list/workspace shapes, no login-incarnation field |
| `src/backend/Medcom.Api/AuthEndpoints.cs` | `5586d3729054d474ce4291750192d66a2289de6f`; cookie session claim, live sessions, CSRF and workspace |
| `src/backend/Medcom.Api/ApiHost.cs` | `9d64ae2761101d67e5b1c6cf6f340dc084df1184`; existing cookie/antiforgery and no-store middleware; private configuration loader is why tests do NOT call `ApiHost.Build` |
| `src/backend/Medcom.Application/Authentication.cs` | `3eddbaac747a48b82a9cd025cf16a9705c005017`; live identity/session interfaces |
| `tests/backend/Medcom.Api.Tests/Medcom.Api.Tests.csproj` | `caa9241b744009889a0c9f225d2bce7d5cf42f90`; existing xUnit project, no TestServer dependency |

The mounted R2 component/library reference bytes were checked using Git blob hashing and match the two pinned blobs above. They were not changed. The old laptop versions surfaced elsewhere in the conversation were not used as this patch's baseline. A complete base checkout and locked dependency tree were not available in the runtime; a direct archive download attempt failed DNS. GitHub file reads did work. No new laptop/source request is needed for this handoff.

## 2. HTTP facade — prepared, not activated

`AddInboundDraftFacade(IServiceCollection)` and `MapInboundDraftFacade(IEndpointRouteBuilder)` are public extension helpers in the owned API file. Nothing calls them from ApiHost in this candidate. Registration uses TryAddScoped for unavailable access/service implementations. Missing providers, or only the default service, do not synthesize permissions or enable SQL.

| Method | Fixed backend route | Wire contract |
| --- | --- | --- |
| GET | `/api/inbound-requests/draft?documentId=...` | `{scopeKey,access:{canRead,canSave,canSend,available,maxCommandBytes},data:InboundDraftReadResult}` |
| POST | `/api/inbound-requests/draft/save` | Original `InboundDraftCommand`, action exactly `Save` |
| POST | `/api/inbound-requests/draft/send-to-warehouse` | Original `InboundDraftCommand`, action exactly `SendToWarehouse` |
| POST | `/api/inbound-requests/draft/reconcile` | Original Save/Send command, including the original action; calls only `ReconcileAsync` |

All POST responses use `{scopeKey,data:InboundDraftResult}`. POST requires one matching `X-Inbound-Scope`; the first full GET can omit it, and later GETs validate it when supplied. Create is rejected, including on reconciliation. No alternate writer, numbering allocator, lookup engine or paginated detail read was added.

The facade explicitly authenticates the cookie scheme and resolves the current `IWebSessions` session, rather than trusting request-start claims/Items alone. HTTPS, same-origin metadata and CSRF are required. Session checks surround CSRF and body reads; authority and current server-resolved branch checks surround I15 awaits. I15 retains its own transaction/live-authority checks. Typed authority observations and identity lists are snapshotted before comparison. Exceptions are sanitized; no request bodies, tokens or underlying exception text are logged/reflected.

The qualification seam must resolve the current document branch and actual I15 Update grant for menu `07011` / `IV_InboundRequestFrm`. The read-list capability is never a substitute. `SendGranted` controls admission to a NEW Send; reconciliation requires current full-read/Update authority and passes the original action to I15 for its own checks, without requiring permission to dispatch a new Send. The default seam returns null, not fabricated grants.

The nonsecret opaque scope hashes a domain-separated array containing database binding, tenant, company, principal and the server login token. It excludes document IDs, state tokens, branch, authority version and changing rights. It is not a bearer credential. Rights/branch/session/binding changes between observations prevent returning stale data/receipts; a lost response after a possible write remains uncertain on the client.

The body is read as a bounded stream up to 1,048,576 bytes, including requests without Content-Length. It rejects unsupported encodings/media, invalid UTF-8, malformed JSON, duplicate decoded member names, unknown members, wrong casing/actions, enum numbers, numeric decimals, rounding-required decimal strings, offset/date-only/non-SQL wall clocks and unsupported cost edits. Existing I15 validation remains in force after strict wire parsing. Serialization uses local options plus the original inbound DTO attributes: string enums, string decimals, explicit nulls and the original DateTime/receipt distinction. No purchase enum/token profile was copied.

No server security or streamed-body test is claimed PASS here: the C# tests have not executed.

## 3. Frontend transport, custody and host

The transport uses the existing same-origin BFF prefix `/api/erp` and the four fixed backend paths. Reads and commands use credentials `same-origin`, cache `no-store`, redirect `error`. Each POST obtains the existing CSRF token and rechecks the request generation and current access after that await. It never refreshes/retries a failed POST. An abortable 30-second bound per HTTP phase prevents a permanently stalled native fetch from leaving an operation pending forever; timeout is not proof of rollback. Responses are bounded and parsed with fatal UTF-8/duplicate-member checks, without field projection or decimal/time conversion.

`createInboundRequestBridge` lives for one real login incarnation. It supplies the original I18 `InboundDraftAdapter` and access type. Execute stores the original command object, operation ID, login scope and serialized JSON string ONCE before network awaits. A second execute cannot replace an unresolved command or redispatch an old key. Reconcile sends the stored string verbatim and requires the exact original command object. Every no-valid-receipt result, including typed Denied/Conflict/Unavailable, stays OutcomeUnknown to the unchanged I18 editor.

A transport receipt is only a candidate. The unchanged I18 `commandResult` remains the final validator; its `onConfirmed` callback acknowledges the candidate to the bridge. A retired callback cannot release custody, and receipt comparison uses field values, not JSON property order. Confirmed evidence remains when readback fails. I18 alone retains its matching-receipt/full-snapshot/server-row-ID barrier; the bridge does not bypass it or execute a replacement command.

Selection, rights/context changes and API replacement fence requests even when transport cancellation is ignored. Concurrent same-document reads also have a generation guard, so an older bootstrap cannot replace a newer proof or close newly validated access. HTTP 401/403/scope errors hide/lock current access without automatically retiring the original intent.

The dedicated host uses existing `getDocuments("inbound-requests",...)` ONLY to choose a document. Bootstrap obtains server access through full read; the mounted I18 then performs its own full draft read. No list row or `getDetail` page becomes an editable draft. All supported header/line editing and I15 business semantics remain owned by unchanged I18/I15.

`loginKey` is a required parent-supplied, nonsecret AUTH login incarnation. `workspace=null` is not logout. The host keeps its bridge and I18 mounted, keeps the last server scope, hides data and disables access during a transient workspace failure; restoring the same session revalidates before allowing original-only reconciliation. A real loginKey change retires old data/callbacks. The parent must not derive loginKey from document, equality token, permissions, authorityVersion, expiry strings or a cookie value.

Selection, filter application, list paging, close and Back go through the existing navigation guard. The host adds an unresolved-custody blocker and rechecks it inside deferred navigation, so an old discard dialog cannot silently release a command that became pending. Send-only note/preflight guarding remains in R2. Clicking the already selected list row is a no-op, not a discard action.

A same-URL browser history sentinel handles an ordinary single-step Back before the host leaves. This is NOT a replacement for application router integration or arbitrary multi-entry/cross-origin history navigation. The parent must continue routing every owned route/tab/unmount transition through its navigation guard. Actual browser behavior, including interaction with the real router, remains NOT_RUN here.

## 4. Actual validation in this run

No I18 previous PASS count, extracted-helper PASS or nominal test name is inherited as integration evidence.

| Check | Actual result | Exact boundary |
| --- | --- | --- |
| New API/bridge complete modules, Node 24.11.1 | **46 PASS, 0 FAIL** | Builtin TypeScript stripping of the entire two modules; synthetic local Node HTTP/fetch doubles and JSON cases; not ASP.NET, BFF, I18 runtime or SQL |
| Actual React host/I18/navigation provider, 320/360/390 | **NOT_RUN** | One explicit TAP skip: existing esbuild/React/application browser toolchain unavailable. The `ok ... # SKIP NOT_RUN` line is not a React PASS |
| Direct test command | Exit 0, 47 registered top-level cases | 46 executed passes + 1 NOT_RUN/skip. This is NOT full integration acceptance |
| Test `.mjs` `node --check` | **PASS** | Exit 0; syntax only |
| Three new FE TS/TSX modules and embedded React fixture | **PASS — syntax/transpile only** | Existing TypeScript 5.8.3; no syntax diagnostics. Not repo-version semantic typecheck |
| ASP.NET/Kestrel/cookie/CSRF tests | **NOT_RUN** | No `dotnet` executable/SDK. No C# compilation or C# test assertion ran |
| Full app typecheck / lint / build / existing broad suites | **NOT_RUN** | Complete pinned app and locked dependency tree absent |
| Actual host UI screenshots | **NOT_RUN / none** | No browser render was fabricated |
| Patch application and byte-for-byte output check | See `patch-check.json` in evidence | A partial, source-only application check; not a full checkout build or PR/CI result |

Observed direct command:

```sh
node --test --test-reporter=tap apps/medcom-sites/tests/inbound-request-integration.test.mjs
```

Node 24.11.1 was invoked from the existing Playwright driver installation, not the system Node 22 binary. The evidence archive contains the final TAP output, runtime limitations and a separate TypeScript syntax script/report. That script uses only the already installed TypeScript compiler; it does not validate React lifecycle or C#.

The Node cases cover full 500-row preservation, rejection of 501 rows, decimal/NULL/time values, explicit line changes/server IDs, separate Save/Send, lost ACK, byte-identical original reconciliation, all no-receipt outcomes, malformed receipts, duplicate taps, permission/CSRF fencing, transient workspace-null, late execute/reconcile responses, A→B→A reads, same-document stale reads, receipt callback fencing/order, acknowledged readback failure and strict response JSON/UTF-8.

Prepared but NOT_RUN C# cases use real Kestrel with ephemeral test TLS, cookie authentication and antiforgery, plus fake sessions/authority/I15. They do not call ApiHost.Build or read private configuration. They cover default-off behavior, auth/CSRF/origin/HTTPS, scope/branch/rights checks around awaits, strict request parsing, length/chunked body limits, exact DTO serialization, route-action matching and original-only reconciliation. The existing test project supplies xUnit; no TestServer package was added.

Prepared but NOT_RUN browser cases import the actual host and unchanged I18/navigation provider. They assert a visible dialog AND `qaLeft=false`, not merely absence of discard. They cover mobile widths; selection/filter/page/close/explicit Back/history Back; Send-only note and held preflight; pending execute/reconcile and double taps; every reconcile outcome; rights changes; transient workspace failure; old reads and pre-logout ACKs; real login retirement; acknowledged readback failure. Successful discard/navigation also has a positive callback/selection assertion. Browser traffic is confined to the local fixture and synthetic fetch/list adapters.

## 5. Minimal parent integration — instructions, NOT changes made here

Only Mika publishes/integrates, after coder 1 / I20 correction and review. Keep the marker untouched.

**API composition.** In the shared ApiHost composition, call `builder.Services.AddInboundDraftFacade()` before Build and `app.MapInboundDraftFacade()` after the existing authentication/authorization setup. Preserve cookie authentication, existing CSRF and no-store/error middleware. With only these calls the feature remains unavailable. No actual SQL registration is part of this candidate. A later qualified request-scoped access provider and I15 service binding must share the same database/company and live session resolver; do not register a test provider, generic SQL lookup or inferred capability as production authority.

**BFF admission.** Admit only the four exact method/path pairs. Keep existing list admission unchanged. Forward the original POST bytes, cookie, CSRF token and `X-Inbound-Scope`; do not reserialize, retry, redirect or infer action. Preserve no-store. Validate browser HTTPS/same-origin at the BFF, then forward validated fetch metadata or a correctly validated canonical Origin matching the backend's request authority. Do not blindly forward or rewrite an arbitrary client Origin to make it pass. Existing proxy limits must permit these bounded original requests and complete DTO responses without slicing. No broad prefix wildcard or new generic mutation proxy is requested.

**Workspace/router composition.** Render `InboundRequestScreen` under the existing `NavigationGuardProvider` and keep it mounted during workspace refresh/error. Pass authoritative workspace data, `loginKey` driven by real authentication lifecycle, and guarded parent `onClose`/`onBack` callbacks. The existing WorkspaceData/SessionView lacks a login-incarnation field: do not guess one from displayName/company/authorityVersion/expiry. Parent login/logout/account-switch handling must provide the signal; the full-read server scope independently verifies authority. A scope mismatch is locked, not automatically treated as a transient null or an invitation to redispatch. Never key the host/editor by selected document or changing rights. Finish reviewed router/history integration before claiming Back protection in the real application.

**Validation gates.** On the exact reviewed candidate with the existing locked dependencies and Node 24, run the new direct Node/browser file and require actual React execution with no NOT_RUN skip. Set `MEDCOM_BROWSER_TOOLCHAIN` only to an already approved existing Playwright toolchain when needed and `I21_TEST_BROWSER` only to an approved installed browser. Then run the existing frontend typecheck, lint and build and the unchanged I18 regression suite. Run:

```sh
dotnet test tests/backend/Medcom.Api.Tests/Medcom.Api.Tests.csproj --no-restore --filter FullyQualifiedName~InboundDraftEndpointTests
```

Use the approved restored backend test tree and SDK. The new test host does not load private configuration or execute legacy DLL/SQL. Resolve actual compile/test failures without changing excluded paths in this lane; shared repairs belong to Mika. A successful Node double alone must not satisfy the server/browser/integration gate.

## 6. Remaining limits and safety

No I15/I18, purchase, ApiHost, proxy, workspace, Documents, navigation provider, runner, dependency/lock, CI, schema or configuration file was modified. No private configuration, production data, SQL, legacy DLL, migration/journal setup, secrets, push, merge, deployment or automation action was performed.

Intent and evidence are memory-only. Refresh/tab close/crash can lose them despite unload warnings; this patch does not claim secure cross-reload recovery. Parent lifecycle signals and navigation composition are required. A receipt readback token that has been permanently superseded still needs the existing explicitly reviewed recovery workflow; no token ordering, override or hidden retry was invented. Create, cost edits, date/branch rebinding, QR mapping, stock posting and SQL activation remain closed. Real-provider qualification, all unrun acceptance tests and actual application mounting are still outstanding.
