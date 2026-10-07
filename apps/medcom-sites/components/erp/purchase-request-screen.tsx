"use client";
import {RequestButton,RequestNotice,RequestEmpty,RequestLoading,RequestStatus,RequestError,requestDate,requestStyles} from "./request-presentation";
import {documentStatusLabel} from "@/lib/erp/document-status";
import {RequestListHeader,RequestSearch,RequestBranch,RequestListTable} from "./request-list-shell";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent} from "react";
import {MobileRequest,type MobileRequestAccess,type PurchaseRequestSnapshot} from "./mobile-request";
import {useNavigationGuard} from "./navigation-guard";
import {useRequestSelectionFocus} from "./request-selection-focus";
import {ApiError} from "@/lib/erp/api";
import {getPurchaseWorkspace,getPurchaseDocuments,postPurchaseCommand,type PurchaseWorkspace,type PurchasePage,type PurchaseReadback} from "@/lib/erp/purchase-request-api";
import {createPurchaseCommandAdapter,commandPurchaseSnapshot} from "@/lib/erp/purchase-request-command-adapter";
import {workspaceReadViewScope} from "@/lib/erp/navigation";
import type {WorkspaceData} from "@/lib/erp/contracts";

function sameReadAuthority(left:WorkspaceData|null|undefined,right:WorkspaceData|null|undefined){
 return !!left?.sessionScope&&!!left.readScope&&!!right?.sessionScope&&!!right.readScope
  &&workspaceReadViewScope(left)===workspaceReadViewScope(right);
}
type ReadState={key:string;refresh?:number;observation?:WorkspaceData|null;scopeKey?:string;bootstrap?:PurchaseWorkspace;list?:PurchasePage;detail?:PurchaseReadback;detailError?:unknown;error?:unknown;loading:boolean};
type RetainedEditor={scopeKey:string;raw:PurchaseReadback;snapshot:PurchaseRequestSnapshot;bridge:ReturnType<typeof createPurchaseCommandAdapter>;
 observation:WorkspaceData|null;revision:number;receiptId?:string;grant:PurchaseReadback["commandAccess"]};
