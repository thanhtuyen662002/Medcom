import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/document-detail-sales');
await mkdir(output, { recursive: true });
const leaves = {
  'erp-client': `export const erpClient={getErpModuleDetail:(...args)=>globalThis.qaDetailSales.read(...args),getErpContract:(...args)=>globalThis.qaDetailSales.contract(...args),saveDocument:(module,intent)=>globalThis.qaDetailSales.send(module,'save',intent),deleteDocument:(module,intent)=>globalThis.qaDetailSales.send(module,'delete',intent),executeWorkflowAction:(...args)=>globalThis.qaDetailSales.send(...args),lookupCommand:(...args)=>globalThis.qaDetailSales.lookup(...args)};`,
  'lookup-field': `export const LookupField=props=><div data-lookup={props.lookupId} {...props}/>;`,
  'bottom-sheet': `export const UntitledBottomSheet=({open,children,title})=>open?<section data-sheet={title}>{children}</section>:null;`,
  'record-dialog': `export const RecordActionBar=({children})=><footer>{children}</footer>;export const RecordDetailHeading=({children})=><header>{children}</header>;export const RecordDetailStatus=({children})=><div>{children}</div>;`,
  'request-presentation': `import React from 'react';export const RecordDetailContext=React.createContext(true);export const RequestButton=({children,variant,...props})=><button {...props}>{children}</button>;export const RequestInput=props=><input {...props}/>;export const RequestTextarea=props=><textarea {...props}/>;export const requestStyles={actions:''};`,
  'sales-order-attachment-list': `export const SalesOrderAttachmentList=props=><div data-attachments {...props}/>;`,
  'sales-order-action-dialog': `export const SalesOrderActionDialog=props=><div data-action={props.operation} {...props}/>;`,
  'sales-order-line-editor': `export const SalesOrderLineEditor=props=><div data-editor {...props}/>;`,
};
await build({
  stdin: { contents: `export {SalesOrderForm} from './components/erp/sales-order-form';
    export {useSalesOrderDetail} from './lib/erp/document-detail/controllers/use-sales-order-detail';
    export {salesOrderDetailConfig} from './lib/erp/document-detail/modules/sales';
    export {getDocumentDetailEntry} from './lib/erp/document-detail/registry';
    export {DocumentDetailView} from './components/erp/document-detail/document-detail-view';
    export {SALES_ORDER_LINE_COLUMNS,SALES_ORDER_LINE_GROUPS} from './lib/erp/sales-order-lines';`, loader: 'tsx', resolveDir: app },
  outfile: path.join(output, 'fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'sales-detail-leaves', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (!/(?:sales-order-form\.tsx|use-sales-order-detail\.ts|document-detail\/[^/]+\.tsx)$/.test(args.importer.replaceAll('\\', '/'))) return;
      for (const key of Object.keys(leaves)) if (args.path.endsWith(key)) return { path: key, namespace: 'sales-detail-qa' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'sales-detail-qa' }, args => ({ contents: leaves[args.path], loader: 'tsx', resolveDir: app }));
  } }],
});
const require = createRequire(import.meta.url);
const React = require('react'), { create, act } = require('react-test-renderer');
const { SalesOrderForm, useSalesOrderDetail, salesOrderDetailConfig: config, getDocumentDetailEntry, DocumentDetailView, SALES_ORDER_LINE_COLUMNS, SALES_ORDER_LINE_GROUPS } = require(path.join(output, 'fixture.cjs'));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const page = rows => ({ rows, page: 1, pageSize: 50, hasMore: false });
const line = { lineId: 'QA-LINE', fields: { itemId: 'QA-ITEM', itemName: 'Hàng kiểm thử', unit: 'Cái', quantity: '2', unitPrice: '10', amount: '20', totalAmount: '20' } };
const detail = () => ({ documentId: 'QA-DOC', branchId: 'QA', stateToken: 'a'.repeat(64),
  header: { documentDate: '2026-10-23T00:00:00', branchId: 'QA', branchName: 'Chi nhánh kiểm thử', objectId: 'QA-CUSTOMER', objectName: 'Khách hàng kiểm thử', address: 'Địa chỉ kiểm thử', contractId: 'QA-CONTRACT', contractName: 'Hợp đồng kiểm thử', employeeId: 'QA-EMPLOYEE', employeeName: 'Nhân viên kiểm thử', currencyId: 'VND', isLocked: false, statusId: 12 },
  lines: page([line]), history: page([]), actions: ['save', 'send-pm', 'recall', 'contract-info', 'delete'].map(id => ({ id, visible: true, enabled: true })),
});
const textOf = node => node.children.map(child => typeof child === 'string' ? child : textOf(child)).join('');
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => {}); };
const button = (tree, label) => tree.root.findAllByType('button').find(node => textOf(node) === label);
async function mounted(verify, { module = 'sales-orders', data = detail(), api = {}, props = {}, controller = false } = {}) {
  const previousWindow = globalThis.window;
  const listeners = new Map();
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } };
  globalThis.qaDetailSales = { read: async () => structuredClone(data), ...api };
  let tree, state;
  function Probe() { state = useSalesOrderDetail({ branchId: 'QA', documentId: 'QA-DOC', module, onClose: noop, onChanged: noop, ...props }); return null; }
  try {
    await act(async () => { tree = create(controller ? React.createElement(Probe) : React.createElement(SalesOrderForm, { branchId: 'QA', documentId: 'QA-DOC', module, onClose: noop, onChanged: noop, ...props })); });
    await flush();
    await verify(tree, () => state, listeners);
  } finally {
    if (tree) await act(async () => tree.unmount());
    delete globalThis.qaDetailSales;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
}

