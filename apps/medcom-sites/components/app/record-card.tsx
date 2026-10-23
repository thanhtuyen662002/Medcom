"use client";

import { ChevronRight } from "lucide-react";
import { StatusBadge, type StatusBadgeProps } from "./status-badge";

export interface RecordCardData { code: string; title: string; meta: readonly (string | null | undefined)[]; status?: StatusBadgeProps }
export interface RecordCardProps extends RecordCardData { onOpen: () => void }

export function RecordCard({ code, title, meta, status, onOpen }: RecordCardProps) {
  const details = [...new Set(meta.filter((part): part is string => Boolean(part?.trim()) && part !== code))];
  return <button type="button" onClick={onOpen} className="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-brand-500 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:focus-visible:outline-brand-300">
    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="flex min-w-0 items-start justify-between gap-2">
        <span className="break-all font-mono text-sm font-semibold text-brand-700 dark:text-brand-300">{code}</span>
        {status && <StatusBadge {...status} />}
      </span>
      {title !== code && <span className="line-clamp-2 break-words text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</span>}
      {details.length > 0 && <span className="break-words text-sm text-neutral-500 dark:text-neutral-400">{details.join(" · ")}</span>}
    </span>
    <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-neutral-400 dark:text-neutral-500" />
  </button>;
}
