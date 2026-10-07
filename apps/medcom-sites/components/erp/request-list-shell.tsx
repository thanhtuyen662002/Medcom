"use client";

import type {ComponentProps, ReactNode, Ref} from "react";
import {Building2, ChevronDown, Search} from "lucide-react";
import {RequestButton, RequestInput, RequestSelect, RequestDocumentIdentity, requestStyles} from "./request-presentation";
import {ErpGrid} from "./grid";
import {cn} from "@/lib/utils";

/** Presentation only: callers retain authority, querying, selection and focus custody. */
export function RequestListHeader({title, listRef, children}:{title:string;listRef?:Ref<HTMLHeadingElement>;children?:ReactNode}) {
  return <div className="request-list-header"><h2 ref={listRef} tabIndex={-1} className="request-title scroll-mt-24">{title}</h2>{children}</div>;
}
export function RequestListToolbar({className,...props}:ComponentProps<"form">) {
  return <form className={cn("request-list-toolbar",className)} {...props}/>;
}
export function RequestSearch({label,placeholder,value,onChange,inputRef,maxLength=100,shortcut}:{label:string;placeholder:string;value:string;onChange:(value:string)=>void;inputRef?:Ref<HTMLInputElement>;maxLength?:number;shortcut?:ReactNode}) {
  return <label className="request-list-search"><span className="sr-only">{label}</span><Search size={16} aria-hidden="true"/><RequestInput ref={inputRef} aria-label={label} placeholder={placeholder} value={value} maxLength={maxLength} onChange={event=>onChange(event.target.value)}/>{shortcut&&<kbd>{shortcut}</kbd>}</label>;
}
export function RequestBranch({label,value,branches,disabled,onChange,allValue=""}:{label:string;value:string;branches:string[];disabled?:boolean;onChange:(value:string)=>void;allValue?:string}) {
  return <label className="request-list-branch"><span className="sr-only">{label}</span><Building2 size={15} aria-hidden="true"/><RequestSelect aria-label={label} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}><option value={allValue}>Tất cả chi nhánh được cấp quyền</option>{branches.map(id=><option key={id} value={id}>{id}</option>)}</RequestSelect><ChevronDown size={14} aria-hidden="true"/></label>;
}
export function RequestPagination({label,page,previousDisabled,nextDisabled,onPrevious,onNext,previousLabel="Trang trước",nextLabel="Trang sau",previousText="Trang trước",nextText="Trang sau",children}:{label:string;page:number;previousDisabled:boolean;nextDisabled:boolean;onPrevious:()=>void;onNext:()=>void;previousLabel?:string;nextLabel?:string;previousText?:string;nextText?:string;children?:ReactNode}) {
  return <nav aria-label={label} className={cn(requestStyles.footer,"request-list-pagination")}>
    {children&&<div className="request-list-page-meta">{children}</div>}
    <div className="request-list-page-controls"><RequestButton type="button" aria-label={previousLabel.includes(previousText)?previousLabel:`${previousText} — ${previousLabel}`} disabled={previousDisabled} onClick={onPrevious}>{previousText}</RequestButton><span>Trang {page}</span><RequestButton type="button" aria-label={nextLabel.includes(nextText)?nextLabel:`${nextText} — ${nextLabel}`} disabled={nextDisabled} onClick={onNext}>{nextText}</RequestButton></div>
  </nav>;
}
export type RequestListColumn = {id:string;label:string};
export type RequestListRow = {id:string;cells:ReactNode[];action:string;actionLabel:string;selected?:boolean;onOpen:()=>void;buttonRef:Ref<HTMLButtonElement>};
/** Compatibility adapter: the shared grid owns the only table/row/action DOM. */
export function RequestListTable({label,columns,rows}:{label:string;columns:RequestListColumn[];rows:RequestListRow[]}) {
  return <ErpGrid rows={rows} columns={columns.map((column,index)=>({...column,width:index===0?200:160,required:index===0}))} rowId={row=>row.id}
    renderCell={(row,id)=>{const index=columns.findIndex(column=>column.id===id);return index===0?<RequestDocumentIdentity>{row.cells[index]}</RequestDocumentIdentity>:row.cells[index];}}
    rowAction={row=>({label:row.action,accessibleLabel:row.actionLabel,selected:row.selected,buttonRef:row.buttonRef})}
    onOpen={row=>row.onOpen()} schemaVersion={columns.map(column=>column.id).join("|")} scopeKey={label} compact={false} label={label}
    selectable={false} customizable={false} virtualize={false}/>;
}
