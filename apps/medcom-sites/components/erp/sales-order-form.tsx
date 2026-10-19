"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, FileText, Link2, Loader2, RefreshCw, Save, Pencil, MoreHorizontal, Send } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type {
  ErpChoice,
  ErpCommandResult,
  ErpContractInfo,
  ErpDocumentDetail,
} from "@/lib/erp/erp-screen-contracts";
import { LookupField } from "@/components/untitledui/lookup-field";
import { UntitledBottomSheet } from "@/components/untitledui/bottom-sheet";
import { buildSalesOrderSaveHeader } from "@/lib/erp/sales-order-form";
import { salesOrderField } from "@/lib/erp/sales-order-lookups";
import { SalesOrderAttachmentList } from "./sales-order-attachment-list";
import { SalesOrderDetailTabs } from "./sales-order-detail-tabs";
import { SalesOrderActionDialog } from "./sales-order-action-dialog";
import { SalesOrderLineEditor } from "./sales-order-line-editor";
import { SalesCommandSession, salesActionLabels, salesCommandMessage, salesWorkflowOperations, type SalesOrderModule } from "@/lib/erp/sales-order-workflow";
import { editableSalesLines, salesLineChanges, type EditableSalesLine } from "@/lib/erp/sales-order-edit-lines";
import { emptySalesOrderLine, isSalesOrderLineValid } from "@/lib/erp/sales-order-lines";
import { documentStatusLabel } from "@/lib/erp/document-status";
import { statusColorsFrom } from "@/lib/erp/status-colors";
import {formatMoney} from "@/lib/erp/money";
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

