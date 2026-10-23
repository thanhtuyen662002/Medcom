"use client";

import { useState } from "react";
import { AppButton } from "./app-button";
import { AppSheet } from "./app-sheet";
import { FormField } from "./form-field";

export interface FilterValues { status: string; pageSize: number; dateFrom?: string; dateTo?: string }
export interface FilterOption { value: string; label: string }
export interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  value: FilterValues;
  statuses: readonly FilterOption[];
  onApply: (value: FilterValues) => void;
  dateRange?: boolean;
  id?: string;
  title?: string;
}

function FilterFields({ value, statuses, dateRange, onApply, onClose }: Pick<FilterSheetProps, "value" | "statuses" | "dateRange" | "onApply" | "onClose">) {
  const [draft, setDraft] = useState(value);
  const apply = (next: FilterValues) => { onApply(next); onClose(); };
  return <form aria-label="Bộ lọc danh sách" className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={event => { event.preventDefault(); apply(draft); }}>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
      <FormField label="Trạng thái">{control => <select {...control} value={draft.status} onChange={event => setDraft(current => ({ ...current, status: event.target.value }))}>
        <option value="">Tất cả trạng thái</option>{statuses.filter(option => option.value !== "").map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>}</FormField>
      <FormField label="Số dòng mỗi trang">{control => <select {...control} value={draft.pageSize} onChange={event => setDraft(current => ({ ...current, pageSize: Number(event.target.value) }))}>
        {[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
      </select>}</FormField>
      {dateRange && <div className="grid min-w-0 gap-4 sm:grid-cols-2 md:grid-cols-1">
        <FormField label="Từ ngày" type="date" value={draft.dateFrom ?? ""} max={draft.dateTo || undefined} onChange={event => setDraft(current => ({ ...current, dateFrom: event.target.value }))} />
        <FormField label="Đến ngày" type="date" value={draft.dateTo ?? ""} min={draft.dateFrom || undefined} onChange={event => setDraft(current => ({ ...current, dateTo: event.target.value }))} />
      </div>}
    </div>
    <footer className="sticky bottom-0 flex shrink-0 justify-end gap-3 border-t border-neutral-200 bg-white p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] dark:border-neutral-800 dark:bg-neutral-900">
      <AppButton variant="secondary" onClick={() => apply({ status: "", pageSize: 20, ...(dateRange ? { dateFrom: "", dateTo: "" } : {}) })}>Xóa lọc</AppButton>
      <AppButton type="submit">Áp dụng</AppButton>
    </footer>
  </form>;
}

export function FilterSheet({ open, onClose, value, statuses, onApply, dateRange = false, id, title = "Bộ lọc" }: FilterSheetProps) {
  return <AppSheet open={open} onClose={onClose} title={title} id={id} presentation="filter">
    <FilterFields key={`${open}:${JSON.stringify(value)}`} value={value} statuses={statuses} onApply={onApply} onClose={onClose} dateRange={dateRange} />
  </AppSheet>;
}
