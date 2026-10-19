"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Send,
  QrCode,
  FileText,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Building,
  User,
  Info,
  Camera,
  X,
  Package,
  MoreVertical,
  Pencil,
  Lock,
  LockOpen,
  Loader2,
} from "lucide-react";
import {
  erpClient,
  type ErpScreenModule,
  type ErpScreenDescription,
  type ErpDocumentRow,
  type ErpDocumentDetail,
  type ErpActionState,
  type ErpChoice,
  type ErpCommandResult,
  type ErpContractInfo,
} from "@/lib/erp/erp-client";
import { UntitledBottomSheet } from "./bottom-sheet";
import { UntitledButton } from "./button";
import { LookupField, fieldText, choiceLabel } from "./lookup-field";
import { DocumentCardSkeleton } from "./skeleton";
import { DocumentListTable, type DocumentListColumn } from "./document-list-table";
import { DocumentListPagination } from "./document-list-pagination";
import { SalesOrderForm } from "@/components/erp/sales-order-form";
import { PurchaseOrderCreateSheet } from "./purchase-order-create-sheet";
import { PurchaseRequestCreateSheet } from "./purchase-request-create-sheet";
import { QrCamera } from "@/lib/erp/qr-camera";
import { resolveSalesOrderCustomer, salesOrderField } from "@/lib/erp/sales-order-lookups";
import { SalesOrderLineEditor } from "@/components/erp/sales-order-line-editor";
import { emptySalesOrderLine, isSalesOrderLineValid, salesOrderLineDisplay, salesOrderLineInput, type SalesOrderDraftLine } from "@/lib/erp/sales-order-lines";
import { useSalesOrderAttachments } from "@/components/erp/use-sales-order-attachments";
import { SalesOrderAttachmentPicker } from "@/components/erp/sales-order-attachment-picker";
import { ErpDetailSheet } from "@/components/erp/erp-detail-sheet";
import type { ErpDocumentPage } from "@/lib/erp/erp-screen-contracts";
import { SalesCommandSession, type SalesOrderModule } from "@/lib/erp/sales-order-workflow";
import { SalesOrderStatusFilter } from "@/components/erp/sales-order-status-filter";
import { documentStatusLabel } from "@/lib/erp/document-status";
import { statusColorsFrom } from "@/lib/erp/status-colors";
import {MoneyInput} from "@/components/erp/money-input";
import {formatMoney as formatMoneyValue, isMoneyField, multiplyMoney, sumMoney} from "@/lib/erp/money";

interface TabErpScreenProps {
  module: ErpScreenModule;
  currentBranch: string;
  isActive: boolean;
  targetDocumentId?: string;
  onOpenScanner?: () => void;
}

function getModuleTitle(mod: ErpScreenModule): string {
  switch (mod) {
    case "purchase-requests":
      return "Đề nghị mua hàng";
    case "sales-orders":
      return "Quản lý đơn hàng";
    case "internal-transfer-requests":
      return "Đề nghị điều chuyển nội bộ";
    case "warehouse-qr":
      return "Quét QR xuất kho";
    case "sales-qr":
      return "Quét QR xuất bán hàng";
    case "machine-movements":
      return "Phiếu di chuyển / bàn giao máy";
    case "machine-repairs":
      return "Phiếu sửa chữa / bảo hành / bảo trì máy";
    case "purchase-orders":
      return "Đề nghị mua hàng (PO)";
    case "inbound-requests":
      return "Đề nghị nhập kho";
    case "purchase-approvals":
      return "Duyệt đề nghị mua hàng";
    case "sales-order-pm":
      return "PM xử lý đơn hàng";
    case "sales-order-sa":
      return "SA xử lý đơn hàng";
    case "internal-transfer-pm":
      return "PM duyệt điều chuyển";
    case "internal-transfer-batches":
      return "Đợt điều chuyển";
    case "internal-transfer-tech":
      return "Kỹ thuật điều chuyển";
    case "internal-transfer-sa":
      return "SA duyệt điều chuyển";
    case "internal-transfer-accounting":
      return "Kế toán điều chuyển";
    case "internal-transfer-warehouse-out":
      return "Kho nguồn điều chuyển";
    case "internal-transfer-warehouse-in":
      return "Kho đích điều chuyển";
    default:
      return mod;
  }
}

function isTechnicalField(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k.includes("userautoid") ||
    k.includes("formid") ||
    k.includes("frm") ||
    k.includes("menuid") ||
    k.includes("createdbyautoid") ||
    k.includes("modifiedbyautoid") ||
    k.includes("statetoken") ||
    k.includes("readscope") ||
    k.includes("referencestate") ||
    k.includes("schema") ||
    k.includes("fields") ||
    k.includes("searchfield") ||
    k.includes("idempotencykey") ||
    k.includes("auditid") ||
    k.includes("clientlinekey") ||
    k.includes("token") ||
    k.includes("hash") ||
    k.includes("rowid")
  );
}

const FIELD_LABELS: Record<string, string> = {
  documentId: "Mã chứng từ",
  purchaseRequestId: "Mã đề nghị mua hàng",
  batchId: "Mã đợt điều chuyển",
  branchId: "Chi nhánh",
  branchName: "Tên chi nhánh",
  documentDate: "Ngày chứng từ",
  purchaseDate: "Ngày đề xuất",
  datetimeRecorded: "Thời gian ghi nhận",
  plannedTransferDate: "Ngày chuyển dự kiến",
  batchDate: "Ngày tạo đợt",
  deliverDate: "Ngày giao hàng",
  expireDate: "Hạn sử dụng",
  expireDateByDocument: "Hạn sử dụng theo CT",
  statusId: "Trạng thái",
  statusName: "Tên trạng thái",
  isLocked: "Khóa phiếu",
  objectId: "Khách hàng",
  objectName: "Tên đối tượng",
  personSuggest: "Người đề nghị",
  customerName: "Khách hàng",
  vendorName: "Nhà cung cấp",
  department: "Bộ phận",
  purposeId: "Mục đích",
  purposeName: "Tên mục đích",
  purposeDescOrClient: "Mục đích / Khách hàng",
  price: "Giá bán",
  model: "Model",
  budget: "Ngân sách",
  budgetDisplay: "Ngân sách",
  timeRequired: "Thời gian yêu cầu",
  totalPrice: "Tổng giá",
  totalPriceDisplay: "Tổng giá",
  memo: "Nội dung",
  notes: "Ghi chú",
  orderNumber: "Số đơn hàng",
  invoiceNo: "Số hóa đơn",
  declarationNumber: "Số tờ khai",
  departurePoint: "Điểm đi",
  destinationPoint: "Điểm đến",
  fromBranchId: "Chi nhánh gửi",
  fromBranchName: "Tên chi nhánh gửi",
  toBranchId: "Chi nhánh nhận",
  toBranchName: "Tên chi nhánh nhận",
  fromStoreHouseId: "Kho nguồn",
  fromStoreHouseName: "Tên kho nguồn",
  toStoreHouseId: "Kho đích",
  toStoreHouseName: "Tên kho đích",
  assignedPM: "PM phụ trách",
  assignedSA: "SA phụ trách",
  assignedTechnician: "Kỹ thuật phụ trách",
  transportMethod: "Phương thức vận chuyển",
  carrierName: "Đơn vị vận chuyển",
  carrierPhone: "SĐT vận chuyển",
  vehicleNo: "Biển số xe",
  outputDocumentId: "Phiếu xuất kho liên kết",
  inputDocumentId: "Phiếu nhập kho liên kết",
  contractId: "Mã hợp đồng",
  currencyId: "Loại tiền",
  currencyName: "Tên loại tiền",
  rateExchange: "Tỷ giá",
  totalAmount: "Tổng tiền",
  totalQuantity: "Tổng số lượng",
  packageTypeId: "Loại bao bì",
  pMApprovedQty: "Số lượng PM duyệt",
  pMNote: "Ghi chú PM",
  techStatus: "Tình trạng kỹ thuật",
  techNotes: "Ghi chú kỹ thuật",
  approvedQty: "Số lượng duyệt",
  actualIssueQty: "Số lượng xuất thực tế",
  actualReceiveQty: "Số lượng nhận thực tế",
  accountingNote: "Ghi chú kế toán",
  warehouseNote: "Ghi chú thủ kho",
  receiveNote: "Ghi chú nhận hàng",
  bBKCUrl: "Biên bản kiểm tra",
  imageURL: "Hình ảnh",
  qrPrintType: "Loại in QR",
  excessPackageQuantity: "Số kiện thừa",
  lackOfPackageQuantity: "Số kiện thiếu",
  damagedPackageQuantity: "Số kiện hỏng",
  resultDesciption: "Kết quả kiểm tra",
  damageDescription: "Mô tả hư hỏng",
  isRain: "Thời tiết mưa",
  isDamageOutsidePackage: "Hư hỏng ngoài bao bì",
  itemId: "Mã hàng",
  itemCode: "Mã hàng",
  itemName: "Tên hàng",
  unit: "Đơn vị tính",
  quantity: "Số lượng",
  unitPrice: "Đơn giá",
  unitPriceDisplay: "Đơn giá",
  amount: "Thành tiền",
  amountDisplay: "Thành tiền",
  sourceAmount: "Tiền nguyên tệ",
  vatId: "Thuế VAT",
  vatAmount: "Tiền VAT",
  cost: "Chi phí",
  assetCondition: "Tình trạng thiết bị",
};

function getFieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  if (key.endsWith("Display")) {
    const base = key.slice(0, -"Display".length);
    if (FIELD_LABELS[base]) return FIELD_LABELS[base];
  }
  if (key.endsWith("Name")) {
    const base = key.slice(0, -"Name".length);
    if (FIELD_LABELS[base]) return `Tên ${FIELD_LABELS[base].toLowerCase()}`;
  }
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase()).trim();
}

function formatVietnamDate(val: unknown): string {
  if (!val || typeof val !== "string") return "";
  const match = val.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return String(val);
  const [, y, m, d, hh, mm, ss] = match;
  if (hh && mm && !(hh === "00" && mm === "00" && (!ss || ss === "00")))
    return `${d}/${m}/${y} ${hh}:${mm}`;
  return `${d}/${m}/${y}`;
}

function formatVietnamNumber(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return new Intl.NumberFormat("vi-VN").format(num);
}

// Grand total across detail lines: prefer the server-computed line amount
// (includes VAT/discounts when present), fall back to qty x unit price.
function sumLineTotals(rows: Array<{ fields?: unknown } | Record<string, unknown>>): string | null {
  if (!rows || rows.length === 0) return null;
  const values: Array<string | null> = [];
  for (const row of rows) {
    const f = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
    const server = f.amount ?? f.sourceAmount;
    values.push(server == null ? multiplyMoney(String(f.quantity ?? ""), String(f.unitPrice ?? "")) : String(server));
  }
  return sumMoney(values);
}

// One Vietnamese display convention; API values keep their original precision.
function formatMoney(value: unknown, _currencyId?: string): string {
  return formatMoneyValue(value);
}

function docCurrencyId(header: unknown): string {
  const c = (header as Record<string, unknown> | null | undefined)?.currencyId;
  return typeof c === "string" ? c : "";
}

// Per-line total display: server display string first, then raw server amount,
// then qty x unit price fallback. Never blank when qty and price exist.
function lineTotalDisplay(f: Record<string, unknown>, currencyId?: string): string {
  const raw = f.totalPrice ?? f.amount ?? f.sourceAmount;
  if (raw != null && raw !== "") return formatMoney(raw, currencyId);
  const display = (f.totalPriceDisplay || f.amountDisplay || "") as string;
  if (typeof display === "string" && display.trim() !== "") return display;
  const calculated = multiplyMoney(String(f.quantity ?? ""), String(f.unitPrice ?? ""));
  if (calculated !== null) return formatMoney(calculated, currencyId);
  return "—";
}

