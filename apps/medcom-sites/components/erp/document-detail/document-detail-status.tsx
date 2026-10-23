"use client";

import type { DocumentDetailModel } from "@/lib/erp/document-detail/model";
import { StatusBadge } from "@/components/app/status-badge";
import { RecordDetailStatus } from "../record-dialog";

export function DocumentDetailStatus({ status, subtitle, presentationAllowed = true }: {
  status: DocumentDetailModel["status"]; subtitle?: string; presentationAllowed?: boolean;
}) {
  return <RecordDetailStatus presentationAllowed={presentationAllowed}>
    {subtitle && <p data-document-detail-subtitle className="w-full text-sm leading-5 text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
    {status.label && <StatusBadge label={status.label} statusForeColor={status.style?.color} statusBackColor={status.style?.backgroundColor} />}
    {status.locked !== null && <StatusBadge label={status.locked ? "Đã khóa" : "Chưa khóa"} tone="neutral" />}
    {status.badges?.map(badge => <StatusBadge key={badge.id} title={badge.title} label={badge.label} statusForeColor={badge.style?.color} statusBackColor={badge.style?.backgroundColor} />)}
  </RecordDetailStatus>;
}
