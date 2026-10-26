import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime', 'app-erp-list');
await mkdir(output, { recursive: true });
// Synthetic transport only. The actual toolbar, chips, cards, table, state,
// pagination and lookup hook render; details/create forms are outside P2-03.
const leaves = {
  'erp-client': `export const erpClient = {
    async getScreenMetadata(module) { return { caption: 'Danh sách ' + module }; },
    async getErpModuleActions(module) { return globalThis.__p2Actions?.(module) ?? [{ id: 'create', visible: true, enabled: true }]; },
    async getErpModuleList(module, query) {
      globalThis.__p2Calls.push({ module, ...query });
      return globalThis.__p2List(module, query);
    },
    async getLookupOptions(module, query) {
      globalThis.__p2Lookups.push({ module, ...query });
      return globalThis.__p2Statuses?.(module, query) ?? { items: [], page: 1, hasMore: false, requiredParameters: [] };
    },
  };`,
  'registry': 'export const getDocumentDetailEntry = () => null;',
  'purchase-order-create-sheet': 'export const PurchaseOrderCreateSheet = () => null;',
  'purchase-request-create-sheet': 'export const PurchaseRequestCreateSheet = () => null;',
};
await build({
  stdin: { contents: `export {TabErpScreen} from './components/untitledui/tab-erp-screen';
    export {ERP_LIST_COLUMNS} from './lib/erp/list-columns'; export {erpScreenModules} from './lib/erp/proxy-policy';
    export {FilterSheet} from './components/app/filter-sheet'; export {CreateFab} from './components/app/create-fab';
    export {ROLE_QUEUE_STATUSES} from './lib/erp/role-queue';`, resolveDir: app, loader: 'tsx' },
  outfile: path.join(output, 'fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  alias: { '@': app }, jsx: 'automatic', logLevel: 'warning', plugins: [{
    name: 'synthetic-erp-transport', setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        for (const key of Object.keys(leaves)) if (args.path.endsWith('/' + key)) return { path: key, namespace: 'p2-fixture' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'p2-fixture' }, args => ({ contents: leaves[args.path], loader: 'tsx', resolveDir: app }));
    },
  }],
});
const require = createRequire(import.meta.url), React = require('react');
const { create, act } = require('react-test-renderer');
const { TabErpScreen, ERP_LIST_COLUMNS, erpScreenModules, FilterSheet, CreateFab, ROLE_QUEUE_STATUSES } = require(path.join(output, 'fixture.cjs'));
const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => {}); };
const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
const hosts = (tree, type) => tree.root.findAll(node => node.type === type);
// Chips may append a count after their label; match the label text itself too.
const button = (tree, label) => hosts(tree, 'button').find(node => node.props['aria-label'] === label || text(node) === label
  || node.children.filter(child => typeof child === 'string').join('') === label);
const click = async (tree, label) => { await act(async () => button(tree, label).props.onClick()); await flush(); };
const row = { documentId: 'SYNTHETIC-001', header: {
  documentDateDisplay: '24/10/2026', purchaseDateDisplay: '24/10/2026', batchDateDisplay: '24/10/2026',
  objectName: 'Đối tượng tổng hợp', personSuggest: 'Người đề nghị tổng hợp', userCreate: 'Người lập tổng hợp',
  nguoiNhan: 'Người nhận tổng hợp', nguoiGiao: 'Người giao tổng hợp', serviceTypeName: 'Bảo trì tổng hợp',
  fromBranchName: 'Chi nhánh nguồn tổng hợp', toBranchName: 'Chi nhánh nhận tổng hợp', salesUser: 'Người đề nghị tổng hợp',
  memo: 'Nội dung tổng hợp', notes: 'Ghi chú tổng hợp', orderNumber: 'PO-SYNTHETIC',
  statusId: 12, statusName: 'Trạng thái tổng hợp', statusForeColor: '#FFFF00', statusBackColor: '#FFFF00', isLocked: false,
} };
async function mounted(module, verify, options = {}) {
  globalThis.__p2Calls = []; globalThis.__p2Lookups = [];
  globalThis.__p2List = options.list ?? ((_module, query) => ({ rows: [row], page: query.page, pageSize: query.pageSize, hasMore: true }));
  globalThis.__p2Statuses = options.statuses; globalThis.__p2Actions = options.actions;
  let tree;
  try {
    await act(async () => { tree = create(h(TabErpScreen, { module, currentBranch: options.branch ?? 'P2-SYNTHETIC', isActive: options.active ?? true })); });
    await flush(); await verify(tree);
  } finally {
    if (tree) await act(async () => tree.unmount());
    delete globalThis.__p2List; delete globalThis.__p2Statuses; delete globalThis.__p2Actions;
  }
}

