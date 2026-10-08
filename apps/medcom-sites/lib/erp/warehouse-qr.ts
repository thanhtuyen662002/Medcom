/** Offline syntax projections, never command DTOs or evidence of ERP acceptance. */
export type WarehouseQrCandidate =
  | Readonly<{kind: 'ordinary'; itemId: string; itemCode: string; lot: string; unitQuantity: 1}>
  | Readonly<{kind: 'package'; packageId: string; needsLookup: true}>;
export type WarehouseQrParseResult = Readonly<{
  status: 'candidate' | 'invalid-syntax' | 'unqualified';
  reason: string | null;
  normalizedBarcode: string;
  candidate: WarehouseQrCandidate | null;
  runtimeEquivalence: 'UNKNOWN';
}>;
export type WarehouseQrProfileResult = Readonly<{
  profileId: typeof warehouseQrProfileId; supported: boolean; issues: readonly string[];
}>;
export const warehouseQrProfileId = 'ascii-canonical-no-truncation-v1' as const;
export function trimAsciiSpace(value: string | null | undefined): string {
  const text = value ?? '';
  let start = 0, end = text.length;
  while (start < end && text.charCodeAt(start) === 32) start++;
  while (end > start && text.charCodeAt(end - 1) === 32) end--;
  return text.slice(start, end);
}
export const normalizeWarehouseBarcode = (value: string | null | undefined): string =>
  trimAsciiSpace((value ?? '').replace(/[\r\n]/g, ''));

/** Ordinal ASCII delimiter/prefix projection. SQL code page, collation and runtime remain UNKNOWN. */
export function parseWarehouseQr(raw: string | null | undefined): WarehouseQrParseResult {
  const text = normalizeWarehouseBarcode(raw);
  const result = (status: WarehouseQrParseResult['status'], reason: string | null,
    candidate: WarehouseQrCandidate | null = null): WarehouseQrParseResult =>
    ({status, reason, normalizedBarcode: text, candidate, runtimeEquivalence: 'UNKNOWN'});
  if (!text.length) return result('invalid-syntax', 'empty-barcode');
  if (/^[Pp][Kk][Gg]1;/.test(text)) {
    if (text.length !== 41) return result('unqualified', 'package-length-outside-canonical-profile');
    const guid = text.slice(5);
    if (!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(guid))
      return result('unqualified', 'guid-outside-canonical-profile');
    return result('candidate', null, {kind: 'package', packageId: guid.toLowerCase(), needsLookup: true});
  }
  const fields = text.split(';');
  if (fields.length !== 3) return result('invalid-syntax', 'delimiter-count');
  const [itemId, itemCode, lot] = fields.map(trimAsciiSpace);
  if (!itemId.length) return result('invalid-syntax', 'empty-item-id');
  if (!lot.length) return result('invalid-syntax', 'empty-lot');
  return result('candidate', null, {kind: 'ordinary', itemId, itemCode, lot, unitQuantity: 1});
}

/** Proposed guardrail, narrower than legacy syntax. Supported never grants execution rights. */
export function validateWarehouseQrAsciiNoTruncation(raw: string | null | undefined): WarehouseQrProfileResult {
  const issues: string[] = [], input = raw ?? '', parsed = parseWarehouseQr(raw);
  if (/[^\x20-\x7e\r\n]/.test(input)) issues.push('barcode-outside-ascii');
  // Within ASCII, code units equal bytes; non-ASCII transport is already unsupported.
  if (input.length > 250) issues.push('raw-barcode-over-250');
  if (parsed.normalizedBarcode.length > 200) issues.push('normalized-barcode-over-200');
  if (parsed.candidate?.kind === 'ordinary') {
    if (parsed.candidate.itemId.length > 50) issues.push('item-id-over-50');
    if (parsed.candidate.itemCode.length > 50) issues.push('item-code-over-50');
    if (parsed.candidate.lot.length > 50) issues.push('lot-over-50');
  }
  if (parsed.status !== 'candidate') issues.push('syntax-outside-profile');
  return {profileId: warehouseQrProfileId, supported: !issues.length, issues};
}

/** CR/LF removal is barcode-specific; this helper establishes no document existence or authority. */
export function validateWarehouseDocumentAsciiNoTruncation(raw: string | null | undefined): Readonly<{
  normalizedDocumentId: string; profile: WarehouseQrProfileResult;
}> {
  const input = raw ?? '', normalizedDocumentId = trimAsciiSpace(input), issues: string[] = [];
  if (/[^\x20-\x7e]/.test(input)) issues.push('document-outside-ascii');
  if (input.length > 50) issues.push('raw-document-over-50');
  if (!normalizedDocumentId.length) issues.push('empty-document-id');
  return {normalizedDocumentId, profile: {profileId: warehouseQrProfileId, supported: !issues.length, issues}};
}
