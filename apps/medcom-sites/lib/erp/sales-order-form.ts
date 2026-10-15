// Pure helpers for the sales-orders (Quản lý đơn hàng) form. No JSX/React:
// safe to unit-test through scripts/test-erp.mjs like the other lib modules.

// Đúng bộ key của ErpSalesOrderHeaderInput (backend Disallow unknown).
export const SALES_ORDER_SAVE_KEYS = [
  "documentDate", "objectId", "contractId", "memo", "deliverDate", "baseTotal",
  "employeeId", "managerId", "phone", "taxCode", "notes", "depositAmount",
  "agencyId", "isVAT", "isOrder", "currencyId", "rateExchange", "linkId",
  "ghiChuDonHang", "paymentTermId", "ceoId", "thamGiaHopDongBan", "bBKCUrl",
  "beforeOutStockUrl", "bBBGUrl", "documentUrl", "handoverLocation",
  "representedByA", "positionA", "addressA", "representedByB", "positionB",
  "addressB", "conclude", "minutesNumber", "partyAKeep", "partyBKeep",
  "deliveryStatusId", "deliveryEmployeeId", "deliveryEmployeeSubId", "vehicle",
  "soPhieu", "soHoaDon", "ngayPhieu", "ngayHoaDon",
] as const;

const DATE_KEYS = new Set(["documentDate", "deliverDate", "ngayPhieu", "ngayHoaDon"]);
const BOOL_KEYS = new Set(["isOrder", "isVAT", "thamGiaHopDongBan"]);
const INT_KEYS = new Set(["minutesNumber", "partyAKeep", "partyBKeep", "deliveryStatusId"]);

export interface SalesOrderEdit {
  documentDate: string;
  contractId: string;
  managerId: string;
  employeeId: string;
  objectId: string;
  deliverDate: string;
  memo: string;
  ghiChuDonHang: string;
  linkId: string;
  documentUrl: string;
}

export function toSaveDate(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return t.length === 10 ? `${t}T00:00:00.000` : t;
}

export function normBaseDate(v: unknown): unknown {
  if (typeof v !== "string" || !v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00:00.000`;
  if (/T\d{2}:\d{2}:\d{2}$/.test(v)) return `${v}.000`;
  return v;
}

// Dựng đúng DTO save: đủ key, đúng kiểu, không key lạ (companions như
// statusName/objectName/isLocked/documentId/branchId bị loại).
export function buildSalesOrderSaveHeader(
  base: Record<string, unknown>,
  edited: SalesOrderEdit,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const e: Record<string, unknown> = {
    documentDate: toSaveDate(edited.documentDate),
    contractId: edited.contractId.trim() || null,
    managerId: edited.managerId.trim() || null,
    employeeId: edited.employeeId.trim() || null,
    objectId: edited.objectId.trim() || null,
    deliverDate: toSaveDate(edited.deliverDate),
    memo: edited.memo.trim() || null,
    ghiChuDonHang: edited.ghiChuDonHang.trim() || null,
    linkId: edited.linkId.trim() || null,
    documentUrl: edited.documentUrl.trim() || null,
  };
  for (const k of SALES_ORDER_SAVE_KEYS) {
    if (k in e) { out[k] = e[k]; continue; }
    const raw = base[k];
    if (DATE_KEYS.has(k)) out[k] = normBaseDate(raw);
    else if (k === "rateExchange") {
      const n = typeof raw === "number" ? raw : Number(String(raw ?? ""));
      out[k] = Number.isFinite(n) && n > 0 ? n : 1;
    } else if (BOOL_KEYS.has(k)) {
      out[k] = raw === true || raw === 1 || raw === "1" ? true : raw === false || raw === 0 || raw === "0" ? false : k === "isOrder" ? true : null;
    } else if (INT_KEYS.has(k)) {
      if (raw == null || raw === "") out[k] = null;
      else { const n = Number(raw); out[k] = Number.isInteger(n) ? n : null; }
    } else if (raw == null) out[k] = null;
    else out[k] = raw;
  }
  if (typeof out.currencyId !== "string" || !out.currencyId) out.currencyId = "VND";
  return out;
}
