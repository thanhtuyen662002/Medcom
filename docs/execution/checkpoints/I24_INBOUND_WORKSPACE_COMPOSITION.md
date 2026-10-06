# I24 — dormant inbound Workspace/API/BFF composition

## Source and authorization boundary

- Implementation dependency: accepted I21 merge `d3244e8a3576e1dd3b510e43df3a37fbadf98d18`, tree `1380d0946e6e620f9796e9573cfb4ee0fb7439e5`. The local source was materialized from that exact tracked tree, not the stale local publication checkout's HEAD.
- Immutable admission: `docs/execution/direct-runs/I24.json`, control `626dc73494531aceb457dda63d301e523da661e4`, historical admission base `6fb09ec1edad74262b32412497c7b3d636dedcbc`. Its bytes and dependency-at-admission statement remain unchanged; acceptance of I21 subsequently removed that dependency's pending status without rewriting admission history.
- Design input: the read-only I21 Workspace/BFF integration plan. It did not grant authority beyond the I24 marker. Root remains the sole publisher.
- No SQL, database metadata, private server settings, DLL, source archive, deployment or business-write qualification was performed. No package, lockfile, workflow, I15/I18 implementation, purchase implementation or SQL configuration was changed.

## Composed behavior

1. Workspace mounts the existing inbound host in its inbound screen arm. It does not substitute paginated document detail for a full inbound draft read. The parent creates a nonsecret in-memory login incarnation only on initial authenticated Workspace success, rotates it synchronously on successful explicit login, and retires it on confirmed current 401/logout/deadline. Retirement is sticky until a new confirmed login. Workspace refresh, authority versions, session deadlines, document selection and retained receipts do not define that identity.
2. Transient null Workspace retains the mounted closed host and its original unknown intent/receipt. A narrow mobile exception prevents outage auto-home from discarding the inbound host. The explicit recovery button uses the parent's existing verification path, fences and polling/deadline lifecycle. A retained draft or previously observed scope never establishes current authority.
3. Workspace owns composed history. The child sentinel remains the standalone default and is suppressed only by explicit `historyOwner="workspace"`. Owned indexed history entries are restored before guard prompts; cancellation preserves position and the Forward stack. Approval traverses once and rechecks current blockers at its asynchronous commit. Navigation queued during traversal is checked again at execution. Unowned/cross-document history remains a browser boundary; `beforeunload` continues warning for registered custody.
4. The shared guard rechecks all currently registered blockers when an old discard button is clicked. Newly nondiscardable work cannot be cleared by the old dialog. Dirty and receipt blockers register at layout commit.
5. The bridge notifies the host/parent only for current-generation explicit read or command 401, including current read-sequence checks. Late/superseded errors do not retire a new login. 403, 409, 503 and transport loss keep original custody; they do not authorize logout or replacement execute. The bridge continues retaining the original object, operation ID, scope and serialized bytes, and reconciliation remains explicit.
6. ApiHost registers/maps the existing facade helpers. Its production providers remain unavailable. No SQL command service or trusted command-access provider is registered. The BFF admits only GET draft and POST save/send-to-warehouse/reconcile, verifies browser provenance and opaque scope, and supplies the configured canonical backend Origin only after validation. CSRF/cookie allowlists, no-store, finite cancellation/timeout, redirect rejection and no writer retry remain in force. Only the three inbound command POSTs receive the 1 MiB byte limit; authentication remains 16 KiB. Bounded streaming, media/charset, encoding, BOM, fatal UTF-8, object-root and length validation precede original-byte forwarding.

## Tests and honest execution status

The existing inbound test file retains its prior 46 Node cases and all 44 standalone React scenarios. New cases load the whole production proxy modules, cover exact method/path admission, guard rejection before transport, byte limits and stream cancellation, real loopback original-byte Save/Send/reconcile captures, and current versus stale 401 notification. Added actual Workspace/client/BFF/synthetic-HTTP scenarios exercise three mobile widths, null-outage recovery, pending/lost ACK, receipt readback, old discard dialogs, Back/Forward position and queued traversal races, all navigation surfaces, current 401, both deadlines, failed/successful logout and delayed new-login reads with old deadline/401 completion.

The existing backend test file adds 12 actual ApiHost composition cases. They pass an explicitly owned, harmless external `PrivateConfigPath` before Build, disable Legacy, use test-owned TLS and synthetic sessions, inspect actual route metadata/default DI and authenticated unavailable envelopes, and preserve the original standalone facade fixture behavior. Test source is not a claim that these cases executed.

Observed locally with Node 24.19.0:

- 51 Node cases PASS: original 46 plus five new grouped BFF/401 tests.
- Required full inbound command: 51 PASS, two hard missing-toolchain failures, zero skips. The original React gate and new Workspace gate could not run because the installed application React/esbuild toolchain is absent. Neither gate was disabled or converted into success.
- Production TSX syntax parsed using the already available Playwright bundled Babel parser; test file passed `node --check`. This is syntax evidence only, not pinned TypeScript semantic validation.
- Whitespace/scope/source checks pass locally. Immutable marker bytes match admission exactly.

NOT_RUN locally: pinned lint/typecheck/build/package smoke, actual React/browser scenarios, unchanged I20 custody/I18/QR execution, .NET build/analyzers/tests, Linux/Windows exact-head/current-base CI. The environment has no local application dev dependencies or .NET SDK; no install, dependency substitution, permission bypass or test suppression was attempted. Root must obtain passing exact composed-head/current-base hosted gates and independent source/privacy review before acceptance.

## Open qualification gates

This is dormant synthetic-tested contract wiring, not production functionality or acceptance. Current authoritative menu/branch Update and separate new-Send admission, real login/database binding, journal/transaction/concurrency semantics, actual SQL/legacy execution, target deployment and real runtime acceptance remain separate qualification gates. Cross-tab cookie replacement has no true incarnation field in the current Workspace DTO; a mismatched opaque scope remains locked and requires confirmed reauthentication rather than rebinding retained intent.
