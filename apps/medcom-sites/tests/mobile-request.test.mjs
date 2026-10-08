import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Explicit local test seam. No browser download, installer or production upstream.
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').replaceAll('\\', '/');
const output = path.join(app, '.test-runtime', 'i12-mobile-request-review-v3');
await mkdir(output, {recursive: true});
const nodeBundle = path.join(output, 'component.mjs');
await build({absWorkingDir: app, entryPoints: ['components/erp/mobile-request.tsx'], outfile: nodeBundle.replaceAll('\\', '/'), bundle: true, platform: 'node', format: 'esm', packages: 'external', alias: {'@': app}, jsx: 'automatic', logLevel: 'warning'});
const {validatePurchaseRequest} = await import(pathToFileURL(nodeBundle).href);

const access = {scopeKey: 'synthetic-session-a', canRead: true, canEdit: true, canSaveDraft: true, canSubmit: true, available: true, branches: [{id: 'QA-B', label: 'Chi nhánh tổng hợp'}], currencies: [{id: 'VND', label: 'VND'}], purposes: [{id: '1', label: 'Mục đích tổng hợp'}], maxNotesLength: 2000, maxPurposeLength: 2000, maxLines: 2, itemLookupId: 'qa-item', objectLookupId: 'qa-object'};
const values = {purchaseDate: '2026-10-06', personSuggest: 'SYNTHETIC SESSION A', department: 'Phòng tổng hợp', purposeId: '1', purposeDescOrClient: '', notes: '', branchId: 'QA-B', currencyId: 'VND', objectId: 'QA-OBJECT', objectLabel: 'Đối tượng tổng hợp', lines: [{localKey: 'qa-line', lineId: null, itemId: 'QA-ITEM', itemLabel: 'Mặt hàng tổng hợp', quantity: '999999999999999999', unitPrice: '1', budget: '', timeRequired: '', model: ''}]};
const initial = {documentId: null, version: null, confirmation: null, status: null, values};

test('source-shaped integer precision and supplied descriptor bounds, without invented positivity', () => {
  assert.deepEqual(validatePurchaseRequest(values, access), {});
  for (const quantity of ['9999999999999999999', '1.5', '1e3', ' 1', '']) {
    assert.ok(validatePurchaseRequest({...values, lines: [{...values.lines[0], quantity}]}, access)['lines.qa-line.quantity'], quantity);
  }
  for (const quantity of ['-999999999999999999', '0', '000000000000000000000000001']) assert.deepEqual(validatePurchaseRequest({...values, lines: [{...values.lines[0], quantity}]}, access), {});
  assert.ok(validatePurchaseRequest({...values, purchaseDate: '2026-02-31'}, access).purchaseDate);
  assert.ok(validatePurchaseRequest({...values, notes: 'x'.repeat(2001)}, access).notes);
  assert.ok(validatePurchaseRequest(values, {...access, branches: []}).branchId);
  assert.ok(validatePurchaseRequest({...values, lines: [values.lines[0], values.lines[0]]}, access).lines);
});

const fixtureSource = `
import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MobileRequest} from './components/erp/mobile-request';
import {NavigationGuardProvider, useNavigationGuard} from './components/erp/navigation-guard';
const original=${JSON.stringify({initial, access})};
window.qaCalls={execute:[],reconcile:[],aborted:0,lookups:[]};
function snapshot(intent){return {documentId:intent.documentId||'SYNTHETIC-REQ',version:'synthetic-v2',confirmation:intent.action==='submit'?'submitted':'draft',status:{id:'synthetic-only',label:'Trạng thái tổng hợp'},values:structuredClone(intent.values)};}
function App(){
 const [config,setConfig]=useState({...structuredClone(original),resetId:0,mode:'confirmed',delay:0,adapterPresent:true,callbackThrows:false});
 const adapter=useMemo(()=>({
  lookup:async(id,query,signal)=>{window.qaCalls.lookups.push({id,query});return {items:[{id:id==='qa-item'?'QA-ITEM-2':'QA-OBJECT-2',label:id==='qa-item'?'Mặt hàng tổng hợp 2':'Đối tượng tổng hợp 2'}],hasMore:false};},
  execute:async(intent,signal)=>{
   const recording=window.qaCalls;
   recording.execute.push({intent:structuredClone(intent),frozen:Object.isFrozen(intent)&&Object.isFrozen(intent.values)&&Object.isFrozen(intent.values.lines)&&intent.values.lines.every(Object.isFrozen)});
   if(config.mode==='controlled')await new Promise(resolve=>{window.qaCompleteExecute=resolve;});
   signal.addEventListener('abort',()=>recording.aborted++);
   await new Promise(resolve=>setTimeout(resolve,config.delay));
   if(config.mode==='throw')throw Error('synthetic lost acknowledgment');
   if(config.mode==='rejected')return {intentId:intent.intentId,kind:'rejected',message:'Dịch vụ tổng hợp từ chối',fieldErrors:{['lines.'+intent.values.lines[0].localKey+'.quantity']:'Số lượng bị dịch vụ từ chối'}};
   if(config.mode==='conflict')return {intentId:intent.intentId,kind:'conflict',message:'Xung đột tổng hợp',current:{...snapshot(intent),values:{...intent.values,department:'BẢN ERP TỔNG HỢP'}}};
   if(config.mode==='malformed')return {intentId:intent.intentId,kind:'confirmed',action:intent.action,receiptId:'synthetic-receipt',snapshot:{...snapshot(intent),values:null}};
   if(config.mode==='wrongIntent')return {intentId:'different-synthetic-intent',kind:'confirmed',action:intent.action,receiptId:'synthetic-receipt',snapshot:snapshot(intent)};
   if(config.mode==='wrongAction')return {intentId:intent.intentId,kind:'confirmed',action:intent.action==='submit'?'saveDraft':'submit',receiptId:'synthetic-receipt',snapshot:snapshot(intent)};
   return {intentId:intent.intentId,kind:'confirmed',action:intent.action,receiptId:'synthetic-receipt',snapshot:snapshot(intent)};
  },
  reconcile:async(intent,signal)=>{window.qaCalls.reconcile.push(structuredClone(intent));return {intentId:intent.intentId,kind:'confirmed',action:intent.action,receiptId:'synthetic-original-receipt',snapshot:snapshot(intent)};}
 }),[config.mode,config.delay]);
 window.qa={reset:patch=>{window.qaCalls={execute:[],reconcile:[],aborted:0,lookups:[]};setConfig(old=>({...structuredClone(original),resetId:old.resetId+1,mode:'confirmed',delay:0,adapterPresent:true,callbackThrows:false,...patch}));},scope:()=>setConfig(old=>({...old,access:{...old.access,scopeKey:'synthetic-session-b'},initial:{...old.initial,values:{...old.initial.values,personSuggest:'SYNTHETIC SESSION B',department:'SESSION B ONLY'}}})),revoke:()=>setConfig(old=>({...old,access:{...old.access,canRead:false,canEdit:false,canSaveDraft:false,canSubmit:false}})),refreshChoices:()=>setConfig(old=>({...old,access:{...old.access,branches:[...old.access.branches,{id:'QA-OTHER',label:'Chi nhánh bổ sung tổng hợp'}]}})),selectDocument:(id,marker)=>setConfig(old=>({...old,initial:{...structuredClone(original.initial),documentId:id,version:'version-'+id,confirmation:'draft',values:{...structuredClone(original.initial.values),personSuggest:marker,department:marker}}}))};
 return <NavigationGuardProvider><MobileRequest key={config.resetId} initial={config.initial} access={config.access} adapter={config.adapterPresent?adapter:undefined} onConfirmed={()=>{if(config.callbackThrows)throw Error('synthetic parent callback');}}/><Leave/></NavigationGuardProvider>;
}
function Leave(){const guard=useNavigationGuard();return <button id='qa-leave' onClick={()=>guard.request(()=>{})}>Synthetic navigation</button>;}
createRoot(document.getElementById('root')).render(<App/>);
`;

