import { documentStatusLabel } from "./document-status";
import { statusBadgeTone, type StatusTone } from "./status-colors";

/** A loaded document's ERP status: numeric identity plus the ERP status-table name. */
export interface ErpStatusRow {
  statusId: number | null;
  statusName?: string | null;
}

export interface ErpStatusChip {
  value: string;
  label: string;
  count: number;
}

/** Badge text and tone come from the ERP status table, never a web-side code mapping. */
export function erpStatusDisplay(row: ErpStatusRow): { label: string; tone: StatusTone } {
  const label = documentStatusLabel(row.statusId, row.statusName);
  return { label, tone: statusBadgeTone(label, "neutral") ?? "neutral" };
}

/** "Tất cả" plus one chip per ERP status present in the loaded rows, in ERP status order. */
export function erpStatusChips(rows: readonly ErpStatusRow[]): ErpStatusChip[] {
  const groups = new Map<number, ErpStatusChip>();
  for (const row of rows) {
    if (row.statusId == null) continue;
    const chip = groups.get(row.statusId);
    if (chip) chip.count++;
    else groups.set(row.statusId, { value: String(row.statusId), label: erpStatusDisplay(row).label, count: 1 });
  }
  return [{ value: "", label: "Tất cả", count: rows.length }, ...[...groups.entries()].sort(([a], [b]) => a - b).map(([, chip]) => chip)];
}

export function matchesErpStatus(row: ErpStatusRow, value: string): boolean {
  return value === "" || (row.statusId != null && String(row.statusId) === value);
}
