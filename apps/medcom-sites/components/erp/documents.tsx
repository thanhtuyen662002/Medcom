"use client";
import {useEffect,useLayoutEffect,useRef,useState,type FormEvent} from "react";
import {useQuery} from "@tanstack/react-query";
import {LockKeyhole,RefreshCw,Rows3,ShieldCheck} from "lucide-react";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {ErpGrid} from "./grid";
import {Freshness} from "./feedback";
import {RequestListHeader,RequestListToolbar,RequestSearch,RequestBranch,RequestPagination} from "./request-list-shell";
import {RequestButton,RequestEmpty,RequestError,RequestLoading,RequestStatus,RequestDocumentIdentity,requestStyles} from "./request-presentation";
import {ApiError,getDocuments,type ReadScope} from "@/lib/erp/api";
import {authorizedScreenIds} from "@/lib/erp/navigation";
import type {GridColumn} from "@/lib/erp/presentation";
import type {DocumentKind,DocumentRow,WorkspaceData} from "@/lib/erp/contracts";
const columns:GridColumn[]=[{id:"documentId",label:"Mã chứng từ",width:248,required:true},{id:"documentDate",label:"Ngày chứng từ",width:170,format:"date"},{id:"branchId",label:"Chi nhánh",width:160},{id:"statusId",label:"Trạng thái",width:160,format:"status"},{id:"isLocked",label:"Khóa chứng từ",width:170,format:"boolean"}];
const date=(value:string)=>new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));
function EmptyState({title,text,children}:{title:string;text:string;children?:React.ReactNode}){return <RequestEmpty title={title}><span className="block">{text}</span>{children}</RequestEmpty>;}
export type DocumentReadState={documentId:string|null;active:boolean;generation:number;scope:ReadScope|null};
export function Documents({kind,workspace,verified,generation,compact,setCompact,onLogin,onDenied,renderDetail}:{kind:DocumentKind;workspace:WorkspaceData|null;verified:boolean;generation:number;compact:boolean;setCompact:(v:boolean)=>void;onLogin:()=>void;onDenied:(e:unknown)=>void;renderDetail:(selected:DocumentRow|null,close:()=>void,read:DocumentReadState)=>React.ReactNode}){
 const [search,setSearch]=useState("");const [applied,setApplied]=useState("");const [branch,setBranch]=useState("all");const [page,setPage]=useState(1);const [selectedId,setSelectedId]=useState<string|null>(null);const setSelected=(row:DocumentRow|null)=>setSelectedId(row?.documentId??null);const searchRef=useRef<HTMLInputElement>(null);
 const allowed=verified&&!!workspace?.sessionScope&&!!workspace?.readScope&&authorizedScreenIds(workspace).includes(kind);const interval=kind==="inbound-requests"?15000:30000;
 const scopeKey=JSON.stringify([kind,page,applied,branch]);
 const scope=workspace?.sessionScope&&workspace?.readScope?{sessionScope:workspace.sessionScope,readScope:workspace.readScope}:null;
 const query=useQuery({queryKey:["erp-documents",scope?.sessionScope,scope?.readScope,generation,scopeKey],queryFn:({signal})=>getDocuments(kind,page,applied,branch==="all"?"":branch,signal,scope??undefined),enabled:allowed,gcTime:0,retry:false,staleTime:interval,refetchInterval:interval,refetchIntervalInBackground:false,refetchOnWindowFocus:false,refetchOnReconnect:false,networkMode:"always"});
 const denied=query.error instanceof ApiError&&[401,403].includes(query.error.status);const data=allowed&&!query.error?query.data:undefined;
 // Reset selection before rendering a changed scope or denial; never show a stale document.
 const selectionScope=JSON.stringify([scopeKey,denied]);
 const [previousSelectionScope,setPreviousSelectionScope]=useState(selectionScope);
 const selected=data?.rows.find(row=>row.documentId===selectedId)??null;
 const viewport=useRef<HTMLDivElement>(null),scroll=useRef({top:0,left:0});
 useLayoutEffect(()=>{if(!data)return;const element=viewport.current?.querySelector<HTMLElement>(".desktop-grid-viewport");if(element){element.scrollTop=scroll.current.top;element.scrollLeft=scroll.current.left;}},[data]);
 if(data&&selectedId&&!data.rows.some(row=>row.documentId===selectedId))setSelectedId(null);
 if(previousSelectionScope!==selectionScope){setPreviousSelectionScope(selectionScope);setSelected(null);}
 useEffect(()=>{if(query.error)onDenied(query.error);},[query.error,onDenied]);
 useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="f"){e.preventDefault();searchRef.current?.focus();}};window.addEventListener("keydown",listener);return()=>window.removeEventListener("keydown",listener);},[]);
 const submit=(e:FormEvent)=>{e.preventDefault();setApplied(search.trim());setPage(1);if(applied===search.trim()&&page===1)void query.refetch();};
 const title=kind==="purchase-orders"?"Đặt mua hàng":"Đề nghị nhập hàng";
 function renderCell(row:DocumentRow,id:string){if(id==="documentId")return <button className="document-link" title={row.documentId} onClick={()=>setSelected(row)}><RequestDocumentIdentity>{row.documentId}</RequestDocumentIdentity></button>;if(id==="documentDate")return date(row.documentDate);if(id==="branchId")return row.branchId;if(id==="statusId")return <RequestStatus value={row.statusId} statusName={row.statusName}/>;return row.isLocked===null?"Chưa xác định":row.isLocked?<span className="locked"><LockKeyhole size={13}/>Đã khóa</span>:"Không khóa";}
 return <><section className={`${requestStyles.panel} document-panel`}><Tabs defaultValue="documents"><div className="document-tabs"><TabsList variant="line"><TabsTrigger value="documents">Danh sách chứng từ</TabsTrigger><TabsTrigger value="guide">Hướng dẫn</TabsTrigger></TabsList><span className="table-meta">{data?`${data.rows.length} chứng từ trên trang này`:"Dữ liệu từ ERP"}</span></div><TabsContent value="documents">
 <RequestListHeader title={kind==="purchase-orders"?"Danh sách đơn đặt hàng":"Danh sách phiếu nhập hàng"}/>
 <RequestListToolbar className="table-toolbar" onSubmit={submit}>
  <RequestSearch inputRef={searchRef} value={search} maxLength={50} onChange={setSearch} placeholder="Tìm mã chứng từ…" label="Tìm mã chứng từ" shortcut="⌘ F"/>
  <RequestBranch label="Chi nhánh" value={branch} allValue="all" branches={workspace?.branchIds??[]} onChange={v=>{setBranch(v);setPage(1);}}/>
  <RequestButton type="submit" variant="secondary" disabled={!allowed}>Tìm kiếm</RequestButton>
  <div className="toolbar-end"><RequestButton type="button" aria-label={compact?"Giãn dòng":"Thu gọn dòng"} aria-pressed={compact} onClick={()=>setCompact(!compact)}><Rows3 size={16}/></RequestButton><RequestButton type="button" disabled={query.isFetching||!allowed} onClick={()=>void query.refetch()}><RefreshCw size={16} className={query.isFetching?"spin":""}/>Làm mới</RequestButton></div>
 </RequestListToolbar>
 {query.error&&<RequestError error={query.error} retry={allowed?()=>void query.refetch():undefined}/>}
 {<div ref={viewport} hidden={!data} onScrollCapture={event=>{if(data&&event.target instanceof HTMLElement&&event.target.classList.contains("desktop-grid-viewport"))scroll.current={top:event.target.scrollTop,left:event.target.scrollLeft};}}><ErpGrid rows={data?.rows??[]} columns={columns} rowId={row=>row.documentId} renderCell={renderCell}
  rowAction={row=>({label:"Mở chứng từ",accessibleLabel:`Mở chứng từ ${row.documentId}`,selected:selectedId===row.documentId})}
  onOpen={setSelected} schemaVersion="document-read-v1" scopeKey={scopeKey} compact={compact} label={title}/></div>}
 {!verified&&selectedId?<RequestLoading label="Đang xác minh chứng từ…"/>:!workspace?<EmptyState title="Chứng từ của bạn sẽ hiển thị tại đây" text="Đăng nhập ERP để xem chứng từ trong phạm vi được cấp quyền."><RequestButton onClick={onLogin}><LockKeyhole size={16}/>Đăng nhập ERP</RequestButton></EmptyState>:!allowed?<EmptyState title="Chưa được cấp quyền" text="Tài khoản ERP hiện tại không có quyền mở loại chứng từ này."/>:query.isPending&&!query.error?<RequestLoading label="Đang tải chứng từ"/>:data?.rows.length===0?<EmptyState title={applied||branch!=="all"?"Không có chứng từ phù hợp":"Chưa có chứng từ"} text={applied||branch!=="all"?"Thử điều chỉnh từ khóa hoặc chi nhánh.":"ERP chưa trả về chứng từ trong phạm vi của bạn."}/>:null}
 <RequestPagination label="Phân trang chứng từ" page={page} previousDisabled={page===1||query.isFetching||!allowed} nextDisabled={!data?.hasMore||query.isFetching||!allowed||page>=1000} onPrevious={()=>setPage(p=>p-1)} onNext={()=>setPage(p=>p+1)}><Freshness updatedAt={data?query.dataUpdatedAt:0} fetching={query.isFetching} stale={!!query.error}/></RequestPagination></TabsContent><TabsContent value="guide"><div className="screen-guide"><h3>{title}</h3><p>Tìm kiếm và chọn chi nhánh gửi yêu cầu tới ERP. Bảng chỉ tải tối đa 50 chứng từ mỗi trang. Các dòng được chọn luôn thuộc trang đang mở.</p><div className="guide-grid"><div><ShieldCheck/><strong>Phạm vi được cấp quyền</strong><p>ERP xác nhận quyền và chi nhánh trước mỗi yêu cầu.</p></div><div><RefreshCw/><strong>Dữ liệu cập nhật</strong><p>Tự kiểm tra mỗi {interval/1000} giây khi màn hình đang mở và khi bạn quay lại.</p></div><div><Rows3/><strong>Bố cục cá nhân</strong><p>Ẩn, sắp xếp, cố định cột, đổi độ rộng và lưu chế độ xem trong phiên hiện tại.</p></div></div><p className="subtle-note">Trên điện thoại, bấm thẻ chứng từ để xem thông tin và dòng hàng. Thao tác tạo, sửa, duyệt và xuất dữ liệu sẽ xuất hiện theo quyền và dịch vụ nghiệp vụ được ERP cung cấp.</p></div></TabsContent></Tabs></section>{renderDetail(selected,()=>setSelected(null),{documentId:selectedId,active:!!selected&&!!data,generation,scope})}</>;
}
