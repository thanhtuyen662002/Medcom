import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes, createRequire} from 'node:module';
import {readFile, writeFile, mkdir, mkdtemp, chmod, rm} from 'node:fs/promises';
import {createServer as createHttpsServer} from 'node:https';
import {execFileSync} from 'node:child_process';
import {createHash, X509Certificate} from 'node:crypto';
import {tmpdir} from 'node:os';
import {Readable} from 'node:stream';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

// Direct Node24 runner; no shared runner/package edits. The Node HTTP server
// below is a DOUBLE, not ASP.NET/auth/SQL evidence. React is a separate gate.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime', 'i21-inbound');
await mkdir(output, {recursive: true});
for (const name of ['inbound-request-api', 'inbound-request-command-adapter']) {
  const source = (await readFile(path.join(app, 'lib/erp', `${name}.ts`), 'utf8'))
    .replace('from "./inbound-request-api"', 'from "./inbound-request-api.mjs"');
  // Transpile the ENTIRE production module, not extracted helper functions.
  await writeFile(path.join(output, `${name}.mjs`), stripTypeScriptTypes(source, {mode: 'transform'}));
}
const {createInboundRequestApi, parseInboundJson, inboundDraftRoutes, InboundTransportError} = await import(pathToFileURL(path.join(output, 'inbound-request-api.mjs')).href);
const {createInboundRequestBridge} = await import(pathToFileURL(path.join(output, 'inbound-request-command-adapter.mjs')).href);
const op = '11111111-1111-4111-8111-111111111111', audit = '22222222-2222-4222-8222-222222222222';
const source = {documentId: 'DOC-A', statusId: 0, stateEqualityToken: 'A'.repeat(64), costRowCount: 2, costEditingSupported: false,
  header: {documentDate: '2026-10-01T14:22:11.003', orderNumber: 'FULL ERP A', invoiceNo: '', departurePoint: 'FROM', destinationPoint: 'TO',
    orderTypeId: 'TYPE', branchId: 'BR-A', objectId: null, currencyId: 'VND', rateExchange: '1.0000000000', notes: ''},
  details: [{rowId: 'ROW-1', clientLineId: null, itemId: 'ITEM-1', lotNumberByDocument: '', setQuantityByDocument: '999999999999999999',
    barrelQuantityByDocument: '0', expireDateByDocument: '2027-01-02T12:34:56.997', unitPrice: '1'},
    {rowId: 'ROW-2', clientLineId: null, itemId: 'ITEM-2', lotNumberByDocument: 'lot', setQuantityByDocument: '0',
      barrelQuantityByDocument: '-1', expireDateByDocument: '2027-01-02T00:00:00', unitPrice: null}]};
const access = {canRead: true, canSave: true, canSend: true, available: true, maxCommandBytes: 1048576};
const freeze = value => { if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value; };
function command(action = 'Save', changes = {}) {
  return freeze({operationId: op, action, documentId: 'DOC-A', expectedStateEqualityToken: 'A'.repeat(64),
    header: action === 'Save' ? {...source.header, notes: 'EDITED\nKEEP'} : null, detailUpserts: [], removedDetailIds: [], costChanges: [],
    note: action === 'Save' ? null : '', ...changes});
}
const signal = () => new AbortController().signal;
async function eventually(fn) { for (let i = 0; i < 200; i++) {if (fn()) return; await new Promise(r => setTimeout(r, 5));} assert.fail('condition not reached'); }

async function double(options = {}) {
  const m = {scope: 'a'.repeat(64), access: {...access}, mode: 'Committed', reconcileOutcome: 'Replayed',
    docs: {'DOC-A': structuredClone(source), 'DOC-B': {...structuredClone(source), documentId: 'DOC-B', header: {...source.header, orderNumber: 'FULL ERP B'}}},
    calls: [], originals: new Map(), receipts: new Map(), holds: {}, waits: {}, readFailure: false, ...options};
  const wait = async kind => { if (m.holds[kind]) await new Promise(resolve => (m.waits[kind] ??= []).push(resolve)); };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = ''; for await (const chunk of req) body += chunk.toString('utf8');
    m.calls.push({path: url.pathname, query: url.search, body, headers: req.headers, method: req.method});
    const send = (data, status = 200) => {res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}); res.end(typeof data === 'string' ? data : JSON.stringify(data));};
    try {
      if (url.pathname === '/api/erp/api/auth/csrf') {await wait('csrf'); return send({token: 'synthetic-csrf'});}
      if (url.pathname === inboundDraftRoutes.read) {
        const document = structuredClone(m.docs[url.searchParams.get('documentId')]), capturedScope = m.scope;
        await wait('read');
        if (m.rawRead) {res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'}); return res.end(m.rawRead);}
        if (m.readFailure) return send({}, 503);
        return send({scopeKey: capturedScope, access: m.access, data: {outcome: m.access.canRead ? 'Observed' : 'Denied', document: m.access.canRead ? document : null}});
      }
      if (![inboundDraftRoutes.save, inboundDraftRoutes.send, inboundDraftRoutes.reconcile].includes(url.pathname)) return send({}, 404);
      const c = JSON.parse(body), reconciling = url.pathname === inboundDraftRoutes.reconcile;
      if (req.headers['x-inbound-scope'] !== m.scope || req.headers['x-csrf-token'] !== 'synthetic-csrf') return send({}, 403);
      await wait(reconciling ? 'reconcile' : 'post');
      if (reconciling) return send({scopeKey: m.scope, data: {outcome: m.reconcileOutcome,
        receipt: ['Replayed', 'Committed'].includes(m.reconcileOutcome) && m.originals.get(c.operationId) === body ? m.receipts.get(c.operationId) ?? null : null, code: null}});
      m.originals.set(c.operationId, body);
      if (['Committed', 'lost', 'malformed', 'readFailure'].includes(m.mode)) {
        const d = m.docs[c.documentId];
        if (c.action === 'Save') {
          d.header = structuredClone(c.header); d.details = d.details.filter(r => !c.removedDetailIds?.includes(r.rowId));
          for (const r of c.detailUpserts ?? []) {const at = d.details.findIndex(old => old.rowId === r.rowId); const row = {...r, rowId: r.rowId ?? 'SERVER-NEW', clientLineId: null}; if (at < 0) d.details.push(row); else d.details[at] = row;}
        } else d.statusId = 2;
        d.stateEqualityToken = 'C'.repeat(64);
        const receipt = {operationId: c.operationId, documentId: c.documentId, statusId: d.statusId, stateEqualityToken: d.stateEqualityToken, auditId: audit, committedAtUtc: '2026-10-06T00:00:00Z'};
        m.receipts.set(c.operationId, receipt);
        if (m.mode === 'lost') {res.destroy(); return;}
        if (m.mode === 'readFailure') m.readFailure = true;
        return send({scopeKey: m.scope, data: {outcome: 'Committed', receipt: m.mode === 'malformed' ? {...receipt, ...(m.badReceipt ?? {auditId: 'bad'})} : receipt, code: null}});
      }
      return send({scopeKey: m.scope, data: {outcome: m.mode, receipt: null, code: null}});
    } catch { if (!res.destroyed) send({}, 500); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const api = createInboundRequestApi((url, init) => {
    assert.ok(String(url).startsWith('/api/erp/')); assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error');
    return fetch(origin + url, {...init, ...(m.ignoreAbort ? {signal: undefined} : {})});
  });
  const bridge = createInboundRequestBridge(api); bridge.configure('login-1-rights-1', api); bridge.select('DOC-A'); await bridge.revalidate(signal());
  return {m, api, bridge, release(kind) {m.holds[kind] = false; for (const resolve of m.waits[kind] ?? []) resolve(); m.waits[kind] = [];},
    async close() {bridge.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}};
}
const writes = f => f.m.calls.filter(c => [inboundDraftRoutes.save, inboundDraftRoutes.send].includes(c.path));
const reconciles = f => f.m.calls.filter(c => c.path === inboundDraftRoutes.reconcile);
const acknowledge = (f, result) => {assert.ok(result.receipt); f.bridge.acknowledge(result.receipt);}; // I18 callback DOUBLE, not a React test

test('Node double: full read keeps 500 rows/decimal/NULL/SQL timestamps; no detail projection', async () => {
  const f = await double(); try {
    f.m.docs['DOC-A'].details = Array.from({length: 500}, (_, i) => ({...source.details[0], rowId: `ROW-${i}`}));
    const read = await f.bridge.adapter.read('DOC-A', signal());
    assert.equal(read.document.details.length, 500); assert.deepEqual(read.document.header, source.header);
    assert.equal(read.document.details[499].setQuantityByDocument, '999999999999999999');
    assert.equal(read.document.details[499].expireDateByDocument, source.details[0].expireDateByDocument);
    assert.ok(f.m.calls.every(c => !c.path.endsWith('/detail')));
  } finally {await f.close();}
});
test('Node double: explicit row edits survive body serialization and server IDs arrive only on readback', async () => {
  const f = await double(); try {
    const c = command('Save', {detailUpserts: [{...source.details[0], barrelQuantityByDocument: '-2'}, {...source.details[1], rowId: null, clientLineId: audit}], removedDetailIds: ['ROW-2']});
    const result = await f.bridge.adapter.execute(c, signal()); acknowledge(f, result);
    assert.equal(writes(f)[0].body, JSON.stringify(c)); assert.equal(writes(f)[0].headers['x-inbound-scope'], f.m.scope);
    const read = await f.bridge.adapter.read('DOC-A', signal());
    assert.equal(read.document.details[1].rowId, 'SERVER-NEW'); assert.equal(read.document.details[1].clientLineId, null);
    assert.equal(read.document.header.documentDate, source.header.documentDate);
  } finally {await f.close();}
});
for (const action of ['Save', 'SendToWarehouse']) test(`Node double: ${action} lost ACK keeps exact DTO/key/BYTES; reconcile never executes`, async () => {
  const f = await double({mode: 'lost'}); try {
    const c = command(action); assert.equal((await f.bridge.adapter.execute(c, signal())).outcome, 'OutcomeUnknown');
    assert.equal(f.bridge.hasUnresolved(), true);
    await f.bridge.adapter.execute(c, signal()); await f.bridge.adapter.execute(command(action, {operationId: audit}), signal());
    const result = await f.bridge.adapter.reconcile(c, signal());
    assert.equal(result.outcome, 'Replayed'); assert.equal(f.bridge.hasUnresolved(), true, 'not released until unchanged I18 acknowledges');
    acknowledge(f, result); assert.equal(f.bridge.hasUnresolved(), false);
    assert.equal(reconciles(f)[0].body, writes(f)[0].body); assert.equal(writes(f).length, 1);
    assert.equal(writes(f)[0].path, action === 'Save' ? inboundDraftRoutes.save : inboundDraftRoutes.send);
    assert.equal(result.receipt.statusId, action === 'Save' ? 0 : 2);
  } finally {await f.close();}
});
for (const outcome of ['Observed', 'InvalidInput', 'Denied', 'NotFound', 'Conflict', 'Rejected', 'UnsupportedCostEdits', 'NumberingUnavailable', 'Unavailable', 'OutcomeUnknown']) {
  test(`Node double: execute ${outcome} without receipt is unknown, never redispatchable`, async () => {
    const f = await double({mode: outcome}); try {
      const c = command(); assert.equal((await f.bridge.adapter.execute(c, signal())).outcome, 'OutcomeUnknown');
      assert.equal(f.bridge.hasUnresolved(), true); await f.bridge.adapter.execute(c, signal()); assert.equal(writes(f).length, 1);
    } finally {await f.close();}
  });
  test(`Node double: reconcile ${outcome} retains exact original until later valid receipt`, async () => {
    const f = await double({mode: 'lost', reconcileOutcome: outcome}); try {
      const c = command(); await f.bridge.adapter.execute(c, signal());
      assert.equal((await f.bridge.adapter.reconcile(c, signal())).outcome, 'OutcomeUnknown'); assert.equal(f.bridge.hasUnresolved(), true);
      f.m.reconcileOutcome = 'Replayed'; const result = await f.bridge.adapter.reconcile(c, signal()); acknowledge(f, result);
      assert.ok(reconciles(f).every(r => r.body === writes(f)[0].body)); assert.equal(writes(f).length, 1);
    } finally {await f.close();}
  });
}
for (const badReceipt of [{operationId: audit}, {documentId: 'DOC-B'}, {statusId: 2}, {auditId: 'bad'}, {stateEqualityToken: 'a'.repeat(64)}, {committedAtUtc: 'bad'}])
  test(`Node double: malformed receipt ${Object.keys(badReceipt)[0]} remains reconcilable`, async () => {
    const f = await double({mode: 'malformed', badReceipt}); try {
      const c = command(); assert.equal((await f.bridge.adapter.execute(c, signal())).outcome, 'OutcomeUnknown');
      acknowledge(f, await f.bridge.adapter.reconcile(c, signal())); assert.equal(writes(f).length, 1);
    } finally {await f.close();}
  });
test('Node double: double tap during CSRF/post and reconcile has one command flight', async () => {
  const f = await double({mode: 'lost'}); try {
    f.m.holds.csrf = true; const c = command(), first = f.bridge.adapter.execute(c, signal());
    await eventually(() => f.m.waits.csrf?.length); await f.bridge.adapter.execute(c, signal()); assert.equal(writes(f).length, 0);
    f.release('csrf'); await first; assert.equal(writes(f).length, 1);
    f.m.holds.reconcile = true; const original = f.bridge.adapter.reconcile(c, signal());
    await eventually(() => f.m.waits.reconcile?.length); await f.bridge.adapter.reconcile(c, signal()); assert.equal(reconciles(f).length, 1);
    f.release('reconcile'); acknowledge(f, await original);
  } finally {await f.close();}
});
test('Node double: transient workspace-null and API/rights refresh keep original bytes and scope', async () => {
  const f = await double({mode: 'lost'}); try {
    const c = command(); await f.bridge.adapter.execute(c, signal()); const scope = f.bridge.getSnapshot().access.scopeKey;
    f.bridge.configure(null, f.api); assert.equal(f.bridge.getSnapshot().contextKey, null); assert.equal(f.bridge.getSnapshot().access.scopeKey, scope); assert.equal(f.bridge.getSnapshot().access.canRead, false);
    f.bridge.configure('login-1-rights-2', f.api); assert.equal(f.bridge.getSnapshot().contextKey, 'login-1-rights-2'); assert.equal(f.bridge.getSnapshot().needsRefresh, true);
    await f.bridge.revalidate(signal()); assert.equal(f.bridge.getSnapshot().needsRefresh, false);
    acknowledge(f, await f.bridge.adapter.reconcile(c, signal())); assert.equal(reconciles(f)[0].body, writes(f)[0].body);
    assert.equal(writes(f).length, 1); assert.equal(f.bridge.getSnapshot().access.scopeKey, scope);
  } finally {await f.close();}
});
test('Node double: authority loss during CSRF prevents delayed POST even if fetch ignores abort', async () => {
  const f = await double({ignoreAbort: true}); try {
    f.m.holds.csrf = true; const c = command(), pending = f.bridge.adapter.execute(c, signal());
    await eventually(() => f.m.waits.csrf?.length); f.bridge.configure(null, f.api); f.release('csrf');
    assert.equal((await pending).outcome, 'OutcomeUnknown'); assert.equal(writes(f).length, 0); assert.equal(f.bridge.hasUnresolved(), true);
    f.bridge.configure('login-1-rights-2', f.api); await f.bridge.revalidate(signal()); await f.bridge.adapter.reconcile(c, signal());
    assert.equal(reconciles(f)[0].body, JSON.stringify(c)); assert.equal(writes(f).length, 0);
  } finally {await f.close();}
});
test('Node double: mismatching server scope locks instead of treating network loss as logout', async () => {
  const f = await double({mode: 'lost'}); try {
    const c = command(); await f.bridge.adapter.execute(c, signal()); f.m.scope = 'b'.repeat(64);
    await assert.rejects(f.bridge.revalidate(signal())); assert.equal(f.bridge.getSnapshot().access.scopeKey, 'a'.repeat(64));
    assert.equal(f.bridge.getSnapshot().access.available, false); assert.equal(f.bridge.hasUnresolved(), true);
    f.m.scope = 'a'.repeat(64); await f.bridge.revalidate(signal()); acknowledge(f, await f.bridge.adapter.reconcile(c, signal()));
  } finally {await f.close();}
});
test('Node double: old A→B→A read cannot restore retired snapshot/proof', async () => {
  const f = await double({ignoreAbort: true}); try {
    f.m.holds.read = true; const old = f.bridge.adapter.read('DOC-A', signal()); const rejected = assert.rejects(old);
    await eventually(() => f.m.waits.read?.length); f.bridge.select('DOC-B'); f.bridge.select('DOC-A');
    f.m.docs['DOC-A'].stateEqualityToken = 'F'.repeat(64); f.release('read'); await rejected;
    await f.bridge.revalidate(signal()); const c = command('Save', {expectedStateEqualityToken: 'F'.repeat(64)});
    acknowledge(f, await f.bridge.adapter.execute(c, signal())); assert.equal(writes(f).length, 1);
  } finally {await f.close();}
});
test('Node double: readback failure preserves receipt and never executes/reconciles again', async () => {
  const f = await double({mode: 'readFailure'}); try {
    const c = command(), result = await f.bridge.adapter.execute(c, signal()); acknowledge(f, result);
    await assert.rejects(f.bridge.adapter.read('DOC-A', signal())); assert.deepEqual(f.bridge.getSnapshot().receipt, result.receipt);
    f.m.readFailure = false; await f.bridge.adapter.read('DOC-A', signal()); assert.equal(writes(f).length, 1); assert.equal(reconciles(f).length, 0);
  } finally {await f.close();}
});
test('Node double: original-object substitution, Create and new login cannot reuse custody', async () => {
  const f = await double({mode: 'lost'}); try {
    assert.equal((await f.bridge.adapter.execute(command('Create'), signal())).outcome, 'OutcomeUnknown'); assert.equal(writes(f).length, 0);
    const c = command(); await f.bridge.adapter.execute(c, signal()); await f.bridge.adapter.reconcile(structuredClone(c), signal()); assert.equal(reconciles(f).length, 0);
    f.bridge.dispose(); await f.bridge.adapter.reconcile(c, signal()); assert.equal(reconciles(f).length, 0);
    assert.equal(f.bridge.getSnapshot().receipt, null);
  } finally {await f.close();}
});
test('Node double: superseded same-document bootstrap cannot replace newer proof or close newer access', async () => {
  const f = await double({ignoreAbort: true}); try {
    f.m.holds.read = true; const old = f.bridge.revalidate(signal()), rejected = assert.rejects(old);
    await eventually(() => f.m.waits.read?.length);
    f.m.holds.read = false; f.m.docs['DOC-A'].stateEqualityToken = 'F'.repeat(64);
    await f.bridge.revalidate(signal()); f.release('read'); await rejected;
    assert.equal(f.bridge.getSnapshot().access.available, true); assert.equal(f.bridge.getSnapshot().needsRefresh, false);
    acknowledge(f, await f.bridge.adapter.execute(command('Save', {expectedStateEqualityToken:'F'.repeat(64)}), signal()));
    assert.equal(writes(f).length, 1);
  } finally {await f.close();}
});
for (const kind of ['post', 'reconcile']) test(`Node double: late ${kind} response after authority fencing cannot acknowledge old custody`, async () => {
  const f = await double({ignoreAbort:true, mode:kind==='post'?'Committed':'lost'}); try {
    const c = command(); if (kind==='reconcile') await f.bridge.adapter.execute(c, signal());
    f.m.holds[kind] = true;
    const pending = kind==='post' ? f.bridge.adapter.execute(c, signal()) : f.bridge.adapter.reconcile(c, signal());
    await eventually(() => f.m.waits[kind]?.length); f.bridge.configure(null, f.api);
    f.bridge.configure('login-1-rights-2', f.api); await f.bridge.revalidate(signal()); f.release(kind);
    assert.equal((await pending).outcome, 'OutcomeUnknown'); assert.equal(f.bridge.getSnapshot().receipt, null);
    assert.equal(f.bridge.hasUnresolved(), true);
    acknowledge(f, await f.bridge.adapter.reconcile(c, signal())); assert.equal(writes(f).length, 1);
    assert.ok(reconciles(f).every(call => call.body===writes(f)[0].body));
  } finally {await f.close();}
});
test('Node double: receipt transport candidate is not confirmation; a retired callback cannot release it', async () => {
  const f = await double(); try {
    const c = command(), result = await f.bridge.adapter.execute(c, signal());
    assert.equal(f.bridge.hasUnresolved(), true); assert.equal(f.bridge.getSnapshot().receipt, null);
    f.bridge.configure(null, f.api); f.bridge.acknowledge(result.receipt); assert.equal(f.bridge.hasUnresolved(), true);
    f.bridge.configure('login-1-rights-2', f.api); await f.bridge.revalidate(signal());
    f.bridge.acknowledge(result.receipt); assert.equal(f.bridge.hasUnresolved(), true);
    acknowledge(f, await f.bridge.adapter.reconcile(c, signal())); assert.equal(writes(f).length, 1);
  } finally {await f.close();}
});
test('Node double: I18 receipt callback compares fields, not JSON member order', async () => {
  const f=await double(); try {
    const result=await f.bridge.adapter.execute(command(),signal());
    f.bridge.acknowledge(Object.fromEntries(Object.entries(result.receipt).reverse()));
    assert.equal(f.bridge.hasUnresolved(),false); assert.deepEqual(f.bridge.getSnapshot().receipt,result.receipt);
  } finally {await f.close();}
});
test('Node double: more than 500 rows are rejected, never silently sliced', async () => {
  const f=await double(); try {
    f.m.docs['DOC-A'].details=Array.from({length:501},(_,i)=>({...source.details[0],rowId:'ROW-'+i}));
    await assert.rejects(f.bridge.adapter.read('DOC-A',signal())); assert.equal(writes(f).length,0);
  } finally {await f.close();}
});
test('Node double: original reconciliation needs current read access, not admission to a new Send', async () => {
  const f=await double({mode:'lost'}); try {
    const c=command('SendToWarehouse'); await f.bridge.adapter.execute(c,signal());
    f.m.access={...access,canSave:false,canSend:false}; f.bridge.configure('login-1-rights-2',f.api);
    await f.bridge.revalidate(signal()); acknowledge(f,await f.bridge.adapter.reconcile(c,signal()));
    assert.equal(writes(f).length,1); assert.equal(reconciles(f)[0].body,writes(f)[0].body);
  } finally {await f.close();}
});
test('Node module: strict JSON scanner rejects duplicates/escaped aliases/malformed Unicode', () => {
  for (const body of ['{"a":1,"a":2}', '{"a":{"x":0,"\\u0078":1}}', '{"a":[1,]}', '{"a":1,}', '{}{}', '{/*x*/}', '"\\ud800"', '{"\\udc00":1}', '\uFEFF{}'])
    assert.throws(() => parseInboundJson(body), undefined, body);
  assert.deepEqual(parseInboundJson('{"text":"line\\n\\uD83D\\uDE00","nil":null,"empty":"","n":"999999999999999999"}'),
    {text: 'line\n😀', nil: null, empty: '', n: '999999999999999999'});
});
test('Node double: fatal UTF-8 and duplicate envelope response never reach draft', async () => {
  const f = await double(); try {
    for (const rawRead of [Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]), '{"scopeKey":null,"scopeKey":null}']) {
      f.m.rawRead = rawRead; await assert.rejects(f.bridge.adapter.read('DOC-A', signal()));
    }
  } finally {await f.close();}
});

