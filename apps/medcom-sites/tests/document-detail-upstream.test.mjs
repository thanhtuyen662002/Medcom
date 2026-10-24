import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/document-detail-upstream');
await mkdir(output, { recursive: true });
const leaves = {
  'erp-client': `export const erpClient={getErpModuleDetail:(...args)=>globalThis.qaUpstreamDetail(...args)};`,
  'record-dialog': `export const RecordDetailHeading=({children})=><header>{children}</header>;export const RecordDetailStatus=({children})=><div data-status="header">{children}</div>;export const RecordActionBar=({children,presentationAllowed})=>presentationAllowed?<footer>{children}</footer>:null;`,
  'request-presentation': `import React from 'react';export const RecordDetailContext=React.createContext(true);export const RequestButton='button';export const RequestInput='input';export const RequestTextarea='textarea';export const requestStyles={actions:''};`,
  'bottom-sheet': `export const UntitledBottomSheet=({open,children})=>open?<section>{children}</section>:null;`,
  'sales-order-attachment-list': `export const SalesOrderAttachmentList=()=>null;`,
  'sales-order-action-dialog': `export const SalesOrderActionDialog=()=>null;`,
  'sales-order-line-editor': `export const SalesOrderLineEditor=()=>null;`,
  'qr-camera': `export class QrCamera{start(){}stop(){}}`,
};
await build({
  stdin: { contents: `export {SalesOrderForm} from './components/erp/sales-order-form';export {ErpDocumentDetailBody} from './components/erp/erp-document-detail-body';export {statusBadgeStyle} from './lib/erp/status-colors';`, resolveDir: app, loader: 'tsx' },
  outfile: path.join(output, 'fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': app }, jsx: 'automatic', logLevel: 'warning',
  plugins: [{ name: 'upstream-detail-leaves', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      for (const key of Object.keys(leaves)) if (args.path.endsWith(key)) return { path: key, namespace: 'upstream-detail-qa' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'upstream-detail-qa' }, args => ({ contents: leaves[args.path], loader: 'tsx', resolveDir: app }));
  } }],
});
const require = createRequire(import.meta.url);
const React = require('react'), { create, act } = require('react-test-renderer');
const { SalesOrderForm, ErpDocumentDetailBody, statusBadgeStyle } = require(path.join(output, 'fixture.cjs'));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : (Array.isArray(node) ? node : node?.children ?? []).map(text).join('');
const page = rows => ({ rows, page: 1, pageSize: 50, hasMore: false });
const line = { lineId: 'QA-LINE', fields: { itemId: 'QA-ITEM', itemName: 'Hàng kiểm thử', quantity: '2', unitPrice: '10', amount: '20' } };
function detail(summary) {
  return { documentId: 'QA-DOC', header: { currencyId: 'USD', statusId: 12, statusName: 'Đã gửi PM', isLocked: false,
    statusForeColor: '#FFFF00', statusBackColor: '#FFFF00', deliveryStatusName: 'Đang giao',
    deliveryStatusForeColor: '#FFFFFF', deliveryStatusBackColor: '#00695C' },
  lines: { ...page([line]), hasMore: true }, actions: [], stateToken: 'a'.repeat(64), summary,
  history: page([{ lineId: 'QA-HISTORY', fields: { userName: 'Người kiểm thử', statusId: 12, statusName: 'Đã gửi PM',
    statusForeColor: '#FFFF00', statusBackColor: '#FFFF00' } }]) };
}
async function mounted(moduleId, data, verify) {
  const calls = [];
  globalThis.qaUpstreamDetail = async (...args) => { calls.push(args); return structuredClone(data); };
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(moduleId.startsWith('sales-order') ? SalesOrderForm : ErpDocumentDetailBody,
      { module: moduleId, branchId: 'QA', documentId: 'QA-DOC', onClose: noop, onChanged: noop })); });
    for (let i = 0; i < 6; i++) await act(async () => {});
    await verify(tree, calls);
  } finally {
    if (tree) await act(async () => tree.unmount());
    delete globalThis.qaUpstreamDetail;
  }
}
const summaries = tree => tree.root.findAll(node => typeof node.type === 'string' && node.props['data-document-summary'] !== undefined);

