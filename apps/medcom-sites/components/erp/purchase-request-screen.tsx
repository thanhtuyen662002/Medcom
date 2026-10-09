"use client";
import {RecordLinesTable} from "./record-lines-table";
import {purchaseItemDisplayBinding} from "@/lib/erp/item-display";
import {RequestButton,RequestNotice,RequestEmpty,RequestLoading,RequestStatus,RequestError,requestDate,requestStyles} from "./request-presentation";
import {RecordDetailToolbar,RecordSection} from "./record-dialog";
import {RequestDetailDialog,useRequestDetailNavigation,useDetailPresentationProof,type RegisterRequestDetailNavigation} from "./request-detail-dialog";
import {documentStatusLabel} from "@/lib/erp/document-status";
import {useListControls} from "./list-view-state";
import {PurchaseReferenceDetails} from "./purchase-reference-details";
import {purchaseReferenceIdentity,type PurchaseReferenceContext} from "@/lib/erp/purchase-reference-context";
import {RequestListComposition,RequestListPanel,RequestListContent,RequestListHeader,RequestSearch,RequestBranch,RequestRefresh,RequestListTable,RequestListToolbar,RequestPagination} from "./request-list-shell";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent} from "react";
import {MobileRequest,type MobileRequestAccess,type PurchaseRequestSnapshot} from "./mobile-request";
import {useNavigationGuard,type NavigationGuardValidationPhase} from "./navigation-guard";
import {useRequestSelectionFocus} from "./request-selection-focus";
import {ApiError} from "@/lib/erp/api";
import {getPurchaseWorkspace,getPurchaseList,getPurchaseDetail,postPurchaseCommand,type PurchaseWorkspace,type PurchasePage,type PurchaseReadback} from "@/lib/erp/purchase-request-api";
import {createPurchaseCommandAdapter,commandPurchaseSnapshot} from "@/lib/erp/purchase-request-command-adapter";
import {workspaceReadViewScope} from "@/lib/erp/navigation";
import type {WorkspaceData} from "@/lib/erp/contracts";

function sameReadAuthority(left:WorkspaceData|null|undefined,right:WorkspaceData|null|undefined){
 return !!left?.sessionScope&&!!left.readScope&&!!right?.sessionScope&&!!right.readScope
  &&workspaceReadViewScope(left)===workspaceReadViewScope(right);
}
type ReadState={key:string;refresh?:number;observation?:WorkspaceData|null;scopeKey?:string;bootstrap?:PurchaseWorkspace;list?:PurchasePage;error?:unknown;loading:boolean};
type ReadAuthority={key:string;refresh:number;observation:WorkspaceData|null;scopeKey:string;bootstrap:PurchaseWorkspace;generation:number;observationVersion:number};
type Selection={id:string|null;version:number};
type DetailState={authority:ReadAuthority;selection:Selection;detail?:PurchaseReadback;error?:unknown;refresh:number};
type RetainedEditor={scopeKey:string;raw:PurchaseReadback;snapshot:PurchaseRequestSnapshot;bridge:ReturnType<typeof createPurchaseCommandAdapter>;
 observation:WorkspaceData|null;revision:number;receiptId?:string;grant:PurchaseReadback["commandAccess"]};
