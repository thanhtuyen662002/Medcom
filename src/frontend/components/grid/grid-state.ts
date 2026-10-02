export type CellPosition = { row: number; column: number };

/** Navigation stays within the fetched page; it never implies a server sort or write. */
export function navigateCell(current: CellPosition, key: string, rows: number, columns: number,
  control = false, pageStep = 10): CellPosition | null {
  if (rows < 1 || columns < 1) return null;
  const row = Math.max(0, Math.min(rows - 1, current.row));
  const column = Math.max(0, Math.min(columns - 1, current.column));
  switch (key) {
    case "ArrowDown": return { row: Math.min(rows - 1, row + 1), column };
    case "ArrowUp": return { row: Math.max(0, row - 1), column };
    case "ArrowRight": return { row, column: Math.min(columns - 1, column + 1) };
    case "ArrowLeft": return { row, column: Math.max(0, column - 1) };
    case "Home": return { row: control ? 0 : row, column: 0 };
    case "End": return { row: control ? rows - 1 : row, column: columns - 1 };
    case "PageDown": return { row: Math.min(rows - 1, row + Math.max(1, pageStep)), column };
    case "PageUp": return { row: Math.max(0, row - Math.max(1, pageStep)), column };
    default: return null;
  }
}

export type ColumnSetting = { id: string; hidden: boolean; width: number };
export function moveColumn(settings: ColumnSetting[], id: string, direction: -1 | 1): ColumnSetting[] {
  const index = settings.findIndex(column => column.id === id);
  const target = index + direction;
  // The identity column remains first and visible.
  if (index <= 0 || target <= 0 || target >= settings.length) return settings;
  const next = [...settings];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function setColumnWidth(settings: ColumnSetting[], id: string, width: number): ColumnSetting[] {
  if (!Number.isFinite(width)) return settings;
  return settings.map(column => column.id === id ? { ...column, width: Math.max(100, Math.min(480, Math.round(width))) } : column);
}
export function setColumnHidden(settings: ColumnSetting[], id: string, hidden: boolean): ColumnSetting[] {
  return settings.map((column, index) => column.id === id && index !== 0 ? { ...column, hidden } : column);
}

/** A changed authority/scope unmounts all selections, drafts and local view settings synchronously. */
export function documentScopeKey(kind: string, session: { tenantId: string; companyId: string;
  authorityVersion: number; capabilities: string[] }, branches: string[]): string {
  return JSON.stringify([kind, session.tenantId, session.companyId, session.authorityVersion,
    [...session.capabilities].sort(), [...branches].sort()]);
}
