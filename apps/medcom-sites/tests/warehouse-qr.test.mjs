import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseWarehouseQr, normalizeWarehouseBarcode, trimAsciiSpace,
  validateWarehouseQrAsciiNoTruncation, validateWarehouseDocumentAsciiNoTruncation,
  warehouseQrProfileId} from '../lib/erp/warehouse-qr.ts';

// Node 24 executes the actual erasable TypeScript directly; no dependencies or runner registration.
const evidence = JSON.parse(await readFile(new URL('../../../docs/erp/WAREHOUSE_QR_WORKFLOW_EVIDENCE.json', import.meta.url), 'utf8'));
const fixtures = evidence.implementation;
const text = units => units === null ? null : units.map(n => String.fromCharCode(n)).join('');
const units = s => Array.from({length: s.length}, (_, i) => s.charCodeAt(i));
function project(parsed) {
  const c = parsed.candidate;
  return {status: parsed.status, reason: parsed.reason, normalizedUtf16Units: units(parsed.normalizedBarcode),
    candidate: c === null ? null : c.kind === 'ordinary' ? {kind: c.kind,
      itemIdUtf16Units: units(c.itemId), itemCodeUtf16Units: units(c.itemCode), lotUtf16Units: units(c.lot), unitQuantity: c.unitQuantity}
      : {kind: c.kind, packageId: c.packageId, needsLookup: c.needsLookup}, runtimeEquivalence: parsed.runtimeEquivalence};
}
for (const fixture of fixtures.parityFixtures) test(`shared parser/profile parity fixture: ${fixture.id}`, () => {
  const raw = text(fixture.inputUtf16Units);
  assert.deepEqual(project(parseWarehouseQr(raw)), fixture.expected);
  assert.deepEqual(validateWarehouseQrAsciiNoTruncation(raw), {
    profileId: warehouseQrProfileId, supported: fixture.profileIssues.length === 0, issues: fixture.profileIssues});
});
for (const fixture of fixtures.documentFixtures) test(`shared document parity fixture: ${fixture.id}`, () => {
  const actual = validateWarehouseDocumentAsciiNoTruncation(text(fixture.inputUtf16Units));
  assert.deepEqual(units(actual.normalizedDocumentId), fixture.normalizedUtf16Units);
  assert.deepEqual(actual.profile, {profileId: warehouseQrProfileId,
    supported: fixture.profileIssues.length === 0, issues: fixture.profileIssues});
});
test('normalization preserves tabs/NBSP and undefined is empty, never a general trim', () => {
  assert.equal(trimAsciiSpace(' \t\u00a0 '), '\t\u00a0');
  assert.equal(normalizeWarehouseBarcode(undefined), '');
  assert.equal(parseWarehouseQr(undefined).status, 'invalid-syntax');
});
test('guardrail is narrower than syntax projection; preserves over-width and unsupported text', () => {
  for (const raw of ['\t;;L', '\u00a0;;L', 'A'.repeat(51) + ';;L']) {
    assert.equal(parseWarehouseQr(raw).status, 'candidate');
    assert.equal(validateWarehouseQrAsciiNoTruncation(raw).supported, false);
    assert.equal(parseWarehouseQr(raw).normalizedBarcode, raw);
  }
});
test('candidate carries no authorization, package content or durable success and never chooses a target', () => {
  const packageCandidate = parseWarehouseQr('PKG1;00000000-0000-0000-0000-000000000000');
  assert.deepEqual(Object.keys(packageCandidate.candidate).sort(), ['kind', 'needsLookup', 'packageId']);
  assert.deepEqual(Object.keys(packageCandidate).sort(), ['candidate', 'normalizedBarcode', 'reason', 'runtimeEquivalence', 'status']);
  const ordinary = parseWarehouseQr('IV_OUTPUT;DELETE;L');
  assert.deepEqual(Object.keys(ordinary.candidate).sort(), ['itemCode', 'itemId', 'kind', 'lot', 'unitQuantity']);
  assert.equal(ordinary.candidate.itemId, 'IV_OUTPUT');
  for (const key of ['authorized', 'durableSuccess', 'baseQuantity', 'active', 'target', 'procedure', 'operationKey', 'receipt']) {
    assert.equal(key in packageCandidate, false);
    assert.equal(key in packageCandidate.candidate, false);
    assert.equal(key in ordinary.candidate, false);
  }
  assert.deepEqual(parseWarehouseQr('A;;L'), parseWarehouseQr('A;;L'));
});
