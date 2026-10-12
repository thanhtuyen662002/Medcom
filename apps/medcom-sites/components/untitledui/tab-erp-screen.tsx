"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  QrCode,
  FileText,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Calendar,
  Building,
  User,
  Info,
  Camera,
  X,
  Package,
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
import { PurchaseOrderCreateSheet } from "./purchase-order-create-sheet";
import { QrCamera } from "@/lib/erp/qr-camera";

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
  purchaseDate: "Ngày mua",
  datetimeRecorded: "Thời gian ghi nhận",
  plannedTransferDate: "Ngày chuyển dự kiến",
  batchDate: "Ngày tạo đợt",
  deliverDate: "Ngày giao hàng",
  expireDate: "Hạn sử dụng",
  expireDateByDocument: "Hạn sử dụng theo CT",
  statusId: "Trạng thái",
  statusName: "Tên trạng thái",
  isLocked: "Khóa phiếu",
  objectId: "Mã đối tượng",
  objectName: "Tên đối tượng",
  personSuggest: "Người đề xuất",
  customerName: "Khách hàng",
  vendorName: "Nhà cung cấp",
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
  const [, y, m, d, hh, mm] = match;
  if (hh && mm) return `${d}/${m}/${y} ${hh}:${mm}`;
  return `${d}/${m}/${y}`;
}

function formatVietnamNumber(val: unknown): string {
  if (val === null || val === undefined || val === "") return "";
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return new Intl.NumberFormat("vi-VN").format(num);
}

