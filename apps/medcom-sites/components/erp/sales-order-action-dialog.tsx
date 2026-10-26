"use client";

import { useEffect, useId, useState } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Loader2, Search, Send } from "lucide-react";
import { UntitledBottomSheet } from "@/components/untitledui/bottom-sheet";
import { erpClient, type ErpScreenModule } from "@/lib/erp/erp-client";
import type { ErpChoicePage } from "@/lib/erp/erp-screen-contracts";
import { salesActionLabels } from "@/lib/erp/sales-order-workflow";

/** ERP ExecSQLWithPara prompt: optional choice (PM / return step) plus notes. Inbound screens pass their own wording. */
export function SalesOrderActionDialog({ module, operation, branchId, documentId, busy, message, onClose, onConfirm, title, intro, notesRequired }: {
  module: ErpScreenModule; operation: string; branchId: string; documentId: string; busy: boolean;
  message?: string; onClose: () => void; onConfirm: (payload: Record<string, unknown>) => void;
  title?: string; intro?: string; notesRequired?: boolean;
}) {
  const prefix = useId(), needsChoice = operation === "send-pm" || operation === "return-step";
  const [search, setSearch] = useState(""), [page, setPage] = useState(1), [notes, setNotes] = useState("");
  const [selection, setSelection] = useState<{ id: string; label: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: ErpChoicePage; error?: boolean }>();
  const key = JSON.stringify([module, operation, branchId, documentId, search, page, retry]);
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    if (!needsChoice) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const query = { branchId, role: "primary" as const, page, pageSize: 20, search: search.trim() || null };
        const data = operation === "send-pm" && module === "sales-orders" ? await erpClient.getPmOptions("sales-orders", query)
          : await erpClient.getActionOptions(module, operation, module.startsWith("inbound-") ? { ...query, documentId } : query);
        if (!cancelled) setResult({ key, data });
      } catch { if (!cancelled) setResult({ key, error: true }); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, needsChoice, branchId, module, operation, page, search]);
  const validSelection = !needsChoice || !!selection && (operation !== "return-step" || /^-?\d+$/.test(selection.id));
  const needsNotes = notesRequired ?? operation === "reject";
  const canConfirm = !busy && validSelection && (!needsNotes || !!notes.trim());
  const destructive = operation === "delete" || operation === "reject";
  const buttonClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 text-sm font-semibold disabled:opacity-40 dark:border-neutral-700";
  function confirm() {
    if (!canConfirm) return;
    onConfirm(operation === "delete" || operation === "recall" ? {} : {
      ...(operation === "send-pm" ? { pmId: selection!.id } : operation === "return-step" ? { statusId: Number(selection!.id) } : {}), notes: notes.trim() || null,
    });
  }
  return <UntitledBottomSheet open onClose={() => { if (!busy) onClose(); }} title={title || salesActionLabels[operation] || operation} subtitle={documentId}
    footer={<div className="flex gap-3 text-black dark:text-white"><button type="button" disabled={busy} onClick={onClose} className={`${buttonClass} flex-1`}>Hủy</button><button type="button" disabled={!canConfirm} onClick={confirm} className={`${buttonClass} flex-1 border-transparent bg-brand-600 text-white ${destructive ? "bg-red-600" : ""}`}>{busy ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}Xác nhận</button></div>}>
    <div className="space-y-4 text-base text-black dark:text-white">
      <p className="leading-6">{intro ? intro : operation === "delete" ? "Xóa đơn hàng này? Hãy kiểm tra đúng mã chứng từ trước khi xác nhận." : operation === "recall" ? "Thu hồi đơn hàng từ PM để chỉnh sửa. Hệ thống sẽ kiểm tra lại trạng thái hiện tại." : "Kiểm tra thông tin và xác nhận chuyển đơn hàng sang bước xử lý tiếp theo."}</p>
      {needsChoice && <div className="space-y-3">
        <label htmlFor={`${prefix}-search`} className="block text-sm font-semibold">{operation === "send-pm" ? (module === "sales-orders" ? "Chọn PM nhận đơn *" : "Chọn PM nhận *") : "Chọn bước gửi về *"}</label>
        <div className="relative"><Search aria-hidden className="absolute left-3 top-3.5 size-4" /><input id={`${prefix}-search`} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm kiếm…" className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white py-2 pl-9 pr-3 text-base dark:border-neutral-700 dark:bg-neutral-900" /></div>
        {selection && <p className="flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-800 dark:bg-brand-950 dark:text-brand-200"><Check aria-hidden className="size-4 shrink-0" />Đã chọn: {selection.label}</p>}
        <div role="radiogroup" aria-label={operation === "send-pm" ? "Người nhận PM" : "Bước gửi về"} className="max-h-64 space-y-1 overflow-auto rounded-xl border border-neutral-200 p-1 dark:border-neutral-800">
          {!current ? <p role="status" className="flex items-center gap-2 p-4 text-sm"><Loader2 aria-hidden className="size-4 animate-spin" />Đang tải lựa chọn…</p> : current.error ? <div role="alert" className="space-y-2 p-3 text-sm"><p>Không tải được lựa chọn.</p><button type="button" onClick={() => setRetry(value => value + 1)} className={buttonClass}>Thử lại</button></div> : !current.data?.items.length ? <p className="p-4 text-sm">Không có lựa chọn phù hợp.</p> : current.data.items.map(choice => <button key={choice.id} type="button" role="radio" aria-checked={selection?.id === choice.id} onClick={() => setSelection({ id: choice.id, label: String(choice.label || choice.id) })} className={`flex min-h-12 w-full items-start justify-between gap-2 rounded-lg p-3 text-left text-base hover:bg-neutral-100 dark:hover:bg-neutral-800 ${selection?.id === choice.id ? "bg-brand-50 font-semibold dark:bg-brand-950" : ""}`}><span className="min-w-0 break-words">{String(choice.label || choice.id)}</span>{selection?.id === choice.id && <Check aria-hidden className="mt-1 size-4 shrink-0" />}</button>)}
        </div>
        <div className="flex items-center justify-between gap-2 text-sm"><button type="button" aria-label="Lựa chọn trang trước" disabled={page === 1 || !current} onClick={() => setPage(value => value - 1)} className={buttonClass}><ChevronLeft aria-hidden className="size-4" /></button><span>Trang {page}</span><button type="button" aria-label="Lựa chọn trang sau" disabled={!current?.data?.hasMore || page >= 10000} onClick={() => setPage(value => value + 1)} className={buttonClass}><ChevronRight aria-hidden className="size-4" /></button></div>
      </div>}
      {!["delete", "recall"].includes(operation) && <div className="space-y-2"><label htmlFor={`${prefix}-notes`} className="block text-sm font-semibold">{needsNotes ? "Lý do trả lại *" : "Ghi chú"}</label><textarea id={`${prefix}-notes`} value={notes} onChange={event => setNotes(event.target.value)} rows={3} maxLength={4000} className="w-full resize-y rounded-xl border border-neutral-300 bg-white p-3 text-base dark:border-neutral-700 dark:bg-neutral-900" /></div>}
      {needsNotes && <p className="flex items-start gap-2 text-sm"><AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />Nhập rõ nội dung cần bổ sung để bước trước xử lý.</p>}
      {message && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{message}</p>}
    </div>
  </UntitledBottomSheet>;
}
