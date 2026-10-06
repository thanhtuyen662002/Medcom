import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes, createRequire} from 'node:module';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
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
const {createInboundRequestApi, parseInboundJson, inboundDraftRoutes} = await import(pathToFileURL(path.join(output, 'inbound-request-api.mjs')).href);
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

// ACTUAL host + unchanged I18 + unchanged navigation provider. This fixture's
// HTTP layer is a browser fetch double, NOT an ASP.NET/BFF integration proof.
const fixture = `
import React,{useMemo,useRef,useState} from 'react';import {createRoot} from 'react-dom/client';
import {InboundRequestScreen} from './components/erp/inbound-request-screen';
import {NavigationGuardProvider} from './components/erp/navigation-guard';
import {createInboundRequestApi} from './lib/erp/inbound-request-api';
import {ApiError} from './lib/erp/api';
const originalPush=history.pushState.bind(history);window.qaPushes=0;history.pushState=(...args)=>{window.qaPushes++;return originalPush(...args);};
const baseline=${JSON.stringify(source)},rights=${JSON.stringify(access)};
function model(){return {scope:'a'.repeat(64),access:{...rights},mode:'Committed',outcome:'Replayed',held:{},waits:{},readFailure:false,readShape:null,listFailure:null,calls:{read:[],post:[],reconcile:[],list:[]},docs:{'DOC-A':structuredClone(baseline),'DOC-B':{...structuredClone(baseline),documentId:'DOC-B',header:{...baseline.header,orderNumber:'FULL ERP B'}}}};}
function App(){const m=useRef(model()),count=useRef(0);const [config,setConfig]=useState({loginKey:'login-0',version:1,available:true,listRevision:0,apiRevision:0,callbackRevision:0});
 const wait=async(model,kind)=>{if(model.held[kind])await new Promise(r=>(model.waits[kind]??=[]).push(r));};
 const api=useMemo(()=>createInboundRequestApi(async(url,init)=>{const x=m.current;const u=new URL(url,'https://fixture.invalid');
 const response=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json','cache-control':'no-store'}});
 if(u.pathname.endsWith('/csrf'))return response({token:'fake-csrf'});
 if(init.method!=='POST'){const id=u.searchParams.get('documentId'),document=structuredClone(x.docs[id]),scope=x.scope;x.calls.read.push(id);await wait(x,'read');if(x.readFailure)throw Error('synthetic read lost');if(x.nextReadAccess){x.access={...x.access,...x.nextReadAccess};x.nextReadAccess=null;x.held.read=true;}if(x.readShape==='malformed')document.header.rateExchange=1;if(x.readShape==='mismatch')document.stateEqualityToken='D'.repeat(64);return response({scopeKey:scope,access:x.access,data:{outcome:x.access.canRead?'Observed':'Denied',document:x.access.canRead?document:null}});}
 const c=JSON.parse(init.body),rec=u.pathname.endsWith('/reconcile');x.calls[rec?'reconcile':'post'].push(init.body);await wait(x,rec?'reconcile':'post');
 if(rec)return response({scopeKey:x.scope,data:{outcome:x.outcome,receipt:['Committed','Replayed'].includes(x.outcome)?x.receipt??null:null,code:null}});
 if(['Committed','lost','readFailure','malformedRead','mismatchedRead'].includes(x.mode)){const d=x.docs[c.documentId];if(c.action==='Save')d.header=structuredClone(c.header);else d.statusId=2;d.stateEqualityToken='C'.repeat(64);x.receipt={operationId:c.operationId,documentId:c.documentId,statusId:d.statusId,stateEqualityToken:d.stateEqualityToken,auditId:'${audit}',committedAtUtc:'2026-10-06T00:00:00Z'};if(x.mode==='lost')throw Error('lost ACK');if(x.mode==='readFailure')x.readFailure=true;if(x.mode==='malformedRead')x.readShape='malformed';if(x.mode==='mismatchedRead')x.readShape='mismatch';return response({scopeKey:x.scope,data:{outcome:'Committed',receipt:x.receipt,code:null}});}
 return response({scopeKey:x.scope,data:{outcome:x.mode,receipt:null,code:null}});
 }),[config.apiRevision]);
 const list=useMemo(()=>async(page,search,branch)=>{const x=m.current,failure=x.listFailure;x.calls.list.push({page,search,branch});await wait(x,'list');if(failure!==null){if(failure==='network')throw new TypeError('synthetic network loss');throw new ApiError(failure,'synthetic_list_error');}return {rows:Object.values(x.docs).map(d=>({documentId:d.documentId,documentDate:'2026-10-01',branchId:'BR-A',statusId:0,isLocked:false})),page,pageSize:50,hasMore:page===1};},[config.listRevision]);
 const workspace=config.available&&config.loginKey?{session:{displayName:'Synthetic',tenantId:'T',companyId:'C',companyName:'Synthetic',authorityVersion:config.version,idleExpiresAt:'2026-10-07T00:00:00Z',absoluteExpiresAt:'2026-10-08T00:00:00Z',capabilities:['inbound-requests.read']},navigation:[],branchIds:['BR-A']}:null;
 window.qa={reset:patch=>{const next=++count.current;m.current={...model(),scope:next.toString(16).padStart(64,'0'),...patch};window.qaLeft=false;window.qaDenied=[];window.qaCallback=null;setConfig({loginKey:'login-'+next,version:1,available:true,listRevision:0,apiRevision:0,callbackRevision:0});},calls:()=>m.current.calls,
 hold:k=>m.current.held[k]=true,release:k=>{m.current.held[k]=false;(m.current.waits[k]??[]).splice(0).forEach(f=>f());},held:k=>(m.current.waits[k]??[]).length,releaseOne:k=>m.current.waits[k]?.shift()?.(),stopHolding:k=>m.current.held[k]=false,
 failList:status=>{m.current.listFailure=status;setConfig(v=>({...v,listRevision:v.listRevision+1}));},listHealthy:()=>m.current.listFailure=null,
 refreshList:()=>setConfig(v=>({...v,listRevision:v.listRevision+1})),swapApi:()=>setConfig(v=>({...v,apiRevision:v.apiRevision+1})),
 rerender:()=>setConfig(v=>({...v,callbackRevision:v.callbackRevision+1})),callbackRevision:()=>config.callbackRevision,readFailure:value=>m.current.readFailure=value,nextReadRights:value=>m.current.nextReadAccess=value,
 rights:value=>{m.current.access={...rights,...value};setConfig(v=>({...v,version:v.version+1}));},workspace:value=>setConfig(v=>({...v,available:value})),logout:()=>setConfig(v=>({...v,loginKey:null,available:false})),
 retainRelease:k=>{const old=m.current;window.qaOldRelease=()=>{old.held[k]=false;(old.waits[k]??[]).splice(0).forEach(f=>f());};},outcome:v=>m.current.outcome=v,healthy:()=>{m.current.readFailure=false;m.current.readShape=null;},mode:v=>m.current.mode=v};
 return <NavigationGuardProvider><InboundRequestScreen loginKey={config.loginKey} workspace={workspace} api={api} list={list} onDenied={error=>(window.qaDenied??=[]).push(error.status)} onClose={()=>{window.qaLeft=true;window.qaCallback=config.callbackRevision;}} onBack={()=>{window.qaLeft=true;window.qaCallback=config.callbackRevision;}}/></NavigationGuardProvider>;
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
  try {
    browser = await chromium.launch({headless: true, ...(process.env.I21_TEST_BROWSER ? {executablePath: process.env.I21_TEST_BROWSER} : {})});
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
      scope:'Actual React host/I18/provider; fake list/fetch only. NOT ASP.NET, BFF, SQL or production.'}, null, 2));
  } finally {await context?.close(); await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
});
