import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/erp-document-detail-view-generic');
await mkdir(output, { recursive: true });
const leaves = {
  'erp-client': `export const erpClient={getErpModuleDetail:(...args)=>globalThis.qaGenericView.read(...args),saveDocument:(...args)=>globalThis.qaGenericView.save(...args)};`,
  'bottom-sheet': `export const UntitledBottomSheet=({open,children,title,onClose})=>open?<section role="dialog" data-sheet={title}><button aria-label="Đóng modal" onClick={onClose}/>{children}</section>:null;`,
  'button': `export const UntitledButton=({children,iconLeading,iconTrailing,variant,size,...props})=><button {...props}>{children}</button>;`,
  'lookup-field': `export const LookupField=props=><div data-lookup={props.lookupId} {...props}/>;`,
  'record-dialog': `export const RecordDetailHeading=({children,title,documentNumber})=><header>{title}{documentNumber}{children}</header>;export const RecordDetailStatus=({children})=><div data-status="header">{children}</div>;export const RecordActionBar=({children,presentationAllowed})=>presentationAllowed?<footer>{children}</footer>:null;`,
  'request-presentation': `import React from 'react';export const RecordDetailContext=React.createContext(true);export const RequestButton='button';export const RequestInput='input';export const RequestTextarea='textarea';export const RequestSelect='select';export const requestStyles={actions:''};`,
  'sales-order-form': `export const SalesOrderForm=()=>null;`,
  'qr-camera': `export class QrCamera{start(){}stop(){}}`,
};
await build({
  stdin: { contents: `export {ErpDocumentDetailBody} from './components/erp/erp-document-detail-body';export {ErpLineEditor} from './components/erp/erp-line-editor';export {DocumentDetailView} from './components/erp/document-detail/document-detail-view';export {getDocumentDetailEntry} from './lib/erp/document-detail/registry';export {editableHeaderKeys,requiredEditKeys,saveLineKeys,SAVE_HEADER_BY_MODULE} from './lib/erp/document-detail/controllers/erp-detail-rules';export {editableDetailConfig} from './lib/erp/document-detail/controllers/erp-detail-model';export {erpScreenModules} from './lib/erp/proxy-policy';`, resolveDir: app, loader: 'tsx' },
  outfile: path.join(output, 'fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'generic-view-leaves', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (!/(?:erp-document-detail-body\.tsx|erp-line-editor\.tsx|document-detail\/[^/]+\.tsx|document-detail\/registry\.ts)$/.test(args.importer.replaceAll('\\', '/'))) return;
      // Match the whole leaf name: "button" must not intercept P2 AppButton.
      for (const key of Object.keys(leaves)) if (args.path.endsWith(`/${key}`)) return { path: key, namespace: 'generic-view-qa' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'generic-view-qa' }, args => ({ contents: leaves[args.path], loader: 'tsx', resolveDir: app }));
  } }],
});
const require = createRequire(import.meta.url);
const React = require('react'), { create, act } = require('react-test-renderer');
const { ErpDocumentDetailBody, ErpLineEditor, DocumentDetailView, getDocumentDetailEntry, editableDetailConfig,
  editableHeaderKeys, requiredEditKeys, saveLineKeys, SAVE_HEADER_BY_MODULE, erpScreenModules } = require(path.join(output, 'fixture.cjs'));
