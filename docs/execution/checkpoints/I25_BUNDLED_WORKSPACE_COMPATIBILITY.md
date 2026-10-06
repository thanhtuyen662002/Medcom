# I25 — Bundled workspace compatibility

## Scope and evidence

- Admission: `docs/execution/direct-runs/I25.json`, base `079eb767a47cb266bed36be5a34931282835b20f`; root owns publication and integration.
- Candidate prepared from accepted source tree `210e7b4552aa10036ac25951d7d1ad057ed82a2a` in an isolated copy. No changes to the separate `apps/medcom-sites` frontend, backend, SQL, private settings, dependencies or workflows.
- `src/backend/Medcom.Api/AuthEndpoints.cs`, `/api/workspace`, emits the exact purchase-request navigation href when `purchase-requests.read` is present. The prior `src/frontend/lib/contracts.ts` enum did not include it. The prior `lib/api.ts` allowed the resulting Zod error to fall through to its generic network message.
- An independent synthetic-fetch reproduction loaded the exact delivered d324 `wwwroot/_next/static/chunks/0t9t45_s-ydl4.js` (SHA-256 `a1e659a6fc7d958039ebd8742c11feefae7e7af39d4de2c57ce7468e807fc32f`). HTTP 200 without purchase navigation parsed; adding the exact purchase-request href produced `ZodError` at `navigation[1].href` and the generic network message. HTTP 401 remained a distinct `ApiError`. This reproduction alone is bundle/contract evidence, not a real login or document-read acceptance test.
- No new ERP or SQL semantic claim is made. Existing source-baseline identities and runtime/release gates remain unchanged. The owner subsequently supplied an actual `/api/workspace` response, reviewed by the root coordinator: it contained a valid session and all four known navigation entries, including purchase requests. `branchIds` was empty; the owner stated that the administrator intentionally has an empty BranchID. No identity values or raw response are retained here. This confirms the triggering response shape; document reads, administrator branch semantics and production acceptance remain UNKNOWN.

## Changes

1. Accept only the additional known `/workspace/?screen=purchase-requests` href; keep the closed href allowlist and strict response objects.
2. Filter both menus to exact implemented id/href pairs and preserve server-granted navigation. The bundled client does not implement purchase requests or infer permissions from a URL.
3. Direct unsupported or ungranted screen selections show an explicit unavailable message with a return-to-overview action. The overview explains the separate business frontend requirement without inventing its deployment URL.
4. Malformed successful API JSON/schema responses and malformed readiness responses become a sanitized `invalid_response` error. Preserve correlation IDs internally; never expose response bodies or validation details. Actual transport errors and HTTP authentication failures retain their distinct handling.
5. Add API/schema, pure navigation and synthetic desktop/mobile browser regressions. Fixtures explicitly distinguish frontend contract tests from backend identity/SQL/business acceptance.

## Local validation

Environment: Node `24.19.0`; no installed project Zod, TypeScript, Next.js or Playwright test runner. No dependency installation attempted.

- PASS: `node --experimental-strip-types --test tests/navigation.test.ts`, 2/2 tests. Covers supported routes, absent grants, mismatched pairs and unsupported purchase requests.
- PASS: `python tools/backend/check_architecture.py`.
- PASS: patch application check against the accepted source snapshot.
- BLOCKED / API test bodies NOT_RUN: `npm test` cannot import `zod`; the two pure navigation tests pass within that invocation.
- NOT_RUN: `npm run typecheck` (`tsc: not found`).
- NOT_RUN: `npm run build` (`next: not found`).
- NOT_RUN: `npm run test:e2e` (the available `playwright` command has no `test` subcommand; the project test runner is absent).

These checks do not constitute a complete frontend pass or a rebuilt delivery. The existing d324 ZIP is unchanged.

## Required before acceptance

Run pinned dependency installation and the complete existing exact-head/base CI: frontend contracts/types/build, backend aggregate checks, packaged candidate integrity, packaged HTTPS browser tests, and the existing standalone Linux/Windows frontend checks. Obtain independent review, resolve current-head findings, and verify tested provenance before root integration. Deliver a newly built candidate only after those gates pass. Owner-side real authenticated workspace validation and all existing business/production gates remain separate.
