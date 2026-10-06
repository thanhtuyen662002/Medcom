"use client";
import {RequestButton,RequestInput,RequestTextarea,RequestNotice,RequestStatus,requestMessage,requestStyles} from "./request-presentation";
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from "react";
import {useDirtyGuard} from "./navigation-guard";
import {accessAvailable,buildCommand,canSend,commandBytes,commandResult,draftErrors,lineKey,observedView,outcomeMessage,sameDraft,sameSnapshot,snapshotAcknowledges,
  type InboundDraftAccess,type InboundDraftAdapter,type InboundDraftCommand,type InboundDraftDetailUpsert,type InboundDraftHeader,type InboundDraftReceipt,type InboundDraftView} from "@/lib/erp/inbound-draft";

export type MobileInboundRequestProps={documentId:string|null;access:InboundDraftAccess;adapter?:InboundDraftAdapter;onConfirmed?:(receipt:InboundDraftReceipt)=>void};
type Phase="empty"|"loading"|"editing"|"checking"|"pending"|"unknown"|"reconciling"|"failed"|"conflict"|"confirmed"|"readFailed";
type Binding={documentId:string|null;rights:string;adapter:InboundDraftAdapter|undefined};
type State={view:InboundDraftView|null;viewBinding:Binding|null;header:InboundDraftHeader|null;details:InboundDraftDetailUpsert[];phase:Phase;
  original:InboundDraftCommand|null;originalStatus:number|null;receipt:InboundDraftReceipt|null;receiptAction:"Save"|"SendToWarehouse"|null;
  awaitingSnapshot:InboundDraftReceipt|null;retainEdits:boolean;message:string;errors:Record<string,string>;reviewed:boolean;readNonce:number};
const empty:State={view:null,viewBinding:null,header:null,details:[],phase:"empty",original:null,originalStatus:null,receipt:null,receiptAction:null,
  awaitingSnapshot:null,retainEdits:false,message:"",errors:{},reviewed:false,readNonce:0};
const control:CSSProperties={width:"100%",minWidth:0,minHeight:44,border:"1px solid var(--border,#bbb)",borderRadius:8,padding:8,background:"var(--background,#fff)",color:"var(--foreground,#18181b)",fontSize:16,fontFamily:"inherit",boxSizing:"border-box"};
const unknownMessage=outcomeMessage.OutcomeUnknown;

/** Injected fixed workflow only. The host must guard document selection/navigation.
 * Keep this component mounted for unresolved custody; key ONLY by login scope. */
