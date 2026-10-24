"use client";

import { AlertCircle, Inbox } from "lucide-react";
import { AppButton } from "./app-button";

export interface ListEmptyState { message: string; onCreate?: () => void; createLabel?: string }
export type ListStateProps =
  | { state: "loading"; label?: string; columnCount?: number }
  | { state: "empty"; empty?: ListEmptyState }
  | { state: "error"; error: string; onRetry?: () => void };

export function ListState(props: ListStateProps) {
  if (props.state === "loading") return <div role="status" aria-busy="true" aria-label={props.label ?? "Đang tải danh sách…"}>
    <span className="sr-only">{props.label ?? "Đang tải danh sách…"}</span>
    <div aria-hidden="true" className="space-y-3 lg:hidden">{Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {["w-1/3", "w-2/3", "w-1/2"].map(width => <div key={width} className={`h-5 rounded medcom-shimmer ${width}`} />)}
    </div>)}</div>
    <div aria-hidden="true" className="hidden overflow-hidden rounded-2xl border border-neutral-200 bg-white lg:block dark:border-neutral-800 dark:bg-neutral-900">
      {Array.from({ length: 6 }, (_, row) => <div key={row} className="flex gap-4 border-b border-neutral-100 p-4 last:border-0 dark:border-neutral-800">
        {Array.from({ length: props.columnCount ?? 4 }, (_, column) => <div key={column} className="h-5 flex-1 rounded medcom-shimmer" />)}
      </div>)}
    </div>
  </div>;
  if (props.state === "error") return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
    <AlertCircle aria-hidden="true" className="size-5 shrink-0" /><p className="min-w-0 flex-1 break-words">{props.error}</p>
    {props.onRetry && <AppButton variant="secondary" onClick={props.onRetry}>Thử lại</AppButton>}
  </div>;
  return <div role="status" className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
    <Inbox aria-hidden="true" className="size-9" /><p>{props.empty?.message ?? "Chưa có chứng từ."}</p>
    {props.empty?.onCreate && <AppButton onClick={props.empty.onCreate}>{props.empty.createLabel ?? "Tạo mới"}</AppButton>}
  </div>;
}
