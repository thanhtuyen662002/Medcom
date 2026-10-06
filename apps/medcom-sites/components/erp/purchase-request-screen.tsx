"use client";
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type FormEvent,type CSSProperties} from "react";
import {MobileRequest,type MobileRequestAccess,type PurchaseRequestSnapshot} from "./mobile-request";
import {useNavigationGuard} from "./navigation-guard";
import {ApiError,errorMessage} from "@/lib/erp/api";
import {getPurchaseWorkspace,getPurchaseDocuments,postPurchaseCommand,type PurchaseWorkspace,type PurchasePage,type PurchaseReadback} from "@/lib/erp/purchase-request-api";
import {createPurchaseCommandAdapter,commandPurchaseSnapshot} from "@/lib/erp/purchase-request-command-adapter";
import {workspaceReadViewScope} from "@/lib/erp/navigation";
import type {WorkspaceData} from "@/lib/erp/contracts";

const control:CSSProperties={border:"1px solid var(--border)",borderRadius:8,padding:"8px 12px",minHeight:44,background:"var(--background)",color:"var(--foreground)"};
const gap:CSSProperties={display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"};
function sameReadAuthority(left:WorkspaceData|null|undefined,right:WorkspaceData|null|undefined){
 return !!left?.sessionScope&&!!left.readScope&&!!right?.sessionScope&&!!right.readScope
  &&workspaceReadViewScope(left)===workspaceReadViewScope(right);
}
const qualification="Chỉ phiếu có sẵn. Không tạo hoặc thêm dòng; cấp số, nhật ký lệnh và quyền ghi thực tế không được tự kích hoạt. Lưu/Gửi chỉ khả dụng khi server xác minh riêng từng thao tác.";
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
  {sessionUnverified&&<section aria-label="Xác minh lại phiên mua hàng" style={{display:"grid",gap:8}}>
   <p role="status">Chưa xác minh được phiên ERP. Dữ liệu và thao tác mua hàng đang bị ẩn/khóa; yêu cầu chưa rõ kết quả vẫn được giữ để đối chiếu sau khi parent Workspace xác minh lại.</p>
   <button type="button" style={control} disabled={checking} onClick={()=>void verifySession()}>{checking?"Đang xác minh phiên…":"Xác minh lại phiên ERP"}</button>
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
 function close(){move(()=>{editorRef.current?.bridge.retire();retain(null);setSelected(null);});}
 function find(event:FormEvent){event.preventDefault();move(()=>{setSearch(searchInput);setPage(1);setSelected(null);editorRef.current?.bridge.retire();retain(null);setRefresh(value=>value+1);});}
 const denied=active?.error instanceof ApiError&&[401,403,409].includes(active.error.status);
 const canRead=!!editor&&allowed&&verifiedWorkspace===workspace&&!denied&&!active?.error&&!active?.detailError&&editor.scopeKey===knownScope&&(editor.observation===workspace||sameReadAuthority(editor.observation,workspace))
  &&workspace?.branchIds.includes(editor.raw.document.branchId)===true&&selected===editor.raw.document.purchaseRequestId;
 const freshRequired=!!editor&&(editor.bridge.needsFreshRead()||busy||!!active?.error||!!active?.detailError||editor.observation!==workspace);
 const grant=editor?.grant,draft=editor?.raw.document.statusId===1&&editor.raw.document.isLocked!==true;
 const access:MobileRequestAccess={scopeKey:editor?.scopeKey??null,canRead,canEdit:canRead&&draft&&grant?.canSave===true&&!freshRequired,
  canSaveDraft:draft&&grant?.canSave===true,canSubmit:draft&&grant?.canSubmit===true,canReconcile:grant?.canLookup===true,
  existingOnly:true,canAddLines:false,requiresFreshRead:freshRequired,
  // Keep data visible during a same-scope background refresh, but never expose
  // actions while the latest document command grants are still unverified.
  available:true,verifying:verifying||busy||!!active?.error||!!active?.detailError||editor?.observation!==workspace,
  authorityKey:JSON.stringify([workspace?workspaceReadViewScope(workspace):null,workspace?.session.capabilities.slice().sort(),workspace?.branchIds.slice().sort(),grant]),
  branches:[],currencies:[],purposes:[],maxNotesLength:65536,maxPurposeLength:65536,maxLines:500,itemLookupId:"items",objectLookupId:"objects"};
 return <section aria-label="Danh sách đề nghị mua hàng" style={{display:"grid",gap:16}}>
  <h2>Đề nghị mua hàng</h2><p id="purchase-write-qualification" role="status">{qualification}</p>
  <button style={control} disabled aria-describedby="purchase-write-qualification">Tạo đề nghị</button>
  {!workspace?sessionUnverified?<p role="status">Phiên ERP tạm chưa được xác minh. Bộ lọc, phiếu đang chọn và dữ liệu nghiệp vụ đang được ẩn cho tới khi parent Workspace xác minh lại.</p>:<><p>Đăng nhập ERP để đọc đề nghị mua hàng.</p><button style={control} onClick={onLogin}>Đăng nhập ERP</button></>:!allowed?<p role="status">Bạn không có quyền đọc đề nghị mua hàng trong phạm vi hiện tại.</p>:verifiedWorkspace!==workspace?<section aria-label="Đang xác minh phạm vi mua hàng">
   <p role={active?.error?"alert":"status"}>{active?.error?errorMessage(active.error):"Đang xác minh lại phạm vi và quyền ERP; dữ liệu vẫn bị ẩn."}</p>
   {!!active?.error&&<button type="button" style={control} onClick={()=>setRefresh(value=>value+1)}>Xác minh lại phạm vi ERP</button>}
  </section>:<>
   <form onSubmit={find} style={gap}><label>Tìm mã đề nghị <input style={control} value={searchInput} maxLength={100} onChange={event=>setSearchInput(event.target.value)}/></label>
    <button type="submit" style={control} disabled={busy}>Tìm kiếm</button>
    <label>Chi nhánh <select aria-label="Chi nhánh" style={control} value={safeBranch} disabled={busy} onChange={event=>{const id=event.target.value;move(()=>{setBranch(id);setPage(1);setSelected(null);editorRef.current?.bridge.retire();retain(null);});}}><option value="">Tất cả chi nhánh được phép</option>{(active?.bootstrap?.branchIds??[]).map(id=><option key={id} value={id}>{id}</option>)}</select></label>
    <button style={control} type="button" disabled={busy} onClick={()=>move(()=>setRefresh(value=>value+1))}>Làm mới</button>
   </form>
   {busy&&!active?.list?<p role="status">Đang đọc ERP…</p>:active?.error?<p role="alert">{errorMessage(active.error)}</p>:<>
    <div style={{display:"grid",gap:8}}>{active?.list?.rows.map(row=><article key={row.documentId} style={{border:"1px solid var(--border)",padding:12,borderRadius:8}}>
     <strong>{row.documentId}</strong><p>{row.purchaseDate??"Ngày: NULL"} · {row.branchId} · Trạng thái ERP: {row.statusId}</p><p>{row.personSuggest} · {row.department}</p>
     <button style={control} onClick={()=>move(()=>setSelected(row.documentId))} aria-label={`Mở đề nghị ${row.documentId}`}>Mở đề nghị</button>
    </article>)}{active?.list?.rows.length===0&&<p>Không có đề nghị phù hợp trong phạm vi của bạn.</p>}</div>
    <nav aria-label="Phân trang đề nghị" style={gap}><button style={control} disabled={page===1} onClick={()=>move(()=>{setPage(value=>value-1);setSelected(null);editorRef.current?.bridge.retire();retain(null);})}>Trang trước</button><span>Trang {page}</span><button style={control} disabled={!active?.list?.hasMore||page>=1000} onClick={()=>move(()=>{setPage(value=>value+1);setSelected(null);editorRef.current?.bridge.retire();retain(null);})}>Trang sau</button></nav>
   </>}
   {selected&&<div style={gap}><h3>{selected}</h3><button style={control} onClick={close}>Đóng đề nghị</button></div>}
   {active?.detailError&&<p role="alert">{errorMessage(active.detailError)}</p>}
  </>}
  {/* Outside the busy/error/selection fragment. Never key by token or discard an unknown intent. */}
  {editor&&<section aria-label="Phiếu mua hàng hiện có" hidden={!canRead}>
   <MobileRequest initial={editor.snapshot} access={access} adapter={editor.bridge.adapter} readRevision={editor.revision} onConfirmed={onConfirmed} onWorkStateChange={onWorkStateChange}/>
   {canRead&&<>{editor.receiptId&&<p role="status">ERP đã xác nhận yêu cầu {editor.receiptId}. Receipt vẫn được giữ khi đọc lại thất bại.</p>}
    <p role="status">{grant?.reason??"command_access_provider_unavailable"}</p><FullPurchaseReadback readback={editor.raw}/></>}
  </section>}
 </section>;
}

function value(value:string|number|boolean|null){return value===null?"NULL":typeof value==="boolean"?String(value):value===""?"\"\"":String(value);}
function FullPurchaseReadback({readback}:{readback:PurchaseReadback}){
 const document=readback.document;
 const labels:Record<string,string>={purchaseRequestId:"Mã đề nghị",branchId:"Chi nhánh",statusId:"Trạng thái ERP",isLocked:"Khóa phiếu",purchaseDate:"Ngày giờ đề nghị trên ERP",purposeId:"Mã mục đích",personSuggest:"Người đề nghị",department:"Phòng ban",purposeDescOrClient:"Diễn giải mục đích / khách hàng",price:"Giá trị đề nghị",notes:"Ghi chú",currencyId:"Tiền tệ",objectId:"Mã đối tượng",rateExchange:"Tỷ giá"};
 return <section aria-label="Dữ liệu ERP đầy đủ" style={{overflowX:"auto"}}><h4>Dữ liệu ERP đầy đủ — chỉ đọc</h4>
  <dl>{Object.entries({purchaseRequestId:document.purchaseRequestId,branchId:document.branchId,statusId:document.statusId,isLocked:document.isLocked,...document.header}).map(([field,data])=><div key={field}><dt>{labels[field]}</dt><dd style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{value(data)}</dd></div>)}</dl>
  <p>{document.lines.length} dòng hàng</p>
  <table aria-label="Toàn bộ dòng đề nghị"><thead><tr>{["Mã dòng","Mã mặt hàng","Ngân sách","Thời gian yêu cầu","Số lượng","Đơn giá","Thành tiền","Model"].map(field=><th key={field} scope="col">{field}</th>)}</tr></thead>
   <tbody>{document.lines.map(line=><tr key={line.lineId}>{[line.lineId,line.values.itemId,line.values.budget,line.values.timeRequired,line.values.quantity,line.values.unitPrice,line.values.totalPrice,line.values.model].map((data,index)=><td key={index} style={{whiteSpace:"pre-wrap",padding:8}}>{value(data)}</td>)}</tr>)}</tbody>
  </table>
 </section>;
}
