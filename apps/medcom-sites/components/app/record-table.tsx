"use client";

import { DocumentListTable, type DocumentListColumn } from "@/components/untitledui/document-list-table";

export type RecordColumn<T> = DocumentListColumn<T>;
export interface RecordTableProps<T> {
  label: string;
  rows: T[];
  columns: RecordColumn<T>[];
  rowId: (row: T) => string;
  onOpen: (row: T) => void;
  loading?: boolean;
  rowOffset?: number;
}

export function RecordTable<T>(props: RecordTableProps<T>) {
  return <DocumentListTable {...props} />;
}
