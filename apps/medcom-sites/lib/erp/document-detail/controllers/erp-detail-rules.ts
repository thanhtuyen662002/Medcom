import type { ErpScreenModule } from "@/lib/erp/erp-client";

export function formatVietnamDate(val: unknown): string {
  if (!val || typeof val !== "string") return "";
  const match = val.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return String(val);
  const [, y, m, d, hh, mm, ss] = match;
  if (hh && mm && !(hh === "00" && mm === "00" && (!ss || ss === "00")))
    return `${d}/${m}/${y} ${hh}:${mm}`;
  return `${d}/${m}/${y}`;
}

export function getActionErrorMessage(outcome: string, code?: string | null): string {
  switch (outcome) {
    case "InvalidInput":
      return "Thông tin chưa hợp lệ hoặc thiếu trường bắt buộc. Vui lòng kiểm tra lại.";
    case "Denied":
      return "Tài khoản hiện tại không có quyền thực hiện thao tác này.";
    case "Conflict":
      return "Trạng thái hoặc dữ liệu chứng từ đã thay đổi bởi người dùng khác. Vui lòng làm mới lại trang.";
    case "QualificationRequired":
      return "Hệ thống đang ở chế độ kiểm soát an toàn. Dữ liệu chưa được ghi trực tiếp vào cơ sở dữ liệu.";
    case "Unavailable":
      return "Máy chủ ERP hiện chưa sẵn sàng xử lý yêu cầu. Vui lòng thử lại sau.";
    case "Cancelled":
      return "Thao tác đã bị hủy.";
    default:
      if (code) return `Thao tác không thành công (${code}). Vui lòng thử lại.`;
      return "Thao tác không thành công. Vui lòng thử lại.";
  }
}

export function getActionReasonMessage(reason?: string | null): string {
  if (!reason) return "";
  switch (reason) {
    case "native_permission_or_hidden":
      return "Chức năng chưa được phân quyền hoặc bị ẩn theo quy tắc ERP.";
    case "save_document_first":
      return "Vui lòng lưu chứng từ trước khi thực hiện thao tác này.";
    case "contract_missing":
      return "Chứng từ chưa liên kết thông tin hợp đồng.";
    case "state_or_assignment_not_allowed":
      return "Trạng thái chứng từ hiện tại không cho phép thực hiện thao tác này.";
    case "erp_write_unqualified":
      return "Hệ thống đang ở chế độ bảo vệ dữ liệu, chưa ghi trực tiếp.";
    case "document_numbering_unqualified":
      return "Chức năng cấp số chứng từ tự động đang được bảo vệ.";
    case "contract_read_unqualified":
      return "Chức năng đọc thông tin hợp đồng đang được bảo vệ.";
    case "report_runtime_unqualified":
      return "Chức năng in báo cáo đang được bảo vệ.";
    default:
      return reason;
  }
}