// I40 headless React effect integration: production host + production bridge,
// synthetic list/draft transports. Child rendering, focus and navigation are
// explicit doubles; this does NOT replace the unchanged full browser gates.
test('I40 synthetic React host list lifecycle and stale-denial integration', async t => {
  // Required CI coverage uses the application's exact locked React toolchain.
  // A missing renderer is a setup failure, never a successful optional skip.
  const require = createRequire(import.meta.url);
  const React = require('react'), {create, act} = require('react-test-renderer');
  assert.equal(React.version, '19.2.6');
  assert.equal(require('react-test-renderer/package.json').version, '19.2.6');
  const {build} = createRequire(import.meta.url)('esbuild');
  const bundlePath = path.join(output, 'i40-react-host.mjs');
  await build({stdin:{contents:`export {InboundRequestScreen} from './components/erp/inbound-request-screen'; export {ApiError} from './lib/erp/api';`, resolveDir:app, loader:'tsx'},
    outfile:bundlePath, bundle:true, platform:'node', format:'esm', jsx:'automatic', alias:{'@':app}, logLevel:'warning',
    banner:{js:"import {createRequire as i40CreateRequire} from 'node:module';const require=i40CreateRequire(import.meta.url);"},
    plugins:[{name:'i40-explicit-child-doubles',setup(build){
      build.onResolve({filter:/^react(?:\/.*)?$/}, args => ({path:require.resolve(args.path), external:true}));
      build.onResolve({filter:/^\.\/(mobile-inbound-request|inbound-request-readonly|request-selection-focus|navigation-guard)$/}, args=>({path:args.path,namespace:'i40-double'}));
      build.onLoad({filter:/.*/,namespace:'i40-double'}, args=>({loader:'js',contents:args.path.endsWith('mobile-inbound-request')
        ? `import React from 'react'; export const MobileInboundRequest=props=>React.createElement('div',{'data-testid':'i40-editor-double','data-document':props.documentId});`
        : args.path.endsWith('inbound-request-readonly') ? `export const InboundRequestReadOnly=()=>null;`
        : args.path.endsWith('navigation-guard') ? `const request=action=>action(),register=()=>{}; export const useNavigationGuard=()=>({request,register});export const useDirtyGuard=()=>{};`
        : `const noop=()=>{},focus={open:noop,close:noop,cancel:noop,row:noop,detail:null,list:null};export const useRequestSelectionFocus=()=>focus;`}));
    }}]});
  const {InboundRequestScreen,ApiError:HostApiError}=await import(pathToFileURL(bundlePath).href);
  const previousActEnvironment=globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const workspace = () => ({session:{tenantId:'T',companyId:'C',authorityVersion:1,capabilities:['inbound-requests.read']},
    branchIds:['BR-A'],sessionScope:'e'.repeat(64),readScope:'f'.repeat(64),navigation:[]});
  const listData=page=>({rows:['DOC-A','DOC-B'].map(documentId=>({documentId,documentDate:'2026-10-01',branchId:'BR-A',statusId:0,isLocked:false})),page,pageSize:50,hasMore:page===1});
  async function host(){
    const calls=[],denied=[],held=[]; let hold=false,failure=null,renderer,nextRows=null;
    const list=async(page,search,branch,signal,scope)=>{
      const captured=failure,data=listData(page);
      if(nextRows)data.rows=nextRows.map(documentId=>({...data.rows[0],documentId}));
      calls.push({page,search,branch,signal,scope});
      if(hold)await new Promise(resolve=>held.push(resolve));
      if(captured!==null)throw new HostApiError(captured,'synthetic_i40_denied');
      return data;
    };
    const api={read:async documentId=>({scopeKey:'a'.repeat(64),access:{...access},data:{outcome:'Observed',document:{...structuredClone(source),documentId}}}),
      command:async()=>assert.fail('I40 read tests must never send commands')};
    let props={loginKey:'i40-login-1',workspace:workspace(),historyOwner:'workspace',list,api,onDenied:e=>denied.push(e.status)};
    const flush=async()=>act(async()=>{await new Promise(resolve=>setImmediate(resolve));});
    const render=async patch=>{props={...props,...patch};await act(async()=>{if(renderer)renderer.update(React.createElement(InboundRequestScreen,props));else renderer=create(React.createElement(InboundRequestScreen,props));});await flush();};
    const button=name=>renderer.root.findAllByType('button').find(n=>n.props.children===name);
    const openHandler=id=>renderer.root.findAllByType('button').find(n=>n.props['aria-label']?.startsWith('Mở phiếu '+id+' ')).props.onClick;
    const click=async name=>{await act(async()=>button(name).props.onClick());await flush();};
    const open=async id=>{await act(async()=>openHandler(id)());await flush();};
    const refresh=async()=>render({list:(...args)=>list(...args)});
    await render({});
    return {calls,denied,held,render,flush,click,open,openHandler,refresh,props:()=>props,root:()=>renderer.root,
      rows:value=>nextRows=value,fail:value=>failure=value,hold:()=>hold=true,release:async()=>{hold=false;await act(async()=>held.splice(0).forEach(resolve=>resolve()));await flush();},
      close:async()=>{await act(async()=>renderer.unmount());await flush();}};
  }
  try {
    await t.test('Open/Close, A→B→A and equivalent workspace keep one list request; all list boundaries fetch',async()=>{
      const f=await host();try{
        assert.equal(f.calls.length,1);
        await f.open('DOC-A');await f.open('DOC-B');await f.open('DOC-A');await f.click('Đóng phiếu nhập hàng');
        await f.render({workspace:structuredClone(f.props().workspace)});
        assert.equal(f.calls.length,1);
        assert.equal(f.root().findAll(n=>n.props['data-testid']==='i40-editor-double').length,1);
        await f.open('DOC-A');await f.click('Xác minh lại quyền nhập hàng');assert.equal(f.calls.length,2);
        const search=f.root().findAllByType('input').find(n=>n.props.maxLength===100);
        await act(async()=>search.props.onChange({target:{value:'I40 FILTER'}}));
        await act(async()=>f.root().findByType('form').props.onSubmit({preventDefault(){}}));await f.flush();
        assert.equal(f.calls.length,3);assert.equal(f.calls.at(-1).search,'I40 FILTER');
        await f.click('Trang phiếu tiếp');assert.equal(f.calls.length,4);assert.equal(f.calls.at(-1).page,2);
        await act(async()=>f.root().findByType('select').props.onChange({target:{value:'BR-A'}}));
        await act(async()=>f.root().findByType('form').props.onSubmit({preventDefault(){}}));await f.flush();
        assert.equal(f.calls.length,5);assert.equal(f.calls.at(-1).branch,'BR-A');assert.equal(f.calls.at(-1).page,1);
        await f.render({workspace:{...f.props().workspace,session:{...f.props().workspace.session,authorityVersion:2}}});assert.equal(f.calls.length,6);
        await f.refresh();assert.equal(f.calls.length,7);
        await f.render({workspace:{...f.props().workspace,branchIds:['BR-A','BR-B']}});assert.equal(f.calls.length,8);
        await f.render({workspace:{...f.props().workspace,readScope:'d'.repeat(64)}});assert.equal(f.calls.length,9);
        assert.deepEqual(f.calls.at(-1).scope,{sessionScope:'e'.repeat(64),readScope:'d'.repeat(64)});
        await f.render({workspace:{...f.props().workspace,session:{...f.props().workspace.session,capabilities:[]}}});assert.equal(f.calls.length,9);
        assert.equal(f.root().findAllByType('table').length,0,'authority loss hides old list');
        await f.render({workspace:workspace()});assert.equal(f.calls.length,10);
      }finally{await f.close();}
    });
    await t.test('review: healthy same-scope authority observation retains rows until its current denial', async () => {
      const f=await host();try{
        f.hold();f.fail(403);
        await f.render({workspace:{...f.props().workspace,session:{...f.props().workspace.session,authorityVersion:2}}});
        assert.equal(f.calls.length,2);assert.equal(f.root().findAllByType('table').length,1);
        await f.release();assert.equal(f.root().findAllByType('table').length,0);
        assert.deepEqual(f.denied,[],'403 suspends this authority rather than reporting a terminal login denial');
      }finally{await f.close();}
    });
    for (const boundary of ['workspace', 'capability', 'branch', 'scope', 'filter', 'page'])
      await t.test(`review: returning from ${boundary} cannot revive rows from a retired list view`, async () => {
        const f = await host(); try {
          const original = f.props().workspace;
          f.hold();
          if (boundary === 'workspace') await f.render({workspace:null});
          else if (boundary === 'capability') await f.render({workspace:{...original,session:{...original.session,capabilities:[]}}});
          else if (boundary === 'branch') await f.render({workspace:{...original,branchIds:['BR-B']}});
          else if (boundary === 'scope') await f.render({workspace:{...original,readScope:'d'.repeat(64)}});
          else if (boundary === 'page') await f.click('Trang phiếu tiếp');
          else {
            await act(async()=>f.root().findAllByType('input').find(n=>n.props.maxLength===100).props.onChange({target:{value:'OTHER'}}));
            await act(async()=>f.root().findByType('form').props.onSubmit({preventDefault(){}}));await f.flush();
          }
          assert.equal(f.root().findAllByType('table').length,0,'boundary hides the old rows');
          if (boundary === 'page') await f.click('Trang phiếu trước');
          else if (boundary === 'filter') {
            await act(async()=>f.root().findAllByType('input').find(n=>n.props.maxLength===100).props.onChange({target:{value:''}}));
            await act(async()=>f.root().findByType('form').props.onSubmit({preventDefault(){}}));await f.flush();
          } else await f.render({workspace:original});
          assert.equal(f.root().findAllByType('table').length,0,'return to identical values is a new view; wait for its own read');
          await f.release();assert.equal(f.root().findAllByType('table').length,1);
        } finally {await f.close();}
      });
    for(const status of [401,403,409])for(const boundary of ['open','close','aba','batched-aba','authority','scope','api','login','logout','filter','page'])
      await t.test(`late ${status} after ${boundary} cannot change newer authority, selection or rows`,async()=>{
        const f=await host();try{
          await f.open('DOC-A');f.hold();f.fail(status);await f.refresh();
          assert.equal(f.held.length,1);const before=f.calls.length,oldSignal=f.calls.at(-1).signal;
          f.fail(null);
          if(boundary==='open')await f.open('DOC-B');
          else if(boundary==='close')await f.click('Đóng phiếu nhập hàng');
          else if(boundary==='aba'){await f.open('DOC-B');await f.open('DOC-A');}
          else if(boundary==='batched-aba'){
            await f.click('Đóng phiếu nhập hàng');
            const b=f.openHandler('DOC-B'),a=f.openHandler('DOC-A');
            await act(async()=>{a();b();a();});await f.flush();
          }else if(boundary==='authority')await f.render({workspace:{...f.props().workspace,session:{...f.props().workspace.session,authorityVersion:2}}});
          else if(boundary==='scope'){
            await f.render({workspace:{...f.props().workspace,readScope:'d'.repeat(64)}});
            assert.equal(f.root().findAllByType('table').length,0,'new scope cannot present old rows while held');
          }else if(boundary==='api')await f.render({api:{...f.props().api}});
          else if(boundary==='login')await f.render({loginKey:'i40-login-2',workspace:workspace()});
          else if(boundary==='logout')await f.render({loginKey:null,workspace:null});
          else if(boundary==='filter')await act(async()=>f.root().findByType('form').props.onSubmit({preventDefault(){}}));
          else await f.click('Trang phiếu tiếp');
          await f.flush();
          const selectionOnly=['open','close','aba','batched-aba'].includes(boundary);
          if(selectionOnly){assert.equal(f.calls.length,before);assert.equal(oldSignal.aborted,false,'selection does not abort authorized list');}
          else assert.equal(oldSignal.aborted,true,'authority/list boundary aborts old request');
          await f.release();
          assert.deepEqual(f.denied,[]);
          assert.equal(f.root().findAll(n=>n.props.children==='Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.').length,0);
          if(boundary!=='logout')assert.equal(f.root().findAllByType('table').length,1);
          else assert.equal(f.root().findAllByType('table').length,0);
          const editor=f.root().find(n=>n.props['data-testid']==='i40-editor-double');
          assert.equal(editor.props['data-document'],boundary==='open'?'DOC-B':['close','login','logout','filter','page'].includes(boundary)?null:'DOC-A');
        }finally{await f.close();}
      });
    for (const boundary of ['authority', 'branch', 'scope', 'login', 'page'])
      await t.test(`review: late successful ${boundary} request cannot replace newer rows`, async () => {
        const f = await host(); try {
          f.rows(['DOC-RETIRED']);f.hold();await f.refresh();
          const oldRelease=f.held.shift();assert.ok(oldRelease);
          f.rows(['DOC-CURRENT']);
          if(boundary==='authority')await f.render({workspace:{...f.props().workspace,session:{...f.props().workspace.session,authorityVersion:2}}});
          else if(boundary==='branch')await f.render({workspace:{...f.props().workspace,branchIds:['BR-A','BR-B']}});
          else if(boundary==='scope')await f.render({workspace:{...f.props().workspace,readScope:'d'.repeat(64)}});
          else if(boundary==='login')await f.render({loginKey:'i40-login-2',workspace:workspace()});
          else await f.click('Trang phiếu tiếp');
          await f.release();
          const visible=()=>f.root().findAllByType('button').filter(n=>n.props['aria-label']?.startsWith('Mở phiếu ')).map(n=>n.props['aria-label']);
          assert.equal(visible().length,1);assert.match(visible()[0],/DOC-CURRENT/);
          await act(async()=>oldRelease());await f.flush();
          assert.equal(visible().length,1);assert.match(visible()[0],/DOC-CURRENT/);
          assert.deepEqual(f.denied,[]);
        } finally {await f.close();}
      });
    for (const status of [401,403,409])
      await t.test(`review: current list ${status} fences a pending write without dropping original custody`, async () => {
        const f=await host();try{
          let releaseWrite;const sends=[];
          const transport={...f.props().api,command:async(route,body,scope,signal,beforeSend)=>{
            beforeSend();sends.push({route,body,scope});
            if(route!=='reconcile')await new Promise(resolve=>releaseWrite=resolve);
            return {scopeKey:scope,data:{outcome:'OutcomeUnknown',receipt:null,code:null}};
          }};
          await f.render({api:transport});await f.open('DOC-A');
          const editor=()=>f.root().find(n=>typeof n.type==='function'&&n.props.adapter&&n.props.onConfirmed);
          const adapter=editor().props.adapter,original=command(),body=JSON.stringify(original);
          assert.ok(Object.isFrozen(original));assert.ok(Object.isFrozen(original.header));
          let pending;await act(async()=>{pending=adapter.execute(original,signal());});await f.flush();
          assert.equal(sends.length,1);assert.equal(sends[0].body,body);
          f.fail(status);await f.refresh();
          // Navigation double immediately admits the callback. The production
          // host's independent custody check must still refuse selection/Close.
          await f.click('Đóng phiếu nhập hàng');
          assert.equal(editor().props.documentId,'DOC-A');assert.equal(editor().props.adapter,adapter);
          await act(async()=>releaseWrite());assert.equal((await pending).outcome,'OutcomeUnknown');await f.flush();
          assert.equal(JSON.stringify(original),body);assert.equal(sends.length,1);
          if(status!==401){
            f.fail(null);await f.click('Xác minh lại quyền nhập hàng');
            await act(async()=>{assert.equal((await adapter.execute(original,signal())).outcome,'OutcomeUnknown');});
            assert.equal(sends.length,1,'original execute cannot be resent');
            await act(async()=>{assert.equal((await adapter.reconcile(original,signal())).outcome,'OutcomeUnknown');});
            assert.equal(sends.length,2);assert.equal(sends[1].route,'reconcile');assert.equal(sends[1].body,body);
            assert.equal(sends[1].scope,sends[0].scope);
            await f.click('Đóng phiếu nhập hàng');assert.equal(editor().props.documentId,'DOC-A','unknown original still blocks Close');
          }else assert.deepEqual(f.denied,[401]);
        }finally{await f.close();}
      });
    for(const status of [401,403,409])await t.test(`current ${status} still retires current authorized list`,async()=>{
      const f=await host();try{await f.open('DOC-A');f.fail(status);await f.refresh();
        assert.equal(f.root().findAllByType('table').length,0);
        assert.deepEqual(f.denied,status===401?[401]:[]);
      }finally{await f.close();}
    });
    await t.test('late authorized list success survives Open/Close without a replacement fetch',async()=>{
      const f=await host();try{f.hold();await f.refresh();const count=f.calls.length;await f.open('DOC-A');await f.click('Đóng phiếu nhập hàng');
        await f.release();assert.equal(f.calls.length,count);assert.equal(f.root().findAllByType('table').length,1);
      }finally{await f.close();}
    });
  } finally {globalThis.IS_REACT_ACT_ENVIRONMENT=previousActEnvironment;}
});

