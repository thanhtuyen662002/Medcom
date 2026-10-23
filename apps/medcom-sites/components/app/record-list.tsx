"use client";

import { ListState, type ListEmptyState } from "./list-state";
import { Pagination, type PaginationProps } from "./pagination";
import { RecordCard, type RecordCardData } from "./record-card";
import { RecordTable, type RecordColumn } from "./record-table";

export interface RecordListProps<T> {
  label: string;
  rows: T[];
  columns: RecordColumn<T>[];
  rowId: (row: T) => string;
  card: (row: T) => RecordCardData;
  onOpen: (row: T) => void;
  loading?: boolean;
  error?: string | null;
  /** Preserve the last successful page and its navigation after a failed read. */
  retainRowsOnError?: boolean;
  onRetry?: () => void;
  empty?: ListEmptyState;
  pagination?: PaginationProps;
}

export function RecordList<T>({ label, rows, columns, rowId, card, onOpen, loading = false, error, retainRowsOnError = false, onRetry, empty, pagination }: RecordListProps<T>) {
  return <section aria-label={label} aria-busy={loading} className="min-w-0 space-y-3">
    {error && <ListState state="error" error={error} onRetry={onRetry} />}
    {error && !retainRowsOnError ? null : loading ? <ListState state="loading" columnCount={columns.length + 2} /> : rows.length === 0 ? (error ? null : <ListState state="empty" empty={empty} />) : <>
      <div className="space-y-3 lg:hidden">{rows.map(row => <RecordCard key={rowId(row)} {...card(row)} onOpen={() => onOpen(row)} />)}</div>
      <RecordTable label={label} rows={rows} columns={columns} rowId={rowId} onOpen={onOpen} rowOffset={pagination ? (pagination.page - 1) * pagination.pageSize : 0} />
    </>}
    {pagination && <Pagination {...pagination} busy={pagination.busy || loading || (Boolean(error) && !retainRowsOnError)} />}
  </section>;
}
