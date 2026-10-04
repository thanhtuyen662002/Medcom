# Medcom ERP — Sites frontend

A private ERP workspace on Sites, maintained independently from the .NET/SQL backend. The GitHub mirror lives in thanhtuyen662002/Medcom under apps/medcom-sites.

Node 24; committed pnpm lockfile. Install: pnpm install --frozen-lockfile. Development: pnpm dev. Typecheck: pnpm exec tsc --noEmit. Tests: node scripts/test-erp.mjs. Worker build: pnpm build.

.openai/hosting.json identifies the Site. Runtime MEDCOM_API_ORIGIN is intentionally unset until an authorized deployed ERP HTTPS origin is supplied. Read docs/SITES_API_HANDOFF.md before connecting.

Implemented: responsive navigation, fixed mobile bottom bar and authorized menu drawer (admin role configuration awaits backend API), command search, favorites, themes/density, ERP login/session controls, purchase/inbound list/detail clients, search/branch/paging/columns, separate transfer stage navigation, connection diagnostics.

Data calls require a deployed backend. Approval, transfer writes, reports, sales and accounting services are not present in the observed API. They return no mock data or false success. Publishing the frontend does not establish whole-ERP production acceptance.

No real data, SQL dumps, binaries, passwords or backend secrets are included. Synthetic fixtures are restricted to tests.