const fixtures = Object.assign({}, ...await Promise.all(['document-detail-header-keys.json', 'document-detail-header-keys-ops.json']
  .map(async name => JSON.parse(await readFile(path.join(app, 'tests/fixtures', name), 'utf8')))));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const page = (rows = [], hasMore = false) => ({ rows, page: 1, pageSize: 50, hasMore });
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (Array.isArray(node) ? node : node?.children ?? []).map(text).join('');
const textNodes = node => typeof node === 'string' ? [node] : (Array.isArray(node) ? node : node?.children ?? []).flatMap(textNodes);
const button = (tree, label) => tree.root.findAllByType('button').find(node => text(node) === label);
const fields = config => config.groups.flatMap(group => [...group.fields, ...(group.subgroups ?? []).flatMap(subgroup => subgroup.fields)]);
const data = (header = {}) => ({ documentId: 'QA-DOC', header, lines: page(), actions: [
  { id: 'save', caption: 'Sửa', visible: true, enabled: true }, { id: 'delete', caption: 'Xóa', visible: true, enabled: true },
], stateToken: 'a'.repeat(64) });
async function mounted(verify, { module = 'inbound-requests', detail = data(), api = {} } = {}) {
  const previous = globalThis.window;
  globalThis.window = { addEventListener: noop, removeEventListener: noop };
  const calls = [];
  globalThis.qaGenericView = { read: async (...args) => { calls.push(args); return structuredClone(detail); }, ...api };
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(ErpDocumentDetailBody, { module, branchId: 'QA', documentId: 'QA-DOC', onClose: noop, onChanged: noop })); });
    for (let i = 0; i < 6; i++) await act(async () => {});
    await verify(tree, calls);
  } finally {
    if (tree) await act(async () => tree.unmount());
    delete globalThis.qaGenericView;
    if (previous === undefined) delete globalThis.window; else globalThis.window = previous;
  }
}
async function edit(tree) {
  await act(async () => tree.root.findByProps({ 'aria-label': 'Thao tác chứng từ' }).props.onClick());
  await act(async () => button(tree, 'Sửa thông tin').props.onClick());
}

test('inbound uses Vietnamese labels, resolved names, boolean formatting and the hidden allowlist', async () => {
  await mounted(tree => {
    const rendered = text(tree.toJSON());
    assert.match(rendered, /Thời tiết mưaKhông/);
    assert.match(rendered, /Nhập khẩu/);
    assert.doesNotMatch(rendered, /\bfalse\b|Order Type Id|Send To|Loại in QR|SET|detailSaveToken/);
  }, { detail: data({ isRain: false, orderTypeId: '1', orderTypeName: 'Nhập khẩu', sendTo: 'x', qrPrintType: 'SET', detailSaveToken: 't' }) });
});

