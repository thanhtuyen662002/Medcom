"use client";

import { useRef } from "react";
import { Camera, ImagePlus, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import type { DraftAttachment } from "@/lib/erp/sales-order-attachments";

export function SalesOrderAttachmentPicker({ files, onAdd, onRemove, disabled = false, validating = false, error, readOnly = false, documentCreated = false }: {
  files: DraftAttachment[]; onAdd: (files: File[]) => Promise<void>; onRemove: (key: string) => void;
  disabled?: boolean; validating?: boolean; error?: string | null; readOnly?: boolean; documentCreated?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  return <section aria-label="Tài liệu đính kèm" className="min-w-0 space-y-3 rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
    <h4 className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Tài liệu đính kèm {files.length > 0 && `(${files.length})`}</h4>
    {!readOnly && <>
      <p className="text-[11px] leading-relaxed text-neutral-500">Chọn ảnh JPG/PNG, tối đa 10 MB mỗi ảnh. {documentCreated ? "Đơn đã tạo; ảnh bổ sung sẽ được tải vào đơn này khi bạn tiếp tục." : "Ảnh sẽ được tải lên sau khi tạo đơn thành công."}</p>
      <input ref={picker} aria-label="Chọn ảnh đính kèm đơn hàng" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple disabled={disabled || validating} className="hidden"
        onChange={event => { const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = ""; void onAdd(selected); }} />
      <input ref={camera} aria-label="Chụp ảnh đính kèm đơn hàng" type="file" accept="image/jpeg,image/png" capture="environment" disabled={disabled || validating} className="hidden"
        onChange={event => { const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = ""; void onAdd(selected); }} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={disabled || validating} onClick={() => picker.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 text-xs font-semibold disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"><ImagePlus className="size-4" />Chọn ảnh</button>
        <button type="button" disabled={disabled || validating} onClick={() => camera.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 text-xs font-semibold disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"><Camera className="size-4" />Chụp ảnh</button>
      </div>
    </>}
    {validating && <p role="status" className="flex items-center gap-2 text-xs text-neutral-500"><Loader2 className="size-4 animate-spin" />Đang đọc ảnh...</p>}
    {error && <p role="alert" className="break-words text-xs text-red-600 dark:text-red-400">{error}</p>}
    <ul className="space-y-2">{files.map(file => <li key={file.key} className="flex min-w-0 items-center gap-2 rounded-xl border border-neutral-200 p-2 dark:border-neutral-700">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={file.previewUrl} alt="Ảnh đã chọn" className="size-12 shrink-0 rounded-lg object-cover" />
      <div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold">{file.file.name}</p>
        <p className="text-[10px] text-neutral-500">{(file.file.size / 1024 / 1024).toFixed(2)} MB · {file.status === "uploaded" ? "Đã tải lên" : file.status === "uploading" ? "Đang tải lên..." : file.status === "error" ? "Cần thử lại" : "Chờ tạo đơn"}</p>
        {file.error && <p className="break-words text-[10px] text-red-600 dark:text-red-400">{file.error}</p>}
      </div>
      {file.status === "uploading" && <Loader2 className="size-4 shrink-0 animate-spin text-brand-600" />}
      {file.status === "uploaded" && <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />}
      {!readOnly && file.status !== "uploaded" && file.status !== "uploading" && !file.request && <button type="button" disabled={disabled || validating} aria-label={`Bỏ ảnh ${file.file.name}`} onClick={() => onRemove(file.key)} className="rounded-lg p-2 text-neutral-400 hover:text-red-600 disabled:opacity-50"><Trash2 className="size-4" /></button>}
    </li>)}</ul>
    {readOnly && !files.length && <p className="text-xs text-neutral-500">Không có ảnh đính kèm.</p>}
  </section>;
}
