# Fixed purchase-request read workspace — I17

I17 connects the current Medcom Sites workspace to authorized purchase-request
list, open and lookup queries. It does not complete create/save/submit or activate
business writes. Every write control is disabled with an explicit qualification
message. `AP_PurchaseRequestTbl` is separate from `AP_OrderTbl`; the existing
`purchase-orders` and inbound pilots retain their identities and behavior.

## Admission and dependency

- Immutable I17 control: `104e03172843b8309727ac5e5d8a083300e6ee23`, tree
  `f6a1a4c1182463f7c3c9f8bad05bd5345bbfe6d7`, base
  `a615a3e5e8b0e46a0ed8ce2c4fe1cd80ab52b5fa`.
- The 19-path marker is `docs/execution/direct-runs/I17.json`; it is unchanged.
- I14 typed contracts, canonicalizer and fixed SQL are unchanged dependencies
  from accepted `b842195396f200f07d7782b68db4f8a088967f2a`, published by the parent
  as `1a4ed0556a1bd2f8e7d73c0e95d97e850a3cd987` / tree
  `5591b88a2a4b1fe03badedbc3a824bc0ce44dfa4`. Parent integration requires I14's own
  review/hosted CI. I17 does not include an I14 implementation delta.
- Current frontend: `apps/medcom-sites`, Next standalone / Node 24 BFF.
  `src/frontend` is only the existing locked synthetic browser toolchain here.

## Fixed HTTP contract

All successful responses are `{ scopeKey, data }`. `scopeKey` is a one-way,
feature-specific opaque session identity, not the session bearer token. It stays
stable across authority/branch observation refreshes and changes on a new login.
The client verifies it on list, detail and lookup responses before accepting data.

| GET route | Inputs | Data |
|---|---|---|
| `/api/purchase-requests/workspace` | none | Current branch IDs, `writeAvailable: false`, qualification reason, five fixed lookup states |
| `/api/purchase-requests` | `page`, `pageSize`, `search`, `branchId` | Authorized summaries, page, page size, `hasMore` |
| `/api/purchase-requests/detail` | `documentId` | Complete I14 aggregate and exact `prs1.` state-equality token |
| `/api/purchase-requests/lookup` | `kind`, `search`, `page` | Availability/reason, bounded choices, page, `hasMore` |

Only these four GET paths are admitted by the BFF. There are no new POST routes.
Unknown/duplicate query fields are rejected. Pages are 1–1000, list page size
1–50 (the UI uses 20), search at most 100 characters, and document/branch IDs use
the I14 physical identifier bounds. Native branch lookup pages contain 20 IDs.
The existing BFF query-size, origin, cookie, timeout and TLS policies are unchanged.

Invalid queries return 400; unavailable/hidden parents return 404; denied current
authority returns 403; unavailable source reads return 503. Existing cookie
authentication supplies 401 for missing, expired or revoked sessions. Responses
are not cached. SQL exceptions, private settings, stored credentials and payloads
are not logging fields or HTTP diagnostics.

## Authorization and complete readback

The API and workspace use the distinct `purchase-requests.read` capability.
Capability discovery adds only the exact native `05011` /
`AP_PurposeRequestListFrm` route, current Run grant and enabled parent `05`.
The shared `SqlLegacyPolicy` and the two existing pilot grants are unchanged.

The production query service is request-scoped. It captures the current server
session token and resolves `IWebSessions` again before and after each query. It
uses the validated existing `SqlLegacyUserStore` connection factory. Current
credential stamp, enabled user/group, physically bound group/direct/delegated
grants and native branches are checked in an owned Serializable read transaction.
The read releases its transaction by rollback; it has no journal, allocator,
procedure, DML, DDL or schema-application path. Default foundation composition and
`Legacy:EnableReadOnlyPilots=false` register an unavailable reader. Configuration,
readiness, security policies and production activation are not changed.

Before returning data or a token, a fixed read-only `sys.columns` / `sys.types`
check requires the source's exact 14/9-column sets, types, lengths, nullability and
precision/scale. It never reads or applies a command schema. Raw decimal/date
values are also validated before display formatting, so an incompatible target
cannot silently round fractions or milliseconds into an apparently valid token.

