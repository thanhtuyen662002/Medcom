import type { ErpScreenModule } from "./proxy-policy";

/** Per-status read size for a role queue; a queue longer than this is cut off. */
export const ROLE_QUEUE_PAGE_SIZE = 100;

/**
 * ERP statuses that wait on the role a screen serves ("Chờ tôi xử lý").
 * "Yêu cầu X xem lại" / "X trả lại" are X's turn. Agreed with the owner 2026-10-24.
 * Sources: IV_InternalTransferRequestStatusTbl, IV_InternalTransferBatchStatusTbl, AR_OrderStatusTbl.
 */
export const ROLE_QUEUE_STATUSES: Partial<Record<ErpScreenModule, readonly number[]>> = {
  "internal-transfer-requests": [0, 30], // Nháp, PM yêu cầu NVKD chỉnh sửa
  "internal-transfer-pm": [10], // Đã gửi PM
  "internal-transfer-batches": [0, 10, 25, 45], // Đang lập đợt, Yêu cầu PM xem lại, Kỹ thuật / TP SA trả lại PM
  "internal-transfer-tech": [20, 21], // Chờ kỹ thuật xác nhận, Yêu cầu Kỹ thuật xem lại
  "internal-transfer-sa": [40, 41], // Chờ TP SA phê duyệt, Yêu cầu TP SA xem lại
  "internal-transfer-accounting": [60, 61], // Chờ kế toán ra PXK, Yêu cầu Kế toán xem lại
  "internal-transfer-warehouse-out": [70], // Đã liên kết PXK
  "internal-transfer-warehouse-in": [100], // Đang điều chuyển
  "sales-orders": [-2, -1, 11], // TDV Kiểm tra lại, Đơn nháp, Yêu cầu NVKD xem lại
  "sales-order-pm": [12, 13], // Đã gửi PM, Yêu cầu PM xem lại
  "sales-order-sa": [14, 15], // Đã gửi SA, Yêu cầu SA xem lại
};

export function roleQueueStatuses(module: ErpScreenModule): readonly number[] | null {
  return ROLE_QUEUE_STATUSES[module] ?? null;
}

interface QueueRow { documentId?: string; header?: Record<string, unknown> }

function documentDate(row: QueueRow): string {
  const value = row.header?.documentDate ?? (row as Record<string, unknown>).documentDate;
  return typeof value === "string" ? value : "";
}

/** One list of the per-status pages: unique documents, newest first, as the ERP list orders them. */
export function mergeRoleQueuePages<T extends QueueRow>(pages: readonly { rows: readonly T[]; hasMore: boolean }[]): { rows: T[]; truncated: boolean } {
  const seen = new Map<string, T>();
  for (const page of pages) for (const row of page.rows) if (row.documentId && !seen.has(row.documentId)) seen.set(row.documentId, row);
  const rows = [...seen.values()].sort((a, b) => documentDate(b).localeCompare(documentDate(a)) || (b.documentId ?? "").localeCompare(a.documentId ?? ""));
  return { rows, truncated: pages.some(page => page.hasMore) };
}