function reasonMessage(reason?: string | null): string {
  switch (reason) {
    case "native_permission_or_hidden": return "Chưa được phân quyền hoặc bị ẩn theo quy tắc ERP.";
    case "save_document_first": return "Vui lòng lưu chứng từ trước.";
    case "state_or_assignment_not_allowed": return "Trạng thái hiện tại không cho phép thao tác này.";
    case "erp_write_unqualified": return "Hệ thống đang ở chế độ bảo vệ dữ liệu.";
    default: return "Thao tác chưa sẵn sàng. Hãy tải lại dữ liệu hoặc kiểm tra quyền được cấp.";
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
  branchId, documentId, onClose, onChanged, module = "sales-orders", onCloseGuardChange,
}: {
  branchId: string; documentId: string; module?: SalesOrderModule;
  onClose: () => void; onChanged: () => void;
  onCloseGuardChange?: (guard: (() => boolean) | null) => void;
}) {
  const embedded = React.useContext(RecordDetailContext), prefix = React.useId(), docId = documentId;
  const [editing, setEditing] = useState(false), [actionsOpen, setActionsOpen] = useState(false);
  const [detail, setDetail] = useState<ErpDocumentDetail | null>(null), [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null), [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [choices, setChoices] = useState<Record<string, ErpChoice | null>>({});
  const [editLines, setEditLines] = useState<EditableSalesLine[]>([]);
  const [saving, setSaving] = useState(false), [acting, setActing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{type:"success"|"error"|"warning";message:string}|null>(null);
  const [contract, setContract] = useState<ErpContractInfo | null>(null), [contractOpen, setContractOpen] = useState(false);
  const [workflowAction, setWorkflowAction] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const readSeq = React.useRef(0);
  const scopeGeneration = React.useRef(0);
  const session = React.useMemo(() => new SalesCommandSession(module, {
    send: (operation, intent) => operation === "save"
      ? erpClient.saveDocument(module, intent as unknown as Parameters<typeof erpClient.saveDocument>[1])
      : operation === "delete" ? erpClient.deleteDocument(module, intent)
      : erpClient.executeWorkflowAction(module, operation, intent as unknown as Parameters<typeof erpClient.executeWorkflowAction>[2]),
    lookup: (operation, originalIntent) => erpClient.lookupCommand(module, {operation, originalIntent}),
  }, {branchId, documentId}), [module, branchId, documentId]);

  const load = useCallback(async (id: string) => {
    const seq = ++readSeq.current;
    setLoading(true); setError(null);
    try {
      const data = await erpClient.getErpModuleDetail(module, {branchId, documentId:id, page:1, pageSize:50});
      if (seq !== readSeq.current) return;
      setDetail(data); setDraft(draftFromHeader(data.header || {})); setChoices({});
      setEditLines(editableSalesLines(data.lines.rows)); setEditing(false);
    } catch {
      if (seq === readSeq.current) {setDetail(null);setError("Không thể tải chi tiết đơn hàng. Vui lòng thử lại.");}
    } finally {if(seq === readSeq.current)setLoading(false);}
  }, [branchId, module]);
  const invalidateScope = useCallback(() => {readSeq.current++;scopeGeneration.current++;}, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {if(active)void load(docId);});
    return () => {active=false;invalidateScope();};
  }, [docId, load, invalidateScope]);

  const header = detail?.header || {};
  const originalCustomer = draft.objectId === text(header.objectId);
  const customerName = salesOrderField(choices.objectId,"ObjectName") || (originalCustomer ? text(header.objectName) : "");
  const customerAddr = salesOrderField(choices.objectId,"Address") || (originalCustomer ? text(header.address) : "");
  const statusName = documentStatusLabel(typeof header.statusId === "number" ? header.statusId : null, text(header.statusName));
  const deliveryStatusName = text(header.deliveryStatusName);
  const actions = detail?.actions || [], act = (id:string) => actions.find(action => action.id === id);
  const saveAct = module === "sales-orders" ? act("save") : undefined, contractAct = act("contract-info"), deleteAct = act("delete");
  const busy = loading || saving || !!acting || loadingMore, pending = !!session.pending;
  const canSave = !!saveAct?.visible && saveAct.enabled && !busy && !pending;
  const canEdit = editing && canSave;
  const dirty = !!detail && (JSON.stringify(draft) !== JSON.stringify(draftFromHeader(header)) || salesLineChanges(detail.lines.rows,editLines).length > 0);
  const locked = header.isLocked === true || header.isLocked === 1 || header.isLocked === "1";
  const knownLock = locked || header.isLocked === false || header.isLocked === 0 || header.isLocked === "0";
  const set = (key:keyof Draft,value:string) => setDraft(previous => ({...previous,[key]:value}));
  const pick = (key:string,choice:ErpChoice|null) => {
    if ((key === "contractId" || key === "objectId") && draft[key] !== (choice?.id || "")) {
      setEditLines([]);
      setFeedback({type:"warning",message:"Khách hàng/hợp đồng đã đổi. Hãy chọn lại hàng hóa phù hợp trước khi lưu."});
      if(key === "objectId"){set("contractId","");setChoices(previous=>({...previous,contractId:null}));}
    }
    setChoices(previous=>({...previous,[key]:choice}));set(key as keyof Draft,choice?.id || "");
  };
  React.useLayoutEffect(() => {
    onCloseGuardChange?.(() => {
      if(busy || session.pending || editing && dirty){
        setFeedback({type:"warning",message:session.pending?"Hãy xác nhận kết quả thao tác đang chờ trước khi đóng.":busy?"Đang xử lý đơn hàng. Vui lòng chờ.":"Hãy lưu thay đổi hoặc Hủy sửa trước khi đóng."});
        return false;
      }
      return true;
    });
    return () => onCloseGuardChange?.(null);
  },[onCloseGuardChange,busy,session,editing,dirty]);
  useEffect(() => {
    if(!pending && !(editing && dirty))return;
    const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",protect);return()=>window.removeEventListener("beforeunload",protect);
  },[pending,editing,dirty]);

  async function finish(result:ErpCommandResult) {
    if(result.outcome === "Committed" || result.outcome === "Replayed"){
      onChanged();
      if(result.receipt?.deleted){onCloseGuardChange?.(null);onClose();}
      else await load(docId);
    }
    setFeedback({type:result.outcome === "Committed" || result.outcome === "Replayed"?"success":session.pending?"warning":"error",message:salesCommandMessage(result)});
  }
  async function send(operation:string,body:Record<string,unknown>) {
    if(!detail || session.pending || session.busy || !act(operation)?.visible || !act(operation)?.enabled)return;
    setActing(operation);setFeedback(null);
    const seq = scopeGeneration.current;
    try {
      const result = await session.submit(operation,{idempotencyKey:crypto.randomUUID(),branchId,documentId:detail.documentId,expectedStateToken:detail.stateToken,...body});
      if (seq === scopeGeneration.current) {
        if (result.outcome === "Committed" || result.outcome === "Replayed" || session.pending) setWorkflowAction(null);
        await finish(result);
      }
    } finally {if (seq === scopeGeneration.current) setActing(null);}
  }
  async function recover(resend=false){
    if(!session.pending || session.busy)return;
    setActing("recover");
    const seq = scopeGeneration.current;
    try {const result=await (resend?session.retry():session.recover());if(seq===scopeGeneration.current)await finish(result);}
    finally{if(seq===scopeGeneration.current)setActing(null);}
  }
  async function handleSave(){
    if(!editing || !canSave || !detail)return;
    if(!draft.documentDate || !draft.objectId || !draft.employeeId || !editLines.length || editLines.length > 500 || !editLines.every(isSalesOrderLineValid)){
      setFeedback({type:"warning",message:"Kiểm tra ngày chứng từ, khách hàng, nhân viên và các dòng hàng hóa (mã hàng, số lượng, đơn giá/thuế hợp lệ)."});return;
    }
    setSaving(true);
    try{await send("save",{header:buildSalesOrderSaveHeader(header,draft),lineChanges:salesLineChanges(detail.lines.rows,editLines)});}
    finally{setSaving(false);}
  }
  function handleDiscard(){
    if(!detail || pending || busy)return;
    setDraft(draftFromHeader(detail.header || {}));setEditLines(editableSalesLines(detail.lines.rows));setChoices({});setEditing(false);setFeedback(null);
  }
  async function more(section:"lines"|"history"){
    if(!detail || busy || pending || !detail[section]?.hasMore)return;
    const snapshot=detail,seq=readSeq.current;
    setLoadingMore(true);
    try{
      const next=await erpClient.getErpModuleDetail(module,{branchId,documentId:docId,page:(snapshot[section]!.page || 1)+1,pageSize:50});
      if(seq !== readSeq.current)return;
      if(next.stateToken !== snapshot.stateToken || next.documentId !== snapshot.documentId)throw new Error("document_changed");
      const ids=new Set(snapshot[section]!.rows.map(row=>row.lineId));
      if(next[section]?.rows.some(row=>ids.has(row.lineId)))throw new Error("duplicate_lines");
      setDetail(previous=>previous && ({...previous,[section]:{...next[section]!,rows:[...previous[section]!.rows,...next[section]!.rows]}}));
    }catch{if(seq===readSeq.current)setFeedback({type:"error",message:"Chưa ghép được trang tiếp theo hoặc đơn hàng đã đổi. Hãy tải lại chi tiết."});}
    finally{if(seq===readSeq.current)setLoadingMore(false);}
  }
  async function beginEdit(){
    if(!canSave || !detail)return;
    setLoadingMore(true);
    const seq = readSeq.current;
    try{
      let combined=detail;
      while(combined.lines.hasMore){
        if(combined.lines.rows.length>=500)throw new Error("line_limit");
        const requestedPage=combined.lines.page+1;
        const next=await erpClient.getErpModuleDetail(module,{branchId,documentId:docId,page:requestedPage,pageSize:50});
        if(seq !== readSeq.current)return;
        if(next.stateToken !== detail.stateToken || next.documentId !== detail.documentId)throw new Error("document_changed");
        if(next.lines.page !== requestedPage || !next.lines.rows.length)throw new Error("invalid_line_page");
        const ids=new Set(combined.lines.rows.map(row=>row.lineId));
        if(next.lines.rows.some(row=>ids.has(row.lineId)))throw new Error("duplicate_lines");
        combined={...combined,lines:{...next.lines,rows:[...combined.lines.rows,...next.lines.rows]}};
      }
      if(combined.lines.rows.length > 500)throw new Error("line_limit");
      setDetail(combined);setEditLines(editableSalesLines(combined.lines.rows));setEditing(true);setFeedback(null);
    }catch{if(seq===readSeq.current)setFeedback({type:"error",message:"Chưa đọc đủ chi tiết cùng phiên bản để sửa. Hãy tải lại đơn hàng."});}
    finally{if(seq===readSeq.current)setLoadingMore(false);}
  }
  async function openContract(){
    if(!detail || busy || pending || !contractAct?.enabled)return;
    setActing("contract-info");
    try{setContract(await erpClient.getErpContract(module,{branchId,documentId:detail.documentId}));setContractOpen(true);}
    catch{setFeedback({type:"error",message:"Không tải được hợp đồng. Vui lòng thử lại."});}
    finally{setActing(null);}
  }

  return (
    <div data-sales-order-form className={requestStyles.editor}>
      <RecordDetailHeading title="Đơn hàng" documentNumber={detail?.documentId}>
        {editing && <p role="status">{dirty ? "Có thay đổi chưa lưu" : "Đang chỉnh sửa đơn hàng"}</p>}
      </RecordDetailHeading>
      <RecordDetailStatus presentationAllowed={!!detail && !loading}>
        <span className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm font-semibold text-black dark:border-neutral-700 dark:bg-neutral-800 dark:text-white" style={statusColorsFrom(header)}>{statusName}</span>
        {knownLock && <span className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-medium text-black dark:border-neutral-700 dark:text-white">{locked ? "Đã khóa" : "Chưa khóa"}</span>}
        {deliveryStatusName && (
          <span
            title="Trạng thái giao hàng"
            className="rounded-full border border-neutral-200 bg-neutral-100 px-3 py-1 text-sm font-medium text-black dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            style={statusColorsFrom(header, "deliveryStatusForeColor", "deliveryStatusBackColor")}
          >
            Giao hàng: {deliveryStatusName}
          </span>
        )}
      </RecordDetailStatus>

      {pending && <div role="status" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-base text-black dark:border-amber-800 dark:bg-amber-950 dark:text-white">
        <p className="font-semibold">Đang chờ xác nhận kết quả thao tác</p><p className="text-sm leading-6">Giữ đơn hàng này mở để kiểm tra kết quả. Gửi lại sẽ dùng đúng thông tin và mã của lần thao tác đang chờ.</p>
        <div className="flex flex-wrap gap-2"><RequestButton type="button" disabled={busy} onClick={()=>void recover()}>Kiểm tra kết quả</RequestButton><RequestButton type="button" disabled={busy} onClick={()=>void recover(true)}>Gửi lại cùng thao tác</RequestButton></div>
      </div>}

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
          {module !== "sales-orders" && <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-black dark:border-brand-800 dark:bg-brand-950 dark:text-white"><strong>{module === "sales-order-pm" ? "Xác nhận đơn hàng · PM" : "Duyệt đơn hàng · SA"}</strong><p className="mt-1">{module === "sales-order-pm" ? "Kiểm tra khách hàng, hợp đồng, hàng hóa và lịch sử trước khi gửi SA hoặc trả lại." : "Kiểm tra nội dung đã xác nhận; chuyển Kế toán, Kỹ thuật hoặc gửi về bước phù hợp."}</p></div>}
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
                  context={{ContractID:null}} secondaryFields={["ObjectName","Address"]}
                  onSelect={choice => pick("objectId", choice)} placeholder="Chọn khách hàng..." /></div>
                <dl className={requestStyles.values}><div className="col-span-full"><dt>Địa chỉ khách hàng</dt><dd className="whitespace-pre-wrap">{customerAddr || "—"}</dd></div></dl>
                <LookupField label="Hợp đồng" module="sales-orders" lookupId={LOOKUPS.contractId} branchId={branchId}
                  value={draft.contractId} choice={choices.contractId ?? null} displayValue={draft.contractId === text(header.contractId) ? text(header.contractName) || draft.contractId : draft.contractId}
                  context={{ObjectID:draft.objectId || null}} secondaryFields={["ContractName","ObjectName"]}
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

          {editing ? <fieldset disabled={!canEdit} className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900"><SalesOrderLineEditor lines={editLines} branchId={branchId} contractId={draft.contractId}
            onPatch={(key,patch)=>setEditLines(previous=>previous.map(line=>line.key===key?{...line,...patch}:line))}
            onAdd={()=>{const key=crypto.randomUUID();setEditLines(previous=>[...previous,emptySalesOrderLine(key)]);return key;}}
            onRemove={key=>setEditLines(previous=>previous.filter(line=>line.key!==key))} /></fieldset>
            : <SalesOrderDetailTabs lines={detail.lines?.rows || []} history={detail.history?.rows || []}
              currencyId={text(header.currencyId)} summary={detail.summary}
              hasMoreLines={detail.lines.hasMore} hasMoreHistory={detail.history?.hasMore} loadingMore={loadingMore}
              onMoreLines={()=>void more("lines")} onMoreHistory={()=>void more("history")} />}

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
            <SalesOrderAttachmentList embedded key={`${module}:${branchId}:${detail.documentId}`} module={module} branchId={branchId} documentId={detail.documentId} />
          </RecordSection>
        </>}

      <RecordActionBar className={`${requestStyles.actions} w-full justify-end`} presentationAllowed={!!detail && !loading}>
        {!embedded && <RequestButton type="button" disabled={busy} onClick={onClose}>Đóng</RequestButton>}
        {!editing && <RequestButton type="button" variant="outline" className="!flex-none px-3" disabled={busy || pending}
          aria-label="Thao tác khác" title="Thao tác khác" onClick={() => setActionsOpen(true)}><MoreHorizontal className="size-5" /></RequestButton>}
        {!editing && salesWorkflowOperations[module].map(operation=>{const action=act(operation);return action?.visible?<RequestButton key={operation} type="button" variant={operation === "reject" ? "outline" : "default"} disabled={busy || pending || !action.enabled} title={action.reason?reasonMessage(action.reason):undefined} onClick={()=>{setFeedback(null);setWorkflowAction(operation);}}><Send aria-hidden className="size-4" />{salesActionLabels[operation]}</RequestButton>:null;})}
        {editing ? <>
        <RequestButton type="button" disabled={busy || pending} onClick={handleDiscard}>Hủy sửa</RequestButton>
        {saveAct?.visible && <RequestButton type="button" variant="default" disabled={!canEdit || !detail || !dirty}
          title={saveAct.reason ? reasonMessage(saveAct.reason) : undefined} onClick={() => void handleSave()}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{saving ? "Đang lưu..." : "Lưu thay đổi"}
        </RequestButton>}
        </> : saveAct?.visible && <RequestButton type="button" variant="default" disabled={!canSave}
          title={saveAct.reason ? reasonMessage(saveAct.reason) : undefined}
          onClick={() => void beginEdit()}><Pencil className="size-4" />Sửa</RequestButton>}
      </RecordActionBar>

      <UntitledBottomSheet open={actionsOpen} onClose={() => setActionsOpen(false)} title="Thao tác đơn hàng">
        <div className="grid gap-2">
          {contractAct?.visible && <RequestButton type="button" className="justify-start" disabled={!contractAct.enabled || busy || editing}
            title={contractAct.reason ? reasonMessage(contractAct.reason) : undefined}
            onClick={() => { setActionsOpen(false); void openContract(); }}>Thông tin hợp đồng</RequestButton>}
          {deleteAct?.visible && module==="sales-orders" && <RequestButton type="button" className="justify-start text-red-600" disabled={!deleteAct.enabled || busy || pending || editing}
            onClick={()=>{setActionsOpen(false);setFeedback(null);setWorkflowAction("delete");}}>Xóa đơn hàng</RequestButton>}
          <RequestButton type="button" className="justify-start" disabled={busy || pending || editing}
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
              {contract.totalAmount && <p><span className="text-black dark:text-white">Tổng tiền: </span><strong className="tabular-nums">{formatMoney(contract.totalAmount)}</strong></p>}
              {contract.notes && <p><span className="text-neutral-400">Ghi chú: </span>{text(contract.notes)}</p>}
            </>
          )}
        </div>
      </UntitledBottomSheet>

      {workflowAction && <SalesOrderActionDialog key={module + ":" + docId + ":" + workflowAction} module={module} operation={workflowAction}
        branchId={branchId} documentId={docId} busy={!!acting} message={feedback?.type !== "success" ? feedback?.message : undefined} onClose={()=>setWorkflowAction(null)}
        onConfirm={payload=>void send(workflowAction,workflowAction==="delete"?{}:{payload})} />}
    </div>
  );
}