export type PurchaseRequestScreenProps={compact?:boolean;setCompact?:(value:boolean)=>void;presentationAllowed?:boolean;registerDetailNavigation?:RegisterRequestDetailNavigation;workspace:WorkspaceData|null;verifying?:boolean;loginBoundary:number;sessionEnded:boolean;onVerifyWorkspace:()=>Promise<void>;onDenied:(error:unknown)=>void;onLogin:()=>void};
export function PurchaseRequestScreen(props:PurchaseRequestScreenProps){
 // A completed login rotates this boundary even while the shell has no workspace.
 return <PurchaseRequestSession key={props.loginBoundary} {...props}/>;
}
function PurchaseRequestSession(props:PurchaseRequestScreenProps){
 const session=props.workspace?.session;
 const observedBoundary=session?JSON.stringify([session.tenantId,session.companyId,props.workspace?.sessionScope??null]):null;
 const [retainedBoundary,setRetainedBoundary]=useState<string|null>(observedBoundary),[checking,setChecking]=useState(false);
 // The server session correlation and root login incarnation own lifetime.
 // Expiry deadlines (including equivalent offset spelling) are observations;
 // Workspace continues to enforce its existing expiry timer.
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
function PurchaseRequestReader({workspace,boundary,sessionUnverified,sessionEnded,onDenied,onLogin,verifying=false,presentationAllowed=true,registerDetailNavigation,compact=false,setCompact}:PurchaseRequestScreenProps&{boundary:string;sessionUnverified:boolean}){
 const {value:controlValue,field:controlField,set:setControls,qualifyPurchase,attachRoot,captureScroll,restoreScroll,setActive}=useListControls("purchase-requests");
 const {draftSearch:searchInput,appliedSearch:search,appliedBranch:branch,page}=controlValue;
 const setSearchInput=controlField("draftSearch"),setSearch=controlField("appliedSearch"),setBranch=useCallback((next:string)=>setControls(previous=>({...previous,draftBranch:next,appliedBranch:next})),[setControls]),setPage=controlField("page");
 const [refresh,setRefresh]=useState(0);
 const [selection,setSelection]=useState<Selection>({id:null,version:0}),selected=selection.id;
 const selectionRef=useRef(selection);
 const setSelected=useCallback((id:string|null)=>{
  const current=selectionRef.current;if(current.id===id)return;
  const next={id,version:current.version+1};selectionRef.current=next;setSelection(next);
 },[]);
 const [readAuthority,setReadAuthority]=useState<ReadAuthority|null>(null),[detailState,setDetailState]=useState<DetailState|null>(null),[detailRefresh,setDetailRefresh]=useState(0);
 const [verifiedDetailWorkspace,setVerifiedDetailWorkspace]=useState<WorkspaceData|null>(null);
 const [state,setState]=useState<ReadState>({key:"",loading:false}),[editor,setEditor]=useState<RetainedEditor|null>(null);
 const [knownScope,setKnownScope]=useState<string|null>(null);
 const [observedWorkspace,setObservedWorkspace]=useState(workspace),[verifiedWorkspace,setVerifiedWorkspace]=useState<WorkspaceData|null>(null);
 const [observationVersion,setObservationVersion]=useState(0);
 // An observation counter is not a rights change. A visible background check
 // can retain already authorized read-only rows while fresh document/grant reads
 // run. Loss of evidence, return from hidden, or a real scope change still masks.
 if(observedWorkspace!==workspace){
  setObservedWorkspace(workspace);setObservationVersion(value=>value+1);
  setVerifiedWorkspace(verifiedWorkspace!==null&&sameReadAuthority(observedWorkspace,workspace)?workspace:null);
  setVerifiedDetailWorkspace(verifiedDetailWorkspace!==null&&sameReadAuthority(observedWorkspace,workspace)?workspace:null);
 }
 const generation=useRef(0),detailGeneration=useRef(0),serverScope=useRef<string|null>(null),editorRef=useRef<RetainedEditor|null>(null),work=useRef({dirty:false,unresolved:false});
 const {request:guardNavigation}=useNavigationGuard();
 const openAuthority=useRef<{scope:string;rows:ReadonlySet<string>}|null>(null);
 useLayoutEffect(()=>()=>{openAuthority.current=null;},[]);
 const retain=useCallback((value:RetainedEditor|null)=>{editorRef.current=value;setEditor(value);},[]);
 const onWorkStateChange=useCallback((value:{dirty:boolean;unresolved:boolean})=>{work.current=value;},[]);
 const onConfirmed=useCallback((snapshot:PurchaseRequestSnapshot,receiptId:string)=>{
  const current=editorRef.current;if(!current||current.raw.document.purchaseRequestId!==snapshot.documentId)return;
  retain({...current,raw:current.bridge.currentReadback(),snapshot,receiptId});
 },[retain]);
 useEffect(()=>()=>{editorRef.current?.bridge.retire();},[]);
 const allowed=!!workspace?.session.capabilities.includes("purchase-requests.read")&&!!workspace.branchIds.length;
 const safeBranch=workspace?.branchIds.includes(branch)?branch:"";
 // Selection is deliberately absent: Open/Close cannot invalidate a verified list.
 const criteriaKey=JSON.stringify([boundary,workspace?workspaceReadViewScope(workspace):null,workspace?.session.capabilities.slice().sort(),workspace?.branchIds.slice().sort(),search,safeBranch,page]);
 const [criteria,setCriteria]=useState({key:criteriaKey,version:0});
 if(criteria.key!==criteriaKey)setCriteria({key:criteriaKey,version:criteria.version+1});
 const key=JSON.stringify([criteriaKey,criteria.version]);
 useLayoutEffect(()=>{generation.current++;},[workspace,key,refresh]);
 const failRead=useCallback((error:unknown)=>{
  // A current authority failure wins over either concurrently completing read.
  generation.current++;detailGeneration.current++;setReadAuthority(null);
  if(error instanceof ApiError&&error.status===401){
   editorRef.current?.bridge.retire();retain(null);work.current={dirty:false,unresolved:false};
   setSearchInput("");setSearch("");setBranch("");setPage(1);setSelected(null);setKnownScope(null);serverScope.current=null;setVerifiedWorkspace(null);setVerifiedDetailWorkspace(null);
  }
  setState({key,refresh,observation:workspace,error,loading:false});onDenied(error);
 },[key,refresh,workspace,onDenied,retain,setSelected,setSearchInput,setSearch,setBranch,setPage]);
 useEffect(()=>{
  const current=++generation.current,controller=new AbortController();
  if(!allowed)return ()=>controller.abort();
  void (async()=>{
   const bootstrap=await getPurchaseWorkspace(controller.signal);
   if(controller.signal.aborted||current!==generation.current)return;
   const changedScope=serverScope.current!==null&&serverScope.current!==bootstrap.scopeKey;serverScope.current=bootstrap.scopeKey;setKnownScope(bootstrap.scopeKey);
   if(changedScope){editorRef.current?.bridge.retire();retain(null);work.current={dirty:false,unresolved:false};setReadAuthority(null);setVerifiedDetailWorkspace(null);setSearchInput("");setSearch("");setBranch("");setPage(1);setSelected(null);setRefresh(value=>value+1);return;}
   if(qualifyPurchase(bootstrap.scopeKey,bootstrap.data.branchIds))return;
   const retained=editorRef.current;
   if(retained&&selectionRef.current.id===retained.raw.document.purchaseRequestId&&!bootstrap.data.branchIds.includes(retained.raw.document.branchId)){
    // Definitive current branch denial masks both reads, preserving command custody.
    setVerifiedWorkspace(null);setVerifiedDetailWorkspace(null);throw new ApiError(403,"purchase_branch_denied");
   }
   if(safeBranch&&!bootstrap.data.branchIds.includes(safeBranch)){setBranch("");setPage(1);if(!editorRef.current?.bridge.hasPending())setSelected(null);return;}
   const authority={key,refresh,observation:workspace,scopeKey:bootstrap.scopeKey,bootstrap:bootstrap.data,generation:current,observationVersion};
   // Publish the read binding before awaiting the list so an explicit refresh
   // still starts list and selected detail together after the fresh bootstrap.
   setReadAuthority(authority);
   const list=await getPurchaseList(bootstrap.scopeKey,page,search,safeBranch,controller.signal);
   if(controller.signal.aborted||current!==generation.current)return;
   if(list.rows.some(row=>!bootstrap.data.branchIds.includes(row.branchId)))throw new ApiError(502,"invalid_api_response");
   setState({...authority,list,loading:false});setVerifiedWorkspace(workspace);
  })().catch(error=>{
   if(controller.signal.aborted||current!==generation.current)return;
   failRead(error);
  });
  return ()=>controller.abort();
 },[key,refresh,allowed,safeBranch,page,search,workspace,observationVersion,retain,failRead,setSelected,qualifyPurchase,setSearchInput,setSearch,setBranch,setPage]);
 const active=allowed&&state.key===key&&(!!state.error||state.scopeKey===knownScope)&&(state.observation===workspace||verifiedWorkspace===workspace&&sameReadAuthority(state.observation,workspace))?state:null;
 const busy=!active||active.loading||active.observation!==workspace||active.refresh!==refresh;
 const currentAuthority=allowed&&readAuthority?.key===key&&readAuthority.refresh===refresh&&readAuthority.observation===workspace&&readAuthority.observationVersion===observationVersion&&readAuthority.scopeKey===knownScope?readAuthority:null;
 // A -> B -> A has distinct Selection objects. Fence before passive cleanup so
 // an abort-ignoring reply from the first A can never become the later A's proof.
 useLayoutEffect(()=>{detailGeneration.current++;},[currentAuthority,selection,detailRefresh]);
 useEffect(()=>{
  const current=++detailGeneration.current,controller=new AbortController(),authority=currentAuthority;
  if(!authority||!selection.id)return ()=>controller.abort();
  const startingBridge=editorRef.current?.bridge,readEpoch=startingBridge?.readVersion();
  const isCurrent=()=>!controller.signal.aborted&&current===detailGeneration.current&&authority.generation===generation.current;
  void getPurchaseDetail(authority.scopeKey,selection.id,controller.signal).then(detail=>{
   if(!isCurrent())return;
   if(!authority.bootstrap.branchIds.includes(detail.document.branchId))throw new ApiError(502,"invalid_api_response");
   const existing=editorRef.current;
   // A dispatch/ACK supersedes its older GET, never the frozen original intent.
   if(existing&&startingBridge&&existing.bridge===startingBridge&&readEpoch!==existing.bridge.readVersion()){
    setDetailRefresh(value=>value+1);return;
   }
   setDetailState({authority,selection,detail,refresh:detailRefresh});setVerifiedDetailWorkspace(authority.observation);
   if(existing&&existing.raw.document.purchaseRequestId===detail.document.purchaseRequestId){
    if(existing.bridge.hasPending()||work.current.dirty){retain({...existing,observation:authority.observation,grant:detail.commandAccess});return;}
    existing.bridge.adoptReadback(detail,existing.bridge===startingBridge?readEpoch:undefined);
    retain({...existing,raw:detail,snapshot:commandPurchaseSnapshot(detail),observation:authority.observation,grant:detail.commandAccess,revision:existing.revision+1});
   }else if(!existing?.bridge.hasPending()){
    existing?.bridge.retire();const bridge=createPurchaseCommandAdapter(authority.scopeKey,detail,postPurchaseCommand);
    retain({scopeKey:authority.scopeKey,raw:detail,snapshot:commandPurchaseSnapshot(detail),bridge,observation:authority.observation,grant:detail.commandAccess,revision:(existing?.revision??0)+1});
   }
  }).catch(error=>{
   if(!isCurrent())return;
   if(error instanceof ApiError&&([401,403,409].includes(error.status)||error.code==="invalid_api_response")){failRead(error);return;}
   // A missing/unavailable detail cannot erase its independently verified list.
   setDetailState({authority,selection,error,refresh:detailRefresh});
  });
  return ()=>controller.abort();
 },[currentAuthority,selection,detailRefresh,failRead,retain]);
 const activeDetail=allowed&&detailState?.selection===selection&&detailState.authority.key===key&&detailState.authority.scopeKey===knownScope
  &&(detailState.authority.observation===workspace||verifiedDetailWorkspace===workspace&&sameReadAuthority(detailState.authority.observation,workspace))?detailState:null;
 const presentationReady=useDetailPresentationProof(presentationAllowed,activeDetail?.detail?activeDetail:null,()=>setDetailRefresh(value=>value+1));
 const detailBusy=!!selected&&(!activeDetail||activeDetail.authority!==currentAuthority||activeDetail.refresh!==detailRefresh);
 useLayoutEffect(()=>{
  openAuthority.current=presentationAllowed&&allowed&&workspace&&verifiedWorkspace===workspace&&!busy&&!verifying&&!active?.error&&active?.list
   ?{scope:JSON.stringify([boundary,workspaceReadViewScope(workspace),knownScope]),rows:new Set(active.list.rows.map(row=>row.documentId))}:null;
 });
 function move(action:()=>void,admit:()=>boolean=()=>true){
  // The same live predicate runs before the root discards blockers and again
  // at acceptance. An obsolete target never consumes the editor's own guard.
  const eligible=(phase:NavigationGuardValidationPhase="accept")=>admit()
   &&(phase==="request"||!editorRef.current?.bridge.hasPending()&&!work.current.unresolved);
  guardNavigation(()=>{
   if(!eligible())return;
   work.current={dirty:false,unresolved:false};action();
  },eligible);
 }
 function open(documentId:string){
  const queuedAuthority=openAuthority.current;
  if(!queuedAuthority?.rows.has(documentId))return;
  if(selectionRef.current.id===documentId){
   // This is focus only, not navigation. Do not accept a discard for a no-op
   // selection: the mounted dirty editor must retain its registered guard.
   if(editorRef.current?.bridge.hasPending()||work.current.unresolved){move(()=>{});return;}
   if(canRead&&!busy&&!verifying&&!freshRequired)focusOpen(documentId);
   return;
  }
  move(()=>{focusOpen(documentId);setSelected(documentId);},()=>{
   const current=openAuthority.current;
   return current!==null&&current.scope===queuedAuthority.scope&&current.rows.has(documentId);
  });
 }
 function close(){if(selectionRef.current.id===null)return;move(()=>{if(selectionRef.current.id===null)return;focusClose();editorRef.current?.bridge.retire();retain(null);setSelected(null);});}
 useRequestDetailNavigation(registerDetailNavigation,{selectedId:selected,getSelectedId:()=>selectionRef.current.id,requestOpen:open,requestClose:close});
 function find(event:FormEvent){event.preventDefault();move(()=>{cancelFocus();setSearch(searchInput);setPage(1);setSelected(null);editorRef.current?.bridge.retire();retain(null);setRefresh(value=>value+1);});}
 const denied=active?.error instanceof ApiError&&[401,403,409].includes(active.error.status);
 const canRead=!!editor&&allowed&&verifiedWorkspace===workspace&&verifiedDetailWorkspace===workspace&&!!activeDetail&&!denied&&!active?.error&&!activeDetail.error&&editor.scopeKey===knownScope&&(editor.observation===workspace||sameReadAuthority(editor.observation,workspace))
  &&workspace?.branchIds.includes(editor.raw.document.branchId)===true&&selected===editor.raw.document.purchaseRequestId;
 const freshRequired=!!editor&&(editor.bridge.needsFreshRead()||busy||detailBusy||!!active?.error||!!activeDetail?.error||editor.observation!==workspace);
 // Only a committed, current read may finish an explicitly accepted Open/Close.
 // Read identity stays stable across harmless observations; revalidation still
 // cancels pending movement without discarding this list's return destination.
 const focusOwner=allowed&&verifiedWorkspace===workspace&&!denied&&workspace
  ?JSON.stringify([boundary,workspaceReadViewScope(workspace),workspace.session.capabilities.slice().sort(),workspace.branchIds.slice().sort(),knownScope]):null;
 const {open:focusOpen,close:focusClose,cancel:cancelFocus,row:registerFocusRow,detail:registerFocusDetail,list:registerFocusList}=useRequestSelectionFocus({owner:focusOwner,selected,listKey:JSON.stringify([search,safeBranch,page]),
  openReady:canRead&&!busy&&!verifying&&!freshRequired&&activeDetail?.authority===currentAuthority&&activeDetail?.detail?.document.purchaseRequestId===selected,
  openFailed:!allowed||!!active?.error||!!activeDetail?.error,
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
  available:true,verifying:verifying||busy||detailBusy||!!active?.error||!!activeDetail?.error||editor?.observation!==workspace,
  authorityKey:JSON.stringify([workspace?workspaceReadViewScope(workspace):null,workspace?.session.capabilities.slice().sort(),workspace?.branchIds.slice().sort(),grant]),
  branches:[],currencies:[],purposes:[],maxNotesLength:65536,maxPurposeLength:65536,maxLines:500,itemLookupId:"items",objectLookupId:"objects"};
 const qrScopeKey=workspace&&!sessionEnded&&allowed&&knownScope
  ?JSON.stringify([boundary,workspaceReadViewScope(workspace),knownScope]):null;
 const referenceInput={scopeKey:currentAuthority?.scopeKey??null,
  readIdentity:JSON.stringify([boundary,selection.version,currentAuthority?.generation,editor?.revision]),
  authorityKey:access.authorityKey??null,documentId:editor?.raw.document.purchaseRequestId??null,
  allowed:canRead&&!sessionEnded&&!verifying&&!busy&&!detailBusy&&!!currentAuthority&&activeDetail?.authority===currentAuthority,
  presentationAllowed:presentationAllowed&&presentationReady&&selected!==null,
  purposeId:editor?.raw.document.header.purposeId??null,currencyId:editor?.raw.document.header.currencyId??""};
 const referenceAuthority=useRef<{identity:string;denialScope:string;allowed:boolean;onDenied:(error:unknown)=>void}|null>(null);
 const referenceDenials=useRef<{scope:string;failures:Set<string>}|null>(null);
 useLayoutEffect(()=>{
  referenceAuthority.current={identity:purchaseReferenceIdentity(referenceInput),
   denialScope:JSON.stringify([boundary,qrScopeKey,referenceInput.authorityKey]),
   allowed:referenceInput.allowed&&referenceInput.presentationAllowed,onDenied};
 });
 useLayoutEffect(()=>()=>{referenceAuthority.current=null;},[]);
 const onReferenceContext=useCallback((context:PurchaseReferenceContext)=>{
  const current=referenceAuthority.current;
  if(!current?.allowed||context.identity!==current.identity)return;
  // Catalog failures never erase readback or enter command custody. Only a
  // current auth/scope denial reaches root, once per effective authority, so
  // root re-verification cannot form an automatic lookup/reverify loop.
  if(referenceDenials.current?.scope!==current.denialScope)referenceDenials.current={scope:current.denialScope,failures:new Set()};
  const failure=["authentication","scope","authority"].find(candidate=>!referenceDenials.current!.failures.has(candidate)
   &&[context.purpose,context.currency].some(value=>value.status==="failed"&&value.failure===candidate));
  if(!failure)return;
  referenceDenials.current.failures.add(failure);
  const status=failure==="authentication"?401:failure==="authority"?403:409;
  current.onDenied(new ApiError(status,status===409?"read_scope_changed":status===401?"authentication_required":"purchase_reference_denied"));
 },[]);
 useLayoutEffect(()=>{setActive(presentationAllowed&&allowed&&verifiedWorkspace===workspace&&!verifying);restoreScroll(presentationAllowed&&verifiedWorkspace===workspace&&!busy&&!!active?.list);});
 return <section ref={attachRoot} onScrollCapture={event=>{if(event.target instanceof HTMLElement)captureScroll(event.target);}} hidden={!presentationAllowed} inert={!presentationAllowed} aria-label="Danh sách đề nghị mua hàng" className={requestStyles.stack}>
  {!workspace?sessionUnverified?<RequestLoading label="Đang xác minh phiên ERP để mở lại danh sách và phiếu đã chọn."/>:<RequestEmpty title="Danh sách đề nghị mua hàng"><span className="mb-4 block">Đăng nhập ERP để đọc đề nghị mua hàng.</span><RequestButton onClick={onLogin}>Đăng nhập ERP</RequestButton></RequestEmpty>:!allowed?<RequestNotice>Bạn không có quyền đọc đề nghị mua hàng trong phạm vi hiện tại.</RequestNotice>:verifiedWorkspace!==workspace?<section aria-label="Đang xác minh phạm vi mua hàng">
   {active?.error?<RequestError error={active.error}/>:<RequestLoading label="Đang xác minh phạm vi và quyền ERP…"/>}
   {!!active?.error&&<RequestButton type="button" onClick={()=>{cancelFocus();setRefresh(value=>value+1);}}>Xác minh lại phạm vi ERP</RequestButton>}
  </section>:<RequestListComposition><RequestListPanel>
   <RequestListHeader title="Danh sách đề nghị" listRef={registerFocusList}><div className="request-list-qualification"><span id="purchase-write-qualification">Chỉ mở các phiếu hiện có.</span><RequestButton disabled className="request-unavailable" aria-describedby="purchase-write-qualification">Tạo đề nghị</RequestButton></div></RequestListHeader>
   <RequestListToolbar onSubmit={find}>
    <RequestSearch label="Tìm mã đề nghị" placeholder="Tìm mã đề nghị…" value={searchInput} onChange={setSearchInput}/>
    <RequestBranch label="Chi nhánh" value={safeBranch} disabled={busy} branches={active?.bootstrap?.branchIds??[]} onChange={id=>move(()=>{cancelFocus();setBranch(id);setPage(1);setSelected(null);editorRef.current?.bridge.retire();retain(null);})}/>
    <RequestRefresh disabled={busy} onClick={()=>move(()=>{cancelFocus();setRefresh(value=>value+1);})}/>
   </RequestListToolbar>
   <RequestListContent>{busy&&!active?.list?<RequestLoading label="Đang đọc ERP…"/>:active?.error?<RequestError error={active.error}/>:<>
    <RequestListTable customizationScopeKey={allowed&&verifiedWorkspace===workspace&&knownScope&&active?.list&&!active.error?key+":"+knownScope:null} compact={compact} setCompact={setCompact} presentationAllowed={presentationAllowed&&allowed&&!busy&&!verifying&&verifiedWorkspace===workspace&&!active?.error} isPresentationAllowed={()=>openAuthority.current!==null} label="Danh sách đề nghị" columns={[{id:"id",label:"Mã đề nghị"},{id:"date",label:"Ngày đề nghị"},{id:"branch",label:"Chi nhánh"},{id:"person",label:"Người đề nghị"},{id:"department",label:"Phòng ban"},{id:"status",label:"Trạng thái"}]} rows={(active?.list?.rows??[]).map(row=>({id:row.documentId,cells:[row.documentId,requestDate(row.purchaseDate),row.branchId,row.personSuggest||"Chưa có thông tin",row.department||"Chưa có thông tin",<RequestStatus key="status" value={row.statusId} statusName={row.statusName}/>],action:"Mở đề nghị",actionLabel:`Mở đề nghị ${row.documentId}`,selected:selected===row.documentId,onOpen:()=>open(row.documentId),buttonRef:element=>registerFocusRow(row.documentId,element)}))}/>
    {active?.list?.rows.length===0&&<RequestEmpty title="Không có đề nghị phù hợp">Thử điều chỉnh mã đề nghị hoặc chi nhánh.</RequestEmpty>}
    <RequestPagination label="Phân trang đề nghị" page={page} previousDisabled={page===1} nextDisabled={!active?.list?.hasMore||page>=1000} onPrevious={()=>move(()=>{cancelFocus();setPage(value=>value-1);setSelected(null);editorRef.current?.bridge.retire();retain(null);})} onNext={()=>move(()=>{cancelFocus();setPage(value=>value+1);setSelected(null);editorRef.current?.bridge.retire();retain(null);})}/>
   </>}
  </RequestListContent></RequestListPanel></RequestListComposition>}
  {/* Outside the busy/error/selection fragment. Never key by token or discard an unknown intent. */}
  <RequestDetailDialog open={selected!==null} presentationAllowed={presentationAllowed&&workspace!==null} title="Phiếu mua hàng hiện có" documentNumber={canRead&&presentationReady?selected:null} closeLabel="Đóng đề nghị" onRequestClose={close}>
   {(!canRead||!presentationReady)&&<><RecordSection title="Thông tin chung">
   {detailBusy&&!canRead&&<RequestLoading form label="Đang đọc phiếu từ ERP…"/>}
   {!!activeDetail?.error&&<RequestError error={activeDetail.error}/>}
   {!!active?.error&&<RequestError error={active.error}/>}
   {(!canRead||!presentationReady)&&<RequestNotice>Dữ liệu phiếu tạm ẩn trong khi xác minh. Yêu cầu gốc vẫn được giữ.</RequestNotice>}
   {!canRead&&<RecordDetailToolbar><RequestButton type="button" onClick={()=>setRefresh(value=>value+1)}>Xác minh lại phiếu</RequestButton></RecordDetailToolbar>}
   </RecordSection><RecordSection title="Dòng hàng"><p className={requestStyles.muted}>Dòng hàng sẽ hiển thị khi phiếu được xác minh.</p></RecordSection><RecordSection title="Ghi chú"><p className={requestStyles.muted}>Ghi chú sẽ hiển thị khi phiếu được xác minh.</p></RecordSection></>}
  {editor&&<section ref={registerFocusDetail} aria-label="Phiếu mua hàng hiện có" tabIndex={-1} className="scroll-mt-24 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" hidden={!canRead||!presentationReady}><div className={requestStyles.stack}>
   <MobileRequest itemDisplay={{scopeKey:editor.scopeKey,binding:purchaseItemDisplayBinding(editor.raw),context:editor.raw.itemDisplayContext}} presentationAllowed={presentationAllowed&&canRead&&presentationReady} statusPresentation={{documentId:editor.raw.document.purchaseRequestId,id:editor.raw.document.statusId,name:editor.raw.statusName}} initial={editor.snapshot} access={access} adapter={editor.bridge.adapter} readRevision={editor.revision} onConfirmed={onConfirmed} onWorkStateChange={onWorkStateChange}/>
   {canRead&&<>{editor.receiptId&&<p role="status">ERP đã xác nhận yêu cầu {editor.receiptId}. Receipt vẫn được giữ khi đọc lại thất bại.</p>}
    <FullPurchaseReadback readback={editor.raw}/>
    <PurchaseReferenceDetails {...referenceInput} documentRateExchange={editor.raw.document.header.rateExchange} onContextChange={onReferenceContext}/></>}
  </div></section>}
  </RequestDetailDialog>
 </section>;
}

function value(value:string|number|boolean|null){return value===null?"NULL":typeof value==="boolean"?String(value):value===""?"\"\"":String(value);}
function FullPurchaseReadback({readback}:{readback:PurchaseReadback}){
 const document=readback.document;
 const labels:Record<string,string>={purchaseRequestId:"Mã đề nghị",branchId:"Chi nhánh",statusId:"Mã trạng thái ERP",statusName:"Trạng thái",isLocked:"Khóa phiếu",purchaseDate:"Ngày giờ đề nghị trên ERP",purposeId:"Mã mục đích",personSuggest:"Người đề nghị",department:"Phòng ban",purposeDescOrClient:"Diễn giải mục đích / khách hàng",price:"Giá trị đề nghị",notes:"Ghi chú",currencyId:"Tiền tệ",objectId:"Mã đối tượng",rateExchange:"Tỷ giá"};
 return <section aria-label="Dữ liệu ERP đầy đủ"><details className={`${requestStyles.section} request-full-readback`}><summary className={requestStyles.title}>Toàn bộ thông tin trên ERP <span>{document.lines.length} dòng hàng</span></summary><div className="request-full-readback-content">
  <dl className={requestStyles.values}>{Object.entries({purchaseRequestId:document.purchaseRequestId,branchId:document.branchId,statusId:document.statusId,statusName:documentStatusLabel(document.statusId,readback.statusName),isLocked:document.isLocked,...document.header}).map(([field,data])=><div key={field}><dt>{labels[field]}</dt><dd style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{value(data)}</dd></div>)}</dl>
  <p>{document.lines.length} dòng hàng</p>
  <RecordLinesTable label="Toàn bộ dòng đề nghị" lines={document.lines.map(line=>({...line,itemId:line.values.itemId}))} binding={purchaseItemDisplayBinding(readback)} context={readback.itemDisplayContext} columns={[
   {label:"Ngân sách",value:line=>value(line.values.budget),numeric:false},
   {label:"Thời gian yêu cầu",value:line=>value(line.values.timeRequired),numeric:false},
   {label:"Số lượng",value:line=>value(line.values.quantity)},
   {label:"Đơn giá",value:line=>value(line.values.unitPrice)},
   {label:"Thành tiền",value:line=>value(line.values.totalPrice)},
   {label:"Model",value:line=>value(line.values.model),numeric:false},
  ]}/>

 </div></details></section>;
}
