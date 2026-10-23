import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(app, '.test-runtime/document-detail-config');
await mkdir(output, { recursive: true });

await build({
  stdin: {
    contents: 'export * from "./lib/erp/document-detail/modules/purchase"; export * from "./lib/erp/document-detail/modules/inbound";',
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
  purchaseRequestDetailConfig,
  purchaseOrderDetailConfig,
  inboundRequestDetailConfig,
} = require(path.join(output, 'fixture.cjs'));
const fixture = require(path.join(app, 'tests/fixtures/document-detail-header-keys.json'));
const visibleMetadata = require(path.resolve(app, '../../inventories/erp/20261019/visible-fields.json'));
const screenMetadata = [
  ...require(path.resolve(app, '../../inventories/erp/20261010/six-screen-catalog.json')).screens,
  ...require(path.resolve(app, '../../inventories/erp/20261011/cud-workflow-catalog.json')).screens,
];

// ErpVisibleFields.cs:14-25: protocol keys survive HDE; PO exclusions do not.
const PROTOCOL_FIELDS = new Set([
  'documentid', 'purchaserequestid', 'batchid', 'userautoid', 'lineid',
  'branchid', 'statusid', 'islock', 'islocked',
]);
const PO_LINE_EXCLUSIONS = new Set([
  'property', 'property2', 'parentid', 'sourceamount', 'quantity2', 'amount',
]);

function isHidden(moduleId, section, key) {
  const lowerKey = key.toLowerCase();
  if (moduleId === 'purchase-orders' && section === 'lines' && PO_LINE_EXCLUSIONS.has(lowerKey)) {
    return true;
  }
  const fields = visibleMetadata.screens.find((screen) => screen.module === moduleId)
    ?.sections.find((entry) => entry.section === section)?.fields ?? [];
  return !PROTOCOL_FIELDS.has(lowerKey) && fields.some((field) => field.toLowerCase() === lowerKey);
}

function getHiddenNames(moduleId, section) {
  const hidden = new Set();
  if (moduleId === 'purchase-orders' && section === 'lines') {
    for (const key of [
      'lineName', 'lineReferenceState', 'documentReferenceState', 'itemReferenceState',
      'documentName', 'parentName', 'parentReferenceState',
    ]) hidden.add(key.toLowerCase());
  }

  const fields = screenMetadata.find((screen) => screen.id === moduleId).fields[section];
  for (const { name } of fields) {
    if (!isHidden(moduleId, section, name)) continue;
    const key = name.toLowerCase();
    hidden.add(key);
    // ErpVisibleProjection.cs:19-35, including the visible-name exception.
    if (key.endsWith('id')) {
      const prefix = key.slice(0, -2);
      if (!fields.some((field) => field.name.toLowerCase() === `${prefix}name`
        && !isHidden(moduleId, section, field.name))) hidden.add(`${prefix}name`);
      hidden.add(`${prefix}referencestate`);
    }
    // Relevant MoneyNames / DateNames from FeDisplayProjection.cs:18-33.
    if (['amount', 'sourceamount', 'datetimerecorded'].includes(key)) hidden.add(`${key}display`);
    if (key.endsWith('statusid')) {
      hidden.add(`${key.slice(0, -2)}forecolor`);
      hidden.add(`${key.slice(0, -2)}backcolor`);
    }
  }
  return hidden;
}

const ALL_CONFIGS = [
  purchaseRequestDetailConfig,
  purchaseOrderDetailConfig,
  inboundRequestDetailConfig,
];

const ENGLISH_TITLE_CASE = /^[A-Z][a-z]+( [A-Z][a-z]+)+$/;

function getAllFields(config) {
  const fields = [];
  for (const group of config.groups ?? []) {
    for (const field of group.fields ?? []) {
      fields.push(field);
    }
    for (const subgroup of group.subgroups ?? []) {
      for (const field of subgroup.fields ?? []) {
        fields.push(field);
      }
    }
  }
  return fields;
}

function getGroupKeys(config) {
  const keys = new Set();
  for (const field of getAllFields(config)) {
    if (field.key) keys.add(field.key);
    if (field.displayKey) keys.add(field.displayKey);
    if (field.secondaryKey) keys.add(field.secondaryKey);
  }
  return keys;
}

test('1. Every header key in fixture is in exactly one of groups or hidden with no overlap', () => {
  for (const config of ALL_CONFIGS) {
    const groupKeys = getGroupKeys(config);
    const hiddenKeys = new Set(config.hidden ?? []);

    for (const key of groupKeys) {
      assert.equal(
        hiddenKeys.has(key),
        false,
        `Key "${key}" cannot be in both groups and hidden for config "${config.title}"`
      );
    }

    for (const mod of config.modules) {
      const moduleFixture = fixture[mod];
      assert.ok(moduleFixture, `Fixture must exist for module "${mod}"`);
      const fixtureHeaders = new Set(moduleFixture.header);

      for (const key of fixtureHeaders) {
        const inGroups = groupKeys.has(key);
        const inHidden = hiddenKeys.has(key);
        assert.ok(
          inGroups || inHidden,
          `Key "${key}" from fixture["${mod}"].header must be declared in groups or hidden`
        );
        assert.ok(
          !(inGroups && inHidden),
          `Key "${key}" from fixture["${mod}"].header must not be in both groups and hidden`
        );
      }
    }
  }
});

test('2. Every key declared in config exists in fixture', () => {
  for (const config of ALL_CONFIGS) {
    const groupKeys = getGroupKeys(config);
    const hiddenKeys = new Set(config.hidden ?? []);

    for (const mod of config.modules) {
      const moduleFixture = fixture[mod];
      assert.ok(moduleFixture, `Fixture must exist for module "${mod}"`);
      const fixtureHeaders = new Set(moduleFixture.header);

      for (const key of groupKeys) {
        assert.ok(
          fixtureHeaders.has(key),
          `Group key "${key}" in config "${config.title}" must exist in fixture["${mod}"].header`
        );
      }

      for (const key of hiddenKeys) {
        assert.ok(
          fixtureHeaders.has(key),
          `Hidden key "${key}" in config "${config.title}" must exist in fixture["${mod}"].header`
        );
      }
    }
  }
});

test('3. Labels and titles are non-empty, not English camelCase/Title Case, and not duplicated within a config', () => {
  for (const config of ALL_CONFIGS) {
    assert.ok(typeof config.title === 'string' && config.title.trim().length > 0);
    assert.equal(
      ENGLISH_TITLE_CASE.test(config.title),
      false,
      `Config title "${config.title}" must not be English Title Case`
    );

    assert.ok(typeof config.closeLabel === 'string' && config.closeLabel.trim().length > 0);
    assert.equal(
      ENGLISH_TITLE_CASE.test(config.closeLabel),
      false,
      `Close label "${config.closeLabel}" must not be English Title Case`
    );

    const seenLabels = new Set();

    for (const group of config.groups ?? []) {
      assert.ok(typeof group.title === 'string' && group.title.trim().length > 0);
      assert.equal(
        ENGLISH_TITLE_CASE.test(group.title),
        false,
        `Group title "${group.title}" must not be English Title Case`
      );

      for (const field of group.fields ?? []) {
        assert.ok(typeof field.label === 'string' && field.label.trim().length > 0);
        assert.equal(
          ENGLISH_TITLE_CASE.test(field.label),
          false,
          `Field label "${field.label}" must not be English Title Case`
        );
        assert.equal(
          seenLabels.has(field.label),
          false,
          `Duplicate field label "${field.label}" in config "${config.title}"`
        );
        seenLabels.add(field.label);
      }

      for (const subgroup of group.subgroups ?? []) {
        assert.ok(typeof subgroup.title === 'string' && subgroup.title.trim().length > 0);
        assert.equal(
          ENGLISH_TITLE_CASE.test(subgroup.title),
          false,
          `Subgroup title "${subgroup.title}" must not be English Title Case`
        );

        for (const field of subgroup.fields ?? []) {
          assert.ok(typeof field.label === 'string' && field.label.trim().length > 0);
          assert.equal(
            ENGLISH_TITLE_CASE.test(field.label),
            false,
            `Field label "${field.label}" must not be English Title Case`
          );
          assert.equal(
            seenLabels.has(field.label),
            false,
            `Duplicate field label "${field.label}" in config "${config.title}"`
          );
          seenLabels.add(field.label);
        }
      }
    }

    assert.ok(typeof config.lines.title === 'string' && config.lines.title.trim().length > 0);
    assert.equal(
      ENGLISH_TITLE_CASE.test(config.lines.title),
      false,
      `Lines title "${config.lines.title}" must not be English Title Case`
    );

    const seenColumnLabels = new Set();
    for (const column of config.lines.columns ?? []) {
      assert.ok(typeof column.label === 'string' && column.label.trim().length > 0);
      assert.equal(
        ENGLISH_TITLE_CASE.test(column.label),
        false,
        `Column label "${column.label}" must not be English Title Case`
      );
      assert.equal(
        seenColumnLabels.has(column.label),
        false,
        `Duplicate column label "${column.label}" in config "${config.title}"`
      );
      seenColumnLabels.add(column.label);
    }
  }
});

test('4. Inbound keeps isRain as boolean and omits the backend-filtered isDamageOutsidePackage', () => {
  const fields = getAllFields(inboundRequestDetailConfig);
  const booleanFields = fields.filter((f) => f.format === 'boolean');
  const booleanKeys = new Set(booleanFields.map((f) => f.key));

  assert.ok(
    booleanKeys.has('isRain'),
    'inbound config must include isRain with format:"boolean"'
  );
  assert.equal(
    booleanKeys.has('isDamageOutsidePackage'),
    false,
    'inbound config must omit isDamageOutsidePackage after ErpVisibleProjection filtering'
  );
});

test('5. Inbound hidden contains orderTypeId or uses it with displayKey; contains sendTo and qrPrintType', () => {
  const hiddenKeys = new Set(inboundRequestDetailConfig.hidden ?? []);
  const fields = getAllFields(inboundRequestDetailConfig);
  const orderTypeField = fields.find((f) => f.key === 'orderTypeId');

  const usesDisplayKey = orderTypeField && typeof orderTypeField.displayKey === 'string' && orderTypeField.displayKey.length > 0;
  const isHidden = hiddenKeys.has('orderTypeId');

  assert.ok(
    usesDisplayKey || isHidden,
    'inbound config must either hide orderTypeId or use it with displayKey'
  );
  assert.ok(
    hiddenKeys.has('sendTo'),
    'inbound hidden must include sendTo'
  );
  assert.ok(
    hiddenKeys.has('qrPrintType'),
    'inbound hidden must include qrPrintType'
  );
});

test('6. Every column in lines.columns exists in lines fixture', () => {
  for (const config of ALL_CONFIGS) {
    for (const mod of config.modules) {
      const moduleFixture = fixture[mod];
      assert.ok(moduleFixture, `Fixture must exist for module "${mod}"`);
      const fixtureLines = new Set(moduleFixture.lines);

      for (const column of config.lines.columns ?? []) {
        assert.ok(
          fixtureLines.has(column.key),
          `Column key "${column.key}" in config "${config.title}" must exist in fixture["${mod}"].lines`
        );
      }
    }
  }
});

test('7. purchaseRequestDetailConfig.modules consists of exactly purchase-requests and purchase-approvals', () => {
  const modules = [...purchaseRequestDetailConfig.modules].sort();
  assert.deepEqual(modules, ['purchase-approvals', 'purchase-requests']);
  assert.equal(purchaseRequestDetailConfig.modules.length, 2);
});

test('8. Every key in lines.expandGroups exists in lines.columns and columns used only in expandGroups have inTable: false', () => {
  for (const config of ALL_CONFIGS) {
    const columns = config.lines.columns ?? [];
    const columnMap = new Map(columns.map((col) => [col.key, col]));
    const expandKeys = new Set();

    for (const group of config.lines.expandGroups ?? []) {
      for (const key of group.keys ?? []) {
        expandKeys.add(key);
        const col = columnMap.get(key);
        assert.ok(
          col,
          `Key "${key}" in expandGroups must exist in lines.columns of config "${config.title}"`
        );
        assert.ok(
          typeof col.label === 'string' && col.label.trim().length > 0,
          `Column "${key}" in expandGroups must have a non-empty label`
        );
      }
    }

    for (const column of columns) {
      if (expandKeys.has(column.key)) {
        assert.equal(
          column.inTable,
          false,
          `Column "${column.key}" in expandGroups must have inTable: false in config "${config.title}"`
        );
      } else {
        assert.notEqual(
          column.inTable,
          false,
          `Table column "${column.key}" must not have inTable: false in config "${config.title}"`
        );
      }
    }
  }
});

function nativeJsonName(native) {
  const name = native.replaceAll('ID', 'Id').replaceAll('QR', 'Qr');
  return name.charAt(0).toLowerCase() + name.slice(1);
}

const FALLBACK_DB_COLUMNS = {
  AP_PurchaseRequestTbl: [
    'PurchaseRequestID', 'PurchaseDate', 'PurposeID', 'PersonSuggest', 'Department',
    'PurposeDescOrClient', 'Price', 'Notes', 'StatusID', 'isLock', 'CurrencyID',
    'ObjectID', 'RateExchange', 'BranchID',
  ],
  AP_PurchaseRequestDetailTbl: [
    'UserAutoID', 'ItemID', 'Budget', 'TimeRequired', 'Quantity', 'UnitPrice',
    'TotalPrice', 'Model', 'PurchaseRequestID',
  ],
  AP_OrderTbl: [
    'DocumentID', 'DocumentDate', 'ObjectID', 'Memo', 'Notes', 'DeliverDate',
    'CurrencyID', 'RateExchange', 'BaseTotal', 'SearchField', 'isLock',
    'UserCreate', 'UserUpdate', 'DateUpdate', 'DateCreate', 'LinkID',
    'ContractID', 'StatusID', 'BranchID',
  ],
  AP_OrderDetailTbl: [
    'UserAutoID', 'DocumentID', 'ItemID', 'Quantity', 'UnitPrice', 'SourceAmount',
    'Amount', 'Notes', 'Quantity2', 'Property', 'Property2', 'ParentID',
  ],
  IV_InboundRequestTbl: [
    'DocumentID', 'DocumentDate', 'OrderNumber', 'BranchID', 'InvoiceNo',
    'DeclarationNumber', 'DeparturePoint', 'DestinationPoint', 'IsRain',
    'OrderTypeID', 'ObjectID', 'TotalPalletQuantityByDocument',
    'TotalBarrelQuantityByDocument', 'TotalPalletQuantityByReal',
    'TotalBarrelQuantityByReal', 'ExcessPackageQuantity', 'LackOfPackageQuantity',
    'DamagedPackageQuantity', 'PackageTypeID', 'IsDamageOutsidePackage',
    'DamageDescription', 'DamageInsideStatusID', 'LocationDamageDetectedID',
    'LocationDamageDescription', 'ResultDesciption', 'TotalQuantityInboundResult',
    'GoodAwaitingInboundResult', 'ResultNote', 'DatetimeRecorded', 'StatusID',
    'CurrencyID', 'RateExchange', 'ImageURL', 'BBKCUrl', 'Notes', 'SendTo',
    'QRPrintType', 'LinkID', 'DetailSaveToken',
  ],
  IV_InboundRequestDetailsTbl: [
    'UserAutoID', 'DocumentID', 'ContractID', 'ItemID', 'HangSX', 'UnitFactor',
    'Unit2', 'Additional', 'LotNumberByDocument', 'SetQuantityByDocument',
    'BarrelQuantityByDocument', 'ExpireDateByDocument', 'LotNumberByReal',
    'SetQuantityByReal', 'BarrelQuantityByReal', 'ExpireDateByReal', 'SourceAmount',
    'UnitPrice', 'Amount', 'RandomTestQuantity', 'TestStatus', 'NoPalletNote',
    'PalletNote', 'CheckerNote', 'ItemCode', 'ParentID', 'OrderDetailID',
  ],
};

function getDbColumns() {
  const q02Path = path.resolve(app, '../../.agent-runs/db/q02-columns.txt');
  if (fs.existsSync(q02Path)) {
    const content = fs.readFileSync(q02Path, 'utf8');
    const dbCols = {};
    for (const line of content.split(/\r?\n/)) {
      const parts = line.split('|');
      if (parts.length >= 3) {
        const [table, , col] = parts;
        if (!dbCols[table]) dbCols[table] = [];
        dbCols[table].push(col);
      }
    }
    return dbCols;
  }
  return FALLBACK_DB_COLUMNS;
}

test('9. Every fixture key with a corresponding DB column follows NativeJsonName casing', () => {
  const dbCols = getDbColumns();
  const tableMapping = {
    'purchase-requests': { header: 'AP_PurchaseRequestTbl', lines: 'AP_PurchaseRequestDetailTbl' },
    'purchase-approvals': { header: 'AP_PurchaseRequestTbl', lines: 'AP_PurchaseRequestDetailTbl' },
    'purchase-orders': { header: 'AP_OrderTbl', lines: 'AP_OrderDetailTbl' },
    'inbound-requests': { header: 'IV_InboundRequestTbl', lines: 'IV_InboundRequestDetailsTbl' },
  };

  for (const [mod, sections] of Object.entries(tableMapping)) {
    for (const [section, tableName] of Object.entries(sections)) {
      const cols = dbCols[tableName] ?? [];
      const fixtureKeys = fixture[mod][section];

      for (const col of cols) {
        if (isHidden(mod, section, nativeJsonName(col))) continue;
        const expected = nativeJsonName(col);
        assert.ok(
          fixtureKeys.includes(expected),
          `Fixture key "${expected}" for DB column "${col}" in table "${tableName}" must exist in fixture["${mod}"].${section}`
        );
      }

      for (const key of fixtureKeys) {
        const matchingCol = cols.find((c) => c.toLowerCase() === key.toLowerCase());
        if (matchingCol) {
          const expected = nativeJsonName(matchingCol);
          assert.equal(
            key,
            expected,
            `Fixture key "${key}" for DB column "${matchingCol}" in fixture["${mod}"].${section} must follow NativeJsonName casing "${expected}"`
          );
        }
      }
    }
  }
});

test('10. Backend-filtered keys and derived aliases are absent from fixtures and config references', () => {
  const leaks = [];
  for (const config of ALL_CONFIGS) {
    const configKeys = {
      header: [...getGroupKeys(config), ...(config.hidden ?? [])],
      lines: [
        ...config.lines.columns.map((column) => column.key),
        ...(config.lines.expandGroups ?? []).flatMap((group) => [...group.keys, ...(group.fullWidth ?? [])]),
      ],
    };
    for (const moduleId of config.modules) {
      for (const section of ['header', 'lines']) {
        const hidden = getHiddenNames(moduleId, section);
        for (const [source, keys] of Object.entries({ fixture: fixture[moduleId][section], config: configKeys[section] })) {
          for (const key of keys) {
            if (hidden.has(key.toLowerCase())) leaks.push(`${moduleId}.${section}.${source}: ${key}`);
          }
        }
      }
    }
  }
  assert.deepEqual(leaks, [], 'ErpVisibleProjection.HiddenNames removes these keys before FE receives the detail');
});
