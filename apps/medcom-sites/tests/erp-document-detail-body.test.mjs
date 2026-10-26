import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/erp-document-detail-body');
await mkdir(output, { recursive: true });
const leaves = {
  'erp-client': `export const erpClient={getErpModuleDetail:(...args)=>globalThis.qaGenericDetail.read(...args),getScreenMetadata:async()=>({caption:'Kiểm thử'}),getErpModuleActions:async()=>[],getErpModuleList:async()=>({rows:[{documentId:'QA-DOC',header:{objectName:'Đối tượng kiểm thử'}}],page:1,hasMore:false}),scanQr:(...args)=>globalThis.qaGenericDetail.scan(...args),lookupCommand:(...args)=>globalThis.qaGenericDetail.lookup(...args),executeWorkflowAction:(...args)=>globalThis.qaGenericDetail.workflow(...args),saveDocument:(...args)=>globalThis.qaGenericDetail.save(...args),deleteDocument:(...args)=>globalThis.qaGenericDetail.delete(...args)};`,
  'bottom-sheet': `export const UntitledBottomSheet=({open,children,title,onClose})=>open?<section role="dialog" data-sheet={title}><button aria-label="Đóng modal" onClick={onClose}/>{children}</section>:null;`,
  'button': `export const UntitledButton=({children,iconLeading,iconTrailing,variant,size,...props})=><button {...props}>{children}</button>;`,
  'lookup-field': `export const LookupField=props=><div data-lookup={props.lookupId} {...props}/>;export const fieldText=v=>v==null?'':String(v);export const choiceLabel=(c,f)=>c?.label||f;`,
  'record-dialog': `export const RecordDetailStatus=({children})=><div data-status="header">{children}</div>;export const RecordDetailHeading=({children,title,documentNumber})=><header>{title}{documentNumber}{children}</header>;export const RecordActionBar=({children,presentationAllowed=true})=>presentationAllowed?<footer>{children}</footer>:null;`,
  'request-presentation': `import React from 'react';export const RecordDetailContext=React.createContext(true);export const RequestButton='button';export const RequestInput='input';export const RequestTextarea='textarea';export const RequestSelect='select';export const requestStyles={actions:''};`,
  'document-detail-dialog': `export const DocumentDetailDialog=({open,children,onRequestClose})=><section hidden={!open}><button aria-label="Đóng chi tiết kiểm thử" onClick={onRequestClose}/>{children}</section>;`,
  'sales-order-form': `export const SalesOrderForm=()=>null;`,
  'purchase-request-create-sheet': `export const PurchaseRequestCreateSheet=props=>props.open?<section data-edit={props.documentId} onSaved={props.onSaved} onClose={props.onClose}/>:null;`,
  'purchase-order-create-sheet': `export const PurchaseOrderCreateSheet=()=>null;`,
  'qr-camera': `export class QrCamera{start(){}stop(){}}`,
};
await build({
  stdin: { contents: `export {ErpDocumentDetailBody} from './components/erp/erp-document-detail-body';export {TabErpScreen} from './components/untitledui/tab-erp-screen';export {getDocumentDetailEntry} from './lib/erp/document-detail/registry';export {erpScreenModules} from './lib/erp/proxy-policy';`, resolveDir: app, loader: 'tsx' },
  outfile: path.join(output, 'fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'generic-detail-leaves', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (!/(?:tab-erp-screen\.tsx|erp-document-detail-body\.tsx|erp-line-editor\.tsx|document-detail\/[^/]+\.tsx|document-detail\/registry\.ts)$/.test(args.importer.replaceAll('\\', '/'))) return;
      // Match the whole leaf name: "button" must not intercept P2 AppButton.
      for (const key of Object.keys(leaves)) if (args.path.endsWith(`/${key}`)) return { path: key, namespace: 'generic-detail-qa' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'generic-detail-qa' }, args => ({ contents: leaves[args.path], loader: 'tsx', resolveDir: app }));
  } }],
});
const require = createRequire(import.meta.url);
const React = require('react'), { create, act } = require('react-test-renderer');
const { ErpDocumentDetailBody, TabErpScreen, getDocumentDetailEntry, erpScreenModules } = require(path.join(output, 'fixture.cjs'));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (Array.isArray(node) ? node : node?.children ?? []).map(text).join('');
const button = (tree, label) => tree.root.findAllByType('button').find(node => text(node) === label);
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => {}); };
const page = (rows = [], hasMore = false, number = 1) => ({ rows, page: number, hasMore, pageSize: 50 });
const data = (documentId = 'QA-DOC') => ({ documentId, header: { objectName: 'Đối tượng kiểm thử', statusName: 'Mới lập', isLocked: false }, lines: page(), sections: { costs: page([{ lineId: 'QA-COST', fields: { notes: 'Chi phí kiểm thử' } }]) }, actions: ['save', 'delete', 'submit', 'scan-add', 'scan-delete'].map(id => ({ id, caption: id, visible: true, enabled: true })), stateToken: 'a'.repeat(64) });
async function mounted(verify, { module = 'inbound-requests', api = {}, props = {}, screen = false } = {}) {
  const previousWindow = globalThis.window;
  const listeners = new Map(), calls = [];
  globalThis.window = { matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }), addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } };
  globalThis.qaGenericDetail = { read: async (scope, query) => { calls.push({ scope, ...query }); return data(query.documentId); }, ...api };
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(screen ? TabErpScreen : ErpDocumentDetailBody, screen ? { module, currentBranch: 'QA', isActive: true, ...props } : { module, branchId: 'QA', documentId: 'QA-DOC', onClose: noop, onChanged: noop, ...props })); });
    await flush();
    await verify(tree, calls, listeners);
  } finally {
    if (tree) await act(async () => tree.unmount());
    delete globalThis.qaGenericDetail;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
}
async function menu(tree) { await act(async () => tree.root.findByProps({ 'aria-label': 'Thao tác chứng từ' }).props.onClick()); }
async function openRow(tree) {
  const row = tree.root.findAll(node => typeof node.props.onClick === 'function' && node.props.className?.includes('cursor-pointer'))[0];
  assert.ok(row);
  await act(async () => row.props.onClick());
  await flush();
}

