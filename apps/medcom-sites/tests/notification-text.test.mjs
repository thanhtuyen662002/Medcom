import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/notification-text');
await mkdir(output, { recursive: true });
await build({
  stdin: { contents: 'export * from "./lib/erp/notification-text";', resolveDir: app, loader: 'ts' },
  outfile: path.join(output, 'fixture.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  alias: { '@': app },
  logLevel: 'warning',
});
const require = createRequire(import.meta.url);
const { isGuid, readableNotificationText } = require(path.join(output, 'fixture.cjs'));

test('raw ERP amounts in message text read as money', () => {
  assert.equal(readableNotificationText('Tong thue: 1200000.00 VND. Con 7 ngay.'), 'Tong thue: 1.200.000 VND. Con 7 ngay.');
  assert.equal(readableNotificationText('Gia 2500.5 USD'), 'Gia 2.500,5 USD');
});

test('document numbers, years and short numbers are left alone', () => {
  for (const text of ['Chung tu PO1026/0002 dot 1', 'Nam 2026 VNDX', 'Con 7 ngay', 'Ma 12345']) {
    assert.equal(readableNotificationText(text), text);
  }
});

test('GUID references are recognised so they are not shown as document numbers', () => {
  assert.equal(isGuid('3B0EAA12-EFA6-43D3-BC9E-AD54CC329241'), true);
  assert.equal(isGuid('PO1026/0002'), false);
});
