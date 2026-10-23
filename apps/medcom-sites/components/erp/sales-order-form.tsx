"use client";

import React from "react";
import { Link2 } from "lucide-react";
import { UntitledBottomSheet } from "@/components/untitledui/bottom-sheet";
import { useSalesOrderDetail } from "@/lib/erp/document-detail/controllers/use-sales-order-detail";
import { salesOrderDetailConfig } from "@/lib/erp/document-detail/modules/sales";
import { emptySalesOrderLine } from "@/lib/erp/sales-order-lines";
import type { SalesOrderModule } from "@/lib/erp/sales-order-workflow";
import { formatMoney } from "@/lib/erp/money";
import { SalesOrderAttachmentList } from "./sales-order-attachment-list";
import { SalesOrderActionDialog } from "./sales-order-action-dialog";
import { SalesOrderLineEditor } from "./sales-order-line-editor";
import { DocumentDetailView } from "./document-detail/document-detail-view";
import { DetailSection as RecordSection, detailStyles as requestStyles } from "./document-detail/presentation";
import { RequestButton, RequestInput } from "./request-presentation";

function text(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function SalesOrderForm({
  branchId, documentId, onClose, onChanged, module = "sales-orders", onCloseGuardChange,
}: {
  branchId: string; documentId: string; module?: SalesOrderModule;
  onClose: () => void; onChanged: () => void;
  onCloseGuardChange?: (guard: (() => boolean) | null) => void;
}) {
  const prefix = React.useId(), docId = documentId;
  const { model, handlers, embedded, detail, draft, editLines, setEditLines,
    canEdit, busy, pending, acting, feedback, contract, contractOpen, setContractOpen,
    workflowAction, setWorkflowAction, send } = useSalesOrderDetail({ branchId, documentId, module, onClose, onChanged, onCloseGuardChange });
  const editing = model.editing;
  return <div data-sales-order-form>
    <DocumentDetailView config={salesOrderDetailConfig} model={model} handlers={handlers} module={module}
      menuDisabled={busy || pending} menuTitle="Thao tác đơn hàng"
      actionBarStart={!embedded && <RequestButton type="button" disabled={busy} onClick={onClose}>Đóng</RequestButton>}
      slots={{
        "lines-editor": (<fieldset disabled={!canEdit} className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900"><SalesOrderLineEditor lines={editLines} branchId={branchId} contractId={draft.contractId}
            onPatch={(key,patch)=>setEditLines(previous=>previous.map(line=>line.key===key?{...line,...patch}:line))}
            onAdd={()=>{const key=crypto.randomUUID();setEditLines(previous=>[...previous,emptySalesOrderLine(key)]);return key;}}
            onRemove={key=>setEditLines(previous=>previous.filter(line=>line.key!==key))} /></fieldset>),
        attachments: detail && (<RecordSection title="Tài liệu đính kèm">
            {editing ? <div className={requestStyles.field}><label htmlFor={`${prefix}-link`}>Link tài liệu đính kèm</label>
              <div className="flex min-w-0 flex-wrap gap-2">
                <RequestInput id={`${prefix}-link`} className="min-w-0 flex-1 basis-52" disabled={!canEdit} value={draft.linkId}
                  onChange={event => handlers.onFieldChange("linkId", event.target.value)} placeholder="Dán link tài liệu..." />
                <RequestButton type="button" disabled={!/^https?:\/\//i.test(draft.linkId.trim())}
                  onClick={() => { const url = draft.linkId.trim(); if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer"); }}><Link2 className="size-4" />Mở tài liệu</RequestButton>
              </div>
            </div> : draft.linkId.trim() && <dl className={requestStyles.values}>
              <div className="col-span-full"><dt>Link tài liệu đính kèm</dt><dd>
                {/^https?:\/\//i.test(draft.linkId.trim()) ? <a className="inline-flex min-h-11 max-w-full items-center gap-2 text-primary underline underline-offset-4" href={draft.linkId.trim()} target="_blank" rel="noopener noreferrer"><Link2 className="size-4 shrink-0" />Mở tài liệu</a> : draft.linkId}
              </dd></div>
            </dl>}
            <SalesOrderAttachmentList embedded key={`${module}:${branchId}:${detail.documentId}`} module={module} branchId={branchId} documentId={detail.documentId} />
          </RecordSection>),
        "contract-info": (<>
      {/* Modal hợp đồng */}
      <UntitledBottomSheet open={contractOpen} onClose={() => setContractOpen(false)} title="Thông tin hợp đồng">
            <div className="p-2 text-base space-y-3">
          {!contract ? <p className="text-neutral-400">Không có dữ liệu.</p> : (
            <>
              <p><span className="text-neutral-400">Mã hợp đồng: </span><strong>{text(contract.contractNo || contract.contractId)}</strong></p>
              {contract.objectName && <p><span className="text-neutral-400">Khách hàng: </span><strong>{text(contract.objectName)}</strong></p>}
              {contract.totalAmount && <p><span className="text-black dark:text-white">Tổng tiền: </span><strong className="tabular-nums">{formatMoney(contract.totalAmount)}</strong></p>}
              {contract.notes && <p><span className="text-neutral-400">Ghi chú: </span>{text(contract.notes)}</p>}
            </>
          )}
        </div>
      </UntitledBottomSheet>
</>),
      }} />
      {workflowAction && <SalesOrderActionDialog key={module + ":" + docId + ":" + workflowAction} module={module} operation={workflowAction}
        branchId={branchId} documentId={docId} busy={!!acting} message={feedback?.type !== "success" ? feedback?.message : undefined} onClose={()=>setWorkflowAction(null)}
        onConfirm={payload=>void send(workflowAction,workflowAction==="delete"?{}:{payload})} />}
  </div>;
}
