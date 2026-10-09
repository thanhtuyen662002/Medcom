"use client";

import {createContext,useState, type ComponentProps, type ReactNode} from "react";
import {AlertCircle, Copy, FileText, ShieldCheck} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {Empty, EmptyDescription, EmptyHeader, EmptyTitle} from "@/components/ui/empty";
import {ListLoading} from "./list-loading";
import {ApiError, errorMessage} from "@/lib/erp/api";
import {documentStatusLabel} from "@/lib/erp/document-status";
import {cn} from "@/lib/utils";

/** Shared presentation only. No request, authority, storage or command state. */
export const requestStyles = {
  stack: "request-stack grid min-w-0 gap-4",
  panel: "request-panel min-w-0 rounded-xl border border-border bg-card text-card-foreground shadow-xs",
  header: "request-panel-header flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-5",
  title: "request-title text-base font-semibold tracking-tight",
  muted: "text-sm leading-relaxed text-muted-foreground",
  toolbar: "request-filter grid min-w-0 gap-3 border-b border-border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:px-5",
  field: "request-field grid min-w-0 gap-2 text-sm font-medium [&_label]:leading-relaxed",
  fields: "request-fields grid min-w-0 gap-5 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-5",
  line: "request-line grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 [overflow-wrap:anywhere]",
  cards: "request-list grid min-w-0 gap-3 p-4 sm:p-5",
  card: "request-list-row grid min-w-0 gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]",
  cardHeading: "request-row-heading flex min-w-0 items-start justify-between gap-3 text-base font-semibold",
  values: "request-values grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 text-sm [&_dt]:mb-1 [&_dt]:text-xs [&_dt]:font-normal [&_dt]:text-muted-foreground [&_dd]:font-medium [&_dd]:[overflow-wrap:anywhere]",
  footer: "request-panel-footer flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm sm:px-5",
  actions: "flex min-w-0 flex-wrap gap-2 [&>button]:flex-1 sm:[&>button]:flex-none",
  section: "request-section grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:p-5",
  editor: "request-editor mx-auto grid w-full min-w-0 max-w-5xl gap-5 [overflow-wrap:anywhere]",
  actionBar: "request-action-bar grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:p-5 sm:[&>p]:mr-auto",
} as const;

export function RequestButton({className, variant="outline", ...props}:ComponentProps<typeof Button>){
  return <Button variant={variant} className={cn("request-button h-auto min-h-11 min-w-11 max-w-full whitespace-normal break-words px-4 py-2 text-sm",className)} {...props}/>;
}
export function RequestInput({className,...props}:ComponentProps<typeof Input>){
  return <Input className={cn("request-input h-auto min-h-11 w-full min-w-0 bg-background text-base md:text-base",className)} {...props}/>;
}
/** Native finite choices share the same input geometry and keyboard behavior. */
export function RequestSelect({className,...props}:ComponentProps<"select">){
  return <select className={cn("request-select",className)} {...props}/>;
}
export function RequestTextarea({className,...props}:ComponentProps<typeof Textarea>){
  return <Textarea className={cn("request-textarea min-h-24 w-full min-w-0 bg-background text-base md:text-base",className)} {...props}/>;
}
export function RequestNotice({children,title,role="status",warning=false}:{children:ReactNode;title?:string;role?:"status"|"alert";warning?:boolean}){
  const Icon=warning?AlertCircle:ShieldCheck;
  return <div role={role} className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed [overflow-wrap:anywhere]">
    <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground"/>
    <div className="grid min-w-0 gap-1">{title&&<strong className="font-semibold">{title}</strong>}{children}</div>
  </div>;
}
export function RequestEmpty({title,children}:{title:string;children:ReactNode}){
  return <Empty className="min-h-52 px-4 py-8"><EmptyHeader><FileText aria-hidden="true" className="mx-auto mb-2 size-7 text-muted-foreground"/><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{children}</EmptyDescription></EmptyHeader></Empty>;
}
export function RequestLoading({label="Đang tải chứng từ…",form=false}:{label?:string;form?:boolean}){
  return <ListLoading label={label} form={form}/>;
}
export function RequestDocumentIdentity({children}:{children:ReactNode}){
  return <span className="request-document-id"><FileText size={16} aria-hidden="true"/><strong>{children}</strong></span>;
}
export function RequestStatus({value,statusName}:{value:number|null|undefined;statusName?:string|null}){
  return <Badge variant="outline" title={documentStatusLabel(value,statusName)} className="request-status max-w-full whitespace-normal font-normal">{documentStatusLabel(value,statusName)}</Badge>;
}
/** Display source wall-clock dates without converting time zone or editing data. */
export function requestDate(value:string|null|undefined){
  if(!value)return "Chưa có ngày";
  const match=/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value);
  return match?`${match[3]}/${match[2]}/${match[1]}`:"Chưa xác định";
}
const supportCodes=new Set(["authentication_required","backend_not_configured","frontend_not_configured","backend_unavailable","identity_unavailable","invalid_api_response","invalid_read_scope","read_scope_changed","request_failed","purchase_read_unavailable"]);
export function RequestError({error,retry,legacyReference=false}:{error:unknown;retry?:()=>void;legacyReference?:boolean}){
  const [copied,setCopied]=useState(false);
  const api=error instanceof ApiError?error:null;
  const status=api&&Number.isInteger(api.status)&&api.status>=100&&api.status<=599?api.status:null;
  const code=api&&supportCodes.has(api.code)?api.code:"unknown_code";
  const reference=api?.correlationId&&(legacyReference||/^[a-f0-9]{32}$/i.test(api.correlationId))?api.correlationId:null;
  return <RequestNotice role="alert" warning title={errorMessage(error)}>
    {retry&&<RequestButton onClick={retry}>Thử lại</RequestButton>}
    <details className="text-xs text-muted-foreground"><summary className="flex min-h-11 cursor-pointer items-center">Thông tin hỗ trợ</summary><dl className="grid gap-1">{status!==null&&<div><dt className="inline">Mã trạng thái xử lý: </dt><dd className="inline">{status}</dd></div>}<div><dt className="inline">Mã: </dt><dd className="inline">{code}</dd></div>{reference&&<div><dt className="inline">Mã hỗ trợ: </dt><dd className="inline break-all">{reference}<RequestButton type="button" variant="ghost" aria-label="Sao chép mã hỗ trợ" onClick={async()=>{try{await navigator.clipboard.writeText(reference);setCopied(true);}catch{setCopied(false);}}}><Copy size={14}/>{copied?"Đã sao chép":"Sao chép"}</RequestButton></dd></div>}</dl></details>
  </RequestNotice>;
}

const requestPhaseCopy:Record<string,string>={
  "Đang đọc đầy đủ các trường và dòng do DTO ERP cung cấp.":"Đang tải thông tin và dòng hàng…",
  "Đã đọc đầy đủ các trường và dòng do DTO ERP cung cấp.":"Dữ liệu đã được cập nhật từ ERP.",
  "ERP đã xác nhận thao tác. Đang đọc lại snapshot và ID dòng thật.":"ERP đã xác nhận thao tác. Đang cập nhật lại phiếu…",
  "ERP đã xác nhận thao tác. Đã đọc lại snapshot khớp xác nhận và ID dòng thật.":"ERP đã xác nhận thao tác. Phiếu đã được cập nhật.",
};
export function requestMessage(message:string){return requestPhaseCopy[message]??message;}

/** Shared footer host; carries no record data or command state. */
export const RecordActionHost=createContext<HTMLElement|null>(null);