// ACTUAL host + unchanged I18 + unchanged navigation provider. This fixture's
// HTTP layer is a browser fetch double, NOT an ASP.NET/BFF integration proof.
const fixture = `
import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import {InboundRequestScreen} from './components/erp/inbound-request-screen';
import {InboundRequestReadOnly} from './components/erp/inbound-request-readonly';
import {NavigationGuardProvider} from './components/erp/navigation-guard';
import {createInboundRequestApi} from './lib/erp/inbound-request-api';
import {ApiError} from './lib/erp/api';
const originalPush=history.pushState.bind(history);window.qaPushes=0;history.pushState=(...args)=>{window.qaPushes++;return originalPush(...args);};
const baseline=${JSON.stringify(source)},rights=${JSON.stringify(access)};
function model(){return {scope:'a'.repeat(64),access:{...rights},mode:'Committed',outcome:'Replayed',held:{},waits:{},readFailure:false,readShape:null,listFailure:null,draftReply:null,draftHttp:null,readMarkers:null,workspaceCapabilities:['inbound-requests.read'],detailLabel:'READ ONLY PROJECTION',detailFailure:null,detailResponseMarkers:null,detailLastPage:1,detailPageSize:50,directReadonly:false,directProps:{documentId:'DOC-A',verifying:false,readRevision:0},useDefaultList:false,listResponseMarkers:null,detailSignals:[],releaseDetailOnAuthorityCommit:false,calls:{read:[],readReplies:[],post:[],reconcile:[],list:[],listGet:[],detail:[],detailCompleted:[],layoutDetailReleases:[]},docs:{'DOC-A':structuredClone(baseline),'DOC-B':{...structuredClone(baseline),documentId:'DOC-B',header:{...baseline.header,orderNumber:'FULL ERP B'}}}};}
// Production getDetail and the optional default getDocuments path use these synthetic global-fetch responses.
// Requests intentionally ignore cancellation so stale-success/denial fencing is exercised.
const originalFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(url,init)=>{const pathname=new URL(typeof url==='string'?url:url.url,location.href).pathname;if(pathname==='/api/erp/api/documents/inbound-requests/detail')return window.qaDetailFetch(url,init);if(pathname==='/api/erp/api/documents/inbound-requests')return window.qaListFetch(url,init);return originalFetch(url,init);};
function App(){const m=useRef(model()),count=useRef(0);const [config,setConfig]=useState({loginKey:'login-0',version:1,available:true,listRevision:0,apiRevision:0,callbackRevision:0});
 const wait=async(model,kind)=>{if(model.held[kind])await new Promise(r=>(model.waits[kind]??=[]).push(r));};
 // Child layout effects have committed, while this parent's authority refresh
 // deliberately releases the retired HTTP failure before passive cleanup.
 useLayoutEffect(()=>{const x=m.current;if(!x.releaseDetailOnAuthorityCommit)return;x.releaseDetailOnAuthorityCommit=false;
 const panel=document.querySelector('[data-testid=inbound-request-readonly]');x.calls.layoutDetailReleases.push({authorityVersion:config.version,panelPresent:!!panel,phase:panel?.getAttribute('data-phase')??null,abortedAtRelease:x.detailSignals[0]?.aborted??false});x.waits.detail?.shift()?.();},[config.version]);
 window.qaListFetch=async(url,init={})=>{const x=m.current,u=new URL(url,location.href),page=Number(u.searchParams.get('page')),markers=structuredClone(x.listResponseMarkers??x.readMarkers);
 x.calls.listGet.push({path:u.pathname,query:u.search,method:init.method??'GET',credentials:init.credentials,cache:init.cache,redirect:init.redirect});
 const result={rows:Object.values(x.docs).map(d=>({documentId:d.documentId,documentDate:'2026-10-01',branchId:'BR-A',statusId:0,isLocked:false})),page,pageSize:50,hasMore:false};await wait(x,'list');
 return new Response(JSON.stringify(result),{headers:{'content-type':'application/json','cache-control':'no-store',...(markers?{'X-Medcom-Session-Scope':markers.sessionScope,'X-Medcom-Read-Scope':markers.readScope}:{})}});
 };
 window.qaDetailFetch=async(url,init={})=>{const x=m.current,u=new URL(url,location.href),id=u.searchParams.get('documentId'),page=Number(u.searchParams.get('page'));
 const call={path:u.pathname,query:u.search,documentId:id,page,method:init.method??'GET',credentials:init.credentials,cache:init.cache,redirect:init.redirect,headers:Object.fromEntries(new Headers(init.headers)),body:init.body??null};x.calls.detail.push(call);x.detailSignals.push(init.signal);
 const markers=structuredClone(x.detailResponseMarkers??x.readMarkers),failure=x.detailFailure,label=x.detailLabel;
 const detail={document:{documentId:id,documentDate:'2026-10-01',branchId:'BR-A',statusId:0,isLocked:false},purchaseOrderLines:[],inboundRequestLines:[{lineId:'PROJECTION-'+id,itemId:label,setQuantityByDocument:'1234567890123456789012345678.1234',barrelQuantityByDocument:null,setQuantityByReal:'-0.0001',barrelQuantityByReal:'0'}],page,pageSize:x.detailPageSize,hasMore:page<x.detailLastPage};
 await wait(x,'detail');x.calls.detailCompleted.push({documentId:id,label,failure,aborted:init.signal?.aborted??false});
 if(failure==='network')throw new TypeError('synthetic detail network loss');
 return new Response(JSON.stringify(typeof failure==='number'?{code:'synthetic_detail_error'}:failure==='malformed'?{}:detail),{status:typeof failure==='number'?failure:200,headers:{'content-type':'application/json','cache-control':'no-store',...(markers?{'X-Medcom-Session-Scope':markers.sessionScope,'X-Medcom-Read-Scope':markers.readScope}:{})}});
 };
 const api=useMemo(()=>createInboundRequestApi(async(url,init)=>{const x=m.current;const u=new URL(url,'https://fixture.invalid');
 const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(u.pathname.endsWith('/csrf'))return response({token:'fake-csrf'});
 if(init.method!=='POST'){const id=u.searchParams.get('documentId'),document=structuredClone(x.docs[id]),scope=x.scope;x.calls.read.push(id);await wait(x,'read');if(x.readFailure)throw Error('synthetic read lost');if(x.draftHttp!==null)return new Response('{}',{status:x.draftHttp});if(x.nextReadAccess){x.access={...x.access,...x.nextReadAccess};x.nextReadAccess=null;x.held.read=true;}if(x.readShape==='malformed')document.header.rateExchange=1;if(x.readShape==='mismatch')document.stateEqualityToken='D'.repeat(64);const envelope=x.draftReply??{scopeKey:scope,access:x.access,data:{outcome:x.access.canRead?'Observed':'Denied',document:x.access.canRead?document:null}};x.calls.readReplies.push(structuredClone(envelope));return response(envelope);}
 const c=JSON.parse(init.body),rec=u.pathname.endsWith('/reconcile');x.calls[rec?'reconcile':'post'].push(init.body);await wait(x,rec?'reconcile':'post');
 if(rec)return response({scopeKey:x.scope,data:{outcome:x.outcome,receipt:['Committed','Replayed'].includes(x.outcome)?x.receipt??null:null,code:null}});
 if(['Committed','lost','readFailure','malformedRead','mismatchedRead'].includes(x.mode)){const d=x.docs[c.documentId];if(c.action==='Save'){d.header=structuredClone(c.header);d.details=d.details.filter(row=>!c.removedDetailIds.includes(row.rowId));for(const row of c.detailUpserts){const next={...structuredClone(row),rowId:row.rowId??'SERVER-'+row.clientLineId,clientLineId:null},at=d.details.findIndex(existing=>existing.rowId===next.rowId);if(at<0)d.details.push(next);else d.details[at]=next;}}else d.statusId=2;d.stateEqualityToken='C'.repeat(64);x.receipt={operationId:c.operationId,documentId:c.documentId,statusId:d.statusId,stateEqualityToken:d.stateEqualityToken,auditId:'${audit}',committedAtUtc:'2026-10-06T00:00:00Z'};if(x.mode==='lost')throw Error('lost ACK');if(x.mode==='readFailure')x.readFailure=true;if(x.mode==='malformedRead')x.readShape='malformed';if(x.mode==='mismatchedRead')x.readShape='mismatch';return response({scopeKey:x.scope,data:{outcome:'Committed',receipt:x.receipt,code:null}});}
 return response({scopeKey:x.scope,data:{outcome:x.mode,receipt:null,code:null}});
 }),[config.apiRevision]);
 const list=useMemo(()=>async(page,search,branch)=>{const x=m.current,failure=x.listFailure;x.calls.list.push({page,search,branch});await wait(x,'list');if(failure!==null){if(failure==='network')throw new TypeError('synthetic network loss');throw new ApiError(failure,'synthetic_list_error');}return {rows:Object.values(x.docs).map(d=>({documentId:d.documentId,documentDate:'2026-10-01',branchId:'BR-A',statusId:0,isLocked:false})),page,pageSize:50,hasMore:page===1};},[config.listRevision]);
 const workspace=config.available&&config.loginKey?{session:{displayName:'Synthetic',tenantId:'T',companyId:'C',companyName:'Synthetic',authorityVersion:config.version,idleExpiresAt:'2026-10-07T00:00:00Z',absoluteExpiresAt:'2026-10-08T00:00:00Z',capabilities:m.current.workspaceCapabilities},navigation:[],branchIds:['BR-A'],...(m.current.readMarkers??{})}:null;
 window.qa={reset:patch=>{const next=++count.current;m.current={...model(),scope:next.toString(16).padStart(64,'0'),...patch};window.qaLeft=false;window.qaDenied=[];window.qaCallback=null;setConfig({loginKey:'login-'+next,version:1,available:true,listRevision:0,apiRevision:0,callbackRevision:0});},calls:()=>m.current.calls,
 hold:k=>m.current.held[k]=true,release:k=>{m.current.held[k]=false;(m.current.waits[k]??[]).splice(0).forEach(f=>f());},held:k=>(m.current.waits[k]??[]).length,releaseOne:k=>m.current.waits[k]?.shift()?.(),stopHolding:k=>m.current.held[k]=false,
 failList:status=>{m.current.listFailure=status;setConfig(v=>({...v,listRevision:v.listRevision+1}));},listHealthy:()=>m.current.listFailure=null,
 refreshList:()=>setConfig(v=>({...v,listRevision:v.listRevision+1})),swapApi:()=>setConfig(v=>({...v,apiRevision:v.apiRevision+1})),
 rerender:()=>setConfig(v=>({...v,callbackRevision:v.callbackRevision+1})),callbackRevision:()=>config.callbackRevision,readFailure:value=>m.current.readFailure=value,nextReadRights:value=>m.current.nextReadAccess=value,
 rights:value=>{m.current.access={...rights,...value};setConfig(v=>({...v,version:v.version+1}));},workspace:value=>setConfig(v=>({...v,available:value})),logout:()=>setConfig(v=>({...v,loginKey:null,available:false})),
 draftReply:value=>m.current.draftReply=value,detail:value=>Object.assign(m.current,value),
 directProps:value=>{Object.assign(m.current.directProps,value);setConfig(v=>({...v,callbackRevision:v.callbackRevision+1}));},
 markers:value=>{m.current.readMarkers=value;setConfig(v=>({...v,callbackRevision:v.callbackRevision+1}));},
 retainRelease:k=>{const old=m.current;window.qaOldRelease=()=>{old.held[k]=false;(old.waits[k]??[]).splice(0).forEach(f=>f());};},outcome:v=>m.current.outcome=v,healthy:()=>{m.current.readFailure=false;m.current.readShape=null;},mode:v=>m.current.mode=v};
 // Explicit intrinsic-child mode: no composed host, draft bridge or navigation
 // provider. The reset key changes only between cases, never on direct props.
 if(m.current.directReadonly)return <InboundRequestReadOnly key={config.loginKey} {...m.current.directProps} branchIds={['BR-A']} scope={m.current.readMarkers} initialPage={1} onPageChange={()=>{}} onPresented={()=>{}} onDenied={error=>(window.qaDenied??=[]).push(error.status)}/>;
 return <NavigationGuardProvider><InboundRequestScreen loginKey={config.loginKey} workspace={workspace} api={api} {...(m.current.useDefaultList?{}:{list})} onDenied={error=>(window.qaDenied??=[]).push(error.status)} onClose={()=>{window.qaLeft=true;window.qaCallback=config.callbackRevision;}} onBack={()=>{window.qaLeft=true;window.qaCallback=config.callbackRevision;}}/></NavigationGuardProvider>;
}
createRoot(document.getElementById('root')).render(<App/>);`;

