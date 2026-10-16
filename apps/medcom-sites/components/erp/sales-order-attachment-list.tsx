"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { getSalesOrderAttachments } from "@/lib/erp/erp-screen-api";
import { attachmentContentUrl, type SalesOrderAttachmentPage } from "@/lib/erp/sales-order-attachments";

export function SalesOrderAttachmentList({ branchId, documentId, embedded = false }: { branchId: string; documentId: string; embedded?: boolean }) {
  const [page, setPage] = useState(1), [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: SalesOrderAttachmentPage; error?: string }>();
  const key = JSON.stringify([branchId, documentId, page, refresh]);
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    const abort = new AbortController();
    const [branch, document, requestedPage] = JSON.parse(key) as [string, string, number, number];
    void getSalesOrderAttachments(branch, document, requestedPage, abort.signal)
      .then(data => { if (!abort.signal.aborted) setResult({ key, data }); })
      .catch(() => { if (!abort.signal.aborted) setResult({ key, error: "Chưa tải được tài liệu đính kèm." }); });
    return () => abort.abort();
  }, [key]);
  return <section aria-label="Ảnh đính kèm đơn hàng" className={embedded ? "min-w-0 space-y-3" : "min-w-0 space-y-3 rounded-xl border border-border bg-card p-4"}>
    <div className="flex items-center justify-between gap-2">{!embedded && <h4 className="text-sm font-semibold text-muted-foreground">Tài liệu đính kèm</h4>}
      <button type="button" aria-label="Làm mới tài liệu đính kèm" onClick={() => setRefresh(value => value + 1)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground"><RefreshCw className="size-4" />{embedded && "Làm mới ảnh"}</button></div>
    {!current ? <p role="status" className="flex items-center gap-2 text-xs text-neutral-500"><Loader2 className="size-4 animate-spin" />Đang tải...</p>
      : current.error ? <p role="alert" className="text-xs text-red-600">{current.error}</p>
      : !current.data?.supported ? <p className="text-xs text-neutral-500">Đính kèm chưa khả dụng cho đơn này.</p>
      : current.data.rows.length === 0 ? <p className="text-xs text-neutral-500">Chưa có ảnh đính kèm.</p>
      : <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{current.data.rows.map(row => <li key={row.attachmentId} className="min-w-0 rounded-xl border border-border p-3">
        <a href={attachmentContentUrl(branchId, documentId, row.attachmentId, false)} target="_blank" rel="noopener noreferrer" className="block space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={attachmentContentUrl(branchId, documentId, row.attachmentId)} alt={row.attachmentName} loading="lazy" className="aspect-[4/3] w-full rounded-lg bg-neutral-100 object-contain dark:bg-neutral-800" />
          <p className="flex min-w-0 items-start gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300"><span className="min-w-0 break-words">{row.attachmentName}</span><ExternalLink className="mt-0.5 size-3 shrink-0" /></p>
        </a>
        <p className="mt-1 text-[10px] text-neutral-500">{row.slotName} · {(row.byteLength / 1024 / 1024).toFixed(2)} MB</p>
      </li>)}</ul>}
    {(page > 1 || current?.data?.hasMore) && <div className="flex items-center justify-between gap-2 text-xs">
      <button type="button" aria-label="Trang tài liệu trước" disabled={page <= 1 || !current} onClick={() => setPage(value => value - 1)} className="rounded-lg p-2 disabled:opacity-30"><ChevronLeft className="size-4" /></button>
      <span>Trang {page}</span>
      <button type="button" aria-label="Trang tài liệu tiếp" disabled={!current?.data?.hasMore || page >= 10000} onClick={() => setPage(value => value + 1)} className="rounded-lg p-2 disabled:opacity-30"><ChevronRight className="size-4" /></button>
    </div>}
  </section>;
}