test('actual mobile component interactions and adversarial async states in installed Edge', {timeout: 180000}, async t => {
  const qaRoot = process.env.MEDCOM_BROWSER_TOOLCHAIN;
  let chromium;
  try {({chromium} = (qaRoot ? createRequire(path.join(path.resolve(qaRoot), 'package.json')) : createRequire(import.meta.url))('playwright-core'));}
  catch {throw Error('Installed playwright-core unavailable; set MEDCOM_BROWSER_TOOLCHAIN to the existing I05 harness directory. No install attempted.');}
  const built = await build({stdin: {contents: fixtureSource, resolveDir: app, loader: 'tsx'}, bundle: true, platform: 'browser', format: 'iife', write: false, alias: {'@': app}, jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'}, logLevel: 'warning'});
  const bundle = built.outputFiles[0].contents;
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic I12 component QA</title><style>body{margin:0;font:16px system-ui;background:white;color:#18181b}button{min-height:44px;white-space:normal}button:disabled{opacity:.5}*{box-sizing:border-box}[role=dialog],[role=alertdialog]{position:fixed;top:5%;left:3%;z-index:51;width:94vw;background:white;border:1px solid #aaa;padding:16px;max-width:95vw}[data-slot=dialog-overlay],[data-slot=alert-dialog-overlay]{position:fixed;inset:0;z-index:50;background:#0004}input{max-width:100%}</style><div id="root"></div><script src="/fixture.js"></script></html>`;
  const server = createServer((request, response) => {response.setHeader('Content-Type', request.url === '/fixture.js' ? 'application/javascript' : 'text/html; charset=utf-8'); response.end(request.url === '/fixture.js' ? bundle : html);});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  let browser, context, page;
  const browserErrors = [];
  try {
    browser = await chromium.launch({executablePath: process.env.MEDCOM_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-default-apps', '--no-default-browser-check']});
    context = await browser.newContext({viewport: {width: 390, height: 844}});
    const origin = `http://127.0.0.1:${server.address().port}`;
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    page = await context.newPage(); page.setDefaultTimeout(5000); page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto(origin); await page.getByRole('heading', {name: 'Đề nghị mua hàng', exact: true}).waitFor();
    const reset = async patch => {await page.evaluate(patch => window.qa.reset(patch), patch || {}); await page.waitForTimeout(30);};
    const calls = () => page.evaluate(() => structuredClone(window.qaCalls));
    const review = () => page.getByRole('button', {name: 'Rà soát phiếu', exact: true}).click();
    const send = () => page.getByRole('button', {name: 'Gửi đề nghị', exact: true});

    await t.test('missing adapter and denied access fail closed', async () => {
      await reset({adapterPresent: false}); assert.equal(await page.locator('input,textarea,select').count(), 0); assert.equal((await calls()).execute.length, 0);
      await reset({access: {...access, canRead: false}}); assert.equal(await page.locator('input,textarea,select').count(), 0);
      await reset({access: {...access, canEdit: false, canSaveDraft: false, canSubmit: false}}); assert.ok(await page.getByRole('button', {name: 'Rà soát phiếu'}).isDisabled());
    });
    await t.test('source field validation preserves input and focuses a real invalid control', async () => {
      await reset(); await page.getByLabel('Phòng ban *', {exact: true}).fill(''); await review();
      assert.match(await page.locator('body').innerText(), /Kiểm tra các trường/); await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'department'); assert.equal(await page.locator(':focus').getAttribute('name'), 'department'); assert.equal((await calls()).execute.length, 0);
      await page.getByLabel('Phòng ban *', {exact: true}).fill('Phòng giữ nguyên'); await page.getByLabel('Số lượng *', {exact: true}).fill('1.5'); await review(); assert.match(await page.locator('body').innerText(), /Nhập số nguyên chính xác/);
      assert.equal(await page.getByLabel('Phòng ban *', {exact: true}).inputValue(), 'Phòng giữ nguyên');
    });
    await t.test('line cards add/remove within the supplied limit and perform actual remote lookup', async () => {
      await reset(); await page.getByRole('button', {name: 'Thêm dòng hàng'}).click(); assert.equal(await page.getByRole('article').count(), 2); assert.ok(await page.getByRole('button', {name: 'Thêm dòng hàng'}).isDisabled());
      await page.getByRole('article', {name: 'Dòng hàng 2', exact: true}).getByLabel('Số lượng *', {exact: true}).fill('2');
      const lineValues = () => page.locator('article').evaluateAll(articles => articles.map(article => Array.from(article.querySelectorAll('input'), input => ({name: input.name, value: input.value}))));
      const retainedValues = await lineValues();
      const remove = page.getByRole('button', {name: 'Bỏ dòng 2', exact: true}), confirmation = page.getByRole('alertdialog');
      await remove.click(); await confirmation.waitFor();
      // Modal isolation hides the background from the accessibility tree, not from editor custody.
      assert.equal(await page.getByRole('article', {includeHidden: true}).count(), 2, 'Line is retained until confirmation');
      assert.deepEqual(await lineValues(), retainedValues); assert.equal((await calls()).execute.length, 0);
      await confirmation.getByRole('button', {name: 'Giữ dòng', exact: true}).click(); await confirmation.waitFor({state: 'hidden'});
      assert.equal(await page.getByRole('article').count(), 2, 'Cancel keeps both editable lines'); assert.deepEqual(await lineValues(), retainedValues);
      await remove.click(); await confirmation.waitFor();
      assert.equal(await page.getByRole('article', {includeHidden: true}).count(), 2); assert.deepEqual(await lineValues(), retainedValues);
      await confirmation.getByRole('button', {name: 'Xóa dòng', exact: true}).click(); await confirmation.waitFor({state: 'hidden'});
      assert.equal(await page.getByRole('article').count(), 1); assert.deepEqual(await lineValues(), [retainedValues[0]]); assert.equal((await calls()).execute.length, 0);
      await page.getByRole('button', {name: 'Mặt hàng dòng 1', exact: true}).click(); await page.getByRole('option', {name: /Mặt hàng tổng hợp 2/}).click();
      assert.match(await page.locator('body').innerText(), /Mặt hàng tổng hợp 2/); assert.equal((await calls()).lookups.at(-1).id, 'qa-item');
    });
    await t.test('review and double submit use one frozen intent, preserving 18-digit strings', async () => {
      await reset({delay: 150}); await review(); await send().evaluate(button => {button.click(); button.click();});
      await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).waitFor(); const recorded = await calls(); assert.equal(recorded.execute.length, 1); assert.equal(recorded.execute[0].intent.values.lines[0].quantity, '999999999999999999'); assert.equal(recorded.execute[0].intent.documentId, null); assert.equal(recorded.execute[0].intent.expectedVersion, null); assert.ok(recorded.execute[0].frozen); assert.ok(await send().isDisabled());
    });
    await t.test('a confirmed unchanged draft can be submitted without fabricating a dirty edit', async () => {
      await reset({initial: {...initial, documentId: 'SYNTHETIC-DRAFT', version: 'synthetic-v1', confirmation: 'draft'}}); await review();
      assert.ok(await page.getByRole('button', {name: 'Lưu nháp trên ERP'}).isDisabled()); assert.ok(await send().isEnabled()); await send().click(); await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).waitFor(); assert.equal((await calls()).execute[0].intent.expectedVersion, 'synthetic-v1');
    });
    await t.test('draft acknowledgment and submit acknowledgment have distinct truthful labels', async () => {
      await reset(); await review(); await page.getByRole('button', {name: 'Lưu nháp trên ERP'}).click(); await page.getByText('Nháp đã được ERP xác nhận', {exact: true}).waitFor(); assert.equal(await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).count(), 0);
    });
    await t.test('rejection retains input and maps server line errors without a success claim', async () => {
      await reset({mode: 'rejected'}); await page.getByLabel('Phòng ban *').fill('GIỮ NỘI DUNG'); await review(); await send().click(); await page.getByText('Số lượng bị dịch vụ từ chối', {exact: true}).waitFor();
      assert.equal(await page.getByLabel('Phòng ban *').inputValue(), 'GIỮ NỘI DUNG'); assert.equal(await page.getByLabel('Số lượng *').inputValue(), '999999999999999999'); assert.equal(await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).count(), 0);
    });
    await t.test('conflict retains draft until explicit discard and authoritative reload', async () => {
      await reset({mode: 'conflict'}); await page.getByLabel('Phòng ban *').fill('NỘI DUNG CHƯA LƯU'); await review(); await send().click(); await page.getByText('Xung đột tổng hợp', {exact: true}).waitFor();
      assert.equal(await page.getByText('NỘI DUNG CHƯA LƯU', {exact: true}).count(), 1); assert.ok(await send().isDisabled());
      await page.getByRole('button', {name: 'Tải bản ERP và bỏ nội dung đang nhập'}).click(); assert.equal(await page.getByLabel('Phòng ban *').inputValue(), 'BẢN ERP TỔNG HỢP'); assert.equal((await calls()).execute.length, 1);
    });
    await t.test('lost acknowledgment reconciles the original immutable intent without automatic resubmission', async () => {
      await reset({mode: 'throw'}); await review(); await send().click(); await page.getByText('Chưa xác nhận kết quả', {exact: true}).waitFor(); assert.ok(await send().isDisabled());
      await page.getByRole('button', {name: 'Kiểm tra kết quả yêu cầu gốc'}).click(); await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).waitFor(); const recorded = await calls(); assert.equal(recorded.execute.length, 1); assert.equal(recorded.reconcile.length, 1); assert.deepEqual(recorded.reconcile[0], recorded.execute[0].intent);
    });
    await t.test('same-scope choice refresh retains unknown intent and blocks replacement dispatch', async () => {
      await reset({mode: 'throw'}); await review(); await send().click(); await page.getByText('Chưa xác nhận kết quả', {exact: true}).waitFor();
      const original = (await calls()).execute[0].intent;
      await page.evaluate(() => window.qa.refreshChoices()); await page.getByText('Chưa xác nhận kết quả', {exact: true}).waitFor();
      assert.ok(await send().isDisabled()); await send().evaluate(button => button.click()); assert.equal((await calls()).execute.length, 1); assert.equal((await calls()).reconcile.length, 0);
      await page.getByRole('button', {name: 'Kiểm tra kết quả yêu cầu gốc'}).click(); await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).waitFor();
      assert.deepEqual((await calls()).reconcile[0], original); assert.equal((await calls()).execute.length, 1);
    });
    await t.test('same-scope document identity change replaces fields and binds execution to the new document', async () => {
      await reset({initial: {...initial, documentId: 'QA-DOC-A', version: 'version-QA-DOC-A', confirmation: 'draft', values: {...values, department: 'OLD DOCUMENT A INPUT'}}});
      assert.equal(await page.getByLabel('Phòng ban *').inputValue(), 'OLD DOCUMENT A INPUT');
      await page.evaluate(() => window.qa.selectDocument('QA-DOC-B', 'NEW DOCUMENT B INPUT'));
      await page.waitForFunction(() => document.querySelector('input[name=department]')?.value === 'NEW DOCUMENT B INPUT');
      assert.equal(await page.getByLabel('Người đề nghị *').inputValue(), 'NEW DOCUMENT B INPUT'); assert.doesNotMatch(await page.locator('body').innerText(), /OLD DOCUMENT A INPUT/);
      await review(); await send().click(); await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).waitFor();
      const recorded = (await calls()).execute[0].intent; assert.equal(recorded.documentId, 'QA-DOC-B'); assert.equal(recorded.expectedVersion, 'version-QA-DOC-B'); assert.equal(recorded.values.department, 'NEW DOCUMENT B INPUT');
    });
    await t.test('document switch during unknown outcome hides old input and requires original reconciliation before opening the new document', async () => {
      await reset({mode: 'throw', initial: {...initial, documentId: 'QA-DOC-A', version: 'version-QA-DOC-A', confirmation: 'draft', values: {...values, department: 'OLD UNKNOWN DOCUMENT A INPUT'}}});
      await review(); await send().click(); await page.getByText('Chưa xác nhận kết quả', {exact: true}).waitFor(); const original = (await calls()).execute[0].intent;
      await page.evaluate(() => window.qa.selectDocument('QA-DOC-B', 'QUEUED DOCUMENT B INPUT'));
      await page.getByText('Phiếu trước chưa được xác nhận. Kiểm tra yêu cầu gốc trước khi mở phiếu khác.', {exact: true}).waitFor();
      assert.equal(await page.locator('input,textarea,select,article').count(), 0); assert.doesNotMatch(await page.locator('body').innerText(), /OLD UNKNOWN DOCUMENT A INPUT/); assert.equal(await send().count(), 0); assert.equal((await calls()).execute.length, 1);
      await page.getByRole('button', {name: 'Kiểm tra kết quả yêu cầu gốc'}).click(); await page.getByLabel('Phòng ban *').waitFor();
      assert.equal(await page.getByLabel('Phòng ban *').inputValue(), 'QUEUED DOCUMENT B INPUT'); assert.doesNotMatch(await page.locator('body').innerText(), /OLD UNKNOWN DOCUMENT A INPUT|ERP đã xác nhận gửi phiếu/);
      const recorded = await calls(); assert.equal(recorded.execute.length, 1); assert.deepEqual(recorded.reconcile[0], original); assert.equal(recorded.reconcile[0].documentId, 'QA-DOC-A');
    });
    await t.test('late pending acknowledgment cannot apply previous-document values or status to a new selection', async () => {
      await reset({delay: 200, initial: {...initial, documentId: 'QA-DOC-A', version: 'version-QA-DOC-A', confirmation: 'draft', values: {...values, department: 'OLD PENDING DOCUMENT A INPUT'}}});
      await review(); await send().click(); await page.evaluate(() => window.qa.selectDocument('QA-DOC-B', 'PENDING DOCUMENT B INPUT'));
      await page.getByText('Đang chờ kết quả phiếu trước…', {exact: true}).waitFor(); assert.equal(await page.locator('input,textarea,select,article').count(), 0);
      await page.getByLabel('Phòng ban *').waitFor(); assert.equal(await page.getByLabel('Phòng ban *').inputValue(), 'PENDING DOCUMENT B INPUT');
      assert.doesNotMatch(await page.locator('body').innerText(), /OLD PENDING DOCUMENT A INPUT|ERP đã xác nhận gửi phiếu/); assert.equal((await calls()).execute.length, 1); assert.equal((await calls()).execute[0].intent.documentId, 'QA-DOC-A');
    });
    const returnToOriginalDocument = async () => {
      await page.evaluate(() => window.qa.selectDocument('QA-DOC-B', 'TEMPORARY DOCUMENT B INPUT'));
      await page.getByRole('region', {name: 'Chờ xác nhận phiếu trước'}).waitFor();
      await page.evaluate(async () => {window.qa.selectDocument('QA-DOC-A', 'STALE RETURN A SNAPSHOT'); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));});
      assert.equal(await page.locator('input,textarea,select,article').count(), 0);
    };
    const assertAuthoritativeReturnedDocument = async (action, marker) => {
      await page.getByText(action === 'submit' ? 'ERP đã xác nhận gửi phiếu' : 'Nháp đã được ERP xác nhận', {exact: true}).waitFor();
      assert.equal(await page.getByLabel('Phòng ban *').inputValue(), marker);
      const recorded = await calls(); assert.equal(recorded.execute.length, 1); assert.equal(recorded.execute[0].intent.expectedVersion, 'version-QA-DOC-A');
      if (action === 'submit') {
        assert.ok(await page.getByLabel('Phòng ban *').isDisabled()); assert.ok(await page.getByRole('button', {name: 'Rà soát phiếu', exact: true}).isDisabled());
        await page.locator('form').evaluate(form => form.requestSubmit()); assert.equal(await send().count(), 0); assert.equal((await calls()).execute.length, 1);
      } else {
        await review(); await send().click();
        const submitted = (await calls()).execute[1].intent; assert.equal(submitted.documentId, 'QA-DOC-A'); assert.equal(submitted.expectedVersion, 'synthetic-v2'); assert.equal(submitted.values.department, marker);
        assert.notEqual(submitted.intentId, recorded.execute[0].intent.intentId);
      }
    };
    await t.test('pending A to B to A keeps the authoritative acknowledgment, version and submitted lock', async () => {
      for (const action of ['submit', 'saveDraft']) {
        const marker = 'AUTHORITATIVE PENDING A ' + action;
        await reset({mode: 'controlled', initial: {...initial, documentId: 'QA-DOC-A', version: 'version-QA-DOC-A', confirmation: 'draft'}});
        await page.getByLabel('Phòng ban *').fill(marker); await review(); await (action === 'submit' ? send() : page.getByRole('button', {name: 'Lưu nháp trên ERP'})).click();
        await returnToOriginalDocument(); await page.evaluate(() => window.qaCompleteExecute());
        await assertAuthoritativeReturnedDocument(action, marker); assert.equal((await calls()).reconcile.length, 0);
        if (action === 'saveDraft') {await page.evaluate(() => window.qaCompleteExecute()); await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).waitFor();}
      }
    });
    await t.test('unknown A to B to A keeps the authoritative reconciliation, version and submitted lock', async () => {
      for (const action of ['submit', 'saveDraft']) {
        const marker = 'AUTHORITATIVE RECONCILED A ' + action;
        await reset({mode: 'throw', initial: {...initial, documentId: 'QA-DOC-A', version: 'version-QA-DOC-A', confirmation: 'draft'}});
        await page.getByLabel('Phòng ban *').fill(marker); await review(); await (action === 'submit' ? send() : page.getByRole('button', {name: 'Lưu nháp trên ERP'})).click();
        await page.getByText('Chưa xác nhận kết quả', {exact: true}).waitFor(); const original = (await calls()).execute[0].intent;
        await returnToOriginalDocument(); await page.getByRole('button', {name: 'Kiểm tra kết quả yêu cầu gốc'}).click();
        await assertAuthoritativeReturnedDocument(action, marker); assert.deepEqual((await calls()).reconcile, [original]);
        if (action === 'saveDraft') await page.getByText('Chưa xác nhận kết quả', {exact: true}).waitFor();
      }
    });
    await t.test('malformed or mismatched acknowledgment never reports success', async () => {
      for (const mode of ['malformed', 'wrongIntent', 'wrongAction']) {await reset({mode}); await review(); await send().click(); await page.getByText('Chưa xác nhận kết quả', {exact: true}).waitFor(); assert.equal(await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).count(), 0); assert.equal((await calls()).execute.length, 1);}
    });
    await t.test('scope switch fences a late response and retires the previous session input', async () => {
      await reset({delay: 300}); await page.getByLabel('Phòng ban *').fill('SYNTHETIC OLD PRIVATE INPUT'); await review(); await send().click(); await page.evaluate(() => window.qa.scope());
      await page.waitForTimeout(400); assert.equal(await page.getByLabel('Người đề nghị *').inputValue(), 'SYNTHETIC SESSION B'); assert.equal(await page.getByLabel('Phòng ban *').inputValue(), 'SESSION B ONLY'); assert.doesNotMatch(await page.locator('body').innerText(), /SYNTHETIC OLD PRIVATE INPUT|ERP đã xác nhận gửi phiếu/); assert.equal((await calls()).aborted, 1);
    });
    await t.test('revocation during execution clears all form data and cannot be revived', async () => {
      await reset({delay: 200}); await review(); await send().click(); await page.evaluate(() => window.qa.revoke()); await page.waitForTimeout(300); assert.equal(await page.locator('input,textarea,select,article').count(), 0); assert.doesNotMatch(await page.locator('body').innerText(), /SYNTHETIC-REQ|ERP đã xác nhận gửi phiếu/);
    });
    await t.test('parent callback failure cannot turn a confirmed result into unknown', async () => {
      await reset({callbackThrows: true}); await review(); await send().click(); await page.getByText('ERP đã xác nhận gửi phiếu', {exact: true}).waitFor(); assert.equal(await page.getByRole('button', {name: 'Kiểm tra kết quả yêu cầu gốc'}).count(), 0);
    });
    await t.test('dirty navigation uses the existing real guard and mobile controls fit at 390px', async () => {
      await reset(); await page.getByLabel('Phòng ban *').fill('Thay đổi tổng hợp'); await page.locator('#qa-leave').click(); await page.getByRole('alertdialog').waitFor(); await page.getByRole('button', {name: 'Tiếp tục làm việc'}).click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); assert.ok((await page.getByRole('button', {name: 'Rà soát phiếu'}).boundingBox()).height >= 44); await page.getByLabel('Người đề nghị *').focus(); await page.keyboard.press('Tab'); assert.equal(await page.locator(':focus').getAttribute('name'), 'department'); await page.screenshot({path: path.join(output, 'synthetic-mobile-editor.png'), fullPage: true});
    });
    assert.deepEqual(browserErrors, []);
    await writeFile(path.join(output, 'browser-result.json'), JSON.stringify({node: process.version, browser: browser.version(), viewport: {width: 390, height: 844}, browserErrors, scope: 'Actual React components and installed Edge, loopback-only synthetic adapters. No HTTP/ERP binding, BFF/ASP.NET/SQL/Tools, production or whole-workflow acceptance.'}, null, 2));
  } finally {
    await context?.close(); await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
});

