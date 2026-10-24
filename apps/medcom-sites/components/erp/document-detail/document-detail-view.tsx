"use client";

import { Fragment, type ReactNode } from "react";
import { DetailSkeleton } from "@/components/app/loading-skeleton";
import type { DocumentDetailHandlers, DocumentDetailModel } from "@/lib/erp/document-detail/model";
import type { DetailSlotId, DocumentDetailConfig, ErpScreenModule } from "@/lib/erp/document-detail/types";
import { RecordDetailHeading } from "../record-dialog";
import { RequestButton } from "../request-presentation";
import { DocumentActionBar } from "./document-action-bar";
import { DocumentDetailNotices } from "./document-detail-notices";
import { DocumentDetailStatus } from "./document-detail-status";
import { DocumentDetailTabs } from "./document-detail-tabs";
import { DocumentFieldGroup } from "./document-field-group";
import { DetailSection, detailStyles } from "./presentation";

export interface DocumentDetailViewProps {
  config: DocumentDetailConfig;
  model: DocumentDetailModel;
  handlers: DocumentDetailHandlers;
  module: ErpScreenModule;
  slots?: Partial<Record<DetailSlotId, ReactNode>>;
  menuDisabled?: boolean;
  menuTitle?: string;
  actionBarStart?: ReactNode;
  menuLabel?: string;
  menuOpen?: boolean;
  onMenuOpenChange?(open: boolean): void;
}

export function DocumentDetailView({ config, model, handlers, module, slots, menuDisabled, menuTitle, actionBarStart, menuLabel, menuOpen, onMenuOpenChange }: DocumentDetailViewProps) {
  const ready = !model.loading && !model.error && model.documentId !== null;
  const notice = config.notice?.[module];
  const editor = model.editing && config.slots?.includes("lines-editor") ? slots?.["lines-editor"] : undefined;
  const branch = [model.header.branchName, model.header.branchId].find(value => typeof value === "string" && value.trim());
  const documentType = config.title.replace(/^Chi tiết\s+/i, "");
  return <div data-document-detail-view className={detailStyles.editor}>
    <RecordDetailHeading title={config.messages?.heading ?? config.title} documentNumber={model.documentId}>
      {model.editing && <p role="status">{model.dirty ? "Có thay đổi chưa lưu" : config.messages?.editing ?? "Đang chỉnh sửa chứng từ"}</p>}
    </RecordDetailHeading>
    <DocumentDetailStatus status={model.status} subtitle={`${documentType.charAt(0).toLocaleUpperCase("vi-VN")}${documentType.slice(1)} · Chi nhánh ${branch ?? "—"}`} presentationAllowed={ready} />
    <DocumentDetailNotices model={model} handlers={handlers} />
    {model.loading ? <DetailSection title="Thông tin chung"><DetailSkeleton label={config.messages?.loading ?? "Đang tải chứng từ..."} /></DetailSection>
      : !ready ? <DetailSection title="Thông tin chung"><p role="alert" className="text-sm text-destructive">{model.error || config.messages?.empty || "Chưa có thông tin chứng từ."}</p><RequestButton type="button" onClick={handlers.onRetry}>Thử lại</RequestButton></DetailSection>
        : <>
          {notice && <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-black dark:border-brand-800 dark:bg-brand-950 dark:text-white"><strong>{notice.title}</strong><p className="mt-1">{notice.body}</p></div>}
          <div data-document-detail-overview className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
            {config.groups.map((group, index) => <div key={group.id} className={(group.width ?? (index >= 2 ? "full" : "half")) === "full" ? "min-w-0 lg:col-span-2" : "min-w-0"}><DocumentFieldGroup group={group} model={model} handlers={handlers} module={module} /></div>)}
          </div>
          {editor != null ? editor : <DocumentDetailTabs config={config} model={model} onLoadMore={handlers.onLoadMore} />}
          {config.comparison && model.comparison && model.comparison.rows.length > 0 && <DocumentDetailTabs
            config={{ ...config, lines: config.comparison, history: undefined, sections: undefined }}
            model={{ ...model, lines: model.comparison, summary: undefined }} onLoadMore={handlers.onLoadMore} />}
          {config.slots?.filter(slot => slot !== "lines-editor").map(slot => <Fragment key={slot}>{slots?.[slot]}</Fragment>)}
        </>}
    <DocumentActionBar actions={model.actions} busy={model.busy} presentationAllowed={ready} onAction={handlers.onAction} menuDisabled={menuDisabled} menuTitle={menuTitle} start={actionBarStart} menuLabel={menuLabel} menuOpen={menuOpen} onMenuOpenChange={onMenuOpenChange} />
  </div>;
}