Principal/group/menu/branch predicates retain Unicode binary identity and byte
length guards. The parent read fetches native SQL-equal matches and rejects an
ambiguous or physically different parent. Child selection deliberately fetches
the full native SQL foreign-key relation before rejecting case/accent/space
aliases, including children that an exact-only filter would silently hide.
Line identity aliases and byte-identical duplicate IDs in other parents also
invalidate the readback. The list checks the complete native-equal master
identity set, including duplicates outside the requested branch/page.

All 14 header and 9 detail source columns are represented by the unchanged I14
aggregate. Decimal values remain invariant strings; optional NULL values remain
NULL; source wall-clock timestamps retain milliseconds without timezone
conversion. I14 normalization and equality-token generation are reused, rather
than reimplemented. Its 500-line aggregate bound fails closed on a larger source
document; no partial aggregate or token is returned.

The accepted I12 component is mounted only for a representable read-only
projection. A separate complete read-only presentation always preserves header
price/rate/timestamp, line IDs/totals and NULL versus empty values. Documents with
101–500 lines or a NULL source date use that complete presentation directly.
No source values are truncated to make a document appear editable. List, search,
branch, paging, open, close and refresh use actual HTTP adapters. Authority changes
hide previous rows synchronously; aborted and late responses cannot restore them.

## Lookup and write gates remain open

Branch IDs come from current `SY_User.BranchID` / `SY_UserBranch.BranchID`
authority. Their labels are those actual IDs, not invented branch names.
Other business lookups return `available: false`,
`reason: source_binding_unqualified`, no choices and no more pages.

| Candidate source metadata | Remaining unknown |
|---|---|
| `inventories/source/20261002/table-02.json`: `CF_ItemTbl` | Effective F4 binding and disabled-item filters |
| `inventories/source/20261002/table-01.json`: `CF_ObjectTbl` | Effective F4 binding and object/branch filters |
| `inventories/source/20261002/table-08.json`: `AP_PurposePurchaseTbl` | Effective purpose binding/filter |
| `CF_CurrencyTbl` / `CF_CurrencyRateTbl` | Effective currency binding and date/rate precedence |

No rate, purpose, currency, identifier mask, detail registration or clock default
is inferred from these table names. The parent numbering investigation retains
unknown effective purchase masks/detail registration/query locks and transaction
compatibility; it does not require another SQL export. Do not substitute inbound
`DN` numbering, AP_Order semantics or the server clock.

Further write wiring needs qualified numbering (including added purchase lines),
the journal/runtime gates, I14 original-intent read-only reconciliation, and an
I12 guard requiring confirmed save before submitting an existing dirty draft.
Command payload limits need their own bounded BFF admission. The I14 equality
hash is not a monotonic revision and does not detect delete/reinsert ABA. Those
gates, source SQL/index/locking behavior and real target acceptance remain UNKNOWN.

## Offline validation and publication boundary

`PurchaseRequestQueryTests` run the production SQL orchestration against recording
connections with only synthetic rows, including native equality aliases.
`PurchaseRequestEndpointTests` use the actual API host, generated fixture-only TLS,
real `LocalWebSessions` and that same reader with recording connections. They
cover query rejection, current native/session rights, branches, expiry, logout,
scope refresh, exact aggregate data, unavailable lookups and absent write dispatch.

`purchase-request-integration.test.mjs` is explicitly registered by the existing
test runner. It requires the installed browser and `playwright-core`, and fails
if unavailable. Its actual loopback HTTP/BFF/browser fixture mounts the existing
workspace and fixed screen, performs read controls, and checks full 101-line/NULL
fallbacks and late authority fencing. Only Next image rendering is shimmed for
the standalone fixture bundler; authorization, data adapters and BFF use production
code. Its synthetic upstream is not evidence of real SQL or ERP runtime behavior.

Local .NET commands use the supplied 10.0.401 SDK, with
`DOTNET_GENERATE_ASPNET_CERTIFICATE=false` and first-run skip set before every
call. Tool configuration/package cache and host configuration are isolated;
private SQL/DLL opt-in environment variables are cleared. No real SQL or ERP
binaries are needed by these tests. No dependency/lock/config/schema changes,
push, deployment or activation are part of I17. Parent owns independent code/
privacy review, exact-head/base hosted CI and serial publication, including the
acknowledged I16 runner-registration overlap.