export function MobileInboundRequest(props:MobileInboundRequestProps){return <InboundEditor key={JSON.stringify([props.access.scopeKey])} {...props}/>;}
function InboundEditor({documentId,access,adapter,onConfirmed}:MobileInboundRequestProps){
  const [state,setState]=useState<State>(empty),[note,setNote]=useState<string|null>(null),[page,setPage]=useState(1);
  const rights=JSON.stringify([access.scopeKey,access.canRead,access.canSave,access.canSend,access.available,access.maxCommandBytes]);
  const [binding,setBinding]=useState<Binding>({documentId,rights,adapter});
  const bindingCurrent=binding.documentId===documentId&&binding.rights===rights&&binding.adapter===adapter;
  // Adjust this component's render state before commit. Every committed A→B→A
  // selection has a different object identity; old fields cannot flash/re-enable.
  if(!bindingCurrent){
    setBinding({documentId,rights,adapter});
    if(binding.documentId!==documentId){setNote(null);setPage(1);}
    setState(previous=>({...previous,phase:previous.original?"unknown":"empty",reviewed:false,errors:{},
      retainEdits:binding.documentId===documentId&&!previous.awaitingSnapshot&&!!previous.view&&!!previous.header
        &&!sameDraft(previous.view,previous.header,previous.details),
      message:previous.original?unknownMessage:"Đang xác minh lại chứng từ trong quyền hiện tại."}));
  }
  const generation=useRef(0),lock=useRef(false),latest=useRef(state);
  const form=useRef<HTMLFormElement|null>(null);
  const active=useRef<{controller:AbortController;kind:"read"|"check"|"execute"|"reconcile"}|null>(null);
  const live=useRef({documentId,access,adapter,onConfirmed,binding});
  useLayoutEffect(()=>{latest.current=state;},[state]);
  useLayoutEffect(()=>{
    const old=live.current;live.current={documentId,access,adapter,onConfirmed,binding};
    if(old.binding===binding)return;
    generation.current++;active.current?.controller.abort();active.current=null;lock.current=false;
    // Abort is not proof of non-commit. The render transition above retains the
    // exact original command; only a NEW explicit reconcile may acknowledge it.
  },[binding,documentId,access,adapter,onConfirmed]);
  useLayoutEffect(()=>()=>{generation.current++;active.current?.controller.abort();active.current=null;lock.current=false;},[]);
  const readEligible=bindingCurrent&&!!access.scopeKey&&access.canRead&&accessAvailable(access)&&state.original===null
    &&(!["failed","conflict"].includes(state.phase)||state.viewBinding!==binding);
  // Finish acknowledged readback BEFORE admitting a later operation/document.
  const readTarget=state.awaitingSnapshot?.documentId??documentId;
  const awaitingSnapshot=state.awaitingSnapshot;
  useEffect(()=>{
    if(!readTarget||!readEligible||!adapter)return;
    const prior=latest.current;
    if(prior.phase==="editing"&&prior.viewBinding===binding&&!awaitingSnapshot)return;
    const controller=new AbortController(),token=++generation.current,transport=adapter;
    active.current={controller,kind:"read"};lock.current=true;
    const current=()=>generation.current===token&&!controller.signal.aborted&&live.current.binding===binding;
    let mismatchedReceipt=false;
    void Promise.resolve().then(()=>{
      if(!current())return;
      setState(previous=>({...previous,phase:"loading",errors:{},reviewed:false,message:awaitingSnapshot
        ?"ERP đã xác nhận thao tác. Đang đọc lại snapshot và ID dòng thật.":"Đang đọc đầy đủ các trường và dòng do DTO ERP cung cấp."}));
      return transport.read(readTarget,controller.signal);
    }).then(response=>{
      if(!current())return;
      const view=observedView(response,readTarget);if(!view)throw new Error("read_not_observed");
      if(awaitingSnapshot&&!snapshotAcknowledges(view,awaitingSnapshot)){mismatchedReceipt=true;throw new Error("receipt_snapshot_mismatch");}
      setState(previous=>{
        const retain=previous.retainEdits&&previous.view?.documentId===readTarget&&!!previous.header;
        const conflict=retain&&!!previous.view&&!sameSnapshot(previous.view,view);
        const selected=readTarget===binding.documentId;
        return {...previous,view:conflict?previous.view:view,viewBinding:selected?binding:null,
          header:retain?previous.header:structuredClone(view.header),details:retain?previous.details:structuredClone(view.details),
          awaitingSnapshot:awaitingSnapshot?null:previous.awaitingSnapshot,retainEdits:!!conflict,
          phase:conflict?"conflict":selected?"editing":"empty",errors:{},reviewed:false,
          message:conflict?"ERP đã thay đổi khi xác minh lại quyền. Bản sửa chưa lưu được giữ nguyên; đọc lại ERP để bỏ bản sửa và lấy dữ liệu mới."
            :awaitingSnapshot?"ERP đã xác nhận thao tác. Đã đọc lại snapshot khớp xác nhận và ID dòng thật."
            :retain?"Đã xác minh lại ERP; giữ nguyên bản sửa chưa lưu.":"Đã đọc đầy đủ các trường và dòng do DTO ERP cung cấp."};
      });
      setPage(1);
    }).catch(()=>{
      if(current())setState(previous=>({...previous,phase:"readFailed",message:awaitingSnapshot
        ?mismatchedReceipt?"ERP đã xác nhận thao tác; snapshot tải lại chưa khớp xác nhận. Giữ bằng chứng đã lưu, khóa thao tác tiếp; không gửi lại thao tác đã xác nhận."
          :"ERP đã xác nhận thao tác; chưa đọc lại được chứng từ. Giữ bằng chứng đã lưu; không gửi lại thao tác đã xác nhận."
        :"Chưa đọc được đầy đủ chứng từ hợp lệ. Không thể chỉnh sửa hoặc gửi."}));
    }).finally(()=>{if(active.current?.controller===controller){active.current=null;lock.current=false;}});
    return()=>{controller.abort();if(active.current?.controller===controller){active.current=null;lock.current=false;}};
  },[readTarget,readEligible,adapter,binding,state.readNonce,awaitingSnapshot]);

  const bound=bindingCurrent&&state.viewBinding===binding&&state.view?.documentId===documentId&&!!access.scopeKey&&access.canRead;
  const unresolved=state.original!==null,busy=["loading","checking","pending","reconciling"].includes(state.phase);
  const service=!!adapter&&accessAvailable(access),currentView=bound?state.view:null;
  const dirty=!!currentView&&!!state.header&&!sameDraft(currentView,state.header,state.details);
  // Send-only input belongs to this document/login, not to a validated snapshot.
  // Keep its guard across hidden/unbound revalidation and read-only Send preflight;
  // empty string is an explicit non-NULL note too. Selection/scope resets it above.
  const sendNoteDirty=note!==null;
  const inputDirty=dirty||sendNoteDirty;
  const ready=bound&&service&&!unresolved&&!state.awaitingSnapshot&&state.phase==="editing"&&!!currentView&&[0,1].includes(currentView.statusId);
  const editable=ready&&access.canSave&&!state.reviewed;
  // A dialog opened during preflight must not retain a discard permission after
  // the read advances to execute. Cancel this read explicitly before discarding;
  // once a command exists only the original non-discardable custody path applies.
  useDirtyGuard(unresolved||state.retainEdits||sendNoteDirty||dirty&&["editing","failed","conflict"].includes(state.phase),!unresolved&&state.phase!=="checking");
  function currentBinding(){return bindingCurrent&&live.current.binding===binding;}
  function patchHeader(field:keyof InboundDraftHeader,value:string|null){if(editable&&!lock.current&&currentBinding()&&field!=="documentDate"&&field!=="branchId")setState(previous=>({...previous,header:previous.header?{...previous.header,[field]:value}:null,reviewed:false,errors:{}}));}
  function patchDetail(key:string,field:keyof InboundDraftDetailUpsert,value:string|null){if(editable&&!lock.current&&currentBinding()&&field!=="rowId"&&field!=="clientLineId")setState(previous=>({...previous,details:previous.details.map(row=>lineKey(row)===key?{...row,[field]:value}:row),reviewed:false,errors:{}}));}
  function removeDetail(key:string){if(editable&&!lock.current&&currentBinding())setState(previous=>({...previous,details:previous.details.filter(line=>lineKey(line)!==key),reviewed:false,errors:{}}));}
  function addDetail(){
    if(!editable||lock.current||!currentBinding()||state.details.length>=500)return;
    const id=crypto.randomUUID();
    setState(previous=>({...previous,details:[...previous.details,{rowId:null,clientLineId:id,itemId:"",lotNumberByDocument:null,setQuantityByDocument:null,barrelQuantityByDocument:null,expireDateByDocument:null,unitPrice:null}],reviewed:false,errors:{}}));
    setPage(Math.floor(state.details.length/25)+1);
  }
  function review(){
    if(lock.current||!ready||!currentBinding()||!currentView||!state.header)return;
    // A bad Send-only note must not prevent a separate Save (Save emits note:null).
    const draft=draftErrors(currentView,state.header,state.details,null),noteError=draftErrors(currentView,state.header,state.details,note).note;
    const errors=noteError?{...draft,note:noteError}:draft;
    setState(previous=>({...previous,errors,reviewed:Object.keys(draft).length===0,message:Object.keys(errors).length
      ?"Kiểm tra các trường được đánh dấu. Ghi chú gửi kho chỉ áp dụng cho thao tác Gửi.":"Rà soát thay đổi trước khi xác nhận thao tác riêng."}));
    if(Object.keys(errors).length){
      const index=state.details.findIndex(row=>Object.keys(row).some(field=>!!errors[`detail.${lineKey(row)}.${field}`]));
      if(index>=0)setPage(Math.floor(index/25)+1);
      requestAnimationFrame(()=>{if(currentBinding())form.current?.querySelector<HTMLInputElement|HTMLTextAreaElement>('[aria-invalid="true"]:not(:disabled)')?.focus();});
    }
  }
  function reload(){
    if(lock.current||unresolved||busy||!currentBinding())return;
    if((inputDirty||state.retainEdits)&&["editing","failed","conflict","readFailed"].includes(state.phase)&&!state.awaitingSnapshot
      &&!window.confirm("Đọc lại ERP sẽ bỏ các thay đổi đang giữ trên màn hình. Tiếp tục?"))return;
    lock.current=true;
    // A receipt readback retry is not a discard action: retain the unsent note.
    // Ordinary explicit reload clears it only after the confirmation above.
    if(!state.awaitingSnapshot)setNote(null);
    setState(previous=>({...previous,phase:"empty",readNonce:previous.readNonce+1,retainEdits:false,errors:{},reviewed:false}));
  }
  function cancelSendCheck(){
    if(!currentBinding()||state.phase!=="checking"||state.original||active.current?.kind!=="check")return;
    const request=active.current;generation.current++;active.current=null;lock.current=false;request.controller.abort();
    // Only a read is cancelled. No command/key has been built or dispatched yet;
    // a transport that ignores abort still fails the generation check below.
    setState(previous=>({...previous,phase:"editing",reviewed:false,message:"Đã hủy bước đọc kiểm tra. Chưa gửi thao tác; ghi chú được giữ nguyên."}));
  }
  function stillCurrent(token:number,controller:AbortController){return generation.current===token&&!controller.signal.aborted&&currentBinding();}
  async function dispatch(action:"Save"|"SendToWarehouse"){
    if(lock.current||!ready||!currentBinding()||!state.reviewed||!currentView||!state.header||!adapter
      ||(action==="Save"?!access.canSave||!dirty:!access.canSend||dirty||!!state.errors.note||!canSend(currentView)))return;
    const originalView=currentView,header=state.header,details=state.details,transport=adapter;
    const controller=new AbortController(),token=++generation.current;lock.current=true;
    active.current={controller,kind:action==="SendToWarehouse"?"check":"execute"};
    let command:InboundDraftCommand|null=null;
    try{
      if(action==="SendToWarehouse"){
        setState(previous=>({...previous,phase:"checking",message:"Đang kiểm tra chứng từ trước khi gửi."}));
        const observed=observedView(await transport.read(originalView.documentId,controller.signal),originalView.documentId);
        if(!stillCurrent(token,controller))return;
        if(!observed||!sameSnapshot(observed,originalView)||!canSend(observed)){
          setState(previous=>({...previous,phase:"conflict",message:outcomeMessage.Conflict,reviewed:false}));return;
        }
      }
      if(!stillCurrent(token,controller))return;
      const built=buildCommand(originalView,header,details,action,note,crypto.randomUUID());
      if(commandBytes(built)>access.maxCommandBytes){setState(previous=>({...previous,phase:"editing",message:"Yêu cầu vượt giới hạn truyền được cấp. Dữ liệu được giữ nguyên; không cắt dòng hoặc gửi."}));return;}
      command=built;active.current={controller,kind:"execute"};
      setState(previous=>({...previous,original:command,originalStatus:originalView.statusId,phase:"pending",message:"Đang chờ xác nhận ERP.",errors:{}}));
      const response=await transport.execute(command,controller.signal);
      if(!stillCurrent(token,controller))return;
      const result=commandResult(response,command,originalView.statusId);
      if(!result||result.outcome==="OutcomeUnknown"){setState(previous=>({...previous,phase:"unknown",message:unknownMessage}));return;}
      if(result.receipt){confirmed(result.receipt,action);return;}
      setState(previous=>({...previous,original:null,originalStatus:null,phase:result.outcome==="Conflict"?"conflict":"failed",message:outcomeMessage[result.outcome],reviewed:false}));
    }catch{
      if(stillCurrent(token,controller))setState(previous=>({...previous,phase:command?"unknown":"editing",message:command?unknownMessage:"Chưa thể chuẩn bị hoặc kiểm tra chứng từ; chưa gửi thao tác."}));
    }finally{if(active.current?.controller===controller){active.current=null;lock.current=false;}}
  }
  function confirmed(receipt:InboundDraftReceipt,action:"Save"|"SendToWarehouse"){
    // Parent callbacks cannot mutate our evidence, erase an acknowledgment, or
    // turn callback/readback failure into a failed Save or a replacement command.
    const evidence=Object.freeze({...receipt});
    setState(previous=>({...previous,original:null,originalStatus:null,receipt:evidence,receiptAction:action,awaitingSnapshot:evidence,retainEdits:false,
      phase:"confirmed",readNonce:previous.readNonce+1,message:"ERP đã xác nhận thao tác. Đang đọc lại chứng từ.",reviewed:false}));
    if(action==="SendToWarehouse")setNote(null);
    try{void Promise.resolve(live.current.onConfirmed?.(evidence)).catch(()=>undefined);}catch{}
  }
  async function reconcile(){
    if(lock.current||!currentBinding()||!state.original||state.originalStatus===null||!adapter||!access.canRead||!service||state.phase!=="unknown")return;
    const original=state.original,statusBefore=state.originalStatus,transport=adapter,controller=new AbortController(),token=++generation.current;
    lock.current=true;active.current={controller,kind:"reconcile"};setState(previous=>({...previous,phase:"reconciling",message:"Đang kiểm tra yêu cầu gốc; không gửi lại."}));
    try{
      const response=await transport.reconcile(original,controller.signal);
      if(!stillCurrent(token,controller))return;
      const result=commandResult(response,original,statusBefore);
      if(result?.receipt&&original.action!=="Create")confirmed(result.receipt,original.action);
      else setState(previous=>({...previous,phase:"unknown",message:unknownMessage}));
    }catch{if(stillCurrent(token,controller))setState(previous=>({...previous,phase:"unknown",message:unknownMessage}));}
    finally{if(active.current?.controller===controller){active.current=null;lock.current=false;}}
  }

  if(!access.scopeKey||!access.canRead)return <section role="status" className={requestStyles.section}><h2 className={requestStyles.title}>Yêu cầu nhập kho</h2><p>Phiên hoặc quyền đọc hiện tại không khả dụng. Dữ liệu của phiên trước được ẩn.</p></section>;
  if(!service)return <section role="status" className={requestStyles.section}><h2 className={requestStyles.title}>Yêu cầu nhập kho</h2><p>Chưa thể mở dữ liệu phiếu trong phạm vi hiện tại.</p>{unresolved&&<p>{unknownMessage}</p>}</section>;
  if(!documentId&&!state.awaitingSnapshot)return <section role="status" className={requestStyles.section}><h2 className={requestStyles.title}>Yêu cầu nhập kho</h2><p>Chọn một phiếu trong danh sách để xem thông tin và dòng hàng. Tạo mới chưa được mở.</p>{unresolved&&<RequestButton disabled={state.phase!=="unknown"} onClick={()=>void reconcile()}>Kiểm tra yêu cầu gốc</RequestButton>}</section>;
  const pageCount=Math.max(1,Math.ceil(state.details.length/25)),shownPage=Math.min(page,pageCount);
  const receipt=state.receipt?.documentId===documentId||state.awaitingSnapshot?state.receipt:null;
  return <section data-testid="inbound-editor" data-document-id={documentId??""} data-phase={state.phase} aria-busy={busy} aria-label="Yêu cầu nhập kho trên điện thoại" className={requestStyles.editor} style={{width:"100%",minWidth:0,boxSizing:"border-box",overflowWrap:"anywhere"}}>
    <h2 className={requestStyles.title}>Yêu cầu nhập kho</h2><p className={requestStyles.muted} role="status">{requestMessage(state.message)||"Đang chờ đọc ERP."}</p>
    {state.phase==="checking"&&!unresolved&&<RequestButton type="button" onClick={cancelSendCheck}>Hủy kiểm tra trước khi gửi</RequestButton>}
    {receipt&&<p data-testid="confirmed-receipt">ERP đã xác nhận {state.receiptAction==="Save"?"Lưu":"Gửi"} phiếu {receipt.documentId}, trạng thái {receipt.statusId}. Mã thao tác: {receipt.operationId}. Mã xác nhận: {receipt.auditId}. Thời điểm UTC: {receipt.committedAtUtc}</p>}
    {unresolved&&<div><p>Yêu cầu gốc: {state.original?.documentId}. Dữ liệu không được lưu bền trên thiết bị; tải lại hoặc đóng trang có thể mất khả năng kiểm tra.</p><RequestButton type="button" disabled={state.phase!=="unknown"} onClick={()=>void reconcile()}>Kiểm tra yêu cầu gốc</RequestButton></div>}
    {!unresolved&&<RequestButton type="button" disabled={busy} onClick={reload}>Đọc lại ERP</RequestButton>}
    {state.awaitingSnapshot&&<p role="alert">Đang đọc lại phiếu đã được ERP xác nhận: {state.awaitingSnapshot.documentId}. Chưa thể chỉnh sửa hoặc gửi tiếp. Không gửi lại thao tác đã xác nhận.</p>}
    {!bound&&unresolved&&<p>Chờ kết quả yêu cầu gốc trước khi mở chứng từ đã chọn.</p>}
    {currentView&&state.header&&<form ref={form} onSubmit={event=>{event.preventDefault();review();}} className={requestStyles.stack}>
      <header className={requestStyles.section}><div className={requestStyles.cardHeading}><strong>{currentView.documentId}</strong><RequestStatus value={currentView.statusId}/></div><p className={requestStyles.muted}>{state.details.length} dòng đầy đủ</p></header>
      {!access.canSave&&!access.canSend&&<RequestNotice>Phiếu hiện chỉ được xem theo quyền của bạn.</RequestNotice>}
      <p className={requestStyles.muted}>{currentView.costRowCount} dòng chi phí được giữ nguyên, chỉ đọc.</p>
      <p className={requestStyles.muted}>Ngày chứng từ và chi nhánh được giữ nguyên. Gửi yêu cầu chưa làm thay đổi tồn kho.</p>
      <fieldset disabled={!editable} className={requestStyles.fields}><legend className={requestStyles.title}>Thông tin chứng từ</legend>
        {headerFields.map(([field,label,nullable,multiline])=><ExactField key={field} label={label} id={`inbound-header-${field}`} value={state.header![field]} nullable={nullable} multiline={multiline} disabled={field==="branchId"||field==="documentDate"} error={state.errors[`header.${field}`]} onChange={value=>patchHeader(field,value)}/>)}
      </fieldset>
      <section aria-label="Dòng yêu cầu nhập kho" style={{display:"grid",gap:12,minWidth:0}}>
        {state.details.slice((shownPage-1)*25,shownPage*25).map(row=>{
          const key=lineKey(row),domKey=encodeURIComponent(key);
          return <fieldset key={key} disabled={!editable} className={requestStyles.line} style={{minWidth:0}}><legend className="max-w-full px-1 text-sm font-semibold" style={{maxWidth:"100%",overflowWrap:"anywhere"}}>{row.rowId??"Dòng mới"}</legend>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">{detailFields.map(([field,label,nullable,multiline])=><ExactField key={field} label={label} id={`inbound-detail-${domKey}-${field}`} value={row[field]} nullable={nullable} multiline={multiline} error={state.errors[`detail.${key}.${field}`]} onChange={value=>patchDetail(key,field,value)}/>)}</div>
            <RequestButton type="button" style={{maxWidth:"100%",whiteSpace:"normal",overflowWrap:"anywhere"}} onClick={()=>removeDetail(key)}>Xóa dòng {row.rowId??"mới"}</RequestButton>
          </fieldset>;
        })}
        {state.errors.details&&<p role="alert">{state.errors.details}</p>}
        <nav aria-label="Trang dòng hàng" style={{display:"flex",gap:8,flexWrap:"wrap"}}><RequestButton type="button" disabled={shownPage===1||busy||unresolved} onClick={()=>setPage(shownPage-1)}>Dòng trước</RequestButton><span>Trang {shownPage}/{pageCount}; giữ đủ {state.details.length} dòng</span><RequestButton type="button" disabled={shownPage===pageCount||busy||unresolved} onClick={()=>setPage(shownPage+1)}>Dòng tiếp</RequestButton></nav>
        <RequestButton type="button" disabled={!editable||state.details.length>=500} onClick={addDetail}>Thêm dòng</RequestButton>
      </section>
      <ExactField id="inbound-note" label="Ghi chú gửi kho" nullable multiline value={note} disabled={!ready||state.reviewed||!access.canSend} error={state.errors.note} onChange={value=>{if(!lock.current&&currentBinding()&&ready&&!state.reviewed&&access.canSend)setNote(value);}}/>
      {state.reviewed&&<div><p>Rà soát: {dirty?"có thay đổi cần lưu riêng":"không có thay đổi chưa lưu"}.</p><p>Dòng sẽ xóa: {currentView.details.filter(row=>!state.details.some(next=>next.rowId===row.rowId)).map(row=>row.rowId).join(", ")||"không"}</p></div>}
      <div className={requestStyles.actionBar}>
        {!state.reviewed?<RequestButton variant="default" type="submit" disabled={!ready}>Rà soát phiếu</RequestButton>:<>
          <RequestButton type="button" disabled={!ready} onClick={()=>setState(previous=>({...previous,reviewed:false}))}>Quay lại chỉnh sửa</RequestButton>
          <RequestButton type="button" disabled={!ready||!access.canSave||!dirty} onClick={()=>void dispatch("Save")}>Lưu thay đổi</RequestButton>
          <RequestButton variant="default" type="button" disabled={!ready||!access.canSend||dirty||!!state.errors.note||!canSend(currentView)} onClick={()=>void dispatch("SendToWarehouse")}>Gửi yêu cầu nhập kho</RequestButton>
        </>}
      </div>
      {currentView.statusId!==0&&currentView.statusId!==1&&<p>Trạng thái hiện tại chỉ đọc; không có thao tác tiếp theo được cấp.</p>}
      {!dirty&&[0,1].includes(currentView.statusId)&&!canSend(currentView)&&<p>Cần có ít nhất một dòng; lô, số lượng bộ, số lượng thùng và ngày giờ hết hạn cần có giá trị trước khi gửi. ERP kiểm tra điều kiện trước khi nhận yêu cầu.</p>}
      {dirty&&<p>Lưu và đọc lại thay đổi trước khi gửi. Gửi chỉ chuyển yêu cầu sang trạng thái 2; không phải nhập tồn kho.</p>}
    </form>}
  </section>;
}
const headerFields:[keyof InboundDraftHeader,string,boolean,boolean?][]=[
  ["documentDate","Ngày giờ chứng từ",false],["branchId","Chi nhánh",false],
  ["orderNumber","Số đơn",false,true],["invoiceNo","Số hóa đơn",false,true],
  ["departurePoint","Điểm đi",false,true],["destinationPoint","Điểm đến",false,true],
  ["orderTypeId","Loại đơn",false,true],["objectId","Đối tượng",true],["currencyId","Tiền tệ",true],
  ["rateExchange","Tỷ giá",true],["notes","Ghi chú",true,true]];