for (const moduleId of ['sales-orders', 'sales-order-pm', 'sales-order-sa', 'warehouse-qr', 'sales-qr', 'machine-movements', 'machine-repairs']) {
  test(`${moduleId}: the real controller forwards whole-document totals and colored status badges to the shared layout`, async () => {
    const sales = moduleId.startsWith('sales-order');
    const summary = sales ? { rowCount: 12, amount: '1000', vATAmount: '100', totalAmount: '1100', totalAmountDisplay: '1.100 USD' }
      : moduleId === 'machine-repairs' ? { rowCount: 12, quantity: '50', laborAmount: '100', partsAmount: '200', amount: '300' }
        : { rowCount: 12, quantity: '50' };
    const data = detail(summary);
    // QR comparison is a separate table and must not duplicate the document summary.
    if (!sales) data.comparison = { rows: [{ lineId: 'QA-COMPARE', fields: { itemId: 'QA-ITEM', quantity: '2' } }] };
    await mounted(moduleId, data, (tree, calls) => {
      assert.equal(calls.length, 1);
      assert.equal(calls[0][0], moduleId);
      assert.equal(summaries(tree).length, 1);
      const summaryText = text(summaries(tree)[0]);
      assert.match(summaryText, /12 dòng toàn chứng từ/);
      if (sales) {
        assert.match(summaryText, /Số tiền1.000 USD/);
        assert.match(summaryText, /Tiền thuế100 USD/);
        assert.match(summaryText, /1\.100 USD/);
        assert.doesNotMatch(summaryText, /Tổng tiền/);
        assert.match(text(tree.toJSON()), /1 dòng hàng đã tải/);
      } else {
        assert.match(summaryText, /Tổng số lượng50/);
        if (moduleId === 'machine-repairs') assert.match(summaryText, /Tiền công100 USD.*Tiền vật tư200 USD.*300 USD/);
        else assert.doesNotMatch(summaryText, /USD/);
      }
      assert.equal(tree.root.findAllByProps({ 'data-document-lines-total': true }).length, 0, 'page totals must not compete with server totals');
      const header = tree.root.findByProps({ 'data-status': 'header' });
      // P2-07 keeps the supplied ERP hue but uses the shared light/dark pairs.
      assert.deepEqual(header.findAllByType('span').find(node => text(node) === 'Đã gửi PM').props.style, statusBadgeStyle('#000000', '#FFFF00'));
      assert.deepEqual(header.findAllByType('span').find(node => node.props.title === 'Trạng thái giao hàng').props.style, statusBadgeStyle('#FFFFFF', '#00695C', 'warning'));
      assert.match(text(header), /Chưa khóa.*Giao hàng: Đang giao/);
      assert.doesNotMatch(text(tree.toJSON()), /Status Fore Color|Delivery Status|#FFFF00|#00695C/);
      if (sales) {
        const historyStatus = tree.root.findAllByType('span').find(node => node.props.title === 'Mã trạng thái: 12');
        assert.deepEqual(historyStatus.props.style, statusBadgeStyle('#FFFFFF', '#FFFF00'));
      }
    });
  });
}

test('invalid or absent summaries preserve the generic decimal footer; additional sections never repeat the server summary', async () => {
  for (const summary of [undefined, {}, { rowCount: -1, amount: 'invalid' }]) {
    await mounted('machine-repairs', detail(summary), tree => {
      assert.equal(summaries(tree).length, 0);
      assert.equal(text(tree.root.findByProps({ 'data-document-lines-total': true })), 'Tổng cộng (1 dòng)20 USD');
    });
  }
  const data = detail({ rowCount: 0, amount: '0' });
  data.lines = page([]);
  data.header.deliveryStatusName = '  ';
  data.sections = { costs: page([line]), undeclared: page([line]) };
  await mounted('machine-repairs', data, tree => {
    assert.equal(summaries(tree).length, 1);
    assert.match(text(summaries(tree)[0]), /0 dòng toàn chứng từ.*0 USD/);
    assert.equal(tree.root.findAllByProps({ title: 'Trạng thái giao hàng' }).length, 0);
    assert.equal(tree.root.findAllByProps({ 'data-document-detail-tabs': true }).length, 1);
    assert.doesNotMatch(text(tree.toJSON()), /undeclared/);
  });
});
