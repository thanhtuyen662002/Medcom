# Medcom ERP — self-hosted frontend

Current redesigned React/Next workspace imported from the canonical frontend; see `docs/SELF_HOST_SOURCE_PROVENANCE.md`. The historical `src/frontend` is not served by this application.

Build with Node 24 and pnpm 11.25.0: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`. Package and verify with `pnpm package`, `pnpm verify:package <package-directory> <commit-sha>`, then `pnpm smoke <package-directory> <commit-sha>`. Windows deployment artifacts must be built and tested on Windows x64.

Native Next standalone runs behind a dedicated IIS frontend site. The existing .NET 10 API runs in a separate IIS in-process site/app pool with true HTTPS. Configure server-only `MEDCOM_API_ORIGIN` and `MEDCOM_PUBLIC_ORIGIN` privately; neither belongs in browser environment variables. See the repository `docs/deployment/SELF_HOSTED_IIS.md` and `docs/SITES_API_HANDOFF.md` (retained filename for source continuity).

Preserved UI: responsive navigation/mobile drawer, command search, favorites, themes/density, ERP login/session controls, purchase/inbound lists/details, branch/search/paging/grid controls, transfer-stage navigation, diagnostics and adapter-gated editor/report/configuration components.

Only published, allowlisted ERP endpoints are enabled. Unsupported business actions have no fabricated data or success. Build and synthetic checks are not whole-ERP production acceptance. No private configuration, credentials, raw DLLs, SQL dumps or real records are included.
