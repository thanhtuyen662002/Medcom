import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/document-detail-parity');
await mkdir(output, { recursive: true });
// Reference sources from commit 536701c, kept as fixtures because that commit
// is not in the pushed history (CI checkouts cannot `git show` it).
const historical = name => readFileSync(path.join(app, 'tests/fixtures/parity-536701c', path.basename(name) + '.txt'), 'utf8');
const oldBody = historical('components/erp/erp-document-detail-body.tsx');
await build({
  stdin: {
    contents: `export { DocumentDetailView } from './components/erp/document-detail/document-detail-view';
      export { DocumentDetailTabs } from './components/erp/document-detail/document-detail-tabs';
      export { sumDetailLineTotals, calculateDetailMoney } from './lib/erp/document-detail/format';
      export { formatMoney } from './lib/erp/money';
      export { salesOrderDetailConfig } from './lib/erp/document-detail/modules/sales';
      ${['purchase', 'inbound', 'transfer', 'machine', 'qr'].map(name => `export * from './lib/erp/document-detail/modules/${name}';`).join('\n')}`,
    resolveDir: app, loader: 'tsx',
  },
  outfile: path.join(output, 'ui.cjs'), bundle: true, platform: 'node', format: 'cjs',
  packages: 'external', alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
});
await build({
  stdin: { contents: historical('lib/erp/document-detail/controllers/erp-detail-rules.ts'), resolveDir: app, loader: 'ts' },
  outfile: path.join(output, 'legacy.cjs'), bundle: true, platform: 'node', format: 'cjs',
  packages: 'external', alias: { '@': app }, logLevel: 'warning',
});
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { act, create } = require('react-test-renderer');
const ui = require(path.join(output, 'ui.cjs'));
const legacy = require(path.join(output, 'legacy.cjs'));
const { DocumentDetailView, DocumentDetailTabs, sumDetailLineTotals, calculateDetailMoney, formatMoney, salesOrderDetailConfig } = ui;
const fixtures = Object.assign({}, ...await Promise.all(['', '-ops'].map(async suffix =>
  JSON.parse(await readFile(path.join(app, `tests/fixtures/document-detail-header-keys${suffix}.json`), 'utf8')))));
const configs = new Map(Object.values(ui).filter(value => value?.modules && value !== salesOrderDetailConfig)
  .flatMap(config => config.modules.map(moduleId => [moduleId, config])));
