"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { QrScanner } from "./qr-scanner";
import { validateRequestQrSearchText } from "@/lib/erp/request-qr-search";

export type RequestQrSearchProps = {
  /** Root-authorized session incarnation/scope; null retires presentation.
   * Change on every login/session/scope boundary, even for the same account.
   */
  scopeKey: string | null;
  disabled: boolean;
  presentationAllowed: boolean;
  /** Only set the controlled search input. Ordinary Search remains separate. */
  onConfirmedSearchText: (text: string) => void;
};

const label = "Quét QR vào ô tìm kiếm";

/** Conditional/keyed lifetime closes and stops the unchanged scanner through
 * its supported unmount cleanup. Recovery never reopens a retired instance.
 */
export function RequestQrSearch(props: RequestQrSearchProps) {
  if (props.disabled || !props.presentationAllowed || !props.scopeKey) {
    return <Button type="button" variant="outline" disabled className="min-h-11 max-w-full whitespace-normal">{label}</Button>;
  }
  return <AuthorizedRequestQrSearch key={props.scopeKey} {...props} scopeKey={props.scopeKey} />;
}

function AuthorizedRequestQrSearch({ scopeKey, onConfirmedSearchText }: RequestQrSearchProps & { scopeKey: string }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackId = useId();
  const hintId = useId();
  const live = useRef(false);
  const accepting = useRef<number | null>(null);
  const callback = useRef(onConfirmedSearchText);
  useLayoutEffect(() => { callback.current = onConfirmedSearchText; }, [onConfirmedSearchText]);
  useLayoutEffect(() => {
    live.current = true;
    return () => { live.current = false; accepting.current = null; };
  }, []);
  const close = () => { accepting.current = null; setOpen(false); };
  const confirm = (candidate: string) => {
    if (!live.current || accepting.current !== attempt) return;
    // Retire before delivering, including reentrant callbacks and double clicks.
    close();
    const result = validateRequestQrSearchText(candidate);
    if (!result.ok) { setFeedback(result.message); return; }
    setFeedback("Đã điền mã vào ô tìm kiếm. Bấm Tìm kiếm khi bạn sẵn sàng.");
    callback.current(result.text);
  };
  return <div className="min-w-0 max-w-full space-y-2">
    <Button type="button" variant="outline" className="min-h-11 max-w-full whitespace-normal"
      aria-describedby={feedback ? `${hintId} ${feedbackId}` : hintId} onClick={() => {
        if (!live.current) return;
        accepting.current = attempt + 1;
        setAttempt(attempt + 1);
        setFeedback(null);
        setOpen(true);
      }}>{label}</Button>
    <p id={hintId} className="text-xs text-muted-foreground">Dùng mã có nội dung, tối đa 100 ký tự và không có ký tự điều khiển. Quét lại hoặc nhập mã thủ công nếu mã không hợp lệ.</p>
    {feedback && <p id={feedbackId} role="status" aria-live="polite" className="text-sm [overflow-wrap:anywhere]">{feedback}</p>}
    <QrScanner open={open} scopeKey={scopeKey} title="Quét QR để điền tìm kiếm (tối đa 100 ký tự)"
      onOpenChange={next => { if (!next) close(); }} onConfirm={confirm} />
  </div>;
}
