"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, AlertCircle, ImagePlus, Link2, Loader2, RefreshCw, Save, Search, Undo2, X } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type {
  ErpActionState,
  ErpChoice,
  ErpCommandResult,
  ErpContractInfo,
  ErpDocumentDetail,
} from "@/lib/erp/erp-screen-contracts";
import { LookupField, fieldText } from "@/components/untitledui/lookup-field";
import { UntitledBottomSheet } from "@/components/untitledui/bottom-sheet";
import { buildSalesOrderSaveHeader } from "@/lib/erp/sales-order-form";

/* ------------------------------------------------------------------ */
/* Quản lý đơn hàng (sales-orders) — bố cục theo form desktop ERP:     */
/* Số CT / Ngày CT / Mã hợp đồng / Mã quản lý / Mã nhân viên /         */
/* Khách hàng (+Tên, Địa chỉ) / Ngày giao / Trạng thái / Link TLDK /   */
/* Diễn giải / Ghi chú + panel Tài liệu đính kèm + Dòng hàng chi tiết. */
/* Nút "..." của desktop = hộp chọn tra cứu (LookupField).             */
/* ------------------------------------------------------------------ */

const LOOKUPS = {
  contractId: "header.ContractID",
  managerId: "header.ManagerID",
  employeeId: "header.EmployeeID",
  objectId: "header.ObjectID",
} as const;

function text(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function isoDate(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 10) : "";
}

function outcomeMessage(res: ErpCommandResult): { type: "success" | "error" | "warning"; message: string } {
  switch (res.outcome) {
    case "Committed":
    case "Replayed":
      return { type: "success", message: "Thao tác thành công. Dữ liệu chứng từ đã được cập nhật." };
    case "Conflict":
      return { type: "error", message: "Trạng thái chứng từ đã thay đổi. Vui lòng tải lại rồi thử lại." };
    case "Denied":
      return { type: "error", message: "Tài khoản hiện tại không có quyền thực hiện thao tác này." };
    case "InvalidInput":
      return { type: "error", message: "Thông tin chưa hợp lệ hoặc thiếu trường bắt buộc." };
    case "QualificationRequired":
      return { type: "warning", message: "Hệ thống đang ở chế độ kiểm soát an toàn, chưa ghi trực tiếp." };
    default:
      return { type: "error", message: res.code ? `Thao tác không thành công (${res.code}).` : "Thao tác không thành công." };
  }
}

function reasonMessage(reason?: string | null): string {
  switch (reason) {
    case "native_permission_or_hidden": return "Chưa được phân quyền hoặc bị ẩn theo quy tắc ERP.";
    case "save_document_first": return "Vui lòng lưu chứng từ trước.";
    case "state_or_assignment_not_allowed": return "Trạng thái hiện tại không cho phép thao tác này.";
    case "erp_write_unqualified": return "Hệ thống đang ở chế độ bảo vệ dữ liệu.";
    default: return reason || "";
  }
}

