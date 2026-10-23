import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const React = require('react');
const { act, create } = require('react-test-renderer');
const { renderToStaticMarkup } = require('react-dom/server');
const h = React.createElement;
const output = '.test-runtime/p2-screens';
await mkdir(output, { recursive: true });
const client = 'export const REAL_BRANCHES=[]; export const erpClient=new Proxy({}, {get:(_,method)=>(...args)=>globalThis.__p2Api(method,...args)});';
const fixtures = {
  'erp-client': client,
  'bottom-sheet': 'export const UntitledBottomSheet=({open,children,footer})=>open?<section aria-label="Chi tiết">{children}{footer}</section>:null;',
  'qr-scanner': 'export const QrScanner=props=><scanner-fixture {...props}/>;',
};
const plugin = {
  name: 'synthetic-screen-transport',
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      const key = args.path.split('/').at(-1);
      return fixtures[key] ? { path: key, namespace: 'p2-fixture' } : null;
    });
    builder.onLoad({ filter: /.*/, namespace: 'p2-fixture' }, args => ({ contents: fixtures[args.path], loader: 'tsx', resolveDir: process.cwd() }));
  },
};
const exports = ['orders', 'purchases', 'inbound', 'home', 'settings'].map(name => 'export * from "./components/untitledui/tab-' + name + '";').join('\n')
  + '\nexport * from "./components/untitledui/qr-scanner-view";';
await build({ stdin: { contents: exports, loader: 'tsx', resolveDir: process.cwd() }, outfile: output + '/screens.cjs', bundle: true,
  platform: 'node', format: 'cjs', packages: 'external', alias: { '@': process.cwd() }, jsx: 'automatic', plugins: [plugin], logLevel: 'warning' });
const { TabOrders, TabPurchases, TabInbound, TabHome, TabSettings, UntitledQrScannerView } = require('../' + output + '/screens.cjs');
const user = { username: 'qa-session', displayName: 'Người dùng phiên tổng hợp', role: 'Vai trò tổng hợp', branchId: 'QA-A', companyName: 'Đơn vị tổng hợp' };
const row = (id = 'QA-001', statusId = 1) => ({
  documentId: id, branchId: 'QA-A', statusId, statusName: 'Trạng thái từ API', statusForeColor: '#FFFFFF', statusBackColor: '#00695C',
  documentDate: '2026-10-24T00:00:00', purchaseDate: '2026-10-24T00:00:00', personSuggest: 'Người lập tổng hợp', department: 'Bộ phận tổng hợp',
  objectName: 'Nhà cung cấp tổng hợp có tên dài để kiểm tra màn hình điện thoại', userCreate: 'Người lập tổng hợp',
  purchaseOrderHeader: { baseTotal: '123.45', currencyId: 'VND', userCreate: 'Người lập tổng hợp' },
  fields: { purposeDescOrClient: 'Nội dung đề nghị tổng hợp', price: '123.45', personSuggest: 'Người lập tổng hợp' },
  inboundRequestHeader: { orderNumber: 'QA-PO', invoiceNo: 'QA-VAT' },
});
const pageResult = (rows = [row()], page = 1, pageSize = 20, hasMore = true) => ({ rows, page, pageSize, hasMore });
const specifications = [
  { Component: TabOrders, title: 'Đơn hàng PO', kind: 'purchase-orders', method: 'getDocumentsList', callback: 'onOpenCreateModal', fab: 'Tạo đơn hàng PO' },
  { Component: TabPurchases, title: 'Đề nghị PR', kind: 'purchase-requests', method: 'getPurchaseRequestsList', callback: 'onOpenCreateModal', fab: 'Tạo đề nghị PR' },
  { Component: TabInbound, title: 'Nhập kho', kind: 'inbound-requests', method: 'getDocumentsList', callback: 'onOpenNewInbound', fab: 'Tạo phiếu nhập kho' },
];
const noop = () => {};
function dataApi(handler = () => pageResult()) {
  return async (method, ...args) => {
    if (method === 'getDocumentsList') return handler({ method, kind: args[0], page: args[1], search: args[2], branch: args[3], pageSize: args[4] });
    if (method === 'getPurchaseRequestsList') return { scopeKey: 'qa-scope', list: await handler({ method, kind: 'purchase-requests', page: args[0], search: args[1], branch: args[2], pageSize: args[3] }) };
    if (method === 'getDocumentDetail') return { document: {}, purchaseOrderLines: [], inboundRequestLines: [] };
    if (method === 'getPurchaseRequestDetail') return { document: { header: {}, lines: [] } };
    throw new Error('Unexpected API: ' + method);
  };
}
async function mounted(element, verify) {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const oldFetch = globalThis.fetch;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = () => { throw Error('No live requests belong to this suite'); };
  let tree;
  try {
    await act(async () => { tree = create(element); });
    await verify(tree);
  } finally {
    if (tree) await act(async () => tree.unmount());
    globalThis.fetch = oldFetch;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
    delete globalThis.__p2Api;
  }
}
function hosts(node) {
  if (node === null || typeof node === 'string') return node;
  if (Array.isArray(node)) return h(React.Fragment, null, ...node.map(hosts));
  return h(node.type, node.props, ...(node.children ?? []).map(hosts));
}
const markup = tree => renderToStaticMarkup(hosts(tree.toJSON()));
const button = (tree, label) => tree.root.findAll(node => node.type === 'button' && node.props['aria-label'] === label)[0];
const text = node => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('');
const click = async node => act(async () => node.props.onClick());
const nativeButton = (tree, label) => tree.root.findAll(node => node.type === 'button' && text(node) === label)[0];
function assertTouchClasses(tree) {
  for (const control of tree.root.findAll(node => ['button', 'input', 'select', 'a'].includes(node.type))) {
    assert.match(control.props.className ?? '', /(?:^| )(?:min-h-(?:11|12|14|16)|h-(?:11|12|14|16)|size-(?:11|12|14|16))(?: |$)/, '44px minimum: ' + text(control));
    if (['input', 'select'].includes(control.type)) assert.match(control.props.className, /text-base/);
  }
}

