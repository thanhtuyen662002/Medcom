// P2-07: synthetic presentation fixtures only. No ERP transport, DB or real rows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/p2-07');
const require = createRequire(import.meta.url);
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: `export {DocumentActionBar} from './components/erp/document-detail/document-action-bar';
    export {DetailActionButton} from './components/erp/document-detail/presentation';
    export {DocumentDetailStatus} from './components/erp/document-detail/document-detail-status';
    export {RequestStatus} from './components/erp/request-presentation';
    export {StatusBadge} from './components/app/status-badge';
    export {statusBadgeStyle} from './lib/erp/status-colors';`, resolveDir: app, loader: 'tsx' },
  outfile: path.join(output, 'unit.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'unit-sheet-host', setup(builder) {
    builder.onResolve({ filter: /\/bottom-sheet$/ }, () => ({ path: 'sheet', namespace: 'detail-unit' }));
    builder.onLoad({ filter: /.*/, namespace: 'detail-unit' }, () => ({ loader: 'tsx', resolveDir: app,
      contents: 'export const UntitledBottomSheet=({open,children})=>open?<section data-menu>{children}</section>:null;' }));
  } }],
});
const { DocumentActionBar, DetailActionButton, DocumentDetailStatus, RequestStatus, StatusBadge, statusBadgeStyle } = require(path.join(output, 'unit.cjs'));
const React = require('react'), { act, create } = require('react-test-renderer');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement, noop = () => {};
const text = node => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
const action = (id, extra = {}) => ({ id, label: id, placement: 'primary', visible: true, enabled: true, ...extra });