test('sales columns retain the seven ordered summary keys and every imported expansion field', () => {
  assert.deepEqual(config.lines.columns.filter(column => column.inTable !== false).map(column => column.key), ['itemName', 'itemId', 'unit', 'quantity', 'unitPrice', 'amount', 'totalAmount']);
  assert.deepEqual(config.lines.expandGroups, SALES_ORDER_LINE_GROUPS);
  assert.equal(config.lines.columns.length, new Set(config.lines.columns.map(column => column.key)).size);
  for (const group of config.lines.expandGroups) for (const key of group.keys) assert.ok(config.lines.columns.some(column => column.key === key), key);
  for (const column of SALES_ORDER_LINE_COLUMNS) assert.equal(config.lines.columns.find(configured => configured.key === column.key).label, column.label);
  for (const key of ['unitPrice', 'amount', 'totalAmount']) assert.equal(config.lines.columns.find(column => column.key === key).format, 'money');
  assert.equal(config.lines.columns.find(column => column.key === 'quantity').format, 'number');
});

test('sales header fields cover the sanitized AR_OrderTbl catalog without rendering workflow metadata', async () => {
  const catalog = JSON.parse(await readFile(path.join(app, '../../inventories/source/20261010/catalog-columns.json'), 'utf8'));
  const fields = config.groups.flatMap(group => [...group.fields, ...(group.subgroups ?? []).flatMap(subgroup => subgroup.fields)]);
  const visible = new Set(fields.flatMap(field => [field.key, field.displayKey, field.secondaryKey].filter(Boolean)));
  const hidden = new Set(config.hidden);
  for (const column of catalog.columns.filter(column => column.object === 'AR_OrderTbl')) {
    const normalized = column.name.replaceAll('ID', 'Id').replaceAll('QR', 'Qr');
    const key = normalized[0].toLowerCase() + normalized.slice(1);
    assert.ok(visible.has(key) || hidden.has(key), key);
  }
  for (const key of ['linkId', 'documentUrl', 'statusId', 'statusName', 'isLocked', 'documentId', 'objectReferenceState', 'documentDateDisplay']) assert.ok(hidden.has(key), key);
  const customer = fields.find(field => field.key === 'objectId');
  const contract = fields.find(field => field.key === 'contractId');
  assert.deepEqual(customer.edit.lookupContext, { ContractID: null });
  assert.deepEqual(customer.edit.secondaryFields, ['ObjectName', 'Address']);
  assert.deepEqual(contract.edit.lookupContext, { ObjectID: 'objectId' });
  assert.deepEqual(contract.edit.secondaryFields, ['ContractName', 'ObjectName']);
});

test('registry admits only the three sales modules with a consistent body', () => {
  for (const moduleId of ['sales-orders', 'sales-order-pm', 'sales-order-sa']) {
    const entry = getDocumentDetailEntry(moduleId);
    assert.equal(entry.config, config);
    assert.equal(typeof entry.Body, 'function');
  }
  assert.ok(getDocumentDetailEntry('purchase-orders') !== null && getDocumentDetailEntry('purchase-orders').config !== config && getDocumentDetailEntry('purchase-orders').Body !== getDocumentDetailEntry('sales-orders').Body);
  assert.ok(getDocumentDetailEntry('inbound-requests') !== null && getDocumentDetailEntry('inbound-requests').config !== config && getDocumentDetailEntry('inbound-requests').Body !== getDocumentDetailEntry('sales-orders').Body);
});

test('sales detail renders named groups, customer and unlocked badge without raw header keys', async () => {
  await mounted(async tree => {
    const text = textOf(tree.root);
    assert.match(text, /Thông tin đơn hàng/);
    assert.match(text, /Khách hàng & hợp đồng/);
    assert.match(text, /Khách hàng kiểm thử/);
    assert.match(text, /Chưa khóa/);
    assert.match(text, /Đơn vị tiềnVND/);
    assert.doesNotMatch(text, /\bfalse\b|objectId|isLocked/);
    assert.equal(tree.root.findByType(DocumentDetailView).props.config, config);
    assert.equal(tree.root.findAllByProps({ 'data-attachments': true }).length, 1);
  });
});

