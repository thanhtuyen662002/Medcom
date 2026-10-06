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