test('registry covers all 24 ERP modules with the approved configs and keeps the sales body', () => {
  assert.equal(erpScreenModules.length, 24);
  for (const screenModule of erpScreenModules) {
    const entry = getDocumentDetailEntry(screenModule);
    assert.ok(entry, screenModule);
    assert.ok(entry.config.modules.includes(screenModule), screenModule);
    assert.equal(typeof entry.Body, 'function');
    if (!['sales-orders', 'sales-order-pm', 'sales-order-sa'].includes(screenModule)) assert.equal(entry.Body, ErpDocumentDetailBody, screenModule);
  }
});
for (const screenModule of ['inbound-requests', 'purchase-requests']) test(`${screenModule} reads once and preserves generic content and the document menu`, async () => {
  await mounted(async (tree, calls) => {
    assert.deepEqual(calls, [{ scope: screenModule, branchId: 'QA', documentId: 'QA-DOC', page: 1, pageSize: 50 }]);
    assert.match(text(tree.toJSON()), /QA-DOC/);
    assert.match(text(tree.toJSON()), /Đối tượng kiểm thử/);
    assert.doesNotMatch(text(tree.toJSON()), /Chi phí kiểm thử/);
    assert.match(text(tree.root.findByProps({ 'data-status': 'header' })), /Chưa khóa/);
    // Count native controls, not both the AppButton component and its host node.
    assert.equal(tree.root.findAllByType('button').filter(node => node.props['aria-label'] === 'Thao tác chứng từ').length, 1);
  }, { module: screenModule });
});
test('write-gated purchase-orders keeps generic detail without its write menu', async () => {
  await mounted(async (tree, calls) => {
    assert.equal(calls.length, 1);
    assert.match(text(tree.toJSON()), /QA-DOC/);
    assert.equal(tree.root.findAllByProps({ 'aria-label': 'Thao tác chứng từ' }).length, 0);
  }, { module: 'purchase-orders' });
});
test('purchase-request edit hands the exact document id to the retained create/edit sheet', async () => {
  const ids = [];
  await mounted(async tree => {
    await menu(tree);
    await act(async () => button(tree, 'Sửa thông tin').props.onClick());
    assert.deepEqual(ids, ['QA-DOC']);
  }, { module: 'purchase-requests', props: { onEditPurchaseRequest: id => ids.push(id) } });
});
test('sales-qr pending scan retains both guard messages, beforeunload, and the same retry intent', async () => {
  let closeGuard, openGuard, intent;
  const scans = [];
  await mounted(async (tree, calls, listeners) => {
    await act(async () => button(tree, 'Quét thêm mã QR').props.onClick());
    const input = tree.root.findByProps({ placeholder: 'Mã ItemID;ItemCode;Lot hoặc PKG1;...' });
    await act(async () => input.props.onChange({ target: { value: 'QA-ITEM;QA-CODE;QA-LOT' } }));
    await act(async () => button(tree, 'Xác nhận').props.onClick());
    await flush();
    assert.equal(scans.length, 1);
    intent = scans[0][2];
    assert.equal(intent.documentId, 'QA-DOC');
    assert.equal(intent.barcode, 'QA-ITEM;QA-CODE;QA-LOT');
    let allowed;
    await act(async () => { allowed = closeGuard(); });
    assert.equal(allowed, false);
    assert.match(text(tree.toJSON()), /Hãy xác nhận kết quả mã QR đang chờ trước khi đóng phiếu\./);
    await act(async () => { allowed = openGuard(); });
    assert.equal(allowed, false);
    assert.match(text(tree.toJSON()), /Hãy xác nhận kết quả mã QR đang chờ trước khi mở phiếu khác\./);
    assert.ok(listeners.has('beforeunload'));
    const event = { preventDefault() { this.prevented = true; } };
    listeners.get('beforeunload')(event);
    assert.equal(event.prevented, true);
    assert.equal(event.returnValue, '');
    await act(async () => button(tree, 'Kiểm tra kết quả').props.onClick());
    assert.equal(scans.length, 1);
    await act(async () => button(tree, 'Gửi lại cùng mã').props.onClick());
    assert.equal(scans.length, 2);
    assert.deepEqual(scans[1][2], intent);
    assert.equal(calls.length, 1, 'an unresolved scan does not reread or admit another command');
  }, { module: 'sales-qr', props: { onCloseGuardChange: guard => { closeGuard = guard; }, onOpenGuardChange: guard => { openGuard = guard; } }, api: { scan: async (...args) => { scans.push(args); return { outcome: 'OutcomeUnknown' }; }, lookup: async () => ({ outcome: 'Absent' }) } });
  assert.equal(closeGuard, null);
  assert.equal(openGuard, null);
});
for (const deepLink of [false, true]) test(`TabErpScreen ${deepLink ? 'deep link' : 'row open'} delegates its only detail read to Body`, async () => {
  await mounted(async (tree, calls) => {
    if (!deepLink) { assert.equal(calls.length, 0); await openRow(tree); }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].documentId, 'QA-DOC');
    assert.match(text(tree.toJSON()), /QA-DOC/);
    const source = await readFile(path.join(app, 'components/untitledui/tab-erp-screen.tsx'), 'utf8');
    assert.doesNotMatch(source, /getErpModuleDetail/);
  }, { screen: true, props: deepLink ? { targetDocumentId: 'QA-DOC' } : {} });
});
test('purchase-request saved sheet rereads the same selected Body without dropping selection', async () => {
  await mounted(async (tree, calls) => {
    await openRow(tree);
    await menu(tree);
    await act(async () => button(tree, 'Sửa thông tin').props.onClick());
    const sheet = tree.root.findByProps({ 'data-edit': 'QA-DOC' });
    assert.equal(calls.length, 1);
    await act(async () => sheet.props.onSaved('QA-DOC'));
    await flush();
    assert.equal(calls.length, 2);
    assert.equal(tree.root.findAllByProps({ 'data-edit': 'QA-DOC' }).length, 0);
    assert.match(text(tree.toJSON()), /QA-DOC/);
  }, { module: 'purchase-requests', screen: true });
});
test('pagination appends the next page and keeps the same request shape', async () => {
  const calls = [];
  await mounted(async tree => {
    assert.match(text(tree.toJSON()), /1 dòng đã tải/);
    await act(async () => button(tree, 'Tải thêm…').props.onClick());
    await flush();
    assert.deepEqual(calls.map(query => query.page), [1, 2]);
    assert.ok(calls.every(query => query.pageSize === 50 && query.branchId === 'QA' && query.documentId === 'QA-DOC'));
    assert.match(text(tree.toJSON()), /2 dòng đã tải/);
    assert.match(text(tree.toJSON()), /Chi tiết nhập kho2/);
  }, { api: { read: async (module, query) => { calls.push(query); return { ...data(), lines: page([{ lineId: `QA-LINE-${query.page}`, fields: { itemId: 'QA-ITEM', quantity: '1' } }], query.page === 1, query.page) }; } } });
});
test('reopening the selected row retries a failed detail read without a parent read', async () => {
  let reads = 0;
  await mounted(async tree => {
    await openRow(tree);
    assert.equal(reads, 1);
    assert.match(text(tree.toJSON()), /Không thể tải chi tiết chứng từ\. Vui lòng thử lại\./);
    await openRow(tree);
    assert.equal(reads, 2);
    assert.match(text(tree.toJSON()), /Đối tượng kiểm thử/);
    assert.doesNotMatch(text(tree.toJSON()), /Không thể tải chi tiết chứng từ/);
  }, { screen: true, api: { read: async () => { if (++reads === 1) throw new Error('QA read failure'); return data(); } } });
});