test('purchase status colors and technical metadata do not appear in the body', async () => {
  await mounted(tree => {
    assert.doesNotMatch(text(tree.toJSON()), /Status Fore Color|Status Back Color|#000000|#ffffff|detailSaveToken/);
    assert.match(text(tree.root.findByProps({ 'data-status': 'header' })), /Mới lập.*Chưa khóa/);
  }, { module: 'purchase-requests', detail: data({ statusForeColor: '#000000', statusBackColor: '#ffffff', statusName: 'Mới lập', isLocked: false, detailSaveToken: 'secret' }) });
});

test('generic writable modules have one document menu while purchase orders remain write gated', async () => {
  for (const moduleId of ['inbound-requests', 'internal-transfer-requests', 'purchase-orders']) {
    await mounted(tree => {
      // AppButton and its native host share props; count only user controls.
      assert.equal(tree.root.findAllByType('button').filter(node => node.props['aria-label'] === 'Thao tác chứng từ').length, moduleId === 'purchase-orders' ? 0 : 1);
    }, { module: moduleId });
  }
});

test('inline editing projects the inherited keys, required flags, lookup branch and exact save payload', async () => {
  const header = { documentDate: '2026-10-23T00:00:00', fromBranchId: 'QA', toBranchId: 'QB', notes: 'Ghi chú cũ',
    transferReason: 'Lý do giữ nguyên' };
  const commands = [];
  await mounted(async tree => {
    await edit(tree);
    const view = tree.root.findByType(DocumentDetailView);
    assert.equal(view.props.model.editing, true);
    const definitions = fields(view.props.config);
    assert.deepEqual(definitions.filter(field => field.edit).map(field => field.key).sort(), [...editableHeaderKeys('internal-transfer-requests')].sort());
    for (const field of definitions.filter(field => field.edit)) assert.equal(field.edit.required, requiredEditKeys('internal-transfer-requests').includes(field.key));
    // Its own catalog fields: the reason is editable and there is no sales-order customer.
    assert.ok(definitions.find(field => field.key === 'transferReason').edit);
    assert.equal(tree.root.findAllByProps({ 'data-lookup': 'header.ObjectID' }).length, 0);
    assert.doesNotMatch(text(tree.toJSON()), /Trường sửa kế thừa/);
    const inputs = [...tree.root.findAllByType('input'), ...tree.root.findAllByType('textarea')];
    const notes = inputs.find(node => node.props.value === 'Ghi chú cũ');
    assert.ok(notes);
    await act(async () => notes.props.onChange({ target: { value: 'Ghi chú mới' } }));
    await act(async () => button(tree, 'Lưu thay đổi').props.onClick());
    assert.equal(commands.length, 1);
    const [moduleId, command] = commands[0];
    assert.equal(moduleId, 'internal-transfer-requests');
    assert.equal(command.expectedStateToken, 'a'.repeat(64));
    assert.equal(command.branchId, 'QA');
    assert.equal(command.documentId, 'QA-DOC');
    assert.match(command.idempotencyKey, /^save-/);
    assert.deepEqual(command.lineChanges, []);
    // From/To are hidden ERP fields: omitted so the backend keeps the saved branches.
    assert.deepEqual(command.header, { documentDate: '2026-10-23T00:00:00.000',
      requestedTransferDate: null, transferReason: 'Lý do giữ nguyên', transportMethod: null, notes: 'Ghi chú mới' });
  }, { module: 'internal-transfer-requests', detail: data(header), api: { save: async (...args) => { commands.push(args); return { outcome: 'Denied' }; } } });
});

test('every inherited editable key has a labeled edit projection without mutating registry groups', () => {
  for (const moduleId of erpScreenModules.filter(id => !['sales-orders', 'sales-order-pm', 'sales-order-sa'].includes(id))) {
    const config = getDocumentDetailEntry(moduleId).config;
    const before = structuredClone(config);
    const projected = editableDetailConfig(config, moduleId, true);
    for (const key of editableHeaderKeys(moduleId)) assert.ok(fields(projected).some(field => field.key === key && field.edit), `${moduleId}.${key}`);
    assert.deepEqual(config, before);
    if (saveLineKeys(moduleId).length) assert.ok(config.slots.includes('lines-editor'));
  }
});

test('legacy edit groups use fixed labels while fixtures and static groups contain only API keys', () => {
  const labels = { documentDate: 'Ngày chứng từ', objectId: 'Khách hàng', deliverDate: 'Ngày giao hàng', contractId: 'Mã hợp đồng', memo: 'Nội dung', notes: 'Ghi chú' };
  for (const [moduleId, fixture] of Object.entries(fixtures)) {
    const config = getDocumentDetailEntry(moduleId).config;
    assert.equal(Object.hasOwn(fixture, 'editorHeader'), false, moduleId);
    for (const field of fields(config)) assert.ok(fixture.header.includes(field.key), `${moduleId}.${field.key} must have API provenance`);
    const expected = editableHeaderKeys(moduleId).filter(key => !fields(config).some(field => field.key === key));
    const legacy = editableDetailConfig(config, moduleId, true).groups.find(group => group.id === 'legacy-edit');
    assert.deepEqual(legacy?.fields.map(field => field.key) ?? [], expected, moduleId);
    for (const key of expected) {
      assert.ok(Object.hasOwn(labels, key), `${moduleId}.${key}: missing fixed legacy edit label`);
      assert.equal(legacy.fields.find(field => field.key === key)?.label, labels[key], `${moduleId}.${key}`);
    }
    assert.equal(editableDetailConfig(config, moduleId, false).groups.some(group => group.id === 'legacy-edit'), false, moduleId);
  }
});

test('default editors show missing keys only in the legacy edit group, and hide it again on discard', async () => {
  // Machine screens now edit their own catalog fields (no sales-order customer); see the test below.
  for (const moduleId of ['internal-transfer-batches']) {
    const config = getDocumentDetailEntry(moduleId).config;
    const before = structuredClone(config);
    await mounted(async tree => {
      assert.doesNotMatch(text(tree.toJSON()), /Trường sửa kế thừa/);
      await edit(tree);
      const projected = tree.root.findByType(DocumentDetailView).props.config;
      const legacy = projected.groups.find(group => group.id === 'legacy-edit');
      assert.equal(legacy.title, 'Trường sửa kế thừa');
      const expected = moduleId === 'machine-movements' ? ['objectId', 'deliverDate']
        : ['documentDate', 'objectId', 'deliverDate', 'contractId', 'memo'];
      assert.deepEqual(legacy.fields.map(field => field.key), expected);
      const section = tree.root.findAllByType('section').find(node =>
        node.findAllByType('h3').some(heading => text(heading) === 'Trường sửa kế thừa'));
      assert.ok(section);
      assert.equal(section.findByProps({ 'data-lookup': 'header.ObjectID' }).props.label, 'Khách hàng');
      assert.equal(section.findAllByType('input').filter(node => node.props.type === 'date').length,
        moduleId === 'machine-movements' ? 1 : 2);
      assert.equal(legacy.fields.find(field => field.key === 'objectId').edit.required, true);
      if (moduleId === 'internal-transfer-batches') {
        assert.equal(legacy.fields.find(field => field.key === 'documentDate').edit.required, true);
        assert.match(text(section), /Ngày chứng từ/);
      } else {
        // This API-backed field already belongs to the normal movement group.
        assert.equal(fields(projected).filter(field => field.key === 'documentDate').length, 1);
      }
      await act(async () => button(tree, 'Hủy sửa').props.onClick());
      assert.doesNotMatch(text(tree.toJSON()), /Trường sửa kế thừa/);
      assert.deepEqual(config, before);
    }, { module: moduleId });
  }
});

test('default editor saveDocument headers match the ui-sync/main baseline, including required and null fields', async () => {
  // Golden headers: ui-sync/main@57618a7, ErpDocumentDetailBody.startEditing/handleSaveHeader.
  // Both old and new bodies were executed with these synthetic inputs; see FIELD_EVIDENCE_GENERIC_EDITOR.md.
  for (const moduleId of ['internal-transfer-batches']) {
    const header = { documentId: 'QA-DOC', branchId: 'QA', notes: ' Ghi chú cũ ', isLocked: false,
      ...(moduleId === 'machine-movements' ? { documentDate: '2026-10-23T00:00:00' } : { batchDate: '2026-10-23T00:00:00' }) };
    const commands = [];
    await mounted(async tree => {
      await edit(tree);
      await act(async () => button(tree, 'Lưu thay đổi').props.onClick());
      assert.equal(commands.length, 0, 'the inherited required fields still block save');
      assert.match(text(tree.toJSON()), /Vui lòng nhập đủ các trường bắt buộc/);
      const date = tree.root.findAllByType('input').find(node => node.props.type === 'date' && node.props.required);
      await act(async () => date.props.onChange({ target: { value: '2026-10-24' } }));
      await act(async () => button(tree, 'Lưu thay đổi').props.onClick());
      assert.equal(commands.length, 0, 'objectId remains required after filling documentDate');
      await act(async () => tree.root.findByProps({ 'data-lookup': 'header.ObjectID' }).props.onSelect({
        id: 'QA-CUSTOMER', name: 'Đối tượng kiểm thử', label: 'Đối tượng kiểm thử', fields: {},
      }));
      await act(async () => button(tree, 'Lưu thay đổi').props.onClick());
      assert.equal(commands.length, 1);
      assert.equal(commands[0][0], moduleId);
      assert.deepEqual(commands[0][1].header, { ...header, documentDate: '2026-10-24T00:00:00.000',
        objectId: 'QA-CUSTOMER', deliverDate: null, contractId: null, memo: null, notes: 'Ghi chú cũ' });
      assert.deepEqual(commands[0][1].lineChanges, []);
    }, { module: moduleId, detail: data(header), api: { save: async (...args) => { commands.push(args); return { outcome: 'Denied' }; } } });
  }
});

test('the retained line editor replaces the lines tab and forwards the original mobile/desktop edits', async () => {
  // Production PR editing still hands off to its create/edit sheet and PO stays write gated.
  // Exercise the registered presentation slot in isolation without admitting either guarded action.
  const moduleId = 'purchase-requests', config = editableDetailConfig(getDocumentDetailEntry(moduleId).config, moduleId, true);
  const detail = { ...data(), lines: page([{ lineId: 'QA-LINE', fields: { itemName: 'Hàng kiểm thử', unit: 'Cái' } }]) };
  const edits = [], draft = { 'QA-LINE': { itemId: 'QA-ITEM', quantity: '2', unitPrice: '10', model: 'Mẫu kiểm thử', budget: '20', timeRequired: 'Tuần này' } };
  const model = { documentId: 'QA-DOC', header: {}, lines: detail.lines, status: { label: null, locked: null }, editing: true,
    loading: false, error: null, dirty: false, busy: false, draft: {}, feedback: null, actions: [] };
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(DocumentDetailView, { module: moduleId, config, model,
      handlers: { onAction: noop, onFieldChange: noop, onLoadMore: noop, onRetry: noop },
      slots: { 'lines-editor': React.createElement(ErpLineEditor, { module: moduleId, detail, editLines: draft,
        columns: config.lines.columns, patchEditLine: (...args) => edits.push(args) }) } })); });
    assert.equal(tree.root.findAllByType(ErpLineEditor).length, 1);
    assert.equal(tree.root.findAllByProps({ 'data-document-detail-tabs': true }).length, 0);
    assert.match(text(tree.toJSON()), /Ngân sách/);
    const items = tree.root.findAllByType('input').filter(node => node.props.value === 'QA-ITEM');
    assert.equal(items.length, 2);
    await act(async () => items[0].props.onChange({ target: { value: 'QA-MOBILE' } }));
    await act(async () => items[1].props.onChange({ target: { value: 'QA-DESKTOP' } }));
    assert.deepEqual(edits, [['QA-LINE', 'itemId', 'QA-MOBILE'], ['QA-LINE', 'itemId', 'QA-DESKTOP']]);
  } finally { if (tree) await act(async () => tree.unmount()); }
});