const detailFields:[keyof InboundDraftDetailUpsert,string,boolean,boolean?][]=[
  ["itemId","Mã hàng",false],["lotNumberByDocument","Lô theo chứng từ",true,true],
  ["setQuantityByDocument","Số lượng bộ theo chứng từ",true],["barrelQuantityByDocument","Số lượng thùng theo chứng từ",true],
  ["expireDateByDocument","Ngày giờ hết hạn theo chứng từ",true],["unitPrice","Đơn giá",true]];
function ExactField({id,label,value,nullable=false,multiline=false,disabled=false,error,onChange}:{id:string;label:string;value:string|null;nullable?:boolean;multiline?:boolean;disabled?:boolean;error?:string;onChange:(value:string|null)=>void}){
  const attributes={id,name:id,value:value??"",disabled:disabled||value===null,"aria-invalid":!!error,"aria-describedby":error?`${id}-error`:undefined,style:control};
  return <div className={requestStyles.field}><label htmlFor={id}>{label}</label>
    {nullable&&<label style={{display:"flex",gap:8,alignItems:"center",minHeight:44}}><input type="checkbox" aria-label={`${label} NULL`} checked={value===null} disabled={disabled} onChange={event=>onChange(event.target.checked?null:"")}/>Chưa có giá trị</label>}
    {multiline?<RequestTextarea {...attributes} rows={2} onChange={event=>onChange(event.target.value)}/>:<RequestInput {...attributes} type="text" onChange={event=>onChange(event.target.value)}/>}
    {error&&<p id={`${id}-error`} role="alert">{error}</p>}
  </div>;
}