test('reopening the same row preserves the newest response when the first read finishes last', async () => {
  const pending = [];
  await mounted(async tree => {
    await openRow(tree);
    await openRow(tree);
    assert.equal(pending.length, 2);
    const latest = data();
    latest.header.objectName = 'Đối tượng mới';
    await act(async () => pending[1](latest));
    await flush();
    assert.match(text(tree.toJSON()), /Đối tượng mới/);
    await act(async () => pending[0](data()));
    await flush();
    const detailText = text(tree.root.findByType(ErpDocumentDetailBody));
    assert.match(detailText, /Đối tượng mới/);
    assert.doesNotMatch(detailText, /Đối tượng kiểm thử/);
  }, { screen: true, api: { read: () => new Promise(resolve => pending.push(resolve)) } });
});

test('delete keeps its two-step confirmation, command token, and list/close callbacks', async () => {
  const commands = [], outcomes = [];
  await mounted(async tree => {
    await menu(tree);
    await act(async () => button(tree, 'Xóa chứng từ').props.onClick());
    assert.equal(commands.length, 0);
    await act(async () => button(tree, 'Bấm lần nữa để xóa').props.onClick());
    await flush();
    assert.equal(commands.length, 1);
    const [module, command] = commands[0];
    assert.equal(module, 'inbound-requests');
    assert.equal(command.branchId, 'QA');
    assert.equal(command.documentId, 'QA-DOC');
    assert.equal(command.expectedStateToken, 'a'.repeat(64));
    assert.match(command.idempotencyKey, /^del-/);
    assert.deepEqual(outcomes, ['changed', 'close', 'deleted']);
  }, { props: { onChanged: () => outcomes.push('changed'), onClose: () => outcomes.push('close'), onDeleted: () => outcomes.push('deleted') }, api: { delete: async (...args) => { commands.push(args); return { outcome: 'Committed', receipt: { deleted: true } }; } } });
});

