"use client";

import { ApiError } from "@/lib/erp/api";
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useEffectEvent } from "react";
import { Trash2, Send, QrCode, CheckCircle2, Camera, X, Pencil, Loader2 } from "lucide-react";
import { ListSkeleton } from "@/components/app/loading-skeleton";
import { erpClient, type ErpDocumentDetail, type ErpActionState, type ErpChoice, type ErpCommandResult, type ErpContractInfo } from "@/lib/erp/erp-client";
import { UntitledBottomSheet } from "@/components/untitledui/bottom-sheet";
import { UntitledButton } from "@/components/untitledui/button";
import { QrCamera } from "@/lib/erp/qr-camera";
import { SalesCommandSession } from "@/lib/erp/sales-order-workflow";
import { attachmentModules, type AttachmentModule } from "@/lib/erp/proxy-policy";
import { getDocumentDetailEntry, type DocumentDetailBodyProps } from "@/lib/erp/document-detail/registry";
import { DocumentDetailView } from "./document-detail/document-detail-view";
import { detailStatus } from "@/lib/erp/document-detail/status";
import { ErpLineEditor } from "./erp-line-editor";
import { ErpFieldLineEditor } from "./erp-field-line-editor";
import { SalesOrderActionDialog } from "./sales-order-action-dialog";
import { InboundPhotoPanel } from "./inbound-photo-panel";
import { InboundCostsPanel } from "./inbound-costs-panel";
import { editableDetailConfig } from "@/lib/erp/document-detail/controllers/erp-detail-model";
import { validDocumentRate } from "@/lib/erp/document-rate";
import type { DetailAction, DocumentDetailHandlers, DocumentDetailModel } from "@/lib/erp/document-detail/model";
import { WRITE_GATED_MODULES, MENU_ACTION_IDS, DIALOG_ACTION_MODULES, SAVE_HEADER_BY_MODULE, editableHeaderKeys, requiredEditKeys, editLookupId, saveLineKeys, editsLineItems, editValue, lockBadgeState, getActionErrorMessage, getActionReasonMessage } from "@/lib/erp/document-detail/controllers/erp-detail-rules";

// Event-only key generation, with the same clock/random evaluation as the original handlers.
function editCommandKey(prefix: "save" | "del" | "act") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const isInboundPhotoModule = (module: string): module is AttachmentModule =>
  (attachmentModules as readonly string[]).includes(module) && module.startsWith("inbound-");

// A 4xx refusal (e.g. invalid_erp_intent) wrote nothing and is not a connection problem.
const actionFailure = (error: unknown) => error instanceof ApiError && error.status >= 400 && error.status < 500
  ? `Hệ thống từ chối thao tác (${error.code}). Chưa có gì thay đổi; kiểm tra lại rồi thử lại.`
  : "Lỗi kết nối khi gửi thao tác tới máy chủ.";

