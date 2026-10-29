import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime', 'p2-forms');
await mkdir(output, { recursive: true });
const clientStub = `export const erpClient = {
  async getScreenMetadata() { return {caption:'Chứng từ tổng hợp',lookups:[]}; },
  async getErpModuleActions() { return [{id:'create',visible:true,enabled:true}]; },
  async getErpModuleList() { return {rows:[],page:1,hasMore:false}; },
  async getLookupOptions() { return {items:[{id:'QA-CUSTOMER',label:'Khách tổng hợp',fields:{ObjectName:'Khách tổng hợp',Address:'Địa chỉ tổng hợp',TaxCode:'QA-TAX'}}],page:1,hasMore:false}; },
  async getErpModuleDetail() { return globalThis.__formDetail; },
  async createDocument(module,intent) {
    globalThis.__formCalls.push({module,...intent});
    if(globalThis.__formHold) await globalThis.__formHold;
    return {outcome:globalThis.__formOutcome??'Denied'};
  },
  async saveDocument(module,intent) {
    globalThis.__formSaves.push({module,...intent});
    if(globalThis.__formHold) await globalThis.__formHold;
    return {outcome:globalThis.__formOutcome??'Denied'};
  }
};`;
// Keep the actual FormSheet/FormField and all business components. Replace only
// transport, portal placement and lookup selection for deterministic interaction.
const lookupStub = `import {FormField} from '@/components/app/form-field';
export const fieldText=v=>v==null?'':String(v);
export const choiceLabel=(c,f)=>c?.label||f;
export function LookupField({label,required,error,value,lookupId,onSelect,multiple,onMultiSelect}) {
  return <FormField label={label} required={required} error={error}>{control=><button {...control} type="button"
    data-lookup={lookupId} data-value={value} onPick={multiple?onMultiSelect:onSelect}>{value||'Chọn từ danh mục'}</button>}</FormField>;
}`;
const portalStub = `export const AppSheet=({open,title,onClose,children})=>open?<div data-form-dialog="" className="flex h-dvh flex-col">
  <header><h2>{title}</h2><button type="button" className="size-11" aria-label="Đóng" onClick={onClose}>×</button></header>{children}</div>:null;`;
await build({
  stdin: { contents: `export {PurchaseRequestCreateSheet} from './components/untitledui/purchase-request-create-sheet';
    export {PurchaseOrderCreateSheet} from './components/untitledui/purchase-order-create-sheet';
    export {TabErpScreen} from './components/untitledui/tab-erp-screen';
    export {FormSheet} from './components/app/form-sheet';`, loader: 'tsx', resolveDir: app },
  outfile: path.join(output, 'fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'form-fixtures', setup(builder) {
    const stubs = { 'erp-client': clientStub, 'lookup-field': lookupStub, 'app-sheet': portalStub,
      'document-detail-dialog': 'export const DocumentDetailDialog=()=>null;' };
    builder.onResolve({ filter: /(?:erp-client|lookup-field|app-sheet|document-detail-dialog)$/ }, args => {
      const key = args.path.split('/').at(-1);
      return stubs[key] ? { path: key, namespace: 'fixture' } : null;
    });
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], loader: 'tsx', resolveDir: app }));
  } }],
});
const require = createRequire(import.meta.url);
const React = require('react');
const { create, act } = require('react-test-renderer');
const { PurchaseRequestCreateSheet: PR, PurchaseOrderCreateSheet: PO, TabErpScreen, FormSheet } = require(path.join(output, 'fixture.cjs'));
const h = React.createElement;
const text = node => typeof node === 'string' ? node : node.children.map(text).join('');
const native = tree => tree.root.findAll(node => typeof node.type === 'string');
const button = (tree, label) => tree.root.findAllByType('button').find(node => text(node) === label);
const lookup = (tree, id) => tree.root.findAllByType('button').find(node => node.props['data-lookup'] === id);
const form = tree => tree.root.findAllByType('form').find(node => node.props.noValidate === true);
const footer = tree => tree.root.findByType('footer');
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => {}); };
const choice = (id, fields = {}) => ({ id, label: id, fields });
async function pick(tree, id, value) { await act(async () => lookup(tree, id).props.onPick(value)); await flush(); }
async function set(tree, label, value) {
  const node = tree.root.findAllByType('label').find(node => text(node).replaceAll('*', '').trim() === label);
  assert.ok(node?.props.htmlFor, 'linked label: ' + label);
  const control = native(tree).find(control => control.props.id === node.props.htmlFor);
  await act(async () => control.props.onChange({ target: { value } })); await flush();
}
async function submit(tree) { await act(async () => form(tree).props.onSubmit({ preventDefault() {} })); await flush(); }
async function click(tree, label) { assert.ok(button(tree, label), label); await act(async () => button(tree, label).props.onClick()); await flush(); }
async function mounted(component, mobile, run, props = {}) {
  const previous = { window: globalThis.window, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.window = { matchMedia: () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} }) };
  globalThis.__formCalls = []; globalThis.__formSaves = []; globalThis.__formOutcome = 'Denied'; globalThis.__formHold = null;
  let tree;
  try {
    await act(async () => { tree = create(h(component, { open: true, onClose() {}, currentBranch: 'QA-BRANCH', ...props }),
      { createNodeMock: () => ({ scrollIntoView() {} }) }); });
    await flush();
    if (component === TabErpScreen) await click(tree, 'Tạo mới');
    await run(tree);
  } finally {
    if (tree) await act(async () => tree.unmount());
    if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    if (previous.act === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT; else globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    delete globalThis.__formHold;
  }
}