type PurchaseRequestScreenProps={workspace:WorkspaceData|null;verifying?:boolean;loginBoundary:number;sessionEnded:boolean;onVerifyWorkspace:()=>Promise<void>;onDenied:(error:unknown)=>void;onLogin:()=>void};
export function PurchaseRequestScreen(props:PurchaseRequestScreenProps){
 // A completed login rotates this boundary even while the shell has no workspace.
 return <PurchaseRequestSession key={props.loginBoundary} {...props}/>;
}
function PurchaseRequestSession(props:PurchaseRequestScreenProps){
 const session=props.workspace?.session;
 const observedBoundary=session?JSON.stringify([session.tenantId,session.companyId,session.absoluteExpiresAt]):null;
 const [retainedBoundary,setRetainedBoundary]=useState<string|null>(observedBoundary),[checking,setChecking]=useState(false);
 // workspace=null after network/503 is loss of evidence, not logout. Keep the last
 // verified identity only as a component-lifetime key; it is never used as authority.
 // Guarded state adjustment is synchronous: React retries this component before
 // committing its children. A real boundary retires the reader without an effect
 // delay, while a null outage preserves the same reader and its unresolved intent.
 const currentBoundary=props.sessionEnded?null:observedBoundary??retainedBoundary;
 if(retainedBoundary!==currentBoundary)setRetainedBoundary(currentBoundary);
 const sessionUnverified=!props.workspace&&!props.sessionEnded&&currentBoundary!==null;
 const boundary=JSON.stringify([props.loginBoundary,currentBoundary,props.sessionEnded]);
 async function verifySession(){
  if(props.workspace||props.sessionEnded||checking)return;
  setChecking(true);try{await props.onVerifyWorkspace();}finally{setChecking(false);}
 }
 return <>
  {sessionUnverified&&<section aria-label="Xác minh lại phiên mua hàng" className={requestStyles.stack}>
   <p role="status">Chưa xác minh được phiên ERP. Dữ liệu tạm ẩn; yêu cầu đang xử lý vẫn được giữ để kiểm tra kết quả.</p>
   <RequestButton type="button" disabled={checking} onClick={()=>void verifySession()}>{checking?"Đang xác minh phiên…":"Xác minh lại phiên ERP"}</RequestButton>
  </section>}
  <PurchaseRequestReader key={boundary} {...props} boundary={boundary} sessionUnverified={sessionUnverified}/>
 </>;
}
function PurchaseRequestReader({workspace,boundary,sessionUnverified,onDenied,onLogin,verifying=false}:PurchaseRequestScreenProps&{boundary:string;sessionUnverified:boolean}){
 const [searchInput,setSearchInput]=useState(""),[search,setSearch]=useState(""),[branch,setBranch]=useState(""),[page,setPage]=useState(1),[selected,setSelected]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
 const [state,setState]=useState<ReadState>({key:"",loading:false}),[editor,setEditor]=useState<RetainedEditor|null>(null);
 const [knownScope,setKnownScope]=useState<string|null>(null);
 const [observedWorkspace,setObservedWorkspace]=useState(workspace),[verifiedWorkspace,setVerifiedWorkspace]=useState<WorkspaceData|null>(null);
 // An observation counter is not a rights change. A visible background check
 // can retain already authorized read-only rows while fresh document/grant reads
 // run. Loss of evidence, return from hidden, or a real scope change still masks.
 if(observedWorkspace!==workspace){
  setObservedWorkspace(workspace);
  setVerifiedWorkspace(verifiedWorkspace!==null&&sameReadAuthority(observedWorkspace,workspace)?workspace:null);
 }
 const generation=useRef(0),serverScope=useRef<string|null>(null),editorRef=useRef<RetainedEditor|null>(null),work=useRef({dirty:false,unresolved:false});
 const {request:guardNavigation}=useNavigationGuard();
 const retain=useCallback((value:RetainedEditor|null)=>{editorRef.current=value;setEditor(value);},[]);
 const onWorkStateChange=useCallback((value:{dirty:boolean;unresolved:boolean})=>{work.current=value;},[]);
 const onConfirmed=useCallback((snapshot:PurchaseRequestSnapshot,receiptId:string)=>{
  const current=editorRef.current;if(!current||current.raw.document.purchaseRequestId!==snapshot.documentId)return;
  retain({...current,raw:current.bridge.currentReadback(),snapshot,receiptId});
 },[retain]);
 useEffect(()=>()=>{editorRef.current?.bridge.retire();},[]);
 useLayoutEffect(()=>{generation.current++;},[workspace]);
 const allowed=!!workspace?.session.capabilities.includes("purchase-requests.read")&&!!workspace.branchIds.length;
 const safeBranch=workspace?.branchIds.includes(branch)?branch:"";
 const key=JSON.stringify([boundary,workspace?workspaceReadViewScope(workspace):null,workspace?.session.capabilities.slice().sort(),workspace?.branchIds.slice().sort(),search,safeBranch,page,selected]);
 useEffect(()=>{
  const current=++generation.current,controller=new AbortController();
  if(!allowed)return ()=>controller.abort();
  void (async()=>{
   const bootstrap=await getPurchaseWorkspace(controller.signal);
   if(controller.signal.aborted||current!==generation.current)return;
   const changedScope=serverScope.current!==null&&serverScope.current!==bootstrap.scopeKey;serverScope.current=bootstrap.scopeKey;setKnownScope(bootstrap.scopeKey);
   if(changedScope){editorRef.current?.bridge.retire();retain(null);work.current={dirty:false,unresolved:false};setSearchInput("");setSearch("");setBranch("");setPage(1);setSelected(null);setRefresh(value=>value+1);return;}
   const retained=editorRef.current;
   if(retained&&selected===retained.raw.document.purchaseRequestId&&!bootstrap.data.branchIds.includes(retained.raw.document.branchId)){
    // The fresh bootstrap is already definitive denial for this selected branch.
    // Mask now; preserve original command/receipt custody for the existing403
    // boundary and at most one parent recheck, never wait for a later detail GET.
    setVerifiedWorkspace(null);throw new ApiError(403,"purchase_branch_denied");
   }
   if(safeBranch&&!bootstrap.data.branchIds.includes(safeBranch)){setBranch("");setPage(1);if(!editorRef.current?.bridge.hasPending())setSelected(null);return;}
   const startingBridge=editorRef.current?.bridge,readEpoch=startingBridge?.readVersion();
   const result=await getPurchaseDocuments(bootstrap.scopeKey,bootstrap.data.branchIds,page,search,safeBranch,selected,controller.signal);
   if(controller.signal.aborted||current!==generation.current)return;
   const existing=editorRef.current;
   // A command dispatch/ACK can supersede an already-started GET. Its rows and
   // grants are not current proof; ignore them and obtain a new read, without
   // throwing away the legitimate receipt or replacing it with an error.
   if(result.detail&&existing&&startingBridge&&existing.bridge===startingBridge&&readEpoch!==existing.bridge.readVersion()){
    setRefresh(value=>value+1);return;
   }
   setState({key,refresh,observation:workspace,scopeKey:bootstrap.scopeKey,bootstrap:bootstrap.data,...result,loading:false});
   setVerifiedWorkspace(workspace);
   if(result.detail){
    if(existing&&existing.raw.document.purchaseRequestId===result.detail.document.purchaseRequestId){
     if(existing.bridge.hasPending()||work.current.dirty){retain({...existing,observation:workspace,grant:result.detail.commandAccess});return;}
     // A GET begun before dispatch/ACK cannot overwrite the confirmed receipt.
     existing.bridge.adoptReadback(result.detail,existing.bridge===startingBridge?readEpoch:undefined);
     retain({...existing,raw:result.detail,snapshot:commandPurchaseSnapshot(result.detail),observation:workspace,grant:result.detail.commandAccess,revision:existing.revision+1});
    }else if(!existing?.bridge.hasPending()){
     existing?.bridge.retire();const bridge=createPurchaseCommandAdapter(bootstrap.scopeKey,result.detail,postPurchaseCommand);
     retain({scopeKey:bootstrap.scopeKey,raw:result.detail,snapshot:commandPurchaseSnapshot(result.detail),bridge,observation:workspace,grant:result.detail.commandAccess,revision:(existing?.revision??0)+1});
    }
   }else if(existing&&!existing.bridge.hasPending()&&!existing.receiptId&&!work.current.dirty){existing.bridge.retire();retain(null);}
  })().catch(error=>{
   if(controller.signal.aborted||current!==generation.current)return;
   if(error instanceof ApiError&&error.status===401){
    // Current server evidence ends this session. Retire immediately so a late ACK
    // cannot land before the parent propagates sessionEnded and remounts us.
    editorRef.current?.bridge.retire();retain(null);work.current={dirty:false,unresolved:false};
    setSearchInput("");setSearch("");setBranch("");setPage(1);setSelected(null);setKnownScope(null);serverScope.current=null;setVerifiedWorkspace(null);
   }
   setState({key,refresh,observation:workspace,error,loading:false});onDenied(error);
  });
  return ()=>controller.abort();
 },[key,refresh,allowed,safeBranch,page,search,selected,onDenied,workspace,retain]);
 const active=allowed&&state.key===key&&(!!state.error||state.scopeKey===knownScope)&&(state.observation===workspace||verifiedWorkspace===workspace&&sameReadAuthority(state.observation,workspace))?state:null;
 const busy=!active||active.loading||active.observation!==workspace||active.refresh!==refresh;
 function move(action:()=>void){
  // The synchronous bridge check covers the interval before the editor's guard effect.
  if(editorRef.current?.bridge.hasPending()||work.current.unresolved){guardNavigation(()=>{});return;}
  guardNavigation(()=>{work.current={dirty:false,unresolved:false};action();});
 }
 function open(documentId:string){
  if(selected===documentId){
   // This is focus only, not navigation. Do not accept a discard for a no-op
   // selection: the mounted dirty editor must retain its registered guard.
   if(editorRef.current?.bridge.hasPending()||work.current.unresolved){guardNavigation(()=>{});return;}
   if(canRead&&!busy&&!verifying&&!freshRequired)focusOpen(documentId);
   return;
  }
  move(()=>{focusOpen(documentId);setSelected(documentId);});
 }
 function close(){move(()=>{focusClose();editorRef.current?.bridge.retire();retain(null);setSelected(null);});}
 function find(event:FormEvent){event.preventDefault();move(()=>{cancelFocus();setSearch(searchInput);setPage(1);setSelected(null);editorRef.current?.bridge.retire();retain(null);setRefresh(value=>value+1);});}
 const denied=active?.error instanceof ApiError&&[401,403,409].includes(active.error.status);
 const canRead=!!editor&&allowed&&verifiedWorkspace===workspace&&!denied&&!active?.error&&!active?.detailError&&editor.scopeKey===knownScope&&(editor.observation===workspace||sameReadAuthority(editor.observation,workspace))
  &&workspace?.branchIds.includes(editor.raw.document.branchId)===true&&selected===editor.raw.document.purchaseRequestId;
 const freshRequired=!!editor&&(editor.bridge.needsFreshRead()||busy||!!active?.error||!!active?.detailError||editor.observation!==workspace);
 // Only a committed, current read may finish an explicitly accepted Open/Close.
 // Read identity stays stable across harmless observations; revalidation still
 // cancels pending movement without discarding this list's return destination.
 const focusOwner=allowed&&verifiedWorkspace===workspace&&!denied&&workspace
  ?JSON.stringify([boundary,workspaceReadViewScope(workspace),workspace.session.capabilities.slice().sort(),workspace.branchIds.slice().sort(),knownScope]):null;
 const {open:focusOpen,close:focusClose,cancel:cancelFocus,row:registerFocusRow,detail:registerFocusDetail,list:registerFocusList}=useRequestSelectionFocus({owner:focusOwner,selected,listKey:JSON.stringify([search,safeBranch,page]),
  openReady:canRead&&!busy&&!verifying&&!freshRequired&&active?.observation===workspace&&active?.detail?.document.purchaseRequestId===selected,
  openFailed:!allowed||!!active?.error||!!active?.detailError,
  listReady:!!active?.list&&!busy&&!verifying&&verifiedWorkspace===workspace&&!active?.error,
  listFailed:!allowed||!!active?.error});
 useLayoutEffect(()=>{cancelFocus();},[cancelFocus,workspace,verifying,refresh]);
 // A newly confirmed receipt cancels movement; clearing an old editor during an
 // accepted Open/Close must not cancel that new navigation's focus ticket.
 useLayoutEffect(()=>{if(editor?.receiptId)cancelFocus();},[cancelFocus,editor?.receiptId]);
 const grant=editor?.grant,draft=editor?.raw.document.statusId===1&&editor.raw.document.isLocked!==true;
 const access:MobileRequestAccess={scopeKey:editor?.scopeKey??null,canRead,canEdit:canRead&&draft&&grant?.canSave===true&&!freshRequired,
  canSaveDraft:draft&&grant?.canSave===true,canSubmit:draft&&grant?.canSubmit===true,canReconcile:grant?.canLookup===true,
  existingOnly:true,canAddLines:false,requiresFreshRead:freshRequired,
  // Keep data visible during a same-scope background refresh, but never expose
  // actions while the latest document command grants are still unverified.
  available:true,verifying:verifying||busy||!!active?.error||!!active?.detailError||editor?.observation!==workspace,
  authorityKey:JSON.stringify([workspace?workspaceReadViewScope(workspace):null,workspace?.session.capabilities.slice().sort(),workspace?.branchIds.slice().sort(),grant]),
  branches:[],currencies:[],purposes:[],maxNotesLength:65536,maxPurposeLength:65536,maxLines:500,itemLookupId:"items",objectLookupId:"objects"};
 return <section aria-label="Danh sách đề nghị mua hàng" className={requestStyles.stack}>
  {!workspace?sessionUnverified?<RequestNotice>Đang xác minh phiên ERP để mở lại danh sách và phiếu đã chọn.</RequestNotice>:<RequestEmpty title="Danh sách đề nghị mua hàng"><span className="mb-4 block">Đăng nhập ERP để đọc đề nghị mua hàng.</span><RequestButton onClick={onLogin}>Đăng nhập ERP</RequestButton></RequestEmpty>:!allowed?<RequestNotice>Bạn không có quyền đọc đề nghị mua hàng trong phạm vi hiện tại.</RequestNotice>:verifiedWorkspace!==workspace?<section aria-label="Đang xác minh phạm vi mua hàng">
   {active?.error?<RequestError error={active.error}/>:<RequestLoading label="Đang xác minh phạm vi và quyền ERP…"/>}
   {!!active?.error&&<RequestButton type="button" onClick={()=>{cancelFocus();setRefresh(value=>value+1);}}>Xác minh lại phạm vi ERP</RequestButton>}
  </section>:<div className={requestStyles.panel}>
   <RequestListHeader title="Danh sách đề nghị" listRef={registerFocusList}><div className="request-list-qualification"><span id="purchase-write-qualification">Chỉ mở các phiếu hiện có.</span><RequestButton disabled className="request-unavailable" aria-describedby="purchase-write-qualification">Tạo đề nghị</RequestButton></div></RequestListHeader>
   <form onSubmit={find} className="request-list-toolbar">
    <RequestSearch label="Tìm mã đề nghị" placeholder="Tìm mã đề nghị…" value={searchInput} onChange={setSearchInput}/>
    <RequestBranch label="Chi nhánh" value={safeBranch} disabled={busy} branches={active?.bootstrap?.branchIds??[]} onChange={id=>move(()=>{cancelFocus();setBranch(id);setPage(1);setSelected(null);editorRef.current?.bridge.retire();retain(null);})}/>
    <RequestButton type="submit" variant="secondary" disabled={busy}>Tìm kiếm</RequestButton>
    <RequestButton className="request-list-refresh" type="button" disabled={busy} onClick={()=>move(()=>{cancelFocus();setRefresh(value=>value+1);})}>Làm mới</RequestButton>
   </form>
   {busy&&!active?.list?<RequestLoading label="Đang đọc ERP…"/>:active?.error?<RequestError error={active.error}/>:<>
    <RequestListTable label="Danh sách đề nghị" columns={[{id:"id",label:"Mã đề nghị"},{id:"date",label:"Ngày đề nghị"},{id:"branch",label:"Chi nhánh"},{id:"person",label:"Người đề nghị"},{id:"department",label:"Phòng ban"},{id:"status",label:"Trạng thái"}]} rows={(active?.list?.rows??[]).map(row=>({id:row.documentId,cells:[row.documentId,requestDate(row.purchaseDate),row.branchId,row.personSuggest||"Chưa có thông tin",row.department||"Chưa có thông tin",<RequestStatus key="status" value={row.statusId} statusName={row.statusName}/>],action:"Mở đề nghị",actionLabel:`Mở đề nghị ${row.documentId}`,selected:selected===row.documentId,onOpen:()=>open(row.documentId),buttonRef:element=>registerFocusRow(row.documentId,element)}))}/>
    {active?.list?.rows.length===0&&<RequestEmpty title="Không có đề nghị phù hợp">Thử điều chỉnh mã đề nghị hoặc chi nhánh.</RequestEmpty>}
    <nav aria-label="Phân trang đề nghị" className={requestStyles.footer}><RequestButton disabled={page===1} onClick={()=>move(()=>{cancelFocus();setPage(value=>value-1);setSelected(null);editorRef.current?.bridge.retire();retain(null);})}>Trang trước</RequestButton><span>Trang {page}</span><RequestButton disabled={!active?.list?.hasMore||page>=1000} onClick={()=>move(()=>{cancelFocus();setPage(value=>value+1);setSelected(null);editorRef.current?.bridge.retire();retain(null);})}>Trang sau</RequestButton></nav>
   </>}
   {selected&&<div className={requestStyles.footer}><h3 className={`${requestStyles.title} min-w-0 max-w-full [overflow-wrap:anywhere]`}>{selected}</h3><RequestButton onClick={close}>Đóng đề nghị</RequestButton></div>}
   {!!active?.detailError&&<RequestError error={active.detailError}/>}
  </div>}
  {/* Outside the busy/error/selection fragment. Never key by token or discard an unknown intent. */}
  {editor&&<section ref={registerFocusDetail} aria-label="Phiếu mua hàng hiện có" tabIndex={-1} className="scroll-mt-24 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" hidden={!canRead}><div className={requestStyles.stack}>
   <MobileRequest statusPresentation={{documentId:editor.raw.document.purchaseRequestId,id:editor.raw.document.statusId,name:editor.raw.statusName}} initial={editor.snapshot} access={access} adapter={editor.bridge.adapter} readRevision={editor.revision} onConfirmed={onConfirmed} onWorkStateChange={onWorkStateChange}/>
   {canRead&&<>{editor.receiptId&&<p role="status">ERP đã xác nhận yêu cầu {editor.receiptId}. Receipt vẫn được giữ khi đọc lại thất bại.</p>}
    <FullPurchaseReadback readback={editor.raw}/></>}
  </div></section>}
 </section>;
}