test('warehouse QR retains both scan controls and the camera/manual modal', async () => {
  await mounted(async tree => {
    assert.ok(button(tree, 'Quét thêm mã QR'));
    assert.ok(button(tree, 'Quét xóa mã QR'));
    await act(async () => button(tree, 'Quét thêm mã QR').props.onClick());
    assert.equal(tree.root.findAllByProps({ placeholder: 'Mã ItemID;ItemCode;Lot hoặc PKG1;...' }).length, 1);
    assert.match(text(tree.toJSON()), /Đang mở máy ảnh/);
  }, { module: 'warehouse-qr' });
});

test('only configured API sections render, using their configured columns', async () => {
  await mounted(tree => {
    assert.match(text(tree.toJSON()), /Đề nghị kiểm thử/);
    assert.doesNotMatch(text(tree.toJSON()), /Mục không khai báo|Trường không khai báo|Phần bí mật/);
  }, { module: 'internal-transfer-tech', detail: { ...data(), sections: {
    requests: page([{ lineId: 'QA-REQUEST', fields: { requestId: 'Đề nghị kiểm thử', arbitrary: 'Trường không khai báo' } }]),
    unexpected: page([{ lineId: 'QA-UNKNOWN', fields: { notes: 'Mục không khai báo', title: 'Phần bí mật' } }]),
  } } });
});