test('column configurations cover exactly 24 modules and use only existing list schema keys', async () => {
  assert.equal(erpScreenModules.length, 24);
  assert.deepEqual(Object.keys(ERP_LIST_COLUMNS).sort(), [...erpScreenModules].sort());
  const { components: { schemas } } = JSON.parse(await readFile(path.join(app, '../../docs/backend/medcom-openapi.json'), 'utf8'));
  for (const screenModule of erpScreenModules) {
    const prefix = `Erp_${screenModule.replaceAll('-', '_')}_document_rowFeDisplayCanonicalV3_`;
    const schema = Object.entries(schemas).find(([name]) => name.startsWith(prefix))?.[1];
    assert.ok(schema, screenModule);
    const columns = ERP_LIST_COLUMNS[screenModule];
    assert.equal(new Set(columns.map(column => column.id)).size, columns.length, screenModule);
    for (const column of columns) for (const key of column.keys) assert.ok(Object.hasOwn(schema.properties, key), `${screenModule}.${key} must exist in the list response`);
  }
});

for (const screenModule of erpScreenModules) test(`${screenModule}: common toolbar order, mobile cards, desktop columns, refresh and 44px controls`, async () => {
  // Role screens open on "Chờ tôi xử lý": one read per queued ERP status.
  const queue = ROLE_QUEUE_STATUSES[screenModule];
  const reads = queue?.length ?? 1;
  await mounted(screenModule, async tree => {
    assert.equal(globalThis.__p2Calls.length, reads, 'mount reads the list once (once per queued status)');
    if (queue) assert.deepEqual(globalThis.__p2Calls.map(call => call.statusId), [...queue]);
    const toolbar = tree.root.find(node => node.type === 'div' && node.props['data-app-toolbar'] !== undefined);
    const controls = toolbar.findAll(node => ['form', 'button'].includes(node.type));
    assert.equal(controls[0].props.role, 'search');
    assert.match(controls[1].props['aria-label'], /^Bộ lọc/);
    assert.equal(controls[2].props['aria-label'], 'Làm mới');
    const table = hosts(tree, 'table')[0];
    assert.ok(table, 'all modules mount a desktop table');
    assert.deepEqual(table.findAllByType('th').map(text), ['STT', ...ERP_LIST_COLUMNS[screenModule].map(column => column.label), 'Chi tiết']);
    const cards = hosts(tree, 'button').filter(node => node.props.className?.includes('min-h-16'));
    assert.equal(cards.length, 1);
    assert.equal((text(cards[0]).match(/SYNTHETIC-001/g) ?? []).length, 1, 'mobile code appears once');
    assert.equal((text(cards[0]).match(/24\/10\/2026/g) ?? []).length, 1, 'mobile date appears once');
    assert.ok(cards[0].findAllByType('span').some(node => node.props.className?.includes('max-w-[55%]') && node.props.className.includes('break-words')), 'long status labels wrap within the card');
    assert.ok(cards[0].findAllByType('span').some(node => text(node) === row.documentId && node.props.className.includes('text-brand-700')));
    for (const control of tree.root.findAll(node => ['button', 'input', 'a', 'select', 'textarea'].includes(node.type))) {
      assert.match(control.props.className ?? '', /(?:^|\s)(?:min-h-(?:11|12|14|16)|h-(?:11|12|14|16)|size-(?:11|12|14|16))(?:\s|$)/, `${screenModule}: ${control.type} ${control.props['aria-label'] ?? text(control)}`);
      if (control.type === 'input') assert.match(control.props.className, /text-base/);
    }
    const chips = tree.root.findAllByProps({ role: 'group' }).find(node => node.props['aria-label']?.startsWith('Lọc'));
    assert.match(chips.props.className, /overflow-x-auto/);
    await click(tree, 'Làm mới');
    assert.equal(globalThis.__p2Calls.length, 2 * reads);
    assert.equal(globalThis.__p2Calls.at(-1).page, 1);
  });
});

