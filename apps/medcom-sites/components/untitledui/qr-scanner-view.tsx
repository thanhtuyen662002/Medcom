"use client";

import { useState } from "react";
import { ChevronRight, QrCode, Search, ScanLine } from "lucide-react";
import { AppButton, FormField, StatusBadge } from "@/components/app";
import { QrScanner } from "@/components/erp/qr-scanner";
import { MAX_QR_TEXT_LENGTH, validateQrText } from "@/lib/erp/qr-decoder";
import { MAX_REQUEST_QR_SEARCH_LENGTH } from "@/lib/erp/request-qr-search";

/** A screen the scanner can hand a code to (an ERP module id and its menu label). */
export interface QrScanTarget { id: string; label: string }

export interface UntitledQrScannerViewProps {
  scopeKey: string;
  /** Modules whose open document scans codes into ERP. */
  scanTargets?: readonly QrScanTarget[];
  /** Modules where a read code can be looked up in the list search. */
  searchTargets?: readonly QrScanTarget[];
  onOpenTarget?: (id: string) => void;
  onSearchIn?: (id: string, code: string) => void;
}

// The screen says what a scan is for: codes go into ERP only from inside a
// document (warehouse/sales scan); here a code is read on the device and can
// be looked up in a module's list.
export function UntitledQrScannerView({ scopeKey, scanTargets = [], searchTargets = [], onOpenTarget, onSearchIn }: UntitledQrScannerViewProps) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const acceptCode = (candidate: string) => {
    const value = validateQrText(candidate.trim());
    setCode(value);
    setError(value ? null : "Nhập mã có nội dung, tối đa 1024 ký tự và không có ký tự điều khiển.");
    if (value) setManualCode(value);
  };
  const searchable = code !== null && code.length <= MAX_REQUEST_QR_SEARCH_LENGTH;

  return <div className="min-w-0 space-y-5 pb-8">
    {scanTargets.length > 0 && <section aria-labelledby="scan-into" className="space-y-2">
      <h2 id="scan-into" className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Quét hàng vào phiếu</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">Mở phiếu cần xuất rồi bấm <strong>Quét thêm mã QR</strong> trong phiếu. Mã quét được gửi vào đúng phiếu đó trên ERP.</p>
      <div className="space-y-2">
        {scanTargets.map(target => <button key={target.id} type="button" onClick={() => onOpenTarget?.(target.id)}
          className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"><ScanLine aria-hidden="true" className="size-6" /></span>
          <span className="min-w-0 flex-1"><span className="block text-base font-semibold text-neutral-900 dark:text-neutral-100">{target.label}</span>
            <span className="block text-sm text-neutral-500 dark:text-neutral-400">Mở danh sách phiếu để quét</span></span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-neutral-400" />
        </button>)}
      </div>
    </section>}

    <section aria-labelledby="scan-lookup" className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <h2 id="scan-lookup" className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Tra cứu mã</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Đọc mã trên thiết bị rồi tìm chứng từ có mã đó. Mã chưa được gửi vào phiếu nào.</p>
      </div>
      <AppButton className="w-full" onClick={() => setCameraOpen(true)}><QrCode aria-hidden="true" className="size-5" />Mở camera</AppButton>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); acceptCode(manualCode); }}>
        <FormField label="Hoặc nhập mã" value={manualCode} onChange={event => { setManualCode(event.target.value); setError(null); setCode(null); }}
          maxLength={MAX_QR_TEXT_LENGTH} autoComplete="off" spellCheck={false} placeholder="Nhập hoặc dán mã QR / mã vạch" error={error ?? undefined} />
        <AppButton type="submit" variant="secondary" className="w-full"><Search aria-hidden="true" className="size-5" />Kiểm tra mã</AppButton>
      </form>
    </section>

    {code && <section aria-label="Mã đã đọc" className="space-y-3 rounded-2xl border border-brand-200 bg-white p-4 dark:border-brand-900 dark:bg-neutral-900">
      <StatusBadge label="Đã đọc mã" tone="info" />
      <p role="status" className="break-all rounded-xl bg-neutral-50 p-3 font-mono text-base text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">{code}</p>
      {searchTargets.length > 0 && <>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Tìm mã này trong</p>
        {!searchable && <p className="text-sm text-amber-700 dark:text-amber-300">Mã dài hơn {MAX_REQUEST_QR_SEARCH_LENGTH} ký tự nên không dùng để tìm kiếm được.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {searchTargets.map(target => <AppButton key={target.id} variant="secondary" disabled={!searchable} className="justify-between"
            onClick={() => onSearchIn?.(target.id, code)}>{target.label}<ChevronRight aria-hidden="true" className="size-4" /></AppButton>)}
        </div>
      </>}
    </section>}
    <QrScanner open={cameraOpen} scopeKey={scopeKey} onOpenChange={setCameraOpen} onConfirm={acceptCode}
      purpose="Mã chỉ được đọc trên thiết bị để tra cứu; chưa gửi vào phiếu nào." />
  </div>;
}