test('QR comparison rows retain their canonical columns and item-code/line-id fallbacks', async () => {
  await mounted(tree => {
    assert.match(text(tree.toJSON()), /Dòng đối chiếu hàng cần quét/);
    assert.match(text(tree.toJSON()), /QA-ITEM-CODE/);
    assert.match(text(tree.toJSON()), /QA-FALLBACK-LINE/);
    assert.match(text(tree.toJSON()), /23\/10\/2026/);
    assert.doesNotMatch(text(tree.toJSON()), /Nội dung ngoài cột đối chiếu/);
  }, { module: 'warehouse-qr', detail: { ...data(), comparison: page([
    { lineId: 'QA-COMPARE', fields: { itemCode: 'QA-ITEM-CODE', lot: 'QA-LOT', expireDate: '2026-10-23T00:00:00', storeHouseId: 'QA-STORE', quantity: '2', unknown: 'Nội dung ngoài cột đối chiếu' } },
    { lineId: 'QA-FALLBACK-LINE', fields: {} },
  ]) } });
});

for (const moduleId of erpScreenModules.filter(id => !['sales-orders', 'sales-order-pm', 'sales-order-sa'].includes(id))) {
  test(`${moduleId}: synthetic fixture renders without raw booleans, English fallback labels or hidden keys`, async () => {
    const config = getDocumentDetailEntry(moduleId).config;
    const definitions = fields(config);
    const header = Object.fromEntries(fixtures[moduleId].header.map(key => {
      const field = definitions.find(field => [field.key, field.displayKey, field.secondaryKey].includes(key));
      const format = field?.format;
      return [key, format === 'boolean' ? false : ['date', 'datetime'].includes(format) ? '2026-10-23T00:00:00'
        : ['money', 'number'].includes(format) ? '12' : key === 'isLocked' ? false : 'Giá trị kiểm thử'];
    }));
    await mounted(tree => {
      for (const rendered of textNodes(tree.toJSON())) {
        assert.doesNotMatch(rendered, /\b(true|false)\b/, moduleId);
        assert.doesNotMatch(rendered, /^[A-Z][a-z]+( [A-Z][a-z]+)+$/, moduleId);
      }
      for (const key of config.hidden) assert.equal(textNodes(tree.toJSON()).includes(key), false, `${moduleId}.${key}`);
    }, { module: moduleId, detail: data(header) });
  });
}