for (const screenModule of ['sales-orders', 'sales-order-pm', 'sales-order-sa']) test(`${screenModule}: sheet statuses send native statusId once, page 1, then retain it on pagination`, async () => {
  await mounted(screenModule, async tree => {
    assert.deepEqual(globalThis.__p2Lookups, [{ module: screenModule, branchId: 'P2-SYNTHETIC', lookupId: 'header.StatusID', page: 1, pageSize: 100 }]);
    assert.equal(button(tree, 'Chờ tôi xử lý').props['aria-pressed'], true, 'role queue is the default');
    await click(tree, 'Tất cả');
    await click(tree, 'Trang sau');
    for (const id of [-1, 0, 12]) {
      const count = globalThis.__p2Calls.length;
      await click(tree, 'Trạng thái khác…');
      assert.equal(tree.root.findByType(FilterSheet).props.open, true);
      await act(async () => tree.root.findByType(FilterSheet).props.onApply({ status: String(id), pageSize: 20 })); await flush();
      assert.equal(globalThis.__p2Calls.length, count + 1, 'no duplicate read from chip page reset');
      assert.equal(globalThis.__p2Calls.at(-1).page, 1);
      assert.equal(globalThis.__p2Calls.at(-1).statusId, id);
      assert.equal(button(tree, `Trạng thái ${id}`).props['aria-pressed'], true);
    }
    await click(tree, 'Trang sau');
    assert.equal(globalThis.__p2Calls.at(-1).page, 2); assert.equal(globalThis.__p2Calls.at(-1).statusId, 12);
    await click(tree, 'Tất cả');
    assert.equal(globalThis.__p2Calls.at(-1).page, 1); assert.equal(globalThis.__p2Calls.at(-1).statusId, undefined);
    const count = globalThis.__p2Calls.length;
    await click(tree, 'Chờ tôi xử lý');
    assert.deepEqual(globalThis.__p2Calls.slice(count).map(call => call.statusId), [...ROLE_QUEUE_STATUSES[screenModule]]);
  }, { statuses: () => ({ items: [-1, 0, 12].map(id => ({ id: String(id), label: `Trạng thái ${id}` })), hasMore: false, requiredParameters: [] }) });
});

test('typing retains 400ms debounce; Enter and clear search immediately once with the current value', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  await mounted('machine-repairs', async tree => {
    const input = () => hosts(tree, 'input')[0];
    await act(async () => input().props.onChange({ target: { value: 'QA' } }));
    await act(async () => context.mock.timers.tick(399)); await flush();
    assert.equal(globalThis.__p2Calls.length, 1);
    await act(async () => context.mock.timers.tick(1)); await flush();
    assert.equal(globalThis.__p2Calls.length, 2); assert.equal(globalThis.__p2Calls.at(-1).search, 'QA');
    await act(async () => input().props.onChange({ target: { value: 'QA-ENTER' } }));
    await act(async () => tree.root.findByProps({ role: 'search' }).props.onSubmit({ preventDefault() {} })); await flush();
    assert.equal(globalThis.__p2Calls.length, 3); assert.equal(globalThis.__p2Calls.at(-1).search, 'QA-ENTER');
    await act(async () => context.mock.timers.tick(500)); await flush(); assert.equal(globalThis.__p2Calls.length, 3);
    await click(tree, 'Xóa tìm kiếm');
    assert.equal(input().props.value, ''); assert.equal(globalThis.__p2Calls.length, 4); assert.equal(globalThis.__p2Calls.at(-1).search, undefined);
    await act(async () => context.mock.timers.tick(500)); await flush(); assert.equal(globalThis.__p2Calls.length, 4);
  });
});

