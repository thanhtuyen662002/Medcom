"use client";

import { useState } from "react";
import { QrCode, ArrowRight, Search } from "lucide-react";
import { AppButton, FormField, StatusBadge } from "@/components/app";
import { QrScanner } from "@/components/erp/qr-scanner";
import { MAX_QR_TEXT_LENGTH, validateQrText } from "@/lib/erp/qr-decoder";

export interface UntitledQrScannerViewProps {
  scopeKey: string;
  onOpenPurchases?: () => void;
  onOpenInbound?: () => void;
}

export function UntitledQrScannerView({ scopeKey, onOpenPurchases, onOpenInbound }: UntitledQrScannerViewProps) {
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

  return <div className="min-w-0 space-y-4 pb-8">
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-5 text-center dark:border-brand-900 dark:bg-brand-950">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-white text-brand-700 dark:bg-neutral-900 dark:text-brand-300"><QrCode aria-hidden="true" className="size-9" /></span>
      <div><h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Đọc mã QR bằng camera</h2><p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Mở camera, đưa mã vào khung và xác nhận mã đã đọc.</p></div>
      <AppButton onClick={() => setCameraOpen(true)}><QrCode aria-hidden="true" className="size-5" />Mở camera</AppButton>
    </section>

    <form className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900" onSubmit={event => { event.preventDefault(); acceptCode(manualCode); }}>
      <FormField label="Nhập mã thủ công" value={manualCode} onChange={event => { setManualCode(event.target.value); setError(null); setCode(null); }}
        maxLength={MAX_QR_TEXT_LENGTH} autoComplete="off" spellCheck={false} placeholder="Nhập hoặc dán mã QR / mã vạch" error={error ?? undefined} />
      <AppButton type="submit" variant="secondary" className="w-full"><Search aria-hidden="true" className="size-5" />Kiểm tra mã</AppButton>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Mã được đọc trên thiết bị. Thông tin hàng hóa và tồn kho được xem trong chứng từ nghiệp vụ.</p>
    </form>

    {code && <section aria-label="Mã đã đọc" className="space-y-4 rounded-2xl border border-brand-200 bg-white p-4 dark:border-brand-900 dark:bg-neutral-900">
      <StatusBadge label="Đã đọc mã" tone="info" />
      <p role="status" className="break-all rounded-xl bg-neutral-50 p-3 font-mono text-base text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">{code}</p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Mở màn nghiệp vụ để tìm hoặc chọn hàng hóa. Mã này chưa được thêm vào chứng từ.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {onOpenPurchases && <AppButton variant="secondary" onClick={onOpenPurchases} className="flex-1">Mở đề nghị PR<ArrowRight aria-hidden="true" className="size-4" /></AppButton>}
        {onOpenInbound && <AppButton variant="secondary" onClick={onOpenInbound} className="flex-1">Mở nhập kho<ArrowRight aria-hidden="true" className="size-4" /></AppButton>}
      </div>
    </section>}
    <QrScanner open={cameraOpen} scopeKey={scopeKey} onOpenChange={setCameraOpen} onConfirm={acceptCode} />
  </div>;
}