// Node/React contract coverage of the production editor, line controls and delete
// confirmation. Only portal/focus primitives are replaced; this is not browser QA.
test('I58 actual purchase editor restricts structural changes to the generic profile', async t => {
  const require = createRequire(import.meta.url), React = require('react'), {create, act} = require('react-test-renderer');
  assert.equal(React.version, '19.2.6'); assert.equal(require('react-test-renderer/package.json').version, '19.2.6');
  const names = ['AlertDialog', 'AlertDialogContent', 'AlertDialogHeader', 'AlertDialogTitle', 'AlertDialogDescription', 'AlertDialogFooter', 'AlertDialogCancel', 'AlertDialogAction'];
  const primitives = "import React from 'react';" + names.map(name => `export function ${name}({children,...props}){return React.createElement('${name === 'AlertDialogAction' || name === 'AlertDialogCancel' ? 'button' : 'div'}',props,children);}`).join('');
  const compiled = path.join(output, 'i58-editor.cjs');
  await build({stdin: {contents: "export {MobileRequest} from './components/erp/mobile-request'; export {MobileRequestLines} from './components/erp/mobile-request-lines'; export {RecordDeleteConfirmation} from './components/erp/record-delete-confirmation'; export {createPurchaseCommandAdapter,commandPurchaseSnapshot} from './lib/erp/purchase-request-command-adapter';", resolveDir: app, loader: 'tsx'}, outfile: compiled, bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: {'@': app}, jsx: 'automatic', logLevel: 'warning', plugins: [{name: 'DOM-only-alert-primitives', setup(build) {build.onLoad({filter: /components[\\/]ui[\\/]alert-dialog\.tsx$/}, () => ({contents: primitives, loader: 'jsx'}));}}]});
  const {MobileRequest, MobileRequestLines, RecordDeleteConfirmation, createPurchaseCommandAdapter, commandPurchaseSnapshot} = require(compiled);
  const priorAct = globalThis.IS_REACT_ACT_ENVIRONMENT; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const draft = {...initial, documentId: 'QA-EXISTING', version: 'QA-V1', confirmation: 'draft', values: {...values, lines: values.lines.map(line => ({...line, localKey: 'QA-L1', lineId: 'QA-L1'}))}};
  async function fixture(profile = {}, overrides = {}) {
    const calls = [];
    let props = {initial: structuredClone(draft), access: {...access, ...profile}, adapter: {lookup: async () => ({items: [], hasMore: false}), execute: async intent => {calls.push(intent); return {kind: 'unknown', intentId: intent.intentId, message: 'Synthetic unknown'};}, reconcile: async () => {throw Error('unexpected lookup');}}, ...overrides}, tree;
    const render = async patch => {props = {...props, ...patch}; await act(async () => {if (tree) tree.update(React.createElement(MobileRequest, props)); else tree = create(React.createElement(MobileRequest, props));});};
    await render({});
    const lines = () => tree.root.findByType(MobileRequestLines).props;
    const confirmation = () => tree.root.findByType(RecordDeleteConfirmation).props;
    const buttons = () => tree.root.findAllByType('button');
    const button = text => {const found = buttons().find(node => node.children.join('') === text); assert.ok(found, text); return found;};
    const field = name => tree.root.findAll(node => ['input', 'textarea'].includes(node.type)).find(node => node.props.name === name);
    return {calls, lines, confirmation, buttons, button, field, render, props: () => props, form: () => tree.root.findByType('form'), click: async text => {const target = button(text); assert.equal(!!target.props.disabled, false, text); await act(async () => target.props.onClick?.({preventDefault() {}}));}, close: async () => {await act(async () => tree.unmount());}};
  }
  try {
    for (const canAddLines of [undefined, true, false]) await t.test(`existingOnly hides Remove and denies Add even with canAddLines=${canAddLines}`, async () => {
      const f = await fixture({existingOnly: true, canAddLines});
      try {
        const before = structuredClone(f.lines().lines), handlers = f.lines();
        assert.equal(f.buttons().some(node => /^Bỏ dòng /.test(node.children.join(''))), false);
        assert.equal(f.button('Thêm dòng hàng').props.disabled, true);
        assert.equal(f.field('department').props.disabled, false); assert.equal(f.field('lines.QA-L1.quantity').props.disabled, false);
        await act(async () => {handlers.onAdd(); handlers.onRemove('QA-L1');});
        assert.deepEqual(f.lines().lines, before); assert.equal(f.confirmation().open, false); assert.equal(f.confirmation().isAllowed(), false);
        await act(async () => f.confirmation().onConfirm()); assert.deepEqual(f.lines().lines, before); assert.deepEqual(f.calls, []);
        await act(async () => f.field('department').props.onChange({target: {value: 'EDITED HEADER'}}));
        await act(async () => f.field('lines.QA-L1.quantity').props.onChange({target: {value: '9007199254740993'}}));
        assert.equal(f.field('department').props.value, 'EDITED HEADER'); assert.equal(f.lines().lines[0].quantity, '9007199254740993');
        assert.equal(f.lines().lines[0].lineId, 'QA-L1'); assert.equal(f.lines().lines.length, 1); assert.deepEqual(f.calls, []);
      } finally {await f.close();}
    });
    await t.test('generic profile still adds and removes only after actual confirmation; cancel keeps every value', async () => {
      const f = await fixture();
      try {
        const before = structuredClone(f.lines().lines);
        await f.click('Thêm dòng hàng'); assert.equal(f.lines().lines.length, 2); assert.deepEqual(f.lines().lines[0], before[0]);
        const added = structuredClone(f.lines().lines);
        await f.click('Bỏ dòng 2'); assert.equal(f.confirmation().open, true); assert.deepEqual(f.lines().lines, added); assert.deepEqual(f.calls, []);
        await f.click('Giữ dòng'); assert.equal(f.confirmation().open, false); assert.deepEqual(f.lines().lines, added);
        await f.click('Bỏ dòng 2'); await f.click('Xóa dòng'); assert.deepEqual(f.lines().lines, before); assert.equal(f.confirmation().open, false); assert.deepEqual(f.calls, []);
      } finally {await f.close();}
    });
    await t.test('switching a mounted generic editor to existingOnly retires its dialog and fences every retained structural callback', async () => {
      const f = await fixture();
      try {
        const before = structuredClone(f.lines().lines), staleLines = f.lines();
        await f.click('Bỏ dòng 1'); const staleDialog = f.confirmation(), staleAction = f.button('Xóa dòng').props.onClick;
        assert.equal(staleDialog.open, true); assert.equal(staleDialog.isAllowed(), true);
        await f.render({access: {...f.props().access, existingOnly: true, canAddLines: true}});
        assert.equal(f.confirmation().open, false); assert.equal(f.confirmation().intent, null); assert.equal(staleDialog.isAllowed(), false);
        assert.equal(f.buttons().some(node => /^Bỏ dòng /.test(node.children.join(''))), false);
        await act(async () => {staleLines.onAdd(); staleLines.onRemove('QA-L1'); staleDialog.onConfirm(); staleAction();});
        assert.deepEqual(f.lines().lines, before); assert.equal(f.confirmation().open, false); assert.deepEqual(f.calls, []);
        await f.render({access: {...f.props().access, existingOnly: false}});
        await act(async () => staleAction()); assert.deepEqual(f.lines().lines, before); assert.equal(f.confirmation().open, false, 'retired confirmation cannot revive after switching back');
        await f.click('Bỏ dòng 1'); await f.click('Xóa dòng'); assert.deepEqual(f.lines().lines, [], 'a fresh generic confirmation remains usable');
      } finally {await f.close();}
    });
    for (const unavailable of ['canRead', 'available', 'adapter']) await t.test(`retired removal cannot survive confirmation unmount through ${unavailable} loss and generic-profile recovery`, async () => {
      const f = await fixture();
      try {
        const before = structuredClone(f.lines().lines), original = f.props();
        await f.click('Bỏ dòng 1'); const oldDialog = f.confirmation(), queued = f.button('Xóa dòng').props.onClick;
        const access = {...original.access, existingOnly: true}; if (unavailable !== 'adapter') access[unavailable] = false;
        await f.render({access, ...(unavailable === 'adapter' ? {adapter: undefined} : {})});
        assert.equal(oldDialog.isAllowed(), false);
        await act(async () => {queued(); oldDialog.onConfirm();});
        await f.render(original);
        assert.equal(f.confirmation().intent, null); assert.equal(f.confirmation().open, false); assert.equal(oldDialog.isAllowed(), false);
        await act(async () => {queued(); oldDialog.onConfirm();});
        assert.deepEqual(f.lines().lines, before, 'an unmounted confirmation cannot resurrect a retired original target'); assert.deepEqual(f.calls, []);
        await f.click('Bỏ dòng 1'); assert.equal(f.confirmation().open, true);
        const currentIntent = f.confirmation().intent; await act(async () => queued());
        assert.equal(f.confirmation().intent, currentIntent, 'an old dialog cannot cancel a fresh removal either'); assert.deepEqual(f.lines().lines, before);
        await f.click('Xóa dòng'); assert.deepEqual(f.lines().lines, [], 'fresh generic confirmation remains usable after recovery'); assert.deepEqual(f.calls, []);
      } finally {await f.close();}
    });
    await t.test('generic queued removal and review stay retired after presentation loss and restoration', async () => {
      const f = await fixture();
      try {
        await act(async () => f.field('notes').props.onChange({target: {value: 'PRESENTATION CUSTODY'}}));
        const before = structuredClone(f.lines().lines), adapter = f.props().adapter;
        await f.click('Bỏ dòng 1'); const queued = f.button('Xóa dòng').props.onClick, review = f.form().props.onSubmit;
        assert.equal(f.confirmation().open, true);
        await f.render({presentationAllowed: false});
        await act(async () => {queued(); review({preventDefault() {}});});
        assert.deepEqual(f.lines().lines, before); assert.equal(f.confirmation().open, false); assert.equal(f.lines().readOnly, false);
        await f.render({presentationAllowed: true});
        await act(async () => {queued(); review({preventDefault() {}});});
        assert.deepEqual(f.lines().lines, before); assert.equal(f.confirmation().open, false); assert.equal(f.lines().readOnly, false);
        assert.equal(f.props().adapter, adapter); assert.equal(f.field('notes').props.value, 'PRESENTATION CUSTODY'); assert.deepEqual(f.calls, []);
        await f.click('Bỏ dòng 1'); assert.equal(f.confirmation().open, true); await f.click('Xóa dòng');
        assert.deepEqual(f.lines().lines, [], 'only a fresh generic confirmation removes the original row'); assert.deepEqual(f.calls, []);
      } finally {await f.close();}
    });
    await t.test('existingOnly pending and unknown keep one frozen update intent and reconcile its original JSON', async () => {
      const scopeKey = 'a'.repeat(64), raw = {stateToken: 'prs1.' + '1'.repeat(64), document: {purchaseRequestId: 'QA-EXISTING', branchId: 'QA-B', statusId: 1, isLocked: null,
        header: {purchaseDate: '2026-10-06T13:14:15.003', purposeId: 1, personSuggest: 'SYNTHETIC', department: 'QA', purposeDescOrClient: '', price: '9999999999999999.99', notes: null, currencyId: 'VND', objectId: 'QA-OBJECT', rateExchange: 0.125},
        lines: [{lineId: 'QA-L1', values: {itemId: 'QA-ITEM', quantity: '999999999999999999', unitPrice: '-2', totalPrice: null, budget: null, timeRequired: '', model: null}}]}};
      const transported = [], executed = [], reconciled = []; let release;
      const bridge = createPurchaseCommandAdapter(scopeKey, raw, async (scope, route, body) => {transported.push({scope, route, body}); if (route === 'save') await new Promise(resolve => {release = resolve;}); throw Error('Synthetic lost ACK');});
      const adapter = {...bridge.adapter, execute: (intent, signal) => {executed.push(intent); return bridge.adapter.execute(intent, signal);}, reconcile: (intent, signal) => {reconciled.push(intent); return bridge.adapter.reconcile(intent, signal);}};
      const f = await fixture({scopeKey, existingOnly: true, canAddLines: true, canReconcile: true}, {initial: commandPurchaseSnapshot(raw), adapter});
      try {
        const stale = f.lines(); await act(async () => f.field('department').props.onChange({target: {value: 'EDITED HEADER'}}));
        await act(async () => f.field('lines.QA-L1.quantity').props.onChange({target: {value: '9007199254740993'}}));
        await act(async () => f.form().props.onSubmit({preventDefault() {}}));
        assert.equal(f.button('Gửi đề nghị').props.disabled, true, 'dirty Submit stays separate from Save');
        await f.click('Quay lại chỉnh sửa'); assert.ok(f.field('department')); await act(async () => f.form().props.onSubmit({preventDefault() {}}));
        const send = f.button('Lưu nháp trên ERP').props.onClick;
        await act(async () => {send(); send();}); assert.equal(transported.length, 1); assert.equal(bridge.hasPending(), true);
        await act(async () => {stale.onAdd(); stale.onRemove('QA-L1'); f.confirmation().onConfirm();});
        assert.equal(f.lines().lines.length, 1); assert.equal(f.lines().lines[0].quantity, '9007199254740993'); assert.equal(f.confirmation().open, false);
        await act(async () => release()); assert.equal(f.button('Lưu nháp trên ERP').props.disabled, true); assert.equal(bridge.hasPending(), true);
        await act(async () => {stale.onAdd(); stale.onRemove('QA-L1'); send();}); assert.equal(transported.length, 1);
        await f.click('Kiểm tra kết quả yêu cầu gốc'); assert.deepEqual(transported.map(call => call.route), ['save', 'save/lookup']); assert.equal(transported[1].body, transported[0].body);
        assert.equal(executed.length, 1); assert.equal(reconciled[0], executed[0]); assert.ok(Object.isFrozen(executed[0])); assert.ok(Object.isFrozen(executed[0].values.lines[0]));
        const dto = JSON.parse(transported[0].body); assert.equal(dto.idempotencyKey, executed[0].intentId); assert.equal(dto.header.price, raw.document.header.price); assert.equal(dto.header.purchaseDate, raw.document.header.purchaseDate); assert.equal(dto.header.notes, null);
        assert.equal(dto.lineChanges.length, 1); assert.equal(dto.lineChanges[0].kind, 'Update'); assert.equal(dto.lineChanges[0].values.quantity, '9007199254740993'); assert.equal(dto.lineChanges[0].values.totalPrice, null); assert.equal(dto.lineChanges[0].values.budget, null);
        assert.equal(bridge.hasPending(), true); assert.deepEqual(bridge.currentReadback(), raw);
      } finally {release?.(); await f.close();}
    });
  } finally {globalThis.IS_REACT_ACT_ENVIRONMENT = priorAct;}
});