async function mounted(element, verify, mobile = false) {
  const previousWindow = globalThis.window, previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = { matchMedia: () => ({ matches: mobile, addEventListener: noop, removeEventListener: noop }) };
  let tree;
  try {
    await act(async () => { tree = create(element); });
    await verify(tree);
  } finally {
    if (tree) await act(async () => tree.unmount());
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousAct === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT; else globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
}

test('status, lock, delivery and request badges use shared theme pairs; explicit neutral wins for both locks', () => {
  for (const locked of [false, true]) {
    const html = renderToStaticMarkup(h(DocumentDetailStatus, { status: {
      label: 'Đã gửi PM', locked, style: { color: '#FFFFFF', backgroundColor: '#FF00FF' },
      badges: [{ id: 'delivery', title: 'Trạng thái giao hàng', label: 'Giao hàng: Đang giao' }],
    } }));
    assert.equal((html.match(/app-status-badge/g) ?? []).length, 3);
    assert.match(html, new RegExp(locked ? 'Đã khóa' : 'Chưa khóa'));
    const neutral = statusBadgeStyle(null, null, 'neutral');
    assert.match(html, new RegExp(`--status-fg:${neutral['--status-fg']};--status-bg:${neutral['--status-bg']}`));
    assert.doesNotMatch(html, /style="color:|background-color:#FF00FF/);
  }
  const props = { label: 'Chưa khóa', tone: 'neutral' };
  assert.match(renderToStaticMarkup(h(StatusBadge, props)), /--status-bg:#F5F5F5/);
  assert.match(renderToStaticMarkup(h(RequestStatus, { value: 12, statusName: 'Đã gửi PM', foreColor: '#FFFFFF', backColor: '#FF00FF' })), /app-status-badge.*--status-dark-bg:/);
});

test('mobile moves only overflow into More, preserving priority, visibility, disabled state and callbacks', async () => {
  const events = [], changes = [];
  const actions = [action('Gửi PM'), action('Thu hồi để sửa', { enabled: false, reason: 'Không được phép' }),
    action('Sửa'), action('Ẩn', { visible: false }), action('Làm mới', { placement: 'menu', keepMenuOpen: true }),
    action('Xóa', { placement: 'menu', enabled: false, tone: 'danger', reason: 'Chưa được phép xóa' })];
  const before = structuredClone(actions);
  await mounted(h(DocumentActionBar, { actions, onAction: id => events.push(id), onMenuOpenChange: value => changes.push(value) }), async tree => {
    const buttons = () => tree.root.findAllByType('button');
    assert.deepEqual(buttons().map(text), ['Thêm', 'Gửi PM']);
    assert.equal(buttons().filter(button => button.props.className.includes('bg-brand-600')).length, 1);
    await act(async () => buttons()[1].props.onClick());
    await act(async () => buttons()[0].props.onClick());
    assert.deepEqual(tree.root.findByProps({ 'data-menu': true }).findAllByType('button').map(text), ['Thu hồi để sửa', 'Sửa', 'Làm mới', 'Xóa']);
    const disabled = buttons().find(button => text(button) === 'Thu hồi để sửa');
    assert.equal(disabled.props.disabled, true);
    assert.equal(disabled.props.title, 'Không được phép');
    await act(async () => disabled.props.onClick());
    await act(async () => buttons().find(button => text(button) === 'Làm mới').props.onClick());
    assert.deepEqual(changes, [true], 'keepMenuOpen still delegates closing to the controller');
    await act(async () => buttons().find(button => text(button) === 'Xóa').props.onClick());
    await act(async () => buttons().find(button => text(button) === 'Sửa').props.onClick());
    assert.deepEqual(events, ['Gửi PM', 'Làm mới', 'Sửa']);
    assert.deepEqual(changes, [true, false]);
  }, true);
  assert.deepEqual(actions, before);
});

test('desktop retains every direct action in controller order and highlights only the first default action', async () => {
  await mounted(h(DocumentActionBar, { actions: [action('Hủy sửa', { tone: 'outline' }), action('Lưu thay đổi'), action('Gửi PM')], onAction: noop }), tree => {
    const buttons = tree.root.findAllByType('button');
    assert.deepEqual(buttons.map(text), ['Hủy sửa', 'Lưu thay đổi', 'Gửi PM']);
    assert.deepEqual(buttons.map(button => button.props.className.includes('bg-brand-600')), [false, true, false]);
  });
});

test('busy exceptions, reasons, spinner and disabled confirmation behavior retain the original action contract', async () => {
  const calls = [];
  for (const [extra, busy, disabled, dispatch] of [
    [{}, false, false, true], [{}, true, true, false], [{ disableWhileBusy: false }, true, false, true],
    [{ enabled: false, reason: 'Chưa được phép' }, false, true, false], [{ busy: true }, false, true, false],
    [{ enabled: false, allowDisabledClick: true }, false, true, true],
  ]) await mounted(h(DetailActionButton, { action: action('QA', extra), busy, onAction: id => calls.push(id) }), async tree => {
    const button = tree.root.findByType('button'), before = calls.length;
    assert.equal(button.props.disabled, disabled);
    if (extra.busy) assert.equal(button.props['aria-busy'], true);
    await act(async () => button.props.onClick());
    assert.equal(calls.length - before, Number(dispatch));
  });
});

test('presentation masking and an enabled overflow exception do not lose the controller gates', async () => {
  await mounted(h(DocumentActionBar, { presentationAllowed: false, actions: [action('QA')], onAction: noop }), tree => {
    assert.equal(tree.root.findByProps({ 'aria-hidden': true }).props.inert, true);
  });
  await mounted(h(DocumentActionBar, { busy: true, menuDisabled: true,
    actions: [action('A'), action('B'), action('Hủy sửa', { disableWhileBusy: false }), action('Đọc hợp đồng', { placement: 'menu' })], onAction: noop }), async tree => {
    const more = tree.root.findAllByType('button')[0];
    assert.equal(more.props.disabled, false, 'an enabled overflow action must remain reachable');
    await act(async () => more.props.onClick());
    const cancel = tree.root.findAllByType('button').find(button => text(button) === 'Hủy sửa');
    assert.equal(cancel.props.disabled, false);
    assert.equal(tree.root.findByType('fieldset').props.disabled, true, 'the original menu group retains its disabled gate');
  }, true);
});

test('375×812 and desktop: shared headers, badges, single-line actions, themes, menu keyboard and native gates', { timeout: 150000 }, async () => {
  const toolRequire = process.env.MEDCOM_BROWSER_TOOLCHAIN
    ? createRequire(path.join(path.resolve(process.env.MEDCOM_BROWSER_TOOLCHAIN), 'package.json')) : require;
  const { chromium } = toolRequire('playwright-core');
  const css = await require('postcss')([require('@tailwindcss/postcss')({ base: app })])
    .process(await readFile(path.join(app, 'app/globals.css'), 'utf8'), { from: path.join(app, 'app/globals.css') });
  const fixture = await build({
    stdin: { contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
      import {DocumentDetailDialog} from './components/erp/document-detail/document-detail-dialog';
      import {DocumentDetailView} from './components/erp/document-detail/document-detail-view';
      import {salesOrderDetailConfig} from './lib/erp/document-detail/modules/sales';
      import {purchaseRequestDetailConfig,purchaseOrderDetailConfig} from './lib/erp/document-detail/modules/purchase';
      import {inboundRequestDetailConfig} from './lib/erp/document-detail/modules/inbound';
      const configs={'sales-orders':salesOrderDetailConfig,'purchase-requests':purchaseRequestDetailConfig,'purchase-orders':purchaseOrderDetailConfig,'inbound-requests':inboundRequestDetailConfig};
      function Fixture(){const[scope,setScope]=useState('sales-orders'),[busy,setBusy]=useState(false),[allowed,setAllowed]=useState(true),[open,setOpen]=useState(true);
        window.qa={pick:value=>{setScope(value);setBusy(false);setAllowed(true);setOpen(true)},setBusy,setAllowed,reopen:()=>setOpen(true),calls:window.qa?.calls??[]};
        const config=configs[scope],sales=scope==='sales-orders',id='QA-'+scope;
        const actions=(sales?['Gửi Kế toán','Gửi Kỹ thuật','Thu hồi để sửa','Sửa']:[]).map((label,i)=>({id:'action-'+i,label,placement:'primary',visible:true,enabled:i!==1,reason:i===1?'Không được phép':undefined}));
        actions.push({id:'refresh',label:'Làm mới',placement:'menu',visible:true,enabled:true},{id:'denied',label:'Xóa',placement:'menu',visible:true,enabled:false,reason:'Chưa được phép xóa',showReason:true,tone:'danger'});
        const model={documentId:id,header:{branchId:'QA',branchName:'Kiểm thử',documentDate:'2026-10-24T00:00:00',purchaseDate:'2026-10-24T00:00:00',objectName:'Đối tượng kiểm thử',notes:'Dữ liệu tổng hợp dùng kiểm tra giao diện.'},
          lines:{rows:[{lineId:'QA-LINE',fields:{itemId:'QA-ITEM',itemName:'Vật tư kiểm thử',quantity:'2',unitPrice:'100',amount:'200'}}],hasMore:false},
          history:{rows:[{lineId:'QA-HISTORY',fields:{statusId:12,statusName:'Đã gửi PM',statusForeColor:'#FFFFFF',statusBackColor:'#FF00FF',userName:'Người kiểm thử',documentDate:'2026-10-24T10:00:00'}}],hasMore:false},
          status:{label:'Đã gửi PM',locked:false,style:{color:'#FFFFFF',backgroundColor:'#FF00FF'}},
          loading:false,error:null,editing:false,dirty:false,busy,draft:{},feedback:null,actions};
        const handlers={onAction:id=>window.qa.calls.push(id),onFieldChange(){},onLoadMore(){},onRetry(){}};
        return <DocumentDetailDialog key={scope} open={open} presentationAllowed={allowed} title={config.title} documentNumber={id} closeLabel="Đóng chi tiết" onRequestClose={()=>{window.qa.calls.push('close');setOpen(false)}}>
          <DocumentDetailView config={config} model={model} handlers={handlers} module={scope}/></DocumentDetailDialog>}
      createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir: app, loader: 'tsx' },
    bundle: true, write: false, platform: 'browser', format: 'iife', alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
  });
  const js = fixture.outputFiles[0].text;
  const server = createServer((req, res) => {
    if (req.url === '/qa.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
    else if (req.url === '/qa.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(js); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"><body><div id="root"></div><script src="/qa.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const errors = [], network = [], evidence = [];
  let browser;
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
    for (const width of [375, 1280]) for (const dark of [false, true]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 860 });
      await page.evaluate(value => document.documentElement.classList.toggle('dark', value), dark);
      for (const scope of ['sales-orders', 'inbound-requests', 'purchase-requests', 'purchase-orders']) {
        await page.evaluate(value => window.qa.pick(value), scope);
        const dialog = page.getByRole('dialog', { name: 'QA-' + scope, exact: true });
        await dialog.waitFor();
        await page.mouse.move(0, width === 375 ? 811 : 859);
        await page.waitForTimeout(200); // Let the previous screen's hover transition finish.
        const subtitle = dialog.locator('[data-document-detail-subtitle]');
        assert.match(await subtitle.innerText(), / · Chi nhánh Kiểm thử$/);
        assert.equal(await dialog.locator('h2').innerText(), 'QA-' + scope);
        assert.ok((await dialog.locator('h2').boundingBox()).y < (await subtitle.boundingBox()).y, 'document code precedes subtitle');
        const close = dialog.getByRole('button', { name: 'Đóng chi tiết', exact: true });
        const closeBox = await close.boundingBox();
        assert.equal(closeBox.width, 44); assert.equal(closeBox.height, 44);
        assert.match(await close.evaluate(node => getComputedStyle(node).backgroundColor), /^(?:rgba\(0, 0, 0, 0\)|oklab\([^)]*\/ 0\))$/);
        const status = dialog.locator('.record-detail-status .app-status-badge');
        assert.equal(await status.count(), 2);
        const lockColor = await status.last().evaluate(node => getComputedStyle(node).backgroundColor);
        assert.equal(lockColor, dark ? 'rgb(38, 38, 38)' : 'rgb(245, 245, 245)');
        const bar = dialog.locator('.document-detail-actions');
        const buttons = bar.getByRole('button');
        assert.equal(await buttons.count(), scope === 'sales-orders' ? (width === 375 ? 2 : 5) : 1);
        const bounds = await dialog.boundingBox();
        if (width === 375) assert.deepEqual(bounds, { x: 0, y: 0, width: 375, height: 812 });
        const geometry = await buttons.evaluateAll(nodes => nodes.map(node => {
          const box = node.getBoundingClientRect(), style = getComputedStyle(node);
          return { label: node.textContent, x: box.x, right: box.right, height: box.height, width: box.width,
            scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, whiteSpace: style.whiteSpace, background: style.backgroundColor };
        }));
        for (const button of geometry) {
          assert.ok(button.height >= 44 && button.width >= 44, JSON.stringify(button));
          assert.ok(button.x >= bounds.x && button.right <= bounds.x + bounds.width, JSON.stringify(button));
          assert.ok(button.scrollWidth <= button.clientWidth, JSON.stringify(button));
          assert.equal(button.whiteSpace, 'nowrap');
          if (dark) assert.notEqual(button.background, 'rgb(255, 255, 255)');
        }
        assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), true);
        await page.screenshot({ path: path.join(output, `${scope}-${width}-${dark ? 'dark' : 'light'}.png`) });
        evidence.push({ scope, width, dark, geometry });
        if (width === 375 && scope === 'sales-orders') {
          await buttons.filter({ hasText: 'Gửi Kế toán' }).click();
          assert.equal(await page.evaluate(() => window.qa.calls.at(-1)), 'action-0');
          await buttons.filter({ hasText: 'Thêm' }).click();
          const menu = page.getByRole('dialog', { name: 'Thao tác khác', exact: true });
          await menu.waitFor();
          assert.deepEqual(await menu.getByRole('button').allTextContents(), ['Gửi Kỹ thuật', 'Thu hồi để sửa', 'Sửa', 'Làm mới', 'XóaChưa được phép xóa']);
          const disabled = menu.getByRole('button', { name: 'Gửi Kỹ thuật', exact: true });
          assert.equal(await disabled.isDisabled(), true);
          await disabled.evaluate(node => node.click());
          assert.equal(await page.evaluate(() => window.qa.calls.includes('action-1')), false, 'native disabled gate');
          await menu.getByRole('button', { name: 'Làm mới', exact: true }).focus();
          await page.keyboard.press('Tab');
          assert.equal(await menu.getByRole('button', { name: 'Thu hồi để sửa', exact: true }).evaluate(node => node === document.activeElement), true);
          await page.keyboard.press('Escape');
          await menu.waitFor({ state: 'detached' });
          assert.equal(await buttons.filter({ hasText: 'Thêm' }).evaluate(node => node === document.activeElement), true);
          await buttons.filter({ hasText: 'Thêm' }).click();
          await menu.getByRole('button', { name: 'Sửa', exact: true }).click();
          assert.equal(await page.evaluate(() => window.qa.calls.at(-1)), 'action-3');
          await menu.waitFor({ state: 'detached' });
          await page.evaluate(() => window.qa.setBusy(true));
          await page.waitForFunction(() => [...document.querySelectorAll('.document-detail-actions button')].every(button => button.disabled));
        }
        await close.click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => window.qa.calls.at(-1)), 'close');
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    await writeFile(path.join(output, 'geometry.json'), JSON.stringify(evidence, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