test('React host mobile 320/360/390: ACTUAL React gate (separate from Node double)', {timeout: 240000}, async t => {
  const require = createRequire(import.meta.url); let build, chromium;
  const required = process.env.I21_REACT_REQUIRED === '1';
  try {
    ({build} = require('esbuild')); require.resolve('react'); require.resolve('react-dom');
    const tools = process.env.MEDCOM_BROWSER_TOOLCHAIN;
    ({chromium} = (tools ? createRequire(path.join(path.resolve(tools), 'package.json')) : require)('playwright-core'));
  } catch (error) {
    const message = `existing React/esbuild/browser toolchain unavailable (${error.code ?? 'module'}). No install attempted.`;
    if (required) throw new Error(`I21_REACT_REQUIRED=1: ${message}`);
    t.skip(`NOT_RUN: ${message}`); return;
  }
  const bundle = await build({stdin: {contents: fixture, resolveDir: app, loader: 'tsx'}, bundle: true, platform: 'browser', format: 'iife', write: false,
    alias: {'@': app}, jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'}, logLevel: 'warning'});
  const server = createServer((req, res) => {res.setHeader('content-type', req.url === '/fixture.js' ? 'application/javascript' : 'text/html');
    res.end(req.url === '/fixture.js' ? bundle.outputFiles[0].contents : '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui}*{box-sizing:border-box}[role=alertdialog]{position:fixed;left:3%;top:3%;width:94%;z-index:51;background:white;padding:16px}[data-slot=alert-dialog-overlay]{position:fixed;inset:0;background:#0004;z-index:50}</style><div id="root"></div><script src="/fixture.js"></script>');});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let browser, context; const errors = [], external = [], results = [];
  // node:test marks a timed-out async test failed but does not unwind its
  // pending browser awaits. Close live resources on abort as well as finally.
  const cleanup = async () => {
    server.closeAllConnections();
    const outcomes = await Promise.allSettled([context?.close(), browser?.close(), new Promise((resolve, reject) => server.close(error => {
      if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error); else resolve();
    }))]);
    // Abort already failed the test; duplicate abort/finally closure is safe.
    // A normal teardown error must still fail after attempting every close.
    const failures = outcomes.filter(outcome => outcome.status === 'rejected');
    if (failures.length && !t.signal.aborted) throw new AggregateError(failures.map(outcome => outcome.reason), 'Synthetic browser teardown failed');
  };
  const abortCleanup = () => {void cleanup();}; t.signal.addEventListener('abort', abortCleanup, {once: true});
  try {
    browser = await chromium.launch({headless: true, ...(process.env.I21_TEST_BROWSER ? {executablePath: process.env.I21_TEST_BROWSER} : {})});
    t.signal.throwIfAborted();
    context = await browser.newContext({viewport: {width: 390, height: 844}, locale: 'vi-VN', serviceWorkers: 'block'});
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.route('**/*', r => {if (r.request().url().startsWith(origin + '/')) return r.continue(); external.push(r.request().url()); return r.abort();});
    await page.goto(origin);
    const button = name => page.getByRole('button', {name, exact: true}), field = name => page.getByLabel(name, {exact: true});
    const open = id => page.getByRole('button', {name: new RegExp('^Mở phiếu ' + id + ' ')}).click();
    const ready = () => page.waitForFunction(() => document.getElementById('inbound-header-orderNumber') && !document.getElementById('inbound-header-orderNumber').matches(':disabled') && document.querySelector('[data-testid=inbound-request-host]')?.getAttribute('data-readback-pending') !== 'true');
    const reset = async (patch = {}) => {await page.evaluate(patch => window.qa.reset(patch), patch); await open('DOC-A'); await ready();};
    const review = () => button('Rà soát phiếu').click();
    const save = async () => {await review(); await button('Lưu thay đổi').click();};
    const unknown = () => page.waitForFunction(() => document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase') === 'unknown');
    const confirmed = () => page.waitForSelector('[data-testid=confirmed-receipt]');
    const calls = () => page.evaluate(() => window.qa.calls());
    const blocked = async (action, discard = false) => {
      await action(); const dialog = page.getByRole('alertdialog'); await dialog.waitFor({state: 'visible'});
      assert.match(await dialog.innerText(), /Công việc chưa hoàn tất/); assert.equal(await page.evaluate(() => window.qaLeft), false);
      assert.equal(await button('Bỏ thay đổi và rời màn hình').count(), discard ? 1 : 0);
      await button('Tiếp tục làm việc').click(); assert.equal(await page.evaluate(() => window.qaLeft), false);
    };
    const run = async (name, fn) => {await t.test(name, async () => {try {await fn(); results.push({name, result: 'PASS'});} catch (e) {results.push({name, result: 'FAIL'}); throw e;}});};
    const detailFocus = () => page.getByRole('region', {name:'Phiếu nhập hàng đã chọn', exact:true});
    const rowFocus = id => page.getByRole('button', {name:new RegExp('^Mở phiếu '+id+' ')});
    const focused = async locator => {await page.waitForFunction(element=>document.activeElement===element,await locator.elementHandle());};
    const focusPaint = () => page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const readMarkers = {sessionScope:'e'.repeat(64),readScope:'f'.repeat(64)};
    await run('I40 Open/Close and unchanged parent observations reuse the authorized list; refresh/filter/page/branch/authority fetch', async () => {
      await reset({readMarkers});
      const initial = (await calls()).list.length;
      assert.equal(initial, 1, 'initial authorized list fetches once');
      await button('Đóng phiếu nhập hàng').click(); await focusPaint();
      assert.equal((await calls()).list.length, initial);
      await open('DOC-B'); await ready();
      await open('DOC-A'); await ready();
      await page.evaluate(() => window.qa.rerender()); await focusPaint();
      assert.equal((await calls()).list.length, initial, 'Open/Close and equivalent workspace object do not fetch');
      assert.equal(await page.getByTestId('inbound-editor').count(), 1);
      await button('Xác minh lại quyền nhập hàng').click(); await ready(); await focusPaint();
      assert.equal((await calls()).list.length, initial + 1, 'explicit verification refresh');
      await field('Tìm phiếu nhập hàng').fill('I40 FILTER');
      await button('Áp dụng lọc nhập hàng').click(); await focusPaint();
      assert.equal((await calls()).list.length, initial + 2);
      assert.equal((await calls()).list.at(-1).search, 'I40 FILTER');
      await button('Trang phiếu tiếp').click(); await focusPaint();
      assert.equal((await calls()).list.length, initial + 3);
      assert.equal((await calls()).list.at(-1).page, 2);
      await field('Lọc chi nhánh').selectOption('BR-A');
      await button('Áp dụng lọc nhập hàng').click(); await focusPaint();
      assert.equal((await calls()).list.length, initial + 4);
      assert.equal((await calls()).list.at(-1).branch, 'BR-A');
      assert.equal((await calls()).list.at(-1).page, 1);
      await page.evaluate(() => window.qa.rights({})); await focusPaint();
      assert.equal((await calls()).list.length, initial + 5, 'authority observation fetches');
      await page.evaluate(() => window.qa.refreshList()); await focusPaint();
      assert.equal((await calls()).list.length, initial + 6, 'explicit list transport refresh');
      assert.equal((await calls()).post.length, 0);
    });
    for (const status of [401, 403, 409]) for (const newer of ['selection', 'aba', 'close', 'authority', 'api', 'login', 'scope'])
      await run(`I40 late list ${status} cannot affect newer ${newer} even when cancellation is ignored`, async () => {
        await reset({readMarkers});
        await page.evaluate(status => {window.qa.hold('list'); window.qa.failList(status);}, status);
        await page.waitForFunction(() => window.qa.held('list') > 0);
        const before = (await calls()).list.length;
        await page.evaluate(() => {window.qa.retainRelease('list'); window.qa.stopHolding('list'); window.qa.listHealthy();});
        if (newer === 'selection' || newer === 'aba') {
          await open('DOC-B'); await ready();
          if (newer === 'aba') {await open('DOC-A'); await ready();}
        } else if (newer === 'close') await button('Đóng phiếu nhập hàng').click();
        else if (newer === 'authority') {await page.evaluate(() => window.qa.rights({})); await ready();}
        else if (newer === 'api') {await page.evaluate(() => window.qa.swapApi()); await ready();}
        else if (newer === 'scope') {
          await page.evaluate(() => {window.qa.hold('list'); window.qa.markers({sessionScope:'c'.repeat(64),readScope:'d'.repeat(64)});});
          await focusPaint();
          assert.equal(await rowFocus('DOC-A').count(), 0, 'old scoped rows hidden before replacement resolves');
          await page.evaluate(() => window.qa.releaseOne('list')); // retire old denial first
        } else {await page.evaluate(markers => window.qa.reset({readMarkers:markers}), readMarkers); await open('DOC-A'); await ready();}
        await page.evaluate(() => window.qaOldRelease()); await focusPaint();
        assert.deepEqual(await page.evaluate(() => window.qaDenied), []);
        assert.equal(await page.getByText('Đã kết thúc phiên. Đăng nhập lại để tiếp tục.', {exact:true}).count(), 0);
        assert.equal(await page.getByText('Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.', {exact:true}).count(), 0);
        if (['selection', 'aba', 'close'].includes(newer)) {
          assert.equal((await calls()).list.length, before, 'selection did not replace the held list request');
          assert.equal(await rowFocus('DOC-A').count(), 1);
        }
        if (newer === 'scope') {
          await page.evaluate(() => window.qa.release('list')); await rowFocus('DOC-A').waitFor();
        } else if (newer !== 'close') assert.equal(await field('Số đơn').inputValue(), newer === 'selection' ? 'FULL ERP B' : 'FULL ERP A');
        assert.equal((await calls()).post.length, 0);
      });
    // I33 Step 2: exercise the actual host/production draft client and getDetail.
    // These synthetic markers represent a separately validated workspace READ
    // scope; command scope, tenant IDs and display names are never substitutes.

    const unavailable = (scopeKey = null) => ({scopeKey,access:{canRead:false,canSave:false,canSend:false,available:false,maxCommandBytes:1048576},data:{outcome:'Unavailable',document:null}});
    const readonly = () => page.getByTestId('inbound-request-readonly');
    const readonlyPhase = phase => page.waitForFunction(phase => document.querySelector('[data-testid=inbound-request-readonly]')?.getAttribute('data-phase')===phase,phase);
    const resetReadonly = async (patch = {}) => {await page.evaluate(patch=>window.qa.reset(patch),{readMarkers,draftReply:unavailable(),...patch});await open('DOC-A');};
    const waitUnavailable = () => page.waitForFunction(()=>window.qa.calls().readReplies.at(-1)?.data.outcome==='Unavailable'&&!document.getElementById('inbound-header-orderNumber'));
    const noProjection = async () => {await focusPaint();assert.equal(await readonly().count(),0);assert.equal((await calls()).detail.length,0);};
    for (const commandScope of [null,'c'.repeat(64)]) await run(`I33 exact Closed+Unavailable (${commandScope===null?'null':'valid hex'} command scope) opens an independently scoped READ projection`,async()=>{
      await resetReadonly({draftReply:unavailable(commandScope)});await readonlyPhase('ready');await focused(detailFocus());
      const c=await calls();assert.deepEqual(c.readReplies[0],unavailable(commandScope));assert.equal(c.read.length,1);
      assert.deepEqual(c.detail,[{path:'/api/erp/api/documents/inbound-requests/detail',query:'?documentId=DOC-A&page=1&pageSize=50',documentId:'DOC-A',page:1,method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{},body:null}]);
      assert.match(await readonly().innerText(),/READ ONLY PROJECTION/);assert.match(await readonly().innerText(),/1234567890123456789012345678\.1234/);
      assert.equal(await field('Số đơn').count(),0);assert.equal(await readonly().locator('input,textarea,select').count(),0);assert.equal(c.post.length,0);assert.equal(c.reconcile.length,0);
      const count=c.detail.length;await open('DOC-A');await focused(detailFocus());assert.equal((await calls()).detail.length,count,'same-selection Open must reuse current read proof');
    });
    await run('I33 command scope cannot substitute for the independently verified detail READ response scope',async()=>{
      await resetReadonly({draftReply:unavailable('c'.repeat(64)),detailResponseMarkers:{sessionScope:readMarkers.sessionScope,readScope:'c'.repeat(64)}});
      await page.getByText('Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.',{exact:true}).waitFor();
      assert.equal(await readonly().count(),0);assert.equal(await field('Số đơn').count(),0);assert.equal((await calls()).detail.length,1);assert.equal((await calls()).post.length,0);assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);
    });
    await run('I33 actual default list enforces workspace READ markers before admitting rows, selection or detail',async()=>{
      await page.evaluate(patch=>window.qa.reset(patch),{useDefaultList:true,readMarkers,draftReply:unavailable()});await rowFocus('DOC-A').waitFor();
      assert.deepEqual((await calls()).listGet,[{path:'/api/erp/api/documents/inbound-requests',query:'?page=1&pageSize=50&search=&branchId=',method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error'}]);assert.equal((await calls()).list.length,0,'supplied list seam is omitted');assert.equal((await calls()).detail.length,0);
      for(const patch of [{listResponseMarkers:{...readMarkers,sessionScope:'c'.repeat(64)}},{listResponseMarkers:{...readMarkers,readScope:'c'.repeat(64)}},{listResponseMarkers:false},{readMarkers:null}]){
        await page.evaluate(patch=>window.qa.reset(patch),{useDefaultList:true,readMarkers,draftReply:unavailable(),...patch});
        const mismatched=!!patch.listResponseMarkers;
        await page.getByText(mismatched?'Chưa xác minh được quyền xem phiếu. Yêu cầu đang xử lý vẫn được giữ.':'Chưa tải được danh sách.',{exact:true}).waitFor();await focusPaint();
        assert.equal(await page.getByRole('button',{name:/^Mở phiếu /}).count(),0);assert.equal(await readonly().count(),0);assert.equal(await field('Số đơn').count(),0);
        const c=await calls();assert.equal(c.list.length,0);assert.equal(c.listGet.length,patch.readMarkers===null?0:1);assert.equal(c.read.length,0);assert.equal(c.detail.length,0);assert.equal(c.post.length,0);assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);
        await focusPaint();assert.equal((await calls()).listGet.length,c.listGet.length,'failed default list does not enter an automatic retry loop');
      }
    });
    await run('I33 authority layout commit fences captured readonly 401/403 before parent releases the old response',async()=>{
      for(const status of [401,403]){
        await resetReadonly({held:{detail:true},detailFailure:status,detailLabel:'RETIRED LAYOUT RESPONSE'});await page.waitForFunction(()=>window.qa.held('detail')===1);await readonly().evaluate(element=>window.qaBoundaryPanel=element);
        await page.evaluate(()=>{window.qa.hold('read');window.qa.detail({releaseDetailOnAuthorityCommit:true,detailFailure:null,detailLabel:'CURRENT LAYOUT RESPONSE'});window.qa.rights({});});
        await page.waitForFunction(()=>window.qa.calls().layoutDetailReleases.length===1&&window.qa.calls().detailCompleted.length===1&&window.qa.held('read')>0);await focusPaint();
        assert.deepEqual((await calls()).layoutDetailReleases,[{authorityVersion:2,panelPresent:true,phase:'pending',abortedAtRelease:true}],'retired generation is already fenced in child layout, before parent layout releases HTTP failure');
        const completed=(await calls()).detailCompleted[0];assert.equal(completed.failure,status);assert.equal(completed.aborted,true,'fetch double still delivered the captured non-OK response despite cancellation');
        assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);assert.equal(await page.evaluate(()=>window.qaBoundaryPanel.isConnected&&window.qaBoundaryPanel===document.querySelector('[data-testid=inbound-request-readonly]')),true);assert.equal(await readonly().getAttribute('data-phase'),'pending');
        assert.equal(await rowFocus('DOC-A').getAttribute('aria-pressed'),'true');assert.equal((await calls()).detail.length,1);assert.doesNotMatch(await page.getByTestId('inbound-request-host').innerText(),/Đã kết thúc phiên|Chưa xác minh được quyền xem phiếu/);
        await page.evaluate(()=>window.qa.release('read'));await page.waitForFunction(()=>window.qa.held('detail')===1&&window.qa.calls().detail.length===2);assert.equal(await page.evaluate(()=>window.qaBoundaryPanel===document.querySelector('[data-testid=inbound-request-readonly]')),true);
        await page.evaluate(()=>window.qa.release('detail'));await readonlyPhase('ready');await focusPaint();assert.match(await readonly().innerText(),/CURRENT LAYOUT RESPONSE/);assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);
        assert.equal(await page.evaluate(()=>window.qaBoundaryPanel===document.querySelector('[data-testid=inbound-request-readonly]')),true);assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);assert.equal((await calls()).post.length,0);assert.equal((await calls()).reconcile.length,0);
      }
    });
    await run('I33 missing EDIT is Denied with available=true; other draft denials and failed transports never admit detail',async()=>{
      const denied={scopeKey:'c'.repeat(64),access:{...unavailable().access,available:true},data:{outcome:'Denied',document:null}};
      const patches=[{draftReply:denied},...['Denied','NotFound','Conflict'].map(outcome=>({draftReply:{...unavailable(),data:{outcome,document:null}}})),
        {draftReply:{...unavailable(),access:{...unavailable().access,available:true}}},
        ...[401,403,404,409].map(draftHttp=>({draftHttp})),{readFailure:true},
        {draftReply:{...unavailable(),scopeKey:'INVALID'}},{draftReply:{...unavailable(),access:{...unavailable().access,maxCommandBytes:0}}},
        {draftReply:{...unavailable(),data:{outcome:'Unavailable',document:null,extra:true}}}];
      for(const patch of patches){await resetReadonly(patch);await page.waitForFunction(()=>window.qa.calls().read.length>0);await focusPaint();await noProjection();
        assert.equal((await calls()).post.length,0);assert.equal((await calls()).reconcile.length,0);
        if(patch.draftReply===denied){assert.deepEqual((await calls()).readReplies[0],denied);assert.equal(await field('Số đơn').count(),0);}
        if(patch.draftHttp===401)assert.deepEqual(await page.evaluate(()=>window.qaDenied),[401]);
      }
    });
    await run('I33 missing READ or missing/invalid workspace READ markers cannot issue detail GET',async()=>{
      await page.evaluate(patch=>window.qa.reset(patch),{readMarkers,draftReply:unavailable(),workspaceCapabilities:[]});await focusPaint();
      assert.equal(await rowFocus('DOC-A').count(),0);await noProjection();
      for(const markers of [null,{sessionScope:readMarkers.sessionScope},{readScope:readMarkers.readScope},
        {sessionScope:'E'.repeat(64),readScope:readMarkers.readScope},{sessionScope:readMarkers.sessionScope,readScope:'not-a-scope'}]){
        await resetReadonly({readMarkers:markers});await waitUnavailable();await noProjection();assert.equal((await calls()).post.length,0);
      }
      await reset({readMarkers});await page.evaluate(reply=>{window.qa.draftReply(reply);window.qa.detail({workspaceCapabilities:[]});window.qa.rights({});},unavailable());
      await waitUnavailable();await noProjection();assert.equal(await rowFocus('DOC-A').count(),0);assert.equal((await calls()).post.length,0);
    });
    await run('I33 failed readonly Open retires focus; retry and later A→B→A never revive the failed projection',async()=>{
      await resetReadonly({detailFailure:'network',detailLabel:'FAILED A'});await readonlyPhase('failed');await focusPaint();
      assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);
      await page.evaluate(()=>window.qa.detail({detailFailure:null,detailLabel:'RECOVERED A'}));await readonly().getByRole('button',{name:'Thử lại',exact:true}).click();await readonlyPhase('ready');await focusPaint();
      assert.match(await readonly().innerText(),/RECOVERED A/);assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false,'retry has no new Open focus ticket');
      await page.evaluate(()=>window.qa.detail({detailLabel:'CURRENT B'}));await open('DOC-B');await readonlyPhase('ready');await focused(detailFocus());assert.match(await readonly().innerText(),/CURRENT B/);
      await page.evaluate(()=>{window.qa.hold('detail');window.qa.detail({detailLabel:'FRESH A'});});await open('DOC-A');await page.waitForFunction(()=>window.qa.held('detail')===1);await readonlyPhase('pending');
      assert.doesNotMatch(await readonly().innerText(),/RECOVERED A|CURRENT B|FAILED A/);await page.evaluate(()=>window.qa.release('detail'));await readonlyPhase('ready');await focused(detailFocus());
      assert.match(await readonly().innerText(),/FRESH A/);assert.equal((await calls()).detail.length,4);assert.equal((await calls()).post.length,0);
    });
    await run('I33 held A→B→A detail success and denial cannot restore a retired projection or consume current focus',async()=>{
      for(const retiredFailure of [null,401]){
        await resetReadonly({held:{detail:true},detailLabel:'RETIRED A',detailFailure:retiredFailure});await page.waitForFunction(()=>window.qa.held('detail')===1);
        await page.evaluate(()=>window.qa.detail({detailLabel:'RETIRED B',detailFailure:null}));await open('DOC-B');await page.waitForFunction(()=>window.qa.held('detail')===2);
        await page.evaluate(()=>window.qa.detail({detailLabel:'CURRENT A'}));await open('DOC-A');await page.waitForFunction(()=>window.qa.held('detail')===3);await readonlyPhase('pending');
        await page.evaluate(()=>{window.qa.releaseOne('detail');window.qa.releaseOne('detail');});await page.waitForFunction(()=>window.qa.calls().detailCompleted.length===2);await focusPaint();
        assert.equal(await readonly().getAttribute('data-phase'),'pending');assert.doesNotMatch(await readonly().innerText(),/RETIRED A|RETIRED B/);
        assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);
        assert.ok((await calls()).detailCompleted.every(result=>result.aborted),'double resolves retired responses despite cancellation');
        await page.evaluate(()=>window.qa.release('detail'));await readonlyPhase('ready');await focused(detailFocus());assert.match(await readonly().innerText(),/CURRENT A/);
        assert.deepEqual((await calls()).detail.map(call=>call.documentId),['DOC-A','DOC-B','DOC-A']);assert.equal((await calls()).post.length,0);
      }
    });
    await run('I33 workspace/API/session-scope/read-scope generations retire held detail and its Open focus',async()=>{
      for(const generation of ['workspace','api','session-scope','read-scope']){
        await resetReadonly({held:{detail:true},detailLabel:'RETIRED GENERATION',detailFailure:401});await page.waitForFunction(()=>window.qa.held('detail')===1);
        await page.evaluate(()=>window.qa.detail({detailLabel:'CURRENT GENERATION',detailFailure:null}));
        if(generation==='workspace'){await page.evaluate(()=>window.qa.workspace(false));await page.waitForFunction(()=>!document.querySelector('[data-testid=inbound-request-readonly]'));await page.evaluate(()=>window.qa.workspace(true));}
        else if(generation==='api')await page.evaluate(()=>window.qa.swapApi());
        else await page.evaluate(({generation,markers})=>window.qa.markers({...markers,[generation==='session-scope'?'sessionScope':'readScope']:'d'.repeat(64)}),{generation,markers:readMarkers});
        await page.waitForFunction(()=>window.qa.held('detail')===2);await readonlyPhase('pending');await page.evaluate(()=>window.qa.releaseOne('detail'));await page.waitForFunction(()=>window.qa.calls().detailCompleted.length===1);await focusPaint();
        assert.equal(await readonly().getAttribute('data-phase'),'pending');assert.doesNotMatch(await readonly().innerText(),/RETIRED GENERATION/);assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);
        await page.evaluate(()=>window.qa.release('detail'));await readonlyPhase('ready');await focusPaint();assert.match(await readonly().innerText(),/CURRENT GENERATION/);
        assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false,'authority/API/scope recovery cannot re-arm old Open focus');assert.equal((await calls()).detail.length,2);assert.equal((await calls()).post.length,0);
      }
    });
    await run('I33 healthy authority refresh preserves readonly page-2 DOM; real workspace/API/scope boundaries require fresh masked reads',async()=>{
      const filter=field('Tìm phiếu nhập hàng'),branch=page.getByRole('form',{name:'Lọc phiếu nhập hàng',exact:true}).getByRole('combobox');
      const sameReadonlyDom=async()=>assert.equal(await page.evaluate(()=>window.qaContinuityPanel.isConnected&&window.qaContinuityPanel===document.querySelector('[data-testid=inbound-request-readonly]')
        &&window.qaContinuityRow.isConnected&&window.qaContinuityRow===document.querySelector('[aria-pressed="true"]')
        &&window.qaContinuityValue.isConnected&&window.qaContinuityPanel.contains(window.qaContinuityValue)),true);
      const readonlyPagingDisabled=async()=>{assert.equal(await readonly().getByRole('button',{name:'Dòng trước',exact:true}).isDisabled(),true);assert.equal(await readonly().getByRole('button',{name:'Dòng tiếp',exact:true}).isDisabled(),true);};
      for(const refresh of ['workspace','authority','api']){
        await page.evaluate(patch=>window.qa.reset(patch),{readMarkers,draftReply:unavailable(),detailLastPage:2,detailLabel:'ORIGINAL PAGE 1'});
        await filter.fill('KEEP APPLIED FILTER');await branch.selectOption('BR-A');await button('Áp dụng lọc nhập hàng').click();await open('DOC-A');await readonlyPhase('ready');
        await page.evaluate(()=>window.qa.detail({detailLabel:'ORIGINAL PAGE 2'}));await readonly().getByRole('button',{name:'Dòng tiếp',exact:true}).click();await readonlyPhase('ready');
        assert.match(await readonly().innerText(),/ORIGINAL PAGE 2/);assert.match(await readonly().getByRole('navigation',{name:'Trang dòng hàng chỉ đọc',exact:true}).innerText(),/Trang 2/);assert.equal((await calls()).detail.at(-1).page,2);
        await filter.fill('KEEP UNAPPLIED FILTER');const before=(await calls()).detail.length;
        await readonly().evaluate(element=>window.qaContinuityPanel=element);await rowFocus('DOC-A').evaluate(element=>window.qaContinuityRow=element);await readonly().getByText('ORIGINAL PAGE 2',{exact:true}).evaluate(element=>window.qaContinuityValue=element);
        await page.evaluate(refresh=>{window.qa.hold('read');window.qa.hold('detail');if(refresh==='authority')window.qa.hold('list');window.qa.detail({detailLabel:'FRESH PAGE 2'});},refresh);
        if(refresh==='workspace'){await page.evaluate(()=>window.qa.workspace(false));await page.waitForFunction(()=>!document.querySelector('[data-testid=inbound-request-readonly]'));assert.doesNotMatch(await page.getByTestId('inbound-request-host').innerText(),/ORIGINAL PAGE 2/);await page.evaluate(()=>window.qa.workspace(true));}
        else if(refresh==='authority')await page.evaluate(()=>window.qa.rights({}));
        else await page.evaluate(()=>window.qa.swapApi());
        await page.waitForFunction(()=>window.qa.held('read')>0);await focusPaint();assert.equal((await calls()).detail.length,before,'no detail request before new typed Unavailable');
        if(refresh==='authority'){
          await readonlyPhase('pending');await page.waitForFunction(()=>window.qa.held('list')>0);await sameReadonlyDom();await readonlyPagingDisabled();assert.match(await readonly().innerText(),/ORIGINAL PAGE 2/);assert.doesNotMatch(await readonly().innerText(),/FRESH PAGE 2/);
          assert.equal(await filter.inputValue(),'KEEP UNAPPLIED FILTER');assert.equal(await branch.inputValue(),'BR-A');assert.equal(await rowFocus('DOC-A').getAttribute('aria-pressed'),'true');assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);
        }else{assert.equal(await readonly().count(),0);assert.doesNotMatch(await page.getByTestId('inbound-request-host').innerText(),/ORIGINAL PAGE 2/);}
        await page.evaluate(()=>window.qa.release('read'));await page.waitForFunction(()=>window.qa.held('detail')===1);await readonlyPhase('pending');
        assert.equal((await calls()).detail.at(-1).documentId,'DOC-A');assert.equal((await calls()).detail.at(-1).page,2,'current page survives same READ identity');
        if(refresh==='authority'){await sameReadonlyDom();await readonlyPagingDisabled();assert.match(await readonly().innerText(),/ORIGINAL PAGE 2/);assert.doesNotMatch(await readonly().innerText(),/FRESH PAGE 2/);}
        else assert.doesNotMatch(await readonly().innerText(),/ORIGINAL PAGE 2|FRESH PAGE 2/);
        assert.equal(await filter.inputValue(),'KEEP UNAPPLIED FILTER');assert.equal(await branch.inputValue(),'BR-A');assert.equal(await rowFocus('DOC-A').getAttribute('aria-pressed'),'true');
        await page.evaluate(()=>window.qa.release('detail'));await readonlyPhase('ready');await focusPaint();assert.match(await readonly().innerText(),/FRESH PAGE 2/);assert.doesNotMatch(await readonly().innerText(),/ORIGINAL PAGE 2/);
        if(refresh==='authority'){await sameReadonlyDom();assert.equal(await page.evaluate(()=>window.qaContinuityValue.textContent),'FRESH PAGE 2');assert.equal(await readonly().getByRole('button',{name:'Dòng trước',exact:true}).isDisabled(),false);await page.evaluate(()=>window.qa.release('list'));await focusPaint();await sameReadonlyDom();}
        assert.match(await readonly().getByRole('navigation',{name:'Trang dòng hàng chỉ đọc',exact:true}).innerText(),/Trang 2/);assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);
        assert.equal(await filter.inputValue(),'KEEP UNAPPLIED FILTER');assert.equal(await branch.inputValue(),'BR-A');assert.equal((await calls()).list.at(-1).search,'KEEP APPLIED FILTER');assert.equal((await calls()).list.at(-1).branch,'BR-A');
        assert.equal((await calls()).detail.length,before+1);assert.equal((await calls()).post.length,0);assert.equal((await calls()).reconcile.length,0);
      }
      await page.evaluate(()=>window.qa.detail({detailLabel:'NEW SELECTION PAGE 1'}));await open('DOC-B');await readonlyPhase('ready');assert.equal((await calls()).detail.at(-1).documentId,'DOC-B');assert.equal((await calls()).detail.at(-1).page,1);
      await open('DOC-A');await readonlyPhase('ready');assert.equal((await calls()).detail.at(-1).documentId,'DOC-A');assert.equal((await calls()).detail.at(-1).page,1,'returning to A is a new selection, not cached page-2 proof');
      await page.evaluate(()=>window.qa.detail({detailLabel:'RETIRED SCOPE PAGE 2'}));await readonly().getByRole('button',{name:'Dòng tiếp',exact:true}).click();await readonlyPhase('ready');assert.equal((await calls()).detail.at(-1).page,2);
      await page.evaluate(markers=>{window.qa.hold('read');window.qa.hold('detail');window.qa.detail({detailLabel:'NEW SCOPE PAGE 1'});window.qa.markers(markers);},{...readMarkers,readScope:'d'.repeat(64)});
      await page.waitForFunction(()=>window.qa.held('read')>0);assert.equal(await readonly().count(),0);assert.doesNotMatch(await page.getByTestId('inbound-request-host').innerText(),/RETIRED SCOPE PAGE 2/);
      await page.evaluate(()=>window.qa.release('read'));await page.waitForFunction(()=>window.qa.held('detail')===1);await readonlyPhase('pending');assert.equal((await calls()).detail.at(-1).page,1);assert.doesNotMatch(await readonly().innerText(),/RETIRED SCOPE PAGE 2|NEW SCOPE PAGE 1/);
      await page.evaluate(()=>window.qa.release('detail'));await readonlyPhase('ready');await focusPaint();assert.match(await readonly().innerText(),/NEW SCOPE PAGE 1/);assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);assert.equal((await calls()).post.length,0);assert.equal((await calls()).reconcile.length,0);
    });
    await run('I33 scoped detail pageSize 25 is rejected even when one returned row fits its bound',async()=>{
      await resetReadonly({detailPageSize:25,detailLabel:'WRONG PAGE SIZE'});await readonlyPhase('failed');await focusPaint();assert.doesNotMatch(await readonly().innerText(),/WRONG PAGE SIZE/);
      assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);assert.equal((await calls()).detail.length,1);assert.equal((await calls()).post.length,0);assert.equal((await calls()).reconcile.length,0);
    });
    await run('I33 dirty original editor stays mounted and guarded through temporary readonly fallback, then restores exact full edits',async()=>{
      await reset({readMarkers});await field('Số đơn').fill('  ORIGINAL EDIT\nKEEP  ');await field('Ghi chú').fill('NOTE\nKEEP');
      await page.getByLabel('Số lượng bộ theo chứng từ',{exact:true}).first().fill('1234500');await field('Ghi chú gửi kho NULL').uncheck();await field('Ghi chú gửi kho').fill('SEND NOTE');
      await page.evaluate(()=>{window.qaEditorWrapper=document.querySelector('[data-testid=inbound-editor]').parentElement;});
      await page.evaluate(reply=>{window.qa.draftReply(reply);window.qa.rights({});},unavailable());await readonlyPhase('ready');
      assert.equal(await page.evaluate(()=>window.qaEditorWrapper.isConnected&&window.qaEditorWrapper===document.querySelector('[aria-label="Phiếu nhập hàng đã chọn"]').firstElementChild&&window.qaEditorWrapper.hidden),true);
      assert.match(await readonly().innerText(),/READ ONLY PROJECTION/);assert.equal(await field('Số đơn').count(),0);
      await blocked(()=>button('Đóng phiếu nhập hàng').click(),true);await blocked(()=>open('DOC-B'),true);assert.deepEqual((await calls()).detail.map(call=>call.documentId),['DOC-A']);
      await page.evaluate(()=>{window.qa.draftReply(null);window.qa.rights({});});await ready();assert.equal(await readonly().count(),0);
      assert.equal(await page.evaluate(()=>window.qaEditorWrapper.isConnected&&window.qaEditorWrapper===document.querySelector('[data-testid=inbound-editor]').parentElement&&!window.qaEditorWrapper.hidden),true);
      assert.equal(await field('Số đơn').inputValue(),'  ORIGINAL EDIT\nKEEP  ');assert.equal(await field('Ghi chú').inputValue(),'NOTE\nKEEP');assert.equal(await field('Ghi chú gửi kho').inputValue(),'SEND NOTE');
      const quantities=page.getByLabel('Số lượng bộ theo chứng từ',{exact:true});assert.equal(await quantities.count(),2);assert.equal(await quantities.first().inputValue(),'1234500');assert.equal(await quantities.nth(1).inputValue(),source.details[1].setQuantityByDocument);
      assert.equal(await field('Ngày giờ chứng từ').inputValue(),source.header.documentDate);assert.equal(await field('Tỷ giá').inputValue(),source.header.rateExchange);assert.equal(await page.getByLabel('Ngày giờ hết hạn theo chứng từ',{exact:true}).first().inputValue(),source.details[0].expireDateByDocument);
      assert.doesNotMatch(await page.getByTestId('inbound-editor').innerText(),/READ ONLY PROJECTION|PROJECTION-DOC-A/);await blocked(()=>button('Đóng phiếu nhập hàng').click(),true);assert.equal((await calls()).post.length,0);assert.equal((await calls()).reconcile.length,0);
      await page.evaluate(()=>window.qa.mode('lost'));await save();await unknown();const original=(await calls()).post[0],dto=JSON.parse(original);
      assert.equal(dto.header.orderNumber,'  ORIGINAL EDIT\nKEEP  ');assert.equal(dto.header.notes,'NOTE\nKEEP');assert.equal(dto.expectedStateEqualityToken,source.stateEqualityToken);
      assert.deepEqual(dto.detailUpserts,[{...source.details[0],setQuantityByDocument:'1234500'}]);assert.deepEqual(dto.removedDetailIds,[]);assert.doesNotMatch(original,/READ ONLY PROJECTION|PROJECTION-DOC-A/);
      await button('Kiểm tra yêu cầu gốc').click();await confirmed();await ready();assert.equal(await quantities.first().inputValue(),'1234500');assert.equal(await quantities.nth(1).inputValue(),source.details[1].setQuantityByDocument);const c=await calls();assert.deepEqual(c.post,[original]);assert.deepEqual(c.reconcile,[original]);assert.equal(c.detail.length,1);
    });
    await run('I33 typed Unavailable cannot replace unknown original custody; recovery reconciles the exact original key/body once',async()=>{
      await reset({readMarkers,mode:'lost'});await field('Số đơn').fill('EXACT ORIGINAL\nKEEP');await save();await unknown();const original=(await calls()).post[0],originalKey=JSON.parse(original).operationId;
      await page.evaluate(()=>{window.qaEditorWrapper=document.querySelector('[data-testid=inbound-editor]').parentElement;});
      await page.evaluate(reply=>{window.qa.draftReply(reply);window.qa.rights({});},unavailable());await waitUnavailable();await noProjection();
      assert.equal(await page.evaluate(()=>window.qaEditorWrapper.isConnected),true);await blocked(()=>button('Đóng phiếu nhập hàng').click());await blocked(()=>open('DOC-B'));
      assert.equal((await calls()).post.length,1);assert.equal((await calls()).reconcile.length,0);
      await page.evaluate(()=>{window.qa.draftReply(null);window.qa.rights({});});await unknown();await button('Kiểm tra yêu cầu gốc').click();await confirmed();await ready();
      const c=await calls();assert.deepEqual(c.post,[original]);assert.deepEqual(c.reconcile,[original]);assert.equal(JSON.parse(c.reconcile[0]).operationId,originalKey);assert.equal(c.detail.length,0);
      assert.equal(await field('Số đơn').inputValue(),'EXACT ORIGINAL\nKEEP');assert.equal(await page.evaluate(()=>window.qaEditorWrapper===document.querySelector('[data-testid=inbound-editor]').parentElement),true);
    });
    await run('I33 typed Unavailable cannot replace confirmed readback custody or release its barrier through projection',async()=>{
      await reset({readMarkers,mode:'readFailure'});await field('Số đơn').fill('CONFIRMED ORIGINAL');await save();await confirmed();await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='readFailed');
      const original=(await calls()).post[0];await page.evaluate(()=>{window.qaEditorWrapper=document.querySelector('[data-testid=inbound-editor]').parentElement;});
      await page.evaluate(reply=>{window.qa.healthy();window.qa.draftReply(reply);window.qa.rights({});},unavailable());await waitUnavailable();await noProjection();
      assert.equal(await page.getByTestId('inbound-request-host').getAttribute('data-readback-pending'),'true');assert.equal(await page.evaluate(()=>window.qaEditorWrapper.isConnected),true);
      await blocked(()=>open('DOC-B'));await blocked(()=>button('Đóng phiếu nhập hàng').click());assert.equal((await calls()).read.includes('DOC-B'),false);assert.equal(await button('Kiểm tra yêu cầu gốc').count(),0);
      await page.evaluate(()=>{window.qa.draftReply(null);window.qa.rights({});});await ready();assert.equal(await readonly().count(),0);assert.equal(await field('Số đơn').inputValue(),'CONFIRMED ORIGINAL');
      const c=await calls();assert.deepEqual(c.post,[original]);assert.deepEqual(c.reconcile,[]);assert.equal(c.detail.length,0);assert.equal(await page.getByTestId('inbound-request-host').getAttribute('data-readback-pending'),'false');
      assert.equal(await page.evaluate(()=>window.qaEditorWrapper===document.querySelector('[data-testid=inbound-editor]').parentElement),true);
    });
    // Intrinsic child contract only: this mode intentionally does not mount
    // InboundRequestScreen. Composed-host claims belong to the 15 cases above.
    await run('I33 direct component props: committed A→B→A cannot revive original A; continuous A revisions retain current data',async()=>{
      for(const retiredFailure of [null,401,403]){
        await page.evaluate(patch=>window.qa.reset(patch),{directReadonly:true,readMarkers,detailLastPage:2,detailLabel:'ORIGINAL DIRECT A'});await readonlyPhase('ready');
        assert.equal(await page.getByTestId('inbound-request-host').count(),0);assert.match(await readonly().innerText(),/ORIGINAL DIRECT A/);await readonly().evaluate(element=>window.qaDirectPanel=element);
        await page.evaluate(failure=>{window.qa.hold('detail');window.qa.detail({detailLabel:'RETIRED DIRECT B',detailFailure:failure});window.qa.directProps({documentId:'DOC-B'});},retiredFailure);
        await page.waitForFunction(()=>window.qa.held('detail')===1);await readonlyPhase('pending');assert.doesNotMatch(await readonly().innerText(),/ORIGINAL DIRECT A|RETIRED DIRECT B/);
        await page.evaluate(()=>{window.qa.detail({detailLabel:'CURRENT DIRECT A',detailFailure:null});window.qa.directProps({documentId:'DOC-A'});});await page.waitForFunction(()=>window.qa.held('detail')===2);await readonlyPhase('pending');
        assert.equal(await page.evaluate(()=>window.qaDirectPanel.isConnected&&window.qaDirectPanel===document.querySelector('[data-testid=inbound-request-readonly]')),true);assert.doesNotMatch(await readonly().innerText(),/ORIGINAL DIRECT A|RETIRED DIRECT B|CURRENT DIRECT A/,'matching document ID cannot revive a retired selection instance');
        await page.evaluate(()=>window.qa.releaseOne('detail'));await page.waitForFunction(()=>window.qa.calls().detailCompleted.length===2);await focusPaint();
        assert.equal(await readonly().getAttribute('data-phase'),'pending');assert.doesNotMatch(await readonly().innerText(),/ORIGINAL DIRECT A|RETIRED DIRECT B|CURRENT DIRECT A/);assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);
        const retired=(await calls()).detailCompleted[1];assert.equal(retired.documentId,'DOC-B');assert.equal(retired.failure,retiredFailure);assert.equal(retired.aborted,true);
        await page.evaluate(()=>window.qa.release('detail'));await readonlyPhase('ready');assert.match(await readonly().innerText(),/CURRENT DIRECT A/);assert.doesNotMatch(await readonly().innerText(),/ORIGINAL DIRECT A|RETIRED DIRECT B/);assert.deepEqual((await calls()).detail.map(call=>call.documentId),['DOC-A','DOC-B','DOC-A']);
        await readonly().getByText('CURRENT DIRECT A',{exact:true}).evaluate(element=>window.qaDirectValue=element);let currentLabel='CURRENT DIRECT A';
        for(const refresh of ['readRevision','verifying']){
          const nextLabel=refresh==='readRevision'?'REVISION DIRECT A':'VERIFIED DIRECT A',before=(await calls()).detail.length;
          await page.evaluate(({refresh,label})=>{window.qa.hold('detail');window.qa.detail({detailLabel:label});window.qa.directProps(refresh==='readRevision'?{readRevision:1}:{verifying:true});},{refresh,label:nextLabel});
          await readonlyPhase('pending');assert.equal(await readonly().getByText(currentLabel,{exact:true}).count(),1);assert.equal(await readonly().getByText(nextLabel,{exact:true}).count(),0);
          assert.equal(await page.evaluate(()=>window.qaDirectPanel.isConnected&&window.qaDirectPanel===document.querySelector('[data-testid=inbound-request-readonly]')&&window.qaDirectValue.isConnected&&window.qaDirectPanel.contains(window.qaDirectValue)),true);
          assert.equal(await readonly().getByRole('button',{name:'Dòng tiếp',exact:true}).isDisabled(),true);
          if(refresh==='verifying'){await focusPaint();assert.equal((await calls()).detail.length,before,'verifying alone must not issue a GET');await page.evaluate(()=>window.qa.directProps({verifying:false}));}
          await page.waitForFunction(()=>window.qa.held('detail')===1);assert.equal((await calls()).detail.length,before+1);assert.equal(await readonly().getByText(currentLabel,{exact:true}).count(),1);assert.equal(await readonly().getByRole('button',{name:'Dòng tiếp',exact:true}).isDisabled(),true);
          await page.evaluate(()=>window.qa.release('detail'));await readonlyPhase('ready');assert.equal(await readonly().getByText(nextLabel,{exact:true}).count(),1);assert.equal(await readonly().getByText(currentLabel,{exact:true}).count(),0);
          assert.equal(await page.evaluate(()=>window.qaDirectPanel===document.querySelector('[data-testid=inbound-request-readonly]')&&window.qaDirectValue.isConnected&&window.qaDirectPanel.contains(window.qaDirectValue)),true);assert.equal(await page.evaluate(()=>window.qaDirectValue.textContent),nextLabel);assert.equal(await readonly().getByRole('button',{name:'Dòng tiếp',exact:true}).isDisabled(),false);currentLabel=nextLabel;
        }
        const c=await calls();assert.equal(c.read.length,0);assert.equal(c.list.length,0);assert.equal(c.listGet.length,0);assert.equal(c.post.length,0);assert.equal(c.reconcile.length,0);assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);
      }
    });
    await run('I33 accepted full read focuses detail; same-document focus preserves dirty guard and values',async()=>{
      await reset();await focused(detailFocus());await field('Số đơn').fill('FOCUS DIRTY A');const before=await calls();await open('DOC-A');await focused(detailFocus());assert.equal(await field('Số đơn').inputValue(),'FOCUS DIRTY A');assert.equal((await calls()).read.length,before.read.length);
      await blocked(()=>button('Đóng phiếu nhập hàng').click(),true);assert.equal(await field('Số đơn').inputValue(),'FOCUS DIRTY A');assert.equal(await page.getByTestId('inbound-editor').getAttribute('data-document-id'),'DOC-A');
      await open('DOC-B');await page.getByRole('alertdialog').waitFor();await button('Bỏ thay đổi và rời màn hình').click();await ready();await focused(detailFocus());assert.equal(await field('Số đơn').inputValue(),'FULL ERP B');assert.equal((await calls()).post.length,0);
    });
    await run('I33 approved Close returns focus to the current originating row without changing list controls',async()=>{
      await reset();await focused(detailFocus());await field('Tìm phiếu nhập hàng').fill('UNAPPLIED FOCUS FILTER');await field('Số đơn').fill('DIRTY CLOSE VALUE');await button('Đóng phiếu nhập hàng').click();await page.getByRole('alertdialog').waitFor();assert.equal(await page.evaluate(()=>window.qaLeft),false);await button('Bỏ thay đổi và rời màn hình').click();await focused(rowFocus('DOC-A'));assert.equal(await field('Tìm phiếu nhập hàng').inputValue(),'UNAPPLIED FOCUS FILTER');assert.equal(await page.getByTestId('inbound-editor').count(),0);assert.equal((await calls()).post.length,0);
    });
    await run('I33 held Open read respects later input focus and authority revalidation never creates a new focus ticket',async()=>{
      await page.evaluate(()=>window.qa.reset({held:{read:true}}));await open('DOC-A');await page.waitForFunction(()=>window.qa.held('read')>0);await field('Tìm phiếu nhập hàng').fill('KEEP THIS FOCUS');await page.evaluate(()=>window.qa.release('read'));await ready();await focusPaint();assert.equal(await field('Tìm phiếu nhập hàng').evaluate(element=>document.activeElement===element),true);
      await page.evaluate(()=>window.qa.reset({held:{read:true}}));await open('DOC-A');await page.waitForFunction(()=>window.qa.held('read')>0);
      // No intervening pointer/key/focus input cancels this live Open ticket: authority alone must retire it.
      await page.evaluate(()=>{window.qa.rights({canRead:false,canSave:false,canSend:false});window.qa.release('read');});await page.waitForFunction(()=>!document.getElementById('inbound-header-orderNumber'));await focusPaint();assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);
      await page.evaluate(()=>window.qa.rights({}));await ready();await focusPaint();assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);assert.equal((await calls()).post.length,0);
    });
    await run('I33 failed Open is retired; explicit retry can recover data without delayed focus theft',async()=>{
      await page.evaluate(()=>window.qa.reset({readFailure:true}));await open('DOC-A');await page.getByText('Chưa xác minh được quyền nhập hàng. Ý định đang giữ không bị bỏ; thử xác minh lại trong đúng phiên.',{exact:true}).waitFor();await page.evaluate(()=>window.qa.healthy());await button('Xác minh lại quyền nhập hàng').click();await ready();await focusPaint();assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false);assert.equal(await field('Số đơn').inputValue(),'FULL ERP A');const before=(await calls()).read.length;await open('DOC-A');await focused(detailFocus());assert.equal((await calls()).read.length,before);assert.equal((await calls()).post.length,0);
    });
    await run('I33 same-document Open waits for new bound full read after bootstrap, not an old readiness event',async()=>{
      await reset();await focused(detailFocus());await field('Tìm phiếu nhập hàng').focus();await page.evaluate(()=>{window.qa.hold('read');window.qa.rights({});});await page.waitForFunction(()=>window.qa.held('read')>0);const before=(await calls()).read.length;
      await page.evaluate(()=>window.qa.releaseOne('read'));await page.waitForFunction(before=>window.qa.calls().read.length>before&&window.qa.held('read')>0,before);await open('DOC-A');await focusPaint();assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false,'bootstrap is not current I18 presentation proof');
      await page.evaluate(()=>window.qa.release('read'));await ready();await focused(detailFocus());assert.equal(await field('Số đơn').inputValue(),'FULL ERP A');
      await page.evaluate(()=>window.qa.hold('read'));await button('Đọc lại ERP').click();await page.waitForFunction(()=>window.qa.held('read')>0);await open('DOC-A');await focusPaint();assert.equal(await detailFocus().evaluate(element=>document.activeElement===element),false,'an old ready event cannot satisfy explicit child reread');
      await page.evaluate(()=>window.qa.release('read'));await ready();await focused(detailFocus());assert.equal((await calls()).post.length,0);
    });
    for (const width of [320, 360, 390]) await run(`${width}px real host uses full read; dirty selection/filter/page/close/Back show dialog`, async () => {
      await page.setViewportSize({width, height: 844}); await reset(); assert.equal(await field('Số đơn').inputValue(), 'FULL ERP A');
      assert.equal(await page.evaluate(w => document.documentElement.scrollWidth <= w, width), true);
      await field('Số đơn').fill('UNSAVED');
      for (const action of [() => open('DOC-B'), () => button('Áp dụng lọc nhập hàng').click(), () => button('Trang phiếu tiếp').click(),
        () => button('Đóng phiếu nhập hàng').click(), () => button('Quay lại danh sách').click(), () => page.evaluate(() => history.back())]) {
        await blocked(action, true); assert.equal(await field('Số đơn').inputValue(), 'UNSAVED');
      }
    });
    await run('guard dialogs and parent callback rerenders do not append history; deferred callbacks use latest commit', async () => {
      for (const nav of ['Quay lại danh sách', 'Đóng phiếu nhập hàng']) {
        await reset(); await field('Số đơn').fill('HISTORY DIRTY');
        const initial = await page.evaluate(() => ({length:history.length,pushes:window.qaPushes}));
        for (let index=1;index<=3;index++) {
          await blocked(() => button(nav).click(), true);
          await page.evaluate(() => window.qa.rerender());
          await page.waitForFunction(index => window.qa.callbackRevision() === index, index);
          assert.deepEqual(await page.evaluate(() => ({length:history.length,pushes:window.qaPushes})), initial);
        }
        await button(nav).click(); await page.getByRole('alertdialog').waitFor({state:'visible'});
        await page.evaluate(() => window.qa.rerender()); await page.waitForFunction(() => window.qa.callbackRevision() === 4);
        await button('Bỏ thay đổi và rời màn hình').click(); await page.waitForFunction(() => window.qaLeft);
        assert.equal(await page.evaluate(() => window.qaCallback), 4);
        assert.deepEqual(await page.evaluate(() => ({length:history.length,pushes:window.qaPushes})), initial);
      }
    });
    await run('old discard dialog cannot release a command that became pending', async () => {
      await reset({mode:'lost'}); await field('Số đơn').fill('PENDING AFTER DIALOG'); await review();
      await button('Đóng phiếu nhập hàng').click(); await page.getByRole('alertdialog').waitFor({state:'visible'});
      await page.evaluate(() => {window.qa.hold('post'); [...document.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi').click();});
      await page.waitForFunction(() => window.qa.held('post') > 0);
      await button('Bỏ thay đổi và rời màn hình').click(); assert.equal(await page.evaluate(() => window.qaLeft), false);
      await blocked(() => button('Đóng phiếu nhập hàng').click());
      await page.evaluate(() => window.qa.release('post')); await unknown();
      await button('Kiểm tra yêu cầu gốc').click(); await confirmed();
      const c=await calls(); assert.equal(c.post.length,1); assert.equal(c.reconcile[0],c.post[0]);
    });
    await run('Send-only note remains guarded through pending authority revalidation and preflight read', async () => {
      for (const note of ['', 'KEEP SEND NOTE']) {
        await reset(); await field('Ghi chú gửi kho NULL').uncheck(); await field('Ghi chú gửi kho').fill(note);
        await page.evaluate(() => {window.qa.hold('read'); window.qa.rights({canSend: true});});
        await page.waitForFunction(() => window.qa.held('read') > 0); await blocked(() => button('Đóng phiếu nhập hàng').click(), true);
        await page.evaluate(() => window.qa.release('read')); await ready(); assert.equal(await field('Ghi chú gửi kho').inputValue(), note);
        await review(); await page.evaluate(() => window.qa.hold('read')); await button('Gửi yêu cầu nhập kho').click();
        await page.waitForFunction(() => document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase') === 'checking');
        await blocked(() => open('DOC-B')); await button('Hủy kiểm tra trước khi gửi').click();
        await page.evaluate(() => window.qa.release('read')); await ready(); assert.equal(await field('Ghi chú gửi kho').inputValue(), note);
        assert.equal((await calls()).post.length, 0);
      }
    });
    for (const action of ['Save', 'SendToWarehouse']) await run(`pending ${action}, double tap, lost ACK and pending reconciliation block navigation`, async () => {
      await reset({mode: 'lost'}); if (action === 'Save') await field('Số đơn').fill('PENDING'); await review();
      await page.evaluate(() => window.qa.hold('post'));
      await page.getByRole('button', {name: action === 'Save' ? 'Lưu thay đổi' : 'Gửi yêu cầu nhập kho', exact: true}).evaluate(b => {b.click(); b.click();});
      await page.waitForFunction(() => window.qa.held('post') > 0); assert.equal((await calls()).post.length, 1);
      for (const nav of [() => open('DOC-B'), () => button('Áp dụng lọc nhập hàng').click(), () => button('Trang phiếu tiếp').click(), () => button('Đóng phiếu nhập hàng').click(), () => page.evaluate(() => history.back())]) await blocked(nav);
      await page.evaluate(() => window.qa.release('post')); await unknown();
      await page.evaluate(() => window.qa.hold('reconcile')); await button('Kiểm tra yêu cầu gốc').click();
      await page.waitForFunction(() => window.qa.held('reconcile') > 0); await blocked(() => button('Quay lại danh sách').click());
      await page.evaluate(() => window.qa.release('reconcile')); await confirmed(); const c = await calls(); assert.equal(c.post.length, 1); assert.equal(c.reconcile[0], c.post[0]);
    });
    for (const outcome of ['Observed','Committed','Replayed','InvalidInput','Denied','NotFound','Conflict','Rejected','UnsupportedCostEdits','NumberingUnavailable','Unavailable','OutcomeUnknown'])
      await run(`real I18 in host reconciles ${outcome} without replacement execute`, async () => {
        await reset({mode: 'lost', outcome}); await field('Số đơn').fill('ORIGINAL'); await save(); await unknown();
        await button('Kiểm tra yêu cầu gốc').click();
        if (['Committed','Replayed'].includes(outcome)) await confirmed(); else {await unknown(); await blocked(() => button('Đóng phiếu nhập hàng').click());
          await page.evaluate(() => window.qa.outcome('Replayed')); await button('Kiểm tra yêu cầu gốc').click(); await confirmed();}
        const c = await calls(); assert.equal(c.post.length, 1); assert.ok(c.reconcile.every(body => body === c.post[0]));
      });
    await run('workspace temporarily null hides data but same-scope restoration reconciles original', async () => {
      await reset({mode: 'lost'}); await field('Số đơn').fill('RETAIN'); await save(); await unknown();
      await page.evaluate(() => window.qa.workspace(false)); await page.waitForFunction(() => !document.querySelector('#inbound-header-orderNumber'));
      await blocked(() => button('Đóng phiếu nhập hàng').click());
      await page.evaluate(() => window.qa.workspace(true)); await unknown(); await button('Kiểm tra yêu cầu gốc').click(); await confirmed();
      const c = await calls(); assert.equal(c.post.length, 1); assert.equal(c.reconcile[0], c.post[0]);
    });
    await run('permission loss hides data; restore preserves pending intent and Send-only note', async () => {
      await reset(); await field('Ghi chú gửi kho NULL').uncheck(); await field('Ghi chú gửi kho').fill('RIGHTS NOTE');
      await page.evaluate(() => window.qa.rights({canRead:false,canSave:false,canSend:false}));
      await page.waitForFunction(() => !document.getElementById('inbound-header-orderNumber')); await blocked(() => button('Đóng phiếu nhập hàng').click(), true);
      await page.evaluate(() => window.qa.rights({})); await ready(); assert.equal(await field('Ghi chú gửi kho').inputValue(), 'RIGHTS NOTE');
    });
    for (const state of ['pending','confirmed']) await run(`current list 401 hides ${state} draft/filter/selection/receipt and cannot reopen same login`, async () => {
      await reset(); await field('Tìm phiếu nhập hàng').fill('PRIVATE FILTER');
      const branchFilter=page.getByRole('form',{name:'Lọc phiếu nhập hàng',exact:true}).getByRole('combobox');
      assert.equal(await branchFilter.count(),1);await branchFilter.selectOption('BR-A');
      assert.equal(await branchFilter.inputValue(),'BR-A');assert.equal(await field('Tìm phiếu nhập hàng').inputValue(),'PRIVATE FILTER');
      await field('Số đơn').fill('SESSION PRIVATE');
      if(state==='pending') await page.evaluate(() => window.qa.hold('post'));
      await save();
      if(state==='pending') await page.waitForFunction(() => window.qa.held('post') > 0);
      else {await confirmed(); await ready(); await page.waitForSelector('[data-testid=inbound-host-receipt]');}
      await page.evaluate(() => window.qa.failList(401)); await page.waitForFunction(() => window.qaDenied?.length === 1);
      const hidden=async()=>{assert.equal(await field('Số đơn').count(),0);assert.equal(await field('Tìm phiếu nhập hàng').count(),0);assert.equal(await branchFilter.count(),0);
        assert.equal(await page.locator('[aria-pressed=true]').count(),0);assert.equal(await page.locator('[data-testid=inbound-host-receipt],[data-testid=confirmed-receipt]').count(),0);
        assert.match(await page.getByTestId('inbound-request-host').innerText(),/Đã kết thúc phiên/);};
      await hidden();
      if(state==='pending') {await page.evaluate(() => window.qa.release('post')); await page.waitForTimeout(30); await hidden();}
      await page.evaluate(() => {window.qa.listHealthy();window.qa.rights({});window.qa.rerender();});
      await page.waitForFunction(() => window.qa.callbackRevision()===1); await hidden();
      assert.deepEqual(await page.evaluate(() => window.qaDenied),[401]); assert.equal((await calls()).post.length,1);
      await reset(); assert.equal(await field('Số đơn').inputValue(),'FULL ERP A'); assert.equal(await field('Tìm phiếu nhập hàng').inputValue(),'');assert.equal(await branchFilter.inputValue(),'');
      assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(),0); assert.equal(await button('Kiểm tra yêu cầu gốc').count(),0);
    });
    for(const status of [403,409]) await run(`list ${status} suspends authority, preserves held original, and same-session validation can recover`,async()=>{
      await reset();await field('Số đơn').fill('ORIGINAL '+status);await page.evaluate(()=>window.qa.hold('post'));await save();
      await page.waitForFunction(()=>window.qa.held('post')>0);const original=(await calls()).post[0];
      await page.evaluate(status=>window.qa.failList(status),status);await page.waitForFunction(()=>!document.getElementById('inbound-header-orderNumber'));
      assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);await blocked(()=>button('Đóng phiếu nhập hàng').click());
      await page.evaluate(()=>{window.qa.release('post');window.qa.listHealthy();window.qa.hold('read');});
      await button('Xác minh lại quyền nhập hàng').click();await page.waitForFunction(()=>window.qa.held('read')>0);
      assert.equal(await field('Số đơn').count(),0);await page.evaluate(()=>window.qa.release('read'));await unknown();
      await button('Kiểm tra yêu cầu gốc').click();await confirmed();const c=await calls();assert.equal(c.post.length,1);assert.equal(c.reconcile[0],original);
    });
    for(const status of [503,'network']) await run(`list ${status} is temporary and does not retire pending command or filters`,async()=>{
      await reset();await field('Tìm phiếu nhập hàng').fill('RETAIN FILTER');await field('Số đơn').fill('RETAIN COMMAND');
      await page.evaluate(()=>window.qa.hold('post'));await save();await page.waitForFunction(()=>window.qa.held('post')>0);
      await page.evaluate(status=>window.qa.failList(status),status);await page.getByText('Chưa tải được danh sách.',{exact:true}).waitFor();
      assert.equal(await field('Tìm phiếu nhập hàng').inputValue(),'RETAIN FILTER');assert.equal(await page.getByTestId('inbound-editor').getAttribute('data-phase'),'pending');
      assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);await blocked(()=>button('Đóng phiếu nhập hàng').click());
      await page.evaluate(()=>window.qa.release('post'));await confirmed();assert.equal((await calls()).post.length,1);
    });
    for(const newer of ['authority','api','login']) await run(`stale list 401 cannot end newer ${newer} context even if cancellation is ignored`,async()=>{
      await reset();await page.evaluate(()=>{window.qa.hold('list');window.qa.failList(401);});await page.waitForFunction(()=>window.qa.held('list')>0);
      await page.evaluate(newer=>{window.qa.retainRelease('list');window.qa.stopHolding('list');window.qa.listHealthy();
        if(newer==='authority')window.qa.rights({});else if(newer==='api')window.qa.swapApi();else window.qa.reset({});},newer);
      if(newer==='login')await open('DOC-A');await ready();await page.evaluate(()=>window.qaOldRelease());await page.waitForTimeout(30);
      assert.deepEqual(await page.evaluate(()=>window.qaDenied),[]);assert.equal(await field('Số đơn').inputValue(),'FULL ERP A');
      assert.equal(await field('Tìm phiếu nhập hàng').count(),1);
    });
    await run('receipt A is hidden under pending or proved read of B, then restored only after A proof',async()=>{
      await reset();await field('Số đơn').fill('RECEIPT A');await save();await confirmed();await ready();
      const receipt=await page.getByTestId('inbound-host-receipt').innerText();
      await page.evaluate(()=>window.qa.hold('read'));await open('DOC-B');await page.waitForFunction(()=>window.qa.held('read')>0);
      assert.equal(await page.locator('[data-testid=inbound-host-receipt],[data-testid=confirmed-receipt]').count(),0);
      await page.evaluate(()=>window.qa.release('read'));await ready();assert.equal(await field('Số đơn').inputValue(),'FULL ERP B');
      assert.equal(await page.locator('[data-testid=inbound-host-receipt],[data-testid=confirmed-receipt]').count(),0);
      await page.evaluate(()=>window.qa.hold('read'));await open('DOC-A');await page.waitForFunction(()=>window.qa.held('read')>0);
      assert.equal(await page.locator('[data-testid=inbound-host-receipt]').count(),0);await page.evaluate(()=>window.qa.release('read'));await ready();
      assert.equal(await page.getByTestId('inbound-host-receipt').innerText(),receipt);assert.equal((await calls()).post.length,1);
    });
    for(const mode of ['readFailure','malformedRead','mismatchedRead']) await run(`confirmed A ${mode} blocks navigation without treating the commit as unknown`,async()=>{
      await reset({mode});await field('Số đơn').fill('COMMITTED A');await save();await confirmed();
      await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='readFailed');
      const receipt=await page.getByTestId('inbound-host-receipt').innerText();
      for(const nav of [()=>open('DOC-B'),()=>button('Áp dụng lọc nhập hàng').click(),()=>button('Trang phiếu tiếp').click(),
        ()=>button('Đóng phiếu nhập hàng').click(),()=>button('Quay lại danh sách').click(),()=>page.evaluate(()=>history.back())]) await blocked(nav);
      assert.equal(await page.getByTestId('inbound-editor').getAttribute('data-document-id'),'DOC-A');
      assert.equal((await calls()).read.includes('DOC-B'),false);assert.equal(await page.getByTestId('inbound-host-receipt').innerText(),receipt);
      assert.equal(await button('Kiểm tra yêu cầu gốc').count(),0);
      await page.evaluate(()=>{window.qa.healthy();window.qa.hold('read');});await button('Đọc lại ERP').click();
      await page.waitForFunction(()=>window.qa.held('read')>0);await blocked(()=>open('DOC-B'));
      await page.evaluate(()=>window.qa.release('read'));await ready();await open('DOC-B');await ready();
      assert.equal(await field('Số đơn').inputValue(),'FULL ERP B');assert.equal(await page.locator('[data-testid=inbound-host-receipt],[data-testid=confirmed-receipt]').count(),0);
      const c=await calls();assert.equal(c.post.length,1);assert.equal(c.reconcile.length,0);
    });
    await run('bootstrap proof and a retired readback cannot clear the confirmed snapshot barrier',async()=>{
      await reset({mode:'readFailure'});await field('Số đơn').fill('FENCED RECEIPT');await save();await confirmed();
      await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='readFailed');
      await page.evaluate(()=>{window.qa.healthy();window.qa.hold('read');window.qa.rights({});});
      await page.waitForFunction(()=>window.qa.held('read')>0);const before=(await calls()).read.length;
      await page.evaluate(()=>window.qa.releaseOne('read'));
      await page.waitForFunction(before=>window.qa.calls().read.length>before&&window.qa.held('read')>0,before);
      await blocked(()=>open('DOC-B'));assert.equal((await calls()).read.includes('DOC-B'),false);
      await page.evaluate(()=>{window.qa.release('read');window.qa.rights({canRead:false,canSave:false,canSend:false});});
      await page.waitForFunction(()=>!document.getElementById('inbound-header-orderNumber'));
      await blocked(()=>button('Đóng phiếu nhập hàng').click());assert.equal(await page.locator('[data-testid=inbound-host-receipt],[data-testid=confirmed-receipt]').count(),0);
      await page.evaluate(()=>window.qa.rights({}));await ready();await open('DOC-B');await ready();
      assert.equal(await field('Số đơn').inputValue(),'FULL ERP B');assert.equal(await page.locator('[data-testid=inbound-host-receipt],[data-testid=confirmed-receipt]').count(),0);
      const c=await calls();assert.equal(c.post.length,1);assert.equal(c.reconcile.length,0);
    });
    await run('access changed by readback itself retires that I18 binding and cannot release its receipt barrier',async()=>{
      await reset({mode:'readFailure'});await field('Số đơn').fill('RIGHTS READBACK');await save();await confirmed();
      await page.waitForFunction(()=>document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase')==='readFailed');
      await page.evaluate(()=>{window.qa.healthy();window.qa.nextReadRights({canSend:false,maxCommandBytes:524288});});
      await button('Đọc lại ERP').click();await page.waitForFunction(()=>window.qa.held('read')>0);await page.waitForTimeout(30);
      assert.equal(await page.getByTestId('inbound-request-host').getAttribute('data-readback-pending'),'true');
      await blocked(()=>open('DOC-B'));assert.equal((await calls()).read.includes('DOC-B'),false);
      await page.evaluate(()=>window.qa.release('read'));await ready();await open('DOC-B');await ready();
      assert.equal(await field('Số đơn').inputValue(),'FULL ERP B');assert.equal(await page.locator('[data-testid=inbound-host-receipt],[data-testid=confirmed-receipt]').count(),0);
      const c=await calls();assert.equal(c.post.length,1);assert.equal(c.reconcile.length,0);
    });
    await run('same-document receipt survives failed authority refresh privately and reappears after fresh full read',async()=>{
      await reset();await field('Số đơn').fill('RETAIN RECEIPT');await save();await confirmed();await ready();
      const receipt=await page.getByTestId('inbound-host-receipt').innerText();
      await page.evaluate(()=>{window.qa.readFailure(true);window.qa.rights({});});
      await page.waitForFunction(()=>!document.getElementById('inbound-header-orderNumber'));assert.equal(await page.locator('[data-testid=inbound-host-receipt],[data-testid=confirmed-receipt]').count(),0);
      await page.evaluate(()=>window.qa.healthy());await button('Xác minh lại quyền nhập hàng').click();await ready();
      assert.equal(await page.getByTestId('inbound-host-receipt').innerText(),receipt);const c=await calls();assert.equal(c.post.length,1);assert.equal(c.reconcile.length,0);
    });
    await run('accepted discard permits selection/filter/close callbacks, not a no-op navigation fixture', async () => {
      await reset(); await field('Số đơn').fill('DISCARD'); await open('DOC-B'); await page.getByRole('alertdialog').waitFor({state:'visible'});
      await button('Bỏ thay đổi và rời màn hình').click(); await ready(); assert.equal(await field('Số đơn').inputValue(), 'FULL ERP B');
      await button('Đóng phiếu nhập hàng').click(); await page.waitForFunction(() => window.qaLeft === true);
    });
    await run('A→B→A while old read ignores abort cannot apply old read or drop current selection', async () => {
      await reset(); await page.evaluate(() => window.qa.hold('read')); await open('DOC-B');
      await page.waitForFunction(() => window.qa.held('read') > 0); await open('DOC-A');
      await page.evaluate(() => window.qa.release('read')); await ready(); assert.equal(await field('Số đơn').inputValue(), 'FULL ERP A');
    });
    await run('confirmed readback failure preserves receipt; read retry never reexecutes', async () => {
      await reset({mode: 'readFailure'}); await field('Số đơn').fill('SAVED'); await save(); await confirmed();
      await page.waitForFunction(() => document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase') === 'readFailed');
      assert.equal((await calls()).post.length, 1); await page.evaluate(() => window.qa.healthy()); await button('Đọc lại ERP').click(); await ready();
      assert.equal((await calls()).post.length, 1); assert.equal((await calls()).reconcile.length, 0);
    });
    await run('late pre-logout ACK cannot confirm or repopulate the new login', async () => {
      await reset(); await field('Số đơn').fill('OLD PENDING'); await review(); await page.evaluate(() => window.qa.hold('post'));
      await button('Lưu thay đổi').click(); await page.waitForFunction(() => window.qa.held('post') > 0);
      await page.evaluate(() => {window.qa.retainRelease('post'); window.qa.logout();});
      await page.waitForFunction(() => !document.getElementById('inbound-header-orderNumber')); await reset();
      await page.evaluate(() => window.qaOldRelease()); await page.waitForTimeout(30);
      assert.equal(await field('Số đơn').inputValue(), 'FULL ERP A'); assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(), 0);
      assert.equal((await calls()).post.length, 0);
    });
    await run('same-session Send admission loss still permits explicit original reconciliation under Update/read', async () => {
      await reset({mode:'lost'}); await review(); await button('Gửi yêu cầu nhập kho').click(); await unknown();
      await page.evaluate(() => window.qa.rights({canSend:false})); await unknown();
      await button('Kiểm tra yêu cầu gốc').click(); await confirmed();
      const c=await calls(); assert.equal(c.post.length,1); assert.equal(c.reconcile[0],c.post[0]);
    });
    await run('real logout/relogin retires data rather than restoring old note/custody', async () => {
      await reset({mode: 'lost'}); await field('Số đơn').fill('OLD LOGIN'); await save(); await unknown();
      await page.evaluate(() => window.qa.logout()); await page.waitForFunction(() => !document.querySelector('#inbound-header-orderNumber'));
      await reset(); assert.equal(await field('Số đơn').inputValue(), 'FULL ERP A'); assert.equal(await page.locator('[data-testid=confirmed-receipt]').count(), 0);
      assert.equal(await button('Kiểm tra yêu cầu gốc').count(), 0);
    });
    for (const width of [320, 360, 390]) {await page.setViewportSize({width, height:844}); await reset(); await page.screenshot({path:path.join(output, `host-${width}.png`), fullPage:true});}
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    await writeFile(path.join(output, 'react-result.json'), JSON.stringify({node:process.version,browser:browser.version(),results,external,errors,
      scope:'Actual React host/I18/provider cases plus one explicitly labelled direct read-only component contract; fake list/fetch only. NOT ASP.NET, BFF, SQL or production.'}, null, 2));
  } finally {t.signal.removeEventListener('abort', abortCleanup); await cleanup();}
});