test('filter sheet submits status and page size in one server read from page 1', async () => {
  await mounted('purchase-requests', async tree => {
    await click(tree, 'Trang sau');
    const sheet = tree.root.findByType(FilterSheet);
    await act(async () => sheet.props.onApply({ status: 'pending', pageSize: 50 })); await flush();
    assert.equal(globalThis.__p2Calls.length, 3);
    assert.deepEqual(globalThis.__p2Calls.at(-1), { module: 'purchase-requests', branchId: 'P2-SYNTHETIC', page: 1, pageSize: 50, search: undefined, dateFrom: undefined, dateTo: undefined, statusId: 2 });
  });
});

test('errors use shared retry state and retain rows, page and enabled navigation', async () => {
  let fail = false;
  await mounted('machine-repairs', async tree => {
    fail = true; await click(tree, 'Trang sau');
    assert.equal(hosts(tree, 'div').filter(node => node.props.role === 'alert').length, 1);
    assert.ok(text(hosts(tree, 'table')[0]).includes(row.documentId));
    assert.equal(button(tree, 'Trang sau').props.disabled, false);
    assert.equal(tree.root.findByProps({ 'aria-current': 'page' }).props['aria-label'], 'Đến trang 1');
    fail = false; await click(tree, 'Thử lại');
    assert.equal(hosts(tree, 'div').filter(node => node.props.role === 'alert').length, 0);
    assert.equal(globalThis.__p2Calls.at(-1).page, 1);
  }, { list: (_module, query) => { if (fail) throw Error('Synthetic failure'); return { rows: [row], page: query.page, hasMore: true }; } });
});

test('loading and empty pages use shared states with permission-controlled creation', async () => {
  let complete;
  await mounted('machine-movements', async tree => {
    assert.equal(hosts(tree, 'table').length, 0);
    assert.ok(tree.root.findAllByProps({ 'aria-busy': 'true' }).length > 0, 'shared loading skeleton is announced');
    assert.equal(button(tree, 'Trang sau'), undefined, 'a single default-size page shows no page controls');
    await act(async () => complete({ rows: [], page: 1, pageSize: 20, hasMore: false })); await flush();
    assert.ok(hosts(tree, 'p').some(node => text(node).includes('Chưa có chứng từ phù hợp')));
    assert.equal(button(tree, 'Tạo mới'), undefined, 'empty state cannot create without permission');
    assert.equal(button(tree, 'Trang sau'), undefined, 'a single default-size page shows no page controls');
  }, { branch: 'P2-EMPTY', actions: () => [{ id: 'create', visible: false, enabled: false }], list: () => new Promise(resolve => { complete = resolve; }) });
});

test('hidden tabs do not read lists or status lookups', async () => {
  await mounted('sales-orders', () => { assert.deepEqual(globalThis.__p2Calls, []); assert.deepEqual(globalThis.__p2Lookups, []); }, { active: false });
});

test('desktop create and mobile FAB preserve visible/enabled and write admission', async () => {
  for (const [suffix, visible, enabled] of [['hidden', false, false], ['disabled', true, false], ['allowed', true, true]]) {
    await mounted('sales-orders', tree => {
      const create = button(tree, 'Tạo mới');
      // P2-06 portals the host button. This renderer checks admission props;
      // app-visual-qa checks DOM visibility and disabled controls in a browser.
      const fab = tree.root.findByType(CreateFab);
      assert.equal(Boolean(create), visible); assert.equal(fab.props.allowed, visible);
      if (visible) { assert.equal(create.props.disabled, !enabled); assert.equal(fab.props.disabled, !enabled); }
    }, { branch: `P2-PERM-${suffix}`, actions: () => [{ id: 'create', visible, enabled }] });
  }
  await mounted('purchase-orders', tree => { assert.equal(button(tree, 'Tạo mới'), undefined); assert.equal(button(tree, 'Tạo Đề nghị mua hàng (PO)'), undefined); });
});
