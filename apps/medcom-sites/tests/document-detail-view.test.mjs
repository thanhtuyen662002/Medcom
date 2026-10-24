import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { act, create } = require('react-test-renderer');
const h = React.createElement;
await mkdir('.test-runtime/document-detail', { recursive: true });
await build({
  stdin: {
    contents: `export * from './components/erp/document-detail';
      export {RecordDetailContext} from './components/erp/request-presentation';
      export {LookupField} from './components/untitledui/lookup-field';`,
    loader: 'tsx', resolveDir: process.cwd(),
  },
  outfile: '.test-runtime/document-detail/ui.cjs', bundle: true, platform: 'node',
  format: 'cjs', packages: 'external', alias: { '@': process.cwd() },
  jsx: 'automatic', logLevel: 'warning',
});
const { DocumentDetailView, DocumentDetailTabs, DocumentDetailDialog, DocumentActionBar, RecordDetailContext, LookupField } = require('../.test-runtime/document-detail/ui.cjs');
const screenModule = 'inbound-requests';
const noop = () => {};
const handlers = { onAction: noop, onFieldChange: noop, onLoadMore: noop, onRetry: noop };
const page = (count = 0, hasMore = false) => ({ rows: Array.from({ length: count }, (_, index) => ({ lineId: `QA-${index}`, fields: {} })), hasMore });
const config = (overrides = {}) => ({
  modules: [screenModule], title: 'Chi tiết kiểm thử', closeLabel: 'Đóng chi tiết',
  groups: [], hidden: [], lines: { title: 'Chi tiết dòng', columns: [], emptyText: 'Chưa có dòng kiểm thử' }, ...overrides,
});
const model = (overrides = {}) => ({
  documentId: 'QA-DOC', header: {}, lines: page(), status: { label: null, locked: null },
  loading: false, error: null, editing: false, dirty: false, busy: false, draft: {},
  feedback: null, actions: [], ...overrides,
});
const group = (fields, extras = {}) => ({ id: 'general', title: 'Thông tin kiểm thử', fields, ...extras });
const view = (configuration, state = model(), extras = {}) => h(DocumentDetailView, { config: configuration, model: state, handlers, module: screenModule, ...extras });
const render = (configuration, state, extras) => renderToStaticMarkup(view(configuration, state, extras));
const text = html => html.replace(/<[^>]*>/g, '');
const action = (id, overrides = {}) => ({ id, label: `Nút ${id}`, placement: 'primary', visible: true, enabled: true, ...overrides });

