"use client";

import { useEffect, useRef } from "react";
import { Plus, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { AppButton } from "./app-button";

export interface ScreenToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSearch: (value: string) => void;
  onFilter: () => void;
  onRefresh: () => void;
  filterCount?: number;
  filterOpen?: boolean;
  filterId?: string;
  refreshing?: boolean;
  onCreate?: () => void;
  createDisabled?: boolean;
  createLabel?: string;
  searchLabel?: string;
  placeholder?: string;
}

export function ScreenToolbar({ search, onSearchChange, onSearch, onFilter, onRefresh, filterCount = 0, filterOpen = false, filterId,
  refreshing = false, onCreate, createDisabled, createLabel = "Tạo mới", searchLabel = "Tìm kiếm chứng từ", placeholder = "Tìm mã, đối tượng, người lập…" }: ScreenToolbarProps) {
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSearch = useRef<string | null>(null);
  const searchCallback = useRef(onSearch);
  const input = useRef<HTMLInputElement>(null);
  const cancel = () => { if (pending.current !== null) clearTimeout(pending.current); pending.current = null; pendingSearch.current = null; };
  useEffect(() => { searchCallback.current = onSearch; }, [onSearch]);
  useEffect(() => {
    if (pendingSearch.current !== null && pendingSearch.current !== search) {
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = null;
      pendingSearch.current = null;
    }
  }, [search]);
  useEffect(() => () => { if (pending.current !== null) clearTimeout(pending.current); }, []);

  return <div data-app-toolbar className="sticky top-[var(--app-toolbar-top,0px)] z-30 flex min-w-0 items-center gap-2 border-b border-neutral-200 bg-white py-3 dark:border-neutral-800 dark:bg-neutral-900">
    <form role="search" aria-label={searchLabel} className="relative min-w-0 flex-1" onSubmit={event => { event.preventDefault(); cancel(); onSearch(search); }}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-5 text-neutral-400 dark:text-neutral-500" />
      <input ref={input} type="search" aria-label={searchLabel} placeholder={placeholder} value={search}
        onChange={event => { const value = event.target.value; cancel(); pendingSearch.current = value; onSearchChange(value); pending.current = setTimeout(() => { pending.current = null; pendingSearch.current = null; searchCallback.current(value); }, 300); }}
        className="min-h-11 w-full min-w-0 rounded-xl border border-neutral-300 bg-white pl-10 pr-11 text-base text-neutral-900 placeholder:text-neutral-500 focus-visible:outline-brand-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-400 dark:focus-visible:outline-brand-300 [&::-webkit-search-cancel-button]:appearance-none" />
      {search && <AppButton variant="ghost" size="icon" className="absolute right-0 top-0" aria-label="Xóa tìm kiếm"
        onClick={() => { cancel(); onSearchChange(""); onSearch(""); input.current?.focus(); }}><X aria-hidden="true" className="size-5" /></AppButton>}
    </form>
    <AppButton variant="secondary" onClick={onFilter} aria-label={`Bộ lọc${filterCount > 0 ? ` (${filterCount})` : ""}`} aria-haspopup="dialog" aria-expanded={filterOpen} aria-controls={filterId} className="shrink-0 px-3">
      <SlidersHorizontal aria-hidden="true" className="size-5" /><span className="hidden sm:inline">Bộ lọc</span>
      {filterCount > 0 && <span aria-hidden="true" className="rounded-full bg-brand-100 px-1.5 text-sm tabular-nums text-brand-800 dark:bg-brand-900 dark:text-brand-200">{filterCount}</span>}
    </AppButton>
    <AppButton variant="ghost" size="icon" aria-label="Làm mới" busy={refreshing} onClick={onRefresh}>
      <RefreshCw aria-hidden="true" className={`size-5 ${refreshing ? "motion-safe:animate-spin" : ""}`} />
    </AppButton>
    {onCreate && <AppButton onClick={onCreate} disabled={createDisabled} className="hidden shrink-0 md:inline-flex"><Plus aria-hidden="true" className="size-5" />{createLabel}</AppButton>}
  </div>;
}
