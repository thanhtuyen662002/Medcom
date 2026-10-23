"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { Plus, AlertCircle, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { erpClient, type ErpScreenModule, type ErpScreenDescription, type ErpDocumentRow, type ErpActionState, type ErpChoice, type ErpCommandResult } from "@/lib/erp/erp-client";
import { UntitledBottomSheet } from "./bottom-sheet";
import { UntitledButton } from "./button";
import { LookupField, choiceLabel } from "./lookup-field";
import { ScreenHeader } from "@/components/app/screen-header";
import { ScreenToolbar } from "@/components/app/screen-toolbar";
import { FilterChips, type FilterChip } from "@/components/app/filter-chips";
import { FilterSheet } from "@/components/app/filter-sheet";
import { RecordList } from "@/components/app/record-list";
import { type RecordColumn } from "@/components/app/record-table";
import { StatusBadge } from "@/components/app/status-badge";
import { ListState } from "@/components/app/list-state";
import { AppButton } from "@/components/app";
import { CreateFab } from "@/components/app/create-fab";
import { ERP_LIST_COLUMNS, erpListText as listText } from "@/lib/erp/list-columns";
import { DocumentDetailDialog } from "@/components/erp/document-detail/document-detail-dialog";
import { getDocumentDetailEntry } from "@/lib/erp/document-detail/registry";
import { PurchaseOrderCreateSheet } from "./purchase-order-create-sheet";
import { PurchaseRequestCreateSheet } from "./purchase-request-create-sheet";
import { resolveSalesOrderCustomer, salesOrderField } from "@/lib/erp/sales-order-lookups";
import { SalesOrderLineEditor } from "@/components/erp/sales-order-line-editor";
import { emptySalesOrderLine, isSalesOrderLineValid, salesOrderLineDisplay, salesOrderLineInput, type SalesOrderDraftLine } from "@/lib/erp/sales-order-lines";
import { useSalesOrderAttachments } from "@/components/erp/use-sales-order-attachments";
import { SalesOrderAttachmentPicker } from "@/components/erp/sales-order-attachment-picker";
import type { ErpDocumentPage } from "@/lib/erp/erp-screen-contracts";

import { useSalesOrderStatuses } from "@/components/erp/sales-order-status-filter";
import { documentStatusLabel } from "@/lib/erp/document-status";
import { formatMoney as formatMoneyValue } from "@/lib/erp/money";
import { MoneyInput } from "@/components/erp/money-input";
import { WRITE_GATED_MODULES, getActionErrorMessage, getActionReasonMessage, formatVietnamDate } from "@/lib/erp/document-detail/controllers/erp-detail-rules";

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