for (const spec of specifications) {
  test(spec.title + ': real screen renders standard toolbar, cards, table, page sizes and permission-aware FAB', async () => {
    const calls = [], creations = [];
    globalThis.__p2Api = dataApi(query => { calls.push(query); return pageResult(); });
    await mounted(h(spec.Component, { currentBranch: 'QA-A', [spec.callback]: () => creations.push('create') }), async tree => {
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], { method: spec.method, kind: spec.kind, page: 1, search: '', branch: 'QA-A', pageSize: 20 });
      const html = markup(tree);
      assert.match(html, /background-color:#00695C/);
      assert.ok(html.includes('<h1') && html.includes(spec.title));
      const positions = ['role="search"', 'aria-label="Bộ lọc"', 'aria-label="Làm mới"'].map(value => html.indexOf(value));
      assert.ok(positions.every(position => position >= 0));
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
      assert.equal(tree.root.findAll(node => node.type === 'table').length, 1);
      const mobile = tree.root.findAll(node => node.type === 'div' && node.props.className === 'space-y-3 lg:hidden')[0];
      assert.equal(text(mobile).split('QA-001').length - 1, 1, 'one code per mobile card');
      const size = tree.root.findAll(node => node.type === 'select' && node.props['aria-label'] === 'Số dòng mỗi trang')[0];
      assert.deepEqual(size.findAllByType('option').map(node => node.props.value), [20, 50, 100]);
      assert.match(button(tree, spec.fab).props.className, /fixed/);
      await click(button(tree, spec.fab));
      assert.deepEqual(creations, ['create']);
      assertTouchClasses(tree);
      await act(async () => tree.update(h(spec.Component, { currentBranch: 'QA-A' })));
      assert.equal(button(tree, spec.fab), undefined);
      assert.equal(nativeButton(tree, 'Tạo mới'), undefined);
    });
  });

  test(spec.title + ': search waits 300ms; Enter and clear are immediate and reset pagination', async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const calls = [];
    globalThis.__p2Api = dataApi(query => { calls.push(query); return pageResult([row('QA-query')], query.page, query.pageSize); });
    await mounted(h(spec.Component, { currentBranch: 'QA-A' }), async tree => {
      await click(button(tree, 'Trang sau'));
      assert.equal(calls.at(-1).page, 2);
      const input = () => tree.root.findByType('input');
      act(() => input().props.onChange({ target: { value: 'query' } }));
      await act(async () => context.mock.timers.tick(299));
      assert.equal(calls.length, 2);
      await act(async () => context.mock.timers.tick(1));
      assert.equal(calls.at(-1).search, 'query');
      assert.equal(calls.at(-1).page, 1);
      act(() => input().props.onChange({ target: { value: 'immediate' } }));
      await act(async () => tree.root.findByProps({ role: 'search' }).props.onSubmit({ preventDefault: noop }));
      assert.equal(calls.at(-1).search, 'immediate');
      await click(button(tree, 'Xóa tìm kiếm'));
      assert.equal(calls.at(-1).search, '');
    });
  });

  test(spec.title + ': filters reset to first page; API paging/size and stale branch response fences remain intact', async () => {
    const calls = [];
    let finishOld;
    globalThis.__p2Api = dataApi(query => {
      calls.push(query);
      if (query.branch === 'QA-A' && query.page === 2) return new Promise(resolve => { finishOld = () => resolve(pageResult([row('STALE')], 2)); });
      return pageResult([row('ROW-' + query.branch)], query.page, query.pageSize, true);
    });
    await mounted(h(spec.Component, { currentBranch: 'QA-A' }), async tree => {
      const size = () => tree.root.findAll(node => node.type === 'select')[0];
      await act(async () => size().props.onChange({ target: { value: '100' } }));
      assert.equal(calls.at(-1).pageSize, 100);
      await click(button(tree, 'Trang sau'));
      await act(async () => tree.update(h(spec.Component, { currentBranch: 'QA-B' })));
      await act(async () => finishOld());
      assert.equal(calls.at(-1).branch, 'QA-B');
      assert.equal(calls.at(-1).page, 1);
      assert.doesNotMatch(markup(tree), /STALE/);
      await click(button(tree, 'Trang sau'));
      const chip = tree.root.findAll(node => node.type === 'button' && node.props['aria-pressed'] === false)[0];
      await click(chip);
      assert.equal(calls.at(-1).page, 1);
      assert.equal(calls.at(-1).pageSize, 100);
    });
  });

  test(spec.title + ': shared loading/error/empty state retries without claiming success', async () => {
    let reject, empty = false;
    globalThis.__p2Api = dataApi(() => empty ? pageResult([], 1, 20, false) : new Promise((_, fail) => { reject = fail; }));
    await mounted(h(spec.Component, { currentBranch: 'QA-A' }), async tree => {
      assert.match(markup(tree), /Đang tải danh sách/);
      await act(async () => reject(new Error('synthetic unavailable')));
      assert.match(markup(tree), /role="alert"/);
      assert.ok(nativeButton(tree, 'Thử lại'));
      empty = true;
      await click(nativeButton(tree, 'Thử lại'));
      assert.match(markup(tree), /Chưa có chứng từ khớp/);
      assert.equal(button(tree, spec.fab), undefined);
    });
  });

  test(spec.title + ': opening a card preserves the real detail read and exposes no local approval/stock mutation', async () => {
    const calls = [], api = dataApi();
    globalThis.__p2Api = async (method, ...args) => { calls.push({ method, args }); return api(method, ...args); };
    await mounted(h(spec.Component, { currentBranch: 'QA-A' }), async tree => {
      const card = tree.root.findAll(node => node.type === 'button' && text(node).includes('QA-001'))[0];
      await click(card);
      const detail = tree.root.findAll(node => node.type === 'section' && node.props['aria-label'] === 'Chi tiết')[0];
      assert.ok(detail);
      assert.ok(text(detail).includes('QA-001'));
      assert.doesNotMatch(text(detail), /Phê duyệt|Xác nhận vào kệ kho/);
      const method = spec.kind === 'purchase-requests' ? 'getPurchaseRequestDetail' : 'getDocumentDetail';
      assert.deepEqual(calls.at(-1), { method, args: [spec.kind === 'purchase-requests' ? 'qa-scope' : spec.kind, 'QA-001'] });
    });
  });
}