function value(value:string|number|boolean|null){return value===null?"NULL":typeof value==="boolean"?String(value):value===""?"\"\"":String(value);}
const lineLabels=["Mã dòng","Mã mặt hàng","Ngân sách","Thời gian yêu cầu","Số lượng","Đơn giá","Thành tiền","Model"];
function FullPurchaseReadback({readback}:{readback:PurchaseReadback}){
 const document=readback.document;
 const labels:Record<string,string>={purchaseRequestId:"Mã đề nghị",branchId:"Chi nhánh",statusId:"Mã trạng thái ERP",statusName:"Trạng thái",isLocked:"Khóa phiếu",purchaseDate:"Ngày giờ đề nghị trên ERP",purposeId:"Mã mục đích",personSuggest:"Người đề nghị",department:"Phòng ban",purposeDescOrClient:"Diễn giải mục đích / khách hàng",price:"Giá trị đề nghị",notes:"Ghi chú",currencyId:"Tiền tệ",objectId:"Mã đối tượng",rateExchange:"Tỷ giá"};
 return <section aria-label="Dữ liệu ERP đầy đủ"><details className={`${requestStyles.section} request-full-readback`}><summary className={requestStyles.title}>Toàn bộ thông tin trên ERP <span>{document.lines.length} dòng hàng</span></summary><div className="request-full-readback-content">
  <dl className={requestStyles.values}>{Object.entries({purchaseRequestId:document.purchaseRequestId,branchId:document.branchId,statusId:document.statusId,statusName:documentStatusLabel(document.statusId,readback.statusName),isLocked:document.isLocked,...document.header}).map(([field,data])=><div key={field}><dt>{labels[field]}</dt><dd style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{value(data)}</dd></div>)}</dl>
  <p>{document.lines.length} dòng hàng</p>
  <div className="min-w-0 md:overflow-x-auto"><table role="table" aria-label="Toàn bộ dòng đề nghị" className="block w-full text-sm md:table"><thead role="rowgroup" className="sr-only md:not-sr-only md:table-header-group"><tr role="row">{lineLabels.map(field=><th role="columnheader" key={field} scope="col" className="border-b border-border bg-muted/40 p-3 text-left font-medium text-muted-foreground">{field}</th>)}</tr></thead>
   <tbody role="rowgroup" className="grid gap-3 md:table-row-group">{document.lines.map(line=><tr role="row" key={line.lineId} className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 md:table-row md:border-0 md:p-0">{[line.lineId,line.values.itemId,line.values.budget,line.values.timeRequired,line.values.quantity,line.values.unitPrice,line.values.totalPrice,line.values.model].map((data,index)=><td role="cell" key={index} className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] md:border-b md:border-border md:p-3"><span aria-hidden="true" className="mb-1 block text-xs text-muted-foreground md:hidden">{lineLabels[index]}</span><span>{value(data)}</span></td>)}</tr>)}</tbody>
  </table></div>
 </div></details></section>;
}
