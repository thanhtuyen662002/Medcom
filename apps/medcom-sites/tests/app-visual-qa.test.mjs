// P2-06: synthetic presentation QA only. No backend, DB, credentials or real rows.
// Browser tooling follows the existing MEDCOM_BROWSER_TOOLCHAIN/EDGE_PATH convention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/p2-06/visual');
const require = createRequire(import.meta.url);
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: `export * from './lib/erp/status-colors'; export {formatDate,formatDateTime} from './lib/erp/document-detail/format';
    export {CreateFab} from './components/app/create-fab';`, resolveDir: app, loader: 'tsx' },
  outfile: path.join(output, 'unit.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
});
const { statusBadgeStyle, statusBadgeTone, formatDate, formatDateTime, CreateFab } = require(path.join(output, 'unit.cjs'));
const React = require('react');
const { renderToString } = require('react-dom/server');

function contrast(fore, back) {
  const luminance = value => {
    const channels = value.startsWith('#') ? value.slice(1).match(/../g).map(hex => parseInt(hex, 16)) : value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const linear = channels.map(channel => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const values = [luminance(fore), luminance(back)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('every semantic tone and ERP hue has an opaque AA pair in both themes', () => {
  for (const tone of ['neutral', 'success', 'warning', 'danger', 'info', undefined]) {
    for (const fore of ['#FFFFFF', '#FFFF00', '#00FF00', '#00FFFF', '#000000', null, 'invalid']) {
      for (const back of ['#FFFFFF', '#FFFF00', '#00FF00', '#00FFFF', '#000000', '#123456', null, 'url(unsafe)']) {
        const style = statusBadgeStyle(fore, back, tone);
        for (const prefix of ['--status-', '--status-dark-']) {
          assert.match(style[prefix + 'fg'], /^#[A-F0-9]{6}$/);
          assert.match(style[prefix + 'bg'], /^#[A-F0-9]{6}$/);
          assert.ok(contrast(style[prefix + 'fg'], style[prefix + 'bg']) >= 4.5, JSON.stringify({ tone, fore, back, style }));
        }
      }
    }
  }
});

test('semantic paint ignores misleading ERP hues without changing status groups', () => {
  for (const [label, tone] of [['Từ chối', 'danger'], ['Đã hủy', 'danger'], ['Không duyệt', 'danger'], ['Chờ kiểm hàng', 'warning'],
    ['Hoàn tất', 'success'], ['Đã nhập kho', 'success'], ['Dự thảo', 'neutral'], ['Bản nháp', 'neutral']]) {
    assert.equal(statusBadgeTone(label), tone);
  }
  assert.equal(statusBadgeTone('Đã gửi kế toán'), undefined, 'unknown semantics retain a subdued ERP hue');
});

test('shared formatter removes localized midnight, retains actual minutes and never converts timezones', () => {
  for (const [input, expected] of [
    ['24/10/2026 00:00:00', '24/10/2026'], ['24/10/2026 14:05:31', '24/10/2026 14:05'],
    ['24/10/2026 00:00:01', '24/10/2026 00:00'], ['2026-10-24T00:00:00', '24/10/2026'],
    ['2026-10-24T23:59:00-07:00', '24/10/2026 23:59'], [null, '—'], ['Không có ngày', 'Không có ngày'],
  ]) assert.equal(formatDateTime(input), expected, String(input));
  assert.equal(formatDate('24/10/2026 00:00:00'), '24/10/2026');
});

test('FAB has no server markup and entry animations leave no transform containing block', async () => {
  assert.equal(renderToString(React.createElement(CreateFab, { allowed: true, label: 'Tạo QA', onClick() {} })), '');
  const css = await readFile(path.join(app, 'app/untitledui.css'), 'utf8');
  for (const name of ['fade-in', 'slide-up', 'slide-in-left']) {
    assert.match(css, new RegExp(`@keyframes uui-${name} \\{[\\s\\S]*?to \\{[^}]*transform: none;`));
  }
});

const transport = `
  const statuses = ['Dự thảo', 'Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã gửi kế toán'];
  const rows = Array.from({length:11}, (_,i) => ({documentId:'QA-'+String(i+1).padStart(3,'0'), branchId:'QA',
    statusId:i%4, statusName:statuses[i%5], statusForeColor:'#FFFFFF', statusBackColor:i%2?'#00FF00':'#00FFFF',
    documentDateDisplay:'24/10/2026 00:00:00', purchaseDateDisplay:i===1?'24/10/2026 14:05:31':'24/10/2026 00:00:00',
    documentDate:'2026-10-24T00:00:00',purchaseDate:'2026-10-24T00:00:00',personSuggest:'Người lập kiểm thử',
    objectName:'Nhà cung cấp tổng hợp có tên dài để kiểm tra trên điện thoại',userCreate:'Người lập kiểm thử',
    purchaseOrderHeader:{baseTotal:'1234567',currencyId:'VND'},inboundRequestHeader:{orderNumber:'QA-PO',invoiceNo:'QA-VAT'},
    fields:{purchaseDate:'2026-10-24T00:00:00',purposeDescOrClient:'Mua vật tư tổng hợp để kiểm tra bố cục trên điện thoại',
      personSuggest:'Người lập kiểm thử',department:'Bộ phận kiểm thử',price:i===2?undefined:'1234567 VND'}}));
  const page = selected => ({rows:selected,page:1,pageSize:20,hasMore:false});
  export const erpClient = {
    async getPurchaseRequestsList(){return {scopeKey:'QA-SCOPE',list:page(rows)}},
    async getDocumentsList(){return page(rows.slice(0,3))},
    async getPurchaseRequestDetail(){return {document:{header:{},lines:[]}}},
    async getDocumentDetail(){return {document:{},purchaseOrderLines:[],inboundRequestLines:[]}},
    async getScreenMetadata(){return {caption:'Quản lý đơn hàng'}},
    async getErpModuleActions(){return [{id:'create',visible:true,enabled:true}]},
    async getErpModuleList(){return page(rows.slice(0,2).map((row,i)=>({documentId:row.documentId,header:{...row,
      statusName:i?'Từ chối':'Đã gửi kế toán',statusBackColor:i?'#00FF00':'#CCCCFF'}})))},
    async getLookupOptions(){return {items:statuses.map((label,id)=>({id:String(id),label})),page:1,hasMore:false,requiredParameters:[]}},
  };`;

test('375×812 and 1280×860: real tabs, portal bounds, themes, detail labels, overlays and touch targets', { timeout: 150000 }, async () => {
  const toolRequire = process.env.MEDCOM_BROWSER_TOOLCHAIN
    ? createRequire(path.join(path.resolve(process.env.MEDCOM_BROWSER_TOOLCHAIN), 'package.json')) : require;
  const { chromium } = toolRequire('playwright');
  const postcss = require('postcss');
  const tailwind = require('@tailwindcss/postcss');
  const css = await postcss([tailwind({ base: app })]).process(await readFile(path.join(app, 'app/globals.css'), 'utf8'), { from: path.join(app, 'app/globals.css') });
  const fixture = await build({
    stdin: { contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {TabPurchases} from './components/untitledui/tab-purchases';
      import {TabOrders} from './components/untitledui/tab-orders';
      import {TabInbound} from './components/untitledui/tab-inbound';
      import {TabErpScreen} from './components/untitledui/tab-erp-screen';
      import {UntitledBottomNav} from './components/untitledui/bottom-nav';
      import {FormSheet} from './components/app/form-sheet';
      function Fixture(){const [screen,setScreen]=useState('purchases'),[create,setCreate]=useState(false);
        window.qaScreen=setScreen; const open=()=>{window.qaCreates=(window.qaCreates??0)+1;setCreate(true)};
        return <><main className="min-w-0 px-3 py-4 pb-[calc(10rem_+_env(safe-area-inset-bottom))] md:px-8 md:pb-8">
          <section data-qa-screen="purchases" hidden={screen!=='purchases'}><TabPurchases currentBranch="QA" isActive={screen==='purchases'} onOpenCreateModal={open}/></section>
          <section data-qa-screen="orders" hidden={screen!=='orders'}><TabOrders currentBranch="QA" isActive={screen==='orders'} onOpenCreateModal={open}/></section>
          <section data-qa-screen="inbound" hidden={screen!=='inbound'}><TabInbound currentBranch="QA" isActive={screen==='inbound'} onOpenNewInbound={open}/></section>
          <section data-qa-screen="sales-orders" hidden={screen!=='sales-orders'}><TabErpScreen module="sales-orders" currentBranch="QA" isActive={screen==='sales-orders'}/></section>
          </main><div className="md:hidden"><UntitledBottomNav activeTab={screen} onTabChange={setScreen}/></div>
          <FormSheet open={create} title="Tạo chứng từ kiểm thử" submitLabel="Tạo chứng từ" onClose={()=>setCreate(false)} onSubmit={()=>{}}><p>Dữ liệu kiểm thử tổng hợp</p></FormSheet></>}
      createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir: app, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
    plugins: [{ name: 'synthetic-only-transport', setup(builder) {
      builder.onResolve({ filter: /\/(erp-client|registry|purchase-order-create-sheet|purchase-request-create-sheet)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'qa' }));
      builder.onLoad({ filter: /.*/, namespace: 'qa' }, args => ({ loader: 'tsx', resolveDir: app, contents:
        args.path === 'erp-client' ? transport : args.path === 'registry' ? 'export const getDocumentDetailEntry=()=>null;' :
          'export const PurchaseOrderCreateSheet=()=>null; export const PurchaseRequestCreateSheet=()=>null;' }));
    } }],
  });
  const js = fixture.outputFiles[0].text;
  const server = createServer((req, res) => {
    if (req.url === '/qa.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
    else if (req.url === '/qa.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"><body class="bg-neutral-50 dark:bg-neutral-950"><div id="root"></div><script src="/qa.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const evidence = [], errors = [], network = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.MEDCOM_EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await context.route('**/*', route => {
      const url = route.request().url();
      if (!url.startsWith(origin + '/') || url.includes('/api/')) { network.push(url); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    const fab = page.locator('body > button[aria-label^="Tạo"]');
    for (const dark of [false, true]) for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 860 });
      await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
      for (const screen of ['purchases', 'sales-orders', 'orders', 'inbound']) {
        await page.evaluate(value => { window.qaScreen(value); window.scrollTo(0, 0); }, screen);
        const section = page.locator(`main > section[data-qa-screen="${screen}"]`);
        await section.waitFor({ state: 'visible' });
        await section.locator('button.min-h-16').first().waitFor({ state: 'attached' });
        await section.locator('[data-document-pagination][aria-busy="true"]').waitFor({ state: 'detached' });
        await page.waitForTimeout(320); // Observe the real entry animation after completion.
        assert.match(await section.locator('header p').innerText(), /^Chi nhánh QA · \d+ chứng từ trên trang$/);
        assert.doesNotMatch(await section.innerText(), /00:00:00|\(ObjectName\)|AP_|Chi tiết dòng/);
        assert.equal(await section.locator('input[type="search"]').getAttribute('placeholder'), width === 375 ? 'Tìm mã, đối tượng…' : 'Tìm mã, đối tượng, người lập…');
        for (const animated of await section.locator('.animate-uui-fade-in').all()) {
          assert.equal(await animated.evaluate(node => getComputedStyle(node).transform), 'none');
        }
        const colors = await section.locator('.app-status-badge:visible').evaluateAll(nodes => nodes.map(node => ({ label: node.textContent, fore: getComputedStyle(node).color, back: getComputedStyle(node).backgroundColor })));
        for (const color of colors) assert.ok(contrast(color.fore, color.back) >= 4.5, JSON.stringify(color));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, `${screen}-${width}-${dark ? 'dark' : 'light'}-top.png`) });
        let bounds = null;
        if (width === 375) {
          assert.equal(await fab.count(), 1, 'cached hidden tabs must not leak portal FABs');
          bounds = await fab.boundingBox();
          assert.equal(bounds.width, 56); assert.equal(bounds.height, 56);
          assert.equal(bounds.x, 375 - 16 - 56); assert.equal(bounds.y + bounds.height, 812 - 81);
          const nav = await page.getByRole('navigation', { name: 'Thanh điều hướng ứng dụng di động', exact: true }).boundingBox();
          assert.ok(bounds.y + bounds.height <= nav.y - 16);
          await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
          assert.deepEqual(await fab.boundingBox(), bounds, 'FAB remains fixed after scroll');
          const paging = await section.locator('[data-document-pagination]').boundingBox();
          assert.ok(paging.y + paging.height <= bounds.y, 'bottom padding keeps last-page controls above FAB');
          const small = await page.locator('button:visible, input:visible, select:visible, a:visible').evaluateAll(nodes => nodes.filter(node => { const rect = node.getBoundingClientRect(); return rect.width < 44 || rect.height < 44; }).map(node => node.outerHTML));
          assert.deepEqual(small, []);
          const chips = section.getByRole('group', { name: /Lọc/ }).first();
          assert.equal(await chips.evaluate(node => getComputedStyle(node).scrollbarWidth), 'none');
          await chips.evaluate(node => { node.scrollLeft = node.scrollWidth; });
          assert.ok(await chips.evaluate(node => node.scrollLeft > 0), 'chips still scroll');
        } else {
          assert.equal(await fab.isVisible(), false);
          assert.equal(await section.getByRole('table').isVisible(), true);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no page overflow');
        await page.screenshot({ path: path.join(output, `${screen}-${width}-${dark ? 'dark' : 'light'}.png`), fullPage: false });
        evidence.push({ screen, width, dark, bounds, colors });
        if (screen !== 'sales-orders') {
          if (width === 375) await section.locator('button.min-h-16:visible').first().click();
          else await section.getByRole('button', { name: 'Mở chứng từ QA-001', exact: true }).click();
          const dialog = page.getByRole('dialog');
          await dialog.waitFor();
          const text = await dialog.innerText();
          assert.doesNotMatch(text, /\(ObjectName\)|AP_|00:00:00/);
          const labels = dialog.locator('span.text-xs.text-neutral-500');
          assert.ok(await labels.count() > 0);
          for (const style of await labels.evaluateAll(nodes => nodes.map(node => ({ size: getComputedStyle(node).fontSize, transform: getComputedStyle(node).textTransform, color: getComputedStyle(node).color })))) {
            assert.equal(style.size, '12px'); assert.equal(style.transform, 'none');
          }
          await dialog.locator('button[aria-label="Đóng"]').click();
        }
      }
      if (width === 375) {
        await page.evaluate(() => window.qaScreen('purchases'));
        await fab.click();
        assert.equal(await page.evaluate(() => window.qaCreates), dark ? 2 : 1);
        const dialog = page.getByRole('dialog'); await dialog.waitFor();
        await dialog.evaluate(async node => { await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished)); });
        const rect = await dialog.boundingBox(); assert.equal(rect.height, 812); assert.equal(rect.y, 0);
        await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Bộ lọc', exact: true }).click();
        await page.getByRole('dialog').waitFor(); assert.equal(await fab.count(), 0);
        await page.keyboard.press('Escape');
      }
    }
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    await writeFile(path.join(output, 'evidence.json'), JSON.stringify({ status: 'PASS', scope: 'Synthetic UI only; no backend/DB/production acceptance', evidence, errors, network }, null, 2));
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