function parseDecimalText(val: unknown): number | null {
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (typeof val !== "string" || val.trim() === "") return null;
  const num = Number(val.replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : null;
}

// Grand total across detail lines: prefer the server-computed line amount
// (includes VAT/discounts when present), fall back to qty x unit price.
function sumLineTotals(rows: Array<{ fields?: unknown } | Record<string, unknown>>): number | null {
  if (!rows || rows.length === 0) return null;
  let sum = 0;
  let any = false;
  for (const row of rows) {
    const f = ((row as { fields?: unknown }).fields || row || {}) as Record<string, unknown>;
    const server = parseDecimalText(f.amount ?? f.sourceAmount);
    if (server !== null) {
      sum += server;
      any = true;
      continue;
    }
    const qty = parseDecimalText(f.quantity);
    const price = parseDecimalText(f.unitPrice);
    if (qty !== null && price !== null) {
      sum += qty * price;
      any = true;
    }
  }
  return any ? sum : null;
}

// Backend display convention: VND grouped 0 decimals, others 2 decimals.
function formatMoney(n: number, currencyId?: string): string {
  if (!Number.isFinite(n)) return "—";
  if ((currencyId || "").toUpperCase() === "VND")
    return new Intl.NumberFormat("vi-VN").format(Math.round(n));
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function docCurrencyId(header: unknown): string {
  const c = (header as Record<string, unknown> | null | undefined)?.currencyId;
  return typeof c === "string" ? c : "";
}

// Per-line total display: server display string first, then raw server amount,
// then qty x unit price fallback. Never blank when qty and price exist.
function lineTotalDisplay(f: Record<string, unknown>, currencyId?: string): string {
  const display = (f.totalPriceDisplay || f.amountDisplay || "") as string;
  if (typeof display === "string" && display.trim() !== "") return display;
  const raw = parseDecimalText(f.totalPrice ?? f.amount ?? f.sourceAmount);
  if (raw !== null) return formatMoney(raw, currencyId);
  const qty = parseDecimalText(f.quantity);
  const price = parseDecimalText(f.unitPrice);
  if (qty !== null && price !== null) return formatMoney(qty * price, currencyId);
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

const moduleActionsCache = new Map<string, ErpActionState[]>();
const moduleActionsInflight = new Map<string, Promise<ErpActionState[]>>();

function moduleActionsKey(module: ErpScreenModule, branchId: string) {
  return `${module}::${branchId}`;
}

// Screen metadata has no branch dependency: fetch once per module.
// Document lists load lazily once per tab+branch; refresh button and branch
// changes are the explicit reload paths.
const screenMetaCache = new Map<ErpScreenModule, ErpScreenDescription>();
const listLoadedKeys = new Set<string>();

function listLoadedKey(module: ErpScreenModule, branchId: string) {
  return `${module}::${branchId}`;
}

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
  const isCreateVisible = createActionFromApi != null ? createActionFromApi.visible : hasCreate;
  const createActionTooltip = createActionFromApi?.reason ? getActionReasonMessage(createActionFromApi.reason) : undefined;

  // Screen Metadata
  const [screenMeta, setScreenMeta] = useState<ErpScreenDescription | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // List State
  const [rows, setRows] = useState<ErpDocumentRow[]>([]);
  const [page, setPage] = useState(1);
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

  // Create Modal State (for non-QR modules)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  // Redesigned purchase-order create sheet (header + editable line grid).
  const [poCreateOpen, setPoCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [createObject, setCreateObject] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createItemId, setCreateItemId] = useState("");
  const [createQuantity, setCreateQuantity] = useState("1");
  const [createUnitPrice, setCreateUnitPrice] = useState("100000");
  const [creatingDocument, setCreatingDocument] = useState(false);

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

  // Load Document List
  const loadList = useCallback(
    async (targetPage = 1, silent = false) => {
      if (!silent) setIsLoadingList(true);
      setErrorMsg(null);
      try {
        const result = await erpClient.getErpModuleList(module, {
          branchId: currentBranch,
          page: targetPage,
          pageSize: 20,
          search: search.trim() || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          statusId: statusId !== null ? statusId : undefined,
        });
        setRows(result.rows || []);
        setPage(result.page);
        setHasMore(result.hasMore);
        listLoadedKeys.add(listLoadedKey(module, currentBranch));
      } catch (err: unknown) {
        setErrorMsg("Không thể tải danh sách bản ghi từ máy chủ ERP.");
      } finally {
        setIsLoadingList(false);
        setIsRefreshing(false);
      }
    },
    [module, currentBranch, search, dateFrom, dateTo, statusId]
  );

  // Lazily load once per tab+branch; revisit via refresh button or branch change.
  useEffect(() => {
    if (isActive && !listLoadedKeys.has(listLoadedKey(module, currentBranch))) {
      loadList(1);
    }
  }, [isActive, module, currentBranch, loadList]);

  // Handle Manual Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadList(1, true);
  };

  const openDetailRequestSeqRef = useRef<number>(0);

  // Invalidate in-flight reads when branch changes (FE-14)
  useEffect(() => {
    openDetailRequestSeqRef.current++;
    setSelectedDocId(null);
    setDetail(null);
    setDetailError(null);
  }, [currentBranch]);

  // Open Document Detail (Race-free: only applies response for latest requested documentId)
  const handleOpenDetail = async (documentId: string) => {
    const seq = ++openDetailRequestSeqRef.current;
    setSelectedDocId(documentId);
    setLoadingDetail(true);
    setDetailError(null);
    setActionFeedback(null);
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
  const handleCloseDetail = () => {
    setSelectedDocId(null);
    setDetail(null);
    setDetailError(null);
    setActionFeedback(null);
    setContractInfo(null);
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
    setQrOperationLoading(true);
    setActionFeedback(null);
    const idempotencyKey = `qr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const res = await erpClient.scanQr(module as "warehouse-qr" | "sales-qr", actionType, {
        idempotencyKey,
        branchId: currentBranch,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        barcode: barcodeValue.trim(),
      });
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
  const handleCreateDocument = async () => {
    setCreatingDocument(true);
    setActionFeedback(null);
    const idempotencyKey = `crt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
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
        header.documentDate = `${createDate}T00:00:00.000`;
        header.objectId = createObject || "KH01";
        header.employeeId = "NV01";
        header.isOrder = true;
        header.currencyId = "VND";
        header.rateExchange = 1.0;
        header.memo = createNotes || "Đơn hàng bán";
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

      const res = await erpClient.createDocument(module, {
        idempotencyKey,
        branchId: currentBranch,
        header,
        lines,
      });

      setCreateModalOpen(false);
      handleCommandOutcome(res);
      loadList(1);
    } catch {
      setActionFeedback({
        type: "error",
        message: "Lỗi kết nối khi tạo mới chứng từ ERP.",
      });
    } finally {
      setCreatingDocument(false);
    }
  };

  // Filter rows locally if needed
  const displayRows = rows.filter((r) => {
    const isLocked = r.header?.isLocked ?? (r as Record<string, unknown>).isLocked;
    if (statusFilter === "locked") return isLocked === true || isLocked === 1 || isLocked === "1";
    if (statusFilter === "open") return isLocked === false || isLocked === 0 || isLocked === "0" || isLocked == null;
    return true;
  });

  return (
    <div className="space-y-4 pb-24 animate-uui-fade-in">
      {/* Module Banner (No technical menu IDs or form names) */}
      <div className="rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                Phân hệ ERP
              </span>
              <span className="text-xs text-neutral-400">Chi nhánh: {currentBranch}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white mt-1">
              {screenMeta?.caption || getModuleTitle(module)}
            </h2>
          </div>
        </div>

        {/* Toolbar: Search, Refresh, Create (Synchronized with PO, PR, Inbound) */}
        <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2.5">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadList(1)}
                placeholder="Tìm theo mã chứng từ, người lập, đối tượng..."
                className="w-full pl-9 pr-4 py-2.5 text-xs sm:text-sm rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
              />
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing || isLoadingList}
              className="p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition-colors shrink-0 disabled:opacity-50"
              title="Làm mới danh sách"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin text-purple-600" : ""}`} />
            </button>

            {isCreateVisible && (
              <UntitledButton
                variant="primary"
                size="md"
                onClick={() =>
                  module === "purchase-orders" ? setPoCreateOpen(true) : setCreateModalOpen(true)
                }
                disabled={!canCreate}
                title={createActionTooltip}
                iconLeading={<Plus className="size-4" />}
              >
                Tạo mới
              </UntitledButton>
            )}
          </div>
          {isCreateVisible && !canCreate && createActionTooltip && (
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <AlertCircle className="size-3.5 shrink-0" />
              <span>Chưa thể tạo mới: {createActionTooltip}</span>
            </p>
          )}

          {/* Filter Chips Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "all", label: "Tất cả", count: rows.length },
              {
                id: "open",
                label: "Đang mở / Chưa khóa",
                count: rows.filter((r) => {
                  const isLocked = r.header?.isLocked ?? (r as Record<string, unknown>).isLocked;
                  return isLocked === false || isLocked === 0 || isLocked === "0" || isLocked == null;
                }).length,
              },
              {
                id: "locked",
                label: "Đã khóa / Hoàn tất",
                count: rows.filter((r) => {
                  const isLocked = r.header?.isLocked ?? (r as Record<string, unknown>).isLocked;
                  return isLocked === true || isLocked === 1 || isLocked === "1";
                }).length,
              },
            ].map((chip) => {
              const isSelected = statusFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setStatusFilter(chip.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 shrink-0 ${
                    isSelected
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 border border-neutral-200/80 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span>{chip.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isSelected
                        ? "bg-purple-700 text-white"
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
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl bg-neutral-100 dark:bg-neutral-800/50 animate-pulse border border-neutral-200/60 dark:border-neutral-800/80"
              />
            ))}
          </div>
        ) : displayRows.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 text-center">
            <Info className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
            <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
              Không có chứng từ nào
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              Chưa có bản ghi nào phù hợp với bộ lọc hiện tại tại chi nhánh {currentBranch}.
            </p>
          </div>
        ) : (
          displayRows.map((row) => {
            const h = row.header || {};
            const docId = row.documentId;
            const dateDisplay = (h.documentDateDisplay || h.purchaseDateDisplay || h.datetimeRecordedDisplay || "") as string;
            const rawDate = (h.documentDate || h.purchaseDate || h.datetimeRecorded || "") as string;
            const dateText = dateDisplay || (rawDate ? formatVietnamDate(rawDate) : "");
            const statusName = (h.statusName || (h.isLocked ? "Đã khóa" : "Đang mở")) as string;
            const objectName = (h.objectName || h.personSuggest || h.orderNumber || h.customerName || h.vendorName || "") as string;

            return (
              <div
                key={docId}
                onClick={() => handleOpenDetail(docId)}
                className="group cursor-pointer rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 p-4 hover:border-purple-300 dark:hover:border-purple-800/60 transition-all shadow-xs hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white font-mono">
                        {docId}
                      </span>
                      {statusName && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
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
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        <span>{dateText}</span>
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-purple-600 transition-colors shrink-0 mt-1" />
                </div>
              </div>
            );
          })
        )}

        {/* Pagination Info */}
        {hasMore && (
          <div className="pt-2 text-center">
            <button
              onClick={() => loadList(page + 1)}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              Tải thêm trang tiếp theo...
            </button>
          </div>
        )}
      </div>

      {/* DETAIL BOTTOM SHEET MODAL (No nested double scroll cut-off, padded pb-16) */}
      <UntitledBottomSheet
        open={Boolean(selectedDocId)}
        onClose={handleCloseDetail}
        title={`Chi tiết: ${selectedDocId || ""}`}
      >
        <div className="space-y-4 pb-16">
          {/* Action Feedback Banner */}
          {actionFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                actionFeedback.type === "success"
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

          {loadingDetail ? (
            <div className="space-y-3 py-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-600" />
              <p className="text-xs text-neutral-500">Đang tải đầy đủ trường chi tiết từ ERP...</p>
            </div>
          ) : detailError ? (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {detailError}
            </div>
          ) : detail ? (
            <>
              {/* QR Scanner Controls for warehouse-qr / sales-qr: Replaced input box with 2 camera buttons */}
              {isQrModule && (
                <div className="p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-purple-600" />
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
                            disabled={qrOperationLoading || !canScanAdd}
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
                            disabled={qrOperationLoading || !canScanDel}
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
              <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-neutral-100 dark:border-neutral-800">
                  <div className="space-y-0.5">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
                      Mã chứng từ
                    </span>
                    <p className="font-mono text-sm sm:text-base font-bold text-neutral-900 dark:text-white">
                      {detail.documentId}
                    </p>
                  </div>
                  <div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-900/40">
                      {String(detail.header?.statusName || (detail.header?.isLocked ? "Đã khóa" : "Đang mở"))}
                    </span>
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
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold block mb-1">
                      Đối tượng / Khách hàng / Nhà cung cấp
                    </span>
                    <p className="text-xs sm:text-sm font-bold text-neutral-900 dark:text-white leading-relaxed break-words">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs pt-1">
                  {Object.entries(detail.header || {}).map(([key, value]) => {
                    if (value === null || value === undefined || value === "") return null;
                    if (typeof value === "object") return null;
                    if (isTechnicalField(key)) return null;
                    if (
                      key === "objectName" ||
                      key === "personSuggest" ||
                      key === "customerName" ||
                      key === "vendorName" ||
                      key === "statusName" ||
                      key === "documentId" ||
                      key === "branchId"
                    )
                      return null;

                    const displayVal =
                      key.toLowerCase().includes("date") || key.toLowerCase().includes("time")
                        ? formatVietnamDate(value)
                        : String(value);

                    return (
                      <div
                        key={key}
                        className="flex flex-col py-1 border-b border-neutral-100 dark:border-neutral-800/60"
                      >
                        <span className="text-[10px] text-neutral-400 font-medium">{getFieldLabel(key)}</span>
                        <span className="text-neutral-800 dark:text-neutral-200 font-semibold break-all">
                          {displayVal}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lines Table */}
              <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
                    Dòng hàng chi tiết ({detail.lines?.rows?.length || 0})
                  </h4>
                  <span className="text-[10px] text-neutral-400 font-medium">
                    Trang {detail.lines?.page || 1}
                  </span>
                </div>
                {detail.lines?.rows?.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-3 text-center">Chứng từ chưa có dòng hàng nào.</p>
                ) : (
                  <>
                    {/* Mobile: stacked cards instead of a wide scrollable table */}
                    <div className="space-y-2 md:hidden">
                      {detail.lines.rows.map((row, idx) => {
                        const f = (row.fields || row || {}) as Record<string, unknown>;
                        const itemCode = ((f.itemCode || f.itemId || f.assetId || "") as string) || "—";
                        const itemName = (f.itemName || f.name || "") as string;
                        const unit = (f.unit || f.unit2 || "") as string;
                        const qty = (f.quantity || f.setQuantityByDocument || "") as string;
                        const price = (f.unitPriceDisplay || f.unitPrice || "") as string;
                        const total = lineTotalDisplay(f, docCurrencyId(detail.header));
                        const lineNotes = (f.notes || "") as string;
                        return (
                          <div
                            key={row.lineId}
                            className="rounded-xl border border-neutral-200/80 dark:border-neutral-800 p-3 bg-neutral-50/50 dark:bg-neutral-950/40"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-neutral-900 dark:text-white truncate">
                                {itemCode}
                              </span>
                              <span className="text-[10px] text-neutral-400 shrink-0">#{idx + 1}</span>
                            </div>
                            {itemName && (
                              <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed break-words">
                                {itemName}
                              </p>
                            )}
                            {unit && <p className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">ĐVT: {unit}</p>}
                            {lineNotes && (
                              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400 italic break-words">
                                {lineNotes}
                              </p>
                            )}
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <p className="text-[10px] text-neutral-400">Số lượng</p>
                                <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                                  {formatVietnamNumber(qty) || qty || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-neutral-400">Đơn giá</p>
                                <p className="font-mono text-neutral-700 dark:text-neutral-300">{price || "—"}</p>
                              </div>
                            </div>
                            <div className="mt-1.5 pt-1.5 border-t border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between">
                              <span className="text-[10px] text-neutral-400">Tổng giá</span>
                              <span className="text-xs font-bold text-purple-700 dark:text-purple-300 font-mono">
                                {total || "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Desktop: full table */}
                    <div className="overflow-x-auto hidden md:block">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-400 uppercase">
                            <th className="py-2 px-2.5">Mã hàng</th>
                            <th className="py-2 px-2.5">Tên hàng</th>
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
                            const price = (f.unitPriceDisplay || f.unitPrice || "") as string;
                            const total = lineTotalDisplay(f, docCurrencyId(detail.header));
                            const lineNotes = (f.notes || "") as string;
                            return (
                              <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                                <td className="py-2.5 px-2.5 font-mono text-xs font-bold text-neutral-900 dark:text-white">
                                  {itemCode || "—"}
                                </td>
                                <td className="py-2.5 px-2.5 font-medium text-neutral-800 dark:text-neutral-200">
                                  <div className="text-xs">{itemName || "—"}</div>
                                  {unit && <div className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">ĐVT: {unit}</div>}
                                  {lineNotes && <div className="text-[11px] text-neutral-500 dark:text-neutral-400 italic">{lineNotes}</div>}
                                </td>
                                <td className="py-2.5 px-2.5 text-neutral-700 dark:text-neutral-300 font-semibold">
                                  {formatVietnamNumber(qty) || qty || "—"}
                                </td>
                                <td className="py-2.5 px-2.5 text-neutral-700 dark:text-neutral-300 font-mono">
                                  {price || "—"}
                                </td>
                                <td className="py-2.5 px-2.5 text-right font-bold text-purple-700 dark:text-purple-300 font-mono">
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
                    <div className="mt-3 pt-2.5 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
                      <span className="font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                        Tổng cộng ({detail.lines?.rows?.length || 0} dòng)
                      </span>
                      <span className="font-bold text-purple-700 dark:text-purple-300 font-mono">
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
                      disabled={loadingMoreLines}
                      className="px-3.5 py-1.5 text-xs font-medium rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/80 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {loadingMoreLines ? "Đang tải thêm..." : "Tải thêm dòng chi tiết..."}
                    </button>
                  </div>
                )}
              </div>

              {/* QR Comparison Table (If comparison lines exist - uses canonical fields: itemId, lot, expireDate, storeHouseId, quantity) */}
              {detail.comparison && detail.comparison.rows && detail.comparison.rows.length > 0 && (
                <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900">
                  <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider mb-2.5">
                    Dòng đối chiếu hàng cần quét ({detail.comparison.rows.length})
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-400 uppercase">
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
                  <div key={secKey} className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider">
                        Phần {secKey === "costs" ? "Chi phí" : secKey === "assets" ? "Danh sách máy" : secKey} ({secPage?.rows?.length || 0})
                      </h4>
                      <span className="text-[10px] text-neutral-400 font-medium">
                        Trang {secPage?.page || 1}
                      </span>
                    </div>
                    {(!secPage || secPage.rows.length === 0) ? (
                      <p className="text-xs text-neutral-400 py-2 text-center">Chưa có dữ liệu cho mục này.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-400 uppercase">
                              <th className="py-2 px-2.5">Mã dòng</th>
                              <th className="py-2 px-2.5">Thông tin chi tiết</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {secPage.rows.map((row) => {
                              const rData = (row.fields || row || {}) as Record<string, unknown>;
                              return (
                                <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                                  <td className="py-2 px-2.5 font-mono text-[11px] text-neutral-400">{row.lineId}</td>
                                  <td className="py-2 px-2.5 text-neutral-800 dark:text-neutral-200">
                                    {Object.entries(rData).filter(([k]) => !isTechnicalField(k)).map(([k, v]) => (
                                      <span key={k} className="inline-block mr-3 mb-1">
                                        <span className="text-neutral-400 text-[10px] mr-1">{getFieldLabel(k)}:</span>
                                        <span className="font-semibold text-xs">{String(v ?? "—")}</span>
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
          ) : null}
        </div>
      </UntitledBottomSheet>

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
              <div className="absolute inset-0 border-2 border-purple-500/60 rounded-2xl pointer-events-none flex items-center justify-center">
                <div className="size-48 border-2 border-dashed border-purple-400 rounded-xl" />
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
                  className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50"
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

      {createModalOpen && (
        <UntitledBottomSheet
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title={`Tạo mới ${getModuleTitle(module)}`}
        >
          <div className="space-y-3.5 p-2 text-xs">
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">
                {module === "purchase-requests" ? "Ngày đề xuất (*):" : "Ngày lập chứng từ (*):"}
              </label>
              <input
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
              />
            </div>

            {module !== "internal-transfer-batches" && (
              <div>
                <label className="block text-neutral-500 mb-1 font-medium">
                  {module === "purchase-requests"
                    ? "Người đề xuất (*):"
                    : module === "sales-orders"
                    ? "Mã khách hàng / Đối tác (ObjectId) (*):"
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
                      : module === "sales-orders"
                      ? "Mã KH hoặc đối tác (VD: KH001)..."
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
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                />
              </div>
            )}

            <div className={`grid grid-cols-1 ${module === "machine-movements" || module === "machine-repairs" || module === "internal-transfer-batches" ? "" : module === "internal-transfer-requests" || module === "inbound-requests" ? "sm:grid-cols-2" : "sm:grid-cols-3"} gap-2`}>
              <div className={module === "machine-movements" || module === "machine-repairs" || module === "internal-transfer-batches" ? "w-full" : "sm:col-span-1"}>
                <label className="block text-neutral-500 mb-1 font-medium">
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
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                />
              </div>
              {module !== "machine-movements" && module !== "machine-repairs" && module !== "internal-transfer-batches" && (
                <div>
                  <label className="block text-neutral-500 mb-1 font-medium">
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
                    className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                  />
                </div>
              )}
              {module !== "machine-movements" && module !== "machine-repairs" && module !== "internal-transfer-batches" && module !== "internal-transfer-requests" && module !== "inbound-requests" && (
                <div>
                  <label className="block text-neutral-500 mb-1 font-medium">Đơn giá dự kiến:</label>
                  <input
                    type="number"
                    value={createUnitPrice}
                    onChange={(e) => setCreateUnitPrice(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-neutral-500 mb-1 font-medium">Ghi chú / Diễn giải:</label>
              <textarea
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
                placeholder="Ghi chú nội dung phiếu..."
                rows={3}
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 text-xs"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateDocument}
                disabled={creatingDocument}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 text-xs"
              >
                {creatingDocument ? "Đang tạo..." : "Xác nhận tạo chứng từ"}
              </button>
            </div>
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
            <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900 space-y-1.5">
              <span className="font-semibold text-purple-900 dark:text-purple-300 block">
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
                className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50"
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
            <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-900/40">
              <p className="text-xs font-semibold text-purple-900 dark:text-purple-300">
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
                className={`px-4 py-2 rounded-xl text-white font-semibold text-xs disabled:opacity-50 ${
                  actionPromptModal.action.id === "reject"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-purple-600 hover:bg-purple-700"
                }`}
              >
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
                className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 text-xs"
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
                className="px-4 py-2 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 text-xs"
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
