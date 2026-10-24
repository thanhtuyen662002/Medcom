"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DocumentDetailHandlers, DocumentDetailModel } from "@/lib/erp/document-detail/model";
import { DetailActionButton } from "./presentation";

export function DocumentDetailNotices({ model, handlers }: { model: DocumentDetailModel; handlers: DocumentDetailHandlers }) {
  const { feedback, pending, busy } = model;
  // The inline notice sits at the top of a long sheet; a toast reaches the user
  // wherever they pressed the button. One toast per feedback object.
  useEffect(() => {
    if (!feedback) return;
    const show = feedback.type === "success" ? toast.success : feedback.type === "warning" ? toast.warning : toast.error;
    show(feedback.message, { id: "document-detail-feedback" });
  }, [feedback]);
  return <>
    {feedback && <div role={feedback.type === "error" ? "alert" : "status"} className={`flex min-w-0 items-start gap-2 rounded-xl border p-3 text-sm ${
      feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
        : feedback.type === "warning" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"}`}>
      {feedback.type === "success" ? <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
      <span className="min-w-0 break-words">{feedback.message}</span>
    </div>}
    {busy && model.busyMessage && <div role="status" className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 text-base dark:border-brand-900 dark:bg-brand-950/40">
      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /><span>{model.busyMessage}</span>
    </div>}
    {pending && <div role="status" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-base text-black dark:border-amber-800 dark:bg-amber-950 dark:text-white">
      <p className="font-semibold">{pending.title}</p><p className="text-sm leading-6">{pending.body}</p>
      <div className="flex flex-wrap gap-2">{pending.actions.map(action => <DetailActionButton key={action.id} action={action} busy={busy} onAction={handlers.onAction} />)}</div>
    </div>}
  </>;
}
