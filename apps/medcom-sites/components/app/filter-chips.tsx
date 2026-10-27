"use client";

import { cn } from "@/lib/utils";

/** Omit count when the server does not provide totals for that status. */
export interface FilterChip { value: string; label: string; count?: number; disabled?: boolean }
export interface FilterChipsProps {
  items: readonly FilterChip[];
  value: string;
  onChange: (value: string) => void;
  onPageChange: (page: number) => void;
  label?: string;
  description?: string;
}

export function FilterChips({ items, value, onChange, onPageChange, label = "Lọc nhanh trạng thái", description }: FilterChipsProps) {
  // The visible pill is 32px (the ::before layer); the button itself keeps the 44px tap target.
  return <div role="group" aria-label={label} title={description} className="app-filter-chips flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain">
    {items.map(item => {
      const active = value === item.value;
      return <button key={item.value} type="button" aria-pressed={active} disabled={item.disabled} onClick={() => { onChange(item.value); onPageChange(1); }}
        className={cn("relative isolate inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-[0.8125rem] font-semibold transition-colors",
          "before:absolute before:inset-x-0 before:inset-y-1.5 before:-z-10 before:rounded-full before:border before:transition-colors",
          "focus-visible:outline-none focus-visible:before:ring-2 focus-visible:before:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50",
          active ? "text-white before:border-brand-600 before:bg-brand-600 dark:before:border-brand-500 dark:before:bg-brand-500"
            : "text-neutral-700 before:border-neutral-300 before:bg-white hover:before:bg-neutral-100 dark:text-neutral-200 dark:before:border-neutral-700 dark:before:bg-neutral-900 dark:hover:before:bg-neutral-800")}>
        {item.label}{item.count !== undefined && <span className={cn("tabular-nums", active ? "text-white/85" : "text-neutral-500 dark:text-neutral-400")}>{item.count}</span>}
      </button>;
    })}
  </div>;
}