test('PM retains its notice and never presents Sales editing even if save is visible', async () => {
  await mounted(async tree => {
    assert.match(textOf(tree.root), /Xác nhận đơn hàng · PM/);
    assert.equal(button(tree, 'Sửa'), undefined);
    await act(async () => tree.root.findByProps({ 'aria-label': 'Thao tác khác' }).props.onClick());
    assert.equal(button(tree, 'Xóa đơn hàng'), undefined);
  }, { module: 'sales-order-pm' });
});

test('onLookupSelect uses the original pick to clear contract and lines and retain the chosen address', async () => {
  await mounted(async tree => {
    await act(async () => button(tree, 'Sửa').props.onClick());
    const view = () => tree.root.findByType(DocumentDetailView);
    const choice = { id: 'QA-OTHER', label: 'Khách mới kiểm thử', fields: { ObjectName: 'Khách mới kiểm thử', Address: 'Địa chỉ mới kiểm thử' } };
    await act(async () => view().props.handlers.onLookupSelect('objectId', choice));
    assert.equal(view().props.model.draft.contractId, '');
    assert.equal(view().props.model.choices.contractId, null);
    assert.deepEqual(tree.root.findByProps({ 'data-editor': true }).props.lines, []);
    assert.equal(view().props.model.choices.objectId, choice);
    assert.match(textOf(tree.root), /Khách hàng\/hợp đồng đã đổi\. Hãy chọn lại hàng hóa phù hợp trước khi lưu\./);
    assert.match(textOf(tree.root), /Địa chỉ mới kiểm thử/);
    const customer = tree.root.findByProps({ 'data-lookup': 'header.ObjectID' });
    assert.equal(customer.props.choice, choice);
    assert.deepEqual(customer.props.context, { ContractID: null });
    assert.deepEqual(tree.root.findByProps({ 'data-lookup': 'header.ContractID' }).props.context, { ObjectID: 'QA-OTHER' });
    await act(async () => button(tree, 'Hủy sửa').props.onClick());
    assert.equal(view().props.model.draft.contractId, 'QA-CONTRACT');
    assert.equal(view().props.model.editing, false);
    assert.equal(view().props.model.feedback, null);
  });
});

test('field lookup forwards the full choice through the optional handler', async () => {
  await mounted(async tree => {
    await act(async () => button(tree, 'Sửa').props.onClick());
    const employee = { id: 'QA-EMPLOYEE-2', label: 'Nhân viên thứ hai', fields: { EmployeeName: 'Nhân viên thứ hai' } };
    await act(async () => tree.root.findByProps({ 'data-lookup': 'header.EmployeeID' }).props.onSelect(employee));
    const model = tree.root.findByType(DocumentDetailView).props.model;
    assert.equal(model.draft.employeeId, employee.id);
    assert.equal(model.choices.employeeId, employee);
  });
});

test('dirty editing preserves close guard and beforeunload, and discard releases both', async () => {
  let guard;
  await mounted(async (tree, state, listeners) => {
    assert.equal(guard(), true);
    await act(async () => button(tree, 'Sửa').props.onClick());
    await act(async () => tree.root.findByType(DocumentDetailView).props.handlers.onFieldChange('memo', 'Nội dung kiểm thử'));
    await act(async () => assert.equal(guard(), false));
    assert.match(textOf(tree.root), /Hãy lưu thay đổi hoặc Hủy sửa trước khi đóng\./);
    let prevented = false;
    const event = { preventDefault() { prevented = true; } };
    listeners.get('beforeunload')(event);
    assert.equal(prevented, true);
    assert.equal(event.returnValue, '');
    await act(async () => button(tree, 'Hủy sửa').props.onClick());
    assert.equal(guard(), true);
    assert.equal(listeners.has('beforeunload'), false);
  }, { props: { onCloseGuardChange: value => { guard = value; } } });
  assert.equal(guard, null);
});

test('contract menu opens the retained modal and passes exact module and document scope', async () => {
  const calls = [];
  await mounted(async tree => {
    await act(async () => tree.root.findByProps({ 'aria-label': 'Thao tác khác' }).props.onClick());
    await act(async () => button(tree, 'Thông tin hợp đồng').props.onClick());
    assert.deepEqual(calls, [['sales-orders', { branchId: 'QA', documentId: 'QA-DOC' }]]);
    assert.match(textOf(tree.root.findByProps({ 'data-sheet': 'Thông tin hợp đồng' })), /QA-CONTRACT-NO/);
  }, { api: { contract: async (...args) => { calls.push(args); return { contractNo: 'QA-CONTRACT-NO' }; } } });
});

