"use client";

import {createContext,useContext,useState,type ComponentProps, type ReactNode, type Ref} from "react";
import {ScreenHeader} from "./screen-shell";
import {createPortal} from "react-dom";
import {Building2, ChevronDown, RefreshCw, Search} from "lucide-react";
import {RequestButton, RequestInput, RequestSelect, RequestDocumentIdentity, requestStyles} from "./request-presentation";
import {ErpGrid} from "./grid";
import {cn} from "@/lib/utils";

/** Presentation only: callers retain authority, querying, selection and focus custody. */
export function RequestListHeader({title, listRef, children}:{title:string;listRef?:Ref<HTMLHeadingElement>;children?:ReactNode}) {
  return <ScreenHeader title={title} titleRef={listRef} actions={children}/>;
}
type ToolHost={element:HTMLDivElement|null;mount:(element:HTMLDivElement|null)=>void};
const Tools=createContext<ToolHost|null>(null);
export function RequestListComposition({children}:{children:ReactNode}){const [element,mount]=useState<HTMLDivElement|null>(null);return <Tools.Provider value={{element,mount}}>{children}</Tools.Provider>;}
/** A list's toolbar belongs to the viewport, never a clipped panel ancestor.
 * Clipping stays in the sibling content region and the grid's own viewport. */
export function RequestListPanel({className,...props}:ComponentProps<"section">){return <section {...props} data-list-panel="" className={cn(requestStyles.panel,"request-list-panel",className)}/>;}
export function RequestListContent({className,...props}:ComponentProps<"section">){return <section {...props} data-list-content="" className={cn("request-list-content",className)}/>;}
export function RequestListToolbar({className,children,...props}:ComponentProps<"form">) {
 const target=useContext(Tools);
 return <form className={cn("request-list-toolbar",className)} {...props}>{children}<div className="request-customization-slot" ref={target?.mount}/></form>;
}
export function ListCustomizationSlot({children}:{children:ReactNode}){const target=useContext(Tools);return target?.element?createPortal(children,target.element):<div className="request-customization-fallback">{children}</div>;}

export function RequestSearch({label,placeholder,value,onChange,inputRef,maxLength=100,shortcut}:{label:string;placeholder:string;value:string;onChange:(value:string)=>void;inputRef?:Ref<HTMLInputElement>;maxLength?:number;shortcut?:ReactNode}) {
  return <label className="request-list-search"><span className="sr-only">{label}</span><Search size={16} aria-hidden="true"/><RequestInput ref={inputRef} aria-label={label} placeholder={placeholder} value={value} maxLength={maxLength} onChange={event=>onChange(event.target.value)}/>{shortcut&&<kbd>{shortcut}</kbd>}</label>;
}
/** Keep caller-owned refresh/authority behavior while sharing the visual action. */
export function RequestRefresh({className,refreshing=false,...props}:Omit<ComponentProps<typeof RequestButton>,"children"|"type"|"aria-label">&{refreshing?:boolean}) {
  return <RequestButton {...props} type="button" aria-label="Làm mới" className={cn("request-list-refresh",className)}><RefreshCw size={16} aria-hidden="true" className={refreshing?"spin":undefined}/><span className="request-list-refresh-label">Làm mới</span></RequestButton>;
}
export function RequestBranch({label,value,branches,disabled,onChange,allValue="",assignedBranchId}:{label:string;value:string;branches:string[];disabled?:boolean;onChange:(value:string)=>void;allValue?:string;assignedBranchId?:string|null}) {
  return <label className="request-list-branch"><span className="sr-only">{label}</span><Building2 size={15} aria-hidden="true"/><RequestSelect aria-label={label} value={assignedBranchId??value} disabled={disabled||assignedBranchId!=null} onChange={event=>onChange(event.target.value)}>{assignedBranchId==null&&<option value={allValue}>Tất cả</option>}{branches.map(id=><option key={id} value={id}>{id}</option>)}</RequestSelect><ChevronDown size={14} aria-hidden="true"/></label>;
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
export function RequestListTable({label,columns,rows,presentationAllowed=true,isPresentationAllowed,customizationScopeKey,compact=false,setCompact}:{label:string;columns:RequestListColumn[];rows:RequestListRow[];presentationAllowed?:boolean;isPresentationAllowed?:()=>boolean;customizationScopeKey?:string|null;compact?:boolean;setCompact?:(value:boolean)=>void}) {
  return <ErpGrid rows={rows} columns={columns.map((column,index)=>({...column,width:index===0?200:160,required:index===0}))} rowId={row=>row.id}
    renderCell={(row,id)=>{const index=columns.findIndex(column=>column.id===id);return index===0?<RequestDocumentIdentity>{row.cells[index]}</RequestDocumentIdentity>:row.cells[index];}}
    rowAction={row=>({label:row.action,accessibleLabel:row.actionLabel,selected:row.selected,buttonRef:row.buttonRef})}
    onOpen={row=>row.onOpen()} schemaVersion={columns.map(column=>column.id).join("|")} scopeKey={label} compact={compact} setCompact={setCompact} label={label} presentationAllowed={presentationAllowed} isPresentationAllowed={isPresentationAllowed} customizationScopeKey={customizationScopeKey}
    selectable={false} customizable={true} virtualize={false}/>;
}