### Historical worker evidence — not rerun by this review

The following counts are copied from the original worker handoff; they are not
results of this review or evidence for the corrected current-main composition.

Observed on the admitted base with the four unchanged I14 production dependency
files: 39 new backend checks pass; the complete backend partitions total 509
passes and three existing private-runtime skips. The configuration-selector class
runs separately with its own synthetic files, avoiding the empty host override
needed by HTTP fixtures. The complete frontend suite passes 127/127 with zero
skips; typecheck and scoped lint pass. Installed Node is 24.19.0, Edge is
154.0.4258.53, and the local browser harness is Playwright 1.63.0. The actual hosted
locked toolchain, current-main/I14/QR composition, independent review and real SQL
acceptance are separate parent gates; these local results do not close them.


## Bounded review correction against pinned main b283d05

Pinned main is `b283d057615120ad9b3f96abfc1e7259cb725e09`. The four I14
production blob IDs match the receipt. Seven existing-file patch preimages also
match pinned main; the test runner differs because main has the QR suite. The
main-target patch preserves both QR and purchase-request registrations. The
immutable I17 admission marker and I14 dependency sources are not changed.

Corrections are confined to I17's admitted paths:

- Session extension/logout continuations capture an authority generation before
  awaiting I/O and suppress late success/error after logout, account replacement
  or unmount. Extension no longer begins a new authority read after its generation
  has been retired, nor reports success after a failed workspace read.
- The purchase reader reuses `workspaceStateScope`, remounts on an observable
  identity/authorization boundary, hides prior data on a new workspace
  observation and resets local selection/filter state on an opaque scope change.
- Selected-document 404/unavailability has a separate error region with a working
  Close action and a freshly authorized list. 401/403/scope conflict, malformed
  responses and list failures still fail closed. No old detail is kept on error.
- Fixed SELECT predicates reject byte-identical duplicate master/line identities
  outside the visible branch or parent, in addition to native-equal aliases.

New evidence was produced by an isolated Node 22 / TypeScript fragment harness,
not the complete app: 18 checks pass (14 executed production function/expression
checks with fake I/O/JSX construction, three SQL-predicate model checks, one syntax/transpile check).
The unchanged input fails nine of those checks. This is not React/browser/BFF,
C# compilation, SQL syntax/locking or full typecheck evidence. The normal frontend
integration-test invocation fails to load because `esbuild` is missing. Full
backend/browser/typecheck/lint and an actual full-main checkout apply/build remain
NOT_RUN. Corresponding repository regressions are added for parent execution.
No real SQL, TLS-policy change, private configuration read, business write,
publication, merge or deployment is performed. This correction is not production
acceptance. Pinned-toolchain exact-tree integration and independent re-review of
these new corrections remain required.

## I20 — existing-document command bridge (current additive boundary)

The I17 sections above are historical read-slice evidence. I20 extends only the
admitted PR72 scope; it does **not** activate business writes or qualify SQL.
Implementation integration base: `b1eb57077c2112a808c7ce2e581511741fa971a1`.
Immutable I20 control: `074637d9c0b8819fcafec9e61a80b98abbeac170`.
The marker retains its original base/dependency wording unchanged. I19 is now
merged in the integration base; no old overlay or pending I19 candidate is used.

### Fixed transport and server gates

Four POST endpoints are added: `/api/purchase-requests/save`, `/submit`,
`/save/lookup`, `/submit/lookup`. The latter two accept the original Save/Submit
DTO and invoke **only** the corresponding merged I19 `LookupAsync` overload.
`GET /api/purchase-requests/lookup` remains the catalogue lookup. No Create route,
Add change, generic dispatcher, allocator, SQL/schema or I19 implementation change.

`ApiHost` registers `UnavailablePurchaseRequestCommands` and
`UnavailablePurchaseRequestCommandAccess`. Enabling read-only pilots cannot replace
them. Synthetic fixtures may replace both services explicitly. A real
`IPurchaseRequestCommandAccess` provider is still missing: it must prove live native
EDIT for menu05011 / AP_PurposeRequestListFrm, exact document/branch authority and
binding/schema/journal/runtime qualification. This observation never replaces the
existing command implementation's transaction-native and session fences. No
`runtimeQualified=true`, database factory or production configuration is introduced.