async function mounted(element, verify, options) {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  try {
    await act(async () => { tree = create(element, options); });
    await verify(tree);
  } finally {
    if (tree) await act(async () => tree.unmount());
    if (previous === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

test('header fields are an explicit allowlist and false is formatted in Vietnamese', () => {
  const output = render(config({ groups: [group([{ key: 'isRain', label: 'Thời tiết mưa', format: 'boolean' }])] }), model({ header: { isRain: false, orderTypeId: '1', secretToken: 'x' } }));
  assert.match(output, /<dd>Không<\/dd>/);
  assert.doesNotMatch(text(output), /orderTypeId|secretToken|false|Order Type Id/);
});

test('view hides empty fields by default and explicitly retained empties show an em dash', () => {
  const output = render(config({ groups: [group([
    { key: 'missing', label: 'Ẩn trường trống' },
    { key: 'blank', label: 'Hiện trường trống', hideWhenEmpty: false },
  ])] }), model({ header: { blank: '  ' } }));
  assert.doesNotMatch(output, /Ẩn trường trống/);
  assert.match(output, /<dt>Hiện trường trống<\/dt><dd>—<\/dd>/);
});

test('displayKey precedes secondaryKey and an empty display value falls back to the key', () => {
  const configuration = config({ groups: [group([{ key: 'reference', label: 'Tham chiếu', format: 'reference', displayKey: 'name', secondaryKey: 'code' }])] });
  const output = render(configuration, model({ header: { reference: 'RAW-ID', name: 'Tên hiển thị', code: 'QA-CODE' } }));
  assert.match(output, /<dd>Tên hiển thị<span[^>]*>QA-CODE<\/span><\/dd>/);
  assert.doesNotMatch(output, /RAW-ID/);
  assert.match(render(configuration, model({ header: { reference: 'QA-FALLBACK', name: '' } })), /<dd>QA-FALLBACK<\/dd>/);
});

test('URL fields link only HTTP(S) with a safe target and retain plain text otherwise', () => {
  const configuration = config({ groups: [group([{ key: 'link', label: 'Tài liệu', format: 'url' }])] });
  const output = render(configuration, model({ header: { link: ' https://example.test/document ' } }));
  assert.match(output, /href="https:\/\/example.test\/document" target="_blank" rel="noopener noreferrer"/);
  assert.match(output, /Mở tài liệu/);
  const plain = render(configuration, model({ header: { link: 'javascript:QA' } }));
  assert.match(plain, /<dd>javascript:QA<\/dd>/);
  assert.doesNotMatch(plain, /<a\b/);
});

test('a configured status display name is preserved by the shared formatter', () => {
  const output = render(config({ history: { title: 'Lịch sử' }, groups: [group([{ key: 'statusId', label: 'Trạng thái', format: 'status', displayKey: 'statusName' }])] }), model({ header: { statusId: 1, statusName: 'Trạng thái kiểm thử' }, history: { rows: [{ lineId: 'QA-HISTORY', fields: { statusId: 1, statusName: 'Lịch sử kiểm thử' } }], hasMore: false } }));
  assert.match(output, /<dd>Trạng thái kiểm thử<\/dd>/);
  assert.match(output, /Lịch sử kiểm thử/);
});

test('editing uses the date draft and keeps fields without edit config as definition values', () => {
  const output = render(config({ groups: [group([
    { key: 'date', label: 'Ngày chứng từ', edit: { input: 'date', required: true } },
    { key: 'branchName', label: 'Chi nhánh' },
  ])] }), model({ editing: true, header: { date: '2025-01-01', branchName: 'QA-BRANCH' }, draft: { date: '2026-10-23' } }));
  assert.match(output, /<input[^>]*type="date"[^>]*value="2026-10-23"/);
  assert.match(output, /<dt>Chi nhánh<\/dt><dd>QA-BRANCH<\/dd>/);
  assert.doesNotMatch(output, /value="2025-01-01"/);
});

test('tab counts come from each page and history requires explicit configuration', () => {
  const state = model({ lines: page(2), history: page(1), sections: { costs: page(3), undeclared: page(4) } });
  const configuration = config({ history: { title: 'Lịch sử gửi / duyệt' }, sections: { costs: { title: 'Chi phí', columns: [] } } });
  const output = render(configuration, state);
  const tabs = [...output.matchAll(/<button[^>]*role="tab"[^>]*>(.*?)<\/button>/g)].map(match => text(match[1]));
  assert.deepEqual(tabs, ['Chi tiết dòng2', 'Lịch sử gửi / duyệt1', 'Chi phí3']);
  const noHistory = render(config(), state);
  assert.equal((noHistory.match(/role="tab"/g) ?? []).length, 1);
  assert.doesNotMatch(noHistory, /Lịch sử gửi \/ duyệt|Chi phí|undeclared/);
});

test('footer presents primary actions, hides invisible actions and keeps menu labels out of the footer', () => {
  const output = renderToStaticMarkup(h(DocumentActionBar, { actions: [action('save'), action('remove', { placement: 'menu' }), action('hidden', { visible: false })], onAction: noop }));
  assert.match(output, /Nút save/);
  assert.match(output, /aria-label="Thao tác khác"/);
  assert.doesNotMatch(output, /Nút remove|Nút hidden/);
  assert.doesNotMatch(renderToStaticMarkup(h(DocumentActionBar, { actions: [action('hidden-menu', { placement: 'menu', visible: false })], onAction: noop })), /Thao tác khác/);
});

test('an entirely empty group uses its compact strip instead of a card', () => {
  const output = render(config({ groups: [group([{ key: 'notes', label: 'Ghi chú' }], { title: 'Nội dung & ghi chú', emptyStrip: 'Chưa có ghi chú.' })] }));
  assert.match(output, /Chưa có ghi chú\./);
  assert.match(output, /inline-flex items-center gap-2 font-semibold/);
  assert.doesNotMatch(output, /<h3|<dl/);
});

test('explicit group widths override their position in the overview', async () => {
  const configuration = config({ groups: [
    group([], { id: 'first', width: 'full' }), group([], { id: 'second' }),
    group([], { id: 'third' }), group([], { id: 'fourth', width: 'half' }),
  ] });
  await mounted(view(configuration), async tree => {
    const wrappers = tree.root.findByProps({ 'data-document-detail-overview': true }).children;
    assert.deepEqual(wrappers.map(wrapper => wrapper.props.className.includes('lg:col-span-2')), [true, false, true, false]);
  });
});

test('unspecified group widths keep the first two half width and later groups full width', async () => {
  const configuration = config({ groups: ['first', 'second', 'third', 'fourth'].map(id => group([], { id })) });
  await mounted(view(configuration), async tree => {
    const wrappers = tree.root.findByProps({ 'data-document-detail-overview': true }).children;
    assert.deepEqual(wrappers.map(wrapper => wrapper.props.className.includes('lg:col-span-2')), [false, false, true, true]);
  });
});

test('slots render only when declared; the declared lines editor replaces tabs only while editing', () => {
  const slots = { attachments: h('p', null, 'QA-ATTACHMENTS'), 'qr-scan': h('p', null, 'QA-UNDECLARED'), 'lines-editor': h('p', null, 'QA-EDITOR') };
  const configuration = config({ slots: ['attachments', 'lines-editor'] });
  const output = render(configuration, model(), { slots });
  assert.match(output, /QA-ATTACHMENTS/);
  assert.doesNotMatch(output, /QA-UNDECLARED|QA-EDITOR/);
  const editing = render(configuration, model({ editing: true }), { slots });
  assert.match(editing, /QA-EDITOR/);
  assert.doesNotMatch(editing, /role="tablist"|QA-UNDECLARED/);
  assert.match(render(config(), model({ editing: true }), { slots }), /role="tablist"/);
  assert.match(render(configuration, model({ editing: true })), /role="tablist"/);
});

test('subgroups have h4 headings and editable empties do not collapse to a strip', () => {
  const configuration = config({ groups: [group([], { emptyStrip: 'QA-EMPTY', subgroups: [{ title: 'Người phụ trách', fields: [{ key: 'person', label: 'Nhân viên', edit: { input: 'text' } }] }] })] });
  const output = render(configuration, model({ editing: true }));
  assert.match(output, /<h4[^>]*>Người phụ trách<\/h4>/);
  assert.match(output, /<input/);
  assert.doesNotMatch(output, /QA-EMPTY/);
});

test('disabled, busy and danger actions keep labels and Vietnamese reasons', () => {
  const output = render(config(), model({ actions: [action('remove', { tone: 'danger', enabled: false, reason: 'Chưa được phép xóa' }), action('save', { busy: true })] }));
  assert.match(output, /text-red-600/);
  // P2-07 AppButton retains both attributes; their DOM order is immaterial.
  assert.match(output, /<button(?=[^>]*disabled="")(?=[^>]*title="Chưa được phép xóa")[^>]*>/);
  assert.match(output, /aria-busy="true"/);
});

test('loading and error render the shared card, suppress detail data and retry through the handler', async () => {
  const configuration = config({ groups: [group([{ key: 'private', label: 'QA-DETAIL' }])] });
  const loading = render(configuration, model({ loading: true, header: { private: 'QA-STALE' } }));
  assert.match(loading, /Đang tải chứng từ/);
  assert.doesNotMatch(loading, /QA-DETAIL|QA-STALE|role="tablist"/);
  let retries = 0;
  await mounted(view(configuration, model({ error: 'Lỗi kiểm thử' }), { handlers: { ...handlers, onRetry: () => retries++ } }), async tree => {
    const retry = tree.root.findAllByType('button').find(button => button.children.includes('Thử lại'));
    await act(async () => retry.props.onClick());
    assert.equal(retries, 1);
  });
});

test('notices follow status, feedback, pending, module notice, groups, tabs, slots, actions', () => {
  const output = render(config({ notice: { [screenModule]: { title: 'QA-NOTICE', body: 'QA-BODY' } }, groups: [group([{ key: 'value', label: 'QA-GROUP' }])], slots: ['attachments'] }), model({
    status: { label: 'QA-STATUS', locked: false }, feedback: { type: 'success', message: 'QA-FEEDBACK' },
    pending: { title: 'QA-PENDING', body: 'QA-RECOVERY', actions: [action('recover')] },
    header: { value: 'QA-VALUE' }, actions: [action('footer')],
  }), { slots: { attachments: h('p', null, 'QA-SLOT') } });
  const markers = ['QA-STATUS', 'QA-FEEDBACK', 'QA-PENDING', 'QA-NOTICE', 'QA-GROUP', 'data-document-detail-tabs', 'QA-SLOT', 'Nút footer'];
  const positions = markers.map(marker => output.indexOf(marker));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
  assert.match(output, /Chưa khóa/);
  assert.doesNotMatch(render(config(), model()), /Đã khóa|Chưa khóa/);
});

test('editing and dirty messages use the embedded record heading without repeating document identity', () => {
  for (const dirty of [false, true]) {
    const output = renderToStaticMarkup(h(RecordDetailContext.Provider, { value: true }, view(config(), model({ editing: true, dirty }))));
    const message = dirty ? 'Có thay đổi chưa lưu' : 'Đang chỉnh sửa chứng từ';
    assert.match(output, new RegExp(`<header class="record-detail-state"><p role="status">${message}</p></header>`));
    assert.equal(output.split(message).length - 1, 1);
    assert.doesNotMatch(output, /Chi tiết kiểm thử|QA-DOC/);
  }
  const output = renderToStaticMarkup(h(RecordDetailContext.Provider, { value: true }, view(config(), model())));
  assert.doesNotMatch(output, /Có thay đổi chưa lưu|Đang chỉnh sửa chứng từ/);
});

test('busy state stays on disabled actions and their spinner without a separate processing notice', () => {
  const output = render(config(), model({ busy: true, actions: [action('save', { busy: true })] }));
  assert.match(output, /<button[^>]*disabled=""[^>]*aria-busy="true"/);
  assert.match(output, /animate-spin/);
  assert.doesNotMatch(output, /Đang xử lý…|Đang chỉnh sửa chứng từ|Có thay đổi chưa lưu/);
});

test('configured columns format booleans, numbers and totals in desktop and mobile views only', () => {
  const configuration = config({ lines: {
    title: 'Chi tiết dòng', emptyText: 'Trống', columns: [
      { key: 'name', label: 'Tên hàng', role: 'primary' }, { key: 'code', label: 'Mã hàng', role: 'secondary' },
      { key: 'rain', label: 'Mưa', format: 'boolean' }, { key: 'count', label: 'Số lượng', format: 'number', align: 'end' },
      { key: 'total', label: 'Tổng tiền', format: 'money', role: 'total', align: 'end' },
    ], expandGroups: [{ label: 'Thông tin đầy đủ', keys: ['rain', 'unlisted'], fullWidth: ['rain'] }],
  } });
  const output = render(configuration, model({ lines: { rows: [{ lineId: 'QA-LINE', fields: { name: 'QA-NAME', code: 'QA-CODE', rain: false, count: '1234', total: '5678', unlisted: 'QA-SECRET' } }], hasMore: true } }));
  assert.match(output, /QA-NAME<\/p><p[^>]*>QA-CODE/);
  assert.match(output, /Không/);
  assert.match(output, /1\.234/);
  assert.match(output, /5\.678/);
  assert.match(output, /font-semibold text-brand-800 dark:text-brand-200/);
  assert.match(output, /hidden min-w-0 lg:block/);
  assert.match(output, /lg:hidden/);
  assert.doesNotMatch(output, /QA-SECRET|unlisted/);
});

test('expansion-only columns stay out of desktop and mobile summaries but retain labels and formats when expanded', async () => {
  const configuration = config({ lines: {
    title: 'Chi tiết dòng', emptyText: 'Trống', columns: [
      { key: 'internalName', label: 'Tên nội bộ', role: 'primary', inTable: false },
      { key: 'name', label: 'Tên hàng', role: 'primary' }, { key: 'code', label: 'Mã hàng', role: 'secondary' },
      { key: 'internalCode', label: 'Mã nội bộ', role: 'secondary', inTable: false },
      { key: 'count', label: 'Số lượng', format: 'number', inTable: true },
      { key: 'fee', label: 'Phụ phí', format: 'money', role: 'total', inTable: false },
      { key: 'rain', label: 'Thời tiết mưa', format: 'boolean', inTable: false },
    ], expandGroups: [{ label: 'Thông tin đầy đủ', keys: ['internalName', 'internalCode', 'fee', 'rain'] }],
  } });
  const state = model({ lines: { rows: [{ lineId: 'QA-LINE', fields: {
    name: 'QA-NAME', code: 'QA-CODE', count: '1234', internalName: 'QA-INTERNAL-NAME', internalCode: 'QA-INTERNAL-CODE', fee: '5678', rain: false,
  } }], hasMore: false } });
  const output = render(configuration, state);
  const summaries = [
    output.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/)[1],
    output.match(/<tbody\b[^>]*><tr\b[^>]*>([\s\S]*?)<\/tr>/)[1],
    output.match(/<article\b[^>]*>([\s\S]*?)<button\b[^>]*aria-expanded=/)[1],
  ];
  assert.match(summaries[0], />Tên hàng<.*>Số lượng</);
  for (const summary of summaries) assert.doesNotMatch(summary, /Tên nội bộ|Mã nội bộ|Phụ phí|Thời tiết mưa|QA-INTERNAL|5\.678|Không/);
  for (const summary of summaries.slice(1)) {
    assert.match(summary, /QA-NAME/);
    assert.match(summary, /QA-CODE/);
    assert.match(summary, /1\.234/);
  }
  await mounted(h(DocumentDetailTabs, { config: configuration, model: state, onLoadMore: noop }), async tree => {
    const buttons = tree.root.findAllByType('button').filter(button => button.props['aria-expanded'] !== undefined);
    assert.equal(buttons.length, 2);
    for (const button of buttons) assert.equal(tree.root.findByProps({ id: button.props['aria-controls'] }).props.hidden, true);
    await act(async () => buttons[0].props.onClick());
    for (const button of buttons) {
      const panel = tree.root.findByProps({ id: button.props['aria-controls'] });
      assert.equal(panel.props.hidden, false);
      assert.deepEqual(panel.findAllByType('dt').map(field => field.children.join('')), ['Tên nội bộ', 'Mã nội bộ', 'Phụ phí', 'Thời tiết mưa']);
      assert.deepEqual(panel.findAllByType('dd').map(field => field.children.join('')), ['QA-INTERNAL-NAME', 'QA-INTERNAL-CODE', '5.678', 'Không']);
    }
  });
});

test('tab keyboard navigation selects and focuses with arrows, Home and End', async () => {
  const focus = [];
  const configuration = config({ history: { title: 'Lịch sử' }, sections: { costs: { title: 'Chi phí', columns: [] } } });
  await mounted(h(DocumentDetailTabs, { config: configuration, model: model(), onLoadMore: noop }), async tree => {
    const tabs = () => tree.root.findAllByProps({ role: 'tab' });
    const press = async (index, key, expected) => {
      let prevented = false;
      await act(async () => tabs()[index].props.onKeyDown({ key, preventDefault: () => { prevented = true; } }));
      assert.equal(prevented, true);
      assert.equal(tabs()[expected].props['aria-selected'], true);
      assert.equal(tabs()[expected].props.tabIndex, 0);
      assert.equal(focus.at(-1), expected);
      assert.equal(tabs().filter(tab => tab.props.tabIndex === 0).length, 1);
    };
    await press(0, 'ArrowLeft', 2);
    await press(2, 'ArrowRight', 0);
    await press(0, 'End', 2);
    await press(2, 'Home', 0);
    for (const tab of tabs()) assert.ok(tree.root.findByProps({ id: tab.props['aria-controls'] }));
    await act(async () => tabs()[1].props.onClick());
    assert.equal(tabs()[1].props['aria-selected'], true);
    await act(async () => tree.update(h(DocumentDetailTabs, { config: config(), model: model(), onLoadMore: noop })));
    assert.equal(tabs()[0].props['aria-selected'], true);
  }, { createNodeMock: element => element.props.role === 'tablist' ? { querySelectorAll: () => [0, 1, 2].map(index => ({ focus: () => focus.push(index) })) } : null });
});

test('load more forwards the exact lines/history/section key and expansion opens both responsive presentations', async () => {
  const configuration = config({ lines: { title: 'Dòng', emptyText: 'Trống', columns: [{ key: 'name', label: 'Tên', role: 'primary' }], expandGroups: [{ label: 'Đầy đủ', keys: ['name'] }] }, history: { title: 'Lịch sử' }, sections: { costs: { title: 'Chi phí', columns: [] } } });
  const state = model({ lines: page(1, true), history: page(1, true), sections: { costs: page(1, true) } });
  const loaded = [];
  await mounted(h(DocumentDetailTabs, { config: configuration, model: state, onLoadMore: key => loaded.push(key) }), async tree => {
    for (const button of tree.root.findAllByType('button').filter(button => button.children.includes('Tải thêm…'))) await act(async () => button.props.onClick());
    assert.deepEqual(loaded, ['lines', 'history', 'costs']);
    const expand = tree.root.findAllByType('button').filter(button => button.props['aria-expanded'] !== undefined);
    await act(async () => expand[0].props.onClick());
    assert.ok(expand.every(button => button.props['aria-expanded']));
    for (const button of expand) assert.equal(tree.root.findByProps({ id: button.props['aria-controls'] }).props.hidden, false);
    await act(async () => expand[1].props.onClick());
    assert.ok(expand.every(button => !button.props['aria-expanded']));
  });
});

test('text, textarea, money and lookup controls forward draft changes without owning API behavior', async () => {
  const configuration = config({ groups: [group([
    { key: 'date', label: 'Ngày', edit: { input: 'date' } },
    { key: 'name', label: 'Tên', edit: { input: 'text', maxLength: 20 } },
    { key: 'notes', label: 'Ghi chú', edit: { input: 'textarea', maxLength: 250 } },
    { key: 'amount', label: 'Số tiền', edit: { input: 'money' } },
    { key: 'person', label: 'Người', edit: { input: 'lookup', lookupId: 'header.Person', required: true } },
    { key: 'people', label: 'Nhiều người', edit: { input: 'lookup', lookupId: 'header.People', multiple: true } },
  ])] });
  const changes = [];
  const state = model({ editing: true, header: { branchId: 'QA-BRANCH' }, draft: { date: '2026-10-23', name: 'QA-NAME', notes: 'QA-NOTES', amount: '12', person: 'QA-PERSON', people: 'QA-A, QA-B' } });
  await mounted(view(configuration, state, { handlers: { ...handlers, onFieldChange: (key, value) => changes.push([key, value]) } }), async tree => {
    const inputs = tree.root.findAllByType('input');
    await act(async () => inputs.find(input => input.props.type === 'date').props.onChange({ target: { value: '2026-10-24' } }));
    await act(async () => inputs.find(input => input.props.value === 'QA-NAME').props.onChange({ target: { value: 'QA-NEXT' } }));
    await act(async () => tree.root.findByType('textarea').props.onChange({ target: { value: 'QA-NEW-NOTES' } }));
    await act(async () => inputs.find(input => input.props.inputMode === 'decimal').props.onChange({ target: { value: '34' } }));
    const lookups = tree.root.findAllByType(LookupField);
    assert.equal(lookups[0].props.module, screenModule);
    assert.equal(lookups[0].props.branchId, 'QA-BRANCH');
    assert.equal(lookups[0].props.required, true);
    assert.equal(lookups[1].props.multiple, true);
    assert.deepEqual(lookups[1].props.selected.map(choice => choice.id), ['QA-A', 'QA-B']);
    await act(async () => lookups[0].props.onSelect({ id: 'QA-CHOSEN', label: 'Tổng hợp' }));
    await act(async () => lookups[1].props.onMultiSelect([{ id: 'QA-C' }, { id: 'QA-D' }]));
    assert.deepEqual(changes, [['date', '2026-10-24'], ['name', 'QA-NEXT'], ['notes', 'QA-NEW-NOTES'], ['amount', '34'], ['person', 'QA-CHOSEN'], ['people', 'QA-C, QA-D']]);
  });
});

test('action callbacks retain IDs and disabled/busy actions do not dispatch', async () => {
  const clicked = [];
  await mounted(h(DocumentActionBar, { actions: [action('enabled'), action('disabled', { enabled: false }), action('busy', { busy: true })], onAction: id => clicked.push(id) }), async tree => {
    for (const button of tree.root.findAllByType('button')) await act(async () => button.props.onClick());
    assert.deepEqual(clicked, ['enabled']);
  });
});

test('dialog SSR waits for a body host and retains viewport geometry with P2 header/footer chrome', async () => {
  assert.equal(renderToStaticMarkup(h(DocumentDetailDialog, { open: true, title: 'Kiểm thử', documentNumber: 'QA', closeLabel: 'Đóng', onRequestClose: noop }, 'QA-BODY')), '');
  // Original viewport bounds retained; P2-07 changes header typography, ghost
  // dismissal and safe-area padding, not the retained RecordDialog behavior.
  const referenceClasses = `p-0! sm:p-6! font-['Segoe_UI',Roboto,Arial,sans-serif] text-base leading-relaxed
      [&_.request-detail-dialog]:h-dvh! [&_.request-detail-dialog]:max-h-dvh! [&_.request-detail-dialog]:w-full! [&_.request-detail-dialog]:max-w-[1440px]! [&_.request-detail-dialog]:rounded-none! [&_.request-detail-dialog]:bg-white! [&_.request-detail-dialog]:text-black!
      sm:[&_.request-detail-dialog]:h-[min(900px,calc(100dvh-3rem))]! sm:[&_.request-detail-dialog]:max-h-[calc(100dvh-3rem)]! sm:[&_.request-detail-dialog]:rounded-2xl!
      dark:[&_.request-detail-dialog]:bg-neutral-900! dark:[&_.request-detail-dialog]:text-white!
      [&_.request-detail-header]:bg-white! [&_.request-detail-header]:px-4! [&_.request-detail-header]:pb-4! [&_.request-detail-header]:pt-[calc(1rem_+_env(safe-area-inset-top))]! sm:[&_.request-detail-header]:px-6! dark:[&_.request-detail-header]:bg-neutral-900!
      [&_.request-detail-header_h2]:order-none! [&_.request-detail-header_h2]:text-xl! [&_.request-detail-header_h2]:font-semibold! [&_.request-detail-header_h2]:text-neutral-900! dark:[&_.request-detail-header_h2]:text-neutral-100!
      [&_.request-detail-body]:block! [&_.request-detail-body]:bg-neutral-50! [&_.request-detail-body]:p-4! sm:[&_.request-detail-body]:p-6! dark:[&_.request-detail-body]:bg-neutral-950!
      [&_.record-dialog-actions]:bg-white! [&_.record-dialog-actions]:px-4! [&_.record-dialog-actions]:pt-3! [&_.record-dialog-actions]:pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]! sm:[&_.record-dialog-actions]:px-6! dark:[&_.record-dialog-actions]:bg-neutral-900!
      [&_.record-dialog-close]:size-11! [&_.record-dialog-close]:items-center! [&_.record-dialog-close]:justify-center! [&_.record-dialog-close]:rounded-xl! [&_.record-dialog-close]:border-0! [&_.record-dialog-close]:bg-transparent! [&_.record-dialog-close]:p-0! [&_.record-dialog-close]:text-neutral-700! [&_.record-dialog-close]:shadow-none! [&_.record-dialog-close:hover]:bg-neutral-100! dark:[&_.record-dialog-close]:text-neutral-200! dark:[&_.record-dialog-close:hover]:bg-neutral-800!`;
  const implementation = await readFile('components/erp/document-detail/document-detail-dialog.tsx', 'utf8');
  const classes = source => source.match(/className="(p-0![\s\S]*?)"/)[1].replaceAll('\r\n', '\n');
  assert.equal(classes(implementation), referenceClasses.replaceAll('\r\n', '\n'));
  assert.match(implementation, /useSyncExternalStore/);
});

test('secondary values matching the primary display are hidden after trimming and ignoring case', () => {
  const configuration = config({ groups: [group([{ key: 'branchId', label: 'Chi nhánh', displayKey: 'branchName', secondaryKey: 'branchId' }])] });
  for (const header of [
    { branchName: 'MB', branchId: 'MB' },
    { branchName: ' MB ', branchId: ' mb ' },
    { branchName: '', branchId: 'MB' },
    { branchId: 'MB' },
  ]) {
    const output = render(configuration, model({ header }));
    const content = output.match(/<dd>([\s\S]*?)<\/dd>/)?.[1];
    assert.ok(content);
    assert.doesNotMatch(content, /<span/);
    assert.equal(content.trim().toLowerCase(), 'mb');
  }
});

test('secondary comparison uses the formatted primary date, number, boolean and status values', () => {
  for (const [format, header, expected] of [
    ['date', { value: '2026-10-23', code: '23/10/2026' }, '23/10/2026'],
    ['number', { value: 1234, code: '1.234' }, '1.234'],
    ['boolean', { value: false, code: ' KHÔNG ' }, 'Không'],
    ['status', { value: 1, name: 'Đã duyệt', code: ' đã DUYỆT ' }, 'Đã duyệt'],
  ]) {
    const configuration = config({ groups: [group([{ key: 'value', label: 'Giá trị', format, displayKey: 'name', secondaryKey: 'code' }])] });
    const output = render(configuration, model({ header }));
    assert.equal(output.match(/<dd>([\s\S]*?)<\/dd>/)?.[1], expected);
  }
});

test('distinct secondary values remain visible including false, zero and an empty primary', () => {
  const configuration = config({ groups: [group([{ key: 'name', label: 'Tham chiếu', secondaryKey: 'code' }])] });
  for (const [header, expected] of [
    [{ name: 'Tên kiểm thử', code: 'MB' }, 'Tên kiểm thửMB'],
    [{ name: 'Tên kiểm thử', code: 0 }, 'Tên kiểm thử0'],
    [{ name: null, code: 'MB' }, '—MB'],
  ]) {
    const output = render(configuration, model({ header }));
    const content = output.match(/<dd>([\s\S]*?)<\/dd>/)?.[1];
    assert.ok(content);
    assert.match(content, /<span[^>]*>/);
    assert.equal(text(content), expected);
  }
});
