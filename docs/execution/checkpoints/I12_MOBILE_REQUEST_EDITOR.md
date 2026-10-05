# I12 mobile purchase-request editor — local review candidate

Admission: Draft PR #64, run `c948c1e7-91ae-42e0-a293-50d6724fe8d2`.
Base `2f337a5b06000b9ad8b37f064e0e6ef9b995f2d0`; immutable control
`453e2f96ffeacbd26437ddc34a0ffbeca2bf0588`, tree
`6588a00f2ffbeca936ca58ba8e0996e7edc6efdd`.
Fresh checkout: `task-8/medcom-i12-c948c1e7`, local branch
`local/i12-c948c1e7`. Parent is the sole publisher/integrator.
Only the four admitted new worker files change. The admission marker is unchanged.
Independent re-review, payload transfer, publication and current source/base CI
are still pending. The first independent review blocked P1/P2; v2 passed those
probes but was blocked by A-to-B-to-A authoritative-result precedence (P1).
This v3 candidate contains its bounded correction. No production acceptance is claimed.

## Delivered boundary

`mobile-request.tsx` exports an internal typed React props seam:
`MobileRequest`, `MobileRequestAccess`, `MobileRequestAdapter`,
`PurchaseRequestSnapshot`, `PurchaseRequestIntent`, `PurchaseRequestResult`.
`mobile-request-lines.tsx` provides single-column line cards and exact integer
validation. These are UI contracts, not published HTTP routes or ERP command
semantics. There is no import or mount in workspace/navigation/BFF/API.

Parent supplies a stable adapter; a scope key identifying the current
principal/session/company; explicit read/edit/save/submit availability; current
branch/currency/purpose choices and lookup IDs; input budgets; and a normalized
initial snapshot. A null scope, revoked read grant, absent adapter, unavailable
service or malformed snapshot fails closed. Parent must change the scope key
at a principal/session/company boundary, including a new login to the same
account. Only that boundary retires the component. Current choices, adapter and
read/write grants can refresh within the same scope without discarding an
unresolved intent. Revoked read access hides input and aborts/fences pending
results; restoring it within the same scope still requires reconciliation.

The form has header fields, cancellable existing RemoteLookup controls, line
cards with add/remove, an explicit review step and reachable 44px actions.
Input stays in component memory. No localStorage, logs, HTTP calls, fallback
rows, generated ERP document number, calculated monetary totals or status
transitions are introduced. Local line keys and submission UUIDs identify UI
inputs/intents only. Parent/backend must enforce source-requiredness, numbering,
lossless varchar encoding, permissions, derived values and transaction rules.
At least one line before service submission and a maximum 100-line descriptor
are bounded Web input policy here, not claimed legacy save semantics.

Save and submit are different intents. A confirmed result must bind the
original intent ID/action, receipt, document ID (for an existing request), opaque
version and draft/submitted acknowledgment. A submitted acknowledgment makes
this bounded editor read-only; no downstream action is offered. An unchanged
confirmed draft may be reviewed/submitted if explicitly authorized, without a
fabricated dirty edit. Parent callback failure cannot erase a confirmed outcome.

Pending dispatch locks all inputs/actions. Rejection retains input and field
errors. Conflict retains the input, blocks writes and offers explicit discard
in favor of the supplied authoritative snapshot. Lost ACK, malformed response
or mismatched acknowledgment becomes unknown. Reconciliation receives the same
deep-frozen original intent; it never calls execute again. Parent must implement
reconciliation with a read/probe, never redispatch. Scope changes abort work and
fence results even when the adapter ignores cancellation. Existing dirty
navigation guard is reused; pending/unknown results prohibit discard through it.

A changed selected document ID in the same scope replaces the displayed fields
and binds subsequent execution to its own ID/version. During a pending or unknown
outcome, the editor hides previous-document inputs and queues the current
selection. It offers only reconciliation of the original intent, then opens a
different queued document after a definitive result. If the selected document
is the one just confirmed, the confirmed snapshot/version takes precedence over
stale queued props: a submitted request stays read-only, and a confirmed draft
uses the acknowledged version for any later authorized submit. Another
document's receipt, values or submitted status cannot be applied to the queued
document. Replacement dispatch
stays blocked while the original outcome is unknown. Choice refresh has no
component key; only the principal/session/company scope does.

