import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/document-detail-enum');
await mkdir(output, { recursive: true });
await build({
  stdin: {
    contents: 'export * from "./lib/erp/document-detail/format"; export * from "./lib/erp/document-detail/enums";',
    resolveDir: app,
    loader: 'ts',
  },
  outfile: path.join(output, 'fixture.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  alias: { '@': app },
  logLevel: 'warning',
});
const require = createRequire(import.meta.url);
const {
  EMPTY_VALUE, formatDetailValue, ERP_ENUMS, erpEnumLabel,
} = require(path.join(output, 'fixture.cjs'));

test('transport method codes use ERP labels in ERP order', () => {
  assert.deepEqual(ERP_ENUMS.transportMethod.map(entry => entry.value), ['ROAD', 'AIR', 'OTHER']);
  assert.equal(erpEnumLabel('transportMethod', 'ROAD'), 'Đường bộ');
  assert.equal(erpEnumLabel('transportMethod', 'AIR'), 'Đường air');
  assert.equal(erpEnumLabel('transportMethod', 'OTHER'), 'Khác');
  assert.equal(formatDetailValue('ROAD', 'enum', { enumId: 'transportMethod' }), 'Đường bộ');
  assert.equal(formatDetailValue('AIR', 'enum', { enumId: 'transportMethod' }), 'Đường air');
  assert.equal(formatDetailValue('OTHER', 'enum', { enumId: 'transportMethod' }), 'Khác');
});

test('service status codes use ERP labels in ERP order', () => {
  assert.deepEqual(ERP_ENUMS.serviceStatus.map(entry => entry.value), ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
  assert.equal(erpEnumLabel('serviceStatus', 'OPEN'), 'Mở');
  assert.equal(erpEnumLabel('serviceStatus', 'IN_PROGRESS'), 'Đang xử lý');
  assert.equal(erpEnumLabel('serviceStatus', 'COMPLETED'), 'Hoàn thành');
  assert.equal(erpEnumLabel('serviceStatus', 'CANCELLED'), 'Hủy');
  assert.equal(formatDetailValue('OPEN', 'enum', { enumId: 'serviceStatus' }), 'Mở');
  assert.equal(formatDetailValue('IN_PROGRESS', 'enum', { enumId: 'serviceStatus' }), 'Đang xử lý');
  assert.equal(formatDetailValue('COMPLETED', 'enum', { enumId: 'serviceStatus' }), 'Hoàn thành');
  assert.equal(formatDetailValue('CANCELLED', 'enum', { enumId: 'serviceStatus' }), 'Hủy');
});

test('enum labels match after trim and case-insensitively', () => {
  assert.equal(erpEnumLabel('transportMethod', ' road '), 'Đường bộ');
  assert.equal(erpEnumLabel('serviceStatus', 'in_progress'), 'Đang xử lý');
  assert.equal(formatDetailValue(' air ', 'enum', { enumId: 'transportMethod' }), 'Đường air');
  assert.equal(formatDetailValue('completed', 'enum', { enumId: 'serviceStatus' }), 'Hoàn thành');
});

test('unknown codes return null and keep the original value when formatting', () => {
  assert.equal(erpEnumLabel('transportMethod', 'SEA'), null);
  assert.equal(erpEnumLabel('serviceStatus', 'UNKNOWN'), null);
  assert.equal(formatDetailValue('SEA', 'enum', { enumId: 'transportMethod' }), 'SEA');
  assert.equal(formatDetailValue('UNKNOWN', 'enum', { enumId: 'serviceStatus' }), 'UNKNOWN');
});

test('empty enum values use the empty marker', () => {
  for (const value of [null, undefined, '', ' ']) {
    assert.equal(formatDetailValue(value, 'enum', { enumId: 'transportMethod' }), EMPTY_VALUE);
  }
});

test('non-string enum values return null and format as strings', () => {
  for (const value of [42, true, null, undefined, {}, []]) {
    assert.equal(erpEnumLabel('transportMethod', value), null);
  }
  assert.equal(formatDetailValue(42, 'enum', { enumId: 'transportMethod' }), '42');
});

test('missing enumId keeps the original value', () => {
  assert.equal(formatDetailValue('ROAD', 'enum'), 'ROAD');
  assert.equal(formatDetailValue('ROAD', 'enum', {}), 'ROAD');
  assert.equal(formatDetailValue('OPEN', 'enum', { enumId: undefined }), 'OPEN');
});
