# Full-stack continuation — 2026-10-02

Current source truth: the extraction correction below supersedes earlier zero-procedure and missing-source statements in this chronological record.

## Owner goal and source access

The owner requested Tool.dll from the ERP archive, unchanged password verification, BE/FE completion and an owner-deployable production ERP. Ten schedules remain paused; the direct lead continues the existing PR #44 at its observed head `86c2b0e41efe602fbe439cd22435e912c7ced635` without parallel GitHub writers or force pushes.

Exact and shortened title searches and uploaded-file/Shared with me listings did not resolve the approved baseline ZIPs. Materializing the exact IDs in SOURCE_BASELINE returned `403 user_mismatch`; no alternative-account identity or password bypass was attempted.

The accessible Page `page_6abe30af283c8191a18194b559e82fb5` contains separate `ERP_Medcom2026.zip` and `MedData-Data.zip` references. Authorized metadata inspection reports 162,176,322 and 134,249,929 bytes respectively, different from the approved baseline sizes. The available file interface cannot resolve those Page references to downloadable bytes. They were not opened or hashed. This confirms links exist, not Tool.dll presence/identity or DB equivalence. Accessible archive attachment/materialization is required for the next integration step; a changed source set needs an explicit baseline/disposition record.

## Implemented product code

- Typed identity/session application boundary with no Tool/SQL types exposed.
- Bounded server session authority, cryptographically random tokens indexed by SHA-256, server-owned identity/company/tenant, default 1440-minute inactivity, absolute expiry and restart revocation.
- Authority revalidation on authenticated requests, permission-version advancement without relogin, identity/scope mismatch rejection, late-result/logout fences and no idle extension by passive traffic.
- HTTPS/CSRF-protected login/logout/Continue Session, exact username/password JSON schema, bounded login rate/concurrency, secure cookies and safe failures. Default provider is unavailable; test identities remain exclusively in tests.
- Next.js/React/TypeScript login and responsive workspace, TanStack Query, Zod contract validation, Radix/CVA primitives and Tailwind; transient browser state and safe return URLs.
- Static BE/FE packaging on one ASP.NET port, per-build CSP script hashes, staging deployment instructions, checksummed candidate archive and CI packaging/browser checks.

## Local acceptance

- Release analyzer build: zero warnings/errors.
- Backend: **28/28 tests pass**, including actual HTTPS HTTP lifecycle and distinct tenant sessions on one port; legacy provider is a labelled test fixture.
- Frontend contract tests: **4/4 pass**; TypeScript and Next production build pass.
- Packaged HTTPS browser checks: **4/4 pass**; rejected real unavailable-provider login, direct-route fencing, mobile layout and a labelled synthetic workspace/logout contract.
- Reference preparation suites: **23/23 pass**, kept separate from product/runtime acceptance.
- Production npm dependency audit: zero reported vulnerabilities at this observation; this is not a complete security review.
- Visual inspection: desktop/mobile login and synthetic workspace screenshots reviewed.

The browser run found a same-tab BroadcastChannel/query-cache race during logout. Retiring-session fencing prevents self-broadcast/refetch from racing the confirmed navigation; the browser regression now passes. Initial latest Playwright browser downloads failed; a pinned 1.56.1 toolchain successfully downloaded from the official vendor fallback and ran all checks. Checks were not disabled.

## Release truth

This is a **server candidate**, not a production ERP release. Real Tool.dll/SQL login, tenant data-source bindings, durable security audit, business screens/queries/commands, transaction effects, report/export fixes, recovery/performance and representative runtime acceptance remain pending. T1/B4, B2/#21, exhaustive traceability and the five R2J findings are not closed. Readiness remains 503 and login returns 503 until a verified identity adapter is installed. No real database, legacy process, password bypass or production deployment was performed. Independent review and exact new-head hosted CI must be observed before integration.

## Source recovery and actual adapter checkpoint

The owner subsequently attached all three source files. Their bytes were read/hash-verified and a new technical round recorded without replacing the historical archive identity. The previous access limitation is resolved for this round. See `docs/erp/OWNER_SOURCE_RECOVERY_20261002.md`.

Implemented since the earlier foundation checkpoint:

- A pinned process-isolated Tools.dll normal stored-password worker; the legacy system-password exception is excluded. Actual source DLL valid/wrong/other-user/malformed checks and modified-DLL rejection pass.
- Parameterized SQL identity/group reads, credential/group revocation, explicit current group/user/delegated menu grants and conservative branch assignments. Authority generation and session fences protect permission/scope changes.
- Typed purchase-order and inbound-request list queries, allow-listed search/pagination, final SQL account/group/credential/menu/branch checks and no amount/PII fields or write/report/export endpoints. Two FE screens have server-filtered navigation, branch selection, dense keyboard-accessible tables, pagination and search. Both pilots default disabled and require trusted server configuration plus explicit grants.
- Cached bounded schema/DLL health probes; healthy dependencies do not imply completed business admission. Ready status remains 503 with a separate business-release gate.
- A quote-aware SQL metadata scanner and finite manifest for 596 tables, 211 views, 109 functions and two sequences. No executable procedure/trigger definition is in this dump; SQL embedded in backup INSERT rows is excluded. Pilot metadata exposes seven missing internal-transfer check procedure candidates, not their SQL bodies.
- Actual source table DDL + SQL Server 2025 Developer + owner DLL + HTTPS browser evidence with synthetic fixtures only, including scoped Grid/search, crafted other-branch denial and logout/replay. Reproducible private-fixture tooling is in `tools/legacy/README.md`.

The observed backend count is 37 source-free product tests plus two explicit private runtime tests; ordinary public CI cannot claim the latter when fixtures are absent. Frontend contracts/types/production build, four packaged browser checks, three scanner tests and 23 reference suites pass at this checkpoint. The runtime receipt records exact bounded claims and limitations.

Release status is now **BLOCKED_BUSINESS_AND_RUNTIME_ACCEPTANCE**, not source-access blocked. Missing current procedure definitions, complete mutation/approval/transfer/posting/report/export effects, full legacy host contexts, durable security auditing, operations/performance and independent review/deployment-host acceptance remain open. No raw dump data or real user was restored, no complete ERP production release/merge/deployment occurred, and all ten schedules stay paused.

## Scoped line-detail continuation

Continued from live PR #44 head c6f6f5cdf4613743a62b042abfc64e9df973e456, whose hosted CI 36999860097 was observed green before edits. Fixed purchase-order/inbound line-detail APIs now use actual T0/T1 table bindings, parent scope checks in the same statement, exact decimal strings, bounded deterministic pagination and indistinguishable hidden/missing-parent 404s. Monetary fields, notes and unverified unit conversions remain absent. FE opens details by document button/Enter, closes by Escape with focus restoration, and contains dense quantity tables on mobile.

Validation: 37 source-free backend tests, two owner-DLL/disposable SQL/HTTPS runtime tests using ten source DDLs, five frontend contracts, typecheck/production build, four packaged HTTPS browser checks, four scanner/binding regressions, finite catalog validation and 23 reference suites pass. Runtime exercises both detail shapes, maximum-precision/null quantities, empty pages, orphan/other-branch denial, injection, invalid IDs, company mismatch and current grant revocation. Desktop and mobile synthetic screenshots were inspected. The package, read-only SQL grants and receipt are updated. New-head hosted CI must be fetched after publication; release and independent-review gates remain open.

Hosted CI first detected that the new supplemental detail binding file was absent from the strict directory registry. The registry now explicitly includes it and cross-checks its table/column/source hashes against the finite catalog. A regression rejects stale hashes, different tables/join columns and monetary projection widening. All four scanner/binding checks pass locally; the hosted repair must pass on its new head before integration.

## Full archive extraction correction

The owner identified that proc/trigger definitions are in the supplied data ZIP. Rechecking the ZIP member against local bytes found a truncated extraction (1,015,021,568 of 1,212,595,716 bytes). A complete binary extraction now matches ZIP CRC and has hash 61a8744c7a9a007b13ef37fbda26ea8c78af11fcc469963a528eba9469174096. The corrected catalog has 609 procedures and 1,527 total declared objects/33 members; all seven missing transfer candidates are present among 28 transfer procedures. Stored-definition metadata additionally covers 188 declarations/160 distinct module names, including six trigger records/three names with retained versions. The missing-source blocker is removed; complete product/business/runtime/operations acceptance remains open.

A third private runtime test executes the seven actual source checks plus their delegated helper using three actual source transfer table DDLs and synthetic rows in a disposable SQL database. It verifies owners/assignments/status boundaries, linked deletion denial and source null-PM behavior. No production database/data or Web mutation was used. Archive/candidate/embedded-definition regressions now total nine tests. Verified extraction tooling atomically replaces private files only after complete size/CRC/hash checks; catalog metadata records source size/hash and CI cross-checks them.