test('home retains supplied metrics and opens a source-backed pending document without local approval', async () => {
  globalThis.__p2Api = dataApi();
  const selected = [];
  await mounted(h(TabHome, { currentBranch: 'QA-A', ordersCount: 7, purchasesCount: 8, inboundCount: 9, onNavigateTab: noop, onSelectPurchaseItem: item => selected.push(item) }), async tree => {
    const html = markup(tree);
    assert.doesNotMatch(html, /Duyệt nhanh|Đã phê duyệt|Trực tuyến/);
    for (const value of ['7 đơn', '8 phiếu', '9 phiếu']) assert.ok(html.includes(value));
    const card = tree.root.findAll(node => node.type === 'button' && text(node).includes('QA-001'))[0];
    await click(card);
    assert.equal(selected[0].id, 'QA-001');
    assert.equal(selected[0].code, 'QA-001');
    assert.equal(selected[0].purpose, 'Nội dung đề nghị tổng hợp');
  });
});

test('settings renders the session profile and a 44px accessible theme switch; no fake connection status', async () => {
  let toggles = 0;
  await mounted(h(TabSettings, { currentBranch: 'QA-A', currentUser: user, isDarkMode: true, onToggleDarkMode: () => toggles++, onLogout: noop, onBranchChange: noop }), async tree => {
    const html = markup(tree);
    for (const value of [user.displayName, user.username, user.role, user.companyName]) assert.ok(html.includes(value));
    assert.doesNotMatch(html, /12ms|Kiểm tra kết nối|Hoạt động|MC-0842|AES-GCM/);
    const toggle = tree.root.findAll(node => node.type === 'button' && node.props.role === 'switch')[0];
    assert.equal(toggle.props['aria-checked'], true);
    await click(toggle);
    assert.equal(toggles, 1);
    assertTouchClasses(tree);
  });
});

