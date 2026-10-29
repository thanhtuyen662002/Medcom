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

// Backend refusal codes a user can act on, so the form says what to fix instead of a generic error.
const INVALID_INPUT_MESSAGES: Record<string, string> = {
  transfer_branches_equal: "Chi nhánh nhận phải khác chi nhánh gửi.",
  reference_missing_or_ambiguous: "Có mục chọn không còn trong danh mục ERP. Hãy chọn lại từ danh sách.",
  unit_price_negative: "Đơn giá không được âm.",
  document_rate_invalid: "Tỷ giá phải lớn hơn 0; VND là 1.",
  calculated_value_out_of_range: "Số lượng hoặc đơn giá vượt giới hạn cho phép.",
  document_line_count: "Số dòng chi tiết vượt giới hạn cho phép.",
};

export function getActionErrorMessage(outcome: string, code?: string | null, message?: string | null): string {
  // ERP explained the refusal itself (e.g. "Cần nhập lý do không duyệt"): show it as ERP does.
  if (message?.trim() && (outcome === "Conflict" || outcome === "InvalidInput")) return message.trim();
  switch (outcome) {
    case "InvalidInput":
      return (code && INVALID_INPUT_MESSAGES[code]) || "Thông tin chưa hợp lệ hoặc thiếu trường bắt buộc. Vui lòng kiểm tra lại.";
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
    default:
      return reason;
  }
}

// Header fields editable inline in the detail card. Lookup-backed keys render
// the shared options combobox; dates render date inputs; the rest are text.
// Rate follows the currency lookup and stays read-only.
// Thủ kho (IV_IncomingShipmentStatusFrm): what the form leaves unlocked (T0 LCK) and lays out.
const INBOUND_WAREHOUSE_HEADER = ["totalPalletQuantityByReal","totalBarrelQuantityByReal","excessPackageQuantity","lackOfPackageQuantity","damagedPackageQuantity",
    "isDamageOutsidePackage","damageInsideStatusId","damageDescription","locationDamageDetectedId","locationDamageDescription","imageURL",
    "resultDesciption","totalQuantityInboundResult","goodAwaitingInboundResult","resultNote","datetimeRecorded","notes"] as const;