// I24: whole production BFF modules, no extracted policy helpers or replacement
// proxy. The upstream transport below is explicitly synthetic, never SQL proof.
for (const name of ['proxy-policy', 'proxy']) {
  const text = (await readFile(path.join(app, 'lib/erp', `${name}.ts`), 'utf8')).replace('from "./proxy-policy"', 'from "./proxy-policy.mjs"');
  await writeFile(path.join(output, `${name}.mjs`), stripTypeScriptTypes(text, {mode: 'transform'}));
}
const {proxyErpRequest} = await import(pathToFileURL(path.join(output, 'proxy.mjs')).href);
const policy = await import(pathToFileURL(path.join(output, 'proxy-policy.mjs')).href);
const publicOrigin = 'https://inbound.synthetic.invalid', backendOrigin = 'https://backend.synthetic.invalid';
const inboundPath = 'api/inbound-requests/draft', inboundScope = 'a'.repeat(64);
function proxyRequest(route = inboundPath + '/save', {method = 'POST', body = '{}', headers = {}, query = '', ...options} = {}) {
  return new Request(publicOrigin + '/api/erp/' + route + query, {method,
    headers: {Origin: publicOrigin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json; charset=utf-8',
      'X-Inbound-Scope': inboundScope, 'X-CSRF-TOKEN': 'synthetic-csrf', ...headers}, ...(method === 'GET' ? {} : {body}), ...options});
}
function throughProxy(request, upstream = () => assert.fail('unexpected upstream'), route) {
  return proxyErpRequest(request, route ?? new URL(request.url).pathname.slice('/api/erp/'.length).split('/'), backendOrigin, publicOrigin, upstream);
}
test('I24 Node BFF admits exactly four inbound method/path pairs and preserves old limits', () => {
  const routes = [[inboundPath, 'GET'], ...['save', 'send-to-warehouse', 'reconcile'].map(action => [inboundPath + '/' + action, 'POST'])];
  for (const [route, allowed] of routes) for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(policy.routeAllowed(route, method), method === allowed, `${method} ${route}`);
  for (const route of [inboundPath + '/create', inboundPath + '/save/more', inboundPath + '/Save', inboundPath + '/', inboundPath + '/lookup', 'api/inbound-requests', inboundPath.replace('draft', '%64raft')])
    for (const method of ['GET', 'POST']) assert.equal(policy.routeAllowed(route, method), false, `${method} ${route}`);
  assert.equal(policy.requestBodyLimit('api/auth/login', 'POST'), 16384);
  assert.equal(policy.requestBodyLimit('api/purchase-requests/save', 'POST'), 1048576);
  for (const [route, method] of routes.slice(1)) assert.equal(policy.requestBodyLimit(route, method), 1048576);
});
test('I24 Node BFF provenance, scope, CSRF, media and byte preflight deny before transport', async () => {
  const cases = [
    [{headers: {Origin: 'https://other.invalid'}}, 403], [{headers: {'Sec-Fetch-Site': 'cross-site'}}, 403],
    [{headers: {'X-Inbound-Scope': 'A'.repeat(64)}}, 409], [{headers: {'X-Inbound-Scope': inboundScope + ', ' + inboundScope}}, 409],
    [{headers: {'X-CSRF-TOKEN': ''}}, 403], [{headers: {'X-CSRF-TOKEN': 'one, two'}}, 403],
    [{query: '?command=save'}, 400], [{headers: {'Content-Encoding': 'identity'}}, 415], [{headers: {'Content-Encoding': 'gzip'}}, 415],
    ...['application/jsonp', 'application/json; charset=utf-16', 'application/json; boundary=x', 'text/plain'].map(value => [{headers: {'Content-Type': value}}, 415]),
    ...['', '[]', 'null', '1', '\ufeff{}', '{'].map(body => [{body}, 400]),
    [{body: Uint8Array.of(0xc3, 0x28)}, 400], [{headers: {'Content-Length': '3'}}, 400], [{headers: {'Content-Length': '-1'}}, 400],
    [{headers: {'Content-Length': '1048577'}}, 413], [{body: 'x'.repeat(1048577)}, 413],
  ];
  for (const [options, expected] of cases) {
    const response = await throughProxy(proxyRequest(undefined, options)); assert.equal(response.status, expected, JSON.stringify(options).slice(0, 200));
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const header of ['Origin', 'X-Inbound-Scope']) {const request = proxyRequest(); request.headers.delete(header); assert.equal((await throughProxy(request)).status, header === 'Origin' ? 403 : 409);}
  for (const metadata of [undefined, 'cross-site', 'same-origin, same-origin']) {
    const request = proxyRequest(inboundPath, {method: 'GET'}); request.headers.delete('Origin'); request.headers.delete('X-Inbound-Scope');
    if (metadata === undefined) request.headers.delete('Sec-Fetch-Site'); else request.headers.set('Sec-Fetch-Site', metadata);
    assert.equal((await throughProxy(request)).status, 403);
  }
  assert.equal((await throughProxy(proxyRequest(), undefined, ['api/inbound-requests', 'draft', 'save'])).status, 404);
});
test('I24 Node BFF streams exact byte limit, cancels overflow and rejects lying/error streams', async () => {
  const exact = Buffer.from('{"notes":"' + 'x'.repeat(1048576 - 12) + '"}'); assert.equal(exact.length, 1048576);
  let calls = 0; const upstream = async (_url, init) => {calls++; assert.deepEqual(Buffer.from(init.body), exact); return Response.json({});};
  for (const declared of [false, true]) {const response = await throughProxy(proxyRequest(undefined, {body: exact, headers: declared ? {'Content-Length': String(exact.length)} : {}}), upstream); assert.equal(response.status, 200);}
  let cancelled = false;
  const stream = new ReadableStream({pull(controller) {controller.enqueue(new Uint8Array(600000));}, cancel() {cancelled = true;}});
  assert.equal((await throughProxy(proxyRequest(undefined, {body: stream, duplex: 'half'}))).status, 413); assert.equal(cancelled, true);
  assert.equal((await throughProxy(proxyRequest(undefined, {body: new ReadableStream({start(controller) {controller.error(Error('synthetic'));}}), duplex: 'half'}))).status, 400);
  assert.equal(calls, 2);
});
test('I24 Node BFF canonical origin/cookies and raw HTTP lost-ACK reconciliation preserve original bytes', async () => {
  const captures = [], server = createServer(async (request, response) => {
    const parts = []; for await (const part of request) parts.push(part);
    captures.push({path: request.url, bytes: Buffer.concat(parts), headers: request.headers});
    response.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); response.end('{}');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const root = `http://127.0.0.1:${server.address().port}`;
  const raw = Buffer.from(' { "operationId" : "' + op + '", "notes":"Tiếng Việt\\n", "decimal":"0001.0000" }\n');
  try {
    for (const action of ['save', 'send-to-warehouse']) {
      let dispatches = 0;
      const transport = async (url, init) => {dispatches++; assert.equal(init.redirect, 'manual'); assert.equal(init.cache, 'no-store'); assert.ok(init.body instanceof Uint8Array);
        const answer = await fetch(root + new URL(url).pathname, init); await answer.arrayBuffer(); throw Error('Synthetic completed-response ACK loss');};
      const headers = {Cookie: '__Host-Medcom.Session=synthetic; private=never-forward; __Host-Medcom.Csrf=csrf', Authorization: 'never-forward', 'X-Purchase-Scope': 'b'.repeat(64)};
      assert.equal((await throughProxy(proxyRequest(inboundPath + '/' + action, {body: raw, headers}), transport)).status, 503); assert.equal(dispatches, 1);
      assert.equal((await throughProxy(proxyRequest(inboundPath + '/reconcile', {body: raw, headers}), (url, init) => fetch(root + new URL(url).pathname, init))).status, 200);
      const [execute, reconcile] = captures.slice(-2); assert.deepEqual(execute.bytes, raw); assert.deepEqual(reconcile.bytes, execute.bytes);
      for (const item of [execute, reconcile]) {assert.equal(item.headers.origin, backendOrigin); assert.equal(item.headers['x-inbound-scope'], inboundScope); assert.equal(item.headers['x-csrf-token'], 'synthetic-csrf'); assert.equal(item.headers.cookie, '__Host-Medcom.Session=synthetic; __Host-Medcom.Csrf=csrf'); assert.equal(item.headers.authorization, undefined); assert.equal(item.headers['x-purchase-scope'], undefined);}
    }
    for (const withScope of [false, true]) {
      const request = proxyRequest(inboundPath, {method: 'GET', query: '?documentId=DOC-A'}); request.headers.delete('Origin'); if (!withScope) request.headers.delete('X-Inbound-Scope');
      assert.equal((await throughProxy(request, async (url, init) => {assert.equal(new URL(url).search, '?documentId=DOC-A'); assert.equal(init.headers.get('origin'), backendOrigin); assert.equal(init.headers.get('X-Inbound-Scope'), withScope ? inboundScope : null); return Response.json({});})).status, 200);
    }
    assert.equal((await throughProxy(proxyRequest(), async () => new Response(null, {status: 307, headers: {location: 'https://other.invalid'}}))).status, 502);
  } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
});
test('I24 Node bridge notifies only current read/command 401; other failures retain custody', async () => {
  for (const status of [401, 403, 409, 503]) {
    let notified = 0, fail = false;
    const api = {read: async () => {if (fail) throw new InboundTransportError(status, 'synthetic'); return {scopeKey: inboundScope, access, data: {outcome: 'Observed', document: structuredClone(source)}};},
      command: async () => {throw new InboundTransportError(status, 'synthetic');}};
    const bridge = createInboundRequestBridge(api, () => notified++); bridge.configure('login', api); bridge.select('DOC-A'); await bridge.revalidate(signal());
    const original = command(); await bridge.adapter.execute(original, signal()); assert.equal(notified, status === 401 ? 1 : 0); assert.equal(bridge.hasUnresolved(), true);
    bridge.configure('refreshed-context', api); await bridge.revalidate(signal()); fail = true;
    await assert.rejects(bridge.adapter.read('DOC-A', signal())); assert.equal(notified, status === 401 ? 2 : 0); assert.equal(bridge.hasUnresolved(), true); bridge.dispose();
  }
  let rejectOld, notified = 0;
  const old = {read: () => new Promise((_resolve, reject) => {rejectOld = reject;}), command: async () => {throw Error('unused');}};
  const bridge = createInboundRequestBridge(old, () => notified++); bridge.configure('old', old); bridge.select('DOC-A'); const pending = bridge.revalidate(signal());
  bridge.configure('new', old); rejectOld(new InboundTransportError(401, 'late')); await assert.rejects(pending); assert.equal(notified, 0); bridge.dispose();
});

// Real Workspace -> production inbound client/bridge -> production BFF -> HTTP
// backend DOUBLE. The frontend hop is real loopback HTTPS with an ephemeral
// pinned test certificate. Production BFF sees actual on-wire browser headers;
// no Playwright fulfillment/provenance fabrication. No ASP.NET/SQL acceptance.
test('I24 actual Workspace and BFF preserve mobile custody, retirement and history position', {timeout: 240000}, async t => {
  const require = createRequire(import.meta.url); let build, chromium;
  try {
    ({build} = require('esbuild')); require.resolve('react'); require.resolve('react-dom');
    const tools = process.env.MEDCOM_BROWSER_TOOLCHAIN;
    ({chromium} = (tools ? createRequire(path.join(path.resolve(tools), 'package.json')) : require)('playwright-core'));
  } catch {throw Error('I24 Workspace React gate NOT_RUN: installed pinned React/esbuild/browser toolchain unavailable. No install or skip.');}
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/erp/workspace';
    const native=window.fetch.bind(window);window.i24IO={execute:[],fetch:[],pushes:0};
    const push=history.pushState.bind(history);history.pushState=(...args)=>{window.i24IO.pushes++;return push(...args);};
    window.fetch=(url,init)=>{if(String(url).includes('/inbound-requests/draft/')&&init?.method==='POST')window.i24IO.fetch.push({url:String(url),body:init.body});return native(url,init);};
    createRoot(document.getElementById('root')).render(<Workspace/>);`;
  const built = await build({absWorkingDir: app, stdin: {contents: entry, resolveDir: app, loader: 'tsx'}, bundle: true, write: false,
    platform: 'browser', format: 'iife', alias: {'@': app}, jsx: 'automatic', define: {'process.env.NODE_ENV': '"production"', 'process.env': '{}'}, logLevel: 'warning',
    plugins: [{name: 'i24-execute-observer', setup(build) {
      build.onResolve({filter: /inbound-request-command-adapter$/}, () => ({path: 'observer', namespace: 'i24-observer'}));
      build.onLoad({filter: /.*/, namespace: 'i24-observer'}, () => ({resolveDir: app, loader: 'js', contents: `
        export * from ${JSON.stringify(path.join(app, 'lib/erp/inbound-request-command-adapter.ts'))};
        import{createInboundRequestBridge as create}from ${JSON.stringify(path.join(app, 'lib/erp/inbound-request-command-adapter.ts'))};
        export function createInboundRequestBridge(...args){const b=create(...args),execute=b.adapter.execute;b.adapter={...b.adapter,execute:(intent,signal)=>{window.i24IO.execute.push({operationId:intent.operationId,body:JSON.stringify(intent)});return execute(intent,signal);}};return b;}` }));
    }}, {name: 'i24-next-image-only', setup(build) {
      build.onResolve({filter: /^next\/image$/}, () => ({path: 'image', namespace: 'i24-image'}));
      build.onLoad({filter: /.*/, namespace: 'i24-image'}, () => ({resolveDir: app, loader: 'jsx', contents: "import React from 'react';export default function Image({src,alt,width,height}){return <img src={src} alt={alt} width={width} height={height}/>;}"}));
    }}]});
  // Preserve esbuild's exact script bytes at the real HTTPS response boundary.
  const script = Buffer.from(built.outputFiles[0].contents);
  const css = await readFile(path.join(app, 'app/globals.css'), 'utf8');
  const html = '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + '\nbody{margin:0;font:16px system-ui}img{max-width:100%;height:auto}[role=alertdialog],[role=dialog]{position:fixed;inset:3%;z-index:99;background:white;padding:16px;overflow:auto}[data-slot=alert-dialog-overlay]{position:fixed;inset:0;z-index:98;background:#0004}</style><div id="root"></div><script src="/i24.js"></script></html>';
  let state, serial = 0; const calls = [], errors = [], external = [], results = [], models = new Set();
  const resetState = (patch = {}) => {
    const now = Date.now(); state = {scope: (++serial).toString(16).padStart(64, '0'), failure: null, readStatus: null, listStatus: null, commandStatus: null,
      mode: 'Committed', version: 1, logoutStatus: 204, held: {}, waiters: {}, effects: 0, originals: new Map(), receipts: new Map(),
      lifetime: {idleExpiresAt: new Date(now + 3600000).toISOString(), absoluteExpiresAt: new Date(now + 7200000).toISOString()},
      docs: {'DOC-A': structuredClone(source), 'DOC-B': {...structuredClone(source), documentId: 'DOC-B'}}, ...patch}; models.add(state); calls.length = 0;
  };
  const release = (kind, model = state) => {model.held[kind] = false; (model.waiters[kind] ?? []).splice(0).forEach(resolve => resolve());};
  const wait = async (model, kind) => {if (model.held[kind]) await new Promise(resolve => (model.waiters[kind] ??= []).push(resolve));};
  const workspace = model => ({session: {displayName: 'SYNTHETIC I24', tenantId: 'T', companyId: 'C', companyName: 'Synthetic', authorityVersion: model.version,
    ...model.lifetime, capabilities: ['inbound-requests.read']}, navigation: [{id: 'inbound-requests', label: 'Yêu cầu nhập kho', href: '/?screen=inbound-requests'}], branchIds: ['BR-A']});
  const json = (res, status, data) => {res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(status === 204 ? undefined : JSON.stringify(data));};
  const backend = createServer(async (req, res) => {
    const model = state;
    try {
      const url = new URL(req.url, 'http://localhost'), route = url.pathname, parts = []; for await (const part of req) parts.push(part);
      const bytes = Buffer.concat(parts), body = bytes.toString('utf8'); calls.push({path: route, method: req.method, body, scope: req.headers['x-inbound-scope']});
      if (route === '/health/ready') return json(res, 503, {status: 'unavailable', checks: [{component: 'business_release', status: 'not_configured'}]});
      if (route === '/api/auth/csrf') {await wait(model, 'csrf'); return json(res, 200, {token: 'synthetic-csrf'});}
      if (route === '/api/auth/login') return json(res, 200, workspace(model).session);
      if (route === '/api/auth/logout') return json(res, model.logoutStatus, {});
      if (route === '/api/workspace') {res.setHeader('X-Medcom-Session-Scope',model.scope);res.setHeader('X-Medcom-Read-Scope',model.scope);await wait(model, 'workspace'); return json(res, model.failure ?? 200, model.failure ? {code: 'synthetic_workspace_failure'} : workspace(model));}
      if (route === '/api/documents/inbound-requests') {
        res.setHeader('X-Medcom-Session-Scope',model.scope);res.setHeader('X-Medcom-Read-Scope',model.scope);
        const status = model.listStatus; await wait(model, 'list');
        return json(res, status ?? 200, status ? {code: 'synthetic_list_failure'} : {rows: Object.values(model.docs).map(d => ({documentId: d.documentId, documentDate: '2026-10-01', branchId: 'BR-A', statusId: d.statusId, isLocked: false})), page: Number(url.searchParams.get('page')), pageSize: 50, hasMore: true});
      }
      if (route === '/' + inboundPath) {
        const scope = model.scope, status = model.readStatus, document = structuredClone(model.docs[url.searchParams.get('documentId')]); await wait(model, 'read');
        return json(res, status ?? 200, status ? {code: 'synthetic_read_failure'} : {scopeKey: scope, access, data: {outcome: 'Observed', document}});
      }
      if (!['save', 'send-to-warehouse', 'reconcile'].some(action => route === '/' + inboundPath + '/' + action)) return json(res, 404, {code: 'unavailable'});
      assert.equal(req.headers.origin, backendOrigin); assert.equal(req.headers['x-inbound-scope'], model.scope); assert.equal(req.headers['x-csrf-token'], 'synthetic-csrf');
      const command = JSON.parse(body), reconcile = route.endsWith('/reconcile');
      if (reconcile) {assert.equal(model.originals.get(command.operationId), body); await wait(model, 'reconcile'); return json(res, 200, {scopeKey: model.scope, data: {outcome: 'Replayed', receipt: model.receipts.get(command.operationId), code: null}});}
      assert.equal(model.originals.size, 0, 'only one initial writer dispatch'); model.originals.set(command.operationId, body);
      const status = model.commandStatus; if (status) {await wait(model, 'post'); return json(res, status, {code: 'synthetic_command_failure'});}
      model.effects++; const d = model.docs[command.documentId]; if (command.action === 'Save') d.header = structuredClone(command.header); else d.statusId = 2; d.stateEqualityToken = 'C'.repeat(64);
      const receipt = {operationId: command.operationId, documentId: command.documentId, statusId: d.statusId, stateEqualityToken: d.stateEqualityToken, auditId: audit, committedAtUtc: new Date().toISOString()}; model.receipts.set(command.operationId, receipt);
      await wait(model, 'post'); return json(res, 200, {scopeKey: model.scope, data: {outcome: 'Committed', receipt, code: null}});
    } catch (error) {errors.push(String(error)); if (!res.headersSent) json(res, 500, {code: 'synthetic_failure'}); else res.destroy();}
  });
  resetState(); backend.listen(0, '127.0.0.1'); await once(backend, 'listening'); const backendHttp = `http://127.0.0.1:${backend.address().port}`;
  let browser, context, page, frontend, tlsDirectory, testKey, siteOrigin;
  const routes = {started: 0, fulfilled: 0, aborted: 0, pending: new Map()}, loadEvents = [], failedRequests = [], bffResponses = [];
  const releaseAll = () => {for (const model of models) for (const kind of Object.keys(model.waiters)) release(kind, model);};
  const cleanup = async () => {
    // A login/reset can replace state while an old synthetic command is held.
    // Retain/release every model, not merely the most recent one.
    releaseAll();
    const closeServer = server => new Promise((resolve, reject) => {
      if (!server) return resolve(); server.closeAllConnections();
      server.close(error => {if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error); else resolve();});
    });
    const outcomes = await Promise.allSettled([context?.close(), browser?.close(), closeServer(frontend), closeServer(backend)]);
    testKey?.fill(0);
    if (tlsDirectory) {try {await rm(tlsDirectory, {recursive: true, force: true});} catch (reason) {outcomes.push({status: 'rejected', reason});}}
    // Abort already failed the test; duplicate abort/finally closure is safe.
    // A normal teardown error must still fail after attempting every close.
    const failures = outcomes.filter(outcome => outcome.status === 'rejected');
    if (failures.length && !t.signal.aborted) throw new AggregateError(failures.map(outcome => outcome.reason), 'Synthetic browser teardown failed');
  };
  const abortCleanup = () => {void cleanup();}; t.signal.addEventListener('abort', abortCleanup, {once: true});
  try {
    // Same OpenSSL ephemeral-certificate pattern as tools/deploy/serve_test_package.py.
    // The private key lives only in an owned OS temp directory and is never an artifact.
    tlsDirectory = await mkdtemp(path.join(tmpdir(), 'medcom-i24-test-tls-'));
    const certPath = path.join(tlsDirectory, 'cert.pem'), keyPath = path.join(tlsDirectory, 'key.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', keyPath, '-out', certPath,
      '-subj', '/CN=inbound.synthetic.invalid', '-addext', 'subjectAltName=DNS:inbound.synthetic.invalid'], {stdio: 'pipe'});
    await chmod(keyPath, 0o600); testKey = await readFile(keyPath); const certificate = await readFile(certPath);
    const spki = createHash('sha256').update(new X509Certificate(certificate).publicKey.export({type: 'spki', format: 'der'})).digest('base64');
    frontend = createHttpsServer({key: testKey, cert: certificate}, async (request, response) => {
      const url = new URL(request.url, siteOrigin), ticket = ++routes.started, model = state;
      routes.pending.set(ticket, {url: url.href, type: request.headers['sec-fetch-dest'] ?? 'fetch'});
      const controller = new AbortController(); request.once('aborted', () => controller.abort());
      response.once('close', () => {if (!response.writableFinished) controller.abort();});
      const send = (status, headers, body) => {if (response.destroyed) {routes.aborted++; return;} response.writeHead(status, headers); response.end(body); routes.fulfilled++;};
      try {
        if (url.pathname === '/i24.js') return send(200, {'Content-Type': 'text/javascript'}, script);
        if (!url.pathname.startsWith('/api/erp/')) return send(200, {'Content-Type': 'text/html'}, html);
        const requestHeaders = new Headers();
        for (let index = 0; index < request.rawHeaders.length; index += 2) requestHeaders.append(request.rawHeaders[index], request.rawHeaders[index + 1]);
        const incoming = new Request(url, {method: request.method, headers: requestHeaders, signal: controller.signal,
          ...(request.method === 'POST' ? {body: Readable.toWeb(request), duplex: 'half'} : {})});
        const result = await proxyErpRequest(incoming, url.pathname.slice('/api/erp/'.length).split('/'), backendOrigin, siteOrigin, async (target, init) => {
          // Only the BFF-to-backend hop is a transport double. Ignore cancellation
          // deliberately so current-generation checks must reject late ACKs.
          const rest = {...init}; delete rest.signal;
          if (model.failure === 'network' && new URL(target).pathname === '/api/workspace') throw Error('Synthetic workspace transport loss');
          const answer = await fetch(backendHttp + new URL(target).pathname + new URL(target).search, rest);
          if (model.mode === 'lost' && /\/(save|send-to-warehouse)$/.test(new URL(target).pathname)) {await answer.arrayBuffer(); throw Error('Synthetic completed ACK loss');}
          return answer;
        });
        const problem = result.ok ? null : await result.clone().json().catch(() => null);
        bffResponses.push({path: url.pathname, method: request.method, status: result.status, code: typeof problem?.code === 'string' ? problem.code.slice(0, 100) : null,
          origin: requestHeaders.get('origin'), fetchSite: requestHeaders.get('sec-fetch-site'), fetchMode: requestHeaders.get('sec-fetch-mode'),
          scopePresent: requestHeaders.has('X-Inbound-Scope'), provenance: 'actual HTTPS request.rawHeaders'});
        send(result.status, Object.fromEntries(result.headers), Buffer.from(await result.arrayBuffer()));
      } catch (error) {
        if (!t.signal.aborted && !controller.signal.aborted) errors.push('Synthetic HTTPS route failure: ' + String(error));
        if (!response.headersSent) send(500, {'Content-Type': 'application/json'}, '{"code":"synthetic_fixture_failure"}'); else response.destroy();
      } finally {routes.pending.delete(ticket);}
    });
    frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening'); siteOrigin = `https://inbound.synthetic.invalid:${frontend.address().port}`;
    browser = await chromium.launch({headless: true, args: ['--host-resolver-rules=MAP inbound.synthetic.invalid 127.0.0.1', '--no-proxy-server', `--ignore-certificate-errors-spki-list=${spki}`],
      ...(process.env.I21_TEST_BROWSER ? {executablePath: process.env.I21_TEST_BROWSER} : {})});
    t.signal.throwIfAborted();
    context = await browser.newContext({viewport: {width: 390, height: 844}, locale: 'vi-VN', serviceWorkers: 'block'});
    await context.route('**/*', route => {if (new URL(route.request().url()).origin === siteOrigin) return route.continue(); external.push(route.request().url()); return route.abort();});
    const newPage = async viewport => {
      const next = await context.newPage(); if (viewport) await next.setViewportSize(viewport);
      next.on('pageerror', error => errors.push(error.message));
      next.on('domcontentloaded', () => loadEvents.push({event: 'domcontentloaded', url: next.url()}));
      next.on('load', () => loadEvents.push({event: 'load', url: next.url()}));
      next.on('requestfailed', request => failedRequests.push({url: request.url(), type: request.resourceType(), failure: request.failure()?.errorText}));
      return next;
    };
    page = await newPage();
    const button = name => page.getByRole('button', {name, exact: true}), field = name => page.getByLabel(name, {exact: true});
    const host = () => page.getByTestId('inbound-request-host');
    const ready = () => page.waitForFunction(() => {const field = document.getElementById('inbound-header-orderNumber'); return field && !field.disabled && document.querySelector('[data-testid=inbound-request-host]')?.getAttribute('data-readback-pending') !== 'true';});
    const open = async (id = 'DOC-A') => {await page.getByRole('button', {name: new RegExp('^Mở phiếu ' + id + ' ')}).click(); await ready();};
    const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const go = async screen => {await page.keyboard.press('Control+k'); const label = screen === 'settings' ? 'Thiết lập' : screen === 'home' ? 'Không gian làm việc' : 'Yêu cầu nhập kho'; await page.getByRole('option', {name: label, exact: true}).click();};
    const start = async (patch = {}) => {
      // Each case starts in a fresh page, not a navigation attempt out of the
      // previous case's deliberately dirty/unknown document. Actual guard and
      // Back/Forward assertions within each case still use the same live page.
      const viewport = page.viewportSize(); await page.close(); page = await newPage(viewport); resetState(patch);
      try {await page.goto(siteOrigin + '/?screen=home'); await page.getByRole('button', {name: 'Yêu cầu nhập kho', exact: true}).last().waitFor(); await go('inbound-requests'); await open();}
      catch (error) {
        let timer;
        const dom = await Promise.race([page.evaluate(() => ({readyState: document.readyState, url: location.href, hostCount: document.querySelectorAll('[data-testid=inbound-request-host]').length, text: document.body?.innerText.slice(0, 500)})),
          new Promise(resolve => {timer = setTimeout(() => resolve({diagnostic: 'DOM inspection timed out'}), 1000);})]).catch(problem => ({diagnostic: String(problem)})).finally(() => clearTimeout(timer));
        console.error('I24 fixture start diagnostics ' + JSON.stringify({error: String(error), pageErrors: errors.slice(-10), routes: {started: routes.started, fulfilled: routes.fulfilled, aborted: routes.aborted, outstanding: [...routes.pending.values()].slice(-20)},
          failedRequests: failedRequests.slice(-10), bffResponses: bffResponses.slice(-20), loadEvents: loadEvents.slice(-10), backendCalls: calls.slice(-20).map(({path, method}) => ({path, method})), dom}));
        throw error;
      }
    };
    const save = async (action = 'Save') => {if (action === 'Save') await field('Số đơn').fill('I24 ORIGINAL'); await button('Rà soát phiếu').click(); await button(action === 'Save' ? 'Lưu thay đổi' : 'Gửi yêu cầu nhập kho').click();};
    const unknown = () => page.waitForFunction(() => document.querySelector('[data-testid=inbound-editor]')?.getAttribute('data-phase') === 'unknown');
    const confirmed = () => page.getByTestId('confirmed-receipt').waitFor();
    const guard = async (action, discard = false, accept = false) => {await action(); const dialog = page.getByRole('alertdialog'); await dialog.waitFor(); assert.equal(await dialog.getByRole('button', {name: 'Bỏ thay đổi và rời màn hình', exact: true}).count(), discard ? 1 : 0); await dialog.getByRole('button', {name: accept ? 'Bỏ thay đổi và rời màn hình' : 'Tiếp tục làm việc', exact: true}).click(); await dialog.waitFor({state: 'hidden'}); if (!accept && await page.getByRole('dialog', {name: 'Tìm màn hình', exact: true}).count()) await page.keyboard.press('Escape'); await paint();};
    const refresh = async failure => {state.failure = failure; const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/erp/api/workspace'); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await response; await paint();};
    const settled = () => page.waitForFunction(() => document.querySelector('[data-testid=inbound-request-host]')?.getAttribute('data-readback-pending') === 'false');
    const recover = async () => {state.failure = null; await button('Xác minh lại phiên nhập hàng').click(); await field('Tìm phiếu nhập hàng').waitFor(); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Kiểm tra yêu cầu gốc' && !b.disabled) || document.querySelector('[data-testid=confirmed-receipt]'));};
    const single = async () => {const io = await page.evaluate(() => window.i24IO), writers = calls.filter(c => /\/(save|send-to-warehouse)$/.test(c.path)); assert.equal(io.execute.length, 1); assert.equal(io.fetch.filter(c => /\/(save|send-to-warehouse)$/.test(c.url)).length, 1); assert.equal(writers.length, 1); assert.equal(state.effects, 1); for (const c of calls.filter(c => /\/(save|send-to-warehouse|reconcile)$/.test(c.path))) {assert.equal(c.body, io.execute[0].body); assert.equal(c.scope, state.scope);} for (const c of io.fetch) assert.equal(c.body, io.execute[0].body);};
    const run = async (name, fn) => {
      let failure;
      await t.test(name, async () => {try {await fn(); results.push(name);} catch (error) {failure = error; throw error;} finally {releaseAll();}});
      // Stop a broken fixture at its first preserved failure instead of letting
      // later cases cascade on invalid setup. Every case still runs on success.
      if (failure) throw failure;
    };
    for (const width of [320, 360, 390]) await run(`${width}px actual Workspace mounts one full draft host without a child sentinel`, async () => {
      await page.setViewportSize({width, height: 844}); await start(); assert.equal(await host().count(), 1); assert.equal(await field('Số đơn').inputValue(), 'FULL ERP A');
      assert.equal(await host().evaluate(el => el.scrollWidth <= el.clientWidth), true); assert.equal(await page.evaluate(() => history.state.medcomInboundHost ?? null), null);
      assert.equal(calls.some(call => call.path.endsWith('/detail')), false); assert.equal(await page.evaluate(() => window.i24IO.pushes), 1);
    });
    for (const action of ['Save', 'SendToWarehouse']) await run(`pending ${action}, parent 503, repeated recovery failure and lost ACK retain original through BFF`, async () => {
      await start({mode: 'lost', held: {post: true}}); await field('Tìm phiếu nhập hàng').fill('RETAIN FILTER'); await save(action);
      await eventually(() => state.waiters.post?.length > 0); await refresh(503); assert.equal(await host().count(), 1); assert.equal(await field('Số đơn').count(), 0);
      for (let i = 0; i < 2; i++) {const failed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/erp/api/workspace'); await button('Xác minh lại phiên nhập hàng').click(); await failed; await paint();}
      release('post'); await paint(); await recover(); await unknown(); assert.equal(await field('Tìm phiếu nhập hàng').inputValue(), 'RETAIN FILTER');
      await guard(() => go('home')); await button('Kiểm tra yêu cầu gốc').click(); await confirmed(); await settled(); await single();
      await refresh('network'); assert.equal(await host().count(), 1); assert.equal(await page.getByTestId('inbound-host-receipt').count(), 0); await recover(); await confirmed(); await single();
    });
    await run('pending receipt readback and a command started after a discard dialog cannot unmount Workspace host', async () => {
      await start({held: {post: true}}); await field('Số đơn').fill('OLD DIALOG'); await button('Rà soát phiếu').click(); await go('home'); await page.getByRole('alertdialog').waitFor();
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Lưu thay đổi').click()); await eventually(() => state.waiters.post?.length > 0);
      await button('Bỏ thay đổi và rời màn hình').click(); assert.equal(await host().count(), 1); await page.getByRole('alertdialog').waitFor({state: 'hidden'});
      await page.keyboard.press('Escape'); await guard(() => go('home')); state.held.read = true; release('post'); await confirmed(); await eventually(() => state.waiters.read?.length > 0);
      await guard(() => go('settings')); assert.equal(await host().getAttribute('data-readback-pending'), 'true'); release('read'); await ready(); await single();
    });
    await run('owned Back and Forward cancel/approve preserve index, URL, forward stack and one callback', async () => {
      await start(); await go('settings'); await page.evaluate(() => history.back()); await host().waitFor(); await open(); await field('Số đơn').fill('HISTORY DIRTY');
      const original = await page.evaluate(() => ({index: history.state.medcomWorkspace.index, href: location.href, pushes: window.i24IO.pushes, length: history.length}));
      for (const direction of ['back', 'forward', 'back']) {await guard(() => page.evaluate(direction => history[direction](), direction), true); assert.deepEqual(await page.evaluate(() => ({index: history.state.medcomWorkspace.index, href: location.href, pushes: window.i24IO.pushes, length: history.length})), original);}
      await guard(() => page.evaluate(() => history.back()), true, true); await host().waitFor({state: 'detached'}); assert.equal(await page.evaluate(() => history.state.medcomWorkspace.index), 0);
      await page.evaluate(() => history.forward()); await host().waitFor(); await open(); await field('Số đơn').fill('FORWARD DIRTY'); await guard(() => page.evaluate(() => history.forward()), true, true);
      await host().waitFor({state: 'detached'}); assert.equal(await page.evaluate(() => history.state.medcomWorkspace.index), 2); assert.equal(await page.evaluate(() => window.i24IO.pushes), original.pushes);
    });
    for (const queued of [false, true]) await run(`command starting during approved history traversal blocks the actual ${queued ? 'queued route' : 'Back'} commit`, async () => {
      await start({mode: 'lost', held: {post: true}}); await field('Số đơn').fill('TRAVERSAL RACE'); await button('Rà soát phiếu').click();
      const position = await page.evaluate(() => ({href: location.href, index: history.state.medcomWorkspace.index}));
      await page.evaluate(() => history.back()); await page.getByRole('alertdialog').waitFor();
      await page.evaluate(() => {const original = history.go.bind(history); history.go = delta => {window.i24ReleaseTraversal = () => {history.go = original; original(delta);};};});
      await button('Bỏ thay đổi và rời màn hình').click();
      if (queued) await go('settings');
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Lưu thay đổi').click()); await eventually(() => state.waiters.post?.length > 0);
      await page.evaluate(() => window.i24ReleaseTraversal()); await page.getByRole('alertdialog').waitFor(); await paint();
      assert.equal(await button('Bỏ thay đổi và rời màn hình').count(), 0); assert.equal(await host().count(), 1);
      assert.deepEqual(await page.evaluate(() => ({href: location.href, index: history.state.medcomWorkspace.index})), position);
      await button('Tiếp tục làm việc').click(); if (queued) await page.keyboard.press('Escape'); release('post'); await unknown();
      await button('Kiểm tra yêu cầu gốc').click(); await confirmed(); await settled(); await single();
    });
    await run('sidebar, command palette, mobile Home and local Close preserve dirty and unknown custody', async () => {
      await start({mode: 'lost'}); await field('Số đơn').fill('DIRTY');
      await guard(() => button('Đóng phiếu nhập hàng').click(), true); await guard(() => go('settings'), true);
      const mobileHome = () => page.getByRole('navigation', {name: 'Điều hướng nhanh trên điện thoại'}).getByRole('button', {name: 'Không gian làm việc', exact: true}).click();
      await guard(mobileHome, true); await button('Mở menu đầy đủ').click();
      await guard(() => page.locator('[data-mobile=true]').getByRole('button', {name: 'Tổng quan', exact: true}).click(), true); await button('Đóng menu').click();
      await save(); await unknown(); await guard(mobileHome); await guard(() => button('Quay lại danh sách').click());
    });
    for (const kind of ['list', 'read', 'command']) await run(`current ${kind} 401 retires once and later 503 cannot revive that login`, async () => {
      await start(); state[kind === 'command' ? 'commandStatus' : kind + 'Status'] = 401;
      if (kind === 'command') await save(); else if (kind === 'read') await button('Xác minh lại quyền nhập hàng').click(); else await button('Áp dụng lọc nhập hàng').click();
      await button('Đăng nhập ERP').first().waitFor(); await paint(); assert.equal(await field('Số đơn').count(), 0); assert.equal(await button('Xác minh lại phiên nhập hàng').count(), 0);
      state.failure = 503; await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await paint(); assert.equal(await button('Xác minh lại phiên nhập hàng').count(), 0);
    });
    for (const expiry of ['idleExpiresAt', 'absoluteExpiresAt']) await run(`retained ${expiry} retires an unverified pending login without polling`, async () => {
      await start({held: {post: true}}); await save(); await eventually(() => state.waiters.post?.length > 0);
      state.lifetime[expiry] = new Date(Date.now() + 700).toISOString(); await refresh(null); await refresh(503);
      await page.getByText('Phiên làm việc đã hết hạn. Đăng nhập ERP để tiếp tục.', {exact: true}).waitFor(); release('post'); await paint();
      assert.equal(await page.getByTestId('confirmed-receipt').count(), 0); assert.equal(await button('Xác minh lại phiên nhập hàng').count(), 0);
    });
    await run('failed logout retains a clean receipt and successful logout retires it', async () => {
      await start(); await save(); await confirmed(); await settled(); state.logoutStatus = 503;
      const signOut = async () => {const account = page.locator('.topbar .user-button'); assert.equal(await account.count(), 1); await account.click(); await page.getByRole('menuitem', {name: 'Đăng xuất ERP', exact: true}).click();};
      await signOut(); await button('Xác minh lại phiên nhập hàng').waitFor(); assert.equal(await host().count(), 1); await recover(); await confirmed(); await settled(); await single();
      state.logoutStatus = 204; await signOut(); await host().waitFor({state: 'detached'}); assert.equal(await button('Xác minh lại phiên nhập hàng').count(), 0);
    });
    await run('successful login rotates before a delayed workspace read; old deadline and late command 401 cannot retire it', async () => {
      await start({commandStatus: 401, held: {post: true}}); await save(); await eventually(() => state.waiters.post?.length > 0);
      state.lifetime.idleExpiresAt = new Date(Date.now() + 2500).toISOString(); await refresh(null); await refresh(503); const old = state;
      await button('Đăng nhập ERP').first().click(); const dialog = page.getByRole('dialog', {name: 'Đăng nhập ERP', exact: true});
      await dialog.getByLabel('Tên đăng nhập', {exact: true}).fill('synthetic-i24'); await dialog.getByLabel('Mật khẩu', {exact: true}).fill('synthetic-test-only');
      resetState({held: {workspace: true}}); await dialog.getByRole('button', {name: 'Đăng nhập', exact: true}).click(); await eventually(() => state.waiters.workspace?.length > 0);
      release('post', old); await new Promise(resolve => setTimeout(resolve, 2700)); await paint();
      assert.equal(await page.getByText('Phiên làm việc đã hết hạn. Đăng nhập ERP để tiếp tục.', {exact: true}).count(), 0);
      release('workspace'); await field('Tìm phiếu nhập hàng').waitFor(); await open(); assert.equal(await field('Số đơn').inputValue(), 'FULL ERP A');
      assert.equal(await page.getByTestId('confirmed-receipt').count(), 0); assert.equal(calls.filter(call => /\/(save|send-to-warehouse|reconcile)$/.test(call.path)).length, 0);
    });
    const inboundWire = bffResponses.filter(item => item.path.startsWith('/api/erp/' + inboundPath));
    assert.ok(inboundWire.some(item => item.method === 'GET') && inboundWire.some(item => item.method === 'POST'));
    for (const item of inboundWire) {assert.equal(item.fetchSite, 'same-origin'); if (item.method === 'POST') assert.equal(item.origin, siteOrigin);}
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    const evidence = {node: process.version, browser: browser.version(), viewports: [320, 360, 390], results, errors, external, inboundWire,
      scope: 'Actual Workspace/client/HTTPS frontend/BFF composition with pinned ephemeral test TLS and actual on-wire browser provenance; backend HTTP double. No ASP.NET/SQL/provider/production acceptance.'};
    await writeFile(path.join(output, 'i24-workspace-bff-react.json'), JSON.stringify(evidence, null, 2));
    // Preserve all standalone evidence while including composition results in
    // its already-uploaded artifact; no workflow or dependency change needed.
    const standalonePath = path.join(output, 'react-result.json');
    const standalone = JSON.parse(await readFile(standalonePath, 'utf8').catch(error => {if (error.code === 'ENOENT') return '{}'; throw error;}));
    await writeFile(standalonePath, JSON.stringify({...standalone, workspaceComposition: evidence}, null, 2));
  } finally {t.signal.removeEventListener('abort', abortCleanup); await cleanup();}
});
