# Self-host frontend source provenance

Canonical frontend source: `f15c194` (full revision below). Imported from the current redesigned application, not historical `src/frontend`. Prior mirror PR #54 head `e35eb6326b80b079ab52f17a5c32ed8732ac79db` remains unchanged.

Canonical full revision: `f15c194c0a66fc868daff1535ad6465e17138ab4`.

Preserved application/UI/assets and tests. Removed unused provider scaffolding:

- `.openai/hosting.json`
- `app/chatgpt-auth.ts`
- `build/connector-preview-plugin.mjs`
- `build/connector-preview-worker.mjs`
- `build/sites-vite-plugin.LICENSE`
- `build/sites-vite-plugin.ts`
- `build/sites-worker.ts`
- `cloudflare-env.d.ts`
- `components/connector-error.tsx`
- `db/index.ts`
- `db/schema.ts`
- `drizzle.config.ts`
- `drizzle/meta/_journal.json`
- `lib/connector-context.ts`
- `lib/connector-contract.mts`
- `lib/connector-errors.mts`
- `lib/connector-preview.d.ts`
- `lib/connectors.ts`
- `scripts/build-verified.sh`
- `scripts/connector-preview/connector-preview-session.mjs`
- `scripts/connector-preview/host-binding.mjs`
- `scripts/connector-preview/protocol.mjs`
- `scripts/execution-profile.mjs`
- `scripts/install-ci.mjs`
- `scripts/install-ci.sh`
- `scripts/install-pnpm.sh`
- `scripts/npm-install.mjs`
- `scripts/pnpm-install.mjs`
- `scripts/run-framework.mjs`
- `scripts/sites-env.mjs`
- `scripts/sites-env.sh`
- `vite.config.ts`

Runtime changes: native Node/Next standalone, server-only environment configuration, explicit public-origin POST validation, platform-specific immutable packages and Windows/Linux CI. No business endpoint, permission or mutation capability is added. Source provenance does not prove production acceptance.

## Bounded inherited-lint repairs

Full native lint exposed existing lifecycle/render violations. Four ERP components received behavior-preserving corrections: documents/lookup clear changed request scopes before commit; feedback initializes clocks lazily; workspace uses hydration-safe preference snapshots, current-value history handlers, keyed login/detail state, cancellable requests and immediate sensitive-state resets. No lint rule was disabled for these repairs. The logo uses an unoptimized Next Image element serving the original bytes.

Canonical `app/globals.css` is byte-identical (SHA-256 `7acb494fd3e2fdbacb547e0bfa78dfc666390c19648f5bac193729abe88075e6`). Canonical logo is byte-identical (SHA-256 `328bedc270d441943b8c0e144dece20ade3a7f1d334a0703f07af6ce1a826cb9`). Retained direct dependency versions are unchanged; only unused provider packages were removed and the previously transitive test bundler was made explicit.

Local compilation/state tests do not replace interactive keyboard/mobile/hydration and real IIS/ERP acceptance. These remain required before production admission.
