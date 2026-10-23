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
const output = '.test-runtime/p2-navigation';
await mkdir(output, { recursive: true });
const imageFixture = {
  name: 'local-image-only',
  setup(builder) {
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: 'image', namespace: 'navigation-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'navigation-fixture' }, () => ({ contents: 'export default function Image({priority, ...props}) { return <img {...props}/>; }', loader: 'tsx', resolveDir: process.cwd() }));
  },
};
await build({ stdin: { contents: `
  export * from './components/untitledui/mobile-header';
  export * from './components/untitledui/bottom-nav';
  export * from './components/untitledui/desktop-header';
  export * from './components/untitledui/desktop-sidebar';
  export * from './components/untitledui/sidebar-drawer';
  export * from './components/app/app-navigation';
  export * from './components/app/branch-switcher';
  export {Sheet, SheetContent} from './components/ui/sheet';
  export {Popover, PopoverContent} from './components/ui/popover';
  export {erpScreenModules} from './lib/erp/proxy-policy';
`, loader: 'tsx', resolveDir: process.cwd() }, outfile: output + '/navigation.cjs', bundle: true, platform: 'node', format: 'cjs',
  packages: 'external', alias: { '@': process.cwd() }, jsx: 'automatic', plugins: [imageFixture], logLevel: 'warning' });
const { UntitledMobileHeader, UntitledBottomNav, DesktopHeader, DesktopSidebar, SidebarDrawer, NavigationList, NavigationMenu,
  BranchSwitcher, navigationSections, erpScreenModules, Sheet, SheetContent, Popover, PopoverContent } = require('../' + output + '/navigation.cjs');
const noop = () => {};
const branches = [{ id: 'QA-A', code: 'QA-A', name: 'Chi nhánh tổng hợp có tên rất dài để kiểm tra cắt chữ an toàn' }, { id: 'QA-B', code: 'QA-B', name: 'Chi nhánh tổng hợp B' }];
const access = allowed => ({ loading: false, error: false, allowed });
const props = { currentBranch: 'QA-A', branches, onBranchChange: noop, activeTab: 'home', onTabChange: noop, userName: 'Tài khoản tổng hợp', userRole: 'Vai trò tổng hợp',
  onNotificationsClick: noop, isDarkMode: false, onToggleDarkMode: noop, onLogout: noop, onToggleLayoutMode: noop, tabAccess: access(erpScreenModules) };