// react-test-renderer has no native defaults: model submit-button activation
// and implicit input submission only after an uncancelled Enter keydown.
async function activateFooter(tree) {
  const primary = footer(tree).findAllByType('button').find(node => node.props.type === 'submit');
  assert.ok(primary);
  assert.equal(primary.props.form, form(tree).props.id);
  assert.equal(primary.props.disabled, false);
  await submit(tree);
}
async function keyDown(tree, control, key = 'Enter') {
  const event = { key, target: { tagName: control.type.toUpperCase() }, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; } };
  await act(async () => form(tree).props.onKeyDown?.(event));
  if (!event.defaultPrevented && key === 'Enter' &&
    (control.type === 'input' || (control.type === 'button' && control.props.type === 'submit'))) await activateFooter(tree);
  return event.defaultPrevented;
}

for (const currentStep of [0, 1]) test(`FormSheet: Enter in input/select never submits or advances at step ${currentStep + 1}`, async () => {
  let submissions = 0, advances = 0;
  await mounted(FormSheet, false, async tree => {
    for (const control of native(tree).filter(node => node.type === 'input' || node.type === 'select')) {
      assert.equal(await keyDown(tree, control), true, `${control.type} Enter cancels its default`);
      assert.equal(await keyDown(tree, control, 'ArrowDown'), false, 'other keys keep their defaults');
      assert.equal(submissions, 0); assert.equal(advances, 0);
    }
    await activateFooter(tree);
    assert.equal(submissions, currentStep === 1 ? 1 : 0);
    assert.equal(advances, currentStep === 0 ? 1 : 0);
  }, { title: 'Tạo chứng từ', submitLabel: 'Tạo chứng từ', currentStep,
    steps: [{ id: 'header', label: 'Thông tin' }, { id: 'review', label: 'Kiểm tra' }],
    onSubmit() { submissions++; }, onNext() { advances++; },
    children: h('div', null, h('input', { type: 'text' }), h('input', { type: 'search' }),
      h('select', null, h('option', { value: 'QA' }, 'Tổng hợp'))) });
});

test('FormSheet: textarea Enter keeps newline behavior; footer click submits exactly once', async () => {
  let submissions = 0, advances = 0;
  await mounted(FormSheet, false, async tree => {
    assert.equal(await keyDown(tree, tree.root.findByType('textarea')), false, 'textarea Enter is not cancelled');
    assert.equal(submissions, 0); assert.equal(advances, 0);
    await activateFooter(tree);
    assert.equal(submissions, 1); assert.equal(advances, 0);
  }, { title: 'Tạo chứng từ', submitLabel: 'Tạo chứng từ', children: h('textarea'),
    onSubmit() { submissions++; }, onNext() { advances++; } });
});

test('FormSheet: Enter on the focused footer submit button still submits exactly once', async () => {
  let submissions = 0;
  await mounted(FormSheet, false, async tree => {
    assert.equal(await keyDown(tree, button(tree, 'Tạo chứng từ')), false, 'button Enter is not cancelled');
    assert.equal(submissions, 1);
  }, { title: 'Tạo chứng từ', submitLabel: 'Tạo chứng từ', children: h('input'), onSubmit() { submissions++; } });
});

