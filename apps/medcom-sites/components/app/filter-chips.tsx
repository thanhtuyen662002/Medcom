"use client";

import { AppButton } from "./app-button";

/** Omit count when the server does not provide totals for that status. */
export interface FilterChip { value: string; label: string; count?: number; disabled?: boolean }
export interface FilterChipsProps {
  items: readonly FilterChip[];
  value: string;
  onChange: (value: string) => void;
  onPageChange: (page: number) => void;
  label?: string;
}

export function FilterChips({ items, value, onChange, onPageChange, label = "Lọc nhanh trạng thái" }: FilterChipsProps) {
  return <div role="group" aria-label={label} className="flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain py-3">
    {items.map(item => <AppButton key={item.value} variant={value === item.value ? "primary" : "secondary"} aria-pressed={value === item.value} disabled={item.disabled}
      className="shrink-0 rounded-full" onClick={() => { onChange(item.value); onPageChange(1); }}>
      {item.label}{item.count !== undefined && <span className="tabular-nums">{item.count}</span>}
    </AppButton>)}
  </div>;
}
