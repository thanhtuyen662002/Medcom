"use client";

import type { DocumentDetailModel } from "@/lib/erp/document-detail/model";
import { RecordDetailStatus } from "../record-dialog";

export function DocumentDetailStatus({ status, presentationAllowed = true }: {
  status: DocumentDetailModel["status"]; presentationAllowed?: boolean;
}) {
  return <RecordDetailStatus presentationAllowed={presentationAllowed}>
    {status.label && <span style={status.style} className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm font-semibold text-black dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">{status.label}</span>}
    {status.locked !== null && <span className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-medium text-black dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">{status.locked ? "Đã khóa" : "Chưa khóa"}</span>}
    {status.badges?.map(badge => <span key={badge.id} title={badge.title} style={badge.style} className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm font-medium text-black dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">{badge.label}</span>)}
  </RecordDetailStatus>;
}
