"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export interface DocumentListColumn<T> {
  id: string;
  label: string;
  className?: string;
  render: (row: T) => ReactNode;
}

/** Responsive desktop presentation; the owning screen retains reads and actions. */
export function DocumentListTable<T>({ label, rows, columns, rowId, onOpen, loading = false, rowOffset = 0 }: {
  label: string;
  rows: T[];
  columns: DocumentListColumn<T>[];
  rowId: (row: T) => string;
  onOpen: (row: T) => void;
  loading?: boolean;
  rowOffset?: number;
}) {
  return (
    <div data-document-table className="hidden min-w-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs lg:block dark:border-neutral-800 dark:bg-neutral-900">
      <div role="region" aria-label={label} tabIndex={0} className="max-h-[calc(100dvh-21rem)] min-h-48 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500">
        <table aria-busy={loading} className="w-full min-w-[1000px] border-separate border-spacing-0 text-left text-sm leading-6 text-neutral-900 dark:text-white">
          <caption className="sr-only">{label}</caption>
          <thead className="sticky top-0 z-20 bg-neutral-50 dark:bg-neutral-950">
            <tr>
              <th scope="col" className="w-14 border-b border-neutral-200 px-4 py-3 text-center font-semibold dark:border-neutral-800">STT</th>
              {columns.map(column => <th key={column.id} scope="col" className={`whitespace-nowrap border-b border-neutral-200 px-4 py-3 font-semibold dark:border-neutral-800 ${column.className ?? ""}`}>{column.label}</th>)}
              <th scope="col" className="sticky right-0 w-20 whitespace-nowrap border-b border-neutral-200 bg-neutral-50 px-3 py-3 text-center font-semibold dark:border-neutral-800 dark:bg-neutral-950">Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 6 }, (_, index) => <tr key={index} aria-hidden="true">
              {Array.from({ length: columns.length + 2 }, (_, cell) => <td key={cell} className="border-b border-neutral-100 px-4 py-4 dark:border-neutral-800"><div className="h-5 medcom-shimmer rounded" /></td>)}
            </tr>) : rows.map((row, index) => <tr key={rowId(row)} onClick={() => onOpen(row)} className="group h-14 cursor-pointer transition-colors hover:bg-brand-50/60 focus-within:bg-brand-50/60 dark:hover:bg-brand-950/40 dark:focus-within:bg-brand-950/40">
              <td className="border-b border-neutral-100 px-4 py-3 text-center tabular-nums dark:border-neutral-800">{rowOffset + index + 1}</td>
              {columns.map(column => <td key={column.id} className={`border-b border-neutral-100 px-4 py-3 align-middle dark:border-neutral-800 ${column.className ?? ""}`}>{column.render(row)}</td>)}
              <td className="sticky right-0 border-b border-neutral-100 bg-white px-3 py-1.5 text-center group-hover:bg-brand-50 group-focus-within:bg-brand-50 dark:border-neutral-800 dark:bg-neutral-900 dark:group-hover:bg-brand-950 dark:group-focus-within:bg-brand-950">
                <button type="button" aria-label={`Mở chứng từ ${rowId(row)}`} onClick={event => { event.stopPropagation(); onOpen(row); }} className="inline-flex size-11 items-center justify-center rounded-lg text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:text-brand-300 dark:hover:bg-brand-900"><ChevronRight aria-hidden="true" className="size-4" /></button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div role="status" className="border-t border-neutral-200 bg-neutral-50/70 px-4 py-3 text-sm text-neutral-900 dark:border-neutral-800 dark:bg-neutral-950/50 dark:text-white">{loading ? "Đang tải danh sách…" : `Đang hiển thị ${rows.length} chứng từ`}</div>
    </div>
  );
}
