import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/document-detail-format');
await mkdir(output, { recursive: true });
await build({
  stdin: {
    contents: 'export * from "./lib/erp/document-detail/format"; export {formatMoney} from "./lib/erp/money"; export {documentStatusLabel} from "./lib/erp/document-status";',
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
  EMPTY_VALUE, formatBoolean, formatDate, formatDateTime, formatNumber,
  formatDetailValue, isEmptyDetailValue, isHttpUrl, formatMoney, documentStatusLabel,
} = require(path.join(output, 'fixture.cjs'));

test('boolean values use Vietnamese labels without treating false as empty', () => {
  for (const value of [true, 1, '1', 'true', 'True']) assert.equal(formatBoolean(value), 'Có');
  for (const value of [false, 0, '0', 'false', 'False']) assert.equal(formatBoolean(value), 'Không');
});

test('unsupported boolean values use the empty marker', () => {
  for (const value of [null, undefined, '', ' ', 'abc', 2, -1, {}, []]) {
    assert.equal(formatBoolean(value), EMPTY_VALUE);
  }
});

test('only nullish values and blank strings are empty detail values', () => {
  assert.equal(EMPTY_VALUE, '—');
  for (const value of [null, undefined, '', ' ', '\t\r\n']) assert.equal(isEmptyDetailValue(value), true);
  for (const value of [false, 0, '0', 'false', ' text ', {}, []]) assert.equal(isEmptyDetailValue(value), false);
});

test('date fields show the date without the time or timezone conversion', () => {
  for (const value of ['2026-10-23', '2026-10-23T00:00:00', '2026-10-23T14:05:00', '2026-10-23T23:59:00-07:00']) {
    assert.equal(formatDate(value), '23/10/2026');
    assert.equal(formatDetailValue(value, 'date'), '23/10/2026');
  }
});

test('datetime preserves the existing prefix parsing and midnight rules', () => {
  // Nonempty examples from formatVietnamDate in components/untitledui/tab-erp-screen.tsx:254–261.
  const examples = [
    ['2026-10-23', '23/10/2026'],
    ['2026-10-23T00:00', '23/10/2026'],
    ['2026-10-23T00:00:00', '23/10/2026'],
    ['2026-10-23T14:05', '23/10/2026 14:05'],
    ['2026-10-23T14:05:00', '23/10/2026 14:05'],
    ['2026-10-23T00:00:01', '23/10/2026 00:00'],
    ['2026-10-23T23:59:00Z', '23/10/2026 23:59'],
    ['2026-10-23T23:59:00-07:00', '23/10/2026 23:59'],
    ['2026-10-23 14:05:00', '23/10/2026'],
    ['2026-99-99', '99/99/2026'],
  ];
  for (const [value, expected] of examples) {
    assert.equal(formatDateTime(value), expected, value);
    assert.equal(formatDetailValue(value, 'datetime'), expected, value);
  }
});

test('date formatters preserve unrecognized text and legacy nonstring behavior', () => {
  for (const format of [formatDate, formatDateTime]) {
    for (const value of ['not a date', '23/10/2026', ' 2026-10-23']) assert.equal(format(value), value);
    for (const value of [0, 42, false, true, {}, []]) assert.equal(format(value), String(value));
    for (const value of [null, undefined, '', ' \t ']) assert.equal(format(value), EMPTY_VALUE);
  }
});

test('numbers use Vietnamese grouping and preserve nonnumeric text', () => {
  assert.equal(formatNumber('1234567.5'), '1.234.567,5');
  assert.equal(formatDetailValue('1234567.5', 'number'), '1.234.567,5');
  for (const value of ['abc', '1.234,5', '  abc  ']) assert.equal(formatNumber(value), value);
  for (const value of [null, undefined, '', '\n\t']) assert.equal(formatNumber(value), EMPTY_VALUE);
});

test('nonempty numeric inputs retain formatVietnamNumber coercion and rounding', () => {
  // Examples from components/untitledui/tab-erp-screen.tsx:264–268, including its default precision.
  const examples = [
    [0, '0'], ['0', '0'], [-1234.56789, '-1.234,568'],
    ['1.23456', '1,235'], ['1e3', '1.000'], [' 1234 ', '1.234'],
    [true, '1'], [false, '0'], [NaN, 'NaN'], [Infinity, '∞'], [-Infinity, '-∞'],
  ];
  for (const [value, expected] of examples) assert.equal(formatNumber(value), expected);
});

test('money delegates exact decimal strings to the existing formatter', () => {
  for (const value of ['123456789012345678.9012', '-1000000.50', '0.00', 1e-7, Infinity]) {
    assert.equal(formatDetailValue(value, 'money'), formatMoney(value));
  }
  assert.equal(formatDetailValue('123456789012345678.9012', 'money'), '123.456.789.012.345.678,9012');
});

test('status labels delegate to documentStatusLabel including invalid names', () => {
  for (const statusId of [0, 3, 999]) {
    for (const statusName of ['Nháp', ' Đã duyệt ', '', ' ', 'bad\0text', 'x'.repeat(101), null, undefined]) {
      assert.equal(formatDetailValue(statusId, 'status', { statusName }), documentStatusLabel(statusId, statusName));
    }
    assert.equal(formatDetailValue(statusId, 'status'), documentStatusLabel(statusId));
    assert.equal(formatDetailValue(statusId, 'status', { statusName: {} }), documentStatusLabel(statusId));
  }
});

test('text-like formats stringify scalar values without losing false or zero', () => {
  for (const format of [undefined, 'text', 'multiline', 'url', 'reference']) {
    for (const value of [' text ', 'first\nsecond', 'https://x', 'REF-001', false, 0, 42]) {
      assert.equal(formatDetailValue(value, format), String(value));
    }
  }
  assert.equal(formatDetailValue(false, 'boolean'), 'Không');
  assert.equal(formatDetailValue(true, 'boolean'), 'Có');
});

test('objects and arrays never leak object text through detail formatting', () => {
  for (const value of [{ a: 1 }, {}, [], ['text'], { toString() { throw Error('must not stringify objects'); } }]) {
    for (const format of [undefined, 'text', 'multiline', 'url', 'reference', 'money', 'number', 'boolean', 'date', 'datetime', 'status']) {
      assert.equal(formatDetailValue(value, format), EMPTY_VALUE);
    }
  }
});

test('empty detail values use the same marker for every format', () => {
  for (const value of [null, undefined, '', ' \t\n ']) {
    for (const format of [undefined, 'text', 'multiline', 'url', 'reference', 'money', 'number', 'boolean', 'date', 'datetime', 'status']) {
      assert.equal(formatDetailValue(value, format, { statusName: 'Đã duyệt' }), EMPTY_VALUE);
    }
  }
});

test('HTTP URLs are recognized after trimming and without case sensitivity', () => {
  for (const value of [' https://x ', 'http://x', ' HTTPS://x ', '\tHtTp://x\n']) assert.equal(isHttpUrl(value), true);
  for (const value of ['ftp://x', 'javascript:alert(1)', '//x', 'xhttps://x', '', null, undefined, 1, {}]) {
    assert.equal(isHttpUrl(value), false);
  }
});

test('date formatters stringify nonempty nonstring values instead of discarding them', () => {
  for (const format of [formatDate, formatDateTime]) {
    for (const value of [0, 42, -1, false, true, NaN, Infinity, -Infinity, {}, [], ['QA-DATE']]) {
      assert.equal(format(value), String(value));
    }
  }
});

test('date detail formats retain nonstring scalar values', () => {
  for (const format of ['date', 'datetime']) {
    for (const value of [0, 42, false, true]) {
      assert.equal(formatDetailValue(value, format), String(value));
    }
  }
});