for (const mobile of [true, false]) for (const [name, component, props, label] of [
  ['PR', PR, {}, 'Tạo đề nghị mua'], ['PO', PO, {}, 'Tạo đơn mua'],
  ['sales', TabErpScreen, { module: 'sales-orders', isActive: true }, 'Tạo đơn hàng'],
  ['generic', TabErpScreen, { module: 'machine-movements', isActive: true }, 'Tạo chứng từ'],
]) test(`${name}: ${mobile ? 'mobile matchMedia' : 'desktop'} shared footer, button order and required labels`, async () => {
  await mounted(component, mobile, async tree => {
    assert.equal(form(tree).props.noValidate, true, 'keep application validation authoritative');
    assert.match(footer(tree).props.className, /sticky bottom-0.*safe-area-inset-bottom.*dark:bg-neutral-900/);
    const labels = footer(tree).findAllByType('button').map(text);
    assert.deepEqual(labels, ['Hủy', mobile && name !== 'generic' ? 'Tiếp tục' : label]);
    assert.equal(form(tree).findAllByType('footer').length, 1);
    for (const control of footer(tree).findAllByType('button')) assert.match(control.props.className, /min-h-11/);
    const required = tree.root.findAllByType('label').filter(node => text(node).includes('*'));
    assert.ok(required.length >= 2);
    for (const node of required) { assert.doesNotMatch(text(node), /\(\*\):/); assert.match(node.props.className, /text-sm.*font-medium/); }
    assert.ok(native(tree).some(node => typeof node.props.className === 'string' && node.props.className.includes('overflow-y-auto')));
  }, props);
});

// Synthetic pre-P2 fixture values: exact existing request keys, nulls and decimal
// strings. Generated identities are checked independently, never normalized away.
const expectedPR = {
  purchaseDate: '2026-10-24T00:00:00.000', purposeId: null, personSuggest: 'QA-EMP', department: 'QA-DEPT',
  purposeDescOrClient: 'Mục đích tổng hợp', price: '123.45', notes: 'Ghi chú tổng hợp', currencyId: 'USD', objectId: '', rateExchange: null,
};
const expectedPO = {
  documentDate: '2026-10-24T00:00:00.000', objectId: 'QA-SUPPLIER', memo: 'Nội dung tổng hợp', notes: 'Ghi chú tổng hợp',
  deliverDate: '2026-10-25T00:00:00.000', currencyId: 'USD', rateExchange: 2.5, searchField: null, contractId: 'QA-CONTRACT',
};
async function fillPurchase(tree, kind) {
  await set(tree, kind === 'PR' ? 'Ngày đề nghị' : 'Ngày lập', '2026-10-24');
  if (kind === 'PR') {
    await pick(tree, 'header.PersonSuggest', [choice('QA-EMP')]); await pick(tree, 'header.Department', [choice('QA-DEPT')]);
    await set(tree, 'Mục đích / Khách hàng', ' Mục đích tổng hợp '); await set(tree, 'Giá bán', '123.45');
  } else {
    await pick(tree, 'header.ObjectID', choice('QA-SUPPLIER')); await set(tree, 'Ngày giao hàng', '2026-10-25');
    await set(tree, 'Mã hợp đồng', ' QA-CONTRACT '); await set(tree, 'Nội dung (Memo)', ' Nội dung tổng hợp ');
  }
  // ERP 29/10: the purchase request keeps the currency but has no rate field; the PO still has one.
  await pick(tree, 'header.CurrencyID', choice('USD', { RateExchange: 3 })); if (kind === 'PO') await set(tree, 'Tỷ giá', '2.5');
  await set(tree, 'Ghi chú', ' Ghi chú tổng hợp ');
}
for (const [kind, component, expected] of [['PR', PR, expectedPR], ['PO', PO, expectedPO]]) {
  for (const mobile of [true, false]) test(`${kind}: ${mobile ? 'mobile steps' : 'desktop'} retains exact create payload fixture`, async () => {
    await mounted(component, mobile, async tree => {
      await submit(tree); assert.equal(globalThis.__formCalls.length, 0, 'invalid input never dispatches');
      await fillPurchase(tree, kind);
      if (mobile) { await submit(tree); assert.deepEqual(footer(tree).findAllByType('button').map(text), ['Quay lại', 'Tiếp tục']); }
      await pick(tree, 'lines.ItemID', choice('QA-ITEM'));
      await set(tree, 'Số lượng', '2.25'); await set(tree, 'Đơn giá', '999999999999.75');
      if (kind === 'PR') { await set(tree, 'Model', ' Model tổng hợp '); await set(tree, 'Ngân sách', '34.5'); await set(tree, 'Thời gian yêu cầu', ' Tháng 11 '); }
      else await set(tree, 'Ghi chú dòng', ' Dòng tổng hợp ');
      if (mobile) { await submit(tree); assert.equal(globalThis.__formCalls.length, 0); assert.equal(footer(tree).findAllByType('button').map(text)[0], 'Quay lại'); }
      await submit(tree);
      assert.equal(globalThis.__formCalls.length, 1);
      const intent = globalThis.__formCalls[0];
      assert.equal(intent.module, kind === 'PR' ? 'purchase-requests' : 'purchase-orders');
      assert.equal(intent.branchId, 'QA-BRANCH'); assert.match(intent.idempotencyKey, /^crt-[a-z0-9]+-[a-z0-9]+$/);
      assert.deepEqual(intent.header, expected);
      assert.equal(intent.lines.length, 1); assert.match(intent.lines[0].clientLineKey, /^line-[a-z0-9]+-[a-z0-9]+$/);
      assert.deepEqual(intent.lines[0].values, kind === 'PR'
        ? { itemId: 'QA-ITEM', quantity: '2.25', unitPrice: '999999999999.75', budget: '34.5', timeRequired: 'Tháng 11', model: 'Model tổng hợp' }
        : { itemId: 'QA-ITEM', quantity: '2.25', unitPrice: '999999999999.75', notes: 'Dòng tổng hợp', quantity2: null, property: null, property2: null });
    });
  });
}