// Kỹ thuật (IV_GoodsStatusConfirmFrm) and PM (IV_GoodsQualityControlConfirmFrm): unlocked and laid out.
const INBOUND_TECH_HEADER = ["damagedPackageQuantity", "imageURL", "bBKCUrl", "notes"] as const;
const INBOUND_PM_HEADER = ["damagedPackageQuantity", "imageURL", "notes"] as const;
const EDITABLE_HEADER_BY_MODULE: Record<string, readonly string[]> = {
  // Writable header fields of the catalog; without an entry the sales-order defaults (Khách hàng required) applied.
  "machine-movements": ["documentDate", "nguoiGiao", "nguoiNhan", "memo", "notes", "contractId", "effectiveFrom", "effectiveTo", "referenceNo", "referenceDate", "documentLink"],
  "machine-repairs": ["documentDate", "nguoiGiao", "nguoiNhan", "memo", "notes", "objectId", "serviceLocation", "contractId", "startDate", "endDate", "technician", "serviceStatus", "referenceNo", "referenceDate", "documentLink"],
  "internal-transfer-requests": ["documentDate", "requestedTransferDate", "transferReason", "transportMethod", "notes"],
  "inbound-warehouse": INBOUND_WAREHOUSE_HEADER,
  "inbound-tech": INBOUND_TECH_HEADER,
  "inbound-pm": INBOUND_PM_HEADER,
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
  "machine-movements": ["documentDate"],
  "machine-repairs": ["documentDate"],
  "internal-transfer-requests": ["documentDate"],
  "inbound-warehouse": [],
  "inbound-tech": [],
  "inbound-pm": [],
  "purchase-requests": ["personSuggest", "department", "objectId", "currencyId"],
  "sales-orders": ["documentDate", "objectId", "employeeId"],
};
const DEFAULT_REQUIRED_EDIT_KEYS = ["documentDate", "objectId"] as const;
export function requiredEditKeys(module: ErpScreenModule): readonly string[] {
  return REQUIRED_EDIT_KEYS[module] ?? DEFAULT_REQUIRED_EDIT_KEYS;
}
const EDIT_LOOKUPS: Record<string, Record<string, string>> = {
  "inbound-tech": {},
  "inbound-pm": {},
  "inbound-warehouse": {
    damageInsideStatusId: "header.DamageInsideStatusID",
    locationDamageDetectedId: "header.LocationDamageDetectedID",
  },
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
  // Thủ kho records what actually arrived (T1CS "Trên thực tế", "Kiểm tra xác suất").
  "inbound-warehouse": ["lotNumberByReal", "setQuantityByReal", "barrelQuantityByReal", "expireDateByReal",
    "randomTestQuantity", "testStatus", "noPalletNote", "palletNote", "checkerNote", "additional"],
  "purchase-requests": ["itemId", "quantity", "unitPrice", "budget", "timeRequired", "model"],
  "purchase-orders": ["itemId", "quantity", "unitPrice", "notes", "quantity2", "property", "property2"],
  "sales-orders": ["itemId", "quantity", "unitPrice", "discountPercent", "vATPercent", "vATQuantity", "dienGiai", "notes", "property", "property2", "parentId", "notes2", "costId", "storeHouseId", "vATId"],
};
export function saveLineKeys(module: ErpScreenModule): readonly string[] {
  return SAVE_LINE_BY_MODULE[module] ?? [];
}
/** Bit columns edited as Có/Không and sent as JSON booleans. */
export const BOOLEAN_EDIT_KEYS: ReadonlySet<string> = new Set(["isDamageOutsidePackage", "additional"]);
/** Draft text → API value: booleans as true/false, dates as ERP datetime, blanks as null. */
/** Workflow buttons that open the choice/notes dialog (ERP ExecSQLWithPara prompts). */
export const DIALOG_ACTION_MODULES: ReadonlySet<string> = new Set(["inbound-requests", "inbound-sa", "inbound-tech", "inbound-pm", "inbound-bld", "inbound-costs",
  "internal-transfer-requests", "internal-transfer-pm", "internal-transfer-batches", "internal-transfer-tech", "internal-transfer-sa", "internal-transfer-accounting", "internal-transfer-warehouse-out", "internal-transfer-warehouse-in"]);
export function editValue(key: string, raw: string): unknown {
  const v = raw.trim();
  if (!v) return null;
  if (BOOLEAN_EDIT_KEYS.has(key)) return v === "true";
  if (key.toLowerCase().includes("date")) return /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000` : v;
  return v;
}
export const SAVE_HEADER_BY_MODULE: Record<string, readonly string[]> = {
  // The type is chosen at creation and kept on save; read-only detail fields are never sent.
  "machine-movements": ["documentDate", "nguoiGiao", "nguoiNhan", "memo", "notes", "contractId", "effectiveFrom", "effectiveTo", "referenceNo", "referenceDate", "documentLink", "moveTypeId"],
  "machine-repairs": ["documentDate", "nguoiGiao", "nguoiNhan", "memo", "notes", "objectId", "serviceLocation", "contractId", "startDate", "endDate", "technician", "serviceStatus", "referenceNo", "referenceDate", "documentLink", "serviceTypeId"],
  "internal-transfer-requests": ["fromBranchId", "toBranchId", "documentDate", "requestedTransferDate", "transferReason", "transportMethod", "notes"],
  "inbound-warehouse": INBOUND_WAREHOUSE_HEADER,
  "inbound-tech": INBOUND_TECH_HEADER,
  "inbound-pm": INBOUND_PM_HEADER,
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
