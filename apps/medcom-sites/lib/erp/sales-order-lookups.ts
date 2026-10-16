import type { ErpChoice, ErpChoicePage } from "./erp-screen-contracts";

// ERP option dictionaries retain SQL column names; display projections can use camel case.
export function salesOrderField(choice: ErpChoice | null | undefined, column: string): string {
  const canonical = column[0].toLowerCase() + column.slice(1).replace(/ID$/, "Id");
  const value = choice?.fields?.[column] ?? choice?.fields?.[canonical];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export type SalesOrderOptionsQuery = {
  branchId: string; lookupId: string; page: number; pageSize: number;
  search: string | null; context: Record<string, string | null>;
};

// Resolve the exact linked customer, never the first search hit. No private rows are cached.
export async function resolveSalesOrderCustomer(
  branchId: string, contractId: string, objectId: string,
  load: (query: SalesOrderOptionsQuery) => Promise<ErpChoicePage>,
  isCurrent: () => boolean,
): Promise<ErpChoice | null> {
  let match: ErpChoice | null = null;
  for (let page = 1; page <= 1000 && isCurrent(); page++) {
    const result = await load({ branchId, lookupId: "header.ObjectID", page, pageSize: 100,
      search: objectId, context: { ContractID: contractId } });
    if (!isCurrent()) return null;
    for (const item of result.items) {
      if (item.id !== objectId) continue;
      if (match) throw new Error("Ambiguous customer lookup");
      match = item;
    }
    if (!result.hasMore) return match;
  }
  if (isCurrent()) throw new Error("Customer lookup page limit");
  return null;
}