test('sales mobile: final create and OutcomeUnknown retry preserve the entire intent and one pending draft', async () => {
  await mounted(TabErpScreen, true, async tree => {
    await set(tree, 'Ngày lập chứng từ', '2026-10-24'); await set(tree, 'Ngày giao', '2026-10-25');
    await pick(tree, 'header.ObjectID', choice('QA-CUSTOMER', { ObjectName: 'Khách tổng hợp', Address: 'Địa chỉ tổng hợp', TaxCode: 'QA-TAX' }));
    await pick(tree, 'header.EmployeeID', choice('QA-EMP')); await set(tree, 'Diễn giải', ' Memo tổng hợp ');
    await set(tree, 'Ghi chú đơn hàng', ' Ghi chú tổng hợp '); await set(tree, 'Link tài liệu đính kèm', 'https://example.test/qa');
    await submit(tree); assert.equal(globalThis.__formCalls.length, 0);
    await pick(tree, 'lines.ItemID', choice('QA-ITEM', { Quantity: '2.25', UnitPrice: '12.5', DiscountPercent: '2', VATPercent: '8', VATQuantity: '1', DienGiai: 'Diễn giải dòng', Notes: 'Ghi chú dòng' }));
    await submit(tree); assert.equal(globalThis.__formCalls.length, 0);
    globalThis.__formOutcome = 'OutcomeUnknown'; await submit(tree);
    assert.equal(globalThis.__formCalls.length, 1);
    const first = globalThis.__formCalls[0];
    assert.deepEqual(first.header, { documentDate: '2026-10-24T00:00:00.000', objectId: 'QA-CUSTOMER', employeeId: 'QA-EMP', isOrder: true,
      currencyId: 'VND', rateExchange: 1, deliverDate: '2026-10-25T00:00:00.000', memo: 'Memo tổng hợp', ghiChuDonHang: 'Ghi chú tổng hợp', managerId: null, taxCode: 'QA-TAX', linkId: 'https://example.test/qa' });
    assert.deepEqual(first.lines[0].values, { itemId: 'QA-ITEM', quantity: '2.25', unitPrice: '12.5', discountPercent: '2', vATPercent: '8', vATQuantity: '1', dienGiai: 'Diễn giải dòng', notes: 'Ghi chú dòng' });
    assert.match(first.idempotencyKey, /^crt-\d+-[a-z0-9]+$/); assert.match(first.lines[0].clientLineKey, /^so-/);
    assert.deepEqual(footer(tree).findAllByType('button').map(text), ['Đóng', 'Kiểm tra / tiếp tục']);
    await submit(tree); assert.equal(globalThis.__formCalls.length, 2); assert.deepEqual(globalThis.__formCalls[1], first);
  }, { module: 'sales-orders', isActive: true });
});

