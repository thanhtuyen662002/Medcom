import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/native-refusal-message');
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: 'export * from "./lib/erp/document-detail/controllers/erp-detail-rules"; export { salesCommandMessage } from "./lib/erp/sales-order-workflow"; export { erpCommandResultSchema } from "./lib/erp/erp-screen-contracts";', resolveDir: app, loader: 'ts' },
  outfile: path.join(output, 'fixture.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external', alias: { '@': app }, logLevel: 'warning',
});
const require = createRequire(import.meta.url);
const { getActionErrorMessage, salesCommandMessage, erpCommandResultSchema } = require(path.join(output, 'fixture.cjs'));

test('an ERP refusal is shown in ERP\'s own words', () => {
  assert.equal(getActionErrorMessage('Conflict', 'native_action_rejected', 'Cần nhập lý do không duyệt.'), 'Cần nhập lý do không duyệt.');
  assert.equal(salesCommandMessage({ outcome: 'Conflict', code: 'sales_quantity_exceeds_contract', message: 'Số lượng vượt quá hợp đồng. Máy A: Còn lại 2, đang nhập 5' }),
    'Số lượng vượt quá hợp đồng. Máy A: Còn lại 2, đang nhập 5');
});

test('without an ERP message the generic wording stays, and outages never show raw text', () => {
  assert.match(getActionErrorMessage('Conflict', 'native_action_rejected'), /đã thay đổi/);
  assert.match(getActionErrorMessage('Unavailable', 'erp_command_unavailable', 'stack trace'), /chưa sẵn sàng/);
});

test('the command result contract accepts the optional message', () => {
  assert.equal(erpCommandResultSchema.parse({ outcome: 'Conflict', code: 'native_action_rejected', message: 'X' }).message, 'X');
  assert.equal(erpCommandResultSchema.parse({ outcome: 'Committed' }).message, undefined);
});
