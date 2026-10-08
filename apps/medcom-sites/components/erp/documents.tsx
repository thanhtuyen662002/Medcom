"use client";
import {useEffect,useLayoutEffect,useRef,useState,type FormEvent} from "react";
import {useQuery} from "@tanstack/react-query";
import {LockKeyhole} from "lucide-react";
import {useListControls} from "./list-view-state";
import {ErpGrid} from "./grid";
import {Freshness} from "./feedback";
import {RequestListComposition,RequestListPanel,RequestListContent,RequestListHeader,RequestListToolbar,RequestSearch,RequestBranch,RequestRefresh,RequestPagination} from "./request-list-shell";
import {RequestButton,RequestEmpty,RequestError,RequestLoading,RequestStatus,RequestDocumentIdentity} from "./request-presentation";
import {ApiError,getDocuments,type ReadScope} from "@/lib/erp/api";
import {authorizedScreenIds} from "@/lib/erp/navigation";
import type {GridColumn} from "@/lib/erp/presentation";
import type {DocumentKind,DocumentRow,WorkspaceData} from "@/lib/erp/contracts";
const columns:GridColumn[]=[{id:"documentId",label:"Mã chứng từ",width:248,required:true},{id:"documentDate",label:"Ngày chứng từ",width:170,format:"date"},{id:"branchId",label:"Chi nhánh",width:160},{id:"statusId",label:"Trạng thái",width:160,format:"status"},{id:"isLocked",label:"Khóa chứng từ",width:170,format:"boolean"}];
const date=(value:string)=>new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));
function EmptyState({title,text,children}:{title:string;text:string;children?:React.ReactNode}){return <RequestEmpty title={title}><span className="block">{text}</span>{children}</RequestEmpty>;}
export type DocumentReadState={documentId:string|null;active:boolean;generation:number;scope:ReadScope|null};
export function Documents({kind,workspace,verified,generation,compact,setCompact,onLogin,onDenied,renderDetail}:{kind:DocumentKind;workspace:WorkspaceData|null;verified:boolean;generation:number;compact:boolean;setCompact:(v:boolean)=>void;onLogin:()=>void;onDenied:(e:unknown)=>void;renderDetail:(selected:DocumentRow|null,close:()=>void,read:DocumentReadState)=>React.ReactNode}){
 const {value:controlValue,field:controlField,set:setControls,attachRoot,captureScroll,restoreScroll,setActive}=useListControls(kind);
 const {draftSearch:search,appliedSearch:applied,appliedBranch:branch,page}=controlValue;
 const setSearch=controlField("draftSearch"),setApplied=controlField("appliedSearch"),setBranch=(value:string)=>setControls(previous=>({...previous,draftBranch:value,appliedBranch:value})),setPage=controlField("page");const [selectedId,setSelectedId]=useState<string|null>(null);const setSelected=(row:DocumentRow|null)=>setSelectedId(row?.documentId??null);const searchRef=useRef<HTMLInputElement>(null);
 const allowed=verified&&!!workspace?.sessionScope&&!!workspace?.readScope&&authorizedScreenIds(workspace).includes(kind);const interval=kind==="inbound-requests"?15000:30000;
 const liveRows=useRef<{allowed:boolean;rows:DocumentRow[]}>({allowed:false,rows:[]});
 const open=(row:DocumentRow)=>{if(liveRows.current.allowed&&liveRows.current.rows.some(current=>current.documentId===row.documentId))setSelected(row);};
 const scopeKey=JSON.stringify([kind,page,applied,branch]);
 const scope=workspace?.sessionScope&&workspace?.readScope?{sessionScope:workspace.sessionScope,readScope:workspace.readScope}:null;
 const query=useQuery({queryKey:["erp-documents",scope?.sessionScope,scope?.readScope,generation,scopeKey],queryFn:({signal})=>getDocuments(kind,page,applied,branch,signal,scope??undefined),enabled:allowed,gcTime:0,retry:false,staleTime:interval,refetchInterval:interval,refetchIntervalInBackground:false,refetchOnWindowFocus:false,refetchOnReconnect:false,networkMode:"always"});
 const denied=query.error instanceof ApiError&&[401,403].includes(query.error.status);const data=allowed&&!query.error?query.data:undefined;
 useLayoutEffect(()=>{liveRows.current={allowed:allowed&&!query.error,rows:data?.rows??[]};return()=>{liveRows.current={allowed:false,rows:[]};};},[allowed,query.error,data]);
 // Temporary workspace loss masks data but does not retire mounted detail custody.
 // Remember only the last observed identity for invalidation, never read authority.
 const readScopeKey=scope?JSON.stringify([scope.sessionScope,scope.readScope]):null;
 const [selectionScope,setSelectionScope]=useState({readScopeKey,scopeKey,denied});
 const selected=data?.rows.find(row=>row.documentId===selectedId)??null;
 const viewport=useRef<HTMLDivElement>(null),scroll=useRef({top:0,left:0});
 useLayoutEffect(()=>{if(!data)return;const element=viewport.current?.querySelector<HTMLElement>(".desktop-grid-viewport");if(element){element.scrollTop=scroll.current.top;element.scrollLeft=scroll.current.left;}},[data]);
 if(data&&selectedId&&!data.rows.some(row=>row.documentId===selectedId))setSelectedId(null);
 if(selectionScope.scopeKey!==scopeKey||selectionScope.denied!==denied||readScopeKey!==null&&selectionScope.readScopeKey!==readScopeKey){setSelectionScope({readScopeKey:readScopeKey??selectionScope.readScopeKey,scopeKey,denied});setSelected(null);}
 useEffect(()=>{if(query.error)onDenied(query.error);},[query.error,onDenied]);
 useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="f"){e.preventDefault();searchRef.current?.focus();}};window.addEventListener("keydown",listener);return()=>window.removeEventListener("keydown",listener);},[]);
 const submit=(e:FormEvent)=>{e.preventDefault();setApplied(search.trim());setPage(1);if(applied===search.trim()&&page===1)void query.refetch();};
 const title=kind==="purchase-orders"?"Đặt mua hàng":"Đề nghị nhập hàng";
 function renderCell(row:DocumentRow,id:string){if(id==="documentId")return <button className="document-link" title={row.documentId} onClick={()=>open(row)}><RequestDocumentIdentity>{row.documentId}</RequestDocumentIdentity></button>;if(id==="documentDate")return date(row.documentDate);if(id==="branchId")return row.branchId;if(id==="statusId")return <RequestStatus value={row.statusId} statusName={row.statusName}/>;return row.isLocked===null?"Chưa xác định":row.isLocked?<span className="locked"><LockKeyhole size={13}/>Đã khóa</span>:"Không khóa";}
 useLayoutEffect(()=>{setActive(allowed);restoreScroll(allowed&&!!data);});
 return <><RequestListComposition><RequestListPanel ref={attachRoot} className="document-panel" onScrollCapture={event=>{if(event.target instanceof HTMLElement)captureScroll(event.target);}}>
 <RequestListHeader title={kind==="purchase-orders"?"Danh sách đơn đặt hàng":"Danh sách phiếu nhập hàng"}/>
 <RequestListToolbar className="table-toolbar" onSubmit={submit}>
  <RequestSearch inputRef={searchRef} value={search} maxLength={50} onChange={setSearch} placeholder="Tìm mã chứng từ…" label="Tìm mã chứng từ" shortcut="⌘ F"/>
  <RequestBranch label="Chi nhánh" value={branch} allValue="" branches={workspace?.branchIds??[]} onChange={v=>{setBranch(v);setPage(1);}}/>
  <div className="toolbar-end"><RequestRefresh refreshing={query.isFetching} disabled={query.isFetching||!allowed} onClick={()=>void query.refetch()}/></div>
 </RequestListToolbar>
 <RequestListContent>{query.error&&<RequestError error={query.error} retry={allowed?()=>void query.refetch():undefined}/>}
 {<div ref={viewport} hidden={!data} onScrollCapture={event=>{if(data&&event.target instanceof HTMLElement&&event.target.classList.contains("desktop-grid-viewport"))scroll.current={top:event.target.scrollTop,left:event.target.scrollLeft};}}><ErpGrid rows={data?.rows??[]} columns={columns} rowId={row=>row.documentId} renderCell={renderCell}
  rowAction={row=>({label:"Mở chứng từ",accessibleLabel:`Mở chứng từ ${row.documentId}`,selected:selectedId===row.documentId})}
  onOpen={open} presentationAllowed={allowed&&!query.error} isPresentationAllowed={()=>liveRows.current.allowed} setCompact={setCompact} schemaVersion="document-read-v1" scopeKey={scopeKey} compact={compact} label={title}/></div>}
 {!verified?<RequestLoading label="Đang xác minh chứng từ…"/>:!workspace?<EmptyState title="Chứng từ của bạn sẽ hiển thị tại đây" text="Đăng nhập ERP để xem chứng từ trong phạm vi được cấp quyền."><RequestButton onClick={onLogin}><LockKeyhole size={16}/>Đăng nhập ERP</RequestButton></EmptyState>:!allowed?<EmptyState title="Chưa được cấp quyền" text="Tài khoản ERP hiện tại không có quyền mở loại chứng từ này."/>:query.isPending&&!query.error?<RequestLoading label="Đang tải chứng từ"/>:data?.rows.length===0?<EmptyState title={applied||branch!==""?"Không có chứng từ phù hợp":"Chưa có chứng từ"} text={applied||branch!==""?"Thử điều chỉnh từ khóa hoặc chi nhánh.":"ERP chưa trả về chứng từ trong phạm vi của bạn."}/>:null}
 <RequestPagination label="Phân trang chứng từ" page={page} previousDisabled={page===1||query.isFetching||!allowed} nextDisabled={!data?.hasMore||query.isFetching||!allowed||page>=1000} onPrevious={()=>setPage(p=>p-1)} onNext={()=>setPage(p=>p+1)}><Freshness updatedAt={data?query.dataUpdatedAt:0} fetching={query.isFetching} stale={!!query.error}/></RequestPagination></RequestListContent></RequestListPanel></RequestListComposition>{renderDetail(selected,()=>setSelected(null),{documentId:selectedId,active:!!selected&&!!data,generation,scope})}</>;
}