const report = await readFile(path.resolve(app, '../../docs/ui-sync/PARITY_GENERIC_DETAIL.md'), 'utf8');
// The reviewed Markdown is the finite list of things that must appear. Do not
// regenerate it from the current config inside a test: missing config must fail.
const parity = new Map([...report.matchAll(/### `([^`]+)`\r?\n([\s\S]*?)(?=\r?\n### |$)/g)]
  .map(([, moduleId, body]) => [moduleId, new Map([...body.matchAll(/^\| (Header|Dòng|Section [a-z]+) \|([^\n]+)/gm)]
    .map(([, section, keys]) => [section, [...keys.matchAll(/`([^`]+)`/g)].map(match => match[1])]))]));
const h = React.createElement;
const noop = () => {};
const handlers = { onAction: noop, onFieldChange: noop, onLoadMore: noop, onRetry: noop };
const row = (fields, lineId = 'QA-LINE') => ({ lineId, fields });
const page = rows => ({ rows, hasMore: false });
const model = (fields = {}, rows = [], sections = {}) => ({
  documentId: 'QA-DOCUMENT', header: fields, lines: page(rows), sections,
  status: { label: 'Đã kiểm tra', locked: false }, loading: false, error: null,
  editing: false, dirty: false, busy: false, draft: {}, feedback: null, actions: [],
});
const markup = (config, state) => renderToStaticMarkup(h(DocumentDetailView, { config, model: state, handlers, module: config.modules[0] }));
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : (Array.isArray(node) ? node : node?.children ?? []).map(text).join('');
const visibleText = node => node?.props?.hidden ? '' : typeof node === 'string' || typeof node === 'number' ? String(node)
  : (Array.isArray(node) ? node : node?.children ?? []).map(visibleText).join('');
const fields = config => config.groups.flatMap(group => [...group.fields, ...(group.subgroups ?? []).flatMap(group => group.fields)]);

async function mounted(config, state, verify) {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let tree;
  try {
    await act(async () => { tree = create(h(DocumentDetailTabs, { config, model: state, onLoadMore: noop })); });
    await verify(tree);
  } finally {
    if (tree) await act(async () => tree.unmount());
    if (previous === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
  }
}

test('the parity manifest covers exactly the sixteen legacy generic modules and source-backed keys', () => {
  assert.equal(configs.size, 16);
  assert.deepEqual([...parity.keys()].sort(), [...configs.keys()].sort());
  assert.match(oldBody, /f\.itemCode \|\| f\.itemId \|\| f\.assetId/);
  assert.match(oldBody, /sumLineTotals\(detail\.lines\?\.rows \|\| \[\]\)/);
  assert.match(oldBody, /Object\.entries\(rData\)\.filter\(\(\[k\]\) => !isTechnicalField\(k\)\)/);
  for (const [moduleId, config] of configs) {
    const source = fixtures[moduleId];
    const groups = parity.get(moduleId);
    for (const [section, keys] of groups) {
      const available = section === 'Header' ? source.header : section === 'Dòng' ? source.lines : source.sections[section.slice(8)];
      for (const key of keys) assert.ok(available.includes(key), `${moduleId}.${section}.${key}: response provenance`);
    }
    const references = column => [column.key, ...(column.fallbackKeys ?? []), ...(column.displayKey ? [column.displayKey] : []),
      ...(column.fallbackCalculation ? Object.values(column.fallbackCalculation) : [])];
    for (const column of config.lines.columns) for (const key of references(column))
      assert.ok(source.lines.includes(key), `${moduleId}.lines.${key}`);
    for (const [section, definition] of Object.entries(config.sections ?? {})) for (const column of definition.columns)
      for (const key of references(column)) assert.ok(source.sections[section].includes(key), `${moduleId}.${section}.${key}`);
    const total = config.lines.footerTotal;
    if (total) {
      for (const key of [total.sumKey, ...(total.fallbackSumKeys ?? []), ...Object.values(total.fallback ?? {})].filter(Boolean))
        assert.ok(source.lines.includes(key), `${moduleId}.footerTotal.${key}`);
      if (total.currencyKey) assert.ok(source.header.includes(total.currencyKey));
    }
    for (const key of ['quantityKey', 'priceKey']) if (config.lines.calculatedTotal)
      assert.ok(source.lines.includes(config.lines.calculatedTotal[key]));
  }
});

test('purchase footer restores Tổng cộng (2 dòng), exact 333.760 USD and loaded-row counting', async () => {
  const config = configs.get('purchase-requests');
  const rows = [row({ quantity: '3680', unitPrice: '74' }, 'QA-1'), row({ quantity: '480', unitPrice: '128' }, 'QA-2')];
  assert.equal(sumDetailLineTotals(rows, config.lines.footerTotal), '333760');
  await mounted(config, { ...model({ currencyId: 'USD' }, rows), lines: { rows, hasMore: true } }, async tree => {
    const footer = tree.root.findByProps({ 'data-document-lines-total': true });
    assert.equal(text(footer), 'Tổng cộng (2 dòng)333.760 USD');
    // The footer is outside the breakpoint-specific desktop/mobile wrappers.
    for (let parent = footer; parent; parent = parent.parent)
      assert.doesNotMatch(parent.props.className ?? '', /(?:^| )(?:hidden|lg:hidden|lg:block)(?: |$)/);
    assert.equal(tree.root.findAllByProps({ 'data-document-lines-total': true }).length, 1);
    assert.match(text(tree.toJSON()), /2 dòng đã tải/);
  });
  assert.equal(sumDetailLineTotals([row({ quantity: '2', unitPrice: '3', totalPrice: '999' })], config.lines.footerTotal), '6', 'legacy footer does not sum totalPrice');
});

test('server priority, zero, malformed/null values and arbitrary decimal precision match 536701c exactly', () => {
  const total = { label: 'Tổng cộng', sumKey: 'amount', fallbackSumKeys: ['sourceAmount'], fallback: { quantityKey: 'quantity', priceKey: 'unitPrice' } };
  const cases = [[], [{}], [{ amount: '0', sourceAmount: '99', quantity: '2', unitPrice: '3' }],
    [{ amount: null, sourceAmount: '7.125', quantity: '2', unitPrice: '3' }],
    [{ amount: '', sourceAmount: '7', quantity: '2', unitPrice: '3' }],
    [{ amount: 'invalid', quantity: '2', unitPrice: '3' }],
    [{ quantity: '3680', unitPrice: '74' }, { quantity: '480', unitPrice: '128' }],
    [{ amount: '-0.01' }, { amount: '0.02' }],
    [{ quantity: '9007199254740993.01', unitPrice: '0.1' }, { amount: '0.009' }]];
  for (const values of cases) {
    const rows = values.map((value, index) => row(value, `QA-${index}`));
    assert.equal(sumDetailLineTotals(rows, total), legacy.sumLineTotals(rows));
  }
  const precise = sumDetailLineTotals(cases.at(-1).map(value => row(value)), total);
  assert.equal(precise, '900719925474099.31');
  assert.equal(formatMoney(precise), '900.719.925.474.099,31');
  assert.equal(calculateDetailMoney({ quantity: '0.1', unitPrice: '0.2' }, total.fallback), '0.02');
});

test('PO uses only visible quantity/price; server totals and display fallbacks keep legacy per-line order', () => {
  const po = configs.get('purchase-orders');
  const sample = { itemName: 'Hàng kiểm thử', quantity: '0.1', unitPrice: '0.2', amount: '99', sourceAmount: '88' };
  const html = markup(po, model({ currencyId: 'USD' }, [row(sample)]));
  assert.equal(sumDetailLineTotals([row(sample)], po.lines.footerTotal), '0.02');
  assert.match(html, /Tổng giá/);
  assert.equal((html.match(/>0,02</g) ?? []).length, 2, 'derived PO total in desktop and mobile');
  assert.match(html, /0,02 USD/);
  const purchase = configs.get('purchase-requests');
  for (const values of [
    { quantity: '2', unitPrice: '3' },
    { totalPrice: '0', totalPriceDisplay: '999', quantity: '2', unitPrice: '3' },
    { totalPrice: '7.125', totalPriceDisplay: '999', quantity: '2', unitPrice: '3' },
    { totalPriceDisplay: '8,75', quantity: '2', unitPrice: '3' },
    { unitPriceDisplay: '4,25' },
  ]) {
    const output = markup(purchase, model({}, [row(values)]));
    const expected = legacy.lineTotalDisplay(values);
    if (expected !== '—') assert.ok(output.includes(expected), expected);
    if (values.unitPriceDisplay) assert.ok(output.includes(values.unitPriceDisplay));
  }
  const inbound = configs.get('inbound-requests');
  assert.equal(sumDetailLineTotals([row({ amount: '7.125', setQuantityByDocument: '100', unitPrice: '9' })], inbound.lines.footerTotal), '7.125');
  assert.equal(sumDetailLineTotals([row({ setQuantityByDocument: '100', unitPrice: '9' })], inbound.lines.footerTotal), null);
  const repairs = configs.get('machine-repairs');
  assert.equal(sumDetailLineTotals([row({ amount: '0' })], repairs.lines.footerTotal), '0');
  assert.match(markup(repairs, model({}, [row({ amountDisplay: '8,75' })])), />8,75</);
  assert.match(markup(purchase, model({}, [row({ budgetDisplay: '12,75' })])), />12,75</);
});

test('manufacturer/item display codes survive desktop and mobile, with legacy code then manufacturer then internal-ID fallback', async () => {
  for (const [moduleId, config] of configs) {
    if (!config.lines.columns.some(column => column.key === 'itemCode')) continue;
    const source = fixtures[moduleId].lines;
    const variants = [{ itemId: 'VT-1', itemCode: 'P-1', itemName: 'Hàng kiểm thử' },
      { itemId: 'VT-1', itemCode: '', itemName: 'Hàng kiểm thử' }];
    if (source.includes('manufacturerItemCode')) variants.push(
      { itemId: 'VT-1', manufacturerItemCode: 'NSX-1', itemName: 'Hàng kiểm thử' },
      { itemId: 'VT-1', itemCode: 'P-1', manufacturerItemCode: 'NSX-2', itemName: 'Hàng kiểm thử' });
    for (const values of variants) await mounted(config, model({}, [row(values)]), async tree => {
      const expected = values.itemCode || values.manufacturerItemCode || values.itemId;
      const panel = tree.root.findAllByProps({ role: 'tabpanel' })[0];
      assert.ok(text(panel.findByType('tbody')).includes(expected), `${moduleId}: desktop ${expected}`);
      assert.ok(text(panel.findByType('article')).includes(expected), `${moduleId}: mobile ${expected}`);
    });
  }
});

function sampleValue(key, format, index) {
  if (format === 'boolean') return false;
  if (format === 'date' || format === 'datetime') return '2026-10-23T00:00:00';
  if (format === 'number' || format === 'money') return String(101 + index) + '.25';
  if (format === 'url') return `https://example.invalid/QA-${key}`;
  return `QA_${key}_VALUE`;
}
function expectedValue(value, format) {
  if (format === 'boolean') return 'Không';
  if (format === 'date' || format === 'datetime') return '23/10/2026';
  if (format === 'number' || format === 'money') return String(value).replace('.', ',');
  return String(value);
}

for (const [moduleId, config] of configs) test(`${moduleId}: every must-show header/line/section item in the parity table renders from fixture keys`, async () => {
  const source = fixtures[moduleId];
  const mustShow = parity.get(moduleId);
  const definitions = fields(config);
  const header = Object.fromEntries(source.header.map((key, index) => {
    const field = definitions.find(field => [field.key, field.displayKey, field.secondaryKey].includes(key));
    return [key, sampleValue(key, field?.format, index)];
  }));
  const makeRow = (keys, columns) => row(Object.fromEntries(keys.map((key, index) =>
    [key, sampleValue(key, columns.find(column => column.key === key)?.format, index)])));
  const line = makeRow(source.lines, config.lines.columns);
  const sections = Object.fromEntries(Object.entries(source.sections ?? {}).map(([key, keys]) =>
    [key, page([makeRow(keys, config.sections[key].columns)])]));
  const state = model(header, [line], sections);
  const html = markup(config, state);
  for (const key of mustShow.get('Header')) {
    const definition = definitions.find(field => [field.key, field.displayKey, field.secondaryKey].includes(key));
    assert.ok(definition, `${moduleId}.header.${key}: configured`);
    assert.ok(html.includes(definition.label), definition.label);
    assert.ok(html.includes(expectedValue(header[key], definition.secondaryKey === key ? undefined : definition.format)), `${moduleId}.header.${key}: value`);
  }
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /\btrue\b|\bfalse\b|Order Type Id|Send To|Status Fore Color|Status Back Color/);
  await mounted(config, state, async tree => {
    for (const [section, keys] of mustShow) {
      if (section === 'Header') continue;
      const sectionKey = section === 'Dòng' ? 'lines' : section.slice(8);
      if (sectionKey !== 'lines') {
        const tab = tree.root.findAllByProps({ role: 'tab' }).find(tab => tab.props['aria-controls'].endsWith(`section:${sectionKey}`));
        assert.ok(tab, `${moduleId}.${sectionKey}: tab`);
        await act(async () => tab.props.onClick());
      }
      const panel = tree.root.findAllByProps({ role: 'tabpanel' }).find(panel => !panel.props.hidden);
      // Opening either responsive control opens the same line in both layouts.
      const expand = panel.findAllByType('button').find(button => button.props['aria-expanded'] === false);
      if (expand) await act(async () => expand.props.onClick());
      const columns = sectionKey === 'lines' ? config.lines.columns : config.sections[sectionKey].columns;
      const data = sectionKey === 'lines' ? line : sections[sectionKey].rows[0];
      for (const key of keys) {
        const definition = columns.find(column => column.key === key);
        assert.ok(definition, `${moduleId}.${sectionKey}.${key}: column`);
        const value = key === 'lineId' ? data.lineId : data.fields[key];
        const expected = expectedValue(value, definition.format);
        for (const presentation of [panel.findByType('tbody'), panel.findByType('article')])
          assert.ok(visibleText(presentation).includes(expected), `${moduleId}.${sectionKey}.${key}: visible ${expected}`);
      }
    }
  });
  const total = legacy.sumLineTotals([line]);
  assert.equal(config.lines.footerTotal ? sumDetailLineTotals([line], config.lines.footerTotal) : null, total, `${moduleId}: historical footer visibility/value`);
  for (const definition of [...definitions, ...config.lines.columns, ...Object.values(config.sections ?? {}).flatMap(section => section.columns)])
    assert.doesNotMatch(definition.label, /^[A-Z][a-z]+(?: [A-Z][a-z]+)+$/);
});

test('section omissions are explicitly technical/duplicated; no old business value silently disappears', () => {
  const duplicates = new Set(['documentId', 'documentName', 'lineName']);
  for (const [moduleId, source] of Object.entries(fixtures)) for (const [section, keys] of Object.entries(source.sections ?? {})) {
    const mustShow = parity.get(moduleId).get(`Section ${section}`);
    for (const key of keys) if (!legacy.isTechnicalField(key) && !key.endsWith('Display') && !duplicates.has(key))
      assert.ok(mustShow.includes(key), `${moduleId}.${section}.${key}: must not be waived`);
  }
  assert.match(report, /documentId.*documentName.*lineName/);
  assert.deepEqual([...configs].filter(([, config]) => config.lines.footerTotal).map(([moduleId]) => moduleId).sort(),
    ['inbound-requests', 'machine-repairs', 'purchase-approvals', 'purchase-orders', 'purchase-requests']);
});

test('sales restores 1 dòng hàng đã tải and default generic wording remains dòng', () => {
  const html = markup(salesOrderDetailConfig, model({}, [row({})]));
  assert.match(html, /1 dòng hàng đã tải/);
  assert.match(markup(configs.get('purchase-orders'), model({}, [row({})])), /1 dòng đã tải/);
  assert.doesNotMatch(markup(configs.get('purchase-orders'), model({}, [row({})])), /data-document-lines-total/);
  assert.doesNotMatch(markup(configs.get('purchase-requests'), model({}, [])), /data-document-lines-total/);
});
