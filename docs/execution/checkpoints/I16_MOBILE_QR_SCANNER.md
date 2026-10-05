# I16 mobile QR scanner local handoff

Admission: Draft PR #68, run `42f64d10-c33e-4806-8b1f-4b45a0bb227c`.
Base `f8f4b108a8441d0ada9bda9a00251a7554fcb47c`; control/immutable claim
`37224a3e993dbb9922acf8442b181adb1ce045d3`. Author checkout is isolated
under `task-9/i16-qr`, local branch `local/i16-qr`. Parent is sole publisher.
The admission marker remains unchanged. Nine admitted files change; existing
request editors, navigation, API/BFF, SQL, I11 and other worktrees are untouched.

## Delivered source

- `QrScanner` uses existing Dialog/Button/Input components and application styles.
  It exposes `open`, a nonempty session/scope key, `onOpenChange`, `onConfirm`,
  and an optional title. Null/empty scope hides it. A caller must replace the key
  on every login/session/authorization boundary and validate the destination field.
- Camera access begins only after Start. Acquisition requests video with a
  preferred rear camera and `audio: false`. Preview is muted and inline.
- Bundled exact `jsqr` 1.4.0 lazily decodes in memory, independent of native
  BarcodeDetector. Frame sides are at most 960 pixels; decode attempts are at
  most four per second and sequential. Text is bounded to 1,024 UTF-16 units /
  4,096 UTF-8 bytes; empty/control-containing text is rejected.
- Detection stops capture before showing one candidate. Confirmation is explicit;
  markup and URLs remain opaque, escaped text. No navigation, lookup or business
  dispatch occurs in scanner code. No frame/payload upload, storage or logging.
- Every track is stopped on detection, close request, unmount, scope change,
  background and pagehide. Pending acquisition/preview/decode is generation
  fenced. Late streams are stopped without attaching to an abandoned preview.
  Returning foreground never restarts capture automatically. Canvas and video
  references are cleared. A close request stops capture even if a caller delays
  changing its controlled `open` value.
- Denied/missing/unsupported/insecure/error states offer manual entry. Dialog
  controls have 44px minimum touch height, keyboard/manual focus, Escape, and
  opener-focus restoration. Errors show finite application messages, not raw
  exception details.
- The only frontend policy delta is `camera=()` to `camera=(self)`; microphone,
  geolocation and every other header remain unchanged. Package/lock changes add
  only exact `jsqr` 1.4.0; no other dependency versions change.

## Observed verification

Windows x64, existing Node 24.19.0, pinned pnpm 11.25.0, existing Edge
154.0.4258.53 headless. No runtime or browser was installed. Normal dependency
installation used the isolated task store and the existing repository policies.

- Existing ERP/proxy/runtime/standalone tests: **97 passed**, no failures/skips.
- New unit/decoder/lifecycle tests: **13 passed**, no failures/skips. Actual jsqr
  reads a fixed synthetic version-1/L QR upright, inverted and rotated. Fake
  media/preview/decode promises cover late acquisition, old-preview/new-scan race,
  scope/cancellation, all-track release, frame/rate bounds and finite errors.
- Actual React/mobile browser interactions: **9 passed**, no uncaught exceptions.
  Includes explicit Start, actual local decoder without BarcodeDetector, one
  confirmation, denied/manual fallback, escaped input, pending-close cleanup,
  background/fresh Start, scope retirement, unmount/pagehide, delayed controlled
  close, unsupported camera, URL non-navigation, 390px layout, 44px controls,
  Escape and focus restoration. getUserMedia was replaced before application
  code loaded; video came only from a generated synthetic canvas stream. The
  disposable browser profile was torn down and removed. No camera grant/hardware.
- TypeScript and native Next standalone build pass. Existing routes remain `/`,
  `/_not-found`, and dynamic Node `/api/erp/[...path]`.
- Full lint: zero errors, one existing TanStack Virtual incompatible-library
  warning in `components/erp/grid.tsx`; no suppression or unrelated fix.

Reproduce from `apps/medcom-sites` using Node 24 and existing dependencies:

```text
node scripts/test-erp.mjs
node --test tests/qr-scanner.test.mjs
node tests/qr-scanner.browser.mjs
pnpm typecheck
pnpm lint
pnpm build
```

The QR test entries deliberately stand alone because the shared runner is outside
I16 admission. Parent integration must register them in the existing runner/CI.
Browser tests use an existing Edge path on Windows; `QR_TEST_BROWSER` can select
an existing Chromium/Edge executable elsewhere. They never install a browser.

Browser verification repaired a real DOMException classification defect and an
old-preview promise race. Two earlier harness failures came from clicking or
measuring during the existing dialog animation; final checks wait for animation
completion without weakening product assertions.

## Custody, privacy and remaining gates

Live PR #68 head/base and immutable claim were rechecked on 2026-10-05 UTC.
I12 (#64), I14 (#66) and I15 (#67) have separate exact scopes; no new QR claim
overlap was found. Historical #54 remains preserved as the prior frontend source.

No credentials, real QR payloads, camera images, customer rows, SQL/private
configuration or production API were accessed. No OS/browser permission grants,
server/IIS changes, deployment, push, claim creation or source payload transfer.
Source is frozen locally for independent review; self-checks are not independent
approval. Parent must review the exact tree, publish, pass exact-head/base CI and
wire the scanner into the accepted fixed request editor/API flow. The scanner is
not yet reachable from a production request screen. Real Android/iOS camera,
host HTTPS/permissions-header behavior and customer workflow acceptance remain
NOT_RUN/UNKNOWN. Business writes and production admission remain gated.

## Focused P2 correction after independent review

Prior frozen tree `cd2bfef84288966ef86f4aca7fd6c27f79674379` and its original
metadata receipt are preserved. The reviewer reproduced a candidate remaining
confirmable after Cancel when the caller delayed setting controlled `open=false`.
Stopping the stream alone did not retire that candidate.

Every close request now synchronously invokes the body cancellation handle:
invalidate its confirmation ref, stop the camera/generation, clear candidate
state and render a stopped/closing message with no scanner/input/confirmation
controls. The confirmation and Start handlers also check the immediate ref.
Unmount fences old handlers. A controlled close/reopen or scope remount creates
a fresh body; it starts empty and still requires explicit Start/manual input.
Strict Mode's initial setup/cleanup replay is covered and does not leave a new
scanner incorrectly cancelled.

Added actual-component regression holds the parent open after decoding, tests
both Cancel and Escape, checks candidate/control removal, attempts the retained
old confirmation button, and observes no new confirmation. After reopening it
checks no new camera acquisition, disabled confirmation and empty manual input.
The complete browser suite now runs in React Strict Mode: **10/10 pass**. Existing
**97/97** and actual decoder/lifecycle **13/13** still pass under Node 24.19.0;
corrected targeted lint, typecheck/native Next build pass. A test-driver DOM
serialization error was corrected by returning void after retaining the button;
no product assertion was weakened.

Only scanner source, its admitted browser test and this checkpoint change from
the old freeze. No runner/editor/API or dependency changes accompany the fix.
Corrected hashes are held in a separate metadata receipt for focused independent
re-review; no source export, publication, real camera or production call occurred.
