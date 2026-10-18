"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, FileText, Link2, Loader2, RefreshCw, Save, Pencil, MoreHorizontal, Undo2, Send } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type {
  ErpActionState,
  ErpChoice,
  ErpCommandResult,
  ErpContractInfo,
  ErpDocumentDetail,
} from "@/lib/erp/erp-screen-contracts";
import { LookupField, fieldText } from "@/components/untitledui/lookup-field";
import { UntitledBottomSheet } from "@/components/untitledui/bottom-sheet";
import { buildSalesOrderSaveHeader } from "@/lib/erp/sales-order-form";
import { salesOrderField } from "@/lib/erp/sales-order-lookups";
import { SalesOrderAttachmentList } from "./sales-order-attachment-list";
import { SalesOrderDetailTabs } from "./sales-order-detail-tabs";
import { RecordActionBar, RecordDetailHeading, RecordDetailStatus } from "./record-dialog";
import { RequestButton, RequestInput, RequestTextarea, RecordDetailContext, requestDate, requestStyles as sharedRequestStyles } from "./request-presentation";

/* Shared record detail: display saved values until the user chooses Sửa. */

// Sales presentation stays local; other record screens retain their layout.
const requestStyles = {
  ...sharedRequestStyles,
  editor: "grid w-full min-w-0 gap-4 text-base leading-6 text-black dark:text-white [&_label]:text-sm! [&_label]:text-black! dark:[&_label]:text-white! [&_input]:text-base! [&_textarea]:text-base! [&_fieldset_button]:min-h-11! [&_fieldset_button]:text-base! [&_.text-xs]:text-sm!",
  field: "grid min-w-0 gap-2 text-sm font-medium text-black dark:text-white",
  values: "grid min-w-0 grid-cols-2 gap-x-5 gap-y-4 text-base leading-6 text-black dark:text-white [&_dt]:mb-1.5 [&_dt]:text-sm [&_dt]:font-medium [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:font-semibold",
  muted: "text-sm leading-6 text-black dark:text-white",
};

