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
import {verifyStandalone} from '../scripts/verify-standalone.mjs';

// Built modern app -> actual shipping TLS relay -> built BFF -> synthetic HTTPS
// API. Only this test process knows the ephemeral CA/leaf pin. Owner trust and
// real SQL/DLL/business acceptance are not inferred from this fixture.
test('I28 built mobile Workspace authenticates through actual local HTTPS relay and BFF', {timeout: 180000}, async t => {
  assert.equal(process.versions.node.split('.')[0], '24', 'I28 requires Node 24');
  const packageRoot = path.resolve(process.env.I28_PACKAGE_DIRECTORY ?? '');
  const fixtureDll = process.env.I28_FIXTURE_DLL;
  assert.ok(fixtureDll && process.env.I28_PACKAGE_DIRECTORY && /^[a-f0-9]{40}$/.test(process.env.SOURCE_REVISION ?? ''), 'I28 fixture/package/revision are required; no skip');
  const {manifest} = await verifyStandalone(packageRoot, {expectedRevision: process.env.SOURCE_REVISION, expectedPlatform: process.platform, expectedArch: process.arch});
  const require = createRequire(path.join(path.resolve(process.env.MEDCOM_BROWSER_TOOLCHAIN ?? ''), 'package.json'));
  const {chromium} = require('playwright-core');
  const directory = await mkdtemp(path.join(tmpdir(), 'medcom-i28-synthetic-'));
  const output = path.resolve('.test-runtime/i28-local-https'); await mkdir(output, {recursive: true}); await rm(path.join(output,'result.json'),{force:true});
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
  async function run(name, action) {let failure; await t.test(name, async () => {try {await action(); results.push({name, result: 'PASS'});} catch (error) {failure = error; throw error;}}); t.signal.throwIfAborted(); if (failure) throw failure;}
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
      await page.locator('.topbar .user-button').click();
      await page.getByRole('menuitem', {name: 'Đăng nhập ERP', exact: true}).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Tên đăng nhập', {exact: true}).fill('i28-user');
      await dialog.getByLabel('Mật khẩu', {exact: true}).fill('synthetic-i28-password');
      await dialog.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
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
      await assert.rejects(request(ready.apiOrigin+'/health/live',{certificate:false}),error=>/CERT|SELF_SIGNED|ISSUER/.test(error.code??''));
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
    await run('UI logout retires the cookie-backed session and denies a later read', async () => {
      await page.locator('.topbar .user-button').click();await page.getByRole('menuitem',{name:'Đăng xuất ERP',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.topbar .user-button')?.textContent.includes('Tài khoản ERP'));
      const status = await page.evaluate(async()=> (await fetch('/api/erp/api/auth/session')).status);assert.equal(status,401);assert.equal((await snapshot()).loggedIn,false);
    });
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    await writeFile(path.join(output,'result.json'),JSON.stringify({sourceRevision:process.env.SOURCE_REVISION,results,errors,external,browser:await browser.version(),
      actualBuiltApp:true,actualShippingRelay:true,api:'explicit synthetic HTTPS double',tls:'ephemeral fixture CA in Next child; exact leaf SPKI in isolated browser; no global trust changes',
      ownerCertificateTrust:'NOT_RUN',realSql:'NOT_RUN',productionAccepted:false},null,2));
  } catch (error) {
    const ui=await page?.evaluate(()=>({readyState:document.readyState,dialogs:[...document.querySelectorAll('[role="dialog"]')].map(dialog=>({title:dialog.querySelector('[data-slot="dialog-title"]')?.textContent,buttons:[...dialog.querySelectorAll('button')].map(button=>({text:button.textContent?.slice(0,100),type:button.type,disabled:button.disabled}))}))})).catch(()=>null);
    console.error(JSON.stringify({fixture:'I28',errors,external,responses,ui,children:children.map(c=>({closed:c.closed,diagnostic:c.diagnostic})),pageUrl:page?.url()},null,2));throw error;
  } finally {t.signal.removeEventListener('abort',aborted);await cleanup();}
});
