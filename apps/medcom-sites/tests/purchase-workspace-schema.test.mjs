import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('.test-runtime/p2-workspace', { recursive: true });
await build({
  stdin: { contents: 'export {getPurchaseWorkspace} from "./lib/erp/purchase-request-api"; export {ApiError} from "./lib/erp/api";', loader: 'ts', resolveDir: process.cwd() },
  outfile: '.test-runtime/p2-workspace/api.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external',
  alias: { '@': process.cwd() }, logLevel: 'warning',
});
const { getPurchaseWorkspace, ApiError } = await import('../.test-runtime/p2-workspace/api.mjs');
const scopeKey = 'a'.repeat(64);
// Production response shape from P2-01; all identifiers and values are synthetic.
const fixture = (patch = {}) => ({ branchIds: ['QA-BRANCH'], writeAvailable: true, writeReason: '', lookups: [
  { kind: 'branches', available: true, reason: null, evidence: 'synthetic fixture' },
], ...patch });
const invalid = error => error instanceof ApiError && error.status === 502 && error.code === 'invalid_api_response';

async function withPayload(data, run, scope = scopeKey) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ scopeKey: scope, data });
  };
  try { await run(calls); } finally { globalThis.fetch = previous; }
}

test('PR workspace accepts true/empty reason through the real request parser without changing write authority', async () => {
  const data = fixture();
  await withPayload(data, async calls => {
    assert.deepEqual(await getPurchaseWorkspace(), { scopeKey, data });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/erp/api/purchase-requests/workspace');
    assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.cache, 'no-store');
  });
});

test('PR workspace preserves false/reason and arbitrary string reasons without inferring permissions', async () => {
  for (const writeAvailable of [true, false]) for (const writeReason of ['', 'numbering_journal_runtime_unqualified', 'QA_OTHER_REASON']) {
    const data = fixture({ writeAvailable, writeReason, additionalMetadata: 'QA' });
    await withPayload(data, async () => assert.deepEqual((await getPurchaseWorkspace()).data, data));
  }
});

test('workspace rejects missing and wrongly typed write flags/reasons', async () => {
  for (const key of ['writeAvailable', 'writeReason']) {
    const values = key === 'writeAvailable' ? [undefined, null, 0, 1, 'true', {}, []] : [undefined, null, true, 0, {}, []];
    for (const value of values) await withPayload(fixture({ [key]: value }), () => assert.rejects(getPurchaseWorkspace(), invalid));
  }
});

test('relaxing write literals retains workspace scope, branch and lookup validation', async () => {
  for (const patch of [
    { branchIds: [] }, { branchIds: [''] }, { branchIds: [42] }, { branchIds: Array.from({ length: 201 }, () => 'QA') },
    { lookups: [{ kind: 'invalid', available: true, reason: null, evidence: 'QA' }] },
    { lookups: [{ kind: 'branches', available: 'true', reason: null, evidence: 'QA' }] },
    { lookups: undefined },
  ]) await withPayload(fixture(patch), () => assert.rejects(getPurchaseWorkspace(), invalid));
  await withPayload(fixture(), () => assert.rejects(getPurchaseWorkspace(), invalid), 'invalid-scope');
});

test('workspace preserves the AbortSignal contract', async () => {
  const controller = new AbortController();
  controller.abort();
  await withPayload(fixture(), async calls => {
    await assert.rejects(getPurchaseWorkspace(controller.signal), error => error.name === 'AbortError');
    assert.equal(calls[0].options.signal, controller.signal);
  });
});