test('scanner validates opaque manual/camera text without inventing medicine, stock or document mutations', async () => {
  const navigations = [];
  await mounted(h(UntitledQrScannerView, { scopeKey: 'QA-session', onOpenPurchases: () => navigations.push('PR'), onOpenInbound: () => navigations.push('inbound') }), async tree => {
    const input = () => tree.root.findByType('input');
    const submit = async value => {
      act(() => input().props.onChange({ target: { value } }));
      await act(async () => tree.root.findByType('form').props.onSubmit({ preventDefault: noop }));
    };
    await submit(' ');
    assert.match(markup(tree), /Nhập mã có nội dung/);
    await submit('QA-QR-001');
    assert.match(markup(tree), /QA-QR-001/);
    assert.doesNotMatch(markup(tree), /Hapacol|Camera AI Live|Tồn kho khả dụng|Đã nhận diện|GS1_NATIONAL/);
    await click(nativeButton(tree, 'Mở đề nghị PR'));
    await click(nativeButton(tree, 'Mở nhập kho'));
    assert.deepEqual(navigations, ['PR', 'inbound']);
    await click(nativeButton(tree, 'Mở camera'));
    const camera = tree.root.findByType('scanner-fixture');
    assert.equal(camera.props.open, true);
    assert.equal(camera.props.scopeKey, 'QA-session');
    await act(async () => camera.props.onConfirm('QA-CAMERA'));
    assert.match(markup(tree), /QA-CAMERA/);
    await submit('bad\u0000text');
    assert.match(markup(tree), /Nhập mã có nội dung/);
    assertTouchClasses(tree);
  });
});

