"use client";

import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DocumentListPaginationProps {
  page: number;
  pageSize: number;
  rowCount: number;
  visibleRowCount?: number;
  hasMore: boolean;
  busy?: boolean;
  pageSizeOptions?: readonly number[];
  maxPage?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

/** The API exposes hasMore, not a total; only offer pages known to exist. */
export function DocumentListPagination({ page, pageSize, rowCount, visibleRowCount = rowCount,
  hasMore, busy = false, pageSizeOptions = [20, 50, 100], maxPage = 10000,
  onPageChange, onPageSizeChange }: DocumentListPaginationProps) {
  const sizeId = useId();
  const canNext = hasMore && page < maxPage;
  // One page at the default size: page and size controls would only be noise.
  const singlePage = page === 1 && !hasMore && pageSize === pageSizeOptions[0];
  const pages = [...new Set([1, Math.max(1, page - 1), page, ...(canNext ? [page + 1] : [])])].sort((a, b) => a - b);
  const buttonClass = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800";

  return (
    <nav aria-label="Phân trang danh sách chứng từ" aria-busy={busy} data-document-pagination className="flex min-w-0 flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 sm:justify-start">
        <p role="status" aria-live="polite" className="text-sm text-black dark:text-white">
          <span className="font-semibold tabular-nums">Trang {page}</span>
          <span className="mx-2 text-neutral-400" aria-hidden="true">·</span>
          {busy ? "Đang tải…" : `${rowCount} chứng từ`}
          {!busy && visibleRowCount !== rowCount && <span className="block text-sm">Hiển thị {visibleRowCount} sau lọc trên trang này</span>}
        </p>
        {!singlePage && <label htmlFor={sizeId} className="flex items-center gap-2 text-sm text-black dark:text-white">
          <span>Dòng/trang</span>
          <select id={sizeId} aria-label="Số dòng mỗi trang" value={pageSize} disabled={busy} onChange={event => onPageSizeChange(Number(event.target.value))} className="min-h-11 rounded-lg border border-neutral-300 bg-white px-2 text-base font-medium text-black focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white">
            {pageSizeOptions.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>}
      </div>
      {!singlePage && <div className="flex items-center justify-between gap-2 sm:justify-end">
        <button type="button" aria-label="Trang trước" disabled={busy || page <= 1} onClick={() => onPageChange(page - 1)} className={buttonClass}><ChevronLeft aria-hidden="true" className="size-4" /><span>Trước</span></button>
        <div className="hidden items-center gap-1 sm:flex">
          {pages.map((number, index) => <span key={number} className="inline-flex items-center gap-1">
            {index > 0 && number - pages[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-black dark:text-white">…</span>}
            <button type="button" aria-label={`Đến trang ${number}`} aria-current={number === page ? "page" : undefined} disabled={busy || number === page} onClick={() => onPageChange(number)} className={number === page ? "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-brand-600 px-3 text-sm font-bold text-white" : buttonClass}>{number}</button>
          </span>)}
        </div>
        <span aria-hidden="true" className="text-sm font-semibold tabular-nums text-black sm:hidden dark:text-white">{page}</span>
        <button type="button" aria-label="Trang sau" disabled={busy || !canNext} onClick={() => onPageChange(page + 1)} className={buttonClass}><span>Sau</span><ChevronRight aria-hidden="true" className="size-4" /></button>
      </div>}
    </nav>
  );
}