## Source binding

Inspected main metadata `inventories/source/20261002/table-07.json`:
`AP_PurchaseRequestDetailTbl` source line 23200 and `AP_PurchaseRequestTbl`
line 23221. Quantity, UnitPrice and Budget are decimal(18,0); strings retain
all 18 digits without Number/parseFloat conversions. Source integer validation
does not invent positive-only rules; backend business validation remains required.
Known represented string bounds include PersonSuggest 500, Department 100,
ObjectID 100, ItemID 50, TimeRequired 200 and Model 50. Date is nullable and
checked only when supplied. nvarchar(max) inputs use caller-supplied Web budgets.

Parent's independent source handoff on 2026-10-05 identifies enabled menu
`05011`, caption Đề nghị mua hàng, form `AP_PurposeRequestListFrm`, generic
EDIT registry `AP_PurchaseRequestTbl/PurchaseRequestID`, and detail
`AP_PurchaseRequestDetailTbl/UserAutoID`. Parent reports source states 1 draft,
2 pending approval, 3 approved, 4 rejected, 5 sent purchase order; request submit
sets 2/isLock1. These findings are attributed to that handoff, not a new private
archive inspection by this worker. The UI renders only supplied status labels.
Separate Gửi đặt mua hàng / AP_Order creation is outside I12.

Existing purchase-orders HTTP/UI remains `AP_OrderFrm` / menu050129 /
`AP_OrderTbl`, not purchase request. Existing IV inbound read is also separate;
the historical AP_InputRequest caption is not silently aliased to it.

Generic save/numbering/grant precedence/transaction semantics, real HTTP command
contract, DB binding and runtime acceptance remain UNKNOWN. Source researchers
and the parent own those gates. No action is wired to existing PO GET routes.

## Observed verification

- Windows x64, Node **22.14.0** currently on PATH, installed Edge
  **154.0.4258.53** and installed playwright-core from the I05 harness.
- `node --test tests/mobile-request.test.mjs`: **22/22 PASS**, no skipped or
  cancelled tests. One pure source-shaped bounds test, 20 actual React/browser
  interaction cases and their parent browser test. No browser page errors.
- Covers adapter/grant denial, validation/focus, line add/remove/lookup, 18-digit
  precision, duplicate submit, unchanged draft submit, distinct acknowledgments,
  rejected/conflict/unknown, same-intent reconciliation, malformed/mismatched
  ACK, late reply after scope switch/revocation, parent callback failure,
  existing dirty navigation and 390x844 layout/keyboard controls. The four added
  regressions cover same-scope choices refresh after lost ACK; A-to-B selection
  and outgoing ID/version; A-to-B selection during unknown plus reconciliation
  of A before B opens; and A-to-B selection while A's ACK is pending. Two further
  A-to-B-to-A regressions cover pending ACK and unknown reconciliation. Each
  checks submit retains the authoritative fields and submitted lock without a
  second execution, and saveDraft retains the acknowledged version for a later
  submit. A controlled test-only resolver makes pending timing deterministic.
- Final TypeScript `tsc --noEmit --incremental false`: PASS. Targeted ESLint for
  both components and the test: PASS, no output/errors/warnings.
- Screenshot `.test-runtime/i12-mobile-request-review-v3/synthetic-mobile-editor.png`
  visually inspected: single-column fields and line cards fit at 390px, exact
  18-digit input readable, review action accessible. Fixture-only CSS positions
  existing dialog/overlay slots; this is not full application visual acceptance.
- Test receipt `.test-runtime/i12-mobile-request-review-v3/browser-result.json` records
  runtime/browser/viewport and synthetic-only scope.

First sandbox clone failed network connectivity; the exact public clone was
then allowed through environment review. First esbuild attempt failed sandbox
directory/path resolution; Windows paths were normalized and the same test was
allowed through environment review. First browser run exposed harness focus
timing, missing fixture dialog stacking and cross-test abort counting; fixed the
harness without removing assertions. Complete rerun passed.