// Keep the parent state and authority reads real. Replace only presentation
// leaves so creation routing can be tested without a DOM, camera or ERP writes.
const parentLeaves = {
  'desktop-header': 'DesktopHeader', 'desktop-sidebar': 'DesktopSidebar', 'mobile-header': 'UntitledMobileHeader',
  'bottom-nav': 'UntitledBottomNav', 'tab-home': 'TabHome', 'tab-orders': 'TabOrders', 'tab-purchases': 'TabPurchases',
  'tab-inbound': 'TabInbound', 'qr-scanner-view': 'UntitledQrScannerView', 'tab-settings': 'TabSettings',
  'login-screen': 'LoginScreen', 'purchase-order-create-sheet': 'PurchaseOrderCreateSheet',
  'purchase-request-create-sheet': 'PurchaseRequestCreateSheet', 'notifications-sheet': 'NotificationsSheet',
  'sidebar-drawer': 'SidebarDrawer', 'tab-erp-screen': 'TabErpScreen',
};
await build({ entryPoints: ['components/untitledui/medcom-app.tsx'], outfile: output + '/parent.cjs', bundle: true,
  platform: 'node', format: 'cjs', packages: 'external', alias: { '@': process.cwd() }, jsx: 'automatic', logLevel: 'warning',
  plugins: [{
    name: 'parent-presentation-fixtures',
    setup(builder) {
      builder.onResolve({ filter: /erp-client$/ }, () => ({ path: 'erp-client', namespace: 'parent-fixture' }));
      builder.onResolve({ filter: /^\.\// }, args => {
        if (!args.importer.replaceAll('\\', '/').endsWith('/medcom-app.tsx')) return null;
        const key = args.path.slice(2);
        return parentLeaves[key] ? { path: key, namespace: 'parent-fixture' } : null;
      });
      builder.onLoad({ filter: /.*/, namespace: 'parent-fixture' }, args => ({
        contents: args.path === 'erp-client' ? client : 'export const ' + parentLeaves[args.path] + '=props=><parent-fixture name="' + args.path + '" {...props}/>;',
        loader: 'tsx', resolveDir: process.cwd(),
      }));
    },
  }],
});
const { MedcomApp } = require('../' + output + '/parent.cjs');
const leaf = (tree, name) => tree.root.findAll(node => node.type === 'parent-fixture' && node.props.name === name)[0];
async function parentEnvironment(verify) {
  const previous = Object.fromEntries(['window', 'document', 'localStorage', 'confirm'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const events = new EventTarget();
  const classList = { add: noop, remove: noop };
  const storage = new Map([['medcom.auth.user', JSON.stringify(user)], ['medcom.auth.remember', 'false']]);
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), matchMedia: () => ({ matches: false }) } },
    document: { configurable: true, value: { documentElement: { classList }, body: { classList } } },
    localStorage: { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } },
    confirm: { configurable: true, value: () => true },
  });
  try { await verify(); }
  finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}