export function TabErpScreen({
  module,
  currentBranch,
  isActive,
  targetDocumentId,
}: TabErpScreenProps) {
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
  const [createFeedback, setCreateFeedback] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // General Action Prompt Modal (Notes / Confirmation)
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
      if (!createLocked) setCreateFeedback(null);
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
      try {
        const meta = await erpClient.getScreenMetadata(module);
        screenMetaCache.set(module, meta);
        if (!cancelled) setScreenMeta(meta);
      } catch (err: unknown) {
        console.warn(`[ErpScreen] Screen metadata for ${module}:`, err);
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
    listSeqRef.current++;
    // The request orphaned above can no longer clear these flags, so hand
    // them over here; a reload below takes them straight back.
    setIsLoadingList(false);
    setIsRefreshing(false);
    setRows([]);
    setPage(1);
    setHasMore(false);
    setSelectedDocId(null);
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

  // Body owns detail reads; selection only opens the registered body.
  const handleOpenDetail = async (documentId: string) => {
    const guard = detailOpenGuard.current ?? detailCloseGuard.current;
    if (documentId !== selectedDocId && guard && !guard()) return;
    setPrEditId(null);
    setSelectedDocId(documentId);
    if (documentId === selectedDocId) setDetailReloadVersion(version => version + 1);
  };

  // Open detail if targetDocumentId is passed
  useEffect(() => {
    if (targetDocumentId && isActive) {
      handleOpenDetail(targetDocumentId);
    }
  }, [targetDocumentId, isActive]);

  const [detailReloadVersion, setDetailReloadVersion] = useState(0);
  const detailCloseGuard = useRef<(() => boolean) | null>(null);
  const detailOpenGuard = useRef<(() => boolean) | null>(null);
  const setDetailCloseGuard = useCallback((guard: (() => boolean) | null) => { detailCloseGuard.current = guard; }, []);
  const setDetailOpenGuard = useCallback((guard: (() => boolean) | null) => { detailOpenGuard.current = guard; }, []);
  const handleCloseDetail = () => {
    if (detailCloseGuard.current && !detailCloseGuard.current()) return;
    setPrEditId(null);
    setSelectedDocId(null);
    setCreateFeedback(null);
  };

  // Process Command Outcome
  const handleCreateCommandOutcome = (res: ErpCommandResult) => {
    if (res.outcome === "Committed" || res.outcome === "Replayed") {
      setCreateFeedback({
        type: "success",
        message: "Thao tác thành công. Dữ liệu chứng từ đã được cập nhật.",
      });
      loadList(page, true);
      if (res.receipt?.deleted) handleCloseDetail();
    } else if (res.outcome === "QualificationRequired") {
      setCreateFeedback({
        type: "warning",
        message:
          "Hệ thống đang ở chế độ kiểm soát an toàn. Dữ liệu chưa được ghi trực tiếp vào cơ sở dữ liệu.",
      });
    } else {
      setCreateFeedback({
        type: "error",
        message: getActionErrorMessage(res.outcome, res.code),
      });
    }
  };


  // Handle Create New Document
  const goToSalesOrderStep = (next: number) => {
    if (creatingDocument || createLocked) return;
    if (next > 0 && (!createDate || !createObject.trim() || !createEmployee.trim() || createOrderNotes.length > 250 || customerLoading || customerError || createAttachments.validating)) {
      setCreateFeedback({ type: "warning", message: customerLoading ? "Đang tải thông tin khách hàng. Vui lòng chờ." :
        customerError || "Nhập ngày chứng từ, chọn khách hàng và mã nhân viên. Ghi chú tối đa 250 ký tự." });
      setSalesOrderCreateStep(0); return;
    }
    if (next > 1 && (!createSoLines.length || !createSoLines.every(isSalesOrderLineValid))) {
      setCreateFeedback({ type: "warning", message: "Chọn mã hàng, nhập số lượng và các giá trị giá/thuế/chiết khấu hợp lệ cho từng dòng." });
      setSalesOrderCreateStep(1); return;
    }
    setCreateFeedback(null); setSalesOrderCreateStep(next);
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
      setCreateFeedback({ type: "warning", message: `Đơn ${documentId} đã tạo. Ảnh đính kèm chưa hoàn tất; bấm Thử lại tải ảnh để tiếp tục trên đơn này.` });
      void loadList(1); return;
    }
    setCreateModalOpen(false); setCreatedOrderId(null); setPendingOrderCreate(false); orderCreateIntent.current = null;
    createAttachments.reset();
    setCreateObject(""); setCreateObjectChoice(null); setCreateContract(""); setCreateContractChoice(null);
    setCreateEmployee(""); setCreateEmployeeChoice(null); setCreateManager(null);
    setCreateMemo(""); setCreateOrderNotes(""); setCreateLink("");
    setCreateDeliverDate(""); setLineResetNotice(false); setCreateSoLines([emptySalesOrderLine(newSoLineKey())]);
    setCreateFeedback({ type: "success", message: `Đã tạo đơn ${documentId}${createAttachments.files.length ? " và tải ảnh đính kèm" : ""}.` });
    void loadList(1); void handleOpenDetail(documentId);
  };

  const handleCreateDocument = async () => {
    if (creatingDocument || createAttachments.validating || createAttachments.uploading || (module === "sales-orders" && !createLocked && (customerLoading || customerError))) return;
    if (isSalesOrderMobile && salesOrderCreateStep !== 2 && !createLocked) { goToSalesOrderStep(2); return; }
    const run = createGeneration.current;
    setCreatingDocument(true);
    setCreateFeedback(null);
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
          handleCreateCommandOutcome(result);
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
          setCreateFeedback({ type: "warning", message: "Nhập ngày chứng từ và ghi chú đơn hàng tối đa 250 ký tự." });
          return;
        }
        const soObject = (createObject || createObjectChoice?.id || "").trim();
        const soEmployee = (createEmployee || createEmployeeChoice?.id || "").trim();
        if (!soObject || !soEmployee) {
          setCreateFeedback({
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
          setCreateFeedback({
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
          handleCreateCommandOutcome(res);
        }
        return;
      }

      if (res.outcome === "Committed" || res.outcome === "Replayed") {
        setCreateModalOpen(false);
      }
      handleCreateCommandOutcome(res);
      loadList(1);
    } catch {
      if (run !== createGeneration.current) return;
      setCreateFeedback({
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

  const salesStatuses = useSalesOrderStatuses({
    module: isSalesOrderModule ? module : null, branchId: currentBranch, isActive,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterSheetId = useId();
  const immediateSearch = useRef(false);
  const cancelSearchDebounce = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current); searchDebounceRef.current = null;
    }
  };
  // Clear updates the controlled value before the existing loadList reads it.
  // Typing retains the screen's 400 ms debounce, without a second toolbar timer.
  useEffect(() => {
    if (!immediateSearch.current) return;
    immediateSearch.current = false;
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current); searchDebounceRef.current = null;
    }
    if (isActive) void loadListRef.current(1);
  }, [search, isActive]);

  const rowStatus = (row: ErpDocumentRow) => isSalesOrderModule
    ? documentStatusLabel(typeof row.header?.statusId === "number" ? row.header.statusId : null, listText(row, "statusName"))
    : listText(row, "statusName") || (row.header?.isLocked ? "Đã khóa" : "Đang mở");
  const statusBadge = (row: ErpDocumentRow) => ({
    label: rowStatus(row),
    statusForeColor: typeof row.header?.statusForeColor === "string" ? row.header.statusForeColor : undefined,
    statusBackColor: typeof row.header?.statusBackColor === "string" ? row.header.statusBackColor : undefined,
  });
  const columnConfig = ERP_LIST_COLUMNS[module];
  const dateColumn = columnConfig.find(column => column.kind === "date")!;
  const dateText = (row: ErpDocumentRow) => {
    const display = listText(row, ...dateColumn.keys.filter(key => key.endsWith("Display")));
    return display || formatVietnamDate(listText(row, ...dateColumn.keys.filter(key => !key.endsWith("Display"))));
  };
  const tableColumns: RecordColumn<ErpDocumentRow>[] = columnConfig.map(column => ({
    id: column.id, label: column.label,
    className: column.kind ? "whitespace-nowrap" : "min-w-40 max-w-sm",
    render: row => column.kind === "document"
      ? <span className="font-mono font-semibold text-brand-700 dark:text-brand-300">{row.documentId}</span>
      : column.kind === "date" ? dateText(row) || "—"
      : column.kind === "status" ? <StatusBadge {...statusBadge(row)} />
      : <span className="line-clamp-2 break-words" title={listText(row, ...column.keys)}>{listText(row, ...column.keys) || "—"}</span>,
  }));
  const objectKeys = columnConfig.find(column => column.id === "object")?.keys ?? [];
  const creatorKeys = columnConfig.find(column => column.id === "creator")?.keys ?? [];

  const serverChips = isApprovalModule ? [
    { value: "all", label: "Tất cả", status: null },
    { value: "pending", label: "Chờ duyệt", status: 2 },
    { value: "approved", label: "Đã duyệt", status: 3 },
    { value: "rejected", label: "Không duyệt", status: 4 },
  ] : [
    { value: "all", label: "Tất cả", status: null },
    { value: "draft", label: "Mới lập", status: 1 },
    { value: "pending", label: "Chờ duyệt", status: 2 },
    { value: "approved", label: "Đã duyệt", status: 3 },
    { value: "returned", label: "Trả về", status: 4 },
    { value: "ordered", label: "Đã gửi ĐMH", status: 5 },
  ];
  const chipItems: FilterChip[] = isSalesOrderModule
    // Lookup provides labels/IDs, not counts across the server result set.
    ? [{ value: "", label: "Tất cả", disabled: !isActive }, ...salesStatuses.choices.map(choice => ({ value: String(choice.id), label: choice.label, disabled: !isActive }))]
    : isSalesModule ? [{ value: "", label: "Tất cả" }]
    : useServerStatusChips ? serverChips.map(chip => ({
      ...chip, count: chip.status === null ? rows.length : rows.filter(row => row.header?.statusId === chip.status).length,
    })) : [
      { value: "all", label: "Tất cả", count: rows.length },
      { value: "open", label: "Đang mở / Chưa khóa", count: rows.filter(row => {
        const locked = row.header?.isLocked ?? (row as Record<string, unknown>).isLocked;
        return locked === false || locked === 0 || locked === "0" || locked == null;
      }).length },
      { value: "locked", label: "Đã khóa / Hoàn tất", count: rows.filter(row => {
        const locked = row.header?.isLocked ?? (row as Record<string, unknown>).isLocked;
        return locked === true || locked === 1 || locked === "1";
      }).length },
    ];
  const selectedStatus = isSalesModule ? (statusId === null ? "" : String(statusId)) : statusFilter;
  const selectStatus = (value: string, size = pageSize) => {
    if (isSalesOrderModule) {
      const next = value === "" ? null : Number(value);
      setStatusId(next); void loadList(1, false, next, size);
    } else if (useServerStatusChips) {
      const chip = serverChips.find(item => item.value === (value || "all"))!;
      setStatusFilter(chip.value); setStatusId(chip.status);
      void loadList(1, false, chip.status, size);
    } else {
      setStatusFilter(value || "all");
      if (page !== 1 || size !== pageSize) void loadList(1, false, undefined, size);
    }
  };
  const openCreate = () => {
    if (module === "purchase-orders") setPoCreateOpen(true);
    else if (module === "purchase-requests") setPrCreateOpen(true);
    else setCreateModalOpen(true);
  };
  const title = screenMeta?.caption || getModuleTitle(module);

  return (
    <div className="min-w-0 space-y-4 pb-24 animate-uui-fade-in">
      <ScreenHeader title={title} branch={currentBranch} />
      <ScreenToolbar
        search={search} onSearchChange={setSearch} debounceMs={null}
        onSearch={value => {
          cancelSearchDebounce();
          if (value === search) void loadList(1);
          else immediateSearch.current = true;
        }}
        onFilter={() => setFiltersOpen(true)} filterOpen={filtersOpen} filterId={filterSheetId}
        filterCount={selectedStatus && selectedStatus !== "all" ? 1 : 0}
        onRefresh={() => void loadList(search.trim() === appliedSearchRef.current ? page : 1)}
        refreshing={isLoadingList || isRefreshing}
        onCreate={isCreateVisible ? openCreate : undefined} createDisabled={!canCreate}
      />
      <div className="min-w-0" aria-busy={isSalesOrderModule && salesStatuses.busy}>
        <FilterChips items={chipItems} value={selectedStatus} onChange={value => selectStatus(value)}
          label={isSalesOrderModule ? "Lọc trạng thái đơn hàng" : "Lọc nhanh trạng thái"}
          // selectStatus sends the status and page 1 together in one server read.
          onPageChange={() => {}} />
        {isSalesOrderModule && salesStatuses.busy && <p role="status" className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"><Loader2 aria-hidden className="size-4 animate-spin" />Đang tải trạng thái...</p>}
        {isSalesOrderModule && !salesStatuses.busy && salesStatuses.failedPage != null
          ? <ListState state="error" error="Chưa tải được danh sách trạng thái." onRetry={salesStatuses.retry} />
          : isSalesOrderModule && salesStatuses.hasMore && <AppButton variant="secondary" disabled={salesStatuses.busy || !isActive} onClick={salesStatuses.loadMore}>Thêm trạng thái</AppButton>}
      </div>
      <FilterSheet id={filterSheetId} open={filtersOpen} onClose={() => setFiltersOpen(false)}
        value={{ status: selectedStatus === "all" ? "" : selectedStatus, pageSize }}
        statuses={chipItems.map(chip => ({ value: chip.value === "all" ? "" : chip.value, label: chip.label }))}
        onApply={value => selectStatus(value.status, value.pageSize)} />
      {isCreateVisible && !canCreate && createActionTooltip && <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /><span>Chưa thể tạo mới: {createActionTooltip}</span>
      </p>}
      <RecordList label={title} rows={displayRows} columns={tableColumns} rowId={row => row.documentId}
        card={row => ({
          code: row.documentId, title: listText(row, ...objectKeys) || listText(row, ...creatorKeys) || "Chứng từ",
          meta: [dateText(row), listText(row, ...creatorKeys)], status: statusBadge(row),
        })}
        onOpen={row => void handleOpenDetail(row.documentId)} loading={isLoadingList}
        error={errorMsg} retainRowsOnError onRetry={() => void loadList(page)}
        empty={{ message: `Chưa có chứng từ phù hợp với bộ lọc tại chi nhánh ${currentBranch}.`,
          onCreate: isCreateVisible && canCreate ? openCreate : undefined }}
        pagination={{ page, pageSize, rowCount: rows.length, visibleRowCount: displayRows.length, hasMore, busy: isLoadingList || isRefreshing,
          onPageChange: nextPage => void loadList(search.trim() === appliedSearchRef.current ? nextPage : 1),
          onPageSizeChange: size => void loadList(1, false, undefined, size) }} />
      <CreateFab allowed={isCreateVisible && !selectedDocId && !createModalOpen && !poCreateOpen && !prCreateOpen && !filtersOpen}
        label={`Tạo ${getModuleTitle(module)}`} onClick={openCreate} disabled={!canCreate} />

      {(() => {
        const entry = getDocumentDetailEntry(module);
        return entry && <DocumentDetailDialog
          presentationAllowed={isActive}
          open={Boolean(selectedDocId) && !prEditId}
          title={entry.config.title}
          closeLabel={entry.config.closeLabel}
          documentNumber={selectedDocId}
          onRequestClose={handleCloseDetail}
        >
          {selectedDocId && <entry.Body
            key={currentBranch + ":" + selectedDocId}
            module={module}
            branchId={currentBranch}
            documentId={selectedDocId}
            onCloseGuardChange={setDetailCloseGuard}
            onOpenGuardChange={setDetailOpenGuard}
            onEditPurchaseRequest={setPrEditId}
            onDeleted={() => loadList(1)}
            reloadVersion={detailReloadVersion}
            onClose={handleCloseDetail}
            onChanged={() => loadList(page, true)}
          />}
        </DocumentDetailDialog>;
      })()}


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
            {createFeedback && <p role="status" className="text-sm text-amber-700">{createFeedback.message}</p>}
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

    </div>
  );
}