GET detail supplies additive `commandAccess` flags (default false, including
`canAddLines=false`), independent of the read capability. Submitted/locked documents
cannot advertise Save/Submit. Lookup admission is separate so a recorded intent
may be checked without advertising a new write.

All POSTs retain cookie authentication and ApiHost antiforgery middleware. They
require HTTPS, a single exact same-origin Origin and `X-Purchase-Scope` matching
the opaque current session scope. Fresh server sessions and branch membership are
checked around provider/command awaits; post-dispatch revocation prevents receipt
release. The real command implementation retains its own native authority checks.
A final-grant failure is not permission to re-execute a possibly committed command.

BFF raises its streaming input budget to exactly 1,048,576 bytes **only** for the
four exact POST routes. Auth retains 16,384 bytes. Declared and chunked oversize
input, invalid UTF-8, malformed JSON, BOM, non-object command roots and non-JSON
content types fail closed. BFF validates the browser's configured public Origin,
then sends the fixed backend Origin for its server-to-server hop, along with the
existing filtered cookies, CSRF token and opaque scope header. Redirects remain
rejected; upstream fetch and responses are no-store. No certificate bypass is used.
ASP.NET independently bounds/decodes/parses the body and rejects duplicate, missing,
unknown and case-aliased property names and nonmatching JSON kinds before dispatch.
It validates but passes the original typed DTO unchanged into I19.

Actual Contracts serialization is pinned, not guessed: command outcome numbers
are Committed=0, Replayed=1, InvalidInput=2, Denied=3, Conflict=4,
QualificationRequired=5, Unavailable=6, OutcomeUnknown=7, Cancelled=8. Lookup numbers
are Committed=0, Pending=1, Absent=2, InvalidInput=3, Denied=4, Conflict=5,
QualificationRequired=6, Unavailable=7, Cancelled=8. Only line-change kind has the
string converter: `Update` / `Remove` here; `Add` is rejected. API validates receipt
identity/action/key, canonical aggregate/equality token, status/lock, no allocation
and the requested effects. HTTP 200 alone is not confirmation.

### Raw aggregate overlay and existing mobile editor

`purchase-request-command-adapter.ts` implements the existing MobileRequest seam.
It never sends `mobilePurchaseSnapshot` as a writer DTO. It retains the complete
raw aggregate, copies it, then overlays only supported edits. Header price,
rateExchange, source SQL wall-clock (including NULL) and every untouched line's
totalPrice/NULL/empty/decimal-string value survive. No money is computed. Decimal
integer edits use exact BigInt/string canonicalization with the source 18-digit
bound, never Number/parseFloat. Full raw readback remains visible.

Supported controls: requester, department, notes, purpose/client description,
existing-line quantity/unit price/budget, time required and model; existing lines
may be removed. Branch, SQL date/time, item/object/currency/purpose bindings and
hidden price/rate/total fields are locked. No fabricated options or default values.
`canAddLines=false` is explicit; an attempted added/duplicated line is also rejected
by the adapter and server. Up to the inherited 500-line source bound is retained;
there is no slicing to fit the editor. Larger source/intent bounds still fail
closed, not partially. The backend canonical escaped-JSON budget can be more
restrictive than the raw UTF-8 transport budget for large Unicode documents.

Unchanged nullable text preserves NULL rather than becoming empty. A user can type
new text or clear an existing string to empty; explicit NULL-to-empty with no
visible edit, empty-to-NULL toggles and clearing a non-NULL numeric budget to NULL
are not exposed by this editor. They must not be inferred from a blank control.

Dirty Submit is blocked: Save must return a valid confirmation first, then a
separate intentional Submit uses the receipt token. DTO/key and serialized bytes
are frozen before the first dispatch await. Double taps do not re-execute. Unknown
custody accepts only a valid Committed lookup; Pending/Absent/Denied/Conflict/
Unavailable/cancelled/invalid responses retain the exact original command. A
replacement DTO, key, scope, incomplete receipt, wrong effect or old token cannot
resolve it. No automatic retry or reconstructed lookup body exists.

