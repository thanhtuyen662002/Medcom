import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(app, '../..');
const output = path.join(app, '.test-runtime/document-detail-config-ops');
await mkdir(output, { recursive: true });
await build({
  stdin: {
    contents: ['transfer', 'machine', 'qr'].map(name =>
      `export * from "./lib/erp/document-detail/modules/${name}";`).join('\n'),
    resolveDir: app,
    loader: 'ts',
  },
  outfile: path.join(output, 'fixture.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  logLevel: 'warning',
});

const require = createRequire(import.meta.url);
const exports = require(path.join(output, 'fixture.cjs'));
const configs = Object.values(exports);
const fixture = require(path.join(app, 'tests/fixtures/document-detail-header-keys-ops.json'));
const screens = [
  ...require(path.join(root, 'inventories/erp/20261010/six-screen-catalog.json')).screens,
  ...require(path.join(root, 'inventories/erp/20261011/cud-workflow-catalog.json')).screens,
];
const visibility = require(path.join(root, 'inventories/erp/20261019/visible-fields.json'));
const catalogColumns = require(path.join(root, 'inventories/source/20261010/catalog-columns.json')).columns;
const q02Path = path.join(root, '.agent-runs/db/q02-columns.txt');
const q02Columns = fs.existsSync(q02Path) ? fs.readFileSync(q02Path, 'utf8').split(/\r?\n/)
  .map(line => line.split('|')).filter(parts => parts.length === 8 && /^\d+$/.test(parts[1]))
  .map(parts => ({ object: parts[0], name: parts[2], type: parts[3] })) : [];
const displaySource = fs.readFileSync(path.join(root, 'src/backend/Medcom.Api/FeDisplayProjection.cs'), 'utf8');
const lower = key => key.toLowerCase();
// Read the finite lists, not an approximation that misses acronym spellings.
function displayNames(kind) {
  const body = displaySource.match(new RegExp(`${kind}Names=new[^]*?\\{([^]*?)\\};`));
  assert.ok(body, `${kind}Names declaration must still be auditable`);
  return new Set([...body[1].matchAll(/"([^"]+)"/g)].map(match => lower(match[1])));
}
const moneyNames = displayNames('Money');
const dateNames = displayNames('Date');
// ErpVisibleFields.cs:19-25. Protocol identities survive form HDE filtering.
const protocol = new Set([
  'documentid', 'purchaserequestid', 'batchid', 'userautoid', 'lineid',
  'branchid', 'statusid', 'islock', 'islocked',
]);
const expectedModules = [
  'internal-transfer-requests', 'internal-transfer-pm', 'internal-transfer-batches',
  'internal-transfer-tech', 'internal-transfer-sa', 'internal-transfer-accounting',
  'internal-transfer-warehouse-out', 'internal-transfer-warehouse-in',
  'machine-movements', 'machine-repairs', 'warehouse-qr', 'sales-qr',
];
const englishTitle = /^[A-Z][a-z]+( [A-Z][a-z]+)+$/;
const camelCase = /^[a-z]+(?:[A-Z][a-z0-9]*)+$/;
const structuralHeaderKeys = new Set([
  'documentName', 'documentReferenceState', 'branchName', 'branchReferenceState',
]);
const screenFor = moduleId => {
  const matches = screens.filter(screen => screen.id === moduleId);
  assert.equal(matches.length, 1, `${moduleId}: unique source screen`);
  return matches[0];
};
function isHidden(moduleId, section, key) {
  const hidden = visibility.screens.find(screen => screen.module === moduleId)
    ?.sections.find(entry => entry.section === section)?.fields ?? [];
  return !protocol.has(lower(key)) && hidden.some(field => lower(field) === lower(key));
}
// ErpVisibleProjection.HiddenNames, including preservation of a selected Name.
function hiddenNames(moduleId, section) {
  const fields = screenFor(moduleId).fields[section];
  const result = new Set();
  for (const { name } of fields) {
    if (!isHidden(moduleId, section, name)) continue;
    const key = lower(name);
    result.add(key);
    if (key.endsWith('id')) {
      const prefix = key.slice(0, -2);
      if (!fields.some(field => lower(field.name) === `${prefix}name`
        && !isHidden(moduleId, section, field.name))) result.add(`${prefix}name`);
      result.add(`${prefix}referencestate`);
    }
    if (moneyNames.has(key) || dateNames.has(key)) result.add(`${key}display`);
    if (key.endsWith('statusid')) {
      result.add(`${key.slice(0, -2)}forecolor`);
      result.add(`${key.slice(0, -2)}backcolor`);
    }
  }
  return result;
}
function allFields(config) {
  return config.groups.flatMap(group => [
    ...group.fields, ...(group.subgroups ?? []).flatMap(subgroup => subgroup.fields),
  ]);
}
const fieldKeys = field => [...new Set([field.key, field.displayKey, field.secondaryKey].filter(Boolean))];
const headerKeys = config => allFields(config).flatMap(fieldKeys);
function references(config) {
  return {
    header: [...headerKeys(config), ...config.hidden],
    lines: [...config.lines.columns.map(column => column.key),
      ...(config.lines.expandGroups ?? []).flatMap(group => [...group.keys, ...(group.fullWidth ?? [])])],
    ...Object.fromEntries(Object.entries(config.sections ?? {}).map(([section, definition]) =>
      [section, definition.columns.map(column => column.key)])),
  };
}
function fixtureSections(moduleId) {
  const { header, lines, sections = {} } = fixture[moduleId];
  return { header, lines, ...sections };
}
function nativeJsonName(column) {
  const name = column.replaceAll('ID', 'Id').replaceAll('QR', 'Qr');
  return name.charAt(0).toLowerCase() + name.slice(1);
}
function canonicalKey(screen, key, section) {
  if (key === 'userAutoId') return 'lineId';
  if (key === 'isLock') return 'isLocked';
  if (key === 'batchId' && screen.headerKey === 'BatchID'
    && !screen.fields[section].some(field => field.name === 'documentId')) return 'documentId';
  return key;
}
// Static response provenance: ErpSql.Row selects only catalog fields, then
// FeDisplayProjection enriches, CanonicalResponseProjection aliases, and the
// FE erpDocumentDetailSchema removes structural header keys. No live reads.
function possibleKeys(screen, section) {
  const keys = new Set(screen.fields[section].map(field => field.name));
  if (section !== 'header') keys.add('lineId'); // ErpLineRow transport identity.
  for (const { name } of screen.fields[section]) {
    if (lower(name).endsWith('id')) {
      keys.add(`${name.slice(0, -2)}Name`);
      keys.add(`${name.slice(0, -2)}ReferenceState`);
      if (lower(name).endsWith('statusid')) {
        keys.add(`${name.slice(0, -2)}ForeColor`);
        keys.add(`${name.slice(0, -2)}BackColor`);
      }
      if (lower(name) === 'itemid') { keys.add('itemCode'); keys.add('unit'); }
    }
    if (moneyNames.has(lower(name)) || dateNames.has(lower(name))) keys.add(`${name}Display`);
  }
  for (const from of ['userAutoId', 'isLock', 'batchId']) {
    const to = canonicalKey(screen, from, section);
    if (to === from) continue;
    const group = field => lower(field).endsWith('id')
      ? [field, `${field.slice(0, -2)}Name`, `${field.slice(0, -2)}ReferenceState`] : [field];
    const sourceKeys = group(from), targetKeys = group(to);
    for (let index = 0; index < sourceKeys.length; index++) {
      if (keys.delete(sourceKeys[index])) keys.add(targetKeys[index]);
    }
  }
  const cut = hiddenNames(screen.id, section);
  for (const key of keys) if (cut.has(lower(key))) keys.delete(key);
  if (section === 'header') {
    keys.add('documentId'); keys.add('branchId');
    for (const key of structuralHeaderKeys) keys.delete(key);
  }
  return [...keys].sort();
}
function assertText(value) {
  assert.equal(typeof value, 'string');
  assert.ok(value.trim());
  assert.equal(englishTitle.test(value), false, value);
  assert.equal(camelCase.test(value), false, value);
}
function assertLabels(definitions) {
  const labels = definitions.map(definition => definition.label);
  labels.forEach(assertText);
  assert.equal(new Set(labels).size, labels.length, 'duplicate labels in one field/column context');
}

test('1. Every fixture header key belongs to one field or hidden, without duplicates or overlap', () => {
  for (const config of configs) {
    const keys = [...headerKeys(config), ...config.hidden];
    assert.equal(new Set(keys).size, keys.length, config.title);
    for (const moduleId of config.modules) {
      const header = fixture[moduleId].header;
      assert.equal(new Set(header).size, header.length, moduleId);
      assert.deepEqual([...keys].sort(), [...header].sort(), moduleId);
    }
  }
});

test('2. Every config reference, including displayKey and secondaryKey, exists in its section fixture', () => {
  for (const config of configs) for (const moduleId of config.modules) {
    const sections = fixtureSections(moduleId);
    for (const [section, keys] of Object.entries(references(config))) {
      assert.ok(sections[section], `${moduleId}.${section}`);
      for (const key of keys) assert.ok(sections[section].includes(key), `${moduleId}.${section}.${key}`);
    }
  }
});

test('3. Field, column, group, tab, notice and close labels are non-empty Vietnamese text', () => {
  for (const config of configs) {
    [config.title, config.closeLabel, config.lines.title, config.lines.emptyText].forEach(assertText);
    assertLabels(allFields(config));
    assertLabels(config.lines.columns);
    for (const group of config.groups) {
      assertText(group.title);
      for (const subgroup of group.subgroups ?? []) assertText(subgroup.title);
      if (group.emptyStrip) assertText(group.emptyStrip);
    }
    for (const group of config.lines.expandGroups ?? []) assertText(group.label);
    for (const section of Object.values(config.sections ?? {})) {
      assertText(section.title); assertLabels(section.columns);
    }
    for (const notice of Object.values(config.notice ?? {})) {
      assertText(notice.title); assertText(notice.body);
    }
    if (config.history) assertText(config.history.title);
  }
});

test('4. Explicit formats follow SQL bits/dates/quantities, MoneyNames and StatusID', () => {
  for (const config of configs) for (const moduleId of config.modules) {
    const fields = { header: allFields(config), lines: config.lines.columns,
      ...Object.fromEntries(Object.entries(config.sections ?? {}).map(([key, value]) => [key, value.columns])) };
    for (const [section, definitions] of Object.entries(fields)) for (const field of definitions) {
      assert.ok(field.format, `${moduleId}.${section}.${field.key} needs an explicit format`);
      const native = screenFor(moduleId).fields[section].find(source => source.name === field.key);
      if (!native) continue;
      if (native.type === 'bit') assert.equal(field.format, 'boolean', field.key);
      else if (['datetime', 'datetime2', 'date'].includes(native.type))
        assert.ok(['date', 'datetime'].includes(field.format), field.key);
      else if (moneyNames.has(lower(native.name))) assert.equal(field.format, 'money', field.key);
      else if (lower(native.name).endsWith('statusid')) assert.equal(field.format, 'status', field.key);
      else if (['int', 'decimal', 'numeric', 'float'].includes(native.type))
        assert.equal(field.format, 'number', field.key);
    }
  }
  assert.ok(exports.machineRepairDetailConfig.lines.columns.some(c => c.key === 'warrantyCovered' && c.format === 'boolean'));
  assert.ok(exports.transferWarehouseInDetailConfig.sections.assets.columns.some(c => c.key === 'isReceived' && c.format === 'boolean'));
});

test('5. Header technical metadata and status/lock identities are hidden when returned', () => {
  for (const config of configs) for (const moduleId of config.modules) {
    const keys = fixture[moduleId].header;
    for (const key of keys.filter(key =>
      /(?:ReferenceState|ForeColor|BackColor|Display)$/.test(key)
      || ['documentId','branchId','statusId','statusName','statusCode','status','isLocked',
        'userCreate','userUpdate','dateCreate','dateUpdate','searchField','linkId','linkName',
        'sendTo','backColor','foreColor'].includes(key))) {
      assert.ok(config.hidden.includes(key), `${moduleId}.${key}`);
    }
    for (const field of allFields(config)) if (lower(field.key).endsWith('id')) {
      const name = `${field.key.slice(0, -2)}Name`;
      if (keys.includes(name) && !config.hidden.includes(name)) assert.equal(field.displayKey, name, field.key);
    }
  }
});

test('6. Line columns are unique and exist in each module line fixture', () => {
  for (const config of configs) {
    const keys = config.lines.columns.map(column => column.key);
    assert.equal(new Set(keys).size, keys.length, config.title);
    assert.ok(keys.length > 0);
    for (const moduleId of config.modules) for (const key of keys)
      assert.ok(fixture[moduleId].lines.includes(key), `${moduleId}.${key}`);
  }
});

test('7. All twelve modules have exactly one config, with source-justified transfer splits', () => {
  assert.deepEqual(configs.flatMap(config => config.modules).sort(), [...expectedModules].sort());
  assert.deepEqual(Object.keys(fixture).sort(), [...expectedModules].sort());
  assert.equal(configs.length, 11); // Seven transfer configs: see evidence §2.
  assert.deepEqual(exports.transferTechnicalDetailConfig.modules, ['internal-transfer-tech', 'internal-transfer-sa']);
  assert.deepEqual(exports.transferRequestDetailConfig.modules, ['internal-transfer-requests']);
  assert.equal(screenFor('internal-transfer-pm').headerTable, 'IV_InternalTransferRequestTbl');
  assert.equal(screenFor('internal-transfer-tech').headerTable, 'IV_InternalTransferBatchTbl');
  assert.equal(screenFor('internal-transfer-batches').lineTable, 'IV_InternalTransferBatchRequestTbl');
});

test('8. Every expanded key has a labeled, formatted, inTable:false column; no orphan expansion columns', () => {
  for (const config of configs) {
    const expanded = (config.lines.expandGroups ?? []).flatMap(group => [...group.keys]);
    assert.equal(new Set(expanded).size, expanded.length);
    for (const group of config.lines.expandGroups ?? []) for (const key of group.fullWidth ?? [])
      assert.ok(group.keys.includes(key), `${config.title}.${key}`);
    for (const key of expanded) {
      const column = config.lines.columns.find(column => column.key === key);
      assert.ok(column, `${config.title}.${key}`);
      assertText(column.label); assert.ok(column.format);
      assert.equal(column.inTable, false, key);
    }
    for (const column of config.lines.columns)
      assert.equal(column.inTable === false, expanded.includes(column.key), column.key);
  }
});

test('9. Every selected DB/view column uses NativeJsonName with documented canonical/SQL aliases only', () => {
  for (const moduleId of expectedModules) {
    const screen = screenFor(moduleId);
    for (const [section, keys] of Object.entries(fixtureSections(moduleId))) {
      for (const field of screen.fields[section]) {
        const expected = nativeJsonName(field.column);
        // ErpSql.Row maps column isLock to catalog name isLocked before serialization.
        assert.equal(field.name, field.column === 'isLock' ? 'isLocked' : expected,
          `${moduleId}.${section}.${field.column}`);
        if (!field.virtual) {
          const table = screen.tables?.[section] ?? screen[`${section === 'header' ? 'header' : 'line'}Table`];
          const tableColumns = q02Columns.some(column => column.object === table) ? q02Columns : catalogColumns;
          assert.ok(tableColumns.some(column => column.object === table && column.name === field.column),
            `${table}.${field.column} needs q02 or committed DB metadata`);
        }
        if (isHidden(moduleId, section, field.name)) continue;
        const key = canonicalKey(screen, field.name, section);
        if (section === 'header' && structuralHeaderKeys.has(key)) continue;
        assert.ok(keys.includes(key), `${moduleId}.${section}.${key}`);
      }
      for (const key of keys) {
        const source = screen.fields[section].find(field => lower(field.column) === lower(key));
        if (source) assert.equal(key, nativeJsonName(source.column), `${moduleId}.${section}.${key}`);
      }
    }
  }
  assert.equal(nativeJsonName('QRCode'), 'qrCode');
  assert.equal(nativeJsonName('BBKCUrl'), 'bBKCUrl');
  assert.equal(nativeJsonName('VATAmountTotal'), 'vATAmountTotal');
  assert.equal(nativeJsonName('PMApprovedQty'), 'pMApprovedQty');
  assert.equal(nativeJsonName('UID'), 'uId');
});

test('10. Backend-filtered fields and derived Name/Display/state/color aliases never reach fixture or config', () => {
  const leaks = [];
  for (const config of configs) for (const moduleId of config.modules) {
    for (const [section, keys] of Object.entries(fixtureSections(moduleId))) {
      const hidden = hiddenNames(moduleId, section);
      for (const [source, entries] of Object.entries({ fixture: keys, config: references(config)[section] }))
        for (const key of entries) if (hidden.has(lower(key))) leaks.push(`${moduleId}.${section}.${source}.${key}`);
    }
  }
  assert.deepEqual(leaks, []);
  assert.ok(hiddenNames('internal-transfer-requests', 'header').has('frombranchname'));
  assert.ok(hiddenNames('internal-transfer-requests', 'lines').has('expectedobjectname'));
  assert.ok(hiddenNames('internal-transfer-pm', 'header').has('datecreatedisplay'));
  assert.equal(hiddenNames('internal-transfer-tech', 'header').has('frombranchname'), false);
  assert.equal(hiddenNames('internal-transfer-tech', 'header').has('statusid'), false);
  assert.equal(hiddenNames('internal-transfer-tech', 'header').has('islocked'), false);
});

test('11. Both QR modules expose precisely the qr-scan slot', () => {
  for (const name of ['warehouseQrDetailConfig', 'salesQrDetailConfig'])
    assert.deepEqual(exports[name].slots, ['qr-scan']);
  // Machine handovers and repairs edit each machine line in place.
  const lineEditors = [exports.machineMovementDetailConfig, exports.machineRepairDetailConfig];
  for (const config of lineEditors) assert.deepEqual(config.slots, ['lines-editor']);
  for (const config of configs.filter(config => !config.modules.some(id => id.endsWith('-qr')) && !lineEditors.includes(config)))
    assert.equal(config.slots, undefined);
});

test('12. Extra section columns match real response sections; comparison is not invented as sections.comparison', () => {
  for (const config of configs) for (const moduleId of config.modules) {
    const tables = screenFor(moduleId).tables ?? {};
    const expected = Object.keys(tables).filter(key => !['header','lines','history','comparison'].includes(key)).sort();
    assert.deepEqual(Object.keys(config.sections ?? {}).sort(), expected, moduleId);
    assert.deepEqual(Object.keys(fixture[moduleId].sections ?? {}).sort(), expected, moduleId);
    for (const [section, definition] of Object.entries(config.sections ?? {})) {
      assert.ok(definition.columns.length);
      const keys = definition.columns.map(column => column.key);
      assert.equal(new Set(keys).size, keys.length);
      for (const key of keys) assert.ok(fixture[moduleId].sections[section].includes(key), `${moduleId}.${section}.${key}`);
    }
  }
});

test('13. History is configured exactly when the source has historyTable; notices cite existing step actions', () => {
  for (const config of configs) for (const moduleId of config.modules) {
    assert.equal(Boolean(config.history), Boolean(screenFor(moduleId).historyTable), moduleId);
    const notice = config.notice?.[moduleId];
    if (notice) {
      assert.equal(notice.title, screenFor(moduleId).caption);
      assert.equal(notice.body, `${screenFor(moduleId).buttons.map(button => button.caption).join(' · ')}.`);
    }
  }
});

test('14. Every fixture key has static response provenance; no unsupported manufacturer aliases or missing keys', () => {
  for (const moduleId of expectedModules) for (const [section, keys] of Object.entries(fixtureSections(moduleId))) {
    assert.equal(new Set(keys).size, keys.length, `${moduleId}.${section}`);
    assert.deepEqual([...keys].sort(), possibleKeys(screenFor(moduleId), section), `${moduleId}.${section}`);
    assert.equal(keys.includes('manufacturerItemCode'), false);
    assert.equal(keys.includes('manufacturerCodeSource'), false);
    assert.equal(keys.includes('userAutoId'), false);
    assert.equal(keys.includes('userAutoName'), false);
    assert.equal(keys.includes('userAutoReferenceState'), false);
    if (section !== 'header') {
      assert.ok(keys.includes('lineId'));
      assert.ok(keys.includes('lineName'));
      assert.ok(keys.includes('lineReferenceState'));
    }
    if (screenFor(moduleId).headerKey === 'BatchID') {
      for (const oldAlias of ['batchId', 'batchName', 'batchReferenceState'])
        assert.equal(keys.includes(oldAlias), false, `${moduleId}.${section}.${oldAlias}`);
    }
  }
  // q02 has this newer column, but ErpSql.Projection does not select it.
  assert.equal(fixture['machine-movements'].header.includes('internalTransferBatchId'), false);
});
