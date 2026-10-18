import type { ErpLineRow } from "./erp-screen-contracts";
import { emptySalesOrderLine, salesOrderLineInput, type SalesOrderDraftLine } from "./sales-order-lines";

export type EditableSalesLine = SalesOrderDraftLine & { savedLineId?: string };
const value = (fields: Record<string, unknown>, key: string) => String(fields[key] ?? fields[key[0].toUpperCase() + key.slice(1)] ?? "");

export function editableSalesLines(rows: ErpLineRow[]): EditableSalesLine[] {
  return rows.map(row => {
    const fields = row.fields;
    const itemId = value(fields, "itemId");
    return { ...emptySalesOrderLine(row.lineId), savedLineId: row.lineId, itemId,
      choice: { id: itemId, name: value(fields, "itemName") || itemId, label: value(fields, "itemName") || itemId, fields },
      quantity: value(fields, "quantity"), unitPrice: value(fields, "unitPrice"), discountPercent: value(fields, "discountPercent"),
      vATPercent: value(fields, "vATPercent"), vATQuantity: value(fields, "vATQuantity"), dienGiai: value(fields, "dienGiai"), notes: value(fields, "notes") };
  });
}

export function salesLineChanges(original: ErpLineRow[], edited: EditableSalesLine[]) {
  const base = new Map(editableSalesLines(original).map(line => [line.savedLineId!, line]));
  const seen = new Set<string>();
  const changes: Array<{ kind: "Add" | "Update" | "Remove"; lineId?: string; clientLineKey?: string; values?: Record<string, string | null> }> = [];
  for (const line of edited) {
    const values = salesOrderLineInput(line);
    if (line.savedLineId) {
      if (seen.has(line.savedLineId) || !base.has(line.savedLineId)) throw new Error("invalid_line_identity");
      seen.add(line.savedLineId);
      if (JSON.stringify(values) !== JSON.stringify(salesOrderLineInput(base.get(line.savedLineId)!))) changes.push({ kind: "Update", lineId: line.savedLineId, values });
    } else changes.push({ kind: "Add", clientLineKey: line.key, values });
  }
  for (const lineId of base.keys()) if (!seen.has(lineId)) changes.push({ kind: "Remove", lineId });
  return changes;
}