function RecordSection({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  const titleId = React.useId();
  return <section aria-labelledby={titleId} className={`min-w-0 space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs sm:p-5 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}>
    <h3 id={titleId} className="text-base font-semibold leading-6 text-black dark:text-white">{title}</h3>
    {children}
  </section>;
}

const LOOKUPS = {
  contractId: "header.ContractID",
  managerId: "header.ManagerID",
  employeeId: "header.EmployeeID",
  objectId: "header.ObjectID",
} as const;

function text(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function isoDate(v: unknown): string {
  return typeof v === "string" ? v.slice(0, 10) : "";
}

function outcomeMessage(res: ErpCommandResult): { type: "success" | "error" | "warning"; message: string } {
  switch (res.outcome) {
    case "Committed":
    case "Replayed":
      return { type: "success", message: "Thao tác thành công. Dữ liệu chứng từ đã được cập nhật." };
    case "Conflict":
      return { type: "error", message: "Trạng thái chứng từ đã thay đổi. Vui lòng tải lại rồi thử lại." };
    case "Denied":
      return { type: "error", message: "Tài khoản hiện tại không có quyền thực hiện thao tác này." };
    case "InvalidInput":
      return { type: "error", message: "Thông tin chưa hợp lệ hoặc thiếu trường bắt buộc." };
    case "QualificationRequired":
      return { type: "warning", message: "Hệ thống đang ở chế độ kiểm soát an toàn, chưa ghi trực tiếp." };
    default:
      return { type: "error", message: res.code ? `Thao tác không thành công (${res.code}).` : "Thao tác không thành công." };
  }
}

function reasonMessage(reason?: string | null): string {
  switch (reason) {
    case "native_permission_or_hidden": return "Chưa được phân quyền hoặc bị ẩn theo quy tắc ERP.";
    case "save_document_first": return "Vui lòng lưu chứng từ trước.";
    case "state_or_assignment_not_allowed": return "Trạng thái hiện tại không cho phép thao tác này.";
    case "erp_write_unqualified": return "Hệ thống đang ở chế độ bảo vệ dữ liệu.";
    default: return reason || "";
  }
}

interface Draft {
  documentDate: string;
  contractId: string;
  managerId: string;
  employeeId: string;
  objectId: string;
  deliverDate: string;
  memo: string;
  ghiChuDonHang: string;
  linkId: string;
  documentUrl: string;
}

const EMPTY_DRAFT: Draft = {
  documentDate: "", contractId: "", managerId: "", employeeId: "", objectId: "",
  deliverDate: "", memo: "", ghiChuDonHang: "", linkId: "", documentUrl: "",
};

function draftFromHeader(header: Record<string, unknown>): Draft {
  return { documentDate: isoDate(header.documentDate), contractId: text(header.contractId),
    managerId: text(header.managerId), employeeId: text(header.employeeId), objectId: text(header.objectId),
    deliverDate: isoDate(header.deliverDate), memo: text(header.memo), ghiChuDonHang: text(header.ghiChuDonHang),
    linkId: text(header.linkId), documentUrl: text(header.documentUrl) };
}

export function SalesOrderForm({
  branchId,
  documentId,
  onClose,
  onChanged,
}: {
  branchId: string;
  documentId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const embedded = React.useContext(RecordDetailContext);
  const prefix = React.useId();
  const docId = documentId;
  const [editing, setEditing] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [detail, setDetail] = useState<ErpDocumentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [choices, setChoices] = useState<Record<string, ErpChoice | null>>({});
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);
  // Modal hợp đồng / PM / thu hồi.
  const [contract, setContract] = useState<ErpContractInfo | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [pmOpen, setPmOpen] = useState(false);
  const [pmItems, setPmItems] = useState<ErpChoice[]>([]);
  const [pmSearch, setPmSearch] = useState("");
  const [pmId, setPmId] = useState("");
  const [pmNotes, setPmNotes] = useState("");
  const [recallOpen, setRecallOpen] = useState(false);

  const load = useCallback(async (id: string) => {
    setEditing(false);
    setLoading(true);
    setError(null);
    setFeedback(null);
    try {
      const data = await erpClient.getErpModuleDetail("sales-orders", {
        branchId, documentId: id, page: 1, pageSize: 50,
      });
      setDetail(data);
      const h = (data.header || {}) as Record<string, unknown>;
      setDraft(draftFromHeader(h));
      setChoices({});
    } catch {
      setDetail(null);
      setError("Không thể tải chi tiết đơn hàng. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { void load(docId); }, [docId, load]);

  const set = (k: keyof Draft, v: string) => setDraft((p) => ({ ...p, [k]: v }));
  const pick = (k: string, c: ErpChoice | null) => {
    setChoices((p) => ({ ...p, [k]: c }));
    set(k as keyof Draft, c ? c.id : "");
  };

  const header = (detail?.header || {}) as Record<string, unknown>;
  const originalCustomer = draft.objectId === text(header.objectId);
  const customerName = salesOrderField(choices.objectId, "ObjectName") ||
    (originalCustomer ? text(header.objectName) : "");
  const customerAddr = salesOrderField(choices.objectId, "Address") ||
    (originalCustomer ? text(header.address) : "");
  const statusName = text(header.statusName) || "—";
  const actions = detail?.actions || [];
  const act = (id: string): ErpActionState | undefined => actions.find((a) => a.id === id);

  async function handleSave() {
    if (!editing || !detail || saving || acting || !detail.actions.some(action => action.id === "save" && action.visible && action.enabled)) return;
    if (!draft.documentDate.trim() || !draft.objectId.trim() || !draft.employeeId.trim()) {
      setFeedback({ type: "warning", message: "Vui lòng nhập đủ Ngày CT, Khách hàng và Mã nhân viên trước khi lưu." });
      return;
    }
    const headerDto = buildSalesOrderSaveHeader(
      (detail.header || {}) as Record<string, unknown>, draft,
    );
    setSaving(true);
    setFeedback(null);
    try {
      const res = await erpClient.saveDocument("sales-orders", {
        idempotencyKey: `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        branchId,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        header: headerDto,
        lineChanges: [],
      });
      const fb = outcomeMessage(res);
      setFeedback(fb);
      if (res.outcome === "Committed" || res.outcome === "Replayed") {
        onChanged();
        await load(detail.documentId);
      }
    } catch {
      setFeedback({ type: "error", message: "Lỗi kết nối khi lưu đơn hàng." });
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (!detail) return;
    const h = (detail.header || {}) as Record<string, unknown>;
    setDraft(draftFromHeader(h));
    setChoices({});
    setFeedback(null);
    setEditing(false);
  }

  async function runAction(op: string, payload: Record<string, unknown>) {
    if (!detail || editing || loading || saving || acting || !detail.actions.some(action => action.id === op && action.visible && action.enabled)) return;
    setActing(op);
    setFeedback(null);
    try {
      const res = await erpClient.executeWorkflowAction("sales-orders", op, {
        idempotencyKey: `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        branchId,
        documentId: detail.documentId,
        expectedStateToken: detail.stateToken,
        payload,
      });
      const fb = outcomeMessage(res);
      setFeedback(fb);
      if (res.outcome === "Committed" || res.outcome === "Replayed") {
        onChanged();
        await load(detail.documentId);
      }
    } catch {
      setFeedback({ type: "error", message: "Lỗi kết nối khi gửi thao tác tới máy chủ." });
    } finally {
      setActing(null);
    }
  }

  async function openContract() {
    if (!detail) return;
    try {
      const info = await erpClient.getErpContract("sales-orders", { branchId, documentId: detail.documentId });
      setContract(info);
      setContractOpen(true);
    } catch {
      setFeedback({ type: "error", message: "Không thể tải thông tin hợp đồng." });
    }
  }

  async function openPm() {
    if (!detail) return;
    setPmOpen(true);
    setPmId("");
    try {
      const page = await erpClient.getPmOptions("sales-orders", { branchId, role: "primary", page: 1, pageSize: 20, search: pmSearch.trim() || null });
      setPmItems(page.items || []);
    } catch {
      setPmItems([]);
    }
  }

  const saveAct = act("save");
  const recallAct = act("recall");
  const sendPmAct = act("send-pm");
  const contractAct = act("contract-info");
  const busy = loading || saving || !!acting;
  const canSave = !!saveAct?.visible && saveAct.enabled && !busy;
  const canEdit = editing && canSave;
  const dirty = !!detail && JSON.stringify(draft) !== JSON.stringify(draftFromHeader(header));
  const inputCls = "w-full min-h-11 min-w-0 rounded-xl border border-border bg-background p-3 text-base text-foreground";
  const locked = header.isLocked === true || header.isLocked === 1 || header.isLocked === "1";
  const knownLock = locked || header.isLocked === false || header.isLocked === 0 || header.isLocked === "0";

  return (
    <div data-sales-order-form className={requestStyles.editor}>
      <RecordDetailHeading title="Đơn hàng" documentNumber={detail?.documentId}>
        {editing && <p role="status">{dirty ? "Có thay đổi chưa lưu" : "Đang chỉnh sửa đơn hàng"}</p>}
      </RecordDetailHeading>
      <RecordDetailStatus presentationAllowed={!!detail && !loading}>
        <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm font-semibold text-black dark:border-neutral-700 dark:bg-neutral-800 dark:text-white">{statusName}</span>
        {knownLock && <span className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-medium text-black dark:border-neutral-700 dark:text-white">{locked ? "Đã khóa" : "Chưa khóa"}</span>}
      </RecordDetailStatus>

      {feedback && <div role="status" className={`flex min-w-0 items-start gap-2 rounded-xl border p-3 text-sm ${
        feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
          : feedback.type === "warning" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"}`}>
        {feedback.type === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" />}
        <span className="min-w-0 break-words">{feedback.message}</span>
      </div>}

      {loading ? <RecordSection title="Thông tin chung"><div role="status" className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="size-5 animate-spin" />Đang tải đơn hàng...</div></RecordSection>
        : error || !detail ? <RecordSection title="Thông tin chung"><p role="alert" className="text-sm text-destructive">{error || "Chưa có thông tin đơn hàng."}</p>
          <RequestButton type="button" onClick={() => void load(docId)}>Thử lại</RequestButton></RecordSection>
        : <>
          {(!saveAct?.visible || !saveAct.enabled) && <p className={requestStyles.muted}>Đơn hàng hiện chỉ được xem. {saveAct?.reason ? reasonMessage(saveAct.reason) : "Các thao tác thực hiện theo quyền và trạng thái của đơn."}</p>}
          <div data-sales-order-overview className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
            <RecordSection title="Thông tin đơn hàng" className="h-full">
              {editing ? <fieldset disabled={!canEdit} className="grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2 xl:grid-cols-3">
                <div className={requestStyles.field}><label htmlFor={`${prefix}-date`}>Ngày chứng từ *</label>
                  <RequestInput id={`${prefix}-date`} type="date" value={draft.documentDate} onChange={event => set("documentDate", event.target.value)} /></div>
                <div className={requestStyles.field}><label htmlFor={`${prefix}-deliver`}>Ngày giao</label>
                  <RequestInput id={`${prefix}-deliver`} type="date" value={draft.deliverDate} onChange={event => set("deliverDate", event.target.value)} /></div>
                <dl className={`${requestStyles.values} sm:col-span-2 xl:col-span-1`}><div className="col-span-full"><dt>Chi nhánh</dt><dd>{text(header.branchName) || text(header.branchId) || branchId}</dd></div></dl>
              </fieldset> : <dl className={`${requestStyles.values} sm:grid-cols-3`}>
                <div><dt>Ngày chứng từ</dt><dd className="tabular-nums">{draft.documentDate ? requestDate(draft.documentDate) : "—"}</dd></div>
                <div><dt>Ngày giao</dt><dd className="tabular-nums">{draft.deliverDate ? requestDate(draft.deliverDate) : "—"}</dd></div>
                <div className="col-span-full sm:col-span-1"><dt>Chi nhánh</dt><dd>{text(header.branchName) || text(header.branchId) || branchId}</dd></div>
              </dl>}
              <div className="space-y-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <h4 className="text-sm font-semibold">Người phụ trách</h4>
                {editing ? <fieldset disabled={!canEdit} className="grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2">
                  <LookupField label="Nhân viên" required module="sales-orders" lookupId={LOOKUPS.employeeId} branchId={branchId}
                    value={draft.employeeId} choice={choices.employeeId ?? null} displayValue={draft.employeeId === text(header.employeeId) ? text(header.employeeName) || draft.employeeId : draft.employeeId}
                    onSelect={choice => pick("employeeId", choice)} placeholder="Chọn nhân viên..." />
                  <LookupField label="Quản lý" module="sales-orders" lookupId={LOOKUPS.managerId} branchId={branchId}
                    value={draft.managerId} choice={choices.managerId ?? null} displayValue={draft.managerId === text(header.managerId) ? text(header.managerName) || draft.managerId : draft.managerId}
                    onSelect={choice => pick("managerId", choice)} placeholder="Chọn quản lý..." />
                </fieldset> : <dl className={requestStyles.values}>
                  <div><dt>Nhân viên</dt><dd>{text(header.employeeName) || draft.employeeId || "—"}</dd></div>
                  <div><dt>Quản lý</dt><dd>{text(header.managerName) || draft.managerId || "—"}</dd></div>
                </dl>}
              </div>
            </RecordSection>

            <RecordSection title="Khách hàng & hợp đồng" className="h-full">
              {editing ? <fieldset disabled={!canEdit} className="grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2">
                <div className="min-w-0 sm:col-span-2"><LookupField label="Khách hàng" required module="sales-orders" lookupId={LOOKUPS.objectId} branchId={branchId}
                  value={draft.objectId} choice={choices.objectId ?? null} displayValue={customerName || draft.objectId}
                  onSelect={choice => pick("objectId", choice)} placeholder="Chọn khách hàng..." /></div>
                <dl className={requestStyles.values}><div className="col-span-full"><dt>Địa chỉ khách hàng</dt><dd className="whitespace-pre-wrap">{customerAddr || "—"}</dd></div></dl>
                <LookupField label="Hợp đồng" module="sales-orders" lookupId={LOOKUPS.contractId} branchId={branchId}
                  value={draft.contractId} choice={choices.contractId ?? null} displayValue={draft.contractId === text(header.contractId) ? text(header.contractName) || draft.contractId : draft.contractId}
                  onSelect={choice => pick("contractId", choice)} placeholder="Chọn hợp đồng..." />
              </fieldset> : <dl className={requestStyles.values}>
                <div className="col-span-full border-b border-neutral-100 pb-4 dark:border-neutral-800"><dt>Khách hàng</dt><dd className="text-lg leading-7">{customerName || draft.objectId || "—"}
                  {customerName && draft.objectId && <span className="mt-1 block text-sm font-normal leading-6">{draft.objectId}</span>}</dd></div>
                <div className="col-span-full sm:col-span-1"><dt>Địa chỉ khách hàng</dt><dd className="whitespace-pre-wrap">{customerAddr || "—"}</dd></div>
                <div className="col-span-full sm:col-span-1"><dt>Hợp đồng</dt><dd>{text(header.contractName) || draft.contractId || "—"}
                  {text(header.contractName) && draft.contractId && <span className="mt-1 block text-sm font-normal">{draft.contractId}</span>}</dd></div>
              </dl>}
            </RecordSection>
          </div>

          {editing || draft.memo.trim() || draft.ghiChuDonHang.trim() ? <RecordSection title="Nội dung & ghi chú">
            {editing ? <fieldset disabled={!canEdit} className="grid min-w-0 gap-4 border-0 p-0 sm:grid-cols-2">
              <div className={requestStyles.field}><label htmlFor={`${prefix}-memo`}>Diễn giải</label>
                <RequestTextarea id={`${prefix}-memo`} rows={3} value={draft.memo} onChange={event => set("memo", event.target.value)} /></div>
              <div className={requestStyles.field}><label htmlFor={`${prefix}-notes`}>Ghi chú đơn hàng</label>
                <RequestTextarea id={`${prefix}-notes`} rows={3} maxLength={250} value={draft.ghiChuDonHang} onChange={event => set("ghiChuDonHang", event.target.value)} /></div>
            </fieldset> : <dl className={`${requestStyles.values} [&_dd]:font-normal!`}>
              <div className="col-span-full sm:col-span-1"><dt>Diễn giải</dt><dd className="whitespace-pre-wrap">{draft.memo || "—"}</dd></div>
              <div className="col-span-full sm:col-span-1"><dt>Ghi chú đơn hàng</dt><dd className="whitespace-pre-wrap">{draft.ghiChuDonHang || "—"}</dd></div>
            </dl>}
          </RecordSection> : <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            <span className="inline-flex items-center gap-2 font-semibold"><FileText aria-hidden="true" className="size-4 shrink-0" />Nội dung & ghi chú</span>
            <span>Chưa có diễn giải hoặc ghi chú.</span>
          </div>}

          <SalesOrderDetailTabs lines={detail.lines?.rows || []} history={detail.history?.rows || []} />

          <RecordSection title="Tài liệu đính kèm">
            {editing ? <div className={requestStyles.field}><label htmlFor={`${prefix}-link`}>Link tài liệu đính kèm</label>
              <div className="flex min-w-0 flex-wrap gap-2">
                <RequestInput id={`${prefix}-link`} className="min-w-0 flex-1 basis-52" disabled={!canEdit} value={draft.linkId}
                  onChange={event => set("linkId", event.target.value)} placeholder="Dán link tài liệu..." />
                <RequestButton type="button" disabled={!/^https?:\/\//i.test(draft.linkId.trim())}
                  onClick={() => { const url = draft.linkId.trim(); if (/^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener,noreferrer"); }}><Link2 className="size-4" />Mở tài liệu</RequestButton>
              </div>
            </div> : draft.linkId.trim() && <dl className={requestStyles.values}>
              <div className="col-span-full"><dt>Link tài liệu đính kèm</dt><dd>
                {/^https?:\/\//i.test(draft.linkId.trim()) ? <a className="inline-flex min-h-11 max-w-full items-center gap-2 text-primary underline underline-offset-4" href={draft.linkId.trim()} target="_blank" rel="noopener noreferrer"><Link2 className="size-4 shrink-0" />Mở tài liệu</a> : draft.linkId}
              </dd></div>
            </dl>}
            <SalesOrderAttachmentList embedded key={`${branchId}:${detail.documentId}`} branchId={branchId} documentId={detail.documentId} />
          </RecordSection>
        </>}

      <RecordActionBar className={`${requestStyles.actions} w-full justify-end`} presentationAllowed={!!detail && !loading}>
        {!embedded && <RequestButton type="button" disabled={busy} onClick={onClose}>Đóng</RequestButton>}
        {!editing && <RequestButton type="button" variant="outline" className="!flex-none px-3" disabled={busy}
          aria-label="Thao tác khác" title="Thao tác khác" onClick={() => setActionsOpen(true)}><MoreHorizontal className="size-5" /></RequestButton>}
        {editing ? <>
        <RequestButton type="button" disabled={busy} onClick={handleDiscard}>Hủy sửa</RequestButton>
        {saveAct?.visible && <RequestButton type="button" variant="default" disabled={!canEdit || !detail || !dirty}
          title={saveAct.reason ? reasonMessage(saveAct.reason) : undefined} onClick={() => void handleSave()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{saving ? "Đang lưu..." : "Lưu thay đổi"}
        </RequestButton>}
        </> : saveAct?.visible && <RequestButton type="button" variant="default" disabled={!canSave}
          title={saveAct.reason ? reasonMessage(saveAct.reason) : undefined}
          onClick={() => { if (canSave) { setFeedback(null); setEditing(true); } }}><Pencil className="size-4" />Sửa</RequestButton>}
      </RecordActionBar>

      <UntitledBottomSheet open={actionsOpen} onClose={() => setActionsOpen(false)} title="Thao tác đơn hàng">
        <div className="grid gap-2">
          {contractAct?.visible && <RequestButton type="button" className="justify-start" disabled={!contractAct.enabled || busy || editing}
            title={contractAct.reason ? reasonMessage(contractAct.reason) : undefined}
            onClick={() => { setActionsOpen(false); void openContract(); }}>Thông tin hợp đồng</RequestButton>}
          {sendPmAct?.visible && <RequestButton type="button" className="justify-start" disabled={!sendPmAct.enabled || busy || editing}
            title={sendPmAct.reason ? reasonMessage(sendPmAct.reason) : undefined}
            onClick={() => { setActionsOpen(false); void openPm(); }}><Send className="size-4" />Gửi PM</RequestButton>}
          {recallAct?.visible && <RequestButton type="button" className="justify-start" disabled={!recallAct.enabled || busy || editing}
            title={recallAct.reason ? reasonMessage(recallAct.reason) : undefined}
            onClick={() => { setActionsOpen(false); setRecallOpen(true); }}><Undo2 className="size-4" />Thu hồi để sửa</RequestButton>}
          <RequestButton type="button" className="justify-start" disabled={busy || editing}
            onClick={() => { setActionsOpen(false); void load(docId); }}><RefreshCw className="size-4" />Làm mới</RequestButton>
        </div>
      </UntitledBottomSheet>

      {/* Modal hợp đồng */}
      <UntitledBottomSheet open={contractOpen} onClose={() => setContractOpen(false)} title="Thông tin hợp đồng">
            <div className="p-2 text-base space-y-3">
          {!contract ? <p className="text-neutral-400">Không có dữ liệu.</p> : (
            <>
              <p><span className="text-neutral-400">Mã hợp đồng: </span><strong>{text(contract.contractNo || contract.contractId)}</strong></p>
              {contract.objectName && <p><span className="text-neutral-400">Khách hàng: </span><strong>{text(contract.objectName)}</strong></p>}
              {contract.totalAmount && <p><span className="text-neutral-400">Tổng tiền: </span><strong>{text(contract.totalAmount)}</strong></p>}
              {contract.notes && <p><span className="text-neutral-400">Ghi chú: </span>{text(contract.notes)}</p>}
            </>
          )}
        </div>
      </UntitledBottomSheet>

      {/* Modal gửi PM */}
      <UntitledBottomSheet open={pmOpen} onClose={() => setPmOpen(false)} title="Gửi PM phê duyệt">
        <div className="p-2 text-xs space-y-2.5">
          <input value={pmSearch} onChange={(e) => setPmSearch(e.target.value)} placeholder="Tìm PM..."
            onKeyDown={(e) => { if (e.key === "Enter") void openPm(); }} className={inputCls} />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {pmItems.map((p) => (
              <button key={p.id} type="button" onClick={() => setPmId(p.id)}
                className={`w-full text-left px-3 py-2 rounded-xl border text-xs ${pmId === p.id ? "border-brand-600 font-bold" : "border-neutral-200 dark:border-neutral-700"}`}>
                {fieldText(p.label) || p.id}
              </button>
            ))}
            {pmItems.length === 0 && <p className="text-neutral-400 text-center py-2">Không có PM nào.</p>}
          </div>
          <textarea value={pmNotes} onChange={(e) => setPmNotes(e.target.value)} rows={2}
            placeholder="Ghi chú gửi PM..." className={inputCls} />
          <button type="button" disabled={!pmId || !!acting} onClick={() => { setPmOpen(false); void runAction("send-pm", { pmId, notes: pmNotes.trim() || null }); }}
            className="w-full py-2.5 rounded-xl bg-brand-600 text-white font-bold disabled:opacity-50">
            Xác nhận gửi PM
          </button>
        </div>
      </UntitledBottomSheet>

      {/* Modal thu hồi */}
      <UntitledBottomSheet open={recallOpen} onClose={() => setRecallOpen(false)} title="Thu hồi để sửa">
        <div className="p-2 text-xs space-y-3">
          <p>Thu hồi đơn hàng <strong>{detail?.documentId}</strong> về trạng thái cho phép sửa?</p>
          <button type="button" disabled={!!acting}
            onClick={() => { setRecallOpen(false); void runAction("recall", {}); }}
            className="w-full py-2.5 rounded-xl bg-red-600 text-white font-bold disabled:opacity-50">
            Xác nhận thu hồi
          </button>
        </div>
      </UntitledBottomSheet>
    </div>
  );
}
