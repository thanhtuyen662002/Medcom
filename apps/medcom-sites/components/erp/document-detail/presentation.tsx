"use client";

import { useId, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { DetailAction } from "@/lib/erp/document-detail/model";
import { AppButton } from "@/components/app/app-button";

export const detailStyles = {
  editor: "grid w-full min-w-0 gap-4 text-base leading-6 text-black dark:text-white [&_label]:text-sm! [&_label]:text-black! dark:[&_label]:text-white! [&_input]:text-base! [&_textarea]:text-base! [&_fieldset_button]:min-h-11! [&_fieldset_button]:text-base! [&_.text-xs]:text-sm!",
  field: "grid min-w-0 gap-2 text-sm font-medium text-black dark:text-white",
  values: "grid min-w-0 grid-cols-2 gap-x-5 gap-y-4 text-base leading-6 [&_dt]:mb-1 [&_dt]:text-sm [&_dt]:font-normal [&_dt]:text-neutral-500 dark:[&_dt]:text-neutral-400 [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:font-semibold [&_dd]:text-neutral-950 dark:[&_dd]:text-white",
};

export function DetailSection({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  const titleId = useId();
  return <section aria-labelledby={titleId} className={`min-w-0 space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs sm:p-5 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}>
    <h3 id={titleId} className="border-b border-neutral-100 pb-3 text-base font-bold leading-6 text-neutral-950 dark:border-neutral-800 dark:text-white">{title}</h3>
    {children}
  </section>;
}

export function DetailActionButton({ action, busy = false, onAction, menu = false, primary = false }: {
  action: DetailAction; busy?: boolean; onAction(id: string): void; menu?: boolean; primary?: boolean;
}) {
  if (!action.visible) return null;
  const disabled = (busy && action.disableWhileBusy !== false) || !!action.busy || !action.enabled;
  return <AppButton type="button" variant={primary ? "primary" : "secondary"}
    className={`${menu ? "w-full justify-start text-left" : `min-w-0 whitespace-nowrap px-3 sm:px-4 ${primary ? "flex-1 sm:flex-none" : ""}`} [&>svg]:shrink-0 ${action.tone === "danger" ? "text-red-600 dark:text-red-400" : ""}`}
    disabled={disabled} title={action.title ?? (disabled ? action.reason : undefined)} busy={!!action.busy}
    onClick={() => { if (!disabled || action.allowDisabledClick) onAction(action.id); }}>
    {action.busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : action.icon}{action.showReason ? <span>{action.label}{menu && !action.enabled && action.reason && <span className="block text-sm font-normal">{action.reason}</span>}</span> : action.label}
  </AppButton>;
}
