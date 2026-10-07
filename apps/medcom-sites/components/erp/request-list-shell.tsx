"use client";

import type {ReactNode, Ref} from "react";
import {Building2, ChevronDown, FileText, Search} from "lucide-react";
import {RequestButton, RequestInput} from "./request-presentation";

/** Presentation only: callers retain authority, querying, selection and focus custody. */
export function RequestListHeader({title, listRef, children}:{title:string;listRef?:Ref<HTMLHeadingElement>;children?:ReactNode}) {
  return <div className="request-list-header"><h2 ref={listRef} tabIndex={-1} className="request-title scroll-mt-24">{title}</h2>{children}</div>;
}
export function RequestSearch({label,placeholder,value,onChange}:{label:string;placeholder:string;value:string;onChange:(value:string)=>void}) {
  return <label className="request-list-search"><span className="sr-only">{label}</span><Search size={16} aria-hidden="true"/><RequestInput placeholder={placeholder} value={value} maxLength={100} onChange={event=>onChange(event.target.value)}/></label>;
}
export function RequestBranch({label,value,branches,disabled,onChange}:{label:string;value:string;branches:string[];disabled?:boolean;onChange:(value:string)=>void}) {
  return <label className="request-list-branch"><span className="sr-only">{label}</span><Building2 size={15} aria-hidden="true"/><select aria-label={label} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}><option value="">Tất cả chi nhánh được cấp quyền</option>{branches.map(id=><option key={id} value={id}>{id}</option>)}</select><ChevronDown size={14} aria-hidden="true"/></label>;
}
export type RequestListColumn = {id:string;label:string};
export type RequestListRow = {id:string;cells:ReactNode[];action:string;actionLabel:string;selected?:boolean;onOpen:()=>void;buttonRef:Ref<HTMLButtonElement>};
/** One DOM tree and one focus destination at every viewport size. */
export function RequestListTable({label,columns,rows}:{label:string;columns:RequestListColumn[];rows:RequestListRow[]}) {
  return <table className="request-list-table" aria-label={label}><thead><tr>{columns.map(column=><th key={column.id} scope="col">{column.label}</th>)}<th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{rows.map(row=><tr key={row.id} data-selected={row.selected||undefined}>{row.cells.map((cell,index)=><td key={columns[index].id} data-label={columns[index].label}>{index===0?<span className="request-document-id"><FileText size={16} aria-hidden="true"/><strong>{cell}</strong></span>:cell}</td>)}<td className="request-list-open"><RequestButton ref={row.buttonRef} type="button" aria-label={row.actionLabel} aria-pressed={row.selected} onClick={row.onOpen} className="scroll-mt-24">{row.action}</RequestButton></td></tr>)}</tbody></table>;
}
