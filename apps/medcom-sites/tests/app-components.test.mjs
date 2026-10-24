import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { act, create } = require('react-test-renderer');
const h = React.createElement;
await mkdir('.test-runtime/p2-components', { recursive: true });
await build({
  stdin: { contents: `export * from './components/app'; export {Sheet,SheetContent} from './components/ui/sheet';`, loader: 'tsx', resolveDir: process.cwd() },
  outfile: '.test-runtime/p2-components/ui.cjs', bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  alias: { '@': process.cwd() }, jsx: 'automatic', logLevel: 'warning',
});
const { AppButton, ScreenHeader, ScreenToolbar, FilterChips, FilterSheet, CreateFab, StatusBadge, RecordCard, RecordTable, RecordList,
  ListState, Pagination, FormSheet, FormField, FormSection, useIsMobile, Sheet, SheetContent } = require('../.test-runtime/p2-components/ui.cjs');
const noop = () => {};
const render = element => renderToStaticMarkup(element);
const toolbar = (extra = {}) => h(ScreenToolbar, { search: '', onSearchChange: noop, onSearch: noop, onFilter: noop, onRefresh: noop, ...extra });
const record = { id: 'QA-001', title: 'Đối tượng tổng hợp' };
const columns = [{ id: 'code', label: 'Mã', render: row => row.id }, { id: 'title', label: 'Đối tượng', render: row => row.title }];
const card = row => ({ code: row.id, title: row.title, meta: ['2026-10-24', 'Người lập tổng hợp'], status: { label: 'Nháp' } });
const paging = { page: 2, pageSize: 20, rowCount: 1, hasMore: true, onPageChange: noop, onPageSizeChange: noop };
const form = extra => h(FormSheet, { open: true, title: 'Tạo chứng từ tổng hợp', submitLabel: 'Tạo chứng từ', onClose: noop, onSubmit: noop, ...extra }, h(FormField, { label: 'Ghi chú', defaultValue: 'QA' }));