The reader retains the editor outside its busy/error fragments and never keys it
by document token. Selection, page, search, branch, close and manual refresh use
the existing navigation guard; a synchronous retained-intent check closes the
pre-effect double-tap/navigation interval. Authority/adapter changes fence late
responses but do not discard unknown custody. Only a true login/lifetime/company
boundary or observed opaque server-scope change retires that custody. Reconciliation
through a replacement adapter is disabled rather than silently reconstructing an
intent. Confirmed receipt is kept through refresh failure; another edit requires
a successful authorized read. Submit after a confirmed Save remains a separate
operation using that confirmed aggregate/token. Each read captures a command epoch;
a GET begun before dispatch or acknowledgment cannot replace the confirmed receipt
or satisfy the fresh-read requirement for another edit.

R2 keeps session lifecycle ownership in the existing parent `Workspace`. A transient
`workspace=null` caused by network/503 is only an unverified interval: the purchase
reader stays mounted under the last verified session tuple so its frozen DTO/key/JSON
and bridge remain in memory, but filters, selected-document data and editor UI are
hidden and `canRead=false` fences any late command acknowledgment. The screen does
not call `getWorkspace` itself and does not hold a second recovered Workspace object.
Its verification button invokes a parent callback that reuses `loadWorkspace` and
the existing `AuthorityFence`; successful recovery updates the parent `workspace`,
therefore the normal focus/online/60-second polling resumes. The parent also retains
only the last verified idle/absolute expiry deadline while `workspace` is temporarily
null, so a known expiry still ends custody during an outage; recovery replaces that
deadline from the newly verified workspace. Purchase bootstrap, opaque scope, branch
and document grants still must pass before any data or control is shown again.

The parent passes only a confirmed-end bit derived from current HTTP 401/session
expiry/completed logout. That signal, a completed-login boundary, a verified session
tuple change or opaque purchase scope change remounts/retires old custody. A current
purchase-reader 401 also retires the bridge immediately, clears local filter/page/
selection state, and is propagated to the parent so a delayed writer ACK cannot
revive the old editor before the confirmed-end render arrives. Network/503 does not
set this bit and cannot by itself destroy the retained original intent.

### New evidence and limits (2026-10-06)

- Executed this run: 46/46 Node tests on transpiled **actual candidate** adapter and
  BFF modules. This includes one real local HTTP hop through production BFF logic
  to a Node synthetic upstream. It is **not** ASP.NET, React or SQL evidence.
- Isolated strict BFF TypeScript check passed for proxy.ts and proxy-policy.ts with
  installed TypeScript 5.8.3 / Node 22.16.0. This is not the pinned full-app toolchain.
- Application suite launch failed before tests loaded: `ERR_MODULE_NOT_FOUND` for
  `esbuild`. Do not count a startup failure as an executed business test.
- Source-authored ASP.NET/Kestrel fixtures cover auth/CSRF/origin/scope, default-off
  admission, bounded fixed/chunked bodies, malformed input, actual enum binding,
  Save/Submit, lost ACK lookup, every negative lookup outcome and revocation.
  They reuse synthetic identity/read source and command doubles, never real SQL.
  Compile/analyzers/xUnit are NOT_RUN here (.NET SDK absent from PATH/full checkout unavailable).
- Source-authored React mobile cases cover Save→Submit, double tap/navigation,
  all lookup outcomes, failed refresh, authority/adapter/document/session changes.
  The actual-Workspace custody group retains all eight R1 scenarios and adds parent
  focus-authority refresh after same-session recovery, both idle/absolute expiry
  after recovery, and a purchase-reader 401 with a delayed ACK. Those cases assert
  exact original JSON/key/token custody and one writer dispatch. Actual browser
  execution is still NOT_RUN here because the partial environment cannot import
  `esbuild`; source/model checks are reported separately and are not React evidence.
  The tests require the existing pinned Playwright/browser/dependency environment
  and do not skip or install a browser.
- In-memory tab custody is not crash recovery. beforeunload warns; forced reload,
  tab/process loss and recovery of a frozen DTO after browser restart are not
  qualified by this slice. Equality tokens do not claim monotonic/ABA protection.

Parent must inspect the full delta, verify exact preimages/dependency pins on a
complete checkout, run the pinned full suites and independent review, and qualify
the missing native admission/provider/DB/runtime separately. No push, merge,
deployment, SQL/DLL execution, private configuration read, TLS weakening or
production activation is part of this handoff.
