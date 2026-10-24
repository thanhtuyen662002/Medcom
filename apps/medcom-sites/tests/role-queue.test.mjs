import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/role-queue');
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: 'export * from "./lib/erp/role-queue";', resolveDir: app, loader: 'ts' },
  outfile: path.join(output, 'fixture.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  alias: { '@': app },
  logLevel: 'warning',
});
const require = createRequire(import.meta.url);
const { ROLE_QUEUE_STATUSES, roleQueueStatuses, mergeRoleQueuePages, roleQueueCount } = require(path.join(output, 'fixture.cjs'));

test('each role screen waits on the agreed ERP statuses', () => {
  assert.deepEqual(roleQueueStatuses('internal-transfer-tech'), [20, 21]);
  assert.deepEqual(roleQueueStatuses('internal-transfer-sa'), [40, 41]);
  assert.deepEqual(roleQueueStatuses('internal-transfer-accounting'), [60, 61]);
  assert.deepEqual(roleQueueStatuses('internal-transfer-warehouse-out'), [70]);
  assert.deepEqual(roleQueueStatuses('internal-transfer-warehouse-in'), [100]);
  assert.deepEqual(roleQueueStatuses('internal-transfer-batches'), [0, 10, 25, 45]);
  assert.deepEqual(roleQueueStatuses('internal-transfer-pm'), [10]);
  assert.deepEqual(roleQueueStatuses('sales-order-pm'), [12, 13]);
  assert.deepEqual(roleQueueStatuses('sales-order-sa'), [14, 15]);
  assert.deepEqual(roleQueueStatuses('sales-orders'), [-2, -1, 11]);
});

test('finished, cancelled and non-role screens have no queue', () => {
  for (const statuses of Object.values(ROLE_QUEUE_STATUSES)) {
    for (const finished of [120, 130, 900]) assert.equal(statuses.includes(finished), false);
  }
  for (const screenModule of ['purchase-requests', 'purchase-approvals', 'warehouse-qr', 'machine-movements', 'sales-qr']) {
    assert.equal(roleQueueStatuses(screenModule), null, screenModule);
  }
});

test('per-status pages merge into one newest-first list without duplicates', () => {
  const row = (documentId, documentDate) => ({ documentId, header: { documentDate } });
  const merged = mergeRoleQueuePages([
    { rows: [row('A', '2026-10-01T00:00:00'), row('C', '2026-10-20T00:00:00')], hasMore: false },
    { rows: [row('B', '2026-10-10T00:00:00'), row('C', '2026-10-20T00:00:00')], hasMore: true },
  ]);
  assert.deepEqual(merged.rows.map(item => item.documentId), ['C', 'B', 'A']);
  assert.equal(merged.truncated, true);
  assert.deepEqual(mergeRoleQueuePages([]), { rows: [], truncated: false });
});

test('the menu badge sums only the role statuses from a status-count response', () => {
  const items = [{ statusId: 0, count: 1 }, { statusId: 20, count: 2 }, { statusId: 21, count: 3 }, { statusId: 120, count: 9 }];
  assert.equal(roleQueueCount(items, ROLE_QUEUE_STATUSES['internal-transfer-tech']), 5);
  assert.equal(roleQueueCount(items, ROLE_QUEUE_STATUSES['internal-transfer-warehouse-in']), 0);
  assert.equal(roleQueueCount([], [20]), 0);
});
