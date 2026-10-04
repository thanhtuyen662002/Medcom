# Medcom Web

Next.js/React/TypeScript static-export frontend with Tailwind, local shadcn-compatible Radix/CVA Button primitives, TanStack Query and closed Zod API contracts. The same ASP.NET Core process serves exported pages and the API; the browser never loads Tool.dll, queries SQL or receives legacy passwords/connection strings.

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Use `tools/deploy/package.py` from the repository root to combine the export and the API. `npm run test:e2e` exercises the packaged app over a test-only TLS host after packaging and `npx playwright install chromium`. Node 24, Python, OpenSSL and the configured .NET SDK are required. Set `MEDCOM_DOTNET` when dotnet is outside PATH.

Routes: `/` is login; `/workspace/` fetches a freshly authorized workspace. Exported HTML contains no protected data. No session, credentials or drafts are stored in local/session storage. CSRF tokens remain transient; password inputs are cleared after submission. Cached protected data is cleared on hidden/pagehide, revalidated on return, and fenced during logout. Other tabs are invalidated through BroadcastChannel where supported; every API request independently revalidates server authority. A fixed return-route allow-list prevents open redirects.

The initial workspace contains server-filtered navigation, session status, explicit Continue Session and readiness. It does not contain fake business records or invented ERP CRUD screens. Business Grid/metadata, dynamic screen compilation, admin policy/configuration, report/export, accessibility qualification and real user-flow acceptance remain pending verified ERP/SQL contracts.

Browser tests use the real packaged unavailable-provider API for rejected login/direct-route checks. One separately labelled synthetic frontend contract fixture renders an authorized workspace; it is not a successful legacy login or business acceptance result.

## Typed read-only pilots

Purchase-order and inbound-request lists consume two allow-listed API shapes, with server-provided navigation and branch IDs, bounded search/pagination and keyboard-accessible dense tables. A requested route is not a grant; API and final SQL checks remain authoritative. Cache/session fences hide retired data on logout/return/error. No amount/customer/patient fields, writes, approvals or exports are exposed by these lists. Both pilots are explicit server configuration gates and require real ERP grants.

The separate private runtime fixture runs actual SQL + owner DLL + HTTPS browser login/Grid/search/scope-denial/logout; it is not a mocked frontend acceptance. General browser checks still label their synthetic frontend contract separately. See `tools/legacy/README.md`; complete business/production admission is not established.

The two read-only pilots include bounded line detail panels. Enter or the document-number button opens details; Escape closes and restores focus. Exact decimal strings preserve ERP precision. No unit conversion, monetary fields or write actions are inferred. Error responses hide previous detail rows; tenant/company/authority/document/page keys scope the query cache.