test('workflow prompt keeps notes and exact command payload', async () => {
  const sent = [], changed = [];
  await mounted(async tree => {
    // submit is already part of the admitted generic menu.
    await menu(tree);
    await act(async () => button(tree, 'Gửi đề nghị').props.onClick());
    assert.equal(tree.root.findAllByProps({ 'data-sheet': 'Thao tác: submit' }).length, 1);
    const notes = tree.root.findByType('textarea');
    await act(async () => notes.props.onChange({ target: { value: '  Ghi chú kiểm thử  ' } }));
    await act(async () => button(tree, 'Xác nhận submit').props.onClick());
    await flush();
    assert.equal(sent.length, 1);
    const [module, operation, command] = sent[0];
    assert.equal(module, 'inbound-requests');
    assert.equal(operation, 'submit');
    assert.equal(command.branchId, 'QA');
    assert.equal(command.documentId, 'QA-DOC');
    assert.equal(command.expectedStateToken, 'a'.repeat(64));
    assert.deepEqual(command.payload, { notes: 'Ghi chú kiểm thử' });
    assert.match(command.idempotencyKey, /^act-/);
    assert.equal(changed.length, 1);
  }, { props: { onChanged: () => changed.push(true) }, api: { workflow: async (...args) => { sent.push(args); return { outcome: 'Committed' }; } } });
});