test('PR edit: save label, permission gate, double submit lock and uncertain retry retain the original save intent', async () => {
  const detail = { documentId: 'QA-PR', branchId: 'QA-BRANCH', stateToken: 'a'.repeat(64), header: { ...expectedPR, purchaseDate: '2026-10-24T13:14:15.000', purposeId: 7, objectId: 'QA-LEGACY' },
    lines: { rows: [{ lineId: 'QA-LINE', fields: { itemId: 'QA-ITEM', quantity: '2', unitPrice: '3', model: null, budget: null, timeRequired: null } }], page: 1, hasMore: false },
    actions: [{ id: 'save', visible: true, enabled: true }] };
  globalThis.__formDetail = detail;
  await mounted(PR, false, async tree => {
    assert.deepEqual(footer(tree).findAllByType('button').map(text), ['Hủy', 'Lưu thay đổi']);
    let release; globalThis.__formHold = new Promise(resolve => { release = resolve; }); globalThis.__formOutcome = 'OutcomeUnknown';
    act(() => { form(tree).props.onSubmit({ preventDefault() {} }); form(tree).props.onSubmit({ preventDefault() {} }); });
    await flush(); assert.equal(globalThis.__formSaves.length, 1);
    await act(async () => release()); globalThis.__formHold = null; await flush();
    assert.equal(button(tree, 'Hủy').props.disabled, true); assert.ok(button(tree, 'Thử lại lưu'));
    await submit(tree); assert.equal(globalThis.__formSaves.length, 2); assert.deepEqual(globalThis.__formSaves[1], globalThis.__formSaves[0]);
    const intent = globalThis.__formSaves[0];
    assert.equal(intent.expectedStateToken, detail.stateToken); assert.equal(intent.header.purchaseDate, detail.header.purchaseDate);
    assert.equal(intent.header.purposeId, 7); assert.equal(intent.header.objectId, 'QA-LEGACY'); assert.deepEqual(intent.lineChanges, []);
  }, { documentId: 'QA-PR' });
  globalThis.__formDetail = { ...detail, actions: [{ id: 'save', visible: true, enabled: false }] };
  await mounted(PR, false, async tree => { assert.equal(button(tree, 'Lưu thay đổi').props.disabled, true); await submit(tree); assert.equal(globalThis.__formSaves.length, 0); }, { documentId: 'QA-PR' });
});

test('generic catalog lookups preserve the existing payload; request lookup without branch prerequisites stays a clear text field', async () => {
  for (const [moduleId, lookupId] of [['machine-movements', 'header.MoveTypeID'], ['machine-repairs', 'header.ServiceTypeID']]) {
    await mounted(TabErpScreen, true, async tree => {
      await pick(tree, lookupId, choice('QA-TYPE')); await pick(tree, 'lines.AssetID', choice('QA-ASSET'));
      await submit(tree); assert.equal(globalThis.__formCalls.length, 1);
      // Existing generic handlers use fixed type IDs. P2-04 must not change that
      // payload behavior while replacing the former raw-code inputs with lookups.
      assert.equal(globalThis.__formCalls[0].header[moduleId === 'machine-movements' ? 'moveTypeId' : 'serviceTypeId'], moduleId === 'machine-movements' ? 'MOVE01' : 'SRV01');
      assert.equal(globalThis.__formCalls[0].lines[0].values.assetId, 'QA-ASSET');
    }, { module: moduleId, isActive: true });
  }
  await mounted(TabErpScreen, true, async tree => {
    assert.equal(lookup(tree, 'lines.RequestID'), undefined);
    await set(tree, 'Mã đề nghị điều chuyển', 'QA-REQUEST');
    assert.ok(native(tree).some(node => node.type === 'p' && text(node).includes('chi nhánh nguồn và đích')));
  }, { module: 'internal-transfer-batches', isActive: true });
});

test('all three owned forms share the responsive hook and the create region has no forced black labels', async () => {
  for (const name of ['purchase-request-create-sheet', 'purchase-order-create-sheet', 'tab-erp-screen']) {
    const source = await readFile(path.join(app, 'components/untitledui', name + '.tsx'), 'utf8');
    assert.match(source, /useIsMobile/); assert.doesNotMatch(source, /matchMedia/);
    const create = name === 'tab-erp-screen' ? source.slice(source.indexOf('{createModalOpen && (')) : source;
    assert.doesNotMatch(create, /text-black|\(\*\):/);
  }
});