test('history pagination appends same-version pages through the original more function', async () => {
  const data = detail(); data.history = { ...page([{ lineId: 'QA-H1', fields: { notes: 'Lần đầu kiểm thử' } }]), hasMore: true };
  const reads = [];
  await mounted(async (tree, state) => {
    await act(async () => state().handlers.onLoadMore('history'));
    assert.deepEqual(reads, [1, 2]);
    assert.deepEqual(state().model.history.rows.map(row => row.lineId), ['QA-H1', 'QA-H2']);
  }, { controller: true, api: { read: async (module, request) => {
    reads.push(request.page);
    return request.page === 1 ? structuredClone(data) : { ...detail(), history: { ...page([{ lineId: 'QA-H2', fields: {} }]), page: 2 } };
  } } });
});

test('load failure retains the exact Sales message and retry recovers the detail', async () => {
  let fail = true;
  await mounted(async tree => {
    assert.match(textOf(tree.root), /Không thể tải chi tiết đơn hàng\. Vui lòng thử lại\./);
    fail = false;
    await act(async () => button(tree, 'Thử lại').props.onClick());
    assert.match(textOf(tree.root), /Khách hàng kiểm thử/);
  }, { api: { read: async () => { if (fail) throw Error('qa transport'); return detail(); } } });
});

test('pending workflow retains the menu fence and retries exactly the original intent', async () => {
  const writes = []; let guard, changed = 0;
  await mounted(async tree => {
    await act(async () => button(tree, 'Gửi PM').props.onClick());
    await act(async () => tree.root.findByProps({ 'data-action': 'send-pm' }).props.onConfirm({ notes: 'Ghi chú kiểm thử' }));
    assert.equal(tree.root.findAllByProps({ 'data-action': 'send-pm' }).length, 0);
    assert.equal(tree.root.findByProps({ 'aria-label': 'Thao tác khác' }).props.disabled, true);
    assert.match(textOf(tree.root), /Đang chờ xác nhận kết quả thao tác/);
    await act(async () => assert.equal(guard(), false));
    await act(async () => button(tree, 'Gửi lại cùng thao tác').props.onClick());
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[0], writes[1]);
    assert.equal(changed, 1);
    assert.equal(guard(), true);
    assert.equal(tree.root.findByProps({ 'aria-label': 'Thao tác khác' }).props.disabled, false);
  }, { props: { onChanged() { changed++; }, onCloseGuardChange: value => { guard = value; } }, api: {
    send: async (moduleId, operation, intent) => {
      writes.push({ moduleId, operation, intent: structuredClone(intent) });
      return writes.length === 1 ? { outcome: 'OutcomeUnknown' } : { outcome: 'Replayed', receipt: { module: moduleId, operation, idempotencyKey: intent.idempotencyKey, documentId: intent.documentId, deleted: false } };
    },
  } });
});

test('delete menu keeps confirmation and releases the close guard after an accepted deletion', async () => {
  const writes = []; let guard, closed = 0, changed = 0;
  await mounted(async tree => {
    await act(async () => tree.root.findByProps({ 'aria-label': 'Thao tác khác' }).props.onClick());
    await act(async () => button(tree, 'Xóa đơn hàng').props.onClick());
    assert.equal(writes.length, 0);
    await act(async () => tree.root.findByProps({ 'data-action': 'delete' }).props.onConfirm({ notes: 'Không được gửi vào lệnh xóa' }));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].operation, 'delete');
    assert.equal('payload' in writes[0].intent, false);
    assert.equal(changed, 1);
    assert.equal(closed, 1);
    assert.equal(guard === null || guard(), true);
  }, { props: { onClose() { closed++; }, onChanged() { changed++; }, onCloseGuardChange: value => { guard = value; } }, api: {
    send: async (moduleId, operation, intent) => {
      writes.push({ operation, intent });
      return { outcome: 'Committed', receipt: { module: moduleId, operation, idempotencyKey: intent.idempotencyKey, documentId: intent.documentId, deleted: true } };
    },
  } });
});

test('sales lines retain saved display companions and legacy field aliases', async () => {
  const data = detail();
  data.lines.rows = [{ lineId: 'QA-ALIASED', fields: { ItemId: 'QA-ALIAS-ITEM', ItemName: 'Hàng có bí danh', Unit: 'Bộ', quantity: '2', quantityDisplay: '2 hiển thị', UnitPrice: '1234', Amount: '2468', TotalAmount: '2468' } }];
  await mounted(async tree => {
    const text = textOf(tree.root);
    assert.match(text, /Hàng có bí danh/);
    assert.match(text, /QA-ALIAS-ITEM/);
    assert.match(text, /2 hiển thị/);
    assert.match(text, /1\.234/);
    assert.match(text, /2\.468/);
  }, { data });
});
