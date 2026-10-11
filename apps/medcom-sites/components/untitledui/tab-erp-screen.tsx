"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Send,
  RotateCcw,
  QrCode,
  FileText,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Calendar,
  Building,
  User,
  Info,
  SlidersHorizontal,
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
import { QrCamera } from "@/lib/erp/qr-camera";

interface TabErpScreenProps {
  module: ErpScreenModule;
  currentBranch: string;
  isActive: boolean;
  onOpenScanner?: () => void;
}

function getModuleTitle(mod: ErpScreenModule): string {
  switch (mod) {
    case "purchase-requests":
      return "Đề nghị mua hàng";
    case "sales-orders":
      return "Quản lý đơn hàng bán";
    case "internal-transfer-requests":
      return "Đề nghị điều chuyển nội bộ";
    case "warehouse-qr":
      return "Quét QR xuất kho";
    case "sales-qr":
      return "Quét QR xuất bán hàng";
    case "machine-movements":
      return "Di chuyển bàn giao máy";
    case "machine-repairs":
      return "Sửa chữa bảo hành máy";
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
    k === "createdbyautoid" ||
    k === "modifiedbyautoid"
  );
}

export function TabErpScreen({
  module,
  currentBranch,
  isActive,
  onOpenScanner,
}: TabErpScreenProps) {
  const isQrModule = module === "warehouse-qr" || module === "sales-qr";

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
    let cancelled = false;
    async function loadMeta() {
      setLoadingMeta(true);
      try {
        const meta = await erpClient.getScreenMetadata(module);
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
      } catch (err: unknown) {
        setErrorMsg("Không thể tải danh sách bản ghi từ máy chủ ERP.");
      } finally {
        setIsLoadingList(false);
        setIsRefreshing(false);
      }
    },
    [module, currentBranch, search, dateFrom, dateTo, statusId]
  );

  // Initial load or branch/filter change
  useEffect(() => {
    if (isActive) {
      loadList(1);
    }
  }, [isActive, loadList]);

  // Handle Manual Refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadList(1, true);
  };

  // Open Document Detail
  const handleOpenDetail = async (documentId: string) => {
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
      setDetail(data);
    } catch (err: unknown) {
      setDetailError("Không thể tải chi tiết chứng từ. Vui lòng thử lại.");
    } finally {
      setLoadingDetail(false);
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

  // Open QR Camera Scanner Modal
  const openQrScannerModal = (mode: "add" | "delete") => {
    setCameraScanMode(mode);
    setManualBarcode("");
    setCameraModalOpen(true);
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

  // Execute Action / Command
  const handleAction = async (action: ErpActionState) => {
    if (!action.enabled) {
      setActionFeedback({
        type: "warning",
        message: action.reason || "Nút này hiện đang bị khóa theo quy tắc nghiệp vụ.",
      });
      return;
    }

    if (!detail) return;
    const op = action.id;

    // View Contract Info
    if (op === "contract-info" && (module === "sales-orders" || module === "sales-qr")) {
      setLoadingContract(true);
      try {
        const info = await erpClient.getErpContract(module, {
          branchId: currentBranch,
          documentId: detail.documentId,
        });
        setContractInfo(info);
      } catch {
        setActionFeedback({
          type: "error",
          message: "Không tìm thấy thông tin hợp đồng liên kết với chứng từ này.",
        });
      } finally {
        setLoadingContract(false);
      }
      return;
    }

    // Send PM: Open PM selection dialog
    if (op === "send-pm") {
      setLoadingPm(true);
      setPmModalOpen(true);
      try {
        const pmData = await erpClient.getPmOptions(
          module as "sales-orders" | "internal-transfer-requests",
          {
            branchId: currentBranch,
            role: "primary",
            page: 1,
            pageSize: 50,
          }
        );
        setPmChoices(pmData.items || []);
        if (pmData.items && pmData.items.length > 0) {
          setSelectedPmId(pmData.items[0].id);
        }
      } catch {
        setActionFeedback({
          type: "error",
          message: "Không thể tải danh sách PM đang hoạt động.",
        });
      } finally {
        setLoadingPm(false);
      }
      return;
    }

    // Standard Actions (submit, send-purchase-order, recall, delete)
    setExecutingAction(op);
    setActionFeedback(null);
    const idempotencyKey = `act-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      let res: ErpCommandResult;
      if (op === "delete") {
        res = await erpClient.deleteDocument(module, {
          idempotencyKey,
          branchId: currentBranch,
          documentId: detail.documentId,
          expectedStateToken: detail.stateToken,
        });
      } else {
        res = await erpClient.executeWorkflowAction(
          module,
          op as "submit" | "send-purchase-order" | "recall",
          {
            idempotencyKey,
            branchId: currentBranch,
            documentId: detail.documentId,
            expectedStateToken: detail.stateToken,
            payload: {},
          }
        );
      }

      handleCommandOutcome(res);
    } catch {
      setActionFeedback({
        type: "error",
        message: "Lỗi kết nối khi gửi lệnh thao tác tới máy chủ.",
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

  // Process Command Outcome
  const handleCommandOutcome = (res: ErpCommandResult) => {
    if (res.outcome === "Committed" || res.outcome === "Replayed") {
      setActionFeedback({
        type: "success",
        message: `Thao tác thành công. Biên nhận audit: ${res.receipt?.auditId || "OK"}.`,
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
          "Chức năng ghi dữ liệu đang ở chế độ kiểm soát (503 QualificationRequired). Backend cần nghiệm thu target-qualified writer trước khi ghi thật vào DB.",
      });
    } else {
      setActionFeedback({
        type: "error",
        message: `Lệnh từ chối: [${res.outcome}] ${res.code || ""}`,
      });
    }
  };

  // Handle Create New Document
  const handleCreateDocument = async () => {
    setCreatingDocument(true);
    setActionFeedback(null);
    const idempotencyKey = `crt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const header: Record<string, unknown> = {
        notes: createNotes || null,
      };

      if (module === "purchase-requests") {
        header.purchaseDate = `${createDate}T00:00:00.000`;
        header.personSuggest = createObject || "Nhân viên đề xuất";
      } else {
        header.documentDate = `${createDate}T00:00:00.000`;
        header.objectName = createObject || null;
      }

      const lines = createItemId.trim()
        ? [
            {
              clientLineKey: "line-1",
              values: {
                itemId: createItemId.trim(),
                quantity: createQuantity || "1",
                unitPrice: createUnitPrice || "0",
              },
            },
          ]
        : [];

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
    if (statusFilter === "locked") return r.header?.isLocked === true || r.header?.isLocked === 1;
    if (statusFilter === "open") return r.header?.isLocked === false || r.header?.isLocked === 0;
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

            {!isQrModule && (
              <UntitledButton
                variant="primary"
                size="md"
                onClick={() => setCreateModalOpen(true)}
                iconLeading={<Plus className="size-4" />}
              >
                Tạo mới
              </UntitledButton>
            )}
          </div>

          {/* Filter Chips Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "all", label: "Tất cả", count: rows.length },
              {
                id: "open",
                label: "Đang mở / Chưa khóa",
                count: rows.filter((r) => r.header?.isLocked === false || r.header?.isLocked === 0).length,
              },
              {
                id: "locked",
                label: "Đã khóa / Hoàn tất",
                count: rows.filter((r) => r.header?.isLocked === true || r.header?.isLocked === 1).length,
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
            const dateStr = (h.documentDate || h.purchaseDate || h.datetimeRecorded || "") as string;
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
                    {dateStr && (
                      <p className="text-[11px] text-neutral-400 mt-1.5 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        <span>{dateStr.slice(0, 10)}</span>
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
              {/* Dynamic Action Buttons Toolbar (Print buttons removed per requirement) */}
              {detail.actions &&
                detail.actions.filter(
                  (act) =>
                    act.visible &&
                    !act.id.toLowerCase().includes("print") &&
                    !act.caption.toLowerCase().includes("in")
                ).length > 0 && (
                  <div className="rounded-2xl p-3 bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/70 dark:border-neutral-800">
                    <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
                      Nút thao tác nghiệp vụ:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {detail.actions
                        .filter(
                          (act) =>
                            act.visible &&
                            !act.id.toLowerCase().includes("print") &&
                            !act.caption.toLowerCase().includes("in")
                        )
                        .map((act) => {
                          const isCurrentExecuting = executingAction === act.id;
                          return (
                            <button
                              key={act.id}
                              onClick={() => handleAction(act)}
                              disabled={!act.enabled || Boolean(executingAction)}
                              title={act.reason || undefined}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                                act.enabled
                                  ? "bg-purple-600 hover:bg-purple-700 text-white shadow-xs"
                                  : "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-500 cursor-not-allowed"
                              }`}
                            >
                              {isCurrentExecuting ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : act.id === "delete" ? (
                                <Trash2 className="w-3.5 h-3.5" />
                              ) : act.id === "send-pm" || act.id === "submit" ? (
                                <Send className="w-3.5 h-3.5" />
                              ) : act.id === "recall" ? (
                                <RotateCcw className="w-3.5 h-3.5" />
                              ) : (
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                              )}
                              <span>{act.caption}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}

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
                    <UntitledButton
                      variant="primary"
                      size="md"
                      onClick={() => openQrScannerModal("add")}
                      disabled={qrOperationLoading}
                      iconLeading={<Camera className="size-4" />}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                    >
                      Quét thêm mã QR
                    </UntitledButton>
                    <UntitledButton
                      variant="primary"
                      size="md"
                      onClick={() => openQrScannerModal("delete")}
                      disabled={qrOperationLoading}
                      iconLeading={<Camera className="size-4" />}
                      className="bg-red-600 hover:bg-red-700 text-white shadow-xs"
                    >
                      Quét xóa mã QR
                    </UntitledButton>
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

                {/* Tên đối tượng / Khách hàng / Nhà cung cấp (ObjectName - có thể dài nên bố trí trọn dòng) */}
                {Boolean(
                  detail.header?.objectName ||
                    detail.header?.personSuggest ||
                    detail.header?.customerName ||
                    detail.header?.vendorName
                ) && (
                  <div className="py-2 border-b border-neutral-100 dark:border-neutral-800/60">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold block mb-1">
                      Đối tượng / Khách hàng / Nhà cung cấp (ObjectName)
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

                {/* Chi tiết thuộc tính Header (Lọc bỏ userautoid, frm, menuid, ...) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs pt-1">
                  {Object.entries(detail.header || {}).map(([key, value]) => {
                    if (value === null || value === undefined || value === "") return null;
                    if (isTechnicalField(key)) return null;
                    if (
                      key === "objectName" ||
                      key === "personSuggest" ||
                      key === "customerName" ||
                      key === "vendorName" ||
                      key === "statusName"
                    )
                      return null;

                    return (
                      <div
                        key={key}
                        className="flex flex-col py-1 border-b border-neutral-100 dark:border-neutral-800/60"
                      >
                        <span className="text-[10px] text-neutral-400 font-medium">{key}</span>
                        <span className="text-neutral-800 dark:text-neutral-200 font-semibold break-all">
                          {String(value)}
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-400 uppercase">
                          <th className="py-2 px-2.5">Mã dòng</th>
                          <th className="py-2 px-2.5">Mã VT / Tên hàng</th>
                          <th className="py-2 px-2.5">Số lượng</th>
                          <th className="py-2 px-2.5">Đơn giá / Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {detail.lines.rows.map((row) => {
                          const f = row.fields || {};
                          const itemId = (f.itemId || f.itemCode || f.assetId || "") as string;
                          const itemName = (f.itemName || f.name || "") as string;
                          const qty = (f.quantity || f.setQuantityByDocument || f.amount || "") as string;
                          const price = (f.unitPriceDisplay || f.unitPrice || f.totalPriceDisplay || f.totalPrice || "") as string;
                          return (
                            <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                              <td className="py-2.5 px-2.5 text-[11px] font-mono text-neutral-400">
                                {row.lineId}
                              </td>
                              <td className="py-2.5 px-2.5 font-medium text-neutral-800 dark:text-neutral-200">
                                <div>{itemId || "—"}</div>
                                {itemName && <div className="text-[10px] text-neutral-400">{itemName}</div>}
                              </td>
                              <td className="py-2.5 px-2.5 text-neutral-700 dark:text-neutral-300 font-semibold">
                                {qty || "—"}
                              </td>
                              <td className="py-2.5 px-2.5 text-neutral-700 dark:text-neutral-300 font-mono">
                                {price || "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* QR Comparison Table (If comparison lines exist) */}
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
                          <th className="py-2 px-2.5">Cần xuất</th>
                          <th className="py-2 px-2.5">Đã quét</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {detail.comparison.rows.map((row) => (
                          <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                            <td className="py-2 px-2.5 text-neutral-700 dark:text-neutral-300 font-medium">
                              {String(row.fields?.itemId || row.lineId)}
                            </td>
                            <td className="py-2 px-2.5 text-neutral-700 dark:text-neutral-300 font-semibold">
                              {String(row.fields?.requiredQuantity || "—")}
                            </td>
                            <td className="py-2 px-2.5 text-neutral-700 dark:text-neutral-300 font-semibold">
                              {String(row.fields?.scannedQuantity || "—")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
      {createModalOpen && (
        <UntitledBottomSheet
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title={`Tạo mới ${getModuleTitle(module)}`}
        >
          <div className="space-y-3.5 p-2 text-xs">
            <div>
              <label className="block text-neutral-500 mb-1 font-medium">Ngày lập chứng từ (*):</label>
              <input
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-neutral-500 mb-1 font-medium">
                {module === "purchase-requests" ? "Người đề xuất (*):" : "Tên đối tượng / Khách hàng:"}
              </label>
              <input
                type="text"
                value={createObject}
                onChange={(e) => setCreateObject(e.target.value)}
                placeholder="Nhập tên đối tượng hoặc người đề xuất..."
                className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-1">
                <label className="block text-neutral-500 mb-1 font-medium">Mã mặt hàng (ItemID):</label>
                <input
                  type="text"
                  value={createItemId}
                  onChange={(e) => setCreateItemId(e.target.value)}
                  placeholder="Mã VT..."
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-neutral-500 mb-1 font-medium">Số lượng:</label>
                <input
                  type="number"
                  value={createQuantity}
                  onChange={(e) => setCreateQuantity(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-neutral-500 mb-1 font-medium">Đơn giá dự kiến:</label>
                <input
                  type="number"
                  value={createUnitPrice}
                  onChange={(e) => setCreateUnitPrice(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs"
                />
              </div>
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
            <div className="p-3 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900">
              <span className="font-semibold text-purple-900 dark:text-purple-300">
                Mã HĐ: {contractInfo.contractNo || contractInfo.contractId}
              </span>
              <p className="text-neutral-600 dark:text-neutral-300 mt-1">
                Đối tác: {contractInfo.objectName || "—"} ({contractInfo.objectId || ""})
              </p>
              <p className="text-neutral-500 mt-1">Ghi chú: {contractInfo.notes || "—"}</p>
              {contractInfo.totalAmount && (
                <p className="font-bold text-neutral-900 dark:text-white mt-1">
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
    </div>
  );
}
