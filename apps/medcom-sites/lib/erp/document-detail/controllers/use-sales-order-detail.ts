"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Pencil, RefreshCw, Save, Send } from "lucide-react";
import { erpClient } from "@/lib/erp/erp-client";
import type { ErpChoice, ErpCommandResult, ErpContractInfo, ErpDocumentDetail } from "@/lib/erp/erp-screen-contracts";
import { buildSalesOrderSaveHeader } from "@/lib/erp/sales-order-form";
import { salesOrderField } from "@/lib/erp/sales-order-lookups";
import { SalesCommandSession, salesActionLabels, salesCommandMessage, salesWorkflowOperations, type SalesOrderModule } from "@/lib/erp/sales-order-workflow";
import { editableSalesLines, salesLineChanges, type EditableSalesLine } from "@/lib/erp/sales-order-edit-lines";
import { isSalesOrderLineValid } from "@/lib/erp/sales-order-lines";
import { documentStatusLabel } from "@/lib/erp/document-status";
import { RecordDetailContext } from "@/components/erp/request-presentation";
import type { DetailAction, DocumentDetailModel, DocumentDetailHandlers } from "../model";
import { detailStatus } from "../status";

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

export function useSalesOrderDetail({
  branchId, documentId, onClose, onChanged, module = "sales-orders", onCloseGuardChange,
}: {
  branchId: string; documentId: string; module?: SalesOrderModule;
  onClose: () => void; onChanged: () => void;
  onCloseGuardChange?: (guard: (() => boolean) | null) => void;
}) {
  const embedded = React.useContext(RecordDetailContext), docId = documentId;
  const [editing, setEditing] = useState(false);
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

  // Presentation adapter only. The state, effects and command functions above
  // are moved verbatim from SalesOrderForm (T-004).
  const detailActions: DetailAction[] = [];
  if (!editing) {
    for (const operation of salesWorkflowOperations[module]) {
      const action = act(operation);
      if (action?.visible) detailActions.push({
        id: operation, label: salesActionLabels[operation], placement: "primary",
        tone: operation === "reject" ? "outline" : "default", visible: true,
        enabled: !(busy || pending || !action.enabled),
        reason: action.reason ? reasonMessage(action.reason) : undefined,
        title: action.reason ? reasonMessage(action.reason) : undefined,
        icon: React.createElement(Send, { "aria-hidden": true, className: "size-4" }),
        // Native disabled buttons still prevent user clicks. Preserve the old
        // confirmation handler; send() retains the authoritative action check.
        allowDisabledClick: true,
      });
    }
  }
  if (editing) {
    detailActions.push({ id: "discard", label: "Hủy sửa", placement: "primary", tone: "outline",
      visible: true, enabled: !(busy || pending) });
    if (saveAct?.visible) detailActions.push({
      id: "save", label: saving ? "Đang lưu..." : "Lưu thay đổi", placement: "primary",
      visible: true, enabled: !(!canEdit || !detail || !dirty), busy: saving,
      reason: saveAct.reason ? reasonMessage(saveAct.reason) : undefined,
      title: saveAct.reason ? reasonMessage(saveAct.reason) : undefined,
      icon: saving ? undefined : React.createElement(Save, { className: "size-4" }),
    });
  } else if (saveAct?.visible) {
    detailActions.push({ id: "edit", label: "Sửa", placement: "primary",
      visible: true, enabled: !(!canSave),
      reason: saveAct.reason ? reasonMessage(saveAct.reason) : undefined,
      title: saveAct.reason ? reasonMessage(saveAct.reason) : undefined,
      icon: React.createElement(Pencil, { className: "size-4" }) });
  }
  detailActions.push(
    { id: "contract-info", label: "Thông tin hợp đồng", placement: "menu", tone: "outline",
      visible: !editing && !!contractAct?.visible, enabled: !(!contractAct?.enabled || busy || editing),
      reason: contractAct?.reason ? reasonMessage(contractAct.reason) : undefined,
      title: contractAct?.reason ? reasonMessage(contractAct.reason) : undefined },
    { id: "delete", label: "Xóa đơn hàng", placement: "menu", tone: "danger",
      visible: !editing && !!deleteAct?.visible && module==="sales-orders",
      enabled: !(!deleteAct?.enabled || busy || pending || editing) },
    { id: "refresh", label: "Làm mới", placement: "menu", tone: "outline",
      visible: !editing, enabled: !(busy || pending || editing),
      icon: React.createElement(RefreshCw, { className: "size-4" }) },
  );
  const model: DocumentDetailModel = {
    documentId: detail?.documentId ?? null,
    header: { ...header, branchId: text(header.branchId) || branchId, objectName: customerName, address: customerAddr },
    lines: detail?.lines ?? { rows: [], hasMore: false }, history: detail?.history ?? undefined,
    summary: detail?.summary,
    status: detailStatus(header, statusName, knownLock ? locked : null),
    loading, error, editing, dirty, busy, draft: { ...draft, branchId }, choices,
    editDisabled: !canEdit, paginationBusy: loadingMore,
    feedback, actions: detailActions,
    pending: pending ? {
      title: "Đang chờ xác nhận kết quả thao tác",
      body: "Giữ đơn hàng này mở để kiểm tra kết quả. Gửi lại sẽ dùng đúng thông tin và mã của lần thao tác đang chờ.",
      actions: [
        { id: "recover", label: "Kiểm tra kết quả", placement: "primary", tone: "outline", visible: true, enabled: !busy },
        { id: "retry-command", label: "Gửi lại cùng thao tác", placement: "primary", tone: "outline", visible: true, enabled: !busy },
      ],
    } : undefined,
  };
  const handlers: DocumentDetailHandlers = {
    onFieldChange: (key, value) => set(key as keyof Draft, value),
    onLookupSelect: pick,
    onRetry: () => void load(docId),
    onLoadMore: section => { if (section === "lines" || section === "history") void more(section); },
    onAction: id => {
      if (id === "edit") void beginEdit();
      else if (id === "discard") handleDiscard();
      else if (id === "save") void handleSave();
      else if (id === "contract-info") void openContract();
      else if (id === "refresh") void load(docId);
      else if (id === "recover") void recover();
      else if (id === "retry-command") void recover(true);
      else { setFeedback(null); setWorkflowAction(id); }
    },
  };
  return { model, handlers, embedded, detail, draft, editLines, setEditLines,
    canEdit, busy, pending, acting, feedback, contract, contractOpen, setContractOpen,
    workflowAction, setWorkflowAction, send };
}