// Exercise the production RecordDialog focus trap with the production portal
// sheet. Only DOM primitives/portal transport are doubled; no browser claim.
await build({
  stdin: { contents: `export {RecordDialog} from './components/erp/record-dialog';export {ErpDocumentDetailBody} from './components/erp/erp-document-detail-body';`, resolveDir: app, loader: 'tsx' },
  outfile: path.join(output, 'focus.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'generic-detail-focus-dom', setup(builder) {
    const focusLeaves = Object.fromEntries(Object.entries(leaves).filter(([key]) => !['record-dialog', 'bottom-sheet', 'document-detail-dialog'].includes(key)));
    focusLeaves['react-dom'] = 'export const createPortal=children=>children;';
    builder.onResolve({ filter: /.*/ }, args => {
      if (args.path !== 'react-dom' && !args.importer.replaceAll('\\', '/').endsWith('/erp-document-detail-body.tsx')) return;
      for (const key of Object.keys(focusLeaves)) if (args.path.endsWith(key)) return { path: key, namespace: 'generic-focus-qa' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'generic-focus-qa' }, args => ({ contents: focusLeaves[args.path], loader: 'tsx', resolveDir: app }));
  } }],
});
test('RecordDialog yields focus and Escape/Tab to the moved workflow sheet and QR camera', async () => {
  const { RecordDialog, ErpDocumentDetailBody: FocusBody } = require(path.join(output, 'focus.cjs'));
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'MutationObserver', 'getComputedStyle', 'qaGenericDetail'];
  const previous = new Map(globals.map(key => [key, globalThis[key]]));
  const listeners = new Map();
  class Element {
    constructor(parentElement = null, zIndex = 'auto', role = null) { Object.assign(this, { parentElement, zIndex, role, isConnected: true, tabIndex: -1, focused: 0 }); }
    closest() { return null; }
    getClientRects() { return [{}]; }
    getAttribute(key) { return key === 'role' ? this.role : null; }
    matches() { return false; }
    contains(node) { for (let current = node; current; current = current.parentElement) if (current === this) return true; return false; }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    addEventListener() {}
    removeEventListener() {}
    focus() { this.focused++; globalThis.document.activeElement = this; }
  }
  const body = new Element(), surface = new Element(body, '45'), content = new Element(surface, 'auto', 'dialog');
  const higherSurface = new Element(body, '50'), modal = new Element(higherSurface, '10', 'dialog'), input = new Element(modal);
  let higherVisible = false, closed = 0;
  globalThis.HTMLElement = globalThis.Node = Element;
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.getComputedStyle = node => ({ display: 'block', visibility: 'visible', opacity: '1', zIndex: node.zIndex });
  globalThis.document = { body: { style: { overflow: '' } }, hidden: false, activeElement: null,
    querySelectorAll: () => higherVisible ? [content, modal] : [content],
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  globalThis.qaGenericDetail = { read: async () => data() };
  let tree;
  const event = key => ({ key, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });
  try {
    const render = module => React.createElement(RecordDialog, { open: true, title: 'Kiểm thử', closeLabel: 'Đóng chi tiết', onRequestClose: () => closed++ },
      React.createElement(FocusBody, { key: module, module, branchId: 'QA', documentId: 'QA-DOC', onClose: noop, onChanged: noop }));
    await act(async () => { tree = create(render('inbound-requests'), { createNodeMock: element => element.props.className === 'request-detail-dialog' ? content : new Element(content) }); });
    await flush();
    assert.ok(content.focused > 0);
    for (const screenModule of ['inbound-requests', 'warehouse-qr']) {
      if (screenModule === 'warehouse-qr') { await act(async () => tree.update(render(screenModule))); await flush(); }
      if (screenModule === 'warehouse-qr') await act(async () => button(tree, 'Quét thêm mã QR').props.onClick());
      else { await menu(tree); await act(async () => button(tree, 'Gửi đề nghị').props.onClick()); }
      await flush();
      const dialogs = tree.root.findAllByProps({ role: 'dialog' });
      assert.equal(dialogs.length, 2, 'both real dialog surfaces remain rendered');
      assert.ok(tree.root.findAllByProps({ 'aria-label': 'Đóng' }).length > 0, 'the portal sheet has its original close button');
      higherVisible = true;
      globalThis.document.activeElement = input;
      const focused = content.focused;
      listeners.get('focusin')({ target: input });
      const escape = event('Escape'), tab = event('Tab');
      listeners.get('keydown')(escape); listeners.get('keydown')(tab);
      assert.equal(closed, 0);
      assert.equal(escape.prevented, undefined);
      assert.equal(tab.prevented, undefined);
      assert.equal(content.focused, focused, 'the lower trap must not steal modal focus');
      await act(async () => tree.root.findByProps({ 'aria-label': 'Đóng' }).props.onClick());
      higherVisible = false;
      assert.equal(tree.root.findAllByProps({ role: 'dialog' }).length, 1);
    }
    const escape = event('Escape');
    listeners.get('keydown')(escape);
    assert.equal(closed, 1, 'Escape returns to the lower dialog after the sheets close');
    assert.equal(escape.prevented, true);
  } finally {
    if (tree) await act(async () => tree.unmount());
    for (const [key, value] of previous) if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
});