test('machine movement edits its own fields: no customer, only the date required, catalog save payload', async () => {
  const header = { documentId: 'QA-DOC', branchId: 'QA', documentDate: '2026-10-23T00:00:00', moveTypeId: 'DEMO', notes: 'Ghi chú cũ', isLocked: false };
  const commands = [];
  await mounted(async tree => {
    await edit(tree);
    assert.equal(tree.root.findAllByProps({ 'data-lookup': 'header.ObjectID' }).length, 0);
    assert.doesNotMatch(text(tree.toJSON()), /Khách hàng/);
    assert.deepEqual(requiredEditKeys('machine-movements'), ['documentDate']);
    await act(async () => button(tree, 'Lưu thay đổi').props.onClick());
    assert.equal(commands.length, 1);
    const sent = commands[0][1].header;
    assert.deepEqual(Object.keys(sent).sort(), [...SAVE_HEADER_BY_MODULE['machine-movements']].sort());
    assert.equal(sent.moveTypeId, 'DEMO');
    assert.equal(sent.documentDate, '2026-10-23T00:00:00.000');
    assert.equal('objectId' in sent || 'deliverDate' in sent || 'isLocked' in sent, false);
  }, { module: 'machine-movements', detail: data(header), api: { save: async (...args) => { commands.push(args); return { outcome: 'Denied' }; } } });
});