function getActionErrorMessage(outcome: string, code?: string | null): string {
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

function getActionReasonMessage(reason?: string | null): string {
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

// Màu badge theo trạng thái chứng từ: id số là chuẩn (duyệt ĐNMH:
// 2 chờ, 3 đã duyệt, 4 không duyệt); các màn khác đoán theo tên.
function statusBadgeClass(statusId: unknown, statusName: unknown): string {
  const base = "px-2.5 py-1 rounded-full text-xs font-semibold border ";
  const red = "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-red-200 dark:border-red-900/50";
  const green = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50";
  const amber = "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-900/50";
  const brand = "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 border-brand-200 dark:border-brand-900/40";
  if (statusId === 4) return base + red;
  if (statusId === 3) return base + green;
  if (statusId === 2) return base + amber;
  const name = (typeof statusName === "string" ? statusName : "").toLowerCase();
  if (!name) return base + brand;
  if (name.includes("không duyệt") || name.includes("tu choi") || name.includes("từ chối")) return base + red;
  if (name.includes("chờ") || name.includes("cho duyet") || name.includes("chờ duyệt") || name.includes("chua") || name.includes("chưa")) return base + amber;
  if (name.includes("duyệt") || name.includes("duyet") || name.includes("đồng ý") || name.includes("hoàn tất") || name.includes("đã khóa")) return base + green;
  return base + brand;
}

const moduleActionsCache = new Map<string, ErpActionState[]>();
const moduleActionsInflight = new Map<string, Promise<ErpActionState[]>>();

// Chặn 2 lần tải danh sách giống hệt nhau cùng chạy (StrictMode dev):
// cả 2 cùng chờ 1 promise, không loại bỏ response 200 nào.
const listInflight = new Map<string, Promise<ErpDocumentPage>>();

function moduleActionsKey(module: ErpScreenModule, branchId: string) {
  return `${module}::${branchId}`;
}

// Screen metadata has no branch dependency: fetch once per module.
// Document lists reload every time their tab becomes visible so the data
// is never stale; refresh button and branch changes reload explicitly.
const screenMetaCache = new Map<ErpScreenModule, ErpScreenDescription>();

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
const DEFAULT_EDITABLE_HEADER_KEYS = [
  "documentDate",
  "objectId",
  "deliverDate",
  "contractId",
  "memo",
  "notes",
] as const;
function editableHeaderKeys(module: ErpScreenModule): readonly string[] {
  return EDITABLE_HEADER_BY_MODULE[module] ?? DEFAULT_EDITABLE_HEADER_KEYS;
}
const REQUIRED_EDIT_KEYS: Record<string, readonly string[]> = {
  "purchase-requests": ["personSuggest", "department", "objectId", "currencyId"],
  "sales-orders": ["documentDate", "objectId", "employeeId"],
};
const DEFAULT_REQUIRED_EDIT_KEYS = ["documentDate", "objectId"] as const;
function requiredEditKeys(module: ErpScreenModule): readonly string[] {
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
function editLookupId(module: ErpScreenModule, key: string): string | undefined {
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
function saveLineKeys(module: ErpScreenModule): readonly string[] {
  return SAVE_LINE_BY_MODULE[module] ?? [];
}
const SAVE_HEADER_BY_MODULE: Record<string, readonly string[]> = {
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
function lockBadgeState(header: unknown): boolean | null {
  const v = (header as Record<string, unknown> | null | undefined)?.isLocked;
  if (v === true || v === 1 || v === "1") return true;
  if (v === false || v === 0 || v === "0") return false;
  return null;
}

// Detail dropdown entries, in display order. Rendered only when the backend
// marks them visible; enabled state and reason come from the same action.
const MENU_ACTION_IDS = ["save", "submit", "send-purchase-order", "approve", "reject", "delete"] as const;

// Tạm thời: Đặt mua hàng chưa có trong Medcom:ErpWrites:Modules nên backend
// trả erp_write_unqualified (nút "Tạo mới" bị khóa kèm lý do "chưa ghi trực
// tiếp", và save/delete hiện disabled trong dropdown chi tiết). Thay vì hiển
// thị trạng thái bị chặn, ẨN toàn bộ action write của module này ở FE.
// Bỏ "purchase-orders" khỏi danh sách này khi operator bật ghi cho module.
const WRITE_GATED_MODULES = new Set<ErpScreenModule>(["purchase-orders"]);

export function TabErpScreen({
  module,
  currentBranch,
  isActive,
  targetDocumentId,
  onOpenScanner,
}: TabErpScreenProps) {
  const isQrModule = module === "warehouse-qr" || module === "sales-qr";
  const hasCreate = [
    "purchase-requests",
    "sales-orders",
    "internal-transfer-requests",
    "machine-movements",
    "machine-repairs",
    "purchase-orders",
    "inbound-requests",
    "internal-transfer-batches",
  ].includes(module);

  // Write admission is off for this module (see WRITE_GATED_MODULES): hide the
  // create entry point and every detail-menu mutation instead of rendering the
  // backend's "not yet admitted" state.
  const writesGated = WRITE_GATED_MODULES.has(module);

  // Screen Level Actions (when no document selected - FE-14)
  const [moduleActions, setModuleActions] = useState<ErpActionState[]>([]);

  useEffect(() => {
    const key = moduleActionsKey(module, currentBranch);
    const cached = moduleActionsCache.get(key);
    if (cached) {
      setModuleActions(cached);
      return;
    }
    // Drop stale data from another branch; hidden tabs refetch on activation.
    setModuleActions([]);
    if (!isActive) return;
    let cancelled = false;
    let pending = moduleActionsInflight.get(key);
    if (!pending) {
      pending = erpClient
        .getErpModuleActions(module, { branchId: currentBranch })
        .then((acts) => {
          const list = acts || [];
          moduleActionsCache.set(key, list);
          return list;
        })
        .catch(() => [] as ErpActionState[])
        .finally(() => {
          moduleActionsInflight.delete(key);
        });
      moduleActionsInflight.set(key, pending);
    }
    pending.then((acts) => {
      if (!cancelled) setModuleActions(acts);
    });
    return () => {
      cancelled = true;
    };
  }, [module, currentBranch, isActive]);

  const createActionFromApi = moduleActions.find((a) => a.id === "create");
  const canCreate = createActionFromApi != null ? (createActionFromApi.visible && createActionFromApi.enabled) : hasCreate;
  const isCreateVisible =
    !writesGated && (createActionFromApi != null ? createActionFromApi.visible : hasCreate);
  const createActionTooltip = createActionFromApi?.reason ? getActionReasonMessage(createActionFromApi.reason) : undefined;

  // Screen Metadata
  const [screenMeta, setScreenMeta] = useState<ErpScreenDescription | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // List State
  const [rows, setRows] = useState<ErpDocumentRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusId, setStatusId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Detail State
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ErpDocumentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Contract Info Modal
  const [contractInfo, setContractInfo] = useState<ErpContractInfo | null>(null);
  const [loadingContract, setLoadingContract] = useState(false);

  // PM Selection Modal
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const [pmChoices, setPmChoices] = useState<ErpChoice[]>([]);
  const [selectedPmId, setSelectedPmId] = useState("");
  const [pmNotes, setPmNotes] = useState("");
  const [loadingPm, setLoadingPm] = useState(false);

  // Action Execution State
  const [executingAction, setExecutingAction] = useState<string | null>(null);
  // Detail action dropdown + inline header edit state
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editHeader, setEditHeader] = useState<Record<string, string>>({});
  const [editLines, setEditLines] = useState<Record<string, Record<string, string>>>({});
  const [editChoices, setEditChoices] = useState<Record<string, ErpChoice | null>>({});
  const [editMulti, setEditMulti] = useState<Record<string, ErpChoice[]>>({});
  const [editRate, setEditRate] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // General Action Prompt Modal (Notes / Confirmation)
  const [actionPromptModal, setActionPromptModal] = useState<{
    open: boolean;
    action: ErpActionState | null;
    notes: string;
  }>({ open: false, action: null, notes: "" });

  // Return Step Modal (sales-order-sa, internal-transfer-sa, accounting, warehouse-out)
  const [returnStepModalOpen, setReturnStepModalOpen] = useState(false);
  const [returnStepChoices, setReturnStepChoices] = useState<ErpChoice[]>([]);
  const [selectedReturnStatusId, setSelectedReturnStatusId] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [loadingReturnStep, setLoadingReturnStep] = useState(false);

  // Send SA Modal (internal-transfer-tech)
  const [sendSaModalOpen, setSendSaModalOpen] = useState(false);
  const [saChoices, setSaChoices] = useState<ErpChoice[]>([]);
  const [selectedPrimarySaId, setSelectedPrimarySaId] = useState("");
  const [selectedSupportingSaId, setSelectedSupportingSaId] = useState("");
  const [sendSaNotes, setSendSaNotes] = useState("");
  const [loadingSendSa, setLoadingSendSa] = useState(false);

  // QR Camera Modal State
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraScanMode, setCameraScanMode] = useState<"add" | "delete">("add");
  const [cameraScanStatus, setCameraScanStatus] = useState("Đang khởi tạo máy ảnh...");
  const [manualBarcode, setManualBarcode] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrCameraRef = useRef<QrCamera | null>(null);
  const [qrOperationLoading, setQrOperationLoading] = useState(false);
  const salesQrCommand = React.useMemo(() => new SalesCommandSession("sales-qr", {
    send: (operation, intent) => erpClient.scanQr("sales-qr", operation === "scan-add" ? "add" : "delete", intent as unknown as Parameters<typeof erpClient.scanQr>[2]),
    lookup: (operation, originalIntent) => erpClient.lookupCommand("sales-qr", { operation, originalIntent }),
  }, {branchId: currentBranch}), [currentBranch]);
  useEffect(() => {
    if (module !== "sales-qr" || !salesQrCommand.pending) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [module, salesQrCommand, qrOperationLoading]);

  // Create Modal State (for non-QR modules)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const createAttachments = useSalesOrderAttachments();
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [pendingOrderCreate, setPendingOrderCreate] = useState(false);
  const orderCreateIntent = useRef<Parameters<typeof erpClient.createDocument>[1] | null>(null);
  const createGeneration = useRef(0);
  const createLocked = !!createdOrderId || pendingOrderCreate;
  const [createIsMobile, setCreateIsMobile] = useState(false);
  const [salesOrderCreateStep, setSalesOrderCreateStep] = useState(0);
  const createContentRef = useRef<HTMLDivElement>(null);
  const isSalesOrderMobile = module === "sales-orders" && createIsMobile;
  const showCreateHeader = !isSalesOrderMobile || salesOrderCreateStep === 0;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 767px)");
    const sync = () => setCreateIsMobile(query.matches);
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (createModalOpen) {
      setSalesOrderCreateStep(createLocked ? 2 : 0);
      if (!createLocked) setActionFeedback(null);
    }
  }, [createModalOpen]);
  useEffect(() => () => { createGeneration.current++; }, []);
  useEffect(() => {
    if (createModalOpen && isSalesOrderMobile) createContentRef.current?.scrollIntoView({ block: "start" });
  }, [createModalOpen, isSalesOrderMobile, salesOrderCreateStep]);
  // Redesigned purchase-order create sheet (header + editable line grid).
  const [poCreateOpen, setPoCreateOpen] = useState(false);
  // Redesigned purchase-request create sheet (matches the desktop PR form).
  const [prCreateOpen, setPrCreateOpen] = useState(false);
  const [prEditId, setPrEditId] = useState<string | null>(null);
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [createObject, setCreateObject] = useState("");
  const [createEmployee, setCreateEmployee] = useState("");
  const [createEmployeeChoice, setCreateEmployeeChoice] = useState<ErpChoice | null>(null);
  const [createObjectChoice, setCreateObjectChoice] = useState<ErpChoice | null>(null);
  const [createContract, setCreateContract] = useState("");
  const [createContractChoice, setCreateContractChoice] = useState<ErpChoice | null>(null);
  const [createDeliverDate, setCreateDeliverDate] = useState("");
  const [createManager, setCreateManager] = useState<ErpChoice | null>(null);
  const [createMemo, setCreateMemo] = useState("");
  const [createOrderNotes, setCreateOrderNotes] = useState("");
  const [createLink, setCreateLink] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerRetry, setCustomerRetry] = useState(0);
  const customerResolution = useRef(0);
  const [lineResetNotice, setLineResetNotice] = useState(false);
  const newSoLineKey = () => `so-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const [createSoLines, setCreateSoLines] = useState<SalesOrderDraftLine[]>([emptySalesOrderLine("so-init")]);
  const patchSoLine = (key: string, patch: Partial<SalesOrderDraftLine>) =>
    setCreateSoLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const [createNotes, setCreateNotes] = useState("");
  const [createItemId, setCreateItemId] = useState("");
  const [createQuantity, setCreateQuantity] = useState("1");
  const [createUnitPrice, setCreateUnitPrice] = useState("100000");
  const [creatingDocument, setCreatingDocument] = useState(false);

  const clearSoLines = () => {
    if (createSoLines.some(line => line.itemId)) setLineResetNotice(true);
    setCreateSoLines([emptySalesOrderLine(newSoLineKey())]);
  };

  // ContractID links ObjectID/ObjectName/EmployeeID; customer lookup supplies Address.
  // Evidence: six-screen-catalog.json#sales-orders.lookups (no guessed SQL/fields).
  const selectSoContract = (c: ErpChoice | null) => {
    if ((c?.id || "") !== createContract) clearSoLines();
    const previousEmployee = salesOrderField(createContractChoice, "EmployeeID");
    const employee = salesOrderField(c, "EmployeeID");
    if (employee || (previousEmployee && createEmployee === previousEmployee)) {
      setCreateEmployee(employee);
      setCreateEmployeeChoice(employee ? { id: employee, name: employee, label: employee, fields: {} } : null);
    }
    setCreateContractChoice(c);
    setCreateContract(c ? c.id : "");
    if (!c) return;
    const objectId = salesOrderField(c, "ObjectID");
    // Không có ObjectID trên dòng hợp đồng thì giữ nguyên khách đang chọn.
    if (!objectId || objectId === createObject) return;
    setCreateObject(objectId);
    setCreateObjectChoice({
      id: objectId,
      name: salesOrderField(c, "ObjectName") || objectId,
      label: objectId,
      fields: { ObjectID: objectId, ObjectName: salesOrderField(c, "ObjectName") },
    });
  };

  const selectSoCustomer = (c: ErpChoice | null) => {
    customerResolution.current++;
    setCustomerLoading(false); setCustomerError(null);
    const nextObject = c ? c.id : "";
    // Đổi khách hàng thì hợp đồng đã chọn không còn thuộc khách này → bỏ chọn.
    // Khi hợp đồng vừa tự map khách (ObjectID trùng) thì điều kiện này không xảy ra.
    if (createContract && nextObject !== createObject) {
      const linkedEmployee = salesOrderField(createContractChoice, "EmployeeID");
      if (linkedEmployee && createEmployee === linkedEmployee) {
        setCreateEmployee(""); setCreateEmployeeChoice(null);
      }
      clearSoLines();
      setCreateContract("");
      setCreateContractChoice(null);
    }
    setCreateObjectChoice(c);
    setCreateObject(nextObject);
  };

  useEffect(() => {
    if (!createModalOpen || module !== "sales-orders" || !createContract || !createObject) {
      setCustomerLoading(false); setCustomerError(null); return;
    }
    let cancelled = false;
    const sequence = ++customerResolution.current;
    const isCurrent = () => !cancelled && sequence === customerResolution.current;
    setCustomerLoading(true); setCustomerError(null);
    void resolveSalesOrderCustomer(currentBranch, createContract, createObject,
      query => erpClient.getLookupOptions("sales-orders", query), isCurrent)
      .then(customer => {
        if (!isCurrent()) return;
        if (!customer) throw new Error("Linked customer unavailable");
        setCreateObjectChoice(customer);
      })
      .catch(() => { if (isCurrent()) setCustomerError("Chưa tải được thông tin khách hàng. Vui lòng thử lại."); })
      .finally(() => { if (isCurrent()) setCustomerLoading(false); });
    return () => { cancelled = true; };
  }, [createModalOpen, module, currentBranch, createContract, createObject, customerRetry]);

  // Load Screen Metadata
  useEffect(() => {
    if (!isActive) return;
    const cached = screenMetaCache.get(module);
    if (cached) {
      setScreenMeta(cached);
      return;
    }
    let cancelled = false;
    async function loadMeta() {
      setLoadingMeta(true);
      try {
        const meta = await erpClient.getScreenMetadata(module);
        screenMetaCache.set(module, meta);
        if (!cancelled) setScreenMeta(meta);
      } catch (err: unknown) {
        console.warn(`[ErpScreen] Screen metadata for ${module}:`, err);
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    }
    loadMeta();
    return () => {
      cancelled = true;
    };
  }, [module, isActive]);

  // Load Document List (dedupe identical in-flight requests so no 200 is
  // dropped; race-free apply; 45s timeout shows a retryable error).
  const listSeqRef = useRef(0);
  const appliedSearchRef = useRef("");
  const loadList = useCallback(
    async (targetPage = 1, silent = false, statusOverride?: number | null, pageSizeOverride = pageSize) => {
      const seq = ++listSeqRef.current;
      const effectiveStatus = ["purchase-requests", "purchase-approvals", "sales-orders", "sales-order-pm", "sales-order-sa"].includes(module)
        ? statusOverride !== undefined ? statusOverride : statusId : null;
      const params = {
        branchId: currentBranch,
        page: targetPage,
        pageSize: pageSizeOverride,
        search: search.trim() || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        statusId: effectiveStatus !== null ? effectiveStatus : undefined,
      };
      const key = `${module}::${currentBranch}::${targetPage}::${params.pageSize}::${params.search ?? ""}::${params.dateFrom ?? ""}::${params.dateTo ?? ""}::${params.statusId ?? ""}`;
      if (!silent) setIsLoadingList(true);
      setErrorMsg(null);
      let inflight = listInflight.get(key);
      if (!inflight) {
        const aborter = new AbortController();
        const timer = setTimeout(() => aborter.abort(), 45000);
        const started: Promise<ErpDocumentPage> = erpClient.getErpModuleList(module, params, aborter.signal);
        inflight = started.finally(() => {
          clearTimeout(timer);
          if (listInflight.get(key) === inflight) listInflight.delete(key);
        });
        listInflight.set(key, inflight);
      }
      try {
        const result = await inflight;
        if (seq !== listSeqRef.current) return;
        setRows(result.rows || []);
        appliedSearchRef.current = params.search ?? "";
        setPage(result.page);
        setPageSize(result.pageSize ?? pageSizeOverride);
        setHasMore(result.hasMore);
      } catch (err: unknown) {
        if (seq !== listSeqRef.current) return;
        setErrorMsg(
          err instanceof DOMException && err.name === "AbortError"
            ? "Máy chủ phản hồi quá chậm (quá 45 giây). Bấm Làm mới để thử lại."
            : "Không thể tải danh sách bản ghi từ máy chủ ERP."
        );
      } finally {
        if (seq !== listSeqRef.current) return;
        setIsLoadingList(false);
        setIsRefreshing(false);
      }
    },
    [module, currentBranch, search, dateFrom, dateTo, statusId, pageSize]
  );

  // Reload the list every time this tab becomes visible. Show skeletons
  // while waiting when there is nothing to display yet; refresh quietly
  // otherwise so the old rows stay until the new response arrives.
  const wasActiveRef = useRef(false);
  useEffect(() => {
    const becameActive = isActive && !wasActiveRef.current;
    wasActiveRef.current = isActive;
    if (becameActive) void loadList(search.trim() === appliedSearchRef.current ? page : 1, rows.length > 0);
  }, [isActive, loadList, rows.length, page, search]);

  // Auto-apply the search term with a debounce, so no dedicated search button
  // (or Enter keypress) is required to load matching rows.
  const loadListRef = useRef(loadList);
  useEffect(() => { loadListRef.current = loadList; }, [loadList]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isActive) return;
    if (search.trim() === appliedSearchRef.current) return;
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      void loadListRef.current(1);
    }, 400);
    return () => {
      if (searchDebounceRef.current) { clearTimeout(searchDebounceRef.current); searchDebounceRef.current = null; }
    };
  }, [search, isActive]);

  const openDetailRequestSeqRef = useRef<number>(0);

  // Invalidate in-flight reads when the branch/module scope changes (FE-14)
  // and reload the list when visible, so rows never belong to another scope.
  // Only loadList may advance listSeqRef: it owns the loading flags, so the
  // request with the newest seq is always the one that applies the response
  // and clears isLoadingList/isRefreshing. Bumping the counter here on every
  // dependency change (activation, search, status chip) orphaned the request
  // started above: its 200 was discarded by the seq guard and the flags were
  // never reset, leaving the skeleton on screen forever.
  const prevScopeRef = useRef(`${module}::${currentBranch}`);
  useEffect(() => {
    const scope = `${module}::${currentBranch}`;
    if (prevScopeRef.current === scope) return;
    prevScopeRef.current = scope;
    openDetailRequestSeqRef.current++;
    listSeqRef.current++;
    // The request orphaned above can no longer clear these flags, so hand
    // them over here; a reload below takes them straight back.
    setIsLoadingList(false);
    setIsRefreshing(false);
    setRows([]);
    setPage(1);
    setHasMore(false);
    setSelectedDocId(null);
    setDetail(null);
    setDetailError(null);
    setCreateModalOpen(false);
    createGeneration.current++;
    createAttachments.reset(); setCreatedOrderId(null); setPendingOrderCreate(false); orderCreateIntent.current = null;
    setCreatingDocument(false);
    setCreateObject(""); setCreateObjectChoice(null);
    setCreateContract(""); setCreateContractChoice(null);
    setCreateEmployee(""); setCreateEmployeeChoice(null); setCreateManager(null);
    setCreateSoLines([emptySalesOrderLine("so-init")]);
    setCreateMemo(""); setCreateOrderNotes(""); setCreateLink("");
    setCreateDeliverDate(""); setLineResetNotice(false);
    if (isActive) void loadList(1);
  }, [currentBranch, module, isActive, loadList]);

  // Open Document Detail (Race-free: only applies response for latest requested documentId)
  const handleOpenDetail = async (documentId: string) => {
    if (documentId !== selectedDocId && salesCloseGuard.current && !salesCloseGuard.current()) return;
    if (documentId !== selectedDocId && module === "sales-qr" && (salesQrCommand.pending || salesQrCommand.busy)) {
      setActionFeedback({ type: "warning", message: "Hãy xác nhận kết quả mã QR đang chờ trước khi mở phiếu khác." }); return;
    }
    setPrEditId(null);
    const seq = ++openDetailRequestSeqRef.current;
    setSelectedDocId(documentId);
    setLoadingDetail(true);
    setDetailError(null);
    setActionFeedback(null);
    setEditing(false);
    setMenuOpen(false);
    setDeleteArmed(false);
    setEditChoices({});
    setEditMulti({});
    setEditLines({});
    setEditRate(null);
    try {
      const data = await erpClient.getErpModuleDetail(module, {
        branchId: currentBranch,
        documentId,
        page: 1,
        pageSize: 50,
      });
      if (seq === openDetailRequestSeqRef.current) {
        setDetail(data);
      }
    } catch {
      if (seq === openDetailRequestSeqRef.current) {
        setDetailError("Không thể tải chi tiết chứng từ. Vui lòng thử lại.");
      }
    } finally {
      if (seq === openDetailRequestSeqRef.current) {
        setLoadingDetail(false);
      }
    }
  };

  // Open detail if targetDocumentId is passed
  useEffect(() => {
    if (targetDocumentId && isActive) {
      handleOpenDetail(targetDocumentId);
    }
  }, [targetDocumentId, isActive]);

  // Load More Lines for Detail
  const [loadingMoreLines, setLoadingMoreLines] = useState(false);
  const handleLoadMoreLines = async () => {
    if (!detail || loadingMoreLines || !detail.lines?.hasMore) return;
    setLoadingMoreLines(true);
    try {
      const nextPage = (detail.lines.page || 1) + 1;
      const nextData = await erpClient.getErpModuleDetail(module, {
        branchId: currentBranch,
        documentId: detail.documentId,
        page: nextPage,
        pageSize: 50,
      });
      if (nextData && nextData.lines) {
        setDetail((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            lines: {
              ...nextData.lines,
              rows: [...(prev.lines.rows || []), ...(nextData.lines.rows || [])],
            },
          };
        });
      }
    } catch (err) {
      console.error("Failed to load more detail lines:", err);
    } finally {
      setLoadingMoreLines(false);
    }
  };

  // Close Detail Sheet
  const salesCloseGuard = useRef<(() => boolean) | null>(null);
  const setSalesCloseGuard = useCallback((guard: (() => boolean) | null) => { salesCloseGuard.current = guard; }, []);
  const handleCloseDetail = () => {
    if (salesCloseGuard.current && !salesCloseGuard.current()) return;
    if (module === "sales-qr" && (salesQrCommand.pending || salesQrCommand.busy)) {
      setActionFeedback({ type: "warning", message: "Hãy xác nhận kết quả mã QR đang chờ trước khi đóng phiếu." }); return;
    }
    setPrEditId(null);
    setSelectedDocId(null);
    setDetail(null);
    setDetailError(null);
    setActionFeedback(null);
    setContractInfo(null);
    setEditing(false);
    setMenuOpen(false);
    setDeleteArmed(false);
    setEditChoices({});
    setEditMulti({});
    setEditLines({});
    setEditRate(null);
  };

  // Detail action dropdown helpers: inline header edit, delete (two-step
  // confirm), and workflow prompts reuse the existing prompt modal.
  const startEditing = () => {
    if (!detail) return;
    if (module === "purchase-requests") {
      if (!detail.actions.some(action => action.id === "save" && action.visible && action.enabled) || executingAction) return;
      setPrEditId(detail.documentId);
      setMenuOpen(false);
      return;
    }
    const h = (detail.header || {}) as Record<string, unknown>;
    const isoDate = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : "");
    const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
    const initial: Record<string, string> = {};
    for (const key of editableHeaderKeys(module)) {
      const raw = h[key];
      initial[key] = key.toLowerCase().includes("date") ? isoDate(raw) : text(raw);
    }
    setEditHeader(initial);
    const lineKeys = saveLineKeys(module);
    const lineDrafts: Record<string, Record<string, string>> = {};
    if (lineKeys.length > 0) {
      for (const row of detail.lines?.rows || []) {
        const f = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
        const draft: Record<string, string> = {};
        for (const k of lineKeys) {
          const v = f[k];
          draft[k] = v == null ? "" : String(v);
        }
        lineDrafts[row.lineId] = draft;
      }
    }
    setEditLines(lineDrafts);
    setEditChoices({});
    setEditMulti({});
    setEditRate(null);
    setEditing(true);
    setMenuOpen(false);
    setActionFeedback(null);
  };

  const patchEditLine = (lineId: string, k: string, v: string) =>
    setEditLines((prev) => ({ ...prev, [lineId]: { ...(prev[lineId] || {}), [k]: v } }));

  const handleSaveHeader = async () => {
    if (!detail) return;
    const keys = editableHeaderKeys(module);
    const missing = requiredEditKeys(module).filter((k) => !(editHeader[k] ?? "").trim());
    if (missing.length > 0) {
      setActionFeedback({
        type: "warning",
        message: "Vui lòng nhập đủ các trường bắt buộc trước khi lưu.",
      });
      return;
    }
    if (
      keys.includes("price") &&
      (editHeader.price ?? "").trim() !== "" &&
      !/^\d+(\.\d+)?$/.test(editHeader.price.trim())
    ) {
      setActionFeedback({ type: "warning", message: "Giá bán phải là số." });
      return;
    }
    setExecutingAction("save");
    setActionFeedback(null);
    const idempotencyKey = `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const edited: Record<string, unknown> = {};
      for (const k of keys) {
        const v = (editHeader[k] ?? "").trim();
        if (k === "purposeId") edited[k] = v ? Number(v) : null;
        else
          edited[k] = k.toLowerCase().includes("date") ? (v ? `${v}T00:00:00.000` : null) : v ? v : null;
      }
      const base = (detail.header || {}) as Record<string, unknown>;
      const allow = SAVE_HEADER_BY_MODULE[module];
      const header: Record<string, unknown> = {};
      if (allow) {
        for (const k of allow) {
          if (k in edited) {
            header[k] = edited[k];
            continue;
          }
          if (k === "rateExchange" && editRate !== null) {
            const n = Number(editRate);
            header[k] = Number.isFinite(n) && n > 0 ? n : (k in base ? base[k] : null);
            continue;
          }
          let raw: unknown = k in base ? base[k] : null;
          if (
            typeof raw === "string" &&
            k.toLowerCase().includes("date") &&
            /T\d{2}:\d{2}:\d{2}$/.test(raw)
          ) {
            raw = `${raw}.000`;
          }
          header[k] = raw ?? null;
        }
      } else {
        Object.assign(header, base, edited);
      }
      // Line edits: Update only changed rows, exact input DTO keys.
      const lineKeys = saveLineKeys(module);
      const lineChanges: Array<{ kind: "Update"; lineId: string; values: Record<string, unknown> }> = [];
      if (lineKeys.length > 0) {
        for (const row of detail.lines?.rows || []) {
          const f = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
          const draft = editLines[row.lineId];
          if (!draft) continue;
          const itemId = (draft.itemId ?? "").trim();
          const qty = (draft.quantity ?? "").trim();
          const priceVal = (draft.unitPrice ?? "").trim();
          if (!itemId || !/^\d+(\.\d+)?$/.test(qty) || !/^\d+(\.\d+)?$/.test(priceVal)) {
            setActionFeedback({
              type: "warning",
              message: "Mỗi dòng cần Mã hàng, Số lượng và Đơn giá hợp lệ.",
            });
            setExecutingAction(null);
            return;
          }
          const values: Record<string, unknown> = {};
          let changed = false;
          for (const k of lineKeys) {
            const cur = f[k] == null ? "" : String(f[k]).trim();
            const next = (draft[k] ?? "").trim();
            values[k] = next ? next : null;
            if (next !== cur) changed = true;
          }
          if (changed) lineChanges.push({ kind: "Update", lineId: row.lineId, values });
        }
      }
      const res = await erpClient.saveDocument(module, {
        idempotencyKey,
        branchId: currentBranch,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        header,
        lineChanges,
      });
      if (res.outcome === "Committed" || res.outcome === "Replayed") setEditing(false);
      handleCommandOutcome(res);
    } catch {
      setActionFeedback({
        type: "error",
        message: "Lỗi kết nối khi lưu chứng từ.",
      });
    } finally {
      setExecutingAction(null);
    }
  };

  const handleDeleteDocument = async () => {
    if (!detail) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleteArmed(false);
    setMenuOpen(false);
    setExecutingAction("delete");
    setActionFeedback(null);
    const idempotencyKey = `del-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const res = await erpClient.deleteDocument(module, {
        idempotencyKey,
        branchId: currentBranch,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
      });
      handleCommandOutcome(res);
      if (res.receipt?.deleted) loadList(1);
    } catch {
      setActionFeedback({
        type: "error",
        message: "Lỗi kết nối khi xóa chứng từ.",
      });
    } finally {
      setExecutingAction(null);
    }
  };

  const openWorkflowPrompt = (act: ErpActionState) => {
    setMenuOpen(false);
    setDeleteArmed(false);
    setActionPromptModal({ open: true, action: act, notes: "" });
  };

  const menuActs = writesGated
    ? []
    : (detail?.actions || []).filter(
        (a): a is ErpActionState =>
          a.visible && (MENU_ACTION_IDS as readonly string[]).includes(a.id)
      );

  const menuLabel = (act: ErpActionState): string => {
    if (act.id === "save") return editing ? "Lưu thay đổi" : "Sửa thông tin";
    if (act.id === "delete") return deleteArmed ? "Bấm lần nữa để xóa" : "Xóa chứng từ";
    if (act.id === "submit") return "Gửi đề nghị";
    if (act.id === "send-purchase-order") return "Gửi đặt mua hàng";
    if (act.id === "approve") return "Duyệt";
    if (act.id === "reject") return module === "purchase-approvals" ? "Không duyệt" : "Từ chối";
    return act.caption || act.id;
  };

  const handleMenuClick = (act: ErpActionState) => {
    if (act.id === "save") {
      if (editing) void handleSaveHeader();
      else startEditing();
    } else if (act.id === "delete") {
      void handleDeleteDocument();
    } else {
      openWorkflowPrompt(act);
    }
  };

  // Process Command Outcome
  const handleCommandOutcome = (res: ErpCommandResult) => {
    if (res.outcome === "Committed" || res.outcome === "Replayed") {
      setActionFeedback({
        type: "success",
        message: "Thao tác thành công. Dữ liệu chứng từ đã được cập nhật.",
      });
      loadList(page, true);
      if (detail && !res.receipt?.deleted) {
        handleOpenDetail(detail.documentId);
      } else if (res.receipt?.deleted) {
        handleCloseDetail();
      }
    } else if (res.outcome === "QualificationRequired") {
      setActionFeedback({
        type: "warning",
        message:
          "Hệ thống đang ở chế độ kiểm soát an toàn. Dữ liệu chưa được ghi trực tiếp vào cơ sở dữ liệu.",
      });
    } else {
      setActionFeedback({
        type: "error",
        message: getActionErrorMessage(res.outcome, res.code),
      });
    }
  };

  // Execute QR Scan (Add or Delete)
  const handleExecuteQrScan = async (actionType: "add" | "delete", barcodeValue: string) => {
    if (!detail || !barcodeValue.trim()) return;
    if (module === "sales-qr" && (salesQrCommand.pending || salesQrCommand.busy || !detail.actions.some(action => action.id === `scan-${actionType}` && action.visible && action.enabled))) return;
    setQrOperationLoading(true);
    setActionFeedback(null);
    const idempotencyKey = `qr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const intent = {
        idempotencyKey,
        branchId: currentBranch,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        barcode: barcodeValue.trim(),
      };
      const res = module === "sales-qr" ? await salesQrCommand.submit(`scan-${actionType}`, intent) : await erpClient.scanQr("warehouse-qr", actionType, intent);
      handleCommandOutcome(res);
    } catch {
      setActionFeedback({
        type: "error",
        message: "Lỗi kết nối khi gửi mã QR tới hệ thống.",
      });
    } finally {
      setQrOperationLoading(false);
    }
  };

  // Open QR Camera Scanner Modal
  const openQrScannerModal = (mode: "add" | "delete") => {
    setCameraScanMode(mode);
    setManualBarcode("");
    setCameraModalOpen(true);
  };

  // Camera Lifecycle
  useEffect(() => {
    if (!cameraModalOpen) {
      if (qrCameraRef.current) {
        qrCameraRef.current.stop();
        qrCameraRef.current = null;
      }
      return;
    }

    const cam = new QrCamera();
    qrCameraRef.current = cam;
    setCameraScanStatus("Đang mở máy ảnh...");

    const timer = setTimeout(() => {
      if (videoRef.current) {
        cam.start(
          videoRef.current,
          (state) => {
            if (state === "scanning") setCameraScanStatus("Đang quét: Hãy đưa mã QR vào khung ngắm...");
            else if (state === "found") setCameraScanStatus("Đã nhận diện mã QR!");
            else if (state === "denied") setCameraScanStatus("Quyền truy cập máy ảnh bị từ chối.");
            else if (state === "unavailable") setCameraScanStatus("Không tìm thấy camera trên thiết bị.");
            else if (state === "failed") setCameraScanStatus("Không thể khởi động camera.");
          },
          (code) => {
            handleExecuteQrScan(cameraScanMode, code);
            setCameraModalOpen(false);
          }
        );
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      cam.stop();
    };
  }, [cameraModalOpen, cameraScanMode]);



  // Submit Prompt Action (notes / reason)
  const handleConfirmPromptAction = async () => {
    if (!detail || !actionPromptModal.action) return;
    const act = actionPromptModal.action;
    const op = act.id;
    if (op === "reject" && !actionPromptModal.notes.trim()) {
      setActionFeedback({
        type: "warning",
        message: "Vui lòng nhập lý do từ chối.",
      });
      return;
    }
    setExecutingAction(op);
    setActionFeedback(null);
    const notesValue = actionPromptModal.notes.trim();
    setActionPromptModal({ open: false, action: null, notes: "" });
    const idempotencyKey = `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const res = await erpClient.executeWorkflowAction(module, op, {
        idempotencyKey,
        branchId: currentBranch,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        payload: notesValue ? { notes: notesValue } : {},
      });
      handleCommandOutcome(res);
    } catch {
      setActionFeedback({
        type: "error",
        message: "Lỗi kết nối khi gửi thao tác tới máy chủ.",
      });
    } finally {
      setExecutingAction(null);
    }
  };

  // Submit Return Step
  const handleConfirmReturnStep = async () => {
    if (!detail || !selectedReturnStatusId) return;
    setExecutingAction("return-step");
    setActionFeedback(null);
    const idempotencyKey = `ret-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const res = await erpClient.executeWorkflowAction(module, "return-step", {
        idempotencyKey,
        branchId: currentBranch,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        payload: {
          statusId: Number(selectedReturnStatusId),
          notes: returnNotes.trim() || undefined,
        },
      });
      setReturnStepModalOpen(false);
      handleCommandOutcome(res);
    } catch {
      setActionFeedback({
        type: "error",
        message: "Lỗi kết nối khi thực hiện gửi trả về bước trước.",
      });
    } finally {
      setExecutingAction(null);
    }
  };

  // Submit Send SA (tech -> SA)
  const handleConfirmSendSa = async () => {
    if (!detail || !selectedPrimarySaId || !selectedSupportingSaId) return;
    if (selectedPrimarySaId === selectedSupportingSaId) {
      setActionFeedback({
        type: "warning",
        message: "Hai SA phải khác nhau (một TPAdminHN và một TPAdminHCM).",
      });
      return;
    }
    setExecutingAction("send-sa");
    setActionFeedback(null);
    const idempotencyKey = `sa-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const res = await erpClient.executeWorkflowAction(module, "send-sa", {
        idempotencyKey,
        branchId: currentBranch,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        payload: {
          primarySaId: selectedPrimarySaId,
          supportingSaId: selectedSupportingSaId,
          notes: sendSaNotes.trim() || undefined,
        },
      });
      setSendSaModalOpen(false);
      handleCommandOutcome(res);
    } catch {
      setActionFeedback({
        type: "error",
        message: "Lỗi kết nối khi chuyển cho TP SA duyệt.",
      });
    } finally {
      setExecutingAction(null);
    }
  };

  // Submit Send PM
  const handleConfirmSendPm = async () => {
    if (!detail || !selectedPmId) return;
    setExecutingAction("send-pm");
    const idempotencyKey = `pm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      let res: ErpCommandResult;
      if (module === "sales-orders") {
        res = await erpClient.executeWorkflowAction(module, "send-pm", {
          idempotencyKey,
          branchId: currentBranch,
          documentId: detail.documentId,
          expectedStateToken: detail.stateToken,
          payload: { pmId: selectedPmId, notes: pmNotes || null },
        });
      } else {
        res = await erpClient.executeWorkflowAction(module, "send-pm", {
          idempotencyKey,
          branchId: currentBranch,
          documentId: detail.documentId,
          expectedStateToken: detail.stateToken,
          payload: { primaryPmId: selectedPmId, supportingPmId: "", notes: pmNotes || null },
        });
      }
      setPmModalOpen(false);
      handleCommandOutcome(res);
    } catch {
      setActionFeedback({
        type: "error",
        message: "Lỗi kết nối khi gửi phê duyệt PM.",
      });
    } finally {
      setExecutingAction(null);
    }
  };

  // Handle Create New Document
  const goToSalesOrderStep = (next: number) => {
    if (creatingDocument || createLocked) return;
    if (next > 0 && (!createDate || !createObject.trim() || !createEmployee.trim() || createOrderNotes.length > 250 || customerLoading || customerError || createAttachments.validating)) {
      setActionFeedback({ type: "warning", message: customerLoading ? "Đang tải thông tin khách hàng. Vui lòng chờ." :
        customerError || "Nhập ngày chứng từ, chọn khách hàng và mã nhân viên. Ghi chú tối đa 250 ký tự." });
      setSalesOrderCreateStep(0); return;
    }
    if (next > 1 && (!createSoLines.length || !createSoLines.every(isSalesOrderLineValid))) {
      setActionFeedback({ type: "warning", message: "Chọn mã hàng, nhập số lượng và các giá trị giá/thuế/chiết khấu hợp lệ cho từng dòng." });
      setSalesOrderCreateStep(1); return;
    }
    setActionFeedback(null); setSalesOrderCreateStep(next);
  };

  const createdSalesOrderId = (result: ErpCommandResult, requestKey: string): string => {
    const receipt = result.receipt;
    if (!receipt || receipt.module !== "sales-orders" || receipt.idempotencyKey !== requestKey || receipt.deleted ||
      !receipt.documentId || receipt.documentId.length > 50) throw new Error("Invalid created document receipt");
    return receipt.documentId;
  };

  const finishCreatedSalesOrder = async (documentId: string, run: number) => {
    const uploaded = await createAttachments.uploadAll(currentBranch, documentId);
    if (run !== createGeneration.current) return;
    if (!uploaded) {
      setSalesOrderCreateStep(2);
      setActionFeedback({ type: "warning", message: `Đơn ${documentId} đã tạo. Ảnh đính kèm chưa hoàn tất; bấm Thử lại tải ảnh để tiếp tục trên đơn này.` });
      void loadList(1); return;
    }
    setCreateModalOpen(false); setCreatedOrderId(null); setPendingOrderCreate(false); orderCreateIntent.current = null;
    createAttachments.reset();
    setCreateObject(""); setCreateObjectChoice(null); setCreateContract(""); setCreateContractChoice(null);
    setCreateEmployee(""); setCreateEmployeeChoice(null); setCreateManager(null);
    setCreateMemo(""); setCreateOrderNotes(""); setCreateLink("");
    setCreateDeliverDate(""); setLineResetNotice(false); setCreateSoLines([emptySalesOrderLine(newSoLineKey())]);
    setActionFeedback({ type: "success", message: `Đã tạo đơn ${documentId}${createAttachments.files.length ? " và tải ảnh đính kèm" : ""}.` });
    void loadList(1); void handleOpenDetail(documentId);
  };

  const handleCreateDocument = async () => {
    if (creatingDocument || createAttachments.validating || createAttachments.uploading || (module === "sales-orders" && !createLocked && (customerLoading || customerError))) return;
    if (isSalesOrderMobile && salesOrderCreateStep !== 2 && !createLocked) { goToSalesOrderStep(2); return; }
    const run = createGeneration.current;
    setCreatingDocument(true);
    setActionFeedback(null);
    const idempotencyKey = `crt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      if (module === "sales-orders" && createdOrderId) {
        await finishCreatedSalesOrder(createdOrderId, run); return;
      }
      if (module === "sales-orders" && orderCreateIntent.current) {
        const pending = orderCreateIntent.current;
        const result = await erpClient.createDocument("sales-orders", pending);
        if (run !== createGeneration.current) return;
        if (result.outcome === "Committed" || result.outcome === "Replayed") {
          const id = createdSalesOrderId(result, pending.idempotencyKey);
          setCreatedOrderId(id); setPendingOrderCreate(false);
          await finishCreatedSalesOrder(id, run);
        } else {
          if (!["OutcomeUnknown", "Unavailable"].includes(result.outcome)) { orderCreateIntent.current = null; setPendingOrderCreate(false); }
          handleCommandOutcome(result);
        }
        return;
      }
      const header: Record<string, unknown> = {};
      const lines: Array<{ clientLineKey: string; values: Record<string, unknown> }> = [];

      if (module === "purchase-requests") {
        header.purchaseDate = `${createDate}T00:00:00.000`;
        header.personSuggest = createObject || "Nhân viên đề xuất";
        header.department = "Phòng Kinh Doanh";
        header.currencyId = "VND";
        header.objectId = "NCC01";
        header.rateExchange = 1.0;
        header.notes = createNotes || null;
        if (createItemId.trim()) {
          lines.push({
            clientLineKey: "line-1",
            values: {
              itemId: createItemId.trim(),
              quantity: createQuantity || "1",
              unitPrice: createUnitPrice || "0",
            },
          });
        }
      } else if (module === "sales-orders") {
        if (!createDate || createOrderNotes.length > 250) {
          setActionFeedback({ type: "warning", message: "Nhập ngày chứng từ và ghi chú đơn hàng tối đa 250 ký tự." });
          return;
        }
        const soObject = (createObject || createObjectChoice?.id || "").trim();
        const soEmployee = (createEmployee || createEmployeeChoice?.id || "").trim();
        if (!soObject || !soEmployee) {
          setActionFeedback({
            type: "warning",
            message: "Vui lòng chọn Khách hàng và Mã nhân viên trước khi tạo đơn hàng.",
          });
          setCreatingDocument(false);
          return;
        }
        header.documentDate = `${createDate}T00:00:00.000`;
        header.objectId = soObject;
        header.employeeId = soEmployee;
        header.isOrder = true;
        header.currencyId = "VND";
        header.rateExchange = 1.0;
        const soContract = (createContract || createContractChoice?.id || "").trim();
        if (soContract) header.contractId = soContract;
        if (createDeliverDate) header.deliverDate = `${createDeliverDate}T00:00:00.000`;
        header.memo = createMemo.trim() || null;
        header.ghiChuDonHang = createOrderNotes.trim() || null;
        header.managerId = createManager?.id || null;
        header.taxCode = salesOrderField(createObjectChoice, "TaxCode") || null;
        header.linkId = createLink.trim() || null;
        const soValid = createSoLines.filter(isSalesOrderLineValid);
        if (soValid.length === 0 || soValid.length !== createSoLines.length) {
          setActionFeedback({
            type: "warning",
            message: "Mỗi chi tiết cần Mã hàng, Số lượng và các giá trị giá/thuế/chiết khấu hợp lệ. Hãy xóa dòng trống không dùng.",
          });
          setCreatingDocument(false);
          return;
        }
        for (const l of soValid) {
          lines.push({
            clientLineKey: l.key,
            values: salesOrderLineInput(l),
          });
        }
      } else if (module === "internal-transfer-requests") {
        header.documentDate = `${createDate}T00:00:00.000`;
        header.fromBranchId = currentBranch;
        header.toBranchId = currentBranch;
        header.transferReason = createNotes || "Đề nghị điều chuyển nội bộ";
        header.notes = createNotes || null;
        if (createItemId.trim()) {
          lines.push({
            clientLineKey: "line-1",
            values: {
              itemId: createItemId.trim(),
              requestedQty: createQuantity || "1",
              isEquipment: false,
              notes: null,
            },
          });
        }
      } else if (module === "machine-movements") {
        header.documentDate = `${createDate}T00:00:00.000`;
        header.moveTypeId = "MOVE01";
        header.memo = createNotes || "Phiếu di chuyển máy";
        header.notes = createNotes || null;
        if (createItemId.trim()) {
          lines.push({
            clientLineKey: "line-1",
            values: {
              assetId: createItemId.trim(),
              quantity: createQuantity || "1",
              notes: null,
            },
          });
        }
      } else if (module === "machine-repairs") {
        header.documentDate = `${createDate}T00:00:00.000`;
        header.serviceTypeId = "SRV01";
        header.memo = createNotes || "Phiếu sửa chữa bảo trì";
        header.notes = createNotes || null;
        if (createItemId.trim()) {
          lines.push({
            clientLineKey: "line-1",
            values: {
              assetId: createItemId.trim(),
              quantity: createQuantity || "1",
              notes: null,
            },
          });
        }
      } else if (module === "purchase-orders") {
        header.documentDate = `${createDate}T00:00:00.000`;
        header.objectId = createObject || "NCC01";
        header.currencyId = "VND";
        header.rateExchange = 1.0;
        header.memo = createNotes || "Đơn đặt mua hàng";
        header.notes = createNotes || null;
        if (createItemId.trim()) {
          lines.push({
            clientLineKey: "line-1",
            values: {
              itemId: createItemId.trim(),
              quantity: createQuantity || "1",
              unitPrice: createUnitPrice || "0",
            },
          });
        }
      } else if (module === "inbound-requests") {
        header.documentDate = `${createDate}T00:00:00.000`;
        header.orderNumber = "ORD-" + Date.now().toString(36);
        header.invoiceNo = "HD-" + Date.now().toString(36);
        header.departurePoint = "Kho đi";
        header.destinationPoint = "Kho đến";
        header.orderTypeId = "IN01";
        header.qrPrintType = "QR01";
        header.objectId = createObject || "NCC01";
        header.notes = createNotes || null;
        if (createItemId.trim()) {
          lines.push({
            clientLineKey: "line-1",
            values: {
              itemId: createItemId.trim(),
              setQuantityByDocument: createQuantity || "1",
              barrelQuantityByDocument: createQuantity || "1",
              unitPrice: createUnitPrice || "0",
            },
          });
        }
      } else if (module === "internal-transfer-batches") {
        header.batchDate = `${createDate}T00:00:00.000`;
        header.fromBranchId = currentBranch;
        header.toBranchId = currentBranch;
        header.notes = createNotes || null;
        if (createItemId.trim()) {
          lines.push({
            clientLineKey: "line-1",
            values: {
              requestId: createItemId.trim(),
              notes: null,
            },
          });
        }
      } else {
        header.documentDate = `${createDate}T00:00:00.000`;
        header.notes = createNotes || null;
      }

      const intent = {
        idempotencyKey,
        branchId: currentBranch,
        header,
        lines,
      };
      if (module === "sales-orders") { orderCreateIntent.current = intent; setPendingOrderCreate(true); }
      const res = await erpClient.createDocument(module, intent);
      if (run !== createGeneration.current) return;
      if (module === "sales-orders") {
        if (res.outcome === "Committed" || res.outcome === "Replayed") {
          const id = createdSalesOrderId(res, intent.idempotencyKey);
          setCreatedOrderId(id); setPendingOrderCreate(false);
          await finishCreatedSalesOrder(id, run);
        } else {
          if (!["OutcomeUnknown", "Unavailable"].includes(res.outcome)) { orderCreateIntent.current = null; setPendingOrderCreate(false); }
          handleCommandOutcome(res);
        }
        return;
      }

      if (res.outcome === "Committed" || res.outcome === "Replayed") {
        setCreateModalOpen(false);
      }
      handleCommandOutcome(res);
      loadList(1);
    } catch {
      if (run !== createGeneration.current) return;
      setActionFeedback({
        type: "error",
        message: module === "sales-orders" ? "Chưa xác nhận đầy đủ kết quả. Bấm tiếp tục để kiểm tra đúng đơn/lần tải đang có." : "Lỗi kết nối khi tạo mới chứng từ ERP.",
      });
    } finally {
      if (run === createGeneration.current) setCreatingDocument(false);
    }
  };

  // Filter rows locally if needed. Màn duyệt và đề nghị mua lọc theo trạng
  // thái trên server (statusId) nên bỏ qua lớp lọc khóa/mở ở client.
  const isApprovalModule = module === "purchase-approvals";
  const isPrModule = module === "purchase-requests";
  const useServerStatusChips = isApprovalModule || isPrModule;
  const isSalesOrderModule = module === "sales-orders" || module === "sales-order-pm" || module === "sales-order-sa";
  const isSalesModule = ["sales-orders", "sales-order-pm", "sales-order-sa", "sales-qr"].includes(module);
  const displayRows = useServerStatusChips || isSalesModule ? rows : rows.filter((r) => {
    const isLocked = r.header?.isLocked ?? (r as Record<string, unknown>).isLocked;
    if (statusFilter === "locked") return isLocked === true || isLocked === 1 || isLocked === "1";
    if (statusFilter === "open") return isLocked === false || isLocked === 0 || isLocked === "0" || isLocked == null;
    return true;
  });

  const useDesktopTable = ["purchase-requests", "purchase-approvals", "purchase-orders", "sales-orders", "sales-order-pm", "sales-order-sa"].includes(module);
  const listText = (row: ErpDocumentRow, ...keys: string[]) => {
    for (const key of keys) {
      const value = row.header?.[key];
      if ((typeof value === "string" && value.trim()) || typeof value === "number") return String(value);
    }
    return "";
  };
  const rowStatus = (row: ErpDocumentRow) => isSalesOrderModule
    ? documentStatusLabel(typeof row.header?.statusId === "number" ? row.header.statusId : null, listText(row, "statusName"))
    : listText(row, "statusName") || (row.header?.isLocked ? "Đã khóa" : "Đang mở");
  const tableColumns: DocumentListColumn<ErpDocumentRow>[] = [
    { id: "document", label: "Mã chứng từ", className: "min-w-40 whitespace-nowrap", render: row => <span className="font-mono font-semibold text-brand-700 dark:text-brand-300">{row.documentId}</span> },
    { id: "date", label: "Ngày chứng từ", className: "whitespace-nowrap tabular-nums", render: row => listText(row, "documentDateDisplay", "purchaseDateDisplay", "datetimeRecordedDisplay") || formatVietnamDate(listText(row, "documentDate", "purchaseDate", "datetimeRecorded")) || "—" },
    { id: "object", label: module.startsWith("sales-") ? "Khách hàng" : module === "purchase-orders" ? "Nhà cung cấp" : "Đối tượng / Mục đích", className: "min-w-60 max-w-sm", render: row => <span className="line-clamp-2 break-words font-medium" title={listText(row, "objectName", "customerName", "vendorName", "purposeDescOrClient")}>{listText(row, "objectName", "customerName", "vendorName", "purposeDescOrClient") || "—"}</span> },
    { id: "status", label: "Trạng thái", className: "whitespace-nowrap", render: row => <span className="inline-flex rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800" style={statusColorsFrom(row.header)}>{rowStatus(row)}</span> },
    ...(displayRows.some(row => listText(row, "personSuggest", "userCreate")) ? [{ id: "creator", label: "Người lập / Đề nghị", className: "min-w-40 max-w-52", render: (row: ErpDocumentRow) => <span className="line-clamp-2 break-words">{listText(row, "personSuggest", "userCreate") || "—"}</span> }] : []),
    { id: "notes", label: "Nội dung", className: "min-w-52 max-w-sm", render: row => <span className="line-clamp-2 break-words" title={listText(row, "memo", "notes")}>{listText(row, "memo", "notes") || "—"}</span> },
  ];

  const createActionButton = isCreateVisible ? (
    <UntitledButton
      variant="primary"
      size="md"
      onClick={() => {
        if (module === "purchase-orders") setPoCreateOpen(true);
        else if (module === "purchase-requests") setPrCreateOpen(true);
        else setCreateModalOpen(true);
      }}
      disabled={!canCreate}
      title={createActionTooltip}
      iconLeading={<Plus className="size-4" />}
    >
      Tạo mới
    </UntitledButton>
  ) : null;

  return (
    <div className="space-y-4 pb-24 animate-uui-fade-in">
      {/* Module Header + Toolbar (No technical menu IDs or form names) */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          {/* Identity */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <Building aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">Chi nhánh {currentBranch}</span>
            </div>
            <h2 className="mt-1 truncate text-lg font-bold tracking-tight text-neutral-900 dark:text-white sm:text-xl">
              {screenMeta?.caption || getModuleTitle(module)}
            </h2>
          </div>

          {/* Controls: search (auto-load) + status filter + create */}
          <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3 sm:flex-row sm:items-center sm:gap-2.5 lg:border-0 lg:pt-0 dark:border-neutral-800">
            <div className="relative min-w-0 sm:flex-1 lg:w-72 lg:flex-none">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  if (searchDebounceRef.current) { clearTimeout(searchDebounceRef.current); searchDebounceRef.current = null; }
                  loadList(1);
                }}
                placeholder="Tìm theo mã chứng từ, người lập, đối tượng..."
                className="h-11 w-full rounded-xl border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 shadow-2xs outline-none transition-colors placeholder:text-neutral-400 focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2.5">
              {isSalesOrderModule && (
                <div className="min-w-0 flex-1 sm:flex-none">
                  <SalesOrderStatusFilter module={module} branchId={currentBranch} isActive={isActive} value={statusId} onChange={next => {
                    setStatusId(next); void loadList(1, false, next);
                  }} />
                </div>
              )}
              {createActionButton}
            </div>
          </div>
        </div>

        {isCreateVisible && !canCreate && createActionTooltip && (
          <p className="flex items-center gap-1.5 border-t border-neutral-100 px-4 py-2.5 text-[11px] text-amber-700 sm:px-5 dark:border-neutral-800 dark:text-amber-300">
            <AlertCircle aria-hidden className="size-3.5 shrink-0" />
            <span>Chưa thể tạo mới: {createActionTooltip}</span>
          </p>
        )}

        {/* Status chips for modules without the server status dropdown */}
        {!isSalesModule && (
          <div className="border-t border-neutral-100 px-4 pb-4 pt-3 sm:px-5 dark:border-neutral-800">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {(isApprovalModule
              ? ([
                { id: "all", label: "Tất cả", status: null as number | null },
                { id: "pending", label: "Chờ duyệt", status: 2 },
                { id: "approved", label: "Đã duyệt", status: 3 },
                { id: "rejected", label: "Không duyệt", status: 4 },
              ] as const).map((chip) => ({
                id: chip.id,
                label: chip.label,
                status: chip.status,
                count: chip.status === null
                  ? rows.length
                  : rows.filter((r) => {
                    const s = (r.header as Record<string, unknown> | undefined)?.statusId;
                    return s === chip.status;
                  }).length,
              }))
              : isPrModule
                ? ([
                  { id: "all", label: "Tất cả", status: null as number | null },
                  { id: "draft", label: "Mới lập", status: 1 },
                  { id: "pending", label: "Chờ duyệt", status: 2 },
                  { id: "approved", label: "Đã duyệt", status: 3 },
                  { id: "returned", label: "Trả về", status: 4 },
                  { id: "ordered", label: "Đã gửi ĐMH", status: 5 },
                ] as const).map((chip) => ({
                  id: chip.id,
                  label: chip.label,
                  status: chip.status,
                  count: chip.status === null
                    ? rows.length
                    : rows.filter((r) => {
                      const s = (r.header as Record<string, unknown> | undefined)?.statusId;
                      return s === chip.status;
                    }).length,
                }))
                : [
                  { id: "all", label: "Tất cả", count: rows.length, status: undefined as unknown as number | null },
                  {
                    id: "open",
                    label: "Đang mở / Chưa khóa",
                    count: rows.filter((r) => {
                      const isLocked = r.header?.isLocked ?? (r as Record<string, unknown>).isLocked;
                      return isLocked === false || isLocked === 0 || isLocked === "0" || isLocked == null;
                    }).length,
                    status: undefined as unknown as number | null,
                  },
                  {
                    id: "locked",
                    label: "Đã khóa / Hoàn tất",
                    count: rows.filter((r) => {
                      const isLocked = r.header?.isLocked ?? (r as Record<string, unknown>).isLocked;
                      return isLocked === true || isLocked === 1 || isLocked === "1";
                    }).length,
                    status: undefined as unknown as number | null,
                  },
                ]
            ).map((chip) => {
              const isSelected = statusFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(chip.id);
                    if (useServerStatusChips) {
                      setStatusId(chip.status);
                      void loadList(1, false, chip.status);
                    } else if (page !== 1) {
                      void loadList(1);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 ${isSelected
                      ? "bg-brand-600 text-white shadow-xs"
                      : "bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    }`}
                >
                  <span>{chip.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isSelected
                        ? "bg-brand-700 text-white"
                        : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
                      }`}
                  >
                    {chip.count}
                  </span>
                </button>
              );
            })}
            </div>
          </div>
        )}
      </div>

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Document List */}
      <div className="space-y-2">
        {isLoadingList ? (
          <>
            {useDesktopTable && <DocumentListTable label={getModuleTitle(module)} rows={[]} columns={tableColumns} rowId={row => row.documentId} onOpen={row => handleOpenDetail(row.documentId)} loading />}
            <div className={useDesktopTable ? "lg:hidden" : ""}><DocumentCardSkeleton count={4} /></div>
          </>
        ) : displayRows.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center">
            <Info className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Không có chứng từ nào
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Chưa có bản ghi nào phù hợp với bộ lọc hiện tại tại chi nhánh {currentBranch}.
            </p>
            <button
              type="button"
              onClick={() => void loadList(1)}
              disabled={isLoadingList}
              className="mt-3 px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${isLoadingList ? "animate-spin" : ""}`} />
              Tải lại danh sách
            </button>
          </div>
        ) : (
          <>
          {useDesktopTable && <DocumentListTable label={screenMeta?.caption || getModuleTitle(module)} rows={displayRows} columns={tableColumns} rowId={row => row.documentId} onOpen={row => handleOpenDetail(row.documentId)} rowOffset={(page - 1) * pageSize} />}
          <div className={`space-y-2 ${useDesktopTable ? "lg:hidden" : ""}`} data-document-cards>
          {displayRows.map((row) => {
            const h = row.header || {};
            const docId = row.documentId;
            const dateDisplay = (h.documentDateDisplay || h.purchaseDateDisplay || h.datetimeRecordedDisplay || "") as string;
            const rawDate = (h.documentDate || h.purchaseDate || h.datetimeRecorded || "") as string;
            const dateText = dateDisplay || (rawDate ? formatVietnamDate(rawDate) : "");
            const statusName = rowStatus(row);
            const objectName = (h.objectName || h.personSuggest || h.orderNumber || h.customerName || h.vendorName || "") as string;

            return (
              <div
                key={docId}
                onClick={() => handleOpenDetail(docId)}
                className="group cursor-pointer rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 hover:border-brand-300 dark:hover:border-brand-800/60 transition-all shadow-xs hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white font-mono">
                        {docId}
                      </span>
                      {statusName && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" style={statusColorsFrom(h)}>
                          {statusName}
                        </span>
                      )}
                    </div>
                    {objectName && (
                      <p className="text-xs text-neutral-700 dark:text-neutral-300 font-medium mt-1 leading-relaxed break-words line-clamp-2">
                        {objectName}
                      </p>
                    )}
                    {dateText && (
                      <p className="text-[11px] text-neutral-400 mt-1.5 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-brand-600" />
                        <span>{dateText}</span>
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-brand-600 transition-colors shrink-0 mt-1" />
                </div>
              </div>
            );
          })}
          </div>
          </>
        )}

        <DocumentListPagination page={page} pageSize={pageSize} rowCount={rows.length} visibleRowCount={displayRows.length} hasMore={hasMore} busy={isLoadingList || isRefreshing}
          onPageChange={nextPage => void loadList(search.trim() === appliedSearchRef.current ? nextPage : 1)} onPageSizeChange={size => void loadList(1, false, undefined, size)} />
      </div>

      {/* Sales orders share the established record-detail shell. */}
      <ErpDetailSheet
        presentationAllowed={isActive}
        presentation={useDesktopTable ? "document" : "sheet"}
        salesOrder={["sales-orders", "sales-order-pm", "sales-order-sa"].includes(module)}
        documentNumber={selectedDocId}
        open={Boolean(selectedDocId) && !prEditId}
        onClose={handleCloseDetail}
        title={`Chi tiết: ${selectedDocId || ""}`}
        titleExtra={(() => {
          const locked = lockBadgeState(detail?.header);
          if (locked === null) return undefined;
          return (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-bold shrink-0 ${locked
                  ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                }`}
            >
              {locked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
              {locked ? "Đã khóa" : "Chưa khóa"}
            </span>
          );
        })()}
      >
        <div className="min-w-0 space-y-5">
          {/* Action Feedback Banner */}
          {module === "sales-qr" && salesQrCommand.pending && <div role="status" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-base text-black dark:border-amber-800 dark:bg-amber-950 dark:text-white">
            <p>Chưa xác nhận được lần quét. Kiểm tra kết quả trước khi quét mã khác.</p><div className="flex flex-wrap gap-2">{[false, true].map(resend => <button key={String(resend)} type="button" disabled={qrOperationLoading} onClick={async()=>{if(salesQrCommand.busy)return;setQrOperationLoading(true);try{handleCommandOutcome(await(resend?salesQrCommand.retry():salesQrCommand.recover()));}finally{setQrOperationLoading(false);}}} className="min-h-11 rounded-lg border border-amber-400 px-4 text-sm font-semibold disabled:opacity-50">{resend?"Gửi lại cùng mã":"Kiểm tra kết quả"}</button>)}</div>
          </div>}
          {actionFeedback && (
            <div
              className={`p-3 rounded-xl border text-base flex items-center gap-2 ${actionFeedback.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
                  : actionFeedback.type === "warning"
                    ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50"
                    : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50"
                }`}
            >
              {actionFeedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{actionFeedback.message}</span>
            </div>
          )}
          {/* Action In-Flight Spinner: menu đã đóng nên cần báo đang chờ API */}
          {executingAction && (
            <div
              role="status"
              className="p-3 rounded-xl border text-base flex items-center gap-2 bg-brand-50 text-brand-800 border-brand-200 dark:bg-brand-950/40 dark:text-brand-300 dark:border-brand-900/50"
            >
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
              <span>Đang xử lý thao tác, vui lòng chờ phản hồi từ máy chủ...</span>
            </div>
          )}

          {loadingDetail ? (
            <div className="space-y-3 py-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-brand-600" />
              <p className="text-base text-neutral-500">Đang tải đầy đủ trường chi tiết từ ERP...</p>
            </div>
          ) : detailError ? (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 text-base text-red-700 dark:text-red-300">
              {detailError}
            </div>
          ) : detail ? (
            ["sales-orders", "sales-order-pm", "sales-order-sa"].includes(module) ? (
              <SalesOrderForm
                key={`${currentBranch}:${detail.documentId}`}
                branchId={currentBranch}
                documentId={detail.documentId}
                module={module as SalesOrderModule}
                onCloseGuardChange={setSalesCloseGuard}
                onClose={handleCloseDetail}
                onChanged={() => loadList(page, true)}
              />
            ) : (
              <>
                {/* QR Scanner Controls for warehouse-qr / sales-qr: Replaced input box with 2 camera buttons */}
                {isQrModule && (
                  <div className="p-4 rounded-2xl bg-brand-50/50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-900/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-brand-900 dark:text-brand-300 flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-brand-600" />
                        Thao tác quét mã vạch / QR tem kiện
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {(() => {
                        const scanAddAct = detail?.actions?.find((a) => a.id === "scan-add");
                        const scanDelAct = detail?.actions?.find((a) => a.id === "scan-delete");
                        const canScanAdd = scanAddAct ? scanAddAct.enabled : true;
                        const canScanDel = scanDelAct ? scanDelAct.enabled : true;
                        return (
                          <>
                            <UntitledButton
                              variant="primary"
                              size="md"
                              onClick={() => openQrScannerModal("add")}
                              disabled={qrOperationLoading || !!salesQrCommand.pending || !canScanAdd}
                              title={scanAddAct?.reason ? getActionReasonMessage(scanAddAct.reason) : undefined}
                              iconLeading={<Camera className="size-4" />}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs disabled:opacity-50"
                            >
                              Quét thêm mã QR
                            </UntitledButton>
                            <UntitledButton
                              variant="primary"
                              size="md"
                              onClick={() => openQrScannerModal("delete")}
                              disabled={qrOperationLoading || !!salesQrCommand.pending || !canScanDel}
                              title={scanDelAct?.reason ? getActionReasonMessage(scanDelAct.reason) : undefined}
                              iconLeading={<Camera className="size-4" />}
                              className="bg-red-600 hover:bg-red-700 text-white shadow-xs disabled:opacity-50"
                            >
                              Quét xóa mã QR
                            </UntitledButton>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* THẺ THÔNG TIN CHUNG CHỨNG TỪ (Unified Card following Inbound Standard) */}
                <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 dark:border-neutral-800">
                    <div className="space-y-0.5">
                      <span className="text-sm uppercase font-bold tracking-wider text-neutral-400">
                        Mã chứng từ
                      </span>
                      <p className="font-mono text-base sm:text-base font-bold text-neutral-900 dark:text-white">
                        {detail.documentId}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={statusBadgeClass(
                        (detail.header as Record<string, unknown> | undefined)?.statusId,
                        detail.header?.statusName,
                      )} style={statusColorsFrom(detail.header)}>
                        {String(detail.header?.statusName || (detail.header?.isLocked ? "Đã khóa" : "Đang mở"))}
                      </span>
                      {menuActs.length > 0 && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen((v) => !v);
                              setDeleteArmed(false);
                            }}
                            aria-label="Thao tác chứng từ"
                            className="p-1.5 rounded-xl text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                          >
                            <MoreVertical className="size-5" />
                          </button>
                          {menuOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                onClick={() => {
                                  setMenuOpen(false);
                                  setDeleteArmed(false);
                                }}
                                aria-hidden="true"
                              />
                              <div className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden py-1">
                                {menuActs.map((act) => {
                                  const disabled =
                                    !act.enabled || Boolean(executingAction) || (editing && act.id !== "save");
                                  const danger = act.id === "delete";
                                  const reason = disabled && !act.enabled
                                    ? getActionReasonMessage(act.reason)
                                    : "";
                                  return (
                                    <button
                                      key={act.id}
                                      type="button"
                                      disabled={disabled}
                                      title={getActionReasonMessage(act.reason) || undefined}
                                      onClick={() => handleMenuClick(act)}
                                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-base font-semibold text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${danger
                                          ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                                          : "text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                        } ${deleteArmed && danger ? "bg-red-50 dark:bg-red-950/40" : ""}`}
                                    >
                                      {act.id === "save" ? (
                                        <Pencil className="size-4" />
                                      ) : danger ? (
                                        <Trash2 className="size-4" />
                                      ) : act.id === "approve" ? (
                                        <CheckCircle2 className="size-4" />
                                      ) : act.id === "reject" ? (
                                        <X className="size-4" />
                                      ) : (
                                        <Send className="size-4" />
                                      )}
                                      <span className="flex-1">
                                        <span className="block">{menuLabel(act)}</span>
                                        {reason ? (
                                          <span className="block text-sm font-normal text-neutral-400 dark:text-neutral-500">
                                            {reason}
                                          </span>
                                        ) : null}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tên đối tượng / Khách hàng / Nhà cung cấp (Bố trí trọn dòng) */}
                  {Boolean(
                    detail.header?.objectName ||
                    detail.header?.personSuggest ||
                    detail.header?.customerName ||
                    detail.header?.vendorName
                  ) && (
                      <div className="py-2 border-b border-neutral-100 dark:border-neutral-800/60">
                        <span className="text-sm text-neutral-400 uppercase tracking-wider font-semibold block mb-1">
                          Đối tượng / Khách hàng / Nhà cung cấp
                        </span>
                        <p className="text-base sm:text-base font-bold text-neutral-900 dark:text-white leading-relaxed break-words">
                          {String(
                            detail.header?.objectName ||
                            detail.header?.personSuggest ||
                            detail.header?.customerName ||
                            detail.header?.vendorName
                          )}
                        </p>
                      </div>
                    )}

                  {/* Chi tiết thuộc tính Header */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-base pt-1">
                    {(() => {
                      const headerKeys = Object.keys(detail.header || {});
                      // Render the full known field set in both modes: the
                      // backend omits null fields, but empty rows ("—") tell
                      // the reader the field exists. Edit mode additionally
                      // covers editable keys missing from the payload.
                      const saveKeys = ((SAVE_HEADER_BY_MODULE[module] ?? []) as readonly string[]);
                      const editKeys = editableHeaderKeys(module) as readonly string[];
                      // Edit mode renders every known key even when the backend
                      // omits null fields; view mode hides empties (no "—" rows).
                      const keys = [...headerKeys];
                      for (const k of [...saveKeys, ...(editing ? editKeys : [])]) {
                        if (!keys.includes(k)) keys.push(k);
                      }
                      return keys.map((key) => {
                        const value = (detail.header as Record<string, unknown> | undefined)?.[key];
                        const isEditKey = editing && editKeys.includes(key);
                        const isEmpty = value === null || value === undefined || value === "";
                        if (isEmpty && !isEditKey) return null;
                        if (typeof value === "object" && value !== null) return null;
                        if (isTechnicalField(key)) return null;
                        if (
                          key === "objectName" ||
                          key === "customerName" ||
                          key === "vendorName" ||
                          key === "statusName" ||
                          key === "documentId" ||
                          key === "isLocked"
                        )
                          return null;
                        const headerObj = (detail.header || {}) as Record<string, unknown>;
                        // personSuggest doubles as the top identity block: keep a
                        // dedicated row when objectName takes that slot (or while
                        // editing, where it renders its dropdown).
                        if (key === "personSuggest" && !headerObj.objectName && !editing) return null;
                        // Rate is read-only and shown under its currency while editing.
                        if (key === "rateExchange" && editing) return null;
                        // Prefer resolved names over raw ids/codes.
                        if (key === "statusId" && headerObj.statusName) return null;
                        // purposeId edits through its own dropdown while editing;
                        // otherwise the resolved name row covers it.
                        if (key === "purposeId" && headerObj.purposeName && !editing) return null;
                        if (key === "purposeName" && editing) return null;
                        // objectId edits through its own dropdown while editing;
                        // otherwise the top identity block already shows the name.
                        if (key === "objectId" && headerObj.objectName && !editing) return null;
                        // Display companions duplicate the base field; the base
                        // render already formats dates/numbers.
                        if (key.endsWith("Display") && key.slice(0, -"Display".length) in headerObj)
                          return null;
                        if (key === "currencyName" && "currencyId" in headerObj) return null;

                        const displayVal = isMoneyField(key) ? formatMoneyValue(value) :
                          key.toLowerCase().includes("date") || key.toLowerCase().includes("time")
                            ? formatVietnamDate(value)
                            : String(value);

                        if (editing && (editableHeaderKeys(module) as readonly string[]).includes(key)) {
                          const lookupId = editLookupId(module, key);
                          if (lookupId) {
                            const selected = editChoices[key] ?? null;
                            const isMultiKey = key === "personSuggest" || key === "department";
                            const multiSelected: ErpChoice[] | undefined = isMultiKey
                              ? (editMulti[key] ?? (editHeader[key] ?? "")
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .map((s) => ({ id: s, label: s }) as ErpChoice))
                              : undefined;
                            const knownName =
                              key === "objectId" && typeof headerObj.objectName === "string"
                                ? headerObj.objectName
                                : key === "purposeId" && typeof headerObj.purposeName === "string"
                                  ? headerObj.purposeName
                                  : "";
                            return (
                              <div
                                key={key}
                                className="flex min-w-0 flex-col gap-1.5 py-1"
                              >
                                <LookupField
                                  label={getFieldLabel(key)}
                                  required={(requiredEditKeys(module) as readonly string[]).includes(key)}
                                  module={module}
                                  lookupId={lookupId}
                                  branchId={currentBranch}
                                  value={editHeader[key] ?? ""}
                                  choice={selected}
                                  displayValue={knownName || undefined}
                                  compact
                                  multiple={isMultiKey || undefined}
                                  selected={multiSelected}
                                  onMultiSelect={
                                    isMultiKey
                                      ? (cs) => {
                                        setEditMulti((prev) => ({ ...prev, [key]: cs }));
                                        setEditHeader((prev) => ({
                                          ...prev,
                                          [key]: cs.map((c) => c.id).join(", "),
                                        }));
                                      }
                                      : undefined
                                  }
                                  onSelect={(c) => {
                                    setEditHeader((prev) => ({ ...prev, [key]: c ? c.id : "" }));
                                    setEditChoices((prev) => ({ ...prev, [key]: c }));
                                    if (key === "currencyId") {
                                      const rate = c?.fields?.["RateExchange"];
                                      setEditRate(
                                        typeof rate === "number" && Number.isFinite(rate) && rate > 0
                                          ? String(rate)
                                          : null
                                      );
                                    }
                                  }}
                                />
                                {key === "currencyId" && (
                                  <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                                    <span className="font-semibold">Tỷ giá:</span>{" "}
                                    {editRate ?? String(headerObj.rateExchange ?? "—")} (tự động theo loại tiền)
                                  </p>
                                )}
                              </div>
                            );
                          }
                          const isDate = key.toLowerCase().includes("date");
                          return (
                            <div
                              key={key}
                              className="flex min-w-0 flex-col gap-1.5 py-1"
                            >
                              <span className="text-sm text-brand-600 dark:text-brand-400 font-medium">
                                {getFieldLabel(key)}
                              </span>
                              {isMoneyField(key) ? <MoneyInput value={editHeader[key] ?? ""} onValueChange={value=>setEditHeader(previous=>({...previous,[key]:value}))} /> : <input
                                type={isDate ? "date" : "text"}
                                value={editHeader[key] ?? ""}
                                onChange={(e) =>
                                  setEditHeader((prev) => ({ ...prev, [key]: e.target.value }))
                                }
                                className="mt-0.5 min-h-11 px-3 py-2.5 rounded-lg border border-brand-300 dark:border-brand-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
                              />}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={key}
                            className="flex min-w-0 flex-col gap-1.5 py-1 border-b border-neutral-100 dark:border-neutral-800/60"
                          >
                            <span className="text-sm text-neutral-400 font-medium">{getFieldLabel(key)}</span>
                            <span className="text-neutral-800 dark:text-neutral-200 font-semibold break-words">
                              {displayVal}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                  {editing && (
                    <div className="flex gap-2 pt-1">
                      <UntitledButton
                        variant="primary"
                        size="md"
                        onClick={handleSaveHeader}
                        disabled={executingAction === "save"}
                        iconLeading={<CheckCircle2 className="size-4" />}
                      >
                        {executingAction === "save" ? "Đang lưu..." : "Lưu thay đổi"}
                      </UntitledButton>
                      <UntitledButton variant="secondary-gray" size="md" onClick={() => setEditing(false)}>
                        Hủy sửa
                      </UntitledButton>
                    </div>
                  )}
                </div>

                {/* Lines Table */}
                <div className="min-w-0 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 bg-white dark:bg-neutral-900">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-base font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
                      Chi tiết ({detail.lines?.rows?.length || 0})
                    </h4>
                    <span className="text-sm text-neutral-400 font-medium">
                      Trang {detail.lines?.page || 1}
                    </span>
                  </div>
                  {detail.lines?.rows?.length === 0 ? (
                    <p className="text-base text-neutral-400 py-3 text-center">Chứng từ chưa có chi tiết nào.</p>
                  ) : editing && (saveLineKeys(module) as readonly string[]).length > 0 ? (
                    <>
                      {/* Mobile: editable line cards */}
                      <div className="space-y-4 lg:hidden">
                        {(detail.lines.rows || []).map((row, idx) => {
                          const f = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
                          const d = editLines[row.lineId] || {};
                          const set = (k: string, v: string) => patchEditLine(row.lineId, k, v);
                          const lineKeys = saveLineKeys(module) as readonly string[];
                          const extras = ["model", "budget", "timeRequired", "notes"].filter((k) =>
                            lineKeys.includes(k)
                          );
                          const q = (d.quantity ?? "").trim();
                          const p = (d.unitPrice ?? "").trim();
                          const live =
                            /^\d+(\.\d+)?$/.test(q) && /^\d+(\.\d+)?$/.test(p)
                              ? multiplyMoney(q,p)
                              : null;
                          const inputCls =
                            "mt-0.5 min-h-11 px-3 py-2.5 rounded-lg border border-brand-300 dark:border-brand-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-brand-500 w-full";
                          const itemName = (f.itemName || f.name || "") as string;
                          return (
                            <div
                              key={row.lineId}
                              className="rounded-xl border border-brand-200 dark:border-brand-800/60 p-3 bg-white dark:bg-neutral-900 space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-base font-bold text-neutral-500">Dòng {idx + 1}</span>
                              </div>
                              <div>
                                <label className="block text-sm text-brand-600 dark:text-brand-400 font-medium">
                                  Mã hàng <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={d.itemId ?? ""}
                                  onChange={(e) => set("itemId", e.target.value)}
                                  className={inputCls}
                                />
                              </div>
                              {itemName && (
                                <p className="text-sm text-neutral-500 dark:text-neutral-400">{itemName}</p>
                              )}
                              {extras.length > 0 && (
                                <div className="grid grid-cols-1 gap-2.5">
                                  {extras.map((k) => (
                                    <div key={k}>
                                      <label className="block text-sm text-brand-600 dark:text-brand-400 font-medium">
                                        {getFieldLabel(k)}
                                      </label>
                                      {isMoneyField(k) ? <MoneyInput value={d[k] ?? ""} onValueChange={value=>set(k,value)} className={inputCls} /> : <input
                                        type="text"
                                        inputMode={k === "budget" ? "decimal" : "text"}
                                        value={d[k] ?? ""}
                                        onChange={(e) => set(k, e.target.value)}
                                        className={inputCls}
                                      />}
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                  <label className="block text-sm text-brand-600 dark:text-brand-400 font-medium">
                                    Số lượng <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={d.quantity ?? ""}
                                    onChange={(e) => set("quantity", e.target.value)}
                                    className={inputCls}
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm text-brand-600 dark:text-brand-400 font-medium">
                                    Đơn giá <span className="text-red-500">*</span>
                                  </label>
                                  <MoneyInput
                                    value={d.unitPrice ?? ""}
                                    onValueChange={value => set("unitPrice", value)}
                                    className={inputCls}
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-base">
                                <span className="text-sm text-neutral-400">Tổng giá</span>
                                <span className="font-bold text-brand-700 dark:text-brand-300 font-mono">
                                  {live === null ? "—" : formatMoney(live, docCurrencyId(detail.header))}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Desktop: editable line table */}
                      <div className="overflow-x-auto hidden lg:block">
                        <table className="w-full min-w-[1200px] text-left text-base leading-6 border-collapse [&_th]:whitespace-nowrap [&_th]:font-semibold [&_th]:py-3" data-document-detail-table>
                          <thead>
                            <tr className="border-b border-neutral-200 dark:border-neutral-800 text-sm text-neutral-400 uppercase">
                              <th className="py-2 px-2.5">Mã hàng *</th>
                              <th className="py-2 px-2.5">Tên hàng</th>
                              {(saveLineKeys(module) as readonly string[])
                                .filter((k) => ["model", "budget", "timeRequired", "notes"].includes(k))
                                .map((k) => (
                                  <th key={k} className="py-2 px-2.5">
                                    {getFieldLabel(k)}
                                  </th>
                                ))}
                              <th className="py-2 px-2.5">Số lượng *</th>
                              <th className="py-2 px-2.5">Đơn giá *</th>
                              <th className="py-2 px-2.5 text-right">Tổng giá</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {(detail.lines.rows || []).map((row) => {
                              const f = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
                              const d = editLines[row.lineId] || {};
                              const set = (k: string, v: string) => patchEditLine(row.lineId, k, v);
                              const cellInput =
                                "mt-0.5 min-h-11 px-3 py-2.5 rounded-lg border border-brand-300 dark:border-brand-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-brand-500 w-full min-w-20";
                              const q = (d.quantity ?? "").trim();
                              const p = (d.unitPrice ?? "").trim();
                              const live =
                                /^\d+(\.\d+)?$/.test(q) && /^\d+(\.\d+)?$/.test(p)
                                  ? multiplyMoney(q,p)
                                  : null;
                              const itemName = (f.itemName || f.name || "") as string;
                              const unit = (f.unit || f.unit2 || "") as string;
                              return (
                                <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 align-top">
                                  <td className="py-2 px-2.5">
                                    <input
                                      type="text"
                                      value={d.itemId ?? ""}
                                      onChange={(e) => set("itemId", e.target.value)}
                                      className={`${cellInput} font-mono`}
                                    />
                                  </td>
                                  <td className="py-2.5 px-2.5 font-medium text-neutral-800 dark:text-neutral-200">
                                    <div className="text-base">{itemName || "—"}</div>
                                    {unit && (
                                      <div className="text-sm text-brand-600 dark:text-brand-400 font-medium">
                                        ĐVT: {unit}
                                      </div>
                                    )}
                                  </td>
                                  {(saveLineKeys(module) as readonly string[])
                                    .filter((k) => ["model", "budget", "timeRequired", "notes"].includes(k))
                                    .map((k) => (
                                      <td key={k} className="py-2 px-2.5">
                                        {isMoneyField(k) ? <MoneyInput value={d[k] ?? ""} onValueChange={value=>set(k,value)} className={cellInput} /> : <input
                                          type="text"
                                          inputMode={k === "budget" ? "decimal" : "text"}
                                          value={d[k] ?? ""}
                                          onChange={(e) => set(k, e.target.value)}
                                          className={cellInput}
                                        />}
                                      </td>
                                    ))}
                                  <td className="py-2 px-2.5">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={d.quantity ?? ""}
                                      onChange={(e) => set("quantity", e.target.value)}
                                      className={cellInput}
                                    />
                                  </td>
                                  <td className="py-2 px-2.5">
                                    <MoneyInput
                                      value={d.unitPrice ?? ""}
                                      onValueChange={value => set("unitPrice", value)}
                                      className={cellInput}
                                    />
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right font-bold text-brand-700 dark:text-brand-300 font-mono">
                                    {live === null ? "—" : formatMoney(live, docCurrencyId(detail.header))}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Mobile: stacked cards instead of a wide scrollable table */}
                      <div className="space-y-4 lg:hidden">
                        {detail.lines.rows.map((row, idx) => {
                          const f = (row.fields || row || {}) as Record<string, unknown>;
                          const itemCode = ((f.itemCode || f.itemId || f.assetId || "") as string) || "—";
                          const itemName = (f.itemName || f.name || "") as string;
                          const unit = (f.unit || f.unit2 || "") as string;
                          const qty = (f.quantity || f.setQuantityByDocument || "") as string;
                          const price = f.unitPrice != null ? formatMoneyValue(f.unitPrice) : String(f.unitPriceDisplay || "");
                          const total = lineTotalDisplay(f, docCurrencyId(detail.header));
                          const lineNotes = (f.notes || "") as string;
                          return (
                            <div
                              key={row.lineId}
                              className="rounded-xl border border-neutral-200/80 dark:border-neutral-800 p-3 bg-neutral-50/50 dark:bg-neutral-950/40"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono text-base font-bold text-neutral-900 dark:text-white truncate">
                                  {itemCode}
                                </span>
                                <span className="text-sm text-neutral-400 shrink-0">#{idx + 1}</span>
                              </div>
                              {itemName && (
                                <p className="mt-0.5 text-base text-neutral-600 dark:text-neutral-300 leading-relaxed break-words">
                                  {itemName}
                                </p>
                              )}
                              {unit && <p className="text-sm text-brand-600 dark:text-brand-400 font-medium">ĐVT: {unit}</p>}
                              {lineNotes && (
                                <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400 italic break-words">
                                  {lineNotes}
                                </p>
                              )}
                              {module === "purchase-requests" &&
                                (((f.model || "") as string) ||
                                  ((f.budgetDisplay || f.budget || "") as string) ||
                                  ((f.timeRequired || "") as string)) && (
                                  <div className="mt-3 grid grid-cols-2 gap-4 text-base">
                                    <div className="min-w-0">
                                      <p className="text-sm text-neutral-400">Model</p>
                                      <p className="font-medium text-neutral-700 dark:text-neutral-300 break-words">
                                        {(f.model as string) || "—"}
                                      </p>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm text-neutral-400">Ngân sách</p>
                                      <p className="font-mono text-neutral-700 dark:text-neutral-300 break-words">
                                        {f.budget != null ? formatMoneyValue(f.budget) : String(f.budgetDisplay || "—")}
                                      </p>
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm text-neutral-400">T.gian YC</p>
                                      <p className="font-medium text-neutral-700 dark:text-neutral-300 break-words">
                                        {(f.timeRequired as string) || "—"}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              <div className="mt-2 grid grid-cols-2 gap-2 text-base">
                                <div>
                                  <p className="text-sm text-neutral-400">Số lượng</p>
                                  <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                                    {formatVietnamNumber(qty) || qty || "—"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm text-neutral-400">Đơn giá</p>
                                  <p className="font-mono text-neutral-700 dark:text-neutral-300">{price || "—"}</p>
                                </div>
                              </div>
                              <div className="mt-1.5 pt-1.5 border-t border-neutral-200/70 dark:border-neutral-800 flex flex-wrap gap-2 items-center justify-between">
                                <span className="text-sm text-neutral-400">Tổng giá</span>
                                <span className="text-base font-bold text-brand-700 dark:text-brand-300 font-mono">
                                  {total || "—"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Desktop: full table */}
                      <div className="overflow-x-auto hidden lg:block">
                        <table className="w-full min-w-[1200px] text-left text-base leading-6 border-collapse [&_th]:whitespace-nowrap [&_th]:font-semibold [&_th]:py-3" data-document-detail-table>
                          <thead>
                            <tr className="border-b border-neutral-200 dark:border-neutral-800 text-sm text-neutral-400 uppercase">
                              <th className="py-2 px-2.5">Mã hàng</th>
                              <th className="py-2 px-2.5">Tên hàng</th>
                              {module === "purchase-requests" && (
                                <>
                                  <th className="py-2 px-2.5">Model</th>
                                  <th className="py-2 px-2.5">Ngân sách</th>
                                  <th className="py-2 px-2.5">Thời gian YC</th>
                                </>
                              )}
                              <th className="py-2 px-2.5">Số lượng</th>
                              <th className="py-2 px-2.5">Đơn giá</th>
                              <th className="py-2 px-2.5 text-right">Tổng giá</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {detail.lines.rows.map((row) => {
                              const f = (row.fields || row || {}) as Record<string, unknown>;
                              const itemCode = (f.itemCode || f.itemId || f.assetId || "") as string;
                              const itemName = (f.itemName || f.name || "") as string;
                              const unit = (f.unit || f.unit2 || "") as string;
                              const qty = (f.quantity || f.setQuantityByDocument || "") as string;
                              const price = f.unitPrice != null ? formatMoneyValue(f.unitPrice) : String(f.unitPriceDisplay || "");
                              const total = lineTotalDisplay(f, docCurrencyId(detail.header));
                              const lineNotes = (f.notes || "") as string;
                              return (
                                <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                                  <td className="py-2.5 px-2.5 font-mono text-base font-bold text-neutral-900 dark:text-white">
                                    {itemCode || "—"}
                                  </td>
                                  <td className="py-2.5 px-2.5 font-medium text-neutral-800 dark:text-neutral-200">
                                    <div className="text-base">{itemName || "—"}</div>
                                    {unit && <div className="text-sm text-brand-600 dark:text-brand-400 font-medium">ĐVT: {unit}</div>}
                                    {lineNotes && <div className="text-sm text-neutral-500 dark:text-neutral-400 italic">{lineNotes}</div>}
                                  </td>
                                  {module === "purchase-requests" && (
                                    <>
                                      <td className="py-2.5 px-2.5 text-neutral-700 dark:text-neutral-300">
                                        {(f.model as string) || "—"}
                                      </td>
                                      <td className="py-2.5 px-2.5 text-neutral-700 dark:text-neutral-300 font-mono">
                                        {f.budget != null ? formatMoneyValue(f.budget) : String(f.budgetDisplay || "—")}
                                      </td>
                                      <td className="py-2.5 px-2.5 text-neutral-700 dark:text-neutral-300">
                                        {(f.timeRequired as string) || "—"}
                                      </td>
                                    </>
                                  )}
                                  <td className="py-2.5 px-2.5 text-neutral-700 dark:text-neutral-300 font-semibold">
                                    {formatVietnamNumber(qty) || qty || "—"}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-neutral-700 dark:text-neutral-300 font-mono">
                                    {price || "—"}
                                  </td>
                                  <td className="py-2.5 px-2.5 text-right font-bold text-brand-700 dark:text-brand-300 font-mono">
                                    {total || "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {(() => {
                    const grand = sumLineTotals(detail.lines?.rows || []);
                    const cur = docCurrencyId(detail.header);
                    return grand !== null ? (
                      <div className="mt-3 pt-2.5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-base">
                        <span className="font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                          Tổng cộng ({detail.lines?.rows?.length || 0} dòng)
                        </span>
                        <span className="font-bold text-brand-700 dark:text-brand-300 font-mono">
                          {formatMoney(grand, cur)}{cur ? ` ${cur}` : ""}
                        </span>
                      </div>
                    ) : null;
                  })()}
                  {detail.lines?.hasMore && (
                    <div className="pt-3 text-center border-t border-neutral-100 dark:border-neutral-800/60 mt-3">
                      <button
                        type="button"
                        onClick={handleLoadMoreLines}
                        disabled={loadingMoreLines || editing}
                        className="px-3.5 py-1.5 text-base font-medium rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                      >
                        {loadingMoreLines ? "Đang tải thêm..." : "Tải thêm dòng chi tiết..."}
                      </button>
                    </div>
                  )}
                </div>

                {/* QR Comparison Table (If comparison lines exist - uses canonical fields: itemId, lot, expireDate, storeHouseId, quantity) */}
                {detail.comparison && detail.comparison.rows && detail.comparison.rows.length > 0 && (
                  <div className="min-w-0 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 bg-white dark:bg-neutral-900">
                    <h4 className="text-base font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider mb-2.5">
                      Dòng đối chiếu hàng cần quét ({detail.comparison.rows.length})
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1200px] text-left text-base leading-6 border-collapse [&_th]:whitespace-nowrap [&_th]:font-semibold [&_th]:py-3" data-document-detail-table>
                        <thead>
                          <tr className="border-b border-neutral-200 dark:border-neutral-800 text-sm text-neutral-400 uppercase">
                            <th className="py-2 px-2.5">Mã VT</th>
                            <th className="py-2 px-2.5">Lô SX</th>
                            <th className="py-2 px-2.5">Hạn dùng</th>
                            <th className="py-2 px-2.5">Kho</th>
                            <th className="py-2 px-2.5">Số lượng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                          {detail.comparison.rows.map((row) => {
                            const cf = (row.fields || row || {}) as Record<string, unknown>;
                            const itemId = (cf.itemId || cf.itemCode || row.lineId || "") as string;
                            const lot = (cf.lot || "") as string;
                            const expDate = cf.expireDate ? formatVietnamDate(cf.expireDate) : "";
                            const wh = (cf.storeHouseId || "") as string;
                            const qty = cf.quantity != null ? String(cf.quantity) : "";
                            return (
                              <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                                <td className="py-2 px-2.5 text-neutral-700 dark:text-neutral-300 font-medium font-mono">
                                  {itemId || "—"}
                                </td>
                                <td className="py-2 px-2.5 text-neutral-600 dark:text-neutral-400">
                                  {lot || "—"}
                                </td>
                                <td className="py-2 px-2.5 text-neutral-600 dark:text-neutral-400">
                                  {expDate || "—"}
                                </td>
                                <td className="py-2 px-2.5 text-neutral-600 dark:text-neutral-400">
                                  {wh || "—"}
                                </td>
                                <td className="py-2 px-2.5 text-neutral-700 dark:text-neutral-300 font-semibold font-mono">
                                  {qty ? formatVietnamNumber(qty) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {/* Extra Sections (costs, assets, etc.) */}
                {detail.sections && Object.keys(detail.sections).length > 0 &&
                  Object.entries(detail.sections).map(([secKey, secPage]) => (
                    <div key={secKey} className="min-w-0 rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-6 bg-white dark:bg-neutral-900 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
                          Phần {secKey === "costs" ? "Chi phí" : secKey === "assets" ? "Danh sách máy" : secKey} ({secPage?.rows?.length || 0})
                        </h4>
                        <span className="text-sm text-neutral-400 font-medium">
                          Trang {secPage?.page || 1}
                        </span>
                      </div>
                      {(!secPage || secPage.rows.length === 0) ? (
                        <p className="text-base text-neutral-400 py-2 text-center">Chưa có dữ liệu cho mục này.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[1200px] text-left text-base leading-6 border-collapse [&_th]:whitespace-nowrap [&_th]:font-semibold [&_th]:py-3" data-document-detail-table>
                            <thead>
                              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-sm text-neutral-400 uppercase">
                                <th className="py-2 px-2.5">Mã dòng</th>
                                <th className="py-2 px-2.5">Thông tin chi tiết</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                              {secPage.rows.map((row) => {
                                const rData = (row.fields || row || {}) as Record<string, unknown>;
                                return (
                                  <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                                    <td className="py-2 px-2.5 font-mono text-sm text-neutral-400">{row.lineId}</td>
                                    <td className="py-2 px-2.5 text-neutral-800 dark:text-neutral-200">
                                      {Object.entries(rData).filter(([k]) => !isTechnicalField(k)).map(([k, v]) => (
                                        <span key={k} className="inline-block mr-3 mb-1">
                                          <span className="text-neutral-400 text-sm mr-1">{getFieldLabel(k)}:</span>
                                          <span className="font-semibold text-base">{String(v ?? "—")}</span>
                                        </span>
                                      ))}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
              </>
            )
          ) : null}
        </div>
      </ErpDetailSheet>

      {/* QR CAMERA SCANNER BOTTOM SHEET MODAL */}
      {cameraModalOpen && (
        <UntitledBottomSheet
          open={cameraModalOpen}
          onClose={() => setCameraModalOpen(false)}
          title={cameraScanMode === "add" ? "Quét thêm mã QR" : "Quét xóa mã QR"}
        >
          <div className="space-y-4 p-2 text-xs">
            <div className="relative aspect-square max-w-sm mx-auto overflow-hidden rounded-2xl bg-black border border-neutral-800 flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
              />
              {/* Scanner Reticle Overlay */}
              <div className="absolute inset-0 border-2 border-brand-500/60 rounded-2xl pointer-events-none flex items-center justify-center">
                <div className="size-48 border-2 border-dashed border-brand-400 rounded-xl" />
              </div>
            </div>

            <p className="text-center font-medium text-neutral-600 dark:text-neutral-400">
              {cameraScanStatus}
            </p>

            {/* Manual Barcode Input Fallback */}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
              <label className="text-[11px] font-semibold text-neutral-500">
                Nhập mã thủ công nếu thiết bị không có camera:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  placeholder="Mã ItemID;ItemCode;Lot hoặc PKG1;..."
                  className="flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (manualBarcode.trim()) {
                      handleExecuteQrScan(cameraScanMode, manualBarcode.trim());
                      setCameraModalOpen(false);
                    }
                  }}
                  disabled={!manualBarcode.trim() || qrOperationLoading}
                  className="px-4 py-2 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        </UntitledBottomSheet>
      )}

      {/* CREATE DOCUMENT MODAL (For non-QR modules) */}
      {module === "purchase-orders" && (
        <PurchaseOrderCreateSheet
          open={poCreateOpen}
          onClose={() => setPoCreateOpen(false)}
          currentBranch={currentBranch}
          onCreated={(docId) => {
            setPoCreateOpen(false);
            loadList(1);
            handleOpenDetail(docId);
          }}
        />
      )}

      {module === "purchase-requests" && (
        <PurchaseRequestCreateSheet
          open={prCreateOpen}
          onClose={() => setPrCreateOpen(false)}
          currentBranch={currentBranch}
          onCreated={(docId) => {
            setPrCreateOpen(false);
            loadList(1);
            handleOpenDetail(docId);
          }}
        />
      )}

      {module === "purchase-requests" && prEditId && <PurchaseRequestCreateSheet
        key={`${currentBranch}:${prEditId}`}
        open
        documentId={prEditId}
        currentBranch={currentBranch}
        onClose={() => setPrEditId(null)}
        onSaved={id => {
          setPrEditId(null);
          void loadList(page, true);
          void handleOpenDetail(id);
        }}
      />}

      {createModalOpen && (
        <UntitledBottomSheet
          open={createModalOpen}
          presentation={module === "sales-orders" ? "document" : "sheet"}
          onClose={() => { if (!creatingDocument && !createAttachments.uploading) setCreateModalOpen(false); }}
          title={module === "sales-orders" ? "Tạo đơn hàng" : `Tạo mới ${getModuleTitle(module)}`}
          footer={isSalesOrderMobile ? <div className="flex gap-2">
            <button type="button" disabled={creatingDocument}
              onClick={() => salesOrderCreateStep > 0 && !createLocked ? goToSalesOrderStep(salesOrderCreateStep - 1) : setCreateModalOpen(false)}
              className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-neutral-300 px-4 text-xs font-semibold text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200">
              {salesOrderCreateStep > 0 && !createLocked && <ChevronLeft className="size-4" />}{createLocked ? "Đóng" : salesOrderCreateStep > 0 ? "Quay lại" : "Hủy"}
            </button>
            {salesOrderCreateStep < 2 ? <button type="button" disabled={creatingDocument || customerLoading || createAttachments.validating}
              onClick={() => goToSalesOrderStep(salesOrderCreateStep + 1)}
              className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-50">
              {salesOrderCreateStep === 0 ? "Tiếp: Chi tiết" : "Xem lại"}<ChevronRight className="size-4 shrink-0" />
            </button> : <button type="button" onClick={handleCreateDocument}
              disabled={creatingDocument || createAttachments.validating || (!createLocked && (customerLoading || !!customerError))}
              className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-50">
              {creatingDocument && <Loader2 className="size-4 animate-spin" />}{createAttachments.uploading ? "Đang tải ảnh..." : creatingDocument ? "Đang tạo..." : createdOrderId ? "Thử lại tải ảnh" : pendingOrderCreate ? "Kiểm tra / tiếp tục" : createAttachments.files.length ? "Tạo đơn & tải ảnh" : "Xác nhận tạo đơn"}
            </button>}
          </div> : undefined}
        >
          <div ref={createContentRef} className="min-w-0 space-y-5 text-base leading-6 text-black dark:text-white font-['Segoe_UI',Roboto,Arial,sans-serif] [&_input]:min-h-11! [&_input]:text-base! [&_label]:text-sm! [&_label]:text-black! dark:[&_label]:text-white! [&_textarea]:text-base! [&_button]:min-h-11! [&_button]:text-base!">
            {isSalesOrderMobile && <ol aria-label="Các bước tạo đơn hàng" className="flex items-center gap-1">
              {["Thông tin", "Chi tiết", "Xem lại"].map((label, index) => <li key={label} className="min-w-0 flex-1">
                <button type="button" onClick={() => goToSalesOrderStep(index)} disabled={creatingDocument || createLocked}
                  aria-current={salesOrderCreateStep === index ? "step" : undefined} className="min-h-10 w-full text-left disabled:opacity-50">
                  <span className={`block h-1 rounded-full ${index <= salesOrderCreateStep ? "bg-brand-600" : "bg-neutral-200 dark:bg-neutral-700"}`} />
                  <span className={`mt-1 block text-sm font-semibold ${index === salesOrderCreateStep ? "text-brand-700 dark:text-brand-300" : "text-black"}`}>{index + 1}. {label}</span>
                </button>
              </li>)}
            </ol>}
            {actionFeedback && <p role="status" className="text-sm text-amber-700">{actionFeedback.message}</p>}
            {module === "sales-orders" && createdOrderId && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Đơn {createdOrderId} đã được tạo. Các lần thử tiếp theo chỉ tiếp tục tải ảnh vào đơn này.</p>}
            {module === "sales-orders" && pendingOrderCreate && !creatingDocument && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">Đang giữ lần tạo hiện tại. Bấm Kiểm tra / tiếp tục để xác nhận kết quả trước khi tạo đơn khác.</p>}
            {module === "sales-orders" && <p className="text-black">Chi nhánh: {currentBranch} · Số chứng từ được cấp khi lưu.</p>}
            {showCreateHeader && <fieldset aria-label="Thông tin đơn hàng" disabled={module === "sales-orders" && (creatingDocument || createLocked)} className="min-w-0 space-y-3.5 border-0 p-0">
            {module === "sales-orders" ? (
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className="block text-black mb-1 font-medium">Ngày lập chứng từ (*):</label>
                  <input
                    type="date"
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white text-sm"
                  />
                </div>
                <div className="min-w-0">
                  <label className="block text-black mb-1 font-medium">Ngày giao:</label>
                  <input
                    type="date"
                    value={createDeliverDate}
                    onChange={(e) => setCreateDeliverDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white text-sm"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-black mb-1 font-medium">
                  {module === "purchase-requests" ? "Ngày đề xuất (*):" : "Ngày lập chứng từ (*):"}
                </label>
                <input
                  type="date"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white text-sm"
                />
              </div>
            )}

            {module !== "internal-transfer-batches" && module !== "sales-orders" && (
              <div>
                <label className="block text-black mb-1 font-medium">
                  {module === "purchase-requests"
                    ? "Người đề xuất (*):"
                    : module === "purchase-orders"
                      ? "Mã nhà cung cấp (ObjectId) (*):"
                      : module === "inbound-requests"
                        ? "Số hóa đơn / Số đơn hàng (*):"
                        : module === "internal-transfer-requests"
                          ? "Lý do điều chuyển:"
                          : module === "machine-movements"
                            ? "Mã loại di chuyển (MoveTypeId) (*):"
                            : module === "machine-repairs"
                              ? "Mã loại dịch vụ sửa chữa (ServiceTypeId) (*):"
                              : "Đối tượng / Người liên quan (*):"}
                </label>
                <input
                  type="text"
                  value={createObject}
                  onChange={(e) => setCreateObject(e.target.value)}
                  placeholder={
                    module === "purchase-requests"
                      ? "VD: NV01, Nguyen Van A..."
                      : module === "purchase-orders"
                        ? "Mã NCC (VD: NCC001)..."
                        : module === "inbound-requests"
                          ? "VD: HD00123 / PO001..."
                          : module === "machine-movements"
                            ? "VD: MOVE01..."
                            : module === "machine-repairs"
                              ? "VD: REPAIR01..."
                              : "Nhập thông tin đối tượng..."
                  }
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white text-sm"
                />
              </div>
            )}

            {module === "sales-orders" && (
              <div className="space-y-3.5">
                <LookupField label="Khách hàng" required module="sales-orders" lookupId="header.ObjectID"
                  branchId={currentBranch} value={createObject} choice={createObjectChoice}
                  displayValue={createObject}
                  context={{ ContractID: null }} secondaryFields={["ObjectName", "Address"]}
                  onSelect={selectSoCustomer}
                  placeholder="Chọn khách hàng..." />
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <div className="min-w-0">
                    <label htmlFor="so-create-tax-code" className="block text-black mb-1 font-medium">Mã số thuế</label>
                    <input id="so-create-tax-code" readOnly value={salesOrderField(createObjectChoice, "TaxCode")} className="w-full min-h-11 p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm" />
                  </div>
                  <div className="min-w-0 sm:col-span-2">
                    <label htmlFor="so-create-address" className="block text-black mb-1 font-medium">Địa chỉ khách hàng</label>
                    <textarea id="so-create-address" readOnly rows={2} value={salesOrderField(createObjectChoice, "Address")}
                      className="w-full p-2.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-sm" />
                  </div>
                </div>
                {customerLoading && <p role="status" className="text-sm text-black">Đang tải thông tin khách hàng...</p>}
                {customerError && <p role="alert" className="text-sm text-red-600">{customerError}
                  <button type="button" className="ml-2 underline" onClick={() => setCustomerRetry(v => v + 1)}>Tải lại khách hàng</button></p>}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                  <LookupField label="Mã nhân viên" required module="sales-orders" lookupId="header.EmployeeID"
                    branchId={currentBranch} value={createEmployee} choice={createEmployeeChoice}
                    displayValue={createEmployee}
                    onSelect={(c) => { setCreateEmployeeChoice(c); setCreateEmployee(c ? c.id : ""); }}
                    placeholder="Chọn nhân viên..." />
                  <LookupField label="Mã quản lý" module="sales-orders" lookupId="header.ManagerID"
                    branchId={currentBranch} value={createManager?.id || ""} choice={createManager}
                    secondaryFields={["ManagerName"]} onSelect={setCreateManager} placeholder="Chọn quản lý..." />
                  <LookupField label="Mã hợp đồng" module="sales-orders" lookupId="header.ContractID"
                    branchId={currentBranch} value={createContract} choice={createContractChoice}
                    displayValue={createContract}
                    context={{ ObjectID: createObject || null }}
                    preloadAll={!!createObject} secondaryFields={["ContractName", "ObjectName"]}
                    onSelect={selectSoContract}
                    placeholder="Chọn hợp đồng (không bắt buộc)..." />
                </div>
                <div className="min-w-0">
                  <label htmlFor="so-create-link" className="block text-black mb-1 font-medium">Link tài liệu đính kèm</label>
                  <input id="so-create-link" type="url" value={createLink} onChange={e => setCreateLink(e.target.value)}
                    className="w-full min-h-11 p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm" />
                </div>
              </div>
            )}
            </fieldset>}

            {module !== "sales-orders" && (
              <div className={`grid grid-cols-1 ${module === "machine-movements" || module === "machine-repairs" || module === "internal-transfer-batches" ? "" : module === "internal-transfer-requests" || module === "inbound-requests" ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-2`}>
                <div className={module === "machine-movements" || module === "machine-repairs" || module === "internal-transfer-batches" ? "w-full" : "sm:col-span-1"}>
                  <label className="block text-black mb-1 font-medium">
                    {module === "machine-movements" || module === "machine-repairs"
                      ? "Mã thiết bị / máy (AssetId) (*):"
                      : module === "internal-transfer-batches"
                        ? "Mã đề nghị điều chuyển (RequestId) (*):"
                        : "Mã mặt hàng (ItemID) (*):"}
                  </label>
                  <input
                    type="text"
                    value={createItemId}
                    onChange={(e) => setCreateItemId(e.target.value)}
                    placeholder={
                      module === "machine-movements" || module === "machine-repairs"
                        ? "VD: ASSET01..."
                        : module === "internal-transfer-batches"
                          ? "VD: DNDC001..."
                          : "Mã VT (VD: VT001)..."
                    }
                    className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white text-sm"
                  />
                </div>
                {module !== "machine-movements" && module !== "machine-repairs" && module !== "internal-transfer-batches" && (
                  <div>
                    <label className="block text-black mb-1 font-medium">
                      {module === "internal-transfer-requests"
                        ? "Số lượng yêu cầu (*):"
                        : module === "inbound-requests"
                          ? "Số lượng kiện/hộp (*):"
                          : "Số lượng (*):"}
                    </label>
                    <input
                      type="number"
                      value={createQuantity}
                      onChange={(e) => setCreateQuantity(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white text-sm"
                    />
                  </div>
                )}
                {module !== "machine-movements" && module !== "machine-repairs" && module !== "internal-transfer-batches" && module !== "internal-transfer-requests" && module !== "inbound-requests" && (
                  <div>
                    <label className="block text-black mb-1 font-medium">Đơn giá dự kiến:</label>
                    <MoneyInput
                      value={createUnitPrice}
                      onValueChange={setCreateUnitPrice}
                      className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white text-sm"
                    />
                  </div>
                )}
              </div>
            )}

            {module === "sales-orders" && (!isSalesOrderMobile || salesOrderCreateStep === 1) && (
              <div className="space-y-2">
                {lineResetNotice && <p role="status" className="text-sm text-amber-700">Đã bỏ các chi tiết cũ khi đổi hợp đồng / khách hàng. Vui lòng chọn lại hàng.</p>}
                <fieldset disabled={creatingDocument || createLocked} className="min-w-0 border-0 p-0">
                <SalesOrderLineEditor lines={createSoLines} branchId={currentBranch} contractId={createContract}
                  onPatch={patchSoLine} onAdd={() => {
                    const key = newSoLineKey();
                    setCreateSoLines(prev => [...prev, emptySalesOrderLine(key)]);
                    return key;
                  }} onRemove={key => setCreateSoLines(prev => prev.filter(line => line.key !== key))} />
                </fieldset>
              </div>
            )}

            {module === "sales-orders" ? (showCreateHeader ? <fieldset disabled={creatingDocument || createLocked} className="grid min-w-0 grid-cols-1 gap-3.5 border-0 p-0 sm:grid-cols-2">
              <div><label htmlFor="so-create-memo" className="block text-black mb-1 font-medium">Diễn giải</label>
                <textarea id="so-create-memo" value={createMemo} onChange={e => setCreateMemo(e.target.value)} rows={3}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm" /></div>
              <div><label htmlFor="so-create-order-notes" className="block text-black mb-1 font-medium">Ghi chú đơn hàng</label>
                <textarea id="so-create-order-notes" value={createOrderNotes} onChange={e => setCreateOrderNotes(e.target.value)} rows={3} maxLength={250}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm" /></div>
            </fieldset> : null) : <div>
              <label className="block text-black mb-1 font-medium">Ghi chú / Diễn giải:</label>
              <textarea
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="Ghi chú nội dung phiếu..."
                rows={3}
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-black dark:text-white text-sm"
              />
            </div>}

            {module === "sales-orders" && showCreateHeader && <SalesOrderAttachmentPicker files={createAttachments.files}
              onAdd={createAttachments.addFiles} onRemove={createAttachments.removeFile}
              disabled={creatingDocument || pendingOrderCreate} validating={createAttachments.validating} error={createAttachments.error}
              readOnly={pendingOrderCreate} documentCreated={!!createdOrderId} />}

            {isSalesOrderMobile && salesOrderCreateStep === 2 && <section className="space-y-4 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
              <h4 className="text-sm font-bold uppercase tracking-wider text-black">Xem lại đơn hàng</h4>
              <dl className="grid min-w-0 grid-cols-2 gap-3">
                {[
                  { label: "Ngày chứng từ", value: createDate },
                  { label: "Ngày giao", value: createDeliverDate },
                  { label: "Khách hàng", value: choiceLabel(createObjectChoice, createObject), full: true },
                  { label: "Địa chỉ", value: salesOrderField(createObjectChoice, "Address"), full: true },
                  { label: "Mã số thuế", value: salesOrderField(createObjectChoice, "TaxCode"), full: true },
                  { label: "Hợp đồng", value: choiceLabel(createContractChoice, createContract), full: true },
                  { label: "Nhân viên", value: choiceLabel(createEmployeeChoice, createEmployee) },
                  { label: "Quản lý", value: choiceLabel(createManager, "") },
                  { label: "Link tài liệu đính kèm", value: createLink, full: true },
                  { label: "Diễn giải", value: createMemo, full: true },
                  { label: "Ghi chú đơn hàng", value: createOrderNotes, full: true },
                ].map(field => <div key={field.label} className={`min-w-0 ${field.full ? "col-span-full" : ""}`}>
                  <dt className="mb-1 text-sm text-black">{field.label}</dt>
                  <dd className="whitespace-pre-wrap break-words font-semibold text-black dark:text-white">{field.value || "—"}</dd>
                </div>)}
              </dl>
              <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                <h5 className="font-bold">Chi tiết ({createSoLines.length})</h5>
                {createSoLines.map((line, index) => {
                  const values = salesOrderLineDisplay(line);
                  return <div key={line.key} className="min-w-0 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
                    <p className="break-words font-semibold">{index + 1}. {choiceLabel(line.choice, line.itemId)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-black">
                      <p>Số lượng: <strong className="text-black dark:text-white">{line.quantity} {values.unit}</strong></p>
                      <p>Đơn giá: <strong className="break-words text-black dark:text-white">{formatMoneyValue(line.unitPrice)}</strong></p>
                      <p className="col-span-full">Tổng tiền tạm tính: <strong className="break-words text-black dark:text-white">{formatMoneyValue(values.totalAmount)}</strong></p>
                    </div>
                    {line.dienGiai && <p className="mt-2 break-words text-sm text-black">Diễn giải: {line.dienGiai}</p>}
                    {line.notes && <p className="mt-1 break-words text-sm text-black">Ghi chú: {line.notes}</p>}
                  </div>;
                })}
              </div>
              <SalesOrderAttachmentPicker files={createAttachments.files} onAdd={createAttachments.addFiles}
                onRemove={createAttachments.removeFile} error={createAttachments.error} readOnly={!createdOrderId}
                disabled={creatingDocument} validating={createAttachments.validating} documentCreated={!!createdOrderId} />
            </section>}

            {!isSalesOrderMobile && <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)} disabled={creatingDocument}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-black dark:text-white text-sm"
              >
                {createLocked ? "Đóng" : "Hủy"}
              </button>
              <button
                type="button"
                onClick={handleCreateDocument}
                disabled={creatingDocument || createAttachments.validating || (module === "sales-orders" && !createLocked && (customerLoading || !!customerError))}
                className="px-4 py-2 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 text-sm"
              >
                {module === "sales-orders" ? createAttachments.uploading ? "Đang tải ảnh..." : creatingDocument ? "Đang tạo..." : createdOrderId ? "Thử lại tải ảnh" : pendingOrderCreate ? "Kiểm tra / tiếp tục" : createAttachments.files.length ? "Tạo đơn & tải ảnh" : "Xác nhận tạo đơn" : creatingDocument ? "Đang tạo..." : "Xác nhận tạo chứng từ"}
              </button>
            </div>}
          </div>
        </UntitledBottomSheet>
      )}

      {/* CONTRACT INFO MODAL */}
      {contractInfo && (
        <UntitledBottomSheet
          open={Boolean(contractInfo)}
          onClose={() => setContractInfo(null)}
          title={`Hợp đồng: ${contractInfo.contractId}`}
        >
          <div className="space-y-3 p-2 text-xs">
            <div className="p-3 rounded-2xl bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-900 space-y-1.5">
              <span className="font-semibold text-brand-900 dark:text-brand-300 block">
                Số / Mã hợp đồng: {contractInfo.contractNo || contractInfo.contractId}
              </span>
              {contractInfo.objectName && (
                <p className="text-neutral-700 dark:text-neutral-300">
                  Đối tác: <span className="font-semibold">{contractInfo.objectName}</span>
                </p>
              )}
              {contractInfo.notes && (
                <p className="text-neutral-500">Ghi chú: {contractInfo.notes}</p>
              )}
              {contractInfo.totalAmount && (
                <p className="font-bold text-neutral-900 dark:text-white">
                  Giá trị hợp đồng: {contractInfo.totalAmount}
                </p>
              )}
            </div>
          </div>
        </UntitledBottomSheet>
      )}

      {/* PM SELECTION MODAL */}
      {pmModalOpen && (
        <UntitledBottomSheet
          open={pmModalOpen}
          onClose={() => setPmModalOpen(false)}
          title="Chọn PM để gửi duyệt"
        >
          <div className="space-y-3 p-2 text-xs">
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">
                Chọn người quản lý PM (*):
              </label>
              {loadingPm ? (
                <p className="text-neutral-400 py-2">Đang tải danh sách PM...</p>
              ) : (
                <select
                  value={selectedPmId}
                  onChange={(e) => setSelectedPmId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
                >
                  {pmChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || c.id} ({c.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">Ghi chú gửi duyệt:</label>
              <textarea
                value={pmNotes}
                onChange={(e) => setPmNotes(e.target.value)}
                placeholder="Nội dung lưu ý khi gửi PM..."
                rows={3}
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPmModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmSendPm}
                disabled={!selectedPmId || executingAction === "send-pm"}
                className="px-4 py-2 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {executingAction === "send-pm" ? "Đang gửi..." : "Xác nhận gửi PM"}
              </button>
            </div>
          </div>
        </UntitledBottomSheet>
      )}

      {/* ACTION PROMPT MODAL (For general actions like reject, send-management, approve, dispatch, etc.) */}
      {actionPromptModal.open && actionPromptModal.action && (
        <UntitledBottomSheet
          open={actionPromptModal.open}
          onClose={() => setActionPromptModal({ open: false, action: null, notes: "" })}
          title={`Thao tác: ${actionPromptModal.action.caption}`}
        >
          <div className="space-y-3.5 p-2 text-xs">
            <div className="p-3 rounded-xl bg-brand-50/60 dark:bg-brand-950/30 border border-brand-200/60 dark:border-brand-900/40">
              <p className="text-xs font-semibold text-brand-900 dark:text-brand-300">
                Xác nhận thực hiện thao tác &ldquo;{actionPromptModal.action.caption}&rdquo; trên chứng từ {detail?.documentId}
              </p>
            </div>
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">
                {actionPromptModal.action.id === "reject" ? "Lý do từ chối (*):" : "Ghi chú / Diễn giải:"}
              </label>
              <textarea
                value={actionPromptModal.notes}
                onChange={(e) => setActionPromptModal((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder={
                  actionPromptModal.action.id === "reject"
                    ? "Nhập lý do từ chối (bắt buộc theo quy định ERP)..."
                    : "Ghi chú thêm nếu có (tối đa 1.000 ký tự)..."
                }
                rows={3}
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionPromptModal({ open: false, action: null, notes: "" })}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmPromptAction}
                disabled={executingAction === actionPromptModal.action.id}
                className={`px-4 py-2 rounded-xl text-white font-semibold text-xs disabled:opacity-50 inline-flex items-center gap-1.5 ${actionPromptModal.action.id === "reject"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-brand-600 hover:bg-brand-700"
                  }`}
              >
                {executingAction === actionPromptModal.action.id && (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                )}
                {executingAction === actionPromptModal.action.id ? "Đang xử lý..." : `Xác nhận ${actionPromptModal.action.caption}`}
              </button>
            </div>
          </div>
        </UntitledBottomSheet>
      )}

      {/* RETURN STEP MODAL */}
      {returnStepModalOpen && (
        <UntitledBottomSheet
          open={returnStepModalOpen}
          onClose={() => setReturnStepModalOpen(false)}
          title="Chọn bước gửi về"
        >
          <div className="space-y-3.5 p-2 text-xs">
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">
                Bước / Trạng thái muốn gửi về (*):
              </label>
              {loadingReturnStep ? (
                <p className="text-neutral-400 py-2">Đang tải danh sách bước hợp lệ...</p>
              ) : returnStepChoices.length === 0 ? (
                <p className="text-amber-600 py-2">Không có trạng thái nào đủ điều kiện để quay lại.</p>
              ) : (
                <select
                  value={selectedReturnStatusId}
                  onChange={(e) => setSelectedReturnStatusId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                >
                  {returnStepChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || c.id} (Status {c.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">Lý do gửi về:</label>
              <textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Nhập lý do gửi về..."
                rows={3}
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReturnStepModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmReturnStep}
                disabled={!selectedReturnStatusId || executingAction === "return-step"}
                className="px-4 py-2 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 text-xs"
              >
                {executingAction === "return-step" ? "Đang gửi..." : "Xác nhận gửi về"}
              </button>
            </div>
          </div>
        </UntitledBottomSheet>
      )}

      {/* SEND SA MODAL (internal-transfer-tech) */}
      {sendSaModalOpen && (
        <UntitledBottomSheet
          open={sendSaModalOpen}
          onClose={() => setSendSaModalOpen(false)}
          title="Gửi TP SA duyệt điều chuyển"
        >
          <div className="space-y-3.5 p-2 text-xs">
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">
                TP SA chính (Primary SA - TPAdminHN) (*):
              </label>
              {loadingSendSa ? (
                <p className="text-neutral-400 py-2">Đang tải danh sách SA...</p>
              ) : (
                <select
                  value={selectedPrimarySaId}
                  onChange={(e) => setSelectedPrimarySaId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                >
                  {saChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label || c.id}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">
                TP SA hỗ trợ (Supporting SA - TPAdminHCM) (*):
              </label>
              <select
                value={selectedSupportingSaId}
                onChange={(e) => setSelectedSupportingSaId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
              >
                {saChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label || c.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">Ghi chú kỹ thuật:</label>
              <textarea
                value={sendSaNotes}
                onChange={(e) => setSendSaNotes(e.target.value)}
                placeholder="Ghi chú kết quả kiểm tra thiết bị..."
                rows={3}
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSendSaModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmSendSa}
                disabled={!selectedPrimarySaId || !selectedSupportingSaId || executingAction === "send-sa"}
                className="px-4 py-2 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 text-xs"
              >
                {executingAction === "send-sa" ? "Đang gửi..." : "Xác nhận gửi SA"}
              </button>
            </div>
          </div>
        </UntitledBottomSheet>
      )}
    </div>
  );
}
