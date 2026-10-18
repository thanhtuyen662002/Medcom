# Medcom Developer documentation

Docusaurus 3.10.2. Separate static technical documentation; the existing Next.js app on port 3000 stays independent. Default local docs port: **3001**. No deployment, authentication, database mutation or business command is performed by this project.

## Run

Node.js 20+ (verified with the available Node 24 runtime).

```bash
npm ci
npm run generate
npm start
```

For a production static build:

```bash
npm test
npm run build
npm run serve
```

`build/` contains deployable static assets. `url` in `docusaurus.config.js` is a placeholder (`https://docs.medcom.example`), not an existing published service. Set the deployment URL and `DOCS_BASE_URL` before hosting under a real domain/subpath. No hosting or automation configuration is modified.

## Evidence and regeneration

- `contracts/openapi.json`: exact bytes downloaded from the owner-provided URL.
- `contracts/provenance.json`: hash, retrieval time and counts.
- `contracts/coverage.json`: generated coverage audit.
- `scripts/generate.mjs`: reads `/help` sidebar and sanitized catalogs in the same monorepo; creates 276 API pages, module field dictionaries, sidebars, search and AI exports.
- Handwritten architecture/integration guidance lives in `docs/foundation/` and `docs/agents/`.
- `src/components/Operation.jsx`: request/response schema explorer with examples, headers, security and vendor extensions. It does not execute live requests.
- `static/llms.txt`, `static/llms-full.txt`, `static/context/`: machine-readable context. Examples are synthetic schema sketches, not accepted transactions.

```bash
npm run sync
npm run generate
npm test
npm run build
```

Review snapshot and mapping diffs before publishing. Metadata endpoints returned 401 without a session during intake. Static catalog facts do not prove deployment/runtime equality. Full ERP/DB Library archives were unavailable for direct re-verification; no raw SQL, ERP binary, secrets or business rows are included.

## UI verification

`tests/browser.mjs` uses an existing Playwright installation supplied by `MEDCOM_BROWSER_TOOLCHAIN` and native Edge (`MEDCOM_EDGE_PATH` optional). Start the docs preview first, then run `node tests/browser.mjs`. Captures and receipts stay in ignored `.test-runtime/`.
