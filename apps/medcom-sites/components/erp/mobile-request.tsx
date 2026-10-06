"use client";

import {useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {RemoteLookup} from "./lookup";
import {useDirtyGuard} from "./navigation-guard";
import {MobileRequestLines, isRequestInteger, requestInputStyle, type PurchaseRequestLine} from "./mobile-request-lines";
import type {LookupAdapter} from "@/lib/erp/presentation";

export type PurchaseRequestDraft = {
  purchaseDate: string;
  personSuggest: string;
  department: string;
  purposeId: string;
  purposeDescOrClient: string;
  notes: string;
  branchId: string;
  currencyId: string;
  objectId: string;
  objectLabel?: string;
  lines: PurchaseRequestLine[];
};
export type PurchaseRequestSnapshot = {
  documentId: string | null;
  version: string | null;
  confirmation: "draft" | "submitted" | null;
  status: {id: string; label: string} | null;
  values: PurchaseRequestDraft;
};
type Choice = {id: string; label: string};
export type MobileRequestAccess = {
  /** Parent supplies a principal/session/company scope; null retires all form data. */
  scopeKey: string | null;
  canRead: boolean;
  canEdit: boolean;
  canSaveDraft: boolean;
  canSubmit: boolean;
  available: boolean;
  /** I20 fixed existing-document profile; missing flags do not activate it. */
  existingOnly?: boolean;
  canAddLines?: boolean;
  canReconcile?: boolean;
  authorityKey?: string;
  requiresFreshRead?: boolean;
  branches: readonly Choice[];
  currencies: readonly Choice[];
  purposes: readonly Choice[];
  /** Explicit Web input budgets, not inferred nvarchar(max) database limits. */
  maxNotesLength: number;
  maxPurposeLength: number;
  maxLines: number;
  itemLookupId: string;
  objectLookupId: string;
};
export type PurchaseRequestIntent = {
  intentId: string;
  action: "saveDraft" | "submit";
  documentId: string | null;
  expectedVersion: string | null;
  values: PurchaseRequestDraft;
};
export type PurchaseRequestResult = {intentId: string} & (
  | {kind: "confirmed"; action: PurchaseRequestIntent["action"]; receiptId: string; snapshot: PurchaseRequestSnapshot}
  | {kind: "rejected"; message: string; fieldErrors: Record<string, string>; referenceId?: string}
  | {kind: "conflict"; message: string; current: PurchaseRequestSnapshot; referenceId?: string}
  | {kind: "unknown"; message: string; referenceId?: string}
);
/** UI seam only: server must recheck source semantics, current grants and scope. */
export type MobileRequestAdapter = {
  execute: (intent: PurchaseRequestIntent, signal: AbortSignal) => Promise<PurchaseRequestResult>;
  reconcile: (originalIntent: PurchaseRequestIntent, signal: AbortSignal) => Promise<PurchaseRequestResult>;
  lookup: LookupAdapter;
};
export type MobileRequestProps = {
  initial: PurchaseRequestSnapshot;
  access: MobileRequestAccess;
  adapter?: MobileRequestAdapter;
  onConfirmed?: (snapshot: PurchaseRequestSnapshot, receiptId: string) => void;
  readRevision?: number;
  onWorkStateChange?: (state: {dirty:boolean;unresolved:boolean}) => void;
};

const copy = (values: PurchaseRequestDraft): PurchaseRequestDraft => ({...values, lines: values.lines.map(line => ({...line}))});
const dateValid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validatePurchaseRequest(values: PurchaseRequestDraft, access: MobileRequestAccess) {
  const errors: Record<string, string> = {};
  const required = (key: keyof PurchaseRequestDraft, max: number) => {
    const value = values[key];
    if (typeof value !== "string" || !value.trim()) errors[key] = "Vui lòng nhập trường này.";
    else if (value.length > max) errors[key] = `Tối đa ${max} ký tự.`;
  };
  if(access.existingOnly){
    if(values.personSuggest.length>500)errors.personSuggest="Tối đa 500 ký tự.";
    if(values.department.length>100)errors.department="Tối đa 100 ký tự.";
  }else{required("personSuggest", 500); required("department", 100); required("objectId", 100);}
  for (const [key, choices] of [["branchId", access.branches], ["currencyId", access.currencies]] as const) {
    if (!access.existingOnly && !choices.some(choice => choice.id === values[key])) errors[key] = "Chọn giá trị hiện còn được cấp quyền.";
  }
  if (!access.existingOnly && values.purposeId && !access.purposes.some(choice => choice.id === values.purposeId)) errors.purposeId = "Chọn mục đích hiện còn khả dụng.";
  if (values.purchaseDate) {
    try { if (!dateValid(values.purchaseDate)) errors.purchaseDate = "Ngày không hợp lệ."; }
    catch { errors.purchaseDate = "Ngày không hợp lệ."; }
  }
  for (const [key, max] of [["notes", access.maxNotesLength], ["purposeDescOrClient", access.maxPurposeLength]] as const) {
    if (values[key].length > max) errors[key] = `Tối đa ${max} ký tự theo dịch vụ.`;
  }
  if (!access.existingOnly && !values.lines.length) errors.lines = "Thêm ít nhất một dòng hàng trước khi gửi yêu cầu tới dịch vụ.";
  if (values.lines.length > access.maxLines) errors.lines = `Tối đa ${access.maxLines} dòng theo dịch vụ.`;
  const keys = new Set<string>();
  for (const line of values.lines) {
    const prefix = `lines.${line.localKey}.`;
    if (!line.localKey || keys.has(line.localKey)) errors.lines = "Không thể xác định duy nhất dòng hàng. Tải lại phiếu.";
    keys.add(line.localKey);
    if (!line.itemId.trim() || line.itemId.length > 50) errors[prefix + "itemId"] = "Chọn mã hàng hợp lệ, tối đa 50 ký tự.";
    for (const field of ["quantity", "unitPrice", "budget"] as const) {
      if ((field !== "budget" || line[field] !== "") && !isRequestInteger(line[field])) errors[prefix + field] = "Nhập số nguyên chính xác, tối đa 18 chữ số.";
    }
    if (line.timeRequired.length > 200) errors[prefix + "timeRequired"] = "Tối đa 200 ký tự.";
    if (line.model.length > 50) errors[prefix + "model"] = "Tối đa 50 ký tự.";
  }
  return errors;
}

function validAccess(access: MobileRequestAccess) {
  return [access.maxNotesLength, access.maxPurposeLength, access.maxLines].every(value => Number.isSafeInteger(value) && value > 0)
    && access.maxLines <= (access.existingOnly ? 500 : 100) && !!access.itemLookupId && !!access.objectLookupId;
}

function isSnapshot(value: unknown): value is PurchaseRequestSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as PurchaseRequestSnapshot;
  if (![null, "draft", "submitted"].includes(snapshot.confirmation)) return false;
  if (snapshot.documentId !== null && (typeof snapshot.documentId !== "string" || !snapshot.documentId || snapshot.documentId.length > 50)) return false;
  if (snapshot.version !== null && (typeof snapshot.version !== "string" || !snapshot.version)) return false;
  if (snapshot.confirmation !== null && (!snapshot.documentId || !snapshot.version)) return false;
  if (snapshot.status !== null && (!snapshot.status || typeof snapshot.status.id !== "string" || typeof snapshot.status.label !== "string" || !snapshot.status.label)) return false;
  const values = snapshot.values;
  if (!values || typeof values !== "object" || !Array.isArray(values.lines) || values.lines.length > 500) return false;
  if (!["purchaseDate", "personSuggest", "department", "purposeId", "purposeDescOrClient", "notes", "branchId", "currencyId", "objectId"].every(key => typeof values[key as keyof PurchaseRequestDraft] === "string")) return false;
  return values.lines.every(line => line && typeof line === "object"
    && ["localKey", "itemId", "quantity", "unitPrice", "budget", "timeRequired", "model"].every(key => typeof line[key as keyof PurchaseRequestLine] === "string")
    && (line.lineId === null || typeof line.lineId === "string")
    && (line.itemLabel === undefined || typeof line.itemLabel === "string"))
    && (values.objectLabel === undefined || typeof values.objectLabel === "string");
}

