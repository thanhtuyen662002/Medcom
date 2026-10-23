"use client";

import { useId, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { DetailAction } from "@/lib/erp/document-detail/model";
import { RequestButton } from "../request-presentation";

export const detailStyles = {
  editor: "grid w-full min-w-0 gap-4 text-base leading-6 text-black dark:text-white [&_label]:text-sm! [&_label]:text-black! dark:[&_label]:text-white! [&_input]:text-base! [&_textarea]:text-base! [&_fieldset_button]:min-h-11! [&_fieldset_button]:text-base! [&_.text-xs]:text-sm!",
  field: "grid min-w-0 gap-2 text-sm font-medium text-black dark:text-white",
  values: "grid min-w-0 grid-cols-2 gap-x-5 gap-y-4 text-base leading-6 text-black dark:text-white [&_dt]:mb-1.5 [&_dt]:text-sm [&_dt]:font-medium [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:font-semibold",
};

export function DetailSection({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const titleId = useId();
  return <section aria-labelledby={titleId} className={`min-w-0 space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs sm:p-5 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}>
    <h3 id={titleId} className="text-base font-semibold leading-6 text-black dark:text-white">{title}</h3>
    {children}
  </section>;
}

export function DetailActionButton({ action, busy = false, onAction, menu = false }: {
  action: DetailAction; busy?: boolean; onAction(id: string): void; menu?: boolean;
}) {
  if (!action.visible) return null;
  const disabled = (busy && action.disableWhileBusy !== false) || !!action.busy || !action.enabled;
  return <RequestButton type="button" variant={action.tone === "outline" || action.tone === "danger" ? "outline" : "default"}
    className={`${menu ? "justify-start" : ""} ${action.tone === "danger" ? "text-red-600 dark:text-red-400" : ""}`}
    disabled={disabled} title={action.title ?? (disabled ? action.reason : undefined)} aria-busy={action.busy || undefined}
    onClick={() => { if (!disabled || action.allowDisabledClick) onAction(action.id); }}>
    {action.busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : action.icon}{action.showReason ? <span>{action.label}{menu && !action.enabled && action.reason && <span className="block text-sm font-normal">{action.reason}</span>}</span> : action.label}
  </RequestButton>;
}