interface Draft {
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

const EMPTY_DRAFT: Draft = {
  documentDate: "", contractId: "", managerId: "", employeeId: "", objectId: "",
  deliverDate: "", memo: "", ghiChuDonHang: "", linkId: "", documentUrl: "",
};

export function SalesOrderForm({
  branchId,
  documentId,
  onClose,
  onChanged,
}: {
  branchId: string;
  documentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [docId, setDocId] = useState(documentId);
  const [quickFind, setQuickFind] = useState("");
  const [detail, setDetail] = useState<ErpDocumentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [choices, setChoices] = useState<Record<string, ErpChoice | null>>({});
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  // Ảnh đính kèm: xem trước file máy + link lưu vào documentUrl.
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [localOnlyWarn, setLocalOnlyWarn] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  // Modal hợp đồng / PM / thu hồi.
  const [contract, setContract] = useState<ErpContractInfo | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [pmOpen, setPmOpen] = useState(false);
  const [pmItems, setPmItems] = useState<ErpChoice[]>([]);
  const [pmSearch, setPmSearch] = useState("");
  const [pmId, setPmId] = useState("");
  const [pmNotes, setPmNotes] = useState("");
  const [recallOpen, setRecallOpen] = useState(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setFeedback(null);
    setLocalPreview(null);
    setLocalOnlyWarn(false);
    try {
      const data = await erpClient.getErpModuleDetail("sales-orders", {
        branchId, documentId: id, page: 1, pageSize: 50,
      });
      setDetail(data);
      const h = (data.header || {}) as Record<string, unknown>;
      setDraft({
        documentDate: isoDate(h.documentDate),
        contractId: text(h.contractId),
        managerId: text(h.managerId),
        employeeId: text(h.employeeId),
        objectId: text(h.objectId),
        deliverDate: isoDate(h.deliverDate),
        memo: text(h.memo),
        ghiChuDonHang: text(h.ghiChuDonHang),
        linkId: text(h.linkId),
        documentUrl: text(h.documentUrl),
      });
      setChoices({});
    } catch {
      setDetail(null);
      setError("Không thể tải chi tiết đơn hàng. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { void load(docId); }, [docId, load]);
  useEffect(() => { setDocId(documentId); }, [documentId]);

  const set = (k: keyof Draft, v: string) => setDraft((p) => ({ ...p, [k]: v }));
  const pick = (k: string, c: ErpChoice | null) => {
    setChoices((p) => ({ ...p, [k]: c }));
    set(k as keyof Draft, c ? c.id : "");
  };

  const header = (detail?.header || {}) as Record<string, unknown>;
  const customerName = choices.objectId?.label || text(header.objectName) || "";
  const customerAddr =
    text((choices.objectId?.fields as Record<string, unknown> | undefined)?.address) ||
    text(header.address) || "";
  const statusName = text(header.statusName) || "—";
  const actions = detail?.actions || [];
  const act = (id: string): ErpActionState | undefined => actions.find((a) => a.id === id);
  const previewUrl = localPreview || draft.documentUrl.trim();

  function onFile(file: File | undefined) {
    if (!file) return;
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(URL.createObjectURL(file));
    setLocalOnlyWarn(true);
  }

  async function handleSave() {
    if (!detail || saving) return;
    if (!draft.documentDate.trim() || !draft.objectId.trim() || !draft.employeeId.trim()) {
      setFeedback({ type: "warning", message: "Vui lòng nhập đủ Ngày CT, Khách hàng và Mã nhân viên trước khi lưu." });
      return;
    }
    const headerDto = buildSalesOrderSaveHeader(
      (detail.header || {}) as Record<string, unknown>, draft,
    );
    setSaving(true);
    setFeedback(null);
    try {
      const res = await erpClient.saveDocument("sales-orders", {
        idempotencyKey: `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        branchId,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        header: headerDto,
        lineChanges: [],
      });
      const fb = outcomeMessage(res);
      setFeedback(fb);
      if (res.outcome === "Committed" || res.outcome === "Replayed") {
        onChanged();
        await load(detail.documentId);
      }
    } catch {
      setFeedback({ type: "error", message: "Lỗi kết nối khi lưu đơn hàng." });
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!detail) return;
    const h = (detail.header || {}) as Record<string, unknown>;
    setDraft({
      documentDate: isoDate(h.documentDate),
      contractId: text(h.contractId),
      managerId: text(h.managerId),
      employeeId: text(h.employeeId),
      objectId: text(h.objectId),
      deliverDate: isoDate(h.deliverDate),
      memo: text(h.memo),
      ghiChuDonHang: text(h.ghiChuDonHang),
      linkId: text(h.linkId),
      documentUrl: text(h.documentUrl),
    });
    setChoices({});
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    setLocalOnlyWarn(false);
    setFeedback(null);
  }

  async function runAction(op: string, payload: Record<string, unknown>) {
    if (!detail || acting) return;
    setActing(op);
    setFeedback(null);
    try {
      const res = await erpClient.executeWorkflowAction("sales-orders", op, {
        idempotencyKey: `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        branchId,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        payload,
      });
      const fb = outcomeMessage(res);
      setFeedback(fb);
      if (res.outcome === "Committed" || res.outcome === "Replayed") {
        onChanged();
        await load(detail.documentId);
      }
    } catch {
      setFeedback({ type: "error", message: "Lỗi kết nối khi gửi thao tác tới máy chủ." });
    } finally {
      setActing(null);
    }
  }

  async function openContract() {
    if (!detail) return;
    try {
      const info = await erpClient.getErpContract("sales-orders", { branchId, documentId: detail.documentId });
      setContract(info);
      setContractOpen(true);
    } catch {
      setFeedback({ type: "error", message: "Không thể tải thông tin hợp đồng." });
    }
  }

  async function openPm() {
    if (!detail) return;
    setPmOpen(true);
    setPmId("");
    try {
      const page = await erpClient.getPmOptions("sales-orders", { branchId, role: "primary", page: 1, pageSize: 20, search: pmSearch.trim() || null });
      setPmItems(page.items || []);
    } catch {
      setPmItems([]);
    }
  }

  const saveAct = act("save");
  const recallAct = act("recall");
  const sendPmAct = act("send-pm");
  const contractAct = act("contract-info");
  const canSave = !saving && (!saveAct || saveAct.enabled);

  const inputCls = "w-full p-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-xs";
  const labelCls = "block text-neutral-500 dark:text-neutral-400 mb-1 font-medium text-[11px]";
  const roCls = "w-full p-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white text-xs font-semibold";

  return (
    <div className="space-y-3">
      {/* Thanh công cụ: Tìm nhanh + Lưu / Không lưu */}
      <div className="flex flex-wrap items-end gap-2 p-3 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <div className="flex-1 min-w-36">
          <label className={labelCls}>Tìm nhanh</label>
          <div className="flex gap-1.5">
            <input value={quickFind} onChange={(e) => setQuickFind(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && quickFind.trim()) setDocId(quickFind.trim()); }}
              placeholder="Số chứng từ..." className={inputCls} />
            <button type="button" aria-label="Tìm chứng từ"
              onClick={() => { if (quickFind.trim()) setDocId(quickFind.trim()); }}
              className="px-2.5 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300">
              <Search className="size-4" />
            </button>
          </div>
        </div>
        <button type="button" onClick={() => void handleSave()} disabled={!canSave || !detail}
          title={saveAct?.reason ? reasonMessage(saveAct.reason) : undefined}
          className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
          {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
        <button type="button" onClick={handleDiscard} disabled={!detail}
          className="px-4 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold">
          Không lưu
        </button>
      </div>

      {feedback && (
        <div role="status" className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
          feedback.type === "success"
            ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50"
            : feedback.type === "warning"
            ? "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50"
            : "bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50"}`}>
          {feedback.type === "success" ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center">
          <RefreshCw className="size-6 animate-spin mx-auto text-brand-600" />
          <p className="text-xs text-neutral-500 mt-2">Đang tải đơn hàng...</p>
        </div>
      ) : error || !detail ? (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
          {error ?? "Không có dữ liệu."}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
          {/* Cột trái: thông tin chứng từ */}
          <div className="p-3 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2.5">
              <div>
                <label className={labelCls}>Số CT</label>
                <p className="font-mono text-sm font-bold text-neutral-900 dark:text-white">{detail.documentId}</p>
              </div>
              <div>
                <label className={labelCls}>Ngày CT</label>
                <input type="date" value={draft.documentDate} onChange={(e) => set("documentDate", e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2.5">
              <LookupField label="Mã hợp đồng" module="sales-orders" lookupId={LOOKUPS.contractId}
                branchId={branchId} value={draft.contractId} choice={choices.contractId ?? null}
                displayValue={draft.contractId} onSelect={(c) => pick("contractId", c)} compact placeholder="Chọn hợp đồng..." />
              <div>
                <label className={labelCls}>Chi nhánh</label>
                <p className={roCls}>{text(header.branchId) || branchId}</p>
              </div>
            </div>
            <LookupField label="Mã quản lý" module="sales-orders" lookupId={LOOKUPS.managerId}
              branchId={branchId} value={draft.managerId} choice={choices.managerId ?? null}
              displayValue={draft.managerId} onSelect={(c) => pick("managerId", c)} compact placeholder="Chọn quản lý..." />
            <LookupField label="Mã nhân viên" required module="sales-orders" lookupId={LOOKUPS.employeeId}
              branchId={branchId} value={draft.employeeId} choice={choices.employeeId ?? null}
              displayValue={draft.employeeId} onSelect={(c) => pick("employeeId", c)} compact placeholder="Chọn nhân viên..." />
            <LookupField label="Khách hàng" required module="sales-orders" lookupId={LOOKUPS.objectId}
              branchId={branchId} value={draft.objectId} choice={choices.objectId ?? null}
              displayValue={draft.objectId} onSelect={(c) => pick("objectId", c)} compact placeholder="Chọn khách hàng..." />
            <div>
              <label className={labelCls}>Tên kh/hàng</label>
              <p className={`${roCls} uppercase`}>{customerName || "—"}</p>
            </div>
            <div>
              <label className={labelCls}>Địa chỉ</label>
              <p className={roCls}>{customerAddr || "—"}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Ngày giao</label>
                <input type="date" value={draft.deliverDate} onChange={(e) => set("deliverDate", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Mã trạng thái</label>
                <p className={roCls}>{statusName}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-2.5">
              <div>
                <label className={labelCls}>Mở TLDK</label>
                <button type="button" disabled={!draft.linkId.trim()}
                  onClick={() => { const u = draft.linkId.trim(); if (/^https?:\/\//i.test(u)) window.open(u, "_blank", "noopener"); }}
                  className="w-full px-2 py-2 rounded-xl border border-brand-300 dark:border-brand-800 text-brand-700 dark:text-brand-300 text-xs font-bold disabled:opacity-40 inline-flex items-center justify-center gap-1">
                  <Link2 className="size-3.5" /> Mở TLDK
                </button>
              </div>
              <div>
                <label className={labelCls}>Link TLDK</label>
                <input value={draft.linkId} onChange={(e) => set("linkId", e.target.value)} placeholder="Dán link tài liệu..." className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Diễn giải</label>
              <input value={draft.memo} onChange={(e) => set("memo", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Ghi chú</label>
              <input value={draft.ghiChuDonHang} onChange={(e) => set("ghiChuDonHang", e.target.value)} className={inputCls} />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" disabled={!sendPmAct?.enabled || !!acting}
                title={sendPmAct?.reason ? reasonMessage(sendPmAct.reason) : undefined}
                onClick={() => void openPm()}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                {acting === "send-pm" && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
                {acting === "send-pm" ? "Đang gửi..." : "Gửi PM"}
              </button>
              <button type="button" disabled={!recallAct?.enabled || !!acting}
                title={recallAct?.reason ? reasonMessage(recallAct.reason) : undefined}
                onClick={() => setRecallOpen(true)}
                className="px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-bold disabled:opacity-50 inline-flex items-center gap-1.5">
                <Undo2 className="size-3.5" /> Thu hồi để sửa
              </button>
              <button type="button" disabled={!contractAct?.enabled}
                title={contractAct?.reason ? reasonMessage(contractAct.reason) : undefined}
                onClick={() => void openContract()}
                className="px-3 py-2 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 text-xs font-bold disabled:opacity-50">
                Xem thông tin hợp đồng
              </button>
            </div>
            {sendPmAct && !sendPmAct.enabled && (
              <p className="text-[11px] text-neutral-400">Gửi PM: {reasonMessage(sendPmAct.reason) || "không khả dụng ở trạng thái này."}</p>
            )}
          </div>

          {/* Cột phải: tài liệu đính kèm */}
          <div className="p-3 rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2 h-fit">
            <p className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">Tài liệu đính kèm</p>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 aspect-[4/3] flex items-center justify-center overflow-hidden">
              {previewUrl && /^https?:\/\//i.test(previewUrl) || localPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={localPreview || previewUrl} alt="Tài liệu đính kèm" className="w-full h-full object-contain" />
              ) : (
                <span className="text-sm font-bold text-red-500">Không có hình ảnh</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <input ref={captureRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <div className="grid grid-cols-3 gap-1.5">
              <button type="button" onClick={() => captureRef.current?.click()}
                className="px-1 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-[11px] font-semibold inline-flex items-center justify-center gap-1">
                <Camera className="size-3.5" /> Chụp ảnh
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="px-1 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-[11px] font-semibold inline-flex items-center justify-center gap-1">
                <ImagePlus className="size-3.5" /> Chọn ảnh
              </button>
              <button type="button" onClick={() => { set("documentUrl", ""); if (localPreview) URL.revokeObjectURL(localPreview); setLocalPreview(null); setLocalOnlyWarn(false); }}
                className="px-1 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-[11px] font-semibold inline-flex items-center justify-center gap-1">
                <X className="size-3.5" /> Xóa ảnh
              </button>
            </div>
            <input value={draft.documentUrl} onChange={(e) => set("documentUrl", e.target.value)}
              placeholder="Dán link ảnh để lưu..." className={inputCls} />
            {localOnlyWarn && (
              <p className="text-[10px] text-amber-600">Ảnh từ máy chỉ xem trước — dán link ảnh vào ô trên để Lưu.</p>
            )}
          </div>
        </div>
      )}

      {/* Dòng hàng chi tiết + Lịch sử gửi/duyệt (tab như desktop) */}
      {detail && detail.lines && (
        <DetailTabs
          lines={(detail.lines.rows || []).map((row) => ({
            lineId: row.lineId,
            fields: ((row as { fields?: unknown }).fields || {}) as Record<string, unknown>,
          }))}
          history={(((detail as unknown as { history?: unknown }).history || {}) as {
            rows?: Array<{ lineId: string; fields?: Record<string, unknown> }>;
          }).rows || []}
        />
      )}

      {/* Modal hợp đồng */}
      <UntitledBottomSheet open={contractOpen} onClose={() => setContractOpen(false)} title="Thông tin hợp đồng">
        <div className="p-2 text-xs space-y-2">
          {!contract ? <p className="text-neutral-400">Không có dữ liệu.</p> : (
            <>
              <p><span className="text-neutral-400">Mã hợp đồng: </span><strong>{text(contract.contractNo || contract.contractId)}</strong></p>
              {contract.objectName && <p><span className="text-neutral-400">Khách hàng: </span><strong>{text(contract.objectName)}</strong></p>}
              {contract.totalAmount && <p><span className="text-neutral-400">Tổng tiền: </span><strong>{text(contract.totalAmount)}</strong></p>}
              {contract.notes && <p><span className="text-neutral-400">Ghi chú: </span>{text(contract.notes)}</p>}
            </>
          )}
        </div>
      </UntitledBottomSheet>

      {/* Modal gửi PM */}
      <UntitledBottomSheet open={pmOpen} onClose={() => setPmOpen(false)} title="Gửi PM phê duyệt">
        <div className="p-2 text-xs space-y-2.5">
          <input value={pmSearch} onChange={(e) => setPmSearch(e.target.value)} placeholder="Tìm PM..."
            onKeyDown={(e) => { if (e.key === "Enter") void openPm(); }} className={inputCls} />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {pmItems.map((p) => (
              <button key={p.id} type="button" onClick={() => setPmId(p.id)}
                className={`w-full text-left px-3 py-2 rounded-xl border text-xs ${pmId === p.id ? "border-brand-600 font-bold" : "border-neutral-200 dark:border-neutral-700"}`}>
                {fieldText(p.label) || p.id}
              </button>
            ))}
            {pmItems.length === 0 && <p className="text-neutral-400 text-center py-2">Không có PM nào.</p>}
          </div>
          <textarea value={pmNotes} onChange={(e) => setPmNotes(e.target.value)} rows={2}
            placeholder="Ghi chú gửi PM..." className={inputCls} />
          <button type="button" disabled={!pmId || !!acting} onClick={() => { setPmOpen(false); void runAction("send-pm", { pmId, notes: pmNotes.trim() || null }); }}
            className="w-full py-2.5 rounded-xl bg-brand-600 text-white font-bold disabled:opacity-50">
            Xác nhận gửi PM
          </button>
        </div>
      </UntitledBottomSheet>

      {/* Modal thu hồi */}
      <UntitledBottomSheet open={recallOpen} onClose={() => setRecallOpen(false)} title="Thu hồi để sửa">
        <div className="p-2 text-xs space-y-3">
          <p>Thu hồi đơn hàng <strong>{detail?.documentId}</strong> về trạng thái cho phép sửa?</p>
          <button type="button" disabled={!!acting}
            onClick={() => { setRecallOpen(false); void runAction("recall", {}); }}
            className="w-full py-2.5 rounded-xl bg-red-600 text-white font-bold disabled:opacity-50">
            Xác nhận thu hồi
          </button>
        </div>
      </UntitledBottomSheet>
    </div>
  );
}

/* Lưới dòng hàng theo đúng cột desktop + tab Lịch sử gửi/duyệt. */
const LINE_COLUMNS: Array<{ key: string; label: string; num?: boolean }> = [
  { key: "itemId", label: "Mã hàng" },
  { key: "mfgItemId", label: "Mã hàng NSX" },
  { key: "itemName", label: "Tên hàng / dịch vụ" },
  { key: "unit", label: "ĐVT" },
  { key: "quantity", label: "Số lượng", num: true },
  { key: "unit2", label: "ĐVT2" },
  { key: "unitFactor", label: "Hệ số ĐVT", num: true },
  { key: "quantity2", label: "Số lượng 2", num: true },
  { key: "unitPrice", label: "Đơn giá", num: true },
  { key: "amount", label: "Số tiền", num: true },
  { key: "discountPercent", label: "% Chiết khấu", num: true },
  { key: "discountAmount", label: "Tiền CK", num: true },
  { key: "vATPercent", label: "% Thuế", num: true },
  { key: "vATAmount", label: "Tiền thuế", num: true },
  { key: "totalAmount", label: "Tổng tiền", num: true },
  { key: "soLuongHopDong", label: "Tổng số lượng HĐ", num: true },
  { key: "deliveryQuantity", label: "Đã XUẤT hàng", num: true },
  { key: "vATQuantity", label: "Số lượng VAT", num: true },
  { key: "dienGiai", label: "Diễn giải" },
  { key: "notes", label: "Ghi chú" },
  { key: "property", label: "Qui cách" },
  { key: "property2", label: "Qui cách 2" },
];

function lineCell(f: Record<string, unknown>, key: string): string {
  if (key === "mfgItemId") return text(f.mfgItemId ?? f.manufacturerItemId) || "—";
  if (key === "itemName") return text(f.itemName ?? f.itemDisplay ?? f.name) || "—";
  if (key === "unit") return text(f.unit ?? f.unit1 ?? f.unit2) || "—";
  return text(f[key]) || "—";
}

function DetailTabs({
  lines,
  history,
}: {
  lines: Array<{ lineId: string; fields: Record<string, unknown> }>;
  history: Array<{ lineId: string; fields?: Record<string, unknown> }>;
}) {
  const [tab, setTab] = useState<"lines" | "history">("lines");
  const th = "py-2 px-2 whitespace-nowrap";
  const td = "py-2 px-2 whitespace-nowrap";
  return (
    <div className="rounded-2xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-neutral-900">
      <div className="flex gap-1 p-2 border-b border-neutral-100 dark:border-neutral-800" role="tablist" aria-label="Chi tiết đơn hàng">
        {([["lines", `Thông tin chi tiết (${lines.length})`], ["history", "Lịch sử gửi / duyệt"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${tab === id ? "bg-brand-600 text-white" : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "lines" ? (
        <div className="overflow-x-auto p-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-400 uppercase">
                {LINE_COLUMNS.map((c) => <th key={c.key} className={th}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {lines.map((row) => (
                <tr key={row.lineId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                  {LINE_COLUMNS.map((c) => (
                    <td key={c.key} className={`${td} ${c.num ? "text-right font-mono" : ""} ${c.key === "itemId" ? "font-semibold" : ""}`}>
                      {lineCell(row.fields, c.key)}
                    </td>
                  ))}
                </tr>
              ))}
              {lines.length === 0 && (
                <tr><td colSpan={LINE_COLUMNS.length} className="py-4 text-center text-neutral-400">Chưa có dòng hàng.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto p-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-[10px] text-neutral-400 uppercase">
                <th className={th}>Thời gian</th>
                <th className={th}>Người gửi</th>
                <th className={th}>Trạng thái</th>
                <th className={th}>Gửi đến</th>
                <th className={th}>Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {history.map((row) => {
                const f = row.fields || {};
                const t = (k: string) => { const v = f[k]; return typeof v === "string" ? v : v == null ? "—" : String(v); };
                return (
                  <tr key={row.lineId}>
                    <td className={td}>{t("thoiGian")}</td>
                    <td className={`${td} font-semibold`}>{t("userName")}</td>
                    <td className={td}>{t("statusId")}</td>
                    <td className={td}>{t("sendTo")}</td>
                    <td className={td}>{t("notes")}</td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-neutral-400">Chưa có lịch sử gửi / duyệt.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