// Header fields editable inline in the detail card. Lookup-backed keys render
// the shared options combobox; dates render date inputs; the rest are text.
// Rate follows the currency lookup and stays read-only.
const EDITABLE_HEADER_BY_MODULE: Record<string, readonly string[]> = {
  "purchase-requests": [
    "personSuggest",
    "department",
    "purposeId",
    "purposeDescOrClient",
    "price",
    "notes",
    "objectId",
    "currencyId",
  ],
  "sales-orders": [
    "documentDate",
    "contractId",
    "managerId",
    "employeeId",
    "objectId",
    "deliverDate",
    "memo",
    "ghiChuDonHang",
    "linkId",
    "documentUrl",
  ],
};
export const DEFAULT_EDITABLE_HEADER_KEYS = [
  "documentDate",
  "objectId",
  "deliverDate",
  "contractId",
  "memo",
  "notes",
] as const;
// Presentation only: preserve inherited draft inputs without claiming API fields.
export const LEGACY_EDIT_LABELS: Readonly<Partial<Record<string, string>>> = {
  documentDate: "Ngày chứng từ",
  objectId: "Khách hàng",
  deliverDate: "Ngày giao hàng",
  contractId: "Mã hợp đồng",
  memo: "Nội dung",
  notes: "Ghi chú",
};
export function editableHeaderKeys(module: ErpScreenModule): readonly string[] {
  return EDITABLE_HEADER_BY_MODULE[module] ?? DEFAULT_EDITABLE_HEADER_KEYS;
}
const REQUIRED_EDIT_KEYS: Record<string, readonly string[]> = {
  "purchase-requests": ["personSuggest", "department", "objectId", "currencyId"],
  "sales-orders": ["documentDate", "objectId", "employeeId"],
};
const DEFAULT_REQUIRED_EDIT_KEYS = ["documentDate", "objectId"] as const;
export function requiredEditKeys(module: ErpScreenModule): readonly string[] {
  return REQUIRED_EDIT_KEYS[module] ?? DEFAULT_REQUIRED_EDIT_KEYS;
}
const EDIT_LOOKUPS: Record<string, Record<string, string>> = {
  "purchase-requests": {
    personSuggest: "header.PersonSuggest",
    department: "header.Department",
    objectId: "header.ObjectID",
    purposeId: "header.PurposeID",
    currencyId: "header.CurrencyID",
  },
  "sales-orders": {
    contractId: "header.ContractID",
    managerId: "header.ManagerID",
    employeeId: "header.EmployeeID",
    objectId: "header.ObjectID",
  },
};
const DEFAULT_EDIT_LOOKUPS: Record<string, string> = { objectId: "header.ObjectID" };
export function editLookupId(module: ErpScreenModule, key: string): string | undefined {
  return (EDIT_LOOKUPS[module] ?? DEFAULT_EDIT_LOOKUPS)[key];
}
// Exact writable DTOs per module. The display header/rows carry *Display /
// *Name / status companions that the backend Freeze validator rejects
// (UnmappedMemberHandling.Disallow), so save must send only these keys.
const SAVE_LINE_BY_MODULE: Record<string, readonly string[]> = {
  "purchase-requests": ["itemId", "quantity", "unitPrice", "budget", "timeRequired", "model"],
  "purchase-orders": ["itemId", "quantity", "unitPrice", "notes", "quantity2", "property", "property2"],
  "sales-orders": ["itemId", "quantity", "unitPrice", "discountPercent", "vATPercent", "vATQuantity", "dienGiai", "notes", "property", "property2", "parentId", "notes2", "costId", "storeHouseId", "vATId"],
};
export function saveLineKeys(module: ErpScreenModule): readonly string[] {
  return SAVE_LINE_BY_MODULE[module] ?? [];
}
export const SAVE_HEADER_BY_MODULE: Record<string, readonly string[]> = {
  "purchase-requests": [
    "purchaseDate",
    "purposeId",
    "personSuggest",
    "department",
    "purposeDescOrClient",
    "price",
    "notes",
    "currencyId",
    "objectId",
    "rateExchange",
  ],
  "purchase-orders": [
    "documentDate",
    "objectId",
    "memo",
    "notes",
    "deliverDate",
    "currencyId",
    "rateExchange",
    "searchField",
    "contractId",
  ],
  "sales-orders": [
    "documentDate", "objectId", "contractId", "memo", "deliverDate", "baseTotal",
    "employeeId", "managerId", "phone", "taxCode", "notes", "depositAmount",
    "agencyId", "isVAT", "isOrder", "currencyId", "rateExchange", "linkId",
    "ghiChuDonHang", "paymentTermId", "ceoId", "thamGiaHopDongBan", "bBKCUrl",
    "beforeOutStockUrl", "bBBGUrl", "documentUrl", "handoverLocation",
    "representedByA", "positionA", "addressA", "representedByB", "positionB",
    "addressB", "conclude", "minutesNumber", "partyAKeep", "partyBKeep",
    "deliveryStatusId", "deliveryEmployeeId", "deliveryEmployeeSubId", "vehicle",
    "soPhieu", "soHoaDon", "ngayPhieu", "ngayHoaDon",
  ],
};

// Lock state for the header badge: true = locked, false = unlocked,
// null = field absent (hide the badge instead of printing true/false).
export function lockBadgeState(header: unknown): boolean | null {
  const v = (header as Record<string, unknown> | null | undefined)?.isLocked;
  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;
  return null;
}

// Detail dropdown entries, in display order. Rendered only when the backend
// marks them visible; enabled state and reason come from the same action.
export const MENU_ACTION_IDS = ["save", "submit", "send-purchase-order", "approve", "reject", "delete"] as const;

// Tạm thời: Đặt mua hàng chưa có trong Medcom:ErpWrites:Modules nên backend
// trả erp_write_unqualified (nút "Tạo mới" bị khóa kèm lý do "chưa ghi trực
// tiếp", và save/delete hiện disabled trong dropdown chi tiết). Thay vì hiển
// thị trạng thái bị chặn, ẨN toàn bộ action write của module này ở FE.
// Bỏ "purchase-orders" khỏi danh sách này khi operator bật ghi cho module.
export const WRITE_GATED_MODULES = new Set<ErpScreenModule>(["purchase-orders"]);