Independent review reproduced lost-intent remount on choices refresh (P1) and
stale fields/identity when a different document is selected (P2). Both corrections
remain in the original four admitted files; all original assertions remain.
Final lint initially caught ref access during render. Render now uses React state
for unresolved/boundary flags; committed access and queued snapshot refs update
in a layout effect. The final complete browser run, typecheck and targeted lint
pass. No assertion was disabled to obtain these results.

Independent v2 review reported 6 probes passing and 2 A-to-B-to-A probes failing,
with replacement dispatch using the stale A version. Worker read only the
specified synthetic reviewer evidence at
`task-7/i12-review-v2-dd4cb6e1/apps/medcom-sites/.test-runtime/independent-v2-probe-result.json`.
Both new regressions first failed against the unchanged v2 component; the 18
existing browser cases still passed. The v3 production change adds one explicit
confirmed-document identity comparison and uses the existing confirmed-result
path when it matches. It adds no new framework state. Final complete run passes
22/22; red and green run logs are preserved under the v3 evidence directory.

No installation or global Git security setting was changed. Existing installed
dependencies are read through an ignored junction in the new checkout; no old
checkout is edited. Node24 native build/package and the original 16 BFF/browser
cases were not run here. I12 is not mounted in that app. This test runs actual
React/Edge with loopback-only synthetic adapters, not Next BFF, ASP.NET, SQL,
Tools.dll, IIS/TLS, WinForms concurrency or actual customer operations.

## Corrected code SHA-256

- mobile-request.tsx: `f2944fb1f01da63e6dfc5e04ebb5aa4a70559c50e46da5d85999f3e8d68af8dc`
- mobile-request-lines.tsx: `974b240adcd31b5d54125a0ddb2f5f0749a1795b86af4580788b7edf0264de50`
- mobile-request.test.mjs: `7cd2529dd6adcee9422f67de883f0690e556cd118800ad561ef3d90f5860bfe4`

Original frozen tree `c218ee8ffa358d6bb2cfe9001df78e0ba1a8825d` is preserved.
The original `.test-runtime/i12-mobile-request/` artifacts are unchanged:

- freeze-receipt.json SHA-256 `a2facee73d8db96e664b7581761ee04a757af41187db499ae9835685e5c5ad69`
- transfer-receipt.json SHA-256 `768d3f5fd8cf8e91c1fcf6d56f3c81f3bbcafdfaba61ac11b8a71694a7cf71cd`
- candidate-full.diff SHA-256 `7c49df116d9ced418be228e8516c35522298fdd32fb7176fb1b57b8653e2f34f`

V2 frozen tree `dd4cb6e1ca7a47007bc508837cfda773ae03ccec` and its artifacts in
`.test-runtime/i12-mobile-request-review-fix/` are also preserved:

- freeze-receipt-v2.json SHA-256 `15711b4ffedb19be5f11e59a35ae25e6534f278176c7573b8a22a98b2b51204e`
- transfer-receipt-v2.json SHA-256 `595b00f699843fcb947532c43e90b7de502fa5a16385fea97662df329133498e`
- candidate-full-v2.diff SHA-256 `8735984dff8d317c5730f5c2f43a1346e8196f33564e39220d6ed92686d7d62b`
- review-fix.delta.diff SHA-256 `6289106ad50c361fccba486235569d40dca9cf29860a0add19cf708a7c35d6a4`

V3 corrected-tree receipt, full candidate diff and v2-to-v3 delta use
new files under `.test-runtime/i12-mobile-request-review-v3/`. They are local,
ignored review artifacts; no source payload has been transferred or published.

Privacy scope: only public source metadata, source code and explicitly synthetic
form values were used. No SQL connection, private archive/DLL execution,
credential/customer-data read/export, production API call, deployment, upload,
push, new claim, security/configuration change or activation occurred. Parent
must independently review the exact frozen tree and privacy receipt before any
payload transfer/publication or wiring.
