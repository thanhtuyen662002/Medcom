import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/status-chips');
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: 'export * from "./lib/erp/status-chips";', resolveDir: app, loader: 'ts' },
  outfile: path.join(output, 'fixture.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  alias: { '@': app },
  logLevel: 'warning',
});
const require = createRequire(import.meta.url);
const { erpStatusChips, erpStatusDisplay, matchesErpStatus } = require(path.join(output, 'fixture.cjs'));

// AP_PurchaseStatusTbl: 1 Nháp, 2 Chờ duyệt, 3 Đã duyệt, 4 Đã từ chối, 5 Đã gửi đặt mua hàng.
const rows = [
  { statusId: 5, statusName: 'Đã gửi đặt mua hàng' },
  { statusId: 3, statusName: 'Đã duyệt' },
  { statusId: 5, statusName: 'Đã gửi đặt mua hàng' },
  { statusId: 3, statusName: 'Đã duyệt' },
  { statusId: null },
];

test('badges show the ERP status name, so an approved request is never shown as rejected', () => {
  assert.deepEqual(erpStatusDisplay({ statusId: 3, statusName: 'Đã duyệt' }), { label: 'Đã duyệt', tone: 'success' });
  assert.deepEqual(erpStatusDisplay({ statusId: 4, statusName: 'Đã từ chối' }), { label: 'Đã từ chối', tone: 'danger' });
  assert.equal(erpStatusDisplay({ statusId: 13, statusName: 'Đã gửi kế toán' }).tone, 'neutral');
});

test('a missing ERP name falls back to the shared unknown-status wording, not a guessed label', () => {
  assert.equal(erpStatusDisplay({ statusId: 7, statusName: null }).label, 'Trạng thái chưa xác định (mã 7)');
  assert.equal(erpStatusDisplay({ statusId: null }).label, 'Chưa có trạng thái');
});

test('chips list only statuses present in the loaded rows, in ERP order, with matching counts', () => {
  assert.deepEqual(erpStatusChips(rows), [
    { value: '', label: 'Tất cả', count: 5 },
    { value: '3', label: 'Đã duyệt', count: 2 },
    { value: '5', label: 'Đã gửi đặt mua hàng', count: 2 },
  ]);
  assert.deepEqual(erpStatusChips([]), [{ value: '', label: 'Tất cả', count: 0 }]);
});

test('every chip count equals the rows its filter keeps', () => {
  for (const chip of erpStatusChips(rows)) {
    assert.equal(rows.filter(row => matchesErpStatus(row, chip.value)).length, chip.count, chip.label);
  }
  assert.equal(matchesErpStatus({ statusId: null }, '3'), false);
});
