# Medcom ERP — self-hosted frontend

Current redesigned React/Next workspace imported from the canonical frontend; see `docs/SELF_HOST_SOURCE_PROVENANCE.md`. The historical `src/frontend` is not served by this application.

Build with Node 24 and pnpm 11.25.0: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Package and verify with `pnpm package`, `pnpm verify:package <package-directory> <commit-sha>`, then `pnpm smoke <package-directory> <commit-sha>`. Windows deployment artifacts must be built and tested on Windows x64.

The pinned pnpm configuration uses `nodeLinker: hoisted` so Windows standalone tracing does not carry absolute pnpm dependency junction targets into the deployment tree. Keep this checked-in layout and use a fresh dependency installation when switching from an older isolated checkout. The frozen lockfile and dependency versions are unchanged. Packaging still rejects any traced link escaping the standalone root; it never falls back to copying the original checkout's dependencies. See [pnpm linker settings](https://pnpm.io/settings/node-modules#nodelinker) and the [upstream Windows standalone report](https://github.com/vercel/next.js/issues/95450). Native Windows package verification and smoke remain required.

Native Next standalone runs behind a dedicated IIS frontend site. The existing .NET 10 API runs in a separate IIS in-process site/app pool with true HTTPS. Configure server-only `MEDCOM_API_ORIGIN` and `MEDCOM_PUBLIC_ORIGIN` privately; neither belongs in browser environment variables. See the repository `docs/deployment/SELF_HOSTED_IIS.md` and `docs/SITES_API_HANDOFF.md` (retained filename for source continuity).

Preserved UI: responsive navigation/mobile drawer, command search, favorites, themes/density, ERP login/session controls, purchase/inbound lists/details, branch/search/paging/grid controls, transfer-stage navigation, diagnostics and adapter-gated editor/report/configuration components.

Only published, allowlisted ERP endpoints are enabled. Unsupported business actions have no fabricated data or success. Build and synthetic checks are not whole-ERP production acceptance. No private configuration, credentials, raw DLLs, SQL dumps or real records are included.
