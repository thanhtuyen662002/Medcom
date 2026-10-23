"use client";

import type { ComponentProps } from "react";
import { DocumentListPagination } from "@/components/untitledui/document-list-pagination";

export type PaginationProps = Omit<ComponentProps<typeof DocumentListPagination>, "pageSizeOptions">;

export function Pagination(props: PaginationProps) {
  return <DocumentListPagination {...props} pageSizeOptions={[20, 50, 100]} />;
}
