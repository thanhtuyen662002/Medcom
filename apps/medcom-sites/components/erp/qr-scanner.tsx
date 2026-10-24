"use client";

import { useId, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScanLine } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrCamera, type QrCameraState } from "@/lib/erp/qr-camera";
import { MAX_QR_TEXT_LENGTH, validateQrText } from "@/lib/erp/qr-decoder";

export type QrScannerProps = {
  open: boolean;
  // Null means there is no current authorized session. Change this on every
  // login/session/scope boundary; authority remains the caller's responsibility.
  scopeKey: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (text: string) => void;
  title?: string;
  /** What the confirmed code is used for, shown under the title. */
  purpose?: string;
};
type State = QrCameraState | "idle";
type ScannerHandle = { cancel: () => void };
const messages: Record<State, string> = {
  idle: "Bấm Bắt đầu quét để mở camera, hoặc nhập mã thủ công.",
  starting: "Đang chờ quyền truy cập camera. Bạn có thể đóng hoặc nhập mã thủ công.",
  scanning: "Đưa mã QR vào khung hình.",
  found: "Đã đọc mã. Kiểm tra mã trước khi xác nhận.",
  denied: "Camera chưa được cho phép. Bạn có thể nhập mã thủ công.",
  unavailable: "Không có camera phù hợp hoặc trình duyệt chưa hỗ trợ. Hãy nhập mã thủ công.",
  failed: "Không thể mở hoặc đọc camera. Hãy thử lại hoặc nhập mã thủ công.",
  invalid: "Mã trống, quá dài hoặc chứa ký tự không hợp lệ. Hãy quét lại hoặc nhập mã thủ công.",
};

export function QrScanner({ open, scopeKey, onOpenChange, onConfirm, title = "Quét mã QR",
  purpose = "Camera chỉ dùng để đọc mã trên thiết bị. Kiểm tra và xác nhận trước khi dùng mã." }: QrScannerProps) {
  const opener = useRef<HTMLElement | null>(null);
  const body = useRef<ScannerHandle | null>(null);
  const [camera] = useState(() => new QrCamera());
  const visible = open && scopeKey !== null && scopeKey.length > 0;
  const requestClose = () => {
    body.current?.cancel();
    camera.stop();
    onOpenChange(false);
  };
  return <Dialog open={visible} onOpenChange={next => { if (!next) requestClose(); else onOpenChange(true); }}>
    {/* Full screen on phones so the camera frame is as large as possible. */}
    <DialogContent showCloseButton={false} className="flex h-dvh max-h-dvh w-full max-w-full flex-col gap-4 overflow-y-auto rounded-none border-0 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:h-auto sm:max-h-[90dvh] sm:max-w-md sm:rounded-2xl sm:border sm:p-6"
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}>
      <DialogHeader className="text-left">
        <DialogTitle className="text-lg">{title}</DialogTitle>
        <DialogDescription className="text-sm">{purpose}</DialogDescription>
      </DialogHeader>
      {visible && <ScannerBody key={scopeKey} ref={body} camera={camera} onConfirm={onConfirm} onClose={requestClose} />}
    </DialogContent>
  </Dialog>;
}

function ScannerBody({ ref, camera, onConfirm, onClose }: { ref: Ref<ScannerHandle>; camera: QrCamera; onConfirm: (text: string) => void; onClose: () => void }) {
  const manualId = useId();
  const statusId = useId();
  const video = useRef<HTMLVideoElement>(null);
  const delivered = useRef(false);
  const cancelled = useRef(false);
  const [closeRequested, setCloseRequested] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [manual, setManual] = useState(false);
  const [text, setText] = useState("");
  const busy = state === "starting" || state === "scanning";
  const valid = validateQrText(text) !== null;
  useImperativeHandle(ref, () => ({ cancel: () => {
    // The ref fences callbacks immediately, before React commits the cleared
    // candidate/controls or the parent acknowledges its controlled close.
    cancelled.current = true;
    camera.stop();
    setText("");
    setState("idle");
    setCloseRequested(true);
  } }), [camera]);
  useLayoutEffect(() => {
    // React's development Strict Mode replays setup/cleanup on initial mount.
    // A genuine close does not rerun this camera-stable effect.
    cancelled.current = false;
    const stop = () => { camera.stop(); setText(""); setState("idle"); };
    const visibility = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", stop);
    return () => { cancelled.current = true; camera.stop(); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", stop); };
  }, [camera]);

  const start = () => {
    if (!video.current || busy || delivered.current || cancelled.current) return;
    setText("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setState("unavailable"); return; }
    void camera.start(video.current, setState, setText);
  };
  const confirm = () => {
    const value = validateQrText(text);
    if (value === null || busy || delivered.current || cancelled.current) return;
    delivered.current = true;
    camera.stop();
    onConfirm(value);
    onClose();
  };
  if (closeRequested) return <p role="status" aria-live="polite" className="text-sm">Đã dừng quét. Đang đóng cửa sổ.</p>;
  const found = valid && !busy;
  return <div className="flex min-h-0 flex-1 flex-col gap-4">
    {!manual && <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-neutral-950">
      <video ref={video} muted playsInline aria-label="Khung camera quét QR" className="size-full object-cover" />
      {/* Aiming frame; purely visual, the decoder reads the whole image. */}
      <div aria-hidden="true" className={`pointer-events-none absolute inset-[14%] rounded-2xl border-2 ${state === "found" ? "border-emerald-400" : "border-white/80"}`} />
      {!busy && !text && <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/70"><ScanLine className="size-12" /></div>}
    </div>}
    <p id={statusId} role="status" aria-live="polite" className="text-base text-neutral-700 dark:text-neutral-300">{messages[state]}</p>
    {manual ? <div className="space-y-2">
      <label htmlFor={manualId} className="text-sm font-medium">Mã nhập thủ công</label>
      <Input id={manualId} autoFocus value={text} maxLength={MAX_QR_TEXT_LENGTH} autoComplete="off" spellCheck={false}
        aria-describedby={statusId} aria-invalid={!!text && !valid}
        onChange={event => setText(event.target.value)} className="min-h-11 text-base" />
    </div> : text && <div className="space-y-1"><p className="text-sm font-medium">Mã đã đọc</p><p className="break-all rounded-xl border p-3 font-mono text-base">{text}</p></div>}
    <div className="mt-auto grid gap-2">
      {/* One primary action at a time: start/rescan, or use the code read. */}
      {found
        ? <Button type="button" className="min-h-12 w-full text-base" onClick={confirm}>Dùng mã này</Button>
        : <>
          {!manual && !busy && <Button type="button" className="min-h-12 w-full text-base" onClick={start}>{text ? "Quét lại" : "Bắt đầu quét"}</Button>}
          {busy && <Button type="button" variant="outline" className="min-h-12 w-full text-base" onClick={() => { camera.stop(); setState("idle"); }}>Dừng camera</Button>}
          {manual && <Button type="button" className="min-h-12 w-full text-base" disabled onClick={confirm}>Dùng mã này</Button>}
        </>}
      {found && !manual && <Button type="button" variant="outline" className="min-h-11 w-full" onClick={start}>Quét lại</Button>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => { camera.stop(); setText(""); setState("idle"); setManual(value => !value); }}>
          {manual ? "Dùng camera" : "Nhập mã thủ công"}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>Hủy</Button>
      </div>
    </div>
  </div>;
}