function parentApi({ crud = true, enabled = true, visible = true, missingAction = false, failed = false, delayBranch } = {}) {
  return async (method, ...args) => {
    if (method === 'getSession') return {};
    if (method === 'getBranchesList') return { items: [{ id: 'QA-A', name: 'Chi nhánh A' }, { id: 'QA-B', name: 'Chi nhánh B' }] };
    if (method === 'getScreenPermissions') return { screens: ['purchase-orders', 'purchase-requests'].map(module => ({ module, canView: true, crud: { canCreate: crud } })) };
    if (method === 'getErpModuleActions') {
      if (failed) throw Error('synthetic unavailable');
      if (args[1].branchId === 'QA-B' && delayBranch) await delayBranch;
      return missingAction ? [] : [{ id: 'create', visible, enabled }];
    }
    if (method === 'getNotifications') return { items: [], unreadCount: 0 };
    return dataApi()(method, ...args);
  };
}
for (const flags of [{}, { crud: false }, { enabled: false }, { visible: false }, { missingAction: true }, { failed: true }]) {
  test('parent exposes real PO/PR create sheets only with current CRUD and action admission: ' + JSON.stringify(flags), async () => {
    await parentEnvironment(async () => {
      globalThis.__p2Api = parentApi(flags);
      await mounted(h(MedcomApp), async tree => {
        assert.equal(leaf(tree, 'tab-settings').props.currentUser.username, user.username);
        assert.equal(leaf(tree, 'tab-inbound').props.onOpenNewInbound, undefined, 'no direct real inbound creation handoff exists');
        const allowed = Object.keys(flags).length === 0;
        for (const [tab, sheet, module] of [['tab-orders', 'purchase-order-create-sheet', 'purchase-orders'], ['tab-purchases', 'purchase-request-create-sheet', 'purchase-requests']]) {
          const callback = leaf(tree, tab).props.onOpenCreateModal;
          assert.equal(typeof callback, allowed ? 'function' : 'undefined');
          if (!allowed) continue;
          await act(async () => callback());
          assert.equal(leaf(tree, sheet).props.open, true);
          assert.equal(leaf(tree, sheet).props.currentBranch, 'QA-A');
          await act(async () => leaf(tree, sheet).props.onCreated('QA-CREATED'));
          assert.equal(leaf(tree, sheet), undefined);
          const detail = tree.root.findAll(node => node.type === 'parent-fixture' && node.props.name === 'tab-erp-screen' && node.props.module === module)[0];
          assert.equal(detail.props.targetDocumentId, 'QA-CREATED');
          assert.equal(detail.props.isActive, true);
        }
        await act(async () => leaf(tree, 'tab-home').props.onSelectPurchaseItem({ id: 'QA-PENDING' }));
        const pending = tree.root.findAll(node => node.type === 'parent-fixture' && node.props.name === 'tab-erp-screen' && node.props.module === 'purchase-requests')[0];
        assert.equal(pending.props.targetDocumentId, 'QA-PENDING');
        assert.equal(pending.props.isActive, true);
      });
    });
  });
}
test('branch changes retire open creation and old admission while pending; newly admitted branch does not reopen an old form', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  await parentEnvironment(async () => {
    globalThis.__p2Api = parentApi({ delayBranch: pending });
    await mounted(h(MedcomApp), async tree => {
      await act(async () => leaf(tree, 'tab-orders').props.onOpenCreateModal());
      assert.ok(leaf(tree, 'purchase-order-create-sheet'));
      await act(async () => leaf(tree, 'desktop-header').props.onBranchChange('QA-B'));
      assert.equal(leaf(tree, 'purchase-order-create-sheet'), undefined);
      assert.equal(leaf(tree, 'tab-orders').props.onOpenCreateModal, undefined);
      await act(async () => finish());
      assert.equal(typeof leaf(tree, 'tab-orders').props.onOpenCreateModal, 'function');
      assert.equal(leaf(tree, 'purchase-order-create-sheet'), undefined);
      await act(async () => leaf(tree, 'tab-orders').props.onOpenCreateModal());
      assert.equal(leaf(tree, 'purchase-order-create-sheet').props.currentBranch, 'QA-B');
      await act(async () => leaf(tree, 'desktop-header').props.onBranchChange('QA-A'));
      assert.equal(leaf(tree, 'purchase-order-create-sheet'), undefined);
    });
  });
});

test('removed fake controls and QuickCreate implementation have no remaining application references', async () => {
  for (const file of ['medcom-app', 'tab-orders', 'tab-purchases', 'tab-inbound', 'tab-home', 'tab-settings', 'qr-scanner-view']) {
    const source = await readFile('components/untitledui/' + file + '.tsx', 'utf8');
    assert.doesNotMatch(source, /QuickCreateModal|quick-create-modal|handleApprove|handleReject|handleAdvanceStage|Duyệt nhanh|handleTestConnection|py-0\.2/);
  }
  await assert.rejects(readFile('components/untitledui/quick-create-modal.tsx'), { code: 'ENOENT' });
});