/** Only a principal/session/company boundary may retire a dispatched intent. */
export function MobileRequest(props: MobileRequestProps) {
  const {access} = props;
  if (!access.scopeKey) return <section role="status"><h2>Đề nghị mua hàng</h2><p>Đăng nhập bằng tài khoản được cấp quyền để mở phiếu.</p></section>;
  return <RequestEditor key={access.scopeKey} {...props}/>;
}

const emptySnapshot = (): PurchaseRequestSnapshot => ({documentId: null, version: null, confirmation: null, status: null, values: {purchaseDate: "", personSuggest: "", department: "", purposeId: "", purposeDescOrClient: "", notes: "", branchId: "", currencyId: "", objectId: "", lines: []}});

function RequestEditor({initial, access, adapter, onConfirmed, readRevision=0, onWorkStateChange}: MobileRequestProps) {
  const prefix = useId();
  // Invalid input is never rendered as a synthetic fallback. This only permits
  // hooks to remain mounted while a previously dispatched intent is unresolved.
  const [baseline, setBaseline] = useState(() => isSnapshot(initial) ? initial : emptySnapshot());
  const [values, setValues] = useState(() => copy(isSnapshot(initial) ? initial.values : emptySnapshot().values));
  const [review, setReview] = useState(false);
  const [phase, setPhase] = useState<"editing" | "pending" | "confirmed" | "rejected" | "conflict" | "unknown" | "reconciling">("editing");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PurchaseRequestResult | null>(null);
  const [message, setMessage] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const originalIntent = useRef<PurchaseRequestIntent | null>(null);
  const originalAdapter = useRef<MobileRequestAdapter | undefined>(undefined);
  const currentAdapter = useRef(adapter);
  const [dispatchAdapter,setDispatchAdapter]=useState<MobileRequestAdapter|null>(null);
  const [observedReadRevision,setObservedReadRevision]=useState(readRevision);
  const queuedDocument = useRef<PurchaseRequestSnapshot | null>(null);
  const [hasUnresolvedIntent, setHasUnresolvedIntent] = useState(false);
  const [observedDocumentId, setObservedDocumentId] = useState(initial?.documentId);
  const [documentSwitchBlocked, setDocumentSwitchBlocked] = useState(false);
  const currentAccess = useRef(access);
  useLayoutEffect(() => {
    currentAccess.current = access; currentAdapter.current = adapter;
    queuedDocument.current = documentSwitchBlocked && isSnapshot(initial) ? initial : null;
  }, [access, initial, documentSwitchBlocked, adapter]);
  useEffect(() => () => {generation.current++; request.current?.abort();}, []);
  // Retain original intent custody, but never apply completions from an old
  // adapter or authority observation. A true session scope is the ONLY remount.
  useLayoutEffect(() => {
    generation.current++; request.current?.abort(); lock.current=false;
    if(originalIntent.current){
      setPhase("unknown");
      setResult({kind:"unknown",intentId:originalIntent.current.intentId,message:"Quyền hoặc dịch vụ đã thay đổi; yêu cầu gốc vẫn cần được kiểm tra."});
    }
  },[adapter,access.authorityKey,access.canRead,access.canSaveDraft,access.canSubmit,access.canReconcile]);
  function loadDocument(snapshot: PurchaseRequestSnapshot) {
    setBaseline(snapshot); setValues(copy(snapshot.values)); setReview(false);
    setPhase("editing"); setErrors({}); setResult(null); setMessage("");
    setDocumentSwitchBlocked(false);
  }
  // A changed selected identity resets before paint. During pending/unknown,
  // hide previous input and queue the new selection without losing its intent.
  if (isSnapshot(initial) && observedDocumentId !== initial.documentId) {
    setObservedDocumentId(initial.documentId);
    if (hasUnresolvedIntent) setDocumentSwitchBlocked(true);
    else loadDocument(initial);
  }
  if(readRevision!==observedReadRevision){
    setObservedReadRevision(readRevision);
    if(!hasUnresolvedIntent&&isSnapshot(initial))loadDocument(initial);
  }
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline.values);
  const pending = phase === "pending" || phase === "reconciling";
  const uncertain = phase === "unknown" || phase === "reconciling";
  const serviceAvailable = !!adapter && access.available && validAccess(access) && isSnapshot(initial);
  const editable = access.canRead && serviceAvailable && access.canEdit && !access.requiresFreshRead && !documentSwitchBlocked && baseline.confirmation !== "submitted" && !pending && !uncertain && phase !== "conflict";
  useDirtyGuard(dirty || pending || uncertain, !pending && !uncertain);
  useLayoutEffect(()=>{onWorkStateChange?.({dirty,unresolved:hasUnresolvedIntent});},[dirty,hasUnresolvedIntent,onWorkStateChange]);
  const canSubmitExisting=access.existingOnly&&serviceAvailable&&access.canRead&&access.canSubmit
    &&baseline.confirmation==="draft"&&!!baseline.documentId&&!!baseline.version&&!dirty&&!pending&&!uncertain&&!documentSwitchBlocked;

  function change(patch: Partial<PurchaseRequestDraft>) {
    if (!editable || lock.current) return;
    setValues(old => ({...old, ...patch})); setPhase("editing"); setResult(null); setErrors({}); setMessage("");
  }
  function inspect() {
    const found = validatePurchaseRequest(values, access); setErrors(found);
    if (Object.keys(found).length) {
      setMessage("Kiểm tra các trường và dòng hàng được đánh dấu.");
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setMessage(""); setReview(true);
  }
  function unknown(intent: PurchaseRequestIntent, text: string): PurchaseRequestResult {
    return {kind: "unknown", intentId: intent.intentId, message: text};
  }
  function accept(received: PurchaseRequestResult, intent: PurchaseRequestIntent, lookup=false) {
    // An acknowledgment must bind the same submission and action, never just HTTP 200.
    let next = received;
    if(lookup&&next?.kind!=="confirmed")next=unknown(intent,"Chưa có receipt Committed hợp lệ; tiếp tục giữ yêu cầu gốc.");
    if (!next || next.intentId !== intent.intentId || !["confirmed", "rejected", "conflict", "unknown"].includes(next.kind)) next = unknown(intent, "Phản hồi chưa xác nhận đúng yêu cầu. Hãy kiểm tra kết quả.");
    if (next.kind === "confirmed" && (next.action !== intent.action || typeof next.receiptId !== "string" || !next.receiptId || !isSnapshot(next.snapshot) || !next.snapshot.documentId || !next.snapshot.version || intent.documentId !== null && next.snapshot.documentId !== intent.documentId || next.snapshot.confirmation !== (intent.action === "submit" ? "submitted" : "draft"))) next = unknown(intent, "Chưa có xác nhận lưu hoặc gửi hợp lệ từ ERP.");
    if (next.kind === "conflict" && !isSnapshot(next.current)) next = unknown(intent, "Chưa có bản ERP hợp lệ để kiểm tra xung đột.");
    if (next.kind !== "confirmed" && (typeof next.message !== "string" || next.referenceId !== undefined && typeof next.referenceId !== "string")) next = unknown(intent, "Phản hồi chưa hợp lệ. Hãy kiểm tra kết quả yêu cầu gốc.");
    if (next.kind === "rejected" && (!next.fieldErrors || typeof next.fieldErrors !== "object" || !Object.values(next.fieldErrors).every(value => typeof value === "string"))) next = unknown(intent, "Phản hồi chưa hợp lệ. Hãy kiểm tra kết quả yêu cầu gốc.");
    setResult(next);
    // A definitive result resolves the OLD intent before opening the queued
    // document. It never applies the old receipt or values to the new identity.
    if (next.kind !== "unknown") {originalIntent.current = null; setHasUnresolvedIntent(false);}
    const nextDocument = next.kind !== "unknown" ? queuedDocument.current : null;
    // Returning to the just-confirmed identity must keep its authoritative
    // snapshot/version and submitted lock, never the queued stale draft props.
    const confirmedSelection = next.kind === "confirmed" && nextDocument?.documentId === next.snapshot.documentId;
    if (nextDocument && !confirmedSelection) {
      loadDocument(nextDocument);
      if (next.kind === "confirmed") {
        try {onConfirmed?.(next.snapshot, next.receiptId);} catch {setMessage("ERP đã xác nhận phiếu trước; chưa cập nhật được màn hình liên quan.");}
      }
      return;
    }
    if (next.kind === "confirmed") {
      setDocumentSwitchBlocked(false); if (confirmedSelection) setReview(false);
      setBaseline(next.snapshot); setValues(copy(next.snapshot.values)); setPhase("confirmed"); setErrors({}); setMessage(""); originalIntent.current = null;
      try {onConfirmed?.(next.snapshot, next.receiptId);} catch {setMessage("ERP đã xác nhận; chưa cập nhật được màn hình liên quan.");}
    } else {
      setPhase(next.kind);
      if (next.kind === "rejected") {setErrors(next.fieldErrors ?? {}); setReview(false); originalIntent.current = null;}
    }
  }
  async function send(action: PurchaseRequestIntent["action"]) {
    if (!adapter || originalIntent.current || queuedDocument.current || lock.current || pending || uncertain || phase === "conflict" || !review
      || (action==="submit"&&access.existingOnly ? !canSubmitExisting : !editable)
      || (access.existingOnly&&!baseline.documentId)
      || (action === "saveDraft" ? !access.canSaveDraft || !dirty && !!baseline.documentId : !access.canSubmit)) return;
    const found = validatePurchaseRequest(values, access);
    if (Object.keys(found).length) {setErrors(found); setReview(false); return;}
    lock.current = true;
    const intent: PurchaseRequestIntent = {intentId: crypto.randomUUID(), action, documentId: baseline.documentId, expectedVersion: baseline.version, values: copy(values)};
    // This immutable intent survives an ambiguous acknowledgment for reconciliation only.
    for (const line of intent.values.lines) Object.freeze(line);
    Object.freeze(intent.values.lines); Object.freeze(intent.values); Object.freeze(intent);
    originalIntent.current = intent; originalAdapter.current=adapter; setDispatchAdapter(adapter); const token = ++generation.current; const controller = new AbortController(); request.current = controller;
    setHasUnresolvedIntent(true); setPhase("pending"); setResult(null); setMessage("");
    try {const next = await adapter.execute(intent, controller.signal); if (generation.current === token && !controller.signal.aborted && currentAccess.current.canRead && currentAdapter.current===adapter) accept(next, intent);}
    catch {if (generation.current === token && !controller.signal.aborted && currentAccess.current.canRead && currentAdapter.current===adapter) accept(unknown(intent, "Chưa xác nhận được kết quả. Kiểm tra kết quả trước khi gửi lại."), intent);}
    finally {if (generation.current === token) lock.current = false;}
  }
  async function reconcile() {
    const intent = originalIntent.current;
    if (!adapter || !serviceAvailable || !access.canRead || access.canReconcile===false || originalAdapter.current!==adapter || !intent || lock.current || phase !== "unknown") return;
    lock.current = true; const token = ++generation.current; const controller = new AbortController(); request.current = controller; setPhase("reconciling");
    try {const next = await adapter.reconcile(intent, controller.signal); if (generation.current === token && !controller.signal.aborted && currentAccess.current.canRead && currentAdapter.current===adapter) accept(next, intent, true);}
    catch {if (generation.current === token && !controller.signal.aborted && currentAccess.current.canRead && currentAdapter.current===adapter) accept(unknown(intent, "Chưa kiểm tra được kết quả. Yêu cầu gốc vẫn chưa được xác nhận."), intent, true);}
    finally {if (generation.current === token) lock.current = false;}
  }
  const stateLabel = pending ? (phase === "pending" ? "Đang gửi yêu cầu…" : "Đang kiểm tra kết quả…") : uncertain ? "Chưa xác nhận kết quả" : phase === "conflict" ? "Phiếu đã thay đổi trên ERP" : phase === "rejected" ? "Yêu cầu bị từ chối; nội dung chưa được lưu" : dirty ? "Có nội dung chưa lưu" : baseline.confirmation === "submitted" ? "ERP đã xác nhận gửi phiếu" : baseline.confirmation === "draft" ? "Nháp đã được ERP xác nhận" : "Phiếu mới chưa lưu";
  const headerFields = [
    ["purchaseDate", "Ngày đề nghị", "date", 10], ["personSuggest", "Người đề nghị", "text", 500], ["department", "Phòng ban", "text", 100],
    ["purposeDescOrClient", "Mục đích / khách hàng", "textarea", access.maxPurposeLength], ["notes", "Ghi chú", "textarea", access.maxNotesLength],
  ] as const;
  if (!access.canRead) return <section role="status"><h2>Đề nghị mua hàng</h2><p>Đăng nhập bằng tài khoản được cấp quyền để mở phiếu.</p></section>;
  if (!serviceAvailable || !adapter) return <section role="status"><h2>Đề nghị mua hàng</h2><p>Dịch vụ tạo và gửi đề nghị mua hàng chưa khả dụng.</p>{hasUnresolvedIntent && <p>Yêu cầu gốc vẫn cần được kiểm tra trước khi gửi yêu cầu khác.</p>}</section>;
  if (documentSwitchBlocked) return <section aria-label="Chờ xác nhận phiếu trước" style={{padding: 16, display: "grid", gap: 12}}><h1>Đề nghị mua hàng</h1><p role="status">{pending ? "Đang chờ kết quả phiếu trước…" : "Phiếu trước chưa được xác nhận. Kiểm tra yêu cầu gốc trước khi mở phiếu khác."}</p>{phase === "unknown" && <button type="button" style={requestInputStyle} disabled={access.canReconcile===false || dispatchAdapter!==adapter} onClick={() => void reconcile()}>Kiểm tra kết quả yêu cầu gốc</button>}</section>;
  return <form ref={form} onSubmit={event => {event.preventDefault(); if (!review && editable) inspect();}} aria-label="Đề nghị mua hàng trên điện thoại" style={{maxWidth: 640, width: "100%", margin: "0 auto", display: "grid", gap: 20, padding: 16, boxSizing: "border-box", minWidth: 0}}>
    <header><h1>Đề nghị mua hàng</h1><p role="status" aria-live="polite">{stateLabel}</p>{baseline.documentId && <p>Mã phiếu: <strong>{baseline.documentId}</strong></p>}{baseline.status && <p>Trạng thái ERP: <strong>{baseline.status.label}</strong></p>}</header>
    {!access.canEdit && <p role="status">Phiếu hiện chỉ được xem theo quyền của bạn.</p>}
    {access.existingOnly&&<p role="status">Phiếu có sẵn; không tạo hoặc thêm dòng. Ngày/giờ, chi nhánh và danh mục chưa có binding bị khóa. Giá trị ẩn và NULL được giữ nguyên; không tự tính tiền.</p>}
    {access.requiresFreshRead&&<p role="status">Receipt đã xác nhận được giữ lại. Đọc lại phiếu trước lần chỉnh sửa tiếp theo; Submit là thao tác riêng.</p>}
    {message && <p role="alert">{message}</p>}
    {result && result.kind !== "confirmed" && <section role="alert" style={{border: "1px solid #a1a1aa", padding: 12, borderRadius: 8}}>
      <p>{result.message}</p>{result.referenceId && <p>Mã hỗ trợ: {result.referenceId}</p>}
      {phase === "unknown" && <button type="button" style={requestInputStyle} disabled={access.canReconcile===false || dispatchAdapter!==adapter} onClick={() => void reconcile()}>Kiểm tra kết quả yêu cầu gốc</button>}
      {result.kind === "conflict" && <><p>Nội dung đang nhập vẫn được giữ. Bản ERP: {result.current.documentId}; trạng thái: {result.current.status?.label ?? "Chưa được dịch vụ cung cấp"}.</p><button type="button" style={requestInputStyle} onClick={() => {if (lock.current) return; setBaseline(result.current); setValues(copy(result.current.values)); setPhase("editing"); setResult(null); setReview(false); setErrors({}); originalIntent.current = null;}}>Tải bản ERP và bỏ nội dung đang nhập</button></>}
    </section>}
    <section aria-label={review ? "Rà soát thông tin phiếu" : "Thông tin phiếu"} style={{display: "grid", gap: 14}}>
      <h2>{review ? "Rà soát phiếu trước khi gửi" : "Thông tin phiếu"}</h2>
      {headerFields.map(([field, label, type, max]) => {
        const id = `${prefix}-${field}`; const error = errors[field];
        return <div key={field} style={{display: "grid", gap: 6, overflowWrap: "anywhere"}}><label htmlFor={id}>{label}{field === "personSuggest" || field === "department" ? " *" : ""}</label>
          {review ? <strong>{values[field] || "—"}</strong> : type === "textarea" ? <textarea id={id} name={field} rows={3} value={values[field]} maxLength={max} disabled={!editable} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} style={requestInputStyle} onChange={event => change({[field]: event.target.value})}/> : <input id={id} name={field} type={type} value={values[field]} maxLength={max} disabled={!editable || !!access.existingOnly&&field==="purchaseDate"} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} style={requestInputStyle} onChange={event => change({[field]: event.target.value})}/>}
          {error && <p id={`${id}-error`} role="alert">{error}</p>}</div>;
      })}
      {([["branchId", "Chi nhánh", access.branches], ["currencyId", "Tiền tệ", access.currencies], ["purposeId", "Mục đích", access.purposes]] as const).map(([field, label, options]) => {
        const id = `${prefix}-${field}`; const error = errors[field];
        return <div key={field} style={{display: "grid", gap: 6}}><label htmlFor={id}>{label}{field !== "purposeId" ? " *" : ""}</label>{review || access.existingOnly ? <strong>{options.find(option => option.id === values[field])?.label || values[field] || "—"}</strong> : <select id={id} name={field} disabled={!editable} value={values[field]} style={requestInputStyle} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => change({[field]: event.target.value})}><option value="">Chọn {label.toLowerCase()}</option>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>}{error && <p id={`${id}-error`} role="alert">{error}</p>}</div>;
      })}
      {review || access.existingOnly ? <p>Đối tượng: <strong>{values.objectLabel || values.objectId || "—"}</strong></p> : <RemoteLookup id={access.objectLookupId} label="Đối tượng" value={values.objectId ? {id: values.objectId, label: values.objectLabel || values.objectId} : null} disabled={!editable} error={errors.objectId} adapter={adapter.lookup} onChange={item => change({objectId: item?.id ?? "", objectLabel: item?.label})}/>}
      {errors.objectId && <p role="alert">{errors.objectId}</p>}
    </section>
    <MobileRequestLines lines={values.lines} disabled={!editable} canAdd={access.canAddLines!==false && values.lines.length < access.maxLines} lockItem={access.existingOnly===true} readOnly={review} errors={errors} lookupAdapter={adapter.lookup} itemLookupId={access.itemLookupId} onChange={(key, patch) => change({lines: values.lines.map(line => line.localKey === key ? {...line, ...patch, localKey: line.localKey, lineId: line.lineId} : line)})} onAdd={() => {if (access.canAddLines!==false && values.lines.length < access.maxLines) change({lines: [...values.lines, {localKey: crypto.randomUUID(), lineId: null, itemId: "", quantity: "", unitPrice: "", budget: "", timeRequired: "", model: ""}]});}} onRemove={key => change({lines: values.lines.filter(line => line.localKey !== key)})}/>
    <footer style={{display: "grid", gap: 10, position: "sticky", bottom: 0, padding: "12px 0 max(12px, env(safe-area-inset-bottom))", background: "var(--background, white)", borderTop: "1px solid #a1a1aa"}}>
      <p style={{margin: 0}}>ERP kiểm tra lại quyền và điều kiện nghiệp vụ khi nhận yêu cầu.</p>
      {review ? <><button type="button" disabled={!editable} style={requestInputStyle} onClick={() => setReview(false)}>Quay lại chỉnh sửa</button><button type="button" disabled={!editable || !access.canSaveDraft || !dirty && !!baseline.documentId} style={requestInputStyle} onClick={() => void send("saveDraft")}>Lưu nháp trên ERP</button><button type="button" disabled={access.existingOnly ? !canSubmitExisting : !editable || !access.canSubmit} style={requestInputStyle} onClick={() => void send("submit")}>Gửi đề nghị</button></> : <button type="submit" disabled={!editable&&!canSubmitExisting} style={requestInputStyle} onClick={()=>{if(canSubmitExisting&&!editable)setReview(true);}}>Rà soát phiếu</button>}
    </footer>
  </form>;
}
