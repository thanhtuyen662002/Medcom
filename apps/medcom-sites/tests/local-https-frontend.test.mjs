import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtemp, readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import https from 'node:https';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {verifyStandalone} from '../scripts/verify-standalone.mjs';

async function responseDuring(page, predicate, action) {
  // Arm before the trigger, and observe BOTH rejections before running it.
  // Promise.all keeps the losing promise observed after the first failure.
  const response = page.waitForResponse(predicate);
  const [received] = await Promise.all([response, Promise.resolve().then(action)]);
  return received;
}
async function runRequiredCase(context, results, name, action) {
  let failed = false, failure;
  await context.test(name, async () => {try {await action(); results.push({name, result: 'PASS'});} catch (error) {failed = true; failure = error; throw error;}});
  if (failed) throw failure;
  context.signal.throwIfAborted();
}

test('I29 response-action fixture observes both failures and stops after the first failed case', async () => {
  const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
  const predicate = () => true, events = [], success = deferred(), received = {};
  const page = {waitForResponse(value) {assert.equal(value, predicate); events.push('armed'); return success.promise;}};
  const paired = responseDuring(page, predicate, () => {events.push('action'); success.resolve(received);});
  assert.deepEqual(events, ['armed']); assert.equal(await paired, received); assert.deepEqual(events, ['armed', 'action']);
  for (const first of ['response', 'action']) {
    const response = deferred(), action = deferred(), original = Error(`synthetic ${first} failure`), late = Error('synthetic late failure');
    const started = deferred();
    const pending = responseDuring({waitForResponse: () => response.promise}, predicate, () => {started.resolve(); return action.promise;});
    const rejected = assert.rejects(pending, error => error === original); await started.promise;
    (first === 'response' ? response : action).reject(original); await rejected;
    (first === 'response' ? action : response).reject(late); await delay(0);
  }
  const lateResponse = deferred(), synchronous = Error('synthetic synchronous action failure');
  await assert.rejects(responseDuring({waitForResponse: () => lateResponse.promise}, predicate, () => {throw synchronous;}), error => error === synchronous);
  lateResponse.reject(Error('synthetic late response')); await delay(0);
  const original = Error('synthetic first response failure'), results = [], setup = [], failures = [];
  const context = {signal: new AbortController().signal, test: async (name, action) => {try {await action();} catch (error) {failures.push(error);}}};
  await assert.rejects(async () => {
    for (const name of ['first', 'must-not-start']) await runRequiredCase(context, results, name, async () => {
      setup.push(name); await responseDuring({waitForResponse: () => Promise.reject(original)}, predicate, () => Promise.resolve());
    });
  }, error => error === original);
  assert.deepEqual(setup, ['first']); assert.deepEqual(failures, [original]); assert.deepEqual(results, []);
  // Every hosted response waiter must go through the immediately observed pair.
  const source = await readFile(fileURLToPath(import.meta.url), 'utf8');
  assert.equal(source.match(/\bpage\.waitForResponse\(/g)?.length, 1);
});

const loginName = 'Đăng nhập ERP';
async function requireLoginGate(page) {
  const form = page.getByRole('form', {name: loginName, exact: true});
  await form.waitFor({state: 'visible'});
  assert.equal(await page.locator('.topbar:visible, .erp-sidebar:visible, #main-content:visible').count(), 0, 'retired or anonymous sessions cannot expose protected Workspace chrome');
  assert.equal(await page.getByRole('dialog').count(), 0, 'login-first must not expose a protected or legacy login dialog');
  assert.equal(await page.getByRole('alertdialog').count(), 0, 'retirement must close pending protected confirmation dialogs');
  return form;
}
async function submitFixtureLogin(surface) {
  await surface.getByLabel('Tên đăng nhập', {exact: true}).fill('i28-user');
  await surface.getByLabel('Mật khẩu', {exact: true}).fill('synthetic-i28-password');
  await surface.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
}
const recoveryTitle = 'Chưa thể xác minh phiên làm việc';
function workspaceRecoveryButton(page) {
  return page.getByRole('region', {name: recoveryTitle, exact: true})
    .getByRole('button', {name: 'Thử lại', exact: true});
}
const purchaseDialogName = 'Phiếu mua hàng hiện có I29-PR-P2-00';
function purchaseDialog(page) {
  return page.getByRole('dialog', {name: purchaseDialogName, exact: true});
}
function purchaseFooterAction(page, name, includeHidden = false) {
  // The editor portals commands into its owning dialog's direct footer. Real
  // actions remain visible-only; hidden controls are admitted for inspection only.
  return purchaseDialog(page).locator(':scope > footer.record-dialog-actions')
    .getByRole('button', {name, exact: true, includeHidden});
}
async function assertPurchaseActionBlocked(page, name, hidden) {
  const button = purchaseFooterAction(page, name, hidden);
  await button.waitFor({state: 'attached'});
  assert.equal(await button.count(), 1, 'exactly one retained command in the selected document footer');
  assert.equal(await button.isEnabled(), false, name + ' waits for current verification');
  assert.equal(await button.isVisible(), !hidden, name + ' obeys the current action presentation');
  if (hidden) assert.deepEqual(await button.evaluate(element => ({
    hidden: element.parentElement.hidden, inert: element.parentElement.inert,
    ariaHidden: element.parentElement.getAttribute('aria-hidden'),
  })), {hidden: true, inert: true, ariaHidden: 'true'}, 'unverified footer actions are hidden and inert as well as disabled');
  return button;
}
const purchaseIdentitySelector = 'form[aria-label="Đề nghị mua hàng trên điện thoại"] > header > p > strong';
function purchaseDocumentIdentity(page, baselineControl) {
  // The exact historical control used a document heading. Current request
  // dialogs include the document number in the shared title; the protected form also owns the exact ID.
  if (baselineControl) return page.getByRole('heading', {name: 'I29-PR-P2-00', exact: true});
  return purchaseDialog(page)
    .getByRole('region', {name: 'Phiếu mua hàng hiện có', exact: true})
    .locator(purchaseIdentitySelector).filter({hasText: /^I29-PR-P2-00$/});
}

// This named check renders the real production gate without starting a browser,
// relay or server. The complete hosted invocation still runs the built TLS case.
test('I28 login-first fixture contract matches the production auth gate', async () => {
  const app = fileURLToPath(new URL('../', import.meta.url));
  const out = path.join(app, '.test-runtime/i28-auth-contract');
  await mkdir(out, {recursive: true});
  const [{build}, {default: React}, {renderToStaticMarkup}] = await Promise.all([import('esbuild'), import('react'), import('react-dom/server')]);
  await build({absWorkingDir: app, stdin: {contents: `export {WorkspaceAuthGate} from './components/erp/workspace-auth-gate'; export {deriveWorkspaceAuthState} from './lib/erp/workspace-auth-state';`, resolveDir: app, loader: 'tsx'},
    outfile: path.join(out, 'production.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', alias: {'@': app}, loader: {'.css': 'empty'}, jsx: 'automatic'});
  const {WorkspaceAuthGate, deriveWorkspaceAuthState} = await import(pathToFileURL(path.join(out, 'production.mjs')));
  for (const session of ['anonymous', 'expired']) {
    const state = deriveWorkspaceAuthState({lifecycleKey: 'synthetic-retired', session, hasAuthenticatedProof: false, authority: 'unavailable', proofLifecycleKey: null, signOutPending: false});
    const html = renderToStaticMarkup(React.createElement(WorkspaceAuthGate, {state, onRetry() {}, login: {configured: true, onSuccess() {}}}, React.createElement('div', {className: 'topbar'}, 'PROTECTED SYNTHETIC CONTENT')));
    assert.match(html, /<form\b[^>]*aria-label="Đăng nhập ERP"/);
    assert.match(html, />Tên đăng nhập<\/label>/); assert.match(html, />Mật khẩu<\/label>/);
    assert.match(html, /<button\b[^>]*type="submit"[^>]*>Đăng nhập<\/button>/);
    assert.doesNotMatch(html, /PROTECTED SYNTHETIC CONTENT|role="(?:alert)?dialog"/);
  }
  const recoveryState = deriveWorkspaceAuthState({lifecycleKey: 'synthetic-live', session: 'live', hasAuthenticatedProof: true, authority: 'unavailable', proofLifecycleKey: null, signOutPending: false});
  const recoveryHtml = renderToStaticMarkup(React.createElement(WorkspaceAuthGate, {state: recoveryState, onRetry() {}, login: {configured: true, onSuccess() {}}}, React.createElement('div', null, 'RETAINED SYNTHETIC INTENT')));
  const labelledBy = recoveryHtml.match(/<section\b[^>]*aria-labelledby="([^"]+)"/)?.[1];
  assert.ok(labelledBy, 'the root recovery region must have an accessible heading label');
  assert.ok(recoveryHtml.includes(`<h1 id="${labelledBy}">${recoveryTitle}</h1>`));
  assert.match(recoveryHtml, /<button type="button">Thử lại<\/button>/);
  assert.match(recoveryHtml, /<div\b[^>]*hidden=""[^>]*inert=""[^>]*aria-hidden="true"[^>]*style="display:none"><div>RETAINED SYNTHETIC INTENT<\/div><\/div>/);
  assert.doesNotMatch(recoveryHtml, /<form\b|Xác minh lại phiên ERP/);
  const retry = {}, recoveryCalls = [];
  const recoveryPage = {getByRole(role, options) {
    recoveryCalls.push(role); assert.equal(role, 'region'); assert.deepEqual(options, {name: recoveryTitle, exact: true});
    return {getByRole(childRole, childOptions) {recoveryCalls.push(childRole); assert.equal(childRole, 'button'); assert.deepEqual(childOptions, {name: 'Thử lại', exact: true}); return retry;}};
  }};
  assert.equal(workspaceRecoveryButton(recoveryPage), retry); assert.deepEqual(recoveryCalls, ['region', 'button']);
  // Exercise the fixture's exact entry contract too: no menu/dialog fallback,
  // no acceptance of a form while protected chrome or portals remain visible.
  function fixture({chrome = 0, dialog = 0, alertdialog = 0, missing = false} = {}) {
    const form = {async waitFor(options) {assert.deepEqual(options, {state: 'visible'}); if (missing) throw Error('login form missing');}};
    return {form, getByRole(role, options) {
      if (role === 'form') {assert.deepEqual(options, {name: loginName, exact: true}); return form;}
      assert.ok(role === 'dialog' || role === 'alertdialog'); return {async count() {return role === 'dialog' ? dialog : alertdialog;}};
    }, locator(selector) {assert.equal(selector, '.topbar:visible, .erp-sidebar:visible, #main-content:visible'); return {async count() {return chrome;}};}};
  }
  const valid = fixture(); assert.equal(await requireLoginGate(valid), valid.form);
  await assert.rejects(requireLoginGate(fixture({missing: true})), /login form missing/);
  await assert.rejects(requireLoginGate(fixture({chrome: 1})), /protected Workspace chrome/);
  await assert.rejects(requireLoginGate(fixture({dialog: 1})), /legacy login dialog/);
  await assert.rejects(requireLoginGate(fixture({alertdialog: 1})), /protected confirmation dialogs/);
});

test('I29 purchase identity fixture matches the production editor and document dialog title', async () => {
  const app = fileURLToPath(new URL('../', import.meta.url)), out = path.join(app, '.test-runtime/i29-purchase-identity-contract');
  await mkdir(out, {recursive: true});
  const [{build}, {default: React}, {renderToStaticMarkup}] = await Promise.all([import('esbuild'), import('react'), import('react-dom/server')]);
  await build({absWorkingDir: app, stdin: {contents: `export {MobileRequest} from './components/erp/mobile-request'; export {RequestDetailDialog} from './components/erp/request-detail-dialog';`, resolveDir: app, loader: 'tsx'},
    outfile: path.join(out, 'production.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', alias: {'@': app}, loader: {'.css': 'empty'}, jsx: 'automatic'});
  const {MobileRequest, RequestDetailDialog} = await import(pathToFileURL(path.join(out, 'production.mjs')));
  const initial = {documentId: 'I29-PR-P2-00', version: 'synthetic-v1', confirmation: 'draft', status: null,
    values: {purchaseDate: '2026-10-07', personSuggest: 'SYNTHETIC', department: '', purposeId: '', purposeDescOrClient: '', notes: '', branchId: 'BR-A', currencyId: '', objectId: '', lines: []}};
  const access = {scopeKey: 'synthetic', canRead: true, canEdit: false, canSaveDraft: false, canSubmit: false, available: true, existingOnly: true,
    branches: [], currencies: [], purposes: [], maxNotesLength: 2000, maxPurposeLength: 2000, maxLines: 500, itemLookupId: 'synthetic-item', objectLookupId: 'synthetic-object'};
  const html = renderToStaticMarkup(React.createElement(RequestDetailDialog, {open: true, title: 'Phiếu mua hàng hiện có', documentNumber: initial.documentId, closeLabel: 'Đóng đề nghị', onRequestClose() {}},
    React.createElement(MobileRequest, {initial, access, adapter: {execute() {assert.fail('source render must not dispatch');}, reconcile() {assert.fail('source render must not reconcile');}}})));
  assert.match(html, /<h2\b[^>]*>Phiếu mua hàng hiện có<span class="record-document-number">I29-PR-P2-00<\/span><\/h2>/);
  assert.match(html, /<form\b[^>]*aria-label="Đề nghị mua hàng trên điện thoại"[^>]*><header\b[^>]*>.*?<p>Mã phiếu: <strong>I29-PR-P2-00<\/strong><\/p>/s);
  assert.doesNotMatch(html, /<h[1-6]\b[^>]*>I29-PR-P2-00<\/h[1-6]>/);
  const identity = {}, legacyHeading = {}, calls = [];
  const page = {getByRole(role, options) {
    calls.push(role);
    if (role === 'heading') {assert.deepEqual(options, {name: 'I29-PR-P2-00', exact: true}); return legacyHeading;}
    assert.equal(role, 'dialog'); assert.deepEqual(options, {name: 'Phiếu mua hàng hiện có I29-PR-P2-00', exact: true});
    return {getByRole(region, regionOptions) {assert.equal(region, 'region'); assert.deepEqual(regionOptions, {name: 'Phiếu mua hàng hiện có', exact: true});
      return {locator(selector) {assert.equal(selector, purchaseIdentitySelector); return {filter({hasText}) {
      assert.equal(hasText.test('I29-PR-P2-00'), true);
      for (const wrong of ['OTHER', 'I29-PR-P2-001', 'prefix I29-PR-P2-00']) assert.equal(hasText.test(wrong), false);
      return identity;
    }};}};}};
  }};
  assert.equal(purchaseDocumentIdentity(page, false), identity); assert.deepEqual(calls, ['dialog']);
  assert.equal(purchaseDocumentIdentity(page, true), legacyHeading); assert.deepEqual(calls, ['dialog', 'heading']);
});

test('I29 purchase footer locators reject duplicate, enabled or incompletely hidden retained actions', async () => {
  function fixture({count = 1, enabled = false, visible = false, hidden = true, inert = true, ariaHidden = 'true'} = {}) {
    const calls = [];
    const button = {async waitFor(options) {assert.deepEqual(options, {state: 'attached'});}, async count() {return count;},
      async isEnabled() {return enabled;}, async isVisible() {return visible;},
      async evaluate(read) {return read({parentElement: {hidden, inert, getAttribute(name) {assert.equal(name, 'aria-hidden'); return ariaHidden;}}});}};
    const page = {getByRole(role, options) {
      assert.equal(role, 'dialog'); assert.deepEqual(options, {name: purchaseDialogName, exact: true}); calls.push('exact document dialog');
      return {locator(selector) {assert.equal(selector, ':scope > footer.record-dialog-actions'); calls.push('owning footer');
        return {getByRole(childRole, childOptions) {assert.equal(childRole, 'button'); assert.equal(childOptions.name, 'Rà soát phiếu');
          assert.equal(childOptions.exact, true); calls.push(childOptions.includeHidden); return button;}};}};
    }};
    return {page, button, calls};
  }
  const live = fixture(); assert.equal(purchaseFooterAction(live.page, 'Rà soát phiếu'), live.button);
  assert.deepEqual(live.calls, ['exact document dialog', 'owning footer', false], 'normal commands cannot match hidden controls');
  const retained = fixture(); assert.equal(await assertPurchaseActionBlocked(retained.page, 'Rà soát phiếu', true), retained.button);
  assert.deepEqual(retained.calls, ['exact document dialog', 'owning footer', true]);
  await assertPurchaseActionBlocked(fixture({visible: true, hidden: false, inert: false, ariaHidden: 'false'}).page, 'Rà soát phiếu', false);
  for (const invalid of [{count: 0}, {count: 2}, {enabled: true}, {visible: true}, {hidden: false}, {inert: false}, {ariaHidden: 'false'}]) {
    await assert.rejects(assertPurchaseActionBlocked(fixture(invalid).page, 'Rà soát phiếu', true), {name: 'AssertionError'});
  }
});

// Built modern app -> actual shipping TLS relay -> built BFF -> synthetic HTTPS
// API. Only this test process knows the ephemeral CA/leaf pin. Owner trust and
// real SQL/DLL/business acceptance are not inferred from this fixture.
test('I28 built mobile Workspace authenticates through actual local HTTPS relay and BFF', {timeout: 300000}, async t => {
  assert.equal(process.versions.node.split('.')[0], '24', 'I28 requires Node 24');
  const baselineControl = process.env.I29_BASELINE_CONTROL === '1';
  if (baselineControl) {
    assert.equal(process.platform, 'linux', 'the compiled pre-fix control is Linux-only');
    assert.equal(process.env.SOURCE_REVISION, '2712d00532cd76b0cc4eae44ede04314f38e812f', 'negative control must use the exact admitted pre-fix source');
  }
  const packageRoot = path.resolve(process.env.I28_PACKAGE_DIRECTORY ?? '');
  const fixtureDll = process.env.I28_FIXTURE_DLL;
  assert.ok(fixtureDll && process.env.I28_PACKAGE_DIRECTORY && /^[a-f0-9]{40}$/.test(process.env.SOURCE_REVISION ?? ''), 'I28 fixture/package/revision are required; no skip');
  const {manifest} = await verifyStandalone(packageRoot, {expectedRevision: process.env.SOURCE_REVISION, expectedPlatform: process.platform, expectedArch: process.arch});
  const require = createRequire(path.join(path.resolve(process.env.MEDCOM_BROWSER_TOOLCHAIN ?? ''), 'package.json'));
  const {chromium} = require('playwright-core');
  const directory = await mkdtemp(path.join(tmpdir(), 'medcom-i28-synthetic-'));
  const output = path.resolve('.test-runtime/i28-local-https'); await mkdir(output, {recursive: true}); await rm(path.join(output,'result.json'),{force:true}); await rm(path.join(output,'baseline-control.json'),{force:true});
  const children = [], errors = [], external = [], results = [], responses = [];
  let browser, context, page, ca, ready;
  function child(executable, args, env) {
    const running = spawn(executable, args, {cwd: packageRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    const record = {process: running, closed: false, diagnostic: ''};
    record.done = new Promise(resolve => running.once('close', () => {record.closed = true; resolve();}));
    running.on('error', error => {record.error = error;});
    const capture = data => {record.diagnostic = (record.diagnostic + data.toString()).slice(-12000);};
    running.stdout.on('data', capture); running.stderr.on('data', capture); children.push(record); return record;
  }
  const basicEnv = {};
  for (const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','TMPDIR','DOTNET_ROOT','DOTNET_ROOT_X64']) if (process.env[key]) basicEnv[key] = process.env[key];
  async function closeChild(record) {
    if (!record.closed) record.process.kill('SIGTERM');
    await Promise.race([record.done, delay(3000)]);
    if (!record.closed) {record.process.kill('SIGKILL'); await Promise.race([record.done, delay(3000)]);}
    assert.ok(record.closed, 'owned synthetic child process must terminate');
  }
  async function cleanup() {
    const outcomes = await Promise.allSettled([context?.close(), browser?.close(), ...children.map(closeChild)]);
    await rm(directory, {recursive: true, force: true});
    if (!t.signal.aborted && outcomes.some(x => x.status === 'rejected')) throw new AggregateError(outcomes.filter(x => x.status === 'rejected').map(x => x.reason), 'I28 teardown failed');
  }
  const aborted = () => {void cleanup().catch(error => {console.error('I28 abort cleanup:', error.message);});};
  t.signal.addEventListener('abort', aborted, {once: true});
  async function waitFor(fn, label, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      t.signal.throwIfAborted();
      for (const record of children) {if (record.error) throw record.error; if (record.closed && !record.expectedStopped) throw Error(`Synthetic child exited during ${label}: ${record.diagnostic}`);}
      try {const value = await fn(); if (value) return value;} catch (error) {if (t.signal.aborted) throw error;}
      await delay(100);
    }
    throw Error(`I28 timeout: ${label}`);
  }
  async function freePort() {
    const server = net.createServer(); await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const port = server.address().port; await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); return port;
  }
  function request(url, {method = 'GET', headers = {}, body, certificate = ca, expectContinue = false, tlsServername} = {}) {
    return new Promise((resolve, reject) => {
      let sent = false;
      const wireHeaders = expectContinue ? {...headers, Expect:'100-continue', 'Content-Length':String(Buffer.byteLength(body ?? ''))} : headers;
      const req = https.request(url, {method, headers:wireHeaders, ...(certificate === false ? {} : {ca: certificate}), ...(tlsServername ? {servername:tlsServername} : {}), rejectUnauthorized: true, family: 4, signal: t.signal}, res => {
        const parts = []; res.on('data', b => parts.push(b)); res.on('error', reject);
        res.on('end', () => {resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString('utf8')});if(expectContinue&&!sent)req.destroy();});
      });
      req.setTimeout(10000, () => req.destroy(Error('bounded synthetic request timeout'))); req.on('error', reject);
      // Declared overflow can be refused before a body is sent. Keep its exact
      // HTTP413 assertion independent of an early-close client write race.
      if(expectContinue){req.once('continue',()=>{sent=true;req.end(body);});req.flushHeaders();}else{sent=true;req.end(body);}
    });
  }
  const run = (name, action) => runRequiredCase(t, results, name, action);
  try {
    const ports = new Set(); while (ports.size < 3) ports.add(await freePort());
    const [apiPort, httpsPort, nodePort] = [...ports];
    child(process.env.DOTNET_HOST_PATH ?? 'dotnet', [fixtureDll, '--api-port', String(apiPort), '--https-port', String(httpsPort), '--node-port', String(nodePort), '--output', directory], basicEnv);
    ready = await waitFor(async () => JSON.parse(await readFile(path.join(directory, 'ready.json'), 'utf8')), 'TLS fixture readiness');
    ca = await readFile(path.join(directory, 'ca.pem'));
    const localEnv = {...basicEnv, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1', PORT: String(nodePort),
      MEDCOM_LOCAL_HTTPS: '1', MEDCOM_PUBLIC_ORIGIN: ready.publicOrigin, MEDCOM_API_ORIGIN: ready.apiOrigin,
      NODE_EXTRA_CA_CERTS: path.join(directory, 'ca.pem')};
    let node = child(process.execPath, [path.join(packageRoot, manifest.server)], localEnv);
    await waitFor(async () => (await request(ready.publicOrigin + '/')).status === 200, 'built frontend HTML');
    browser = await chromium.launch({executablePath: process.env.MEDCOM_EDGE_PATH, headless: true,
      args: ['--no-sandbox', `--ignore-certificate-errors-spki-list=${ready.spki}`]});
    t.signal.throwIfAborted(); context = await browser.newContext({viewport: {width: 390, height: 844}}); page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {const url=new URL(response.url());if(url.origin===ready.publicOrigin&&url.pathname.startsWith('/api/erp/')){responses.push({path:url.pathname,status:response.status()});if(responses.length>30)responses.shift();}});
    page.on('request', req => {if (!req.url().startsWith(ready.publicOrigin + '/') && !req.url().startsWith('data:')) external.push(new URL(req.url()).origin);});
    const address = route => ready.publicOrigin + '/api/erp/' + route;
    const snapshot = async () => JSON.parse((await request(ready.apiOrigin + '/__fixture/state')).body);
    await run('production HTML/assets and mobile login use real trusted fixture TLS', async () => {
      const home=await page.goto(ready.publicOrigin + '/', {waitUntil: 'load', timeout: 20000});
      const security=await home.allHeaders();assert.equal(security['x-frame-options'],'DENY');assert.equal(security['x-content-type-options'],'nosniff');assert.equal(security['referrer-policy'],'no-referrer');assert.equal(security['permissions-policy'],'camera=(self), microphone=(), geolocation=()');
      assert.ok(await page.locator('script[src*="/_next/static/"]').count());
      let login;
      if (baselineControl) {
        // Only the exact pinned pre-I44 negative control has this old entry UI.
        await page.locator('.topbar .user-button').click();
        await page.getByRole('menuitem', {name: loginName, exact: true}).click();
        login = page.getByRole('dialog');
      } else login = await requireLoginGate(page);
      await submitFixtureLogin(login);
      await page.waitForFunction(() => document.querySelector('.topbar .user-button')?.textContent.includes('SYNTHETIC I28'));
      const cookies = await context.cookies();
      assert.deepEqual(cookies.map(c => c.name).sort(), ['__Host-Medcom.Csrf','__Host-Medcom.Session']);
      for (const c of cookies) {assert.equal(c.secure, true); assert.equal(c.httpOnly, true); assert.equal(c.path, '/'); assert.equal(c.domain, 'localhost'); assert.equal(c.sameSite, 'Strict');}
    });
    await run('320px and 390px built Workspace show authorized list and full detail', async () => {
      for (const width of [320,390]) {
        await page.setViewportSize({width, height: 844});
        await page.goto(ready.publicOrigin + '/?screen=purchase-orders', {waitUntil: 'load'});
        const card = page.locator('.mobile-document-card').filter({hasText: 'I28-PO-001'});
        await card.waitFor(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        await page.screenshot({path: path.join(output, `workspace-${width}.png`), fullPage: true});
        await card.click(); await page.getByRole('dialog').locator('.mobile-detail-lines').getByText('SYNTHETIC-ITEM', {exact: true}).waitFor();
        await page.keyboard.press('Escape');
      }
    });
    await run('I29 actual relay and BFF preserve only response read markers, never forged request authority',async()=>{
      const cookies=(await context.cookies()).map(cookie=>`${cookie.name}=${cookie.value}`).join('; ');
      for(const route of ['api/workspace','api/documents/purchase-orders','api/documents/purchase-orders/detail?documentId=I28-PO-001']){
        const result=await request(address(route),{headers:{Cookie:cookies,'X-Medcom-Session-Scope':'c'.repeat(64),'X-Medcom-Read-Scope':'d'.repeat(64)}});
        assert.equal(result.status,200);assert.equal(result.headers['x-medcom-session-scope'],'a'.repeat(64));assert.equal(result.headers['x-medcom-read-scope'],'b'.repeat(64));
      }
      const state=await snapshot();assert.ok(state.calls.filter(call=>call.path==='/api/workspace'||call.path.startsWith('/api/documents/')).every(call=>call.readMarkerPresent===false));
      const unrelated=await request(address('api/auth/session'),{headers:{Cookie:cookies}});assert.equal(unrelated.headers['x-medcom-session-scope'],undefined);assert.equal(unrelated.headers['x-medcom-read-scope'],undefined);
    });
    await run('forged Host, Origin and forwarded headers cannot broaden origin admission', async () => {
      // Node normally derives TLS servername from a supplied Host header. Prove
      // that failure first, then authenticate localhost TLS while attacking only
      // HTTP authority, so the relay's own Host check is actually exercised.
      await assert.rejects(request(ready.publicOrigin + '/', {headers: {Host:'attacker.invalid'}}),error=>error.code==='ERR_TLS_CERT_ALTNAME_INVALID');
      const badHost = await request(ready.publicOrigin + '/', {headers: {Host: 'attacker.invalid'},tlsServername:'localhost'}); assert.equal(badHost.status, 400);
      const before = (await snapshot()).calls.filter(c=>c.path==='/api/auth/login').length;
      const rejected = await request(address('api/auth/login'), {method: 'POST', headers: {'Content-Type':'application/json', Origin:'https://attacker.invalid', Connection:'Origin, close', Forwarded:'host=localhost;proto=https', 'X-Forwarded-Host':new URL(ready.publicOrigin).host}, body:'{}'});
      assert.equal(rejected.status,403); assert.equal(JSON.parse(rejected.body).code,'origin_rejected');
      assert.equal((await snapshot()).calls.filter(c=>c.path==='/api/auth/login').length,before);
      const missing = await request(address('api/auth/login'), {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}); assert.equal(missing.status,403);
    });
    await run('CSRF, cookie and exact inbound byte limits survive both proxy hops', async () => {
      const cookies = (await context.cookies()).map(c => c.name + '=' + c.value).join('; ');
      const headers = {Origin:ready.publicOrigin,'Content-Type':'application/json; charset=utf-8',Cookie:cookies,'X-CSRF-TOKEN':'synthetic-i28-csrf','X-Inbound-Scope':'a'.repeat(64)};
      const invalidCsrf = await request(address('api/auth/session/continue'),{method:'POST',headers:{...headers,'X-CSRF-TOKEN':'wrong'},body:'{}'});assert.equal(invalidCsrf.status,403);
      const missingScope = {...headers};delete missingScope['X-Inbound-Scope'];assert.equal((await request(address('api/inbound-requests/draft/save'),{method:'POST',headers:missingScope,body:'{}'})).status,409);
      const bytes = Buffer.from('{ "note": "' + 'x'.repeat(1048576-14) + '" }'); assert.equal(bytes.length,1048576);
      const accepted = await request(address('api/inbound-requests/draft/save'),{method:'POST',headers,body:bytes});assert.equal(accepted.status,200);assert.equal(JSON.parse(accepted.body).sha256,createHash('sha256').update(bytes).digest('hex'));
      const before = (await snapshot()).calls.filter(c=>c.method==='POST').length;
      assert.equal((await request(address('api/inbound-requests/draft/save'),{method:'POST',headers,body:Buffer.concat([bytes,Buffer.from(' ')]),expectContinue:true})).status,413);
      assert.equal((await request(address('api/auth/login'),{method:'POST',headers,body:'x'.repeat(16385),expectContinue:true})).status,413);
      assert.equal((await snapshot()).calls.filter(c=>c.method==='POST').length,before);
      const sent = (await snapshot()).calls.filter(c => c.path==='/api/inbound-requests/draft/save').at(-1);
      assert.equal(sent.origin,ready.apiOrigin);assert.equal(sent.forwarded,false);assert.equal(sent.scope,'a'.repeat(64));assert.deepEqual(sent.cookieNames,['__Host-Medcom.Csrf','__Host-Medcom.Session']);
    });
    await run('untrusted upstream certificates fail closed without browser/Node validation bypass', async () => {
      await assert.rejects(request(ready.apiOrigin+'/health/live',{certificate:false}),{code:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'});
      await assert.rejects(request(ready.apiOrigin.replace('localhost','127.0.0.1')+'/health/live'),error=>error.code==='ERR_TLS_CERT_ALTNAME_INVALID');
      await closeChild(node);node.expectedStopped=true;
      const untrustedEnv={...localEnv};delete untrustedEnv.NODE_EXTRA_CA_CERTS;
      node=child(process.execPath,[path.join(packageRoot,manifest.server)],untrustedEnv);
      await waitFor(async()=>(await request(ready.publicOrigin+'/')).status===200,'untrusted built frontend start');
      const callsBeforeFailedTls=(await snapshot()).calls.filter(c=>c.path==='/health/live').length;
      const failed=await request(address('health/live'));assert.equal(failed.status,503);assert.equal(JSON.parse(failed.body).code,'backend_unavailable');assert.equal((await snapshot()).calls.filter(c=>c.path==='/health/live').length,callsBeforeFailedTls);
      await closeChild(node);node.expectedStopped=true;
      const disabledEnv={...localEnv};delete disabledEnv.MEDCOM_LOCAL_HTTPS;
      node=child(process.execPath,[path.join(packageRoot,manifest.server)],disabledEnv);
      await waitFor(async()=>(await request(ready.publicOrigin+'/')).status===200,'default-off built frontend start');
      const denied=await request(address('health/live'));assert.equal(denied.status,503);assert.equal(JSON.parse(denied.body).code,'backend_not_configured');
      await closeChild(node);node.expectedStopped=true;node=child(process.execPath,[path.join(packageRoot,manifest.server)],localEnv);
      await waitFor(async()=>(await request(address('health/live'))).status===200,'trusted built frontend restored');
      await page.goto(ready.publicOrigin+'/?screen=purchase-orders',{waitUntil:'load'});
      await page.locator('.mobile-document-card').waitFor();
    });

    // These regressions run the packaged Next/React app through BOTH real TLS
    // proxy hops. Only the final API is synthetic. No replacement Workspace,
    // component harness, patched fetch, or substituted production timer is used.
    const lifecycleEvidence = {visibility: [], requests: [], background: []};
    let controls = {};
    const control = async patch => {
      const {releaseHolds = [], ...state} = patch;
      controls = {...controls, ...state};
      const result = await request(ready.apiOrigin + '/__fixture/control', {method: 'POST',
        headers: {'Content-Type': 'application/json', 'X-I29-Fixture-Control': ready.controlToken}, body: JSON.stringify({...controls, releaseHolds})});
      assert.equal(result.status, 200, 'synthetic fixture control must be accepted');
    };
    const routes = ['/api/workspace', '/api/purchase-requests/workspace', '/api/purchase-requests', '/api/purchase-requests/detail'];
    const counts = async () => {const state = await snapshot(); return Object.fromEntries(routes.map(route => [route, state.calls.filter(call => call.path === route).length]));};
    const difference = (after, before) => Object.fromEntries(routes.map(route => [route, after[route] - before[route]]));
    const held = kind => waitFor(async () => (await snapshot()).waiting.some(entry => entry.key === kind && entry.value > 0), `held ${kind}`);
    const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const purchasePanel = () => page.getByRole('region', {name: 'Danh sách đề nghị mua hàng', exact: true});
    const purchaseEditor = () => page.getByRole('region', {name: 'Phiếu mua hàng hiện có', exact: true});
    const purchaseIdentity = () => purchaseDocumentIdentity(page, baselineControl);
    const purchaseRow = () => page.getByRole('button', {name: 'Mở đề nghị I29-PR-P2-00', exact: true});
    const freshOrderDetail = async () => {
      await page.getByRole('heading', {name: 'Đơn đặt hàng mua I29-PO-P2-00', exact: true}).waitFor();
      await page.locator('.request-detail-dialog .request-detail-body .desktop-detail-lines').getByText('I29-ITEM-P2-0', {exact: true}).waitFor();
    };
    const freshPurchaseDetail = async () => {
      await purchaseEditor().waitFor();
      await purchaseIdentity().waitFor({state: 'visible'});
      const disclosure = purchaseEditor().getByRole('region', {name: 'Dữ liệu ERP đầy đủ', exact: true}).locator('details');
      // The fixed pre-I30 control has no disclosure; preserve that exact control.
      if (await disclosure.count() && !await disclosure.evaluate(element => element.open)) await disclosure.locator('summary').click();
      await purchaseEditor().getByRole('table', {name: 'Toàn bộ dòng đề nghị', exact: true}).getByText('SYNTHETIC-PURCHASE-ITEM', {exact: true}).waitFor();
    };
    const assertPurchaseGrant = async (responsePromise, enabled) => {
      const response = await responsePromise; assert.equal(response.status(), 200);
      const body = await response.json();
      assert.equal(body.scopeKey, controls.purchaseScope, 'grant evidence belongs to the current purchase scope');
      assert.equal(body.data.document.purchaseRequestId, 'I29-PR-P2-00');
      assert.deepEqual(body.data.commandAccess, {canSave: enabled, canSubmit: enabled, canLookup: true, canAddLines: false,
        reason: enabled ? 'synthetic_grant_enabled' : 'synthetic_grant_revoked'}, 'fresh wire grants, not internal UI copy, prove the command authority');
    };
    const prepareOrders = async () => {
      await control({extendedRows: true, holds: [], failures: {}, expired: false, commandAllowed: true,
        sessionScope: 'a'.repeat(64), readScope: 'b'.repeat(64), purchaseScope: 'c'.repeat(64), branchIds: ['BR-A', 'BR-B']});
      await page.goto(ready.publicOrigin + '/?screen=purchase-orders');
      await page.getByRole('button', {name: 'I29-PO-P1-00', exact: true}).waitFor();
      await page.getByLabel('Tìm mã chứng từ', {exact: true}).fill('APPLIED');
      await page.getByLabel('Tìm mã chứng từ', {exact: true}).press('Enter');
      await page.locator('.document-panel').getByRole('combobox', {name: 'Chi nhánh', exact: true}).selectOption('BR-A');
      await page.getByRole('navigation', {name: 'Phân trang chứng từ', exact: true}).getByRole('button', {name: 'Trang sau', exact: true}).click();
      await page.getByRole('button', {name: 'I29-PO-P2-00', exact: true}).waitFor();
      await page.getByLabel('Tìm mã chứng từ', {exact: true}).fill('UNSUBMITTED DRAFT');
      await page.getByRole('button', {name: 'I29-PO-P2-00', exact: true}).click();
      await page.getByRole('button', {name: 'Trang dòng hàng tiếp theo', exact: true}).click();
      await freshOrderDetail();
      await page.locator('.desktop-grid-viewport').evaluate(element => {element.scrollTop = 220; element.scrollLeft = 80;});
      await page.locator('.request-detail-dialog .request-detail-body').evaluate(element => {element.scrollTop = 140;});
      await paint();
    };
    const preparePurchase = async () => {
      await control({commandGeneration: (controls.commandGeneration ?? 0) + 1, commitOnAck: false, purchaseBranchIds: null, extendedRows: true, holds: [], failures: {}, expired: false, commandAllowed: true,
        sessionScope: 'a'.repeat(64), readScope: 'b'.repeat(64), purchaseScope: 'c'.repeat(64), branchIds: ['BR-A', 'BR-B']});
      await page.goto(ready.publicOrigin + '/?screen=purchase-requests');
      await purchasePanel().getByLabel('Tìm mã đề nghị', {exact: true}).fill('APPLIED');
      await purchasePanel().getByLabel('Tìm mã đề nghị', {exact: true}).press('Enter');
      await purchasePanel().getByRole('combobox', {name: 'Chi nhánh', exact: true}).selectOption('BR-A');
      await purchasePanel().getByRole('button', {name: 'Trang sau', exact: true}).click();
      await purchaseRow().waitFor();
      await purchasePanel().getByLabel('Tìm mã đề nghị', {exact: true}).fill('UNSUBMITTED DRAFT');
      await purchaseRow().click(); await freshPurchaseDetail();
      await page.evaluate(() => window.scrollTo(0, 420)); await paint();
    };
    // The open detail modal aria-hides these retained background controls.
    // Inspect their exact DOM values here; prepareOrders keeps visible role-based interactions.
    const orderControls = async () => {
      assert.equal(await page.getByLabel('Tìm mã chứng từ', {exact: true}).inputValue(), 'UNSUBMITTED DRAFT');
      assert.equal(await page.locator('.document-panel select[aria-label="Chi nhánh"]').inputValue(), 'BR-A');
      assert.match(await page.locator('.document-panel nav[aria-label="Phân trang chứng từ"]').innerText(), /Trang 2/);
    };
    const purchaseControls = async () => {
      assert.equal(await purchasePanel().getByLabel('Tìm mã đề nghị', {exact: true}).inputValue(), 'UNSUBMITTED DRAFT');
      assert.equal(await purchasePanel().getByRole('combobox', {name: 'Chi nhánh', exact: true}).inputValue(), 'BR-A');
      assert.match(await purchasePanel().getByRole('navigation', {name: 'Phân trang đề nghị', exact: true}).innerText(), /Trang 2/);
      await purchaseIdentity().waitFor({state: 'visible'});
    };
    const watchStableData = kind => page.evaluate(({kind, baselineControl}) => {
      window.i29StableObserver?.disconnect();
      const visible = selector => {const node = document.querySelector(selector); return !!node && !node.closest('[hidden]') && node.getClientRects().length > 0;};
      // The exact historical2712 control still has article rows. Current lists
      // must prove the actual shared-grid row/action, never an editor article.
      const purchaseListRow = baselineControl
        ? '[aria-label="Danh sách đề nghị mua hàng"] article'
        : '[aria-label="Danh sách đề nghị mua hàng"] table[data-shared-grid="true"] tbody tr[data-grid-row="I29-PR-P2-00"] button[aria-label="Mở đề nghị I29-PR-P2-00"]';
      const editorForm = document.querySelector('form[aria-label="Đề nghị mua hàng trên điện thoại"]');
      const noteInput = editorForm?.querySelector('textarea[name="notes"]');
      const check = () => {
        const stableEditor = visible('form[aria-label="Đề nghị mua hàng trên điện thoại"]')
          && document.querySelector('form[aria-label="Đề nghị mua hàng trên điện thoại"]') === editorForm
          && (kind === 'pending' ? editorForm?.textContent.includes('SYNTHETIC PENDING NOTE') || editorForm?.querySelector('textarea[name="notes"]')?.value === 'SYNTHETIC PENDING NOTE'
            : visible('[aria-label="Phiếu mua hàng hiện có"] textarea[name="notes"]') && editorForm?.querySelector('textarea[name="notes"]') === noteInput);
        const present = kind === 'orders'
          ? visible('.document-link') && visible('.request-detail-dialog .request-detail-body .desktop-detail-lines') && document.querySelector('.request-detail-dialog .request-detail-body')?.textContent.includes('I29-ITEM-P2-0')
          : visible(purchaseListRow) && visible('[aria-label="Phiếu mua hàng hiện có"]') && stableEditor && document.querySelector('[aria-label="Phiếu mua hàng hiện có"]')?.textContent.includes('SYNTHETIC-PURCHASE-ITEM');
        if (!present) window.i29MissingFrames++;
      };
      window.i29MissingFrames = 0; check();
      window.i29StableObserver = new MutationObserver(check);
      window.i29StableObserver.observe(document.body, {childList: true, subtree: true, attributes: true});
    }, {kind, baselineControl});
    const stopStableData = async label => {
      const missing = await page.evaluate(() => {window.i29StableObserver.disconnect(); return window.i29MissingFrames;});
      assert.equal(missing, 0, `${label}: existing rows/detail must stay rendered throughout unchanged-scope background refresh`);
    };
    const activate = async (other, value) => {
      const restoredOverride = await page.evaluate(() => {
        const overridden = Object.prototype.hasOwnProperty.call(document, 'visibilityState');
        delete document.visibilityState; return overridden;
      });
      if (value === 'hidden') await other.bringToFront(); else await page.bringToFront();
      // Some headless targets never occlude. Real tab activation still happens;
      // record a supplemental visibility event honestly when the browser needs it.
      const native = await page.evaluate(() => document.visibilityState);
      const fallback = native !== value || restoredOverride;
      if (fallback) await page.evaluate(value => {
        Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => value});
        document.dispatchEvent(new Event('visibilitychange'));
        if (value === 'visible') window.dispatchEvent(new Event('focus'));
      }, value);
      lifecycleEvidence.visibility.push({requested: value, native, restoredOverride, supplementalEvent: fallback});
      await paint();
    };
    const assertOrderMasked = async () => {
      assert.equal(await page.locator('.document-link:visible').count(), 0);
      assert.equal(await page.locator('.request-detail-dialog .request-detail-body .desktop-detail-lines:visible').count(), 0);
    };
    const assertPurchaseMasked = async () => {
      assert.equal(await purchasePanel().getByRole('button', {name: /^Mở đề nghị I29-/}).count(), 0);
      assert.equal(await purchaseEditor().isVisible(), false);
      assert.equal(await purchaseIdentity().isVisible(), false, 'masked purchase identity must not remain visible');
    };
    await page.setViewportSize({width: 1024, height: 900});
    await page.clock.install();
    if (baselineControl) {
      // This mode recognizes precise old-code symptoms, never a failed test,
      // absent browser, bad TLS/bootstrap, timeout, or arbitrary nonzero exit.
      const observed = [], captures = [], captureErrors = [];
      const capture = response => {
        const route = new URL(response.url()).pathname;
        if (!['/api/erp/api/workspace', '/api/erp/api/purchase-requests/workspace', '/api/erp/api/purchase-requests', '/api/erp/api/purchase-requests/detail'].includes(route)) return;
        captures.push((async () => {
          const body = await response.json(), headers = response.headers();
          observed.push({route: route.slice('/api/erp'.length), status: response.status(), code: body.code,
            authorityVersion: body.session?.authorityVersion, sessionScope: headers['x-medcom-session-scope'],
            readScope: headers['x-medcom-read-scope'], purchaseScope: body.scopeKey});
        })().catch(error => {captureErrors.push(String(error));}));
      };
      page.on('response', capture);
      let missingMutations = 0, stormCounts, measuredMilliseconds;
      try {
        await preparePurchase(); await freshPurchaseDetail(); await purchaseControls();
        await Promise.all(captures);
        assert.ok(observed.some(item => item.route === '/api/purchase-requests/workspace' && item.status === 200 && item.purchaseScope === 'c'.repeat(64)), 'real successful purchase bootstrap is required before probing regressions');
        assert.ok(observed.some(item => item.route === '/api/purchase-requests/detail' && item.status === 200 && item.purchaseScope === 'c'.repeat(64)), 'the compiled baseline must have genuinely rendered authorized detail');
        await watchStableData('purchase');
        assert.equal(await page.evaluate(() => window.i29MissingFrames), 0, 'baseline starts with visible real list and editor');
        await control({holds: ['workspace', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']});
        await page.clock.fastForward(60001); await held('workspace');
        await control({holds: ['purchase-bootstrap', 'purchase-list', 'purchase-detail']}); await held('purchase-bootstrap'); await paint();
        missingMutations = await page.evaluate(() => {window.i29StableObserver.disconnect(); return window.i29MissingFrames;});
        await control({holds: []}); await freshPurchaseDetail(); await purchaseControls(); await Promise.all(captures);
        const healthyWorkspace = observed.filter(item => item.route === '/api/workspace' && item.status === 200);
        assert.ok(healthyWorkspace.length >= 2 && healthyWorkspace.at(-1).authorityVersion > healthyWorkspace[0].authorityVersion, 'healthy baseline refresh must have increasing observation versions');
        assert.ok(healthyWorkspace.every(item => item.sessionScope === 'a'.repeat(64) && item.readScope === 'b'.repeat(64)), 'baseline read scopes stay unchanged');
        const before = await counts(), stormObservationIndex = observed.length; await control({failures: {'purchase-bootstrap': 403}});
        await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/workspace' && response.status() === 403,
          () => purchasePanel().getByRole('button', {name: 'Làm mới', exact: true}).click());
        const started = Date.now(), deadline = started + 3000;
        do {
          await delay(100); stormCounts = difference(await counts(), before);
          if (stormCounts['/api/workspace'] >= 3 && stormCounts['/api/purchase-requests/workspace'] >= 4) break;
        } while (Date.now() < deadline);
        measuredMilliseconds = Date.now() - started;
        // Stop the page's producers before releasing/cleaning fixture controls.
        await page.goto('about:blank'); await control({holds: [], failures: {}}); await Promise.all(captures);
        const deniedResponses = observed.slice(stormObservationIndex).filter(item => item.route === '/api/purchase-requests/workspace' && item.status === 403 && item.code === 'synthetic_read_denied').length;
        const workspaceResponses = observed.filter(item => item.route === '/api/workspace' && item.status === 200);
        const successfulStormWorkspace = observed.slice(stormObservationIndex).filter(item => item.route === '/api/workspace' && item.status === 200).length;
        const storm = stormCounts['/api/workspace'] >= 3 && successfulStormWorkspace >= 3 && stormCounts['/api/purchase-requests/workspace'] >= 4 && deniedResponses >= 3;
        const blanking = missingMutations > 0;
        assert.ok(blanking || storm, 'the exact compiled baseline must demonstrate measured DOM blanking or the precise persistent-403 request storm');
        assert.ok(workspaceResponses.every(item => item.sessionScope === 'a'.repeat(64) && item.readScope === 'b'.repeat(64)));
        assert.ok(observed.filter(item => item.route.startsWith('/api/purchase-requests') && item.status === 200).every(item => item.purchaseScope === 'c'.repeat(64)));
        const versions = workspaceResponses.map(item => item.authorityVersion);
        assert.ok(versions.every(Number.isSafeInteger) && new Set(versions).size === versions.length, 'successful workspace responses have distinct authority observations');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        await writeFile(path.join(output, 'baseline-control.json'), JSON.stringify({
          sourceRevision: process.env.SOURCE_REVISION, expectedRegressionObserved: true, actualBuiltApp: true, actualShippingRelay: true,
          syntheticApi: true, successfulBootstrap: true, stableSessionScope: true, stableReadScope: true, stablePurchaseScope: true,
          authorityObservations: versions, symptoms: {backgroundDomBlanking: blanking, missingMutations, persistent403Storm: storm, deniedResponses, successfulStormWorkspace, requestDelta: stormCounts, measuredMilliseconds},
          browser: await browser.version(), results, captureErrors, scope: 'Exact pre-fix compiled negative control only; no corrected-build or production acceptance.'
        }, null, 2));
      } finally {
        page.off('response', capture); await control({holds: [], failures: {}});
      }
      return;
    }
    await run('I29 built 60s background observation refresh preserves order list, detail, filters, pages and scroll', async () => {
      await prepareOrders(); await orderControls();
      const scroll = await page.locator('.desktop-grid-viewport').evaluate(e => ({top: e.scrollTop, left: e.scrollLeft}));
      const detailScroll = await page.locator('.request-detail-dialog .request-detail-body').evaluate(e => e.scrollTop);
      assert.ok(scroll.top > 0 && scroll.left > 0 && detailScroll > 0, 'fixture must exercise genuine scroll offsets');
      const before = await snapshot(); await watchStableData('orders');
      await control({holds: ['workspace', 'orders-list', 'orders-detail']});
      await page.clock.fastForward(60001); await held('workspace'); await orderControls();
      await control({holds: ['orders-list', 'orders-detail']}); await held('orders-list');
      await orderControls();
      const listFinished = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/documents/purchase-orders' && response.status() === 200,
        () => control({holds: ['orders-detail']})); await listFinished.finished(); await held('orders-detail');
      const detailFinished = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/documents/purchase-orders/detail' && response.status() === 200,
        () => control({holds: []})); await detailFinished.finished();
      await waitFor(async () => !(await snapshot()).waiting.some(entry => entry.value > 0), 'background order refresh released');
      await freshOrderDetail(); await paint(); await orderControls(); await stopStableData('order read');
      assert.deepEqual(await page.locator('.desktop-grid-viewport').evaluate(e => ({top: e.scrollTop, left: e.scrollLeft})), scroll);
      assert.equal(await page.locator('.request-detail-dialog .request-detail-body').evaluate(e => e.scrollTop), detailScroll);
      const after = await snapshot();
      for (const route of ['/api/workspace', '/api/documents/purchase-orders', '/api/documents/purchase-orders/detail']) {
        const calls = after.calls.filter(call => call.path === route).length - before.calls.filter(call => call.path === route).length;
        assert.ok(calls >= 1 && calls <= 3, `${route}: one bounded periodic refresh must still happen`);
      }
      lifecycleEvidence.background.push({kind: 'orders', beforeAuthority: before.authorityVersion, afterAuthority: after.authorityVersion});
    });
    await run('I29 built real tab return masks orders until fresh workspace, list and detail complete', async () => {
      const other = await context.newPage();
      try {
        await other.goto('about:blank'); await control({holds: ['workspace', 'orders-list', 'orders-detail']});
        await activate(other, 'hidden'); await assertOrderMasked();
        await activate(other, 'visible'); await held('workspace'); await assertOrderMasked();
        await control({holds: ['orders-list', 'orders-detail']}); await held('orders-list'); await assertOrderMasked();
        await control({holds: ['orders-detail']}); await held('orders-detail');
        assert.equal(await page.locator('.request-detail-dialog .request-detail-body .desktop-detail-lines:visible').count(), 0);
        await control({holds: []}); await freshOrderDetail(); await orderControls();
      } finally {await control({holds: []}); await other.close();}
    });
    await run('I29 built 60s purchase refresh retains list, selection and controls while renewing command grants', async () => {
      await preparePurchase(); await purchaseControls();
      assert.equal(await purchaseEditor().getByLabel('Ghi chú', {exact: true}).isEnabled(), true);
      await purchaseEditor().getByLabel('Ghi chú', {exact: true}).fill('UNSAVED SYNTHETIC NOTE');
      await page.evaluate(() => window.scrollTo(0, 420));
      const scroll = await page.evaluate(() => scrollY); assert.ok(scroll > 0);
      const before = await counts(); await watchStableData('purchase');
      await control({commandAllowed: false, holds: ['workspace', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']});
      await page.clock.fastForward(60001); await held('workspace'); await purchaseControls();
      assert.equal(await purchaseEditor().getByLabel('Ghi chú', {exact: true}).isEnabled(), false, 'held parent workspace verification blocks new edits immediately');
      await assertPurchaseActionBlocked(page, 'Rà soát phiếu', true);
      await control({holds: ['purchase-bootstrap', 'purchase-list', 'purchase-detail']}); await held('purchase-bootstrap'); await purchaseControls();
      await control({holds: ['purchase-list', 'purchase-detail']}); await held('purchase-list'); await held('purchase-detail'); await purchaseControls();
      assert.equal(await purchaseEditor().getByLabel('Ghi chú', {exact: true}).isEnabled(), false, 'new edits must wait for fresh command grants while existing values remain mounted');
      const detailFinished = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 200,
        () => control({holds: []})); await detailFinished.finished();
      await assertPurchaseGrant(detailFinished, false);
      await purchaseEditor().getByText('Phiếu hiện chỉ được xem theo quyền của bạn.', {exact: true}).waitFor(); await paint();
      await stopStableData('purchase read'); await purchaseControls();
      assert.equal(await purchaseEditor().getByLabel('Ghi chú', {exact: true}).isEnabled(), false, 'fresh command denial must replace the old grant');
      assert.equal(await purchaseEditor().getByLabel('Ghi chú', {exact: true}).inputValue(), 'UNSAVED SYNTHETIC NOTE', 'background grants must not overwrite an unsaved draft');
      assert.equal(await page.evaluate(() => scrollY), scroll);
      const delta = difference(await counts(), before);
      for (const route of routes) assert.ok(delta[route] >= 1 && delta[route] <= 2, `${route}: unchanged-scope background read must refresh once, without a loop`);
      lifecycleEvidence.background.push({kind: 'purchase', requests: delta, commandGrant: 'revoked', unsavedDraft: 'retained'});
      const restoredDetail = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 200,
        async () => {await control({commandAllowed: true}); await page.clock.fastForward(60001);});
      await assertPurchaseGrant(restoredDetail, true);
      await waitFor(() => purchaseEditor().getByLabel('Ghi chú', {exact: true}).isEnabled(), 'restored command grant');
      assert.equal(await purchaseEditor().getByLabel('Ghi chú', {exact: true}).inputValue(), 'UNSAVED SYNTHETIC NOTE');
      await purchaseEditor().getByLabel('Ghi chú', {exact: true}).fill('SYNTHETIC NOTES');
      await paint();
    });
    await run('I29 built real tab return masks purchase editor until fresh authority and scoped data complete', async () => {
      const other = await context.newPage();
      try {
        await other.goto('about:blank'); await control({holds: ['workspace', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']});
        await activate(other, 'hidden'); await assertPurchaseMasked();
        await activate(other, 'visible'); await held('workspace'); await assertPurchaseMasked();
        await control({holds: ['purchase-bootstrap', 'purchase-list', 'purchase-detail']}); await held('purchase-bootstrap'); await assertPurchaseMasked();
        await control({holds: ['purchase-list', 'purchase-detail']}); await held('purchase-list'); await held('purchase-detail'); await assertPurchaseMasked();
        await control({holds: []}); await freshPurchaseDetail(); await purchaseControls();
      } finally {await control({holds: []}); await other.close();}
    });
    for (const action of ['save', 'submit']) {
      await run(`I29 built held parent workspace check keeps the form visible and blocks a new ${action}`, async () => {
        await preparePurchase();
        if (action === 'save') await purchaseEditor().getByLabel('Ghi chú', {exact: true}).fill('UNSAVED VERIFICATION NOTE');
        await purchaseFooterAction(page, 'Rà soát phiếu').click();
        const button = purchaseFooterAction(page, action === 'save' ? 'Lưu nháp trên ERP' : 'Gửi đề nghị');
        assert.equal(await button.isEnabled(), true);
        await page.evaluate(() => {window.i29ReviewForm = document.querySelector('form[aria-label="Đề nghị mua hàng trên điện thoại"]');});
        const before = (await snapshot()).calls.length; await control({holds: ['workspace']});
        await page.clock.fastForward(60001); await held('workspace'); await paint();
        const blockedButton = await assertPurchaseActionBlocked(page, action === 'save' ? 'Lưu nháp trên ERP' : 'Gửi đề nghị', true);
        assert.equal(await purchaseEditor().getByRole('form', {name: 'Đề nghị mua hàng trên điện thoại', exact: true}).isVisible(), true);
        assert.equal(await page.evaluate(() => window.i29ReviewForm === document.querySelector('form[aria-label="Đề nghị mua hàng trên điện thoại"]')), true);
        await blockedButton.evaluate(button => button.click());
        assert.equal((await snapshot()).calls.slice(before).filter(call => call.path === '/api/purchase-requests/save' || call.path === '/api/purchase-requests/submit').length, 0);
        const detailFinished = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 200,
          () => control({holds: []})); await detailFinished.finished();
        // A clean read revision may deliberately leave review mode; review the
        // newly read values before admitting a NEW Submit. Dirty Save retains it.
        const review = purchaseFooterAction(page, 'Rà soát phiếu');
        await waitFor(async () => await review.count() ? review.isEnabled() : button.isEnabled(), 'fresh grants verified');
        if (await review.count()) await review.click();
        await waitFor(() => button.isEnabled(), 'fresh reviewed grants allow the new command again');
        await purchaseFooterAction(page, 'Quay lại chỉnh sửa').click();
        if (action === 'save') await purchaseEditor().getByLabel('Ghi chú', {exact: true}).fill('SYNTHETIC NOTES');
        await paint();
      });
    }
    const beginPendingSave = async (commitOnAck = false) => {
      await preparePurchase(); await control({commitOnAck, holds: ['purchase-save']});
      const before = await snapshot();
      await purchaseEditor().getByLabel('Ghi chú', {exact: true}).fill('SYNTHETIC PENDING NOTE');
      await purchaseFooterAction(page, 'Rà soát phiếu').click();
      await purchaseFooterAction(page, 'Lưu nháp trên ERP').evaluate(button => {button.click(); button.click();});
      await held('purchase-save'); await purchaseEditor().getByText('Đang gửi yêu cầu…', {exact: true}).waitFor();
      const state = await snapshot();
      const writes = state.calls.slice(before.calls.length).filter(call => call.path === '/api/purchase-requests/save');
      assert.equal(writes.length, 1, 'double click must dispatch one original command');
      const original = writes[0]; const dto = JSON.parse(original.commandBody);
      assert.equal(dto.header.notes, 'SYNTHETIC PENDING NOTE'); assert.equal(dto.expectedStateToken, 'prs1.' + '1'.repeat(64));
      assert.equal(original.purchaseScope, 'c'.repeat(64));
      return {start: before.calls.length, effects: before.syntheticEffects, original, dto};
    };
    const assertPendingNoteVisible = async () => {
      // A confirmed ACK retains review mode until a fresh readback. Check the
      // actual visible note in either legitimate form state, not a textarea
      // that is intentionally absent from the review screen.
      const form = purchaseEditor().locator('form[aria-label="Đề nghị mua hàng trên điện thoại"]');
      const input = form.getByLabel('Ghi chú', {exact: true});
      if (await input.count()) {
        assert.equal(await input.isVisible(), true);
        assert.equal(await input.inputValue(), 'SYNTHETIC PENDING NOTE');
      } else {
        await form.getByText('SYNTHETIC PENDING NOTE', {exact: true}).waitFor();
      }
    };
    const assertVerifiedActionsBlocked = async hidden => {
      for (const name of ['Quay lại chỉnh sửa', 'Lưu nháp trên ERP', 'Gửi đề nghị']) {
        const button = await assertPurchaseActionBlocked(page, name, hidden);
        await button.evaluate(element => element.click());
      }
      assert.equal(await purchaseEditor().locator('input:enabled, textarea:enabled, select:enabled').count(), 0);
    };
    const assertOriginalCustody = async (pending, lookups, effects = 1) => {
      const state = await snapshot(); const calls = state.calls.slice(pending.start);
      const writes = calls.filter(call => call.path === '/api/purchase-requests/save');
      const reconciles = calls.filter(call => call.path === '/api/purchase-requests/save/lookup');
      assert.equal(writes.length, 1); assert.equal(reconciles.length, lookups);
      assert.equal(state.syntheticEffects, pending.effects + effects, 'only the expected synthetic business effect');
      for (const call of [...writes, ...reconciles]) {
        assert.equal(call.commandBody, pending.original.commandBody, 'reconciliation retains the exact original serialized JSON');
        assert.equal(call.sha256, pending.original.sha256); assert.equal(call.bytes, pending.original.bytes);
        assert.equal(JSON.parse(call.commandBody).idempotencyKey, pending.dto.idempotencyKey);
        assert.equal(JSON.parse(call.commandBody).expectedStateToken, 'prs1.' + '1'.repeat(64), 'fresh token 2 must not rebuild the pending intent');
      }
    };
    await run('I29 built pending save survives healthy 60s observation and grant checks without form reset or redispatch', async () => {
      const pending = await beginPendingSave(); await watchStableData('pending');
      await control({holds: ['purchase-save', 'workspace', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']});
      await page.clock.fastForward(60001); await held('workspace');
      await control({holds: ['purchase-save', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']}); await held('purchase-bootstrap');
      await control({holds: ['purchase-save', 'purchase-list', 'purchase-detail']}); await held('purchase-list'); await held('purchase-detail');
      const detailFinished = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 200,
        () => control({holds: ['purchase-save']})); await detailFinished.finished(); await paint();
      await stopStableData('pending save'); await purchaseEditor().getByText('Đang gửi yêu cầu…', {exact: true}).waitFor();
      await assertOriginalCustody(pending, 0);
      const ack = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/save' && response.status() === 200,
        () => control({holds: []})); await ack.finished();
      await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).waitFor();
      await assertPendingNoteVisible();
      await assertOriginalCustody(pending, 0);
      lifecycleEvidence.requests.push({kind: 'pending-healthy-background', writes: 1, effects: 1, lookups: 0, originalBodyHash: pending.original.sha256});
    });
    await run('I29 built pending ACK is accepted while the parent workspace check is still held', async () => {
      const pending = await beginPendingSave(); await watchStableData('pending');
      await control({holds: ['purchase-save', 'workspace']}); await page.clock.fastForward(60001); await held('workspace');
      const ack = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/save' && response.status() === 200,
        () => control({holds: ['workspace']})); await ack.finished();
      await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).waitFor();
      await assertPendingNoteVisible();
      await assertVerifiedActionsBlocked(true);
      await assertOriginalCustody(pending, 0);
      const detailFinished = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 200,
        () => control({holds: []})); await detailFinished.finished();
      await waitFor(() => purchaseEditor().getByLabel('Ghi chú', {exact: true}).isEnabled(), 'post-ACK parent and grant verification'); await paint();
      await stopStableData('ACK during parent verification'); await assertOriginalCustody(pending, 0);
      lifecycleEvidence.requests.push({kind: 'ack-during-parent-verification', writes: 1, effects: 1, lookups: 0, originalBodyHash: pending.original.sha256});
    });
    await run('I29 built ACK before stale background GET preserves the receipt and requests one fresh read', async () => {
      const pending = await beginPendingSave(true); const before = await counts(); await watchStableData('pending');
      await control({holds: ['purchase-save', 'workspace', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']});
      await page.clock.fastForward(60001); await held('workspace');
      await control({holds: ['purchase-save', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']}); await held('purchase-bootstrap');
      await control({holds: ['purchase-save', 'purchase-list', 'purchase-detail']}); await held('purchase-list'); await held('purchase-detail');
      await assertOriginalCustody(pending, 0, 0);
      // The fixture captured GET token 1 before committing; release only Save
      // so its token-2 ACK reaches the actual editor before those stale bodies.
      const ack = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/save' && response.status() === 200,
        () => control({holds: ['purchase-list', 'purchase-detail']})); await ack.finished();
      await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).waitFor();
      await assertOriginalCustody(pending, 0);
      let readsBefore;
      const staleDetail = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 200,
        async () => {readsBefore = await counts(); await control({holds: ['purchase-list', 'purchase-detail'], releaseHolds: ['purchase-list', 'purchase-detail']});});
      assert.equal((await staleDetail.json()).data.stateToken, 'prs1.' + '1'.repeat(64), 'the held reply must really predate the ACK');
      await waitFor(async () => (await counts())['/api/purchase-requests/detail'] > readsBefore['/api/purchase-requests/detail'], 'one bounded fresh read after superseded GET');
      await held('purchase-detail'); await paint();
      await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).waitFor();
      await assertPendingNoteVisible();
      await assertVerifiedActionsBlocked(true);
      assert.equal(await purchasePanel().getByRole('alert').count(), 0, 'superseded GET is not a fabricated outage');
      const freshDetail = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 200,
        () => control({holds: []})); assert.equal((await freshDetail.json()).data.stateToken, 'prs1.' + '2'.repeat(64));
      await waitFor(() => purchaseEditor().getByLabel('Ghi chú', {exact: true}).isEnabled(), 'post-ACK grant verified'); await paint();
      await stopStableData('ACK before old GET'); await assertOriginalCustody(pending, 0);
      await assertPendingNoteVisible();
      const delta = difference(await counts(), before);
      // I41 retries the superseded detail only. Keep the exact four-route
      // budget visible even if this assertion fails before result.json is saved.
      console.info(JSON.stringify({fixture: 'I29', scenario: 'ack-before-stale-get', requests: delta}));
      assert.deepEqual(delta, {'/api/workspace': 1, '/api/purchase-requests/workspace': 1,
        '/api/purchase-requests': 1, '/api/purchase-requests/detail': 2},
      'one stale detail plus one fresh detail; no repeated parent, bootstrap or list read');
      lifecycleEvidence.requests.push({kind: 'ack-before-stale-get', requests: delta, writes: 1, effects: 1, lookups: 0, originalBodyHash: pending.original.sha256});
    });
    await run('I29 built pending save plus background detail 503 masks data and reconciles the exact original intent once', async () => {
      const pending = await beginPendingSave(); await control({failures: {'purchase-detail': 503}});
      await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 503,
        () => page.clock.fastForward(60001));
      await waitFor(async () => !await purchaseEditor().isVisible(), 'pending detail error masks protected data');
      await control({holds: []}); await assertOriginalCustody(pending, 0);
      await control({failures: {}}); await page.clock.fastForward(60001); await freshPurchaseDetail();
      const reconcile = purchaseEditor().getByRole('button', {name: 'Kiểm tra kết quả yêu cầu gốc', exact: true});
      await reconcile.waitFor(); await assertOriginalCustody(pending, 0);
      await watchStableData('pending'); await control({holds: ['workspace']});
      await page.clock.fastForward(60001); await held('workspace'); await paint();
      assert.equal(await reconcile.isEnabled(), false, 'new reconciliation waits for the parent authority check');
      await reconcile.evaluate(button => button.click()); await assertOriginalCustody(pending, 0);
      const detailFinished = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 200,
        () => control({holds: []})); await detailFinished.finished(); await waitFor(() => reconcile.isEnabled(), 'reconcile grant restored');
      await stopStableData('unknown intent during parent verification');
      assert.equal(await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).count(), 0, 'retired ACK cannot resolve the retained unknown');
      await reconcile.click(); await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).waitFor();
      await assertOriginalCustody(pending, 1);
      await assertPendingNoteVisible();
      lifecycleEvidence.requests.push({kind: 'pending-detail-503', writes: 1, effects: 1, lookups: 1, originalBodyHash: pending.original.sha256});
    });
    await run('I29 built narrower child bootstrap masks a pending branch-excluded document before detail completes', async () => {
      const pending = await beginPendingSave();
      await control({holds: ['purchase-save', 'workspace', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']});
      await page.clock.fastForward(60001); await held('workspace');
      // Parent response was already captured with AB/read-scope-b. The child
      // must honor a later, narrower bootstrap even with the old parent DTO and
      // the SAME purchase scope. The blocked detail cannot rescue this check.
      await control({purchaseBranchIds: ['BR-B']});
      const parentResponse = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/workspace' && response.status() === 200,
        () => control({holds: ['purchase-save', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']}));
      assert.deepEqual((await parentResponse.json()).branchIds, ['BR-A', 'BR-B']);
      assert.equal(parentResponse.headers()['x-medcom-read-scope'], 'b'.repeat(64));
      await held('purchase-bootstrap');
      const bootstrap = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/workspace' && response.status() === 200,
        () => control({holds: ['purchase-save', 'purchase-list', 'purchase-detail']}));
      const admitted = await bootstrap.json();
      assert.equal(admitted.scopeKey, 'c'.repeat(64)); assert.deepEqual(admitted.data.branchIds, ['BR-B']);
      await waitFor(async () => !await purchaseEditor().isVisible(), 'narrowed bootstrap fences branch A before held detail');
      assert.equal(await purchasePanel().getByRole('button', {name: 'Mở đề nghị I29-PR-P2-00', exact: true}).count(), 0);
      assert.equal(await purchaseEditor().getByRole('button', {name: 'Kiểm tra kết quả yêu cầu gốc', exact: true}).count(), 0);
      await assertOriginalCustody(pending, 0);
      const recovery = workspaceRecoveryButton(page); await recovery.waitFor();
      const quiet = await counts(); await delay(500); assert.deepEqual(await counts(), quiet, 'narrowed bootstrap cannot create an automatic authority/read storm');
      await page.clock.fastForward(60001);
      await waitFor(async () => difference(await counts(), quiet)['/api/workspace'] >= 2, 'periodic probe and one branch-denial recheck');
      await recovery.waitFor(); await delay(500);
      const branchPeriodic = difference(await counts(), quiet);
      assert.deepEqual(branchPeriodic, {'/api/workspace': 2, '/api/purchase-requests/workspace': 1, '/api/purchase-requests': 0, '/api/purchase-requests/detail': 0}, 'one periodic probe plus one denial recheck; no excluded detail read');
      const periodicQuiet = await counts(); await delay(500); assert.deepEqual(await counts(), periodicQuiet, 'no self-triggered branch-denial retry after the bounded cycle');
      await assertOriginalCustody(pending, 0);
      await control({purchaseBranchIds: null, holds: []}); await recovery.click(); await freshPurchaseDetail();
      const reconcile = purchaseEditor().getByRole('button', {name: 'Kiểm tra kết quả yêu cầu gốc', exact: true});
      await reconcile.waitFor(); await assertOriginalCustody(pending, 0);
      assert.equal(await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).count(), 0);
      await reconcile.click(); await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).waitFor(); await assertOriginalCustody(pending, 1);
      lifecycleEvidence.requests.push({kind: 'child-bootstrap-branch-exclusion', writes: 1, effects: 1, lookups: 1, originalBodyHash: pending.original.sha256});
    });
    await run('I29 built read-scope-only grant revocation retains pending intent under the stable purchase scope', async () => {
      const pending = await beginPendingSave();
      await control({readScope: 'd'.repeat(64), commandAllowed: false, holds: ['purchase-save', 'workspace', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']});
      await page.clock.fastForward(60001); await held('workspace');
      await control({holds: ['purchase-save', 'purchase-bootstrap', 'purchase-list', 'purchase-detail']}); await held('purchase-bootstrap'); await assertPurchaseMasked();
      await control({holds: ['purchase-save', 'purchase-list', 'purchase-detail']}); await held('purchase-list'); await held('purchase-detail'); await assertPurchaseMasked();
      const revokedDetail = await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp/api/purchase-requests/detail' && response.status() === 200,
        async () => {await control({holds: []}); await freshPurchaseDetail();}); await assertPurchaseGrant(revokedDetail, false);
      await purchaseEditor().getByText('Phiếu hiện chỉ được xem theo quyền của bạn.', {exact: true}).waitFor(); await assertVerifiedActionsBlocked(false); await assertOriginalCustody(pending, 0);
      assert.equal(controls.purchaseScope, 'c'.repeat(64), 'production purchase scope does not rotate for read rights changes');
      assert.equal(await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).count(), 0);
      await purchaseEditor().getByRole('button', {name: 'Kiểm tra kết quả yêu cầu gốc', exact: true}).click();
      await purchaseEditor().getByText('Nháp đã được ERP xác nhận', {exact: true}).waitFor(); await assertOriginalCustody(pending, 1);
      lifecycleEvidence.requests.push({kind: 'read-scope-only-revocation', writes: 1, effects: 1, lookups: 1, originalBodyHash: pending.original.sha256});
    });
    for (const [kind, route] of [['purchase-bootstrap', '/api/purchase-requests/workspace'], ['purchase-list', '/api/purchase-requests'], ['purchase-detail', '/api/purchase-requests/detail']]) {
      await run(`I29 built persistent 403 at ${kind} cannot storm and explicit recovery is bounded`, async () => {
        await preparePurchase(); const before = await counts(); await control({failures: {[kind]: 403}});
        // The selected detail is modal. A real tab return refreshes its current
        // reads without clicking through the backdrop or dropping selection.
        const other = await context.newPage();
        try {
          await other.goto('about:blank'); await activate(other, 'hidden'); await assertPurchaseMasked();
          await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp' + route && response.status() === 403,
            () => activate(other, 'visible'));
        } finally {await other.close();}
        const recovery = workspaceRecoveryButton(page);
        await recovery.waitFor(); await assertPurchaseMasked();
        await delay(500); const settled = await counts(); await delay(500);
        assert.deepEqual(await counts(), settled, 'persistent 403 must not schedule automatic request retries');
        const initial = difference(settled, before);
        for (const count of Object.values(initial)) assert.ok(count <= 2, 'one denied read must not cascade into a workspace/purchase storm');
        // This is the in-flight denial case: make the selected detail start
        // before releasing list403. An earlier list denial may safely prevent
        // that request altogether; the separate React regression covers zero.
        if (kind === 'purchase-list') await control({holds: ['purchase-list', 'purchase-detail']});
        await page.clock.fastForward(60001);
        if (kind === 'purchase-list') {
          await held('purchase-list'); await held('purchase-detail');
          await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp' + route && response.status() === 403,
            () => control({holds: ['purchase-detail']}));
          await recovery.waitFor(); await assertPurchaseMasked();
          await control({holds: []});
        }
        await waitFor(async () => difference(await counts(), settled)['/api/workspace'] >= 2, 'periodic probe and one endpoint-denial recheck');
        await recovery.waitFor(); await delay(500);
        const periodic = difference(await counts(), settled);
        console.info(JSON.stringify({fixture: 'I29', scenario: 'persistent-403-periodic', kind, requests: periodic}));
        assert.equal(periodic['/api/workspace'], 2, 'one periodic workspace probe plus one denial recheck');
        assert.equal(periodic['/api/purchase-requests/workspace'], 1, 'one purchase bootstrap per periodic probe');
        assert.equal(periodic['/api/purchase-requests'], kind === 'purchase-bootstrap' ? 0 : 1);
        assert.equal(periodic['/api/purchase-requests/detail'], kind === 'purchase-bootstrap' ? 0 : 1);
        const periodicQuiet = await counts(); await delay(500); assert.deepEqual(await counts(), periodicQuiet, 'no immediate self-trigger loop after the bounded periodic cycle');
        await assertPurchaseMasked();
        const retryBefore = await counts();
        await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp' + route && response.status() === 403,
          () => recovery.click()); await recovery.waitFor(); await delay(500);
        const explicit = difference(await counts(), retryBefore);
        for (const count of Object.values(explicit)) assert.ok(count <= 2, 'one explicit denied recovery must remain bounded');
        const quiet = await counts(); await delay(500); assert.deepEqual(await counts(), quiet);
        await control({failures: {}}); const successBefore = await counts(); await recovery.click(); await freshPurchaseDetail();
        const recovered = difference(await counts(), successBefore);
        for (const count of Object.values(recovered)) assert.ok(count <= 2, 'one explicit healthy recovery must remain bounded');
        await purchaseControls(); lifecycleEvidence.requests.push({kind, initial, periodic, explicit, recovered});
      });
    }
    for (const [kind, route] of [['purchase-bootstrap', '/api/purchase-requests/workspace'], ['purchase-list', '/api/purchase-requests'], ['purchase-detail', '/api/purchase-requests/detail']]) {
      await run(`I29 built background 503 at ${kind} masks stale purchase data and recovers on fresh reads`, async () => {
        await preparePurchase();
        await purchaseEditor().getByLabel('Ghi chú', {exact: true}).fill('UNSAVED AFTER 503');
        await control({failures: {[kind]: 503}});
        await responseDuring(page, response => new URL(response.url()).pathname === '/api/erp' + route && response.status() === 503,
          () => page.clock.fastForward(60001)); await paint();
        await waitFor(async () => !await purchaseEditor().isVisible(), 'background failure masks purchase editor');
        assert.equal(await purchasePanel().getByRole('button', {name: /^Mở đề nghị I29-/}).count(), kind === 'purchase-detail' ? 20 : 0, 'a successful current list may remain when only its selected detail fails');
        await control({failures: {}}); await page.clock.fastForward(60001); await freshPurchaseDetail(); await purchaseControls();
        assert.equal(await purchaseEditor().getByLabel('Ghi chú', {exact: true}).inputValue(), 'UNSAVED AFTER 503');
        await purchaseEditor().getByLabel('Ghi chú', {exact: true}).fill('SYNTHETIC NOTES'); await paint();
      });
    }
    await run('I29 built changed read and purchase scopes clear old controls and selection', async () => {
      await prepareOrders(); await control({readScope: 'd'.repeat(64), branchIds: ['BR-B']});
      await page.clock.fastForward(60001);
      await waitFor(async () => await page.getByLabel('Tìm mã chứng từ', {exact: true}).inputValue() === '', 'order scope replacement');
      assert.equal(await page.getByRole('heading', {name: 'Đơn đặt hàng mua I29-PO-P2-00', exact: true}).count(), 0);
      assert.match(await page.getByRole('navigation', {name: 'Phân trang chứng từ', exact: true}).innerText(), /Trang 1/);
      await preparePurchase(); await control({purchaseScope: 'e'.repeat(64), readScope: 'f'.repeat(64), branchIds: ['BR-B']});
      await page.clock.fastForward(60001);
      await waitFor(async () => await purchasePanel().getByLabel('Tìm mã đề nghị', {exact: true}).inputValue() === '', 'purchase scope replacement');
      assert.equal(await purchaseEditor().isVisible(), false);
      assert.equal(await purchaseIdentity().isVisible(), false);
      assert.equal(await page.getByRole('dialog', {name: 'Phiếu mua hàng hiện có I29-PR-P2-00', exact: true}).or(page.getByRole('dialog', {name: 'Phiếu mua hàng hiện có', exact: true})).count(), 0, 'scope retirement must close the selected purchase dialog');
      assert.match(await purchasePanel().getByRole('navigation', {name: 'Phân trang đề nghị', exact: true}).innerText(), /Trang 1/);
    });
    await run('I29 built same-display-name session marker replacement retires purchase selection and filters', async () => {
      await preparePurchase(); await control({sessionScope: 'd'.repeat(64), readScope: 'e'.repeat(64), purchaseScope: 'f'.repeat(64)});
      await page.clock.fastForward(60001);
      await waitFor(async () => await purchasePanel().getByLabel('Tìm mã đề nghị', {exact: true}).inputValue() === '', 'session marker replacement');
      assert.equal(await purchaseEditor().isVisible(), false);
      assert.equal(await purchaseIdentity().isVisible(), false);
      assert.equal(await page.getByRole('dialog', {name: 'Phiếu mua hàng hiện có I29-PR-P2-00', exact: true}).or(page.getByRole('dialog', {name: 'Phiếu mua hàng hiện có', exact: true})).count(), 0, 'session retirement must close the selected purchase dialog');
    });
    await run('I29 built expiry fences selected purchase data until explicit login', async () => {
      await preparePurchase(); await control({expired: true}); await page.clock.fastForward(60001);
      await requireLoginGate(page);
      await assertPurchaseMasked(); await control({expired: false});
      const before = await counts(); await page.clock.fastForward(60001); await delay(200);
      assert.deepEqual(await counts(), before, 'retired expiry must not silently restore a live synthetic cookie');
      await submitFixtureLogin(await requireLoginGate(page));
      await purchasePanel().getByLabel('Tìm mã đề nghị', {exact: true}).waitFor();
      assert.equal(await purchasePanel().getByLabel('Tìm mã đề nghị', {exact: true}).inputValue(), '');
      assert.equal(await purchaseEditor().isVisible(), false);
      const observations = (await snapshot()).calls.filter(call => call.authorityVersion > 0).map(call => call.authorityVersion);
      assert.ok(observations.length > 20); assert.equal(new Set(observations).size, observations.length, 'every authenticated fixture request must receive a unique observation version');
      // Restore the original I28 screen and single row for its existing logout case.
      await control({extendedRows: false, branchIds: ['BR-A', 'BR-B'], sessionScope: 'a'.repeat(64), readScope: 'b'.repeat(64), purchaseScope: 'c'.repeat(64)});
      await page.goto(ready.publicOrigin + '/?screen=purchase-orders'); await page.locator('.mobile-document-card').waitFor({state: 'attached'});
      await page.setViewportSize({width: 390, height: 844});
    });
    await run('UI logout retires the cookie-backed session and denies a later read', async () => {
      await page.locator('.topbar .user-button').click();await page.getByRole('menuitem',{name:'Đăng xuất ERP',exact:true}).click();
      await requireLoginGate(page);
      const status = await page.evaluate(async()=> (await fetch('/api/erp/api/auth/session')).status);assert.equal(status,401);assert.equal((await snapshot()).loggedIn,false);
    });
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await writeFile(path.join(output,'result.json'),JSON.stringify({sourceRevision:process.env.SOURCE_REVISION,results,errors,external,browser:await browser.version(),
      actualBuiltApp:true,actualShippingRelay:true,lifecycleEvidence,api:'explicit synthetic HTTPS double',tls:'ephemeral fixture CA in Next child; exact leaf SPKI in isolated browser; no global trust changes',
      ownerCertificateTrust:'NOT_RUN',realSql:'NOT_RUN',productionAccepted:false},null,2));
  } catch (error) {
    const ui=await page?.evaluate(()=>({readyState:document.readyState,headings:[...document.querySelectorAll('h1')].map(heading=>heading.textContent),loginForms:[...document.querySelectorAll('form[aria-label="Đăng nhập ERP"]')].map(form=>({visible:form.getClientRects().length>0,busy:form.getAttribute('aria-busy'),submitDisabled:form.querySelector('button[type="submit"]')?.disabled})),dialogs:[...document.querySelectorAll('[role="dialog"]')].map(dialog=>({title:dialog.querySelector('[data-slot="dialog-title"]')?.textContent,buttons:[...dialog.querySelectorAll('button')].map(button=>({text:button.textContent?.slice(0,100),type:button.type,disabled:button.disabled}))}))})).catch(()=>null);
    console.error(JSON.stringify({fixture:'I28',errors,external,responses,ui,children:children.map(c=>({closed:c.closed,diagnostic:c.diagnostic})),pageUrl:page?.url()},null,2));throw error;
  } finally {t.signal.removeEventListener('abort',aborted);await cleanup();}
});
