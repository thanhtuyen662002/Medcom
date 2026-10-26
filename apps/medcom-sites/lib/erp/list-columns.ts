import type { ErpScreenModule } from "./proxy-policy";
import type { ErpDocumentRow } from "./erp-screen-contracts";

export interface ErpListColumn {
  id: string;
  label: string;
  keys: readonly string[];
  kind?: "document" | "date" | "status";
}

// Evidence: docs/backend/medcom-openapi.json, the 19
// Erp_*_document_rowFeDisplayCanonicalV3_* schemas. These are list fields,
// normalized into row.header by erpDocumentRowSchema, not detail-only lookups.
const document: ErpListColumn = { id: "document", label: "Mã chứng từ", keys: [], kind: "document" };
const date: ErpListColumn = { id: "date", label: "Ngày chứng từ", keys: ["documentDateDisplay", "documentDate"], kind: "date" };
const status: ErpListColumn = { id: "status", label: "Trạng thái", keys: [], kind: "status" };
// "<account>Name" is SY_User.HoTen for a stored login account; the account itself is the fallback.
const creator: ErpListColumn = { id: "creator", label: "Người lập / Đề nghị", keys: ["userCreateName", "userCreate"] };
const notes: ErpListColumn = { id: "notes", label: "Nội dung", keys: ["memo", "notes"] };
const purchase: readonly ErpListColumn[] = [
  document, { ...date, keys: ["purchaseDateDisplay", "purchaseDate"] },
  { id: "object", label: "Đối tượng / Mục đích", keys: ["objectName", "purposeDescOrClient"] }, status,
  { ...creator, keys: ["personSuggest"] }, { ...notes, keys: ["notes"] },
];
const sales: readonly ErpListColumn[] = [
  document, date, { id: "object", label: "Khách hàng", keys: ["objectName"] }, status, creator, notes,
];
const transferRequest: readonly ErpListColumn[] = [
  document, date,
  { id: "from", label: "Chi nhánh gửi", keys: ["fromBranchName", "fromBranchId"] },
  { id: "object", label: "Chi nhánh nhận", keys: ["toBranchName", "toBranchId"] }, status,
  { ...creator, keys: ["salesUserName", "salesUser", "userCreateName", "userCreate"] },
  { ...notes, keys: ["transferReason", "notes"] },
];
const transferBatch: readonly ErpListColumn[] = [
  document, { ...date, label: "Ngày đợt", keys: ["batchDateDisplay", "batchDate"] },
  { id: "from", label: "Chi nhánh gửi", keys: ["fromBranchName", "fromBranchId"] },
  { id: "object", label: "Chi nhánh nhận", keys: ["toBranchName", "toBranchId"] }, status, creator,
  { ...notes, keys: ["notes"] },
];

const inboundStep: readonly ErpListColumn[] = [document, date, { id: "object", label: "Nhà cung cấp", keys: ["objectName"] },
  { id: "order", label: "Đơn đặt hàng", keys: ["orderNumber"] }, status, { ...notes, keys: ["notes"] }];

// Explicit exhaustive mapping: column presence is stable even on an empty page.
export const ERP_LIST_COLUMNS: Record<ErpScreenModule, readonly ErpListColumn[]> = {
  "purchase-requests": purchase,
  "purchase-approvals": purchase,
  "purchase-orders": [document, date, { id: "object", label: "Nhà cung cấp", keys: ["objectName"] }, status, creator, notes],
  "inbound-requests": [document, date, { id: "object", label: "Đối tượng / Mục đích", keys: ["objectName"] },
    { id: "order", label: "Đơn đặt hàng", keys: ["orderNumber"] }, status, { ...notes, keys: ["notes"] }],
  "inbound-warehouse": inboundStep,
  "inbound-sa": inboundStep,
  "inbound-tech": inboundStep,
  "inbound-pm": inboundStep,
  "sales-orders": sales,
  "sales-order-pm": sales,
  "sales-order-sa": sales,
  "sales-qr": sales,
  "warehouse-qr": [document, date, { id: "object", label: "Đối tượng nhận hàng", keys: ["objectName"] }, status, creator, notes],
  "machine-movements": [document, date, { id: "object", label: "Người nhận", keys: ["nguoiNhan"] },
    { id: "sender", label: "Người giao", keys: ["nguoiGiao"] }, status, creator, notes],
  "machine-repairs": [document, date, { id: "object", label: "Khách hàng", keys: ["objectName"] },
    { id: "service", label: "Loại dịch vụ", keys: ["serviceTypeName"] }, status, creator, notes],
  "internal-transfer-requests": transferRequest,
  "internal-transfer-pm": transferRequest.map(column => column.id === "creator" ? { ...column, keys: ["salesName", "salesUserName", "salesUser", "userCreateName", "userCreate"] } : column),
  "internal-transfer-batches": transferBatch,
  "internal-transfer-tech": transferBatch,
  "internal-transfer-sa": transferBatch,
  "internal-transfer-accounting": transferBatch,
  "internal-transfer-warehouse-out": transferBatch,
  "internal-transfer-warehouse-in": transferBatch,
};

export function erpListText(row: ErpDocumentRow, ...keys: readonly string[]): string {
  for (const key of keys) {
    const value = row.header?.[key];
    if ((typeof value === "string" && value.trim()) || typeof value === "number") return String(value);
  }
  return "";
}