const render = element => renderToStaticMarkup(element);
function hostElement(node) {
  if (node === null || typeof node === 'string') return node;
  if (Array.isArray(node)) return h(React.Fragment, null, ...node.map(hostElement));
  return h(node.type, node.props, ...(node.children ?? []).map(hostElement));
}
const markup = tree => render(hostElement(tree.toJSON()));
async function mounted(element, verify) {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const oldFetch = globalThis.fetch;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = () => { throw Error('Live requests are forbidden in navigation tests'); };
  let tree;
  try { await act(async () => { tree = create(element); }); await verify(tree); }
  finally {
    if (tree) await act(async () => tree.unmount());
    globalThis.fetch = oldFetch;
    if (previous === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT; else globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}
const destinations = tree => tree.root.findAll(node => node.type === 'button' && node.props['data-tab']).map(node => node.props['data-tab']);
const button = (tree, tab) => tree.root.findAllByType('button').find(node => node.props['data-tab'] === tab);
function scanTargets(html) {
  const targets = [...html.matchAll(/<(button|input|a)\b[^>]*>/g)];
  assert.ok(targets.length > 0);
  for (const [tag, kind] of targets) {
    assert.match(tag, /class="[^"]*(?:min-h-11|min-h-14|size-11)/, tag);
    if (kind === 'input') assert.match(tag, /text-base/, tag);
  }
}

test('the shared navigation catalog covers every existing ERP module exactly once', () => {
  const ids = navigationSections.flatMap(section => section.items.map(item => item.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), [...erpScreenModules].sort());
});

test('375px bottom nav keeps four 56px destinations, brand counters and one current destination', async () => {
  for (const activeTab of ['home', 'purchases', 'inbound', 'scan', ...erpScreenModules, 'settings']) {
    const html = render(h(UntitledBottomNav, { activeTab, onTabChange: noop, pendingPurchasesCount: 120, pendingInboundCount: 2 }));
    assert.equal((html.match(/data-tab=/g) ?? []).length, 4);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(html, /text-xs/);
    assert.match(html, /99\+/);
    assert.match(html, /bg-brand-600/);
    assert.doesNotMatch(html, /rose-|text-\[11px\]/);
    scanTargets(html);
  }
  const calls = [];
  await mounted(h(UntitledBottomNav, { activeTab: 'scan', onTabChange: tab => calls.push(tab), onOpenMenu: () => calls.push('menu'), menuOpen: true }), tree => {
    assert.equal(button(tree, 'menu').props['aria-current'], 'page');
    assert.equal(button(tree, 'menu').props['aria-expanded'], true);
    for (const tab of ['home', 'purchases', 'inbound', 'menu']) act(() => button(tree, tab).props.onClick());
    assert.deepEqual(calls, ['home', 'purchases', 'inbound', 'menu']);
  });
});

test('mobile header uses provided branches and safe empty/unknown selections without invented defaults', async () => {
  await mounted(h(UntitledMobileHeader, props), tree => {
    const html = markup(tree);
    assert.match(html, /Chi nhánh tổng hợp/);
    assert.match(html, /truncate/);
    assert.match(html, /aria-label="Thông báo"/);
    assert.match(html, /aria-label="Hồ sơ tài khoản"/);
    assert.doesNotMatch(html, /\bxs:|py-0\.2|Live|Dược sĩ Minh/);
    scanTargets(html);
  });
  for (const branches of [[], props.branches]) {
    await mounted(h(UntitledMobileHeader, { ...props, branches, currentBranch: 'QA-UNKNOWN' }), tree => {
      const missing = markup(tree);
      assert.match(missing, /Chi nhánh QA-UNKNOWN/);
      assert.doesNotMatch(missing, /Chi nhánh tổng hợp/);
    });
  }
  await mounted(h(UntitledMobileHeader, { currentBranch: '', onBranchChange: noop }), tree => assert.match(markup(tree), /Chưa có chi nhánh/));
});

test('branch switcher selects only supplied IDs, marks the current branch and closes after selection', async () => {
  const calls = [];
  await mounted(h(BranchSwitcher, { ...props, onBranchChange: id => calls.push(id) }), async tree => {
    const root = tree.root.findByType(Popover);
    act(() => root.props.onOpenChange(true));
    assert.equal(tree.root.findByType(Popover).props.open, true);
    const content = tree.root.findByType(PopoverContent);
    await mounted(h('section', null, content.props.children), body => {
      scanTargets(markup(body));
      const buttons = body.root.findAllByType('button');
      assert.deepEqual(buttons.map(node => node.props['aria-pressed']), [true, false]);
      act(() => buttons[1].props.onClick());
    });
    assert.deepEqual(calls, ['QA-B']);
    assert.equal(tree.root.findByType(Popover).props.open, false);
  });
});

test('permissions fail closed for ERP modules; quick QR, home and settings remain reachable', async () => {
  for (const tabAccess of [null, { loading: true, error: false, allowed: null }, { loading: false, error: true, allowed: null }, access([]), access(['unknown-screen'])]) {
    await mounted(h(NavigationList, { activeTab: 'home', onSelect: noop, tabAccess, onRetryTabs: noop }), tree => {
      assert.deepEqual(destinations(tree), ['scan', 'home', 'settings']);
    });
  }
  let retried = 0;
  await mounted(h(NavigationList, { activeTab: 'home', onSelect: noop, tabAccess: { loading: false, error: true, allowed: null }, onRetryTabs: () => retried++ }), tree => {
    const retry = tree.root.findAllByType('button').find(node => node.props.children === 'Thử lại');
    act(() => retry.props.onClick());
    assert.equal(retried, 1);
  });
});

test('authority revocation removes links, and module selection preserves the exact ID', async () => {
  const calls = [];
  const initial = { activeTab: 'purchase-orders', onSelect: id => calls.push(id), tabAccess: access(['purchase-orders', 'sales-orders']) };
  await mounted(h(NavigationList, initial), async tree => {
    assert.equal(button(tree, 'purchase-orders').props['aria-current'], 'page');
    assert.match(button(tree, 'purchase-orders').props.className, /bg-brand-50/);
    act(() => button(tree, 'sales-orders').props.onClick());
    assert.deepEqual(calls, ['sales-orders']);
    await act(async () => tree.update(h(NavigationList, { ...initial, tabAccess: access(['sales-orders']) })));
    assert.equal(button(tree, 'purchase-orders'), undefined);
    await act(async () => tree.update(h(NavigationList, { ...initial, tabAccess: access([]) })));
    assert.deepEqual(destinations(tree), ['scan', 'home', 'settings']);
  });
});

test('module search filters locally by Vietnamese label or group with or without accents, clears and handles empty results', async () => {
  await mounted(h(NavigationList, { activeTab: 'home', onSelect: noop, tabAccess: access(erpScreenModules) }), tree => {
    const search = tree.root.findByType('input');
    act(() => search.props.onChange({ target: { value: 'dieu chuyen' } }));
    assert.equal(destinations(tree).length, 8);
    assert.ok(destinations(tree).every(id => id.startsWith('internal-transfer-')));
    act(() => search.props.onChange({ target: { value: 'điều chuyển' } }));
    assert.equal(destinations(tree).length, 8);
    act(() => search.props.onChange({ target: { value: 'KHONG_CO_KET_QUA' } }));
    assert.equal(destinations(tree).length, 0);
    assert.ok(tree.root.findAllByProps({ role: 'status' }).some(node => node.children.join('').includes('Không tìm thấy')));
    act(() => tree.root.findAllByType('button').find(node => node.props['aria-label'] === 'Xóa tìm phân hệ').props.onClick());
    assert.equal(destinations(tree).length, erpScreenModules.length + 3);
  });
  scanTargets(render(h(NavigationList, { activeTab: 'home', onSelect: noop, tabAccess: access(erpScreenModules) })));
});

test('desktop top menu and sidebar share catalog, tabAccess and retry callback', async () => {
  await mounted(h(DesktopHeader, props), tree => {
    const menu = tree.root.findByType(NavigationMenu);
    assert.equal(menu.props.tabAccess, props.tabAccess);
    assert.equal(menu.props.onSelect, props.onTabChange);
  });
  await mounted(h(DesktopSidebar, props), tree => {
    const list = tree.root.findByType(NavigationList);
    assert.equal(list.props.tabAccess, props.tabAccess);
    assert.equal(list.props.onSelect, props.onTabChange);
  });
  const calls = [];
  await mounted(h(NavigationMenu, { activeTab: 'home', tabAccess: access(['purchase-orders']), onSelect: id => calls.push(id) }), tree => {
    act(() => tree.root.findByType(Popover).props.onOpenChange(true));
    const list = tree.root.findByType(PopoverContent).props.children;
    act(() => list.props.onSelect('purchase-orders'));
    assert.deepEqual(calls, ['purchase-orders']);
    assert.equal(tree.root.findByType(Popover).props.open, false);
  });
  await mounted(h(DesktopHeader, props), tree => scanTargets(markup(tree)));
  await mounted(h(DesktopSidebar, props), tree => scanTargets(markup(tree)));
});

test('drawer delegates focus/Escape to Radix, restores the opener, and closes after choosing a module', async () => {
  const calls = [];
  await mounted(h(SidebarDrawer, { ...props, open: true, onClose: () => calls.push('close'), onSelectTab: id => calls.push(id) }), async tree => {
    const sheet = tree.root.findByType(Sheet);
    const content = tree.root.findByType(SheetContent);
    assert.equal(sheet.props.modal, true);
    assert.equal(content.props.side, 'left');
    assert.equal(content.props.showCloseButton, false);
    assert.equal(content.props.onEscapeKeyDown, undefined);
    assert.match(content.props.className, /h-dvh.*overflow-hidden/);
    const previousDocument = globalThis.document;
    const previousElement = globalThis.HTMLElement;
    let focused = 0;
    class SyntheticElement { isConnected = true; focus() { focused++; } }
    globalThis.HTMLElement = SyntheticElement;
    globalThis.document = { activeElement: new SyntheticElement() };
    try { content.props.onOpenAutoFocus(); content.props.onCloseAutoFocus({ preventDefault: noop }); assert.equal(focused, 1); }
    finally {
      if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
      if (previousElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = previousElement;
    }
    const list = React.Children.toArray(content.props.children).find(child => child.type === NavigationList);
    assert.equal(list.props.tabAccess, props.tabAccess);
    await mounted(h(Sheet, { open: true }, content.props.children), body => scanTargets(markup(body)));
    act(() => list.props.onSelect('purchase-orders'));
    assert.deepEqual(calls, ['purchase-orders', 'close']);
    act(() => sheet.props.onOpenChange(false));
    assert.deepEqual(calls, ['purchase-orders', 'close', 'close']);
  });
});

test('MedcomApp wires actual branches, permissions, menu state and reserves bottom nav + FAB + safe area', async () => {
  const source = await readFile('components/untitledui/medcom-app.tsx', 'utf8');
  for (const component of ['UntitledMobileHeader', 'DesktopHeader', 'DesktopSidebar']) {
    const tag = source.match(new RegExp('<' + component + '\\s[\\s\\S]*?/>'))?.[0];
    assert.match(tag, /branches=\{branches\}/);
    if (component !== 'UntitledMobileHeader') {
      assert.match(tag, /tabAccess=\{tabAccess\}/);
      assert.match(tag, /onRetryTabs=/);
    }
  }
  assert.match(source, /menuOpen=\{isSidebarOpen\}/);
  assert.match(source, /pb-\[calc\(10rem_\+_env\(safe-area-inset-bottom\)\)\] md:pb-8/);
  assert.doesNotMatch(await readFile('components/untitledui/button.tsx', 'utf8'), /neutral-750/);
});