export function ErpDocumentDetailBody({ module, branchId: currentBranch, documentId: selectedDocId,
  onClose, onChanged, onCloseGuardChange, onOpenGuardChange, onEditPurchaseRequest, onDeleted, reloadVersion,
}: DocumentDetailBodyProps) {
  const isQrModule = module === "warehouse-qr" || module === "sales-qr";
  const writesGated = WRITE_GATED_MODULES.has(module);
  const [detail, setDetail] = useState<ErpDocumentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Contract Info Modal
  const [contractInfo, setContractInfo] = useState<ErpContractInfo | null>(null);

  // PM Selection Modal
  const [pmModalOpen, setPmModalOpen] = useState(false);
  const pmChoices: ErpChoice[] = [];
  const [selectedPmId, setSelectedPmId] = useState("");
  const [pmNotes, setPmNotes] = useState("");
  const loadingPm = false;

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


  const openDetailRequestSeqRef = useRef<number>(0);
  // Open Document Detail (Race-free: only applies response for latest requested documentId)
  const handleOpenDetail = useCallback(async (documentId: string) => {
    const seq = ++openDetailRequestSeqRef.current;
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
  }, [module, currentBranch]);

  const invalidateDetailRequest = useCallback(() => { openDetailRequestSeqRef.current++; }, []);
  useEffect(() => {
    let active = true;
    // Start the subscription asynchronously; the existing loader owns all state resets and sequence checks.
    void Promise.resolve().then(() => { if (active) void handleOpenDetail(selectedDocId); });
    return () => { active = false; invalidateDetailRequest(); };
  }, [handleOpenDetail, selectedDocId, reloadVersion, invalidateDetailRequest]);

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

  useLayoutEffect(() => {
    onCloseGuardChange?.(() => {
      if (module === "sales-qr" && (salesQrCommand.pending || salesQrCommand.busy)) {
        setActionFeedback({ type: "warning", message: "Hãy xác nhận kết quả mã QR đang chờ trước khi đóng phiếu." }); return false;
      }
      return true;
    });
    onOpenGuardChange?.(() => {
      if (module === "sales-qr" && (salesQrCommand.pending || salesQrCommand.busy)) {
        setActionFeedback({ type: "warning", message: "Hãy xác nhận kết quả mã QR đang chờ trước khi mở phiếu khác." }); return false;
      }
      return true;
    });
    return () => { onCloseGuardChange?.(null); onOpenGuardChange?.(null); };
  }, [module, salesQrCommand, onCloseGuardChange, onOpenGuardChange]);

  const handleCloseDetail = onClose;

  // Detail action dropdown helpers: inline header edit, delete (two-step
  // confirm), and workflow prompts reuse the existing prompt modal.
  const startEditing = () => {
    if (!detail) return;
    if (module === "purchase-requests") {
      if (!detail.actions.some(action => action.id === "save" && action.visible && action.enabled) || executingAction) return;
      onEditPurchaseRequest?.(detail.documentId);
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
    const idempotencyKey = editCommandKey("save");
    try {
      const edited: Record<string, unknown> = {};
      for (const k of keys) {
        const v = (editHeader[k] ?? "").trim();
        if (k === "purposeId") edited[k] = v ? Number(v) : null;
        else edited[k] = editValue(k, v);
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
          // Item/quantity/price rules apply to editors that change those; recorded-value editors skip them.
          // ERP 29/10: a purchase request line may leave Đơn giá blank until quoted.
          const priceOptional = module === "purchase-requests" && !priceVal;
          if (editsLineItems(module) && (!itemId || !/^\d+(\.\d+)?$/.test(qty) || !priceOptional && !/^\d+(\.\d+)?$/.test(priceVal))) {
            setActionFeedback({
              type: "warning",
              message: module === "purchase-requests" ? "Mỗi dòng cần Mã hàng và Số lượng hợp lệ; Đơn giá để trống hoặc là số không âm." : "Mỗi dòng cần Mã hàng, Số lượng và Đơn giá hợp lệ.",
            });
            setExecutingAction(null);
            return;
          }
          const values: Record<string, unknown> = {};
          let changed = false;
          for (const k of lineKeys) {
            const cur = f[k] == null ? "" : String(f[k]).trim();
            const next = (draft[k] ?? "").trim();
            values[k] = editValue(k, next);
            if (next !== cur) changed = true;
          }
          if (changed) lineChanges.push({ kind: "Update", lineId: row.lineId, values });
        }
      }
      if (module === "purchase-orders" && !validDocumentRate(header.currencyId, header.rateExchange)) {
        // A PO made from a request without a dated rate carries 0 until a rate is chosen.
        setActionFeedback({ type: "warning", message: "Tỷ giá phải lớn hơn 0 (VND là 1). Chọn lại Loại tiền để lấy tỷ giá." });
        setExecutingAction(null);
        return;
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
    const idempotencyKey = editCommandKey("del");
    try {
      const res = await erpClient.deleteDocument(module, {
        idempotencyKey,
        branchId: currentBranch,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
      });
      handleCommandOutcome(res);
      if (res.receipt?.deleted) onDeleted?.();
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
    if (DIALOG_ACTION_MODULES.has(module)) setDialogAction(act);
    else setActionPromptModal({ open: true, action: act, notes: "" });
  };
  // Choice + notes prompt (inbound SA / Kỹ thuật / PM): PM list and return steps come from the API.
  const [dialogAction, setDialogAction] = useState<ErpActionState | null>(null);
  const handleConfirmDialogAction = async (act: ErpActionState, payload: Record<string, unknown>) => {
    if (!detail) return;
    setExecutingAction(act.id);
    setActionFeedback(null);
    try {
      const res = await erpClient.executeWorkflowAction(module, act.id, {
        idempotencyKey: editCommandKey("act"),
        branchId: currentBranch,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        payload,
      });
      if (res.outcome === "Committed" || res.outcome === "Replayed") setDialogAction(null);
      handleCommandOutcome(res);
    } catch (error) {
      setActionFeedback({ type: "error", message: actionFailure(error) });
    } finally {
      setExecutingAction(null);
    }
  };

  const menuActs = writesGated
    ? []
    : (detail?.actions || []).filter(
        (a): a is ErpActionState =>
          a.visible && ((MENU_ACTION_IDS as readonly string[]).includes(a.id)
            // Inbound and transfer step screens: every ERP button of the form (Gửi TP SA, Gửi PM, Chọn bước gửi về…).
            || (module === "inbound-warehouse" || DIALOG_ACTION_MODULES.has(module)) && a.id !== "create" && a.id !== "paste" && !a.id.startsWith("save-"))
      );

  const menuLabel = (act: ErpActionState): string => {
    if (act.id === "save") return editing ? "Lưu thay đổi" : "Sửa thông tin";
    if (act.id === "delete") return deleteArmed ? "Bấm lần nữa để xóa" : "Xóa chứng từ";
    if (act.id === "submit") return "Gửi đề nghị";
    if (act.id === "send-purchase-order") return "Gửi đặt mua hàng";
    if (act.id === "approve") return module === "inbound-bld" && act.caption ? act.caption : "Duyệt";
    if (act.id === "reject") return module === "purchase-approvals" ? "Không duyệt" : module.startsWith("inbound-") && act.caption ? act.caption : "Từ chối";
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
      onChanged();
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
        message: getActionErrorMessage(res.outcome, res.code, res.message),
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
    setCameraScanStatus("Đang mở máy ảnh...");
    setCameraModalOpen(true);
  };

  const cameraScanHandler = useEffectEvent(() => handleExecuteQrScan);
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
    const executeCameraScan = cameraScanHandler();

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
            executeCameraScan(cameraScanMode, code);
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
    } catch (error) {
      setActionFeedback({
        type: "error",
        message: actionFailure(error),
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

  // The former pending-QR button callback; command custody and retry intent are unchanged.
  const recoverQr = async (resend: boolean) => {
    if (salesQrCommand.busy) return;
    setQrOperationLoading(true);
    try { handleCommandOutcome(await (resend ? salesQrCommand.retry() : salesQrCommand.recover())); }
    finally { setQrOperationLoading(false); }
  };

  const entry = getDocumentDetailEntry(module);
  if (!entry) return null;
  const config = editableDetailConfig(entry.config, module, editing);
  const actions: DetailAction[] = menuActs.map(act => ({
    id: act.id, label: menuLabel(act), placement: "menu", visible: true,
    enabled: !(!act.enabled || Boolean(executingAction) || (editing && act.id !== "save")),
    reason: !act.enabled ? getActionReasonMessage(act.reason) : "",
    title: getActionReasonMessage(act.reason) || undefined,
    tone: act.id === "delete" ? "danger" : "default", keepMenuOpen: true, showReason: true,
    icon: act.id === "save" ? <Pencil className="size-4" />
      : act.id === "delete" ? <Trash2 className="size-4" />
        : act.id === "approve" ? <CheckCircle2 className="size-4" />
          : act.id === "reject" ? <X className="size-4" /> : <Send className="size-4" />,
  }));
  if (editing) actions.push(
    { id: "save-header", label: executingAction === "save" ? "Đang lưu..." : "Lưu thay đổi",
      placement: "primary", visible: true, enabled: executingAction !== "save", disableWhileBusy: false,
      icon: <CheckCircle2 className="size-4" /> },
    { id: "discard-edit", label: "Hủy sửa", placement: "primary", tone: "outline",
      visible: true, enabled: true, disableWhileBusy: false },
  );
  const header = detail?.header || {};
  const model: DocumentDetailModel = {
    documentId: detail?.documentId ?? null, header,
    lines: detail?.lines ?? { rows: [], hasMore: false }, sections: detail?.sections ?? undefined,
    comparison: detail?.comparison ? { hasMore: false, rows: detail.comparison.rows.map(row => ({
      ...row, fields: { ...row.fields, itemId: row.fields.itemId || row.fields.itemCode || row.lineId || "" },
    })) } : undefined,
    summary: detail?.summary,
    status: detailStatus(header, detail ? String(header.statusName || (header.isLocked ? "Đã khóa" : "Đang mở")) : null,
      lockBadgeState(header)),
    loading: loadingDetail, error: detailError, editing, dirty: false,
    busy: Boolean(executingAction), draft: editHeader,
    // Preserve the inherited editor's input and cancel availability during commands.
    fieldBusy: false,
    lookupFields: Object.fromEntries(editableHeaderKeys(module).filter(key => editLookupId(module, key)).map(key => {
      const isMultiKey = key === "personSuggest" || key === "department";
      const knownName = key === "objectId" && typeof header.objectName === "string" ? header.objectName
        : key === "purposeId" && typeof header.purposeName === "string" ? header.purposeName : "";
      return [key, { branchId: currentBranch, choice: editChoices[key] ?? null, displayValue: knownName || undefined,
        compact: true, selected: isMultiKey ? (editMulti[key] ?? (editHeader[key] ?? "").split(",").map(s => s.trim())
          .filter(Boolean).map(s => ({ id: s, label: s }) as ErpChoice)) : undefined }];
    })),
    fieldHints: { currencyId: `Tỷ giá: ${editRate ?? String(header.rateExchange ?? "—")} (tự động theo loại tiền)` },
    paginationBusy: loadingMoreLines, paginationDisabled: editing, feedback: actionFeedback, actions,
    busyMessage: "Đang xử lý thao tác, vui lòng chờ phản hồi từ máy chủ...",
    pending: module === "sales-qr" && salesQrCommand.pending ? {
      title: "Chưa xác nhận được lần quét. Kiểm tra kết quả trước khi quét mã khác.", body: "",
      actions: [false, true].map(resend => ({
        id: resend ? "qr-retry" : "qr-recover", label: resend ? "Gửi lại cùng mã" : "Kiểm tra kết quả",
        placement: "primary", visible: true, enabled: !qrOperationLoading, disableWhileBusy: false,
      })),
    } : undefined,
  };
  const handlers: DocumentDetailHandlers = {
    onAction: id => {
      if (id === "save-header") void handleSaveHeader();
      else if (id === "discard-edit") setEditing(false);
      else if (id === "qr-retry" || id === "qr-recover") void recoverQr(id === "qr-retry");
      else {
        const act = menuActs.find(act => act.id === id);
        if (act) handleMenuClick(act);
      }
    },
    onFieldChange: (key, value) => setEditHeader(prev => ({ ...prev, [key]: value })),
    onLookupSelect: (key, c) => {
      setEditHeader(prev => ({ ...prev, [key]: c ? c.id : "" }));
      setEditChoices(prev => ({ ...prev, [key]: c }));
      if (key === "currencyId") {
        const rate = c?.fields?.["RateExchange"];
        setEditRate(typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? String(rate) : null);
      }
    },
    onLookupMultiSelect: (key, cs) => {
      setEditMulti(prev => ({ ...prev, [key]: cs }));
      setEditHeader(prev => ({ ...prev, [key]: cs.map(c => c.id).join(", ") }));
    },
    onLoadMore: section => { if (section === "lines") void handleLoadMoreLines(); },
    onRetry: () => { void handleOpenDetail(selectedDocId); },
  };
  return <>
    <DocumentDetailView config={config} model={model} handlers={handlers} module={module}
      menuLabel="Thao tác chứng từ" menuDisabled={false} menuOpen={menuOpen}
      onMenuOpenChange={open => { setMenuOpen(open); setDeleteArmed(false); }}
      slots={{
        "lines-editor": detail && editing && saveLineKeys(module).length > 0
          ? editsLineItems(module)
            ? <ErpLineEditor module={module} detail={detail} editLines={editLines}
                patchEditLine={patchEditLine} columns={config.lines.columns} />
            : <ErpFieldLineEditor module={module} detail={detail} branchId={currentBranch} editLines={editLines}
                patchEditLine={patchEditLine} columns={config.lines.columns} /> : undefined,
        costs: detail && (module === "inbound-requests" || module === "inbound-costs") ? (
          <InboundCostsPanel module={module} detail={detail} branchId={currentBranch} onSaved={() => handleOpenDetail(detail.documentId)} />
        ) : undefined,
        attachments: detail && isInboundPhotoModule(module) ? (
          <InboundPhotoPanel module={module} branchId={currentBranch} documentId={detail.documentId}
            onUploaded={() => handleOpenDetail(detail.documentId)} />
        ) : undefined,
        "qr-scan": isQrModule && detail ? (
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
                            {[scanAddAct, scanDelAct].find(act => act && !act.enabled && act.reason) && (
                              <p className="col-span-2 text-sm text-neutral-600 dark:text-neutral-400">
                                {getActionReasonMessage([scanAddAct, scanDelAct].find(act => act && !act.enabled && act.reason)!.reason!)}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
        ) : undefined,
      }}
    />

      {/* QR CAMERA SCANNER BOTTOM SHEET MODAL */}
      {cameraModalOpen && (
        <UntitledBottomSheet
          open={cameraModalOpen}
          onClose={() => setCameraModalOpen(false)}
          title={cameraScanMode === "add" ? "Quét thêm mã QR" : "Quét xóa mã QR"}
          subtitle={`${cameraScanMode === "add" ? "Mã quét được thêm vào" : "Mã quét được xóa khỏi"} phiếu ${selectedDocId} trên ERP`}
        >
          <div className="space-y-4 p-2 text-sm">
            <div className="relative aspect-square max-w-sm mx-auto overflow-hidden rounded-2xl bg-neutral-950 flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                muted
                playsInline
              />
              {/* Aiming frame; purely visual, the decoder reads the whole image. */}
              <div aria-hidden="true" className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/80" />
            </div>

            <p role="status" aria-live="polite" className="text-center text-base font-medium text-neutral-700 dark:text-neutral-300">
              {cameraScanStatus}
            </p>

            {/* Manual Barcode Input Fallback */}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
              <label htmlFor="document-scan-manual" className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Hoặc nhập mã thủ công
              </label>
              <div className="flex gap-2">
                <input
                  id="document-scan-manual"
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  placeholder="Mã ItemID;ItemCode;Lot hoặc PKG1;..."
                  className="min-h-11 min-w-0 flex-1 px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-base"
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
                  className="min-h-11 shrink-0 px-4 py-2 rounded-xl bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
                >
                  Xác nhận
                </button>
              </div>
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
                <ListSkeleton label="Đang tải danh sách PM..." />
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

      {dialogAction && detail && (
        <SalesOrderActionDialog
          key={module + ":" + detail.documentId + ":" + dialogAction.id}
          module={module}
          operation={dialogAction.id}
          branchId={currentBranch}
          documentId={detail.documentId}
          busy={executingAction === dialogAction.id}
          title={dialogAction.caption || dialogAction.id}
          intro={`Xác nhận thực hiện "${dialogAction.caption || dialogAction.id}" trên ${module.startsWith("internal-transfer-") ? "chứng từ điều chuyển" : "đề nghị nhập hàng"} ${detail.documentId}.`}
          notesRequired={["reject", "return-step", "cancel-draft"].includes(dialogAction.id)}
          message={actionFeedback && actionFeedback.type !== "success" ? actionFeedback.message : undefined}
          onClose={() => setDialogAction(null)}
          onConfirm={payload => void handleConfirmDialogAction(dialogAction, payload)}
        />
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

  </>;
}