async function mounted(element, verify) {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  try {
    await act(async () => { tree = create(element); });
    await verify(tree);
  } finally {
    if (tree) await act(async () => tree.unmount());
    if (previous === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

function hostElement(node) {
  if (node === null || typeof node === 'string') return node;
  if (Array.isArray(node)) return h(React.Fragment, null, ...node.map(hostElement));
  return h(node.type, node.props, ...(node.children ?? []).map(hostElement));
}

// Radix portals intentionally have no server markup. Mount the real content's
// children in their real Sheet context, then serialize resolved host nodes. This
// avoids using two renderers on a context. Native browser focus is separate QA.
async function sheetMarkup(element, verify) {
  await mounted(element, async tree => {
    const content = tree.root.findByType(SheetContent);
    await mounted(h(Sheet, { open: true }, content.props.children), async body => {
      await verify(render(hostElement(body.toJSON())), content, tree);
    });
  });
}

test('toolbar keeps search → filter → refresh → desktop create and accessible standard labels', () => {
  const html = render(toolbar({ onCreate: noop, filterCount: 2, filterOpen: true, filterId: 'qa-filters' }));
  const positions = ['role="search"', 'aria-label="Bộ lọc (2)"', 'aria-label="Làm mới"', '>Tạo mới</button>'].map(value => html.indexOf(value));
  assert.ok(positions.every(position => position >= 0));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(html, /placeholder="Tìm mã, đối tượng, người lập…"/);
  assert.match(html, /aria-haspopup="dialog" aria-expanded="true" aria-controls="qa-filters"/);
  assert.match(html, /sticky top-\[var\(--app-toolbar-top,0px\)\]/);
  assert.doesNotMatch(render(toolbar()), /Tạo mới/);
});

test('toolbar debounces 300 ms, replaces pending searches, and Enter/clear search immediately', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  function Harness() {
    const [search, setSearch] = React.useState('');
    return toolbar({ search, onSearchChange: setSearch, onSearch: value => calls.push(value) });
  }
  await mounted(h(Harness), async tree => {
    assert.deepEqual(calls, []);
    act(() => tree.root.findByType('input').props.onChange({ target: { value: 'Q' } }));
    act(() => context.mock.timers.tick(250));
    act(() => tree.root.findByType('input').props.onChange({ target: { value: 'QA' } }));
    act(() => context.mock.timers.tick(299));
    assert.deepEqual(calls, []);
    act(() => context.mock.timers.tick(1));
    assert.deepEqual(calls, ['QA']);
    act(() => tree.root.findByType('input').props.onChange({ target: { value: 'QA-2' } }));
    let prevented = false;
    act(() => tree.root.findByType('form').props.onSubmit({ preventDefault: () => { prevented = true; } }));
    assert.ok(prevented);
    act(() => context.mock.timers.tick(300));
    assert.deepEqual(calls, ['QA', 'QA-2']);
    act(() => tree.root.findByType('input').props.onChange({ target: { value: 'pending' } }));
    act(() => tree.root.findAllByType('button').find(button => button.props['aria-label'] === 'Xóa tìm kiếm').props.onClick());
    assert.equal(tree.root.findByType('input').props.value, '');
    act(() => context.mock.timers.tick(300));
    assert.deepEqual(calls, ['QA', 'QA-2', '']);
    act(() => tree.root.findByType('input').props.onChange({ target: { value: 'unmounted' } }));
  });
  context.mock.timers.tick(300);
  assert.deepEqual(calls, ['QA', 'QA-2', '']);
});

test('toolbar cancels pending work on an external reset and uses the latest search callback', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const props = { search: '', onSearchChange: noop, onSearch: value => calls.push(['original', value]) };
  await mounted(toolbar(props), tree => {
    act(() => tree.root.findByType('input').props.onChange({ target: { value: 'QA' } }));
    act(() => tree.update(toolbar({ ...props, search: 'QA' })));
    act(() => tree.update(toolbar({ ...props, search: 'QA', onSearch: value => calls.push(['latest', value]) })));
    act(() => context.mock.timers.tick(300));
    assert.deepEqual(calls, [['latest', 'QA']]);
    act(() => tree.root.findByType('input').props.onChange({ target: { value: 'pending' } }));
    act(() => tree.update(toolbar({ ...props, search: 'pending' })));
    act(() => tree.update(toolbar({ ...props, search: '' })));
    act(() => context.mock.timers.tick(300));
    assert.deepEqual(calls, [['latest', 'QA']]);
  });
});

test('chips expose counts/pressed state and reset pagination to 1', async () => {
  const events = [];
  const element = h(FilterChips, { items: [{ value: '', label: 'Tất cả', count: 10 }, { value: 'draft', label: 'Nháp', count: 3 }], value: 'draft',
    onChange: value => events.push(['status', value]), onPageChange: page => events.push(['page', page]) });
  const html = render(element);
  assert.match(html, /aria-pressed="false"[^>]*>Tất cả<span[^>]*>10</);
  assert.match(html, /aria-pressed="true"[^>]*>Nháp<span[^>]*>3</);
  assert.match(html, /overflow-x-auto/);
  await mounted(element, tree => act(() => tree.root.findAllByType('button')[0].props.onClick()));
  assert.deepEqual(events, [['status', ''], ['page', 1]]);
});

test('RecordCard has one code, two-line title, distinct metadata and one button', async () => {
  let opened = 0;
  const data = { ...card(record), meta: ['2026-10-24', record.id, 'Người lập tổng hợp', '2026-10-24', '', null] };
  const element = h(RecordCard, { ...data, onOpen: () => { opened++; } });
  const html = render(element);
  assert.equal(html.split(record.id).length - 1, 1);
  assert.equal(html.split('2026-10-24').length - 1, 1);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  assert.match(html, /min-h-16/);
  assert.match(html, /line-clamp-2/);
  assert.match(html, /2026-10-24 · Người lập tổng hợp/);
  await mounted(element, tree => act(() => tree.root.findByType('button').props.onClick()));
  assert.equal(opened, 1);
});

test('StatusBadge uses subdued ERP theme pairs and semantic fallback tones', () => {
  const badge = props => render(h(StatusBadge, { label: 'Tổng hợp', ...props }));
  // P2-06 replaces raw Windows colors with theme pairs; contrast assertions and
  // computed light/dark browser colors live in app-visual-qa.test.mjs.
  for (const colors of [['#FFFFFF', '#123456'], ['#FFFF00', '#FFFF00'], ['#000000', '#000000']]) {
    assert.match(badge({ statusForeColor: colors[0], statusBackColor: colors[1] }), /--status-fg:#[A-F0-9]{6};--status-bg:#[A-F0-9]{6};--status-dark-fg:#[A-F0-9]{6};--status-dark-bg:#[A-F0-9]{6}/);
  }
  const fallback = badge({ tone: 'success', statusForeColor: 'invalid', statusBackColor: 'url(unsafe)' });
  assert.match(fallback, /--status-fg:#166534;--status-bg:#F0FDF4;--status-dark-fg:#BBF7D0;--status-dark-bg:#052E16/);
});

test('ListState uses responsive skeletons, permission-aware empty state and one retry error style', async () => {
  const loading = render(h(ListState, { state: 'loading', columnCount: 5 }));
  assert.match(loading, /role="status" aria-busy="true"/);
  assert.match(loading, /lg:hidden/);
  assert.match(loading, /hidden.*lg:block/);
  assert.doesNotMatch(loading, /<button/);
  assert.doesNotMatch(render(h(ListState, { state: 'empty' })), /Tạo mới/);
  assert.match(render(h(ListState, { state: 'empty', empty: { message: 'Không có kết quả tổng hợp', onCreate: noop } })), /Không có kết quả tổng hợp.*Tạo mới/);
  let retried = 0;
  const error = h(ListState, { state: 'error', error: 'Lỗi tổng hợp', onRetry: () => { retried++; } });
  assert.match(render(error), /role="alert".*bg-red-50.*dark:bg-red-950/);
  await mounted(error, tree => act(() => tree.root.findByType('button').props.onClick()));
  assert.equal(retried, 1);
});

test('list/table compose mobile cards and desktop configured columns with offsets, paging and empty/error states', async () => {
  let opened;
  const props = { label: 'Danh sách tổng hợp', rows: [record], columns, rowId: row => row.id, onOpen: row => { opened = row; } };
  const html = render(h(RecordList, { ...props, card, pagination: paging }));
  assert.match(html, /<table/);
  assert.match(html, /<th[^>]*>Đối tượng<\/th>/);
  assert.match(html, />21<\/td>/);
  assert.match(html, /data-document-pagination/);
  assert.match(html, /lg:hidden/);
  assert.match(render(h(RecordTable, props)), /hidden.*lg:block/);
  await mounted(h(RecordTable, props), tree => act(() => tree.root.findByType('button').props.onClick({ stopPropagation: noop })));
  assert.equal(opened, record);
  assert.doesNotMatch(render(h(RecordList, { ...props, card, loading: true })), /QA-001|<table/);
  assert.match(render(h(RecordList, { ...props, card, error: 'Lỗi QA', onRetry: noop })), /Thử lại/);
  assert.match(render(h(RecordList, { ...props, card, rows: [] })), /Chưa có chứng từ/);
});

test('pagination offers exactly 20/50/100 and forwards paging callbacks', async () => {
  const events = [];
  const element = h(Pagination, { ...paging, onPageChange: value => events.push(['page', value]), onPageSizeChange: value => events.push(['size', value]) });
  const html = render(element);
  assert.deepEqual([...html.matchAll(/<option value="(\d+)"/g)].map(match => Number(match[1])), [20, 50, 100]);
  await mounted(element, tree => {
    act(() => tree.root.findByType('select').props.onChange({ target: { value: '100' } }));
    act(() => tree.root.findAllByType('button').find(button => button.props['aria-label'] === 'Trang sau').props.onClick());
  });
  assert.deepEqual(events, [['size', 100], ['page', 3]]);
});

test('header/create FAB keep desktop actions and mobile permission/safe-area placement', () => {
  const header = render(h(ScreenHeader, { title: 'Danh sách tổng hợp', branch: 'QA', count: 0, onCreate: noop }));
  assert.match(header, /<h1[^>]*text-2xl font-bold/);
  assert.match(header, /Chi nhánh QA · 0 chứng từ/);
  assert.match(header, /hidden md:inline-flex/);
  assert.equal(render(h(CreateFab, { allowed: false, label: 'Tạo chứng từ', onClick: noop })), '');
  // Portals intentionally emit no SSR markup. The visual QA suite checks the
  // real body child, size, click and safe-area bounds in a browser after mount.
  assert.equal(render(h(CreateFab, { allowed: true, label: 'Tạo chứng từ tổng hợp', onClick: noop })), '');
});

test('FormField connects label, required marker, hint and error to the input and supports custom controls', () => {
  const html = render(h(FormSection, { title: 'Thông tin', description: 'Tổng hợp' }, h(FormField, { id: 'qa-field', label: 'Tên', required: true, hint: 'Gợi ý', error: 'Bắt buộc' })));
  assert.match(html, /<label for="qa-field"/);
  assert.match(html, /aria-required="true" aria-invalid="true" aria-describedby="qa-field-hint qa-field-error"/);
  assert.match(html, /id="qa-field-error" role="alert"/);
  assert.match(html, /md:grid-cols-2/);
  assert.doesNotMatch(html, /\(\*\):/);
  const custom = render(h(FormField, { label: 'Loại', id: 'qa-select' }, props => h('select', props, h('option', null, 'QA'))));
  assert.match(custom, /<select id="qa-select"/);
  assert.match(custom, /min-h-11.*text-base/);
});

test('FormSheet has a full-screen mobile dialog, max-w-3xl desktop, scroll body and sticky safe-area footer', async () => {
  await sheetMarkup(form(), (html, content) => {
    assert.equal(content.props['aria-modal'], 'true');
    assert.equal(content.props.showCloseButton, false);
    assert.match(content.props.className, /h-dvh.*md:max-w-3xl/);
    assert.match(html, /overflow-y-auto/);
    assert.match(html, /<footer[^>]*sticky bottom-0[^>]*safe-area-inset-bottom/);
    assert.match(html, />Hủy<\/button>/);
    assert.match(html, />Tạo chứng từ<\/button>/);
    assert.match(html, /aria-label="Đóng"/);
  });
});

test('FormSheet routes Enter through next/final submission and suppresses disabled/busy actions', async () => {
  const steps = [{ id: 'one', label: 'Thông tin' }, { id: 'two', label: 'Xác nhận' }];
  const calls = [];
  for (const extra of [
    { currentStep: 0 }, { currentStep: 0, nextDisabled: true }, { currentStep: 1 }, { currentStep: 1, busy: true }, { currentStep: 1, submitDisabled: true },
  ]) await mounted(form({ steps, onNext: () => calls.push('next'), onSubmit: () => calls.push('submit'), ...extra }), async tree => {
    const content = tree.root.findByType(SheetContent);
    await mounted(h(Sheet, { open: true }, content.props.children), body => {
      act(() => body.root.findByType('form').props.onSubmit({ preventDefault: noop }));
      assert.equal(body.root.findAllByType('li')[extra.currentStep].props['aria-current'], 'step');
    });
  });
  assert.deepEqual(calls, ['next', 'submit']);
  await sheetMarkup(form({ steps, currentStep: 0, onNext: noop }), html => assert.match(html, />Tiếp tục<\/button>/));
  await sheetMarkup(form({ steps, currentStep: 1, onBack: noop }), html => assert.match(html, />Quay lại<\/button>/));
});

test('FilterSheet stages status/page/date edits, applies values and resets to defaults', async () => {
  const value = { status: 'draft', pageSize: 50, dateFrom: '2026-10-01', dateTo: '2026-10-24' };
  const calls = [];
  const element = h(FilterSheet, { open: true, value, statuses: [{ value: 'draft', label: 'Nháp' }], dateRange: true,
    onApply: next => calls.push(next), onClose: () => calls.push('close') });
  await sheetMarkup(element, (html, content) => {
    assert.equal(content.props['aria-modal'], 'true');
    assert.match(content.props.className, /rounded-t-2xl.*md:right-6/);
    assert.match(content.props.className, /md:max-h-\[calc\(100dvh_-_var\(--app-filter-top,8rem\)_-_1rem\)\]/);
    assert.match(html, /Trạng thái.*Số dòng mỗi trang.*Từ ngày.*Đến ngày/);
    assert.match(html, /Xóa lọc.*Áp dụng/);
  });
  await mounted(element, async tree => {
    const content = tree.root.findByType(SheetContent);
    await mounted(h(Sheet, { open: true }, content.props.children), body => {
      const selects = body.root.findAllByType('select');
      act(() => selects[0].props.onChange({ target: { value: '' } }));
      act(() => selects[1].props.onChange({ target: { value: '100' } }));
      assert.deepEqual(calls, []);
      act(() => body.root.findByType('form').props.onSubmit({ preventDefault: noop }));
      assert.deepEqual(calls, [{ ...value, status: '', pageSize: 100 }, 'close']);
      act(() => body.root.findAllByType('button').find(button => button.props.children === 'Xóa lọc').props.onClick());
      assert.deepEqual(calls.slice(2), [{ status: '', pageSize: 20, dateFrom: '', dateTo: '' }, 'close']);
    });
  });
});

test('sheet delegates modal focus trapping/Escape to real Radix and restores the external opener', async () => {
  let closed = 0;
  await mounted(form({ onClose: () => { closed++; } }), tree => {
    const root = tree.root.findByType(Sheet);
    assert.equal(root.props.modal, true);
    act(() => root.props.onOpenChange(false));
    assert.equal(closed, 1);
    const content = tree.root.findByType(SheetContent);
    assert.equal(content.props.onEscapeKeyDown, undefined, 'do not intercept Radix Escape handling');
    assert.equal(typeof content.props.onOpenAutoFocus, 'function');
    let focused = 0;
    class SyntheticElement { isConnected = true; focus() { focused++; } }
    const previousDocument = globalThis.document;
    const previousElement = globalThis.HTMLElement;
    globalThis.HTMLElement = SyntheticElement;
    globalThis.document = { activeElement: new SyntheticElement() };
    try {
      content.props.onOpenAutoFocus();
      let prevented = false;
      content.props.onCloseAutoFocus({ preventDefault: () => { prevented = true; } });
      assert.equal(focused, 1);
      assert.ok(prevented);
    } finally {
      if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
      if (previousElement === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = previousElement;
    }
  });
});

test('useIsMobile has a stable SSR snapshot, follows matchMedia and removes its change subscription', async () => {
  function Probe() { return h('output', null, String(useIsMobile())); }
  assert.equal(render(h(Probe)), '<output>false</output>');
  const previous = globalThis.window;
  let matches = true;
  const listeners = new Set();
  globalThis.window = { matchMedia: query => {
    assert.equal(query, '(max-width: 767px)');
    return { matches, addEventListener: (event, callback) => { assert.equal(event, 'change'); listeners.add(callback); }, removeEventListener: (event, callback) => listeners.delete(callback) };
  } };
  try {
    assert.equal(render(h(Probe)), '<output>false</output>', 'SSR ignores client viewport');
    await mounted(h(Probe), tree => {
      assert.equal(tree.root.findByType('output').props.children, 'true');
      act(() => { matches = false; for (const listener of listeners) listener(); });
      assert.equal(tree.root.findByType('output').props.children, 'false');
    });
    assert.equal(listeners.size, 0);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

test('render scan: every owned button/input/link/select/textarea has a target at least 44px; inputs use text-base', async () => {
  const targets = [];
  const scan = html => {
    for (const match of html.matchAll(/<(button|input|a|select|textarea)\b[^>]*>/g)) {
      const classes = match[0].match(/class="([^"]*)"/)?.[1] ?? '';
      assert.match(classes, /(?:^|\s)(?:min-h|h|size)-(?:11|12|14|16)(?:\s|$)/, match[0]);
      if (['input', 'select', 'textarea'].includes(match[1])) assert.match(classes, /(?:^|\s)text-base(?:\s|$)/, match[0]);
      targets.push(match[1]);
    }
  };
  for (const variant of ['primary', 'secondary', 'ghost', 'danger']) for (const size of ['md', 'lg', 'icon']) scan(render(h(AppButton, { variant, size, 'aria-label': 'QA' }, 'QA')));
  scan(render(toolbar({ search: 'QA', onCreate: noop, filterCount: 2 })));
  scan(render(h(FilterChips, { items: [{ value: '', label: 'Tất cả', count: 1 }], value: '', onChange: noop, onPageChange: noop })));
  scan(render(h(CreateFab, { allowed: true, label: 'Tạo QA', onClick: noop })));
  scan(render(h(ScreenHeader, { title: 'QA', onCreate: noop })));
  scan(render(h(RecordList, { label: 'QA', rows: [record], columns, rowId: row => row.id, card, onOpen: noop, pagination: paging })));
  scan(render(h(ListState, { state: 'empty', empty: { message: 'QA', onCreate: noop } })));
  scan(render(h(ListState, { state: 'error', error: 'QA', onRetry: noop })));
  scan(render(h(FormField, { label: 'QA' })));
  await sheetMarkup(form(), scan);
  await sheetMarkup(h(FilterSheet, { open: true, value: { status: '', pageSize: 20 }, statuses: [], dateRange: true, onClose: noop, onApply: noop }), scan);
  assert.ok(targets.length >= 30);
});
