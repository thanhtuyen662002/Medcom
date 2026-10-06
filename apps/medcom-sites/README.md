# Medcom ERP — self-hosted frontend

Current redesigned React/Next workspace imported from the canonical frontend; see `docs/SELF_HOST_SOURCE_PROVENANCE.md`. The historical `src/frontend` is not served by this application.

Build with Node 24 and pnpm 11.25.0: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Package and verify with `pnpm package`, `pnpm verify:package <package-directory> <commit-sha>`, then `pnpm smoke <package-directory> <commit-sha>`. Windows deployment artifacts must be built and tested on Windows x64.

The pinned pnpm configuration uses `nodeLinker: hoisted` so Windows standalone tracing does not carry absolute pnpm dependency junction targets into the deployment tree. Keep this checked-in layout and use a fresh dependency installation when switching from an older isolated checkout. The frozen lockfile and dependency versions are unchanged. Packaging still rejects any traced link escaping the standalone root; it never falls back to copying the original checkout's dependencies. See [pnpm linker settings](https://pnpm.io/settings/node-modules#nodelinker) and the [upstream Windows standalone report](https://github.com/vercel/next.js/issues/95450). Native Windows package verification and smoke remain required.

Native Next standalone runs behind a dedicated IIS frontend site. The existing .NET 10 API runs in a separate IIS in-process site/app pool with true HTTPS. Configure server-only `MEDCOM_API_ORIGIN` and `MEDCOM_PUBLIC_ORIGIN` privately; neither belongs in browser environment variables. See the repository `docs/deployment/SELF_HOSTED_IIS.md` and `docs/SITES_API_HANDOFF.md` (retained filename for source continuity).

Preserved UI: responsive navigation/mobile drawer, command search, favorites, themes/density, ERP login/session controls, purchase/inbound lists/details, branch/search/paging/grid controls, transfer-stage navigation, diagnostics and adapter-gated editor/report/configuration components.

Only published, allowlisted ERP endpoints are enabled. Unsupported business actions have no fabricated data or success. Build and synthetic checks are not whole-ERP production acceptance. No private configuration, credentials, raw DLLs, SQL dumps or real records are included.

## Tab return and read-state continuity

Purchase-order search text, applied search, branch, list page, selected document,
line page and scroll positions stay in memory during a tab hide, authority check
or transient read outage. Hidden/returning tabs, lost authority evidence and known read failures mask the
affected protected data until fresh verification succeeds. A continuously visible,
unchanged-scope background check keeps the last verified read-only view mounted;
purchase actions stay disabled from the parent authority request through the
fresh document/grant response. Periodic data and command-grant checks continue. The
selection is reconciled with the refreshed page; a document no longer present
closes. Observation-version increments, expiry renewal and set ordering do not
reset these controls. This does not add cross-screen or reload persistence.

Workspace and generic document responses carry two response-only correlation
headers: `X-Medcom-Session-Scope` and `X-Medcom-Read-Scope`. The API creates opaque,
domain-separated digests bound to its high-entropy server session token. The
read marker also binds canonical principal/tenant/company/capability/branch
scope, excluding observation counters and expiry. Neither header is an
authentication token or permission grant. The modern client requires both
headers and compares document replies with its verified workspace; missing,
malformed, mismatched or canceled replies cannot become displayed rows. The
public response JSON and bundled `src/frontend` contract are unchanged.

The BFF and optional local HTTPS relay forward these bounded response headers
only on successful named GET reads. They never forward browser-supplied marker
values upstream. Confirmed logout, session replacement or effective rights
changes retire view controls and prior query data. Existing I24 write-intent
custody remains separate from read-view state. No protected rows, markers or
read controls are added to local/session storage.

`node --test tests/workspace-retention.browser.mjs` exercises the actual composed
Workspace with synthetic HTTP data/cookies, real fetches, controlled visibility
and focus events, and real tab activation in an installed Chromium/Edge. It
covers desktop/mobile outages, version/expiry refresh, scope/session replacement,
errors, selected-document removal and abort-ignoring late responses. Use the
existing locked toolchain; the test fails rather than installing or skipping
missing prerequisites. This browser fixture is not real ERP/SQL acceptance.
