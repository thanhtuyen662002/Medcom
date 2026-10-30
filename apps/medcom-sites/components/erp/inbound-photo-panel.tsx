"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ExternalLink, ImagePlus, Loader2, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/erp/api";
import { erpClient } from "@/lib/erp/erp-client";
import type { AttachmentModule } from "@/lib/erp/proxy-policy";
import { attachmentContentUrl, validateAttachmentFile, type SalesOrderAttachmentPage } from "@/lib/erp/sales-order-attachments";

/**
 * ERP inbound forms show three photo slots (AttachWebcamImageControlCtl STT 2/4/6: hư hỏng, trước/sau khi dỡ hàng).
 * Lists them per slot; adds photos only when the backend says the form may (canUpload), one upload per file
 * against the current document state.
 */
export function InboundPhotoPanel({ module, branchId, documentId, onUploaded }: {
  module: AttachmentModule; branchId: string; documentId: string; onUploaded?: () => void;
}) {
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: SalesOrderAttachmentPage; error?: string }>();
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});
  const key = JSON.stringify([module, branchId, documentId, refresh]);
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    const abort = new AbortController();
    // ERP keeps a handful of photos per request; 100 rows covers every slot on one page.
    void erpClient.getAttachments(module, branchId, documentId, 100, abort.signal)
      .then(data => { if (!abort.signal.aborted) setResult({ key, data }); })
      .catch(() => { if (!abort.signal.aborted) setResult({ key, error: "Chưa tải được ảnh của đề nghị." }); });
    return () => abort.abort();
  }, [key, module, branchId, documentId]);

  const upload = async (slotId: number, files: File[]) => {
    if (!files.length || busySlot !== null) return;
    setBusySlot(slotId); setMessage(null);
    try {
      for (const file of files) {
        const problem = await validateAttachmentFile(file);
        if (problem) { setMessage(`${file.name}: ${problem}`); return; }
        // Each upload changes the document state token, so read it again before the next file.
        const page = await erpClient.getAttachments(module, branchId, documentId);
        if (!page.canUpload) { setMessage("Trạng thái đề nghị hiện không cho phép thêm ảnh."); return; }
        const outcome = await erpClient.uploadAttachment({ idempotencyKey: `upload-${crypto.randomUUID()}`, branchId, documentId,
          expectedStateToken: page.documentStateToken, file, module, slotId });
        if (outcome.outcome !== "Committed" && outcome.outcome !== "Replayed") {
          setMessage(outcome.outcome === "Conflict" ? "Đề nghị vừa thay đổi. Làm mới rồi thử lại."
            : outcome.outcome === "Denied" ? "Tài khoản chưa được phép thêm ảnh cho đề nghị này."
            : outcome.outcome === "InvalidInput" ? `${file.name}: ảnh không được ERP chấp nhận.`
            : "Chưa xác nhận được kết quả tải ảnh. Làm mới để kiểm tra trước khi thử lại.");
          return;
        }
      }
      onUploaded?.();
    } catch (failure) {
      setMessage(failure instanceof ApiError && failure.status === 413 ? "Ảnh vượt giới hạn 10 MB."
        : failure instanceof ApiError && failure.status === 401 ? "Phiên đăng nhập đã hết hạn."
        : "Chưa xác nhận được kết quả tải ảnh. Làm mới để kiểm tra trước khi thử lại.");
    } finally {
      setBusySlot(null); setRefresh(value => value + 1);
    }
  };

  const data = current?.data;
  const buttonClass = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900";
  return <section aria-label="Ảnh hàng về" className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-base font-semibold text-black dark:text-white">Ảnh hàng về</h4>
      <button type="button" aria-label="Làm mới ảnh" disabled={busySlot !== null} onClick={() => setRefresh(value => value + 1)} className={buttonClass}><RefreshCw aria-hidden className="size-4" /></button>
    </div>
    {message && <p role="alert" className="break-words text-sm text-red-600 dark:text-red-400">{message}</p>}
    {!current ? <p role="status" className="flex items-center gap-2 text-sm text-black dark:text-white"><Loader2 aria-hidden className="size-4 animate-spin" />Đang tải ảnh...</p>
      : current.error ? <p role="alert" className="text-sm text-red-600">{current.error}</p>
      : !data?.supported ? <p className="text-sm text-black dark:text-white">Ảnh chưa khả dụng cho đề nghị này.</p>
      : <>{!data.canUpload && <p className="text-sm text-neutral-600 dark:text-neutral-400">Chỉ thêm được ảnh khi phiếu đang ở bước của bạn và chưa khóa: Đề nghị nhập hàng (Nháp), Thủ kho, Kỹ thuật hoặc PM. Ở bước khác ảnh chỉ để xem.</p>}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">{data.slots.map(slot => {
        const id = slot.slotId ?? 0, rows = data.rows.filter(row => row.slotId === slot.slotId);
        return <div key={id} className="min-w-0 space-y-2">
          <h5 className="text-sm font-semibold text-black dark:text-white">{slot.slotName} {rows.length > 0 && `(${rows.length})`}</h5>
          {rows.length === 0 ? <p className="text-sm text-neutral-500 dark:text-neutral-400">Chưa có ảnh.</p>
            : <ul className="grid grid-cols-2 gap-2">{rows.map(row => <li key={row.attachmentId} className="min-w-0">
              <a href={attachmentContentUrl(branchId, documentId, row.attachmentId, false, module)} target="_blank" rel="noopener noreferrer" title={row.attachmentName} className="block space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachmentContentUrl(branchId, documentId, row.attachmentId, true, module)} alt={row.attachmentName} loading="lazy" className="aspect-[4/3] w-full rounded-lg bg-neutral-100 object-contain dark:bg-neutral-800" />
                <span className="flex min-w-0 items-center gap-1 text-xs text-brand-700 dark:text-brand-300"><span className="truncate">{row.attachmentName}</span><ExternalLink aria-hidden className="size-3 shrink-0" /></span>
              </a>
            </li>)}</ul>}
          {data.canUpload && <>
            {(["pick", "camera"] as const).map(kind => <input key={kind} ref={node => { pickers.current[`${id}-${kind}`] = node; }} type="file" className="hidden"
              aria-label={`${kind === "camera" ? "Chụp" : "Chọn"} ${slot.slotName.toLocaleLowerCase("vi")}`}
              accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple={kind === "pick"} capture={kind === "camera" ? "environment" : undefined}
              onChange={event => { const files = Array.from(event.currentTarget.files || []); event.currentTarget.value = ""; void upload(id, files); }} />)}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busySlot !== null} onClick={() => pickers.current[`${id}-pick`]?.click()} className={buttonClass}>
                {busySlot === id ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ImagePlus aria-hidden className="size-4" />}Chọn ảnh</button>
              <button type="button" disabled={busySlot !== null} onClick={() => pickers.current[`${id}-camera`]?.click()} className={buttonClass}><Camera aria-hidden className="size-4" />Chụp ảnh</button>
            </div>
          </>}
        </div>;
      })}</div></>}
  </section>;
}
